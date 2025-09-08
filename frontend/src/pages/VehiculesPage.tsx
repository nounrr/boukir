import React, { useState, useMemo } from 'react';
import { 
  Plus, Edit, Trash2, Search, Truck, Calendar, Wrench, Car, Eye, 
  FileText, Filter, BarChart3, TrendingUp, AlertTriangle, CheckCircle
} from 'lucide-react';
import { useGetVehiculesQuery, useDeleteVehiculeMutation } from '../store/api/vehiculesApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import VehiculeFormModal from '../components/VehiculeFormModal';
import VehiculeDetailsModal from '../components/VehiculeDetailsModal';
import { formatDateTimeWithHour } from '../utils/dateUtils';
import type { Vehicule } from '../types';

const VehiculesPage = () => {
  // États de base
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedVehicule, setSelectedVehicule] = useState<Vehicule | null>(null);
  const [detailsVehicule, setDetailsVehicule] = useState<Vehicule | null>(null);
  
  // États de filtrage avancé
  const [activeTab, setActiveTab] = useState<'tous' | 'disponibles' | 'service' | 'maintenance' | 'hors-service'>('tous');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // RTK Query hooks
  const { data: vehicules = [], isLoading } = useGetVehiculesQuery();
  const [deleteVehiculeMutation] = useDeleteVehiculeMutation();

  // Calculs des statistiques (simulé pour l'instant sans les bons)
  const statistiques = useMemo(() => {
    const total = vehicules.length;
    const disponibles = vehicules.filter(v => v.statut === 'Disponible').length;
    const enService = vehicules.filter(v => v.statut === 'En service').length;
    const enMaintenance = vehicules.filter(v => v.statut === 'En maintenance').length;
    const horsService = vehicules.filter(v => v.statut === 'Hors service').length;
    
    // Pour l'instant, simulation du nombre de bons par véhicule
    const bonsParVehicule = new Map<number, number>();
    vehicules.forEach(vehicule => {
      // Simulation aléatoire pour l'affichage
      bonsParVehicule.set(vehicule.id, Math.floor(Math.random() * 10));
    });

    return {
      total,
      disponibles,
      enService,
      enMaintenance,
      horsService,
      bonsParVehicule
    };
  }, [vehicules]);

  // Filtrage intelligent des véhicules
  const filteredVehicules = useMemo(() => {
    let filtered = vehicules;

    // Filtre par onglet
    if (activeTab !== 'tous') {
      const statutMap = {
        'disponibles': 'Disponible',
        'service': 'En service',
        'maintenance': 'En maintenance',
        'hors-service': 'Hors service'
      };
      filtered = filtered.filter(v => v.statut === statutMap[activeTab]);
    }

    // Filtre par type
    if (typeFilter) {
      filtered = filtered.filter(v => v.type_vehicule === typeFilter);
    }

    // Filtre par recherche
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(vehicule =>
        vehicule.nom.toLowerCase().includes(term) ||
        vehicule.marque?.toLowerCase().includes(term) ||
        vehicule.modele?.toLowerCase().includes(term) ||
        vehicule.immatriculation.toLowerCase().includes(term) ||
        vehicule.type_vehicule.toLowerCase().includes(term) ||
        vehicule.statut.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [vehicules, activeTab, typeFilter, searchTerm]);

  // Pagination
  const totalItems = filteredVehicules.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedVehicules = filteredVehicules.slice(startIndex, endIndex);

  // Types uniques pour le filtre
  const typesUniques = useMemo(() => {
    return [...new Set(vehicules.map(v => v.type_vehicule))].sort((a, b) => a.localeCompare(b));
  }, [vehicules]);

  // Réinitialiser la page lors des changements de filtres
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, typeFilter, searchTerm]);

  // Fonctions de gestion
  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce véhicule ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deleteVehiculeMutation({ id }).unwrap();
        showSuccess('Véhicule supprimé avec succès');
      } catch (error: any) {
        console.error('Erreur lors de la suppression:', error);
        showError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
      }
    }
  };

  const handleEdit = (vehicule: Vehicule) => {
    setSelectedVehicule(vehicule);
    setIsCreateModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedVehicule(null);
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setSelectedVehicule(null);
  };

  // Fonctions utilitaires
  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'Disponible':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'En service':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'En maintenance':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Hors service':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Camion':
        return <Truck className="w-5 h-5 text-orange-600" />;
      case 'Camionnette':
        return <Truck className="w-5 h-5 text-blue-600" />;
      case 'Voiture':
        return <Car className="w-5 h-5 text-green-600" />;
      default:
        return <Car className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatutIcon = (statut: string) => {
    switch (statut) {
      case 'Disponible':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'En service':
        return <TrendingUp className="w-4 h-4 text-blue-600" />;
      case 'En maintenance':
        return <Wrench className="w-4 h-4 text-orange-600" />;
      case 'Hors service':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <span className="ml-3 text-gray-600">Chargement des véhicules...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen max-w-screen overflow-x-hidden box-border p-4 sm:p-6 bg-gray-50 min-h-screen">
      {/* Header moderne avec onglets */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Véhicules</h1>
            <p className="text-gray-600 mt-1">Gérez votre flotte de véhicules et suivez leur état</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => {
                const printContent = `
                  <html>
                    <head>
                      <title>Rapport Global - Véhicules</title>
                      <style>
                        body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
                        h1, h2, h3 { color: #333; margin-bottom: 10px; }
                        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
                        th { background-color: #f5f5f5; font-weight: bold; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f97316; padding-bottom: 15px; }
                        .numeric { text-align: right; }
                        .total-row { font-weight: bold; background-color: #fef3c7; }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        <h1>🚛 RAPPORT GLOBAL VÉHICULES</h1>
                        <p>Date: ${new Date().toLocaleDateString('fr-FR')}</p>
                      </div>
                      <table>
                        <tr><th>Nom</th><th>Type</th><th>Immatriculation</th><th>Statut</th></tr>
                        ${filteredVehicules.map(v => 
                          `<tr><td>${v.nom}</td><td>${v.type_vehicule}</td><td>${v.immatriculation}</td><td>${v.statut}</td></tr>`
                        ).join('')}
                      </table>
                    </body>
                  </html>
                `;
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                  printWindow.document.body.innerHTML = printContent;
                  printWindow.print();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors w-full sm:w-auto justify-center"
              title="Imprimer rapport global des véhicules"
            >
              <FileText size={16} />
              Rapport Global ({filteredVehicules.length})
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
            >
              <Plus size={20} />
              Nouveau Véhicule
            </button>
          </div>
        </div>

        {/* Onglets de statut */}
  <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-6">
          {[
            { key: 'tous', label: 'Tous', count: statistiques.total },
            { key: 'disponibles', label: 'Disponibles', count: statistiques.disponibles },
            { key: 'service', label: 'En service', count: statistiques.enService },
            { key: 'maintenance', label: 'Maintenance', count: statistiques.enMaintenance },
            { key: 'hors-service', label: 'Hors service', count: statistiques.horsService }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'text-orange-600 border-orange-600 bg-orange-50'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {tab.key === 'tous' && <BarChart3 size={18} />}
                {tab.key === 'disponibles' && <CheckCircle size={18} />}
                {tab.key === 'service' && <TrendingUp size={18} />}
                {tab.key === 'maintenance' && <Wrench size={18} />}
                {tab.key === 'hors-service' && <AlertTriangle size={18} />}
                {tab.label}
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-sm">
                  {tab.count}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cartes de statistiques */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Véhicules</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{statistiques.total}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <Truck className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Disponibles</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{statistiques.disponibles}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center text-sm text-green-600">
              <span>{statistiques.total > 0 ? Math.round((statistiques.disponibles / statistiques.total) * 100) : 0}% du parc</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">En Service</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{statistiques.enService}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center text-sm text-blue-600">
              <span>{statistiques.total > 0 ? Math.round((statistiques.enService / statistiques.total) * 100) : 0}% actifs</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Maintenance</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{statistiques.enMaintenance}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <Wrench className="w-8 h-8 text-orange-600" />
            </div>
          </div>
          {statistiques.enMaintenance > 0 && (
            <div className="mt-2">
              <div className="flex items-center text-sm text-orange-600">
                <AlertTriangle className="w-3 h-3 mr-1" />
                <span>Attention requise</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Rechercher par nom, marque, modèle, immatriculation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-8 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
              >
                <option value="">Tous les types</option>
                {typesUniques.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg transition-colors ${
                showFilters ? 'bg-orange-50 border-orange-200 text-orange-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter size={16} />
              Filtres
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="capacite-filter" className="block text-sm font-medium text-gray-700 mb-2">
                  Capacité minimale (kg)
                </label>
                <input
                  id="capacite-filter"
                  type="number"
                  placeholder="Ex: 1000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <div>
                <label htmlFor="annee-filter" className="block text-sm font-medium text-gray-700 mb-2">
                  Année minimum
                </label>
                <input
                  id="annee-filter"
                  type="number"
                  placeholder="Ex: 2020"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setTypeFilter('');
                    setActiveTab('tous');
                  }}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contrôles de pagination */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} véhicules
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Par page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste mobile (cartes) */}
      <div className="sm:hidden space-y-3">
        {paginatedVehicules.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center text-gray-600">
            <div className="flex flex-col items-center">
              <Truck className="w-10 h-10 text-gray-400 mb-2" />
              Aucun véhicule trouvé
            </div>
          </div>
        ) : (
          paginatedVehicules.map((vehicule) => (
            <div key={vehicule.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center border border-orange-200 flex-shrink-0">
                    {getTypeIcon(vehicule.type_vehicule)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-900 truncate">{vehicule.nom}</div>
                    <div className="text-sm text-gray-500 truncate">{vehicule.marque} {vehicule.modele}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {getStatutIcon(vehicule.statut)}
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatutColor(vehicule.statut)}`}>
                    {vehicule.statut}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Immatriculation</div>
                  <div className="font-mono font-medium bg-gray-50 inline-block px-2 py-1 rounded">{vehicule.immatriculation}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Type & Capacité</div>
                  <div className="text-gray-800">{vehicule.type_vehicule}{vehicule.capacite_charge ? ` · ${vehicule.capacite_charge} kg` : ''}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Année</div>
                  <div className="text-gray-800">{vehicule.annee || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Créé le</div>
                  <div className="text-gray-800">{formatDateTimeWithHour(vehicule.date_creation)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-gray-500">Activité</div>
                  <div className="text-gray-800">{statistiques.bonsParVehicule.get(vehicule.id) || 0} bons</div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setDetailsVehicule(vehicule)}
                  className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                  title="Voir détails et bons"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEdit(vehicule)}
                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Modifier véhicule"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(vehicule.id)}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Supprimer véhicule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tableau moderne (desktop) */}
      <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-2">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Véhicule
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Immatriculation
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Type & Capacité
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Année
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date création
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Activité
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedVehicules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <Truck className="w-12 h-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun véhicule trouvé</h3>
                      <p className="text-gray-500 max-w-sm">
                        {vehicules.length === 0 
                          ? "Commencez par ajouter votre premier véhicule à la flotte." 
                          : "Aucun véhicule ne correspond à vos critères de recherche."}
                      </p>
                      {vehicules.length === 0 && (
                        <button
                          onClick={handleCreate}
                          className="mt-4 flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                        >
                          <Plus size={16} />
                          Ajouter un véhicule
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedVehicules.map((vehicule) => (
                  <tr key={vehicule.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-12 w-12">
                          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center border border-orange-200">
                            {getTypeIcon(vehicule.type_vehicule)}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900">
                            {vehicule.nom}
                          </div>
                          <div className="text-sm text-gray-500">
                            {vehicule.marque} {vehicule.modele}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-mono font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded">
                          {vehicule.immatriculation}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-medium">{vehicule.type_vehicule}</div>
                      <div className="text-sm text-gray-500">
                        {vehicule.capacite_charge ? (
                          <span className="flex items-center gap-1">
                            <span className="font-medium">{vehicule.capacite_charge} kg</span>
                          </span>
                        ) : (
                          'Capacité non spécifiée'
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatutIcon(vehicule.statut)}
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatutColor(vehicule.statut)}`}>
                          {vehicule.statut}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                        <span className="font-medium">{vehicule.annee || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">
                        {formatDateTimeWithHour(vehicule.date_creation)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          {statistiques.bonsParVehicule.get(vehicule.id) || 0}
                        </div>
                        <span className="text-xs text-gray-500">bons</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setDetailsVehicule(vehicule)}
                          className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Voir détails et bons"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(vehicule)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Modifier véhicule"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(vehicule.id)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer véhicule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation de pagination moderne */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Précédent
          </button>
          
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 border rounded-lg transition-colors ${
                    currentPage === pageNum
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Modals */}
      <VehiculeFormModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseModal}
        initialValues={selectedVehicule || undefined}
        onVehiculeAdded={() => {
          // Le cache sera automatiquement invalidé par RTK Query
        }}
      />

      <VehiculeDetailsModal
        isOpen={!!detailsVehicule}
        onClose={() => setDetailsVehicule(null)}
        vehicule={detailsVehicule}
      />
    </div>
  );
};

export default VehiculesPage;
