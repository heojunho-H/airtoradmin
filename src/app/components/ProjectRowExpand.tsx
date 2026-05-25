// 프로젝트 행 펼침 폼 — 3블록 구조 (메타 / 입력 / 결과)
//   블록1: 메타 정보 (회색, 읽기 전용) — 문의 등록일, 총 수량, 견적 금액, 세금 제외 매출
//   블록2: 입력 — 인력배치 헤더(작업일수 inline + AI 버튼) / RoleInputCard×5 / LaborSummary / CostInputCard×3
//   블록3: 결과 — empty / partial / full 상태별 표시 (+ 적자 red)
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
  Users,
  Receipt,
  Loader2,
  Plus,
  RefreshCw,
  AlertCircle,
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
import { formatDetailedQuantity } from '../../lib/quantity';

// 자유 입력 추가 인력 (5개 고정 역할 외 특이 상황 대응용)
export interface ExtraLaborEntry {
  label: string;      // 자유 입력 역할명 (예: "외주반장")
  dailyRate: number;  // 1인 1일 단가
  count: number;      // 인원수
}

// 폼이 부모에게 PUT-ready로 넘기는 필드만 정의 (서버 파생지표는 별도 recompute)
export interface ProjectFormState {
  workerAssignments: RoleAssignments & { days: number; extras?: ExtraLaborEntry[] };
  mealCost: number;
  transportCost: number;
  otherCost: number;
  memo: string;
}

// ProjectRowExpand가 다루는 Project 최소 형태
export interface ProjectForExpand extends ProjectRefForStaffing {
  workDate: string;
  status: 'in-progress' | 'completed';
  workerAssignments:
    | (RoleAssignments & { days: number; extras?: ExtraLaborEntry[] })
    | null;
  laborCost: number;
  mealCost: number;
  transportCost: number;
  otherCost: number;
  memo: string;
  // Phase 1.7 / Step 5 — AI 자동 호출 상태
  aiStatus?: 'pending' | 'generating' | 'success' | 'failed' | 'manual';
  aiAttemptedAt?: string;
  aiError?: string;
  aiInfluence?: 'high' | 'medium' | 'low' | 'none' | '';
  aiSuggestion?: string;
}

interface ProjectRowExpandProps {
  project: ProjectForExpand;
  laborRates: LaborRate[];
  similarProjects: SimilarProjectRef[];
  availableSubcontractors: AvailableSubcontractor[];
  totalQuantity: number;
  detailedQuantity?: string;
  inquiryDate?: string;
  onSave: (updates: Partial<ProjectFormState>) => void | Promise<void>;
  onComplete: () => void;
  onAiAdopted: (suggestion: StaffingSuggestion) => void;
  /** Phase 1.7 / Step 5 — failed→pending 리셋 후 자동 큐 재진입 */
  onReRunAi: (projectId: number) => void;
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

function profitRatioColor(ratio: number): string {
  if (ratio >= 0.30) return 'text-emerald-600';
  if (ratio >= 0.10) return 'text-teal-600';
  if (ratio >= 0)    return 'text-amber-600';
  return 'text-red-600';
}

// 인건비율 색상 (LaborSummary)
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
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ============================================================
// RoleInputCard — 역할 1개 카드 (단가 표시 + 인원 input + 자동 인건비)
//   가로 한 줄: [인풋(명 suffix)] = [인건비 결과]
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
  const hasInput = count > 0 && days > 0;

  return (
    <div
      className={`bg-white border rounded-lg p-4 transition ${
        cascaded ? 'border-amber-200' : 'border-slate-200 hover:border-teal-300'
      }`}
    >
      {/* 라벨 + 단가 */}
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          ₩{formatKRW(dailyRate)}/일
          {cascaded && <span className="ml-1 text-amber-600">· 전월</span>}
        </div>
      </div>

      {/* 인풋 = 결과 한 줄 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0" style={{ width: '72px' }}>
          <input
            type="number"
            min={0}
            value={count}
            onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full text-center text-base font-semibold
                       border border-slate-300 rounded px-2 py-1.5 pr-7
                       focus:outline-none focus:border-teal-500
                       tabular-nums"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2
                           text-xs text-slate-400 pointer-events-none">
            명
          </span>
        </div>

        <span className="text-slate-400 text-sm flex-shrink-0">=</span>

        <div className="flex-1 text-right min-w-0">
          <span
            className={`text-base font-bold tabular-nums ${
              hasInput ? 'text-teal-700' : 'text-slate-300'
            }`}
          >
            ₩{formatKRW(subtotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ExtraRoleCard — 자유 입력 추가 인력 1개 (역할명 / 1인 1일 단가 / 인원수)
//   특이 상황 (외주, 비표준 역할 등) 대응용. 5역할 카드와 시각 언어는 통일하되
//   amber 톤 + dashed 보더로 "사용자 정의" 신호.
// ============================================================
function ExtraRoleCard({
  entry,
  days,
  onChange,
  onRemove,
}: {
  entry: ExtraLaborEntry;
  days: number;
  onChange: (next: ExtraLaborEntry) => void;
  onRemove: () => void;
}) {
  const subtotal = (entry.dailyRate || 0) * (entry.count || 0) * (days || 0);
  const hasInput = entry.count > 0 && days > 0 && entry.dailyRate > 0;
  const dailyRateFormatted = entry.dailyRate > 0 ? entry.dailyRate.toLocaleString('ko-KR') : '';

  return (
    <div className="bg-white border border-dashed border-amber-300 rounded-lg p-4 relative hover:border-amber-400 transition">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-500"
        aria-label="이 항목 삭제"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* 역할명 + 단가 입력 */}
      <div className="mb-3 pr-6">
        <input
          type="text"
          value={entry.label}
          onChange={(e) => onChange({ ...entry, label: e.target.value })}
          placeholder="역할명 (예: 외주반장)"
          className="w-full text-sm font-semibold text-slate-900 bg-transparent
                     border-b border-amber-200 focus:border-amber-500
                     focus:outline-none pb-0.5 placeholder:text-slate-300 placeholder:font-normal"
        />
        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-[11px] text-slate-400">₩</span>
          <input
            type="text"
            inputMode="numeric"
            value={dailyRateFormatted}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              onChange({ ...entry, dailyRate: parseInt(raw) || 0 });
            }}
            className="flex-1 text-[11px] tabular-nums text-slate-600
                       border-0 bg-transparent focus:outline-none p-0 placeholder:text-slate-300"
          />
          <span className="text-[11px] text-slate-400 whitespace-nowrap">/일</span>
        </div>
      </div>

      {/* 인원수 input = subtotal */}
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0" style={{ width: '72px' }}>
          <input
            type="number"
            min={0}
            value={entry.count}
            onChange={(e) =>
              onChange({ ...entry, count: Math.max(0, parseInt(e.target.value) || 0) })
            }
            className="w-full text-center text-base font-semibold
                       border border-slate-300 rounded px-2 py-1.5 pr-7
                       focus:outline-none focus:border-amber-500
                       tabular-nums"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2
                           text-xs text-slate-400 pointer-events-none">
            명
          </span>
        </div>

        <span className="text-slate-400 text-sm flex-shrink-0">=</span>

        <div className="flex-1 text-right min-w-0">
          <span
            className={`text-base font-bold tabular-nums ${
              hasInput ? 'text-amber-700' : 'text-slate-300'
            }`}
          >
            ₩{formatKRW(subtotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LaborSummary — 합계 인건비 강조 행 (또는 입력 안내)
// ============================================================
function LaborSummary({
  totalWorkers,
  days,
  totalLaborCost,
  netRevenue,
}: {
  totalWorkers: number;
  days: number;
  totalLaborCost: number;
  netRevenue: number;
}) {
  const hasInput = totalWorkers > 0 && days > 0;
  const ratio = netRevenue > 0 ? totalLaborCost / netRevenue : 0;

  if (!hasInput) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
        <span className="text-sm text-slate-500">
          역할별 인원과 작업일수를 입력하면 합계 인건비가 계산됩니다
        </span>
      </div>
    );
  }

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">합계 인건비</span>
          <span className="text-xs text-slate-500 tabular-nums">
            {totalWorkers}명 × {days}일
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-teal-700 tabular-nums">
            ₩{formatKRW(totalLaborCost)}
          </span>
          <span className={`text-sm font-medium tabular-nums ${laborRatioColor(ratio)}`}>
            매출대비 {(ratio * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CostInputCard — 변동비 1개 카드 (라벨/sub + input + 보조정보)
// ============================================================
function CostInputCard({
  label,
  sub,
  value,
  onChange,
  totalWorkers,
  days,
  showPerPerson,
}: {
  label: string;
  sub: string;
  value: number;
  onChange: (n: number) => void;
  totalWorkers?: number;
  days?: number;
  showPerPerson?: boolean;
}) {
  const formatted = value > 0 ? value.toLocaleString('ko-KR') : '';
  const manwon = value >= 10000 ? `${(value / 10000).toFixed(1)}만원` : null;
  const perPerson =
    showPerPerson && (totalWorkers ?? 0) > 0 && (days ?? 0) > 0 && value > 0
      ? Math.round(value / (totalWorkers as number) / (days as number))
      : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
      </div>

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
          className="w-full text-right text-base font-semibold
                     border border-slate-300 rounded px-3 py-2 pr-8
                     focus:outline-none focus:border-teal-500
                     tabular-nums"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
          원
        </span>
      </div>

      {(manwon || perPerson) && (
        <div className="text-[11px] text-slate-500 mt-2 text-right flex justify-end gap-2">
          {manwon && <span>{manwon}</span>}
          {perPerson && <span>· 1인 1일 ₩{formatKRW(perPerson)}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ResultBlock — 비용·순이익·순익률 (empty / partial / full + loss)
// ============================================================
type ResultState = 'empty' | 'partial' | 'full';

function ResultBlock({
  totalLaborCost,
  totalVariableCost,
  totalCost,
  netProfit,
  profitRatio,
}: {
  totalLaborCost: number;
  totalVariableCost: number;
  totalCost: number;
  netProfit: number;
  profitRatio: number;
}) {
  const state: ResultState =
    totalLaborCost === 0 && totalVariableCost === 0
      ? 'empty'
      : totalLaborCost === 0 || totalVariableCost === 0
        ? 'partial'
        : 'full';
  const isLoss = state !== 'empty' && netProfit < 0;

  const bgClass =
    state === 'empty'
      ? 'bg-slate-50 border-slate-200'
      : isLoss
        ? 'bg-red-50 border-red-200'
        : state === 'full'
          ? 'bg-gradient-to-r from-teal-50 to-blue-50 border-teal-200'
          : 'bg-amber-50 border-amber-200';

  return (
    <div className={`rounded-lg p-5 border ${bgClass}`}>
      {state === 'empty' && (
        <div className="text-center text-sm text-slate-500 mb-4">
          인력 또는 변동비를 입력하면 정확한 손익이 계산됩니다
        </div>
      )}
      {state === 'partial' && (
        <div className="text-center text-xs text-amber-700 mb-3">
          ⓘ 일부 비용만 입력됨 — 정확하지 않을 수 있습니다
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <ResultStat
          label="비용 총합"
          value={state === 'empty' ? null : `₩${formatKRW(totalCost)}`}
          state={state}
        />
        <ResultStat
          label="순이익"
          value={state === 'empty' ? null : `₩${formatKRW(netProfit)}`}
          state={state}
          emphasized
          loss={isLoss}
        />
        <ResultStat
          label="순익률"
          value={state === 'empty' ? null : `${(profitRatio * 100).toFixed(1)}%`}
          state={state}
          isRatio
          ratio={profitRatio}
        />
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  state,
  emphasized,
  loss,
  isRatio,
  ratio,
}: {
  label: string;
  value: string | null;
  state: ResultState;
  emphasized?: boolean;
  loss?: boolean;
  isRatio?: boolean;
  ratio?: number;
}) {
  const ratioColorClass =
    isRatio && state !== 'empty' && typeof ratio === 'number' ? profitRatioColor(ratio) : '';

  const valueColor =
    state === 'empty'
      ? 'text-slate-300'
      : loss
        ? 'text-red-600'
        : ratioColorClass
          ? ratioColorClass
          : emphasized
            ? 'text-slate-900'
            : 'text-slate-700';

  return (
    <div className="text-center">
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <div className={`text-[22px] font-bold tabular-nums ${valueColor}`}>
        {value ?? '—'}
      </div>
    </div>
  );
}

// ============================================================
// Phase 1.7 / Step 5 — AI 상태/학습 영향도 배지 + 추천 근거 펼침
// ============================================================
function AiInfluenceBadge({ influence }: { influence?: string }) {
  const config: Record<string, { color: string; label: string; tooltip: string }> = {
    high:   { color: 'bg-emerald-100 text-emerald-700', label: '🎯 학습 강함', tooltip: '5건 이상 유사 프로젝트 + 우수 사례 기반 추천' },
    medium: { color: 'bg-teal-100 text-teal-700',       label: '📊 학습 보통', tooltip: '1~4건 유사 프로젝트 기반 추천' },
    low:    { color: 'bg-amber-100 text-amber-700',     label: '🔍 학습 약함', tooltip: '유사 사례 부족, 일반 추정 기반' },
    none:   { color: 'bg-slate-100 text-slate-600',     label: '🆕 첫 사례',   tooltip: '이 서비스/수량의 첫 케이스 — 일반 추정' },
  };
  const c = config[influence || 'none'] || config.none;
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${c.color}`}
      title={c.tooltip}
    >
      {c.label}
    </span>
  );
}

function AiStatusBadge({ project }: { project: ProjectForExpand }) {
  if (project.aiStatus === 'generating') {
    return (
      <span className="text-xs text-teal-600 flex items-center gap-1 px-2 py-0.5 bg-teal-50 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" />
        AI 분석 중...
      </span>
    );
  }
  if (project.aiStatus === 'failed') {
    return (
      <span
        className="text-xs text-red-600 flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded-full"
        title={project.aiError || '알 수 없는 오류'}
      >
        <AlertCircle className="w-3 h-3" />
        AI 생성 실패
      </span>
    );
  }
  if (project.aiStatus === 'success') {
    return <AiInfluenceBadge influence={project.aiInfluence || ''} />;
  }
  if (project.aiStatus === 'manual') {
    return (
      <span className="text-xs text-slate-500 flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full">
        👤 수동 입력
      </span>
    );
  }
  // pending / 미정 — 표시 안 함 (자동 호출 시작 전 잠시 상태)
  return null;
}

function AiRationale({ project }: { project: ProjectForExpand }) {
  if (!project.aiSuggestion) return null;

  let parsed: {
    rationale?: string;
    warnings?: string[];
    estimatedLaborCost?: number;
    estimatedNetProfit?: number;
    estimatedProfitRatio?: number;
  };
  try {
    parsed = JSON.parse(project.aiSuggestion);
  } catch {
    return null;
  }

  const warnings = parsed.warnings && parsed.warnings.length > 0 ? parsed.warnings : null;

  return (
    <details className="mb-3 text-sm bg-slate-50 border border-slate-200 rounded-lg">
      <summary className="cursor-pointer font-medium text-slate-700 hover:text-slate-900
                          px-3 py-2 select-none flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-teal-600" />
        AI 추천 근거 보기
        {warnings && (
          <span className="ml-auto text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            경고 {warnings.length}건
          </span>
        )}
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-2 text-slate-600">
        {parsed.rationale && (
          <div className="text-sm leading-relaxed">{parsed.rationale}</div>
        )}

        {parsed.estimatedProfitRatio !== undefined && (
          <div className="text-xs text-slate-500 flex flex-wrap gap-3">
            <span>예상 인건비: ₩{(parsed.estimatedLaborCost || 0).toLocaleString('ko-KR')}</span>
            <span>예상 순이익: ₩{(parsed.estimatedNetProfit || 0).toLocaleString('ko-KR')}</span>
            <span>예상 순익률: {((parsed.estimatedProfitRatio || 0) * 100).toFixed(1)}%</span>
          </div>
        )}

        {warnings && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
            <div className="font-medium text-amber-700 mb-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              경고
            </div>
            <ul className="list-disc list-inside text-amber-700 space-y-0.5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
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
  onReRunAi,
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
  const [extras, setExtras] = useState<ExtraLaborEntry[]>(() => {
    const raw = (project.workerAssignments as { extras?: unknown } | null)?.extras;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({
        label: typeof e.label === 'string' ? e.label : '',
        dailyRate: Number(e.dailyRate) || 0,
        count: Number(e.count) || 0,
      }));
  });
  const [mealCost, setMealCost] = useState(project.mealCost);
  const [transportCost, setTransportCost] = useState(project.transportCost);
  const [otherCost, setOtherCost] = useState(project.otherCost);
  const [memo, setMemo] = useState(project.memo);
  const [showMemo, setShowMemo] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  // 즉시 계산 — extras 포함
  const extrasWorkers = extras.reduce((s, e) => s + (e.count || 0), 0);
  const totalWorkers =
    ROLE_ORDER.reduce((s, r) => s + (assignments[r] || 0), 0) + extrasWorkers;
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

  const extrasLaborCost = extras.reduce(
    (s, e) => s + (e.dailyRate || 0) * (e.count || 0) * (days || 0),
    0,
  );
  const totalLaborCost =
    ROLE_ORDER.reduce((s, r) => s + (laborBreakdown[r]?.subtotal || 0), 0) +
    extrasLaborCost;
  const totalVariableCost = (mealCost || 0) + (transportCost || 0) + (otherCost || 0);
  const totalCost = totalLaborCost + totalVariableCost;
  const netProfit = project.netRevenue - totalCost;
  const profitRatio = project.netRevenue > 0 ? netProfit / project.netRevenue : 0;

  // hasChanges — 폼 현재값 vs 원본 (extras 포함)
  const hasChanges = useMemo(() => {
    const originalAssignments = emptyRoleAssignments();
    let originalDays = 1;
    let originalExtras: ExtraLaborEntry[] = [];
    if (project.workerAssignments && typeof project.workerAssignments === 'object') {
      for (const r of ROLE_ORDER) {
        originalAssignments[r] = Number(project.workerAssignments[r]) || 0;
      }
      originalDays = Number(project.workerAssignments.days) || 1;
      const rawExtras = (project.workerAssignments as { extras?: unknown }).extras;
      if (Array.isArray(rawExtras)) {
        originalExtras = rawExtras
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
          .map((e) => ({
            label: typeof e.label === 'string' ? e.label : '',
            dailyRate: Number(e.dailyRate) || 0,
            count: Number(e.count) || 0,
          }));
      }
    }
    const current = JSON.stringify({
      assignments,
      days,
      extras,
      mealCost,
      transportCost,
      otherCost,
      memo,
    });
    const orig = JSON.stringify({
      assignments: originalAssignments,
      days: originalDays,
      extras: originalExtras,
      mealCost: project.mealCost,
      transportCost: project.transportCost,
      otherCost: project.otherCost,
      memo: project.memo,
    });
    return current !== orig;
  }, [assignments, days, extras, mealCost, transportCost, otherCost, memo, project]);

  const setRoleCount = (role: RoleCode, n: number) => {
    setAssignments((prev) => ({ ...prev, [role]: Math.max(0, n) }));
  };

  const addExtra = () => {
    setExtras((prev) => [...prev, { label: '', dailyRate: 0, count: 0 }]);
  };
  const updateExtra = (i: number, next: ExtraLaborEntry) => {
    setExtras((prev) => prev.map((e, idx) => (idx === i ? next : e)));
  };
  const removeExtra = (i: number) => {
    setExtras((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.resolve(
        onSave({
          workerAssignments: { ...assignments, days, extras },
          mealCost,
          transportCost,
          otherCost,
          memo,
        }),
      );
      onNotification?.('프로젝트 저장 완료');
    } finally {
      setIsSaving(false);
    }
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
    setDays(Number(suggestion.assignments.days) || 1);
    onAiAdopted(suggestion);
    onNotification?.('AI 추천 채택 — 인력 배치 prefill 완료');
  };

  // 단가 표시 (배지용)
  const ratesForAi: RoleAssignments = useMemo(() => {
    const r = emptyRoleAssignments();
    for (const role of ROLE_ORDER) r[role] = resolved[role]?.rate || 0;
    return r;
  }, [resolved]);

  const totalQuantitySub = formatDetailedQuantity(detailedQuantity);

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 md:px-6 py-5 space-y-4">
      {/* ============ 블록 1: 메타 정보 (회색, 읽기 전용) ============ */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
          프로젝트 정보
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetaField label="문의 등록일" value={inquiryDate || '-'} />
          <MetaField
            label="총 수량"
            value={totalQuantity > 0 ? `${formatKRW(totalQuantity)}대` : '-'}
            sub={totalQuantitySub}
          />
          <MetaField
            label="견적 금액"
            value={`₩${formatKRW(project.quotationAmount)}`}
            sub="VAT 포함"
          />
          <MetaField
            label="세금 제외 매출"
            value={`₩${formatKRW(project.netRevenue)}`}
            sub="순매출 (VAT 제외)"
          />
        </div>
      </div>

      {/* ============ 블록 2-1: 인력 배치 (헤더: 상태 배지 + 작업일수 + AI 다시 추천) ============ */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-600" />
              인력 배치
            </h4>
            <AiStatusBadge project={project} />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* 작업일수 inline 입력 */}
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-slate-600 font-medium">작업일수</span>
              <div className="relative" style={{ width: '64px' }}>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={days}
                  onChange={(e) =>
                    setDays(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  className="w-full text-center text-base font-bold border-0 bg-transparent
                             focus:outline-none tabular-nums pr-4"
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2
                                 text-xs text-slate-500 pointer-events-none">
                  일
                </span>
              </div>
              <div
                className="text-[10px] text-blue-600 ml-1"
                title="모든 역할 카드에 곱해집니다"
              >
                × 전체 적용
              </div>
            </div>

            {/* AI 다시 추천 — ai_status='pending' 으로 리셋 → 자동 큐가 재호출 */}
            <button
              type="button"
              onClick={() => onReRunAi(project.id)}
              disabled={project.aiStatus === 'generating'}
              className="bg-white border border-teal-300 text-teal-700 px-3 py-1.5 rounded-lg
                         text-xs font-medium hover:bg-teal-50
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center gap-1.5 transition"
              title="학습 데이터를 반영해 다시 추천"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${project.aiStatus === 'generating' ? 'animate-spin' : ''}`}
              />
              AI 다시 추천
            </button>
          </div>
        </div>

        {/* AI 추천 근거 (aiSuggestion 있을 때만) */}
        <AiRationale project={project} />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
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
        </div>

        {/* 기타 인력 (자유 입력 — 특이 상황 대응) */}
        <div className="mb-3">
          {extras.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
              {extras.map((entry, i) => (
                <ExtraRoleCard
                  key={i}
                  entry={entry}
                  days={days}
                  onChange={(next) => updateExtra(i, next)}
                  onRemove={() => removeExtra(i)}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addExtra}
            className="text-[13px] text-amber-700 hover:text-amber-800 hover:bg-amber-50
                       flex items-center gap-1 px-3 py-1.5 rounded
                       border border-dashed border-amber-300 hover:border-amber-400 transition"
          >
            <Plus className="w-4 h-4" />
            기타 추가
            <span className="text-[11px] text-slate-400 ml-1">
              5개 역할 외 자유 입력
            </span>
          </button>
        </div>

        <LaborSummary
          totalWorkers={totalWorkers}
          days={days}
          totalLaborCost={totalLaborCost}
          netRevenue={project.netRevenue}
        />
      </div>

      {/* ============ 블록 2-2: 변동비 ============ */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-teal-600" />
          변동비
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CostInputCard
            label="식비"
            sub="인당 식사 보조"
            value={mealCost}
            onChange={setMealCost}
            totalWorkers={totalWorkers}
            days={days}
            showPerPerson
          />
          <CostInputCard
            label="교통비"
            sub="차량·이동 비용"
            value={transportCost}
            onChange={setTransportCost}
          />
          <CostInputCard
            label="기타"
            sub="장비·소모품 등"
            value={otherCost}
            onChange={setOtherCost}
          />
        </div>
      </div>

      {/* ============ 블록 3: 결과 (자동 계산, 가장 강한 시각) ============ */}
      <ResultBlock
        totalLaborCost={totalLaborCost}
        totalVariableCost={totalVariableCost}
        totalCost={totalCost}
        netProfit={netProfit}
        profitRatio={profitRatio}
      />

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

        <div className="flex items-center gap-4">
          {project.status === 'in-progress' && (
            <button
              onClick={handleCompleteClick}
              className="text-[13px] text-slate-500 hover:text-emerald-600 transition-colors flex items-center gap-1"
            >
              <CheckCircle className="w-4 h-4" />
              완료 처리 →
            </button>
          )}

          <div className="flex items-center gap-2">
            {!hasChanges && !isSaving && (
              <span className="text-[11px] text-slate-400">변경사항 없음</span>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg font-medium
                         hover:bg-teal-700 active:bg-teal-800
                         disabled:bg-slate-300 disabled:cursor-not-allowed
                         transition-colors flex items-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  저장
                </>
              )}
            </button>
          </div>
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
