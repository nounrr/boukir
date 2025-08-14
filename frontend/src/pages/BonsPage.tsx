import React, { useState } from 'react';
  import { Plus, Search, Trash2, Edit, Eye, CheckCircle2, Clock, XCircle, Printer } from 'lucide-react';
  import { Formik, Form, Field } from 'formik';
  import ProductFormModal from '../components/ProductFormModal';
  import ContactFormModal from '../components/ContactFormModal';
  import DevisTransformModal from '../components/DevisTransformModal';
  import BonFormModal from '../components/BonFormModal';
  import AvoirFormModal from '../components/AvoirFormModal';
  import ThermalPrintModal from '../components/ThermalPrintModal';
  import BonPrintModal from '../components/BonPrintModal';

  import { 
    useGetBonsByTypeQuery, 
    useDeleteBonMutation, 
  useUpdateBonStatusMutation,
  useMarkBonAsAvoirMutation
  } from '../store/api/bonsApi';
  import { 
    useGetClientsQuery, 
  useGetFournisseursQuery
  } from '../store/api/contactsApi';
  import { useGetProductsQuery } from '../store/api/productsApi';
  import { showError, showSuccess, showConfirmation } from '../utils/notifications';
  import { formatDateDMY, formatDateSpecial } from '../utils/dateUtils';
  import { useSelector } from 'react-redux';
  import type { RootState } from '../store';

const BonsPage = () => {
  const [currentTab, setCurrentTab] = useState<'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'Devis'>('Commande');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedBon, setSelectedBon] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  // Auth context
  const currentUser = useSelector((state: RootState) => state.auth.user);

  // RTK Query hooks
  const { data: bons = [], isLoading: bonsLoading } = useGetBonsByTypeQuery(currentTab);
  const { data: clients = [], isLoading: clientsLoading } = useGetClientsQuery();
  const { data: suppliers = [], isLoading: suppliersLoading } = useGetFournisseursQuery();
  const { data: products = [], isLoading: productsLoading } = useGetProductsQuery();
  const [deleteBonMutation] = useDeleteBonMutation();
  const [updateBonStatus] = useUpdateBonStatusMutation();
  const [markBonAsAvoir] = useMarkBonAsAvoirMutation();
  // Changer le statut d'un bon (Commande / Sortie / Comptant)
  const handleChangeStatus = async (bon: any, statut: 'Validé' | 'En attente' | 'Annulé' | 'Accepté' | 'Envoyé' | 'Refusé') => {
    try {
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
      showError(`Erreur lors du changement de statut: ${error?.data?.message || error?.message || 'Erreur inconnue'}`);
    }
  };
  // Hooks retirés pour éviter les warnings tant que la migration RTK n'est pas terminée

  // ...

    // On ne filtre plus par bon.type car la requête est déjà segmentée par onglet,
    // et certains endpoints ne renvoyaient pas `type`.
    const filteredBons = bons.filter(bon => 
      ((bon.numero?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (bon.statut?.toLowerCase() || '').includes(searchTerm.toLowerCase()))
    );

  // Pagination
  const totalItems = filteredBons.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBons = filteredBons.slice(startIndex, endIndex);

  // Réinitialiser la page quand on change d'onglet ou de recherche
  React.useEffect(() => {
    setCurrentPage(1);
  }, [currentTab, searchTerm]);

  const handleDelete = async (bonToDelete: any) => {
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
  const handleMarkAsAvoir = async (bon: any) => {
    try {
      if (!currentUser?.id) {
        showError('Utilisateur non authentifié');
        return;
      }
      const type = (bon.type || currentTab) as 'Sortie' | 'Comptant' | 'Commande';
      if (!['Sortie', 'Comptant', 'Commande'].includes(type)) {
        showError('Action non disponible pour ce type');
        return;
      }
      const confirm = await showConfirmation(
        'Créer un avoir et marquer ce bon comme Avoir',
        `Confirmer la création d'un avoir pour le bon ${bon.numero} ?`,
        'Oui, créer l\'avoir',
        'Annuler'
      );
      if (!confirm.isConfirmed) return;

      await markBonAsAvoir({ id: bon.id, type, created_by: currentUser.id }).unwrap();
      showSuccess('Avoir créé et bon marqué comme Avoir');
    } catch (error: any) {
      console.error('mark as avoir error', error);
      showError(error?.data?.message || error?.message || 'Erreur lors de la création de l\'avoir');
    }
  };
    

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
    
    

    const getContactName = (bon: any) => {
      if (bon.client_id && clients.length > 0) {
        // Convertir les IDs en string pour assurer la comparaison
        const client = clients.find((c: any) => String(c.id) === String(bon.client_id));
        return client ? client.nom_complet : 'Client supprimé';
      }
      if (bon.fournisseur_id && suppliers.length > 0) {
        // Convertir les IDs en string pour assurer la comparaison
        const supplier = suppliers.find((s: any) => String(s.id) === String(bon.fournisseur_id));
        return supplier ? supplier.nom_complet : 'Fournisseur supprimé';
      }
      return 'Non défini';
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
              { key: 'Avoir', label: 'Avoir Client' },
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
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Numéro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {currentTab === 'AvoirFournisseur' || currentTab === 'Commande' ? 'Fournisseur' : 'Client'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Adresse livraison
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Montant
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
                    <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                      Aucun bon trouvé pour {currentTab}
                    </td>
                  </tr>
                ) : (
                  paginatedBons.map((bon) => (
                    <tr key={bon.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">{bon.numero}</td>
                      <td className="px-4 py-2 text-sm">{formatDateDMY(bon.date_creation)}</td>
                      <td className="px-4 py-2 text-sm">{getContactName(bon)}</td>
                      <td className="px-4 py-2 text-sm">{bon.adresse_livraison ?? bon.adresseLivraison ?? '-'}</td>
                      <td className="px-4 py-2">
                        <div className="text-sm font-semibold text-gray-900">{Number(bon.montant_total ?? 0).toFixed(2)} DH</div>
                        <div className="text-xs text-gray-500">{bon.items?.length || 0} articles</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusClasses(bon.statut)}`}>
                          {bon.statut || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-2">
                          {/* Status-change actions: only visible to PDG */}
                          {currentUser?.role === 'PDG' && (
                            <>
                              {(currentTab === 'Commande' || currentTab === 'Sortie' || currentTab === 'Comptant') && (
                                <>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Validé')}
                                    className="text-green-600 hover:text-green-800"
                                    title="Marquer Validé"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'En attente')}
                                    className="text-yellow-600 hover:text-yellow-800"
                                    title="Mettre En attente"
                                  >
                                    <Clock size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Annulé')}
                                    className="text-red-600 hover:text-red-800"
                                    title="Annuler"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}

                              {(currentTab === 'Avoir' || currentTab === 'AvoirFournisseur') && (
                                <>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Validé')}
                                    className="text-green-600 hover:text-green-800"
                                    title="Valider l'avoir"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'En attente')}
                                    className="text-yellow-600 hover:text-yellow-800"
                                    title="Mettre en attente"
                                  >
                                    <Clock size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Annulé')}
                                    className="text-red-600 hover:text-red-800"
                                    title="Annuler l'avoir"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}

                              {currentTab === 'Devis' && (
                                <>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Accepté')}
                                    className="text-green-600 hover:text-green-800"
                                    title="Accepter le devis"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Envoyé')}
                                    className="text-blue-600 hover:text-blue-800"
                                    title="Marquer comme envoyé"
                                  >
                                    <Clock size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Refusé')}
                                    className="text-red-600 hover:text-red-800"
                                    title="Refuser le devis"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => { 
                              setSelectedBonForPrint(bon); 
                              setIsThermalPrintModalOpen(true); 
                            }}
                            className="text-purple-600 hover:text-purple-800"
                            title="Imprimer (Thermique 5cm)"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            onClick={() => { 
                              setSelectedBonForPDFPrint(bon); 
                              setIsPrintModalOpen(true); 
                            }}
                            className="text-green-600 hover:text-green-800"
                            title="Imprimer PDF (A4/A5)"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            onClick={() => { setSelectedBon(bon); setIsViewModalOpen(true); }}
                            className="text-gray-600 hover:text-gray-900"
                            title="Voir"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => { setSelectedBon(bon); setIsCreateModalOpen(true); }}
                            className="text-blue-600 hover:text-blue-800"
                            title="Modifier"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(bon)}
                            className="text-red-600 hover:text-red-800"
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
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
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          currentTab={currentTab}
          initialValues={selectedBon || undefined}
          onBonAdded={(newBon) => {
            // Le bon est automatiquement ajouté au store Redux
            showSuccess(`${currentTab} ${newBon.numero} ${selectedBon ? 'mis à jour' : 'créé'} avec succès!`);
            setIsCreateModalOpen(false);
            setSelectedBon(null);
          }}
        />

        {/* Modal de visualisation */}
        {isViewModalOpen && selectedBon && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Détails du Bon {selectedBon.numero}</h2>
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
                      <p className="text-lg">{selectedBon.numero}</p>
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
                        <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusClasses(selectedBon.statut)}`}>
                        {selectedBon.statut}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Contact:</p>
                      <p className="text-lg">{getContactName(selectedBon)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Montant total:</p>
                      <p className="text-lg font-bold text-blue-600">{Number(selectedBon.montant_total ?? 0).toFixed(2)} DH</p>
                    </div>
                  </div>

                  <div className="border rounded-md p-4">
                    <h3 className="font-bold mb-3">Produits</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
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
                                <td className="px-4 py-2 text-sm">{Number(item.prix_unitaire ?? 0).toFixed(2)} DH</td>
                                <td className="px-4 py-2 text-sm font-semibold">{Number(item.montant_ligne ?? 0).toFixed(2)} DH</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end text-base font-semibold mt-2">
                      Total: {Number(selectedBon.montant_total ?? 0).toFixed(2)} DH
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
          type={currentTab === 'Avoir' ? 'AvoirClient' : currentTab}
          contact={(() => {
            if (!selectedBonForPrint) return null;
            if (currentTab === 'Devis') {
              return clients.find(c => c.id === selectedBonForPrint.client_id);
            }
            if (currentTab === 'Commande' || currentTab === 'AvoirFournisseur') {
              return suppliers.find(s => s.id === selectedBonForPrint.contact_id);
            }
            return clients.find(c => c.id === selectedBonForPrint.contact_id);
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
            return clients.find(c => c.id === selectedBonForPDFPrint.client_id);
          })()}
          fournisseur={(() => {
            if (!selectedBonForPDFPrint) return undefined;
            return suppliers.find(s => s.id === selectedBonForPDFPrint.fournisseur_id || s.id === selectedBonForPDFPrint.contact_id);
          })()}
        />
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
