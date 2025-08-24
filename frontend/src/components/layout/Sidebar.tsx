import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/redux';
import { canManageEmployees } from '../../utils/permissions';
import {
  Users,
  Package,
  UserCheck,
  FileText,
  Truck,
  CreditCard,
  BarChart3,
  Home,
  Tags,
  Activity,
  Upload,
  Percent,
  ClipboardList,
  Wallet,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const { user } = useAuth();

  const navigation = [
    {
      name: 'Tableau de bord',
      href: '/dashboard',
      icon: Home,
      show: true,
    },
    {
      name: 'Remises',
      href: '/remises',
      icon: Percent,
      show: true,
    },
    {
      name: 'Catégories',
      href: '/categories',
      icon: Tags,
      show: true,
    },
    {
      name: 'Employés',
      href: '/employees',
      icon: Users,
      show: canManageEmployees(user),
    },
    {
      name: 'Stock',
      href: '/stock',
      icon: Package,
      show: true,
    },
    {
      name: 'Contacts',
      href: '/contacts',
      icon: UserCheck,
      show: true,
    },
    {
      name: 'Bons',
      href: '/bons',
      icon: FileText,
      show: true,
    },
    {
      name: 'Véhicules',
      href: '/vehicules',
      icon: Truck,
      show: true,
    },
    {
      name: 'Talons',
      href: '/talons',
      icon: ClipboardList,
      show: true,
    },
    {
      name: 'Talon Caisse',
      href: '/talon-caisse',
      icon: Wallet,
      show: true,
    },
    {
      name: 'Caisse',
      href: '/caisse',
      icon: CreditCard,
      show: true,
    },
    {
      name: 'Rapports',
      href: '/reports',
      icon: BarChart3,
      show: user?.role === 'PDG',
    },
    {
      name: 'Stats détaillées',
      href: '/reports/details',
      icon: Activity,
      show: user?.role === 'PDG',
    },
    {
      name: 'Import Excel',
      href: '/import',
      icon: Upload,
      show: user?.role !== undefined,
    },
  ];

  return (
    <aside
      className={`sidebar transition-all duration-300 ease-in-out ${
        isOpen ? 'w-64' : 'w-16'
      }`}
    >
      <nav className="p-4 space-y-2">
        {navigation
          .filter((item) => item.show)
          .map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-700 border-r-2 border-primary-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {isOpen && (
                <span className="ml-3 truncate">{item.name}</span>
              )}
            </NavLink>
          ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
