import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, TrendingDown, ArrowLeft, Package } from 'lucide-react';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useGetProductsQuery } from '../store/api/productsApi';

// Types
interface ChiffreAffairesData {
  date: string;
  chiffreAffaires: number; // CA Net brut (sans remises)
  chiffreAffairesAchat: number; // Profit net (après remises)
  chiffreAffairesAchatBrut: number; // Profit brut (avant remises) pour contrôle
  chiffreAchats: number;
  totalRemises: number; // Remises totales du jour (ventes - avoirs)
}

// Utility functions
const formatAmount = (amount: number): string => {
  // Préserver les décimales exactes, sans arrondi forcé
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 10, // Permet jusqu'à 10 décimales si nécessaire
  }).format(amount);
};

const isDateInRange = (dateStr: string, startDate: string, endDate: string): boolean => {
  const date = dateStr.split('T')[0];
  return date >= startDate && date <= endDate;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const ChiffreAffairesPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'day' | 'period' | 'month'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  // API queries
  const { data: sorties = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: comptants = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: avoirsClient = [] } = useGetBonsByTypeQuery('Avoir');
  const { data: avoirsComptant = [] } = useGetBonsByTypeQuery('AvoirComptant');
  const { data: bonsVehicule = [] } = useGetBonsByTypeQuery('Vehicule');
  const { data: commandes = [] } = useGetBonsByTypeQuery('Commande');
  const { data: products = [] } = useGetProductsQuery();

  // Utility function to resolve cost for profit calculation
  const resolveCost = (item: any): number => {
    const product = products.find((p: any) => p.id === item.product_id);
    if (product?.prix_achat) return Number(product.prix_achat);
    if (product?.cout_revient) return Number(product.cout_revient);
    return 0;
  };

  const parseItemsSafe = (items: any): any[] => {
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const computeMouvementDetail = (bon: any) => {
    const items = parseItemsSafe(bon.items);
    let profitNet = 0; // après remises
    let profitBrut = 0; // avant remises
    let costBase = 0;
    let totalRemise = 0;
    for (const it of items) {
      const q = Number(it.quantite || 0);
      if (!q) continue;
      const prixVente = Number(it.prix_unitaire || 0);
      let cost = 0;
      if (it.cout_revient !== undefined && it.cout_revient !== null) cost = Number(it.cout_revient) || 0;
      else if (it.prix_achat !== undefined && it.prix_achat !== null) cost = Number(it.prix_achat) || 0;
      else cost = resolveCost(it);
      const remiseLigne = Number(it.remise_montant || it.remise_valeur || 0) || 0;
      const remiseTotale = remiseLigne * q;
      profitBrut += (prixVente - cost) * q;
      profitNet += (prixVente - cost) * q - remiseTotale;
      totalRemise += remiseTotale;
      costBase += cost * q;
    }
    const marginPct = costBase > 0 ? (profitNet / costBase) * 100 : null;
    return { profitNet, profitBrut, costBase, marginPct, totalRemise };
  };

  // Calculate data based on filter
  const chiffreAffairesData = useMemo(() => {
    const validStatuses = new Set(['En attente', 'Validé']);
    // Exclude bons marked as non-calculated
    const isNonCalculated = (b: any): boolean => {
      const v = (b?.isNotCalculated ?? b?.is_not_calculated);
      return v === true || v === 1 || v === '1';
    };
    
    // Get all data sources with valid status
    const salesDocs = [...sorties, ...comptants].filter((b: any) => validStatuses.has(b.statut) && !isNonCalculated(b));
    const avoirClientDocs = avoirsClient.filter((a: any) => validStatuses.has(a.statut) && !isNonCalculated(a));
    const avoirComptantDocs = avoirsComptant.filter((a: any) => validStatuses.has(a.statut) && !isNonCalculated(a));
    const vehiculeDocs = bonsVehicule.filter((v: any) => validStatuses.has(v.statut) && !isNonCalculated(v));
    const commandeDocs = commandes.filter((c: any) => validStatuses.has(c.statut) && !isNonCalculated(c));
    
    // Filter documents based on selected filter type
    let filteredSales: any[] = [];
    let filteredAvoirsClient: any[] = [];
    let filteredAvoirsComptant: any[] = [];
    let filteredVehicules: any[] = [];
    let filteredCommandes: any[] = [];
    
    switch (filterType) {
      case 'all':
        filteredSales = salesDocs;
        filteredAvoirsClient = avoirClientDocs;
        filteredAvoirsComptant = avoirComptantDocs;
        filteredVehicules = vehiculeDocs;
        filteredCommandes = commandeDocs;
        break;
      case 'day':
        filteredSales = salesDocs.filter((b: any) => 
          b.date_creation?.startsWith(selectedDate)
        );
        filteredAvoirsClient = avoirClientDocs.filter((a: any) => 
          a.date_creation?.startsWith(selectedDate)
        );
        filteredAvoirsComptant = avoirComptantDocs.filter((a: any) => 
          a.date_creation?.startsWith(selectedDate)
        );
        filteredVehicules = vehiculeDocs.filter((v: any) => 
          v.date_creation?.startsWith(selectedDate)
        );
        filteredCommandes = commandeDocs.filter((c: any) => 
          c.date_creation?.startsWith(selectedDate)
        );
        break;
      case 'period':
        filteredSales = salesDocs.filter((b: any) => 
          b.date_creation && isDateInRange(b.date_creation, startDate, endDate)
        );
        filteredAvoirsClient = avoirClientDocs.filter((a: any) => 
          a.date_creation && isDateInRange(a.date_creation, startDate, endDate)
        );
        filteredAvoirsComptant = avoirComptantDocs.filter((a: any) => 
          a.date_creation && isDateInRange(a.date_creation, startDate, endDate)
        );
        filteredVehicules = vehiculeDocs.filter((v: any) => 
          v.date_creation && isDateInRange(v.date_creation, startDate, endDate)
        );
        filteredCommandes = commandeDocs.filter((c: any) => 
          c.date_creation && isDateInRange(c.date_creation, startDate, endDate)
        );
        break;
      case 'month':
        filteredSales = salesDocs.filter((b: any) => 
          b.date_creation?.startsWith(selectedMonth)
        );
        filteredAvoirsClient = avoirClientDocs.filter((a: any) => 
          a.date_creation?.startsWith(selectedMonth)
        );
        filteredAvoirsComptant = avoirComptantDocs.filter((a: any) => 
          a.date_creation?.startsWith(selectedMonth)
        );
        filteredVehicules = vehiculeDocs.filter((v: any) => 
          v.date_creation?.startsWith(selectedMonth)
        );
        filteredCommandes = commandeDocs.filter((c: any) => 
          c.date_creation?.startsWith(selectedMonth)
        );
        break;
    }

    // Calculate totals
    const salesRevenue = filteredSales.reduce((sum: number, b: any) => 
      sum + Number(b.montant_total || 0), 0
    );
    
    const avoirClientAmount = filteredAvoirsClient.reduce((sum: number, a: any) => 
      sum + Number(a.montant_total || 0), 0
    );
    
    const avoirComptantAmount = filteredAvoirsComptant.reduce((sum: number, a: any) => 
      sum + Number(a.montant_total || 0), 0
    );
    
    const commandesRevenue = filteredCommandes.reduce((sum: number, c: any) => 
      sum + Number(c.montant_total || 0), 0
    );
    
  // Prepare totals for remises
  let totalRemisesVente = 0; // cumul des remises sur ventes
  let totalRemisesAvoirClient = 0; // cumul des remises sur avoirs clients
  let totalRemisesAvoirComptant = 0; // cumul des remises sur avoirs comptant

    // Group by date for detailed view - only show days with activity
    const dailyData: { [key: string]: ChiffreAffairesData } = {};
    
    // Process sales (Sortie + Comptant) - ADD to profit
    filteredSales.forEach((bon: any) => {
      const date = bon.date_creation?.split('T')[0] || 'Unknown';
      if (!dailyData[date]) {
        dailyData[date] = { date, chiffreAffaires: 0, chiffreAffairesAchat: 0, chiffreAffairesAchatBrut: 0, chiffreAchats: 0, totalRemises: 0 };
      }
      const { profitNet, profitBrut, totalRemise } = computeMouvementDetail(bon);
      dailyData[date].chiffreAffaires += Number(bon.montant_total || 0);
      dailyData[date].chiffreAffairesAchat += profitNet; // ADD profit
      dailyData[date].chiffreAffairesAchatBrut += profitBrut;
      dailyData[date].totalRemises += totalRemise;
      totalRemisesVente += totalRemise;
    });
    
    // Process avoirs clients - SUBTRACT profit
    filteredAvoirsClient.forEach((avoir: any) => {
      const date = avoir.date_creation?.split('T')[0] || 'Unknown';
      if (!dailyData[date]) {
        dailyData[date] = { date, chiffreAffaires: 0, chiffreAffairesAchat: 0, chiffreAffairesAchatBrut: 0, chiffreAchats: 0, totalRemises: 0 };
      }
      const { profitNet, profitBrut, totalRemise } = computeMouvementDetail(avoir);
      dailyData[date].chiffreAffaires -= Number(avoir.montant_total || 0);
      dailyData[date].chiffreAffairesAchat -= profitNet; // SUBTRACT profit
      dailyData[date].chiffreAffairesAchatBrut -= profitBrut;
      dailyData[date].totalRemises -= totalRemise;
      totalRemisesAvoirClient += totalRemise;
    });
    
    // Process avoirs comptant - SUBTRACT profit
    filteredAvoirsComptant.forEach((avoir: any) => {
      const date = avoir.date_creation?.split('T')[0] || 'Unknown';
      if (!dailyData[date]) {
        dailyData[date] = { date, chiffreAffaires: 0, chiffreAffairesAchat: 0, chiffreAffairesAchatBrut: 0, chiffreAchats: 0, totalRemises: 0 };
      }
      const { profitNet, profitBrut, totalRemise } = computeMouvementDetail(avoir);
      dailyData[date].chiffreAffaires -= Number(avoir.montant_total || 0);
      dailyData[date].chiffreAffairesAchat -= profitNet; // SUBTRACT profit
      dailyData[date].chiffreAffairesAchatBrut -= profitBrut;
      dailyData[date].totalRemises -= totalRemise;
      totalRemisesAvoirComptant += totalRemise;
    });
    
    // Process bons véhicules - SUBTRACT montant total (not profit, but full amount)
    filteredVehicules.forEach((vehicule: any) => {
      const date = vehicule.date_creation?.split('T')[0] || 'Unknown';
      if (!dailyData[date]) {
        dailyData[date] = { date, chiffreAffaires: 0, chiffreAffairesAchat: 0, chiffreAffairesAchatBrut: 0, chiffreAchats: 0, totalRemises: 0 };
      }
      // SUBTRACT full montant_total for vehicles (as requested)
      dailyData[date].chiffreAffairesAchat -= Number(vehicule.montant_total || 0);
      dailyData[date].chiffreAffairesAchatBrut -= Number(vehicule.montant_total || 0);
    });
    
    // Process commandes
    filteredCommandes.forEach((commande: any) => {
      const date = commande.date_creation?.split('T')[0] || 'Unknown';
      if (!dailyData[date]) {
        dailyData[date] = { date, chiffreAffaires: 0, chiffreAffairesAchat: 0, chiffreAffairesAchatBrut: 0, chiffreAchats: 0, totalRemises: 0 };
      }
      dailyData[date].chiffreAchats += Number(commande.montant_total || 0);
    });

    // Filter out days with zero activity
    const filteredDailyData = Object.values(dailyData).filter(day => 
      Math.abs(day.chiffreAffaires) > 0.01 || 
      Math.abs(day.chiffreAffairesAchat) > 0.01 || Math.abs(day.chiffreAchats) > 0.01
    );

    const sortedDailyData = [...filteredDailyData].sort((a: ChiffreAffairesData, b: ChiffreAffairesData) => 
      b.date.localeCompare(a.date)
    );

    // Assurer cohérence: recalculer total bénéficiaire à partir des jours (évite dérives d'arrondi)
    const totalBeneficiaireFromDays = sortedDailyData.reduce((s, d) => s + d.chiffreAffairesAchat, 0);
    return {
      totalChiffreAffaires: salesRevenue - avoirClientAmount - avoirComptantAmount,
      totalChiffreAffairesAchat: totalBeneficiaireFromDays,
      totalChiffreAchats: commandesRevenue,
      totalBons: filteredSales.length,
      dailyData: sortedDailyData,
      totalRemisesNet: totalRemisesVente - totalRemisesAvoirClient - totalRemisesAvoirComptant,
      totalRemisesVente,
      totalRemisesAvoirClient,
      totalRemisesAvoirComptant
    };
  }, [sorties, comptants, avoirsClient, avoirsComptant, bonsVehicule, commandes, products, filterType, selectedDate, startDate, endDate, selectedMonth]);

  const getFilterLabel = (): string => {
    switch (filterType) {
      case 'all':
        return 'Affichage de tous les jours avec activité';
      case 'day':
        return `Jour: ${formatDate(selectedDate)}`;
      case 'period':
        return `Période: du ${formatDate(startDate)} au ${formatDate(endDate)}`;
      case 'month': {
        const monthDate = new Date(selectedMonth + '-01');
        return `Mois: ${monthDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })}`;
      }
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div className="flex items-center space-x-2 md:space-x-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center text-gray-600 hover:text-gray-900 text-sm md:text-base"
          >
            <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Retour au tableau de bord</span>
            <span className="sm:hidden">Retour</span>
          </button>
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 truncate">
            Détails des Chiffres d'Affaires
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Filter Type */}
          <div>
            <label htmlFor="filter-type" className="block text-sm font-medium text-gray-700 mb-1">Type de filtre</label>
            <select
              id="filter-type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'day' | 'period' | 'month')}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">Tous les jours</option>
              <option value="day">Jour</option>
              <option value="period">Période</option>
              <option value="month">Mois</option>
            </select>
          </div>

          {/* Day filter */}
          {filterType === 'day' && (
            <div>
              <label htmlFor="selected-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                id="selected-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          )}

          {/* Period filter */}
          {filterType === 'period' && (
            <>
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </>
          )}

          {/* Month filter */}
          {filterType === 'month' && (
            <div>
              <label htmlFor="selected-month" className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
              <input
                id="selected-month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <Calendar className="h-4 w-4 inline mr-1" />
          {getFilterLabel()}
        </div>
      </div>

      {/* Summary Tab with 3 metrics */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
            {/* Chiffre d'Affaires Net */}
            <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
              <div className="flex items-center">
                <TrendingUp className="h-6 w-6 text-blue-600 mr-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-blue-700 truncate">Chiffre d'Affaires Net</p>
                  <p className="text-xl font-bold text-blue-900">
                    {formatAmount(chiffreAffairesData.totalChiffreAffaires)} DH
                  </p>
                </div>
              </div>
            </div>

            {/* Chiffre Bénéficiaire */}
            <div className="bg-emerald-50 p-4 rounded-lg border-l-4 border-emerald-500">
              <div className="flex items-center">
                <TrendingDown className="h-6 w-6 text-emerald-600 mr-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-emerald-700 truncate">Chiffre Bénéficiaire</p>
                  <p className="text-xl font-bold text-emerald-900">
                    {formatAmount(chiffreAffairesData.totalChiffreAffairesAchat)} DH
                  </p>
                </div>
              </div>
            </div>

            {/* CA des Achats (Commandes) */}
            <div className="bg-indigo-50 p-4 rounded-lg border-l-4 border-indigo-500">
              <div className="flex items-center">
                <Package className="h-6 w-6 text-indigo-600 mr-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-indigo-700 truncate">CA des Achats</p>
                  <p className="text-xl font-bold text-indigo-900">
                    {formatAmount(chiffreAffairesData.totalChiffreAchats)} DH
                  </p>
                  <p className="text-xs text-indigo-600 mt-1">Commandes validées et en attente</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Details */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Détail par jour</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CA Net (DH)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bénéfice Net (DH)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Remises (DH)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CA Achats (DH)
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {chiffreAffairesData.dailyData.map((day: ChiffreAffairesData) => (
                <tr key={day.date} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => navigate(`/chiffre-affaires/detail/${day.date}`)}
                      className="text-left hover:bg-blue-50 rounded-lg p-2 transition-colors cursor-pointer w-full"
                    >
                      <div className="text-sm font-medium text-blue-600 hover:text-blue-800">
                        {formatDate(day.date)}
                      </div>
                      <div className="text-sm text-gray-500">{day.date}</div>
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-blue-900">
                      {formatAmount(day.chiffreAffaires)} DH
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-emerald-900">
                      {formatAmount(day.chiffreAffairesAchat)} DH
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-amber-700">
                      {formatAmount(day.totalRemises)} DH
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-indigo-900">
                      {formatAmount(day.chiffreAchats)} DH
                    </div>
                  </td>
                </tr>
              ))}
              {chiffreAffairesData.dailyData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    Aucune donnée disponible pour cette période
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ChiffreAffairesPage;
