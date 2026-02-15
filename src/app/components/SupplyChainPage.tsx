import { useState, useEffect } from 'react';
import {
  UserCircle,
  Users,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Star,
  Plus,
  Search,
  Download,
  Calendar,
  Building2,
  TrendingUp,
  CheckCircle2,
  Clock,
  X,
  Map,
  Trash2,
  FileText,
} from 'lucide-react';
import { MobileCard, MobileCardField, MobileCardRow, MobileCardBadge } from './MobileCard';

interface CustomerManager {
  id: number;
  name: string;
  position: string;
  phone: string;
  email: string;
  address: string;
  assignedArea: string;
  joinDate: string;
  assignedCustomers: number;
  activeProjects: number;
  completedProjects: number;
  totalSalesAmount: number;
  performanceRating: number;
  specialties: string[];
  status: 'active' | 'vacation' | 'leave';
  repurchaseRate: number; // 재구매율 (%)
  newCustomers: number; // 신규 고객 수
  repurchaseCustomers: number; // 재구매 고객 수
  recentActivities: {
    inquiryDate: string;
    customerCompany: string; // 고객사
    projectName: string;
    totalQuantity: number;
    detailQuantity: string;
    estimateAmount: number;
    customerManager: string;
    workDate: string;
    subcontractor: string;
  }[];
}

interface SubcontractorManager {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  assignedArea: string;
  registrationDate: string;
  specialization: string;
  teamSize: number;
  grade: 'S' | 'A' | 'B' | 'C';
  age: number;
  ongoingProjects: number;
  completedProjects: number;
  totalContractAmount: number;
  performanceRating: number;
  cooperationScore: number; // 협력평가점수 (정수)
  evaluationHistory: EvaluationRecord[]; // 평가 이력
  certifications: string[];
  status: 'available' | 'busy' | 'unavailable';
  recentProjects: { date: string; projectName: string; client: string; status: string }[];
  memo: string; // 내부 관리 메모
  repurchaseCount: number; // 재구매 건수
  baseScore: number; // 기본점수 (수정 가능)
  recentActivities: {
    inquiryDate: string;
    customerCompany: string; // 고객사
    projectName: string;
    totalQuantity: number;
    detailQuantity: string;
    estimateAmount: number;
    customerManager: string;
    workDate: string;
    subcontractor: string;
    workEvaluation: string; // 작업 평가
    workEvaluationScore: number; // 작업평가 점수
    // 작업 평가 세부 항목
    evalCustomerClaim?: number;
    evalAllDevices?: number;
    evalOnTime?: number;
    evalAfterService?: number;
    evalUniform?: number;
    evalKindness?: number;
  }[];
}

interface EvaluationRecord {
  date: string;
  evaluator: string;
  item1Score: number; // 오더 제공 시 우선순위로 협력하는가 (+1 or -1)
  item2Score: number; // 에어터 공급가보다 더 요구하는가 (+1 or -1)
  totalScore: number; // 합계
  memo?: string;
}

// === 고객책임자 API ===
export async function fetchManagers(): Promise<CustomerManager[]> {
  const response = await fetch('/api/managers');
  if (!response.ok) throw new Error('고객책임자 데이터 조회 실패');
  const result = await response.json();
  return result.data || [];
}

export async function createManager(manager: Omit<CustomerManager, 'id'>): Promise<number> {
  const response = await fetch('/api/managers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manager),
  });
  if (!response.ok) throw new Error('고객책임자 추가 실패');
  const result = await response.json();
  return result.id;
}

export async function updateManager(manager: CustomerManager): Promise<void> {
  const response = await fetch('/api/managers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manager),
  });
  if (!response.ok) throw new Error('고객책임자 수정 실패');
}

export async function deleteManager(id: number): Promise<void> {
  const response = await fetch('/api/managers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error('고객책임자 삭제 실패');
}

// === 작업팀장/하청 API ===
export async function fetchSubcontractors(): Promise<SubcontractorManager[]> {
  const response = await fetch('/api/subcontractors');
  if (!response.ok) throw new Error('작업팀장 데이터 조회 실패');
  const result = await response.json();
  return result.data || [];
}

export async function createSubcontractor(sub: Omit<SubcontractorManager, 'id'>): Promise<number> {
  const response = await fetch('/api/subcontractors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  if (!response.ok) throw new Error('작업팀장 추가 실패');
  const result = await response.json();
  return result.id;
}

export async function updateSubcontractor(sub: SubcontractorManager): Promise<void> {
  const response = await fetch('/api/subcontractors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  if (!response.ok) throw new Error('작업팀장 수정 실패');
}

export async function deleteSubcontractor(id: number): Promise<void> {
  const response = await fetch('/api/subcontractors', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error('작업팀장 삭제 실패');
}

export const initialCustomerManagers: CustomerManager[] = [
  {
    id: 1,
    name: '김민수',
    position: '1팀',
    phone: '010-1234-5678',
    email: 'kim.minsu@airtor.com',
    address: '서울시 강남구 테헤란로 123',
    assignedArea: '서울 수도권',
    joinDate: '2020-03-15',
    assignedCustomers: 15,
    activeProjects: 8,
    completedProjects: 42,
    totalSalesAmount: 1850000000,
    performanceRating: 4.8,
    specialties: ['제조업', '대기업', '장기계약'],
    status: 'active',
    repurchaseRate: 85,
    newCustomers: 5,
    repurchaseCustomers: 10,
    recentActivities: [
      {
        inquiryDate: '2024-02-05',
        customerCompany: '삼성전자',
        projectName: '삼성전자 공장 건설',
        totalQuantity: 1000,
        detailQuantity: '1000개',
        estimateAmount: 150000000,
        customerManager: '김민수',
        workDate: '2024-02-05',
        subcontractor: '태준엔지니어링',
      },
      {
        inquiryDate: '2024-02-03',
        customerCompany: 'LG화학',
        projectName: 'LG화학 공장 건설',
        totalQuantity: 500,
        detailQuantity: '500개',
        estimateAmount: 75000000,
        customerManager: '김민수',
        workDate: '2024-02-03',
        subcontractor: '민재건설',
      },
      {
        inquiryDate: '2024-02-01',
        customerCompany: '현대자동차',
        projectName: '현대자동차 공장 건설',
        totalQuantity: 2000,
        detailQuantity: '2000개',
        estimateAmount: 300000000,
        customerManager: '김민수',
        workDate: '2024-02-01',
        subcontractor: '하늘기계',
      },
    ],
  },
  {
    id: 2,
    name: '이지은',
    position: '2팀',
    phone: '010-2345-6789',
    email: 'lee.jieun@airtor.com',
    address: '서울시 강남구 테헤란로 456',
    assignedArea: '충청권',
    joinDate: '2019-07-22',
    assignedCustomers: 18,
    activeProjects: 11,
    completedProjects: 56,
    totalSalesAmount: 2340000000,
    performanceRating: 4.9,
    specialties: ['IT/통신', '중견기업', '유지보수'],
    status: 'active',
    repurchaseRate: 90,
    newCustomers: 3,
    repurchaseCustomers: 15,
    recentActivities: [
      {
        inquiryDate: '2024-02-06',
        customerCompany: '네이버',
        projectName: '네이버 데이터센터 건설',
        totalQuantity: 1500,
        detailQuantity: '1500개',
        estimateAmount: 225000000,
        customerManager: '이지은',
        workDate: '2024-02-06',
        subcontractor: '서준시스템',
      },
      {
        inquiryDate: '2024-02-04',
        customerCompany: '카카오',
        projectName: '카카오 옥 건설',
        totalQuantity: 1000,
        detailQuantity: '1000개',
        estimateAmount: 150000000,
        customerManager: '이지은',
        workDate: '2024-02-04',
        subcontractor: '태준엔지니어링',
      },
      {
        inquiryDate: '2024-02-02',
        customerCompany: '쿠팡',
        projectName: '쿠팡 물류센터 건설',
        totalQuantity: 2000,
        detailQuantity: '2000개',
        estimateAmount: 300000000,
        customerManager: '이지은',
        workDate: '2024-02-02',
        subcontractor: '민재건설',
      },
    ],
  },
  {
    id: 3,
    name: '박준형',
    position: '1팀',
    phone: '010-3456-7890',
    email: 'park.junhyung@airtor.com',
    address: '서울시 강남구 테헤란로 789',
    assignedArea: '경상권',
    joinDate: '2021-01-10',
    assignedCustomers: 12,
    activeProjects: 6,
    completedProjects: 28,
    totalSalesAmount: 1250000000,
    performanceRating: 4.6,
    specialties: ['건설업', '공공기관', '신규영업'],
    status: 'active',
    repurchaseRate: 75,
    newCustomers: 4,
    repurchaseCustomers: 8,
    recentActivities: [
      {
        inquiryDate: '2024-02-05',
        customerCompany: 'SK건설',
        projectName: 'SK건설 공장 건설',
        totalQuantity: 1000,
        detailQuantity: '1000개',
        estimateAmount: 150000000,
        customerManager: '박준형',
        workDate: '2024-02-05',
        subcontractor: '태준엔지니어링',
      },
      {
        inquiryDate: '2024-02-03',
        customerCompany: '대림산업',
        projectName: '대림산업 공장 건설',
        totalQuantity: 500,
        detailQuantity: '500개',
        estimateAmount: 75000000,
        customerManager: '박준형',
        workDate: '2024-02-03',
        subcontractor: '민재건설',
      },
    ],
  },
  {
    id: 4,
    name: '최서연',
    position: '3팀',
    phone: '010-4567-8901',
    email: 'choi.seoyeon@airtor.com',
    address: '서울시 강남구 테헤란로 1011',
    assignedArea: '서울 수도권',
    joinDate: '2020-09-01',
    assignedCustomers: 14,
    activeProjects: 7,
    completedProjects: 35,
    totalSalesAmount: 1580000000,
    performanceRating: 4.7,
    specialties: ['금융업', '대기업', '컨설팅'],
    status: 'vacation',
    repurchaseRate: 80,
    newCustomers: 2,
    repurchaseCustomers: 12,
    recentActivities: [
      {
        inquiryDate: '2024-01-30',
        customerCompany: '신한은행',
        projectName: '신한은행 공장 건설',
        totalQuantity: 1000,
        detailQuantity: '1000개',
        estimateAmount: 150000000,
        customerManager: '최서연',
        workDate: '2024-01-30',
        subcontractor: '태준엔지니어링',
      },
      {
        inquiryDate: '2024-01-28',
        customerCompany: 'KB국민은행',
        projectName: 'KB국민은행 공장 건설',
        totalQuantity: 500,
        detailQuantity: '500개',
        estimateAmount: 75000000,
        customerManager: '최서연',
        workDate: '2024-01-28',
        subcontractor: '민재건설',
      },
    ],
  },
];

export const initialSubcontractors: SubcontractorManager[] = [
  {
    id: 1,
    name: '강태준',
    company: '태준엔지니어링',
    phone: '010-5678-9012',
    email: 'kang@taejun-eng.com',
    address: '서울시 강남구 테헤란로 123',
    assignedArea: '서울 수도권',
    registrationDate: '2018-05-20',
    specialization: '전기/제어',
    teamSize: 15,
    grade: 'A',
    age: 45,
    ongoingProjects: 5,
    completedProjects: 68,
    totalContractAmount: 3200000000,
    performanceRating: 4.9,
    cooperationScore: 0, // 협력평가점수
    evaluationHistory: [
      {
        date: '2024-01-10',
        evaluator: '김민수',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순위로 협력함',
      },
      {
        date: '2024-01-20',
        evaluator: '이지은',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순위로 협력함',
      },
    ],
    certifications: ['전기공사업', '소방설비업', 'ISO 9001'],
    status: 'busy',
    recentProjects: [
      { date: '2024-02-01', projectName: '삼성전자 공장 전기공사', client: '삼성전자', status: '진행중' },
      { date: '2024-01-15', projectName: 'LG화학 전반 설치', client: 'LG화학', status: '완료' },
      { date: '2024-01-05', projectName: '현대자동차 제어시스템', client: '현대자동차', status: '진행중' },
    ],
    memo: '성실하고 협력적인 업체. 다음 프로젝트 우선 배정 고려.',
    repurchaseCount: 35,
    baseScore: 50,
    recentActivities: [
      {
        inquiryDate: '2024-02-01',
        customerCompany: '삼성전자',
        projectName: '삼성전자 공장 전기공사',
        totalQuantity: 1500,
        detailQuantity: '전기설비 1500개',
        estimateAmount: 250000000,
        customerManager: '김민수',
        workDate: '2024-02-05',
        subcontractor: '강태준',
        workEvaluation: '우수',
        workEvaluationScore: 92,
      },
      {
        inquiryDate: '2024-01-15',
        customerCompany: 'LG화학',
        projectName: 'LG화학 전반 설치',
        totalQuantity: 800,
        detailQuantity: '전반 800개',
        estimateAmount: 120000000,
        customerManager: '이지은',
        workDate: '2024-01-20',
        subcontractor: '강태준',
        workEvaluation: '우수',
        workEvaluationScore: 90,
      },
      {
        inquiryDate: '2024-01-05',
        customerCompany: '현대자동차',
        projectName: '현대자동차 제어시스템',
        totalQuantity: 2000,
        detailQuantity: '제어장치 2000개',
        estimateAmount: 350000000,
        customerManager: '박성호',
        workDate: '2024-01-10',
        subcontractor: '강태준',
        workEvaluation: '매우우수',
        workEvaluationScore: 98,
      },
    ],
  },
  {
    id: 2,
    name: '송민재',
    company: '민재건설',
    phone: '010-6789-0123',
    email: 'song@minjae-const.com',
    address: '경기도 성남시 분당구 판교로 456',
    assignedArea: '충청권',
    registrationDate: '2019-03-15',
    specialization: '토목/건축',
    teamSize: 22,
    grade: 'B',
    age: 50,
    ongoingProjects: 4,
    completedProjects: 45,
    totalContractAmount: 4500000000,
    performanceRating: 4.7,
    cooperationScore: 0, // 협력평가점수
    evaluationHistory: [
      {
        date: '2024-01-10',
        evaluator: '김민수',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순위로 협력함',
      },
      {
        date: '2024-01-20',
        evaluator: '이지은',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순위로 협력함',
      },
    ],
    certifications: ['종합건설업', '건축사업', '품질경영시스템'],
    status: 'available',
    recentProjects: [
      { date: '2024-01-28', projectName: 'SK건설 협력공사', client: 'SK건설', status: '완료' },
      { date: '2024-01-10', projectName: '대림산업 구조물 시공', client: '대림산업', status: '완료' },
    ],
    memo: '품질 관리 우수. 계약 조건 협의 필요.',
    repurchaseCount: 28,
    baseScore: 50,
    recentActivities: [
      {
        inquiryDate: '2024-01-28',
        customerCompany: 'SK건설',
        projectName: 'SK건설 협력공사',
        totalQuantity: 3000,
        detailQuantity: '건축자재 3000개',
        estimateAmount: 450000000,
        customerManager: '최서연',
        workDate: '2024-02-02',
        subcontractor: '송민재',
        workEvaluation: '양호',
        workEvaluationScore: 85,
      },
      {
        inquiryDate: '2024-01-10',
        customerCompany: '대림산업',
        projectName: '대림산업 구조물 시공',
        totalQuantity: 2500,
        detailQuantity: '구조물 부품 2500개',
        estimateAmount: 380000000,
        customerManager: '정우진',
        workDate: '2024-01-15',
        subcontractor: '송민재',
        workEvaluation: '우수',
        workEvaluationScore: 91,
      },
    ],
  },
  {
    id: 3,
    name: '정하늘',
    company: '하늘기계',
    phone: '010-7890-1234',
    email: 'jung@skytech.com',
    address: '인천시 남동구 논현로 789',
    assignedArea: '경상권',
    registrationDate: '2017-11-08',
    specialization: '기계설비',
    teamSize: 18,
    grade: 'A',
    age: 40,
    ongoingProjects: 6,
    completedProjects: 82,
    totalContractAmount: 2850000000,
    performanceRating: 4.8,
    cooperationScore: 0, // 협력평가점수
    evaluationHistory: [
      {
        date: '2024-01-10',
        evaluator: '김민수',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순위로 협력함',
      },
      {
        date: '2024-01-20',
        evaluator: '이지은',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순��로 협력함',
      },
    ],
    certifications: ['기계설비공사업', '냉난방공사업', '환경 ISO 14001'],
    status: 'busy',
    recentProjects: [
      { date: '2024-02-03', projectName: '네이버 데이터센터 냉방', client: '네이버', status: '진행중' },
      { date: '2024-01-20', projectName: '카카오 사옥 공조설비', client: '카카오', status: '진행중' },
      { date: '2024-01-10', projectName: '쿠팡 물류센터 환기', client: '쿠팡', status: '완료' },
    ],
    memo: '',
    repurchaseCount: 42,
    baseScore: 50,
    recentActivities: [
      {
        inquiryDate: '2024-02-03',
        customerCompany: '네이버',
        projectName: '네이버 데이터센터 냉방',
        totalQuantity: 1800,
        detailQuantity: '냉방설비 1800개',
        estimateAmount: 280000000,
        customerManager: '김민수',
        workDate: '2024-02-08',
        subcontractor: '정하늘',
        workEvaluation: '매우우수',
        workEvaluationScore: 96,
      },
      {
        inquiryDate: '2024-01-20',
        customerCompany: '카카오',
        projectName: '카카오 사옥 공조설비',
        totalQuantity: 1200,
        detailQuantity: '공조장치 1200개',
        estimateAmount: 180000000,
        customerManager: '이지은',
        workDate: '2024-01-25',
        subcontractor: '정하늘',
        workEvaluation: '우수',
        workEvaluationScore: 93,
      },
      {
        inquiryDate: '2024-01-10',
        customerCompany: '쿠팡',
        projectName: '쿠팡 물류센터 환기',
        totalQuantity: 900,
        detailQuantity: '환기시스템 900개',
        estimateAmount: 150000000,
        customerManager: '박성호',
        workDate: '2024-01-15',
        subcontractor: '정하늘',
        workEvaluation: '우수',
        workEvaluationScore: 94,
      },
    ],
  },
  {
    id: 4,
    name: '윤서준',
    company: '서준시스템',
    phone: '010-8901-2345',
    email: 'yoon@seojun-sys.com',
    address: '경기도 수원시 영통구 광교로 234',
    assignedArea: '서울 수도권',
    registrationDate: '2020-02-12',
    specialization: 'IT/네트워크',
    teamSize: 12,
    grade: 'C',
    age: 35,
    ongoingProjects: 3,
    completedProjects: 34,
    totalContractAmount: 1680000000,
    performanceRating: 4.6,
    cooperationScore: 0, // 협력평가점��
    evaluationHistory: [
      {
        date: '2024-01-10',
        evaluator: '김민수',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순위로 협력함',
      },
      {
        date: '2024-01-20',
        evaluator: '이지은',
        item1Score: 1,
        item2Score: 0,
        totalScore: 1,
        memo: '우선순위로 협력함',
      },
    ],
    certifications: ['정보통신공사업', '네트워크 전문가', '보안 ISO 27001'],
    status: 'available',
    recentProjects: [
      { date: '2024-01-25', projectName: '신한은행 네트워크 구축', client: '신한은행', status: '완료' },
      { date: '2024-01-12', projectName: 'KB국민은행 보안시스템', client: 'KB국민은행', status: '완료' },
    ],
    memo: '',
    repurchaseCount: 22,
    baseScore: 50,
    recentActivities: [
      {
        inquiryDate: '2024-01-25',
        customerCompany: '신한은행',
        projectName: '신한은행 네트워크 구축',
        totalQuantity: 600,
        detailQuantity: '네트워크 장비 600개',
        estimateAmount: 95000000,
        customerManager: '��서연',
        workDate: '2024-01-30',
        subcontractor: '윤서준',
        workEvaluation: '양호',
        workEvaluationScore: 82,
      },
      {
        inquiryDate: '2024-01-12',
        customerCompany: 'KB국민은행',
        projectName: 'KB국민은행 보안시스템',
        totalQuantity: 450,
        detailQuantity: '보안장비 450개',
        estimateAmount: 72000000,
        customerManager: '정우진',
        workDate: '2024-01-18',
        subcontractor: '윤서준',
        workEvaluation: '우수',
        workEvaluationScore: 89,
      },
    ],
  },
];

interface SupplyChainPageProps {
  externalManagersState?: [CustomerManager[], (m: CustomerManager[] | ((prev: CustomerManager[]) => CustomerManager[])) => void];
  externalSubcontractorsState?: [SubcontractorManager[], (s: SubcontractorManager[] | ((prev: SubcontractorManager[]) => SubcontractorManager[])) => void];
  onNotification?: (message: string) => void;
}

export function SupplyChainPage({ externalManagersState, externalSubcontractorsState, onNotification }: SupplyChainPageProps = {}) {
  const [activeTab, setActiveTab] = useState<'managers' | 'subcontractors'>('managers');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedManager, setSelectedManager] = useState<CustomerManager | null>(null);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<SubcontractorManager | null>(null);
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
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [internalManagers, setInternalManagers] = useState<CustomerManager[]>(initialCustomerManagers);
  const [internalSubcontractors, setInternalSubcontractors] = useState<SubcontractorManager[]>(initialSubcontractors);
  const managers = externalManagersState ? externalManagersState[0] : internalManagers;
  const setManagers = externalManagersState ? externalManagersState[1] : setInternalManagers;
  const subcontractors = externalSubcontractorsState ? externalSubcontractorsState[0] : internalSubcontractors;
  const setSubcontractors = externalSubcontractorsState ? externalSubcontractorsState[1] : setInternalSubcontractors;
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationItem1, setEvaluationItem1] = useState<1 | -1 | 0>(0);
  const [evaluationItem2, setEvaluationItem2] = useState<1 | -1 | 0>(0);
  const [evaluationMemo, setEvaluationMemo] = useState('');
  
  // 작업 평가 모달 관련 state
  const [showWorkEvaluationModal, setShowWorkEvaluationModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<{ customerCompany: string; projectName: string; workDate: string; inquiryDate: string; totalQuantity: number; detailQuantity: string; estimateAmount: number; customerManager: string; subcontractor: string; workEvaluation: string; workEvaluationScore: number; evalCustomerClaim?: number; evalAllDevices?: number; evalOnTime?: number; evalAfterService?: number; evalUniform?: number; evalKindness?: number } | null>(null);
  const [workEvalCustomerClaim, setWorkEvalCustomerClaim] = useState(0); // -2, -1, 0, +1
  const [workEvalAllDevices, setWorkEvalAllDevices] = useState(0); // -2, 0
  const [workEvalOnTime, setWorkEvalOnTime] = useState(0); // -2, -1, 0, +1
  const [workEvalAfterService, setWorkEvalAfterService] = useState(0); // -2, -1, 0, +1
  const [workEvalUniform, setWorkEvalUniform] = useState(0); // -2, -1, 0, +1, +2
  const [workEvalKindness, setWorkEvalKindness] = useState(0); // -2, -1, 0, +1

  // 고객책임자 정보 수정 모드 관련 state
  const [isEditingManager, setIsEditingManager] = useState(false);
  const [editedManager, setEditedManager] = useState<CustomerManager | null>(null);

  // 작업팀장 정보 수정 모드 관련 state
  const [isEditingSubcontractor, setIsEditingSubcontractor] = useState(false);
  const [editedSubcontractor, setEditedSubcontractor] = useState<SubcontractorManager | null>(null);

  // 책임자 등록 모달 관련 state
  const [showAddManagerModal, setShowAddManagerModal] = useState(false);
  const [newManager, setNewManager] = useState<Partial<CustomerManager>>({
    name: '',
    position: '',
    phone: '',
    email: '',
    address: '',
    assignedArea: '서울 수도권',
    status: 'active',
    specialties: [],
  });

  // 작업팀장 등록 모달 관련 state
  const [showAddSubcontractorModal, setShowAddSubcontractorModal] = useState(false);
  const [newSubcontractor, setNewSubcontractor] = useState<Partial<SubcontractorManager>>({
    name: '',
    company: '',
    phone: '',
    email: '',
    address: '',
    assignedArea: '서울 수도권',
    specialization: '',
    teamSize: 1,
    age: 30,
    status: 'available',
    baseScore: 50,
  });

  // 담당 지역 옵션
  const areaOptions = ['서울 수도권', '충청권', '경상권'];
  
  // 상태 옵션
  const statusOptions: { value: 'active' | 'vacation' | 'leave'; label: string }[] = [
    { value: 'active', label: '근무중' },
    { value: 'vacation', label: '휴가' },
    { value: 'leave', label: '퇴사' },
  ];

  // 작업팀장 상태 옵션
  const subcontractorStatusOptions: { value: 'available' | 'busy' | 'unavailable'; label: string }[] = [
    { value: 'available', label: '투입가능' },
    { value: 'busy', label: '업무중' },
    { value: 'unavailable', label: '휴가' },
  ];

  // KPI 계산 - 고객책임자
  const totalManagers = managers.length;
  const activeManagers = managers.filter((m) => m.status === 'active').length;
  const totalActiveProjects = managers.reduce((sum, m) => sum + m.activeProjects, 0);
  const totalSalesAmount = managers.reduce((sum, m) => sum + m.totalSalesAmount, 0);
  const avgPerformanceRating = (
    managers.reduce((sum, m) => sum + m.performanceRating, 0) / totalManagers
  ).toFixed(1);

  // 지역별 고객책임자 수 계산
  const seoulMetroManagers = managers.filter(
    (m) => m.assignedArea.includes('서울') || m.assignedArea.includes('경기') || m.assignedArea.includes('인천')
  ).length;
  const chungcheongManagers = managers.filter(
    (m) => m.assignedArea.includes('충청') || m.assignedArea.includes('대��') || m.assignedArea.includes('세종')
  ).length;
  const gyeongsangManagers = managers.filter(
    (m) => m.assignedArea.includes('경상') || m.assignedArea.includes('부산') || m.assignedArea.includes('대구') || m.assignedArea.includes('울산')
  ).length;

  // KPI 계산 - 작업팀장(하청)
  const totalSubcontractors = subcontractors.length;
  const availableSubcontractors = subcontractors.filter((s) => s.status === 'available').length;
  const totalOngoingProjects = subcontractors.reduce((sum, s) => sum + s.ongoingProjects, 0);
  const totalContractAmount = subcontractors.reduce((sum, s) => sum + s.totalContractAmount, 0);
  const avgSubcontractorRating = (
    subcontractors.reduce((sum, s) => sum + s.performanceRating, 0) / totalSubcontractors
  ).toFixed(1);

  // 지역별 작업팀장 수 계산
  const seoulMetroSubcontractors = subcontractors.filter(
    (s) => s.assignedArea.includes('서울') || s.assignedArea.includes('경기') || s.assignedArea.includes('인천')
  ).length;
  const chungcheongSubcontractors = subcontractors.filter(
    (s) => s.assignedArea.includes('충청') || s.assignedArea.includes('대전') || s.assignedArea.includes('세종')
  ).length;
  const gyeongsangSubcontractors = subcontractors.filter(
    (s) => s.assignedArea.includes('경상') || s.assignedArea.includes('부산') || s.assignedArea.includes('대구') || s.assignedArea.includes('울산')
  ).length;

  // 금액 포맷 함수
  const formatAmount = (amount: number): string => {
    if (amount >= 100000000) {
      return `₩${(amount / 100000000).toFixed(1)}억`;
    } else if (amount >= 10000) {
      return `₩${(amount / 10000).toFixed(0)}만`;
    }
    return `₩${amount.toLocaleString()}`;
  };

  // 최종 점수 자동 계산 함수
  const calculateFinalScore = (subcontractor: SubcontractorManager): number => {
    // 기본점수 (subcontractor의 baseScore 사용)
    const baseScore = subcontractor.baseScore || 50;
    
    // 작업평가 점수의 합 (모든 작업 히스토리의 workEvaluationScore 합산)
    const workEvaluationSum = (subcontractor.recentActivities || []).reduce(
      (sum, activity) => sum + (activity.workEvaluationScore || 0),
      0
    );
    
    // 재구매 점수 (재구매 건수 * 3)
    const repurchaseScore = subcontractor.repurchaseCount * 3;
    
    // 협력평가점수
    const cooperationScore = subcontractor.cooperationScore || 0;
    
    // 최종 점수 = 기본점수 + 작업평가 점수의 합 + 재구매 점수 + 협력평가점수
    return baseScore + workEvaluationSum + repurchaseScore + cooperationScore;
  };

  // 최종 점수에 따른 등급 자동 계산 함수
  const calculatePerformanceGrade = (finalScore: number): string => {
    if (finalScore >= 80) return '1등급';
    if (finalScore >= 60) return '2등급';
    if (finalScore >= 40) return '3등급';
    if (finalScore >= 20) return '4등급';
    return '퇴출 심사';
  };

  // 등급별 스타일 반환 함수
  const getPerformanceGradeStyle = (finalScore: number): string => {
    if (finalScore >= 80) return 'bg-purple-100 text-purple-700 border-purple-300';
    if (finalScore >= 60) return 'bg-blue-100 text-blue-700 border-blue-300';
    if (finalScore >= 40) return 'bg-green-100 text-green-700 border-green-300';
    if (finalScore >= 20) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  // 상태 배지 컴포넌트
  const StatusBadge = ({ status, type }: { status: string; type: 'manager' | 'subcontractor' }) => {
    const managerStyles = {
      active: 'bg-green-100 text-green-700',
      vacation: 'bg-yellow-100 text-yellow-700',
      leave: 'bg-gray-100 text-gray-700',
    };

    const subcontractorStyles = {
      available: 'bg-green-100 text-green-700',
      busy: 'bg-orange-100 text-orange-700',
      unavailable: 'bg-red-100 text-red-700',
    };

    const managerLabels = {
      active: '근무중',
      vacation: '휴가',
      leave: '퇴사',
    };

    const subcontractorLabels = {
      available: '투입가능',
      busy: '업무중',
      unavailable: '��가',
    };

    const styles = type === 'manager' ? managerStyles : subcontractorStyles;
    const labels = type === 'manager' ? managerLabels : subcontractorLabels;

    return (
      <span className={`px-2.5 py-1 rounded-lg text-[13px] font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  // 등급 배지 컴포넌트
  const GradeBadge = ({ grade }: { grade: 'S' | 'A' | 'B' | 'C' }) => {
    const styles = {
      S: 'bg-purple-100 text-purple-700 border-purple-300',
      A: 'bg-blue-100 text-blue-700 border-blue-300',
      B: 'bg-green-100 text-green-700 border-green-300',
      C: 'bg-gray-100 text-gray-700 border-gray-300',
    };

    return (
      <span className={`px-3 py-1 rounded-lg text-[13px] font-semibold border ${styles[grade]}`}>
        {grade}등급
      </span>
    );
  };

  // 삭제 핸들러
  const handleDelete = (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    if (confirm(`${name}을(를) 삭제하시겠습니까?`)) {
      if (activeTab === 'managers') {
        setManagers(managers.filter(m => m.id !== id));
        deleteManager(id).catch(err => console.error('고객책임자 삭제 API 실패:', err));
      } else {
        setSubcontractors(subcontractors.filter(s => s.id !== id));
        deleteSubcontractor(id).catch(err => console.error('작업팀장 삭제 API 실패:', err));
      }
      alert('삭제되었습니다.');
      onNotification?.(`[${name}] 삭제되었습니다`);
    }
  };

  // 고객책임자 정보 수정 핸들러
  const handleEditManager = () => {
    setIsEditingManager(true);
    setEditedManager(selectedManager);
  };

  // 고객책임자 정보 저장 핸들러
  const handleSaveManager = () => {
    if (editedManager) {
      const updatedManagers = managers.map((m) =>
        m.id === editedManager.id ? editedManager : m
      );
      setManagers(updatedManagers);
      setSelectedManager(editedManager);
      setIsEditingManager(false);
      alert('정보가 저장되었습니다.');
      onNotification?.(`[${editedManager.name}] 고객책임자 정보가 수정되었습니다`);
      updateManager(editedManager).catch(err => console.error('고객책임자 수정 API 실패:', err));
    }
  };

  // 고객책임자 정보 수정 취소 핸들러
  const handleCancelEditManager = () => {
    setIsEditingManager(false);
    setEditedManager(null);
  };

  // 고객책임자 작업 히스토리 삭제 핸들러
  const handleDeleteManagerActivity = (activityIndex: number, projectName: string) => {
    if (confirm(`"${projectName}" 작업을 삭제하시겠습니까?`)) {
      if (selectedManager) {
        const updatedActivities = selectedManager.recentActivities.filter((_, index) => index !== activityIndex);
        const updatedManager = { ...selectedManager, recentActivities: updatedActivities };

        const updatedManagers = managers.map((m) =>
          m.id === selectedManager.id ? updatedManager : m
        );
        setManagers(updatedManagers);
        setSelectedManager(updatedManager);
        alert('작업이 삭제되었습니다.');
        onNotification?.(`[${selectedManager.name}] "${projectName}" 작업이 삭제되었습니다`);
        updateManager(updatedManager).catch(err => console.error('고객책임자 수정 API 실패:', err));
      }
    }
  };

  // 작업팀장 정보 수정 핸들러
  const handleEditSubcontractor = () => {
    setIsEditingSubcontractor(true);
    setEditedSubcontractor(selectedSubcontractor);
  };

  // 작업팀장 정보 저장 핸들러
  const handleSaveSubcontractor = () => {
    if (editedSubcontractor) {
      const updatedSubcontractors = subcontractors.map((s) =>
        s.id === editedSubcontractor.id ? editedSubcontractor : s
      );
      setSubcontractors(updatedSubcontractors);
      setSelectedSubcontractor(editedSubcontractor);
      setIsEditingSubcontractor(false);
      alert('정보가 저장되었습니다.');
      onNotification?.(`[${editedSubcontractor.name}] 작업팀장 정보가 수정되었습니다`);
      updateSubcontractor(editedSubcontractor).catch(err => console.error('작업팀장 수정 API 실패:', err));
    }
  };

  // 작업팀장 정보 수정 취소 핸들러
  const handleCancelEditSubcontractor = () => {
    setIsEditingSubcontractor(false);
    setEditedSubcontractor(null);
  };

  // 작업팀장 작업 히스토리 삭제 핸들러
  const handleDeleteSubcontractorActivity = (activityIndex: number, projectName: string) => {
    if (confirm(`"${projectName}" 작업을 삭제하시겠습니까?`)) {
      if (selectedSubcontractor) {
        const updatedActivities = selectedSubcontractor.recentActivities.filter((_, index) => index !== activityIndex);
        const updatedSubcontractor = { ...selectedSubcontractor, recentActivities: updatedActivities };
        
        const updatedSubcontractors = subcontractors.map((s) =>
          s.id === selectedSubcontractor.id ? updatedSubcontractor : s
        );
        setSubcontractors(updatedSubcontractors);
        setSelectedSubcontractor(updatedSubcontractor);
        alert('작업이 삭제되었습니다.');
        onNotification?.(`[${selectedSubcontractor.name}] "${projectName}" 작업이 삭제되었습니다`);
        updateSubcontractor(updatedSubcontractor).catch(err => console.error('작업팀장 수정 API 실패:', err));
      }
    }
  };

  // 책임자 등록 모달 열기 핸들러
  const handleOpenAddManagerModal = () => {
    setShowAddManagerModal(true);
    setNewManager({
      name: '',
      position: '',
      phone: '',
      email: '',
      address: '',
      assignedArea: '서울 수도권',
      status: 'active',
      specialties: [],
    });
  };

  // 책임자 등록 취소 핸들러
  const handleCancelAddManager = () => {
    setShowAddManagerModal(false);
    setNewManager({
      name: '',
      position: '',
      phone: '',
      email: '',
      address: '',
      assignedArea: '서울 수도권',
      status: 'active',
      specialties: [],
    });
  };

  // 책임자 등록 저장 핸들러
  const handleSaveNewManager = () => {
    if (!newManager.name || !newManager.position || !newManager.phone) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    const today = new Date();
    const formattedDate = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    const newManagerData: CustomerManager = {
      id: managers.length > 0 ? Math.max(...managers.map((m) => m.id)) + 1 : 1,
      name: newManager.name || '',
      position: newManager.position || '',
      phone: newManager.phone || '',
      email: newManager.email || '',
      address: newManager.address || '',
      assignedArea: newManager.assignedArea || '서울 수도권',
      joinDate: formattedDate,
      assignedCustomers: 0,
      activeProjects: 0,
      completedProjects: 0,
      totalSalesAmount: 0,
      performanceRating: 0,
      specialties: newManager.specialties || [],
      status: newManager.status || 'active',
      repurchaseRate: 0,
      newCustomers: 0,
      repurchaseCustomers: 0,
      recentActivities: [],
    };

    setManagers([...managers, newManagerData]);
    setShowAddManagerModal(false);
    alert('책임자가 등록되었습니다.');
    onNotification?.(`[${newManagerData.name}] 새 고객책임자가 등록되었습니다`);
    const tempId = newManagerData.id;
    createManager(newManagerData).then(newId => {
      setManagers(prev => prev.map(m => m.id === tempId ? { ...m, id: newId } : m));
    }).catch(err => console.error('고객책임자 추가 API 실패:', err));
  };

  // 작업팀장 등록 모달 열기 핸들러
  const handleOpenAddSubcontractorModal = () => {
    setShowAddSubcontractorModal(true);
    setNewSubcontractor({
      name: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      assignedArea: '서울 수도권',
      specialization: '',
      teamSize: 1,
      age: 30,
      status: 'available',
      baseScore: 50,
    });
  };

  // 작업팀장 등록 취소 핸들러
  const handleCancelAddSubcontractor = () => {
    setShowAddSubcontractorModal(false);
    setNewSubcontractor({
      name: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      assignedArea: '서울 수도권',
      specialization: '',
      teamSize: 1,
      age: 30,
      status: 'available',
      baseScore: 50,
    });
  };

  // 작업팀장 등록 저장 핸들러
  const handleSaveNewSubcontractor = () => {
    if (!newSubcontractor.name || !newSubcontractor.company || !newSubcontractor.phone) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    const today = new Date();
    const formattedDate = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    const newSubcontractorData: SubcontractorManager = {
      id: subcontractors.length > 0 ? Math.max(...subcontractors.map((s) => s.id)) + 1 : 1,
      name: newSubcontractor.name || '',
      company: newSubcontractor.company || '',
      phone: newSubcontractor.phone || '',
      email: newSubcontractor.email || '',
      address: newSubcontractor.address || '',
      assignedArea: newSubcontractor.assignedArea || '서울 수도권',
      registrationDate: formattedDate,
      specialization: newSubcontractor.specialization || '',
      teamSize: newSubcontractor.teamSize || 1,
      grade: 'C',
      age: newSubcontractor.age || 30,
      ongoingProjects: 0,
      completedProjects: 0,
      totalContractAmount: 0,
      performanceRating: 0,
      cooperationScore: 0,
      evaluationHistory: [],
      certifications: [],
      status: newSubcontractor.status || 'available',
      recentProjects: [],
      memo: '',
      repurchaseCount: 0,
      baseScore: newSubcontractor.baseScore || 50,
      recentActivities: [],
    };

    setSubcontractors([...subcontractors, newSubcontractorData]);
    setShowAddSubcontractorModal(false);
    alert('작업팀장이 등록되었습니다.');
    onNotification?.(`[${newSubcontractorData.name}] 새 작업팀장이 등록되었습니다`);
    const tempId = newSubcontractorData.id;
    createSubcontractor(newSubcontractorData).then(newId => {
      setSubcontractors(prev => prev.map(s => s.id === tempId ? { ...s, id: newId } : s));
    }).catch(err => console.error('작업팀장 추가 API 실패:', err));
  };

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* 페이지 헤 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">공급망 관리</h1>
          <p className="text-[14px] text-slate-500 mt-1">고객책임자 및 작업팀장(하청) 관리</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (activeTab === 'managers') {
                handleOpenAddManagerModal();
              } else {
                handleOpenAddSubcontractorModal();
              }
            }}
            className="px-4 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'managers' ? '책임자 등록' : '팀장 등록'}
          </button>
        </div>
      </div>

      {/* KPI 카드 */}
      {activeTab === 'managers' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">총 고객책임자</span>
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{totalManagers}명</div>
            <p className="text-[13px] text-slate-500 mt-1">근무중: {activeManagers}명</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">서울 수도권</span>
              <MapPin className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{seoulMetroManagers}명</div>
            <p className="text-[13px] text-slate-500 mt-1">서울/경기/인천</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">충청권</span>
              <MapPin className="w-5 h-5 text-orange-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{chungcheongManagers}명</div>
            <p className="text-[13px] text-slate-500 mt-1">대전/충청/세종</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">경상권</span>
              <MapPin className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{gyeongsangManagers}명</div>
            <p className="text-[13px] text-slate-500 mt-1">부산/대구/울산/경상</p>
          </div>
        </div>
      )}

      {activeTab === 'subcontractors' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">총 작업팀장</span>
              <Building2 className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{totalSubcontractors}개사</div>
            <p className="text-[13px] text-slate-500 mt-1">투입가능: {availableSubcontractors}개사</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">서울 수도권</span>
              <MapPin className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{seoulMetroSubcontractors}개사</div>
            <p className="text-[13px] text-slate-500 mt-1">서울/경기/인천</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">충청권</span>
              <MapPin className="w-5 h-5 text-orange-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{chungcheongSubcontractors}개사</div>
            <p className="text-[13px] text-slate-500 mt-1">대전/충청/세종</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-slate-500">경상권</span>
              <MapPin className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-[26px] font-semibold text-slate-900">{gyeongsangSubcontractors}개사</div>
            <p className="text-[13px] text-slate-500 mt-1">부산/대구/울산/경상</p>
          </div>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="border-b border-slate-200 px-6">
          <div className="flex gap-8">
            {[
              { id: 'managers', name: '고객책임자' },
              { id: 'subcontractors', name: '작업팀장(하청)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 text-[15px] font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 바 */}
        <div className="p-6 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
            <input
              type="text"
              placeholder={activeTab === 'managers' ? '이름 또는 직책으로 검색...' : '이름 또는 회사명으로 검색...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 text-[15px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* 고객책임자 탭 */}
        {activeTab === 'managers' && (
          <div className="p-6 flex gap-5">
            {/* 표 영역 */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">이름</th>
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">직책</th>
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">연락처</th>
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">이메일</th>
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">담당 지역</th>
                    <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">담당 고객</th>
                    <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">재구매율</th>
                    <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {managers
                    .filter(
                      (manager) =>
                        manager.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        manager.position.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((manager) => (
                      <tr
                        key={manager.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedManager(manager)}
                      >
                        <td className="py-4 px-4 text-[14px] text-slate-900 font-medium">{manager.name}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-600">{manager.position}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-600">{manager.phone}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-600">{manager.email}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-600">
                          {editingAreaId === manager.id ? (
                            <select
                              value={manager.assignedArea}
                              onChange={(e) => {
                                const updatedManagers = managers.map((m) =>
                                  m.id === manager.id ? { ...m, assignedArea: e.target.value } : m
                                );
                                setManagers(updatedManagers);
                                setEditingAreaId(null);
                              }}
                              onBlur={() => setEditingAreaId(null)}
                              autoFocus
                              className="w-full px-2 py-1 text-[14px] bg-white border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {areaOptions.map((area) => (
                                <option key={area} value={area}>
                                  {area}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAreaId(manager.id);
                              }}
                            >
                              {manager.assignedArea}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-[14px] text-slate-900 text-center">{manager.assignedCustomers}개</td>
                        <td className="py-4 px-4 text-[14px] text-slate-900 text-center">{manager.repurchaseRate}%</td>
                        <td className="py-4 px-4 text-center">
                          {editingStatusId === manager.id ? (
                            <select
                              value={manager.status}
                              onChange={(e) => {
                                const updatedManagers = managers.map((m) =>
                                  m.id === manager.id ? { ...m, status: e.target.value as 'active' | 'vacation' | 'leave' } : m
                                );
                                setManagers(updatedManagers);
                                setEditingStatusId(null);
                              }}
                              onBlur={() => setEditingStatusId(null)}
                              autoFocus
                              className="w-full px-2 py-1 text-[14px] bg-white border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStatusId(manager.id);
                              }}
                              className="inline-block cursor-pointer"
                            >
                              <StatusBadge status={manager.status} type="manager" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* 지도 영역 */}
            <div className="w-[400px] flex-shrink-0">
              <div className="sticky top-6 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 h-[500px] flex flex-col items-center justify-center">
                <Map className="w-16 h-16 text-slate-400 mb-4" />
                <div className="text-center">
                  <p className="text-[15px] font-medium text-slate-600 mb-2">지도 영역</p>
                  <p className="text-[13px] text-slate-500">Google Maps 연동 예정</p>
                  {selectedManager && (
                    <div className="mt-4 px-4 py-3 bg-white rounded-lg border border-slate-200 text-left">
                      <p className="text-[13px] font-semibold text-slate-700 mb-1">선택된 위치</p>
                      <p className="text-[12px] text-slate-600">{selectedManager.name}</p>
                      <p className="text-[12px] text-slate-500">{selectedManager.address}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 작업팀장(하청) 탭 */}
        {activeTab === 'subcontractors' && (
          <div className="p-6 flex gap-5">
            {/* 표 영역 */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">팀장명</th>
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">회사명</th>
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">연락처</th>
                    <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">팀원규모</th>
                    <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">담당 지역</th>
                    <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">최종점수</th>
                    <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">등급</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subcontractors
                    .filter(
                      (sub) =>
                        sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        sub.company.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((sub) => (
                      <tr
                        key={sub.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedSubcontractor(sub)}
                      >
                        <td className="py-4 px-4 text-[14px] text-slate-900 font-medium">{sub.name}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-600">{sub.company}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-600">{sub.phone}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-900 text-center">{sub.teamSize}명</td>
                        <td className="py-4 px-4 text-[14px] text-slate-600">{sub.assignedArea}</td>
                        <td className="py-4 px-4 text-[14px] text-slate-900 text-center font-semibold">{calculateFinalScore(sub)}점</td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-3 py-1 rounded-lg text-[13px] font-semibold border ${getPerformanceGradeStyle(calculateFinalScore(sub))}`}>
                            {calculatePerformanceGrade(calculateFinalScore(sub))}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* 지도 영역 */}
            <div className="w-[400px] flex-shrink-0">
              <div className="sticky top-6 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 h-[500px] flex flex-col items-center justify-center">
                <Map className="w-16 h-16 text-slate-400 mb-4" />
                <div className="text-center">
                  <p className="text-[15px] font-medium text-slate-600 mb-2">지도 영역</p>
                  <p className="text-[13px] text-slate-500">Google Maps 연동 예정</p>
                  {selectedSubcontractor && (
                    <div className="mt-4 px-4 py-3 bg-white rounded-lg border border-slate-200 text-left">
                      <p className="text-[13px] font-semibold text-slate-700 mb-1">선택된 위치</p>
                      <p className="text-[12px] text-slate-600">{selectedSubcontractor.name}</p>
                      <p className="text-[12px] text-slate-500">{selectedSubcontractor.address}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 고객책임자 상세 모달 */}
      {selectedManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white md:rounded-2xl w-full max-w-6xl h-full md:h-auto md:max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-slate-900">고객책임자 상세 정보</h2>
              <button
                onClick={() => setSelectedManager(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 기본 정보 */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserCircle className="w-10 h-10 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {isEditingManager ? (
                      <input
                        type="text"
                        value={editedManager?.name || ''}
                        onChange={(e) => setEditedManager(editedManager ? { ...editedManager, name: e.target.value } : null)}
                        className="text-[20px] font-semibold text-slate-900 border border-blue-500 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <h3 className="text-[20px] font-semibold text-slate-900">{selectedManager.name}</h3>
                    )}
                    <StatusBadge status={selectedManager.status} type="manager" />
                  </div>
                  {isEditingManager ? (
                    <input
                      type="text"
                      value={editedManager?.position || ''}
                      onChange={(e) => setEditedManager(editedManager ? { ...editedManager, position: e.target.value } : null)}
                      className="text-[15px] text-slate-600 mb-3 border border-blue-500 rounded-lg px-3 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-[15px] text-slate-600 mb-3">{selectedManager.position}</p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <Phone className="w-4 h-4" />
                      {isEditingManager ? (
                        <input
                          type="text"
                          value={editedManager?.phone || ''}
                          onChange={(e) => setEditedManager(editedManager ? { ...editedManager, phone: e.target.value } : null)}
                          className="flex-1 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        selectedManager.phone
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <Mail className="w-4 h-4" />
                      {isEditingManager ? (
                        <input
                          type="email"
                          value={editedManager?.email || ''}
                          onChange={(e) => setEditedManager(editedManager ? { ...editedManager, email: e.target.value } : null)}
                          className="flex-1 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        selectedManager.email
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <Calendar className="w-4 h-4" />
                      입사일: {selectedManager.joinDate}
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <MapPin className="w-4 h-4" />
                      담당 지역: {isEditingManager ? (
                        <select
                          value={editedManager?.assignedArea || ''}
                          onChange={(e) => setEditedManager(editedManager ? { ...editedManager, assignedArea: e.target.value } : null)}
                          className="flex-1 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {areaOptions.map((area) => (
                            <option key={area} value={area}>
                              {area}
                            </option>
                          ))}
                        </select>
                      ) : (
                        selectedManager.assignedArea
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 담당 고객 */}
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="text-[13px] text-blue-600 mb-1">담당 고객</div>
                {isEditingManager ? (
                  <input
                    type="number"
                    value={editedManager?.assignedCustomers || 0}
                    onChange={(e) => setEditedManager(editedManager ? { ...editedManager, assignedCustomers: Number(e.target.value) } : null)}
                    className="text-[22px] font-semibold text-blue-900 bg-white border border-blue-500 rounded-lg px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="text-[22px] font-semibold text-blue-900">{selectedManager.assignedCustomers}개</div>
                )}
              </div>

              {/* 재구매율 분석 */}
              <div>
                <div className="text-[14px] font-semibold text-slate-700 mb-3">재구매율 분석</div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-xl p-4">
                    <div className="text-[13px] text-blue-600 mb-1">신규 고객</div>
                    {isEditingManager ? (
                      <input
                        type="number"
                        value={editedManager?.newCustomers || 0}
                        onChange={(e) => setEditedManager(editedManager ? { ...editedManager, newCustomers: Number(e.target.value) } : null)}
                        className="text-[22px] font-semibold text-blue-900 bg-white border border-blue-500 rounded-lg px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="text-[22px] font-semibold text-blue-900">{selectedManager.newCustomers}명</div>
                    )}
                  </div>
                  <div className="bg-green-50 rounded-xl p-4">
                    <div className="text-[13px] text-green-600 mb-1">재구매 고객</div>
                    {isEditingManager ? (
                      <input
                        type="number"
                        value={editedManager?.repurchaseCustomers || 0}
                        onChange={(e) => setEditedManager(editedManager ? { ...editedManager, repurchaseCustomers: Number(e.target.value) } : null)}
                        className="text-[22px] font-semibold text-green-900 bg-white border border-green-500 rounded-lg px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    ) : (
                      <div className="text-[22px] font-semibold text-green-900">{selectedManager.repurchaseCustomers}명</div>
                    )}
                  </div>
                  <div className="bg-purple-50 rounded-xl p-4">
                    <div className="text-[13px] text-purple-600 mb-1">재구매율</div>
                    <div className="text-[22px] font-semibold text-purple-900 flex items-center gap-1">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                      {selectedManager.repurchaseRate}%
                    </div>
                  </div>
                </div>
              </div>

              {/* 작업 히스토리 */}
              <div>
                <div className="text-[14px] font-semibold text-slate-700 mb-3">작업 히스토리</div>
                <div className="overflow-x-auto">
                  <table className="w-full border border-slate-200 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">문의 등록일</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">고객사</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">프로젝트명</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">총수량</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">상세수량</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">견적금액</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">고객책임자</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">작업일자</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">작업팀장(하청)</th>
                        <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">삭제</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedManager.recentActivities.map((activity, index) => (
                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.inquiryDate}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-900 font-medium">{activity.customerCompany}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-900 font-medium">{activity.projectName}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.totalQuantity}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.detailQuantity}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-900">{formatAmount(activity.estimateAmount)}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.customerManager}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.workDate}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.subcontractor}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDeleteManagerActivity(index, activity.projectName)}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              {isEditingManager ? (
                <>
                  <button
                    onClick={handleCancelEditManager}
                    className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveManager}
                    className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    저장
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setSelectedManager(null);
                      setIsEditingManager(false);
                      setEditedManager(null);
                    }}
                    className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleEditManager}
                    className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    정보 수정
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 작업팀장(하청) 상세 모달 */}
      {selectedSubcontractor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white md:rounded-2xl w-full max-w-[1400px] h-full md:h-auto md:max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-slate-900">작업팀장 상세 정보</h2>
              <button
                onClick={() => setSelectedSubcontractor(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 상단 영역 - 기본 정보 + 내부 관리 메모 */}
              <div className="grid grid-cols-4 gap-6">
                {/* 기본 정보 */}
                <div className="col-span-3">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-10 h-10 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {isEditingSubcontractor ? (
                          <input
                            type="text"
                            value={editedSubcontractor?.name || ''}
                            onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, name: e.target.value } : null)}
                            className="text-[20px] font-semibold text-slate-900 border border-blue-500 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <h3 className="text-[20px] font-semibold text-slate-900">{selectedSubcontractor.name}</h3>
                        )}
                        <StatusBadge status={selectedSubcontractor.status} type="subcontractor" />
                        <span className={`px-3 py-1 rounded-lg text-[13px] font-semibold border ${getPerformanceGradeStyle(calculateFinalScore(selectedSubcontractor))}`}>
                          {calculatePerformanceGrade(calculateFinalScore(selectedSubcontractor))}
                        </span>
                      </div>
                      {isEditingSubcontractor ? (
                        <input
                          type="text"
                          value={editedSubcontractor?.company || ''}
                          onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, company: e.target.value } : null)}
                          className="text-[15px] text-slate-600 mb-3 border border-blue-500 rounded-lg px-3 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="text-[15px] text-slate-600 mb-3">{selectedSubcontractor.company}</p>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 text-[14px] text-slate-600">
                          <Phone className="w-4 h-4" />
                          {isEditingSubcontractor ? (
                            <input
                              type="text"
                              value={editedSubcontractor?.phone || ''}
                              onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, phone: e.target.value } : null)}
                              className="flex-1 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            selectedSubcontractor.phone
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[14px] text-slate-600">
                          <Mail className="w-4 h-4" />
                          {isEditingSubcontractor ? (
                            <input
                              type="email"
                              value={editedSubcontractor?.email || ''}
                              onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, email: e.target.value } : null)}
                              className="flex-1 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            selectedSubcontractor.email
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[14px] text-slate-600">
                          <MapPin className="w-4 h-4" />
                          {isEditingSubcontractor ? (
                            <input
                              type="text"
                              value={editedSubcontractor?.address || ''}
                              onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, address: e.target.value } : null)}
                              className="flex-1 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            selectedSubcontractor.address
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[14px] text-slate-600">
                          <Map className="w-4 h-4" />
                          담당 지역: {isEditingSubcontractor ? (
                            <select
                              value={editedSubcontractor?.assignedArea || ''}
                              onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, assignedArea: e.target.value } : null)}
                              className="flex-1 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {areaOptions.map((area) => (
                                <option key={area} value={area}>
                                  {area}
                                </option>
                              ))}
                            </select>
                          ) : (
                            selectedSubcontractor.assignedArea
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[14px] text-slate-600">
                          <Calendar className="w-4 h-4" />
                          등록일: {selectedSubcontractor.registrationDate}
                        </div>
                        <div className="flex items-center gap-2 text-[14px] text-slate-600">
                          <UserCircle className="w-4 h-4" />
                          나이: {isEditingSubcontractor ? (
                            <input
                              type="number"
                              value={editedSubcontractor?.age || 0}
                              onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, age: Number(e.target.value) } : null)}
                              className="w-20 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            `${selectedSubcontractor.age}세`
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[14px] text-slate-600">
                          <Users className="w-4 h-4 text-blue-600" />
                          <span>팀원 규모:</span>
                          {isEditingSubcontractor ? (
                            <input
                              type="number"
                              value={editedSubcontractor?.teamSize || 0}
                              onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, teamSize: Number(e.target.value) } : null)}
                              className="w-20 border border-blue-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="font-semibold text-blue-700">{selectedSubcontractor.teamSize}명</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[14px]">
                          <Star className={`w-4 h-4 ${
                            selectedSubcontractor.grade === 'S' ? 'text-purple-600' :
                            selectedSubcontractor.grade === 'A' ? 'text-blue-600' :
                            selectedSubcontractor.grade === 'B' ? 'text-green-600' :
                            'text-gray-600'
                          }`} />
                          <span className="text-slate-600">등급:</span>
                          <span className={`font-semibold ${
                            calculateFinalScore(selectedSubcontractor) >= 80 ? 'text-purple-700' :
                            calculateFinalScore(selectedSubcontractor) >= 60 ? 'text-blue-700' :
                            calculateFinalScore(selectedSubcontractor) >= 40 ? 'text-green-700' :
                            calculateFinalScore(selectedSubcontractor) >= 20 ? 'text-yellow-700' :
                            'text-red-700'
                          }`}>{calculatePerformanceGrade(calculateFinalScore(selectedSubcontractor))}</span>
                        </div>
                      </div>
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
                      value={selectedSubcontractor.memo}
                      onChange={(e) => {
                        const updatedMemo = e.target.value;
                        // subcontractors 배열 업데이트
                        setSubcontractors((prevSubcontractors) =>
                          prevSubcontractors.map((sub) =>
                            sub.id === selectedSubcontractor.id
                              ? { ...sub, memo: updatedMemo }
                              : sub
                          )
                        );
                        // selectedSubcontractor도 업데이트
                        setSelectedSubcontractor({
                          ...selectedSubcontractor,
                          memo: updatedMemo,
                        });
                      }}
                      placeholder="메모를 입력하세요..."
                      className="flex-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {/* 대시보드 KPI */}
              <div className="grid grid-cols-6 gap-4">
                <div className="bg-indigo-50 rounded-xl p-4">
                  <div className="text-[13px] text-indigo-600 mb-1">기본점수</div>
                  <input
                    type="number"
                    value={selectedSubcontractor.baseScore ?? 50}
                    onChange={(e) => {
                      const newBaseScore = parseInt(e.target.value) || 0;
                      const updatedSubcontractor = { ...selectedSubcontractor, baseScore: newBaseScore };
                      setSelectedSubcontractor(updatedSubcontractor);
                      setSubcontractors(
                        subcontractors.map((sub) =>
                          sub.id === selectedSubcontractor.id
                            ? updatedSubcontractor
                            : sub
                        )
                      );
                    }}
                    className="w-full text-[22px] font-semibold text-indigo-900 bg-transparent border-b border-indigo-200 focus:border-indigo-500 focus:outline-none text-center"
                  />
                  <div className="text-[11px] text-indigo-500 text-center mt-1">수정 가능</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <div className="text-[13px] text-green-600 mb-1">작업평가 점수</div>
                  <div className="text-[22px] font-semibold text-green-900">
                    {(selectedSubcontractor.recentActivities || []).reduce((sum, activity) => sum + (activity.workEvaluationScore || 0), 0)}점
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="text-[13px] text-blue-600 mb-1">재��매 건수</div>
                  {isEditingSubcontractor ? (
                    <input
                      type="number"
                      value={editedSubcontractor?.repurchaseCount || 0}
                      onChange={(e) => setEditedSubcontractor(editedSubcontractor ? { ...editedSubcontractor, repurchaseCount: Number(e.target.value) } : null)}
                      className="text-[22px] font-semibold text-blue-900 bg-white border border-blue-500 rounded-lg px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="text-[22px] font-semibold text-blue-900">{selectedSubcontractor.repurchaseCount}건</div>
                  )}
                </div>
                <div className="bg-cyan-50 rounded-xl p-4">
                  <div className="text-[13px] text-cyan-600 mb-1">재구매 점수</div>
                  <div className="text-[22px] font-semibold text-cyan-900">{selectedSubcontractor.repurchaseCount * 3}점</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[13px] text-purple-600">협력평가점수</div>
                    <button 
                      className="px-2 py-1 text-[11px] font-medium text-purple-600 bg-purple-100 hover:bg-purple-200 rounded-md transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowEvaluationModal(true);
                      }}
                    >
                      평가하기
                    </button>
                  </div>
                  <div className="text-[22px] font-semibold text-purple-900">
                    {selectedSubcontractor.cooperationScore > 0 ? '+' : ''}{selectedSubcontractor.cooperationScore}점
                  </div>
                </div>
                <div className="bg-orange-50 rounded-xl p-4">
                  <div className="text-[13px] text-orange-600 mb-1">최종 점수</div>
                  <div className="text-[22px] font-semibold text-orange-900">{calculateFinalScore(selectedSubcontractor)}점</div>
                </div>
              </div>

              {/* 작업 히스토리 */}
              <div>
                <div className="text-[14px] font-semibold text-slate-700 mb-3">작업 히스토리</div>
                <div className="overflow-x-auto">
                  <table className="w-full border border-slate-200 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">문의 등록일</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">고객사</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">프로젝트명</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">총수량</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">상세수량</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">견적금액</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">고객책임자</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">작업일자</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">작업팀장(하청)</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">작업평가</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">작업평가 점수</th>
                        <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">삭제</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(selectedSubcontractor.recentActivities || []).map((activity, index) => (
                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.inquiryDate}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-900 font-medium">{activity.customerCompany}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-900 font-medium">{activity.projectName}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.totalQuantity}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.detailQuantity}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-900">{formatAmount(activity.estimateAmount)}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.customerManager}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.workDate}</td>
                          <td className="py-3 px-4 text-[14px] text-slate-600">{activity.subcontractor}</td>
                          <td className="py-3 px-4 text-[14px]">
                            <button 
                              className="px-3 py-1 text-[12px] font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors border border-blue-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedActivity(activity);
                                // 기존 평가 점수 불러오기
                                setWorkEvalCustomerClaim(activity.evalCustomerClaim || 0);
                                setWorkEvalAllDevices(activity.evalAllDevices || 0);
                                setWorkEvalOnTime(activity.evalOnTime || 0);
                                setWorkEvalAfterService(activity.evalAfterService || 0);
                                setWorkEvalUniform(activity.evalUniform || 0);
                                setWorkEvalKindness(activity.evalKindness || 0);
                                setShowWorkEvaluationModal(true);
                              }}
                            >
                              평가하기
                            </button>
                          </td>
                          <td className="py-3 px-4 text-[14px]">
                            <span className="font-semibold text-slate-900">{activity.workEvaluationScore}점</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDeleteSubcontractorActivity(index, activity.projectName)}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              {isEditingSubcontractor ? (
                <>
                  <button
                    onClick={handleCancelEditSubcontractor}
                    className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveSubcontractor}
                    className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    저장
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setSelectedSubcontractor(null);
                      setIsEditingSubcontractor(false);
                      setEditedSubcontractor(null);
                    }}
                    className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleEditSubcontractor}
                    className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    정보 수정
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 협력평가 모달 */}
      {showEvaluationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-slate-900">협력평가</h2>
              <button
                onClick={() => setShowEvaluationModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 기본 정보 */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-10 h-10 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[20px] font-semibold text-slate-900">{selectedSubcontractor?.name}</h3>
                    <StatusBadge status={selectedSubcontractor?.status} type="subcontractor" />
                    {selectedSubcontractor && (
                      <span className={`px-3 py-1 rounded-lg text-[13px] font-semibold border ${getPerformanceGradeStyle(calculateFinalScore(selectedSubcontractor))}`}>
                        {calculatePerformanceGrade(calculateFinalScore(selectedSubcontractor))}
                      </span>
                    )}
                  </div>
                  <p className="text-[15px] text-slate-600 mb-3">{selectedSubcontractor?.company}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <Phone className="w-4 h-4" />
                      {selectedSubcontractor?.phone}
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <Mail className="w-4 h-4" />
                      {selectedSubcontractor?.email}
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <MapPin className="w-4 h-4" />
                      {selectedSubcontractor?.address}
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <Calendar className="w-4 h-4" />
                      등록일: {selectedSubcontractor?.registrationDate}
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600">
                      <UserCircle className="w-4 h-4" />
                      나이: {selectedSubcontractor?.age}세
                    </div>
                    <div className="flex items-center gap-2 text-[14px]">
                      <Star className={`w-4 h-4 ${
                        selectedSubcontractor?.grade === 'S' ? 'text-purple-600' :
                        selectedSubcontractor?.grade === 'A' ? 'text-blue-600' :
                        selectedSubcontractor?.grade === 'B' ? 'text-green-600' :
                        'text-gray-600'
                      }`} />
                      <span className="text-slate-600">등급:</span>
                      <span className={`font-semibold ${
                        selectedSubcontractor?.grade === 'S' ? 'text-purple-700' :
                        selectedSubcontractor?.grade === 'A' ? 'text-blue-700' :
                        selectedSubcontractor?.grade === 'B' ? 'text-green-700' :
                        'text-gray-700'
                      }`}>{selectedSubcontractor?.grade}등급</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 현재 협력평가점수 */}
              <div className="bg-purple-50 rounded-xl p-4">
                <div className="text-[13px] text-purple-600 mb-1">현재 협력평가점수</div>
                <div className="text-[22px] font-semibold text-purple-900">
                  {selectedSubcontractor?.cooperationScore > 0 ? '+' : ''}{selectedSubcontractor?.cooperationScore}점
                </div>
              </div>

              {/* 평가 항목 */}
              <div className="space-y-4">
                <h3 className="text-[15px] font-semibold text-slate-900">새로운 평가</h3>
                <div className="flex items-center gap-4">
                  <div className="text-[14px] font-semibold text-slate-700">오더 제공 시 우선순위로 협력하는가?</div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${
                        evaluationItem1 === 1 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                      onClick={() => setEvaluationItem1(1)}
                    >
                      +1
                    </button>
                    <button
                      className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${
                        evaluationItem1 === 0 ? 'bg-gray-500 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                      onClick={() => setEvaluationItem1(0)}
                    >
                      0
                    </button>
                    <button
                      className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${
                        evaluationItem1 === -1 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                      onClick={() => setEvaluationItem1(-1)}
                    >
                      -1
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-[14px] font-semibold text-slate-700">에어터 공급가보다 더 요구하는가?</div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${
                        evaluationItem2 === 1 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                      onClick={() => setEvaluationItem2(1)}
                    >
                      +1
                    </button>
                    <button
                      className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${
                        evaluationItem2 === 0 ? 'bg-gray-500 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                      onClick={() => setEvaluationItem2(0)}
                    >
                      0
                    </button>
                    <button
                      className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${
                        evaluationItem2 === -1 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                      onClick={() => setEvaluationItem2(-1)}
                    >
                      -1
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-[14px] font-semibold text-slate-700">메모</div>
                  <input
                    type="text"
                    value={evaluationMemo}
                    onChange={(e) => setEvaluationMemo(e.target.value)}
                    className="w-full px-3 py-2 text-[14px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* 평가 이력 */}
              <div>
                <div className="text-[15px] font-semibold text-slate-900 mb-3">이전 평가 내역</div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">평가일</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">평가자</th>
                        <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">우선순위 협력</th>
                        <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">공급가 요구</th>
                        <th className="text-center py-3 px-4 text-[13px] font-semibold text-slate-700">합계</th>
                        <th className="text-left py-3 px-4 text-[13px] font-semibold text-slate-700">메모</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {selectedSubcontractor?.evaluationHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 px-4 text-center text-[14px] text-slate-500">
                            평가 이력이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        selectedSubcontractor?.evaluationHistory.map((evaluation, index) => (
                          <tr key={index} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 text-[14px] text-slate-600">{evaluation.date}</td>
                            <td className="py-3 px-4 text-[14px] text-slate-900 font-medium">{evaluation.evaluator}</td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-1 rounded text-[13px] font-medium ${
                                  evaluation.item1Score === 1
                                    ? 'bg-green-100 text-green-700'
                                    : evaluation.item1Score === -1
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {evaluation.item1Score > 0 ? '+' : ''}{evaluation.item1Score}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-1 rounded text-[13px] font-medium ${
                                  evaluation.item2Score === 1
                                    ? 'bg-green-100 text-green-700'
                                    : evaluation.item2Score === -1
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {evaluation.item2Score > 0 ? '+' : ''}{evaluation.item2Score}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-1 rounded text-[13px] font-semibold ${
                                  evaluation.totalScore > 0
                                    ? 'bg-green-100 text-green-700'
                                    : evaluation.totalScore < 0
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {evaluation.totalScore > 0 ? '+' : ''}{evaluation.totalScore}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-[14px] text-slate-600">{evaluation.memo || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowEvaluationModal(false)}
                className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (selectedSubcontractor) {
                    const newEvaluation: EvaluationRecord = {
                      date: new Date().toISOString().split('T')[0],
                      evaluator: '관리자',
                      item1Score: evaluationItem1,
                      item2Score: evaluationItem2,
                      totalScore: evaluationItem1 + evaluationItem2,
                      memo: evaluationMemo,
                    };
                    const updatedSubcontractors = subcontractors.map((sub) =>
                      sub.id === selectedSubcontractor.id
                        ? {
                            ...sub,
                            cooperationScore: sub.cooperationScore + newEvaluation.totalScore,
                            evaluationHistory: [...sub.evaluationHistory, newEvaluation],
                          }
                        : sub
                    );
                    setSubcontractors(updatedSubcontractors);
                    
                    // 선택된 작업팀장 정보도 업데이트
                    const updatedSelectedSubcontractor = updatedSubcontractors.find(
                      (sub) => sub.id === selectedSubcontractor.id
                    );
                    if (updatedSelectedSubcontractor) {
                      setSelectedSubcontractor(updatedSelectedSubcontractor);
                    }
                    
                    // 입력값 초기화
                    setEvaluationItem1(0);
                    setEvaluationItem2(0);
                    setEvaluationMemo('');
                    
                    setShowEvaluationModal(false);
                  }
                }}
                className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                평가 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 작업 평가 모달 */}
      {showWorkEvaluationModal && selectedActivity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-slate-900">작업 평가</h2>
              <button
                onClick={() => {
                  setShowWorkEvaluationModal(false);
                  setSelectedActivity(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 작업 정보 */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[13px] text-slate-500">고객사:</span>
                    <span className="ml-2 text-[14px] font-semibold text-slate-900">{selectedActivity.customerCompany}</span>
                  </div>
                  <div>
                    <span className="text-[13px] text-slate-500">프로젝트:</span>
                    <span className="ml-2 text-[14px] font-semibold text-slate-900">{selectedActivity.projectName}</span>
                  </div>
                  <div>
                    <span className="text-[13px] text-slate-500">작업일자:</span>
                    <span className="ml-2 text-[14px] font-semibold text-slate-900">{selectedActivity.workDate}</span>
                  </div>
                </div>
              </div>

              {/* 서비스 품질 항목 */}
              <div>
                <div className="text-[15px] font-semibold text-slate-900 mb-4">서비스 품질</div>
                <div className="space-y-4">
                  {/* 고객클래임 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[14px] font-medium text-slate-700 mb-3">고객클래임이 발생했는가</div>
                    <div className="flex gap-2">
                      {[-2, -1, 0, 1].map((value) => (
                        <button
                          key={value}
                          onClick={() => setWorkEvalCustomerClaim(value)}
                          className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg transition-colors ${
                            workEvalCustomerClaim === value
                              ? value > 0
                                ? 'bg-green-100 text-green-700 border-2 border-green-500'
                                : value < 0
                                ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                : 'bg-gray-100 text-gray-700 border-2 border-gray-500'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {value > 0 ? '+' : ''}{value}점
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[12px] text-slate-500 space-y-1">
                        <div><span className="font-medium text-red-700">-2점:</span> 클래임 발생하여 재방문 발생</div>
                        <div><span className="font-medium text-red-600">-1점:</span> 클래임 발생</div>
                        <div><span className="font-medium text-gray-700">0점:</span> 클래임 발생 없음</div>
                        <div><span className="font-medium text-green-700">+1점:</span> 긍정적 피드백 발생</div>
                      </div>
                    </div>
                  </div>

                  {/* 모든 기기 작업 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[14px] font-medium text-slate-700 mb-3">의뢰된 모든 기기를 작업했는가</div>
                    <div className="flex gap-2">
                      {[-2, 0].map((value) => (
                        <button
                          key={value}
                          onClick={() => setWorkEvalAllDevices(value)}
                          className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg transition-colors ${
                            workEvalAllDevices === value
                              ? value < 0
                                ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                : 'bg-gray-100 text-gray-700 border-2 border-gray-500'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {value > 0 ? '+' : ''}{value}점
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[12px] text-slate-500 space-y-1">
                        <div><span className="font-medium text-red-700">-2점:</span> 의뢰 대수 중 1대 이상 스킵</div>
                        <div><span className="font-medium text-gray-700">0점:</span> 의뢰 대수 모두 작업</div>
                      </div>
                    </div>
                  </div>

                  {/* 작업 예정시간 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[14px] font-medium text-slate-700 mb-3">작업 예정시간에 완료했는가</div>
                    <div className="flex gap-2">
                      {[-2, -1, 0, 1].map((value) => (
                        <button
                          key={value}
                          onClick={() => setWorkEvalOnTime(value)}
                          className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg transition-colors ${
                            workEvalOnTime === value
                              ? value > 0
                                ? 'bg-green-100 text-green-700 border-2 border-green-500'
                                : value < 0
                                ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                : 'bg-gray-100 text-gray-700 border-2 border-gray-500'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {value > 0 ? '+' : ''}{value}점
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[12px] text-slate-500 space-y-1">
                        <div><span className="font-medium text-red-700">-2점:</span> 다음날로 넘어감</div>
                        <div><span className="font-medium text-red-600">-1점:</span> 예정시간 1시간 이상 초과함</div>
                        <div><span className="font-medium text-gray-700">0점:</span> 예정시간 1시간 미만 범위에 완료함</div>
                        <div><span className="font-medium text-green-700">+1점:</span> 예정시간보다 일찍 완료했으며, 작업 품질도 우수함</div>
                      </div>
                    </div>
                  </div>

                  {/* A/S 발생 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[14px] font-medium text-slate-700 mb-3">A/S가 발생했는가</div>
                    <div className="flex gap-2">
                      {[-2, -1, 0, 1].map((value) => (
                        <button
                          key={value}
                          onClick={() => setWorkEvalAfterService(value)}
                          className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg transition-colors ${
                            workEvalAfterService === value
                              ? value > 0
                                ? 'bg-green-100 text-green-700 border-2 border-green-500'
                                : value < 0
                                ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                : 'bg-gray-100 text-gray-700 border-2 border-gray-500'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {value > 0 ? '+' : ''}{value}점
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[12px] text-slate-500 space-y-1">
                        <div><span className="font-medium text-red-700">-2점:</span> 외부 A/S 서비스 신청, 고객 물건 파손, 심한 부품 파손</div>
                        <div><span className="font-medium text-red-600">-1점:</span> 간단 오류 발생 후 자체 해결</div>
                        <div><span className="font-medium text-gray-700">0점:</span> 오류 및 파손 없이 완료</div>
                        <div><span className="font-medium text-green-700">+1점:</span> 에어컨청소 작업 외 추가 A/S 서비스 제공</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 브랜딩 항목 */}
              <div>
                <div className="text-[15px] font-semibold text-slate-900 mb-4">브랜딩</div>
                <div className="space-y-4">
                  {/* 유니폼 착용 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[14px] font-medium text-slate-700 mb-3">유니폼을 잘 착용했는가</div>
                    <div className="flex gap-2">
                      {[-2, -1, 0, 1, 2].map((value) => (
                        <button
                          key={value}
                          onClick={() => setWorkEvalUniform(value)}
                          className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg transition-colors ${
                            workEvalUniform === value
                              ? value > 0
                                ? 'bg-green-100 text-green-700 border-2 border-green-500'
                                : value < 0
                                ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                : 'bg-gray-100 text-gray-700 border-2 border-gray-500'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {value > 0 ? '+' : ''}{value}점
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[12px] text-slate-500 space-y-1">
                        <div><span className="font-medium text-red-700">-2점:</span> 작업 조끼, 작업 티셔츠 모두 미착용 적발</div>
                        <div><span className="font-medium text-red-600">-1점:</span> 작업 티셔츠 미착용 적발(조끼만 착용)</div>
                        <div><span className="font-medium text-gray-700">0점:</span> 작업 조끼, 작업 티셔츠 착용</div>
                        <div><span className="font-medium text-green-700">+1점:</span> 유니폼 착용 우수</div>
                      </div>
                    </div>
                  </div>

                  {/* 고객 응대 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[14px] font-medium text-slate-700 mb-3">고객 응대에 친절했는가</div>
                    <div className="flex gap-2">
                      {[-2, -1, 0, 1].map((value) => (
                        <button
                          key={value}
                          onClick={() => setWorkEvalKindness(value)}
                          className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg transition-colors ${
                            workEvalKindness === value
                              ? value > 0
                                ? 'bg-green-100 text-green-700 border-2 border-green-500'
                                : value < 0
                                ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                : 'bg-gray-100 text-gray-700 border-2 border-gray-500'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {value > 0 ? '+' : ''}{value}점
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[12px] text-slate-500 space-y-1">
                        <div><span className="font-medium text-red-700">-2점:</span> 고객에게 불쾌감 전달</div>
                        <div><span className="font-medium text-red-600">-1점:</span> 고객 질의에 무응답</div>
                        <div><span className="font-medium text-gray-700">0점:</span> 고객 응대 적절</div>
                        <div><span className="font-medium text-green-700">+1점:</span> 고객 응대 우수</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 총 점수 표시 */}
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="text-[13px] text-blue-600 mb-1">총 평가 점수</div>
                <div className="text-[24px] font-semibold text-blue-900">
                  {workEvalCustomerClaim + workEvalAllDevices + workEvalOnTime + workEvalAfterService + workEvalUniform + workEvalKindness > 0 ? '+' : ''}
                  {workEvalCustomerClaim + workEvalAllDevices + workEvalOnTime + workEvalAfterService + workEvalUniform + workEvalKindness}점
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowWorkEvaluationModal(false);
                  setSelectedActivity(null);
                  // 초기화
                  setWorkEvalCustomerClaim(0);
                  setWorkEvalAllDevices(0);
                  setWorkEvalOnTime(0);
                  setWorkEvalAfterService(0);
                  setWorkEvalUniform(0);
                  setWorkEvalKindness(0);
                }}
                className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const totalScore = workEvalCustomerClaim + workEvalAllDevices + workEvalOnTime + workEvalAfterService + workEvalUniform + workEvalKindness;
                  
                  // 작업 평가 저장 로직
                  if (selectedSubcontractor) {
                    const updatedActivities = selectedSubcontractor.recentActivities.map((activity) =>
                      activity.inquiryDate === selectedActivity.inquiryDate &&
                      activity.customerCompany === selectedActivity.customerCompany &&
                      activity.projectName === selectedActivity.projectName
                        ? { 
                            ...activity, 
                            workEvaluationScore: totalScore,
                            evalCustomerClaim: workEvalCustomerClaim,
                            evalAllDevices: workEvalAllDevices,
                            evalOnTime: workEvalOnTime,
                            evalAfterService: workEvalAfterService,
                            evalUniform: workEvalUniform,
                            evalKindness: workEvalKindness
                          }
                        : activity
                    );
                    
                    const updatedSubcontractors = subcontractors.map((sub) =>
                      sub.id === selectedSubcontractor.id
                        ? { ...sub, recentActivities: updatedActivities }
                        : sub
                    );
                    
                    setSubcontractors(updatedSubcontractors);
                    
                    // 선택된 작업팀장 정보도 업데이트
                    const updatedSelectedSubcontractor = updatedSubcontractors.find(
                      (sub) => sub.id === selectedSubcontractor.id
                    );
                    if (updatedSelectedSubcontractor) {
                      setSelectedSubcontractor(updatedSelectedSubcontractor);
                    }
                  }
                  
                  // 초기화
                  setWorkEvalCustomerClaim(0);
                  setWorkEvalAllDevices(0);
                  setWorkEvalOnTime(0);
                  setWorkEvalAfterService(0);
                  setWorkEvalUniform(0);
                  setWorkEvalKindness(0);
                  setShowWorkEvaluationModal(false);
                  setSelectedActivity(null);
                }}
                className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                평가 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 책임자 등록 모달 */}
      {showAddManagerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-slate-900">책임자 등록</h2>
              <button
                onClick={handleCancelAddManager}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 책임자명 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">
                  책임자명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newManager.name || ''}
                  onChange={(e) => setNewManager({ ...newManager, name: e.target.value })}
                  placeholder="책임자명을 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 직급 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">
                  직급 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newManager.position || ''}
                  onChange={(e) => setNewManager({ ...newManager, position: e.target.value })}
                  placeholder="직급을 입력하세요 (예: 부장)"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 연락처 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">
                  연락처 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newManager.phone || ''}
                  onChange={(e) => setNewManager({ ...newManager, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">
                  이메일
                </label>
                <input
                  type="email"
                  value={newManager.email || ''}
                  onChange={(e) => setNewManager({ ...newManager, email: e.target.value })}
                  placeholder="example@company.com"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 주소 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">주소</label>
                <input
                  type="text"
                  value={newManager.address || ''}
                  onChange={(e) => setNewManager({ ...newManager, address: e.target.value })}
                  placeholder="주소를 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 담당 지역 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">담당 지역</label>
                <select
                  value={newManager.assignedArea || '서울 수도권'}
                  onChange={(e) => setNewManager({ ...newManager, assignedArea: e.target.value })}
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {areaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>

              {/* 상태 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">상태</label>
                <select
                  value={newManager.status || 'active'}
                  onChange={(e) => setNewManager({ ...newManager, status: e.target.value as 'active' | 'vacation' | 'leave' })}
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCancelAddManager}
                className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveNewManager}
                className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 작업팀장 등록 모달 */}
      {showAddSubcontractorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-slate-900">작업팀장 등록</h2>
              <button
                onClick={handleCancelAddSubcontractor}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 팀장명 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">
                  팀장명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSubcontractor.name || ''}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, name: e.target.value })}
                  placeholder="팀장명을 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 소속회사 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">
                  소속회사 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSubcontractor.company || ''}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, company: e.target.value })}
                  placeholder="소속회사를 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 연락처 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">
                  연락처 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSubcontractor.phone || ''}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">이메일</label>
                <input
                  type="email"
                  value={newSubcontractor.email || ''}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, email: e.target.value })}
                  placeholder="example@company.com"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 주소 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">주소</label>
                <input
                  type="text"
                  value={newSubcontractor.address || ''}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, address: e.target.value })}
                  placeholder="주소를 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 담당 지역 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">담당 지역</label>
                <select
                  value={newSubcontractor.assignedArea || '서울 수도권'}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, assignedArea: e.target.value })}
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {areaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>

              {/* 전문 분야 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">전문 분야</label>
                <input
                  type="text"
                  value={newSubcontractor.specialization || ''}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, specialization: e.target.value })}
                  placeholder="전문 분야를 입력하세요 (예: 전기공사)"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 팀 규모 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">팀 규모 (인원)</label>
                <input
                  type="number"
                  min="1"
                  value={newSubcontractor.teamSize || 1}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, teamSize: parseInt(e.target.value) || 1 })}
                  placeholder="팀 규모를 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 나이 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">나이</label>
                <input
                  type="number"
                  min="20"
                  max="80"
                  value={newSubcontractor.age || 30}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, age: parseInt(e.target.value) || 30 })}
                  placeholder="나이를 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 기본점수 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">기본점수</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newSubcontractor.baseScore || 50}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, baseScore: parseInt(e.target.value) || 50 })}
                  placeholder="기본점수를 입력하세요"
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 상태 */}
              <div>
                <label className="block text-[14px] font-medium text-slate-700 mb-2">상태</label>
                <select
                  value={newSubcontractor.status || 'available'}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, status: e.target.value as 'available' | 'busy' | 'unavailable' })}
                  className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {subcontractorStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCancelAddSubcontractor}
                className="px-5 py-2.5 text-[14px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveNewSubcontractor}
                className="px-5 py-2.5 text-[14px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}