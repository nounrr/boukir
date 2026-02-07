import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, TrendingDown, ArrowLeft, Package } from 'lucide-react';
import { useGetChiffreAffairesStatsQuery } from '../store/api/statsApi';

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

const formatDate = (dateStr: string): string => {
  // `new Date('YYYY-MM-DD')` is parsed as UTC by JS, which can shift the day.
  // Force local parsing.
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const getLocalYyyyMmDd = (d: Date = new Date()): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getLocalYyyyMm = (d: Date = new Date()): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

const ChiffreAffairesPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'day' | 'period' | 'month'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalYyyyMmDd());
  const [startDate, setStartDate] = useState<string>(getLocalYyyyMmDd());
  const [endDate, setEndDate] = useState<string>(getLocalYyyyMmDd());
  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalYyyyMm());

  const statsQueryArgs = useMemo(() => {
    if (filterType === 'day') return { filterType, date: selectedDate };
    if (filterType === 'period') return { filterType, startDate, endDate };
    if (filterType === 'month') return { filterType, month: selectedMonth };
    return { filterType };
  }, [filterType, selectedDate, startDate, endDate, selectedMonth]);

  const {
    data: chiffreAffairesDataResp,
    isLoading,
    isFetching,
    error,
  } = useGetChiffreAffairesStatsQuery(statsQueryArgs);

  const chiffreAffairesData = useMemo(() => {
    return (
      chiffreAffairesDataResp || {
        totalChiffreAffaires: 0,
        totalChiffreAffairesAchat: 0,
        totalChiffreAchats: 0,
        totalBons: 0,
        dailyData: [] as ChiffreAffairesData[],
        totalRemisesNet: 0,
        totalRemisesVente: 0,
        totalRemisesAvoirClient: 0,
        totalRemisesAvoirComptant: 0,
      }
    );
  }, [chiffreAffairesDataResp]);

  const getFilterLabel = (): string => {
    switch (filterType) {
      case 'all':
        return 'Affichage de tous les jours avec activité';
      case 'day':
        return `Jour: ${formatDate(selectedDate)}`;
      case 'period':
        return `Période: du ${formatDate(startDate)} au ${formatDate(endDate)}`;
      case 'month': {
        const monthDate = new Date(`${selectedMonth}-01T00:00:00`);
        return `Mois: ${monthDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })}`;
      }
    }
  };

  const errorMessage = useMemo(() => {
    const anyErr = error as any;
    if (!anyErr) return null;
    if (anyErr?.status === 401) return "Non autorisé. Veuillez vous reconnecter.";
    return anyErr?.data?.message || anyErr?.error || 'Erreur lors du chargement des statistiques.';
  }, [error]);

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

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {errorMessage}
        </div>
      )}

      {(isLoading || isFetching) && (
        <div className="bg-white border rounded-lg p-4 text-sm text-gray-600">
          Chargement des statistiques...
        </div>
      )}

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
