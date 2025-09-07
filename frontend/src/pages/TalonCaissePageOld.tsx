import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  Receipt,
  Search,
  Trash2,
  X,
  XCircle,
  Clock,
  User,
} from 'lucide-react';
import type { Talon, OldTalonCaisse } from '../types';
import { useGetTalonsQuery } from '../store/api/talonsApi';
import {
  useGetOldTalonsCaisseQuery,
  useDeleteOldTalonCaisseMutation,
  useChangeOldTalonCaisseStatusMutation,
} from '../store/slices/oldTalonsCaisseSlice';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { formatDateTimeWithHour } from '../utils/dateUtils';

// Interface unifiée (old only)
interface UnifiedTalonPayment {
  id: string; // ex: "old-12"
  type: 'old';
  numero?: string; // affichage (PAYxx)
  date_paiement: string | null;
  montant_total: number;
  statut: StatusType;
  talon_id: number;
  // Champs spécifiques old
  fournisseur?: string;
  numero_cheque?: string | null;
  date_cheque?: string | null;
  banque?: string;
  mode_paiement?: 'Chèque';
  designation?: string;
  date_echeance?: string | null; // alias de date_cheque pour l'affichage générique
  personnel?: string;
  code_reglement?: string;
  originalOldTalon: OldTalonCaisse;
}

// Types & constants for status badges
type StatusType = 'En attente' | 'Validé' | 'Refusé' | 'Annulé';
const STATUS_BASE: Record<StatusType, string> = {
  'Validé': 'border-green-300 text-green-800',
  'En attente': 'border-yellow-300 text-yellow-800',
  'Refusé': 'border-orange-300 text-orange-800',
  'Annulé': 'border-red-300 text-red-800',
};
const STATUS_BG_SELECTED: Record<StatusType, string> = {
  'Validé': 'bg-green-100',
  'En attente': 'bg-yellow-100',
  'Refusé': 'bg-orange-100',
  'Annulé': 'bg-red-100',
};
const STATUS_BG_UNSELECTED: Record<StatusType, string> = {
  'Validé': 'bg-green-50 hover:bg-green-100',
  'En attente': 'bg-yellow-50 hover:bg-yellow-100',
  'Refusé': 'bg-orange-50 hover:bg-orange-100',
  'Annulé': 'bg-red-50 hover:bg-red-100',
};

function StatusBadgeToggle(props: Readonly<{
  status: StatusType;
  selected: boolean;
  onToggle: (s: StatusType) => void;
}>) {
  const { status, selected, onToggle } = props;
  const base = STATUS_BASE[status];
  const bg = selected ? STATUS_BG_SELECTED[status] : STATUS_BG_UNSELECTED[status];
  return (
    <button
      type="button"
      onClick={() => onToggle(status)}
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors ${base} ${bg}`}
      title={`Filtrer: ${status}`}
    >
      {status}
    </button>
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
const TalonCaissePage = () => {
  // Data
  const { data: talons = [], isLoading: talonsLoading } = useGetTalonsQuery(undefined);
  const { data: oldTalons = [], isLoading: oldTalonsLoading } = useGetOldTalonsCaisseQuery();
  const [deleteOldTalonCaisseApi] = useDeleteOldTalonCaisseMutation();
  const [changeOldTalonCaisseStatusApi] = useChangeOldTalonCaisseStatusMutation();

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusType[]>([]);
  const [modeFilter, setModeFilter] = useState<'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Traite'>('all');
  const [selectedTalonFilter, setSelectedTalonFilter] = useState('');
  const [onlyDueSoon, setOnlyDueSoon] = useState(false);
  const [sortField, setSortField] = useState<'numero' | 'talon' | 'montant' | 'date' | 'echeance' | ''>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const toggleStatusFilter = (s: StatusType) => {
    setStatusFilter((prev) => (prev.length === 1 && prev[0] === s ? [] : [s]));
  };

  const handleSort = (field: 'numero' | 'talon' | 'montant' | 'date' | 'echeance') => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Unifier (old only)
  const unifiedPayments: UnifiedTalonPayment[] = useMemo(() => {
    return oldTalons.map((o) => ({
      id: `old-${o.id}`,
      type: 'old',
      numero: `PAY${String(o.id).padStart(2, '0')}`,
      date_paiement: o.date_paiement,
      montant_total: Number(o.montant_cheque || 0),
      statut: o.validation || 'En attente',
      talon_id: o.id_talon,
      fournisseur: o.fournisseur,
      numero_cheque: o.numero_cheque ?? null,
      date_cheque: o.date_cheque ?? null,
      banque: o.banque,
      mode_paiement: 'Chèque',
      date_echeance: o.date_cheque ?? null,
      personnel: o.personne,
      code_reglement: undefined,
      designation: o.factures,
      originalOldTalon: o,
    }));
  }, [oldTalons]);

  // Utils
  const isDueSoon = (obj: { date_echeance?: string | null; date_cheque?: string | null } | UnifiedTalonPayment) => {
    const dateStr = (obj as any).date_echeance ?? (obj as any).date_cheque ?? null;
    if (!dateStr) return false;
    const now = new Date();
    const due = new Date(dateStr);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 5;
  };

  const getTalonName = (talonId: number) => {
    const talon = talons.find((t: Talon) => t.id === talonId);
    return talon ? talon.nom : `Talon #${talonId}`;
  };

  // Statistiques
  const statistiques = useMemo(() => {
    const total = unifiedPayments.length;
    const valides = unifiedPayments.filter((p) => p.statut === 'Validé').length;
    const enAttente = unifiedPayments.filter((p) => p.statut === 'En attente').length;
    const montantTotal = unifiedPayments.reduce((sum, p) => sum + (Number(p.montant_total) || 0), 0);
    const echeanceProche = unifiedPayments.filter((p) => isDueSoon(p)).length;
    return { total, validés: valides, enAttente, montantTotal, echeanceProche };
  }, [unifiedPayments]);

  // Filtrage des paiements unifiés
  const filteredPayments = useMemo(() => {
    let filtered = [...unifiedPayments];

    // Recherche
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((p) => {
        const numero = (p.numero || '').toLowerCase();
        const talonName = getTalonName(p.talon_id).toLowerCase();
        const statut = (p.statut || '').toLowerCase();
        const montant = String(p.montant_total);
        return (
          numero.includes(term) ||
          talonName.includes(term) ||
          statut.includes(term) ||
          montant.includes(term) ||
          (p.fournisseur || '').toLowerCase().includes(term) ||
          (p.numero_cheque || '').toLowerCase().includes(term)
        );
      });
    }

    // Date
    if (dateFilter) {
      filtered = filtered.filter((p) => (p.date_paiement ? p.date_paiement.slice(0, 10) === dateFilter : false));
    }

    // Statut
    if (statusFilter.length > 0) {
      filtered = filtered.filter((p) => statusFilter.includes(p.statut));
    }

    // Mode (les old = Chèque)
    if (modeFilter !== 'all') {
      if (modeFilter === 'Chèque') {
        filtered = filtered.filter((p) => p.mode_paiement === 'Chèque');
      } else {
        filtered = [];
      }
    }

    // Talon
    if (selectedTalonFilter) {
      filtered = filtered.filter((p) => String(p.talon_id) === selectedTalonFilter);
    }

    // Échéance proche
    if (onlyDueSoon) {
      filtered = filtered.filter((p) => isDueSoon(p));
    }

    // Tri
    if (sortField) {
      filtered.sort((a, b) => {
        let aVal: any = '';
        let bVal: any = '';
        switch (sortField) {
          case 'numero':
            aVal = (a.numero || '').toLowerCase();
            bVal = (b.numero || '').toLowerCase();
            break;
          case 'talon':
            aVal = getTalonName(a.talon_id).toLowerCase();
            bVal = getTalonName(b.talon_id).toLowerCase();
            break;
          case 'montant':
            aVal = a.montant_total;
            bVal = b.montant_total;
            break;
          case 'date':
            aVal = a.date_paiement ? new Date(a.date_paiement).getTime() : 0;
            bVal = b.date_paiement ? new Date(b.date_paiement).getTime() : 0;
            break;
          case 'echeance':
            aVal = a.date_echeance ? new Date(a.date_echeance).getTime() : Number.POSITIVE_INFINITY;
            bVal = b.date_echeance ? new Date(b.date_echeance).getTime() : Number.POSITIVE_INFINITY;
            break;
        }
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Par défaut: échéance proche d'abord, puis date d'échéance croissante
      filtered.sort((a, b) => {
        const aDue = a.date_echeance ? isDueSoon({ date_echeance: a.date_echeance }) : false;
        const bDue = b.date_echeance ? isDueSoon({ date_echeance: b.date_echeance }) : false;
        if (aDue !== bDue) return aDue ? -1 : 1;
        const aTs = a.date_echeance ? new Date(a.date_echeance).getTime() : Number.POSITIVE_INFINITY;
        const bTs = b.date_echeance ? new Date(b.date_echeance).getTime() : Number.POSITIVE_INFINITY;
        return aTs - bTs;
      });
    }

    return filtered;
  }, [unifiedPayments, searchTerm, dateFilter, statusFilter, modeFilter, selectedTalonFilter, onlyDueSoon, sortField, sortDirection, talons]);

  // Pagination
  const totalItems = filteredPayments.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex);

  // Réinitialiser la page lors des changements de filtres
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, statusFilter, modeFilter, selectedTalonFilter, onlyDueSoon]);

  // (dropdown removed)

  // UI utils
  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'Espèces':
        return <DollarSign size={16} className="text-green-600" />;
      case 'Chèque':
        return <Receipt size={16} className="text-blue-600" />;
      case 'Virement':
        return <CreditCard size={16} className="text-purple-600" />;
      case 'Traite':
        return <Receipt size={16} className="text-orange-600" />;
      default:
        return <DollarSign size={16} className="text-gray-600" />;
    }
  };

  const getStatusIcon = (statut: string) => {
    switch (statut) {
      case 'Validé':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'En attente':
        return <Clock size={16} className="text-yellow-600" />;
      case 'Refusé':
        return <X size={16} className="text-orange-600" />;
      case 'Annulé':
        return <XCircle size={16} className="text-red-600" />;
      default:
        return <Clock size={16} className="text-gray-600" />;
    }
  };

  const getStatusColor = (statut: string) => {
    switch (statut) {
      case 'Validé':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'En attente':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Refusé':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Annulé':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Fonctions de gestion
  const handleDelete = async (unifiedPayment: UnifiedTalonPayment) => {
    const type = 'ancien talon caisse';
    const result = await showConfirmation(
      'Cette action est irréversible.',
      `Êtes-vous sûr de vouloir supprimer ce ${type} ?`,
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deleteOldTalonCaisseApi({ id: unifiedPayment.originalOldTalon.id }).unwrap();
        showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} supprimé avec succès`);
      } catch (error: any) {
        console.error('Erreur lors de la suppression:', error);
        showError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
      }
    }
  };

  const handleChangeStatus = async (unifiedPayment: UnifiedTalonPayment, newStatus: string) => {
    try {
      await changeOldTalonCaisseStatusApi({ 
        id: unifiedPayment.originalOldTalon.id, 
        validation: newStatus as 'Validé' | 'En attente' | 'Refusé' | 'Annulé'
      }).unwrap();
      showSuccess(`Statut mis à jour: ${newStatus}`);
    } catch (error: any) {
      console.error('Erreur lors du changement de statut:', error);
      showError(`Erreur lors du changement de statut: ${error.message || 'Erreur inconnue'}`);
    }
  };

  // Modal
  const [selectedUnifiedPayment, setSelectedUnifiedPayment] = useState<UnifiedTalonPayment | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const handleViewPayment = (unifiedPayment: UnifiedTalonPayment) => {
    setSelectedUnifiedPayment(unifiedPayment);
    setIsViewModalOpen(true);
  };

  // (status filter now handled via multi-select)

  if (talonsLoading || oldTalonsLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <span className="ml-3 text-gray-600">Chargement des paiements talon...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Talon Caisse</h1>
            <p className="text-gray-600 mt-1">Gestion des paiements liés aux talons</p>
          </div>
          <button
            onClick={() => {
              const printContent = `
                <html>
                  <head>
                    <title>Rapport Talon Caisse</title>
                    <style>
                      body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
                      h1, h2, h3 { color: #333; margin-bottom: 10px; }
                      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                      th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
                      th { background-color: #f5f5f5; font-weight: bold; }
                      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f97316; padding-bottom: 15px; }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <h1>💳 RAPPORT TALON CAISSE</h1>
                      <p>Date: ${new Date().toLocaleDateString('fr-FR')}</p>
                    </div>
                    <table>
                      <tr><th>N° Paiement</th><th>Talon</th><th>Montant</th><th>Mode</th><th>Statut</th><th>Date</th><th>Échéance</th></tr>
                      ${filteredPayments.map((p: any) => 
                        `<tr><td>${p.numero || ''}</td><td>${getTalonName(p.talon_id)}</td><td>${Number(p.montant_total || 0)} DH</td><td>${p.mode_paiement || 'Chèque'}</td><td>${p.statut || 'En attente'}</td><td>${p.date_paiement ? new Date(p.date_paiement).toLocaleDateString('fr-FR') : ''}</td><td>${p.date_echeance ? new Date(p.date_echeance).toLocaleDateString('fr-FR') : ''}</td></tr>`
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
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
          >
            <FileText size={16} />
            Imprimer Rapport ({filteredPayments.length})
          </button>
        </div>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <Calendar className="w-6 h-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Échéance ≤ 5 jours</p>
              <p className="text-3xl font-bold text-gray-900">{statistiques.echeanceProche}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Paiements</p>
              <p className="text-3xl font-bold text-gray-900">{statistiques.total}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Validés</p>
              <p className="text-3xl font-bold text-gray-900">{statistiques.validés}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">En Attente</p>
              <p className="text-3xl font-bold text-gray-900">{statistiques.enAttente}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Montant Total</p>
              <p className="text-3xl font-bold text-gray-900">{statistiques.montantTotal} DH</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres */}
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label htmlFor="search_filter" className="block text-sm text-gray-600 mb-1">Recherche</label>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                id="search_filter"
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="talon_filter" className="block text-sm text-gray-600 mb-1">Talon</label>
            <select
              id="talon_filter"
              value={selectedTalonFilter}
              onChange={(e) => setSelectedTalonFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">Tous les talons</option>
              {talons.map((talon: Talon) => (
                <option key={talon.id} value={talon.id}>
                  {talon.nom}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="mode_filter" className="block text-sm text-gray-600 mb-1">Mode</label>
            <select
              id="mode_filter"
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="all">Tous les modes</option>
              <option value="Espèces">Espèces</option>
              <option value="Chèque">Chèque</option>
              <option value="Virement">Virement</option>
              <option value="Traite">Traite</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="date_filter" className="block text-sm text-gray-600 mb-1">Date</label>
            <input
              id="date_filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          
          <div className="flex gap-4 items-start flex-wrap">
            {/* Statut: badges colorés */}
            <div className="flex flex-col gap-2">
              <span className="text-sm text-gray-600">Statut</span>
              <div className="flex flex-wrap gap-2">
                {(['En attente', 'Validé', 'Refusé', 'Annulé'] as const).map((s) => (
                  <StatusBadgeToggle
                    key={s}
                    status={s}
                    selected={statusFilter.includes(s)}
                    onToggle={toggleStatusFilter}
                  />
                ))}
                {/* Raccourcis */}
                <button
                  type="button"
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100"
                  onClick={() => setStatusFilter([])}
                  title="Afficher tous les statuts"
                >
                  Tous
                </button>
                {/* Single-select mode: keep only clear button */}
              </div>
            </div>

            {/* Échéance ≤ 5j */}
            <div className="flex flex-col gap-2">
              <span className="text-sm text-gray-600">Échéance</span>
              <button
                onClick={() => setOnlyDueSoon((prev) => !prev)}
                className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                  onlyDueSoon
                    ? 'bg-red-100 text-red-800 border-red-300'
                    : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                }`}
                title="Voir seulement les paiements avec échéance ≤ 5 jours"
              >
                Échéance ≤ 5j
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-4 flex justify-start items-center">
          <button
            onClick={() => {
              setSearchTerm('');
              setDateFilter('');
              setStatusFilter([]);
              setModeFilter('all');
              setSelectedTalonFilter('');
              setOnlyDueSoon(false);
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Réinitialiser les filtres
          </button>
        </div>
      </div>

      {/* Contrôles de pagination */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} paiements
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

      {/* Tableau des paiements */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('numero')}
                >
                  <div className="flex items-center gap-1">
                    N° Paiement
                    {sortField === 'numero' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('talon')}
                >
                  <div className="flex items-center gap-1">
                    Talon
                    {sortField === 'talon' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('montant')}
                >
                  <div className="flex items-center gap-1">
                    Montant
                    {sortField === 'montant' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Mode
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Statut
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    {sortField === 'date' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('echeance')}
                >
                  <div className="flex items-center gap-1">
                    Échéance
                    {sortField === 'echeance' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <FileText className="w-12 h-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun paiement trouvé</h3>
                      <p className="text-gray-500 max-w-sm">
                        {unifiedPayments.length === 0 
                          ? "Aucun paiement avec talon associé n'a été trouvé." 
                          : "Aucun paiement ne correspond à vos critères de recherche."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((payment: any) => (
                  <tr key={payment.id} className={`transition-colors ${isDueSoon(payment) ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-orange-50'}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {payment.numero}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center border border-orange-200">
                            <User className="w-5 h-5 text-orange-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {getTalonName(payment.talon_id)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {Number(payment.montant_total || 0)} DH
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getModeIcon(payment.mode_paiement || 'Chèque')}
                        <span className="text-sm text-gray-900">{payment.mode_paiement || 'Chèque'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(payment.statut || 'En attente')}
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(payment.statut || 'En attente')}`}>
                            {payment.statut || 'En attente'}
                          </span>
                        </div>
                        {/* Actions statut sur une nouvelle ligne */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleChangeStatus(payment, 'En attente')}
                            title="Mettre en attente"
                            className={`p-1 rounded ${payment.statut === 'En attente' ? 'text-yellow-700' : 'text-gray-500 hover:text-yellow-700'} hover:bg-yellow-50`}
                            disabled={payment.statut === 'En attente'}
                          >
                            <Clock size={14} />
                          </button>
                          <button
                            onClick={() => handleChangeStatus(payment, 'Validé')}
                            title="Valider"
                            className={`p-1 rounded ${payment.statut === 'Validé' ? 'text-green-700' : 'text-gray-500 hover:text-green-700'} hover:bg-green-50`}
                            disabled={payment.statut === 'Validé'}
                          >
                            <CheckCircle size={14} />
                          </button>
                          <button
                            onClick={() => handleChangeStatus(payment, 'Refusé')}
                            title="Refuser"
                            className={`p-1 rounded ${payment.statut === 'Refusé' ? 'text-orange-600' : 'text-gray-500 hover:text-orange-600'} hover:bg-orange-50`}
                            disabled={payment.statut === 'Refusé'}
                          >
                            <X size={14} />
                          </button>
                          <button
                            onClick={() => handleChangeStatus(payment, 'Annulé')}
                            title="Annuler"
                            className={`p-1 rounded ${payment.statut === 'Annulé' ? 'text-red-700' : 'text-gray-500 hover:text-red-700'} hover:bg-red-50`}
                            disabled={payment.statut === 'Annulé'}
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                        <span>{formatDateTimeWithHour(payment.date_paiement)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm">
                        {payment.date_echeance ? (
                          <>
                            <Calendar className={`w-4 h-4 mr-2 ${isDueSoon(payment) ? 'text-red-500' : 'text-gray-400'}`} />
                            <span className={`${isDueSoon(payment) ? 'text-red-700 font-semibold' : 'text-gray-900'}`}>
                              {formatDateTimeWithHour(payment.date_echeance)}
                            </span>
                            {isDueSoon(payment) && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                URGENT
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleViewPayment(payment)}
                          className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Voir détails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(payment)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
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

      {/* Navigation de pagination */}
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

      {/* Modal de visualisation */}
    {isViewModalOpen && selectedUnifiedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
        Détails du paiement {selectedUnifiedPayment.numero}
              </h2>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="block text-sm font-medium text-gray-600">Talon associé</div>
          <p className="text-gray-900">{selectedUnifiedPayment.talon_id ? getTalonName(selectedUnifiedPayment.talon_id) : 'Aucun talon'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Montant</div>
          <p className="text-gray-900">{Number(selectedUnifiedPayment.montant_total || 0)} DH</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Mode de paiement</div>
          <p className="text-gray-900">{selectedUnifiedPayment.mode_paiement || 'Chèque'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Statut</div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(selectedUnifiedPayment.statut || 'En attente')}`}>
          {selectedUnifiedPayment.statut || 'En attente'}
                  </span>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Date de paiement</div>
          <p className="text-gray-900">{selectedUnifiedPayment.date_paiement ? formatDateTimeWithHour(selectedUnifiedPayment.date_paiement) : ''}</p>
                </div>
        {selectedUnifiedPayment.date_echeance && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Date d'échéance</div>
          <p className="text-gray-900">{formatDateTimeWithHour(selectedUnifiedPayment.date_echeance)}</p>
                  </div>
                )}
        {selectedUnifiedPayment.banque && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Banque</div>
          <p className="text-gray-900">{selectedUnifiedPayment.banque}</p>
                  </div>
                )}
        {selectedUnifiedPayment.personnel && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Personnel</div>
          <p className="text-gray-900">{selectedUnifiedPayment.personnel}</p>
                  </div>
                )}
        {selectedUnifiedPayment.code_reglement && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Code règlement</div>
          <p className="text-gray-900">{selectedUnifiedPayment.code_reglement}</p>
                  </div>
                )}
        {(selectedUnifiedPayment.designation || selectedUnifiedPayment.numero_cheque) && (
                  <div className="col-span-2">
          <div className="block text-sm font-medium text-gray-600">Détails</div>
          <p className="text-gray-900">{[selectedUnifiedPayment.designation, selectedUnifiedPayment.numero_cheque].filter(Boolean).join(' — ')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TalonCaissePage;
