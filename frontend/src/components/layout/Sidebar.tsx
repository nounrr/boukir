import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/redux';
import { canManageEmployees } from '../../utils/permissions';
import {
  Users,
  Package,
  Languages,
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
  Archive,
  CalendarClock,
  Award,
  Image,
  Settings,
  ShieldCheck,
  BadgeDollarSign,
  FolderTree,
  Warehouse,
  Camera,
  FileCheck2,
  TrendingDown,
  CircleDollarSign,
  HardHat,
  Wrench,
  Download,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  tabletCompact?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, tabletCompact = false }) => {
  const { user } = useAuth();
  const isChefChauffeur = user?.role === 'ChefChauffeur';

  // Grouped navigation for desktop sidebar (mobile uses bottom nav)
  const groups: { title: string; items: { name: string; href: string; icon: any; show: boolean }[] }[] = [
    {
      title: 'Général',
      items: [
        { name: 'Tableau de bord', href: '/dashboard', icon: Home, show: !isChefChauffeur },
        { name: 'Mes Informations', href: '/employee/self', icon: Users, show: !isChefChauffeur && user?.role === 'Employé' },
      ],
    },
    {
      title: 'Tiers',
      items: [
        { name: 'Contacts', href: '/contacts', icon: UserCheck, show: !isChefChauffeur && user?.role !== 'Employé' },
        { name: 'Clients', href: '/clients', icon: Users, show: !isChefChauffeur && user?.role !== 'Employé' },
        { name: 'Fournisseurs', href: '/fournisseurs', icon: Users, show: !isChefChauffeur && user?.role !== 'Employé' },
        { name: 'Charges', href: '/charges', icon: Users, show: user?.role === 'PDG' },
        { name: 'Garanties', href: '/garanties', icon: ShieldCheck, show: user?.role === 'PDG' },
        { name: 'Contacts Archivés', href: '/contacts-archiver', icon: Archive, show: !isChefChauffeur && user?.role !== 'Employé' },
      ],
    },
    {
      title: 'Catalogue',
      items: [
        { name: 'Stock', href: '/stock', icon: Package, show: !isChefChauffeur },
        { name: 'Stock dépôt 2', href: '/stock-depot-2', icon: Warehouse, show: !isChefChauffeur },
        { name: 'Stock faible rotation', href: '/slow-moving-stock', icon: TrendingDown, show: user?.role === 'PDG' },
        { name: 'Inventaire', href: '/inventaire', icon: ClipboardList, show: !isChefChauffeur && user?.role !== undefined },
        { name: 'Catégories', href: '/categories', icon: Tags, show: !isChefChauffeur },
        { name: 'Marques', href: '/brands', icon: Award, show: !isChefChauffeur },
        { name: 'Produits archivés', href: '/products/archived', icon: Package, show: !isChefChauffeur && user?.role === 'PDG' },
      ],
    },
    {
      title: 'Fiches produits',
      items: [
        { name: 'Photos Produits', href: '/product-photos', icon: Camera, show: !isChefChauffeur },
        { name: 'Produits Translate', href: '/products/translate', icon: Languages, show: !isChefChauffeur },
        { name: 'Correction noms', href: '/products/name-corrections', icon: FileCheck2, show: !isChefChauffeur },
        { name: 'Correction prix ventes', href: '/products/sale-price-corrections', icon: CircleDollarSign, show: user?.role === 'PDG' },
        { name: 'Solver prix achat', href: '/solver-prix-achat', icon: BadgeDollarSign, show: user?.role !== 'Chauffeur' },
        { name: 'Solver catégorie', href: '/solver-categorie', icon: FolderTree, show: !isChefChauffeur },
      ],
    },
    {
      title: 'Ventes',
      items: [
        { name: 'Bons', href: '/bons', icon: FileText, show: true },
        { name: 'Remises', href: '/remises', icon: Percent, show: !isChefChauffeur },
        { name: 'Véhicules', href: '/vehicules', icon: Truck, show: isChefChauffeur || user?.role === 'PDG' || user?.role === 'Manager' || user?.role === 'ManagerPlus' },
      ],
    },
    {
      title: 'Trésorerie',
      items: [
        { name: 'Caisse', href: '/caisse', icon: CreditCard, show: !isChefChauffeur },
        { name: 'Fond de caisse', href: '/fond-caisse', icon: Wallet, show: user?.role === 'PDG' },
        { name: 'Talons', href: '/talons', icon: ClipboardList, show: !isChefChauffeur && (user?.role === 'PDG' || user?.role === 'ManagerPlus') },
        { name: 'Talon Caisse', href: '/talon-caisse', icon: Wallet, show: !isChefChauffeur && (user?.role === 'PDG' || user?.role === 'ManagerPlus') },
      ],
    },
    {
      title: 'Maalems & Services',
      items: [
        { name: 'Maalems', href: '/maalems', icon: HardHat, show: user?.role === 'PDG' },
        { name: 'Catégories Maalem', href: '/maalem-categories', icon: Tags, show: user?.role === 'PDG' },
        { name: 'Catalogue des services', href: '/services', icon: Wrench, show: user?.role === 'PDG' },
      ],
    },
    {
      title: 'E-commerce',
      items: [
        { name: 'Promo codes', href: '/promo-codes', icon: Percent, show: !isChefChauffeur && (user?.role === 'PDG' || user?.role === 'Manager' || user?.role === 'ManagerPlus') },
        { name: 'Hero Slides', href: '/hero-slides', icon: Image, show: !isChefChauffeur && (user?.role === 'PDG' || user?.role === 'Manager' || user?.role === 'ManagerPlus') },
      ],
    },
    {
      title: 'Ressources humaines',
      items: [
        { name: 'Employés', href: '/employees', icon: Users, show: !isChefChauffeur && canManageEmployees(user) },
        { name: 'Employés archivés', href: '/employees/archive', icon: Archive, show: !isChefChauffeur && user?.role === 'PDG' },
        { name: 'Salaires', href: '/salaires', icon: Wallet, show: user?.role === 'PDG' },
        { name: "Horaires d'Accès", href: '/access-schedules', icon: CalendarClock, show: !isChefChauffeur && user?.role === 'PDG' },
        { name: 'Accès commentaires & rappels', href: '/employees/client-collaboration-permissions', icon: UserCheck, show: user?.role === 'PDG' },
      ],
    },
    {
      title: 'Rapports',
      items: [
        { name: 'Rapports', href: '/reports', icon: BarChart3, show: !isChefChauffeur && user?.role === 'PDG' },
        { name: 'Stats détaillées', href: '/reports/details', icon: Activity, show: !isChefChauffeur && user?.role === 'PDG' },
        { name: "Chiffre d'affaires", href: '/chiffre-affaires', icon: BarChart3, show: !isChefChauffeur && user?.role === 'PDG' },
        { name: 'Audit', href: '/audit', icon: Activity, show: !isChefChauffeur && user?.role === 'PDG' },
      ],
    },
    {
      title: 'Outils',
      items: [
        { name: 'Import Excel', href: '/import', icon: Upload, show: !isChefChauffeur && user?.role !== undefined },
        { name: 'Export produits', href: '/export/products', icon: Download, show: !isChefChauffeur && user?.role !== undefined },
        { name: 'Export contacts', href: '/export/contacts', icon: Download, show: !isChefChauffeur && user?.role !== 'Employé' },
        { name: 'Paramètres UI', href: '/settings/ui', icon: Settings, show: !isChefChauffeur && user?.role === 'PDG' },
      ],
    },
  ];

  return (
    <aside
      className={`${tabletCompact ? 'hidden lg:block' : 'hidden md:block'} fixed top-14 left-0 z-30 bg-white border-r border-gray-200 transition-all duration-300 ease-in-out ${
        isOpen ? 'w-64' : 'w-16'
      }`}
      style={{ height: 'calc(100vh - 56px)' }}
    >
      <nav className="p-3 space-y-4 h-full overflow-y-auto">
        {groups.map(group => {
          const visible = group.items.filter(i => i.show);
          if (!visible.length) return null;
          return (
            <div key={group.title} className="space-y-1">
              {isOpen && (
                <div className="px-2 text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                  {group.title}
                </div>
              )}
              {visible.map(item => (
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
                  {isOpen && <span className="ml-3 truncate">{item.name}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
