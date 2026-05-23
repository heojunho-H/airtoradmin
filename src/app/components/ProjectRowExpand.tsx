// 프로젝트 행 펼침 폼 — Phase 9
// 인력 배치 + 변동비 input → 클라이언트 측 즉시 계산 → [저장] 시 onSave({workerAssignments, ...})
// AI 추천 채택 시 prefill, 완료 처리 시 onComplete() 호출

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

// 폼이 부모에게 PUT-ready로 넘기는 필드만 정의 (서버 파생지표는 별도 recompute)
export interface ProjectFormState {
  workerAssignments: { lead: number; member: number; support: number; days: number };
  mealCost: number;
  transportCost: number;
  otherCost: number;
  memo: string;
}

// ProjectRowExpand가 다루는 Project 최소 형태
// (실제 Project 본체는 Phase 10 ProfitPage가 정의 — structural typing으로 호환)
export interface ProjectForExpand extends ProjectRefForStaffing {
  workDate: string;
  status: 'in-progress' | 'completed';
  workerAssignments: { lead: number; member: number; support: number; days: number } | null;
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

const ROLES: LaborRole[] = ['lead', 'member', 'support'];
const ROLE_LABELS: Record<LaborRole, string> = {
  lead: '팀장',
  member: '팀원',
  support: '보조',
};

// 캐스케이드 단가 — LaborRateCard와 동일 로직 (추후 utils 분리 가능)
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

// 클라이언트 측 인건비 계산 — 서버 recompute 호출 없이 즉시 표시
function calcLaborCost(
  assignments: { lead: number; member: number; support: number; days: number },
  rates: { lead: number; member: number; support: number },
): {
  breakdown: Record<LaborRole, { rate: number; count: number; days: number; subtotal: number }>;
  total: number;
} {
  const lead = {
    rate: rates.lead,
    count: assignments.lead,
    days: assignments.days,
    subtotal: rates.lead * assignments.lead * assignments.days,
  };
  const member = {
    rate: rates.member,
    count: assignments.member,
    days: assignments.days,
    subtotal: rates.member * assignments.member * assignments.days,
  };
  const support = {
    rate: rates.support,
    count: assignments.support,
    days: assignments.days,
    subtotal: rates.support * assignments.support * assignments.days,
  };
  return {
    breakdown: { lead, member, support },
    total: lead.subtotal + member.subtotal + support.subtotal,
  };
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
  // 폼 초기값
  const initialAssignments = project.workerAssignments || { lead: 0, member: 0, support: 0, days: 0 };
  const [lead, setLead] = useState(initialAssignments.lead);
  const [member, setMember] = useState(initialAssignments.member);
  const [support, setSupport] = useState(initialAssignments.support);
  const [days, setDays] = useState(initialAssignments.days);
  const [mealCost, setMealCost] = useState(project.mealCost);
  const [transportCost, setTransportCost] = useState(project.transportCost);
  const [otherCost, setOtherCost] = useState(project.otherCost);
  const [memo, setMemo] = useState(project.memo);
  const [showMemo, setShowMemo] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // work_date의 YYYY-MM (없으면 현재 월 폴백) — labor rate 조회용
  const yearMonth = useMemo(() => {
    if (project.workDate && /^\d{4}-\d{2}/.test(project.workDate)) {
      return project.workDate.slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
  }, [project.workDate]);

  // 캐스케이드된 현재 단가
  const rates = useMemo(
    () => ({
      lead: getRate(laborRates, yearMonth, 'lead'),
      member: getRate(laborRates, yearMonth, 'member'),
      support: getRate(laborRates, yearMonth, 'support'),
    }),
    [laborRates, yearMonth],
  );

  // 즉시 계산
  const { breakdown, total: laborCost } = useMemo(
    () => calcLaborCost({ lead, member, support, days }, rates),
    [lead, member, support, days, rates],
  );

  const totalCost = laborCost + (mealCost || 0) + (transportCost || 0) + (otherCost || 0);
  const netProfit = project.netRevenue - totalCost;
  const profitRatio = project.netRevenue > 0 ? netProfit / project.netRevenue : 0;
  const laborCostRatio = project.netRevenue > 0 ? laborCost / project.netRevenue : 0;

  const handleSave = () => {
    onSave({
      workerAssignments: { lead, member, support, days },
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
    setLead(suggestion.assignments.lead);
    setMember(suggestion.assignments.member);
    setSupport(suggestion.assignments.support);
    setDays(suggestion.assignments.days);
    onAiAdopted(suggestion);
    onNotification?.('AI 추천 채택 — 인력 배치 prefill 완료');
  };

  return (
    <div className="bg-teal-50/30 border-t border-teal-100 px-6 py-5 space-y-4">
      {/* AI 추천 버튼 */}
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-slate-800">손익 입력</h4>
        <button
          onClick={() => setAiModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-colors shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI 인력 초안 추천 받기
        </button>
      </div>

      {/* 인력 input 4개 + 자동 계산 박스 */}
      <div className="bg-white rounded-xl p-4 border border-teal-100">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
          인력 배치
        </p>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '팀장', value: lead, setter: setLead, rate: rates.lead },
            { label: '팀원', value: member, setter: setMember, rate: rates.member },
            { label: '보조', value: support, setter: setSupport, rate: rates.support },
          ].map(({ label, value, setter, rate }) => (
            <div key={label}>
              <label className="block text-[11px] text-slate-500 mb-1">
                {label}{' '}
                <span className="text-slate-400">(₩{rate.toLocaleString()}/일)</span>
              </label>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setter(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
              className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* 인건비 자동 계산 박스 */}
        <div className="mt-3 grid grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          {ROLES.map((role) => {
            const b = breakdown[role];
            return (
              <div key={role} className="text-[11px]">
                <span className="text-slate-400">{ROLE_LABELS[role]} subtotal</span>
                <div className="font-medium text-slate-700 mt-0.5">
                  {(b.subtotal / 10000).toFixed(0)}만원
                </div>
              </div>
            );
          })}
          <div className="text-[11px]">
            <span className="text-teal-600 font-medium">합계 인건비</span>
            <div className="font-semibold text-teal-700 mt-0.5">
              {(laborCost / 10000).toFixed(0)}만원
              <span className="text-slate-400 ml-1">
                ({(laborCostRatio * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 변동비 input 3개 */}
      <div className="bg-white rounded-xl p-4 border border-teal-100">
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
                className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 결과 박스 */}
      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-4 border border-teal-200">
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
                netProfit >= 0 ? 'text-teal-700' : 'text-red-600'
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
                  ? 'text-teal-700'
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
          className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-teal-100">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          저장
        </button>
        {project.status === 'in-progress' && (
          <button
            onClick={handleComplete}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border border-teal-300 text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
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
