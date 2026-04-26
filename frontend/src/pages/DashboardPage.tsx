import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/redux';
import { 
  Users, 
  Package, 
  FileText, 
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { useGetChiffreAffairesStatsQuery, useGetDashboardSummaryQuery } from '../store/api/statsApi';
import { calculateProfitPercentage, formatProfitPercentage } from '../utils/profitPercentage';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // États pour la popup de mot de passe
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordError, setShowPasswordError] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Dashboard counters come from one lightweight backend summary request.
  const { data: dashboardSummary } = useGetDashboardSummaryQuery();

  // Use the same backend API as ChiffreAffairesPage for financial stats (today)
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const { data: todayFinancialStats } = useGetChiffreAffairesStatsQuery({
    filterType: 'day',
    date: todayStr,
  });

  const todayProfitPct = useMemo(
    () => calculateProfitPercentage(todayFinancialStats?.totalChiffreAffairesAchat ?? 0, todayFinancialStats?.totalChiffreAffaires ?? 0),
    [todayFinancialStats?.totalChiffreAffairesAchat, todayFinancialStats?.totalChiffreAffaires]
  );

  // Utility function to format amounts without forced rounding
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 10, // Permet jusqu'à 10 décimales si nécessaire
    }).format(amount);
  };

  const stats = dashboardSummary?.stats ?? {
    employees: 0,
    products: 0,
    orders: 0,
    lowStock: 0,
    pendingOrders: 0,
    talonDueSoon: 0,
  };
  const recentActivity = dashboardSummary?.recentActivity ?? [];

  // Gestion du clic protégé par mot de passe
  const handleProtectedClick = (path: string) => {
    setPendingNavigation(path);
    setShowPasswordModal(true);
  };

  // Vérification du mot de passe
  const handlePasswordVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cin: user?.cin,
          password: passwordInput,
        }),
      });

      if (response.ok) {
        setShowPasswordModal(false);
        setShowPasswordError(false);
        setPasswordInput('');
        if (pendingNavigation) {
          navigate(pendingNavigation);
          setPendingNavigation(null);
        }
      } else {
        setShowPasswordError(true);
      }
    } catch (error) {
      console.error('Erreur de vérification:', error);
      setShowPasswordError(true);
    }
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setShowPasswordError(false);
    setPasswordInput('');
    setPendingNavigation(null);
  };

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
      
      {/* Stats Cards - Première ligne (4 cartes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        <button 
          type="button"
          onClick={() => handleProtectedClick('/employees')}
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
      </div>

      {/* Stats Cards - Deuxième ligne (3 cartes) - Visible seulement pour PDG (et caché pour ManagerPlus/Manager) */}
      {user?.role === 'PDG' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          <button 
            type="button"
            onClick={() => handleProtectedClick('/chiffre-affaires?type=revenue')}
            className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center">
              <DollarSign className="text-yellow-500" size={24} />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Chiffre d'affaires net (aujourd'hui)</p>
                <p className="text-2xl font-semibold text-gray-900">{formatAmount(todayFinancialStats?.totalChiffreAffaires ?? 0)} DH</p>
              </div>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => handleProtectedClick('/chiffre-affaires?type=purchase')}
            className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center">
              <TrendingUp className="text-emerald-500" size={24} />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Chiffre bénéficiaire (aujourd'hui)</p>
                <p className="text-2xl font-semibold text-gray-900">{formatAmount(todayFinancialStats?.totalChiffreAffairesAchat ?? 0)} DH</p>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Taux profit</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{formatProfitPercentage(todayProfitPct)}</p>
                </div>
              </div>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => handleProtectedClick('/chiffre-affaires?type=commandes')}
            className="w-full text-left bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center">
              <Package className="text-indigo-500" size={24} />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">CA des Achats (aujourd'hui)</p>
                <p className="text-2xl font-semibold text-gray-900">{formatAmount(todayFinancialStats?.totalChiffreAchats ?? 0)} DH</p>
              </div>
            </div>
          </button>
        </div>
      )}

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
        {recentActivity.map((activity) => {
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
          <div key={`${activity.type}-${activity.message}-${activity.time}`} className="flex items-center space-x-3">
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

      {/* Popup de mot de passe */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-center mb-4">
              <Users size={48} className="text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-2">Vérification requise</h2>
            <p className="text-gray-600 text-center mb-6">
              Veuillez entrer votre mot de passe pour accéder à cette section
            </p>
            <form onSubmit={handlePasswordVerification}>
              <div className="mb-4">
                <label htmlFor="password-verify" className="block text-sm font-medium text-gray-700 mb-2">
                  Mot de passe
                </label>
                <input
                  type="password"
                  id="password-verify"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setShowPasswordError(false);
                  }}
                  className={`w-full px-4 py-2 border ${showPasswordError ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="Entrez le mot de passe"
                  autoFocus
                />
                {showPasswordError && (
                  <p className="mt-2 text-sm text-red-600">
                    Mot de passe incorrect. Veuillez réessayer.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClosePasswordModal}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={18} />
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Accéder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
