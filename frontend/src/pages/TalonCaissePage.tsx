import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Eye, 
  Trash2, 
  Clock,
  XCircle,
  X,
  CreditCard, 
  DollarSign,
  Receipt,
  Calendar,
  User,
  FileText,
  CheckCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import type { Payment, Talon } from '../types';
import { useGetPaymentsQuery, useDeletePaymentMutation, useChangePaymentStatusMutation } from '../store/api/paymentsApi';
import { useGetTalonsQuery } from '../store/api/talonsApi';
import { showSuccess, showError, showConfirmation } from '../utils/notifications';
import { formatDateTimeWithHour } from '../utils/dateUtils';

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

const TalonCaissePage = () => {
  const toggleStatusFilter = (s: StatusType) => {
    setStatusFilter((prev) => (prev.length === 1 && prev[0] === s ? [] : [s]));
  };
  // États locaux
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState<'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Traite'>('all');
  const [selectedTalonFilter, setSelectedTalonFilter] = useState<string>('');
  const [onlyDueSoon, setOnlyDueSoon] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  // Sorting
  const [sortField, setSortField] = useState<'numero' | 'talon' | 'montant' | 'date' | 'echeance' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // RTK Query hooks
  const { data: allPayments = [], isLoading: paymentsLoading } = useGetPaymentsQuery();
  const { data: talons = [], isLoading: talonsLoading } = useGetTalonsQuery(undefined);
  const [deletePaymentApi] = useDeletePaymentMutation();
  const [changePaymentStatusApi] = useChangePaymentStatusMutation();

  // Filtrer uniquement les paiements avec talon_id
  const talonPayments = useMemo(() => {
    return allPayments.filter((payment: any) => payment.talon_id);
  }, [allPayments]);

  // Handle sorting
  const handleSort = (field: 'numero' | 'talon' | 'montant' | 'date' | 'echeance') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };  // Helper: est en échéance proche (<= 5 jours) par rapport à aujourd'hui
  const isDueSoon = (payment: any) => {
    if (!payment?.date_echeance) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(payment.date_echeance);
    if (isNaN(due.getTime())) return false;
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    // <= 5 jours restants (inclut en retard: diffDays <= 0)
    return diffDays <= 5;
  };

  // Statistiques
  const statistiques = useMemo(() => {
    const total = talonPayments.length;
    const validés = talonPayments.filter((p: any) => p.statut === 'Validé').length;
    const enAttente = talonPayments.filter((p: any) => p.statut === 'En attente').length;
    const montantTotal = talonPayments.reduce((sum: number, p: any) => sum + Number(p.montant_total || 0), 0);
    const echeanceProche = talonPayments.filter((p: any) => isDueSoon(p)).length;
    
    return { total, validés, enAttente, montantTotal, echeanceProche };
  }, [talonPayments]);

  // Filtrage des paiements
  const filteredPayments = useMemo(() => {
    let filtered = talonPayments;

    // Filtre par terme de recherche
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((payment: any) => {
        const displayPayNum = `pay${String(payment.id).padStart(2, '0')}`.toLowerCase();
        const talonName = talons.find((t: Talon) => t.id === payment.talon_id)?.nom?.toLowerCase() || '';
        
        return displayPayNum.includes(term) ||
               String(payment.mode_paiement || '').toLowerCase().includes(term) ||
               String(payment.statut || '').toLowerCase().includes(term) ||
               talonName.includes(term) ||
               String(payment.montant_total || '').includes(term);
      });
    }

    // Filtre par date
    if (dateFilter) {
      filtered = filtered.filter((payment: any) => {
        const paymentDate = payment.date_paiement ? payment.date_paiement.slice(0, 10) : '';
        return paymentDate === dateFilter;
      });
    }

    // Filtre par statut
    if (statusFilter.length > 0) {
      filtered = filtered.filter((payment: any) => statusFilter.includes(payment.statut || 'En attente'));
    }

    // Filtre par mode de paiement
    if (modeFilter !== 'all') {
      filtered = filtered.filter((payment: any) => payment.mode_paiement === modeFilter);
    }

    // Filtre par talon
    if (selectedTalonFilter) {
      filtered = filtered.filter((payment: any) => String(payment.talon_id) === selectedTalonFilter);
    }

    // Filtre: seulement échéance ≤ 5 jours
    if (onlyDueSoon) {
      filtered = filtered.filter((p: any) => isDueSoon(p));
    }

    // Apply sorting if specified
    if (sortField) {
      filtered = [...filtered].sort((a: any, b: any) => {
        let aValue: any;
        let bValue: any;

        const getTalonName = (talonId: number) => {
          const talon = talons.find((t: Talon) => t.id === talonId);
          return talon ? talon.nom : `Talon #${talonId}`;
        };

        switch (sortField) {
          case 'numero':
            aValue = `pay${String(a.id).padStart(2, '0')}`.toLowerCase();
            bValue = `pay${String(b.id).padStart(2, '0')}`.toLowerCase();
            break;
          case 'talon':
            aValue = getTalonName(a.talon_id).toLowerCase();
            bValue = getTalonName(b.talon_id).toLowerCase();
            break;
          case 'montant':
            aValue = Number(a.montant_total || 0);
            bValue = Number(b.montant_total || 0);
            break;
          case 'date':
            aValue = new Date(a.date_paiement || 0).getTime();
            bValue = new Date(b.date_paiement || 0).getTime();
            break;
          case 'echeance':
            aValue = a.date_echeance ? new Date(a.date_echeance).getTime() : Number.POSITIVE_INFINITY;
            bValue = b.date_echeance ? new Date(b.date_echeance).getTime() : Number.POSITIVE_INFINITY;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sorting: Prioriser les paiements avec échéance proche, puis trier par date d'échéance croissante
      filtered = [...filtered].sort((a: any, b: any) => {
        const aDue = isDueSoon(a);
        const bDue = isDueSoon(b);
        if (aDue !== bDue) return aDue ? -1 : 1;
        const aTs = a.date_echeance ? new Date(a.date_echeance).getTime() : Number.POSITIVE_INFINITY;
        const bTs = b.date_echeance ? new Date(b.date_echeance).getTime() : Number.POSITIVE_INFINITY;
        return aTs - bTs;
      });
    }

    return filtered;
  }, [talonPayments, searchTerm, dateFilter, statusFilter, modeFilter, selectedTalonFilter, onlyDueSoon, sortField, sortDirection, talons]);

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

  // (dropdown removed) – no outside-click handler needed

  // Fonctions utilitaires
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

  const getTalonName = (talonId: number) => {
    const talon = talons.find((t: Talon) => t.id === talonId);
    return talon ? talon.nom : `Talon #${talonId}`;
  };

  // Fonctions de gestion
  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce paiement ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deletePaymentApi({ id }).unwrap();
        showSuccess('Paiement supprimé avec succès');
      } catch (error: any) {
        console.error('Erreur lors de la suppression:', error);
        showError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
      }
    }
  };

  const handleChangeStatus = async (payment: any, newStatus: string) => {
    try {
      await changePaymentStatusApi({ id: payment.id, statut: newStatus }).unwrap();
      showSuccess(`Statut mis à jour: ${newStatus}`);
    } catch (error: any) {
      console.error('Erreur lors du changement de statut:', error);
      showError(`Erreur lors du changement de statut: ${error.message || 'Erreur inconnue'}`);
    }
  };

  // (bulk status actions removed)

  const handleViewPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsViewModalOpen(true);
  };

  // (status filter now handled via multi-select)

  if (paymentsLoading || talonsLoading) {
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
                        `<tr><td>PAY${String(p.id).padStart(2, '0')}</td><td>${getTalonName(p.talon_id)}</td><td>${Number(p.montant_total || 0).toFixed(2)} DH</td><td>${p.mode_paiement}</td><td>${p.statut || 'En attente'}</td><td>${new Date(p.date_paiement).toLocaleDateString('fr-FR')}</td><td>${p.date_echeance ? new Date(p.date_echeance).toLocaleDateString('fr-FR') : ''}</td></tr>`
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
              <p className="text-3xl font-bold text-gray-900">{statistiques.montantTotal.toFixed(2)} DH</p>
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
                        {talonPayments.length === 0 
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
                        PAY{String(payment.id).padStart(2, '0')}
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
                        {Number(payment.montant_total || 0).toFixed(2)} DH
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getModeIcon(payment.mode_paiement)}
                        <span className="text-sm text-gray-900">{payment.mode_paiement}</span>
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
                          onClick={() => handleDelete(payment.id)}
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
      {isViewModalOpen && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Détails du paiement PAY{String(selectedPayment.id).padStart(2, '0')}
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
                  <p className="text-gray-900">{selectedPayment.talon_id ? getTalonName(selectedPayment.talon_id) : 'Aucun talon'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Montant</div>
                  <p className="text-gray-900">{Number(selectedPayment.montant_total || 0).toFixed(2)} DH</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Mode de paiement</div>
                  <p className="text-gray-900">{selectedPayment.mode_paiement}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Statut</div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(selectedPayment.statut || 'En attente')}`}>
                    {selectedPayment.statut || 'En attente'}
                  </span>
                </div>
                <div>
                  <div className="block text-sm font-medium text-gray-600">Date de paiement</div>
                  <p className="text-gray-900">{formatDateTimeWithHour(selectedPayment.date_paiement)}</p>
                </div>
                {selectedPayment.date_echeance && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Date d'échéance</div>
                    <p className="text-gray-900">{formatDateTimeWithHour(selectedPayment.date_echeance)}</p>
                  </div>
                )}
                {selectedPayment.banque && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Banque</div>
                    <p className="text-gray-900">{selectedPayment.banque}</p>
                  </div>
                )}
                {selectedPayment.personnel && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Personnel</div>
                    <p className="text-gray-900">{selectedPayment.personnel}</p>
                  </div>
                )}
                {selectedPayment.code_reglement && (
                  <div>
                    <div className="block text-sm font-medium text-gray-600">Code règlement</div>
                    <p className="text-gray-900">{selectedPayment.code_reglement}</p>
                  </div>
                )}
                {selectedPayment.notes && (
                  <div className="col-span-2">
                    <div className="block text-sm font-medium text-gray-600">Notes</div>
                    <p className="text-gray-900">{selectedPayment.notes}</p>
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
