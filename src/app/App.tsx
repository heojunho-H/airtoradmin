import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Users, TrendingUp, Settings, Menu, X, Bell, Search, Package, LogOut, CheckCheck, AlertCircle, UserPlus, CalendarClock, FileEdit, Sparkles } from 'lucide-react';
import { CustomersPage, fetchCustomers } from './components/CustomersPage';
import { SalesPage, fetchDeals } from './components/SalesPage';
import { SupplyChainPage, fetchManagers, fetchSubcontractors } from './components/SupplyChainPage';
import { AiChatPanel } from './components/AiChatPanel';

// Deal 데이터를 Customer 형식으로 변환
function convertDealToCustomer(deal: any) {
  const today = new Date().toISOString().split('T')[0];
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 30);

  // 견적금액 문자열을 숫자로 변환 (예: "₩12,500만" → 125000000)
  const parseAmount = (str: string): number => {
    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (str.includes('억')) return num * 100000000;
    if (str.includes('만')) return num * 10000;
    return num || 0;
  };

  return {
    id: Date.now(),
    company: deal.company,
    grade: 'B' as const,
    customerStatus: '신규' as const,
    contactName: deal.contactName,
    contactPosition: deal.contactPosition,
    deals: 1,
    lastWorkDate: deal.confirmedWorkDate || today,
    totalQuantity: deal.totalQuantity,
    totalAmount: parseAmount(deal.quotationAmount),
    managementCycle: 30,
    nextManagementDate: nextDate.toISOString().split('T')[0],
    reminderStatus: '미발송' as const,
    accountManager: deal.salesManager,
    phone: deal.phone,
    email: deal.email,
    address: deal.address,
    detailedQuantity: deal.detailedQuantity
      ? [{ item: deal.desiredService, quantity: deal.totalQuantity }]
      : [],
    workHistory: [{
      inquiryDate: deal.registrationDate,
      projectName: deal.desiredService,
      totalQuantity: deal.totalQuantity,
      detailedQuantity: deal.detailedQuantity || '',
      quotationAmount: parseAmount(deal.quotationAmount),
      accountManager: deal.salesManager,
      workDate: deal.confirmedWorkDate || today,
      subcontractorManager: '',
      reportSent: false,
      reminder1: false,
      reminder2: false,
      reminder3: false,
    }],
    fieldManager: '',
    emailHistory: [],
    internalNotes: [{
      id: 1,
      author: deal.salesManager,
      date: today,
      content: `영업관리에서 자동 등록됨. 요구사항: ${deal.requirements || '없음'}`,
    }],
    memo: deal.managementMemo || '',
  };
}

export default function App() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('user_name') || '';
  const [currentPage, setCurrentPage] = useState<'customers' | 'sales' | 'supplychain'>('sales');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [newCustomerFromDeal, setNewCustomerFromDeal] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [subcontractors, setSubcontractors] = useState<any[]>([]);

  // DB에서 데이터 로드
  useEffect(() => {
    fetchDeals()
      .then((data) => setDeals(data))
      .catch((err) => console.error('딜 데이터 로드 실패:', err));
    fetchCustomers()
      .then((data) => setCustomers(data))
      .catch((err) => console.error('고객 데이터 로드 실패:', err));
    fetchManagers()
      .then((data) => setManagers(data))
      .catch((err) => console.error('고객책임자 데이터 로드 실패:', err));
    fetchSubcontractors()
      .then((data) => setSubcontractors(data))
      .catch((err) => console.error('작업팀장 데이터 로드 실패:', err));
  }, []);

  // 알림 시스템
  type Notification = {
    id: number;
    type: 'deal_success' | 'customer_registered' | 'management_due' | 'admin_action';
    message: string;
    timestamp: Date;
    read: boolean;
  };
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
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

  const handleLogout = () => {
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_id');
    navigate('/login');
  };

  // 영업에서 성공한 딜을 고객으로 변환
  const handleDealSuccess = (deal: any) => {
    const customer = convertDealToCustomer(deal);
    setNewCustomerFromDeal(customer);
    addNotification('deal_success', `[${deal.company}] 딜이 수주확정되었습니다`);
    addNotification('customer_registered', `[${deal.company}] 고객이 자동 등록되었습니다`);
  };

  // 고객관리 작업이력 → 공급망관리 고객책임자 작업히스토리 동기화
  useEffect(() => {
    setManagers((prevManagers) =>
      prevManagers.map((manager) => {
        const activitiesFromCustomers: typeof manager.recentActivities = [];
        customers.forEach((customer) => {
          customer.workHistory
            .filter((work: any) => work.accountManager === manager.name)
            .forEach((work: any) => {
              activitiesFromCustomers.push({
                inquiryDate: work.inquiryDate,
                customerCompany: customer.company,
                projectName: work.projectName,
                totalQuantity: work.totalQuantity,
                detailQuantity: work.detailedQuantity,
                estimateAmount: work.quotationAmount,
                customerManager: work.accountManager,
                workDate: work.workDate,
                subcontractor: work.subcontractorManager,
              });
            });
        });
        // 날짜 내림차순 정렬
        activitiesFromCustomers.sort((a, b) => b.inquiryDate.localeCompare(a.inquiryDate));
        return { ...manager, recentActivities: activitiesFromCustomers };
      })
    );
  }, [customers]);

  // 고객관리 작업이력 → 공급망관리 작업팀장(하청) 작업히스토리 동기화
  useEffect(() => {
    setSubcontractors((prevSubs) =>
      prevSubs.map((sub) => {
        // 기존 평가 데이터를 키로 보존 (projectName + customerCompany + workDate)
        const existingEvalMap = new Map<string, any>();
        sub.recentActivities.forEach((act) => {
          const key = `${act.projectName}|${act.customerCompany}|${act.workDate}`;
          existingEvalMap.set(key, {
            workEvaluation: act.workEvaluation,
            workEvaluationScore: act.workEvaluationScore,
            evalCustomerClaim: act.evalCustomerClaim,
            evalAllDevices: act.evalAllDevices,
            evalOnTime: act.evalOnTime,
            evalAfterService: act.evalAfterService,
            evalUniform: act.evalUniform,
            evalKindness: act.evalKindness,
          });
        });

        const activitiesFromCustomers: typeof sub.recentActivities = [];
        customers.forEach((customer) => {
          customer.workHistory
            .filter((work: any) => {
              const managers = work.subcontractorManager
                ? work.subcontractorManager.split(', ').map((s: string) => s.trim())
                : [];
              return managers.includes(sub.name);
            })
            .forEach((work: any) => {
              const key = `${work.projectName}|${customer.company}|${work.workDate}`;
              const existingEval = existingEvalMap.get(key) || {};
              activitiesFromCustomers.push({
                inquiryDate: work.inquiryDate,
                customerCompany: customer.company,
                projectName: work.projectName,
                totalQuantity: work.totalQuantity,
                detailQuantity: work.detailedQuantity,
                estimateAmount: work.quotationAmount,
                customerManager: work.accountManager,
                workDate: work.workDate,
                subcontractor: sub.name,
                workEvaluation: existingEval.workEvaluation || '',
                workEvaluationScore: existingEval.workEvaluationScore || 0,
                evalCustomerClaim: existingEval.evalCustomerClaim,
                evalAllDevices: existingEval.evalAllDevices,
                evalOnTime: existingEval.evalOnTime,
                evalAfterService: existingEval.evalAfterService,
                evalUniform: existingEval.evalUniform,
                evalKindness: existingEval.evalKindness,
              });
            });
        });
        activitiesFromCustomers.sort((a, b) => b.inquiryDate.localeCompare(a.inquiryDate));
        return { ...sub, recentActivities: activitiesFromCustomers };
      })
    );
  }, [customers]);

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

  const navigation = [
    { id: 'sales' as const, name: '영업 관리', icon: TrendingUp },
    { id: 'customers' as const, name: '고객 관리', icon: Users },
    { id: 'supplychain' as const, name: '공급망 관리', icon: Package },
  ];

  return (
    <div className="h-screen flex flex-col md:flex-row bg-slate-50">
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
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
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
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentPage(item.id);
                  if (isMobile) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-slate-500'}`} />
                {(sidebarOpen || isMobile) && (
                  <span className={`text-[15px] font-medium ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                    {item.name}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Settings */}
        <div className="p-3 border-t border-slate-200">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors">
            <Settings className="w-5 h-5 text-slate-500" />
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
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors mr-2"
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
            {/* AI 비서 */}
            <button
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className="p-2 md:p-2.5 hover:bg-purple-50 rounded-xl transition-colors"
              title="AI 비서"
            >
              <Sparkles className="w-5 h-5 text-purple-500" />
            </button>
            {/* 알림 벨 */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setNotificationOpen(!notificationOpen)}
                className="relative p-2 md:p-2.5 hover:bg-slate-50 rounded-xl transition-colors"
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
                            'bg-amber-100 text-amber-600'
                          }`}>
                            {n.type === 'deal_success' ? <TrendingUp className="w-4 h-4" /> :
                             n.type === 'customer_registered' ? <UserPlus className="w-4 h-4" /> :
                             n.type === 'admin_action' ? <FileEdit className="w-4 h-4" /> :
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
              className="p-2 md:p-2.5 hover:bg-red-50 rounded-xl transition-colors group"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-500 transition-colors" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className={`flex-1 overflow-auto bg-slate-50 ${isMobile ? 'pb-16' : ''}`}>
          {currentPage === 'customers' && <CustomersPage newCustomerFromDeal={newCustomerFromDeal} externalCustomersState={[customers, setCustomers]} subcontractorNames={subcontractors.map(s => s.name)} customerManagerNames={managers.map(m => m.name)} onNotification={handleAdminNotification} />}
          {currentPage === 'sales' && <SalesPage onDealSuccess={handleDealSuccess} externalDealsState={[deals, setDeals]} customerManagerNames={managers.map(m => m.name)} onNotification={handleAdminNotification} />}
          {currentPage === 'supplychain' && <SupplyChainPage externalManagersState={[managers, setManagers]} externalSubcontractorsState={[subcontractors, setSubcontractors]} onNotification={handleAdminNotification} />}
        </main>
      </div>

      {/* 모바일 하단 네비게이션 */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 z-40 safe-area-bottom">
          <div className="flex items-center justify-around max-w-md mx-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                    isActive ? 'text-blue-600' : 'text-slate-500'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-medium ${isActive ? 'text-blue-600' : 'text-slate-600'}`}>
                    {item.name.replace(' 관리', '')}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all text-slate-500"
            >
              <Settings className="w-5 h-5 text-slate-400" />
              <span className="text-[10px] font-medium text-slate-600">설정</span>
            </button>
          </div>
        </nav>
      )}

      {/* AI 채팅 패널 */}
      <AiChatPanel
        isOpen={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        deals={deals}
        customers={customers}
        managers={managers}
        subcontractors={subcontractors}
      />
    </div>
  );
}
