import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { Users, TrendingUp, Settings, Menu, X, Bell, Package, Calculator, LogOut, CheckCheck, AlertCircle, UserPlus, CalendarClock, FileEdit, Sparkles, House, ListChecks, Wind, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { CustomersPage, fetchCustomers, isTempCustomerId, updateCustomerFields } from './components/CustomersPage';
import { SalesPage, fetchDeals, type SalesViewState } from './components/SalesPage';
import { SupplyChainPage, fetchManagers, fetchSubcontractors, updateManager, updateSubcontractor } from './components/SupplyChainPage';
import { ProfitPage, fetchProjects, fetchLaborRates, type Project, type LaborRate } from './components/ProfitPage';
import { HomePage } from './components/home/HomePage';
import { TodoPage } from './components/home/TodoPage';
import { GlobalSearch } from './components/GlobalSearch';
import type { AiDatasets } from '../lib/ai/types';
import { kstYmd } from '../lib/ai/format';
import { computeHome } from '../lib/home/metrics';
import { useTodoRecords } from '../lib/home/useTodoRecords';
import type { IntakeDataChange } from './components/ai/QuoteIntakePanel';
import { buildDealStateMap, currentWriteEpoch, hasSynced, linkedDealId, type SyncResult } from '../lib/dealSync';
import { managerActivities, sameActivities, subcontractorActivities } from '../lib/activitySync';
import { customerTotalAmount, effectiveGrade, gradeClass, gradeLabel, managerToAssign } from '../lib/customerGrade';
import { canPersistGrades, useGradeLocks } from '../lib/gradeLocks';

// AI 어시스턴트·설정은 첫 방문 때 내려받는다 (마크다운 렌더러 포함 별도 청크)
const AiAssistantPage = lazy(() => import('./components/ai/AiAssistantPage'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));

type PageId = 'home' | 'todos' | 'sales' | 'ai' | 'profit' | 'customers' | 'supplychain' | 'settings';

// Tailwind 4 는 리터럴 클래스만 인식하므로 강조색을 통째로 적어 둔다
const NAV_ACCENT = {
  blue: { side: 'bg-blue-50 text-blue-700 shadow-sm', icon: 'text-blue-700', text: 'text-blue-700', bottom: 'text-blue-600' },
} as const;

function PageSpinner() {
  return <div className="flex h-full items-center justify-center py-20 text-[13px] text-slate-400">불러오는 중…</div>;
}

export default function App() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('user_name') || '';
  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [deals, setDeals] = useState<any[]>([]);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [salesDateFilter, setSalesDateFilter] = useState({ startMonth: currentMonth, endMonth: currentMonth, activeDatePreset: '이번 달' });
  const [salesViewState, setSalesViewState] = useState<SalesViewState>({
    viewMode: 'list', searchTerm: '', showFilters: false,
    selectedStatuses: [], selectedSuccessStatuses: [], selectedSalesManagers: [],
    minQuantity: '', maxQuantity: '', minAmount: '', maxAmount: '',
    sortField: null, sortDirection: 'asc',
  });
  const [customers, setCustomers] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [subcontractors, setSubcontractors] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [laborRates, setLaborRates] = useState<LaborRate[]>([]);
  const [datasetsLoadedAt, setDatasetsLoadedAt] = useState(0);
  // 홈·일정표에서 '고객 정보 보기'·'프로젝트 보기'로 넘어갈 때 바로 열 대상
  const [customerFocusId, setCustomerFocusId] = useState<number | null>(null);
  const [projectFocusId, setProjectFocusId] = useState<number | null>(null);
  const [dealFocusId, setDealFocusId] = useState<number | null>(null);

  // DB에서 데이터 로드
  useEffect(() => {
    Promise.all([
      fetchDeals()
        .then((data) => setDeals(data))
        .catch((err) => console.error('딜 데이터 로드 실패:', err)),
      fetchCustomers()
        .then((data) => setCustomers(data))
        .catch((err) => console.error('고객 데이터 로드 실패:', err)),
      fetchManagers()
        .then((data) => setManagers(data))
        .catch((err) => console.error('고객책임자 데이터 로드 실패:', err)),
      fetchSubcontractors()
        .then((data) => setSubcontractors(data))
        .catch((err) => console.error('작업팀장 데이터 로드 실패:', err)),
      fetchProjects()
        .then((data) => setProjects(data))
        .catch((err) => console.error('프로젝트 데이터 로드 실패:', err)),
      fetchLaborRates()
        .then((data) => setLaborRates(data))
        .catch((err) => console.error('단가표 데이터 로드 실패:', err)),
    ]).then(() => {
      const now = Date.now();
      setDatasetsLoadedAt(now);
      lastLoadedRef.current = now;
    });
  }, []);

  // ── 세 페이지(영업·고객·프로젝트) 최신 상태 유지 ─────────────────────────
  // 저장하면 서버가 연결된 딜·고객 작업이력·프로젝트를 함께 고친다(api/sync_lib.php, docs/data-sync.md).
  // 그 결과(synced)가 오면 세 목록을 다시 불러온다. 페이지를 옮기거나 탭으로 돌아올 때도 오래됐으면 새로 받는다.
  const lastLoadedRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const refreshAllRef = useRef<() => void>(() => {});
  const refreshAll = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(async () => {
      refreshTimerRef.current = null;
      const epoch = currentWriteEpoch();
      const [d, c, p] = await Promise.allSettled([fetchDeals(), fetchCustomers(), fetchProjects()]);
      // 불러오는 사이 다른 저장이 있었으면 이 결과는 낡았다 — 버리고 다시 받는다
      if (epoch !== currentWriteEpoch()) {
        refreshAllRef.current();
        return;
      }
      if (d.status === 'fulfilled') setDeals(d.value);
      if (c.status === 'fulfilled') setCustomers(c.value);
      if (p.status === 'fulfilled') setProjects(p.value);
      lastLoadedRef.current = Date.now();
    }, 300);
  }, []);
  refreshAllRef.current = refreshAll;

  // 페이지가 저장 결과를 알려 줌 — null 은 결과를 모르는 경우(실패·충돌·고객 삭제)라 서버 값으로 맞춘다
  const handleSynced = useCallback((result: SyncResult | null) => {
    if (!result || hasSynced(result)) refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && lastLoadedRef.current && Date.now() - lastLoadedRef.current > 60_000) refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshAll]);

  // 연결 작업·프로젝트의 '수주 취소'·'딜 삭제됨' 표시용 (딜 목록을 못 불러왔으면 표시하지 않는다)
  const dealStates = useMemo(() => (deals.length > 0 ? buildDealStateMap(deals) : null), [deals]);
  // 딜 → 그 딜을 작업이력에 가진 고객 (영업 딜 상세의 고객사 파일 목록용)
  const dealCustomerIds = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of customers) for (const w of c.workHistory || []) {
      const id = linkedDealId(w);
      if (id && !map.has(id)) map.set(id, Number(c.id));
    }
    return map;
  }, [customers]);
  // 고객 작업이력·프로젝트와 연결된 딜 (영업 페이지 삭제 안내용)
  const linkedDealIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of customers) for (const w of c.workHistory || []) {
      const id = linkedDealId(w);
      if (id) set.add(id);
    }
    for (const p of projects) if (p.dealId) set.add(Number(p.dealId));
    return set;
  }, [customers, projects]);

  // AI 어시스턴트 데이터 스냅샷 재료
  const aiDatasets = useMemo<AiDatasets>(
    () => ({ deals, customers, managers, subcontractors, projects, laborRates, loadedAt: datasetsLoadedAt }),
    [deals, customers, managers, subcontractors, projects, laborRates, datasetsLoadedAt],
  );
  const aiDatasetsRef = useRef(aiDatasets);
  aiDatasetsRef.current = aiDatasets;

  // '최신 데이터로 갱신' — App 상태는 건드리지 않는다.
  // (customers 를 갱신하면 아래 동기화 effect 가 고객책임자·작업팀장 전원에게 PUT 을 보낸다)
  const loadFreshDatasets = useCallback(async (): Promise<AiDatasets> => {
    const current = aiDatasetsRef.current;
    const [d, c, m, s, p, l] = await Promise.allSettled([
      fetchDeals(),
      fetchCustomers(),
      fetchManagers(),
      fetchSubcontractors(),
      fetchProjects(),
      fetchLaborRates(),
    ]);
    const pick = <T,>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === 'fulfilled' ? r.value : fallback);
    return {
      deals: pick(d, current.deals),
      customers: pick(c, current.customers),
      managers: pick(m, current.managers),
      subcontractors: pick(s, current.subcontractors),
      projects: pick(p, current.projects),
      laborRates: pick(l, current.laborRates),
      loadedAt: Date.now(),
    };
  }, []);

  // 알림 시스템
  type Notification = {
    id: number;
    type: 'deal_success' | 'customer_registered' | 'management_due' | 'admin_action' | 'ai_reply';
    message: string;
    timestamp: Date;
    read: boolean;
  };
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  // AI 어시스턴트는 첫 방문 때 마운트하고 이후 숨김으로 유지 (진행 중인 응답·대화 보존)
  const [aiMounted, setAiMounted] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiUnread, setAiUnread] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  // 페이지를 옮기면 본문은 맨 위에서 시작한다 (예전에는 앞 페이지의 스크롤 위치가 남았다)
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [currentPage]);

  const addNotification = (type: Notification['type'], message: string) => {
    setNotifications(prev => [{
      id: Date.now() + Math.random(),
      type,
      message,
      timestamp: new Date(),
      read: false,
    }, ...prev]);
  };

  const markAsRead = (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // ── 홈: 지표·재계약 연락 할 일·일정표 (src/lib/home/metrics.ts) ───────────────
  // 오늘은 KST 로 잡고, 자정을 넘기면 다시 계산한다
  const [today, setToday] = useState(() => kstYmd());
  useEffect(() => {
    const tick = window.setInterval(() => setToday((cur) => (cur === kstYmd() ? cur : kstYmd())), 60_000);
    return () => window.clearInterval(tick);
  }, []);
  const homeData = useMemo(() => (datasetsLoadedAt ? computeHome(aiDatasets, today) : null), [aiDatasets, datasetsLoadedAt, today]);
  // 완료 기록(D1) — 홈·할 일 페이지·사이드바 배지가 함께 쓴다
  const todoState = useTodoRecords(userName, (message) => addNotification('admin_action', message));
  const openTodos = useMemo(
    () => (homeData ? homeData.todos.filter((t) => !todoState.records.has(t.key)) : []),
    [homeData, todoState.records],
  );
  // 고객 등급 수동 고정(D1) — 아래 등급 자동 반영과 고객관리 화면이 함께 쓴다
  const gradeLocks = useGradeLocks(userName, (message) => addNotification('admin_action', message));

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAdminNotification = (message: string) => {
    addNotification('admin_action', message);
  };

  // AI 응답이 다른 탭을 보고 있는 동안 끝나면 알림
  const handleAiBackgroundReply = useCallback((title: string) => {
    setNotifications(prev => [{
      id: Date.now() + Math.random(),
      type: 'ai_reply',
      message: `AI 답변이 도착했습니다 — ${title}`,
      timestamp: new Date(),
      read: false,
    }, ...prev]);
    setAiUnread(true);
  }, []);

  // 견적서 입력 도우미가 딜을 바꾸면(한 번 실행에 여러 딜일 수 있음) 세 목록을 다시 불러온다
  // (연결된 딜이면 서버가 고객 작업이력·프로젝트도 함께 고친다)
  const handleAiDataChanged = useCallback(async (changes: IntakeDataChange[]) => {
    if (!changes.length) return;
    const [first] = changes;
    const files = changes.reduce((a, c) => a + c.files, 0);
    const created = changes.filter(c => c.created).length;
    setNotifications(prev => [{
      id: Date.now() + Math.random(),
      type: 'admin_action',
      message: changes.length === 1
        ? `[${first.company}] 견적서 ${files}건이 ${first.created ? `새 딜(#${first.dealId})로 등록` : `딜 #${first.dealId}에 입력`}되었습니다`
        : `[견적서 일괄 입력] ${files}건 — 딜 ${changes.length}개${created ? ` (새 딜 ${created})` : ''}`,
      timestamp: new Date(),
      read: false,
    }, ...prev]);
    refreshAll();
  }, [refreshAll]);

  const goTo = (page: PageId) => {
    if (page === 'ai') {
      setAiMounted(true);
      setAiUnread(false);
    }
    // 영업·프로젝트·고객 페이지로 옮길 때 20초 넘게 지난 목록이면 새로 받는다 (다른 사람·탭이 고친 값)
    if ((page === 'home' || page === 'todos' || page === 'sales' || page === 'profit' || page === 'customers') && lastLoadedRef.current && Date.now() - lastLoadedRef.current > 20_000) {
      refreshAll();
    }
    setCurrentPage(page);
    if (isMobile) setSidebarOpen(false);
  };
  const openSettings = useCallback(() => setCurrentPage('settings'), []);
  const openCustomer = (customerId: number) => {
    setCustomerFocusId(customerId);
    goTo('customers');
  };
  const openProject = (projectId: number) => {
    setProjectFocusId(projectId);
    goTo('profit');
  };
  const openDeal = (dealId: number) => {
    setDealFocusId(dealId);
    goTo('sales');
  };

  const handleLogout = () => {
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_id');
    navigate('/login');
  };

  // 딜이 수주로 바뀌면 서버(api/sync_lib.php sl_link_deal)가 고객 작업이력·프로젝트를 만들거나 맞춘다.
  // 목록 새로고침은 저장 결과(handleSynced)가 맡고, 여기서는 알림만.
  const handleDealSuccess = (deal: any) => {
    addNotification('deal_success', `[${deal.company}] 딜이 수주확정되었습니다 — 고객관리 작업이력·프로젝트 관리에 반영했습니다`);
  };

  // 고객관리 작업이력 → 공급망관리 고객책임자·작업팀장 작업 히스토리 (src/lib/activitySync.ts)
  // 활동이 실제로 바뀐 사람만 저장한다 — 예전에는 고객 목록이 바뀔 때마다 전원을 PUT 했다.
  // 공급망 화면에서 직접 고친 값(평가 등)은 고객 목록이 바뀔 때 합쳐지므로 managers·subcontractors 변경에는 반응하지 않는다.
  const managersRef = useRef(managers);
  managersRef.current = managers;
  const subcontractorsRef = useRef(subcontractors);
  subcontractorsRef.current = subcontractors;
  const managersReady = managers.length > 0;
  const subcontractorsReady = subcontractors.length > 0;

  useEffect(() => {
    if (!customers.length || !managersReady) return;
    const changed: any[] = [];
    const next = managersRef.current.map((manager) => {
      const acts = managerActivities(manager.name, customers);
      if (sameActivities(acts, manager.recentActivities)) return manager;
      const updated = { ...manager, recentActivities: acts };
      changed.push(updated);
      return updated;
    });
    if (!changed.length) return;
    setManagers(next);
    changed.forEach((manager) => {
      updateManager(manager).catch(err => console.error('고객책임자 활동내역 동기화 API 실패:', err));
    });
  }, [customers, managersReady]);

  useEffect(() => {
    if (!customers.length || !subcontractorsReady) return;
    const changed: any[] = [];
    const next = subcontractorsRef.current.map((sub) => {
      const acts = subcontractorActivities(sub, customers);
      if (sameActivities(acts, sub.recentActivities)) return sub;
      const updated = { ...sub, recentActivities: acts };
      changed.push(updated);
      return updated;
    });
    if (!changed.length) return;
    setSubcontractors(next);
    changed.forEach((sub) => {
      updateSubcontractor(sub).catch(err => console.error('작업팀장 활동내역 동기화 API 실패:', err));
    });
  }, [customers, subcontractorsReady]);

  // 고객 등급 자동 분류 — 누적 거래 금액 기준(src/lib/customerGrade.ts), 수동 고정한 고객은 고정한 등급.
  // 고객책임자 자동 지정 — 책임자가 비어 있는 S·A·B 고객에게만 등급별 책임자(D1, gradeLocks.gradeManagers)를 넣는다.
  //   이미 책임자가 있으면 등급이 바뀌어도 바꾸지 않는다(B → A 승급 포함).
  // 저장된 값과 다른 고객만 화면 상태를 바꾸고 그 고객만 저장한다 (위 활동내역과 같은 '바뀐 것만 PUT').
  // 수주로 새 고객이 생기거나 작업 금액이 바뀌면 고객 목록을 다시 불러올 때 여기서 맞춰진다.
  // 고정 목록을 정상으로 불러온 뒤에만 돈다 — 못 불러왔는데 돌면 수동 고정한 고객을 금액 기준으로 덮어쓴다.
  // 저장은 운영 주소에서만 한다(canPersistGrades) — 프리뷰·로컬은 고정 저장소가 운영과 달라 화면 표시만 맞춘다.
  const gradeSavingRef = useRef(new Set<string>()); // 저장 중인 "고객:바꿀 값"
  const gradeFailedRef = useRef(new Set<string>()); // 이 세션에서 저장에 실패한 것 — 다시 시도하지 않는다 (화면 표시는 계속 맞춘다)
  // 자동 지정할 수 있는 고객책임자 — 퇴사자는 뺀다. 이름이 바뀔 때만 새로 만든다(활동내역 갱신으로 managers 가 바뀌어도 그대로)
  const assignableManagersKey = managers.filter((m) => m?.status !== 'leave').map((m) => String(m?.name || '')).filter(Boolean).join('\n');
  const assignableManagers = useMemo(() => new Set(assignableManagersKey ? assignableManagersKey.split('\n') : []), [assignableManagersKey]);
  useEffect(() => {
    if (gradeLocks.status !== 'ok' || !customers.length) return;
    const changes = new Map<any, { patch: { grade?: string; accountManager?: string }; note: string; notify: boolean }>();
    for (const c of customers) {
      const id = Number(c.id);
      if (!Number.isInteger(id) || id <= 0 || isTempCustomerId(id)) continue;
      const lock = gradeLocks.locks.get(id);
      const want = effectiveGrade(c, lock?.grade);
      const from = gradeClass(c.grade);
      const manager = managerToAssign(c.accountManager, want, gradeLocks.gradeManagers, assignableManagers);
      if (from === want && !manager) continue;
      const patch: { grade?: string; accountManager?: string } = {};
      const notes: string[] = [];
      if (from !== want) {
        patch.grade = want;
        notes.push(`등급 ${from} → ${want} 자동 분류 (누적 거래 ${Math.round(customerTotalAmount(c) / 10_000).toLocaleString('ko-KR')}만원)`);
      }
      if (manager) {
        patch.accountManager = manager;
        notes.push(`고객책임자 ${manager} 자동 지정${from === want ? ` (${gradeLabel(want)})` : ''}`);
      }
      // 손으로 고정해서 등급만 바뀐 것은 본인이 방금 한 일이라 알리지 않는다
      changes.set(c.id, { patch, note: `[${String(c.company || '-')}] ${notes.join(' · ')}`, notify: !!manager || !lock });
    }
    if (!changes.size) return;
    setCustomers((prev) => prev.map((c) => (changes.has(c.id) ? { ...c, ...changes.get(c.id)!.patch } : c)));
    if (!canPersistGrades()) return;
    changes.forEach((ch, rawId) => {
      const id = Number(rawId);
      const key = `${id}:${ch.patch.grade ?? ''}:${ch.patch.accountManager ?? ''}`;
      if (gradeSavingRef.current.has(key) || gradeFailedRef.current.has(key)) return;
      gradeSavingRef.current.add(key);
      updateCustomerFields(id, ch.patch as any)
        .then(() => {
          if (ch.notify) addNotification('admin_action', ch.note);
        })
        .catch((err) => {
          gradeFailedRef.current.add(key);
          console.error('고객 등급·책임자 자동 반영 API 실패:', err);
        })
        .finally(() => gradeSavingRef.current.delete(key));
    });
  }, [customers, gradeLocks.locks, gradeLocks.gradeManagers, gradeLocks.status, assignableManagers]);

  // 모바일 화면 감지
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const navigation: { id: PageId; name: string; short: string; icon: typeof TrendingUp; accent: keyof typeof NAV_ACCENT }[] = [
    { id: 'home', name: '홈', short: '홈', icon: House, accent: 'blue' },
    { id: 'ai', name: 'AI 어시스턴트', short: 'AI', icon: Sparkles, accent: 'blue' },
    { id: 'todos', name: '오늘의 할 일', short: '할 일', icon: ListChecks, accent: 'blue' },
    { id: 'sales', name: '영업 관리', short: '영업', icon: TrendingUp, accent: 'blue' },
    { id: 'profit', name: '프로젝트 관리', short: '프로젝트', icon: Calculator, accent: 'blue' },
    { id: 'customers', name: '고객 관리', short: '고객', icon: Users, accent: 'blue' },
    { id: 'supplychain', name: '공급망 관리', short: '공급망', icon: Package, accent: 'blue' },
  ];
  // 모바일 하단 바는 칸이 좁아 '할 일'은 빼고 홈의 전체보기로 들어간다
  const bottomNavigation = navigation.filter((item) => item.id !== 'todos');
  const aiBadge = currentPage !== 'ai' && (aiStreaming || aiUnread);
  const todoCount = homeData ? openTodos.length : 0;
  // 업무 4페이지는 글자를 키워 보여 준다 (팀 40대·75% 줌 — src/styles/readable.css)
  const readable = currentPage === 'sales' || currentPage === 'profit' || currentPage === 'customers' || currentPage === 'supplychain';

  return (
    <div className="h-dvh flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`${
          isMobile
            ? sidebarOpen
              ? 'fixed inset-0 z-50 bg-white'
              : 'hidden'
            : sidebarOpen
              ? 'w-64'
              : 'w-20'
        } bg-white border-r border-slate-200 transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className={`h-16 border-b border-slate-200 flex items-center ${sidebarOpen || isMobile ? 'justify-between px-4 md:px-5' : 'justify-center px-2'}`}>
          {(sidebarOpen || isMobile) && (
            <div className="flex items-center gap-2.5">
              {/* 로그인 화면과 같은 로고 타일 */}
              <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <Wind className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[16px] font-bold text-slate-900 tracking-tight">AIRTOR System</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label={isMobile ? '메뉴 닫기' : sidebarOpen ? '메뉴 접기' : '메뉴 펼치기'}
            title={isMobile ? '메뉴 닫기' : sidebarOpen ? '메뉴 접기' : '메뉴 펼치기'}
          >
            {isMobile ? (
              <X className="w-5 h-5 text-slate-600" />
            ) : sidebarOpen ? (
              <PanelLeftClose className="w-5 h-5 text-slate-600" />
            ) : (
              <PanelLeftOpen className="w-5 h-5 text-slate-600" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const accent = NAV_ACCENT[item.accent];
            const expanded = sidebarOpen || isMobile;
            return (
              <div key={item.id}>
                <button
                  onClick={() => goTo(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.id === 'todos' && todoCount ? `${item.name} ${todoCount}건` : item.name}
                  className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? accent.side
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? accent.icon : 'text-slate-500'}`} />
                  {expanded && (
                    <span className={`text-[16px] ${isActive ? `font-semibold ${accent.text}` : 'font-medium text-slate-700'}`}>
                      {item.name}
                    </span>
                  )}
                  {item.id === 'todos' && todoCount > 0 && (
                    expanded ? (
                      <span className="ml-auto min-w-[24px] h-[22px] px-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[12px] font-bold tabular-nums">
                        {todoCount > 99 ? '99+' : todoCount}
                      </span>
                    ) : (
                      <span className="absolute top-2.5 left-8 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" />
                    )
                  )}
                  {item.id === 'ai' && aiBadge && <span className="absolute top-2.5 left-8 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" />}
                </button>
                {/* 홈·AI·할 일과 업무 페이지 사이 구분선 */}
                {item.id === 'todos' && <div className="h-px bg-slate-200 mx-4 my-2.5" />}
              </div>
            );
          })}
        </nav>

        {/* Settings */}
        <div className="p-3 border-t border-slate-200">
          <button
            onClick={() => goTo('settings')}
            aria-current={currentPage === 'settings' ? 'page' : undefined}
            title="설정"
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              currentPage === 'settings' ? NAV_ACCENT.blue.side : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Settings className={`w-5 h-5 shrink-0 ${currentPage === 'settings' ? NAV_ACCENT.blue.icon : 'text-slate-500'}`} />
            {(sidebarOpen || isMobile) && <span className={`text-[16px] ${currentPage === 'settings' ? 'font-semibold' : 'font-medium'}`}>설정</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
          {/* 모바일 메뉴 버튼 */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2.5 hover:bg-slate-100 rounded-lg transition-colors mr-2"
              aria-label="메뉴 열기"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
          )}

          {/* 상단 검색 — 고객·영업 딜·프로젝트를 찾아 상세를 바로 연다 (src/app/components/GlobalSearch.tsx) */}
          <div className="flex items-center flex-1 max-w-2xl">
            <GlobalSearch
              customers={customers}
              deals={deals}
              projects={projects}
              onOpenCustomer={openCustomer}
              onOpenDeal={openDeal}
              onOpenProject={openProject}
            />
          </div>

          <div className="flex items-center gap-2 md:gap-3 ml-2">
            {/* AI 어시스턴트 바로가기 (모바일은 하단 내비에 있음) */}
            <button
              onClick={() => goTo('ai')}
              className={`relative hidden md:inline-flex p-2.5 rounded-xl transition-colors ${currentPage === 'ai' ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
              title="AI 어시스턴트"
              aria-label="AI 어시스턴트"
            >
              <Sparkles className="w-5 h-5 text-blue-500" />
              {aiBadge && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white motion-safe:animate-pulse" />}
            </button>
            {/* 알림 벨 */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setNotificationOpen(!notificationOpen)}
                className="relative p-2.5 hover:bg-slate-100 rounded-xl transition-colors"
                aria-label={unreadCount > 0 ? `알림 ${unreadCount}건` : '알림'}
                aria-expanded={notificationOpen}
                title="알림"
              >
                <Bell className="w-5 h-5 text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 md:top-1.5 right-1 md:right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[11px] font-bold rounded-full ring-2 ring-white px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* 알림 드롭다운 */}
              {notificationOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-800">알림</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        모두 읽음
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-400">알림이 없습니다</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markAsRead(n.id)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                            !n.read ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <div className={`mt-0.5 p-1.5 rounded-lg ${
                            n.type === 'deal_success' ? 'bg-green-100 text-green-600' :
                            n.type === 'customer_registered' ? 'bg-blue-100 text-blue-600' :
                            n.type === 'admin_action' ? 'bg-purple-100 text-purple-600' :
                            n.type === 'ai_reply' ? 'bg-blue-100 text-blue-600' :
                            'bg-amber-100 text-amber-600'
                          }`}>
                            {n.type === 'deal_success' ? <TrendingUp className="w-4 h-4" /> :
                             n.type === 'customer_registered' ? <UserPlus className="w-4 h-4" /> :
                             n.type === 'admin_action' ? <FileEdit className="w-4 h-4" /> :
                             n.type === 'ai_reply' ? <Sparkles className="w-4 h-4" /> :
                             <CalendarClock className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.read ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{n.message}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {n.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!n.read && <span className="mt-2 w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="hidden md:inline text-[15px] text-slate-700 font-medium">{userName}</span>
            <button
              onClick={handleLogout}
              className="p-2.5 hover:bg-red-50 rounded-xl transition-colors group"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-500 transition-colors" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main ref={mainRef} className={`flex-1 overflow-auto bg-slate-50 ${isMobile ? 'pb-20' : ''} ${readable ? 'ux-readable' : ''}`}>
          {currentPage === 'home' && (
            <HomePage
              userName={userName}
              today={today}
              data={homeData}
              openTodos={openTodos}
              todoState={todoState}
              onOpenTodos={() => goTo('todos')}
              onOpenCustomer={openCustomer}
              onOpenDeal={openDeal}
              onOpenProject={openProject}
            />
          )}
          {currentPage === 'todos' && <TodoPage todos={homeData?.todos ?? []} todoState={todoState} loading={!homeData} onOpenCustomer={openCustomer} onOpenDeal={openDeal} />}
          {currentPage === 'customers' && <CustomersPage externalCustomersState={[customers, setCustomers]} subcontractorNames={subcontractors.map(s => s.name)} customerManagerNames={managers.map(m => m.name)} onNotification={handleAdminNotification} onNavigateToProfit={() => setCurrentPage('profit')} onSynced={handleSynced} dealStates={dealStates} openCustomerId={customerFocusId} onCustomerOpened={() => setCustomerFocusId(null)} gradeLocks={gradeLocks} />}
          {currentPage === 'sales' && <SalesPage onDealSuccess={handleDealSuccess} onSynced={handleSynced} linkedDealIds={linkedDealIds} dealCustomerIds={dealCustomerIds} externalDealsState={[deals, setDeals]} externalDateFilterState={[salesDateFilter, setSalesDateFilter]} externalViewState={[salesViewState, setSalesViewState]} customerManagerNames={managers.map(m => m.name)} onNotification={handleAdminNotification} openDealId={dealFocusId} onDealOpened={() => setDealFocusId(null)} />}
          {currentPage === 'supplychain' && <SupplyChainPage externalManagersState={[managers, setManagers]} externalSubcontractorsState={[subcontractors, setSubcontractors]} onNotification={handleAdminNotification} />}
          {currentPage === 'profit' && <ProfitPage externalProjectsState={[projects, setProjects]} externalLaborRatesState={[laborRates, setLaborRates]} customers={customers} subcontractors={subcontractors} onNotification={handleAdminNotification} dealStates={dealStates} openProjectId={projectFocusId} onProjectOpened={() => setProjectFocusId(null)} />}
          {currentPage === 'settings' && (
            <Suspense fallback={<PageSpinner />}>
              <SettingsPage userName={userName} onNotification={handleAdminNotification} />
            </Suspense>
          )}
          {aiMounted && (
            <div className={currentPage === 'ai' ? 'h-full' : 'hidden'}>
              <Suspense fallback={<PageSpinner />}>
                <AiAssistantPage
                  isActive={currentPage === 'ai'}
                  userName={userName}
                  datasets={aiDatasets}
                  loadFreshDatasets={loadFreshDatasets}
                  onStreamingChange={setAiStreaming}
                  onBackgroundReply={handleAiBackgroundReply}
                  onOpenSettings={openSettings}
                  onDataChanged={handleAiDataChanged}
                />
              </Suspense>
            </div>
          )}
        </main>
      </div>

      {/* 모바일 하단 네비게이션 */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-40">
          <div className="grid grid-cols-7 max-w-md mx-auto">
            {bottomNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              const accent = NAV_ACCENT[item.accent];
              return (
                <button
                  key={item.id}
                  onClick={() => goTo(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-col items-center gap-1 px-1 py-2 rounded-xl transition-all ${
                    isActive ? accent.bottom : 'text-slate-500'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? accent.bottom : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-medium truncate max-w-full ${isActive ? accent.bottom : 'text-slate-600'}`}>
                    {item.short}
                  </span>
                  {item.id === 'ai' && aiBadge && <span className="absolute top-1.5 right-1/4 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" />}
                </button>
              );
            })}
            <button
              onClick={() => goTo('settings')}
              aria-current={currentPage === 'settings' ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 px-1 py-2 rounded-xl transition-all ${currentPage === 'settings' ? 'text-blue-600' : 'text-slate-500'}`}
            >
              <Settings className={`w-5 h-5 ${currentPage === 'settings' ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className={`text-[10px] font-medium ${currentPage === 'settings' ? 'text-blue-600' : 'text-slate-600'}`}>설정</span>
            </button>
          </div>
        </nav>
      )}

    </div>
  );
}
