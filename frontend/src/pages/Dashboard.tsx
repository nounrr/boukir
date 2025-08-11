import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../hooks/redux';
import { useGetProductsQuery } from '../../store/api/productsApi';
import { useGetEmployeesQuery } from '../../store/api/employeesApi';
import { useGetContactsQuery } from '../../store/api/contactsApi';
import {
  Users,
  Package,
  UserCheck,
  AlertTriangle,
  TrendingUp,
  DollarSign,
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { data: products, isLoading: productsLoading } = useGetProductsQuery();
  const { data: employees, isLoading: employeesLoading } = useGetEmployeesQuery();
  const { data: contacts, isLoading: contactsLoading } = useGetContactsQuery({});

  // Calcul des statistiques
  const lowStockProducts = products?.filter(
    (product) => product.quantite_stock <= product.seuil_alerte
  ) || [];

  const clients = contacts?.filter((contact) => contact.type === 'Client') || [];
  const fournisseurs = contacts?.filter((contact) => contact.type === 'Fournisseur') || [];

  const totalStockValue = products?.reduce(
    (total, product) => total + (product.prix_unitaire * product.quantite_stock),
    0
  ) || 0;

  const stats = [
    {
      name: 'Employés',
      value: employees?.length || 0,
      icon: Users,
      color: 'bg-blue-500',
      loading: employeesLoading,
    },
    {
      name: 'Produits',
      value: products?.length || 0,
      icon: Package,
      color: 'bg-green-500',
      loading: productsLoading,
    },
    {
      name: 'Clients',
      value: clients.length,
      icon: UserCheck,
      color: 'bg-purple-500',
      loading: contactsLoading,
    },
    {
      name: 'Fournisseurs',
      value: fournisseurs.length,
      icon: TrendingUp,
      color: 'bg-orange-500',
      loading: contactsLoading,
    },
  ];

  // Fonctions de navigation
  const handleNavigateToBons = () => {
    navigate('/bons');
  };

  const handleNavigateToStock = () => {
    navigate('/stock');
  };

  const handleNavigateToContacts = () => {
    navigate('/contacts');
  };

  const handleNavigateToCaisse = () => {
    navigate('/caisse');
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Tableau de bord
        </h1>
        <p className="text-gray-600">
          Bienvenue, {user?.nom_complet} ({user?.role})
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {stat.name}
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stat.loading ? '...' : stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alertes et informations importantes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Produits en stock faible */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Alertes Stock
            </h3>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          
          {productsLoading ? (
            <p className="text-gray-500">Chargement...</p>
          ) : lowStockProducts.length === 0 ? (
            <p className="text-green-600">Aucune alerte de stock</p>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="flex justify-between items-center p-2 bg-red-50 rounded"
                >
                  <span className="text-sm font-medium">{product.nom}</span>
                  <span className="text-sm text-red-600">
                    {product.quantite_stock} restant(s)
                  </span>
                </div>
              ))}
              {lowStockProducts.length > 5 && (
                <p className="text-sm text-gray-500">
                  Et {lowStockProducts.length - 5} autre(s)...
                </p>
              )}
            </div>
          )}
        </div>

        {/* Valeur totale du stock */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Valeur du Stock
            </h3>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          
          {productsLoading ? (
            <p className="text-gray-500">Chargement...</p>
          ) : (
            <div>
              <p className="text-3xl font-bold text-green-600">
                {new Intl.NumberFormat('fr-MA', {
                  style: 'currency',
                  currency: 'MAD',
                }).format(totalStockValue)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Basé sur {products?.length || 0} produit(s)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions rapides */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Actions rapides
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={handleNavigateToBons}
            className="btn-primary text-center p-4 hover:bg-blue-700 transition-colors"
          >
            Nouveau Bon
          </button>
          <button 
            onClick={handleNavigateToStock}
            className="btn-secondary text-center p-4 hover:bg-gray-300 transition-colors"
          >
            Ajouter Produit
          </button>
          <button 
            onClick={handleNavigateToContacts}
            className="btn-secondary text-center p-4 hover:bg-gray-300 transition-colors"
          >
            Nouveau Client
          </button>
          <button 
            onClick={handleNavigateToCaisse}
            className="btn-secondary text-center p-4 hover:bg-gray-300 transition-colors"
          >
            Enregistrer Paiement
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
