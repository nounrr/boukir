import React, { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  FileText,
  DollarSign,
  CheckCircle,
  Clock,
  X,
  XCircle,
  Receipt,
  CreditCard,
  Eye,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
// Payments API not used in this view
import { useGetTalonsQuery } from '../store/api/talonsApi';
import { useGetOldTalonsCaisseQuery, useDeleteOldTalonCaisseMutation, useChangeOldTalonCaisseStatusMutation } from '../store/slices/oldTalonsCaisseSlice';
import type { Payment, Talon, OldTalonCaisse } from '../types';
import { canModifyPayments } from '../utils/permissions';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

// Interface unifiée pour afficher les paiements talon
interface UnifiedTalonPayment {
  id: string; // Unique identifier (payment:id ou old:id)
  type: 'payment' | 'old'; // Type pour différencier
  numero?: string; // Numéro du paiement (pour payments)
  date_paiement: string | null;
  montant_total: number;
  statut: string;
  talon_id: number;
  // Champs spécifiques aux anciens talons
  fournisseur?: string;
  numero_cheque?: string;
  date_cheque?: string;
  banque?: string;
  // Champs spécifiques aux paiements normaux
  mode_paiement?: string;
  designation?: string;
  date_echeance?: string;
  personnel?: string;
  code_reglement?: string;
  // Données originales
  originalPayment?: Payment;
  originalOldTalon?: OldTalonCaisse;
}

// Types & constants for status badges
type StatusType = 'En attente' | 'Validé' | 'Refusé' | 'Annulé';

const TalonCaissePage = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  
  // États locaux
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState<'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Traite'>('all');
  const [selectedTalonFilter, setSelectedTalonFilter] = useState<string>('');
  const [onlyDueSoon, setOnlyDueSoon] = useState<boolean>(false);

  // Options de statuts disponibles (utilisé dans le select)
  const statusOptions: StatusType[] = ['En attente', 'Validé', 'Refusé', 'Annulé'];
  
  // Sorting
  const [sortField, setSortField] = useState<'numero' | 'talon' | 'montant' | 'date' | 'echeance' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // État pour la visualisation
  const [selectedUnifiedPayment, setSelectedUnifiedPayment] = useState<UnifiedTalonPayment | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // RTK Query hooks
  // Désactivé: cette vue n'affiche plus les paiements récents
  // const { data: allPayments = [], isLoading: paymentsLoading } = useGetPaymentsQuery();
  const { data: talons = [], isLoading: talonsLoading } = useGetTalonsQuery(undefined);
  const { data: oldTalonsCaisse = [], isLoading: oldTalonsLoading } = useGetOldTalonsCaisseQuery();
  
  const [deleteOldTalonCaisseApi] = useDeleteOldTalonCaisseMutation();
  const [changeOldTalonCaisseStatusApi] = useChangeOldTalonCaisseStatusMutation();

  // Unifier les paiements talon normaux et les anciens talons caisse
  const unifiedPayments = useMemo(() => {
    const unified: UnifiedTalonPayment[] = [];
    // N'inclure que les anciens talons caisse
    oldTalonsCaisse.forEach((oldTalon: OldTalonCaisse) => {
      unified.push({
        id: `old:${oldTalon.id}`,
        type: 'old',
        numero: `OLD${String(oldTalon.id).padStart(2, '0')}`,
        date_paiement: oldTalon.date_paiement,
        montant_total: Number(oldTalon.montant_cheque || 0),
        statut: oldTalon.validation,
        talon_id: oldTalon.id_talon,
        fournisseur: oldTalon.fournisseur,
        numero_cheque: oldTalon.numero_cheque || undefined,
        date_cheque: oldTalon.date_cheque || undefined,
        banque: oldTalon.banque,
        originalOldTalon: oldTalon
      });
    });
    return unified;
  }, [oldTalonsCaisse]);

  // Handle sorting
  const handleSort = (field: 'numero' | 'talon' | 'montant' | 'date' | 'echeance') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper: est en échéance proche (<= 5 jours) par rapport à aujourd'hui
  const isDueSoon = (payment: any) => {
    if (!payment?.date_echeance) return false;
    if (payment.statut === 'Validé') return false; // exclure les validés
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(payment.date_echeance);
    if (isNaN(due.getTime())) return false;
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 5;
  };

  // Helper: formater une date ou afficher le texte tel quel
  const formatDateOrText = (dateValue: string | undefined | null) => {
    if (!dateValue) return '-';
    
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      // Ce n'est pas une date valide, afficher le texte tel quel
      return dateValue;
    }
    
    // C'est une date valide, la formater
    return date.toLocaleDateString('fr-FR');
  };

  // Helper: vérifier si une valeur est une date valide
  const isValidDate = (dateValue: string | undefined | null): boolean => {
    if (!dateValue) return false;
    const date = new Date(dateValue);
    return !isNaN(date.getTime());
  };

  // Filtrage des paiements unifiés
  const filteredPayments = useMemo(() => {
    let filtered = unifiedPayments;

    // Filtre par terme de recherche
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((payment) => {
        const numero = payment.numero?.toLowerCase() || '';
        const talonName = talons.find((t: Talon) => t.id === payment.talon_id)?.nom?.toLowerCase() || '';
        const statut = payment.statut.toLowerCase();
        const montant = String(payment.montant_total);
        
        // Recherche spécifique selon le type
        if (payment.type === 'payment') {
          return numero.includes(term) ||
                 (payment.mode_paiement || '').toLowerCase().includes(term) ||
                 statut.includes(term) ||
                 talonName.includes(term) ||
                 montant.includes(term) ||
                 (payment.designation || '').toLowerCase().includes(term) ||
                 (payment.personnel || '').toLowerCase().includes(term);
        } else {
          return numero.includes(term) ||
                 (payment.fournisseur || '').toLowerCase().includes(term) ||
                 (payment.numero_cheque || '').toLowerCase().includes(term) ||
                 statut.includes(term) ||
                 talonName.includes(term) ||
                 montant.includes(term) ||
                 (payment.originalOldTalon?.personne || '').toLowerCase().includes(term) ||
                 (payment.originalOldTalon?.factures || '').toLowerCase().includes(term) ||
                 (payment.originalOldTalon?.disponible || '').toLowerCase().includes(term);
        }
      });
    }

    // Filtre par date
    if (dateFilter) {
      filtered = filtered.filter((payment) => {
        const paymentDate = payment.date_paiement ? payment.date_paiement.slice(0, 10) : '';
        return paymentDate === dateFilter;
      });
    }

    // Filtre par statut
    if (statusFilter.length > 0) {
      filtered = filtered.filter((payment) => statusFilter.includes(payment.statut));
    }

    // Filtre par mode de paiement (seulement pour les paiements normaux)
    if (modeFilter !== 'all') {
      if (modeFilter === 'Chèque') {
        // Inclure les paiements mode "Chèque" ET les anciens talons (qui sont tous des chèques)
        filtered = filtered.filter((payment) => 
          (payment.type === 'payment' && payment.mode_paiement === 'Chèque') ||
          payment.type === 'old'
        );
      } else {
        // Autres modes : seulement les paiements normaux
        filtered = filtered.filter((payment) => 
          payment.type === 'payment' && payment.mode_paiement === modeFilter
        );
      }
    }

    // Filtre par talon
    if (selectedTalonFilter) {
      filtered = filtered.filter((payment) => String(payment.talon_id) === selectedTalonFilter);
    }

    // Filtre: seulement échéance ≤ 5 jours
    if (onlyDueSoon) {
      filtered = filtered.filter((p) => {
        if (p.type === 'payment' && p.date_echeance) {
          return isValidDate(p.date_echeance) && isDueSoon({ date_echeance: p.date_echeance, statut: p.statut });
        }
        if (p.type === 'old' && p.date_cheque) {
          return isValidDate(p.date_cheque) && isDueSoon({ date_echeance: p.date_cheque, statut: p.statut });
        }
        return false;
      });
    }

    // Apply sorting if specified
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        const getTalonName = (talonId: number) => {
          const talon = talons.find((t: Talon) => t.id === talonId);
          return talon ? talon.nom : `Talon #${talonId}`;
        };

        switch (sortField) {
          case 'numero':
            aValue = (a.numero || '').toLowerCase();
            bValue = (b.numero || '').toLowerCase();
            break;
          case 'talon':
            aValue = getTalonName(a.talon_id).toLowerCase();
            bValue = getTalonName(b.talon_id).toLowerCase();
            break;
          case 'montant':
            aValue = a.montant_total;
            bValue = b.montant_total;
            break;
          case 'date':
            aValue = new Date(a.date_paiement || '1900-01-01').getTime();
            bValue = new Date(b.date_paiement || '1900-01-01').getTime();
            break;
          case 'echeance': {
            const aEcheance = a.type === 'payment' ? a.date_echeance : a.date_cheque;
            const bEcheance = b.type === 'payment' ? b.date_echeance : b.date_cheque;
            
            // Gérer les dates invalides
            const aValid = aEcheance && isValidDate(aEcheance);
            const bValid = bEcheance && isValidDate(bEcheance);
            
            if (!aValid && !bValid) return 0;
            if (!aValid) return 1; // Les dates invalides en fin
            if (!bValid) return -1;
            
            aValue = new Date(aEcheance!).getTime();
            bValue = new Date(bEcheance!).getTime();
            break;
          }
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sorting: Prioriser les paiements avec échéance proche, puis trier par date d'échéance croissante
      filtered = [...filtered].sort((a, b) => {
        const aEcheance = a.type === 'payment' ? a.date_echeance : a.date_cheque;
        const bEcheance = b.type === 'payment' ? b.date_echeance : b.date_cheque;
        
        const aValid = aEcheance && isValidDate(aEcheance);
        const bValid = bEcheance && isValidDate(bEcheance);
        
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1; // Les dates invalides en fin
        if (!bValid) return -1;
        
  const aDue = isDueSoon({ date_echeance: aEcheance, statut: a.statut });
  const bDue = isDueSoon({ date_echeance: bEcheance, statut: b.statut });
        
        if (aDue !== bDue) return aDue ? -1 : 1;
        
        const aTs = new Date(aEcheance!).getTime();
        const bTs = new Date(bEcheance!).getTime();
        return aTs - bTs;
      });
    }

    return filtered;
  }, [unifiedPayments, searchTerm, dateFilter, statusFilter, modeFilter, selectedTalonFilter, onlyDueSoon, sortField, sortDirection, talons]);

  // Statistiques basées sur les données filtrées
  const statistiques = useMemo(() => {
    const total = filteredPayments.length;
    const validés = filteredPayments.filter((p) => p.statut === 'Validé').length;
    const enAttente = filteredPayments.filter((p) => p.statut === 'En attente').length;
    const montantTotal = filteredPayments.reduce((sum: number, p) => sum + p.montant_total, 0);
    const echeanceProche = filteredPayments.filter((p) => {
      if (p.type === 'payment' && p.date_echeance) {
        return isValidDate(p.date_echeance) && isDueSoon({ date_echeance: p.date_echeance, statut: p.statut });
      }
      if (p.type === 'old' && p.date_cheque) {
        return isValidDate(p.date_cheque) && isDueSoon({ date_echeance: p.date_cheque, statut: p.statut });
      }
      return false;
    }).length;
    
    return { total, validés, enAttente, montantTotal, echeanceProche };
  }, [filteredPayments]);

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

  // Fonctions utilitaires
  const getModeIcon = (mode: string, type: 'payment' | 'old') => {
    if (type === 'old') {
      return <Receipt size={16} className="text-blue-600" />; // Tous les anciens talons sont des chèques
    }
    
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
        if (unifiedPayment.originalOldTalon) {
          await deleteOldTalonCaisseApi({ id: unifiedPayment.originalOldTalon.id }).unwrap();
        }
        showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} supprimé avec succès`);
      } catch (error: any) {
        console.error('Erreur lors de la suppression:', error);
        showError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
      }
    }
  };

  const handleChangeStatus = async (unifiedPayment: UnifiedTalonPayment, newStatus: string) => {
    try {
      if (unifiedPayment.originalOldTalon) {
        await changeOldTalonCaisseStatusApi({ 
          id: unifiedPayment.originalOldTalon.id, 
          validation: newStatus as 'Validé' | 'En attente' | 'Refusé' | 'Annulé'
        }).unwrap();
      }
      showSuccess(`Statut mis à jour: ${newStatus}`);
    } catch (error: any) {
      console.error('Erreur lors du changement de statut:', error);
      showError(`Erreur lors du changement de statut: ${error.message || 'Erreur inconnue'}`);
    }
  };

  const handleViewPayment = (unifiedPayment: UnifiedTalonPayment) => {
    setSelectedUnifiedPayment(unifiedPayment);
    setIsViewModalOpen(true);
  };

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
            <p className="text-gray-600 mt-1">Gestion des paiements liés aux talons (incluant anciens talons)</p>
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
                      <tr><th>N° Paiement</th><th>Type</th><th>Talon</th><th>Montant</th><th>Mode/Fournisseur</th><th>Personne</th><th>Factures</th><th>Disponible</th><th>Statut</th><th>Date</th><th>Échéance</th></tr>
                      ${filteredPayments.map((p: UnifiedTalonPayment) => 
                        `<tr><td>${p.numero || ''}</td><td>${p.type === 'payment' ? 'Paiement' : 'Ancien Talon'}</td><td>${getTalonName(p.talon_id)}</td><td>${p.montant_total} DH</td><td>${p.type === 'payment' ? p.mode_paiement : p.fournisseur}</td><td>${p.type === 'payment' && p.personnel ? p.personnel : (p.type === 'old' && p.originalOldTalon?.personne ? p.originalOldTalon.personne : '-')}</td><td>${p.type === 'old' && p.originalOldTalon?.factures ? p.originalOldTalon.factures : '-'}</td><td>${p.type === 'old' && p.originalOldTalon?.disponible ? p.originalOldTalon.disponible : '-'}</td><td>${p.statut}</td><td>${formatDateOrText(p.date_paiement)}</td><td>${p.type === 'payment' && p.date_echeance ? formatDateOrText(p.date_echeance) : (p.type === 'old' && p.date_cheque ? formatDateOrText(p.date_cheque) : '')}</td></tr>`
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
        {/* Onglets de talons */}
        <div className="mt-6">
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${selectedTalonFilter === '' ? 'bg-orange-600 text-white border-orange-600' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}
              onClick={() => setSelectedTalonFilter('')}
            >
              Tous les talons
            </button>
            {talons.map((talon: Talon) => (
              <button
                key={talon.id}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${selectedTalonFilter === String(talon.id) ? 'bg-orange-600 text-white border-orange-600' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}
                onClick={() => setSelectedTalonFilter(String(talon.id))}
              >
                {talon.nom}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
            <label htmlFor="status_filter" className="block text-sm text-gray-600 mb-1">Statut</label>
            <select
              id="status_filter"
              value={statusFilter[0] || ''}
              onChange={(e) => {
                const val = e.target.value;
                setStatusFilter(val ? [val] : []);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">Tous les statuts</option>
              {statusOptions.map(st => (
                <option key={st} value={st}>{st}</option>
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
              <option value="Chèque">Chèque (inclut anciens talons)</option>
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

      {/* Liste mobile (cartes) */}
      <div className="sm:hidden space-y-3">
        {paginatedPayments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center text-gray-500">
            <div className="flex flex-col items-center">
              <FileText className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-lg font-medium">Aucun paiement talon trouvé</p>
              <p className="text-sm">Ajustez vos filtres pour voir plus de résultats</p>
            </div>
          </div>
        ) : (
          paginatedPayments.map((p: UnifiedTalonPayment) => {
            const echeanceDate = p.type === 'payment' ? p.date_echeance : p.date_cheque;
            const showDueSoon =
              p.statut !== 'Validé' &&
              echeanceDate &&
              isValidDate(echeanceDate) &&
              isDueSoon({ date_echeance: echeanceDate, statut: p.statut });

            return (
              <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{p.numero}</span>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        p.type === 'payment' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {p.type === 'payment' ? 'Paiement' : 'Ancien Talon'}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${getStatusColor(p.statut)}`}>
                        {p.statut}
                      </span>
                      {showDueSoon && (
                        <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 rounded">
                          ≤ 5j
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">{getTalonName(p.talon_id)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-900">{p.montant_total} DH</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <div className="flex items-center text-sm text-gray-800">
                    {getModeIcon(p.mode_paiement || '', p.type)}
                    <span className="ml-2">{p.type === 'payment' ? p.mode_paiement : p.fournisseur}</span>
                  </div>
                  {p.type === 'old' && p.numero_cheque && (
                    <div className="text-xs text-gray-500">Chèque: {p.numero_cheque}</div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-600">
                      <span className="text-gray-500">Date:</span> {formatDateOrText(p.date_paiement)}
                    </div>
                    <div className="text-gray-600">
                      <span className="text-gray-500">Échéance:</span>{' '}
                      {echeanceDate ? formatDateOrText(echeanceDate) : '-'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                    <div>
                      <span className="text-gray-500">Personne:</span>{' '}
                      {p.type === 'payment' && p.personnel
                        ? p.personnel
                        : p.type === 'old' && p.originalOldTalon?.personne
                        ? p.originalOldTalon.personne
                        : '-'}
                    </div>
                    <div>
                      <span className="text-gray-500">Factures:</span>{' '}
                      {p.type === 'old' && p.originalOldTalon?.factures ? p.originalOldTalon.factures : '-'}
                    </div>
                    <div>
                      <span className="text-gray-500">Disponible:</span>{' '}
                      {p.type === 'old' && p.originalOldTalon?.disponible ? p.originalOldTalon.disponible : '-'}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleViewPayment(p)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                    title="Voir les détails"
                  >
                    <Eye size={16} /> Détails
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tableau des paiements (≥ sm) */}
      <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('numero')}
                >
                  <div className="flex items-center gap-2">
                    N° Paiement
                    {sortField === 'numero' && (
                      sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('talon')}
                >
                  <div className="flex items-center gap-2">
                    Talon
                    {sortField === 'talon' && (
                      sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('montant')}
                >
                  <div className="flex items-center gap-2">
                    Montant
                    {sortField === 'montant' && (
                      sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mode/Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Personne
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Factures
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Disponible
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-2">
                    Date Paiement
                    {sortField === 'date' && (
                      sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('echeance')}
                >
                  <div className="flex items-center gap-2">
                    Échéance
                    {sortField === 'echeance' && (
                      sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <FileText className="w-12 h-12 text-gray-300 mb-4" />
                      <p className="text-lg font-medium">Aucun paiement talon trouvé</p>
                      <p className="text-sm">Ajustez vos filtres pour voir plus de résultats</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((payment: UnifiedTalonPayment) => (
                  <tr key={payment.id} className={`hover:bg-gray-50 ${payment.statut === 'Validé' ? 'bg-green-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-900">{payment.numero}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        payment.type === 'payment' 
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {payment.type === 'payment' ? 'Paiement' : 'Ancien Talon'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{getTalonName(payment.talon_id)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{payment.montant_total} DH</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getModeIcon(payment.mode_paiement || '', payment.type)}
                        <span className="ml-2 text-sm text-gray-900">
                          {payment.type === 'payment' ? payment.mode_paiement : payment.fournisseur}
                        </span>
                      </div>
                      {payment.type === 'old' && payment.numero_cheque && (
                        <div className="text-xs text-gray-500">Chèque: {payment.numero_cheque}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.type === 'payment' && payment.personnel 
                          ? payment.personnel 
                          : payment.type === 'old' && payment.originalOldTalon?.personne
                          ? payment.originalOldTalon.personne
                          : '-'
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.type === 'old' && payment.originalOldTalon?.factures
                          ? payment.originalOldTalon.factures
                          : '-'
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.type === 'old' && payment.originalOldTalon?.disponible
                          ? payment.originalOldTalon.disponible
                          : '-'
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(payment.statut)}
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(payment.statut)}`}>
                          {payment.statut}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDateOrText(payment.date_paiement)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.type === 'payment' && payment.date_echeance 
                          ? formatDateOrText(payment.date_echeance)
                          : payment.type === 'old' && payment.date_cheque
                          ? formatDateOrText(payment.date_cheque)
                          : '-'
                        }
                        {/* Indicateur d'échéance proche */}
                        {(payment.statut !== 'Validé') && ((payment.type === 'payment' && payment.date_echeance && isValidDate(payment.date_echeance) && isDueSoon({ date_echeance: payment.date_echeance, statut: payment.statut })) ||
                         (payment.type === 'old' && payment.date_cheque && isValidDate(payment.date_cheque) && isDueSoon({ date_echeance: payment.date_cheque, statut: payment.statut })) ) ? (
                          <span className="ml-2 inline-flex px-1 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
                            ≤ 5j
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleViewPayment(payment)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Voir les détails"
                        >
                          <Eye size={16} />
                        </button>
                        
                        {canModifyPayments(currentUser) && (
                          <>
                            <select
                              value={payment.statut}
                              onChange={(e) => handleChangeStatus(payment, e.target.value)}
                              className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                              title="Changer le statut"
                            >
                              <option value="En attente">En attente</option>
                              <option value="Validé">Validé</option>
                              <option value="Refusé">Refusé</option>
                              <option value="Annulé">Annulé</option>
                            </select>
                            
                            <button
                              onClick={() => handleDelete(payment)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
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
                Détails du {selectedUnifiedPayment.type === 'payment' ? 'paiement' : 'ancien talon caisse'} {selectedUnifiedPayment.numero}
              </h2>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <p className="text-sm text-gray-900">
                    {selectedUnifiedPayment.type === 'payment' ? 'Paiement normal' : 'Ancien talon caisse'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Numéro</label>
                  <p className="text-sm text-gray-900">{selectedUnifiedPayment.numero}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Talon</label>
                  <p className="text-sm text-gray-900">{getTalonName(selectedUnifiedPayment.talon_id)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant</label>
                  <p className="text-sm text-gray-900">{selectedUnifiedPayment.montant_total} DH</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(selectedUnifiedPayment.statut)}`}>
                    {selectedUnifiedPayment.statut}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de paiement</label>
                  <p className="text-sm text-gray-900">
                    {formatDateOrText(selectedUnifiedPayment.date_paiement)}
                  </p>
                </div>

                {/* Champs spécifiques aux paiements normaux */}
                {selectedUnifiedPayment.type === 'payment' && (
                  <>
                    {selectedUnifiedPayment.mode_paiement && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
                        <p className="text-sm text-gray-900">{selectedUnifiedPayment.mode_paiement}</p>
                      </div>
                    )}
                    {selectedUnifiedPayment.designation && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Désignation</label>
                        <p className="text-sm text-gray-900">{selectedUnifiedPayment.designation}</p>
                      </div>
                    )}
                    {selectedUnifiedPayment.date_echeance && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date d'échéance</label>
                        <p className="text-sm text-gray-900">
                          {formatDateOrText(selectedUnifiedPayment.date_echeance)}
                        </p>
                      </div>
                    )}
                    {selectedUnifiedPayment.personnel && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Personnel</label>
                        <p className="text-sm text-gray-900">{selectedUnifiedPayment.personnel}</p>
                      </div>
                    )}
                    {selectedUnifiedPayment.code_reglement && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code règlement</label>
                        <p className="text-sm text-gray-900">{selectedUnifiedPayment.code_reglement}</p>
                      </div>
                    )}
                  </>
                )}

                {/* Champs spécifiques aux anciens talons */}
                {selectedUnifiedPayment.type === 'old' && (
                  <>
                    {selectedUnifiedPayment.fournisseur && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
                        <p className="text-sm text-gray-900">{selectedUnifiedPayment.fournisseur}</p>
                      </div>
                    )}
                    {selectedUnifiedPayment.numero_cheque && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de chèque</label>
                        <p className="text-sm text-gray-900">{selectedUnifiedPayment.numero_cheque}</p>
                      </div>
                    )}
                    {selectedUnifiedPayment.date_cheque && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date du chèque</label>
                        <p className="text-sm text-gray-900">
                          {formatDateOrText(selectedUnifiedPayment.date_cheque)}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {selectedUnifiedPayment.banque && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Banque</label>
                    <p className="text-sm text-gray-900">{selectedUnifiedPayment.banque}</p>
                  </div>
                )}

                {/* Nouvelles colonnes spécifiques */}
                {(selectedUnifiedPayment.type === 'payment' && selectedUnifiedPayment.personnel) || 
                 (selectedUnifiedPayment.type === 'old' && selectedUnifiedPayment.originalOldTalon?.personne) ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Personne</label>
                    <p className="text-sm text-gray-900">
                      {selectedUnifiedPayment.type === 'payment' 
                        ? selectedUnifiedPayment.personnel 
                        : selectedUnifiedPayment.originalOldTalon?.personne}
                    </p>
                  </div>
                ) : null}

                {selectedUnifiedPayment.type === 'old' && selectedUnifiedPayment.originalOldTalon?.factures && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Factures</label>
                    <p className="text-sm text-gray-900">{selectedUnifiedPayment.originalOldTalon.factures}</p>
                  </div>
                )}

                {selectedUnifiedPayment.type === 'old' && selectedUnifiedPayment.originalOldTalon?.disponible && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Disponible</label>
                    <p className="text-sm text-gray-900">{selectedUnifiedPayment.originalOldTalon.disponible}</p>
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
