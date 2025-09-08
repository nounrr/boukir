import React, { useMemo, useState } from 'react';
import { 
  Printer, Truck, Car, Wrench, CheckCircle, AlertTriangle, 
  TrendingUp, FileText, Search, DollarSign, MapPin, Info, Eye, X
} from 'lucide-react';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import type { Vehicule, Bon } from '../types';
import ThermalPrintModal from './ThermalPrintModal';
import VehiculePrintModal from './VehiculePrintModal';

interface VehiculeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicule: Vehicule | null;
}

const formatDate = (date?: string) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR');
};

const formatDateTime = (date?: string) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const VehiculeDetailsModal: React.FC<VehiculeDetailsModalProps> = ({ isOpen, onClose, vehicule }) => {
  const { data: allVehiculeBons = [], isLoading } = useGetBonsByTypeQuery('Vehicule');
  const [search, setSearch] = useState('');
  const [printBon, setPrintBon] = useState<Bon | null>(null);
  const [openA4, setOpenA4] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Fonction pour filtrer les bons par date
  const isWithinDateRange = (isoDate?: string | null) => {
    if (!isoDate) return !(dateFrom || dateTo);
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return true;
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const bons = useMemo(() => {
    let base = allVehiculeBons.filter((b: any) => String(b.vehicule_id || '') === String(vehicule?.id || ''));
    
    // Filtre par date
    base = base.filter((b: any) => isWithinDateRange(b.date_creation));
    
    // Filtre par statut
    if (statusFilter) {
      base = base.filter((b: any) => String(b.statut || '').toLowerCase() === statusFilter.toLowerCase());
    }
    
    // Filtre par recherche
    const term = search.trim().toLowerCase();
    if (term) {
      base = base.filter((b: any) => {
        const inNumero = (b.numero || '').toLowerCase().includes(term);
        const inStatut = (b.statut || '').toLowerCase().includes(term);
        const inLieu = (b.lieu_chargement || '').toLowerCase().includes(term);
        return inNumero || inStatut || inLieu;
      });
    }
    
    return base.sort((a: any, b: any) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime());
  }, [allVehiculeBons, vehicule, search, dateFrom, dateTo, statusFilter]);

  // Statistiques
  const stats = useMemo(() => {
    const totalBons = bons.length;
    const totalMontant = bons.reduce((s: number, b: any) => s + (Number(b.montant_total) || 0), 0);
    const statuts = new Map<string, number>();
    bons.forEach((b: any) => {
      const statut = b.statut || 'Non défini';
      statuts.set(statut, (statuts.get(statut) || 0) + 1);
    });
    return { totalBons, totalMontant, statuts };
  }, [bons]);

  // Types de véhicule avec icônes
  const getVehiculeIcon = (type: string) => {
    switch (type) {
      case 'Camion':
        return <Truck className="w-6 h-6 text-orange-600" />;
      case 'Camionnette':
        return <Truck className="w-6 h-6 text-blue-600" />;
      case 'Voiture':
        return <Car className="w-6 h-6 text-green-600" />;
      default:
        return <Car className="w-6 h-6 text-gray-600" />;
    }
  };

  // Statut avec icônes et couleurs
  const getStatutInfo = (statut: string) => {
    switch (statut) {
      case 'Disponible':
        return { icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-100 text-green-800 border-green-200' };
      case 'En service':
        return { icon: <TrendingUp className="w-4 h-4" />, color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'En maintenance':
        return { icon: <Wrench className="w-4 h-4" />, color: 'bg-orange-100 text-orange-800 border-orange-200' };
      case 'Hors service':
        return { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-red-100 text-red-800 border-red-200' };
      default:
        return { icon: <Info className="w-4 h-4" />, color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  // Statuts disponibles pour le filtre
  const availableStatuses = useMemo(() => {
    const statusSet = new Set<string>();
    allVehiculeBons.forEach((b: any) => {
      if (String(b.vehicule_id || '') === String(vehicule?.id || '') && b.statut) {
        statusSet.add(b.statut);
      }
    });
    return Array.from(statusSet).sort((a, b) => a.localeCompare(b));
  }, [allVehiculeBons, vehicule]);

  if (!isOpen || !vehicule) return null;

  const statutInfo = getStatutInfo(vehicule.statut);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[95vw] overflow-y-auto shadow-2xl rounded-none sm:rounded-xl">
        {/* Header moderne avec couleur orange pour véhicules */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-4 sm:rounded-t-xl sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white bg-opacity-20 rounded-lg">
                {getVehiculeIcon(vehicule.type_vehicule)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{vehicule.nom}</h2>
                <p className="text-orange-100 text-sm">
                  {vehicule.marque} {vehicule.modele} • {vehicule.immatriculation}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpenA4(true)}
                className="flex items-center gap-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-4 py-2 rounded-lg transition-colors font-medium border border-white border-opacity-30"
                title="Imprimer situation véhicule (A4)"
              >
                <FileText size={16} />
                Situation A4
              </button>
              <button
                onClick={onClose}
                className="text-white hover:text-orange-200 p-2 rounded-lg hover:bg-white hover:bg-opacity-10 transition-colors"
                title="Fermer"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Informations du véhicule */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Info size={20} className="text-orange-600" />
              Informations du Véhicule
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div>
                <p className="font-semibold text-gray-600">Type:</p>
                <p className="flex items-center gap-2">
                  {getVehiculeIcon(vehicule.type_vehicule)}
                  {vehicule.type_vehicule}
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-600">Capacité:</p>
                <p>{vehicule.capacite_charge ? `${vehicule.capacite_charge} kg` : 'Non spécifiée'}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-600">Année:</p>
                <p>{vehicule.annee || 'Non spécifiée'}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-600">Date de création:</p>
                <p>{formatDateTime((vehicule as any)?.date_creation || vehicule.created_at)}</p>
              </div>
            </div>
            
            {/* Section Statut et Activité */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <DollarSign size={16} />
                Statut et Activité
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 border">
                  <p className="font-semibold text-gray-600 text-sm mb-2">Statut Actuel:</p>
                  <div className="flex items-center gap-2">
                    {statutInfo.icon}
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statutInfo.color}`}>
                      {vehicule.statut}
                    </span>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border">
                  <p className="font-semibold text-gray-600 text-sm">Total Bons:</p>
                  <p className="font-bold text-2xl text-orange-600">{stats.totalBons}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border">
                  <p className="font-semibold text-gray-600 text-sm">Montant Total:</p>
                  <p className="font-bold text-2xl text-green-600">
                    {stats.totalMontant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filtres de date et recherche */}
          <div className="bg-white border rounded-xl p-6 mb-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Search size={20} className="text-orange-600" />
              Filtres et Recherche
              {(dateFrom || dateTo || statusFilter || search) && (
                <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs">
                  Filtres actifs
                </span>
              )}
            </h3>
            
            {/* Ligne 1: Recherche */}
            <div className="mb-4">
              <label htmlFor="search-input" className="block text-sm font-medium text-gray-700 mb-2">Recherche</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  id="search-input"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par numéro, statut, lieu..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            {/* Ligne 2: Filtres de date et statut */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="date-from" className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="date-to" className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="">Tous les statuts</option>
                  {availableStatuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const today = new Date();
                    const thirtyDaysAgo = new Date(today);
                    thirtyDaysAgo.setDate(today.getDate() - 30);
                    setDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
                    setDateTo(today.toISOString().split('T')[0]);
                  }}
                  className="px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  30 derniers jours
                </button>
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setStatusFilter('');
                    setSearch('');
                  }}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>

          {/* Statistiques des bons filtrés */}
          {stats.statuts.size > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {Array.from(stats.statuts.entries()).map(([statut, count]) => (
                <div key={statut} className="bg-white p-4 rounded-xl border border-gray-200">
                  <div className="text-sm text-gray-600">{statut}</div>
                  <div className="text-xl font-bold text-gray-900">{count}</div>
                </div>
              ))}
            </div>
          )}

          {/* Bons du véhicule - cartes responsives */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <FileText size={20} className="text-orange-600" />
                Bons du Véhicule
                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-sm">
                  {stats.totalBons} bons
                </span>
              </h3>
            </div>
            <div className="p-4">
        {bons.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <FileText className="w-12 h-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun bon trouvé</h3>
                    <p className="text-gray-500 max-w-sm">
                      {(() => {
                        if (isLoading) return 'Chargement des bons...';
                        if (dateFrom || dateTo || statusFilter || search) return 'Aucun bon ne correspond aux filtres appliqués.';
                        return 'Aucun bon lié à ce véhicule.';
                      })()}
                    </p>
                  </div>
                </div>
              ) : (
                <>
          {/* Grille mobile 2 colonnes */}
          <div className="sm:hidden grid grid-cols-2 gap-3">
                    {bons.map((bon: any) => (
                      <div key={bon.id} className="bg-white border rounded-lg p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm text-gray-500">N° Bon</div>
                            <div className="text-base font-semibold text-gray-900">
                              {bon.numero || `VEH${String(bon.id).padStart(3, '0')}`}
                            </div>
                            <div className="text-sm text-gray-600">{formatDate(bon.date_creation)}</div>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200 flex-shrink-0">
                            {bon.statut || 'Non défini'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div className="col-span-2">
                            <div className="text-xs text-gray-500">Lieu chargement</div>
                            <div className="flex items-center gap-1 text-gray-800">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              {bon.lieu_chargement || 'Non spécifié'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Montant</div>
                            <div className="font-semibold text-gray-900">
                              {Number(bon.montant_total || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Créé le</div>
                            <div className="text-gray-800">{formatDateTime(bon.date_creation)}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            onClick={() => setPrintBon(bon)}
                            className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Imprimer bon thermal"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Voir détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Grille desktop */}
                  <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {bons.map((bon: any) => (
                      <div key={bon.id} className="bg-white border rounded-lg p-5 shadow-sm hover:shadow transition-shadow">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-xs text-gray-500">N° Bon</div>
                            <div className="text-lg font-semibold text-gray-900">
                              {bon.numero || `VEH${String(bon.id).padStart(3, '0')}`}
                            </div>
                            <div className="text-sm text-gray-600">{formatDate(bon.date_creation)}</div>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                            {bon.statut || 'Non défini'}
                          </span>
                        </div>
                        <div className="mt-4 space-y-2 text-sm">
                          <div className="flex items-center text-gray-700">
                            <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                            {bon.lieu_chargement || 'Non spécifié'}
                          </div>
                          <div className="font-semibold text-gray-900">
                            {Number(bon.montant_total || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            onClick={() => setPrintBon(bon)}
                            className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Imprimer bon thermal"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Voir détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        <ThermalPrintModal
          isOpen={!!printBon}
          onClose={() => setPrintBon(null)}
          bon={printBon}
          type={'Vehicule'}
        />

        <VehiculePrintModal
          isOpen={openA4}
          onClose={() => setOpenA4(false)}
          vehicule={vehicule}
          bons={bons}
        />
      </div>
    </div>
  );
};

export default VehiculeDetailsModal;
