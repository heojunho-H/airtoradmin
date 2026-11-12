import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Calendar,
  TrendingUp,
  DollarSign,
  Activity,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  X,
  Clock,
  CheckCircle2,
  FileText,
  Percent,
  Building2,
  User,
  ArrowRight,
  Phone,
  Send,
  MessageSquare,
  Handshake,
  CalendarCheck,
  CheckCircle,
  Mail,
  MapPin,
  Briefcase,
  Package,
  StickyNote,
  ChevronDown,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { MobileCard, MobileCardField, MobileCardRow, MobileCardBadge } from './MobileCard';
import { AiCompanyInfoButton } from './AiCompanyInfo';
import { CompanyFiles } from './CompanyFiles';
import { btn, ICON_BTN_DANGER, KPI, TABLE, TILE, BADGE, TONE, STAGE_COLORS, INPUT, MODAL_CLOSE, type Tone } from './ui-kit';
import { diffDeal, isValidYmd, isWonDeal, patchDeal, postDeal, SyncError, syncWarningText, type SyncResult } from '../../lib/dealSync';
import { inflowText, parseInflow, stripInflow } from '../../lib/inflow';

// 문의 유입 경로 배지 — 요청사항 끝 '[유입: …]'(홈페이지가 붙임, 2026-11-12 이후 문의). 뜻 없는 정보라 중립색.
function InflowBadge({ requirements, className = '' }: { requirements?: string; className?: string }) {
  const inflow = parseInflow(requirements);
  if (!inflow) return null;
  return (
    <span className={`${BADGE} ${TONE.slate} ${className}`} title={`유입 경로: ${inflowText(inflow)}`}>
      {inflow.label}
    </span>
  );
}

// 상세 '문의 등록일' 타일 아래 — 배지 + 검색어 + 들어온 날
function InflowDetail({ requirements }: { requirements?: string }) {
  const inflow = parseInflow(requirements);
  if (!inflow) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" title="유입 경로">
      <span className={`${BADGE} ${TONE.slate}`}>{inflow.label}</span>
      {inflow.keyword && <span className="text-[13px] text-slate-600">{inflow.keyword}</span>}
      {inflow.date && <span className="text-[12px] text-slate-400">{inflow.date} 방문</span>}
    </div>
  );
}

interface Deal {
  id: number;
  registrationDate: string; // 문의 등록일
  status: 'new' | 'call' | 'quote-sent' | 'quote-call' | 'price-negotiation' | 'schedule' | 'confirmed'; // 진행상태
  company: string; // 기업명
  contactName: string; // 담당자명
  contactPosition: string; // 직책
  phone: string; // 전화번호
  email: string; // 이메일
  desiredService: string; // 희망서비스
  totalQuantity: number; // 총수량
  quotationAmount: string; // 견적금액
  salesManager: string; // 고객책임자
  successStatus: 'in-progress' | 'success' | 'failed' | 'no-quote'; // 성공여부
  isChecked: boolean; // 확인여부
  // 상세 정보
  address: string; // 주소
  requirements: string; // 기타 요구사항
  detailedQuantity: string; // 상세수량
  confirmedWorkDate: string; // 확정작업일
  managementMemo: string; // 관리 메모
  // 첨부파일 (문의하기 폼에서 업로드)
  file1Name: string;
  file1Path: string;
  file2Name: string;
  file2Path: string;
  file3Name: string;
  file3Path: string;
}

// API에서 딜 데이터를 조회
export async function fetchDeals(): Promise<Deal[]> {
  const response = await fetch('/api/deals');
  if (!response.ok) throw new Error('딜 데이터 조회 실패');
  const result = await response.json();
  return result.data || [];
}

// API에 딜 데이터를 저장 (추가) — 처음부터 수주면 서버가 고객·프로젝트 연결을 만든다
export async function createDeal(deal: Omit<Deal, 'id'>): Promise<number> {
  const r = await postDeal<Deal>(deal as unknown as Record<string, unknown>);
  return r.id;
}

// API에 딜 데이터를 삭제
export async function deleteDeal(id: number): Promise<void> {
  const response = await fetch('/api/deals', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error('딜 삭제 실패');
}

const customerJourneyStages = [
  { id: 'new', name: '신규', icon: User, color: 'blue' },
  { id: 'call', name: '유선상담', icon: Phone, color: 'cyan' },
  { id: 'quote-sent', name: '견적서 발송', icon: Send, color: 'purple' },
  { id: 'quote-call', name: '유선견적상담', icon: MessageSquare, color: 'indigo' },
  { id: 'price-negotiation', name: '가격조율', icon: DollarSign, color: 'amber' },
  { id: 'schedule', name: '일정조율', icon: CalendarCheck, color: 'orange' },
  { id: 'confirmed', name: '수주확정', icon: CheckCircle, color: 'green' },
];

// 성공여부 배지 색 — 성공 초록 · 실패 빨강 · 미견적 주황 · 진행중 회색 (표·상세·파이프라인·모바일 공통)
function successTone(status: string): Tone {
  if (status === 'success') return 'emerald';
  if (status === 'failed') return 'red';
  if (status === 'no-quote') return 'orange';
  return 'slate';
}

const QUANTITY_CATEGORIES = [
  '벽걸이형', '스탠드 일반형', '스탠드 대형', '1way 천정형', '2way 천정형',
  '4way 천정형', '원형 천정형', 'FCU형', '매립덕트형', '실외기',
] as const;

interface DetailedQuantityData {
  categories: Record<string, number>;
  others: { name: string; quantity: number }[];
}

function parseDetailedQuantity(raw: string): DetailedQuantityData {
  const defaults: DetailedQuantityData = {
    categories: Object.fromEntries(QUANTITY_CATEGORIES.map(c => [c, 0])),
    others: [],
  };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    return {
      categories: { ...defaults.categories, ...(parsed.categories || {}) },
      others: Array.isArray(parsed.others) ? parsed.others : [],
    };
  } catch {
    // 기존 텍스트 데이터인 경우 기타로 처리
    return { ...defaults, others: raw.trim() ? [{ name: raw, quantity: 0 }] : [] };
  }
}

function serializeDetailedQuantity(data: DetailedQuantityData): string {
  return JSON.stringify(data);
}

function summarizeDetailedQuantity(raw: string): string {
  const data = parseDetailedQuantity(raw);
  const parts: string[] = [];
  for (const cat of QUANTITY_CATEGORIES) {
    const qty = data.categories[cat] || 0;
    if (qty > 0) parts.push(`${cat} ${qty}대`);
  }
  for (const o of data.others) {
    if (o.name && o.quantity > 0) parts.push(`${o.name} ${o.quantity}대`);
  }
  return parts.length > 0 ? parts.join(', ') : '없음';
}

type DateFilter = { startMonth: string; endMonth: string; activeDatePreset: string };

type SalesViewState = {
  viewMode: 'pipeline' | 'list';
  searchTerm: string;
  showFilters: boolean;
  selectedStatuses: string[];
  selectedSuccessStatuses: string[];
  selectedSalesManagers: string[];
  minQuantity: string;
  maxQuantity: string;
  minAmount: string;
  maxAmount: string;
  sortField: 'registrationDate' | 'totalQuantity' | 'quotationAmount' | null;
  sortDirection: 'asc' | 'desc';
};

const DEFAULT_VIEW_STATE: SalesViewState = {
  viewMode: 'list', searchTerm: '', showFilters: false,
  selectedStatuses: [], selectedSuccessStatuses: [], selectedSalesManagers: [],
  minQuantity: '', maxQuantity: '', minAmount: '', maxAmount: '',
  sortField: null, sortDirection: 'asc',
};

interface SalesPageProps {
  onDealSuccess?: (deal: Deal) => void;
  /** 저장 결과 — 서버가 함께 바꾼 고객·프로젝트가 있으면 App 이 목록을 다시 불러온다 */
  onSynced?: (result: SyncResult) => void;
  /** 고객 작업이력·프로젝트와 연결된 딜 (삭제 안내용) */
  linkedDealIds?: Set<number>;
  /** 딜 ID → 그 딜을 작업이력에 가진 고객 ID (고객사 파일 목록을 고객 상세와 같게) */
  dealCustomerIds?: Map<number, number>;
  externalDealsState?: [Deal[], (deals: Deal[] | ((prev: Deal[]) => Deal[])) => void];
  externalDateFilterState?: [DateFilter, (s: DateFilter | ((prev: DateFilter) => DateFilter)) => void];
  externalViewState?: [SalesViewState, (s: SalesViewState | ((prev: SalesViewState) => SalesViewState)) => void];
  customerManagerNames?: string[];
  onNotification?: (message: string) => void;
  /** 상단 검색에서 딜을 고르면 바로 열 딜 — 열고 나면 onDealOpened 로 알린다 */
  openDealId?: number | null;
  onDealOpened?: () => void;
}

export function SalesPage({ onDealSuccess, onSynced, linkedDealIds, dealCustomerIds, externalDealsState, externalDateFilterState, externalViewState, customerManagerNames = [], onNotification, openDealId = null, onDealOpened }: SalesPageProps = {}) {
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [editingSuccessStatusId, setEditingSuccessStatusId] = useState<number | null>(null);
  const [editingSalesManagerId, setEditingSalesManagerId] = useState<number | null>(null);
  const [internalDealsData, setInternalDealsData] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dealsData = externalDealsState ? externalDealsState[0] : internalDealsData;
  const setDealsData = externalDealsState ? externalDealsState[1] : setInternalDealsData;
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedDeal, setEditedDeal] = useState<Deal | null>(null);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [internalDateFilter, setInternalDateFilter] = useState<DateFilter>({ startMonth: currentMonth, endMonth: currentMonth, activeDatePreset: '이번 달' });
  const dateFilter = externalDateFilterState ? externalDateFilterState[0] : internalDateFilter;
  const setDateFilter = externalDateFilterState ? externalDateFilterState[1] : setInternalDateFilter;
  const startMonth = dateFilter.startMonth;
  const endMonth = dateFilter.endMonth;
  const activeDatePreset = dateFilter.activeDatePreset;
  const setStartMonth = (v: string) => setDateFilter((prev) => ({ ...prev, startMonth: v }));
  const setEndMonth = (v: string) => setDateFilter((prev) => ({ ...prev, endMonth: v }));
  const setActiveDatePreset = (v: string) => setDateFilter((prev) => ({ ...prev, activeDatePreset: v }));

  // 뷰/필터/정렬 상태 — 페이지 이탈 후 복귀 시 유지
  const [internalViewState, setInternalViewState] = useState<SalesViewState>(DEFAULT_VIEW_STATE);
  const viewState = externalViewState ? externalViewState[0] : internalViewState;
  const setViewState = externalViewState ? externalViewState[1] : setInternalViewState;
  const { viewMode, searchTerm, showFilters, selectedStatuses, selectedSuccessStatuses, selectedSalesManagers, minQuantity, maxQuantity, minAmount, maxAmount, sortField, sortDirection } = viewState;
  const setViewMode = (v: SalesViewState['viewMode']) => setViewState((prev) => ({ ...prev, viewMode: v }));
  const setSearchTerm = (v: string) => setViewState((prev) => ({ ...prev, searchTerm: v }));
  const setShowFilters = (v: boolean) => setViewState((prev) => ({ ...prev, showFilters: v }));
  const setSelectedStatuses = (v: string[] | ((p: string[]) => string[])) => setViewState((prev) => ({ ...prev, selectedStatuses: typeof v === 'function' ? v(prev.selectedStatuses) : v }));
  const setSelectedSuccessStatuses = (v: string[] | ((p: string[]) => string[])) => setViewState((prev) => ({ ...prev, selectedSuccessStatuses: typeof v === 'function' ? v(prev.selectedSuccessStatuses) : v }));
  const setSelectedSalesManagers = (v: string[] | ((p: string[]) => string[])) => setViewState((prev) => ({ ...prev, selectedSalesManagers: typeof v === 'function' ? v(prev.selectedSalesManagers) : v }));
  const setMinQuantity = (v: string) => setViewState((prev) => ({ ...prev, minQuantity: v }));
  const setMaxQuantity = (v: string) => setViewState((prev) => ({ ...prev, maxQuantity: v }));
  const setMinAmount = (v: string) => setViewState((prev) => ({ ...prev, minAmount: v }));
  const setMaxAmount = (v: string) => setViewState((prev) => ({ ...prev, maxAmount: v }));
  const setSortField = (v: SalesViewState['sortField']) => setViewState((prev) => ({ ...prev, sortField: v }));
  const setSortDirection = (v: SalesViewState['sortDirection']) => setViewState((prev) => ({ ...prev, sortDirection: v }));
  const [isAddingNewDeal, setIsAddingNewDeal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // 상세 화면의 바로 저장 칸(관리 메모·확정작업일) — 포커스를 얻었을 때 값. 벗어날 때 바뀌었으면 저장한다.
  const inlineStartRef = useRef<{ memo: string; workDate: string }>({ memo: '', workDate: '' });
  const inlineFocusRef = useRef(false);

  // 목록을 새로 불러오면(고객·프로젝트 페이지에서 고친 값) 열린 상세도 최신으로 — 편집·입력 중에는 그대로
  useEffect(() => {
    if (!selectedDeal || isEditMode || isAddingNewDeal || inlineFocusRef.current) return;
    const fresh = dealsData.find((d) => d.id === selectedDeal.id);
    if (fresh && fresh !== selectedDeal) setSelectedDeal(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealsData]);

  // 저장 결과 처리 — 서버 경고·부분 실패 알림, App 에 동기화 결과 전달
  const reportSync = (deal: Pick<Deal, 'company'>, r: SyncResult) => {
    for (const w of r.warnings) {
      const text = syncWarningText(w);
      if (text) onNotification?.(`[${deal.company}] ${text}`);
    }
    if (r.partial && r.error) onNotification?.(`[${deal.company}] ${r.error}`);
    onSynced?.(r);
  };

  // 바뀐 칸만 저장 (서버가 연결된 고객 작업이력·프로젝트에 퍼뜨린다). 실패하면 알림을 남기고 null.
  const saveDealFields = async (deal: Deal, fields: Record<string, unknown>, what: string): Promise<SyncResult | null> => {
    if (Object.keys(fields).length === 0) return null;
    try {
      const r = await patchDeal<Deal>(deal.id, fields);
      reportSync(deal, r);
      return r;
    } catch (err) {
      console.error(`${what} 저장 실패:`, err);
      const reason = err instanceof Error ? err.message : '다시 시도해 주세요';
      if (err instanceof SyncError && err.code === 'reload_required') alert(reason);
      else onNotification?.(`[${deal.company}] ${what} 저장 실패 — ${reason}`);
      return null;
    }
  };
  
  // DB에서 딜 데이터 로드
  useEffect(() => {
    fetchDeals()
      .then((data) => {
        if (!externalDealsState) {
          setInternalDealsData(data);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('딜 데이터 로드 실패:', err);
        setIsLoading(false);
      });
  }, []);

  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 문의 등록일 기준 15일 초과 시 성공여부 자동 실패 처리
  useEffect(() => {
    const today = new Date();
    // 진행상태 '수주확정'은 건너뛴다 — 성공여부만 늦게 바뀐 수주 건을 실패로 돌리지 않게
    const expiredDeals = dealsData.filter((deal) => {
      if (deal.successStatus !== 'in-progress' || deal.status === 'confirmed') return false;
      const regDate = new Date(deal.registrationDate);
      const diffDays = Math.floor((today.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 15;
    });

    if (expiredDeals.length > 0) {
      setDealsData((prev) =>
        prev.map((deal) => {
          const regDate = new Date(deal.registrationDate);
          const diffDays = Math.floor((today.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
          if (deal.successStatus === 'in-progress' && deal.status !== 'confirmed' && diffDays > 15) {
            const updatedDeal = { ...deal, successStatus: 'failed' as const };
            void saveDealFields(deal, { successStatus: 'failed' }, '자동 실패 처리');
            return updatedDeal;
          }
          return deal;
        })
      );
      expiredDeals.forEach((deal) => {
        onNotification?.(`[${deal.company}] 문의 등록일 15일 초과로 자동 실패 처리되었습니다`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  
  // 헤더 필터 드롭다운 상태
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [salesManagerDropdownOpen, setSalesManagerDropdownOpen] = useState(false);
  const [successStatusDropdownOpen, setSuccessStatusDropdownOpen] = useState(false);

  // 확정작업일 입력 팝업 — 수주확정/성공 전환 시 미입력이면 alert 대신 이 모달을 띄움.
  // '다음에 입력하기' 버튼으로 빈 날짜인 채 진행을 허용 (사용자 요청).
  const [workDateModal, setWorkDateModal] = useState<{
    companyName: string;
    actionLabel: string;
    date: string;
    onSubmit: (date: string) => void;
  } | null>(null);

  // 견적금액 파싱 함수 (만원 단위 처리)
  const parseQuotationAmount = (quotationAmount: string): number => {
    if (!quotationAmount) return 0;
    // "₩12,500만" 형식 처리
    const isManWon = quotationAmount.includes('만');
    const numericValue = parseFloat(quotationAmount.replace(/[^0-9.]/g, ''));
    if (isNaN(numericValue)) return 0;
    return isManWon ? numericValue * 10000 : numericValue;
  };

  // 금액을 만, 억 단위로 표시하는 함수
  const formatAmount = (amount: number): string => {
    if (amount >= 100000000) {
      // 1억 이상
      const eok = Math.floor(amount / 100000000);
      const remainder = amount % 100000000;
      if (remainder >= 10000) {
        const man = Math.floor(remainder / 10000);
        return `${eok}억 ${man}만`;
      }
      return `${eok}억`;
    } else if (amount >= 10000) {
      // 1만 이상
      const man = Math.floor(amount / 10000);
      return `${man}만`;
    }
    // 1만 미만
    return `${amount.toLocaleString()}`;
  };

  // 고객여정 단계 색 — ui-kit STAGE_COLORS (배지·아이콘·점이 같은 계열)
  const stageStyle = (color: string) => STAGE_COLORS[color] || STAGE_COLORS.green;

  // 기간에 따라 필터링된 데이터
  const dateFilteredDeals = dealsData.filter((deal) => {
    const dealDate = deal.registrationDate;
    const dealMonth = dealDate.substring(0, 7); // YYYY-MM 형식
    return dealMonth >= startMonth && dealMonth <= endMonth;
  });

  const filteredDeals = dateFilteredDeals.filter(
    (deal) => {
      // 기존 검색 필터
      const searchMatch = 
        deal.desiredService.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deal.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deal.contactName.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!searchMatch) return false;
      
      // 진행상태 필터
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(deal.status)) {
        return false;
      }
      
      // 성공여부 필터
      if (selectedSuccessStatuses.length > 0 && !selectedSuccessStatuses.includes(deal.successStatus)) {
        return false;
      }
      
      // 고객책임자 필터
      if (selectedSalesManagers.length > 0 && !selectedSalesManagers.includes(deal.salesManager)) {
        return false;
      }
      
      // 총수량 필터
      if (minQuantity !== '' && deal.totalQuantity < parseInt(minQuantity)) {
        return false;
      }
      if (maxQuantity !== '' && deal.totalQuantity > parseInt(maxQuantity)) {
        return false;
      }
      
      // 견적금액 필터
      const dealAmount = parseQuotationAmount(deal.quotationAmount);
      if (minAmount !== '' && dealAmount < parseFloat(minAmount)) {
        return false;
      }
      if (maxAmount !== '' && dealAmount > parseFloat(maxAmount)) {
        return false;
      }
      
      return true;
    }
  );

  // 정렬 적용
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    if (!sortField) return 0;
    
    if (sortField === 'registrationDate') {
      const dateA = new Date(a.registrationDate).getTime();
      const dateB = new Date(b.registrationDate).getTime();
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    }
    
    if (sortField === 'totalQuantity') {
      return sortDirection === 'asc' 
        ? a.totalQuantity - b.totalQuantity 
        : b.totalQuantity - a.totalQuantity;
    }
    
    if (sortField === 'quotationAmount') {
      const amountA = parseQuotationAmount(a.quotationAmount);
      const amountB = parseQuotationAmount(b.quotationAmount);
      return sortDirection === 'asc' ? amountA - amountB : amountB - amountA;
    }
    
    return 0;
  });

  // 내보내기 핸들러
  const handleExport = () => {
    const statusMap: Record<string, string> = {
      'new': '신규', 'call': '유선상담', 'quote-sent': '견적서 발송',
      'quote-call': '유선견적상담', 'price-negotiation': '가격조율',
      'schedule': '일정조율', 'confirmed': '수주확정',
    };
    const successMap: Record<string, string> = {
      'in-progress': '진행중', 'success': '계약 성공', 'failed': '계약 실패', 'no-quote': '미견적',
    };

    const exportData = sortedDeals.map((deal) => ({
      '문의등록일': deal.registrationDate,
      '진행상태': statusMap[deal.status] || deal.status,
      '기업명': deal.company,
      '담당자명': deal.contactName,
      '직책': deal.contactPosition,
      '전화번호': deal.phone,
      '이메일': deal.email,
      '희망서비스': deal.desiredService,
      '총수량': deal.totalQuantity,
      '상세수량': summarizeDetailedQuantity(deal.detailedQuantity),
      '견적금액': deal.quotationAmount,
      '고객책임자': deal.salesManager,
      '성공여부': successMap[deal.successStatus] || deal.successStatus,
      '유입 경로': inflowText(parseInflow(deal.requirements)),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
      { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 32 },
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '영업관리');
    XLSX.writeFile(wb, `영업관리_${startMonth}~${endMonth}.xlsx`);
  };

  // 정렬 핸들러
  const handleSort = (field: 'registrationDate' | 'totalQuantity' | 'quotationAmount') => {
    if (sortField === field) {
      // 같은 필드 클릭 시
      if (sortDirection === 'asc') {
        // 오름차순 → 내림차순
        setSortDirection('desc');
      } else {
        // 내림차순 → 정렬 취소
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      // 다른 필드 클릭 시 해당 필드로 오름차순 정렬
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // KPI 계산 (필터링된 데이터 기준)
  const totalDeals = dateFilteredDeals.length;
  const totalQuotationAmount = dateFilteredDeals.reduce((sum, deal) => {
    const amount = parseQuotationAmount(deal.quotationAmount);
    return sum + amount;
  }, 0);
  const successfulDeals = dateFilteredDeals.filter((deal) => deal.successStatus === 'success').length;
  const successfulAmount = dateFilteredDeals
    .filter((deal) => deal.successStatus === 'success')
    .reduce((sum, deal) => {
      const amount = parseQuotationAmount(deal.quotationAmount);
      return sum + amount;
    }, 0);
  const successRateByCount = totalDeals > 0 ? ((successfulDeals / totalDeals) * 100).toFixed(1) : '0.0';
  const successRateByAmount = totalQuotationAmount > 0 ? ((successfulAmount / totalQuotationAmount) * 100).toFixed(1) : '0.0';

  // 조회 기간별 각 진행상태 카운트 계산
  const getStageCount = (stageId: string) => {
    return dateFilteredDeals.filter((deal) => deal.status === stageId).length;
  };

  // 동적으로 count가 포함된 customerJourneyStages 생성
  const customerJourneyStagesWithCount = customerJourneyStages.map(stage => ({
    ...stage,
    count: getStageCount(stage.id)
  }));

  const dealsByStage = (stageId: string) =>
    filteredDeals.filter((deal) => deal.status === stageId);

  const getStatusLabel = (status: string) => {
    const statusMap = {
      'new': '신규',
      'call': '유선상담',
      'quote-sent': '견적서 발송',
      'quote-call': '유선견적상담',
      'price-negotiation': '가격조율',
      'schedule': '일정조율',
      'confirmed': '수주확정',
    };
    return statusMap[status as keyof typeof statusMap] || status;
  };

  const getStatusColor = (status: string) => {
    const stageData = customerJourneyStages.find((s) => s.id === status);
    return stageData?.color || 'slate';
  };

  // 진행상태 배지 색 (모르는 값은 회색)
  const getStageTone = (status: string): Tone => STAGE_COLORS[getStatusColor(status)]?.tone ?? 'slate';

  // 고유한 고객책임자 목록 추출
  const uniqueSalesManagers = Array.from(new Set(dealsData.map(deal => deal.salesManager)));

  // 헤더 필터 토글 핸들러
  const toggleStatusFilter = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleSalesManagerFilter = (manager: string) => {
    setSelectedSalesManagers(prev =>
      prev.includes(manager) ? prev.filter(m => m !== manager) : [...prev, manager]
    );
  };

  const toggleSuccessStatusFilter = (status: string) => {
    setSelectedSuccessStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  // 필터 초기화 함수
  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedSuccessStatuses([]);
    setSelectedSalesManagers([]);
    setMinQuantity('');
    setMaxQuantity('');
    setMinAmount('');
    setMaxAmount('');
  };

  // 활성화된 필터 개수
  const activeFiltersCount = 
    selectedStatuses.length + 
    selectedSuccessStatuses.length + 
    selectedSalesManagers.length + 
    (minQuantity !== '' ? 1 : 0) +
    (maxQuantity !== '' ? 1 : 0) +
    (minAmount !== '' ? 1 : 0) +
    (maxAmount !== '' ? 1 : 0);

  const handleDeleteDeal = async (dealId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    const dealToDelete = dealsData.find(d => d.id === dealId);
    if (!dealToDelete) return;

    const linkedNote = linkedDealIds?.has(dealId)
      ? '\n\n이 거래는 고객관리 작업이력·프로젝트와 연결되어 있습니다. 그쪽 기록은 남고 \'딜 삭제됨\'으로 표시됩니다.'
      : '';
    if (window.confirm(`"${dealToDelete.company}" 거래를 삭제하시겠습니까?${linkedNote}`)) {
      try {
        await deleteDeal(dealId);
        setDealsData(dealsData.filter(deal => deal.id !== dealId));
        if (selectedDeal?.id === dealId) {
          setSelectedDeal(null);
        }
        onNotification?.(`[${dealToDelete.company}] 거래가 삭제되었습니다`);
      } catch (err) {
        alert('거래 삭제에 실패했습니다.');
        console.error(err);
      }
    }
  };

  // 거래 상세 열기 — 미확인이면 자동 확인 처리
  const handleDealSelect = (deal: Deal) => {
    if (!deal.isChecked) {
      const updatedDeal = { ...deal, isChecked: true };
      setSelectedDeal(updatedDeal);
      setDealsData(dealsData.map(d => d.id === deal.id ? updatedDeal : d));
      void saveDealFields(deal, { isChecked: true }, '확인 상태');
    } else {
      setSelectedDeal(deal);
    }
  };

  // 상단 검색에서 딜을 고르면 그 딜 상세를 바로 연다 (한 번만, 목록 클릭과 같게 미확인이면 확인 처리)
  useEffect(() => {
    if (openDealId == null) return;
    const target = dealsData.find((d) => Number(d.id) === openDealId);
    if (!target && dealsData.length === 0) return; // 목록을 아직 못 불러옴
    if (target) handleDealSelect(target);
    onDealOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDealId, dealsData]);

  // 확인 상태 토글
  const handleToggleChecked = (dealId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetDeal = dealsData.find(d => d.id === dealId);
    if (!targetDeal) return;
    const updatedDeal = { ...targetDeal, isChecked: !targetDeal.isChecked };
    setDealsData(dealsData.map(d => d.id === dealId ? updatedDeal : d));
    if (selectedDeal?.id === dealId) setSelectedDeal(updatedDeal);
    void saveDealFields(targetDeal, { isChecked: updatedDeal.isChecked }, '확인 상태');
  };

  const handleStatusChange = async (dealId: number, newStatus: Deal['status']) => {
    const targetDeal = dealsData.find((d) => d.id === dealId);
    if (!targetDeal) return;

    // 수주확정 전환 시 확정작업일 필수 — 프로젝트 관리 페이지 정렬 기준이라
    // 비어 있으면 신규 프로젝트가 목록 최하단에 매장됨.
    // 미입력이면 팝업으로 안내하되, '다음에 입력하기'로 빈 날짜 진행 허용.
    if (newStatus === 'confirmed' && !targetDeal.confirmedWorkDate?.trim()) {
      setEditingStatusId(null);
      setWorkDateModal({
        companyName: targetDeal.company,
        actionLabel: '수주확정',
        date: '',
        onSubmit: (date) => {
          setWorkDateModal(null);
          void proceedWithStatusChange(targetDeal, newStatus, date);
        },
      });
      return;
    }

    void proceedWithStatusChange(targetDeal, newStatus, targetDeal.confirmedWorkDate);
  };

  const proceedWithStatusChange = async (
    targetDeal: Deal,
    newStatus: Deal['status'],
    workDate: string,
  ) => {
    const updatedDeal: Deal = {
      ...targetDeal,
      status: newStatus,
      confirmedWorkDate: workDate,
      successStatus: newStatus === 'confirmed' ? 'success' as const : targetDeal.successStatus,
    };

    setDealsData((prevDeals) =>
      prevDeals.map((deal) => (deal.id === targetDeal.id ? updatedDeal : deal))
    );
    setEditingStatusId(null);

    if (selectedDeal && selectedDeal.id === targetDeal.id) {
      setSelectedDeal(updatedDeal);
    }

    onNotification?.(`[${targetDeal.company}] 진행상태가 "${getStatusLabel(newStatus)}"(으)로 변경되었습니다`);

    const r = await saveDealFields(targetDeal, diffDeal(targetDeal as unknown as Record<string, unknown>, updatedDeal as unknown as Record<string, unknown>), '진행상태');
    if (r?.transition === 'won') onDealSuccess?.(updatedDeal);
  };

  const handleSuccessStatusChange = async (dealId: number, newSuccessStatus: Deal['successStatus']) => {
    const targetDeal = dealsData.find((d) => d.id === dealId);
    if (!targetDeal) return;

    // 성공 전환 시 확정작업일 필수 (수주확정과 동일 사유) — 미입력이면 팝업.
    if (newSuccessStatus === 'success' && !targetDeal.confirmedWorkDate?.trim()) {
      setEditingSuccessStatusId(null);
      setWorkDateModal({
        companyName: targetDeal.company,
        actionLabel: '성공 처리',
        date: '',
        onSubmit: (date) => {
          setWorkDateModal(null);
          void proceedWithSuccessStatusChange(targetDeal, newSuccessStatus, date);
        },
      });
      return;
    }

    void proceedWithSuccessStatusChange(targetDeal, newSuccessStatus, targetDeal.confirmedWorkDate);
  };

  const proceedWithSuccessStatusChange = async (
    targetDeal: Deal,
    newSuccessStatus: Deal['successStatus'],
    workDate: string,
  ) => {
    const updatedDeal: Deal = { ...targetDeal, successStatus: newSuccessStatus, confirmedWorkDate: workDate };

    setDealsData((prevDeals) =>
      prevDeals.map((deal) => (deal.id === targetDeal.id ? updatedDeal : deal))
    );
    setEditingSuccessStatusId(null);

    if (selectedDeal && selectedDeal.id === targetDeal.id) {
      setSelectedDeal(updatedDeal);
    }

    const successLabel = newSuccessStatus === 'success' ? '성공' : newSuccessStatus === 'failed' ? '실패' : newSuccessStatus === 'no-quote' ? '미견적' : '진행중';
    onNotification?.(`[${targetDeal.company}] 성공여부가 "${successLabel}"(으)로 변경되었습니다`);

    const r = await saveDealFields(targetDeal, diffDeal(targetDeal as unknown as Record<string, unknown>, updatedDeal as unknown as Record<string, unknown>), '성공여부');
    if (r?.transition === 'won') onDealSuccess?.(updatedDeal);
  };

  const handleSalesManagerInlineChange = (dealId: number, newManager: string) => {
    const targetDeal = dealsData.find((d) => d.id === dealId);
    if (!targetDeal) return;

    const updatedDeal = { ...targetDeal, salesManager: newManager };

    // DB에 저장 — 수주 건이면 고객 작업이력의 고객책임자도 함께 바뀐다
    void saveDealFields(targetDeal, { salesManager: newManager }, '담당자');

    setDealsData((prevDeals) =>
      prevDeals.map((deal) => deal.id === dealId ? updatedDeal : deal)
    );
    setEditingSalesManagerId(null);

    if (selectedDeal && selectedDeal.id === dealId) {
      setSelectedDeal(updatedDeal);
    }

    onNotification?.(`[${targetDeal.company}] 담당자가 "${newManager}"(으)로 변경되었습니다`);
  };

  const handleEditClick = () => {
    setIsEditMode(true);
    setEditedDeal(selectedDeal);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedDeal(null);
    if (isAddingNewDeal) {
      setIsAddingNewDeal(false);
      setSelectedDeal(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editedDeal) return;

    // 수주확정/성공으로 가는 저장은 확정작업일 필수 — 미입력이면 팝업.
    const goingToSuccess = isWonDeal(editedDeal);
    if (goingToSuccess && !editedDeal.confirmedWorkDate?.trim()) {
      setWorkDateModal({
        companyName: editedDeal.company || '신규 거래',
        actionLabel: '저장',
        date: '',
        onSubmit: (date) => {
          setWorkDateModal(null);
          void performSaveEdit({ ...editedDeal, confirmedWorkDate: date });
        },
      });
      return;
    }

    void performSaveEdit(editedDeal);
  };

  const performSaveEdit = async (dealToSave: Deal) => {
    if (isAddingNewDeal) {
      if (!dealToSave.company.trim()) {
        alert('기업명은 필수 입력 항목입니다.');
        return;
      }
      try {
        const r = await postDeal<Deal>(dealToSave as unknown as Record<string, unknown>);
        const newDeal = r.deal ? { ...dealToSave, ...r.deal } : { ...dealToSave, id: r.id };
        setDealsData((prevDeals) => [...prevDeals, newDeal]);
        setSelectedDeal(null);
        setIsAddingNewDeal(false);
        onNotification?.(`[${dealToSave.company}] 새 거래가 등록되었습니다`);
        reportSync(dealToSave, r);
        if (r.transition === 'won') onDealSuccess?.(newDeal);
      } catch (err) {
        alert(err instanceof SyncError ? err.message : '거래 등록에 실패했습니다. 다시 시도해주세요.');
        console.error(err);
        return;
      }
    } else {
      // 원본(편집 시작 때 값)과 비교해 바뀐 칸만 보낸다 — 다른 사람이 그사이 고친 칸을 되돌리지 않게
      const original = selectedDeal && selectedDeal.id === dealToSave.id ? selectedDeal : dealToSave;
      const fields = diffDeal(original as unknown as Record<string, unknown>, dealToSave as unknown as Record<string, unknown>);
      if (Object.keys(fields).length > 0) {
        try {
          const r = await patchDeal<Deal>(dealToSave.id, fields);
          setDealsData((prevDeals) =>
            prevDeals.map((deal) => (deal.id === dealToSave.id ? dealToSave : deal))
          );
          setSelectedDeal(dealToSave);
          onNotification?.(`[${dealToSave.company}] 거래 정보가 수정되었습니다`);
          reportSync(dealToSave, r);
          if (r.transition === 'won') onDealSuccess?.(dealToSave);
        } catch (err) {
          alert(err instanceof SyncError ? err.message : '거래 수정에 실패했습니다. 다시 시도해주세요.');
          console.error(err);
          return;
        }
      }
    }
    setIsEditMode(false);
    setEditedDeal(null);
  };

  const handleFieldChange = (field: keyof Deal, value: string | number) => {
    if (editedDeal) {
      const updatedDeal = {
        ...editedDeal,
        [field]: value,
      };
      
      // 진행상태가 '수주확정'으로 변경되면 성공여부를 자동으로 '성공'으로 변경
      if (field === 'status' && value === 'confirmed') {
        updatedDeal.successStatus = 'success';
      }
      
      setEditedDeal(updatedDeal);
    }
  };

  const handleAddNewDeal = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayMonth = today.substring(0, 7); // "YYYY-MM"
    // 기간 필터를 오늘 날짜가 포함되도록 자동 확장
    if (todayMonth > endMonth) {
      setEndMonth(todayMonth);
    }
    if (todayMonth < startMonth) {
      setStartMonth(todayMonth);
    }
    const newDeal: Deal = {
      id: 0, // 임시 ID, 저장 시 실제 ID로 변경됨
      registrationDate: today,
      status: 'new',
      company: '',
      contactName: '',
      contactPosition: '',
      phone: '',
      email: '',
      desiredService: '',
      totalQuantity: 0,
      quotationAmount: '₩0만',
      salesManager: '',
      successStatus: 'in-progress',
      isChecked: false,
      address: '',
      requirements: '',
      detailedQuantity: '',
      confirmedWorkDate: '',
      managementMemo: '',
      file1Name: '',
      file1Path: '',
      file2Name: '',
      file2Path: '',
      file3Name: '',
      file3Path: '',
    };
    setSelectedDeal(newDeal);
    setEditedDeal(newDeal);
    setIsEditMode(true);
    setIsAddingNewDeal(true);
  };

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* 기간 설정 */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-[13px] font-semibold text-slate-600">조회 기간</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="month"
              value={startMonth}
              onChange={(e) => { setStartMonth(e.target.value); setActiveDatePreset(''); }}
              className="px-2.5 py-1.5 text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-sm">~</span>
            <input
              type="month"
              value={endMonth}
              onChange={(e) => { setEndMonth(e.target.value); setActiveDatePreset(''); }}
              className="px-2.5 py-1.5 text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { label: '이번 달', action: () => {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                setStartMonth(`${year}-${month}`);
                setEndMonth(`${year}-${month}`);
              }},
              { label: '지난 달', action: () => {
                const now = new Date();
                const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                const month = now.getMonth() === 0 ? 12 : now.getMonth();
                const lastMonth = `${year}-${String(month).padStart(2, '0')}`;
                setStartMonth(lastMonth);
                setEndMonth(lastMonth);
              }},
              { label: '지난 3개월', action: () => {
                const now = new Date();
                const endYear = now.getFullYear();
                const endMo = String(now.getMonth() + 1).padStart(2, '0');
                const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                const startYear = threeMonthsAgo.getFullYear();
                const startMo = String(threeMonthsAgo.getMonth() + 1).padStart(2, '0');
                setStartMonth(`${startYear}-${startMo}`);
                setEndMonth(`${endYear}-${endMo}`);
              }},
              { label: '올해', action: () => {
                const year = new Date().getFullYear();
                setStartMonth(`${year}-01`);
                setEndMonth(`${year}-12`);
              }},
              { label: '작년', action: () => {
                const year = new Date().getFullYear() - 1;
                setStartMonth(`${year}-01`);
                setEndMonth(`${year}-12`);
              }},
            ] as { label: string; action: () => void }[]).map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  preset.action();
                  setActiveDatePreset(preset.label);
                }}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors ${
                  activeDatePreset === preset.label
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <div className={KPI.card}>
          <div className="flex items-start justify-between">
            <div>
              <p className={KPI.label}>견적 문의 수</p>
              <p className={KPI.value}>{totalDeals}</p>
            </div>
            <div className={KPI.iconTile}>
              <FileText className={KPI.icon} />
            </div>
          </div>
        </div>

        <div className={KPI.card}>
          <div className="flex items-start justify-between">
            <div>
              <p className={KPI.label}>총 견적 금액</p>
              <p className={KPI.value}>
                ₩{formatAmount(totalQuotationAmount)}
              </p>
            </div>
            <div className={KPI.iconTile}>
              <DollarSign className={KPI.icon} />
            </div>
          </div>
        </div>

        <div className={KPI.card}>
          <div className="flex items-start justify-between">
            <div>
              <p className={KPI.label}>계약 성공 수</p>
              <p className={KPI.value}>{successfulDeals}</p>
            </div>
            <div className={KPI.iconTile}>
              <CheckCircle2 className={KPI.icon} />
            </div>
          </div>
        </div>

        <div className={KPI.card}>
          <div className="flex items-start justify-between">
            <div>
              <p className={KPI.label}>계약 성공 금액</p>
              <p className={KPI.value}>
                ₩{formatAmount(successfulAmount)}
              </p>
            </div>
            <div className={KPI.iconTile}>
              <TrendingUp className={KPI.icon} />
            </div>
          </div>
        </div>

        <div className={KPI.card}>
          <div className="flex items-start justify-between">
            <div>
              <p className={KPI.label}>계약 성공률(건수)</p>
              <p className={KPI.value}>{successRateByCount}%</p>
            </div>
            <div className={KPI.iconTile}>
              <Percent className={KPI.icon} />
            </div>
          </div>
        </div>

        <div className={KPI.card}>
          <div className="flex items-start justify-between">
            <div>
              <p className={KPI.label}>계약 성공률(금액)</p>
              <p className={KPI.value}>{successRateByAmount}%</p>
            </div>
            <div className={KPI.iconTile}>
              <Target className={KPI.icon} />
            </div>
          </div>
        </div>
      </div>

      {/* Customer Journey Dashboard */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">고객여정 진행상황</h2>
          <p className="text-[13px] text-slate-500 mt-1">각 단계별 고객 수를 확인하세요</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {customerJourneyStagesWithCount.map((stage, index) => {
            const prevStageCount = index > 0 ? customerJourneyStagesWithCount[index - 1].count : stage.count;
            const conversionRate = index > 0 ? ((stage.count / prevStageCount) * 100).toFixed(1) : 100;
            const Icon = stage.icon;
            
            return (
              <div key={stage.id} className="relative">
                {/* Connector Arrow - only visible on large screens */}
                {index < customerJourneyStages.length - 1 && (
                  <div className="hidden lg:flex absolute top-12 -right-1.5 z-10 items-center justify-center">
                    <div className="w-3 h-3 rotate-45 bg-slate-200 border-r-2 border-t-2 border-slate-300"></div>
                  </div>
                )}
                
                {/* Stage Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col space-y-3">
                    {/* Icon + Stage Name */}
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${stageStyle(stage.color).iconTile}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <p className="text-[15px] font-bold text-slate-800 leading-tight">{stage.name}</p>
                    </div>
                    
                    {/* Count */}
                    <div className="text-center">
                      <p className="text-3xl font-bold text-slate-900">{stage.count}</p>
                      <p className="text-[11px] text-slate-500 mt-1">고객</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">영업 관리</h1>
          <p className="text-[15px] text-slate-500 mt-1.5">{filteredDeals.length}건의 거래 진행 중</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition-all ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              목록
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition-all ${
                viewMode === 'pipeline'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              파이프라인
            </button>
          </div>
          <button
            onClick={handleExport}
            className={btn('secondary')}
          >
            <Download className="w-[18px] h-[18px]" />
            <span>내보내기</span>
          </button>
          <button
            onClick={handleAddNewDeal}
            className={btn('primary')}
          >
            <Plus className="w-[18px] h-[18px]" />
            <span>거래 추가</span>
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="거래명, 회사명, 담당자명으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-[14px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 shadow-sm ${
              activeFiltersCount > 0 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
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

        {/* 필터 패널 */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 진행상태 필터 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">진행상태</label>
              <div className="space-y-2">
                {customerJourneyStages.map((stage) => (
                  <label key={stage.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(stage.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStatuses([...selectedStatuses, stage.id]);
                        } else {
                          setSelectedStatuses(selectedStatuses.filter(s => s !== stage.id));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[13px] text-slate-700">{stage.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 성공여부 필터 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">성공여부</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSuccessStatuses.includes('in-progress')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSuccessStatuses([...selectedSuccessStatuses, 'in-progress']);
                      } else {
                        setSelectedSuccessStatuses(selectedSuccessStatuses.filter(s => s !== 'in-progress'));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[13px] text-slate-700">진행중</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSuccessStatuses.includes('success')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSuccessStatuses([...selectedSuccessStatuses, 'success']);
                      } else {
                        setSelectedSuccessStatuses(selectedSuccessStatuses.filter(s => s !== 'success'));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[13px] text-slate-700">성공</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSuccessStatuses.includes('failed')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSuccessStatuses([...selectedSuccessStatuses, 'failed']);
                      } else {
                        setSelectedSuccessStatuses(selectedSuccessStatuses.filter(s => s !== 'failed'));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[13px] text-slate-700">실패</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSuccessStatuses.includes('no-quote')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSuccessStatuses([...selectedSuccessStatuses, 'no-quote']);
                      } else {
                        setSelectedSuccessStatuses(selectedSuccessStatuses.filter(s => s !== 'no-quote'));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[13px] text-slate-700">미견적</span>
                </label>
              </div>
            </div>

            {/* 고객책임자 필터 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">고객책임자</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {uniqueSalesManagers.map((manager) => (
                  <label key={manager} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSalesManagers.includes(manager)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSalesManagers([...selectedSalesManagers, manager]);
                        } else {
                          setSelectedSalesManagers(selectedSalesManagers.filter(m => m !== manager));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[13px] text-slate-700">{manager}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 총수량 필터 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">총수량</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(e.target.value)}
                  min="0"
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  value={maxQuantity}
                  onChange={(e) => setMaxQuantity(e.target.value)}
                  min="0"
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 견적금액 필터 */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-2">견적금액 (만원)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  min="0"
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  min="0"
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 필터 초기화 버튼 */}
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-[13px] font-semibold"
              >
                필터 초기화
              </button>
            </div>
          </div>
        )}
      </div>

      {/* List View */}
      {viewMode === 'list' && (
        <>
          {/* 모바일 카드 뷰 */}
          {isMobile ? (
            <div className="space-y-3">
              {filteredDeals.map((deal) => (
                <MobileCard key={deal.id} onClick={() => handleDealSelect(deal)}>
                  <MobileCardRow className="mb-2">
                    <MobileCardBadge tone={successTone(deal.successStatus)}>
                      {deal.successStatus === 'success' ? '성공' : deal.successStatus === 'failed' ? '실패' : deal.successStatus === 'no-quote' ? '미견적' : '진행중'}
                    </MobileCardBadge>
                    <MobileCardBadge tone={getStageTone(deal.status)}>
                      {getStatusLabel(deal.status)}
                    </MobileCardBadge>
                    <InflowBadge requirements={deal.requirements} />
                    {!deal.isChecked && (
                      <span className="flex-1 text-right">
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold">
                          미확인
                        </span>
                      </span>
                    )}
                  </MobileCardRow>
                  
                  <MobileCardField
                    label="기업명"
                    value={
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span className="font-semibold">{deal.company}</span>
                      </div>
                    }
                  />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <MobileCardField
                      label="담당자"
                      value={
                        <div>
                          <div className="font-medium">{deal.contactName}</div>
                          <div className="text-[13px] text-slate-500">{deal.contactPosition}</div>
                        </div>
                      }
                    />
                    <MobileCardField
                      label="고객책임자"
                      value={<span className="font-medium">{deal.salesManager}</span>}
                    />
                  </div>
                  
                  <MobileCardField
                    label="희망서비스"
                    value={<span className="font-medium text-slate-900">{deal.desiredService}</span>}
                  />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <MobileCardField
                      label="총수량"
                      value={<span className="font-semibold">{deal.totalQuantity.toLocaleString()}</span>}
                    />
                    <MobileCardField
                      label="견적금액"
                      value={<span className="font-semibold text-slate-900">{deal.quotationAmount}</span>}
                    />
                  </div>
                  
                  <MobileCardField
                    label="문의 등록일"
                    value={
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-[13px]">{deal.registrationDate}</span>
                      </div>
                    }
                  />
                </MobileCard>
              ))}
            </div>
          ) : (
            /* 데스크톱 테이블 뷰 */
            <div className={`${TABLE.wrap} relative`}>
              <div 
                className={statusDropdownOpen || salesManagerDropdownOpen || successStatusDropdownOpen ? "overflow-visible" : "overflow-x-auto"}
              >
                <table className="w-full">
              <thead className={TABLE.thead}>
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600">
                    확인
                  </th>
                  <th 
                    className={`px-4 py-4 text-left text-xs font-semibold text-slate-600 ${TABLE.thSortable}`}
                    onClick={() => handleSort('registrationDate')}
                  >
                    <div className="flex items-center gap-1">
                      문의 등록일
                      {sortField === 'registrationDate' && (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-blue-600" />
                        )
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 relative">
                    <div className="flex items-center gap-1">
                      진행상태
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusDropdownOpen(!statusDropdownOpen);
                          setSalesManagerDropdownOpen(false);
                          setSuccessStatusDropdownOpen(false);
                        }}
                        className="hover:bg-slate-200 rounded p-1.5 transition-colors"
                        aria-label="필터"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {selectedStatuses.length > 0 && (
                        <span className="ml-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          {selectedStatuses.length}
                        </span>
                      )}
                    </div>
                    {statusDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[1000] min-w-[200px] max-h-[300px] overflow-y-auto">
                        <div className="p-2 space-y-1">
                          {customerJourneyStages.map((stage) => (
                            <label
                              key={stage.id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedStatuses.includes(stage.id)}
                                onChange={() => toggleStatusFilter(stage.id)}
                                className="rounded border-slate-300"
                              />
                              <span className="text-sm text-slate-700">{stage.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600">
                    기업명
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600">
                    담당자명/직책
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600">
                    연락처
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600">
                    희망서비스
                  </th>
                  <th 
                    className={`px-4 py-4 text-left text-xs font-semibold text-slate-600 ${TABLE.thSortable}`}
                    onClick={() => handleSort('totalQuantity')}
                  >
                    <div className="flex items-center gap-1">
                      총수량
                      {sortField === 'totalQuantity' && (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-blue-600" />
                        )
                      )}
                    </div>
                  </th>
                  <th 
                    className={`px-4 py-4 text-left text-xs font-semibold text-slate-600 ${TABLE.thSortable}`}
                    onClick={() => handleSort('quotationAmount')}
                  >
                    <div className="flex items-center gap-1">
                      견적금액
                      {sortField === 'quotationAmount' && (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-blue-600" />
                        )
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 relative">
                    <div className="flex items-center gap-1">
                      고객책임자
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSalesManagerDropdownOpen(!salesManagerDropdownOpen);
                          setStatusDropdownOpen(false);
                          setSuccessStatusDropdownOpen(false);
                        }}
                        className="hover:bg-slate-200 rounded p-1.5 transition-colors"
                        aria-label="필터"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {selectedSalesManagers.length > 0 && (
                        <span className="ml-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          {selectedSalesManagers.length}
                        </span>
                      )}
                    </div>
                    {salesManagerDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[1000] min-w-[200px] max-h-[300px] overflow-y-auto">
                        <div className="p-2 space-y-1">
                          {uniqueSalesManagers.map((manager) => (
                            <label
                              key={manager}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedSalesManagers.includes(manager)}
                                onChange={() => toggleSalesManagerFilter(manager)}
                                className="rounded border-slate-300"
                              />
                              <span className="text-sm text-slate-700">{manager}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 relative">
                    <div className="flex items-center gap-1">
                      성공여부
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSuccessStatusDropdownOpen(!successStatusDropdownOpen);
                          setStatusDropdownOpen(false);
                          setSalesManagerDropdownOpen(false);
                        }}
                        className="hover:bg-slate-200 rounded p-1.5 transition-colors"
                        aria-label="필터"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {selectedSuccessStatuses.length > 0 && (
                        <span className="ml-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          {selectedSuccessStatuses.length}
                        </span>
                      )}
                    </div>
                    {successStatusDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[1000] min-w-[180px] max-h-[300px] overflow-y-auto">
                        <div className="p-2 space-y-1">
                          <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSuccessStatuses.includes('success')}
                              onChange={() => toggleSuccessStatusFilter('success')}
                              className="rounded border-slate-300"
                            />
                            <span className="text-sm text-slate-700">수주 성공</span>
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSuccessStatuses.includes('in-progress')}
                              onChange={() => toggleSuccessStatusFilter('in-progress')}
                              className="rounded border-slate-300"
                            />
                            <span className="text-sm text-slate-700">진행중</span>
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSuccessStatuses.includes('failed')}
                              onChange={() => toggleSuccessStatusFilter('failed')}
                              className="rounded border-slate-300"
                            />
                            <span className="text-sm text-slate-700">수주 실패</span>
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSuccessStatuses.includes('no-quote')}
                              onChange={() => toggleSuccessStatusFilter('no-quote')}
                              className="rounded border-slate-300"
                            />
                            <span className="text-sm text-slate-700">미견적</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-semibold text-slate-600">
                    삭제
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedDeals.map((deal) => (
                  <tr
                    key={deal.id}
                    className={TABLE.rowClickable}
                    onClick={() => handleDealSelect(deal)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center" onClick={(e) => handleToggleChecked(deal.id, e)}>
                        {deal.isChecked ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 cursor-pointer hover:text-emerald-700" />
                        ) : (
                          <div className="w-5 h-5 border-2 border-slate-400 rounded-full cursor-pointer hover:border-emerald-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-700 tabular-nums">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {deal.registrationDate}
                      </div>
                      <InflowBadge requirements={deal.requirements} className="mt-1.5" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="relative">
                        {editingStatusId === deal.id ? (
                          <div className="relative">
                            <select
                              value={deal.status}
                              onChange={(e) => handleStatusChange(deal.id, e.target.value as Deal['status'])}
                              onBlur={() => setEditingStatusId(null)}
                              autoFocus
                              className="px-2.5 py-1 rounded-full text-xs font-medium border border-slate-300 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {customerJourneyStages.map((stage) => (
                                <option key={stage.id} value={stage.id}>
                                  {stage.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span
                            className={`${BADGE} ${TONE[getStageTone(deal.status)]} cursor-pointer hover:shadow-md transition-shadow`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingStatusId(deal.id);
                            }}
                          >
                            {getStatusLabel(deal.status)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-900 font-medium">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        {deal.company}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{deal.contactName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{deal.contactPosition}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {deal.phone}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          {deal.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-slate-900">{deal.desiredService}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-700 tabular-nums">
                        <Package className="w-4 h-4 text-slate-400" />
                        {deal.totalQuantity}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">₩{formatAmount(parseQuotationAmount(deal.quotationAmount))}</span>
                    </td>
                    <td className="px-4 py-4">
                      {editingSalesManagerId === deal.id ? (
                        <select
                          value={deal.salesManager}
                          onChange={(e) => handleSalesManagerInlineChange(deal.id, e.target.value)}
                          onBlur={() => setEditingSalesManagerId(null)}
                          autoFocus
                          className="px-2 py-1 text-sm border border-slate-300 bg-white rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">선택하세요</option>
                          {customerManagerNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-1 py-0.5 -mx-1 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSalesManagerId(deal.id);
                          }}
                        >
                          {deal.salesManager ? (
                            <>
                              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-blue-700 text-xs font-semibold">
                                  {deal.salesManager.charAt(0)}
                                </span>
                              </div>
                              <span className="text-sm text-slate-700">{deal.salesManager}</span>
                            </>
                          ) : (
                            <span className="text-sm text-slate-400">미지정</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="relative">
                        {editingSuccessStatusId === deal.id ? (
                          <div className="relative">
                            <select
                              value={deal.successStatus}
                              onChange={(e) => handleSuccessStatusChange(deal.id, e.target.value as Deal['successStatus'])}
                              onBlur={() => setEditingSuccessStatusId(null)}
                              autoFocus
                              className="px-2.5 py-1 rounded-full text-xs font-medium border border-slate-300 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="in-progress">진행중</option>
                              <option value="success">성공</option>
                              <option value="failed">실패</option>
                              <option value="no-quote">미견적</option>
                            </select>
                          </div>
                        ) : (
                          <span
                            className={`${BADGE} ${TONE[successTone(deal.successStatus)]} cursor-pointer hover:shadow-md transition-shadow`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSuccessStatusId(deal.id);
                            }}
                          >
                            {deal.successStatus === 'success' ? '성공' : deal.successStatus === 'failed' ? '실패' : deal.successStatus === 'no-quote' ? '미견적' : '진행중'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        className={ICON_BTN_DANGER}
                        onClick={(e) => handleDeleteDeal(deal.id, e)}
                        aria-label="삭제"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedDeals.length === 0 && (
              isLoading && dealsData.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-[15px]">불러오는 중…</p>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-[15px]">검색 결과가 없습니다.</p>
                  <p className="text-[13px] mt-2">다른 검색어나 필터를 시도해보세요.</p>
                </div>
              )
            )}
          </div>
        </div>
          )}
        </>
      )}

      {/* Pipeline View */}
      {viewMode === 'pipeline' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {customerJourneyStages.map((stage) => {
            const stageDeals = dealsByStage(stage.id);
            const totalValue = stageDeals.reduce((sum, deal) => {
              const value = parseQuotationAmount(deal.quotationAmount);
              return sum + value;
            }, 0);
            const Icon = stage.icon;

            return (
              <div key={stage.id} className="bg-slate-100/70 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stageStyle(stage.color).dot}`}></div>
                    <h3 className="font-semibold text-slate-900 text-sm">{stage.name}</h3>
                  </div>
                  <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded">
                    {stageDeals.length}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mb-4">
                  총 ₩{formatAmount(totalValue)}
                </p>

                <div className="space-y-3">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleDealSelect(deal)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-slate-900 text-sm line-clamp-1">
                          {deal.desiredService}
                        </h4>
                        <div onClick={(e) => handleToggleChecked(deal.id, e)}>
                          {deal.isChecked ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 cursor-pointer hover:text-emerald-700" />
                          ) : (
                            <div className="w-4 h-4 border-2 border-slate-400 rounded-full flex-shrink-0 cursor-pointer hover:border-emerald-400" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {deal.company}
                      </div>

                      <div className="text-xs text-slate-600 mb-2">
                        {deal.contactName} {deal.contactPosition}
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums">₩{formatAmount(parseQuotationAmount(deal.quotationAmount))}</span>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Package className="w-3 h-3" />
                          {deal.totalQuantity}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {deal.salesManager}
                        </div>
                        {deal.successStatus === 'success' && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${TONE.emerald}`}>
                            성공
                          </span>
                        )}
                        {deal.successStatus === 'failed' && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${TONE.red}`}>
                            실패
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deal Detail Modal */}
      {selectedDeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white md:rounded-xl shadow-xl max-w-[1600px] w-full h-full md:h-auto md:max-h-[95vh] flex flex-col overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shadow-sm flex-shrink-0">
              <div className="flex-1 min-w-0 mr-3">
                <h2 className="text-lg md:text-2xl font-semibold text-slate-900 truncate">
                  {isAddingNewDeal ? '새 거래 추가' : '거래 상세 정보'}
                </h2>
                <p className="text-[13px] md:text-[15px] text-slate-500 mt-0.5 md:mt-1 truncate">
                  {isAddingNewDeal ? '거래 정보를 입력하세요' : selectedDeal.desiredService}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedDeal(null);
                  setIsAddingNewDeal(false);
                  setIsEditMode(false);
                  setEditedDeal(null);
                }}
                className={`${MODAL_CLOSE} flex-shrink-0`}
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4 md:space-y-6 flex-1 overflow-y-auto">
              {/* 진행 단계 */}
              <div>
                <h4 className="text-[14px] md:text-[15px] font-semibold text-slate-700 mb-3 md:mb-4">진행 단계</h4>
                <div className="overflow-x-auto pb-1">
                <div className="flex gap-2 min-w-max md:min-w-0 md:grid md:grid-cols-7">
                  {customerJourneyStages.map((stage, index) => {
                    const currentDeal = isEditMode ? editedDeal : selectedDeal;
                    const isActive = currentDeal && stage.id === currentDeal.status;
                    const isPast = currentDeal && customerJourneyStages.findIndex((s) => s.id === currentDeal.status) > index;
                    const Icon = stage.icon;
                    
                    return (
                      <div
                        key={stage.id}
                        className={`flex-shrink-0 w-[90px] md:w-auto flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                          !isAddingNewDeal ? 'cursor-pointer hover:shadow-md' : isEditMode ? 'cursor-pointer hover:shadow-md' : 'cursor-not-allowed opacity-70'
                        } ${
                          isActive
                            ? 'bg-blue-50 border-blue-300 shadow-sm'
                            : isPast
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => {
                          if (!isAddingNewDeal || isEditMode) {
                            if (isEditMode && editedDeal) {
                              handleFieldChange('status', stage.id);
                            } else {
                              handleStatusChange(selectedDeal!.id, stage.id as Deal['status']);
                            }
                          }
                        }}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-md'
                              : isPast
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-400 group-hover:bg-slate-300'
                          }`}
                        >
                          {isPast ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : (
                            <Icon className="w-5 h-5" />
                          )}
                        </div>
                        <span
                          className={`text-[12px] font-medium text-center leading-tight ${
                            isActive
                              ? 'text-blue-700'
                              : isPast
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {stage.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                </div>
                {!isAddingNewDeal && (
                  <p className="text-[13px] text-slate-500 mt-3 text-center">단계를 클릭하여 진행상태를 변경할 수 있습니다</p>
                )}
              </div>

              {/* 기본 정보 */}
              <div className="bg-slate-50 p-5 rounded-xl">
                <h4 className="text-[15px] font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  기본 정보
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[13px] text-slate-500 mb-1">기업명 {isAddingNewDeal && <span className="text-red-500">*</span>}</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.company || ''}
                        onChange={(e) => handleFieldChange('company', e.target.value)}
                        placeholder="기업명을 입력하세요"
                        className={`w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isAddingNewDeal && !editedDeal?.company?.trim() ? 'border-red-300' : 'border-slate-300'}`}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-medium text-slate-900">{selectedDeal.company}</p>
                        <AiCompanyInfoButton companyName={selectedDeal.company} />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[13px] text-slate-500 mb-1">희망 서비스</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.desiredService || ''}
                        onChange={(e) => handleFieldChange('desiredService', e.target.value)}
                        placeholder="희망하는 서비스를 입력하세요"
                        className="w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">{selectedDeal.desiredService}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[13px] text-slate-500 mb-1">담당자명 / 직책</p>
                    {isEditMode ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={editedDeal?.contactName || ''}
                          onChange={(e) => handleFieldChange('contactName', e.target.value)}
                          placeholder="담당자명"
                          className="w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={editedDeal?.contactPosition || ''}
                          onChange={(e) => handleFieldChange('contactPosition', e.target.value)}
                          placeholder="직책"
                          className="w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">
                        {selectedDeal.contactName} / {selectedDeal.contactPosition}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[13px] text-slate-500 mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> 전화번호
                    </p>
                    {isEditMode ? (
                      <input
                        type="tel"
                        value={editedDeal?.phone || ''}
                        onChange={(e) => handleFieldChange('phone', e.target.value)}
                        placeholder="010-0000-0000"
                        className={`w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-slate-300`}
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">{selectedDeal.phone}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[13px] text-slate-500 mb-1 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> 이메일
                    </p>
                    {isEditMode ? (
                      <input
                        type="email"
                        value={editedDeal?.email || ''}
                        onChange={(e) => handleFieldChange('email', e.target.value)}
                        placeholder="example@company.com"
                        className="w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">{selectedDeal.email}</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-[13px] text-slate-500 mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> 주소
                    </p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.address || ''}
                        onChange={(e) => handleFieldChange('address', e.target.value)}
                        placeholder="주소를 입력하세요"
                        className="w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">{selectedDeal.address}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 거래 정보 */}
              <div>
                <h4 className="text-[15px] font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  거래 정보
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className={TILE.box}>
                    <p className={`${TILE.label} mb-1`}>문의 등록일</p>
                    {isEditMode ? (
                      <input
                        type="date"
                        value={editedDeal?.registrationDate || ''}
                        onChange={(e) => handleFieldChange('registrationDate', e.target.value)}
                        className={`w-full px-3 py-2 text-lg md:text-xl font-bold tabular-nums mt-2 ${INPUT}`}
                      />
                    ) : (
                      <>
                        <p className={TILE.value}>
                          {selectedDeal.registrationDate}
                        </p>
                        <InflowDetail requirements={selectedDeal.requirements} />
                      </>
                    )}
                  </div>
                  <div className={TILE.box}>
                    <p className={`${TILE.label} mb-1`}>진행상태</p>
                    <p className="mt-2">
                      <span className={`${BADGE} ${TONE[getStageTone(selectedDeal.status)]}`}>
                        {getStatusLabel(selectedDeal.status)}
                      </span>
                    </p>
                  </div>
                  <div className={TILE.box}>
                    <p className={`${TILE.label} mb-1`}>총수량</p>
                    {isEditMode ? (
                      <input
                        type="number"
                        value={editedDeal?.totalQuantity || 0}
                        onChange={(e) => handleFieldChange('totalQuantity', parseInt(e.target.value) || 0)}
                        className={`w-full px-3 py-2 text-lg md:text-xl font-bold tabular-nums mt-2 ${INPUT}`}
                      />
                    ) : (
                      <p className={TILE.value}>
                        {selectedDeal.totalQuantity}
                      </p>
                    )}
                  </div>
                  <div className={TILE.box}>
                    <p className={`${TILE.label} mb-1`}>견적금액</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editedDeal?.quotationAmount || ''}
                        onChange={(e) => handleFieldChange('quotationAmount', e.target.value)}
                        placeholder="₩0만"
                        className={`w-full px-3 py-2 text-lg md:text-xl font-bold tabular-nums mt-2 ${INPUT}`}
                      />
                    ) : (
                      <p className={TILE.value}>
                        {selectedDeal.quotationAmount}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 상세 수량 */}
              <div className="bg-slate-50 p-5 rounded-xl">
                <h4 className="text-[15px] font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  상세 수량
                </h4>
                {isEditMode ? (() => {
                  const dqData = parseDetailedQuantity(editedDeal?.detailedQuantity || '');
                  const updateDQ = (updated: DetailedQuantityData) => {
                    const total = Object.values(updated.categories).reduce((s, v) => s + (v || 0), 0)
                      + updated.others.reduce((s, o) => s + (o.quantity || 0), 0);
                    if (editedDeal) {
                      setEditedDeal({
                        ...editedDeal,
                        detailedQuantity: serializeDetailedQuantity(updated),
                        totalQuantity: total,
                      });
                    }
                  };
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {QUANTITY_CATEGORIES.map((cat) => (
                          <div key={cat} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                            <label className="text-[13px] text-slate-600 min-w-0 flex-1 truncate">{cat}</label>
                            <input
                              type="number"
                              min={0}
                              value={dqData.categories[cat] || 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateDQ({ ...dqData, categories: { ...dqData.categories, [cat]: val } });
                              }}
                              className="w-12 md:w-16 px-2 py-1 text-[13px] text-right text-slate-700 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <span className="text-[12px] text-slate-400">대</span>
                          </div>
                        ))}
                      </div>
                      {/* 기타 항목 */}
                      <div className="border-t border-slate-200 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-medium text-slate-600">기타</span>
                          <button
                            type="button"
                            onClick={() => updateDQ({ ...dqData, others: [...dqData.others, { name: '', quantity: 0 }] })}
                            className="py-1.5 px-2 text-[13px] text-blue-600 hover:text-blue-800 font-medium rounded"
                          >
                            + 항목 추가
                          </button>
                        </div>
                        {dqData.others.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const updated = [...dqData.others];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                updateDQ({ ...dqData, others: updated });
                              }}
                              placeholder="종목명"
                              className="flex-1 px-3 py-1.5 text-[13px] text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <input
                              type="number"
                              min={0}
                              value={item.quantity || 0}
                              onChange={(e) => {
                                const updated = [...dqData.others];
                                updated[idx] = { ...updated[idx], quantity: parseInt(e.target.value) || 0 };
                                updateDQ({ ...dqData, others: updated });
                              }}
                              className="w-12 md:w-16 px-2 py-1.5 text-[13px] text-right text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <span className="text-[12px] text-slate-400">대</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = dqData.others.filter((_, i) => i !== idx);
                                updateDQ({ ...dqData, others: updated });
                              }}
                              className={`${ICON_BTN_DANGER} flex-shrink-0`}
                              aria-label="항목 삭제"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-[15px] text-slate-700">{summarizeDetailedQuantity(selectedDeal.detailedQuantity)}</p>
                )}
              </div>

              {/* 요구사항 및 메모 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <h4 className="text-[15px] font-semibold text-slate-700 mb-3">세부 전달사항</h4>
                  {isEditMode ? (
                    <textarea
                      value={editedDeal?.requirements || ''}
                      onChange={(e) => handleFieldChange('requirements', e.target.value)}
                      placeholder="세부 전달사항을 입력하세요"
                      rows={3}
                      className="w-full px-3 py-2 text-base text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  ) : (
                    <p className="text-[15px] text-slate-700">{stripInflow(selectedDeal.requirements)}</p>
                  )}
                </div>
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <h4 className="text-[15px] font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <StickyNote className="w-4 h-4" />
                    관리 메모
                  </h4>
                  <textarea
                    value={isEditMode ? (editedDeal?.managementMemo || '') : (selectedDeal.managementMemo || '')}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (isEditMode) {
                        handleFieldChange('managementMemo', value);
                      } else {
                        const updatedDeal = { ...selectedDeal, managementMemo: value };
                        setSelectedDeal(updatedDeal);
                        setDealsData(prev => prev.map(d => d.id === updatedDeal.id ? updatedDeal : d));
                      }
                    }}
                    onFocus={() => {
                      inlineFocusRef.current = true;
                      inlineStartRef.current.memo = selectedDeal.managementMemo || '';
                    }}
                    onBlur={() => {
                      inlineFocusRef.current = false;
                      if (!isEditMode && selectedDeal && (selectedDeal.managementMemo || '') !== inlineStartRef.current.memo) {
                        inlineStartRef.current.memo = selectedDeal.managementMemo || '';
                        void saveDealFields(selectedDeal, { managementMemo: selectedDeal.managementMemo || '' }, '관리 메모');
                      }
                    }}
                    placeholder="내부 관리용 메모를 입력하세요"
                    rows={3}
                    className="w-full px-3 py-2 text-base text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>

              {/* 첨부파일 */}
              {(selectedDeal.file1Path || selectedDeal.file2Path || selectedDeal.file3Path) && (
                <div className="bg-slate-50 p-5 rounded-xl">
                  <h4 className="text-[15px] font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    첨부파일
                  </h4>
                  <div className="space-y-2">
                    {[
                      { name: selectedDeal.file1Name, path: selectedDeal.file1Path, num: 1 },
                      { name: selectedDeal.file2Name, path: selectedDeal.file2Path, num: 2 },
                      { name: selectedDeal.file3Name, path: selectedDeal.file3Path, num: 3 },
                    ].filter(f => f.path).map((file) => (
                      <button
                        key={file.num}
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(`https://airtor.co.kr/online/download.php?on_num=${selectedDeal.id}&idx=${file.num}`, '_blank');
                        }}
                        className="flex items-center gap-3 px-4 py-3 w-full bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group text-left"
                      >
                        <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                        <span className="text-[14px] text-slate-700 group-hover:text-blue-700">{file.name || file.path}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 고객사 파일 — 이 회사 파일을 올리고 내려받는다. 수주되면 고객 상세에도 그대로 보인다 */}
              {!isAddingNewDeal && selectedDeal.id > 0 && (
                <CompanyFiles
                  company={selectedDeal.company || ''}
                  dealId={selectedDeal.id}
                  customerId={dealCustomerIds?.get(selectedDeal.id) ?? null}
                  title="고객사 파일"
                  variant="panel"
                />
              )}

              {/* 담당자 및 일정 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-[13px] font-medium text-slate-500 mb-2">고객책임자</p>
                  {isEditMode ? (
                    <select
                      value={editedDeal?.salesManager || ''}
                      onChange={(e) => handleFieldChange('salesManager', e.target.value)}
                      className="w-full px-3 py-2 text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                    >
                      <option value="">선택하세요</option>
                      {customerManagerNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      {selectedDeal.salesManager ? (
                        <>
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-700 text-xs font-semibold">
                              {selectedDeal.salesManager.charAt(0)}
                            </span>
                          </div>
                          <span className="text-[15px] font-medium text-slate-900">{selectedDeal.salesManager}</span>
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">미지정</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-[13px] font-medium text-slate-500 mb-2">확정작업일</p>
                  <input
                    type="date"
                    value={isEditMode ? (editedDeal?.confirmedWorkDate || '') : (selectedDeal.confirmedWorkDate || '')}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (isEditMode) {
                        handleFieldChange('confirmedWorkDate', value);
                      } else {
                        // 입력 중(연도 타이핑 등)에는 화면에만 두고, 칸을 벗어날 때 저장한다
                        const updatedDeal = { ...selectedDeal, confirmedWorkDate: value };
                        setSelectedDeal(updatedDeal);
                        setDealsData(prev => prev.map(d => d.id === updatedDeal.id ? updatedDeal : d));
                      }
                    }}
                    onFocus={() => {
                      inlineFocusRef.current = true;
                      inlineStartRef.current.workDate = selectedDeal.confirmedWorkDate || '';
                    }}
                    onBlur={() => {
                      inlineFocusRef.current = false;
                      if (isEditMode || !selectedDeal) return;
                      const value = selectedDeal.confirmedWorkDate || '';
                      if (value === inlineStartRef.current.workDate) return;
                      if (value && !isValidYmd(value)) {
                        onNotification?.(`[${selectedDeal.company}] 확정작업일 "${value}"은(는) 올바른 날짜가 아니어서 저장하지 않았습니다`);
                        return;
                      }
                      inlineStartRef.current.workDate = value;
                      void saveDealFields(selectedDeal, { confirmedWorkDate: value }, '확정작업일').then((r) => {
                        if (r) onNotification?.(`[${selectedDeal.company}] 확정작업일이 ${value || '미정'}(으)로 변경되었습니다`);
                      });
                    }}
                    className="w-full px-3 py-2 text-base font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                  />
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-[13px] font-medium text-slate-500 mb-2">성공여부</p>
                  <div className="mt-2">
                    {selectedDeal.successStatus === 'success' ? (
                      <span className={`px-3 py-1.5 rounded-full text-[15px] font-semibold border ${TONE.emerald}`}>
                        계약 성공
                      </span>
                    ) : selectedDeal.successStatus === 'failed' ? (
                      <span className={`px-3 py-1.5 rounded-full text-[15px] font-semibold border ${TONE.red}`}>
                        계약 실패
                      </span>
                    ) : selectedDeal.successStatus === 'no-quote' ? (
                      <span className={`px-3 py-1.5 rounded-full text-[15px] font-semibold border ${TONE.orange}`}>
                        미견적
                      </span>
                    ) : (
                      <span className={`px-3 py-1.5 rounded-full text-[15px] font-semibold border ${TONE.slate}`}>
                        진행중
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>
            {/* 액션 버튼 - sticky footer */}
            <div className="px-4 md:px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0">
              <div className="flex gap-3">
                {isEditMode ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className={`${btn('primary', 'lg')} flex-1`}
                    >
                      {isAddingNewDeal ? '거래 추가' : '저장하기'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className={`${btn('secondary', 'lg')} flex-1`}
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleEditClick}
                      className={`${btn('primary', 'lg')} flex-1`}
                    >
                      수정하기
                    </button>
                    <button
                      onClick={() => setSelectedDeal(null)}
                      className={`${btn('secondary', 'lg')} flex-1`}
                    >
                      목록보기
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 확정작업일 입력 팝업 — 수주확정/성공 전환 시 미입력이면 alert 대신 노출.
          '다음에 입력하기' 버튼으로 빈 날짜인 채 진행 가능 (정렬 시 최하단 배치 감수). */}
      {workDateModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setWorkDateModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg">
                  <CalendarCheck className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-[16px] font-semibold text-slate-900">확정작업일 입력</h3>
              </div>
              <button
                onClick={() => setWorkDateModal(null)}
                className={MODAL_CLOSE}
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[14px] text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">[{workDateModal.companyName}]</span>{' '}
                {workDateModal.actionLabel} 처리 시 확정작업일을 함께 입력하시겠어요?
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  작업일이 비어 있으면 프로젝트 관리 목록에서 정렬 기준이 없어 <strong>최하단에 배치</strong>됩니다.
                </p>
              </div>
              <input
                type="date"
                value={workDateModal.date}
                onChange={(e) =>
                  setWorkDateModal((prev) => (prev ? { ...prev, date: e.target.value } : prev))
                }
                className="w-full px-3 py-2.5 text-[15px] font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-2">
              <button
                onClick={() => workDateModal.onSubmit('')}
                className={`${btn('secondary')} flex-1`}
              >
                다음에 입력하기
              </button>
              <button
                onClick={() => workDateModal.onSubmit(workDateModal.date)}
                disabled={!workDateModal.date}
                className={`${btn('primary')} flex-1`}
              >
                저장하고 진행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}