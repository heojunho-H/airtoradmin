// 월별 역할별 단가 카드 — 5개 역할 상시 대시보드
// 카드 1개: [라벨 (+ 이전 월 배지) | 저장상태 아이콘]
//          [ − ] [숫자 (클릭→직접 입력) / 원/일] [ + ]
// ±5,000원 step, debounce 500ms, 실패 시 localRates 롤백, 언마운트 시 flush()
// 캐스케이드: currentYearMonth에 행 없으면 직전 12개월 이내 단가를 fallback (amber 테두리 + '이전 월' 배지)

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Minus, Copy, Check, Loader2, AlertTriangle } from 'lucide-react';
import {
  ROLE_ORDER,
  ROLE_LABELS,
  RATE_STEP,
  RATE_MIN,
  RATE_MAX,
  type RoleCode,
} from '../../lib/roles';

// 기존 코드 호환을 위한 re-export
export type LaborRole = RoleCode;

export interface LaborRate {
  id?: number;
  yearMonth: string; // 'YYYY-MM'
  role: LaborRole;
  dailyRate: number;
  updatedBy?: string;
  updatedAt?: string;
}

interface LaborRateCardProps {
  laborRates: LaborRate[];
  currentYearMonth: string;
  // 비동기 가능 — 실패 시 throw하면 카드가 롤백 처리
  onRateUpdate: (yearMonth: string, role: LaborRole, dailyRate: number) => Promise<void> | void;
  onCopyPrev: (yearMonth: string) => Promise<void> | void;
  onNotification?: (msg: string) => void;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

// ============================================================
// 자체 debounce — lodash 의존 회피
// 각 역할별로 독립된 인스턴스 (per-role 마지막값 보존)
// ============================================================
type DebouncedSave = {
  schedule(task: () => Promise<void> | void): void;
  flush(): void;
  cancel(): void;
};

function createDebouncedSave(delay: number): DebouncedSave {
  let timer: number | null = null;
  let pending: (() => Promise<void> | void) | null = null;

  const exec = () => {
    timer = null;
    if (pending) {
      const task = pending;
      pending = null;
      void task();
    }
  };

  return {
    schedule(task) {
      pending = task;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(exec, delay);
    },
    flush() {
      if (timer !== null) {
        window.clearTimeout(timer);
        exec();
      }
    },
    cancel() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
        pending = null;
      }
    },
  };
}

function clampRate(n: number): number {
  if (!Number.isFinite(n)) return RATE_MIN;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, n));
}

const initSaveStates = (): Record<RoleCode, SaveState> =>
  ROLE_ORDER.reduce((acc, r) => {
    acc[r] = 'idle';
    return acc;
  }, {} as Record<RoleCode, SaveState>);

export function LaborRateCard({
  laborRates,
  currentYearMonth,
  onRateUpdate,
  onCopyPrev,
  onNotification,
}: LaborRateCardProps) {
  // sparse localRates — 사용자가 만진 키만 보관
  const [localRates, setLocalRates] = useState<Partial<Record<RoleCode, number>>>({});
  const [saveStates, setSaveStates] = useState<Record<RoleCode, SaveState>>(initSaveStates);

  // 직접 입력 모드 상태
  const [editingRole, setEditingRole] = useState<RoleCode | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // success/error → idle 자동 복원 타이머
  const stateTimers = useRef<Partial<Record<RoleCode, number>>>({});
  const setSaveState = useCallback((role: RoleCode, state: SaveState) => {
    setSaveStates((prev) => ({ ...prev, [role]: state }));
    const existing = stateTimers.current[role];
    if (existing !== undefined) {
      window.clearTimeout(existing);
      delete stateTimers.current[role];
    }
    if (state === 'success' || state === 'error') {
      const ttl = state === 'success' ? 1000 : 3000;
      stateTimers.current[role] = window.setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [role]: 'idle' }));
        delete stateTimers.current[role];
      }, ttl);
    }
  }, []);

  // 역할별 독립 debouncer
  const debouncers = useRef<Record<RoleCode, DebouncedSave>>(
    ROLE_ORDER.reduce(
      (acc, r) => {
        acc[r] = createDebouncedSave(500);
        return acc;
      },
      {} as Record<RoleCode, DebouncedSave>,
    ),
  );

  // 캐스케이드 조회 + localRates 우선
  const resolveRate = useCallback(
    (role: RoleCode): { rate: number; cascaded: boolean; sourceMonth: string | null } => {
      if (localRates[role] !== undefined) {
        return { rate: localRates[role]!, cascaded: false, sourceMonth: currentYearMonth };
      }
      const current = laborRates.find(
        (r) => r.yearMonth === currentYearMonth && r.role === role,
      );
      if (current) return { rate: current.dailyRate, cascaded: false, sourceMonth: currentYearMonth };
      const sorted = laborRates
        .filter((r) => r.role === role && r.yearMonth < currentYearMonth)
        .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
      if (sorted.length === 0) return { rate: 0, cascaded: false, sourceMonth: null };
      const fallback = sorted[0];
      const [cy, cm] = currentYearMonth.split('-').map(Number);
      const [fy, fm] = fallback.yearMonth.split('-').map(Number);
      const diff = (cy - fy) * 12 + (cm - fm);
      if (diff > 12) return { rate: 0, cascaded: false, sourceMonth: null };
      return { rate: fallback.dailyRate, cascaded: true, sourceMonth: fallback.yearMonth };
    },
    [laborRates, currentYearMonth, localRates],
  );

  const performSave = useCallback(
    async (role: RoleCode, rate: number) => {
      setSaveState(role, 'saving');
      try {
        await onRateUpdate(currentYearMonth, role, rate);
        onNotification?.(
          `${ROLE_LABELS[role]} 단가가 ${rate.toLocaleString('ko-KR')}원으로 변경되었습니다`,
        );
        // 성공 시 localRates에서 제거 — 다음 prop 갱신 때 서버값을 자연스럽게 따라감
        setLocalRates((prev) => {
          const next = { ...prev };
          delete next[role];
          return next;
        });
        setSaveState(role, 'success');
      } catch (err) {
        console.error('[LaborRateCard] save failed:', err);
        // 실패 시 localRates 롤백
        setLocalRates((prev) => {
          const next = { ...prev };
          delete next[role];
          return next;
        });
        onNotification?.(`${ROLE_LABELS[role]} 단가 변경 실패 — 다시 시도해주세요`);
        setSaveState(role, 'error');
      }
    },
    [currentYearMonth, onRateUpdate, onNotification, setSaveState],
  );

  const handleStep = useCallback(
    (role: RoleCode, delta: number) => {
      const { rate: currentRate } = resolveRate(role);
      const next = clampRate(currentRate + delta);
      if (next === currentRate) {
        if (delta < 0) onNotification?.('이미 최소 단가(0원)입니다');
        else onNotification?.('이미 최대 단가입니다');
        return;
      }
      setLocalRates((prev) => ({ ...prev, [role]: next }));
      debouncers.current[role].schedule(() => performSave(role, next));
    },
    [resolveRate, performSave, onNotification],
  );

  const startEdit = useCallback((role: RoleCode, currentRate: number) => {
    setEditingRole(role);
    setEditValue(String(currentRate));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingRole(null);
    setEditValue('');
  }, []);

  const commitEdit = useCallback(
    (role: RoleCode) => {
      // 이미 닫힌 입력의 늦은 blur 등 중복 호출 가드
      if (editingRole !== role) return;
      const parsed = parseInt(editValue.replace(/[^0-9]/g, ''), 10);
      const next = clampRate(Number.isFinite(parsed) ? parsed : 0);
      const { rate: currentRate } = resolveRate(role);
      setEditingRole(null);
      setEditValue('');
      if (next === currentRate) return;
      setLocalRates((prev) => ({ ...prev, [role]: next }));
      debouncers.current[role].schedule(() => performSave(role, next));
    },
    [editingRole, editValue, resolveRate, performSave],
  );

  // 언마운트 시 모든 역할 debouncer flush + 상태 타이머 정리
  useEffect(() => {
    const ds = debouncers.current;
    const timers = stateTimers.current;
    return () => {
      for (const r of ROLE_ORDER) ds[r].flush();
      for (const r of ROLE_ORDER) {
        const t = timers[r];
        if (t !== undefined) window.clearTimeout(t);
      }
    };
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
      {/* 헤더 — 타이틀 + 작은 텍스트 링크형 '전월 단가 복사' */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">
            이번 달 역할별 단가 ({currentYearMonth})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ▲▼ 또는 숫자 클릭으로 조정 — 변경 즉시 자동 저장
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCopyPrev(currentYearMonth)}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          전월 단가 복사
        </button>
      </div>

      {/* 카드 그리드 — 데스크톱 5열 / 태블릿 3열 / 모바일 2열 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ROLE_ORDER.map((role) => {
          const { rate, cascaded, sourceMonth } = resolveRate(role);
          const saveState = saveStates[role];
          const isEditing = editingRole === role;
          const isAtMin = rate <= RATE_MIN;
          const isAtMax = rate >= RATE_MAX;
          const isSaving = saveState === 'saving';
          const isError = saveState === 'error';

          // 테두리 우선순위: error > cascade > default
          const borderClass = isError
            ? 'border-red-300 bg-white hover:border-red-400'
            : cascaded
              ? 'border-amber-200 bg-amber-50/30 hover:border-amber-300'
              : 'border-slate-200 bg-white hover:border-slate-300';

          const cascadeTitle = cascaded && sourceMonth ? `${sourceMonth} 단가 사용 중` : undefined;

          return (
            <div
              key={role}
              title={role}
              className={`relative border rounded-xl p-4 transition-colors min-w-0 ${borderClass}`}
            >
              {/* 라벨 + 이전 월 배지 + 저장 상태 아이콘 (우상단) */}
              <div className="flex items-center justify-between gap-1.5 mb-3 min-h-[20px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="text-sm font-medium text-slate-600 truncate"
                    aria-label={`${ROLE_LABELS[role]} (코드: ${role})`}
                  >
                    {ROLE_LABELS[role]}
                  </span>
                  {cascaded && (
                    <span
                      title={cascadeTitle}
                      className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-700 bg-amber-100"
                    >
                      이전 월
                    </span>
                  )}
                </div>
                <div
                  className="shrink-0 w-4 h-4 flex items-center justify-center"
                  aria-live="polite"
                >
                  {saveState === 'saving' && (
                    <Loader2
                      className="w-3.5 h-3.5 text-slate-400 animate-spin"
                      aria-label="저장 중"
                    />
                  )}
                  {saveState === 'success' && (
                    <Check
                      className="w-3.5 h-3.5 text-emerald-500"
                      aria-label="저장 완료"
                    />
                  )}
                  {saveState === 'error' && (
                    <AlertTriangle
                      className="w-3.5 h-3.5 text-red-500"
                      aria-label="저장 실패"
                    />
                  )}
                </div>
              </div>

              {/* 컨트롤 행: [−] [숫자(클릭→입력) / 원/일] [+] */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label={`${ROLE_LABELS[role]} 단가 ${RATE_STEP.toLocaleString('ko-KR')}원 인하`}
                  onClick={() => handleStep(role, -RATE_STEP)}
                  disabled={isAtMin || isSaving || isEditing}
                  aria-disabled={isAtMin || isSaving || isEditing}
                  className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-600 transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="flex-1 text-center min-w-0">
                  {isEditing ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(role)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEdit(role);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      autoFocus
                      step={RATE_STEP}
                      min={RATE_MIN}
                      max={RATE_MAX}
                      aria-label={`${ROLE_LABELS[role]} 단가 직접 입력 (원)`}
                      className="w-full text-2xl font-bold text-center tabular-nums text-slate-900 border-0 border-b-2 border-teal-400 focus:outline-none focus:border-teal-600 bg-transparent px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(role, rate)}
                      disabled={isSaving}
                      aria-label={`${ROLE_LABELS[role]} 단가 직접 입력 (현재 ${rate.toLocaleString('ko-KR')}원)`}
                      className={`w-full text-2xl font-bold tabular-nums text-slate-900 rounded px-1 transition-all hover:bg-slate-50 disabled:cursor-not-allowed ${isSaving ? 'opacity-60' : ''}`}
                    >
                      {rate.toLocaleString('ko-KR')}
                    </button>
                  )}
                  <div className="text-xs text-slate-400 mt-0.5">원/일</div>
                </div>

                <button
                  type="button"
                  aria-label={`${ROLE_LABELS[role]} 단가 ${RATE_STEP.toLocaleString('ko-KR')}원 인상`}
                  onClick={() => handleStep(role, +RATE_STEP)}
                  disabled={isAtMax || isSaving || isEditing}
                  aria-disabled={isAtMax || isSaving || isEditing}
                  className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-600 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
