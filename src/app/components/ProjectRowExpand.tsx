// 프로젝트 행 펼침 폼 — 3블록 구조 (메타 / 입력 / 결과)
//   블록1: 메타 정보 (회색, 읽기 전용) — 문의 등록일, 총 수량, 견적 금액, 세금 제외 매출
//   블록2: 입력 — AI 버튼 헤더 / RoleInputCard×5 + DaysInputCard / 합계 인건비 강조 / CostInput×3
//   블록3: 결과 — 비용총합·순이익·순익률 (gradient + dim + 적자 red)
//
// 5개 역할 = src/lib/roles.ts (단일 진실원). Props 시그니처 유지 (+inquiryDate optional).

import { useMemo, useState } from 'react';
import {
  Sparkles,
  Save,
  CheckCircle,
  StickyNote,
  FileText,
  X,
} from 'lucide-react';
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
  inquiryDate?: string;
  onSave: (updates: Partial<ProjectFormState>) => void;
  onComplete: () => void;
  onAiAdopted: (suggestion: StaffingSuggestion) => void;
  onNotification?: (msg: string) => void;
}

// ============================================================
// 캐스케이드 단가 — 당월 → 12개월 이내 직전월 → 0
// resolveRate는 fallback 여부도 함께 반환 (배지 표시 위해)
// ============================================================
interface ResolvedRate {
  rate: number;
  cascaded: boolean;
}

function resolveRate(rates: LaborRate[], yearMonth: string, role: LaborRole): ResolvedRate {
  const exact = rates.find((r) => r.yearMonth === yearMonth && r.role === role);
  if (exact) return { rate: exact.dailyRate, cascaded: false };
  const candidates = rates
    .filter((r) => r.role === role && r.yearMonth < yearMonth)
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  if (candidates.length === 0) return { rate: 0, cascaded: false };
  const fallback = candidates[0];
  const [cy, cm] = yearMonth.split('-').map(Number);
  const [fy, fm] = fallback.yearMonth.split('-').map(Number);
  const diff = (cy - fy) * 12 + (cm - fm);
  if (diff > 12) return { rate: 0, cascaded: false };
  return { rate: fallback.dailyRate, cascaded: true };
}

// ============================================================
// 포맷 헬퍼
// ============================================================
function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR');
}

function formatManwon(n: number): string {
  if (n === 0) return '';
  return (n / 10000).toFixed(1) + '만원';
}

function profitRatioColor(ratio: number): string {
  if (ratio >= 0.30) return 'text-emerald-600';
  if (ratio >= 0.10) return 'text-teal-600';
  if (ratio >= 0)    return 'text-amber-600';
  return 'text-red-600';
}

// 인건비율 색상 (합계 인건비 강조 행)
function laborRatioColor(ratio: number): string {
  if (ratio <= 0.30) return 'text-emerald-600';
  if (ratio <= 0.50) return 'text-amber-600';
  return 'text-red-600';
}

// ============================================================
// MetaField — 블록1 메타 정보 단위
// ============================================================
function MetaField({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <div className="text-[15px] font-semibold text-slate-700 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ============================================================
// RoleInputCard — 역할 1개 카드 (단가 표시 + 인원 input + 자동 인건비)
// ============================================================
function RoleInputCard({
  label,
  dailyRate,
  cascaded,
  days,
  count,
  onChange,
}: {
  label: string;
  dailyRate: number;
  cascaded: boolean;
  days: number;
  count: number;
  onChange: (n: number) => void;
}) {
  const subtotal = (dailyRate || 0) * (count || 0) * (days || 0);
  return (
    <div
      className={`bg-white border rounded-lg p-3 transition ${
        cascaded ? 'border-amber-200' : 'border-slate-200 hover:border-teal-300'
      }`}
    >
      <div className="text-[13px] font-semibold text-slate-900 mb-0.5">{label}</div>
      <div className="text-[11px] text-slate-400 mb-2">
        ₩{formatKRW(dailyRate)}/일
        {cascaded && <span className="ml-1 text-amber-600">· 전월 단가</span>}
      </div>

      <div className="flex items-center gap-1 mb-2">
        <input
          type="number"
          min={0}
          value={count}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="flex-1 text-center text-[16px] font-bold border border-slate-300
                     rounded px-2 py-1 focus:outline-none focus:border-teal-500
                     tabular-nums"
        />
        <span className="text-[11px] text-slate-500">명</span>
      </div>

      <div className="text-right">
        <div className="text-[13px] font-semibold text-teal-700 tabular-nums">
          ₩{formatKRW(subtotal)}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DaysInputCard — 작업일수 (모든 역할에 곱셈) — blue 톤
// ============================================================
function DaysInputCard({
  days,
  onChange,
}: {
  days: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div className="text-[13px] font-semibold text-slate-900 mb-0.5">작업일수</div>
      <div className="text-[11px] text-blue-600 mb-2">× 모든 역할에 곱셈</div>

      <div className="flex items-center gap-1 mb-2">
        <input
          type="number"
          min={0}
          step="0.5"
          value={days}
          onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className="flex-1 text-center text-[16px] font-bold border border-slate-300
                     rounded px-2 py-1 focus:outline-none focus:border-blue-500
                     tabular-nums"
        />
        <span className="text-[11px] text-slate-500">일</span>
      </div>
    </div>
  );
}

// ============================================================
// CostInput — 변동비 (천단위 콤마 자동, 만원 환산 + hint)
// ============================================================
function CostInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  const formatted = value > 0 ? value.toLocaleString('ko-KR') : '';
  const manwon = formatManwon(value);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <label className="text-[13px] font-semibold text-slate-900 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={formatted}
          placeholder="0"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            onChange(parseInt(raw) || 0);
          }}
          className="w-full text-right text-[16px] font-semibold border border-slate-300
                     rounded px-3 py-2 pr-8 focus:outline-none focus:border-teal-500
                     tabular-nums"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
          원
        </span>
      </div>
      {(manwon || hint) && (
        <div className="text-[11px] text-slate-400 mt-1 text-right">
          {manwon}
          {manwon && hint && ' · '}
          {hint}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 결과 — ResultStat / ResultRatio
// ============================================================
function ResultStat({
  label,
  value,
  dimmed,
  emphasized,
  loss,
}: {
  label: string;
  value: number;
  dimmed: boolean;
  emphasized?: boolean;
  loss?: boolean;
}) {
  const tone = dimmed
    ? 'text-slate-400'
    : loss
      ? 'text-red-600'
      : emphasized
        ? 'text-slate-900'
        : 'text-slate-700';
  return (
    <div className="text-center">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-[20px] font-bold mt-1 tabular-nums ${tone}`}>
        ₩{formatKRW(value)}
      </p>
    </div>
  );
}

function ResultRatio({
  label,
  ratio,
  dimmed,
}: {
  label: string;
  ratio: number;
  dimmed: boolean;
}) {
  const tone = dimmed ? 'text-slate-400' : profitRatioColor(ratio);
  return (
    <div className="text-center">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-[20px] font-bold mt-1 tabular-nums ${tone}`}>
        {(ratio * 100).toFixed(1)}%
      </p>
    </div>
  );
}

// ============================================================
// ConfirmModal — '완료 처리' 등 되돌리기 어려운 액션 확인
// ============================================================
function ConfirmModal({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-5 py-4 text-[13px] text-slate-600 leading-relaxed">
          {description}
        </div>
        <div className="px-5 py-3 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-[13px] font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 본 컴포넌트
// ============================================================
export function ProjectRowExpand({
  project,
  laborRates,
  similarProjects,
  availableSubcontractors,
  totalQuantity,
  detailedQuantity,
  inquiryDate,
  onSave,
  onComplete,
  onAiAdopted,
  onNotification,
}: ProjectRowExpandProps) {
  // 폼 초기값 — 기존 workerAssignments가 옛 키(lead/member/support)면 무시하고 0으로 시작
  const initial =
    project.workerAssignments && typeof project.workerAssignments === 'object'
      ? project.workerAssignments
      : { ...emptyRoleAssignments(), days: 1 };

  const [assignments, setAssignments] = useState<RoleAssignments>(() => {
    const base = emptyRoleAssignments();
    for (const r of ROLE_ORDER) base[r] = Number(initial[r]) || 0;
    return base;
  });
  const [days, setDays] = useState<number>(Number(initial.days) || 1);
  const [mealCost, setMealCost] = useState(project.mealCost);
  const [transportCost, setTransportCost] = useState(project.transportCost);
  const [otherCost, setOtherCost] = useState(project.otherCost);
  const [memo, setMemo] = useState(project.memo);
  const [showMemo, setShowMemo] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // work_date의 YYYY-MM (없으면 현재 월 폴백)
  const yearMonth = useMemo(() => {
    if (project.workDate && /^\d{4}-\d{2}/.test(project.workDate)) {
      return project.workDate.slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
  }, [project.workDate]);

  // 5역할 캐스케이드 단가 (rate + cascaded 플래그)
  const resolved: Record<RoleCode, ResolvedRate> = useMemo(() => {
    const r = {} as Record<RoleCode, ResolvedRate>;
    for (const role of ROLE_ORDER) r[role] = resolveRate(laborRates, yearMonth, role);
    return r;
  }, [laborRates, yearMonth]);

  // 즉시 계산
  const totalWorkers = ROLE_ORDER.reduce((s, r) => s + (assignments[r] || 0), 0);
  const laborBreakdown = useMemo(() => {
    return ROLE_ORDER.reduce(
      (acc, role) => {
        const count = assignments[role] || 0;
        const rate = resolved[role]?.rate || 0;
        acc[role] = { rate, count, days, subtotal: rate * count * days };
        return acc;
      },
      {} as Record<RoleCode, { rate: number; count: number; days: number; subtotal: number }>,
    );
  }, [assignments, days, resolved]);

  const totalLaborCost = ROLE_ORDER.reduce(
    (s, r) => s + (laborBreakdown[r]?.subtotal || 0),
    0,
  );
  const totalVariableCost = (mealCost || 0) + (transportCost || 0) + (otherCost || 0);
  const totalCost = totalLaborCost + totalVariableCost;
  const netProfit = project.netRevenue - totalCost;
  const profitRatio = project.netRevenue > 0 ? netProfit / project.netRevenue : 0;
  const laborCostRatio = project.netRevenue > 0 ? totalLaborCost / project.netRevenue : 0;

  // 결과 흐림 처리 — 인건비 0이고 변동비 0이면 의미 없는 수치
  const isDimmed = totalLaborCost === 0 && totalCost === 0;

  // hasChanges — 폼 현재값 vs 원본
  const hasChanges = useMemo(() => {
    const originalAssignments = emptyRoleAssignments();
    let originalDays = 1;
    if (project.workerAssignments && typeof project.workerAssignments === 'object') {
      for (const r of ROLE_ORDER) {
        originalAssignments[r] = Number(project.workerAssignments[r]) || 0;
      }
      originalDays = Number(project.workerAssignments.days) || 1;
    }
    const current = JSON.stringify({
      assignments,
      days,
      mealCost,
      transportCost,
      otherCost,
      memo,
    });
    const orig = JSON.stringify({
      assignments: originalAssignments,
      days: originalDays,
      mealCost: project.mealCost,
      transportCost: project.transportCost,
      otherCost: project.otherCost,
      memo: project.memo,
    });
    return current !== orig;
  }, [assignments, days, mealCost, transportCost, otherCost, memo, project]);

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

  const handleCompleteClick = () => {
    if (hasChanges) {
      if (!confirm('저장되지 않은 변경사항이 있습니다. 먼저 저장하시겠습니까?')) return;
    }
    setShowCompleteConfirm(true);
  };

  const handleAiAdopt = (suggestion: StaffingSuggestion) => {
    const next = emptyRoleAssignments();
    for (const r of ROLE_ORDER) next[r] = Number(suggestion.assignments[r]) || 0;
    setAssignments(next);
    setDays(Number(suggestion.assignments.days) || 0);
    onAiAdopted(suggestion);
    onNotification?.('AI 추천 채택 — 인력 배치 prefill 완료');
  };

  // 결과 배경 — 일반/흐림/적자
  const resultBgClass = isDimmed
    ? 'bg-slate-50 border border-slate-200'
    : netProfit < 0
      ? 'bg-red-50 border border-red-200'
      : 'bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200';

  // 단가 표시 (배지용)
  const ratesForAi: RoleAssignments = useMemo(() => {
    const r = emptyRoleAssignments();
    for (const role of ROLE_ORDER) r[role] = resolved[role]?.rate || 0;
    return r;
  }, [resolved]);

  // 식비 hint — 1인당 식비
  const mealHint =
    mealCost > 0 && totalWorkers > 0 && days > 0
      ? `${formatKRW(Math.round(mealCost / (totalWorkers * days)))}원/인일`
      : undefined;

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 md:px-6 py-5 space-y-4">
      {/* ============ 블록 1: 메타 정보 (회색, 읽기 전용) ============ */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
          프로젝트 정보
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetaField
            label="문의 등록일"
            value={inquiryDate || '-'}
          />
          <MetaField
            label="총 수량"
            value={totalQuantity > 0 ? `${formatKRW(totalQuantity)}대` : '-'}
            sub={detailedQuantity}
          />
          <MetaField
            label="견적 금액"
            value={`₩${formatKRW(project.quotationAmount)}`}
            sub="VAT 포함"
          />
          <MetaField
            label="세금 제외 매출"
            value={`₩${formatKRW(project.netRevenue)}`}
            sub="순매출"
          />
        </div>
      </div>

      {/* ============ 블록 2-1: 인력 배치 카드 그리드 ============ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[13px] font-semibold text-slate-900">인력 배치</h4>
          <button
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI 인력 초안 추천
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {ROLE_ORDER.map((role) => (
            <RoleInputCard
              key={role}
              label={ROLE_LABELS[role]}
              dailyRate={resolved[role]?.rate || 0}
              cascaded={resolved[role]?.cascaded || false}
              days={days}
              count={assignments[role] || 0}
              onChange={(n) => setRoleCount(role, n)}
            />
          ))}
          <DaysInputCard days={days} onChange={setDays} />
        </div>
      </div>

      {/* ============ 블록 2-2: 합계 인건비 강조 행 ============ */}
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-slate-700">합계 인건비</span>
            <span className="text-[11px] text-slate-500">
              {totalWorkers}명 × {days}일
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[20px] font-bold text-teal-700 tabular-nums">
              ₩{formatKRW(totalLaborCost)}
            </span>
            <span
              className={`text-[13px] font-medium tabular-nums ${
                totalLaborCost === 0 ? 'text-slate-400' : laborRatioColor(laborCostRatio)
              }`}
            >
              매출대비 {(laborCostRatio * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* ============ 블록 2-3: 변동비 입력 ============ */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
          변동비
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CostInput
            label="식비"
            value={mealCost}
            onChange={setMealCost}
            hint={mealHint}
          />
          <CostInput label="교통비" value={transportCost} onChange={setTransportCost} />
          <CostInput label="기타" value={otherCost} onChange={setOtherCost} />
        </div>
      </div>

      {/* ============ 블록 3: 결과 (자동 계산, 가장 강한 시각) ============ */}
      <div className={`rounded-lg p-5 ${resultBgClass}`}>
        <div className="grid grid-cols-3 gap-4">
          <ResultStat label="비용 총합" value={totalCost} dimmed={isDimmed} />
          <ResultStat
            label="순이익"
            value={netProfit}
            dimmed={isDimmed}
            emphasized={!isDimmed}
            loss={!isDimmed && netProfit < 0}
          />
          <ResultRatio label="순익률" ratio={profitRatio} dimmed={isDimmed} />
        </div>
        {isDimmed && (
          <div className="text-[12px] text-slate-500 text-center mt-3">
            인력 또는 비용을 입력하면 정확한 손익이 계산됩니다
          </div>
        )}
      </div>

      {/* ============ 메모 (펼침 토글) ============ */}
      {showMemo && (
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          placeholder="프로젝트 메모..."
          className="w-full px-3 py-2 text-[13px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      )}

      {/* ============ 하단 액션 — 메모 / 완료 / 저장 ============ */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-slate-200">
        <button
          onClick={() => setShowMemo((s) => !s)}
          className="text-[13px] text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition-colors"
        >
          {memo ? <FileText className="w-4 h-4" /> : <StickyNote className="w-4 h-4" />}
          {memo ? '메모 보기/수정' : '메모 추가'}
        </button>

        <div className="flex items-center gap-3">
          {project.status === 'in-progress' && (
            <button
              onClick={handleCompleteClick}
              className="text-[13px] text-slate-500 hover:text-emerald-600 transition-colors flex items-center gap-1"
            >
              <CheckCircle className="w-4 h-4" />
              완료 처리 →
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="bg-teal-600 text-white px-5 py-2 rounded-lg font-medium
                       hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed
                       transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            저장
          </button>
        </div>
      </div>

      {/* AI 인력 추천 모달 */}
      <AiStaffingModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        project={project}
        totalQuantity={totalQuantity}
        detailedQuantity={detailedQuantity}
        laborRates={ratesForAi}
        similarProjects={similarProjects}
        availableSubcontractors={availableSubcontractors}
        targetProfitRatio={0.3}
        onAdopt={handleAiAdopt}
      />

      {/* 완료 처리 확인 모달 */}
      {showCompleteConfirm && (
        <ConfirmModal
          title="프로젝트를 완료 처리하시겠습니까?"
          description="완료된 프로젝트는 '완료' 탭으로 이동하며, 이후 수정이 제한됩니다."
          confirmLabel="완료 처리"
          onConfirm={() => {
            onComplete();
            setShowCompleteConfirm(false);
          }}
          onCancel={() => setShowCompleteConfirm(false)}
        />
      )}
    </div>
  );
}
