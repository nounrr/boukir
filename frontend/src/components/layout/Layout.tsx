import React, { useEffect, useState } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import StockQuickSearch from '../StockQuickSearch';
import PlafondQuickAuthorization from '../PlafondQuickAuthorization';

interface LayoutProps {
  children: React.ReactNode;
  manualAccessCheck?: () => void;
  tabletCompact?: boolean;
}

const readFlag = (key: string, fallback: boolean) => {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value === '1';
  } catch {
    return fallback;
  }
};
const writeFlag = (key: string, value: boolean) => {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* stockage indisponible */ }
};

const Layout: React.FC<LayoutProps> = ({ children, manualAccessCheck, tabletCompact = false }) => {
  // Menu latéral : ouvert (large), réduit (icônes) ou masqué. Le choix est mémorisé.
  const [sidebarOpen, setSidebarOpen] = useState(() => readFlag('layout.sidebarOpen', true));
  const [sidebarHidden, setSidebarHidden] = useState(() => readFlag('layout.sidebarHidden', false));
  useEffect(() => writeFlag('layout.sidebarOpen', sidebarOpen), [sidebarOpen]);
  useEffect(() => writeFlag('layout.sidebarHidden', sidebarHidden), [sidebarHidden]);

  const toggleSidebar = () => {
    if (sidebarHidden) {
      setSidebarHidden(false);
      setSidebarOpen(true);
      return;
    }
    setSidebarOpen(!sidebarOpen);
  };

  // Classes écrites en entier pour que Tailwind les génère.
  const margin = tabletCompact
    ? (sidebarHidden ? 'lg:ml-0' : sidebarOpen ? 'lg:ml-64' : 'lg:ml-16')
    : (sidebarHidden ? 'md:ml-0' : sidebarOpen ? 'md:ml-64' : 'md:ml-16');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col overflow-x-hidden">
      <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen && !sidebarHidden} manualAccessCheck={manualAccessCheck} />

      <div className="flex flex-1 w-full pt-14">
        {!sidebarHidden && (
          <Sidebar
            isOpen={sidebarOpen}
            tabletCompact={tabletCompact}
            onToggle={() => setSidebarOpen((open) => !open)}
            onHide={() => setSidebarHidden(true)}
          />
        )}
        {sidebarHidden && (
          <button
            type="button"
            onClick={() => { setSidebarHidden(false); setSidebarOpen(true); }}
            className={`${tabletCompact ? 'hidden lg:flex' : 'hidden md:flex'} fixed left-0 top-20 z-30 flex-col items-center gap-1 rounded-r-2xl bg-gradient-to-b from-primary-600 to-indigo-600 px-2 py-3 text-white shadow-lg transition hover:pl-3`}
            title="Afficher le menu"
            aria-label="Afficher le menu"
          >
            <PanelLeftOpen size={18} />
            <span className="text-[10px] font-bold [writing-mode:vertical-rl] rotate-180">Menu</span>
          </button>
        )}
        <main className={`flex-1 p-4 pb-24 md:p-6 transition-all duration-300 overflow-x-auto ${margin} ${tabletCompact ? 'lg:pb-6' : 'md:pb-6'}`}>
          {children}
        </main>
      </div>
      <StockQuickSearch />
      <PlafondQuickAuthorization />
      <MobileBottomNav tabletCompact={tabletCompact} />
    </div>
  );
};

export default Layout;
