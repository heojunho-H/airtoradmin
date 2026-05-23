// 월별 역할별 단가 카드 — Phase 9
// 접힌 상태: 한 줄 요약 / 펼친 상태: 3개 input row + [전월 단가 복사] 버튼
// 캐스케이드 표시: currentYearMonth에 행이 없으면 가장 가까운 직전 월(12개월 이내) 값을 회색으로 표시

import { useState } from 'react';
import { ChevronDown, ChevronUp, Save, Copy } from 'lucide-react';

export type LaborRole = 'lead' | 'member' | 'support';

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

const ROLES: LaborRole[] = ['lead', 'member', 'support'];
const ROLE_LABELS: Record<LaborRole, string> = {
  lead: '팀장',
  member: '팀원',
  support: '보조',
};

// 캐스케이드 단가 조회: 정확히 해당 월 → 가장 가까운 직전 월(12개월 이내) → null
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

function formatKRWFull(n: number): string {
  return '₩' + n.toLocaleString();
}

function formatKRWShort(n: number): string {
  if (n >= 10000) return '₩' + (n / 10000).toFixed(0) + '만';
  return '₩' + n.toLocaleString();
}

export function LaborRateCard({
  laborRates,
  currentYearMonth,
  onRateUpdate,
  onCopyPrev,
  onNotification,
}: LaborRateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<Record<LaborRole, string>>({
    lead: '',
    member: '',
    support: '',
  });

  // 각 역할의 표시 단가 (캐스케이드 적용)
  const ratesCascaded = ROLES.reduce(
    (acc, role) => {
      acc[role] = findRateWithCascade(laborRates, currentYearMonth, role);
      return acc;
    },
    {} as Record<LaborRole, { dailyRate: number; sourceMonth: string } | null>,
  );

  // 접힌 상태 요약 — 한 줄
  const summary = ROLES.map((role) => {
    const r = ratesCascaded[role];
    const label = ROLE_LABELS[role];
    return r ? `${label} ${formatKRWShort(r.dailyRate)}` : `${label} —`;
  }).join(' · ');

  const handleSave = (role: LaborRole) => {
    const value = drafts[role].trim();
    if (!value) return;
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
    if (isNaN(num) || num < 0) {
      onNotification?.(`${ROLE_LABELS[role]} 단가는 0 이상의 숫자여야 합니다`);
      return;
    }
    onRateUpdate(currentYearMonth, role, num);
    setDrafts((prev) => ({ ...prev, [role]: '' }));
    onNotification?.(`${ROLE_LABELS[role]} 단가 ${formatKRWFull(num)} 저장`);
  };

  return (
    <div className="bg-white rounded-xl border border-teal-100 shadow-sm">
      {/* 헤더 — 토글 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-teal-50/50 transition-colors rounded-xl"
      >
        <div className="flex flex-col items-start gap-1">
          <span className="text-[13px] font-medium text-teal-700">
            이번 달 역할별 단가 ({currentYearMonth})
          </span>
          {!expanded && <span className="text-[12px] text-slate-500">{summary}</span>}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {/* 펼친 상태 */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 space-y-3 border-t border-teal-50">
          {ROLES.map((role) => {
            const cascaded = ratesCascaded[role];
            const isFallback = cascaded && cascaded.sourceMonth !== currentYearMonth;
            const isMissing = !cascaded;

            return (
              <div key={role} className="flex items-center gap-3">
                <label className="w-14 text-[13px] font-medium text-slate-700">
                  {ROLE_LABELS[role]}
                </label>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={drafts[role]}
                    placeholder={cascaded ? formatKRWFull(cascaded.dailyRate) : '단가 미설정'}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [role]: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  {isFallback && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">
                      {cascaded!.sourceMonth} 단가 사용 중
                    </span>
                  )}
                  {isMissing && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-red-400 pointer-events-none">
                      단가 미설정
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleSave(role)}
                  disabled={!drafts[role].trim()}
                  className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  저장
                </button>
              </div>
            );
          })}

          {/* 전월 복사 */}
          <div className="pt-2 border-t border-teal-50">
            <button
              onClick={() => onCopyPrev(currentYearMonth)}
              className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              전월 단가 복사
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
