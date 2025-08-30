import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/redux';
import { 
  Users, 
  Package, 
  FileText, 
  DollarSign,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { useGetEmployeesQuery } from '../store/api/employeesApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useGetPaymentsQuery } from '../store/api/paymentsApi';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Live data
  const { data: employees = [] } = useGetEmployeesQuery();
  const { data: products = [] } = useGetProductsQuery();
  const { data: sorties = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: comptants = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: commandes = [] } = useGetBonsByTypeQuery('Commande');
  const { data: avoirsClient = [] } = useGetBonsByTypeQuery('Avoir');
  const { data: allPayments = [] } = useGetPaymentsQuery();

  // Helpers
  const isSameMonth = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  const isToday = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    return d.getFullYear() === today.getFullYear() && 
           d.getMonth() === today.getMonth() && 
           d.getDate() === today.getDate();
  };

  // Rules
  // - Orders card = sales documents only: Sortie + Comptant (flow of sales)
  // - Revenue = sum of montant_total for Sortie + Comptant of TODAY minus Avoir Client of TODAY
  // - Low stock = products with quantite <= 5
  // - Pending orders = docs not finalized: statuses in ['Brouillon','En attente','En cours'] across Sortie + Commande
  const stats = useMemo(() => {
    const salesDocs = [...sorties, ...comptants];
    const orders = salesDocs.filter((b: any) => isToday(b.date_creation)).length; // sales-related documents only for today

    // Calculate revenue from sales (Sortie + Comptant) today
    const salesRevenue = salesDocs
      .filter((b: any) => isToday(b.date_creation))
      .reduce((sum: number, b: any) => sum + Number(b.montant_total || 0), 0);

    // Calculate avoir client (returns) today to subtract
    const avoirClientAmount = avoirsClient
      .filter((a: any) => isToday(a.date_creation))
      .reduce((sum: number, a: any) => sum + Number(a.montant_total || 0), 0);

    // Final revenue = sales - returns
    const revenue = salesRevenue - avoirClientAmount;

    const lowStock = products.filter((p: any) => Number(p.quantite || 0) <= 5).length;

    const pendingStatuses = new Set(['Brouillon', 'En attente', 'En cours']);
    const pendingOrders = [...sorties, ...commandes].filter((b: any) => pendingStatuses.has(b.statut)).length;
    // Talon due soon (<=5 days) among payments with talon_id
    const today = new Date(); today.setHours(0,0,0,0);
    const talonDueSoon = allPayments.filter((p: any) => p.talon_id && p.date_echeance).filter((p: any) => {
      const due = new Date(p.date_echeance);
      if (isNaN(due.getTime())) return false;
      due.setHours(0,0,0,0);
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000*60*60*24));
      return diffDays <= 5;
    }).length;

    return {
      employees: employees.length,
      products: products.length,
      orders,
      revenue,
      lowStock,
      pendingOrders,
      talonDueSoon,
    };
  }, [employees, products, sorties, comptants, commandes, avoirsClient, allPayments]);

  // Recent Activity - Real data from last 24 hours
  const recentActivity = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const activities = [];

    // Recent bons (last 24h)
    const recentBons = [...sorties, ...comptants, ...commandes]
      .filter((bon: any) => {
        const created = new Date(bon.date_creation);
        return created >= yesterday;
      })
      .sort((a: any, b: any) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime())
      .slice(0, 3);

    recentBons.forEach((bon: any) => {
      const timeAgo = Math.floor((now.getTime() - new Date(bon.date_creation).getTime()) / (1000 * 60 * 60));
      activities.push({
        type: 'bon',
        message: `${bon.type} ${bon.numero || `#${bon.id}`} créé - ${Number(bon.montant_total || 0).toFixed(2)} DH`,
        time: timeAgo > 0 ? `Il y a ${timeAgo}h` : "À l'instant",
        color: bon.type === 'Sortie' ? 'green' : bon.type === 'Comptant' ? 'blue' : 'purple',
        priority: bon.statut === 'Validé' ? 'high' : 'medium'
      });
    });

    // Recent payments (last 24h)
    const recentPayments = allPayments
      .filter((payment: any) => {
        const created = new Date(payment.date_paiement);
        return created >= yesterday;
      })
      .sort((a: any, b: any) => new Date(b.date_paiement).getTime() - new Date(a.date_paiement).getTime())
      .slice(0, 2);

    recentPayments.forEach((payment: any) => {
      const timeAgo = Math.floor((now.getTime() - new Date(payment.date_paiement).getTime()) / (1000 * 60 * 60));
      activities.push({
        type: 'payment',
        message: `Paiement PAY${String(payment.id).padStart(2, '0')} - ${Number(payment.montant_total || 0).toFixed(2)} DH (${payment.mode_paiement})`,
        time: timeAgo > 0 ? `Il y a ${timeAgo}h` : "À l'instant",
        color: 'yellow',
        priority: 'high'
      });
    });

    // Critical stock alerts (always show if exists)
    const criticalStock = products.filter((p: any) => Number(p.quantite || 0) <= 2);
    if (criticalStock.length > 0) {
      const product = criticalStock[0];
      activities.push({
        type: 'alert',
        message: `Stock critique: "${product.designation}" (${product.quantite || 0} restants)`,
        time: "Maintenant",
        color: 'red',
        priority: 'critical'
      });
    }

    // Overdue talons (always show if exists)
    const today = new Date(); today.setHours(0,0,0,0);
    const overdueTalons = allPayments.filter((p: any) => {
      if (!p.talon_id || !p.date_echeance) return false;
      const due = new Date(p.date_echeance);
      if (isNaN(due.getTime())) return false;
      due.setHours(0,0,0,0);
      return due < today;
    });

    if (overdueTalons.length > 0) {
      activities.push({
        type: 'overdue',
        message: `${overdueTalons.length} talon(s) en retard de paiement`,
        time: "Urgent",
        color: 'red',
        priority: 'critical'
      });
    }

    // Sort by priority and time
    return activities
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2 };
        return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
      })
      .slice(0, 5);
  }, [sorties, comptants, commandes, allPayments, products]);

  return (
    <div className="p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Tableau de bord
        </h1>
        <p className="text-gray-600">
          Bienvenue, {user?.nom_complet} ({user?.role})
        </p>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        <button 
          type="button"
          onClick={() => navigate('/employees')}
          className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <Users className="text-blue-500" size={24} />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Employés</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.employees}</p>
            </div>
          </div>
        </button>

          <button 
            type="button"
            onClick={() => navigate('/talon-caisse')}
            className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center">
              <AlertTriangle className="text-red-500" size={24} />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Talons à échéance (≤ 5j)</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.talonDueSoon}</p>
              </div>
            </div>
          </button>

        <button 
          type="button"
          onClick={() => navigate('/stock')}
          className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <Package className="text-green-500" size={24} />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Produits</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.products}</p>
            </div>
          </div>
        </button>

        <button 
          type="button"
          onClick={() => navigate('/bons')}
          className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <FileText className="text-purple-500" size={24} />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Bons (Sortie + Comptant)</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.orders}</p>
            </div>
          </div>
        </button>

        <button 
          type="button"
          onClick={() => navigate('/caisse')}
          className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <DollarSign className="text-yellow-500" size={24} />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Chiffre d'affaires net (aujourd'hui)</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.revenue.toFixed(2)} DH</p>
              {avoirsClient.filter((a: any) => isToday(a.date_creation)).length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Avoirs déduits: -{avoirsClient
                    .filter((a: any) => isToday(a.date_creation))
                    .reduce((sum: number, a: any) => sum + Number(a.montant_total || 0), 0)
                    .toFixed(2)} DH
                </p>
              )}
            </div>
          </div>
        </button>
      </div>

      {/* Alerts & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Alerts */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Alertes</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="text-orange-500 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-gray-900">Stock faible</p>
                  <p className="text-sm text-gray-500">{stats.lowStock} produits ont un stock critique</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <FileText className="text-blue-500 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-gray-900">Commandes en attente</p>
                  <p className="text-sm text-gray-500">{stats.pendingOrders} commandes nécessitent votre attention</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <AlertTriangle className="text-red-500 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-gray-900">Talons à échéance (≤ 5j)</p>
                  <p className="text-sm text-gray-500">{stats.talonDueSoon} paiements à échéance</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Actions rapides</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => navigate('/stock')}
                className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Package size={24} className="text-blue-500 mb-2" />
                <span className="text-sm font-medium text-gray-900">Nouveau produit</span>
              </button>
              
              <button 
                onClick={() => navigate('/bons')}
                className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText size={24} className="text-green-500 mb-2" />
                <span className="text-sm font-medium text-gray-900">Nouvelle commande</span>
              </button>
              
              <button 
                onClick={() => navigate('/contacts')}
                className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Users size={24} className="text-purple-500 mb-2" />
                <span className="text-sm font-medium text-gray-900">Nouveau contact</span>
              </button>
              
              <button 
                onClick={() => navigate('/reports')}
                className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <TrendingUp size={24} className="text-yellow-500 mb-2" />
                <span className="text-sm font-medium text-gray-900">Voir les rapports</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Activité récente</h3>
            <p className="text-sm text-gray-500">Événements des dernières 24 heures et alertes importantes</p>
          </div>
          <div className="p-6">
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity, index) => {
                  const getColorClasses = (color: string) => {
                    switch (color) {
                      case 'red': return 'bg-red-500';
                      case 'green': return 'bg-green-500';
                      case 'blue': return 'bg-blue-500';
                      case 'purple': return 'bg-purple-500';
                      case 'yellow': return 'bg-yellow-500';
                      default: return 'bg-gray-500';
                    }
                  };

                  return (
                    <div key={index} className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${getColorClasses(activity.color)}`}></div>
                      <div className="flex-1">
                        <p className={`text-sm ${activity.priority === 'critical' ? 'font-semibold text-red-900' : 'text-gray-900'}`}>
                          {activity.message}
                        </p>
                        <p className="text-xs text-gray-500">{activity.time}</p>
                      </div>
                      {activity.priority === 'critical' && (
                        <AlertTriangle className="text-red-500" size={16} />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">Aucune activité récente</p>
                <p className="text-xs text-gray-400 mt-1">Les nouvelles transactions et alertes apparaîtront ici</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
