import { useTravelStore } from '@/store/useTravelStore';
import { MapPin, CalendarRange, Plane, Wallet, Luggage, Settings, ChevronLeft } from 'lucide-react';
import type { PageRoute } from '@/types';
import type { ReactNode } from 'react';

const TABS: { key: PageRoute; label: string; icon: typeof MapPin }[] = [
  { key: 'trips', label: '行程', icon: MapPin },
  { key: 'itinerary', label: '日程', icon: CalendarRange },
  { key: 'transports', label: '交通', icon: Plane },
  { key: 'finance', label: '记账', icon: Wallet },
  { key: 'packing', label: '行李', icon: Luggage },
];

const TITLES: Record<PageRoute, string> = {
  trips: '我的行程',
  itinerary: '日程规划',
  transports: '交通住宿',
  finance: '记账',
  packing: '行李备忘',
  settings: '设置',
};

export default function AppShell({ children }: { children: ReactNode }) {
  const currentPage = useTravelStore((s) => s.currentPage);
  const setPage = useTravelStore((s) => s.setPage);
  const trips = useTravelStore((s) => s.trips);
  const currentTripId = useTravelStore((s) => s.currentTripId);
  const currentDayIndex = useTravelStore((s) => s.currentDayIndex);

  const trip = trips.find((t) => t.id === currentTripId);
  const needsTrip = (key: PageRoute) => key !== 'trips' && key !== 'settings';

  // 顶栏标题：日程页显示行程名 + 第几天，其余显示页面标题 + 行程名
  let title = TITLES[currentPage];
  let subtitle: string | undefined;
  if (currentPage === 'itinerary' && trip) {
    title = trip.name;
    const d = trip.days.find((x) => x.dayIndex === currentDayIndex);
    subtitle = d
      ? `第 ${d.dayIndex} 天 · ${new Date(d.date + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`
      : undefined;
  } else if (currentPage !== 'trips' && trip) {
    subtitle = trip.name;
  }

  const go = (key: PageRoute) => {
    if (needsTrip(key) && !currentTripId) {
      setPage('trips');
      return;
    }
    setPage(key);
  };

  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:overflow-hidden">
      {/* ============ 桌面端侧边栏 ============ */}
      <aside
        className="hidden lg:flex lg:flex-col lg:h-screen lg:shrink-0 no-print"
        style={{ width: 208, background: 'var(--surface)' }}
      >
        <div className="px-4 h-[61px] flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <MapPin size={15} style={{ color: 'var(--ink)' }} strokeWidth={2.4} />
          </div>
          <span className="text-[15px] tracking-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            旅行管家
          </span>
        </div>

        <nav className="flex-1 px-2.5 pt-1 space-y-0.5 overflow-y-auto">
          {TABS.map((item) => {
            const active = currentPage === item.key;
            const disabled = needsTrip(item.key) && !currentTripId;
            return (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                disabled={disabled}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm transition-colors duration-150"
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: active ? 600 : 400,
                  opacity: disabled ? 0.35 : 1,
                }}
              >
                <item.icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                <span>{TITLES[item.key]}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-2.5">
          <button
            onClick={() => setPage('settings')}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm transition-colors duration-150"
            style={{
              background: currentPage === 'settings' ? 'var(--accent)' : 'transparent',
              color: currentPage === 'settings' ? 'var(--ink)' : 'var(--ink-2)',
              fontWeight: currentPage === 'settings' ? 600 : 400,
            }}
          >
            <Settings size={17} />
            <span>设置</span>
          </button>
        </div>
      </aside>

      {/* ============ 移动端顶栏 ============ */}
      <header className="lg:hidden sticky top-0 z-30 mobile-topbar no-print">
        <div className="px-4 flex items-center gap-2">
          {currentPage !== 'trips' && (
            <button className="-ml-1.5 btn-icon" onClick={() => setPage('trips')} aria-label="返回">
              <ChevronLeft size={19} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] leading-tight truncate" style={{ fontWeight: 600 }}>{title}</h1>
            {subtitle && (
              <p className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
            )}
          </div>
          <button className="btn-icon" onClick={() => setPage('settings')} aria-label="设置">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* ============ 内容区 ============ */}
      <main className="flex-1 min-w-0 lg:h-screen lg:overflow-y-auto mobile-content">
        {children}
      </main>

      {/* ============ 移动端底部标签栏 ============ */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 mobile-tabbar no-print">
        <div className="flex items-stretch">
          {TABS.map((tab) => {
            const active = currentPage === tab.key;
            const disabled = needsTrip(tab.key) && !currentTripId;
            return (
              <button
                key={tab.key}
                onClick={() => go(tab.key)}
                disabled={disabled}
                className={`tab-item flex-1 flex flex-col items-center justify-center gap-1 py-2 ${active ? 'active' : ''}`}
                style={{ opacity: disabled ? 0.3 : 1 }}
              >
                <span className="relative flex items-center justify-center" style={{ width: 22, height: 22 }}>
                  <tab.icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                </span>
                <span className="text-[10px] leading-none" style={{ fontWeight: active ? 600 : 400 }}>{tab.label}</span>
                {active && (
                  <span
                    className="absolute top-0 rounded-b-full"
                    style={{ width: 20, height: 2.5, background: 'var(--accent)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
