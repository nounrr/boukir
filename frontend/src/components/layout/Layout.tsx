import React, { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';

interface LayoutProps {
  children: React.ReactNode;
  manualAccessCheck?: () => void;
  tabletCompact?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, manualAccessCheck, tabletCompact = false }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col overflow-x-hidden">
      <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} manualAccessCheck={manualAccessCheck} />
      
      <div className="flex flex-1 w-full pt-14">
        <Sidebar isOpen={sidebarOpen} tabletCompact={tabletCompact} />
        <main className={`flex-1 p-4 pb-24 md:p-6 transition-all duration-300 overflow-x-auto ${
          tabletCompact
            ? `${sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'} lg:pb-6`
            : `${sidebarOpen ? 'md:ml-64' : 'md:ml-16'} md:pb-6`
        }`}>
          {children}
        </main>
      </div>
      <MobileBottomNav tabletCompact={tabletCompact} />
    </div>
  );
};

export default Layout;
