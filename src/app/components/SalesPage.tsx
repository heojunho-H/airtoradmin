import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Plus,
  MoreVertical,
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
  successStatus: 'in-progress' | 'success' | 'failed'; // 성공여부
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

// API에 딜 데이터를 저장 (추가)
export async function createDeal(deal: Omit<Deal, 'id'>): Promise<number> {
  const response = await fetch('/api/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deal),
  });
  if (!response.ok) throw new Error('딜 추가 실패');
  const result = await response.json();
  return result.id;
}

// API에 딜 데이터를 수정
export async function updateDeal(deal: Deal): Promise<void> {
  const response = await fetch('/api/deals', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deal),
  });
  if (!response.ok) throw new Error('딜 수정 실패');
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

const QUANTITY_CATEGORIES = [
  '벽걸이형', '스탠드형', '1way 천정형', '2way 천정형',
  '4way 천정형', '원형 천정형', 'FCU형', '매립덕트형',
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

interface SalesPageProps {
  onDealSuccess?: (deal: Deal) => void;
  externalDealsState?: [Deal[], (deals: Deal[] | ((prev: Deal[]) => Deal[])) => void];
  customerManagerNames?: string[];
  onNotification?: (message: string) => void;
}

export function SalesPage({ onDealSuccess, externalDealsState, customerManagerNames = [], onNotification }: SalesPageProps = {}) {
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
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
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [isAddingNewDeal, setIsAddingNewDeal] = useState(false);
  const [activeDatePreset, setActiveDatePreset] = useState<string>('이번 달');
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
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
    const expiredDeals = dealsData.filter((deal) => {
      if (deal.successStatus !== 'in-progress') return false;
      const regDate = new Date(deal.registrationDate);
      const diffDays = Math.floor((today.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 15;
    });

    if (expiredDeals.length > 0) {
      setDealsData((prev) =>
        prev.map((deal) => {
          const regDate = new Date(deal.registrationDate);
          const diffDays = Math.floor((today.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
          if (deal.successStatus === 'in-progress' && diffDays > 15) {
            return { ...deal, successStatus: 'failed' };
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

  // 필터 상태
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSuccessStatuses, setSelectedSuccessStatuses] = useState<string[]>([]);
  const [selectedSalesManagers, setSelectedSalesManagers] = useState<string[]>([]);
  const [minQuantity, setMinQuantity] = useState<string>('');
  const [maxQuantity, setMaxQuantity] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  
  // 정렬 상태
  const [sortField, setSortField] = useState<'registrationDate' | 'totalQuantity' | 'quotationAmount' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // 헤더 필터 드롭다운 상태
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [salesManagerDropdownOpen, setSalesManagerDropdownOpen] = useState(false);
  const [successStatusDropdownOpen, setSuccessStatusDropdownOpen] = useState(false);

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

  // 고객여정 스테이지 색상 매핑 함수
  const getStageColorStyle = (color: string) => {
    const colorMap: Record<string, { border: string; bg: string; icon: string }> = {
      blue: { border: '#93c5fd', bg: '#dbeafe', icon: '#1d4ed8' },
      cyan: { border: '#67e8f9', bg: '#cffafe', icon: '#0891b2' },
      purple: { border: '#c4b5fd', bg: '#ede9fe', icon: '#7c3aed' },
      indigo: { border: '#a5b4fc', bg: '#e0e7ff', icon: '#4f46e5' },
      amber: { border: '#fcd34d', bg: '#fef3c7', icon: '#d97706' },
      orange: { border: '#fdba74', bg: '#fed7aa', icon: '#ea580c' },
      green: { border: '#86efac', bg: '#d1fae5', icon: '#15803d' },
    };
    return colorMap[color] || colorMap.green;
  };

  const getPipelineColorByStage = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: '#3b82f6',
      cyan: '#06b6d4',
      purple: '#8b5cf6',
      indigo: '#6366f1',
      amber: '#f59e0b',
      orange: '#f97316',
      green: '#10b981',
    };
    return colorMap[color] || colorMap.green;
  };

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
      'in-progress': '진행중', 'success': '계약 성공', 'failed': '계약 실패',
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
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
      { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
      { wch: 12 }, { wch: 12 },
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

    if (window.confirm(`"${dealToDelete.company}" 거래를 삭제하시겠습니까?`)) {
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

  const handleStatusChange = (dealId: number, newStatus: Deal['status']) => {
    const targetDeal = dealsData.find((d) => d.id === dealId);
    if (!targetDeal) return;

    const updatedDeal = {
      ...targetDeal,
      status: newStatus,
      successStatus: newStatus === 'confirmed' ? 'success' as const : targetDeal.successStatus
    };

    // DB에 저장 (비동기, UI는 즉시 반영)
    updateDeal(updatedDeal).catch((err) => console.error('상태 변경 저장 실패:', err));

    setDealsData((prevDeals) =>
      prevDeals.map((deal) => deal.id === dealId ? updatedDeal : deal)
    );
    setEditingStatusId(null);

    if (selectedDeal && selectedDeal.id === dealId) {
      setSelectedDeal(updatedDeal);
    }

    onNotification?.(`[${targetDeal.company}] 진행상태가 "${getStatusLabel(newStatus)}"(으)로 변경되었습니다`);

    // 수주확정 시 고객 관리 페이지에 자동 등록
    if (newStatus === 'confirmed' && onDealSuccess) {
      onDealSuccess(updatedDeal);
    }
  };

  const handleSuccessStatusChange = (dealId: number, newSuccessStatus: Deal['successStatus']) => {
    const targetDeal = dealsData.find((d) => d.id === dealId);
    if (!targetDeal) return;

    const updatedDeal = { ...targetDeal, successStatus: newSuccessStatus };

    // DB에 저장
    updateDeal(updatedDeal).catch((err) => console.error('성공여부 변경 저장 실패:', err));

    setDealsData((prevDeals) =>
      prevDeals.map((deal) => deal.id === dealId ? updatedDeal : deal)
    );
    setEditingSuccessStatusId(null);

    if (selectedDeal && selectedDeal.id === dealId) {
      setSelectedDeal(updatedDeal);
    }

    const successLabel = newSuccessStatus === 'success' ? '성공' : newSuccessStatus === 'failed' ? '실패' : '진행중';
    onNotification?.(`[${targetDeal.company}] 성공여부가 "${successLabel}"(으)로 변경되었습니다`);

    // 성공으로 변경 시 고객 관리 페이지에 자동 등록
    if (newSuccessStatus === 'success' && onDealSuccess) {
      onDealSuccess(updatedDeal);
    }
  };

  const handleSalesManagerInlineChange = (dealId: number, newManager: string) => {
    const targetDeal = dealsData.find((d) => d.id === dealId);
    if (!targetDeal) return;

    const updatedDeal = { ...targetDeal, salesManager: newManager };

    // DB에 저장
    updateDeal(updatedDeal).catch((err) => console.error('담당자 변경 저장 실패:', err));

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
    if (editedDeal) {
      if (isAddingNewDeal) {
        // 필수 입력: 전화번호, 기업명
        if (!editedDeal.phone.trim() || !editedDeal.company.trim()) {
          alert('전화번호와 기업명은 필수 입력 항목입니다.');
          return;
        }
        // 새 거래 추가 — DB 저장
        try {
          const newId = await createDeal(editedDeal);
          const newDeal = { ...editedDeal, id: newId };
          setDealsData((prevDeals) => [...prevDeals, newDeal]);
          setSelectedDeal(null);
          setIsAddingNewDeal(false);
          onNotification?.(`[${editedDeal.company}] 새 거래가 등록되었습니다`);
        } catch (err) {
          alert('거래 등록에 실패했습니다. 다시 시도해주세요.');
          console.error(err);
          return;
        }
      } else {
        // 기존 거래 수정 — DB 저장
        try {
          await updateDeal(editedDeal);
          setDealsData((prevDeals) =>
            prevDeals.map((deal) =>
              deal.id === editedDeal.id ? editedDeal : deal
            )
          );
          setSelectedDeal(editedDeal);
          onNotification?.(`[${editedDeal.company}] 거래 정보가 수정되었습니다`);
        } catch (err) {
          alert('거래 수정에 실패했습니다. 다시 시도해주세요.');
          console.error(err);
          return;
        }
      }
      setIsEditMode(false);
      setEditedDeal(null);
    }
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
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-[13px] font-medium text-slate-600 font-bold">조회 기간</span>
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
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">견적 문의 수</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{totalDeals}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">총 견적 금액</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">
                ₩{formatAmount(totalQuotationAmount)}
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
              <p className="text-[13px] text-slate-500 font-medium font-bold">계약 성공 수</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{successfulDeals}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">계약 성공 금액</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">
                ₩{formatAmount(successfulAmount)}
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
              <p className="text-[13px] text-slate-500 font-medium font-bold">계약 성공률(건수)</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{successRateByCount}%</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-xl">
              <Percent className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">계약 성공률(금액)</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{successRateByAmount}%</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-xl">
              <Target className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Customer Journey Dashboard */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">고객여정 진행상황</h2>
          <p className="text-[13px] text-slate-500 mt-1">각 단계별 고객 수와 전환율을 확인하세요</p>
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
                <div 
                  className="bg-gradient-to-br from-white to-slate-50 rounded-xl border-2 border-slate-200 p-4 hover:shadow-lg transition-all hover:scale-105 cursor-pointer"
                  style={{
                    borderColor: getStageColorStyle(stage.color).border
                  }}
                >
                  <div className="flex flex-col space-y-3">
                    {/* Icon + Stage Name */}
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"
                        style={{
                          backgroundColor: getStageColorStyle(stage.color).bg
                        }}
                      >
                        <Icon 
                          className="w-4 h-4"
                          style={{
                            color: getStageColorStyle(stage.color).icon
                          }}
                        />
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
            className="px-5 py-2.5 bg-white text-green-700 border border-green-300 rounded-xl hover:bg-green-50 transition-all shadow-sm hover:shadow flex items-center gap-2"
          >
            <Download className="w-[18px] h-[18px]" />
            <span className="text-[14px] font-semibold">내보내기</span>
          </button>
          <button
            onClick={handleAddNewDeal}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow flex items-center gap-2"
          >
            <Plus className="w-[18px] h-[18px]" />
            <span className="text-[14px] font-semibold">거래 추가</span>
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

            {/* 필터 초��화 버튼 */}
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
                <MobileCard key={deal.id} onClick={() => setSelectedDeal(deal)}>
                  <MobileCardRow className="mb-2">
                    <MobileCardBadge variant={deal.successStatus === 'success' ? 'success' : deal.successStatus === 'failed' ? 'danger' : 'default'}>
                      {deal.successStatus === 'success' ? '성공' : deal.successStatus === 'failed' ? '실패' : '진행중'}
                    </MobileCardBadge>
                    <MobileCardBadge variant="primary">
                      {getStatusLabel(deal.status)}
                    </MobileCardBadge>
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
                    value={<span className="font-medium text-blue-600">{deal.desiredService}</span>}
                  />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <MobileCardField
                      label="총수량"
                      value={<span className="font-semibold">{deal.totalQuantity.toLocaleString()}</span>}
                    />
                    <MobileCardField
                      label="견적금액"
                      value={<span className="font-semibold text-green-600">{deal.quotationAmount}</span>}
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm relative">
              <div 
                className={statusDropdownOpen || salesManagerDropdownOpen || successStatusDropdownOpen ? "overflow-visible" : "overflow-x-auto"}
              >
                <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    확인
                  </th>
                  <th 
                    className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
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
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider relative">
                    <div className="flex items-center gap-1">
                      진행상태
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusDropdownOpen(!statusDropdownOpen);
                          setSalesManagerDropdownOpen(false);
                          setSuccessStatusDropdownOpen(false);
                        }}
                        className="hover:bg-slate-200 rounded p-1 transition-colors"
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
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    기업명
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    담당자명/직책
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    연락처
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    희망서비스
                  </th>
                  <th 
                    className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
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
                    className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
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
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider relative">
                    <div className="flex items-center gap-1">
                      고객책임자
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSalesManagerDropdownOpen(!salesManagerDropdownOpen);
                          setStatusDropdownOpen(false);
                          setSuccessStatusDropdownOpen(false);
                        }}
                        className="hover:bg-slate-200 rounded p-1 transition-colors"
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
                  <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider relative">
                    <div className="flex items-center gap-1">
                      성공여부
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSuccessStatusDropdownOpen(!successStatusDropdownOpen);
                          setStatusDropdownOpen(false);
                          setSalesManagerDropdownOpen(false);
                        }}
                        className="hover:bg-slate-200 rounded p-1 transition-colors"
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
                        </div>
                      </div>
                    )}
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    삭제
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedDeals.map((deal) => (
                  <tr
                    key={deal.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedDeal(deal)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center">
                        {deal.isChecked ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <div className="w-5 h-5 border-2 border-slate-300 rounded-full" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {deal.registrationDate}
                      </div>
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
                              className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:shadow-md transition-shadow"
                            style={{
                              backgroundColor:
                                getStatusColor(deal.status) === 'blue'
                                  ? '#eff6ff'
                                  : getStatusColor(deal.status) === 'cyan'
                                  ? '#ecfeff'
                                  : getStatusColor(deal.status) === 'purple'
                                  ? '#f5f3ff'
                                  : getStatusColor(deal.status) === 'indigo'
                                  ? '#eef2ff'
                                  : getStatusColor(deal.status) === 'amber'
                                  ? '#fffbeb'
                                  : getStatusColor(deal.status) === 'orange'
                                  ? '#fff7ed'
                                  : '#f0fdf4',
                              color:
                                getStatusColor(deal.status) === 'blue'
                                  ? '#1d4ed8'
                                  : getStatusColor(deal.status) === 'cyan'
                                  ? '#0891b2'
                                  : getStatusColor(deal.status) === 'purple'
                                  ? '#7c3aed'
                                  : getStatusColor(deal.status) === 'indigo'
                                  ? '#4f46e5'
                                  : getStatusColor(deal.status) === 'amber'
                                  ? '#d97706'
                                  : getStatusColor(deal.status) === 'orange'
                                  ? '#ea580c'
                                  : '#15803d',
                              borderColor:
                                getStatusColor(deal.status) === 'blue'
                                  ? '#bfdbfe'
                                  : getStatusColor(deal.status) === 'cyan'
                                  ? '#a5f3fc'
                                  : getStatusColor(deal.status) === 'purple'
                                  ? '#ddd6fe'
                                  : getStatusColor(deal.status) === 'indigo'
                                  ? '#a5b4fc'
                                  : getStatusColor(deal.status) === 'amber'
                                  ? '#fde68a'
                                  : getStatusColor(deal.status) === 'orange'
                                  ? '#fdba74'
                                  : '#bbf7d0',
                            }}
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
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
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
                      <div className="flex items-center gap-1.5 text-sm text-slate-700">
                        <Package className="w-4 h-4 text-slate-400" />
                        {deal.totalQuantity}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold text-slate-900">₩{formatAmount(parseQuotationAmount(deal.quotationAmount))}</span>
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
                          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-medium">
                              {deal.salesManager.charAt(0)}
                            </span>
                          </div>
                          <span className="text-sm text-slate-700">{deal.salesManager}</span>
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
                              className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="in-progress">진행중</option>
                              <option value="success">성공</option>
                              <option value="failed">실패</option>
                            </select>
                          </div>
                        ) : (
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:shadow-md transition-shadow"
                            style={{
                              backgroundColor:
                                deal.successStatus === 'success'
                                  ? '#ecfdf5'
                                  : deal.successStatus === 'failed'
                                  ? '#fef2f2'
                                  : '#f0fdf4',
                              color:
                                deal.successStatus === 'success'
                                  ? '#16a34a'
                                  : deal.successStatus === 'failed'
                                  ? '#dc2626'
                                  : '#6b7280',
                              borderColor:
                                deal.successStatus === 'success'
                                  ? '#a7f3d0'
                                  : deal.successStatus === 'failed'
                                  ? '#f87171'
                                  : '#d1d5db',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSuccessStatusId(deal.id);
                            }}
                          >
                            {deal.successStatus === 'success' ? '성공' : deal.successStatus === 'failed' ? '실패' : '진행중'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                        onClick={(e) => handleDeleteDeal(deal.id, e)}
                      >
                        <MoreVertical className="w-5 h-5 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedDeals.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="text-[15px]">검색 결과가 없습니다.</p>
                <p className="text-[13px] mt-2">다른 검색어나 필터를 시도해보세요.</p>
              </div>
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
              <div key={stage.id} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: getPipelineColorByStage(stage.color)
                      }}
                    ></div>
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
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-slate-900 text-sm line-clamp-1">
                          {deal.desiredService}
                        </h4>
                        {deal.isChecked && (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {deal.company}
                      </div>

                      <div className="text-xs text-slate-600 mb-2">
                        {deal.contactName} {deal.contactPosition}
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-900">₩{formatAmount(parseQuotationAmount(deal.quotationAmount))}</span>
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
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                            성공
                          </span>
                        )}
                        {deal.successStatus === 'failed' && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
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
          <div className="bg-white md:rounded-xl shadow-xl max-w-7xl w-full h-full md:h-auto md:max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between z-10">
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
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4 md:space-y-6">
              {/* 진행 단계 */}
              <div>
                <h4 className="text-[14px] md:text-[15px] font-semibold text-slate-700 mb-3 md:mb-4">진행 단계</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {customerJourneyStages.map((stage, index) => {
                    const currentDeal = isEditMode ? editedDeal : selectedDeal;
                    const isActive = currentDeal && stage.id === currentDeal.status;
                    const isPast = currentDeal && customerJourneyStages.findIndex((s) => s.id === currentDeal.status) > index;
                    const Icon = stage.icon;
                    
                    return (
                      <div
                        key={stage.id}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                          !isAddingNewDeal ? 'cursor-pointer hover:shadow-md' : isEditMode ? 'cursor-pointer hover:shadow-md' : 'cursor-not-allowed opacity-70'
                        } ${
                          isActive
                            ? 'bg-blue-50 border-blue-300 shadow-sm'
                            : isPast
                            ? 'bg-green-50 border-green-200'
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
                              ? 'bg-green-600 text-white'
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
                          className={`text-[11px] font-medium text-center leading-tight ${
                            isActive
                              ? 'text-blue-700'
                              : isPast
                              ? 'text-green-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {stage.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[13px] text-slate-500 mt-3 text-center">단계를 클릭하여 진행상태를 변경할 수 있습니다</p>
              </div>

              {/* 기본 정보 */}
              <div className="bg-slate-50 p-5 rounded-xl">
                <h4 className="text-[15px] font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  기본 정보
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[13px] text-slate-500 mb-1">기업명 {isAddingNewDeal && <span className="text-red-500">*</span>}</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.company || ''}
                        onChange={(e) => handleFieldChange('company', e.target.value)}
                        placeholder="기업명을 입력하세요"
                        className={`w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isAddingNewDeal && !editedDeal?.company?.trim() ? 'border-red-300' : 'border-slate-300'}`}
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
                        className="w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">{selectedDeal.desiredService}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[13px] text-slate-500 mb-1">담당자명 / 직책</p>
                    {isEditMode ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editedDeal?.contactName || ''}
                          onChange={(e) => handleFieldChange('contactName', e.target.value)}
                          placeholder="담당자명"
                          className="flex-1 px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={editedDeal?.contactPosition || ''}
                          onChange={(e) => handleFieldChange('contactPosition', e.target.value)}
                          placeholder="직책"
                          className="flex-1 px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <Phone className="w-3 h-3" /> 전화번호 {isAddingNewDeal && <span className="text-red-500">*</span>}
                    </p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.phone || ''}
                        onChange={(e) => handleFieldChange('phone', e.target.value)}
                        placeholder="010-0000-0000"
                        className={`w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isAddingNewDeal && !editedDeal?.phone?.trim() ? 'border-red-300' : 'border-slate-300'}`}
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
                        className="w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">{selectedDeal.email}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <p className="text-[13px] text-slate-500 mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> 주소
                    </p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.address || ''}
                        onChange={(e) => handleFieldChange('address', e.target.value)}
                        placeholder="주소를 입력하세요"
                        className="w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-[13px] font-medium text-blue-600 uppercase tracking-wider mb-1">문의 등록일</p>
                    {isEditMode ? (
                      <input
                        type="date"
                        value={editedDeal?.registrationDate || ''}
                        onChange={(e) => handleFieldChange('registrationDate', e.target.value)}
                        className="w-full px-3 py-2 text-xl font-bold text-blue-900 bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                      />
                    ) : (
                      <p className="text-xl font-bold text-blue-900 mt-2">
                        {selectedDeal.registrationDate}
                      </p>
                    )}
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <p className="text-[13px] font-medium text-purple-600 uppercase tracking-wider mb-1">진행상태</p>
                    <p className="text-xl font-bold text-purple-900 mt-2">
                      {getStatusLabel(selectedDeal.status)}
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-[13px] font-medium text-green-600 uppercase tracking-wider mb-1">총수량</p>
                    {isEditMode ? (
                      <input
                        type="number"
                        value={editedDeal?.totalQuantity || 0}
                        onChange={(e) => handleFieldChange('totalQuantity', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-xl font-bold text-green-900 bg-white border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mt-2"
                      />
                    ) : (
                      <p className="text-xl font-bold text-green-900 mt-2">
                        {selectedDeal.totalQuantity}
                      </p>
                    )}
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                    <p className="text-[13px] font-medium text-orange-600 uppercase tracking-wider mb-1">견적금액</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.quotationAmount || ''}
                        onChange={(e) => handleFieldChange('quotationAmount', e.target.value)}
                        placeholder="₩0만"
                        className="w-full px-3 py-2 text-xl font-bold text-orange-900 bg-white border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mt-2"
                      />
                    ) : (
                      <p className="text-xl font-bold text-orange-900 mt-2">
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
                            <label className="text-[13px] text-slate-600 whitespace-nowrap flex-1">{cat}</label>
                            <input
                              type="number"
                              min={0}
                              value={dqData.categories[cat] || 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateDQ({ ...dqData, categories: { ...dqData.categories, [cat]: val } });
                              }}
                              className="w-16 px-2 py-1 text-[13px] text-right text-slate-700 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                            className="text-[12px] text-blue-600 hover:text-blue-800 font-medium"
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
                              className="w-16 px-2 py-1.5 text-[13px] text-right text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <span className="text-[12px] text-slate-400">대</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = dqData.others.filter((_, i) => i !== idx);
                                updateDQ({ ...dqData, others: updated });
                              }}
                              className="text-slate-400 hover:text-red-500 text-[14px]"
                            >
                              <X className="w-3.5 h-3.5" />
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
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-amber-50 p-5 rounded-xl border border-amber-200">
                  <h4 className="text-[15px] font-semibold text-amber-800 mb-3">기타 요구사항</h4>
                  {isEditMode ? (
                    <textarea
                      value={editedDeal?.requirements || ''}
                      onChange={(e) => handleFieldChange('requirements', e.target.value)}
                      placeholder="고객의 특별 요구사항을 입력하세요"
                      rows={3}
                      className="w-full px-3 py-2 text-[15px] text-amber-900 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                    />
                  ) : (
                    <p className="text-[15px] text-amber-900">{selectedDeal.requirements}</p>
                  )}
                </div>
                <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-200">
                  <h4 className="text-[15px] font-semibold text-indigo-800 mb-3 flex items-center gap-2">
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
                    onBlur={() => {
                      if (!isEditMode && selectedDeal) {
                        updateDeal(selectedDeal).catch(err => console.error('관리 메모 저장 실패:', err));
                      }
                    }}
                    placeholder="내부 관리용 메모를 입력하세요"
                    rows={3}
                    className="w-full px-3 py-2 text-[15px] text-indigo-900 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
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
                          window.open(`/api/file_download.php?id=${selectedDeal.id}&file=${file.num}`, '_blank');
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

              {/* 담당자 및 일정 정보 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wider mb-2">고객책임자</p>
                  {isEditMode ? (
                    <select
                      value={editedDeal?.salesManager || ''}
                      onChange={(e) => handleFieldChange('salesManager', e.target.value)}
                      className="w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                    >
                      <option value="">선택하세요</option>
                      {customerManagerNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-[13px] font-medium">
                          {selectedDeal.salesManager.charAt(0)}
                        </span>
                      </div>
                      <span className="text-[15px] font-medium text-slate-900">{selectedDeal.salesManager}</span>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wider mb-2">확정작업일</p>
                  {isEditMode ? (
                    <input
                      type="date"
                      value={editedDeal?.confirmedWorkDate || ''}
                      onChange={(e) => handleFieldChange('confirmedWorkDate', e.target.value)}
                      className="w-full px-3 py-2 text-[15px] font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                    />
                  ) : (
                    <p className="text-[15px] font-semibold text-slate-900 mt-2">
                      {selectedDeal.confirmedWorkDate || '미정'}
                    </p>
                  )}
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wider mb-2">성공여부</p>
                  <div className="mt-2">
                    {selectedDeal.successStatus === 'success' ? (
                      <span className="px-3 py-1.5 rounded-full text-[15px] font-semibold bg-green-100 text-green-800 border-2 border-green-300">
                        계약 성공
                      </span>
                    ) : selectedDeal.successStatus === 'failed' ? (
                      <span className="px-3 py-1.5 rounded-full text-[15px] font-semibold bg-red-100 text-red-800 border-2 border-red-300">
                        계약 실패
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded-full text-[15px] font-semibold bg-slate-100 text-slate-700 border-2 border-slate-300">
                        진행중
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                {isEditMode ? (
                  <>
                    <button 
                      onClick={handleSaveEdit}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-sm hover:shadow"
                    >
                      {isAddingNewDeal ? '거래 추가' : '저장하기'}
                    </button>
                    <button 
                      onClick={handleCancelEdit}
                      className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-semibold"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={handleEditClick}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-sm hover:shadow"
                    >
                      수정하기
                    </button>
                    <button 
                      onClick={() => setSelectedDeal(null)}
                      className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-semibold"
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
    </div>
  );
}