import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { Users, TrendingUp, Settings, Menu, X, Bell, Search, Package, Calculator, LogOut, CheckCheck, AlertCircle, UserPlus, CalendarClock, FileEdit, Sparkles } from 'lucide-react';
import { CustomersPage, fetchCustomers } from './components/CustomersPage';
import { SalesPage, fetchDeals, type SalesViewState } from './components/SalesPage';
import { SupplyChainPage, fetchManagers, fetchSubcontractors, updateManager, updateSubcontractor } from './components/SupplyChainPage';
import { ProfitPage, fetchProjects, fetchLaborRates, type Project, type LaborRate } from './components/ProfitPage';
import type { AiDatasets } from '../lib/ai/types';
import type { IntakeDataChange } from './components/ai/QuoteIntakePanel';
import { buildDealStateMap, currentWriteEpoch, hasSynced, linkedDealId, type SyncResult } from '../lib/dealSync';
import { managerActivities, sameActivities, subcontractorActivities } from '../lib/activitySync';

// AI 어시스턴트·설정은 첫 방문 때 내려받는다 (마크다운 렌더러 포함 별도 청크)
const AiAssistantPage = lazy(() => import('./components/ai/AiAssistantPage'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));

type PageId = 'sales' | 'ai' | 'profit' | 'customers' | 'supplychain' | 'settings';

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
  const [currentPage, setCurrentPage] = useState<PageId>('sales');
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

  // 관리 주기 도래 알림 (앱 로드 시 1회)
  useEffect(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const oneMonthLaterStr = oneMonthLater.toISOString().split('T')[0];

    customers.forEach((customer: any) => {
      if (!customer.nextManagementDate) return;
      if (customer.nextManagementDate === todayStr) {
        addNotification('management_due', `[${customer.company}] 오늘 관리 주기 도래일입니다`);
      } else if (customer.nextManagementDate > todayStr && customer.nextManagementDate <= oneMonthLaterStr) {
        addNotification('management_due', `[${customer.company}] 관리 주기가 1개월 이내 도래 예정입니다 (${customer.nextManagementDate})`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if ((page === 'sales' || page === 'profit' || page === 'customers') && lastLoadedRef.current && Date.now() - lastLoadedRef.current > 20_000) {
      refreshAll();
    }
    setCurrentPage(page);
    if (isMobile) setSidebarOpen(false);
  };
  const openSettings = useCallback(() => setCurrentPage('settings'), []);

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
    { id: 'sales', name: '영업 관리', short: '영업', icon: TrendingUp, accent: 'blue' },
    { id: 'ai', name: 'AI 어시스턴트', short: 'AI', icon: Sparkles, accent: 'blue' },
    { id: 'profit', name: '프로젝트 관리', short: '프로젝트', icon: Calculator, accent: 'blue' },
    { id: 'customers', name: '고객 관리', short: '고객', icon: Users, accent: 'blue' },
    { id: 'supplychain', name: '공급망 관리', short: '공급망', icon: Package, accent: 'blue' },
  ];
  const aiBadge = currentPage !== 'ai' && (aiStreaming || aiUnread);

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
        <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 md:px-6">
          {(sidebarOpen || isMobile) && (
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-semibold text-slate-900 tracking-tight">AIRTOR System</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {sidebarOpen ? (
              <X className="w-5 h-5 text-slate-600" />
            ) : (
              <Menu className="w-5 h-5 text-slate-600" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const accent = NAV_ACCENT[item.accent];
            return (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={item.name}
                className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? accent.side
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? accent.icon : 'text-slate-500'}`} />
                {(sidebarOpen || isMobile) && (
                  <span className={`text-[15px] font-medium ${isActive ? accent.text : 'text-slate-700'}`}>
                    {item.name}
                  </span>
                )}
                {item.id === 'ai' && aiBadge && <span className="absolute top-2.5 left-8 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" />}
              </button>
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
              currentPage === 'settings' ? NAV_ACCENT.blue.side : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Settings className={`w-5 h-5 ${currentPage === 'settings' ? NAV_ACCENT.blue.icon : 'text-slate-500'}`} />
            {(sidebarOpen || isMobile) && <span className="text-[15px] font-medium">설정</span>}
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
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
          )}

          <div className="flex items-center flex-1 max-w-2xl">
            <div className="relative w-full">
              <Search className="absolute left-3 md:left-3.5 top-1/2 -translate-y-1/2 w-4 md:w-[18px] h-4 md:h-[18px] text-slate-400" />
              <input
                type="text"
                placeholder="검색..."
                className="w-full pl-9 md:pl-11 pr-4 py-2 md:py-2.5 text-[14px] md:text-[15px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
              />
            </div>
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
                className="relative p-2.5 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <Bell className="w-5 h-5 text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 md:top-1.5 right-1 md:right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full ring-2 ring-white px-1">
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
            <span className="hidden md:inline text-sm text-slate-600 font-medium">{userName}</span>
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
        <main className={`flex-1 overflow-auto bg-slate-50 ${isMobile ? 'pb-16' : ''}`}>
          {currentPage === 'customers' && <CustomersPage externalCustomersState={[customers, setCustomers]} subcontractorNames={subcontractors.map(s => s.name)} customerManagerNames={managers.map(m => m.name)} onNotification={handleAdminNotification} onNavigateToProfit={() => setCurrentPage('profit')} onSynced={handleSynced} dealStates={dealStates} />}
          {currentPage === 'sales' && <SalesPage onDealSuccess={handleDealSuccess} onSynced={handleSynced} linkedDealIds={linkedDealIds} dealCustomerIds={dealCustomerIds} externalDealsState={[deals, setDeals]} externalDateFilterState={[salesDateFilter, setSalesDateFilter]} externalViewState={[salesViewState, setSalesViewState]} customerManagerNames={managers.map(m => m.name)} onNotification={handleAdminNotification} />}
          {currentPage === 'supplychain' && <SupplyChainPage externalManagersState={[managers, setManagers]} externalSubcontractorsState={[subcontractors, setSubcontractors]} onNotification={handleAdminNotification} />}
          {currentPage === 'profit' && <ProfitPage externalProjectsState={[projects, setProjects]} externalLaborRatesState={[laborRates, setLaborRates]} customers={customers} subcontractors={subcontractors} onNotification={handleAdminNotification} dealStates={dealStates} />}
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
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 z-40 safe-area-bottom">
          <div className="grid grid-cols-6 max-w-md mx-auto">
            {navigation.map((item) => {
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
