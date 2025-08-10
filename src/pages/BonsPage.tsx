  import React, { useState } from 'react';
  import { useDispatch } from 'react-redux';
  import { useAppSelector } from '../hooks/redux';
  import { Plus, Search, Trash2, Edit, Eye, Check, XCircle } from 'lucide-react';
  import { Formik, Form, Field, FieldArray } from 'formik';
  import * as Yup from 'yup';
  import ProductFormModal from '../components/ProductFormModal';
  import ContactFormModal from '../components/ContactFormModal';
  import DevisTransformModal from '../components/DevisTransformModal';
  import BonFormModal from '../components/BonFormModal';
  import AvoirFormModal from '../components/AvoirFormModal';

  import { resetFilters, addBon, setBons, deleteBon, updateBon } from '../store/slices/bonsSlice';
  import { addContact } from '../store/slices/contactsSlice';
  import type { Contact } from '../types';
  import { showError, showSuccess, showConfirmation } from '../utils/notifications';
  import { getCurrentDateFormatted } from '../utils/dateUtils';
  import { generateBonReference, generateClientReference, generateSupplierReference } from '../utils/referenceUtils';

  const BonsPage = () => {
    const dispatch = useDispatch();
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
    const [selectedProductsForAvoir, setSelectedProductsForAvoir] = useState<number[]>([]);
    const [selectedProductsForAvoirClient, setSelectedProductsForAvoirClient] = useState<number[]>([]);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isDevisTransformModalOpen, setIsDevisTransformModalOpen] = useState(false);
    const [selectedDevisToTransform, setSelectedDevisToTransform] = useState<any>(null);
    const [transformationType, setTransformationType] = useState<'choice' | 'sortie' | null>('choice'); // 'choice' pour le choix initial, 'sortie' pour le select client
    const [selectedClientForSortie, setSelectedClientForSortie] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [showClientDropdown, setShowClientDropdown] = useState(false);

    // Redux data
    const bons = useAppSelector(state => (state as any).bons?.bons || []);
    const clients = useAppSelector(state =>
      (state as any).contacts?.contacts?.filter((c: Contact) => c.type === 'Client') || []
    );
    const suppliers = useAppSelector(state =>
      (state as any).contacts?.contacts?.filter((c: Contact) => c.type === 'Fournisseur') || []
    );
    const products = useAppSelector(state => (state as any).products?.products || []);

    // Mock data - initialiser le store si vide
    const mockBons = [
      {
        id: 1,
        numero: 'CMD-001',
        type: 'Commande' as const,
        date_creation: '15-01-24',
        fournisseur_id: 1, // TechnoPlus SARL (fournisseur)
        statut: 'Validé' as const,
        montant_total: 1500.00,
        created_at: '2024-01-15T10:00:00.000Z',
        updated_at: '2024-01-15T10:00:00.000Z',
        items: [
          { id: 1, produit_id: 1, quantite: 2, prix_unitaire: 750, montant_ligne: 1500 }
        ]
      },
      {
        id: 2,
        numero: 'SOR-002',
        type: 'Sortie' as const,
        date_creation: '16-01-24',
        client_id: 5, // Entreprise Alami (client)
        statut: 'Validé' as const,
        montant_total: 2300.00,
        created_at: '2024-01-16T11:00:00.000Z',
        updated_at: '2024-01-16T11:00:00.000Z',
        items: [
          { id: 2, produit_id: 2, quantite: 1, prix_unitaire: 2300, montant_ligne: 2300 }
        ]
      },
      {
        id: 3,
        numero: 'DEV-003',
        type: 'Devis' as const,
        date_creation: '17-01-24',
        client_id: 6, // Société Bennis (client)
        statut: 'Brouillon' as const,
        montant_total: 850.00,
        created_at: '2024-01-17T12:00:00.000Z',
        updated_at: '2024-01-17T12:00:00.000Z',
        items: [
          { id: 3, produit_id: 1, quantite: 1, prix_unitaire: 850, montant_ligne: 850 }
        ]
      },
      {
        id: 4,
        numero: 'CPT-004',
        type: 'Comptant' as const,
        date_creation: '18-01-24',
        client_id: 7, // Cabinet Tazi (client)
        statut: 'Validé' as const,
        montant_total: 1200.00,
        created_at: '2024-01-18T13:00:00.000Z',
        updated_at: '2024-01-18T13:00:00.000Z',
        items: [
          { id: 4, produit_id: 2, quantite: 2, prix_unitaire: 600, montant_ligne: 1200 }
        ]
      }
    ];

    // Initialiser le store avec des données de test si vide
    React.useEffect(() => {
      if (bons.length === 0) {
        dispatch(setBons(mockBons));
      }
    }, [bons.length, dispatch]);

    const filteredBons = bons.filter(bon => 
      bon.type === currentTab &&
      ((bon.numero?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (bon.statut?.toLowerCase() || '').includes(searchTerm.toLowerCase()))
    );

    const handleDelete = async (id: number) => {
      const result = await showConfirmation(
        'Cette action est irréversible.',
        'Êtes-vous sûr de vouloir supprimer ce bon ?',
        'Oui, supprimer',
        'Annuler'
      );
      
      if (result.isConfirmed) {
        try {
          dispatch(deleteBon(id));
          showSuccess('Bon supprimé avec succès');
        } catch (error) {
          showError('Erreur lors de la suppression du bon');
        }
      }
    };
    

    // Valider un bon (changer son statut en "Validé")
    const handleValidate = (bon: any) => {
      // Logique spéciale pour les devis
      if (bon.type === 'Devis') {
        if (bon.client_id) {
          // Cas 1: Devis lié à un client → transformation directe en bon de sortie
          const bonSortieData = {
            ...bon,
            id: Date.now(),
            numero: generateBonReference('Sortie'),
            type: 'Sortie' as const,
            statut: 'En attente' as const,
            updated_at: new Date().toISOString(),
          };
          
          dispatch(addBon(bonSortieData));
          showSuccess('Devis transformé en bon de sortie avec succès');
        } else {
          // Cas 2: Devis non lié à un client → afficher popup de choix
          setSelectedDevisToTransform(bon);
          setIsDevisTransformModalOpen(true);
        }
      } else {
        // Validation normale pour les autres types de bons
        dispatch(updateBon({ ...bon, statut: 'Validé', updated_at: new Date().toISOString() }));
        showSuccess('Bon validé avec succès');
      }
    };

    // Transformer un devis en bon comptant
    const handleTransformToComptant = (devis: any) => {
      const bonComptantData = {
        ...devis,
        id: Date.now(),
        numero: generateBonReference('Comptant'),
        type: 'Comptant' as const,
        statut: 'En attente' as const,
        updated_at: new Date().toISOString(),
      };
      
      // Ajouter le nouveau bon comptant
      dispatch(addBon(bonComptantData));
      
      // Mettre à jour le statut du devis original à "Validé"
      const updatedDevis = {
        ...devis,
        statut: 'Validé' as const,
        updated_at: new Date().toISOString(),
      };
      dispatch(updateBon(updatedDevis));
      
      showSuccess('Devis transformé en bon comptant avec succès');
      setIsDevisTransformModalOpen(false);
      setSelectedDevisToTransform(null);
      setTransformationType('choice');
      setSelectedClientForSortie('');
      setClientSearchTerm('');
      setShowClientDropdown(false);
    };

    // Transformer un devis en bon de sortie avec client
    const handleTransformToSortie = (devis: any, clientId?: number) => {
      if (!clientId && !selectedClientForSortie) {
        showError('Veuillez sélectionner un client pour transformer en bon de sortie');
        return;
      }
      
      const finalClientId = clientId || parseInt(selectedClientForSortie);
      const selectedClient = clients.find((c: any) => c.id === finalClientId);
      
      if (!selectedClient || !selectedClient.nom_complet) {
        showError('Client sélectionné introuvable ou invalide');
        return;
      }
      
      const bonSortieData = {
        ...devis,
        id: Date.now(),
        numero: generateBonReference('Sortie'),
        type: 'Sortie' as const,
        client_id: finalClientId,
        client_nom: selectedClient.nom_complet,
        statut: 'En attente' as const,
        updated_at: new Date().toISOString(),
      };
      
      // Ajouter le nouveau bon de sortie
      dispatch(addBon(bonSortieData));
      
      // Mettre à jour le statut du devis original à "Validé"
      const updatedDevis = {
        ...devis,
        statut: 'Validé' as const,
        updated_at: new Date().toISOString(),
      };
      dispatch(updateBon(updatedDevis));
      
      showSuccess(`Devis transformé en bon de sortie pour ${selectedClient.nom_complet || 'Client'}`);
      setIsDevisTransformModalOpen(false);
      setSelectedDevisToTransform(null);
      setTransformationType('choice');
      setSelectedClientForSortie('');
      setClientSearchTerm('');
      setShowClientDropdown(false);
    };

    // Annuler la validation d'un bon (remettre en attente)
    const handleUnvalidate = (bon: any) => {
      dispatch(updateBon({ ...bon, statut: 'En attente', updated_at: new Date().toISOString() }));
      showSuccess('Validation annulée');
    };

    // Annuler un avoir (changer son statut en "Annulé")
    const handleCancelAvoir = (bon: any) => {
      dispatch(updateBon({ ...bon, statut: 'Annulé', updated_at: new Date().toISOString() }));
      showSuccess('Avoir annulé avec succès');
    };

    // Remettre un avoir en attente depuis validé
    const handleAvoirBackToWaiting = (bon: any) => {
      dispatch(updateBon({ ...bon, statut: 'En attente', updated_at: new Date().toISOString() }));
      showSuccess('Avoir remis en attente');
    };
    
    const handleViewBon = (bon: any) => {
      setSelectedBon(bon);
      setIsViewModalOpen(true);
    };

    const handleEditBon = (bon: any) => {
      setSelectedBon(bon);
      setIsCreateModalOpen(true);
    };

    const handleCreateNewClient = () => {
      setIsNewClientModalOpen(true);
    };

    const handleCreateNewSupplier = () => {
      setIsNewSupplierModalOpen(true);
    };

    const handleCreateNewVehicle = () => {
      setIsNewVehicleModalOpen(true);
    };

    const handleCreateAvoir = (bon: any) => {
      // Si le bon contient un seul produit, créer l'avoir complet automatiquement
      if (bon.items && bon.items.length === 1) {
        const avoirData = {
          id: Date.now(),
          numero: generateBonReference('AvoirFournisseur'),
          type: 'AvoirFournisseur' as const,
          date_creation: getCurrentDateFormatted(),
          fournisseur_id: bon.fournisseur_id,
          bon_origine_id: bon.id,
          bon_origine_numero: bon.numero,
          statut: 'En attente' as const,
          montant_total: bon.montant_total,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: bon.items.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
          }))
        };
        
        // Laisser le bon original en "En attente" (pas de changement de statut)
        dispatch(addBon(avoirData));
        showSuccess('Avoir fournisseur complet créé automatiquement');
        setCurrentTab('AvoirFournisseur');
      } else {
        // Plusieurs produits, afficher le popup de choix
        setSelectedBonForAvoir(bon);
        setIsCreateAvoirModalOpen(true);
      }
    };

    const handleCreateAvoirClient = (bon: any) => {
      // Si le bon contient un seul produit, créer l'avoir complet automatiquement
      if (bon.items && bon.items.length === 1) {
        const avoirData = {
          id: Date.now(),
          numero: generateBonReference('Avoir'),
          type: 'Avoir' as const,
          date_creation: new Date().toISOString().split('T')[0],
          client_id: bon.client_id,
          bon_origine_id: bon.id,
          bon_origine_numero: bon.numero,
          statut: 'En attente' as const,
          montant_total: bon.montant_total,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: bon.items.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
          }))
        };
        
        // Laisser le bon original en "En attente" (pas de changement de statut)
        dispatch(addBon(avoirData));
        showSuccess('Avoir client complet créé automatiquement');
        setCurrentTab('Avoir');
      } else {
        // Plusieurs produits, afficher le popup de choix
        setSelectedBonForAvoirClient(bon);
        setIsCreateAvoirClientModalOpen(true);
      }
    };

    const bonValidationSchema = Yup.object().shape({
      numero: Yup.string().required('Numéro est requis'),
      date_creation: Yup.date().required('Date de création est requise'),
      items: Yup.array()
        .of(
          Yup.object().shape({
            produit_id: Yup.number().required('Produit est requis'),
            quantite: Yup.number().required('Quantité est requise').positive('Quantité doit être positive'),
            prix_unitaire: Yup.number().required('Prix unitaire est requis').min(0, 'Prix unitaire doit être positif ou nul'),
          })
        )
        .min(1, 'Au moins un produit est requis'),
    });

    const getInitialValues = () => {
      if (selectedBon) {
        return {
          numero: selectedBon.numero,
          type: selectedBon.type,
          date_creation: selectedBon.date_creation,
          date_echeance: selectedBon.date_echeance || '',
          client_id: selectedBon.client_id || '',
          fournisseur_id: selectedBon.fournisseur_id || '',
          adresse_livraison: '',
          vehicule: selectedBon.vehicule || '',
          lieu_chargement: selectedBon.lieu_chargement || '',
          items: selectedBon.items.map((item: any) => ({
            produit_id: item.produit_id,
            quantite: item.quantite,
            prix_unitaire: item.prix_unitaire,
            montant_ligne: item.montant_ligne,
          })),
        };
      }
      
      return {
        numero: generateBonReference(currentTab),
        type: currentTab,
        date_creation: new Date().toISOString().split('T')[0],
        date_echeance: '',
        client_id: '',
        fournisseur_id: '',
        adresse_livraison: '',
        vehicule: '',
        lieu_chargement: '',
        items: [
          {
            produit_id: '',
            quantite: 1,
            prix_unitaire: 0,
            montant_ligne: 0,
          },
        ],
      };
    };

    const handleSubmit = async (values: any) => {
      try {
        const items = values.items.map((item: any) => ({
          ...item,
          montant_ligne: item.quantite * item.prix_unitaire,
        }));

        const montant_total = items.reduce((total: number, item: any) => total + item.montant_ligne, 0);

        const bonData = {
          ...values,
          items,
          montant_total,
          statut: values.type === 'Devis' ? 'Brouillon' : 'En attente',
          id: selectedBon ? selectedBon.id : Date.now(), // Générer un ID si nouveau bon
          created_at: selectedBon ? selectedBon.created_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (selectedBon) {
          // Mettre à jour le bon existant dans le store Redux
          dispatch(updateBon(bonData));
          console.log('✅ Bon mis à jour dans Redux:', bonData);
          showSuccess('Bon mis à jour avec succès');
        } else {
          // Ajouter le nouveau bon au store Redux
          dispatch(addBon(bonData));
          console.log('✅ Nouveau bon ajouté dans Redux:', bonData);
          showSuccess('Bon créé avec succès');
        }
        
        setIsCreateModalOpen(false);
        setSelectedBon(null);
      } catch (error) {
        showError('Erreur lors de la sauvegarde du bon');
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
          <button
            onClick={() => dispatch(resetFilters())}
            className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Réinitialiser les filtres
          </button>
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
                {filteredBons.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                      Aucun bon trouvé pour {currentTab}
                    </td>
                  </tr>
                ) : (
                  filteredBons.map((bon) => (
                    <tr key={bon.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{bon.numero}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{bon.date_creation}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{getContactName(bon)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">{bon.montant_total.toFixed(2)} DH</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          bon.statut === 'Brouillon' ? 'bg-gray-200 text-gray-700' :
                          bon.statut === 'Validé' ? 'bg-blue-200 text-blue-700' :
                          bon.statut === 'En attente' ? 'bg-yellow-200 text-yellow-700' :
                          bon.statut === 'Livré' ? 'bg-green-200 text-green-700' :
                          bon.statut === 'Avoir' ? 'bg-purple-200 text-purple-700' :
                          'bg-red-200 text-red-700'
                        }`}>
                          {bon.statut}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewBon(bon)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Voir détails"
                          >
                            <Eye size={16} />
                          </button>
                          
                          {/* Valider bon si non validé */}
                          {(bon.statut === 'Brouillon' || bon.statut === 'En attente') && (
                            <button
                              onClick={() => handleValidate(bon)}
                              className="text-green-600 hover:text-green-900"
                              title="Valider"
                            >
                              <Check size={16} />
                            </button>
                          )}
                          
                          {/* Modification - pour tous les bons sauf ceux livrés/payés */}
                          {(bon.statut === 'Brouillon' || bon.statut === 'En attente' || bon.statut === 'Validé') && (
                            <button
                              onClick={() => handleEditBon(bon)}
                              className="text-green-600 hover:text-green-900"
                              title="Modifier"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          

                          {/* Suppression - pour les brouillons et en attente */}
                          {(bon.statut === 'Brouillon' || bon.statut === 'En attente') && (
                            <button
                              onClick={() => handleDelete(bon.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Supprimer"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}

                          {/* Annuler validation - pour les bons validés */}
                          {bon.statut === 'Validé' && (
                            <button
                              onClick={() => handleUnvalidate(bon)}
                              className="text-yellow-600 hover:text-yellow-900"
                              title="Annuler la validation"
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                          
                          {/* Avoir Fournisseur - pour les bons Commande validés */}
                          {(bon.type === 'Commande' && bon.statut === 'Validé') && (
                            <button
                              onClick={() => handleCreateAvoir(bon)}
                              className="bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded text-xs"
                              title="Créer avoir fournisseur"
                            >
                              Avoir F.
                            </button>
                          )}
                          
                          {/* Avoir Client - pour les bons Sortie et Comptant validés */}
                          {((bon.type === 'Sortie' || bon.type === 'Comptant') && bon.statut === 'Validé') && (
                            <button
                              onClick={() => handleCreateAvoirClient(bon)}
                              className="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs"
                              title="Créer avoir client"
                            >
                              Avoir C.
                            </button>
                          )}

                          {/* Actions spécifiques pour les avoirs validés */}
                          {((bon.type === 'Avoir' || bon.type === 'AvoirFournisseur') && bon.statut === 'Validé') && (
                            <>
                              <button
                                onClick={() => handleCancelAvoir(bon)}
                                className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs mr-1"
                                title="Annuler l'avoir"
                              >
                                Annuler
                              </button>
                              <button
                                onClick={() => handleAvoirBackToWaiting(bon)}
                                className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs"
                                title="Remettre en attente"
                              >
                                En attente
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
                    <p className="text-lg">{selectedBon.date_creation}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Statut:</p>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                      selectedBon.statut === 'Brouillon' ? 'bg-gray-200 text-gray-700' :
                      selectedBon.statut === 'Validé' ? 'bg-blue-200 text-blue-700' :
                      selectedBon.statut === 'En attente' ? 'bg-yellow-200 text-yellow-700' :
                      selectedBon.statut === 'Livré' ? 'bg-green-200 text-green-700' :
                      selectedBon.statut === 'Avoir' ? 'bg-purple-200 text-purple-700' :
                      'bg-red-200 text-red-700'
                    }`}>
                      {selectedBon.statut}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Contact:</p>
                    <p className="text-lg">{getContactName(selectedBon)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Montant total:</p>
                    <p className="text-lg font-bold text-blue-600">{selectedBon.montant_total.toFixed(2)} DH</p>
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
                          const product = products.find((p: any) => p.id === item.produit_id);
                          const displayDesignation = item.designation_custom || product?.designation || 'Produit non trouvé';
                          return (
                            <tr key={item.id}>
                              <td className="px-4 py-2 text-sm">{displayDesignation}</td>
                              <td className="px-4 py-2 text-sm">{item.quantite}</td>
                              <td className="px-4 py-2 text-sm">{item.prix_unitaire.toFixed(2)} DH</td>
                              <td className="px-4 py-2 text-sm font-semibold">{item.montant_ligne.toFixed(2)} DH</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-right mt-4 pt-4 border-t">
                    <span className="text-lg font-bold text-blue-600">
                      Total: {selectedBon.montant_total.toFixed(2)} DH
                    </span>
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
                      {/* Actions pour bons normaux validés */}
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
                      
                      {/* Actions spécifiques pour les avoirs validés */}
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
            </div>
          </div>
        )}

        {/* Modal pour nouveau client */}
        <ContactFormModal
          isOpen={isNewClientModalOpen}
          onClose={() => setIsNewClientModalOpen(false)}
          contactType="Client"
          onContactAdded={(newClient) => {
            showSuccess('Client créé avec succès!');
          }}
        />

        {/* Modal pour nouveau fournisseur */}
        <ContactFormModal
          isOpen={isNewSupplierModalOpen}
          onClose={() => setIsNewSupplierModalOpen(false)}
          contactType="Fournisseur"
          onContactAdded={(newSupplier) => {
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
                  try {
                    // TODO: Créer un slice Redux pour les véhicules ou les intégrer dans les contacts
                    // Pour l'instant, on simule la création du véhicule
                    console.log('Nouveau véhicule:', values);
                    showSuccess(`Véhicule ${values.immatriculation} créé avec succès!`);
                    setIsNewVehicleModalOpen(false);
                    // Note: Le véhicule sera ajouté à la liste déroulante lors de l'implémentation du slice véhicules
                  } catch (error) {
                    showError('Erreur lors de la création du véhicule');
                  }
                }}
              >
                <Form className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Immatriculation
                    </label>
                    <Field
                      name="immatriculation"
                      type="text"
                      placeholder="Ex: 12-A-3456"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marque
                    </label>
                    <Field
                      name="marque"
                      type="text"
                      placeholder="Ex: Mercedes, Renault, Peugeot"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Modèle
                    </label>
                    <Field
                      name="modele"
                      type="text"
                      placeholder="Ex: Actros, Master, Boxer"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type de véhicule
                    </label>
                    <Field
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
            setSelectedProductsForAvoir([]);
          }}
          bonOrigine={selectedBonForAvoir}
          products={products}
          onAvoirAdded={(newAvoir) => {
            showSuccess('Avoir fournisseur créé avec succès');
            setIsCreateAvoirModalOpen(false);
            setSelectedBonForAvoir(null);
            setSelectedProductsForAvoir([]);
            setCurrentTab('AvoirFournisseur');
          }}
        />

        {/* Modal pour créer un avoir client */}
        <AvoirFormModal
          isOpen={isCreateAvoirClientModalOpen}
          onClose={() => {
            setIsCreateAvoirClientModalOpen(false);
            setSelectedBonForAvoirClient(null);
            setSelectedProductsForAvoirClient([]);
          }}
          bonOrigine={selectedBonForAvoirClient}
          onAvoirCreated={(newAvoir) => {
            showSuccess('Avoir client créé avec succès');
            setIsCreateAvoirClientModalOpen(false);
            setSelectedBonForAvoirClient(null);
            setSelectedProductsForAvoirClient([]);
            setCurrentTab('Avoir');
          }}
        />

        {/* Modal Transformation Devis */}
        <DevisTransformModal 
          isOpen={isDevisTransformModalOpen}
          onClose={() => {
            setIsDevisTransformModalOpen(false);
            setSelectedDevisToTransform(null);
            setTransformationType('choice');
            setSelectedClientForSortie('');
            setClientSearchTerm('');
            setShowClientDropdown(false);
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
      </div>
    );
  };

  export default BonsPage;
