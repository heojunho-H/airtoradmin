// 월별 역할별 단가 카드 — 5개 역할 상시 대시보드
// 각 카드: ▲(상단) / 라벨 / 값 / ▼(하단), ±5,000원 step, debounce 500ms
// 실패 시 localRates 롤백, 언마운트 시 flush()로 마지막 변경 즉시 저장
// 캐스케이드: currentYearMonth에 행 없으면 직전 12개월 이내 단가를 "전월 단가" 배지로 표시

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Copy } from 'lucide-react';
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

function formatKRW(n: number): string {
  return '₩' + n.toLocaleString('ko-KR');
}

export function LaborRateCard({
  laborRates,
  currentYearMonth,
  onRateUpdate,
  onCopyPrev,
  onNotification,
}: LaborRateCardProps) {
  // sparse localRates — 사용자가 ▲/▼로 만진 키만 보관
  // (만지지 않은 키는 resolveRate가 prop의 laborRates에서 조회)
  const [localRates, setLocalRates] = useState<Partial<Record<RoleCode, number>>>({});
  const [updatingRoles, setUpdatingRoles] = useState<Set<RoleCode>>(new Set());

  // 역할별 독립 debouncer (한 역할 빠른 연타가 다른 역할 저장을 잡아먹지 않도록)
  const debouncers = useRef<Record<RoleCode, DebouncedSave>>(
    ROLE_ORDER.reduce(
      (acc, r) => { acc[r] = createDebouncedSave(500); return acc; },
      {} as Record<RoleCode, DebouncedSave>,
    ),
  );

  // 캐스케이드 조회 + localRates 우선
  const resolveRate = useCallback(
    (role: RoleCode): { rate: number; cascaded: boolean; sourceMonth: string | null } => {
      // 1) 사용자가 만진 값 우선
      if (localRates[role] !== undefined) {
        return { rate: localRates[role]!, cascaded: false, sourceMonth: currentYearMonth };
      }
      // 2) 현재 월의 행
      const current = laborRates.find(
        (r) => r.yearMonth === currentYearMonth && r.role === role,
      );
      if (current) return { rate: current.dailyRate, cascaded: false, sourceMonth: currentYearMonth };
      // 3) 직전 12개월 이내 캐스케이드
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
      setUpdatingRoles((prev) => {
        const next = new Set(prev);
        next.add(role);
        return next;
      });
      try {
        await onRateUpdate(currentYearMonth, role, rate);
        onNotification?.(`${ROLE_LABELS[role]} 단가가 ${rate.toLocaleString('ko-KR')}원으로 변경되었습니다`);
        // 성공 시 localRates에서 제거 — 다음 prop 갱신 때 서버값을 자연스럽게 따라감
        setLocalRates((prev) => {
          const next = { ...prev };
          delete next[role];
          return next;
        });
      } catch (err) {
        console.error('[LaborRateCard] save failed:', err);
        // 실패 시 localRates 롤백
        setLocalRates((prev) => {
          const next = { ...prev };
          delete next[role];
          return next;
        });
        onNotification?.(`${ROLE_LABELS[role]} 단가 변경 실패 — 다시 시도해주세요`);
      } finally {
        setUpdatingRoles((prev) => {
          const next = new Set(prev);
          next.delete(role);
          return next;
        });
      }
    },
    [currentYearMonth, onRateUpdate, onNotification],
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

  // 언마운트 시 모든 역할 debouncer flush — 미저장 변경 즉시 서버 반영
  useEffect(() => {
    const ds = debouncers.current;
    return () => {
      for (const r of ROLE_ORDER) ds[r].flush();
    };
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
      {/* 헤더 — 타이틀 + 전월 복사 버튼 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-800">
            이번 달 역할별 단가 ({currentYearMonth})
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            ▲/▼ 버튼으로 ±{(RATE_STEP / 1000).toFixed(0)},000원씩 조정 — 변경 즉시 자동 저장 (debounce 500ms)
          </p>
        </div>
        <button
          onClick={() => onCopyPrev(currentYearMonth)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          전월 단가 복사
        </button>
      </div>

      {/* 5개 카드 — 데스크톱 5열, 모바일 2열 (마지막 카드는 2칸 span) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {ROLE_ORDER.map((role, idx) => {
          const { rate, cascaded } = resolveRate(role);
          const isUpdating = updatingRoles.has(role);
          const isAtMin = rate <= RATE_MIN;
          const isAtMax = rate >= RATE_MAX;
          // 모바일 2열일 때 5번째(parts_wash) 카드를 가로로 늘려서 비대칭 방지
          const lastSpanClass = idx === ROLE_ORDER.length - 1 ? 'col-span-2 md:col-span-1' : '';
          const disabledOpacity = isUpdating ? 'opacity-70' : '';

          return (
            <div
              key={role}
              className={`rate-card flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-[120px] transition-opacity ${lastSpanClass} ${disabledOpacity}`}
            >
              {/* ▲ */}
              <button
                aria-label={`${ROLE_LABELS[role]} 단가 ${RATE_STEP.toLocaleString('ko-KR')}원 인상`}
                onClick={() => handleStep(role, +RATE_STEP)}
                disabled={isAtMax || isUpdating}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>

              {/* 라벨 + 코드 */}
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-[12px] font-medium text-slate-700">
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{role}</span>
              </div>

              {/* 값 */}
              <div className="text-[18px] font-bold text-slate-900 my-1 tracking-tight">
                {formatKRW(rate)}
              </div>

              {/* ▼ */}
              <button
                aria-label={`${ROLE_LABELS[role]} 단가 ${RATE_STEP.toLocaleString('ko-KR')}원 인하`}
                onClick={() => handleStep(role, -RATE_STEP)}
                disabled={isAtMin || isUpdating}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* 캐스케이드 배지 */}
              {cascaded && (
                <span className="text-[10px] text-amber-600 mt-1 px-1.5 py-0.5 bg-amber-50 rounded">
                  전월 단가
                </span>
              )}
              {!cascaded && rate === 0 && localRates[role] === undefined && (
                <span className="text-[10px] text-red-500 mt-1 px-1.5 py-0.5 bg-red-50 rounded">
                  단가 미설정
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
