// 손익 관리 (프로젝트 관리) 페이지 — Phase 10
// SalesPage/CustomersPage 구조 답습. 단가표 카드 + KPI 5장 + 검색·필터 + 테이블/모바일 카드 + 행 펼침
// 색상 토큰: teal (crm의 emerald와 구분)

import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Plus,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  DollarSign,
  Percent,
  CheckCircle2,
  Sparkles,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { MobileCard, MobileCardField, MobileCardRow, MobileCardBadge } from './MobileCard';
import { LaborRateCard, type LaborRate, type LaborRole } from './LaborRateCard';
import {
  type AvailableSubcontractor,
  type SimilarProjectRef,
} from './AiStaffingModal';
import { ProjectRowExpand } from './ProjectRowExpand';
import type { StaffingSuggestion } from '../../lib/gemini';

// ============================================================
// 타입
// ============================================================
export interface Project {
  id: number;
  dealId: number;
  customerId: number | null;
  workHistoryDealId: number | null;
  projectName: string;
  serviceType: string;
  workDate: string; // 'YYYY-MM-DD' or ''
  status: 'in-progress' | 'completed';
  completedAt?: string;
  completedReason?: 'manual' | 'report_sent' | '';
  quotationAmount: number;
  taxAmount: number;
  netRevenue: number;
  workerAssignments: { lead: number; member: number; support: number; days: number } | null;
  laborBreakdown: Record<LaborRole, { rate: number; count: number; days: number; subtotal: number }> | null;
  laborCost: number;
  mealCost: number;
  transportCost: number;
  otherCost: number;
  totalCost: number;
  laborCostRatio: number; // fraction (0~1)
  netProfit: number;
  profitRatio: number; // fraction (0~1)
  aiSuggestion?: string;
  aiApplied: boolean;
  memo: string;
  createdAt?: string;
  updatedAt?: string;
}

// LaborRate는 LaborRateCard에서 import해 단일 출처 유지 (type drift 방지)
export type { LaborRate, LaborRole };

// ============================================================
// API 헬퍼 — SalesPage/CustomersPage 패턴 그대로
// ============================================================
const PROJECTS_ENDPOINT = '/api/projects';
const LABOR_RATES_ENDPOINT = '/api/labor_rates';

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(PROJECTS_ENDPOINT);
  if (!response.ok) throw new Error('프로젝트 데이터 조회 실패');
  const result = await response.json();
  return result.data || [];
}

export async function createProject(project: Omit<Project, 'id'>): Promise<number> {
  const response = await fetch(PROJECTS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!response.ok) throw new Error('프로젝트 추가 실패');
  const result = await response.json();
  return result.id;
}

export async function updateProject(id: number, updates: Partial<Project>): Promise<void> {
  const response = await fetch(PROJECTS_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!response.ok) throw new Error('프로젝트 수정 실패');
}

export async function deleteProject(id: number): Promise<void> {
  const response = await fetch(PROJECTS_ENDPOINT, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error('프로젝트 삭제 실패');
}

export async function fetchLaborRates(): Promise<LaborRate[]> {
  const response = await fetch(LABOR_RATES_ENDPOINT);
  if (!response.ok) throw new Error('단가표 조회 실패');
  const result = await response.json();
  return result.data || [];
}

export async function updateLaborRate(
  yearMonth: string,
  role: LaborRole,
  dailyRate: number,
  updatedBy?: string,
): Promise<void> {
  // PHP API: POST + ON DUPLICATE KEY UPDATE (멱등)
  const response = await fetch(LABOR_RATES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yearMonth, role, dailyRate, updatedBy: updatedBy || '' }),
  });
  if (!response.ok) throw new Error('단가 저장 실패');
}

export async function copyPrevMonthRates(
  yearMonth: string,
  updatedBy?: string,
): Promise<{ copied: number; from: string; to: string }> {
  const response = await fetch(LABOR_RATES_ENDPOINT + '?action=copy_prev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yearMonth, updatedBy: updatedBy || '' }),
  });
  if (!response.ok) throw new Error('전월 단가 복사 실패');
  const result = await response.json();
  return { copied: result.copied || 0, from: result.from || '', to: result.to || yearMonth };
}

// ============================================================
// 포맷 헬퍼
// ============================================================
function formatKRW(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '억';
  if (n >= 10000) return (n / 10000).toFixed(0) + '만';
  return n.toLocaleString();
}

function formatPct(fraction: number): string {
  return (fraction * 100).toFixed(1) + '%';
}

function ratioColorClass(fraction: number): string {
  if (fraction >= 0.3) return 'text-teal-700';
  if (fraction >= 0.1) return 'text-amber-600';
  if (fraction >= 0) return 'text-orange-600';
  return 'text-red-600';
}

// ============================================================
// Props
// ============================================================
interface ProfitPageProps {
  externalProjectsState?: [
    Project[],
    (p: Project[] | ((prev: Project[]) => Project[])) => void,
  ];
  externalLaborRatesState?: [
    LaborRate[],
    (r: LaborRate[] | ((prev: LaborRate[]) => LaborRate[])) => void,
  ];
  customers?: any[]; // 회사명/workHistory 룩업
  subcontractors?: any[]; // AI 추천용 가용 인력 풀
  onNotification?: (msg: string) => void;
}

export function ProfitPage({
  externalProjectsState,
  externalLaborRatesState,
  customers = [],
  subcontractors = [],
  onNotification,
}: ProfitPageProps = {}) {
  // ============================================================
  // 상태 — hoisting 패턴 (CustomersPage와 동일)
  // ============================================================
  const [internalProjects, setInternalProjects] = useState<Project[]>([]);
  const [internalLaborRates, setInternalLaborRates] = useState<LaborRate[]>([]);
  const projects = externalProjectsState ? externalProjectsState[0] : internalProjects;
  const setProjects = externalProjectsState ? externalProjectsState[1] : setInternalProjects;
  const laborRates = externalLaborRatesState ? externalLaborRatesState[0] : internalLaborRates;
  const setLaborRates = externalLaborRatesState ? externalLaborRatesState[1] : setInternalLaborRates;

  const [activeTab, setActiveTab] = useState<'in-progress' | 'completed'>('in-progress');
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [profitFilter, setProfitFilter] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const currentYearMonth = new Date().toISOString().slice(0, 7);
  const updatedBy = (typeof window !== 'undefined' && localStorage.getItem('user_name')) || '';

  // ============================================================
  // 데이터 로드
  // ============================================================
  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchProjects(), fetchLaborRates()])
      .then(([proj, rates]) => {
        if (!externalProjectsState) setInternalProjects(proj);
        if (!externalLaborRatesState) setInternalLaborRates(rates);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('손익관리 데이터 로드 실패:', err);
        onNotification?.('데이터 로드 실패 — 새로고침 후 다시 시도해주세요');
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ============================================================
  // 핸들러
  // ============================================================

  // 1. 프로젝트 부분 저장 — 낙관적 UI 업데이트 + 서버 응답 후 refetch (파생지표 동기화)
  const handleUpdateProject = async (id: number, updates: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    try {
      await updateProject(id, updates);
      const refreshed = await fetchProjects();
      setProjects(refreshed);
      onNotification?.('프로젝트가 저장되었습니다');
    } catch (err) {
      console.error('프로젝트 저장 실패:', err);
      onNotification?.('저장 실패 — 다시 시도해주세요');
    }
  };

  // 2. 수동 완료 — 서버에서 completed_at NOW() + completed_reason='manual' 자동 셋
  const handleCompleteProject = async (id: number) => {
    await handleUpdateProject(id, { status: 'completed', completedReason: 'manual' });
  };

  // 3. AI 추천 채택 — workerAssignments prefill + aiSuggestion/aiApplied 마킹
  const handleAdoptAiSuggestion = async (projectId: number, suggestion: StaffingSuggestion) => {
    await handleUpdateProject(projectId, {
      workerAssignments: suggestion.assignments,
      aiSuggestion: JSON.stringify(suggestion),
      aiApplied: true,
    });
  };

  // 4. 단가 저장
  const handleUpdateLaborRate = async (yearMonth: string, role: LaborRole, dailyRate: number) => {
    try {
      await updateLaborRate(yearMonth, role, dailyRate, updatedBy);
      const refreshed = await fetchLaborRates();
      setLaborRates(refreshed);
      onNotification?.(`${yearMonth} ${role} 단가 ${dailyRate.toLocaleString()}원 저장`);
    } catch (err) {
      console.error('단가 저장 실패:', err);
      onNotification?.('단가 저장 실패');
    }
  };

  // 5. 전월 단가 복사
  const handleCopyPrevRates = async (yearMonth: string) => {
    try {
      const result = await copyPrevMonthRates(yearMonth, updatedBy);
      const refreshed = await fetchLaborRates();
      setLaborRates(refreshed);
      if (result.copied > 0) {
        onNotification?.(`${result.from} 단가 ${result.copied}건을 ${yearMonth}로 복사`);
      } else {
        onNotification?.(`복사할 직전 월 단가가 없습니다 (조회: ${result.from})`);
      }
    } catch (err) {
      console.error('전월 단가 복사 실패:', err);
      onNotification?.('전월 단가 복사 실패');
    }
  };

  // 6. 수동 추가 — 영업관리에서 수주확정한 딜만 자동 등록되므로 안내만
  const handleAddManualProject = () => {
    onNotification?.('수동 추가는 미지원 — 영업관리에서 수주확정한 딜만 자동 등록됩니다');
  };

  // 7. Excel 다운로드
  const handleExport = () => {
    const data = filteredProjects.map((p) => {
      const base: Record<string, any> = {
        작업일자: p.workDate || '-',
        기업명: getCustomerName(p.customerId),
        서비스: p.serviceType,
        팀장: p.workerAssignments?.lead || 0,
        팀원: p.workerAssignments?.member || 0,
        보조: p.workerAssignments?.support || 0,
        작업일수: p.workerAssignments?.days || 0,
        견적금액: p.quotationAmount,
        세액: p.taxAmount,
        순매출: p.netRevenue,
        인건비: p.laborCost,
        '매출대비인건비(%)': (p.laborCostRatio * 100).toFixed(1),
        식비: p.mealCost,
        교통비: p.transportCost,
        기타: p.otherCost,
        비용합: p.totalCost,
        순이익: p.netProfit,
        '순익률(%)': (p.profitRatio * 100).toFixed(1),
        AI채택: p.aiApplied ? 'Y' : 'N',
      };
      if (activeTab === 'completed') {
        base['완료일자'] = p.completedAt?.substring(0, 10) || '-';
        base['완료사유'] = p.completedReason === 'report_sent' ? '리포트전송' : p.completedReason === 'manual' ? '수동' : '-';
      }
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '손익관리');
    const tabLabel = activeTab === 'in-progress' ? '진행중' : '완료';
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `손익관리_${tabLabel}_${date}.xlsx`);
    onNotification?.(`Excel 다운로드 — ${data.length}건`);
  };

  // ============================================================
  // 룩업 헬퍼 (customer/subcontractor 데이터)
  // ============================================================
  const getCustomerName = (customerId: number | null): string => {
    if (!customerId) return '—';
    const c = customers.find((c: any) => c.id === customerId);
    return c?.company || '—';
  };

  const getProjectTotalQuantity = (project: Project): number => {
    if (!project.workHistoryDealId || !project.customerId) return 0;
    const customer = customers.find((c: any) => c.id === project.customerId);
    if (!customer?.workHistory) return 0;
    const entry = customer.workHistory.find((w: any) => w.dealId === project.workHistoryDealId);
    return entry?.totalQuantity || 0;
  };

  const getProjectDetailedQuantity = (project: Project): string | undefined => {
    if (!project.workHistoryDealId || !project.customerId) return undefined;
    const customer = customers.find((c: any) => c.id === project.customerId);
    if (!customer?.workHistory) return undefined;
    const entry = customer.workHistory.find((w: any) => w.dealId === project.workHistoryDealId);
    return entry?.detailedQuantity || undefined;
  };

  // 유사 프로젝트: 같은 service + 완료 + 자기 제외 (최대 5건)
  const getSimilarProjects = (project: Project): SimilarProjectRef[] => {
    return projects
      .filter(
        (p) =>
          p.serviceType === project.serviceType &&
          p.status === 'completed' &&
          p.id !== project.id &&
          p.workerAssignments,
      )
      .slice(0, 5)
      .map((p) => ({
        serviceType: p.serviceType,
        totalQuantity: getProjectTotalQuantity(p),
        workerAssignments: p.workerAssignments!,
        profitRatio: p.profitRatio,
      }));
  };

  // 가용 작업팀장 — SupplyChainPage subcontractors prop 가공
  const availableSubs: AvailableSubcontractor[] = subcontractors.map((s: any) => ({
    name: s.name || '',
    grade: (s.grade as 'S' | 'A' | 'B' | 'C') || 'B',
    cooperationScore: Number(s.cooperationScore) || 0,
    ongoingProjects: Number(s.ongoingProjects) || 0,
  }));

  // ============================================================
  // 파생 데이터 — KPI / 필터
  // ============================================================
  const inProgressProjects = projects.filter((p) => p.status === 'in-progress');
  const completedProjects = projects.filter((p) => p.status === 'completed');

  // KPI는 현재 탭 기준
  const tabProjects = activeTab === 'in-progress' ? inProgressProjects : completedProjects;
  const tabRevenue = tabProjects.reduce((s, p) => s + p.netRevenue, 0);
  const tabProfit = tabProjects.reduce((s, p) => s + p.netProfit, 0);
  const tabAvgRatio =
    tabProjects.length > 0
      ? tabProjects.reduce((s, p) => s + p.profitRatio, 0) / tabProjects.length
      : 0;
  const tabAiAdopted = tabProjects.filter((p) => p.aiApplied).length;
  const tabAiAdoptionRate = tabProjects.length > 0 ? tabAiAdopted / tabProjects.length : 0;

  // 서비스 목록 — 필터 select 옵션
  const serviceOptions = Array.from(
    new Set(projects.map((p) => p.serviceType).filter(Boolean)),
  );

  // 필터링
  const filteredProjects = tabProjects.filter((p) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const company = getCustomerName(p.customerId).toLowerCase();
      const name = (p.projectName || '').toLowerCase();
      if (!company.includes(term) && !name.includes(term)) return false;
    }
    if (serviceFilter !== 'all' && p.serviceType !== serviceFilter) return false;
    if (dateFilter.start && (p.workDate || '') < dateFilter.start) return false;
    if (dateFilter.end && (p.workDate || '') > dateFilter.end) return false;
    const minP = parseFloat(profitFilter.min);
    const maxP = parseFloat(profitFilter.max);
    if (!isNaN(minP) && p.profitRatio * 100 < minP) return false;
    if (!isNaN(maxP) && p.profitRatio * 100 > maxP) return false;
    return true;
  });

  // ============================================================
  // 렌더
  // ============================================================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">프로젝트 관리</h1>
          <p className="text-sm text-slate-500 mt-1">수주확정 딜의 인력 배치·비용·순이익 추적</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={handleAddManualProject}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            수동 추가
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setActiveTab('in-progress');
            setExpandedRowId(null);
          }}
          className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
            activeTab === 'in-progress'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          진행중 ({inProgressProjects.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('completed');
            setExpandedRowId(null);
          }}
          className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
            activeTab === 'completed'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          완료 ({completedProjects.length})
        </button>
      </div>

      {/* 진행중 탭: 단가표 카드 */}
      {activeTab === 'in-progress' && (
        <div className="mb-4">
          <LaborRateCard
            laborRates={laborRates}
            currentYearMonth={currentYearMonth}
            onRateUpdate={handleUpdateLaborRate}
            onCopyPrev={handleCopyPrevRates}
            onNotification={onNotification}
          />
        </div>
      )}

      {/* KPI 5장 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiCard
          icon={<Briefcase className="w-4 h-4" />}
          label={activeTab === 'in-progress' ? '진행중 프로젝트' : '완료 프로젝트'}
          value={`${tabProjects.length}건`}
          accent="teal"
        />
        <KpiCard
          icon={<DollarSign className="w-4 h-4" />}
          label="누적 순매출"
          value={`${formatKRW(tabRevenue)}원`}
          accent="slate"
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="누적 순이익"
          value={`${formatKRW(tabProfit)}원`}
          accent={tabProfit >= 0 ? 'teal' : 'red'}
        />
        <KpiCard
          icon={<Percent className="w-4 h-4" />}
          label="평균 순익률"
          value={formatPct(tabAvgRatio)}
          accent={tabAvgRatio >= 0.2 ? 'teal' : tabAvgRatio >= 0 ? 'amber' : 'red'}
        />
        <KpiCard
          icon={<Sparkles className="w-4 h-4" />}
          label="AI 채택률"
          value={`${tabAiAdopted}건 (${formatPct(tabAiAdoptionRate)})`}
          accent="slate"
        />
      </div>

      {/* 검색·필터 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="기업명 또는 프로젝트명 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
          >
            <option value="all">전체 서비스</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            상세 필터
            {showFilters ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">작업일 시작</label>
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, start: e.target.value }))}
                className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">작업일 끝</label>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, end: e.target.value }))}
                className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">순익률 최소(%)</label>
              <input
                type="number"
                placeholder="예: 10"
                value={profitFilter.min}
                onChange={(e) => setProfitFilter((prev) => ({ ...prev, min: e.target.value }))}
                className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">순익률 최대(%)</label>
              <input
                type="number"
                placeholder="예: 50"
                value={profitFilter.max}
                onChange={(e) => setProfitFilter((prev) => ({ ...prev, max: e.target.value }))}
                className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>
        )}
        <div className="text-[11px] text-slate-500">조회 결과: {filteredProjects.length}건</div>
      </div>

      {/* 테이블 / 모바일 카드 */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-3 text-[13px] text-slate-500">조건에 맞는 프로젝트가 없습니다</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {filteredProjects.map((p) => (
            <ProjectMobileCard
              key={p.id}
              project={p}
              companyName={getCustomerName(p.customerId)}
              isCompleted={activeTab === 'completed'}
              isExpanded={expandedRowId === p.id}
              onToggleExpand={() => setExpandedRowId(expandedRowId === p.id ? null : p.id)}
              laborRates={laborRates}
              similarProjects={getSimilarProjects(p)}
              availableSubcontractors={availableSubs}
              totalQuantity={getProjectTotalQuantity(p)}
              detailedQuantity={getProjectDetailedQuantity(p)}
              onSave={(updates) => handleUpdateProject(p.id, updates)}
              onComplete={() => handleCompleteProject(p.id)}
              onAiAdopted={(s) => handleAdoptAiSuggestion(p.id, s)}
              onNotification={onNotification}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-600 font-medium">
                  <th className="px-3 py-3">작업일자</th>
                  <th className="px-3 py-3">기업명</th>
                  <th className="px-3 py-3">서비스</th>
                  <th className="px-3 py-3 text-right">순매출</th>
                  <th className="px-3 py-3 text-right">인건비</th>
                  <th className="px-3 py-3 text-right">매출대비 인건비</th>
                  <th className="px-3 py-3 text-right">순이익</th>
                  <th className="px-3 py-3 text-right">순익률</th>
                  {activeTab === 'completed' && (
                    <>
                      <th className="px-3 py-3">완료일자</th>
                      <th className="px-3 py-3">완료사유</th>
                    </>
                  )}
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => {
                  const colCount = activeTab === 'completed' ? 11 : 9;
                  return (
                    <ProjectTableRow
                      key={p.id}
                      project={p}
                      companyName={getCustomerName(p.customerId)}
                      isCompleted={activeTab === 'completed'}
                      isExpanded={expandedRowId === p.id}
                      onToggleExpand={() =>
                        setExpandedRowId(expandedRowId === p.id ? null : p.id)
                      }
                      laborRates={laborRates}
                      similarProjects={getSimilarProjects(p)}
                      availableSubcontractors={availableSubs}
                      totalQuantity={getProjectTotalQuantity(p)}
                      detailedQuantity={getProjectDetailedQuantity(p)}
                      colCount={colCount}
                      onSave={(updates) => handleUpdateProject(p.id, updates)}
                      onComplete={() => handleCompleteProject(p.id)}
                      onAiAdopted={(s) => handleAdoptAiSuggestion(p.id, s)}
                      onNotification={onNotification}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 보조 컴포넌트 — KPI 카드
// ============================================================
function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'teal' | 'slate' | 'amber' | 'red';
}) {
  const accentBg: Record<typeof accent, string> = {
    teal: 'bg-teal-100 text-teal-700',
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  } as Record<typeof accent, string>;
  const valueColor: Record<typeof accent, string> = {
    teal: 'text-teal-700',
    slate: 'text-slate-900',
    amber: 'text-amber-700',
    red: 'text-red-700',
  } as Record<typeof accent, string>;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${accentBg[accent]}`}>{icon}</div>
        <p className="text-[11px] text-slate-500">{label}</p>
      </div>
      <p className={`text-[16px] md:text-[18px] font-bold ${valueColor[accent]}`}>{value}</p>
    </div>
  );
}

// ============================================================
// 테이블 행 (데스크톱)
// ============================================================
interface RowProps {
  project: Project;
  companyName: string;
  isCompleted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  laborRates: LaborRate[];
  similarProjects: SimilarProjectRef[];
  availableSubcontractors: AvailableSubcontractor[];
  totalQuantity: number;
  detailedQuantity?: string;
  colCount: number;
  onSave: (updates: Partial<Project>) => void;
  onComplete: () => void;
  onAiAdopted: (suggestion: StaffingSuggestion) => void;
  onNotification?: (msg: string) => void;
}

function ProjectTableRow({
  project: p,
  companyName,
  isCompleted,
  isExpanded,
  onToggleExpand,
  laborRates,
  similarProjects,
  availableSubcontractors,
  totalQuantity,
  detailedQuantity,
  colCount,
  onSave,
  onComplete,
  onAiAdopted,
  onNotification,
}: RowProps) {
  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-teal-50/30 transition-colors cursor-pointer ${
          isExpanded ? 'bg-teal-50/50' : ''
        }`}
        onClick={onToggleExpand}
      >
        <td className="px-3 py-3 text-slate-700">{p.workDate || '-'}</td>
        <td className="px-3 py-3 font-medium text-slate-900">{companyName}</td>
        <td className="px-3 py-3 text-slate-700">{p.serviceType || '-'}</td>
        <td className="px-3 py-3 text-right text-slate-700">{formatKRW(p.netRevenue)}원</td>
        <td className="px-3 py-3 text-right text-slate-700">{formatKRW(p.laborCost)}원</td>
        <td className="px-3 py-3 text-right text-slate-600">{formatPct(p.laborCostRatio)}</td>
        <td
          className={`px-3 py-3 text-right font-medium ${
            p.netProfit >= 0 ? 'text-slate-900' : 'text-red-600'
          }`}
        >
          {formatKRW(p.netProfit)}원
        </td>
        <td className={`px-3 py-3 text-right font-semibold ${ratioColorClass(p.profitRatio)}`}>
          {formatPct(p.profitRatio)}
          {p.aiApplied && <Sparkles className="inline w-3 h-3 ml-1 text-teal-500" />}
        </td>
        {isCompleted && (
          <>
            <td className="px-3 py-3 text-slate-600">{p.completedAt?.substring(0, 10) || '-'}</td>
            <td className="px-3 py-3 text-slate-600">
              {p.completedReason === 'report_sent' ? (
                <span className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                  <CheckCircle2 className="w-3 h-3" />
                  리포트전송
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">수동</span>
              )}
            </td>
          </>
        )}
        <td className="px-3 py-3 text-right">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400 inline" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 inline" />
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={colCount} className="p-0">
            <ProjectRowExpand
              project={p}
              laborRates={laborRates}
              similarProjects={similarProjects}
              availableSubcontractors={availableSubcontractors}
              totalQuantity={totalQuantity}
              detailedQuantity={detailedQuantity}
              onSave={onSave}
              onComplete={onComplete}
              onAiAdopted={onAiAdopted}
              onNotification={onNotification}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// 모바일 카드
// ============================================================
function ProjectMobileCard({
  project: p,
  companyName,
  isCompleted,
  isExpanded,
  onToggleExpand,
  laborRates,
  similarProjects,
  availableSubcontractors,
  totalQuantity,
  detailedQuantity,
  onSave,
  onComplete,
  onAiAdopted,
  onNotification,
}: Omit<RowProps, 'colCount'>) {
  return (
    <div
      className={`bg-white rounded-xl border ${
        isExpanded ? 'border-teal-300' : 'border-slate-200'
      } overflow-hidden`}
    >
      <button onClick={onToggleExpand} className="w-full p-4 text-left hover:bg-teal-50/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-slate-900 truncate">{companyName}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {p.serviceType || '-'} · {p.workDate || '-'}
            </p>
          </div>
          {p.aiApplied && (
            <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">
              <Sparkles className="w-3 h-3" />
              AI
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div>
            <p className="text-[10px] text-slate-500">순매출</p>
            <p className="text-[13px] font-medium text-slate-900 mt-0.5">
              {formatKRW(p.netRevenue)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">순이익</p>
            <p
              className={`text-[13px] font-medium mt-0.5 ${
                p.netProfit >= 0 ? 'text-slate-900' : 'text-red-600'
              }`}
            >
              {formatKRW(p.netProfit)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">순익률</p>
            <p className={`text-[13px] font-semibold mt-0.5 ${ratioColorClass(p.profitRatio)}`}>
              {formatPct(p.profitRatio)}
            </p>
          </div>
        </div>
        {isCompleted && (
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500">
            완료 {p.completedAt?.substring(0, 10) || '-'} ·{' '}
            {p.completedReason === 'report_sent' ? '리포트전송' : '수동'}
          </div>
        )}
      </button>
      {isExpanded && (
        <ProjectRowExpand
          project={p}
          laborRates={laborRates}
          similarProjects={similarProjects}
          availableSubcontractors={availableSubcontractors}
          totalQuantity={totalQuantity}
          detailedQuantity={detailedQuantity}
          onSave={onSave}
          onComplete={onComplete}
          onAiAdopted={onAiAdopted}
          onNotification={onNotification}
        />
      )}
    </div>
  );
}
