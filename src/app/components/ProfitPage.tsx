// 손익 관리 (프로젝트 관리) 페이지
// SalesPage/CustomersPage 디자인 패턴 채택: p-4 md:p-8 space-y-, KPI 32px, uppercase 헤더, blue 강조

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Calendar,
  Building2,
  Package,
  Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { LaborRateCard, type LaborRate, type LaborRole } from './LaborRateCard';
import { ProjectRowExpand, type ExtraLaborEntry } from './ProjectRowExpand';
import { suggestProjectStaffing, type StaffingSuggestion } from '../../lib/gemini';
import {
  computeLearningStats,
  type ProjectForLearning,
} from '../../lib/staffing-learning';
import { ROLE_ORDER, ROLE_LABELS, type RoleAssignments, type RoleCode } from '../../lib/roles';

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
  workerAssignments:
    | (RoleAssignments & { days: number; extras?: ExtraLaborEntry[] })
    | null;
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
  // Phase 1.7 — AI 자동 추천 상태 컬럼 (마이그레이션 005)
  aiStatus?: 'pending' | 'generating' | 'success' | 'failed' | 'manual';
  aiAttemptedAt?: string;
  aiError?: string;
  aiInfluence?: 'high' | 'medium' | 'low' | 'none' | '';
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
function formatAmount(amount: number): string {
  return amount.toLocaleString('ko-KR');
}

function formatKRWShort(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '억';
  if (n >= 10000) return (n / 10000).toFixed(0) + '만';
  return n.toLocaleString();
}

function formatPct(fraction: number): string {
  return (fraction * 100).toFixed(1) + '%';
}

// 순익률 4단계 색상 — 30%↑ emerald / 10~30% teal / 0~10% amber / 적자 red
function profitRatioColor(ratio: number): string {
  if (ratio >= 0.30) return 'text-emerald-600';
  if (ratio >= 0.10) return 'text-teal-600';
  if (ratio >= 0)    return 'text-amber-600';
  return 'text-red-600';
}

// 인건비 0이거나 인력배치 미입력이면 결과 수치는 의미 없음 → 슬레이트 톤다운
function shouldDimResult(project: Project): boolean {
  return (project.laborCost ?? 0) === 0 || !project.workerAssignments;
}

// 셀에서 사용 — dim일 때 슬레이트로 덮음
function ratioColorClass(project: Project): string {
  if (shouldDimResult(project)) return 'text-slate-400';
  return profitRatioColor(project.profitRatio);
}

// ============================================================
// 단가 캐스케이드 — yearMonth 정확 매칭 → 12개월 이내 직전월 → 0
// LaborRateCard.resolveRate 와 동일 로직 (Step 4 AI 자동 호출용)
// ============================================================
function resolveCurrentRates(
  laborRates: LaborRate[],
  yearMonth: string,
): Record<RoleCode, number> {
  const result = {} as Record<RoleCode, number>;
  for (const role of ROLE_ORDER) {
    const exact = laborRates.find(
      (r) => r.yearMonth === yearMonth && r.role === role,
    );
    if (exact) {
      result[role] = exact.dailyRate;
      continue;
    }
    const fallback = laborRates
      .filter((r) => r.role === role && r.yearMonth < yearMonth)
      .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))[0];
    result[role] = fallback?.dailyRate || 0;
  }
  return result;
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
  customers?: any[];
  subcontractors?: any[];
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
        console.error('프로젝트 관리 데이터 로드 실패:', err);
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

  const handleCompleteProject = async (id: number) => {
    await handleUpdateProject(id, { status: 'completed', completedReason: 'manual' });
  };

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

  const handleAddManualProject = () => {
    onNotification?.('수동 추가는 미지원 — 영업관리에서 수주확정한 딜만 자동 등록됩니다');
  };

  const handleExport = () => {
    const data = filteredProjects.map((p) => {
      const base: Record<string, any> = {
        작업일자: p.workDate || '-',
        기업명: getCustomerName(p.customerId),
        서비스: p.serviceType,
      };
      // 5개 역할 (ROLE_ORDER 기준, 한글 라벨로 컬럼명)
      for (const role of ROLE_ORDER) {
        base[ROLE_LABELS[role]] = p.workerAssignments?.[role] ?? 0;
      }
      base['작업일수'] = p.workerAssignments?.days ?? 0;
      base['견적금액'] = p.quotationAmount;
      base['세액'] = p.taxAmount;
      base['순매출'] = p.netRevenue;
      base['인건비'] = p.laborCost;
      base['매출대비인건비(%)'] = (p.laborCostRatio * 100).toFixed(1);
      base['식비'] = p.mealCost;
      base['교통비'] = p.transportCost;
      base['기타'] = p.otherCost;
      base['비용합'] = p.totalCost;
      base['순이익'] = p.netProfit;
      base['순익률(%)'] = (p.profitRatio * 100).toFixed(1);
      base['AI채택'] = p.aiApplied ? 'Y' : 'N';
      if (activeTab === 'completed') {
        base['완료일자'] = p.completedAt?.substring(0, 10) || '-';
        base['완료사유'] = p.completedReason === 'report_sent' ? '리포트전송' : p.completedReason === 'manual' ? '수동' : '-';
      }
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '프로젝트관리');
    const tabLabel = activeTab === 'in-progress' ? '진행중' : '완료';
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `프로젝트관리_${tabLabel}_${date}.xlsx`);
    onNotification?.(`Excel 다운로드 — ${data.length}건`);
  };

  // ============================================================
  // 룩업 헬퍼
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

  const getProjectInquiryDate = (project: Project): string | undefined => {
    if (!project.workHistoryDealId || !project.customerId) return undefined;
    const customer = customers.find((c: any) => c.id === project.customerId);
    if (!customer?.workHistory) return undefined;
    const entry = customer.workHistory.find((w: any) => w.dealId === project.workHistoryDealId);
    return entry?.inquiryDate || undefined;
  };

  // ============================================================
  // Phase 1.7 / Step 4 — AI 자동 호출 매니저
  //   - 영업확정으로 status=in-progress, ai_status=pending 인 프로젝트 자동 탐지
  //   - 큐에 적재 → MAX_PARALLEL_AI_CALLS 동시 처리 → 결과 저장
  //   - failed 는 사용자 수동 재시도(handleReRunAi)만 허용 (자동 재시도 금지)
  // ============================================================
  const MAX_PARALLEL_AI_CALLS = 3;
  const AI_CALL_TIMEOUT_MS = 30000;

  const [aiQueue, setAiQueue] = useState<{
    processing: Set<number>;
    pending: number[];
  }>({ processing: new Set<number>(), pending: [] });

  // processNext 는 useCallback([]) 라 첫 렌더 클로저를 갖는다.
  // runAiSuggestionForProject 는 매 렌더마다 새로 정의되어 latest projects/laborRates/subcontractors 를 캡처.
  // 둘을 연결하기 위해 ref 로 latest runner 를 동기화.
  const runAiRef = useRef<((id: number) => Promise<void>) | null>(null);

  /**
   * 자동 호출 대상 식별:
   *   - status='in-progress' AND ai_status='pending'
   *   - ai_status 없는 옛 행 폴백: workerAssignments 비어있고 !aiApplied
   */
  const findPendingAiProjects = useCallback((): number[] => {
    return projects
      .filter((p) => {
        if (p.status !== 'in-progress') return false;
        if (p.aiStatus === 'pending') return true;
        if (
          p.aiStatus === 'success' ||
          p.aiStatus === 'manual' ||
          p.aiStatus === 'generating' ||
          p.aiStatus === 'failed'
        ) {
          return false;
        }
        // ai_status 컬럼 없는 옛 행 폴백
        const wa = p.workerAssignments;
        let hasAssignments = false;
        if (wa && typeof wa === 'object') {
          for (const r of ROLE_ORDER) {
            if (((wa as Record<string, unknown>)[r] as number) > 0) {
              hasAssignments = true;
              break;
            }
          }
        }
        return !hasAssignments && !p.aiApplied;
      })
      .map((p) => p.id);
  }, [projects]);

  const enqueuePendingAi = useCallback(() => {
    const pending = findPendingAiProjects();
    if (pending.length === 0) return;
    setAiQueue((prev) => {
      const existing = new Set<number>([...prev.pending, ...prev.processing]);
      const newPending = pending.filter((id) => !existing.has(id));
      if (newPending.length === 0) return prev;
      return { ...prev, pending: [...prev.pending, ...newPending] };
    });
  }, [findPendingAiProjects]);

  const releaseAiSlot = useCallback((projectId: number) => {
    setAiQueue((prev) => {
      if (!prev.processing.has(projectId)) return prev;
      const np = new Set(prev.processing);
      np.delete(projectId);
      return { ...prev, processing: np };
    });
  }, []);

  // 단일 프로젝트 AI 호출 실행 — 매 렌더 재정의 (latest 캡처).
  // - useCallback 미적용: deps 추적 비용 > re-create 비용. ref 로 latest 연결.
  const runAiSuggestionForProject = async (projectId: number): Promise<void> => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      releaseAiSlot(projectId);
      return;
    }

    try {
      // 1) 락 — ai_status='generating' (낙관적 + PUT)
      await updateProject(projectId, { aiStatus: 'generating' });

      // 2) 학습 통계 — 완료 프로젝트를 totalQuantity enrich 후 전달
      const totalQuantity = getProjectTotalQuantity(project);
      const detailedQuantity = getProjectDetailedQuantity(project);

      const completedEnriched: ProjectForLearning[] = projects
        .filter((p) => p.status === 'completed')
        .map((p) => ({ ...p, totalQuantity: getProjectTotalQuantity(p) }));

      const learningStats = computeLearningStats(
        completedEnriched,
        project.serviceType,
        totalQuantity,
      );

      // 3) 단가 조회 (workDate 기준 월, 없으면 현재 월)
      const ym = (project.workDate || new Date().toISOString()).substring(0, 7);
      const rates = resolveCurrentRates(laborRates, ym);

      // 4) Gemini 호출 — 30초 타임아웃 race
      const suggestion = await Promise.race<StaffingSuggestion>([
        suggestProjectStaffing({
          service: project.serviceType,
          totalQuantity,
          detailedQuantity,
          netRevenue: project.netRevenue,
          laborRates: rates,
          learningStats,
          availableSubcontractors: (subcontractors || [])
            .filter((s: any) => s.status === 'available')
            .slice(0, 10)
            .map((s: any) => ({
              name: s.name,
              grade: s.grade,
              cooperationScore: s.cooperationScore || 0,
              ongoingProjects: s.ongoingProjects || 0,
            })),
          targetProfitRatio: 0.40,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('AI 호출 타임아웃 (30초)')),
            AI_CALL_TIMEOUT_MS,
          ),
        ),
      ]);

      // 5) 결과 저장 — 자동 생성이지 사용자 채택 아님 (aiApplied=false)
      await updateProject(projectId, {
        workerAssignments: suggestion.assignments,
        aiSuggestion: JSON.stringify(suggestion),
        aiApplied: false,
        aiStatus: 'success',
        aiAttemptedAt: new Date().toISOString().substring(0, 19).replace('T', ' '),
        aiInfluence: suggestion.learningInfluence || 'none',
      });

      onNotification?.(
        `[${project.projectName || project.serviceType}] AI 인력 초안 생성 완료`,
      );
    } catch (error: any) {
      console.error(`[AI ${projectId}] 호출 실패:`, error);
      try {
        await updateProject(projectId, {
          aiStatus: 'failed',
          aiError: (error?.message || '알 수 없는 오류').substring(0, 500),
          aiAttemptedAt: new Date().toISOString().substring(0, 19).replace('T', ' '),
        });
      } catch {
        // updateProject 자체 실패 시 무시 — 다음 fetchProjects 에서 회복
      }
    } finally {
      releaseAiSlot(projectId);
      try {
        const refreshed = await fetchProjects();
        setProjects(refreshed);
      } catch {
        // 새 fetch 실패는 다음 useEffect 회복에 위임
      }
    }
  };

  // 매 렌더 후 runAiRef 갱신 — processNext 의 stale closure 방지
  useEffect(() => {
    runAiRef.current = runAiSuggestionForProject;
  });

  /**
   * 큐 처리 — 빈 슬롯이 있으면 다음 작업 시작.
   * setState 콜백 안의 사이드이펙트는 queueMicrotask 로 분리 (React 18 안전).
   */
  const processNext = useCallback(() => {
    setAiQueue((prev) => {
      const slotsAvailable = MAX_PARALLEL_AI_CALLS - prev.processing.size;
      if (slotsAvailable <= 0 || prev.pending.length === 0) return prev;

      const toStart = prev.pending.slice(0, slotsAvailable);
      const remaining = prev.pending.slice(slotsAvailable);

      const run = runAiRef.current;
      if (run) {
        queueMicrotask(() => {
          for (const id of toStart) {
            run(id).catch(() => {});
          }
        });
      }

      return {
        processing: new Set<number>([...prev.processing, ...toStart]),
        pending: remaining,
      };
    });
  }, []);

  /**
   * 사용자 수동 재시도 — ProjectRowExpand의 [AI 다시 추천] 버튼이 호출.
   * failed 상태 → pending 으로 리셋 → useEffect 가 큐로 재진입.
   */
  const handleReRunAi = useCallback(
    (projectId: number) => {
      updateProject(projectId, { aiStatus: 'pending', aiError: '' })
        .then(() => fetchProjects())
        .then((refreshed) => setProjects(refreshed))
        .catch((err) => {
          console.error(err);
          onNotification?.('AI 재시도 요청 실패');
        });
    },
    [onNotification, setProjects],
  );

  // projects 변경 시 새 pending 발견 → 큐 적재
  useEffect(() => {
    enqueuePendingAi();
  }, [projects, enqueuePendingAi]);

  // 큐 변경 시 슬롯 가용하면 다음 처리 트리거
  useEffect(() => {
    if (
      aiQueue.pending.length > 0 &&
      aiQueue.processing.size < MAX_PARALLEL_AI_CALLS
    ) {
      processNext();
    }
  }, [aiQueue.pending, aiQueue.processing, processNext]);

  // ============================================================
  // 파생 데이터 — KPI / 필터
  // ============================================================
  const inProgressProjects = projects.filter((p) => p.status === 'in-progress');
  const completedProjects = projects.filter((p) => p.status === 'completed');

  const tabProjects = activeTab === 'in-progress' ? inProgressProjects : completedProjects;
  const tabRevenue = tabProjects.reduce((s, p) => s + p.netRevenue, 0);
  const tabProfit = tabProjects.reduce((s, p) => s + p.netProfit, 0);
  const tabAvgRatio =
    tabProjects.length > 0
      ? tabProjects.reduce((s, p) => s + p.profitRatio, 0) / tabProjects.length
      : 0;
  const tabAiAdopted = tabProjects.filter((p) => p.aiApplied).length;
  const tabAiAdoptionRate = tabProjects.length > 0 ? tabAiAdopted / tabProjects.length : 0;

  const serviceOptions = Array.from(
    new Set(projects.map((p) => p.serviceType).filter(Boolean)),
  );

  const activeFiltersCount =
    (serviceFilter !== 'all' ? 1 : 0) +
    (dateFilter.start ? 1 : 0) +
    (dateFilter.end ? 1 : 0) +
    (profitFilter.min ? 1 : 0) +
    (profitFilter.max ? 1 : 0);

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
        <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">프로젝트 관리</h1>
          <p className="text-[15px] text-slate-500 mt-1.5">
            {filteredProjects.length}건의 프로젝트 — 수주확정 딜의 인력 배치·비용·순이익 추적
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-white text-green-700 border border-green-300 rounded-xl hover:bg-green-50 transition-all shadow-sm hover:shadow flex items-center gap-2"
          >
            <Download className="w-[18px] h-[18px]" />
            <span className="text-[14px] font-semibold">내보내기</span>
          </button>
          <button
            onClick={handleAddManualProject}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow flex items-center gap-2"
          >
            <Plus className="w-[18px] h-[18px]" />
            <span className="text-[14px] font-semibold">수동 추가</span>
          </button>
        </div>
      </div>

      {/* Tab Filter Buttons (CustomersPage 등급 필터 패턴) */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => {
            setActiveTab('in-progress');
            setExpandedRowId(null);
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'in-progress'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          진행중 ({inProgressProjects.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('completed');
            setExpandedRowId(null);
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'completed'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          완료 ({completedProjects.length})
        </button>
      </div>

      {/* KPI Cards — SalesPage/CustomersPage 동일 패턴 (p-6, 32px value, icon tile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">
                {activeTab === 'in-progress' ? '진행중 프로젝트' : '완료 프로젝트'}
              </p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">
                {tabProjects.length}
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl">
              <Briefcase className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">누적 순매출</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">
                ₩{formatKRWShort(tabRevenue)}
              </p>
            </div>
            <div className="p-3 bg-cyan-50 rounded-xl">
              <DollarSign className="w-6 h-6 text-cyan-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">누적 순이익</p>
              <p
                className={`text-[32px] font-bold mt-2 tracking-tight ${
                  tabProfit >= 0 ? 'text-slate-900' : 'text-red-700'
                }`}
              >
                ₩{formatKRWShort(tabProfit)}
              </p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">평균 순익률</p>
              <p
                className={`text-[32px] font-bold mt-2 tracking-tight ${
                  tabAvgRatio >= 0.2
                    ? 'text-slate-900'
                    : tabAvgRatio >= 0
                      ? 'text-amber-700'
                      : 'text-red-700'
                }`}
              >
                {formatPct(tabAvgRatio)}
              </p>
            </div>
            <div className="p-3 bg-purple-50 rounded-xl">
              <Percent className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">AI 채택률</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">
                {formatPct(tabAiAdoptionRate)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{tabAiAdopted}건 채택</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-xl">
              <Sparkles className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* AI 자동 호출 상태 인디케이터 (큐에 작업이 있을 때만) */}
      {(aiQueue.processing.size > 0 || aiQueue.pending.length > 0) && (
        <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200
                        rounded-lg px-4 py-3 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-teal-600 animate-pulse flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-medium text-teal-700">
              AI가 인력 초안을 생성 중입니다
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              진행 중 {aiQueue.processing.size}건 · 대기 {aiQueue.pending.length}건
            </div>
          </div>
          <Loader2 className="w-4 h-4 text-teal-500 animate-spin flex-shrink-0" />
        </div>
      )}

      {/* Labor Rate Card — 진행중 탭에서만 노출 */}
      {activeTab === 'in-progress' && (
        <LaborRateCard
          laborRates={laborRates}
          currentYearMonth={currentYearMonth}
          onRateUpdate={handleUpdateLaborRate}
          onCopyPrev={handleCopyPrevRates}
          onNotification={onNotification}
        />
      )}

      {/* Search & Filter — SalesPage 패턴 */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="기업명 또는 프로젝트명으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-[14px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm ${
              activeFiltersCount > 0 ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="text-[13px] font-semibold">필터</span>
            {activeFiltersCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 서비스 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">서비스</label>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">전체 서비스</option>
                {serviceOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* 작업일 범위 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">작업일 범위</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFilter.start}
                  onChange={(e) => setDateFilter((prev) => ({ ...prev, start: e.target.value }))}
                  className="flex-1 px-2 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-slate-400 text-sm">~</span>
                <input
                  type="date"
                  value={dateFilter.end}
                  onChange={(e) => setDateFilter((prev) => ({ ...prev, end: e.target.value }))}
                  className="flex-1 px-2 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* 순익률 범위 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">순익률(%) 범위</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  value={profitFilter.min}
                  onChange={(e) => setProfitFilter((prev) => ({ ...prev, min: e.target.value }))}
                  className="flex-1 px-2 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-slate-400 text-sm">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  value={profitFilter.max}
                  onChange={(e) => setProfitFilter((prev) => ({ ...prev, max: e.target.value }))}
                  className="flex-1 px-2 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table / Mobile Cards */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-3 text-[15px] text-slate-500">조건에 맞는 프로젝트가 없습니다</p>
          <p className="text-[13px] text-slate-400 mt-2">다른 검색어나 필터를 시도해보세요.</p>
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
              totalQuantity={getProjectTotalQuantity(p)}
              detailedQuantity={getProjectDetailedQuantity(p)}
              inquiryDate={getProjectInquiryDate(p)}
              onSave={(updates) => handleUpdateProject(p.id, updates)}
              onComplete={() => handleCompleteProject(p.id)}
              onReRunAi={handleReRunAi}
              onNotification={onNotification}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    작업일자
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    기업명
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    서비스
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    견적금액
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    인건비
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    순이익
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    순익률
                  </th>
                  {activeTab === 'completed' && (
                    <>
                      <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        완료일자
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        완료사유
                      </th>
                    </>
                  )}
                  <th className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredProjects.map((p) => {
                  const colCount = activeTab === 'completed' ? 10 : 8;
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
                      totalQuantity={getProjectTotalQuantity(p)}
                      detailedQuantity={getProjectDetailedQuantity(p)}
                      inquiryDate={getProjectInquiryDate(p)}
                      colCount={colCount}
                      onSave={(updates) => handleUpdateProject(p.id, updates)}
                      onComplete={() => handleCompleteProject(p.id)}
                      onReRunAi={handleReRunAi}
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
// 테이블 행 (데스크톱) — SalesPage/CustomersPage 스타일
// ============================================================
interface RowProps {
  project: Project;
  companyName: string;
  isCompleted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  laborRates: LaborRate[];
  totalQuantity: number;
  detailedQuantity?: string;
  inquiryDate?: string;
  colCount: number;
  onSave: (updates: Partial<Project>) => void;
  onComplete: () => void;
  onReRunAi: (projectId: number) => void;
  onNotification?: (msg: string) => void;
}

function ProjectTableRow({
  project: p,
  companyName,
  isCompleted,
  isExpanded,
  onToggleExpand,
  laborRates,
  totalQuantity,
  detailedQuantity,
  inquiryDate,
  colCount,
  onSave,
  onComplete,
  onReRunAi,
  onNotification,
}: RowProps) {
  return (
    <>
      <tr
        className={`hover:bg-slate-50 transition-colors cursor-pointer ${
          isExpanded ? 'bg-blue-50/40' : ''
        }`}
        onClick={onToggleExpand}
      >
        <td className="px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" />
            {p.workDate || '-'}
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-slate-900 font-medium">
            <Building2 className="w-4 h-4 text-slate-400" />
            {companyName}
          </div>
        </td>
        <td className="px-4 py-4">
          <span className="text-sm text-slate-700">{p.serviceType || '-'}</span>
        </td>
        <td className="px-4 py-4 text-right">
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            ₩{formatAmount(p.quotationAmount)}
          </span>
        </td>
        <td className="px-4 py-4 text-right">
          <span
            className={`text-sm tabular-nums ${
              shouldDimResult(p) ? 'text-slate-400' : 'text-slate-700'
            }`}
          >
            ₩{formatAmount(p.laborCost)}
          </span>
        </td>
        <td className="px-4 py-4 text-right">
          <span
            className={`text-sm font-semibold tabular-nums ${
              shouldDimResult(p)
                ? 'text-slate-400'
                : p.netProfit >= 0
                  ? 'text-slate-900'
                  : 'text-red-600'
            }`}
          >
            ₩{formatAmount(p.netProfit)}
          </span>
        </td>
        <td className="px-4 py-4 text-right">
          <span
            className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${ratioColorClass(p)}`}
          >
            {formatPct(p.profitRatio)}
            {p.aiApplied && <Sparkles className="w-3.5 h-3.5 text-blue-500" />}
          </span>
        </td>
        {isCompleted && (
          <>
            <td className="px-4 py-4">
              <span className="text-sm text-slate-600">
                {p.completedAt?.substring(0, 10) || '-'}
              </span>
            </td>
            <td className="px-4 py-4">
              {p.completedReason === 'report_sent' ? (
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-medium border"
                  style={{
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    borderColor: '#bfdbfe',
                  }}
                >
                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                  리포트전송
                </span>
              ) : (
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-medium border"
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    borderColor: '#cbd5e1',
                  }}
                >
                  수동
                </span>
              )}
            </td>
          </>
        )}
        <td className="px-4 py-4 text-right">
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
            <div className="border-l-4 border-teal-400">
              <ProjectRowExpand
                project={p}
                laborRates={laborRates}
                totalQuantity={totalQuantity}
                detailedQuantity={detailedQuantity}
                inquiryDate={inquiryDate}
                onSave={onSave}
                onComplete={onComplete}
                onReRunAi={onReRunAi}
                onNotification={onNotification}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// 모바일 카드 — CustomersPage MobileCard 패턴 채택
// ============================================================
function ProjectMobileCard({
  project: p,
  companyName,
  isCompleted,
  isExpanded,
  onToggleExpand,
  laborRates,
  totalQuantity,
  detailedQuantity,
  inquiryDate,
  onSave,
  onComplete,
  onReRunAi,
  onNotification,
}: Omit<RowProps, 'colCount'>) {
  return (
    <div
      className={`bg-white rounded-xl border ${
        isExpanded ? 'border-blue-300 shadow-md' : 'border-slate-200 shadow-sm'
      } overflow-hidden transition-all`}
    >
      <button
        onClick={onToggleExpand}
        className="w-full p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <p className="text-[15px] font-semibold text-slate-900 truncate">{companyName}</p>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <Package className="w-3.5 h-3.5" />
              <span>{p.serviceType || '-'}</span>
              <span className="text-slate-300">·</span>
              <Calendar className="w-3.5 h-3.5" />
              <span>{p.workDate || '-'}</span>
            </div>
          </div>
          {p.aiApplied && (
            <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" />
              AI
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div>
            <p className="text-[11px] text-slate-500 font-medium">견적금액</p>
            <p className="text-[14px] font-semibold text-slate-900 mt-1 tabular-nums">
              ₩{formatKRWShort(p.quotationAmount)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">순이익</p>
            <p
              className={`text-[14px] font-semibold mt-1 tabular-nums ${
                shouldDimResult(p)
                  ? 'text-slate-400'
                  : p.netProfit >= 0
                    ? 'text-slate-900'
                    : 'text-red-600'
              }`}
            >
              ₩{formatKRWShort(p.netProfit)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">순익률</p>
            <p className={`text-[14px] font-bold mt-1 tabular-nums ${ratioColorClass(p)}`}>
              {formatPct(p.profitRatio)}
            </p>
          </div>
        </div>

        {isCompleted && (
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
            완료 {p.completedAt?.substring(0, 10) || '-'} ·{' '}
            {p.completedReason === 'report_sent' ? '리포트전송' : '수동'}
          </div>
        )}
      </button>
      {isExpanded && (
        <ProjectRowExpand
          project={p}
          laborRates={laborRates}
          totalQuantity={totalQuantity}
          detailedQuantity={detailedQuantity}
          inquiryDate={inquiryDate}
          onSave={onSave}
          onComplete={onComplete}
          onReRunAi={onReRunAi}
          onNotification={onNotification}
        />
      )}
    </div>
  );
}
