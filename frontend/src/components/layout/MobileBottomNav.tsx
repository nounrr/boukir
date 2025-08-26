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
        { name: 'Talons', to: '/talons', show: user?.role === 'PDG' },
        { name: 'Talon Caisse', to: '/talon-caisse', show: user?.role === 'PDG' },
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
              <div className="absolute bottom-20 left-2 right-2 rounded-xl bg-white shadow-lg p-3 max-h-[55vh] overflow-y-auto animate-slide-up border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">{g.label}</h3>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpenGroup(null); }}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {items.map(o => (
                    <NavLink
                      key={o.name}
                      to={o.to}
                      onClick={(e) => { e.stopPropagation(); setOpenGroup(null); }}
                      className={({ isActive }) => `flex flex-col items-center justify-center rounded-md p-2 border text-center transition-colors ${isActive ? 'bg-primary-50 text-primary-700 border-primary-300' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      {/* try to find icon from groups definitions */}
                      {/* Use group icon as fallback; not storing per-item icon here to keep overlay compact */}
                      <g.icon className="w-6 h-6 mb-1" />
                      <span className="truncate leading-tight">{o.name}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })()}
        </button>
      )}
      <nav className="fixed md:hidden bottom-0 left-0 right-0 z-50 bg-white border-t shadow-sm flex justify-around items-stretch h-16 px-1">
        {visibleGroups.map(g => {
          const Icon = g.icon;
          const active = openGroup === g.key; // simple active state highlight when open
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => handleGroupPress(g)}
              className={`flex flex-col items-center justify-center flex-1 text-[11px] font-medium transition-colors ${active ? 'text-primary-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
              <Icon className="w-6 h-6" />
              <span className="leading-none mt-1">{g.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default MobileBottomNav;
