import React, { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';

interface LayoutProps {
  children: React.ReactNode;
  manualAccessCheck?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, manualAccessCheck }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col overflow-x-hidden">
      <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} manualAccessCheck={manualAccessCheck} />
      
      <div className="flex flex-1 w-full pt-14">
        <Sidebar isOpen={sidebarOpen} />
        <main className={`flex-1 p-4 pb-24 md:pb-6 md:p-6 transition-all duration-300 overflow-x-auto ${
          sidebarOpen ? 'md:ml-64' : 'md:ml-16'
        }`}>
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Layout;
