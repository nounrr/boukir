import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Package,
  FileText,
  Users,
  BarChart3,
  X,
  DollarSign,
} from 'lucide-react';
import { useAuth } from '../../hooks/redux';
import { canManageEmployees } from '../../utils/permissions';

// Bottom navigation bar (mobile). Groups pages: one icon per group; tap shows group's pages.
const MobileBottomNav: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const groups = [
    {
      key: 'general', label: 'Général', icon: Home,
      items: [
        { name: 'Accueil', to: '/dashboard', show: true },
      ],
    },
    {
      key: 'produits', label: 'Produits', icon: Package,
      items: [
        { name: 'Stock', to: '/stock', show: true },
        { name: 'Catégories', to: '/categories', show: true },
        { name: 'Produits archivés', to: '/products/archived', show: user?.role === 'PDG' },
      ],
    },
    {
      key: 'bons', label: 'Bons', icon: FileText,
      items: [
        { name: 'Bons', to: '/bons', show: true },
        { name: 'Véhicules', to: '/vehicules', show: true },
        { name: 'Remises', to: '/remises', show: true },
      ],
    },
    {
      key: 'caisse', label: 'Caisse', icon: DollarSign,
      items: [
        { name: 'Caisse', to: '/caisse', show: true },
  { name: 'Talons', to: '/talons', show: user?.role === 'PDG' || user?.role === 'Manager' || user?.role === 'ManagerPlus' },
  { name: 'Talon Caisse', to: '/talon-caisse', show: user?.role === 'PDG' || user?.role === 'Manager' || user?.role === 'ManagerPlus' },
      ],
    },
    {
      key: 'rapports', label: 'Rapports', icon: BarChart3,
      items: [
        { name: 'Rapports', to: '/reports', show: user?.role === 'PDG' },
        { name: 'Stats détaillées', to: '/reports/details', show: user?.role === 'PDG' },
      ],
    },
    {
      key: 'gestion', label: 'Gestion', icon: Users,
      items: [
        { name: 'Employés', to: '/employees', show: canManageEmployees(user) },
        { name: 'Contacts', to: '/contacts', show: true },
      ],
    },
    // Profil retiré du menu (accès via header). Outils supprimé selon demande.
  ];

  const visibleGroups = groups.filter(g => g.items.some(i => i.show));

  const handleGroupPress = (g: typeof groups[number]) => {
    const visibleItems = g.items.filter(i => i.show);
    if (visibleItems.length === 1) {
      // Navigate directly if only one page in group
      navigate(visibleItems[0].to);
      return;
    }
    setOpenGroup(prev => prev === g.key ? null : g.key);
  };

  return (
    <>
      {openGroup && (
        <button
          type="button"
          aria-label="Fermer le menu groupe"
          onClick={() => setOpenGroup(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpenGroup(null); } }}
          className="fixed inset-0 z-40 md:hidden"
        >
          <div className="absolute inset-0 bg-black/30" />
          {(() => {
            const g = visibleGroups.find(gr => gr.key === openGroup);
            if (!g) return null;
            const items = g.items.filter(i => i.show);
            return (
              <div className="absolute bottom-20 left-2 right-2 rounded-xl bg-white shadow-xl p-4 max-h-[55vh] overflow-y-auto animate-slide-up border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-800">{g.label}</h3>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpenGroup(null); }}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {items.map(o => (
                    <NavLink
                      key={o.name}
                      to={o.to}
                      onClick={(e) => { e.stopPropagation(); setOpenGroup(null); }}
                      className={({ isActive }) => `flex flex-col items-center justify-center rounded-xl p-4 border text-center transition-colors min-h-[80px] ${isActive ? 'bg-primary-50 text-primary-700 border-primary-300' : 'text-gray-600 hover:bg-gray-50 border-gray-200'}`}
                    >
                      {/* try to find icon from groups definitions */}
                      {/* Use group icon as fallback; not storing per-item icon here to keep overlay compact */}
                      <g.icon className="w-7 h-7 mb-2" />
                      <span className="font-medium leading-tight">{o.name}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })()}
        </button>
      )}
      <nav className="fixed md:hidden bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg flex justify-around items-stretch h-20 px-1 py-1">
        {visibleGroups.map(g => {
          const Icon = g.icon;
          const active = openGroup === g.key; // simple active state highlight when open
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => handleGroupPress(g)}
              className={`flex flex-col items-center justify-center flex-1 text-[10px] font-medium transition-colors px-1 py-1 rounded-lg ${active ? 'text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="leading-tight text-center">{g.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default MobileBottomNav;
