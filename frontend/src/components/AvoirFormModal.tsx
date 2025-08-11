import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Check, Plus } from 'lucide-react';
import { addBon } from '../store/slices/bonsSlice';
import { generateBonReference } from '../utils/referenceUtils';
import { showSuccess } from '../utils/notifications';
import type { RootState } from '../store';
import type { Bon, Contact } from '../types';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import type { FormikProps } from 'formik';
import * as Yup from 'yup';
import ContactFormModal from './ContactFormModal';

interface AvoirFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  bonOrigine?: any; // Le bon à partir duquel on crée l'avoir (optionnel maintenant)
  onAvoirCreated?: (avoir: any) => void;
}

const validationSchema = Yup.object({
  type_avoir: Yup.string().required('Type d\'avoir requis'),
  type_contact: Yup.string().when('type_avoir', {
    is: 'libre',
    then: () => Yup.string().required('Type de contact requis'),
    otherwise: () => Yup.string()
  }),
  fournisseur_id: Yup.string().when(['type_avoir', 'type_contact'], {
    is: (type_avoir: string, type_contact: string) => 
      (type_avoir === 'libre' && type_contact === 'Fournisseur') || 
      type_avoir === 'avoir_fournisseur',
    then: () => Yup.string().required('Fournisseur requis'),
    otherwise: () => Yup.string()
  }),
  client_id: Yup.string().when(['type_avoir', 'type_contact'], {
    is: (type_avoir: string, type_contact: string) => 
      (type_avoir === 'libre' && type_contact === 'Client') || 
      type_avoir === 'avoir_client',
    then: () => Yup.string().required('Client requis'),
    otherwise: () => Yup.string()
  }),
  montant_total: Yup.number().when('type_avoir', {
    is: (value: string) => ['libre', 'avoir_client', 'avoir_fournisseur'].includes(value),
    then: () => Yup.number().required('Montant requis').min(0.01, 'Montant doit être supérieur à 0'),
    otherwise: () => Yup.number()
  }),
  designation: Yup.string().when('type_avoir', {
    is: (value: string) => ['libre', 'avoir_client', 'avoir_fournisseur'].includes(value),
    then: () => Yup.string().required('Description requise'),
    otherwise: () => Yup.string()
  }),
  bon_id: Yup.string().when('type_avoir', {
    is: 'lie',
    then: () => Yup.string().required('Bon requis'),
    otherwise: () => Yup.string()
  })
});

const AvoirFormModal: React.FC<AvoirFormModalProps> = ({
  isOpen,
  onClose,
  bonOrigine,
  onAvoirCreated
}) => {
  const dispatch = useDispatch();
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [typeAvoir, setTypeAvoir] = useState<'libre' | 'lie' | 'avoir_client' | 'avoir_fournisseur'>(bonOrigine ? 'lie' : 'libre');
  const [selectedBon, setSelectedBon] = useState<any>(bonOrigine || null);
  const [isContactModalOpen, setIsContactModalOpen] = useState<null | 'Client' | 'Fournisseur'>(null);
  const formikRef = useRef<FormikProps<any>>(null);
  
  const bons = useSelector((state: RootState) => state.bons.bons.filter(
    (bon: Bon) => bon.type === 'Commande' || bon.type === 'Sortie' || bon.type === 'Comptant'
  ));
  const fournisseurs = useSelector((state: RootState) => 
    state.contacts.contacts.filter((contact: Contact) => contact.type === 'Fournisseur')
  );
  const clients = useSelector((state: RootState) => 
    state.contacts.contacts.filter((contact: Contact) => contact.type === 'Client')
  );

  useEffect(() => {
    if (bonOrigine) {
      setTypeAvoir('lie');
      setSelectedBon(bonOrigine);
    } else {
      setTypeAvoir('libre');
      setSelectedBon(null);
    }
  }, [bonOrigine]);

  if (!isOpen) return null;

  // Fonction pour créer un avoir complet
  const handleCreateFullAvoir = () => {
    if (!selectedBon) return;
    
    try {
      const newAvoir = {
        id: Date.now(),
        type: 'Avoir' as const,
        numero: generateBonReference('Avoir'),
        date_creation: new Date().toISOString().split('T')[0],
        date_validation: new Date().toISOString().split('T')[0],
        statut: 'Validé' as const,
        fournisseur_id: selectedBon.fournisseur_id,
        fournisseur_nom: selectedBon.fournisseur_nom,
        bon_origine_id: selectedBon.id,
        bon_origine_numero: selectedBon.numero,
        montant_ht: selectedBon.montant_ht,
        tva: selectedBon.tva || 0,
        montant_total: selectedBon.montant_total,
        items: selectedBon.items.map((item: any) => ({
          ...item,
          id: Date.now() + Math.floor(Math.random() * 1000) // Générer un nouvel ID
        })),
        created_by: 1, // ID de l'utilisateur actuel
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      dispatch(addBon(newAvoir));
      showSuccess('Avoir créé avec succès');
      
      if (onAvoirCreated) {
        onAvoirCreated(newAvoir);
      }
      
      onClose();
    } catch (error: any) {
      console.error('Erreur lors de la création de l\'avoir:', error);
    }
  };

  // Fonction pour créer un avoir partiel
  const handleCreatePartialAvoir = () => {
    if (!selectedBon || selectedProducts.length === 0) {
      alert('Veuillez sélectionner au moins un produit');
      return;
    }
    
    try {
      // Filtrer les produits sélectionnés
      const selectedItems = selectedBon.items.filter((item: any) => 
        selectedProducts.includes(Number(item.product_id))
      );
      
      // Calculer les montants
      const montantHT = selectedItems.reduce(
        (sum: number, item: any) => sum + (item.quantite * item.prix_unitaire),
        0
      );
      
      const montantTotal = montantHT * (1 + ((selectedBon.tva || 0) / 100));
      
      const newAvoir = {
        id: Date.now(),
        type: 'Avoir' as const,
        numero: generateBonReference('Avoir'),
        date_creation: new Date().toISOString().split('T')[0],
        date_validation: new Date().toISOString().split('T')[0],
        statut: 'Validé' as const,
        fournisseur_id: selectedBon.fournisseur_id,
        fournisseur_nom: selectedBon.fournisseur_nom,
        bon_origine_id: selectedBon.id,
        bon_origine_numero: selectedBon.numero,
        montant_ht: montantHT,
        tva: selectedBon.tva || 0,
        montant_total: montantTotal,
        items: selectedItems.map((item: any) => ({
          ...item,
          id: Date.now() + Math.floor(Math.random() * 1000) // Générer un nouvel ID
        })),
        created_by: 1, // ID de l'utilisateur actuel
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      dispatch(addBon(newAvoir));
      showSuccess('Avoir partiel créé avec succès');
      
      if (onAvoirCreated) {
        onAvoirCreated(newAvoir);
      }
      
      onClose();
    } catch (error: any) {
      console.error('Erreur lors de la création de l\'avoir partiel:', error);
    }
  };

  // Gérer la sélection d'un produit
  const handleProductSelection = (productId: number) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    } else {
      setSelectedProducts([...selectedProducts, productId]);
    }
  };

  // Gérer la sélection de tous les produits
  const handleSelectAllProducts = () => {
    if (!selectedBon) return;
    
    if (selectedProducts.length === selectedBon.items.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(selectedBon.items.map((item: any) => Number(item.product_id)));
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Créer un Avoir
          </h3>

          <Formik
            initialValues={{
              type_avoir: typeAvoir,
              type_contact: '', // Pas de sélection par défaut
              client_id: '',
              fournisseur_id: selectedBon?.fournisseur_id || '',
              montant_total: 0,
              designation: '',
              bon_id: selectedBon?.id || ''
            }}
            validationSchema={validationSchema}
            onSubmit={(values) => {
              if (values.type_avoir === 'libre') {
                // Créer un avoir libre
                let contactId = 0;
                let contactNom = '';
                let avoirType = '';
                
                if (values.type_contact === 'Fournisseur') {
                  const fournisseur = fournisseurs.find((f: Contact) => f.id.toString() === values.fournisseur_id.toString());
                  contactId = Number(values.fournisseur_id);
                  contactNom = fournisseur?.nom_complet || '';
                  avoirType = 'AvoirFournisseur';
                } else {
                  const client = clients.find((c: Contact) => c.id.toString() === values.client_id.toString());
                  contactId = Number(values.client_id);
                  contactNom = client?.nom_complet || '';
                  avoirType = 'Avoir';
                }
                
                const newAvoir = {
                  id: Date.now(),
                  type: avoirType as 'Avoir' | 'AvoirFournisseur',
                  numero: generateBonReference(avoirType),
                  date_creation: new Date().toISOString().split('T')[0],
                  date_validation: new Date().toISOString().split('T')[0],
                  statut: 'Validé' as const,
                  fournisseur_id: values.type_contact === 'Fournisseur' ? contactId : undefined,
                  fournisseur_nom: values.type_contact === 'Fournisseur' ? contactNom : undefined,
                  client_id: values.type_contact === 'Client' ? contactId : undefined,
                  client_nom: values.type_contact === 'Client' ? contactNom : undefined,
                  montant_ht: values.montant_total,
                  tva: 0,
                  montant_total: values.montant_total,
                  items: [{
                    id: Date.now(),
                    bon_id: 0,
                    produit_id: 0,
                    quantite: 1,
                    prix_unitaire: values.montant_total,
                    montant_ligne: values.montant_total,
                    designation_custom: values.designation
                  }],
                  created_by: 1, // ID de l'utilisateur actuel
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                
                dispatch(addBon(newAvoir));
                showSuccess('Avoir libre créé avec succès');
                
                if (onAvoirCreated) {
                  onAvoirCreated(newAvoir);
                }
                
                onClose();
              } else if (values.type_avoir === 'avoir_client') {
                // Créer un avoir client
                const client = clients.find((c: Contact) => c.id.toString() === values.client_id.toString());
                
                const newAvoir = {
                  id: Date.now(),
                  type: 'Avoir' as const,
                  numero: generateBonReference('Avoir'),
                  date_creation: new Date().toISOString().split('T')[0],
                  date_validation: new Date().toISOString().split('T')[0],
                  statut: 'Validé' as const,
                  client_id: Number(values.client_id),
                  client_nom: client?.nom_complet || '',
                  montant_ht: values.montant_total,
                  tva: 0,
                  montant_total: values.montant_total,
                  items: [{
                    id: Date.now(),
                    bon_id: 0,
                    produit_id: 0,
                    quantite: 1,
                    prix_unitaire: values.montant_total,
                    montant_ligne: values.montant_total,
                    designation_custom: values.designation
                  }],
                  created_by: 1,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                
                dispatch(addBon(newAvoir));
                showSuccess('Avoir client créé avec succès');
                
                if (onAvoirCreated) {
                  onAvoirCreated(newAvoir);
                }
                
                onClose();
              } else if (values.type_avoir === 'avoir_fournisseur') {
                // Créer un avoir fournisseur
                const fournisseur = fournisseurs.find((f: Contact) => f.id.toString() === values.fournisseur_id.toString());
                
                const newAvoir = {
                  id: Date.now(),
                  type: 'AvoirFournisseur' as const,
                  numero: generateBonReference('AvoirFournisseur'),
                  date_creation: new Date().toISOString().split('T')[0],
                  date_validation: new Date().toISOString().split('T')[0],
                  statut: 'Validé' as const,
                  fournisseur_id: Number(values.fournisseur_id),
                  fournisseur_nom: fournisseur?.nom_complet || '',
                  montant_ht: values.montant_total,
                  tva: 0,
                  montant_total: values.montant_total,
                  items: [{
                    id: Date.now(),
                    bon_id: 0,
                    produit_id: 0,
                    quantite: 1,
                    prix_unitaire: values.montant_total,
                    montant_ligne: values.montant_total,
                    designation_custom: values.designation
                  }],
                  created_by: 1,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                
                dispatch(addBon(newAvoir));
                showSuccess('Avoir fournisseur créé avec succès');
                
                if (onAvoirCreated) {
                  onAvoirCreated(newAvoir);
                }
                
                onClose();
              }
            }}
            innerRef={formikRef}
          >
            {({ values, setFieldValue }) => (
              <Form className="space-y-6">
                {/* Type d'avoir */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div 
                    className={`border rounded-lg p-4 cursor-pointer ${values.type_avoir === 'libre' ? 'bg-blue-50 border-blue-300' : ''}`}
                    onClick={() => {
                      setFieldValue('type_avoir', 'libre');
                      setFieldValue('type_contact', '');
                      setFieldValue('client_id', '');
                      setFieldValue('fournisseur_id', '');
                      setTypeAvoir('libre');
                      setSelectedBon(null);
                    }}
                  >
                    <h4 className="font-medium text-gray-900 mb-2">Avoir Libre</h4>
                    <p className="text-sm text-gray-600">
                      Créer un avoir sans le lier à un bon existant
                    </p>
                  </div>
                  
                  <div 
                    className={`border rounded-lg p-4 cursor-pointer ${values.type_avoir === 'avoir_client' ? 'bg-green-50 border-green-300' : ''}`}
                    onClick={() => {
                      setFieldValue('type_avoir', 'avoir_client');
                      setFieldValue('type_contact', 'Client');
                      setFieldValue('fournisseur_id', '');
                      setTypeAvoir('avoir_client');
                      setSelectedBon(null);
                    }}
                  >
                    <h4 className="font-medium text-gray-900 mb-2">Avoir Client</h4>
                    <p className="text-sm text-gray-600">
                      Créer un avoir pour un client
                    </p>
                  </div>

                  <div 
                    className={`border rounded-lg p-4 cursor-pointer ${values.type_avoir === 'avoir_fournisseur' ? 'bg-orange-50 border-orange-300' : ''}`}
                    onClick={() => {
                      setFieldValue('type_avoir', 'avoir_fournisseur');
                      setFieldValue('type_contact', 'Fournisseur');
                      setFieldValue('client_id', '');
                      setTypeAvoir('avoir_fournisseur');
                      setSelectedBon(null);
                    }}
                  >
                    <h4 className="font-medium text-gray-900 mb-2">Avoir Fournisseur</h4>
                    <p className="text-sm text-gray-600">
                      Créer un avoir pour un fournisseur
                    </p>
                  </div>
                </div>

                {/* Avoir lié à un bon existant */}
                <div className="mb-6">
                  <div 
                    className={`border rounded-lg p-4 cursor-pointer ${values.type_avoir === 'lie' ? 'bg-purple-50 border-purple-300' : ''}`}
                    onClick={() => {
                      setFieldValue('type_avoir', 'lie');
                      setTypeAvoir('lie');
                    }}
                  >
                    <h4 className="font-medium text-gray-900 mb-2">Avoir Lié à un Bon</h4>
                    <p className="text-sm text-gray-600">
                      Créer un avoir à partir d'un bon existant
                    </p>
                  </div>
                </div>

                {/* Formulaire pour Avoir Libre */}
                {values.type_avoir === 'libre' && (
                  <div className="space-y-4 border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Détails de l'avoir libre</h4>
                    
                    {/* Type de contact */}
                    <div>
                      <label htmlFor="type_contact" className="block text-sm font-medium text-gray-700 mb-1">
                        Type de contact *
                      </label>
                      {/* Nouveau select pour le type de contact */}
                      <Field
                        as="select"
                        name="type_contact" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Sélectionnez le type de contact</option>
                        <option value="Client">Client</option>
                        <option value="Fournisseur">Fournisseur</option>
                      </Field>
                      <ErrorMessage name="type_contact" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    
                    {/* Client */}
                    {values.type_contact === 'Client' && (
                      <div className="flex items-center space-x-2">
                        <div className="flex-grow">
                          <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
                            Client *
                          </label>
                          <Field
                            as="select"
                            id="client_id"
                            name="client_id"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Sélectionnez un client</option>
                            {clients.map((c: Contact) => (
                              <option key={c.id} value={c.id}>
                                {c.nom_complet} {c.reference ? `(${c.reference})` : ''}
                              </option>
                            ))}
                          </Field>
                          <ErrorMessage name="client_id" component="div" className="text-red-500 text-sm mt-1" />
                        </div>
                        <div className="pt-6">
                          <button
                            type="button"
                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            onClick={() => setIsContactModalOpen('Client')}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Nouveau
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Fournisseur */}
                    {values.type_contact === 'Fournisseur' && (
                      <div className="flex items-center space-x-2">
                        <div className="flex-grow">
                          <label htmlFor="fournisseur_id" className="block text-sm font-medium text-gray-700 mb-1">
                            Fournisseur *
                          </label>
                          <Field
                            as="select"
                            id="fournisseur_id"
                            name="fournisseur_id"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Sélectionnez un fournisseur</option>
                            {fournisseurs.map((f: Contact) => (
                              <option key={f.id} value={f.id}>
                                {f.nom_complet} {f.reference ? `(${f.reference})` : ''}
                              </option>
                            ))}
                          </Field>
                          <ErrorMessage name="fournisseur_id" component="div" className="text-red-500 text-sm mt-1" />
                        </div>
                        <div className="pt-6">
                          <button
                            type="button"
                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            onClick={() => setIsContactModalOpen('Fournisseur')}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Nouveau
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Montant */}
                    <div>
                      <label htmlFor="montant_total" className="block text-sm font-medium text-gray-700 mb-1">
                        Montant *
                      </label>
                      <Field
                        type="number"
                        id="montant_total"
                        name="montant_total"
                        step="0.01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="0.00"
                      />
                      <ErrorMessage name="montant_total" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    
                    {/* Description */}
                    <div>
                      <label htmlFor="designation" className="block text-sm font-medium text-gray-700 mb-1">
                        Description *
                      </label>
                      <Field
                        as="textarea"
                        id="designation"
                        name="designation"
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="Motif de l'avoir"
                      />
                      <ErrorMessage name="designation" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    
                    {/* Bouton de soumission */}
                    <div className="mt-4">
                      <button
                        type="submit"
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      >
                        <Check size={16} className="inline mr-2" />
                        Créer Avoir Libre
                      </button>
                    </div>
                  </div>
                )}

                {/* Formulaire pour Avoir Client */}
                {values.type_avoir === 'avoir_client' && (
                  <div className="space-y-4 border rounded-lg p-4 bg-green-50">
                    <h4 className="font-medium text-gray-900 mb-2">Nouvel Avoir Client</h4>
                    
                    {/* Sélection du client */}
                    <div className="flex items-center space-x-2">
                      <div className="flex-grow">
                        <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
                          Client *
                        </label>
                        <Field
                          as="select"
                          id="client_id"
                          name="client_id"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                          <option value="">Sélectionnez un client</option>
                          {clients.map((c: Contact) => (
                            <option key={c.id} value={c.id}>
                              {c.nom_complet} {c.reference ? `(${c.reference})` : ''}
                            </option>
                          ))}
                        </Field>
                        <ErrorMessage name="client_id" component="div" className="text-red-500 text-sm mt-1" />
                      </div>
                      <div className="pt-6">
                        <button
                          type="button"
                          className="inline-flex items-center px-3 py-2 border border-green-300 shadow-sm text-sm leading-4 font-medium rounded-md text-green-700 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          onClick={() => setIsContactModalOpen('Client')}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Nouveau Client
                        </button>
                      </div>
                    </div>

                    {/* Montant */}
                    <div>
                      <label htmlFor="montant_total" className="block text-sm font-medium text-gray-700 mb-1">
                        Montant *
                      </label>
                      <Field
                        type="number"
                        id="montant_total"
                        name="montant_total"
                        step="0.01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="0.00"
                      />
                      <ErrorMessage name="montant_total" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    
                    {/* Description */}
                    <div>
                      <label htmlFor="designation" className="block text-sm font-medium text-gray-700 mb-1">
                        Description *
                      </label>
                      <Field
                        as="textarea"
                        id="designation"
                        name="designation"
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="Motif de l'avoir client"
                      />
                      <ErrorMessage name="designation" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    
                    {/* Bouton de soumission */}
                    <div className="mt-4">
                      <button
                        type="submit"
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      >
                        <Check size={16} className="inline mr-2" />
                        Créer Avoir Client
                      </button>
                    </div>
                  </div>
                )}

                {/* Formulaire pour Avoir Fournisseur */}
                {values.type_avoir === 'avoir_fournisseur' && (
                  <div className="space-y-4 border rounded-lg p-4 bg-orange-50">
                    <h4 className="font-medium text-gray-900 mb-2">Nouvel Avoir Fournisseur</h4>
                    
                    {/* Sélection du fournisseur */}
                    <div className="flex items-center space-x-2">
                      <div className="flex-grow">
                        <label htmlFor="fournisseur_id" className="block text-sm font-medium text-gray-700 mb-1">
                          Fournisseur *
                        </label>
                        <Field
                          as="select"
                          id="fournisseur_id"
                          name="fournisseur_id"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        >
                          <option value="">Sélectionnez un fournisseur</option>
                          {fournisseurs.map((f: Contact) => (
                            <option key={f.id} value={f.id}>
                              {f.nom_complet} {f.reference ? `(${f.reference})` : ''}
                            </option>
                          ))}
                        </Field>
                        <ErrorMessage name="fournisseur_id" component="div" className="text-red-500 text-sm mt-1" />
                      </div>
                      <div className="pt-6">
                        <button
                          type="button"
                          className="inline-flex items-center px-3 py-2 border border-orange-300 shadow-sm text-sm leading-4 font-medium rounded-md text-orange-700 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                          onClick={() => setIsContactModalOpen('Fournisseur')}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Nouveau Fournisseur
                        </button>
                      </div>
                    </div>

                    {/* Montant */}
                    <div>
                      <label htmlFor="montant_total" className="block text-sm font-medium text-gray-700 mb-1">
                        Montant *
                      </label>
                      <Field
                        type="number"
                        id="montant_total"
                        name="montant_total"
                        step="0.01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="0.00"
                      />
                      <ErrorMessage name="montant_total" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    
                    {/* Description */}
                    <div>
                      <label htmlFor="designation" className="block text-sm font-medium text-gray-700 mb-1">
                        Description *
                      </label>
                      <Field
                        as="textarea"
                        id="designation"
                        name="designation"
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Motif de l'avoir fournisseur"
                      />
                      <ErrorMessage name="designation" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    
                    {/* Bouton de soumission */}
                    <div className="mt-4">
                      <button
                        type="submit"
                        className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                      >
                        <Check size={16} className="inline mr-2" />
                        Créer Avoir Fournisseur
                      </button>
                    </div>
                  </div>
                )}

                {/* Formulaire pour Avoir Lié */}
                {values.type_avoir === 'lie' && (
                  <div className="space-y-4 border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Sélectionner un bon existant</h4>
                    
                    {/* Sélection du bon */}
                    {!bonOrigine && (
                      <div>
                        <label htmlFor="bon_id" className="block text-sm font-medium text-gray-700 mb-1">
                          Bon à transformer en avoir *
                        </label>
                        <Field
                          as="select"
                          id="bon_id"
                          name="bon_id"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const bonId = e.target.value;
                            setFieldValue('bon_id', bonId);
                            if (bonId) {
                              const bon = bons.find((b: Bon) => b.id.toString() === bonId);
                              setSelectedBon(bon);
                            } else {
                              setSelectedBon(null);
                            }
                          }}
                        >
                          <option value="">Sélectionnez un bon</option>
                          {bons.map((bon: Bon) => (
                            <option key={bon.id} value={bon.id}>
                              {bon.numero} - {bon.type} - {Number(bon.montant_total ?? 0).toFixed(2)} DH
                            </option>
                          ))}
                        </Field>
                        <ErrorMessage name="bon_id" component="div" className="text-red-500 text-sm mt-1" />
                      </div>
                    )}
                    
                    {/* Affichage du bon sélectionné */}
                    {selectedBon && (
                      <div>
                        <div className="p-4 bg-gray-50 rounded-lg mb-4">
                          <h5 className="font-medium text-gray-900 mb-2">Détails du bon sélectionné :</h5>
                          <div className="text-sm text-gray-600">
                            <p><strong>Numéro :</strong> {selectedBon.numero}</p>
                            <p><strong>Type :</strong> {selectedBon.type}</p>
                            <p><strong>Date :</strong> {selectedBon.date_creation}</p>
                            <p><strong>Montant :</strong> {Number(selectedBon.montant_total ?? 0).toFixed(2)} DH</p>
                            <p><strong>Produits :</strong> {selectedBon.items?.length || 0} article(s)</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {/* Avoir complet */}
                          <div className="border rounded-lg p-4 hover:bg-gray-50">
                            <h4 className="font-medium text-gray-900 mb-2">Avoir Complet</h4>
                            <p className="text-sm text-gray-600 mb-4">
                              Créer un avoir pour tous les produits du bon
                            </p>
                            <button
                              type="button"
                              onClick={handleCreateFullAvoir}
                              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                            >
                              Créer Avoir Complet
                            </button>
                          </div>
                          
                          {/* Avoir partiel */}
                          <div className="border rounded-lg p-4 hover:bg-gray-50">
                            <h4 className="font-medium text-gray-900 mb-2">Avoir Partiel</h4>
                            <p className="text-sm text-gray-600 mb-4">
                              Sélectionner des produits spécifiques
                            </p>
                            <button
                              type="button"
                              onClick={() => setSelectedProducts([])}
                              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                              Sélectionner des Produits
                            </button>
                          </div>
                        </div>
                        
                        {/* Sélection des produits pour l'avoir partiel */}
                        {(selectedProducts.length > 0 || selectedProducts.length === 0) && selectedBon.items?.length > 0 && (
                          <div className="border rounded-lg p-4 mt-4">
                            <div className="flex justify-between items-center mb-4">
                              <h4 className="font-medium text-gray-900">Sélection des Produits</h4>
                              <button
                                type="button"
                                onClick={handleSelectAllProducts}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                {selectedProducts.length === selectedBon.items.length ? 'Désélectionner tout' : 'Sélectionner tout'}
                              </button>
                            </div>
                            
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {selectedBon.items.map((item: any) => (
                                <div key={item.product_id} className="flex items-center p-2 hover:bg-gray-50 rounded">
                                  <input
                                    type="checkbox"
                                    id={`product-${item.product_id}`}
                                    checked={selectedProducts.includes(Number(item.product_id))}
                                    onChange={() => handleProductSelection(Number(item.product_id))}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  />
                                  <label htmlFor={`product-${item.product_id}`} className="ml-2 flex-1 cursor-pointer">
                                    <div className="font-medium">{item.designation}</div>
                                    <div className="text-sm text-gray-500">
                                      {item.quantite} x {Number(item.prix_unitaire ?? 0).toFixed(2)} DH = {Number((item.quantite || 0) * (Number(item.prix_unitaire ?? 0))).toFixed(2)} DH
                                    </div>
                                  </label>
                                </div>
                              ))}
                            </div>
                            
                            {selectedProducts.length > 0 && (
                              <div className="mt-4">
                                <div className="text-sm text-gray-700 mb-2">
                                  <strong>{selectedProducts.length}</strong> produits sélectionnés sur <strong>{selectedBon.items.length}</strong>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleCreatePartialAvoir}
                                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                                >
                                  <Check size={16} className="inline mr-2" />
                                  Créer Avoir Partiel
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setSelectedProducts([]);
                    }}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>
      
      {/* Modal pour ajouter un nouveau contact */}
      {isContactModalOpen && (
        <ContactFormModal
          isOpen={!!isContactModalOpen}
          onClose={() => setIsContactModalOpen(null)}
          contactType={isContactModalOpen}
          onContactAdded={(newContact) => {
            // Quand un nouveau contact est créé, nous le sélectionnons automatiquement
            if (formikRef.current) {
              if (isContactModalOpen === 'Client') {
                formikRef.current.setFieldValue('client_id', newContact.id);
              } else {
                formikRef.current.setFieldValue('fournisseur_id', newContact.id);
              }
            }
            setIsContactModalOpen(null);
          }}
        />
      )}
    </>
  );
};

export default AvoirFormModal;
