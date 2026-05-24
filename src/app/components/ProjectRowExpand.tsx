// 프로젝트 행 펼침 폼 — 5개 역할 + 변동비 → 클라이언트 측 즉시 계산 → [저장] 시 onSave
// AI 추천 채택 시 5역할 인원 prefill, 완료 처리 시 onComplete() 호출
//
// 5개 역할 = src/lib/roles.ts (단일 진실원)

import { useState, useMemo } from 'react';
import { Sparkles, Save, CheckCircle, StickyNote } from 'lucide-react';
import type { LaborRate, LaborRole } from './LaborRateCard';
import {
  AiStaffingModal,
  type ProjectRefForStaffing,
  type SimilarProjectRef,
  type AvailableSubcontractor,
} from './AiStaffingModal';
import type { StaffingSuggestion } from '../../lib/gemini';
import {
  ROLE_ORDER,
  ROLE_LABELS,
  type RoleCode,
  type RoleAssignments,
  emptyRoleAssignments,
} from '../../lib/roles';

// 폼이 부모에게 PUT-ready로 넘기는 필드만 정의 (서버 파생지표는 별도 recompute)
export interface ProjectFormState {
  workerAssignments: RoleAssignments & { days: number };
  mealCost: number;
  transportCost: number;
  otherCost: number;
  memo: string;
}

// ProjectRowExpand가 다루는 Project 최소 형태
export interface ProjectForExpand extends ProjectRefForStaffing {
  workDate: string;
  status: 'in-progress' | 'completed';
  workerAssignments: (RoleAssignments & { days: number }) | null;
  laborCost: number;
  mealCost: number;
  transportCost: number;
  otherCost: number;
  memo: string;
}

interface ProjectRowExpandProps {
  project: ProjectForExpand;
  laborRates: LaborRate[];
  similarProjects: SimilarProjectRef[];
  availableSubcontractors: AvailableSubcontractor[];
  totalQuantity: number;
  detailedQuantity?: string;
  onSave: (updates: Partial<ProjectFormState>) => void;
  onComplete: () => void;
  onAiAdopted: (suggestion: StaffingSuggestion) => void;
  onNotification?: (msg: string) => void;
}

// 캐스케이드 단가 — LaborRateCard와 동일 로직
function getRate(rates: LaborRate[], yearMonth: string, role: LaborRole): number {
  const exact = rates.find((r) => r.yearMonth === yearMonth && r.role === role);
  if (exact) return exact.dailyRate;
  const candidates = rates
    .filter((r) => r.role === role && r.yearMonth < yearMonth)
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  if (candidates.length === 0) return 0;
  const fallback = candidates[0];
  const [cy, cm] = yearMonth.split('-').map(Number);
  const [fy, fm] = fallback.yearMonth.split('-').map(Number);
  const diff = (cy - fy) * 12 + (cm - fm);
  if (diff > 12) return 0;
  return fallback.dailyRate;
}

// 클라이언트 측 인건비 계산 — 5개 역할 루프, 서버 recompute 호출 없이 즉시 표시
function calcLaborCost(
  assignments: RoleAssignments & { days: number },
  rates: RoleAssignments,
): {
  breakdown: Record<RoleCode, { rate: number; count: number; days: number; subtotal: number }>;
  total: number;
} {
  const days = assignments.days;
  const breakdown = ROLE_ORDER.reduce(
    (acc, role) => {
      const rate = rates[role] ?? 0;
      const count = assignments[role] ?? 0;
      acc[role] = { rate, count, days, subtotal: rate * count * days };
      return acc;
    },
    {} as Record<RoleCode, { rate: number; count: number; days: number; subtotal: number }>,
  );
  const total = ROLE_ORDER.reduce((s, r) => s + breakdown[r].subtotal, 0);
  return { breakdown, total };
}

export function ProjectRowExpand({
  project,
  laborRates,
  similarProjects,
  availableSubcontractors,
  totalQuantity,
  detailedQuantity,
  onSave,
  onComplete,
  onAiAdopted,
  onNotification,
}: ProjectRowExpandProps) {
  // 폼 초기값 — 기존 workerAssignments가 옛 키(lead/member/support)면 무시하고 0으로 시작
  const initial = (project.workerAssignments && typeof project.workerAssignments === 'object')
    ? project.workerAssignments
    : { ...emptyRoleAssignments(), days: 0 };

  const [assignments, setAssignments] = useState<RoleAssignments>(() => {
    const base = emptyRoleAssignments();
    for (const r of ROLE_ORDER) base[r] = Number(initial[r]) || 0;
    return base;
  });
  const [days, setDays] = useState<number>(Number(initial.days) || 0);
  const [mealCost, setMealCost] = useState(project.mealCost);
  const [transportCost, setTransportCost] = useState(project.transportCost);
  const [otherCost, setOtherCost] = useState(project.otherCost);
  const [memo, setMemo] = useState(project.memo);
  const [showMemo, setShowMemo] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // work_date의 YYYY-MM (없으면 현재 월 폴백)
  const yearMonth = useMemo(() => {
    if (project.workDate && /^\d{4}-\d{2}/.test(project.workDate)) {
      return project.workDate.slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
  }, [project.workDate]);

  // 5역할 캐스케이드 단가
  const rates: RoleAssignments = useMemo(() => {
    const r = emptyRoleAssignments();
    for (const role of ROLE_ORDER) r[role] = getRate(laborRates, yearMonth, role);
    return r;
  }, [laborRates, yearMonth]);

  // 즉시 계산
  const { breakdown, total: laborCost } = useMemo(
    () => calcLaborCost({ ...assignments, days }, rates),
    [assignments, days, rates],
  );

  const totalCost = laborCost + (mealCost || 0) + (transportCost || 0) + (otherCost || 0);
  const netProfit = project.netRevenue - totalCost;
  const profitRatio = project.netRevenue > 0 ? netProfit / project.netRevenue : 0;
  const laborCostRatio = project.netRevenue > 0 ? laborCost / project.netRevenue : 0;

  const setRoleCount = (role: RoleCode, n: number) => {
    setAssignments((prev) => ({ ...prev, [role]: Math.max(0, n) }));
  };

  const handleSave = () => {
    onSave({
      workerAssignments: { ...assignments, days },
      mealCost,
      transportCost,
      otherCost,
      memo,
    });
    onNotification?.('프로젝트 저장 완료');
  };

  const handleComplete = () => {
    if (!confirm('이 프로젝트를 완료 처리하시겠습니까?')) return;
    onComplete();
  };

  const handleAiAdopt = (suggestion: StaffingSuggestion) => {
    const next = emptyRoleAssignments();
    for (const r of ROLE_ORDER) next[r] = Number(suggestion.assignments[r]) || 0;
    setAssignments(next);
    setDays(Number(suggestion.assignments.days) || 0);
    onAiAdopted(suggestion);
    onNotification?.('AI 추천 채택 — 인력 배치 prefill 완료');
  };

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-6 py-5 space-y-4">
      {/* AI 추천 버튼 */}
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-slate-800">손익 입력</h4>
        <button
          onClick={() => setAiModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI 인력 초안 추천 받기
        </button>
      </div>

      {/* 인력 input 6칸 (5역할 + 작업일수) + 자동 계산 박스 */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
          인력 배치
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {ROLE_ORDER.map((role) => (
            <div key={role}>
              <label className="block text-[11px] text-slate-500 mb-1">
                {ROLE_LABELS[role]}{' '}
                <span className="text-slate-400">(₩{rates[role].toLocaleString()}/일)</span>
              </label>
              <input
                type="number"
                min={0}
                value={assignments[role]}
                onChange={(e) => setRoleCount(role, parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          ))}
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">작업일수</label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={days}
              onChange={(e) => setDays(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-2 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* 인건비 자동 계산 박스 — 5역할 subtotal + 합계 */}
        <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
          {ROLE_ORDER.map((role) => {
            const b = breakdown[role];
            return (
              <div key={role} className="text-[11px]">
                <span className="text-slate-400">{ROLE_LABELS[role]}</span>
                <div className="font-medium text-slate-700 mt-0.5">
                  {(b.subtotal / 10000).toFixed(0)}만원
                </div>
              </div>
            );
          })}
          <div className="text-[11px]">
            <span className="text-blue-600 font-medium">합계 인건비</span>
            <div className="font-semibold text-blue-700 mt-0.5">
              {(laborCost / 10000).toFixed(0)}만원
              <span className="text-slate-400 ml-1">
                ({(laborCostRatio * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 변동비 input 3개 */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
          변동비
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '식비', value: mealCost, setter: setMealCost },
            { label: '교통비', value: transportCost, setter: setTransportCost },
            { label: '기타', value: otherCost, setter: setOtherCost },
          ].map(({ label, value, setter }) => (
            <div key={label}>
              <label className="block text-[11px] text-slate-500 mb-1">{label} (원)</label>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setter(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-2 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 결과 박스 */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border border-blue-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[11px] text-slate-500">비용 총합</p>
            <p className="text-[18px] font-bold text-slate-900 mt-1">
              {(totalCost / 10000).toFixed(0)}
              <span className="text-[11px] text-slate-500 ml-0.5">만원</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">순이익</p>
            <p
              className={`text-[18px] font-bold mt-1 ${
                netProfit >= 0 ? 'text-blue-700' : 'text-red-600'
              }`}
            >
              {(netProfit / 10000).toFixed(0)}
              <span className="text-[11px] text-slate-500 ml-0.5">만원</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">순익률</p>
            <p
              className={`text-[18px] font-bold mt-1 ${
                profitRatio >= 0.2
                  ? 'text-blue-700'
                  : profitRatio >= 0
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {(profitRatio * 100).toFixed(1)}
              <span className="text-[11px] text-slate-500 ml-0.5">%</span>
            </p>
          </div>
        </div>
      </div>

      {/* 메모 */}
      {showMemo ? (
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          placeholder="프로젝트 메모..."
          className="w-full px-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      ) : (
        <button
          onClick={() => setShowMemo(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <StickyNote className="w-3.5 h-3.5" />
          메모 {memo ? '편집' : '추가'}
        </button>
      )}

      {/* 하단 액션 */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          저장
        </button>
        {project.status === 'in-progress' && (
          <button
            onClick={handleComplete}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            완료 처리
          </button>
        )}
      </div>

      {/* AI 모달 */}
      <AiStaffingModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        project={project}
        totalQuantity={totalQuantity}
        detailedQuantity={detailedQuantity}
        laborRates={rates}
        similarProjects={similarProjects}
        availableSubcontractors={availableSubcontractors}
        targetProfitRatio={0.3}
        onAdopt={handleAiAdopt}
      />
    </div>
  );
}
