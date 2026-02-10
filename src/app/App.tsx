import { useState, useEffect } from 'react';
import { Users, TrendingUp, Settings, Menu, X, Bell, Search, ChevronDown, Package } from 'lucide-react';
import { CustomersPage } from './components/CustomersPage';
import { SalesPage } from './components/SalesPage';
import { SupplyChainPage } from './components/SupplyChainPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'customers' | 'sales' | 'supplychain'>('sales');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

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
            <button className="relative p-2 md:p-2.5 hover:bg-slate-50 rounded-xl transition-colors">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className="absolute top-1.5 md:top-2 right-1.5 md:right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className={`flex-1 overflow-auto bg-slate-50 ${isMobile ? 'pb-16' : ''}`}>
          {currentPage === 'customers' && <CustomersPage />}
          {currentPage === 'sales' && <SalesPage />}
          {currentPage === 'supplychain' && <SupplyChainPage />}
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
    </div>
  );
}