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
} from 'lucide-react';
import { MobileCard, MobileCardField, MobileCardRow, MobileCardBadge } from './MobileCard';

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
}

const deals: Deal[] = [
  {
    id: 1,
    registrationDate: '2024-02-01',
    status: 'price-negotiation',
    company: '삼성전자',
    contactName: '이재용',
    contactPosition: '구매팀 과장',
    phone: '010-1234-5678',
    email: 'lee.jy@samsung.com',
    desiredService: 'ERP 시스템 구축',
    totalQuantity: 250,
    quotationAmount: '₩12,500만',
    salesManager: '김민수',
    successStatus: 'in-progress',
    isChecked: true,
    address: '서울특별시 서초구 서초대로 74길 11',
    requirements: '기존 레거시 시스템과의 통합 필요, 3개월 내 구축 완료 희망',
    detailedQuantity: '라이선스 250개, 서버 5대, 교육 10회',
    confirmedWorkDate: '2024-03-15',
    managementMemo: 'VIP 고객, 최우선 대응 필요. 경쟁사 제안서 검토 중',
  },
  {
    id: 2,
    registrationDate: '2024-01-28',
    status: 'quote-call',
    company: 'LG유플러스',
    contactName: '박민영',
    contactPosition: 'IT기획팀 차장',
    phone: '010-2345-6789',
    email: 'park.my@lguplus.co.kr',
    desiredService: 'CRM 솔루션',
    totalQuantity: 150,
    quotationAmount: '₩4,500만',
    salesManager: '이영희',
    successStatus: 'in-progress',
    isChecked: true,
    address: '서울특별시 용산구 한강대로 32',
    requirements: '모바일 앱 포함, 기존 시스템 데이터 마이그레이션',
    detailedQuantity: '사용자 계정 150개, 모바일 라이선스 150개',
    confirmedWorkDate: '2024-03-01',
    managementMemo: '예산 심의 중, 다음 주 최종 결정 예정',
  },
  {
    id: 3,
    registrationDate: '2024-02-03',
    status: 'schedule',
    company: '현대자동차',
    contactName: '정의선',
    contactPosition: '디지털혁신본부장',
    phone: '010-3456-7890',
    email: 'jung.es@hyundai.com',
    desiredService: '데이터 분석 플랫폼',
    totalQuantity: 500,
    quotationAmount: '₩8,900만',
    salesManager: '박준호',
    successStatus: 'in-progress',
    isChecked: true,
    address: '서울특별시 서초구 헌릉로 12',
    requirements: 'AI 기반 예측 분석 기능 필수, 실시간 대시보드',
    detailedQuantity: '동시접속 500명, 데이터 저장소 10TB',
    confirmedWorkDate: '2024-02-28',
    managementMemo: '대형 프로젝트, 단계별 구축 검토 중',
  },
  {
    id: 4,
    registrationDate: '2024-01-25',
    status: 'call',
    company: '네이버',
    contactName: '최수연',
    contactPosition: '인프라팀 팀장',
    phone: '010-4567-8901',
    email: 'choi.sy@naver.com',
    desiredService: '클라우드 인프라 구축',
    totalQuantity: 100,
    quotationAmount: '₩3,200만',
    salesManager: '최서연',
    successStatus: 'in-progress',
    isChecked: false,
    address: '경기도 성남시 분당구 정자일로 95',
    requirements: 'AWS 기반 구축, 고가용성 필수',
    detailedQuantity: 'EC2 인스턴스 100개, RDS 10개',
    confirmedWorkDate: '',
    managementMemo: '초기 상담 단계, 요구사항 파악 필요',
  },
  {
    id: 5,
    registrationDate: '2024-02-05',
    status: 'confirmed',
    company: 'KB금융',
    contactName: '윤종규',
    contactPosition: '보안담당 임원',
    phone: '010-5678-9012',
    email: 'yoon.jk@kbfg.com',
    desiredService: '보안 솔루션',
    totalQuantity: 300,
    quotationAmount: '₩6,700만',
    salesManager: '정우성',
    successStatus: 'success',
    isChecked: true,
    address: '서울특별시 중구 을지로 79',
    requirements: '금융권 보안 규정 준수, 정기 점검 서비스 포함',
    detailedQuantity: '방화벽 5대, 백신 라이선스 300개, 연간 유지보수',
    confirmedWorkDate: '2024-02-12',
    managementMemo: '계약 완료, 구축 일정 조율 중',
  },
  {
    id: 6,
    registrationDate: '2024-01-30',
    status: 'quote-sent',
    company: '카카오',
    contactName: '여민수',
    contactPosition: '서비스기획팀 부장',
    phone: '010-6789-0123',
    email: 'yeo.ms@kakao.com',
    desiredService: 'AI 챗봇 시스템',
    totalQuantity: 80,
    quotationAmount: '₩2,800만',
    salesManager: '강지민',
    successStatus: 'in-progress',
    isChecked: true,
    address: '제주특별자치도 제주시 첨단로 242',
    requirements: '다국어 지원, 자연어 처리 고도화',
    detailedQuantity: '챗봇 인스턴스 80개, 학습 데이터 구축',
    confirmedWorkDate: '',
    managementMemo: '견적서 발송 완료, 검토 기간 1주일',
  },
  {
    id: 7,
    registrationDate: '2024-01-20',
    status: 'new',
    company: 'SK하이닉스',
    contactName: '박정호',
    contactPosition: 'IT개발팀 과장',
    phone: '010-7890-1234',
    email: 'park.jh@skhynix.com',
    desiredService: '모바일 앱 개발',
    totalQuantity: 200,
    quotationAmount: '₩9,500만',
    salesManager: '윤소희',
    successStatus: 'in-progress',
    isChecked: false,
    address: '경기도 이천시 부발읍 경충대로 2091',
    requirements: 'iOS/Android 동시 개발, 반응형 디자인',
    detailedQuantity: '앱 2종, 유지보수 12개월',
    confirmedWorkDate: '',
    managementMemo: '신규 문의, 1차 미팅 예정',
  },
  {
    id: 8,
    registrationDate: '2024-02-07',
    status: 'confirmed',
    company: 'LG전자',
    contactName: '조주완',
    contactPosition: '마케팅본부 이사',
    phone: '010-8901-2345',
    email: 'cho.jw@lge.com',
    desiredService: '웹사이트 리뉴얼',
    totalQuantity: 50,
    quotationAmount: '₩1,800만',
    salesManager: '임태훈',
    successStatus: 'success',
    isChecked: true,
    address: '서울특별시 영등포구 여의대로 128',
    requirements: '반응형 웹, SEO 최적화, CMS 구축',
    detailedQuantity: '메인 페이지 10개, 서브 페이지 40개',
    confirmedWorkDate: '2024-02-08',
    managementMemo: '계약 완료, 착수금 입금 완료',
  },
];

const customerJourneyStages = [
  { id: 'new', name: '신규', icon: User, color: 'blue' },
  { id: 'call', name: '유선상담', icon: Phone, color: 'cyan' },
  { id: 'quote-sent', name: '견적서 발송', icon: Send, color: 'purple' },
  { id: 'quote-call', name: '유선견적상담', icon: MessageSquare, color: 'indigo' },
  { id: 'price-negotiation', name: '가격조율', icon: DollarSign, color: 'amber' },
  { id: 'schedule', name: '일정조율', icon: CalendarCheck, color: 'orange' },
  { id: 'confirmed', name: '수주확정', icon: CheckCircle, color: 'green' },
];

export function SalesPage() {
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [editingSuccessStatusId, setEditingSuccessStatusId] = useState<number | null>(null);
  const [dealsData, setDealsData] = useState<Deal[]>(deals);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedDeal, setEditedDeal] = useState<Deal | null>(null);
  const [startMonth, setStartMonth] = useState('2024-01');
  const [endMonth, setEndMonth] = useState('2024-02');
  const [isAddingNewDeal, setIsAddingNewDeal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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
    // "₩12,500만" 형식 처리
    const isManWon = quotationAmount.includes('만');
    const numericValue = parseFloat(quotationAmount.replace(/[^0-9.]/g, ''));
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

  const handleDeleteDeal = (dealId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const dealToDelete = dealsData.find(d => d.id === dealId);
    if (!dealToDelete) return;
    
    if (window.confirm(`"${dealToDelete.company}" 거래를 삭제하시겠습니까?`)) {
      setDealsData(dealsData.filter(deal => deal.id !== dealId));
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(null);
      }
    }
  };

  const handleStatusChange = (dealId: number, newStatus: Deal['status']) => {
    setDealsData((prevDeals) =>
      prevDeals.map((deal) =>
        deal.id === dealId 
          ? { 
              ...deal, 
              status: newStatus,
              // 수주확정으로 변경되면 성공여부를 자동으로 '성공'으로 변경
              successStatus: newStatus === 'confirmed' ? 'success' : deal.successStatus
            } 
          : deal
      )
    );
    setEditingStatusId(null);
    
    // Update selected deal if it's open
    if (selectedDeal && selectedDeal.id === dealId) {
      setSelectedDeal((prev) => prev ? { 
        ...prev, 
        status: newStatus,
        // 수주확정으로 변경되면 성공여부를 자동으로 '성공'으로 변경
        successStatus: newStatus === 'confirmed' ? 'success' : prev.successStatus
      } : null);
    }
  };

  const handleSuccessStatusChange = (dealId: number, newSuccessStatus: Deal['successStatus']) => {
    setDealsData((prevDeals) =>
      prevDeals.map((deal) =>
        deal.id === dealId ? { ...deal, successStatus: newSuccessStatus } : deal
      )
    );
    setEditingSuccessStatusId(null);
    
    // Update selected deal if it's open
    if (selectedDeal && selectedDeal.id === dealId) {
      setSelectedDeal((prev) => prev ? { ...prev, successStatus: newSuccessStatus } : null);
    }
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

  const handleSaveEdit = () => {
    if (editedDeal) {
      if (isAddingNewDeal) {
        // 새 거래 추가
        const newId = Math.max(...dealsData.map(d => d.id), 0) + 1;
        const newDeal = { ...editedDeal, id: newId };
        setDealsData((prevDeals) => [...prevDeals, newDeal]);
        setSelectedDeal(null);
        setIsAddingNewDeal(false);
      } else {
        // 기존 거래 수정
        setDealsData((prevDeals) =>
          prevDeals.map((deal) =>
            deal.id === editedDeal.id ? editedDeal : deal
          )
        );
        setSelectedDeal(editedDeal);
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
              onChange={(e) => setStartMonth(e.target.value)}
              className="px-2.5 py-1.5 text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-sm">~</span>
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="px-2.5 py-1.5 text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                setStartMonth(`${year}-${month}`);
                setEndMonth(`${year}-${month}`);
              }}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 text-[12px] font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              이번 달
            </button>
            <button
              onClick={() => {
                const now = new Date();
                const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                const month = now.getMonth() === 0 ? 12 : now.getMonth();
                const lastMonth = `${year}-${String(month).padStart(2, '0')}`;
                setStartMonth(lastMonth);
                setEndMonth(lastMonth);
              }}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 text-[12px] font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              지난 달
            </button>
            <button
              onClick={() => {
                const now = new Date();
                const endYear = now.getFullYear();
                const endMonth = String(now.getMonth() + 1).padStart(2, '0');
                
                const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                const startYear = threeMonthsAgo.getFullYear();
                const startMonthNum = String(threeMonthsAgo.getMonth() + 1).padStart(2, '0');
                
                setStartMonth(`${startYear}-${startMonthNum}`);
                setEndMonth(`${endYear}-${endMonth}`);
              }}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 text-[12px] font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              지난 3개월
            </button>
            <button
              onClick={() => {
                const now = new Date();
                const year = now.getFullYear();
                setStartMonth(`${year}-01`);
                setEndMonth(`${year}-12`);
              }}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 text-[12px] font-semibold rounded-md hover:bg-slate-200 transition-colors"
            >
              올해
            </button>
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
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-medium">
                            {deal.salesManager.charAt(0)}
                          </span>
                        </div>
                        <span className="text-sm text-slate-700">{deal.salesManager}</span>
                      </div>
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
                    <p className="text-[13px] text-slate-500 mb-1">기업명</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.company || ''}
                        onChange={(e) => handleFieldChange('company', e.target.value)}
                        placeholder="기업명을 입력하세요"
                        className="w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-slate-900">{selectedDeal.company}</p>
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
                      <Phone className="w-3 h-3" /> 전화번호
                    </p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedDeal?.phone || ''}
                        onChange={(e) => handleFieldChange('phone', e.target.value)}
                        placeholder="010-0000-0000"
                        className="w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                {isEditMode ? (
                  <textarea
                    value={editedDeal?.detailedQuantity || ''}
                    onChange={(e) => handleFieldChange('detailedQuantity', e.target.value)}
                    placeholder="상세 수량 정보를 입력하세요 (예: 라이선스 250개, 서버 5대)"
                    rows={2}
                    className="w-full px-3 py-2 text-[15px] text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                ) : (
                  <p className="text-[15px] text-slate-700">{selectedDeal.detailedQuantity}</p>
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
                  {isEditMode ? (
                    <textarea
                      value={editedDeal?.managementMemo || ''}
                      onChange={(e) => handleFieldChange('managementMemo', e.target.value)}
                      placeholder="내부 관리용 메모를 입력하세요"
                      rows={3}
                      className="w-full px-3 py-2 text-[15px] text-indigo-900 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  ) : (
                    <p className="text-[15px] text-indigo-900">{selectedDeal.managementMemo}</p>
                  )}
                </div>
              </div>

              {/* 담당자 및 일정 정보 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wider mb-2">고객책임자</p>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedDeal?.salesManager || ''}
                      onChange={(e) => handleFieldChange('salesManager', e.target.value)}
                      placeholder="담당자명"
                      className="w-full px-3 py-2 text-[15px] font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                    />
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