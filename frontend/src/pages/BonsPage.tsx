import React, { useState, useMemo } from 'react';
  import { Plus, Search, Trash2, Edit, Eye, CheckCircle2, Clock, XCircle, Printer, Copy, ChevronUp, ChevronDown } from 'lucide-react';
  import { Formik, Form, Field } from 'formik';
  import ProductFormModal from '../components/ProductFormModal';
  import ContactFormModal from '../components/ContactFormModal';
  import DevisTransformModal from '../components/DevisTransformModal';
  import BonFormModal from '../components/BonFormModal';
  import AvoirFormModal from '../components/AvoirFormModal';
  import ThermalPrintModal from '../components/ThermalPrintModal';
  import BonPrintModal from '../components/BonPrintModal';
  import SearchableSelect from '../components/SearchableSelect';
  // Centralize action/status icon size for easier adjustment
  const ACTION_ICON_SIZE = 24; // increased from 20 per user request
  import { 
    useGetBonsByTypeQuery, 
    useDeleteBonMutation, 
    useUpdateBonStatusMutation,
    useCreateBonMutation
  } from '../store/api/bonsApi';
  import { 
    useGetClientsQuery, 
  useGetFournisseursQuery
  } from '../store/api/contactsApi';
  import { useGetProductsQuery } from '../store/api/productsApi';
  import { showError, showSuccess, showConfirmation } from '../utils/notifications';
  import { formatDateSpecial, formatDateTimeWithHour } from '../utils/dateUtils';
  import { useSelector } from 'react-redux';
  import type { RootState } from '../store';
  import { getBonNumeroDisplay } from '../utils/numero';
  import { logout } from '../store/slices/authSlice';
  import { useAppDispatch } from '../hooks/redux';
  
  

const BonsPage = () => {
  const [currentTab, setCurrentTab] = useState<'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirComptant' | 'AvoirFournisseur' | 'Devis' | 'Vehicule'>('Commande');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedBon, setSelectedBon] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [isNewVehicleModalOpen, setIsNewVehicleModalOpen] = useState(false);
  const [isCreateAvoirModalOpen, setIsCreateAvoirModalOpen] = useState(false);
  const [selectedBonForAvoir, setSelectedBonForAvoir] = useState<any>(null);
  const [isCreateAvoirClientModalOpen, setIsCreateAvoirClientModalOpen] = useState(false);
  const [selectedBonForAvoirClient, setSelectedBonForAvoirClient] = useState<any>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isDevisTransformModalOpen, setIsDevisTransformModalOpen] = useState(false);
  const [selectedDevisToTransform, setSelectedDevisToTransform] = useState<any>(null);
  const [isThermalPrintModalOpen, setIsThermalPrintModalOpen] = useState(false);
  const [selectedBonForPrint, setSelectedBonForPrint] = useState<any>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedBonForPDFPrint, setSelectedBonForPDFPrint] = useState<any>(null);
  // État pour la modal de duplication AWATEF
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [selectedBonForDuplicate, setSelectedBonForDuplicate] = useState<any>(null);
  const [duplicateType, setDuplicateType] = useState<'fournisseur' | 'client' | 'comptant'>('client');
  const [selectedContactForDuplicate, setSelectedContactForDuplicate] = useState<string>('');
  const [comptantClientName, setComptantClientName] = useState<string>('');
  // Clé pour forcer le remontage du formulaire (assure un état 100% vierge entre créations)
  const [bonFormKey, setBonFormKey] = useState(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  // Sorting
  const [sortField, setSortField] = useState<'numero' | 'date' | 'contact' | 'montant' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Auth context
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const isEmployee = currentUser?.role === 'Employé';

  // RTK Query hooks
  // Load bons by type
  const { data: bons = [], isLoading: bonsLoading } = useGetBonsByTypeQuery(currentTab);
  const { data: clients = [], isLoading: clientsLoading } = useGetClientsQuery();
  const { data: suppliers = [], isLoading: suppliersLoading } = useGetFournisseursQuery();
  const { data: products = [], isLoading: productsLoading } = useGetProductsQuery();
  const [deleteBonMutation] = useDeleteBonMutation();
  const [updateBonStatus] = useUpdateBonStatusMutation();
  const [createBon] = useCreateBonMutation();
  const dispatch = useAppDispatch();
  // const [markBonAsAvoir] = useMarkBonAsAvoirMutation();
  // Changer le statut d'un bon (Commande / Sortie / Comptant)
  const handleChangeStatus = async (bon: any, statut: 'Validé' | 'En attente' | 'Annulé' | 'Accepté' | 'Envoyé' | 'Refusé') => {
    try {
      // Employé: uniquement Annuler ou En attente (y compris pour Devis)
      if (isEmployee && !['Annulé','En attente'].includes(statut)) {
        showError("Permission refusée: l'employé ne peut que mettre En attente ou Annuler.");
        return;
      }
      // Si c'est un devis et qu'on l'accepte, ouvrir le modal de transformation
      if (bon.type === 'Devis' && statut === 'Accepté') {
        setSelectedDevisToTransform(bon);
        setIsDevisTransformModalOpen(true);
        return;
      }
      
      await updateBonStatus({ id: bon.id, statut, type: bon.type || currentTab }).unwrap();
      showSuccess(`Statut mis à jour: ${statut}`);
    } catch (error: any) {
      console.error('Erreur mise à jour statut:', error);
      const status = error?.status;
      const msg = error?.data?.message || error?.message || 'Erreur inconnue';
      if (status === 401) {
        showError('Session expirée. Veuillez vous reconnecter.');
        dispatch(logout());
      } else {
        showError(`Erreur lors du changement de statut: ${msg}`);
      }
    }
  };
  // Hooks retirés pour éviter les warnings tant que la migration RTK n'est pas terminée

  // ...

  // Helper to get contact name (client or fournisseur) used by filtering/render
  const getContactName = (bon: any) => {
    // Comptant: if client_nom is present (free text), prefer it
  if ((bon?.type === 'Comptant' || bon?.type === 'AvoirComptant' || currentTab === 'Comptant' || currentTab === 'AvoirComptant') && bon?.client_nom) {
      return bon.client_nom;
    }
    const clientId = bon?.client_id ?? bon?.contact_id;
    if (clientId && clients.length > 0) {
      const client = clients.find((c: any) => String(c.id) === String(clientId));
      return client ? client.nom_complet : 'Client supprimé';
    }
    if (bon?.fournisseur_id && suppliers.length > 0) {
      const supplier = suppliers.find((s: any) => String(s.id) === String(bon.fournisseur_id));
      return supplier ? supplier.nom_complet : 'Fournisseur supprimé';
    }
    return 'Non défini';
  };

    // Ensure Devis numbers are displayed with uppercase DEV prefix and Avoirs with AVO prefix
  const getDisplayNumero = (bon: any) => getBonNumeroDisplay({ id: bon?.id, type: bon?.type, numero: bon?.numero });

  // Compute mouvement (profit) and margin% for a bon EXACTLY comme dans BonFormModal :
  // FORMULE: profit = Σ ( (prix_unitaire - (cout_revient || prix_achat)) * quantite )
  // (Ne pas soustraire la remise unitaire ici – le modal n'intègre pas la remise dans Mouvement.)
  // margin% = profit / Σ( (cout_revient || prix_achat) * quantite ) * 100
  const parseItemsSafe = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
  };
  const resolveCost = (it: any): number => {
    if (it.cout_revient !== undefined && it.cout_revient !== null) return Number(it.cout_revient) || 0;
    if (it.prix_achat !== undefined && it.prix_achat !== null) return Number(it.prix_achat) || 0;
    const pid = it.product_id || it.produit_id;
    if (pid) {
      const prod = (products as any[]).find(p => String(p.id) === String(pid));
      if (prod) return Number(prod.cout_revient ?? prod.prix_achat ?? 0) || 0;
    }
    return 0;
  };
  const computeMouvementDetail = (bon: any): { profit: number; costBase: number; marginPct: number | null } => {
    const items = parseItemsSafe(bon?.items);
    let profit = 0; let costBase = 0;
    for (const it of items) {
      const q = Number(it.quantite ?? it.qty ?? 0) || 0;
      if (!q) continue;
      // Utiliser le prix_unitaire enregistré sur la ligne (NE PAS rafraîchir via produit pour éviter les changements ultérieurs)
      const prixVente = Number(it.prix_unitaire ?? 0) || 0;
      // Coût: cout_revient sinon prix_achat; fallback produit uniquement si les deux sont absents
      let cost = 0;
      if (it.cout_revient !== undefined && it.cout_revient !== null) cost = Number(it.cout_revient) || 0;
      else if (it.prix_achat !== undefined && it.prix_achat !== null) cost = Number(it.prix_achat) || 0;
      else cost = resolveCost(it); // dernier recours
      profit += (prixVente - cost) * q;
      costBase += cost * q;
    }
    const marginPct = costBase > 0 ? (profit / costBase) * 100 : null;
    return { profit, costBase, marginPct };
  };

  // Handle sorting
  const handleSort = (field: 'numero' | 'date' | 'contact' | 'montant') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // On ne filtre plus par bon.type car la requête est déjà segmentée par onglet,
    // et certains endpoints ne renvoyaient pas `type`.
  const sortedBons = useMemo(() => {
    // First filter
    const filtered = bons.filter(bon => {
      const term = (searchTerm || '').trim().toLowerCase();
      const contactName = (currentTab === 'Vehicule' ? (bon.vehicule_nom || '') : getContactName(bon)).toLowerCase();
      const matchesSearch = !term || (
        (getDisplayNumero(bon).toLowerCase() || '').includes(term) ||
        (bon.statut?.toLowerCase() || '').includes(term) ||
        contactName.includes(term)
      );

      const matchesStatus = !statusFilter || statusFilter.length === 0 ? true : (bon.statut && statusFilter.includes(String(bon.statut)));

      return matchesSearch && matchesStatus;
    });

    // Then sort
    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'numero':
          aValue = getDisplayNumero(a).toLowerCase();
          bValue = getDisplayNumero(b).toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.date_creation || 0).getTime();
          bValue = new Date(b.date_creation || 0).getTime();
          break;
        case 'contact':
          aValue = (currentTab === 'Vehicule' ? (a.vehicule_nom || '') : getContactName(a)).toLowerCase();
          bValue = (currentTab === 'Vehicule' ? (b.vehicule_nom || '') : getContactName(b)).toLowerCase();
          break;
        case 'montant':
          aValue = Number(a.montant_total || 0);
          bValue = Number(b.montant_total || 0);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [bons, searchTerm, statusFilter, sortField, sortDirection, currentTab, clients, suppliers]);

  // Pagination
  const totalItems = sortedBons.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBons = sortedBons.slice(startIndex, endIndex);

  // Réinitialiser la page quand on change d'onglet ou de recherche
  React.useEffect(() => {
    setCurrentPage(1);
  }, [currentTab, searchTerm]);

  const handleDelete = async (bonToDelete: any) => {
      if (isEmployee) {
        showError("Permission refusée: l'employé ne peut pas supprimer un bon.");
        return;
      }
      const result = await showConfirmation(
        'Cette action est irréversible.',
        'Êtes-vous sûr de vouloir supprimer ce bon ?',
        'Oui, supprimer',
        'Annuler'
      );
      
      if (result.isConfirmed) {
        try {
      await deleteBonMutation({ id: bonToDelete.id, type: bonToDelete.type || currentTab }).unwrap();
          showSuccess('Bon supprimé avec succès');
        } catch (error: any) {
          console.error('Erreur lors de la suppression:', error);
          showError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
        }
      }
    };
  
  // Marquer un bon comme Avoir: Sortie/Comptant -> Avoir Client, Commande -> Avoir Fournisseur
  // (Fonction mark-as-avoir retirée si non utilisée)
    

  // Annuler un avoir (changer son statut en "Annulé")
    const handleCancelAvoir = async (bon: any) => {
      try {
        if (!currentUser?.id) {
          showError('Utilisateur non authentifié');
          return;
        }
        await updateBonStatus({ id: bon.id, statut: 'Annulé', type: bon.type }).unwrap();
        showSuccess('Avoir annulé avec succès');
      } catch (error: any) {
        console.error('Erreur lors de la mise à jour:', error);
        showError(`Erreur: ${error.message || 'Erreur inconnue'}`);
      }
    };

    // Remettre un avoir en attente depuis validé
    const handleAvoirBackToWaiting = async (bon: any) => {
      try {
        if (!currentUser?.id) {
          showError('Utilisateur non authentifié');
          return;
        }
        await updateBonStatus({ id: bon.id, statut: 'En attente', type: bon.type }).unwrap();
        showSuccess('Avoir remis en attente');
      } catch (error: any) {
        console.error('Erreur lors de la mise à jour:', error);
        showError(`Erreur: ${error.message || 'Erreur inconnue'}`);
      }
    };
    
    // Fonction pour gérer la duplication AWATEF
    const handleDuplicateAwatef = async () => {
      if (!selectedBonForDuplicate) return;
      
      try {
        // Créer le nouveau bon selon le type sélectionné
        let newBonData: any = {
          date_creation: new Date().toISOString().slice(0, 19).replace('T', ' '),
          vehicule_id: selectedBonForDuplicate.vehicule_id || undefined,
          lieu_chargement: selectedBonForDuplicate.lieu_chargement || selectedBonForDuplicate.lieu_charge || '',
          adresse_livraison: selectedBonForDuplicate.adresse_livraison || '',
          statut: 'En attente',
          montant_total: selectedBonForDuplicate.montant_total || 0,
          created_by: currentUser?.id || 1,
          items: selectedBonForDuplicate.items || []
        };
        
        if (duplicateType === 'fournisseur') {
          newBonData.type = 'Commande';
          newBonData.fournisseur_id = parseInt(selectedContactForDuplicate);
        } else if (duplicateType === 'client') {
          newBonData.type = 'Sortie';
          newBonData.client_id = parseInt(selectedContactForDuplicate);
        } else if (duplicateType === 'comptant') {
          newBonData.type = 'Comptant';
          newBonData.client_nom = comptantClientName;
        }
        
        // Créer le bon directement via l'API
        await createBon({ type: newBonData.type, ...newBonData }).unwrap();
        
        showSuccess(`${newBonData.type} dupliqué avec succès !`);
        
        // Fermer la modal de duplication
        setIsDuplicateModalOpen(false);
        setSelectedBonForDuplicate(null);
        setSelectedContactForDuplicate('');
        setComptantClientName('');
        
        // Changer l'onglet vers le bon type créé si nécessaire
        if (newBonData.type !== currentTab) {
          setCurrentTab(newBonData.type);
        }
        
      } catch (error: any) {
        console.error('Erreur lors de la duplication:', error);
        showError(`Erreur lors de la duplication: ${error?.data?.message || error.message || 'Erreur inconnue'}`);
      }
    };
    
    

  return (
      <div className="p-6">
        {/* Loading indicator */}
        {(bonsLoading || clientsLoading || suppliersLoading || productsLoading) && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">Chargement des données...</span>
          </div>
        )}
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Gestion des Bons</h1>
          <button
            onClick={() => {
              setSelectedBon(null);
              // Incrémenter la clé pour forcer un remontage du composant modal (nettoyage complet de l'état interne)
              setBonFormKey(k => k + 1);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Plus size={20} />
            Nouveau {currentTab}
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'Commande', label: 'Bon de Commande' },
              { key: 'Sortie', label: 'Bon de Sortie' },
              { key: 'Comptant', label: 'Bon Comptant' },
              { key: 'Vehicule', label: 'Bon Véhicule' },
              { key: 'Avoir', label: 'Avoir Client' },
              { key: 'AvoirComptant', label: 'Avoir Comptant' },
              { key: 'AvoirFournisseur', label: 'Avoir Fournisseur' },
              { key: 'Devis', label: 'Devis' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCurrentTab(tab.key as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  currentTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        
  {/* Contenu standard */}
        {/* Search and Filters */}
        <div className="flex justify-between items-center mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher un bon..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="ml-4 flex items-center gap-3">
            <label className="text-sm text-gray-600" htmlFor="statusFilter">Statut</label>
            <select
              multiple
              value={statusFilter}
              onChange={(e) => setStatusFilter(Array.from(e.target.selectedOptions).map(o => o.value))}
              className="px-2 py-2 border border-gray-300 rounded-md h-28"
              id="statusFilter"
            >
              {['En attente','Validé','Refusé','Annulé'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex flex-col gap-2 ml-2">
              <button type="button" className="px-2 py-1 bg-gray-100 rounded" onClick={() => setStatusFilter([])}>Tous</button>
              <button type="button" className="px-2 py-1 bg-gray-100 rounded" onClick={() => setStatusFilter(['En attente','Validé','Refusé','Annulé'])}>Tout sélectionner</button>
            </div>
          </div>
        </div>

        {/* Contrôles de pagination */}
        <div className="mb-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">
              Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} bons
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Bons par page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

  {/* Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="responsive-table-container">
            <table
              className="responsive-table responsive-table-min divide-y divide-gray-200 table-mobile-compact"
              style={{ minWidth: 960 }}
            >
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('numero')}
                  >
                    <div className="flex items-center gap-1">
                      Numéro
                      {sortField === 'numero' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('date')}
                  >
                    <div className="flex items-center gap-1">
                      Date création
                      {sortField === 'date' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('contact')}
                  >
                    <div className="flex items-center gap-1">
                      {(() => {
                        if (currentTab === 'Vehicule') return 'Véhicule';
                        if (currentTab === 'AvoirFournisseur' || currentTab === 'Commande') return 'Fournisseur';
                        return 'Client';
                      })()}
                      {sortField === 'contact' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Adresse livraison
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('montant')}
                  >
                    <div className="flex items-center gap-1">
                      Montant
                      {sortField === 'montant' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mouvement
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedBons.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                      Aucun bon trouvé pour {currentTab}
                    </td>
                  </tr>
                ) : (
                  paginatedBons.map((bon) => (
                    <tr key={bon.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">{getDisplayNumero(bon)}</td>
                      <td className="px-4 py-2 text-sm">
                        <div className="text-sm text-gray-700">{formatDateTimeWithHour(bon.date_creation)}</div>
                      </td>
                      <td className="px-4 py-2 text-sm">{currentTab === 'Vehicule' ? (bon.vehicule_nom || '-') : getContactName(bon)}</td>
                      <td className="px-4 py-2 text-sm">{(bon as any).adresse_livraison ?? (bon as any).adresseLivraison ?? '-'}</td>
                      <td className="px-4 py-2">
                        <div className="text-sm font-semibold text-gray-900">{bon.montant_total ?? 0} DH</div>
                        <div className="text-xs text-gray-500">{bon.items?.length || 0} articles</div>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {(() => {
                          // Show mouvement only for sales/stock out types (Sortie, Comptant, Avoir, AvoirComptant)
                          const type = bon.type || currentTab;
                          if (!['Sortie','Comptant','Avoir','AvoirComptant'].includes(type)) return <span className="text-gray-400">-</span>;
                          const { profit, marginPct } = computeMouvementDetail(bon);
                          let cls = 'text-gray-600';
                          if (profit > 0) cls = 'text-green-600';
                          else if (profit < 0) cls = 'text-red-600';
                          return (
                            <span className={`font-semibold ${cls}`}> 
                              {profit} DH{marginPct !== null && (
                                <span className="text-xs font-normal ml-1">({marginPct}%)</span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-2 px-2 py-1 text-xs font-semibold rounded-full ${getStatusClasses(bon.statut)}`}>
                          {getStatusIcon(bon.statut)}
                          {bon.statut || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-2">
                          {/* Status-change actions */}
                          {(() => {
                            if (currentUser?.role === 'PDG') {
                              return (
                                <>
                                  {(currentTab === 'Commande' || currentTab === 'Sortie' || currentTab === 'Comptant') && (
                                    <>
                                      <button onClick={() => handleChangeStatus(bon, 'Validé')} className="text-green-600 hover:text-green-800" title="Marquer Validé">
                                        <CheckCircle2 size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'En attente')} className="text-yellow-600 hover:text-yellow-800" title="Mettre En attente">
                                        <Clock size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'Annulé')} className="text-red-600 hover:text-red-800" title="Annuler">
                                        <XCircle size={ACTION_ICON_SIZE} />
                                      </button>
                                    </>
                                  )}
                                  {(currentTab === 'Avoir' || currentTab === 'AvoirFournisseur' || currentTab === 'AvoirComptant') && (
                                    <>
                                      <button onClick={() => handleChangeStatus(bon, 'Validé')} className="text-green-600 hover:text-green-800" title="Valider l'avoir">
                                        <CheckCircle2 size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'En attente')} className="text-yellow-600 hover:text-yellow-800" title="Mettre en attente">
                                        <Clock size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'Annulé')} className="text-red-600 hover:text-red-800" title="Annuler l'avoir">
                                        <XCircle size={ACTION_ICON_SIZE} />
                                      </button>
                                    </>
                                  )}
                                  {currentTab === 'Devis' && (
                                    <>
                                      <button onClick={() => handleChangeStatus(bon, 'Accepté')} className="text-green-600 hover:text-green-800" title="Accepter et transformer">
                                        <CheckCircle2 size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'En attente')} className="text-yellow-600 hover:text-yellow-800" title="Mettre En attente">
                                        <Clock size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'Annulé')} className="text-red-600 hover:text-red-800" title="Annuler le devis">
                                        <XCircle size={ACTION_ICON_SIZE} />
                                      </button>
                                    </>
                                  )}
                                </>
                              );
                            }
                            if (isEmployee) {
                              return (
                                <>
                                  {(currentTab === 'Commande' || currentTab === 'Sortie' || currentTab === 'Comptant' || currentTab === 'Devis') && (
                                    <>
                                      <button onClick={() => handleChangeStatus(bon, 'En attente')} className="text-yellow-600 hover:text-yellow-800" title="Mettre En attente">
                                        <Clock size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'Annulé')} className="text-red-600 hover:text-red-800" title="Annuler">
                                        <XCircle size={ACTION_ICON_SIZE} />
                                      </button>
                                    </>
                                  )}
                                  {(currentTab === 'Avoir' || currentTab === 'AvoirFournisseur' || currentTab === 'AvoirComptant') && (
                                    <>
                                      <button onClick={() => handleChangeStatus(bon, 'En attente')} className="text-yellow-600 hover:text-yellow-800" title="Remettre En attente">
                                        <Clock size={ACTION_ICON_SIZE} />
                                      </button>
                                      <button onClick={() => handleChangeStatus(bon, 'Annulé')} className="text-red-600 hover:text-red-800" title="Annuler l'avoir">
                                        <XCircle size={ACTION_ICON_SIZE} />
                                      </button>
                                    </>
                                  )}
                                  {/* Devis: pas d'action d'annulation / attente explicite pour Employé */}
                                </>
                              );
                            }
                            return null;
                          })()}
                          <button
                            onClick={() => { 
                              setSelectedBonForPrint(bon); 
                              setIsThermalPrintModalOpen(true); 
                            }}
                            className="text-purple-600 hover:text-purple-800"
                            title="Imprimer (Thermique 5cm)"
                          >
                            <Printer size={ACTION_ICON_SIZE} />
                          </button>
                          <button
                            onClick={() => { 
                              setSelectedBonForPDFPrint(bon); 
                              setIsPrintModalOpen(true); 
                            }}
                            className="text-green-600 hover:text-green-800"
                            title="Imprimer PDF (A4/A5)"
                          >
                            <Printer size={ACTION_ICON_SIZE} />
                          </button>
                          {currentUser?.role !== 'Employé' && (
                            <button
                              onClick={() => { setSelectedBon(bon); setIsViewModalOpen(true); }}
                              className="text-gray-600 hover:text-gray-900"
                              title="Voir"
                            >
                              <Eye size={ACTION_ICON_SIZE} />
                            </button>
                          )}
                          {currentUser?.role === 'PDG' && (
                            <>
                              <button
                                onClick={() => { setSelectedBon(bon); setIsCreateModalOpen(true); }}
                                className="text-blue-600 hover:text-blue-800"
                                title="Modifier"
                              >
                                <Edit size={ACTION_ICON_SIZE} />
                              </button>
                              <button
                                onClick={() => {
                                  // Ouvrir la modal de duplication AWATEF
                                  setSelectedBonForDuplicate(bon);
                                  setIsDuplicateModalOpen(true);
                                }}
                                className="text-pink-600 hover:text-pink-800"
                                title="Dupliquer AWATEF (Avoir Client)"
                              >
                                <Copy size={ACTION_ICON_SIZE} />
                              </button>
                              <button
                                onClick={() => handleDelete(bon)}
                                className="text-red-600 hover:text-red-800"
                                title="Supprimer"
                              >
                                <Trash2 size={ACTION_ICON_SIZE} />
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
          <div className="mt-4 flex justify-center items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className={`px-3 py-2 border rounded-md ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white border-blue-600'
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
              className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Suivant
            </button>
          </div>
        )}

        {/* Modal de création/édition */}
        <BonFormModal
          key={bonFormKey}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          currentTab={currentTab}
          initialValues={selectedBon || undefined}
          onBonAdded={(newBon) => {
            // Le bon est automatiquement ajouté au store Redux
            const labelTab = String(currentTab);
            showSuccess(`${labelTab} ${getDisplayNumero(newBon)} ${selectedBon ? 'mis à jour' : 'créé'} avec succès!`);
            setIsCreateModalOpen(false);
            setSelectedBon(null);
          }}
        />

        {/* Modal de visualisation */}
        {isViewModalOpen && selectedBon && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Détails du Bon {getDisplayNumero(selectedBon)}</h2>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              {selectedBon && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Numéro:</p>
                      <p className="text-lg">{getDisplayNumero(selectedBon)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Type:</p>
                      <p className="text-lg">{selectedBon.type}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Date de création:</p>
                      <p className="text-lg">{formatDateSpecial(selectedBon.date_creation)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Statut:</p>
                        <span className={`inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold rounded-full ${getStatusClasses(selectedBon.statut)}`}>
                        {getStatusIcon(selectedBon.statut)}
                        {selectedBon.statut}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Contact:</p>
                      <p className="text-lg">{getContactName(selectedBon)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Montant total:</p>
                      <p className="text-lg font-bold text-blue-600">{selectedBon.montant_total ?? 0} DH</p>
                    </div>
                  </div>

                  <div className="border rounded-md p-4">
                    <h3 className="font-bold mb-3">Produits</h3>
                    <div className="responsive-table-container">
                      <table
                        className="responsive-table responsive-table-min divide-y divide-gray-200 table-mobile-compact"
                        style={{ minWidth: 600 }}
                      >
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantité</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prix unitaire</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedBon.items.map((item: any) => {
                            const pid = item.product_id ?? item.produit_id;
                            const product = products.find((p: any) => String(p.id) === String(pid));
                            const displayDesignation = item.designation || item.designation_custom || product?.designation || 'Produit non trouvé';
                            return (
                              <tr key={item.id}>
                                <td className="px-4 py-2 text-sm">{displayDesignation}</td>
                                <td className="px-4 py-2 text-sm">{item.quantite}</td>
                                <td className="px-4 py-2 text-sm">{item.prix_unitaire ?? 0} DH</td>
                                <td className="px-4 py-2 text-sm font-semibold">{item.montant_ligne ?? 0} DH</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end text-base font-semibold mt-2">
                      Total: {selectedBon.montant_total ?? 0} DH
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setIsViewModalOpen(false)}
                      className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Fermer
                    </button>
                    {selectedBon.statut === 'Brouillon' && (
                      <>
                        <button
                          onClick={() => {
                            showSuccess('Bon validé');
                            setIsViewModalOpen(false);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                        >
                          Valider
                        </button>
                        <button
                          onClick={() => {
                            showSuccess('Bon annulé');
                            setIsViewModalOpen(false);
                          }}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
                        >
                          Annuler
                        </button>
                      </>
                    )}
                    {selectedBon.statut === 'Validé' && (
                      <>
                        {(selectedBon.type !== 'Avoir' && selectedBon.type !== 'AvoirFournisseur') && (
                          <button
                            onClick={() => {
                              showSuccess('Bon marqué comme livré');
                              setIsViewModalOpen(false);
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                          >
                            Marquer comme livré
                          </button>
                        )}
                        {(selectedBon.type === 'Avoir' || selectedBon.type === 'AvoirFournisseur') && (
                          <>
                            <button
                              onClick={() => {
                                handleCancelAvoir(selectedBon);
                                setIsViewModalOpen(false);
                              }}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md mr-2"
                            >
                              Annuler l'avoir
                            </button>
                            <button
                              onClick={() => {
                                handleAvoirBackToWaiting(selectedBon);
                                setIsViewModalOpen(false);
                              }}
                              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md"
                            >
                              Remettre en attente
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal pour nouveau client */}
        <ContactFormModal
          isOpen={isNewClientModalOpen}
          onClose={() => setIsNewClientModalOpen(false)}
          contactType="Client"
          onContactAdded={() => {
            showSuccess('Client créé avec succès!');
          }}
        />

        {/* Modal pour nouveau fournisseur */}
        <ContactFormModal
          isOpen={isNewSupplierModalOpen}
          onClose={() => setIsNewSupplierModalOpen(false)}
          contactType="Fournisseur"
          onContactAdded={() => {
            showSuccess('Fournisseur créé avec succès!');
          }}
        />

        {/* Modal pour nouveau véhicule */}
        {isNewVehicleModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Nouveau Véhicule</h3>
              <Formik
                initialValues={{
                  immatriculation: '',
                  marque: '',
                  modele: '',
                  type_vehicule: ''
                }}
                onSubmit={(values) => {
                  // Simulation de création de véhicule
                  console.log('Nouveau véhicule:', values);
                  showSuccess(`Véhicule ${values.immatriculation} créé avec succès!`);
                  setIsNewVehicleModalOpen(false);
                }}
              >
                <Form className="space-y-4">
                  <div>
                    <label htmlFor="veh-immatriculation" className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                    <Field
                      id="veh-immatriculation"
                      name="immatriculation"
                      type="text"
                      placeholder="Ex: 12-A-3456"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="veh-marque" className="block text-sm font-medium text-gray-700 mb-1">Marque</label>
                    <Field
                      id="veh-marque"
                      name="marque"
                      type="text"
                      placeholder="Ex: Mercedes, Renault, Peugeot"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="veh-modele" className="block text-sm font-medium text-gray-700 mb-1">Modèle</label>
                    <Field
                      id="veh-modele"
                      name="modele"
                      type="text"
                      placeholder="Ex: Actros, Master, Boxer"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="veh-type" className="block text-sm font-medium text-gray-700 mb-1">Type de véhicule</label>
                    <Field
                      id="veh-type"
                      name="type_vehicule"
                      as="select"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sélectionner un type</option>
                      <option value="Camion">Camion</option>
                      <option value="Fourgon">Fourgon</option>
                      <option value="Utilitaire">Utilitaire</option>
                      <option value="Tracteur">Tracteur</option>
                    </Field>
                  </div>
                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsNewVehicleModalOpen(false)}
                      className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Créer Véhicule
                    </button>
                  </div>
                </Form>
              </Formik>
            </div>
          </div>
        )}

        {/* Modal pour créer un avoir */}
        <AvoirFormModal
          isOpen={isCreateAvoirModalOpen}
          onClose={() => {
            setIsCreateAvoirModalOpen(false);
            setSelectedBonForAvoir(null);
          }}
          bonOrigine={selectedBonForAvoir}
          onAvoirCreated={() => {
            showSuccess('Avoir fournisseur créé avec succès');
            setIsCreateAvoirModalOpen(false);
            setSelectedBonForAvoir(null);
            setCurrentTab('AvoirFournisseur');
          }}
        />

        {/* Modal pour créer un avoir client */}
        <AvoirFormModal
          isOpen={isCreateAvoirClientModalOpen}
          onClose={() => {
            setIsCreateAvoirClientModalOpen(false);
            setSelectedBonForAvoirClient(null);
          }}
          bonOrigine={selectedBonForAvoirClient}
          onAvoirCreated={() => {
            showSuccess('Avoir client créé avec succès');
            setIsCreateAvoirClientModalOpen(false);
            setSelectedBonForAvoirClient(null);
            setCurrentTab('Avoir');
          }}
        />

        {/* Modal Impression Thermique */}
        <ThermalPrintModal
          isOpen={isThermalPrintModalOpen}
          onClose={() => {
            setIsThermalPrintModalOpen(false);
            setSelectedBonForPrint(null);
          }}
          bon={selectedBonForPrint}
          type={(currentTab === 'Avoir' || currentTab === 'AvoirComptant') ? 'AvoirClient' : currentTab}
          contact={(() => {
            const b = selectedBonForPrint;
            if (!b) return null;
            // Devis: always a client; prefer client_id, fallback to contact_id
            if (currentTab === 'Devis') {
              const id = b.client_id ?? b.contact_id;
              return clients.find((c) => String(c.id) === String(id)) || null;
            }
            // Commande & AvoirFournisseur: suppliers; prefer fournisseur_id, fallback to contact_id
            if (currentTab === 'Commande' || currentTab === 'AvoirFournisseur') {
              const id = b.fournisseur_id ?? b.contact_id;
              return suppliers.find((s) => String(s.id) === String(id)) || null;
            }
            // Sortie / Comptant / Avoir (client): prefer client_id, fallback to contact_id
            const clientId = b.client_id ?? b.contact_id;
            const found = clients.find((c) => String(c.id) === String(clientId)) || null;
            if (!found && ((currentTab === 'Comptant' || b.type === 'Comptant' || currentTab === 'AvoirComptant' || b.type === 'AvoirComptant') && b.client_nom)) {
              // Build a minimal contact-like object for display
              return { nom_complet: b.client_nom } as any;
            }
            return found;
          })()}
          items={selectedBonForPrint?.items || []}
        />

        {/* Modal Transformation Devis */}
  <DevisTransformModal 
          isOpen={isDevisTransformModalOpen}
          onClose={() => {
            setIsDevisTransformModalOpen(false);
            setSelectedDevisToTransform(null);
          }}
          devis={selectedDevisToTransform}
          onTransformComplete={() => {
            // Rafraîchir les données ou effectuer d'autres actions après la transformation
          }}
        />

        {/* Modal Nouveau Produit */}
        <ProductFormModal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          onProductAdded={(newProduct) => {
            // Le produit est automatiquement ajouté au store Redux
            console.log('Nouveau produit ajouté:', newProduct);
            setIsProductModalOpen(false);
            showSuccess('Produit ajouté avec succès !');
          }}
        />

        {/* Modal Impression PDF */}
        <BonPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => {
            setIsPrintModalOpen(false);
            setSelectedBonForPDFPrint(null);
          }}
          bon={selectedBonForPDFPrint}
          client={(() => {
            if (!selectedBonForPDFPrint) return undefined;
            const bon = selectedBonForPDFPrint;
            const found = clients.find(c => c.id === bon.client_id);
            if (!found && ((bon.type === 'Comptant' || currentTab === 'Comptant' || bon.type === 'AvoirComptant' || currentTab === 'AvoirComptant') && bon.client_nom)) {
              return { id: 0, nom_complet: bon.client_nom, type: 'Client', solde: 0, created_at: '', updated_at: '' } as any;
            }
            return found;
          })()}
          fournisseur={(() => {
            if (!selectedBonForPDFPrint) return undefined;
            return suppliers.find(s => s.id === selectedBonForPDFPrint.fournisseur_id || s.id === selectedBonForPDFPrint.contact_id);
          })()}
        />

        {/* Modal de duplication AWATEF */}
        {isDuplicateModalOpen && selectedBonForDuplicate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Dupliquer le bon {getDisplayNumero(selectedBonForDuplicate)}</h2>
                <button
                  onClick={() => {
                    setIsDuplicateModalOpen(false);
                    setSelectedBonForDuplicate(null);
                    setSelectedContactForDuplicate('');
                    setComptantClientName('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-2">
                      Dupliquer vers quel type de bon ?
                    </legend>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="client"
                          checked={duplicateType === 'client'}
                          onChange={(e) => setDuplicateType(e.target.value as 'client')}
                          className="mr-2"
                        />
                        <span>Bon de Sortie (Client)</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="fournisseur"
                          checked={duplicateType === 'fournisseur'}
                          onChange={(e) => setDuplicateType(e.target.value as 'fournisseur')}
                          className="mr-2"
                        />
                        <span>Bon de Commande (Fournisseur)</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="comptant"
                          checked={duplicateType === 'comptant'}
                          onChange={(e) => setDuplicateType(e.target.value as 'comptant')}
                          className="mr-2"
                        />
                        <span>Bon Comptant</span>
                      </label>
                    </div>
                  </fieldset>
                </div>

                {duplicateType === 'client' && (
                  <div>
                    <label htmlFor="client-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Sélectionner un client
                    </label>
                    <SearchableSelect
                      id="client-select"
                      options={clients.map((client: any) => {
                        const reference = client.reference ? `(${client.reference})` : '';
                        return {
                          value: client.id.toString(),
                          label: `${client.nom_complet} ${reference}`,
                          data: client,
                        };
                      })}
                      value={selectedContactForDuplicate}
                      onChange={(value) => setSelectedContactForDuplicate(value)}
                      placeholder="Rechercher un client..."
                      className="w-full"
                    />
                  </div>
                )}

                {duplicateType === 'fournisseur' && (
                  <div>
                    <label htmlFor="fournisseur-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Sélectionner un fournisseur
                    </label>
                    <SearchableSelect
                      id="fournisseur-select"
                      options={suppliers.map((supplier: any) => {
                        const reference = supplier.reference ? `(${supplier.reference})` : '';
                        return {
                          value: supplier.id.toString(),
                          label: `${supplier.nom_complet} ${reference}`,
                          data: supplier,
                        };
                      })}
                      value={selectedContactForDuplicate}
                      onChange={(value) => setSelectedContactForDuplicate(value)}
                      placeholder="Rechercher un fournisseur..."
                      className="w-full"
                    />
                  </div>
                )}

                {duplicateType === 'comptant' && (
                  <div>
                    <label htmlFor="client-name-input" className="block text-sm font-medium text-gray-700 mb-2">
                      Nom du client
                    </label>
                    <input
                      id="client-name-input"
                      type="text"
                      value={comptantClientName}
                      onChange={(e) => setComptantClientName(e.target.value)}
                      placeholder="Entrer le nom du client..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setIsDuplicateModalOpen(false);
                      setSelectedBonForDuplicate(null);
                      setSelectedContactForDuplicate('');
                      setComptantClientName('');
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDuplicateAwatef}
                    disabled={
                      (duplicateType === 'client' && !selectedContactForDuplicate) ||
                      (duplicateType === 'fournisseur' && !selectedContactForDuplicate) ||
                      (duplicateType === 'comptant' && !comptantClientName.trim())
                    }
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Dupliquer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  export default BonsPage;
  function getStatusClasses(statut?: string) {
    switch (statut) {
      case 'Brouillon':
        return 'bg-gray-200 text-gray-700';
      case 'Validé':
      case 'Accepté':
      case 'Livré':
        return 'bg-green-200 text-green-700';
      case 'En attente':
      case 'Envoyé':
        return 'bg-blue-200 text-blue-700';
      case 'Avoir':
        return 'bg-purple-200 text-purple-700';
      case 'Annulé':
      case 'Refusé':
      case 'Expiré':
        return 'bg-red-200 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }
  function getStatusIcon(statut?: string) {
    const s = String(statut || '').toLowerCase();
    if (s.includes('en attente') || s === 'attente') return <Clock size={14} />;
    if (s.includes('valid')) return <CheckCircle2 size={14} />;
    if (s.includes('refus')) return <XCircle size={14} />;
    if (s.includes('annul')) return <XCircle size={14} />;
    return null;
  }
