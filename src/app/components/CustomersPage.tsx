import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Plus,
  MoreVertical,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  TrendingUp,
  TrendingDown,
  X,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  UserCheck,
  Percent,
  Star,
  Award,
  Clock,
  CheckCircle,
  AlertCircle,
  User,
  Briefcase,
  Package,
  History,
  FileText,
  Send,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import { MobileCard, MobileCardField, MobileCardRow, MobileCardBadge } from './MobileCard';

interface WorkHistory {
  inquiryDate: string; // 문의 등록일
  projectName: string; // 프로젝트명
  totalQuantity: number; // 총수량
  detailedQuantity: string; // 상세수량
  quotationAmount: number; // 견적금액
  accountManager: string; // 고객책임자
  workDate: string; // 작업일자
  subcontractorManager: string; // 작업팀장(하청)
  reportSent: boolean; // 리포트전송
  reminder1: boolean; // 리마인드1차
  reminder2: boolean; // 리마인드2차
  reminder3: boolean; // 리마인드3차
}

interface EmailHistory {
  date: string;
  type: string;
  recipient: string;
  status: 'sent' | 'opened' | 'failed';
}

interface InternalNote {
  id: number;
  author: string;
  date: string;
  content: string;
}

interface Customer {
  id: number;
  company: string; // 기업명
  grade: 'S' | 'A' | 'B'; // 고객 등급
  customerStatus: '신규' | '재구매' | '충성고객'; // 고객 상태
  contactName: string; // 담당자명
  contactPosition: string; // 담당자 직책
  deals: number; // 작업 횟수
  lastWorkDate: string; // 최근 작업일자
  totalQuantity: number; // 총 수량
  totalAmount: number; // 총 금액 합계 (원 단위)
  managementCycle: number; // 관리 주기 (일)
  nextManagementDate: string; // 다음 관리 예정일
  reminderStatus: '미발송' | '발송예약완료'; // 리마인드 메일 진행 상태
  accountManager: string; // 고객 책임자
  phone: string; // 전화번호
  email: string; // 이메일
  address: string; // 주소
  detailedQuantity: { item: string; quantity: number }[]; // 상세 수량
  workHistory: WorkHistory[]; // 작업 히스토리
  fieldManager: string; // 현장 팀장
  emailHistory: EmailHistory[]; // 이메일 발송 이력
  internalNotes: InternalNote[]; // 내부 관리 메모
  memo: string; // 메모장
}

export const initialCustomers: Customer[] = [
  {
    id: 1,
    company: '삼성전자',
    grade: 'S',
    customerStatus: '충성고객',
    contactName: '김민수',
    contactPosition: '구매팀 부장',
    deals: 12,
    lastWorkDate: '2024-02-01',
    totalQuantity: 45000,
    totalAmount: 425000000,
    managementCycle: 30,
    nextManagementDate: '2024-03-03',
    reminderStatus: '발송예약완료',
    accountManager: '박영희',
    phone: '02-1234-5678',
    email: 'minsu.kim@samsung.com',
    address: '서울특별시 서초구 서초대로74길 11',
    detailedQuantity: [
      { item: 'A4 용지', quantity: 20000 },
      { item: 'B5 용지', quantity: 15000 },
      { item: '명함', quantity: 10000 },
    ],
    workHistory: [
      {
        inquiryDate: '2024-01-20',
        projectName: '2024년 1분기 사무용품 납품',
        totalQuantity: 5000,
        detailedQuantity: 'A4 용지 5000개',
        quotationAmount: 48000000,
        accountManager: '박영희',
        workDate: '2024-02-01',
        subcontractorManager: '이철수',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
      {
        inquiryDate: '2023-12-10',
        projectName: '신년 명함 제작',
        totalQuantity: 3000,
        detailedQuantity: '명함 3000개',
        quotationAmount: 12000000,
        accountManager: '박영희',
        workDate: '2024-01-15',
        subcontractorManager: '이철수',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
      {
        inquiryDate: '2023-10-25',
        projectName: '연말 홍보물 인쇄',
        totalQuantity: 8000,
        detailedQuantity: '홍보물 8000개',
        quotationAmount: 65000000,
        accountManager: '박영희',
        workDate: '2023-11-20',
        subcontractorManager: '이철수',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
      {
        inquiryDate: '2023-08-15',
        projectName: '추석 선물 카탈로그',
        totalQuantity: 12000,
        detailedQuantity: '카탈로그 12000개',
        quotationAmount: 95000000,
        accountManager: '박영희',
        workDate: '2023-09-10',
        subcontractorManager: '김현우',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '이철수',
    emailHistory: [
      {
        date: '2024-02-03 14:30',
        type: '관리 주기 리마인드',
        recipient: 'minsu.kim@samsung.com',
        status: 'opened',
      },
      {
        date: '2024-01-03 09:15',
        type: '신규 견적 제안',
        recipient: 'minsu.kim@samsung.com',
        status: 'sent',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '박영희',
        date: '2024-02-01',
        content: 'VIP 고객. 분기별 대량 주문 진행. 연말 성수기 대응 필요. 담당자 매우 협조적.',
      },
    ],
    memo: 'VIP 고객. 분기별 대량 주문 진행. 연말 성수기 대응 필요. 담당자 매우 협조적.',
  },
  {
    id: 2,
    company: 'SK하이닉스',
    grade: 'A',
    customerStatus: '재구매',
    contactName: '이영희',
    contactPosition: '총무팀 차장',
    deals: 9,
    lastWorkDate: '2024-01-28',
    totalQuantity: 32000,
    totalAmount: 380000000,
    managementCycle: 45,
    nextManagementDate: '2024-03-13',
    reminderStatus: '미발송',
    accountManager: '최지훈',
    phone: '031-2345-6789',
    email: 'younghee.lee@skhynix.com',
    address: '경기도 이천시 부발읍 경충대로 2091',
    detailedQuantity: [
      { item: 'A4 용지', quantity: 18000 },
      { item: '봉투', quantity: 8000 },
      { item: '카탈로그', quantity: 6000 },
    ],
    workHistory: [
      {
        inquiryDate: '2023-12-20',
        projectName: '1월 정기 용지 납품',
        totalQuantity: 4000,
        detailedQuantity: 'A4 용지 4000개',
        quotationAmount: 35000000,
        accountManager: '최지훈',
        workDate: '2024-01-28',
        subcontractorManager: '김현우',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
      {
        inquiryDate: '2023-11-10',
        projectName: '연말 카탈로그 제작',
        totalQuantity: 6000,
        detailedQuantity: '카탈로그 6000개',
        quotationAmount: 72000000,
        accountManager: '최지훈',
        workDate: '2023-12-15',
        subcontractorManager: '김현우',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
      {
        inquiryDate: '2023-09-05',
        projectName: '가을 프로모션 인쇄물',
        totalQuantity: 5000,
        detailedQuantity: '프로모션 인쇄물 5000개',
        quotationAmount: 58000000,
        accountManager: '최지훈',
        workDate: '2023-10-20',
        subcontractorManager: '김현우',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '김현우',
    emailHistory: [
      {
        date: '2024-01-25 11:20',
        type: '견적서 발송',
        recipient: 'younghee.lee@skhynix.com',
        status: 'opened',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '최지훈',
        date: '2024-01-25',
        content: 'A등급 고객. 정기 납품 계약 유지 중. 다음 분기 계약 갱신 예정.',
      },
    ],
    memo: 'A등급 고객. 정기 납품 계약 유지 중. 다음 분기 계약 갱신 예정.',
  },
  {
    id: 3,
    company: 'LG전자',
    grade: 'S',
    customerStatus: '충성고객',
    contactName: '박준호',
    contactPosition: '마케팅팀 팀장',
    deals: 11,
    lastWorkDate: '2024-02-03',
    totalQuantity: 38000,
    totalAmount: 340000000,
    managementCycle: 30,
    nextManagementDate: '2024-03-05',
    reminderStatus: '발송예약완료',
    accountManager: '박영희',
    phone: '02-3456-7890',
    email: 'junho.park@lge.com',
    address: '서울특별시 영등포구 여의대로 128',
    detailedQuantity: [
      { item: '브로슈어', quantity: 15000 },
      { item: '포스터', quantity: 12000 },
      { item: '리플렛', quantity: 11000 },
    ],
    workHistory: [
      {
        inquiryDate: '2024-01-15',
        projectName: '신제품 홍보 브로슈어',
        totalQuantity: 5000,
        detailedQuantity: '브로슈어 5000개',
        quotationAmount: 45000000,
        accountManager: '박영희',
        workDate: '2024-02-03',
        subcontractorManager: '이철수',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
      {
        inquiryDate: '2023-12-05',
        projectName: 'CES 2024 참가 인쇄물',
        totalQuantity: 7000,
        detailedQuantity: '인쇄물 7000개',
        quotationAmount: 68000000,
        accountManager: '박영희',
        workDate: '2024-01-10',
        subcontractorManager: '이철수',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '이철수',
    emailHistory: [
      {
        date: '2024-02-05 16:45',
        type: '작업 완료 알림',
        recipient: 'junho.park@lge.com',
        status: 'sent',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '박영희',
        date: '2024-02-05',
        content: '마케팅 관련 고빈도 프로젝트. 품질 민감도 높음. 신속한 대응 필요.',
      },
    ],
    memo: '마케팅 관련 고빈도 프로젝트. 품질 민감도 높음. 신속한 대응 필요.',
  },
  {
    id: 4,
    company: '현대자동차',
    grade: 'B',
    customerStatus: '재구매',
    contactName: '최서연',
    contactPosition: '홍보팀 대리',
    deals: 7,
    lastWorkDate: '2024-01-15',
    totalQuantity: 22000,
    totalAmount: 295000000,
    managementCycle: 60,
    nextManagementDate: '2024-03-15',
    reminderStatus: '미발송',
    accountManager: '정민석',
    phone: '02-4567-8901',
    email: 'seoyeon.choi@hyundai.com',
    address: '서울특별시 서초구 헌릉로 12',
    detailedQuantity: [
      { item: '카탈로그', quantity: 12000 },
      { item: '브로슈어', quantity: 10000 },
    ],
    workHistory: [
      {
        inquiryDate: '2023-10-25',
        projectName: '2024년 신차 카탈로그',
        totalQuantity: 4000,
        detailedQuantity: '카탈로그 4000개',
        quotationAmount: 52000000,
        accountManager: '정민석',
        workDate: '2024-01-15',
        subcontractorManager: '박민준',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
      {
        inquiryDate: '2023-09-10',
        projectName: '모터쇼 홍보 인쇄물',
        totalQuantity: 6000,
        detailedQuantity: '인쇄물 6000개',
        quotationAmount: 75000000,
        accountManager: '정민석',
        workDate: '2023-11-05',
        subcontractorManager: '박민준',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '박민준',
    emailHistory: [
      {
        date: '2024-01-12 13:30',
        type: '견적서 발송',
        recipient: 'seoyeon.choi@hyundai.com',
        status: 'failed',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '정민석',
        date: '2024-01-12',
        content: '주기적 관리 필요. 최근 연락 두절. 재접촉 시도 필요.',
      },
    ],
    memo: '주기적 관리 필요. 최근 연락 두절. 재접촉 시도 필요.',
  },
  {
    id: 5,
    company: 'KB금융',
    grade: 'A',
    customerStatus: '재구매',
    contactName: '정우성',
    contactPosition: '경영지원팀 과장',
    deals: 8,
    lastWorkDate: '2024-02-02',
    totalQuantity: 28000,
    totalAmount: 270000000,
    managementCycle: 45,
    nextManagementDate: '2024-03-18',
    reminderStatus: '미발송',
    accountManager: '최지훈',
    phone: '02-5678-9012',
    email: 'woosung.jung@kbfg.com',
    address: '서울특별시 중구 을지로 84',
    detailedQuantity: [
      { item: 'A4 용지', quantity: 15000 },
      { item: '명함', quantity: 8000 },
      { item: '봉투', quantity: 5000 },
    ],
    workHistory: [
      {
        inquiryDate: '2024-01-15',
        projectName: '2월 정기 사무용품',
        totalQuantity: 3500,
        detailedQuantity: 'A4 용지 3500개',
        quotationAmount: 28000000,
        accountManager: '최지훈',
        workDate: '2024-02-02',
        subcontractorManager: '김현우',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '김현우',
    emailHistory: [
      {
        date: '2024-02-01 10:00',
        type: '정기 납품 안내',
        recipient: 'woosung.jung@kbfg.com',
        status: 'opened',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '최지훈',
        date: '2024-02-01',
        content: '금융권 고객. 안정적 거래 유지 중.',
      },
    ],
    memo: '금융권 고객. 안정적 거래 유지 중.',
  },
  {
    id: 6,
    company: '네이버',
    grade: 'B',
    customerStatus: '재구매',
    contactName: '강지민',
    contactPosition: 'HR팀 사원',
    deals: 6,
    lastWorkDate: '2024-01-30',
    totalQuantity: 18000,
    totalAmount: 245000000,
    managementCycle: 60,
    nextManagementDate: '2024-03-30',
    reminderStatus: '미발송',
    accountManager: '정민석',
    phone: '031-6789-0123',
    email: 'jimin.kang@naver.com',
    address: '경기도 성남시 분당구 정자일로 95',
    detailedQuantity: [
      { item: '명함', quantity: 10000 },
      { item: 'A4 용지', quantity: 8000 },
    ],
    workHistory: [
      {
        inquiryDate: '2023-12-20',
        projectName: '신입사원 명함 제작',
        totalQuantity: 2000,
        detailedQuantity: '명함 2000개',
        quotationAmount: 8000000,
        accountManager: '정민석',
        workDate: '2024-01-30',
        subcontractorManager: '박민준',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '박민준',
    emailHistory: [
      {
        date: '2024-01-28 15:20',
        type: '견적서 발송',
        recipient: 'jimin.kang@naver.com',
        status: 'sent',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '정민석',
        date: '2024-01-28',
        content: 'IT 기업. 소량 정기 주문.',
      },
    ],
    memo: 'IT 기업. 소량 정기 주문.',
  },
  {
    id: 7,
    company: '카카오',
    grade: 'B',
    customerStatus: '재구매',
    contactName: '윤소희',
    contactPosition: '총무팀 주임',
    deals: 5,
    lastWorkDate: '2024-01-25',
    totalQuantity: 12000,
    totalAmount: 220000000,
    managementCycle: 90,
    nextManagementDate: '2024-04-24',
    reminderStatus: '미발송',
    accountManager: '김수��',
    phone: '031-7890-1234',
    email: 'sohee.yoon@kakao.com',
    address: '경기도 성남시 분당구 판교역로 235',
    detailedQuantity: [
      { item: '브로슈어', quantity: 7000 },
      { item: '명함', quantity: 5000 },
    ],
    workHistory: [
      {
        inquiryDate: '2023-11-10',
        projectName: '회사 소개 브로슈어',
        totalQuantity: 2500,
        detailedQuantity: '브로슈어 2500개',
        quotationAmount: 18000000,
        accountManager: '김수진',
        workDate: '2024-01-25',
        subcontractorManager: '이철수',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '이철수',
    emailHistory: [
      {
        date: '2024-01-20 11:00',
        type: '신규 제안',
        recipient: 'sohee.yoon@kakao.com',
        status: 'sent',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '김수진',
        date: '2024-01-20',
        content: '잠재 성장 가능성 있음. 관계 강화 필요.',
      },
    ],
    memo: '잠재 성장 가능성 있음. 관계 강화 필요.',
  },
  {
    id: 8,
    company: 'LG유플러스',
    grade: 'A',
    customerStatus: '재구매',
    contactName: '임태훈',
    contactPosition: '기획팀 차장',
    deals: 4,
    lastWorkDate: '2024-02-04',
    totalQuantity: 15000,
    totalAmount: 198000000,
    managementCycle: 45,
    nextManagementDate: '2024-03-20',
    reminderStatus: '발송예약완료',
    accountManager: '박영희',
    phone: '02-8901-2345',
    email: 'taehoon.lim@lguplus.com',
    address: '서울특별시 용산구 한강대로 32',
    detailedQuantity: [
      { item: '포스터', quantity: 8000 },
      { item: '리플렛', quantity: 7000 },
    ],
    workHistory: [
      {
        inquiryDate: '2023-12-15',
        projectName: '5G 프로모션 인쇄물',
        totalQuantity: 5000,
        detailedQuantity: '인쇄물 5000개',
        quotationAmount: 62000000,
        accountManager: '박영희',
        workDate: '2024-02-04',
        subcontractorManager: '김현우',
        reportSent: true,
        reminder1: true,
        reminder2: false,
        reminder3: false,
      },
    ],
    fieldManager: '김현우',
    emailHistory: [
      {
        date: '2024-02-06 09:30',
        type: '관리 주기 리마인드',
        recipient: 'taehoon.lim@lguplus.com',
        status: 'sent',
      },
    ],
    internalNotes: [
      {
        id: 1,
        author: '박영희',
        date: '2024-02-06',
        content: '통신사 고객. 프로모션 시즌 집중 관리.',
      },
    ],
    memo: '통신사 고객. 프로모션 시즌 집중 관리.',
  },
];

interface CustomersPageProps {
  newCustomerFromDeal?: Customer | null;
  externalCustomersState?: [Customer[], (customers: Customer[] | ((prev: Customer[]) => Customer[])) => void];
}

export function CustomersPage({ newCustomerFromDeal, externalCustomersState }: CustomersPageProps = {}) {
  const [internalCustomers, setInternalCustomers] = useState<Customer[]>(initialCustomers);
  const customers = externalCustomersState ? externalCustomersState[0] : internalCustomers;
  const setCustomers = externalCustomersState ? externalCustomersState[1] : setInternalCustomers;
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
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

  // 영업 관리에서 성공한 딜이 넘어오면 고객 자동 등록
  useEffect(() => {
    if (!newCustomerFromDeal) return;
    // 이미 같은 회사가 있으면 중복 추가하지 않음
    const exists = customers.some((c) => c.company === newCustomerFromDeal.company);
    if (!exists) {
      setCustomers((prev) => [newCustomerFromDeal, ...prev]);
    }
  }, [newCustomerFromDeal]);
  const [expandedYears, setExpandedYears] = useState<{ [key: number]: boolean }>({});
  const [newNote, setNewNote] = useState('');
  const [showAddWorkForm, setShowAddWorkForm] = useState(false);
  const [sortColumn, setSortColumn] = useState<'lastWorkDate' | 'totalQuantity' | 'totalAmount' | 'nextManagementDate' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [editingCell, setEditingCell] = useState<{ customerId: string; field: string } | null>(null);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCustomer, setEditedCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
    company: '',
    grade: 'B',
    status: '신규',
    industry: '',
    region: '',
    accountManager: '',
    phone: '',
    email: '',
    managementCycle: 30,
    reminderStatus: '미발송',
  });
  const [newWork, setNewWork] = useState<WorkHistory>({
    inquiryDate: '',
    projectName: '',
    totalQuantity: 0,
    detailedQuantity: '',
    quotationAmount: 0,
    accountManager: '',
    workDate: '',
    subcontractorManager: '',
    reportSent: false,
    reminder1: false,
    reminder2: false,
    reminder3: false,
  });

  // 금액 포맷팅 함수 (만, 억 단위)
  const formatAmount = (amount: number): string => {
    if (amount >= 100000000) {
      const uk = amount / 100000000;
      return `₩${uk.toFixed(1)}억`;
    } else if (amount >= 10000) {
      const man = amount / 10000;
      return `₩${man.toLocaleString()}만`;
    }
    return `₩${amount.toLocaleString()}`;
  };

  // 다음 관리 예정일 계산 함수
  const calculateNextManagementDate = (lastWorkDate: string, managementCycle: number): string => {
    const lastDate = new Date(lastWorkDate);
    lastDate.setDate(lastDate.getDate() + managementCycle);
    const year = lastDate.getFullYear();
    const month = String(lastDate.getMonth() + 1).padStart(2, '0');
    const day = String(lastDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 리마인드 발송 예정일 계산 함수 (작업일 + 개월 수)
  const calculateReminderDate = (workDate: string, months: number): string => {
    const date = new Date(workDate);
    date.setMonth(date.getMonth() + months);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      (customer.accountManager?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (customer.company?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (customer.email?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    let matchesGrade = true;
    if (gradeFilter === 'all') {
      matchesGrade = true;
    } else if (gradeFilter === 'other') {
      matchesGrade = !['S', 'A', 'B'].includes(customer.grade);
    } else {
      matchesGrade = customer.grade === gradeFilter;
    }

    return matchesSearch && matchesGrade;
  });

  // 정렬 로직
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue: any;
    let bValue: any;

    switch (sortColumn) {
      case 'lastWorkDate':
        aValue = new Date(a.lastWorkDate).getTime();
        bValue = new Date(b.lastWorkDate).getTime();
        break;
      case 'totalQuantity':
        aValue = a.totalQuantity;
        bValue = b.totalQuantity;
        break;
      case 'totalAmount':
        aValue = a.totalAmount;
        bValue = b.totalAmount;
        break;
      case 'nextManagementDate':
        aValue = new Date(a.nextManagementDate).getTime();
        bValue = new Date(b.nextManagementDate).getTime();
        break;
      default:
        return 0;
    }

    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // 정렬 핸들러
  const handleSort = (column: 'lastWorkDate' | 'totalQuantity' | 'totalAmount' | 'nextManagementDate') => {
    if (sortColumn === column) {
      // 같은 컬럼 클릭 시
      if (sortDirection === 'desc') {
        // desc -> asc
        setSortDirection('asc');
      } else {
        // asc -> 정렬 해제
        setSortColumn(null);
        setSortDirection('desc');
      }
    } else {
      // 다른 컬럼 클릭 시 해당 컬럼으로 정렬 (기본 desc)
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // 고객 정보 업데이트 핸들러
  const updateCustomerField = (customerId: string, field: string, value: any) => {
    setCustomers(customers.map(customer => 
      customer.id === customerId ? { ...customer, [field]: value } : customer
    ));
    
    // 선택된 고객이 업데이트된 경우 상세 정보도 업데이트
    if (selectedCustomer && selectedCustomer.id === customerId) {
      setSelectedCustomer({ ...selectedCustomer, [field]: value });
    }
    
    setEditingCell(null);
  };

  // 고객 삭제 핸들러
  const handleDeleteCustomer = (customerId: string, customerName: string) => {
    if (confirm(`${customerName} 고객을 삭제하시겠습니까?`)) {
      setCustomers(customers.filter(customer => customer.id !== customerId));
    }
  };

  // 리마인드 상태 토글 핸들러
  const toggleReminderStatus = (workIndex: number, reminderType: 'reminder1' | 'reminder2' | 'reminder3') => {
    if (!selectedCustomer) return;

    const updatedWorkHistory = selectedCustomer.workHistory.map((work, index) => {
      if (index === workIndex) {
        return { ...work, [reminderType]: !work[reminderType] };
      }
      return work;
    });

    const updatedCustomer = { ...selectedCustomer, workHistory: updatedWorkHistory };
    setSelectedCustomer(updatedCustomer);
    setCustomers(customers.map(customer => 
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    ));
  };

  // 리포트전송 상태 토글 핸들러
  const toggleReportSentStatus = (workIndex: number) => {
    if (!selectedCustomer) return;

    const updatedWorkHistory = selectedCustomer.workHistory.map((work, index) => {
      if (index === workIndex) {
        return { ...work, reportSent: !work.reportSent };
      }
      return work;
    });

    const updatedCustomer = { ...selectedCustomer, workHistory: updatedWorkHistory };
    setSelectedCustomer(updatedCustomer);
    setCustomers(customers.map(customer => 
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    ));
  };

  // 수정 모드 시작
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedCustomer(selectedCustomer ? { ...selectedCustomer } : null);
  };

  // 수정 취소
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedCustomer(null);
  };

  // 수정 저장
  const handleSaveEdit = () => {
    if (!editedCustomer || !selectedCustomer) return;
    
    setCustomers(customers.map(customer => 
      customer.id === selectedCustomer.id ? editedCustomer : customer
    ));
    setSelectedCustomer(editedCustomer);
    setIsEditing(false);
    setEditedCustomer(null);
  };

  // 편집 중인 고객 필드 업데이트
  const updateEditedField = (field: string, value: any) => {
    if (!editedCustomer) return;
    setEditedCustomer({ ...editedCustomer, [field]: value });
  };

  // 편집 중인 작업 히스토리 업데이트
  const updateEditedWorkHistory = (index: number, field: string, value: any) => {
    if (!editedCustomer) return;
    const updatedWorkHistory = editedCustomer.workHistory.map((work, i) => 
      i === index ? { ...work, [field]: value } : work
    );
    setEditedCustomer({ ...editedCustomer, workHistory: updatedWorkHistory });
  };

  // 고객 추가 핸들러
  const handleAddCustomer = () => {
    if (!newCustomer.company || !newCustomer.phone) {
      alert('회사명과 전화번호는 필수 입력 항목입니다.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (newCustomer.managementCycle || 30));
    const nextManagementDate = nextDate.toISOString().split('T')[0];

    const customer: Customer = {
      id: `CUST${String(customers.length + 1).padStart(3, '0')}`,
      company: newCustomer.company,
      grade: newCustomer.grade || 'B',
      status: newCustomer.status || '신규',
      industry: newCustomer.industry || '',
      region: newCustomer.region || '',
      lastWorkDate: today,
      totalWorks: 0,
      totalQuantity: 0,
      totalAmount: 0,
      deals: 0,
      managementCycle: newCustomer.managementCycle || 30,
      nextManagementDate: nextManagementDate,
      reminderStatus: newCustomer.reminderStatus || '미발송',
      accountManager: newCustomer.accountManager || '',
      phone: newCustomer.phone,
      email: newCustomer.email || '',
      workHistory: [],
      emailHistory: [],
      internalNotes: [],
      memo: '',
    };

    setCustomers([customer, ...customers]);
    setShowAddCustomerModal(false);
    setNewCustomer({
      company: '',
      grade: 'B',
      status: '신규',
      industry: '',
      region: '',
      accountManager: '',
      phone: '',
      email: '',
      managementCycle: 30,
      reminderStatus: '미발송',
    });
  };

  const getGradeBadge = (grade: string) => {
    const styles = {
      S: 'bg-purple-50 text-purple-700 border-purple-200',
      A: 'bg-blue-50 text-blue-700 border-blue-200',
      B: 'bg-green-50 text-green-700 border-green-200',
      '그 외': 'bg-slate-50 text-slate-700 border-slate-200',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${styles[grade as keyof typeof styles] || styles['그 외']}`}>
        {grade}
      </span>
    );
  };

  const getCustomerStatusBadge = (status: string) => {
    const styles = {
      신규: 'bg-gray-50 text-gray-700 border-gray-200',
      재구매: 'bg-orange-50 text-orange-700 border-orange-200',
      충성고객: 'bg-green-50 text-green-700 border-green-200',
      고객이탈: 'bg-red-50 text-red-700 border-red-200',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles]}`}>
        {status}
      </span>
    );
  };

  const getReminderBadge = (status: string) => {
    const config = {
      미발송: { label: '미발송', color: 'bg-slate-50 text-slate-700 border-slate-200', icon: Clock },
      발송예약완료: { label: '발송예약 완료', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Send },
    };
    const statusConfig = config[status as keyof typeof config];
    if (!statusConfig) {
      // Fallback for unknown status
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-50 text-slate-700 border-slate-200">
          {status}
        </span>
      );
    }
    const { label, color, icon: Icon } = statusConfig;
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border inline-flex items-center gap-1 ${color}`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const getEmailStatusBadge = (status: string) => {
    const config = {
      sent: { label: '발송', color: 'bg-blue-50 text-blue-700', icon: Send },
      opened: { label: '열람', color: 'bg-green-50 text-green-700', icon: CheckCircle },
      failed: { label: '실패', color: 'bg-red-50 text-red-700', icon: AlertCircle },
    };
    const { label, color, icon: Icon } = config[status as keyof typeof config];
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1 ${color}`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  // 작업 히스토리를 연도별로 그룹화
  const groupWorkHistoryByYear = (workHistory: WorkHistory[]) => {
    const grouped: { [key: number]: WorkHistory[] } = {};
    workHistory.forEach((work) => {
      const year = new Date(work.workDate).getFullYear();
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(work);
    });
    // 연도 내림차순 정렬
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => b - a)
      .map((year) => ({
        year,
        works: grouped[year].sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime()),
      }));
  };

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => ({
      ...prev,
      [year]: !prev[year],
    }));
  };

  // KPI 계산 - sortedCustomers 기반으로 변경
  const totalCustomers = sortedCustomers.length;
  const repeatCustomers = sortedCustomers.filter((customer) => customer.deals >= 2).length;
  const repeatRate = totalCustomers > 0 ? ((repeatCustomers / totalCustomers) * 100).toFixed(1) : '0.0';
  const loyalCustomers = sortedCustomers.filter((customer) => customer.deals >= 3).length;
  const loyalCustomerRate = totalCustomers > 0 ? ((loyalCustomers / totalCustomers) * 100).toFixed(1) : '0.0';

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Grade Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setGradeFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            gradeFilter === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          전체
        </button>
        <button
          onClick={() => setGradeFilter('S')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            gradeFilter === 'S'
              ? 'bg-purple-600 text-white'
              : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
          }`}
        >
          S등급
        </button>
        <button
          onClick={() => setGradeFilter('A')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            gradeFilter === 'A'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          A등급
        </button>
        <button
          onClick={() => setGradeFilter('B')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            gradeFilter === 'B'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          B등급
        </button>
        <button
          onClick={() => setGradeFilter('other')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            gradeFilter === 'other'
              ? 'bg-slate-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          그 외
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">총 고객 수</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{totalCustomers}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">2회 이상 재구매 고객 수</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{repeatCustomers}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-xl">
              <UserCheck className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">2회 이상 재구매율</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{repeatRate}%</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-xl">
              <Percent className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">충성고객 수(3회 이상 재구매)</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{loyalCustomers}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl">
              <Star className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-slate-500 font-medium font-bold">충성고객 전환율</p>
              <p className="text-[32px] font-bold text-slate-900 mt-2 tracking-tight">{loyalCustomerRate}%</p>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl">
              <Award className="w-6 h-6 text-rose-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">고객 관리</h1>
          <p className="text-slate-500 mt-1">{sortedCustomers.length}명의 고객</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">내보내기</span>
          </button>
          <button 
            onClick={() => setShowAddCustomerModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">고객 추가</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="고객명, 회사명, 이메일로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2.5 rounded-lg border transition-colors flex items-center gap-2 ${
              showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">필터</span>
          </button>
        </div>

        {showFilters && (
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">등급:</span>
              <div className="flex gap-2">
                {['all', 'S', 'A', 'B', 'other'].map((grade) => (
                  <button
                    key={grade}
                    onClick={() => setGradeFilter(grade)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      gradeFilter === grade
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {grade === 'all' ? '전체' : grade === 'other' ? '기타' : grade}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customer Table */}
      {isMobile ? (
        /* 모바일 카드 뷰 */
        <div className="space-y-3">
          {sortedCustomers.map((customer) => (
            <MobileCard key={customer.id} onClick={() => setSelectedCustomer(customer)}>
              <MobileCardRow className="mb-2">
                <MobileCardBadge 
                  variant={
                    customer.grade === 'S' ? 'primary' : 
                    customer.grade === 'A' ? 'info' : 
                    customer.grade === 'B' ? 'success' : 'default'
                  }
                >
                  {customer.grade}등급
                </MobileCardBadge>
                <MobileCardBadge variant={
                  customer.status === '충성고객' ? 'primary' :
                  customer.status === '재구매' ? 'success' :
                  customer.status === '신규' ? 'info' : 'warning'
                }>
                  {customer.status}
                </MobileCardBadge>
              </MobileCardRow>
              
              <MobileCardField
                label="기업명"
                value={
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-[16px]">{customer.company}</span>
                  </div>
                }
              />
              
              <div className="grid grid-cols-2 gap-3">
                <MobileCardField
                  label="산업분야"
                  value={<span className="text-[14px]">{customer.industry}</span>}
                />
                <MobileCardField
                  label="지역"
                  value={<span className="text-[14px]">{customer.region}</span>}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <MobileCardField
                  label="거래 횟수"
                  value={<span className="font-semibold text-blue-600">{customer.deals}회</span>}
                />
                <MobileCardField
                  label="총 금액"
                  value={<span className="font-semibold text-green-600">{formatAmount(customer.totalAmount)}</span>}
                />
              </div>
              
              <MobileCardField
                label="고객책임자"
                value={<span className="font-medium">{customer.accountManager}</span>}
              />
              
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="text-[11px] text-slate-500">
                  최근 작업: {customer.lastWorkDate}
                </div>
                <div className="text-[11px] font-medium text-amber-600">
                  다음 관리: {customer.nextManagementDate}
                </div>
              </div>
            </MobileCard>
          ))}
        </div>
      ) : (
        /* 데스크톱 테이블 뷰 */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  기업명
                </th>
                <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  고객 등급
                </th>
                <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  고객 상태
                </th>
                <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  담당자명 / 직책
                </th>
                <th 
                  className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleSort('lastWorkDate')}
                >
                  <div className="flex items-center gap-2">
                    최근 작업일자
                    {sortColumn === 'lastWorkDate' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleSort('totalQuantity')}
                >
                  <div className="flex items-center gap-2">
                    총 수량
                    {sortColumn === 'totalQuantity' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleSort('totalAmount')}
                >
                  <div className="flex items-center gap-2">
                    총 금액 합계
                    {sortColumn === 'totalAmount' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  관리 주기
                </th>
                <th 
                  className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleSort('nextManagementDate')}
                >
                  <div className="flex items-center gap-2">
                    다음 관리 예정일
                    {sortColumn === 'nextManagementDate' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  리마인드 상태
                </th>
                <th className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  고객 책임자
                </th>
                <th className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  삭제
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-900">{customer.company}</span>
                    </div>
                  </td>
                  <td 
                    className="px-4 py-4 relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCell({ customerId: customer.id, field: 'grade' });
                    }}
                  >
                    {editingCell?.customerId === customer.id && editingCell?.field === 'grade' ? (
                      <div className="relative">
                        <select
                          className="text-xs font-bold border rounded-full px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={customer.grade}
                          onChange={(e) => updateCustomerField(customer.id, 'grade', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                        >
                          <option value="S">S</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="그 외">그 외</option>
                        </select>
                      </div>
                    ) : (
                      <div className="cursor-pointer hover:opacity-70 transition-opacity">
                        {getGradeBadge(customer.grade)}
                      </div>
                    )}
                  </td>
                  <td 
                    className="px-4 py-4 relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCell({ customerId: customer.id, field: 'customerStatus' });
                    }}
                  >
                    {editingCell?.customerId === customer.id && editingCell?.field === 'customerStatus' ? (
                      <div className="relative">
                        <select
                          className="text-xs font-medium border rounded-full px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={customer.customerStatus}
                          onChange={(e) => updateCustomerField(customer.id, 'customerStatus', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                        >
                          <option value="충성고객">충성고객</option>
                          <option value="재구매">재구매</option>
                          <option value="신규">신규</option>
                          <option value="고객이탈">고객이탈</option>
                        </select>
                      </div>
                    ) : (
                      <div className="cursor-pointer hover:opacity-70 transition-opacity">
                        {getCustomerStatusBadge(customer.customerStatus)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{customer.contactName}</p>
                      <p className="text-xs text-slate-500">{customer.contactPosition}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {customer.lastWorkDate}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">{customer.totalQuantity.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-semibold text-slate-900">{formatAmount(customer.totalAmount)}</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">{customer.managementCycle}일</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-slate-600">{customer.nextManagementDate}</span>
                  </td>
                  <td 
                    className="px-4 py-4 relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCell({ customerId: customer.id, field: 'reminderStatus' });
                    }}
                  >
                    {editingCell?.customerId === customer.id && editingCell?.field === 'reminderStatus' ? (
                      <div className="relative">
                        <select
                          className="text-xs font-medium border rounded-full px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={customer.reminderStatus}
                          onChange={(e) => updateCustomerField(customer.id, 'reminderStatus', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                        >
                          <option value="미발송">미발송</option>
                          <option value="발송예약완료">발송예약 완료</option>
                        </select>
                      </div>
                    ) : (
                      <div className="cursor-pointer hover:opacity-70 transition-opacity">
                        {getReminderBadge(customer.reminderStatus)}
                      </div>
                    )}
                  </td>
                  <td 
                    className="px-4 py-4 relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCell({ customerId: customer.id, field: 'accountManager' });
                    }}
                  >
                    {editingCell?.customerId === customer.id && editingCell?.field === 'accountManager' ? (
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          className="text-sm text-slate-700 border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={customer.accountManager}
                          onChange={(e) => updateCustomerField(customer.id, 'accountManager', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 rounded px-2 py-1 -mx-2 -my-1 transition-colors">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">{customer.accountManager}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      className="p-1.5 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-slate-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCustomer(customer.id, customer.company);
                      }}
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white md:rounded-xl shadow-xl max-w-[95vw] w-full h-full md:h-auto md:max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-slate-900">
                  고객 상세 정보 {isEditing && <span className="text-blue-600 text-sm">(편집 중)</span>}
                </h2>
                {getGradeBadge(selectedCustomer.grade)}
              </div>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedCustomer(null);
                  setSelectedCustomer(null);
                }}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-6">
                {/* 상단 영역 - 기본 정보 + 내부 관리 메모 */}
                <div className="grid grid-cols-4 gap-6">
                  {/* 기본 정보 */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-slate-900">기본 정보</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">기업명</label>
                        {isEditing && editedCustomer ? (
                          <input
                            type="text"
                            value={editedCustomer.company}
                            onChange={(e) => updateEditedField('company', e.target.value)}
                            className="mt-1 text-sm font-semibold text-slate-900 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <p className="mt-1 text-sm font-semibold text-slate-900">{selectedCustomer.company}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">담당자명 / 직책</label>
                        {isEditing && editedCustomer ? (
                          <div className="flex gap-1 mt-1">
                            <input
                              type="text"
                              value={editedCustomer.contactName}
                              onChange={(e) => updateEditedField('contactName', e.target.value)}
                              placeholder="담당자명"
                              className="text-sm text-slate-900 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                              type="text"
                              value={editedCustomer.contactPosition}
                              onChange={(e) => updateEditedField('contactPosition', e.target.value)}
                              placeholder="직책"
                              className="text-sm text-slate-900 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-slate-900">
                            {selectedCustomer.contactName} / {selectedCustomer.contactPosition}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">이메일</label>
                        {isEditing && editedCustomer ? (
                          <div className="mt-1 flex items-center gap-2">
                            <Mail className="w-4 h-4 text-slate-400" />
                            <input
                              type="email"
                              value={editedCustomer.email}
                              onChange={(e) => updateEditedField('email', e.target.value)}
                              className="text-sm text-slate-900 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-900">
                            <Mail className="w-4 h-4 text-slate-400" />
                            {selectedCustomer.email}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">전화번호</label>
                        {isEditing && editedCustomer ? (
                          <div className="mt-1 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-400" />
                            <input
                              type="tel"
                              value={editedCustomer.phone}
                              onChange={(e) => updateEditedField('phone', e.target.value)}
                              className="text-sm text-slate-900 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-900">
                            <Phone className="w-4 h-4 text-slate-400" />
                            {selectedCustomer.phone}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">주소</label>
                        {isEditing && editedCustomer ? (
                          <div className="mt-1 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            <input
                              type="text"
                              value={editedCustomer.address}
                              onChange={(e) => updateEditedField('address', e.target.value)}
                              className="text-sm text-slate-900 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-900">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            {selectedCustomer.address}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 내부 관리 메모 */}
                  <div className="col-span-1">
                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-4">
                        <FileText className="w-5 h-5 text-slate-600" />
                        <h3 className="text-lg font-semibold text-slate-900">내부 관리 메모</h3>
                      </div>
                      
                      {/* 메모장 */}
                      <textarea
                        value={selectedCustomer.memo}
                        onChange={(e) => {
                          const updatedMemo = e.target.value;
                          // customers 배열 업데이트
                          setCustomers((prevCustomers) =>
                            prevCustomers.map((customer) =>
                              customer.id === selectedCustomer.id
                                ? { ...customer, memo: updatedMemo }
                                : customer
                            )
                          );
                          // selectedCustomer도 업데이트
                          setSelectedCustomer({
                            ...selectedCustomer,
                            memo: updatedMemo,
                          });
                        }}
                        placeholder="메모를 입력하세요..."
                        className="flex-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none leading-relaxed"
                      />
                    </div>
                  </div>
                </div>

                {/* 하단 영역 - 작업 히스토리 */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <History className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg font-semibold text-slate-900">작업 히스토리</h3>
                  </div>

                  {/* 거래 현황 KPI */}
                  <div className="grid grid-cols-7 gap-4 mb-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">작업 횟수</p>
                      <p className="text-2xl font-bold text-blue-900 mt-2">{selectedCustomer.workHistory.length}회</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                      <p className="text-xs font-medium text-green-600 uppercase tracking-wider">총 금액 합계</p>
                      <p className="text-2xl font-bold text-green-900 mt-2">
                        {formatAmount(selectedCustomer.workHistory.reduce((sum, work) => sum + work.quotationAmount, 0))}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                      <p className="text-xs font-medium text-purple-600 uppercase tracking-wider">보유 수량</p>
                      {isEditing && editedCustomer ? (
                        <input
                          type="number"
                          value={editedCustomer.totalQuantity}
                          onChange={(e) => updateEditedField('totalQuantity', Number(e.target.value))}
                          className="text-2xl font-bold text-purple-900 mt-2 w-full border border-purple-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      ) : (
                        <p className="text-2xl font-bold text-purple-900 mt-2">{selectedCustomer.totalQuantity.toLocaleString()}</p>
                      )}
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                      <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">총 작업 수량</p>
                      <p className="text-2xl font-bold text-amber-900 mt-2">
                        {selectedCustomer.workHistory.reduce((sum, work) => sum + work.totalQuantity, 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                      <p className="text-xs font-medium text-orange-600 uppercase tracking-wider">최근 작업일</p>
                      <p className="text-sm font-semibold text-orange-900 mt-2">{selectedCustomer.lastWorkDate}</p>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                      <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">관리 주기</p>
                      {isEditing && editedCustomer ? (
                        <input
                          type="number"
                          value={editedCustomer.managementCycle}
                          onChange={(e) => updateEditedField('managementCycle', Number(e.target.value))}
                          className="text-2xl font-bold text-indigo-900 mt-2 w-full border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <p className="text-2xl font-bold text-indigo-900 mt-2">{selectedCustomer.managementCycle}일</p>
                      )}
                    </div>
                    <div className="bg-teal-50 p-4 rounded-lg border border-teal-100">
                      <p className="text-xs font-medium text-teal-600 uppercase tracking-wider">다음 관리 예정일</p>
                      <p className="text-sm font-semibold text-teal-900 mt-2">
                        {calculateNextManagementDate(selectedCustomer.lastWorkDate, selectedCustomer.managementCycle)}
                      </p>
                    </div>
                  </div>

                  {/* 작업 추가 버튼 */}
                  <div className="flex justify-end mb-4">
                    <button
                      onClick={() => setShowAddWorkForm(!showAddWorkForm)}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      {showAddWorkForm ? '취소' : '작업 추가'}
                    </button>
                  </div>

                  {/* 작업 추가 폼 */}
                  {showAddWorkForm && (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                      <h4 className="text-sm font-semibold text-slate-900 mb-4">새 작업 추가</h4>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">문의 등록일</label>
                          <input
                            type="date"
                            value={newWork.inquiryDate}
                            onChange={(e) => setNewWork({ ...newWork, inquiryDate: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">프로젝트명</label>
                          <input
                            type="text"
                            value={newWork.projectName}
                            onChange={(e) => setNewWork({ ...newWork, projectName: e.target.value })}
                            placeholder="프로젝트명 입력"
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">총수량</label>
                          <input
                            type="number"
                            value={newWork.totalQuantity || ''}
                            onChange={(e) => setNewWork({ ...newWork, totalQuantity: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">상세수량</label>
                          <input
                            type="text"
                            value={newWork.detailedQuantity}
                            onChange={(e) => setNewWork({ ...newWork, detailedQuantity: e.target.value })}
                            placeholder="예: A4 용지 1000개"
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">견적금액 (원)</label>
                          <input
                            type="number"
                            value={newWork.quotationAmount || ''}
                            onChange={(e) => setNewWork({ ...newWork, quotationAmount: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">고객책임자</label>
                          <input
                            type="text"
                            value={newWork.accountManager}
                            onChange={(e) => setNewWork({ ...newWork, accountManager: e.target.value })}
                            placeholder="담당자명"
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">작업일자</label>
                          <input
                            type="date"
                            value={newWork.workDate}
                            onChange={(e) => setNewWork({ ...newWork, workDate: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">작업팀장(하청)</label>
                          <input
                            type="text"
                            value={newWork.subcontractorManager}
                            onChange={(e) => setNewWork({ ...newWork, subcontractorManager: e.target.value })}
                            placeholder="팀장명"
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div className="col-span-4 flex items-center gap-4 pt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newWork.reportSent}
                              onChange={(e) => setNewWork({ ...newWork, reportSent: e.target.checked })}
                              className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                            />
                            <span className="text-xs font-medium text-slate-700">리포트전송</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newWork.reminder1}
                              onChange={(e) => setNewWork({ ...newWork, reminder1: e.target.checked })}
                              className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                            />
                            <span className="text-xs font-medium text-slate-700">리마인드1차</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newWork.reminder2}
                              onChange={(e) => setNewWork({ ...newWork, reminder2: e.target.checked })}
                              className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                            />
                            <span className="text-xs font-medium text-slate-700">리마인드2차</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newWork.reminder3}
                              onChange={(e) => setNewWork({ ...newWork, reminder3: e.target.checked })}
                              className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                            />
                            <span className="text-xs font-medium text-slate-700">리마인드3차</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={() => {
                            if (newWork.inquiryDate && newWork.projectName && selectedCustomer) {
                              // 새 작업을 workHistory에 추가
                              const updatedWorkHistory = [...selectedCustomer.workHistory, newWork];
                              
                              // customers 배열 업데이트
                              setCustomers((prevCustomers) =>
                                prevCustomers.map((customer) =>
                                  customer.id === selectedCustomer.id
                                    ? {
                                        ...customer,
                                        workHistory: updatedWorkHistory,
                                        deals: updatedWorkHistory.length,
                                        lastWorkDate: newWork.workDate || selectedCustomer.lastWorkDate,
                                      }
                                    : customer
                                )
                              );
                              
                              // selectedCustomer도 업데이트
                              setSelectedCustomer({
                                ...selectedCustomer,
                                workHistory: updatedWorkHistory,
                                deals: updatedWorkHistory.length,
                                lastWorkDate: newWork.workDate || selectedCustomer.lastWorkDate,
                              });
                              
                              // 폼 초기화
                              setNewWork({
                                inquiryDate: '',
                                projectName: '',
                                totalQuantity: 0,
                                detailedQuantity: '',
                                quotationAmount: 0,
                                accountManager: '',
                                workDate: '',
                                subcontractorManager: '',
                                reportSent: false,
                                reminder1: false,
                                reminder2: false,
                                reminder3: false,
                              });
                              setShowAddWorkForm(false);
                            }
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
                        >
                          작업 추가
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 테이블 형태의 작업 히스토리 */}
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              문의 등록일
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              프로젝트명
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              총수량
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              상세수량
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              견적금액
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              고객책임자
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              작업일자
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              작업팀장(하청)
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              리포트전송
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              리마인드1차
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              리마인드2차
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              리마인드3차
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              작업
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {selectedCustomer.workHistory
                            .sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime())
                            .map((work, index) => (
                              <tr key={index} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="date"
                                      value={editedCustomer.workHistory[index]?.inquiryDate || work.inquiryDate}
                                      onChange={(e) => updateEditedWorkHistory(index, 'inquiryDate', e.target.value)}
                                      className="text-sm text-slate-700 border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2 text-sm text-slate-700 whitespace-nowrap">
                                      <Calendar className="w-4 h-4 text-slate-400" />
                                      {work.inquiryDate}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="text"
                                      value={editedCustomer.workHistory[index]?.projectName || work.projectName}
                                      onChange={(e) => updateEditedWorkHistory(index, 'projectName', e.target.value)}
                                      className="text-sm font-medium text-slate-900 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <span className="text-sm font-medium text-slate-900">{work.projectName}</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="number"
                                      value={editedCustomer.workHistory[index]?.totalQuantity || work.totalQuantity}
                                      onChange={(e) => updateEditedWorkHistory(index, 'totalQuantity', Number(e.target.value))}
                                      className="text-sm text-slate-700 border border-slate-300 rounded px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                      <Package className="w-4 h-4 text-slate-400" />
                                      <span className="text-sm text-slate-700">{work.totalQuantity.toLocaleString()}개</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="text"
                                      value={editedCustomer.workHistory[index]?.detailedQuantity || work.detailedQuantity}
                                      onChange={(e) => updateEditedWorkHistory(index, 'detailedQuantity', e.target.value)}
                                      className="text-sm text-slate-700 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <span className="text-sm text-slate-700">{work.detailedQuantity}</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="number"
                                      value={editedCustomer.workHistory[index]?.quotationAmount || work.quotationAmount}
                                      onChange={(e) => updateEditedWorkHistory(index, 'quotationAmount', Number(e.target.value))}
                                      className="text-sm font-semibold text-blue-600 border border-slate-300 rounded px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <span className="text-sm font-semibold text-blue-600 whitespace-nowrap">{formatAmount(work.quotationAmount)}</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="text"
                                      value={editedCustomer.workHistory[index]?.accountManager || work.accountManager}
                                      onChange={(e) => updateEditedWorkHistory(index, 'accountManager', e.target.value)}
                                      className="text-sm text-slate-700 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                      <User className="w-4 h-4 text-slate-400" />
                                      <span className="text-sm text-slate-700">{work.accountManager}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="date"
                                      value={editedCustomer.workHistory[index]?.workDate || work.workDate}
                                      onChange={(e) => updateEditedWorkHistory(index, 'workDate', e.target.value)}
                                      className="text-sm text-slate-700 border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2 text-sm text-slate-700 whitespace-nowrap">
                                      <Calendar className="w-4 h-4 text-slate-400" />
                                      {work.workDate}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing && editedCustomer ? (
                                    <input
                                      type="text"
                                      value={editedCustomer.workHistory[index]?.subcontractorManager || work.subcontractorManager}
                                      onChange={(e) => updateEditedWorkHistory(index, 'subcontractorManager', e.target.value)}
                                      className="text-sm text-slate-700 border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                      <User className="w-4 h-4 text-slate-400" />
                                      <span className="text-sm text-slate-700">{work.subcontractorManager}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleReportSentStatus(index);
                                    }}
                                    className="cursor-pointer hover:opacity-70 transition-opacity"
                                  >
                                    {work.reportSent ? (
                                      <CheckCircle className="w-5 h-5 text-green-600" />
                                    ) : (
                                      <X className="w-5 h-5 text-slate-300" />
                                    )}
                                  </button>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleReminderStatus(index, 'reminder1');
                                      }}
                                      className="cursor-pointer hover:opacity-70 transition-opacity"
                                    >
                                      {work.reminder1 ? (
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                      ) : (
                                        <X className="w-5 h-5 text-slate-300" />
                                      )}
                                    </button>
                                    <span className="text-xs text-slate-500">
                                      {calculateReminderDate(work.workDate, 2)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleReminderStatus(index, 'reminder2');
                                      }}
                                      className="cursor-pointer hover:opacity-70 transition-opacity"
                                    >
                                      {work.reminder2 ? (
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                      ) : (
                                        <X className="w-5 h-5 text-slate-300" />
                                      )}
                                    </button>
                                    <span className="text-xs text-slate-500">
                                      {calculateReminderDate(work.workDate, 6)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleReminderStatus(index, 'reminder3');
                                      }}
                                      className="cursor-pointer hover:opacity-70 transition-opacity"
                                    >
                                      {work.reminder3 ? (
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                      ) : (
                                        <X className="w-5 h-5 text-slate-300" />
                                      )}
                                    </button>
                                    <span className="text-xs text-slate-500">
                                      {calculateReminderDate(work.workDate, 11)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (selectedCustomer && window.confirm('이 작업을 삭제하시겠습니까?')) {
                                        // 해당 작업을 제거한 새 배열 생성
                                        const updatedWorkHistory = selectedCustomer.workHistory.filter((_, i) => i !== index);
                                        
                                        // 최근 작업일자 계산 (작업이 남아있으면 가장 최근 것, 없으면 기존값 유지)
                                        const newLastWorkDate = updatedWorkHistory.length > 0
                                          ? updatedWorkHistory.reduce((latest, w) => {
                                              return new Date(w.workDate) > new Date(latest) ? w.workDate : latest;
                                            }, updatedWorkHistory[0].workDate)
                                          : selectedCustomer.lastWorkDate;
                                        
                                        // customers 배열 업데이트
                                        setCustomers((prevCustomers) =>
                                          prevCustomers.map((customer) =>
                                            customer.id === selectedCustomer.id
                                              ? {
                                                  ...customer,
                                                  workHistory: updatedWorkHistory,
                                                  deals: updatedWorkHistory.length,
                                                  lastWorkDate: newLastWorkDate,
                                                }
                                              : customer
                                          )
                                        );
                                        
                                        // selectedCustomer도 업데이트
                                        setSelectedCustomer({
                                          ...selectedCustomer,
                                          workHistory: updatedWorkHistory,
                                          deals: updatedWorkHistory.length,
                                          lastWorkDate: newLastWorkDate,
                                        });
                                      }
                                    }}
                                    className="p-1.5 hover:bg-red-50 rounded transition-colors group"
                                    title="작업 삭제"
                                  >
                                    <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-600" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  {isEditing ? (
                    <>
                      <button 
                        onClick={handleSaveEdit}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                      >
                        저장하기
                      </button>
                      <button 
                        onClick={handleCancelEdit}
                        className="flex-1 px-4 py-2.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={handleStartEdit}
                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        수정하기
                      </button>
                      <button 
                        onClick={() => setSelectedCustomer(null)}
                        className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                      >
                        목록보기
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 고객 추가 모달 */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">신규 고객 추가</h2>
              <button
                onClick={() => setShowAddCustomerModal(false)}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                {/* 필수 정보 */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">필수 정보</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        회사명 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCustomer.company || ''}
                        onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="회사명을 입력하세요"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        고객 책임자
                      </label>
                      <input
                        type="text"
                        value={newCustomer.accountManager || ''}
                        onChange={(e) => setNewCustomer({ ...newCustomer, accountManager: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="담당자���을 입력하세요"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        전화번호 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={newCustomer.phone || ''}
                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="010-1234-5678"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        이메일
                      </label>
                      <input
                        type="email"
                        value={newCustomer.email || ''}
                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="email@example.com"
                      />
                    </div>
                  </div>
                </div>

                {/* 추가 정보 */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">추가 정보</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">고객 등급</label>
                      <select
                        value={newCustomer.grade || 'B'}
                        onChange={(e) => setNewCustomer({ ...newCustomer, grade: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="S">S등급</option>
                        <option value="A">A등급</option>
                        <option value="B">B등급</option>
                        <option value="그 외">그 외</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">고객 상태</label>
                      <select
                        value={newCustomer.status || '신규'}
                        onChange={(e) => setNewCustomer({ ...newCustomer, status: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="신규">신규</option>
                        <option value="재구매">재구매</option>
                        <option value="충성고객">충성고객</option>
                        <option value="고���이탈">고객이탈</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">산업군</label>
                      <input
                        type="text"
                        value={newCustomer.industry || ''}
                        onChange={(e) => setNewCustomer({ ...newCustomer, industry: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: IT, 제조, 금융"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">지역</label>
                      <input
                        type="text"
                        value={newCustomer.region || ''}
                        onChange={(e) => setNewCustomer({ ...newCustomer, region: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: 서울, 경기"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">관리 주기 (일)</label>
                      <input
                        type="number"
                        value={newCustomer.managementCycle || 30}
                        onChange={(e) => setNewCustomer({ ...newCustomer, managementCycle: parseInt(e.target.value) || 30 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">리마인드 상태</label>
                      <select
                        value={newCustomer.reminderStatus || '미발송'}
                        onChange={(e) => setNewCustomer({ ...newCustomer, reminderStatus: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="미발송">미발송</option>
                        <option value="발송예약완료">발송예약 완료</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 버튼 영역 */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={() => setShowAddCustomerModal(false)}
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium text-slate-700"
                >
                  취소
                </button>
                <button
                  onClick={handleAddCustomer}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  고객 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}