import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { BarChart3, TrendingUp, DollarSign, Users, Filter, Download, FileText, PieChart, Activity } from 'lucide-react';
import { selectClients } from '../store/slices/contactsSlice';
import { mockProducts } from '../data/mockData';

const ReportsPage: React.FC = () => {
  const clients = useSelector(selectClients);
  
  // États pour les filtres
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [contactType, setContactType] = useState<'all' | 'clients' | 'fournisseurs'>('all');
  const [reportType, setReportType] = useState<'overview' | 'sales' | 'payments' | 'products'>('overview');

  // Données mock pour les statistiques
  const mockTransactions = {
    bons: [
      { id: 1, numero: 'BON-001', type: 'Commande', contact_id: 5, date: '15-01-24', montant: 15000, statut: 'Validé' },
      { id: 2, numero: 'BON-002', type: 'Sortie', contact_id: 5, date: '20-01-24', montant: 8500, statut: 'En cours' },
      { id: 3, numero: 'BON-003', type: 'Devis', contact_id: 6, date: '25-01-24', montant: 12000, statut: 'Validé' },
      { id: 4, numero: 'BON-004', type: 'Avoir', contact_id: 7, date: '01-02-24', montant: 3500, statut: 'Validé' },
      { id: 5, numero: 'BON-005', type: 'Commande', contact_id: 1, date: '10-02-24', montant: 25000, statut: 'Validé' },
      { id: 6, numero: 'BON-006', type: 'Sortie', contact_id: 2, date: '15-02-24', montant: 15600, statut: 'Livré' },
      { id: 7, numero: 'BON-007', type: 'Commande', contact_id: 5, date: '15-07-25', montant: 9000, statut: 'Validé' },
      { id: 8, numero: 'BON-008', type: 'Sortie', contact_id: 6, date: '20-07-25', montant: 6500, statut: 'En cours' },
    ],
    payments: [
      { id: 1, numero: 'PAY-CLT-001', contact_id: 5, date: '20-01-24', montant: 5000, mode: 'Espèces', type: 'Client' },
      { id: 2, numero: 'PAY-CLT-002', contact_id: 6, date: '22-01-24', montant: 8500, mode: 'Chèque', type: 'Client' },
      { id: 3, numero: 'PAY-CLT-003', contact_id: 7, date: '25-01-24', montant: 2000, mode: 'Virement', type: 'Client' },
      { id: 4, numero: 'PAY-FRS-001', contact_id: 1, date: '15-02-24', montant: 12000, mode: 'Virement', type: 'Fournisseur' },
      { id: 5, numero: 'PAY-FRS-002', contact_id: 2, date: '20-02-24', montant: 7800, mode: 'Chèque', type: 'Fournisseur' },
      { id: 6, numero: 'PAY-CLT-004', contact_id: 5, date: '25-07-25', montant: 4000, mode: 'Virement', type: 'Client' },
      { id: 7, numero: 'PAY-CLT-005', contact_id: 6, date: '30-07-25', montant: 3200, mode: 'Espèces', type: 'Client' },
    ]
  };

  // Fonction pour convertir une date du format jj-mm-aa vers ISO
  const convertDisplayToISO = (displayDate: string) => {
    if (!displayDate) return '';
    const [day, month, year] = displayDate.split('-');
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };

  // Fonction pour filtrer les données par date
  const getFilteredData = (data: any[]) => {
    if (!dateFrom && !dateTo) return data;
    
    return data.filter(item => {
      const itemISO = convertDisplayToISO(item.date);
      if (!itemISO) return true;
      
      const itemDate = new Date(itemISO);
      const fromDate = dateFrom ? new Date(dateFrom) : null;
      const toDate = dateTo ? new Date(dateTo) : null;
      
      let dateMatches = true;
      if (fromDate && itemDate < fromDate) dateMatches = false;
      if (toDate && itemDate > toDate) dateMatches = false;
      
      return dateMatches;
    });
  };

  // Calcul des statistiques globales
  const filteredBons = getFilteredData(mockTransactions.bons);
  const filteredPayments = getFilteredData(mockTransactions.payments);
  
  const totalBons = filteredBons.reduce((sum, bon) => sum + bon.montant, 0);
  const totalPayments = filteredPayments.reduce((sum, payment) => sum + payment.montant, 0);
  const totalSoldeClients = clients.reduce((sum, client) => sum + (Number(client.solde) || 0), 0);

  // Statistiques par type de bon
  const bonsByType = filteredBons.reduce((acc: any, bon) => {
    acc[bon.type] = (acc[bon.type] || 0) + bon.montant;
    return acc;
  }, {});

  // Statistiques par mode de paiement
  const paymentsByMode = filteredPayments.reduce((acc: any, payment) => {
    acc[payment.mode] = (acc[payment.mode] || 0) + payment.montant;
    return acc;
  }, {});

  // Top 5 produits les plus vendus (simulation)
  const topProducts = mockProducts.slice(0, 5).map(product => ({
    ...product,
    totalVendu: Math.floor(Math.random() * 50) + 10,
    chiffreAffaires: product.prix_vente * (Math.floor(Math.random() * 50) + 10)
  }));

  // Fonction d'export des données
  const handleExport = () => {
    const data = {
      periode: `${dateFrom || 'Début'} - ${dateTo || 'Fin'}`,
      totalBons: totalBons,
      totalPayments: totalPayments,
      nombreBons: filteredBons.length,
      nombrePayments: filteredPayments.length,
      bonsByType,
      paymentsByMode
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapports et Statistiques</h1>
          <p className="text-gray-600 mt-1">Analyse des données commerciales</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Download size={20} />
            Exporter
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Filtres</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Période */}
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Type de contact */}
          <div>
            <label htmlFor="contactType" className="block text-sm font-medium text-gray-700 mb-1">Type de contact</label>
            <select
              id="contactType"
              value={contactType}
              onChange={(e) => setContactType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tous</option>
              <option value="clients">Clients uniquement</option>
              <option value="fournisseurs">Fournisseurs uniquement</option>
            </select>
          </div>
          
          {/* Type de rapport */}
          <div>
            <label htmlFor="reportType" className="block text-sm font-medium text-gray-700 mb-1">Type de rapport</label>
            <select
              id="reportType"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="overview">Vue d'ensemble</option>
              <option value="sales">Ventes</option>
              <option value="payments">Paiements</option>
              <option value="products">Produits</option>
            </select>
          </div>
        </div>
        
        {/* Boutons de filtre rapide */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              const today = new Date();
              const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
              setDateFrom(thisMonth.toISOString().split('T')[0]);
              setDateTo(today.toISOString().split('T')[0]);
            }}
            className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors text-sm"
          >
            Ce mois
          </button>
          <button
            onClick={() => {
              const today = new Date();
              const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              const endLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
              setDateFrom(lastMonth.toISOString().split('T')[0]);
              setDateTo(endLastMonth.toISOString().split('T')[0]);
            }}
            className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors text-sm"
          >
            Mois dernier
          </button>
          <button
            onClick={() => {
              setDateFrom('2024-01-01');
              setDateTo('2024-12-31');
            }}
            className="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md transition-colors text-sm"
          >
            2024
          </button>
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors text-sm"
          >
            Toutes les dates
          </button>
        </div>
      </div>

      {/* Statistiques principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <FileText className="text-blue-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Bons</p>
              <p className="text-2xl font-bold text-gray-900">{totalBons.toFixed(2)} DH</p>
              <p className="text-sm text-gray-500">{filteredBons.length} bons</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="text-green-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Paiements</p>
              <p className="text-2xl font-bold text-gray-900">{totalPayments.toFixed(2)} DH</p>
              <p className="text-sm text-gray-500">{filteredPayments.length} paiements</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 rounded-full">
              <Users className="text-orange-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Solde Clients</p>
              <p className="text-2xl font-bold text-gray-900">{totalSoldeClients.toFixed(2)} DH</p>
              <p className="text-sm text-gray-500">{clients.length} clients</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-full">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Bénéfice Net</p>
              <p className="text-2xl font-bold text-gray-900">{(totalBons - totalPayments).toFixed(2)} DH</p>
              <p className={`text-sm ${totalBons > totalPayments ? 'text-green-500' : 'text-red-500'}`}>
                {totalBons > totalPayments ? 'Positif' : 'Négatif'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Graphiques et analyses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Répartition par type de bon */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={20} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Répartition par Type de Bon</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(bonsByType).map(([type, montant]: [string, any]) => (
              <div key={type} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{type}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${(montant / totalBons) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-20 text-right">
                    {montant.toFixed(0)} DH
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Répartition par mode de paiement */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={20} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Modes de Paiement</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(paymentsByMode).map(([mode, montant]: [string, any]) => (
              <div key={mode} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{mode}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full" 
                      style={{ width: `${(montant / totalPayments) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-20 text-right">
                    {montant.toFixed(0)} DH
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top produits */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Top 5 Produits</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Référence</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité Vendue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Unitaire</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Chiffre d'Affaires</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Restant</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {topProducts.map((product, index) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-600">#{index + 1}</span>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{product.designation}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.reference}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {product.totalVendu}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {product.prix_vente.toFixed(2)} DH
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600 text-right">
                    {product.chiffreAffaires.toFixed(2)} DH
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    {(() => {
                      let colorClass;
                      if (product.quantite > 10) {
                        colorClass = 'bg-green-100 text-green-800';
                      } else if (product.quantite > 5) {
                        colorClass = 'bg-yellow-100 text-yellow-800';
                      } else {
                        colorClass = 'bg-red-100 text-red-800';
                      }
                      
                      return (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass}`}>
                          {product.quantite}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
