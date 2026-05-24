// 월별 역할별 단가 카드 — 대시보드형 (5개 역할 상시 표시 + ▲/▼ 5,000원 step)
// 변경 즉시 서버 PUT (debounce 500ms — 연타 시 마지막 값만 저장)
// 캐스케이드 표시: currentYearMonth에 행 없으면 가까운 직전 월(12개월 이내) 값 사용
//
// 단가 카드 한 장에 모인 정보:
//   - 역할 라벨 (한글) + 코드 (회색)
//   - 현재 단가 (해당 월 / 캐스케이드된 직전 월 / 미설정)
//   - ▲ / ▼ 버튼 (±5,000원, 최소 0 / 최대 9,990,000)

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Copy } from 'lucide-react';
import {
  ROLE_ORDER,
  ROLE_LABELS,
  RATE_STEP,
  RATE_MIN,
  RATE_MAX,
  type RoleCode,
} from '../../lib/roles';

// 기존 코드의 LaborRole import 호환을 위해 re-export
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
  onRateUpdate: (yearMonth: string, role: LaborRole, dailyRate: number) => void;
  onCopyPrev: (yearMonth: string) => void;
  onNotification?: (msg: string) => void;
}

// 캐스케이드: 정확히 해당 월 → 직전 12개월 이내 → null
function findRateWithCascade(
  rates: LaborRate[],
  yearMonth: string,
  role: LaborRole,
): { dailyRate: number; sourceMonth: string } | null {
  const exact = rates.find((r) => r.yearMonth === yearMonth && r.role === role);
  if (exact) return { dailyRate: exact.dailyRate, sourceMonth: exact.yearMonth };

  const candidates = rates
    .filter((r) => r.role === role && r.yearMonth < yearMonth)
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  if (candidates.length === 0) return null;

  const fallback = candidates[0];
  const [cy, cm] = yearMonth.split('-').map(Number);
  const [fy, fm] = fallback.yearMonth.split('-').map(Number);
  const diff = (cy - fy) * 12 + (cm - fm);
  if (diff > 12) return null;

  return { dailyRate: fallback.dailyRate, sourceMonth: fallback.yearMonth };
}

function clampRate(n: number): number {
  if (!Number.isFinite(n)) return RATE_MIN;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, n));
}

function formatKRW(n: number): string {
  return n.toLocaleString() + '원';
}

export function LaborRateCard({
  laborRates,
  currentYearMonth,
  onRateUpdate,
  onCopyPrev,
  onNotification,
}: LaborRateCardProps) {
  // 카드별 낙관적 상태: 사용자가 ▲/▼ 누르는 즉시 화면 반영, 서버 응답은 debounce 후
  // (서버 응답으로 laborRates prop이 갱신되면 useEffect로 재동기화)
  const cascadeFor = (role: LaborRole): { dailyRate: number; sourceMonth: string } | null =>
    findRateWithCascade(laborRates, currentYearMonth, role);

  // localRates: 각 역할의 현재 표시값 (편집 중 즉시 반영)
  const [localRates, setLocalRates] = useState<Record<RoleCode, number>>(() => {
    return ROLE_ORDER.reduce(
      (acc, role) => {
        const c = findRateWithCascade(laborRates, currentYearMonth, role);
        acc[role] = c ? c.dailyRate : 0;
        return acc;
      },
      {} as Record<RoleCode, number>,
    );
  });

  // 부모(laborRates) 갱신 시 로컬도 재동기화 — 외부 변경(전월 복사 등) 반영
  useEffect(() => {
    setLocalRates(
      ROLE_ORDER.reduce(
        (acc, role) => {
          const c = findRateWithCascade(laborRates, currentYearMonth, role);
          acc[role] = c ? c.dailyRate : 0;
          return acc;
        },
        {} as Record<RoleCode, number>,
      ),
    );
  }, [laborRates, currentYearMonth]);

  // 역할별 debounce 타이머 (연타 시 마지막 값만 서버에 PUT)
  const debounceTimers = useRef<Record<RoleCode, number | null>>(
    ROLE_ORDER.reduce((acc, r) => { acc[r] = null; return acc; }, {} as Record<RoleCode, number | null>),
  );

  // 컴포넌트 언마운트 시 모든 타이머 정리
  useEffect(() => {
    return () => {
      for (const r of ROLE_ORDER) {
        const t = debounceTimers.current[r];
        if (t !== null) window.clearTimeout(t);
      }
    };
  }, []);

  const scheduleServerSave = (role: RoleCode, newRate: number) => {
    const existing = debounceTimers.current[role];
    if (existing !== null) window.clearTimeout(existing);
    debounceTimers.current[role] = window.setTimeout(() => {
      onRateUpdate(currentYearMonth, role, newRate);
      debounceTimers.current[role] = null;
    }, 500);
  };

  const adjustRate = (role: RoleCode, delta: number) => {
    setLocalRates((prev) => {
      const next = clampRate(prev[role] + delta);
      if (next === prev[role]) {
        // 이미 경계값 (0 또는 9,990,000원)
        if (delta < 0 && prev[role] === RATE_MIN) {
          onNotification?.('이미 최소 단가(0원)입니다');
        } else if (delta > 0 && prev[role] === RATE_MAX) {
          onNotification?.('이미 최대 단가입니다');
        }
        return prev;
      }
      scheduleServerSave(role, next);
      return { ...prev, [role]: next };
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
      {/* 헤더 행 — 타이틀 + 전월 단가 복사 버튼 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-800">
            이번 달 역할별 단가 ({currentYearMonth})
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            ▲/▼ 버튼으로 ±{(RATE_STEP / 1000).toFixed(0)},000원씩 조정 (변경 즉시 자동 저장)
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

      {/* 5개 카드 그리드 — 데스크톱 5열, 모바일 2열 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {ROLE_ORDER.map((role) => {
          const cascade = cascadeFor(role);
          const isFallback = cascade && cascade.sourceMonth !== currentYearMonth;
          const isMissing = !cascade;
          const value = localRates[role];

          return (
            <div
              key={role}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col"
            >
              {/* 라벨 + 코드 */}
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[13px] font-semibold text-slate-800">
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{role}</span>
              </div>

              {/* 단가 표시 */}
              <div className="text-center my-2">
                <p className="text-[18px] font-bold text-slate-900 tracking-tight">
                  {formatKRW(value)}
                </p>
                {isFallback && (
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    {cascade!.sourceMonth} 단가 사용 중
                  </p>
                )}
                {isMissing && (
                  <p className="text-[10px] text-red-500 mt-0.5">단가 미설정</p>
                )}
              </div>

              {/* ▲ / ▼ 버튼 */}
              <div className="flex items-center gap-2 mt-auto">
                <button
                  onClick={() => adjustRate(role, -RATE_STEP)}
                  disabled={value <= RATE_MIN}
                  className="flex-1 flex items-center justify-center py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label={`${ROLE_LABELS[role]} 단가 ${RATE_STEP}원 감소`}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => adjustRate(role, RATE_STEP)}
                  disabled={value >= RATE_MAX}
                  className="flex-1 flex items-center justify-center py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label={`${ROLE_LABELS[role]} 단가 ${RATE_STEP}원 증가`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
