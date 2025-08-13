import React, { useState, useRef } from 'react';
import { Formik, Form, Field, FieldArray, ErrorMessage } from 'formik';
import type { FormikProps } from 'formik';
import * as Yup from 'yup';
//
import { Plus, Trash2, Search, Printer } from 'lucide-react';
import { showSuccess, showError } from '../utils/notifications';
//
import { generateBonReference } from '../utils/referenceUtils';
import { useGetVehiculesQuery } from '../store/api/vehiculesApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import { useGetSortiesQuery } from '../store/api/sortiesApi';
import { useGetComptantQuery } from '../store/api/comptantApi';
import { useGetClientsQuery, useGetFournisseursQuery } from '../store/api/contactsApi';
import { useCreateBonMutation, useUpdateBonMutation } from '../store/api/bonsApi';
import { useAuth } from '../hooks/redux';
//
import type { Contact } from '../types';
import ProductFormModal from './ProductFormModal';
import ContactFormModal from './ContactFormModal';
import BonPrintModal from './BonPrintModal';

// Composant Select avec recherche optimisé
interface SearchableSelectProps {
  options: { value: string; label: string; data?: any }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  maxDisplayItems?: number; // Limite d'affichage
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  className = "",
  disabled = false,
  maxDisplayItems = 100 // Limite par défaut
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(50); // Affichage initial limité
  
  // Filtrer et limiter les options
  const filteredOptions = options
    .filter(option =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .slice(0, displayCount);
  
  const hasMoreItems = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  ).length > displayCount;
  
  const selectedOption = options.find(opt => opt.value === value);
  
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white disabled:bg-gray-100 min-h-[38px] flex items-center justify-between"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={selectedOption ? selectedOption.label : placeholder} // Tooltip pour affichage complet
      >
        <span className="truncate pr-2">{selectedOption ? selectedOption.label : placeholder}</span>
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>
      
      {isOpen && !disabled && (
        <div className="relative z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b bg-gray-50">
            <input
              type="text"
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Rechercher... (minimum 2 caractères)"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setDisplayCount(50); // Reset du compteur lors de nouvelle recherche
              }}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {searchTerm.length >= 2 ? (
              filteredOptions.length === 0 ? (
                <div className="p-2 text-sm text-gray-500">Aucun résultat trouvé</div>
              ) : (
                <>
                  {filteredOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 text-sm border-b border-gray-100 last:border-b-0 overflow-hidden"
                      onClick={() => {
                        onChange(option.value);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      title={option.label} // Tooltip pour les textes longs
                    >
                      <span className="block truncate">{option.label}</span>
                    </button>
                  ))}
                  {hasMoreItems && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-center text-blue-600 hover:bg-blue-50 text-sm border-t"
                      onClick={() => setDisplayCount(prev => Math.min(prev + 50, maxDisplayItems))}
                    >
                      Charger plus... ({filteredOptions.length} sur {options.filter(opt => 
                        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
                      ).length})
                    </button>
                  )}
                </>
              )
            ) : (
              <div className="p-3 text-sm text-gray-500 text-center">
                <div className="mb-2">Tapez au moins 2 caractères pour rechercher</div>
                <div className="text-xs text-gray-400">
                  {options.length} éléments disponibles
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Overlay pour fermer le dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
          aria-label="Fermer la liste"
        />
      )}
    </div>
  );
};

// Schéma de validation pour les bons
const bonValidationSchema = Yup.object({
  numero: Yup.string().required('Numéro requis'),
  date_bon: Yup.string().required('Date du bon requise'),
  vehicule_id: Yup.number().nullable(),
  lieu_charge: Yup.string(),
  client_id: Yup.number().when('type', ([type], schema) => {
    // Client requis pour Sortie et Avoir seulement (Comptant et Devis optionnel)
    if (type === 'Sortie' || type === 'Avoir') {
      return schema.required('Client requis');
    }
    return schema.nullable();
  }),
  fournisseur_id: Yup.number().when('type', ([type], schema) => {
    // Fournisseur requis pour Commande et AvoirFournisseur
    if (type === 'Commande' || type === 'AvoirFournisseur') {
      return schema.required('Fournisseur requis');
    }
    return schema.nullable();
  }),
  items: Yup.array().min(1, 'Au moins un produit requis')
});

interface BonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'Devis';
  initialValues?: any; // Le bon à modifier s'il existe
  onBonAdded?: (bon: any) => void;
}

const BonFormModal: React.FC<BonFormModalProps> = ({
  isOpen,
  onClose,
  currentTab,
  initialValues,
  onBonAdded
}) => {
  //
  const { user } = useAuth();
  const formikRef = useRef<FormikProps<any>>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState<null | 'Client' | 'Fournisseur'>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  
  // RTK Query hooks
  const { data: vehicules = [] } = useGetVehiculesQuery();
  const { data: products = [] } = useGetProductsQuery();
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  // Historique pour dernier prix client-produit
  const { data: sortiesHistory = [] } = useGetSortiesQuery(undefined);
  const { data: comptantHistory = [] } = useGetComptantQuery(undefined);
  
  // RTK Query mutations
  const [createBon] = useCreateBonMutation();
  const [updateBonMutation] = useUpdateBonMutation();

  if (!isOpen) return null;

  // Déterminer les valeurs initiales du formulaire
  const getInitialValues = () => {
    if (initialValues) {
      // Fonction pour formater la date en format input (YYYY-MM-DD)
      const formatDateForInput = (dateStr: string) => {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        
        // Si c'est déjà au format YYYY-MM-DD
        if (dateStr.includes('-') && dateStr.split('-').length === 3 && dateStr.split('-')[0].length === 4) {
          return dateStr.split('T')[0]; // Enlever l'heure si présente
        }
        
        // Sinon essayer de parser et reformater
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
        
        return new Date().toISOString().split('T')[0];
      };

      // Pour la modification, on prend toutes les valeurs existantes
      return {
        ...initialValues, // Copier TOUTES les valeurs existantes
        // Puis override seulement les champs qui nécessitent une transformation
        client_id: (initialValues.client_id || '').toString(),
        fournisseur_id: (initialValues.fournisseur_id || '').toString(),
        vehicule_id: (initialValues.vehicule_id || '').toString(),
        lieu_charge: initialValues.lieu_chargement || initialValues.lieu_charge || '',
        date_bon: formatDateForInput(initialValues.date_creation || initialValues.date_bon || ''),
        // S'assurer que les items sont bien copiés
        items: initialValues.items || [],
        // S'assurer que les montants sont copiés
        montant_ht: initialValues.montant_ht || 0,
        montant_total: initialValues.montant_total || 0,
        // S'assurer que les noms et adresses sont copiés
        client_nom: initialValues.client_nom || '',
        client_adresse: initialValues.client_adresse || '',
        fournisseur_nom: initialValues.fournisseur_nom || '',
        fournisseur_adresse: initialValues.fournisseur_adresse || '',
        // Statut
        statut: initialValues.statut || 'En attente'
      };
    }
    
    // Valeurs par défaut pour un nouveau bon
    return {
      type: currentTab,
      numero: generateBonReference(currentTab),
      date_bon: new Date().toISOString().split('T')[0],
      vehicule_id: '',
      lieu_charge: '',
      date_validation: '',
      statut: 'En attente', // Statut automatique pour tous les types
      client_id: '',
      client_nom: '',
      client_adresse: '',
      fournisseur_id: '',
      fournisseur_nom: '',
      fournisseur_adresse: '',
      montant_ht: 0,
      montant_total: 0,
      items: [],
      is_transformed: false,
      created_by: 1, // ID de l'utilisateur actuel
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  };

  // Gestionnaire de soumission du formulaire
  const handleSubmit = async (values: any, { setSubmitting }: any) => {
    try {
      // Calcul des montants (sans TVA)
      const montantTotal = values.items.reduce(
        (sum: number, item: any) => sum + (item.quantite * item.prix_unitaire),
        0
      );
      
  // Récupérer les noms et adresses de client/fournisseur si nécessaire (affichage local)
  // Non utilisés dans la requête; conservés via setFieldValue lors de la sélection
      
      // Créer ou mettre à jour le bon
      const requestType = values.type;
      let vehiculeId: number | undefined = undefined;
      if (requestType !== 'Avoir' && requestType !== 'AvoirFournisseur' && values.vehicule_id) {
        vehiculeId = parseInt(values.vehicule_id);
      }

      const cleanBonData = {
        numero: values.numero,
        date_creation: values.date_bon, // Backend attend date_creation
        vehicule_id: vehiculeId, // Backend attend vehicule_id
        lieu_chargement: values.lieu_charge || '', // Backend attend lieu_chargement
        statut: values.statut || 'Brouillon',
        client_id: values.client_id ? parseInt(values.client_id) : undefined,
        fournisseur_id: values.fournisseur_id ? parseInt(values.fournisseur_id) : undefined,
        montant_total: montantTotal,
        created_by: user?.id || 1,
        items: values.items.map((item: any) => ({
          product_id: parseInt(item.product_id),
          quantite: parseFloat(item.quantite),
          prix_unitaire: parseFloat(item.prix_unitaire),
          remise_pourcentage: parseFloat(item.remise_pourcentage || 0),
          remise_montant: parseFloat(item.remise_montant || 0),
          total: parseFloat(item.quantite) * parseFloat(item.prix_unitaire)
        }))
      };
      
      if (initialValues) {
        // Mise à jour d'un bon existant
        await updateBonMutation({ 
          id: initialValues.id,
          type: requestType, // Passer le type pour router vers le bon endpoint
          ...cleanBonData 
        }).unwrap();
        showSuccess('Bon mis à jour avec succès');
      } else {
        // Création d'un nouveau bon
        await createBon({ type: requestType, ...cleanBonData }).unwrap();
        showSuccess(`${currentTab} créé avec succès`);
      }
      
      if (onBonAdded) {
        onBonAdded(cleanBonData);
      }
      
      onClose();
    } catch (error: any) {
      console.error('Erreur lors de la soumission:', error);
      showError(`Erreur: ${error.message || 'Une erreur est survenue'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // -------- Dernier prix client-produit --------
  const parseItems = (items: any): any[] => {
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const toTime = (d: any): number => {
    if (!d) return 0;
    const s = typeof d === 'string' ? d : String(d);
    // try common fields
    const dt = new Date(s.includes('T') || s.includes('-') ? s : s.replace(/(\d{2})-(\d{2})-(\d{2,4})/, '20$3-$2-$1'));
    const t = dt.getTime();
    return Number.isFinite(t) ? t : 0;
  };

  // Cherche le dernier prix utilisé pour ce client et produit, en regardant Sorties + Comptant
  const getLastUnitPriceForClientProduct = (clientId: string | number | undefined, productId: string | number | undefined): number | null => {
    if (!clientId || !productId) return null;
    const cid = String(clientId);
    const pid = String(productId);

    type HistItem = { prix_unitaire?: number; total?: number; quantite?: number };
    let bestPrice: number | null = null;
    let bestTime = -1;

    const scan = (bon: any, itemsField: any) => {
      const items = parseItems(itemsField);
      const bonClientId = String(bon.client_id ?? bon.contact_id ?? '');
      if (bonClientId !== cid) return;
      const bonTime = toTime(bon.date_creation || bon.date || bon.created_at);
      for (const it of items as HistItem[]) {
        const itPid = String((it as any).product_id ?? (it as any).id ?? '');
        if (itPid !== pid) continue;
        const price = Number((it as any).prix_unitaire ?? (it as any).price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        if (bonTime > bestTime) {
          bestTime = bonTime;
          bestPrice = price;
        }
      }
    };

    // Sorties
    for (const b of sortiesHistory as any[]) scan(b, (b as any).items);
    // Comptant
    for (const b of comptantHistory as any[]) scan(b, (b as any).items);

    return bestPrice;
  };

 
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {initialValues ? 'Modifier' : 'Créer'} un {currentTab}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        
        <Formik
          initialValues={getInitialValues()}
          validationSchema={bonValidationSchema}
          onSubmit={handleSubmit}
          innerRef={formikRef}
        >
          {({ values, errors, touched, isSubmitting, setFieldValue }) => (
            <Form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Numéro du bon - auto-généré */}
                <div>
                  <label htmlFor="numero" className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro (Auto)
                  </label>
                  <Field
                    type="text"
                    id="numero"
                    name="numero"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                    readOnly
                  />
                  <ErrorMessage name="numero" component="div" className="text-red-500 text-sm mt-1" />
                </div>
                
                {/* Date du bon */}
                <div>
                  <label htmlFor="date_bon" className="block text-sm font-medium text-gray-700 mb-1">
                    Date du bon
                  </label>
                  <Field
                    type="date"
                    id="date_bon"
                    name="date_bon"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <ErrorMessage name="date_bon" component="div" className="text-red-500 text-sm mt-1" />
                </div>
                
                {/* Véhicule (masqué pour Avoir/AvoirFournisseur) */}
                {(values.type !== 'Avoir' && values.type !== 'AvoirFournisseur') && (
                  <div>
                    <label htmlFor="vehicule_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Véhicule
                    </label>
                    <Field
                      as="select"
                      id="vehicule_id"
                      name="vehicule_id"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">-- Sélectionner un véhicule --</option>
                      {vehicules
                        .filter(vehicule => vehicule.statut === 'Disponible' || vehicule.statut === 'En service')
                        .map((vehicule) => (
                          <option key={vehicule.id} value={vehicule.id}>
                            {vehicule.nom} - {vehicule.immatriculation} ({vehicule.type_vehicule})
                          </option>
                        ))}
                    </Field>
                    <ErrorMessage name="vehicule_id" component="div" className="text-red-500 text-sm mt-1" />
                  </div>
                )}
                
                {/* Lieu de charge */}
                <div>
                  <label htmlFor="lieu_charge" className="block text-sm font-medium text-gray-700 mb-1">
                    Lieu de charge
                  </label>
                  <Field
                    type="text"
                    id="lieu_charge"
                    name="lieu_charge"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Ex: Entrepôt Casablanca"
                  />
                </div>
              </div>
                
              {/* Client (Sortie, Comptant, Devis, Avoir) - optionnel pour Comptant/Devis */}
              {(values.type === 'Sortie' || values.type === 'Devis' || values.type === 'Comptant' || values.type === 'Avoir') && (
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Client {(values.type === 'Sortie' || values.type === 'Avoir') ? '*' : '(optionnel)'}
                    </label>
                    <button
                      type="button"
                      className="text-blue-600 underline text-xs"
                      onClick={() => setIsContactModalOpen('Client')}
                    >
                      Nouveau client
                    </button>
                  </div>
                  <SearchableSelect
                    options={clients.map((client: Contact) => {
                      const reference = client.reference ? `(${client.reference})` : '';
                      return {
                        value: client.id.toString(),
                        label: `${client.nom_complet} ${reference}`,
                        data: client
                      };
                    })}
                    value={values.client_id}
                    onChange={(clientId) => {
                      setFieldValue('client_id', clientId);
                      if (clientId) {
                        const client = clients.find((c: Contact) => c.id.toString() === clientId);
                        if (client) {
                          setFieldValue('client_nom', client.nom_complet);
                          setFieldValue('client_adresse', client.adresse || '');
                        }
                      } else {
                        setFieldValue('client_nom', '');
                        setFieldValue('client_adresse', '');
                      }
                    }}
                    placeholder="Sélectionnez un client"
                    className="w-full"
                    maxDisplayItems={200}
                  />
                  <ErrorMessage name="client_id" component="div" className="text-red-500 text-sm mt-1" />
                  {/* Adresse du client */}
                  {values.client_adresse && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Adresse: </span>
                      <span className="text-sm">{values.client_adresse}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Fournisseur (Commande, AvoirFournisseur) */}
              {(values.type === 'Commande' || values.type === 'AvoirFournisseur') && (
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="fournisseur_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Fournisseur *
                    </label>
                    <button
                      type="button"
                      className="text-blue-600 underline text-xs"
                      onClick={() => setIsContactModalOpen('Fournisseur')}
                    >
                      Nouveau fournisseur
                    </button>
                  </div>
                  <SearchableSelect
                    options={fournisseurs.map((fournisseur: Contact) => {
                      const reference = fournisseur.reference ? `(${fournisseur.reference})` : '';
                      return {
                        value: fournisseur.id.toString(),
                        label: `${fournisseur.nom_complet} ${reference}`,
                        data: fournisseur
                      };
                    })}
                    value={values.fournisseur_id}
                    onChange={(fournisseurId) => {
                      setFieldValue('fournisseur_id', fournisseurId);
                      if (fournisseurId) {
                        const fournisseur = fournisseurs.find((f: Contact) => f.id.toString() === fournisseurId);
                        if (fournisseur) {
                          setFieldValue('fournisseur_nom', fournisseur.nom_complet);
                          setFieldValue('fournisseur_adresse', fournisseur.adresse || '');
                        }
                      } else {
                        setFieldValue('fournisseur_nom', '');
                        setFieldValue('fournisseur_adresse', '');
                      }
                    }}
                    placeholder="Sélectionnez un fournisseur"
                    className="w-full"
                    maxDisplayItems={200}
                  />
                  <ErrorMessage name="fournisseur_id" component="div" className="text-red-500 text-sm mt-1" />
                  {/* Adresse du fournisseur */}
                  {values.fournisseur_adresse && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Adresse: </span>
                      <span className="text-sm">{values.fournisseur_adresse}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Liste des produits */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-md font-medium">Produits</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const newItem = {
                          product_id: '',
                          product_reference: '',
                          designation: '',
                          quantite: 1,
                          prix_achat: 0,
                          prix_unitaire: 0,
                          total: 0,
                          unite: 'pièce'
                        };
                        setFieldValue('items', [...values.items, newItem]);
                      }}
                      className="flex items-center text-blue-600 hover:text-blue-800"
                    >
                      <Plus size={16} className="mr-1" /> Ajouter produit existant
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsProductModalOpen(true)}
                      className="flex items-center text-green-600 hover:text-green-800"
                    >
                      <Plus size={16} className="mr-1" /> Nouveau produit
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <FieldArray name="items">
                    {({ remove }) => (
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Référence</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[150px]">Désignation</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">Qté</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">P. Achat</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">P. Unit.</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">Total</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[50px]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {values.items.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-4 text-center text-sm text-gray-500">
                                Aucun produit ajouté. Cliquez sur "Ajouter un produit" pour commencer.
                              </td>
                            </tr>
                          ) : (
                            values.items.map((_item: any, index: number) => (
                              <tr key={`item-${index}`}>
                                {/* Référence */}
                                <td className="px-1 py-2 w-[100px]">
                                  <SearchableSelect
                                    options={products.map((product: any) => ({
                                      value: String(product.reference ?? product.id),
                                      label: String(product.reference ?? product.id),
                                      data: product
                                    }))}
                                    value={values.items[index].product_reference}
                                    onChange={(reference) => {
                                      setFieldValue(`items.${index}.product_reference`, reference);
                                      if (reference) {
                                        const product = products.find((p: any) => String(p.reference ?? p.id) === reference);
                                        if (product) {
                                          setFieldValue(`items.${index}.product_id`, product.id);
                                          setFieldValue(`items.${index}.designation`, product.designation);
                                          setFieldValue(`items.${index}.prix_achat`, product.prix_achat || 0);
                                          const unit = (product.prix_vente || 0);
                                          setFieldValue(`items.${index}.prix_unitaire`, unit);
                                          const quantite = values.items[index].quantite || 1;
                                          setFieldValue(`items.${index}.total`, quantite * unit);
                                        }
                                      }
                                    }}
                                    placeholder="Réf."
                                    className="w-full"
                                    maxDisplayItems={100}
                                  />
                                </td>
                                
                                {/* Désignation */}
                                <td className="px-1 py-2 w-[150px]">
                                  <SearchableSelect
                                    options={products.map((product: any) => ({
                                      value: product.designation,
                                      label: product.designation,
                                      data: product
                                    }))}
                                    value={values.items[index].designation}
                                    onChange={(designation) => {
                                      setFieldValue(`items.${index}.designation`, designation);
                                      if (designation) {
                                        const product = products.find((p: any) => p.designation === designation);
                                        if (product) {
                                          setFieldValue(`items.${index}.product_id`, product.id);
                                          setFieldValue(`items.${index}.product_reference`, String(product.reference ?? product.id));
                                          setFieldValue(`items.${index}.prix_achat`, product.prix_achat || 0);
                                          const unit = (product.prix_vente || 0);
                                          setFieldValue(`items.${index}.prix_unitaire`, unit);
                                          const quantite = values.items[index].quantite || 1;
                                          setFieldValue(`items.${index}.total`, quantite * unit);
                                        }
                                      }
                                    }}
                                    placeholder="Désignation"
                                    className="w-full"
                                    maxDisplayItems={150}
                                  />
                                </td>
                                
                                {/* Quantité */}
                                <td className="px-1 py-2 w-[80px]">
                                  <Field
                                    type="number"
                                    name={`items.${index}.quantite`}
                                    min="1"
                                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                      const quantite = parseInt(e.target.value) || 0;
                                      setFieldValue(`items.${index}.quantite`, quantite);
                                      // Recalculer le total
                                      const prixUnitaire = values.items[index].prix_unitaire || 0;
                                      setFieldValue(`items.${index}.total`, quantite * prixUnitaire);
                                    }}
                                  />
                                </td>
                                
                                {/* Prix d'achat (disabled) */}
                                <td className="px-1 py-2 w-[90px]">
                                  <Field
                                    type="number"
                                    name={`items.${index}.prix_achat`}
                                    step="0.01"
                                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm bg-gray-100"
                                    disabled
                                  />
                                </td>
                                
                                {/* Prix unitaire (modifiable) */}
                                <td className="px-1 py-2 w-[90px]">
                                  <Field
                                    type="number"
                                    name={`items.${index}.prix_unitaire`}
                                    step="0.01"
                                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                      const prixUnitaire = parseFloat(e.target.value) || 0;
                                      setFieldValue(`items.${index}.prix_unitaire`, prixUnitaire);
                                      // Recalculer le total
                                      const quantite = values.items[index].quantite || 1;
                                      setFieldValue(`items.${index}.total`, quantite * prixUnitaire);
                                    }}
                                  />
                                  {values.client_id && values.items[index].product_id && (() => {
                                    const last = getLastUnitPriceForClientProduct(values.client_id, values.items[index].product_id);
                                    return (last && Number.isFinite(last)) ? (
                                      <div className="text-xs text-gray-500 mt-1">
                                        Dernier: {Number(last).toFixed(2)} DH
                                      </div>
                                    ) : null;
                                  })()}
                                </td>
                                
                                {/* Total */}
                                <td className="px-1 py-2 w-[90px]">
                                  <div className="text-sm font-medium">
                                    {((values.items[index].quantite || 0) * (values.items[index].prix_unitaire || 0)).toFixed(2)} DH
                                  </div>
                                </td>
                                
                                {/* Actions */}
                                <td className="px-1 py-2 w-[50px]">
                                  <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </FieldArray>
                </div>
                
                {/* Erreur pour les items */}
                {errors.items && touched.items && (
                  <div className="text-red-500 text-sm mt-1">{errors.items as string}</div>
                )}
                
                {/* Récapitulatif des montants */}
                <div className="mt-4 bg-gray-50 p-4 rounded-md">
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-md font-semibold">Total:</span>
                    <span className="text-md font-semibold">
                      {values.items.reduce((sum: number, item: any) => sum + ((item.quantite || 0) * (item.prix_unitaire || 0)), 0).toFixed(2)} DH
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-4 mt-6 flex justify-between">
               
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  {initialValues && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setFieldValue('numero', `${values.numero}-COPY`);
                          showSuccess('Bon dupliqué');
                        }}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md"
                      >
                        Dupliquer
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPrintModalOpen(true)}
                        className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                      >
                        <Printer size={16} className="mr-1" />
                        Imprimer
                      </button>
                    </>
                  )}
                                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                  >
                    {(() => {
                      if (initialValues) return 'Mettre à jour';
                      if (values.type === 'Devis') return 'Créer Devis';
                      return 'Valider Bon';
                    })()}
                  </button>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      </div>
      
      {/* Modal pour ajouter un nouveau produit */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onProductAdded={(_newProduct) => {
          showSuccess('Nouveau produit ajouté avec succès!');
          setIsProductModalOpen(false);
        }}
      />
      {/* Modal pour ajouter un nouveau client ou fournisseur */}
      <Formik initialValues={{}} onSubmit={() => {}}>
        {() => (
          <ContactFormModal
            isOpen={!!isContactModalOpen}
            onClose={() => setIsContactModalOpen(null)}
            contactType={isContactModalOpen || 'Client'}
            onContactAdded={(newContact) => {
              showSuccess(`${newContact.type} ajouté avec succès!`);
              setIsContactModalOpen(null);
              
              // Utiliser formikRef pour accéder à la fonction setFieldValue
              if (formikRef.current) {
                if (newContact.type === 'Client') {
                  formikRef.current.setFieldValue('client_id', newContact.id);
                  formikRef.current.setFieldValue('client_nom', newContact.nom_complet);
                  formikRef.current.setFieldValue('client_adresse', newContact.adresse || '');
                } else {
                  formikRef.current.setFieldValue('fournisseur_id', newContact.id);
                  formikRef.current.setFieldValue('fournisseur_nom', newContact.nom_complet);
                  formikRef.current.setFieldValue('fournisseur_adresse', newContact.adresse || '');
                }
              }
            }}
          />
        )}
      </Formik>
      
      {/* Modal d'impression */}
      {initialValues && (
        <BonPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          bon={initialValues}
          client={clients.find((c: Contact) => c.id.toString() === initialValues.client_id?.toString())}
          fournisseur={fournisseurs.find((f: Contact) => f.id.toString() === initialValues.fournisseur_id?.toString())}
        />
      )}
    </div>
  );
};

export default BonFormModal;
