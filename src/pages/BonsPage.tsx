import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '../hooks/redux';
import { Plus, Search, Trash2, Edit, Eye, Check, XCircle } from 'lucide-react';
import { Formik, Form, Field, FieldArray } from 'formik';
import * as Yup from 'yup';

import { resetFilters, addBon, setBons, deleteBon, updateBon } from '../store/slices/bonsSlice';
import { addContact } from '../store/slices/contactsSlice';
import type { Contact } from '../types';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import { getCurrentDateFormatted } from '../utils/dateUtils';

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
    (bon.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
     bon.statut.toLowerCase().includes(searchTerm.toLowerCase()))
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
    dispatch(updateBon({ ...bon, statut: 'Validé', updated_at: new Date().toISOString() }));
    showSuccess('Bon validé avec succès');
  };

  // Annuler la validation d'un bon (remettre en attente)
  const handleUnvalidate = (bon: any) => {
    dispatch(updateBon({ ...bon, statut: 'En attente', updated_at: new Date().toISOString() }));
    showSuccess('Validation annulée');
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
        numero: `AVO-${Date.now().toString().substring(5)}`,
        type: 'AvoirFournisseur' as const,
        date_creation: getCurrentDateFormatted(),
        fournisseur_id: bon.fournisseur_id,
        bon_origine_id: bon.id,
        bon_origine_numero: bon.numero,
        statut: 'Avoir' as const,
        montant_total: bon.montant_total,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: bon.items.map((item: any) => ({
          ...item,
          id: Date.now() + Math.random(),
        }))
      };
      
      // Mettre à jour le bon original en statut "Avoir"
      dispatch(updateBon({ ...bon, statut: 'Avoir', updated_at: new Date().toISOString() }));
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
        numero: `AVC-${Date.now().toString().substring(5)}`,
        type: 'Avoir' as const,
        date_creation: new Date().toISOString().split('T')[0],
        client_id: bon.client_id,
        bon_origine_id: bon.id,
        bon_origine_numero: bon.numero,
        statut: 'Avoir' as const,
        montant_total: bon.montant_total,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: bon.items.map((item: any) => ({
          ...item,
          id: Date.now() + Math.random(),
        }))
      };
      
      // Mettre à jour le bon original en statut "Avoir"
      dispatch(updateBon({ ...bon, statut: 'Avoir', updated_at: new Date().toISOString() }));
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
      numero: `${currentTab.substring(0, 3).toUpperCase()}-${new Date().getTime().toString().substring(0, 10)}`,
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
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {selectedBon ? 'Modifier' : 'Créer'} un {currentTab}
              </h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <Formik
              initialValues={getInitialValues()}
              validationSchema={bonValidationSchema}
              onSubmit={handleSubmit}
            >
              {({ values, errors, touched, setFieldValue }) => (
                <Form className="space-y-6">
                  {/* Informations générales */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Numéro *
                      </label>
                      <Field
                        name="numero"
                        type="text"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {errors.numero && touched.numero && (
                        <div className="text-red-500 text-sm mt-1">{errors.numero}</div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date de création *
                      </label>
                      <Field
                        name="date_creation"
                        type="date"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {errors.date_creation && touched.date_creation && (
                        <div className="text-red-500 text-sm mt-1">{errors.date_creation}</div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date d'échéance
                      </label>
                      <Field
                        name="date_echeance"
                        type="date"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Sélection Client/Fournisseur selon le type */}
                    {currentTab !== 'AvoirFournisseur' && currentTab !== 'Commande' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Client
                          </label>
                          <div className="flex gap-2">
                            <Field
                              as="select"
                              name="client_id"
                              className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onChange={(e: any) => {
                                setFieldValue('client_id', e.target.value);
                                const selectedClient = clients.find((c: any) => c.id === Number(e.target.value));
                                setFieldValue('adresse_livraison', selectedClient?.adresse || '');
                              }}
                            >
                              <option value="">Sélectionner un client</option>
                              {clients.map((client: any) => (
                                <option key={client.id} value={client.id}>
                                  {client.nom_complet}
                                </option>
                              ))}
                            </Field>
                            <button
                              type="button"
                              className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                              onClick={handleCreateNewClient}
                            >
                              + Nouveau
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Adresse de livraison
                          </label>
                          <Field
                            name="adresse_livraison"
                            type="text"
                            disabled
                            className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                          />
                        </div>
                      </>
                    )}

                    {(currentTab === 'AvoirFournisseur' || currentTab === 'Commande') && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fournisseur
                          </label>
                          <div className="flex gap-2">
                            <Field
                              as="select"
                              name="fournisseur_id"
                              className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onChange={(e: any) => {
                                setFieldValue('fournisseur_id', e.target.value);
                                const selectedSupplier = suppliers.find((s: any) => s.id === Number(e.target.value));
                                setFieldValue('adresse_livraison', selectedSupplier?.adresse || '');
                              }}
                            >
                              <option value="">Sélectionner un fournisseur</option>
                              {suppliers.map((supplier: any) => (
                                <option key={supplier.id} value={supplier.id}>
                                  {supplier.nom_complet}
                                </option>
                              ))}
                            </Field>
                            <button
                              type="button"
                              className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                              onClick={handleCreateNewSupplier}
                            >
                              + Nouveau
                            </button>
                          </div>
                        </div>

                        {values.fournisseur_id && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Adresse
                            </label>
                            <Field
                              name="adresse_livraison"
                              type="text"
                              disabled
                              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                            />
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Véhicule
                      </label>
                      <div className="flex gap-2">
                        <Field
                          as="select"
                          name="vehicule"
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Sélectionner un véhicule</option>
                          <option value="12-A-3456">12-A-3456 - Camion Mercedes</option>
                          <option value="34-B-7890">34-B-7890 - Fourgon Renault</option>
                          <option value="56-C-1234">56-C-1234 - Utilitaire Peugeot</option>
                        </Field>
                        <button
                          type="button"
                          className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                          onClick={handleCreateNewVehicle}
                        >
                          + Nouveau
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Lieu de chargement
                      </label>
                      <Field
                        name="lieu_chargement"
                        type="text"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Lieu de chargement"
                      />
                    </div>
                  </div>

                  {/* Section Produits */}
                  <div className="border rounded-md p-4 bg-gray-50">
                    <h3 className="font-bold mb-4 text-lg">Produits</h3>
                    <FieldArray name="items">
                      {({ push, remove }) => (
                        <>
                          <div className="space-y-4">
                            {values.items.map((item: any, index: number) => {
                              const selectedProduct = products.find((p: any) => p.id === Number(item.produit_id));
                              const stockInsuffisant = selectedProduct && item.quantite > selectedProduct.quantite;
                              
                              return (
                                <div key={index} className="grid grid-cols-6 gap-3 p-4 bg-white border rounded-md">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Référence *
                                    </label>
                                    <Field
                                      as="select"
                                      name={`items.${index}.produit_id`}
                                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      onChange={(e: any) => {
                                        const produitId = e.target.value;
                                        const selectedProd = products.find((p: any) => p.id === Number(produitId));
                                        setFieldValue(`items.${index}.produit_id`, produitId);
                                        setFieldValue(`items.${index}.prix_unitaire`, selectedProd?.prix_vente || 0);
                                        setFieldValue(`items.${index}.montant_ligne`, 
                                          (selectedProd?.prix_vente || 0) * item.quantite
                                        );
                                      }}
                                    >
                                      <option value="">Sélectionner</option>
                                      {products.map((product: any) => (
                                        <option key={product.id} value={product.id}>
                                          {product.reference}
                                        </option>
                                      ))}
                                    </Field>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Désignation
                                    </label>
                                    <input
                                      type="text"
                                      disabled
                                      value={selectedProduct?.designation || ''}
                                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-50"
                                    />
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Quantité *
                                    </label>
                                    <Field
                                      name={`items.${index}.quantite`}
                                      type="number"
                                      min="1"
                                      className={`w-full border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                        stockInsuffisant ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                      }`}
                                      onChange={(e: any) => {
                                        const quantite = Number(e.target.value);
                                        setFieldValue(`items.${index}.quantite`, quantite);
                                        setFieldValue(
                                          `items.${index}.montant_ligne`,
                                          quantite * item.prix_unitaire
                                        );
                                      }}
                                    />
                                    {selectedProduct && (
                                      <div className={`text-xs mt-1 ${stockInsuffisant ? 'text-red-600' : 'text-gray-500'}`}>
                                        Stock: {selectedProduct.quantite}
                                        {stockInsuffisant && ' - Insuffisant!'}
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Prix unitaire *
                                    </label>
                                    <Field
                                      name={`items.${index}.prix_unitaire`}
                                      type="number"
                                      step="0.01"
                                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      onChange={(e: any) => {
                                        const prix = Number(e.target.value);
                                        setFieldValue(`items.${index}.prix_unitaire`, prix);
                                        setFieldValue(
                                          `items.${index}.montant_ligne`,
                                          prix * item.quantite
                                        );
                                      }}
                                    />
                                  </div>
                                  
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Total ligne
                                    </label>
                                    <div className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-50 font-medium">
                                      {(item.prix_unitaire * item.quantite).toFixed(2)} DH
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      onClick={() => remove(index)}
                                      disabled={values.items.length === 1}
                                      className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-md px-2 py-1 text-sm"
                                    >
                                      <Trash2 className="h-4 w-4 mx-auto" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() =>
                                push({
                                  produit_id: '',
                                  quantite: 1,
                                  prix_unitaire: 0,
                                  montant_ligne: 0,
                                })
                              }
                              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                            >
                              <Plus className="h-4 w-4" />
                              Ajouter un produit
                            </button>
                          </div>
                        </>
                      )}
                    </FieldArray>
                  </div>

                  {/* Totaux */}
                  <div className="bg-gray-50 p-4 rounded-md border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Sous-total:</span>
                      <span className="text-sm">{values.items.reduce((acc: number, item: any) => acc + (item.prix_unitaire * item.quantite), 0).toFixed(2)} DH</span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2">
                      <span className="font-bold text-lg">Total:</span>
                      <span className="font-bold text-lg text-blue-600">{values.items.reduce((acc: number, item: any) => acc + (item.prix_unitaire * item.quantite), 0).toFixed(2)} DH</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between pt-4">
                    <div>
                      {values.type === 'Devis' && selectedBon && (
                        <button
                          type="button"
                          onClick={() => {
                            // Créer un nouveau bon de sortie basé sur le devis
                            const bonSortieData = {
                              ...selectedBon,
                              id: Date.now(), // Nouveau ID
                              numero: `SOR-${Date.now().toString().substring(5)}`,
                              type: 'Sortie' as const,
                              statut: 'En attente' as const,
                              updated_at: new Date().toISOString(),
                            };
                            
                            // Ajouter le nouveau bon de sortie
                            dispatch(addBon(bonSortieData));
                            showSuccess('Devis converti en Bon de Sortie');
                            console.log('🔄 Navigation vers onglet Sortie');
                            
                            // Fermer le modal et rediriger vers l'onglet Sortie
                            setIsCreateModalOpen(false);
                            setSelectedBon(null);
                            setCurrentTab('Sortie');
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md"
                        >
                          Convertir en Bon de Sortie
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(false)}
                        className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                      {selectedBon && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBon(null);
                            setFieldValue('numero', `${values.numero}-COPY`);
                            showSuccess('Bon dupliqué');
                          }}
                          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md"
                        >
                          Dupliquer
                        </button>
                      )}
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                      >
                        {selectedBon ? 'Mettre à jour' : values.type === 'Devis' ? 'Créer Devis' : 'Valider Bon'}
                      </button>
                    </div>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

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
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-2 text-sm">{product?.designation || 'Produit non trouvé'}</td>
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal pour nouveau client */}
      {isNewClientModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Nouveau Client</h3>
            <Formik
              initialValues={{
                nom_complet: '',
                telephone: '',
                email: '',
                adresse: ''
              }}
              onSubmit={(values) => {
                try {
                  // Créer un nouveau contact client
                  const newClient: Contact = {
                    id: Date.now(), // Génération d'un ID simple
                    nom_complet: values.nom_complet,
                    telephone: values.telephone,
                    email: values.email,
                    adresse: values.adresse,
                    type: 'Client',
                    solde: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  };
                  dispatch(addContact(newClient));
                  showSuccess('Client créé avec succès!');
                  setIsNewClientModalOpen(false);
                } catch (error) {
                  showError('Erreur lors de la création du client');
                }
              }}
            >
              <Form className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom complet
                  </label>
                  <Field
                    name="nom_complet"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone
                  </label>
                  <Field
                    name="telephone"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Field
                    name="email"
                    type="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <Field
                    name="adresse"
                    as="textarea"
                    rows="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsNewClientModalOpen(false)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Créer Client
                  </button>
                </div>
              </Form>
            </Formik>
          </div>
        </div>
      )}

      {/* Modal pour nouveau fournisseur */}
      {isNewSupplierModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Nouveau Fournisseur</h3>
            <Formik
              initialValues={{
                nom_complet: '',
                telephone: '',
                email: '',
                adresse: ''
              }}
              onSubmit={(values) => {
                try {
                  // Créer un nouveau contact fournisseur
                  const newSupplier: Contact = {
                    id: Date.now(), // Génération d'un ID simple
                    nom_complet: values.nom_complet,
                    telephone: values.telephone,
                    email: values.email,
                    adresse: values.adresse,
                    type: 'Fournisseur',
                    solde: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  };
                  dispatch(addContact(newSupplier));
                  showSuccess('Fournisseur créé avec succès!');
                  setIsNewSupplierModalOpen(false);
                } catch (error) {
                  showError('Erreur lors de la création du fournisseur');
                }
              }}
            >
              <Form className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom complet
                  </label>
                  <Field
                    name="nom_complet"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone
                  </label>
                  <Field
                    name="telephone"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Field
                    name="email"
                    type="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <Field
                    name="adresse"
                    as="textarea"
                    rows="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsNewSupplierModalOpen(false)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Créer Fournisseur
                  </button>
                </div>
              </Form>
            </Formik>
          </div>
        </div>
      )}

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
      {isCreateAvoirModalOpen && selectedBonForAvoir && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Créer un Avoir à partir du Bon {selectedBonForAvoir.numero}
            </h3>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                Choisissez le type d'avoir à créer :
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Avoir complet */}
                <div className="border rounded-lg p-4 hover:bg-gray-50">
                  <h4 className="font-medium text-gray-900 mb-2">Avoir Complet</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Créer un avoir pour tous les produits du bon (retour complet)
                  </p>
                  <button
                    onClick={() => {
                      // Créer avoir complet
                      const avoirData = {
                        id: Date.now(),
                        numero: `AVO-${Date.now().toString().substring(5)}`,
                        type: 'AvoirFournisseur' as const,
                        date_creation: new Date().toISOString().split('T')[0],
                        fournisseur_id: selectedBonForAvoir.fournisseur_id,
                        bon_origine_id: selectedBonForAvoir.id,
                        bon_origine_numero: selectedBonForAvoir.numero,
                        statut: 'Avoir' as const,
                        montant_total: selectedBonForAvoir.montant_total,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        items: selectedBonForAvoir.items.map((item: any) => ({
                          ...item,
                          id: Date.now() + Math.random(),
                        }))
                      };
                      
                      // Mettre à jour le bon original en statut "Avoir"
                      dispatch(updateBon({ ...selectedBonForAvoir, statut: 'Avoir', updated_at: new Date().toISOString() }));
                      dispatch(addBon(avoirData));
                      showSuccess('Avoir complet créé avec succès');
                      setIsCreateAvoirModalOpen(false);
                      setSelectedBonForAvoir(null);
                      setCurrentTab('AvoirFournisseur');
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                  >
                    Créer Avoir Complet
                  </button>
                </div>

                {/* Avoir par produit */}
                <div className="border rounded-lg p-4 hover:bg-gray-50">
                  <h4 className="font-medium text-gray-900 mb-2">Avoir par Produits</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Sélectionner les produits spécifiques à retourner
                  </p>
                  <button
                    onClick={() => {
                      setSelectedProductsForAvoir([]);
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                  >
                    Sélectionner Produits
                  </button>
                </div>
              </div>

              {/* Section de sélection des produits */}
              <div className="border rounded-lg p-4 mb-6">
                <h5 className="font-medium text-gray-900 mb-3">Produits du bon :</h5>
                <div className="space-y-2">
                  {selectedBonForAvoir.items.map((item: any, index: number) => {
                    const product = products.find((p: any) => p.id === item.produit_id);
                    return (
                      <label key={index} className="flex items-center space-x-3 p-2 border rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedProductsForAvoir.includes(index)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProductsForAvoir([...selectedProductsForAvoir, index]);
                            } else {
                              setSelectedProductsForAvoir(selectedProductsForAvoir.filter(i => i !== index));
                            }
                          }}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1 grid grid-cols-4 gap-2 text-sm">
                          <span>{product?.designation || 'Produit non trouvé'}</span>
                          <span>Qté: {item.quantite}</span>
                          <span>Prix: {item.prix_unitaire.toFixed(2)} DH</span>
                          <span className="font-medium">Total: {item.montant_ligne.toFixed(2)} DH</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
                
                {selectedProductsForAvoir.length > 0 && (
                  <div className="mt-4 flex justify-between items-center p-3 bg-blue-50 rounded">
                    <span className="text-sm font-medium">
                      {selectedProductsForAvoir.length} produit(s) sélectionné(s)
                    </span>
                    <button
                      onClick={() => {
                        const selectedItems = selectedProductsForAvoir.map(index => selectedBonForAvoir.items[index]);
                        const remainingItems = selectedBonForAvoir.items.filter((_, index) => !selectedProductsForAvoir.includes(index));
                        
                        const montantAvoir = selectedItems.reduce((sum, item) => sum + item.montant_ligne, 0);
                        const montantRestant = remainingItems.reduce((sum, item) => sum + item.montant_ligne, 0);
                        
                        // Créer l'avoir avec les produits sélectionnés
                        const avoirData = {
                          id: Date.now(),
                          numero: `AVO-${Date.now().toString().substring(5)}`,
                          type: 'AvoirFournisseur' as const,
                          date_creation: new Date().toISOString().split('T')[0],
                          fournisseur_id: selectedBonForAvoir.fournisseur_id,
                          bon_origine_id: selectedBonForAvoir.id,
                          bon_origine_numero: selectedBonForAvoir.numero,
                          statut: 'Avoir' as const,
                          montant_total: montantAvoir,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                          items: selectedItems.map((item: any) => ({
                            ...item,
                            id: Date.now() + Math.random(),
                          }))
                        };
                        
                        // Mettre à jour le bon original avec les produits restants
                        if (remainingItems.length > 0) {
                          const updatedBon = {
                            ...selectedBonForAvoir,
                            items: remainingItems,
                            montant_total: montantRestant,
                            updated_at: new Date().toISOString()
                          };
                          dispatch(updateBon(updatedBon));
                        } else {
                          // Si plus de produits restants, marquer le bon comme "Avoir"
                          dispatch(updateBon({ ...selectedBonForAvoir, statut: 'Avoir', updated_at: new Date().toISOString() }));
                        }
                        
                        dispatch(addBon(avoirData));
                        showSuccess(`Avoir créé pour ${selectedProductsForAvoir.length} produit(s)`);
                        setIsCreateAvoirModalOpen(false);
                        setSelectedBonForAvoir(null);
                        setSelectedProductsForAvoir([]);
                        setCurrentTab('AvoirFournisseur');
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                    >
                      Créer Avoir pour Sélection
                    </button>
                  </div>
                )}
              </div>

              {/* Détails du bon origine */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-900 mb-2">Détails du bon origine :</h5>
                <div className="text-sm text-gray-600">
                  <p><strong>Numéro :</strong> {selectedBonForAvoir.numero}</p>
                  <p><strong>Date :</strong> {selectedBonForAvoir.date_creation}</p>
                  <p><strong>Montant :</strong> {selectedBonForAvoir.montant_total.toFixed(2)} DH</p>
                  <p><strong>Produits :</strong> {selectedBonForAvoir.items?.length || 0} article(s)</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsCreateAvoirModalOpen(false);
                  setSelectedBonForAvoir(null);
                  setSelectedProductsForAvoir([]);
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pour créer un avoir client */}
      {isCreateAvoirClientModalOpen && selectedBonForAvoirClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Créer un Avoir Client à partir du Bon {selectedBonForAvoirClient.numero}
            </h3>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                Choisissez le type d'avoir client à créer :
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Avoir complet */}
                <div className="border rounded-lg p-4 hover:bg-gray-50">
                  <h4 className="font-medium text-gray-900 mb-2">Avoir Complet</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Créer un avoir pour tous les produits du bon (retour complet client)
                  </p>
                  <button
                    onClick={() => {
                      // Créer avoir client complet
                      const avoirData = {
                        id: Date.now(),
                        numero: `AVC-${Date.now().toString().substring(5)}`,
                        type: 'Avoir' as const,
                        date_creation: new Date().toISOString().split('T')[0],
                        client_id: selectedBonForAvoirClient.client_id,
                        bon_origine_id: selectedBonForAvoirClient.id,
                        bon_origine_numero: selectedBonForAvoirClient.numero,
                        statut: 'Avoir' as const,
                        montant_total: selectedBonForAvoirClient.montant_total,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        items: selectedBonForAvoirClient.items.map((item: any) => ({
                          ...item,
                          id: Date.now() + Math.random(),
                        }))
                      };
                      
                      // Mettre à jour le bon original en statut "Avoir"
                      dispatch(updateBon({ ...selectedBonForAvoirClient, statut: 'Avoir', updated_at: new Date().toISOString() }));
                      dispatch(addBon(avoirData));
                      showSuccess('Avoir client complet créé avec succès');
                      setIsCreateAvoirClientModalOpen(false);
                      setSelectedBonForAvoirClient(null);
                      setCurrentTab('Avoir');
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                  >
                    Créer Avoir Complet
                  </button>
                </div>

                {/* Avoir par produit */}
                <div className="border rounded-lg p-4 hover:bg-gray-50">
                  <h4 className="font-medium text-gray-900 mb-2">Avoir par Produits</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Sélectionner les produits spécifiques à retourner
                  </p>
                  <button
                    onClick={() => {
                      setSelectedProductsForAvoirClient([]);
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                  >
                    Sélectionner Produits
                  </button>
                </div>
              </div>

              {/* Section de sélection des produits */}
              <div className="border rounded-lg p-4 mb-6">
                <h5 className="font-medium text-gray-900 mb-3">Produits du bon :</h5>
                <div className="space-y-2">
                  {selectedBonForAvoirClient.items.map((item: any, index: number) => {
                    const product = products.find((p: any) => p.id === item.produit_id);
                    return (
                      <label key={index} className="flex items-center space-x-3 p-2 border rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedProductsForAvoirClient.includes(index)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProductsForAvoirClient([...selectedProductsForAvoirClient, index]);
                            } else {
                              setSelectedProductsForAvoirClient(selectedProductsForAvoirClient.filter(i => i !== index));
                            }
                          }}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1 grid grid-cols-4 gap-2 text-sm">
                          <span>{product?.designation || 'Produit non trouvé'}</span>
                          <span>Qté: {item.quantite}</span>
                          <span>Prix: {item.prix_unitaire.toFixed(2)} DH</span>
                          <span className="font-medium">Total: {item.montant_ligne.toFixed(2)} DH</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
                
                {selectedProductsForAvoirClient.length > 0 && (
                  <div className="mt-4 flex justify-between items-center p-3 bg-blue-50 rounded">
                    <span className="text-sm font-medium">
                      {selectedProductsForAvoirClient.length} produit(s) sélectionné(s)
                    </span>
                    <button
                      onClick={() => {
                        const selectedItems = selectedProductsForAvoirClient.map(index => selectedBonForAvoirClient.items[index]);
                        const remainingItems = selectedBonForAvoirClient.items.filter((_, index) => !selectedProductsForAvoirClient.includes(index));
                        
                        const montantAvoir = selectedItems.reduce((sum, item) => sum + item.montant_ligne, 0);
                        const montantRestant = remainingItems.reduce((sum, item) => sum + item.montant_ligne, 0);
                        
                        // Créer l'avoir avec les produits sélectionnés
                        const avoirData = {
                          id: Date.now(),
                          numero: `AVC-${Date.now().toString().substring(5)}`,
                          type: 'Avoir' as const,
                          date_creation: new Date().toISOString().split('T')[0],
                          client_id: selectedBonForAvoirClient.client_id,
                          bon_origine_id: selectedBonForAvoirClient.id,
                          bon_origine_numero: selectedBonForAvoirClient.numero,
                          statut: 'Avoir' as const,
                          montant_total: montantAvoir,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                          items: selectedItems.map((item: any) => ({
                            ...item,
                            id: Date.now() + Math.random(),
                          }))
                        };
                        
                        // Mettre à jour le bon original avec les produits restants
                        if (remainingItems.length > 0) {
                          const updatedBon = {
                            ...selectedBonForAvoirClient,
                            items: remainingItems,
                            montant_total: montantRestant,
                            updated_at: new Date().toISOString()
                          };
                          dispatch(updateBon(updatedBon));
                        } else {
                          // Si plus de produits restants, marquer le bon comme "Avoir"
                          dispatch(updateBon({ ...selectedBonForAvoirClient, statut: 'Avoir', updated_at: new Date().toISOString() }));
                        }
                        
                        dispatch(addBon(avoirData));
                        showSuccess(`Avoir client créé pour ${selectedProductsForAvoirClient.length} produit(s)`);
                        setIsCreateAvoirClientModalOpen(false);
                        setSelectedBonForAvoirClient(null);
                        setSelectedProductsForAvoirClient([]);
                        setCurrentTab('Avoir');
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                    >
                      Créer Avoir pour Sélection
                    </button>
                  </div>
                )}
              </div>

              {/* Détails du bon origine */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-900 mb-2">Détails du bon origine :</h5>
                <div className="text-sm text-gray-600">
                  <p><strong>Numéro :</strong> {selectedBonForAvoirClient.numero}</p>
                  <p><strong>Date :</strong> {selectedBonForAvoirClient.date_creation}</p>
                  <p><strong>Montant :</strong> {selectedBonForAvoirClient.montant_total.toFixed(2)} DH</p>
                  <p><strong>Produits :</strong> {selectedBonForAvoirClient.items?.length || 0} article(s)</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsCreateAvoirClientModalOpen(false);
                  setSelectedBonForAvoirClient(null);
                  setSelectedProductsForAvoirClient([]);
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BonsPage;
