import React, { useState, useRef } from 'react';
import { Formik, Form, Field, FieldArray, ErrorMessage } from 'formik';
import type { FormikProps } from 'formik';
import * as Yup from 'yup';
import { useDispatch, useSelector } from 'react-redux';
import { Plus, Trash2 } from 'lucide-react';
import { showSuccess, showError } from '../utils/notifications';
import { addBon, updateBon } from '../store/slices/bonsSlice';
import { generateBonReference } from '../utils/referenceUtils';
import type { RootState } from '../store';
import type { Contact } from '../types';
import ProductFormModal from './ProductFormModal';
import ContactFormModal from './ContactFormModal';

// Schéma de validation pour les bons
const bonValidationSchema = Yup.object({
  numero: Yup.string().required('Numéro requis'),
  date_bon: Yup.string().required('Date du bon requise'),
  vehicule: Yup.string(),
  lieu_charge: Yup.string(),
  client_id: Yup.number().when('type', ([type], schema) => {
    // Client requis pour Sortie, Comptant, Devis, et Avoir
    if (type === 'Sortie' || type === 'Comptant' || type === 'Devis' || type === 'Avoir') {
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
  const dispatch = useDispatch();
  const formikRef = useRef<FormikProps<any>>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState<null | 'Client' | 'Fournisseur'>(null);
  
  const products = useSelector((state: RootState) => 
    state.products?.products || []
  );
  
  const clients = useSelector((state: RootState) => 
    state.contacts?.contacts?.filter((c: Contact) => c.type === 'Client') || []
  );
  
  const fournisseurs = useSelector((state: RootState) => 
    state.contacts?.contacts?.filter((c: Contact) => c.type === 'Fournisseur') || []
  );

  if (!isOpen) return null;

  // Déterminer les valeurs initiales du formulaire
  const getInitialValues = () => {
    if (initialValues) {
      return {
        ...initialValues,
        client_id: initialValues.client_id || '',
        fournisseur_id: initialValues.fournisseur_id || ''
      };
    }
    
    // Valeurs par défaut pour un nouveau bon
    return {
      type: currentTab,
      numero: generateBonReference(currentTab),
      date_bon: new Date().toISOString().split('T')[0],
      vehicule: '',
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
  const handleSubmit = (values: any, { setSubmitting }: any) => {
    try {
      // Calcul des montants (sans TVA)
      const montantTotal = values.items.reduce(
        (sum: number, item: any) => sum + (item.quantite * item.prix_unitaire),
        0
      );
      
      // Récupérer les noms et adresses de client/fournisseur si nécessaire
      let clientNom = '';
      let clientAdresse = '';
      let fournisseurNom = '';
      let fournisseurAdresse = '';
      
      if (values.client_id) {
        const client = clients.find((c: Contact) => c.id.toString() === values.client_id.toString());
        clientNom = client?.nom_complet || '';
        clientAdresse = client?.adresse || '';
      }
      
      if (values.fournisseur_id) {
        const fournisseur = fournisseurs.find((f: Contact) => f.id.toString() === values.fournisseur_id.toString());
        fournisseurNom = fournisseur?.nom_complet || '';
        fournisseurAdresse = fournisseur?.adresse || '';
      }
      
      // Créer ou mettre à jour le bon
      const bonData = {
        ...values,
        client_nom: clientNom,
        client_adresse: clientAdresse,
        fournisseur_nom: fournisseurNom,
        fournisseur_adresse: fournisseurAdresse,
        montant_ht: montantTotal,
        montant_total: montantTotal,
        updated_at: new Date().toISOString(),
        items: values.items.map((item: any) => ({
          ...item,
          total: item.quantite * item.prix_unitaire
        }))
      };
      
      if (initialValues) {
        // Mise à jour d'un bon existant
        dispatch(updateBon(bonData));
        showSuccess('Bon mis à jour avec succès');
      } else {
        // Création d'un nouveau bon
        dispatch(addBon({
          ...bonData,
          id: Date.now(),
          created_at: new Date().toISOString()
        }));
        showSuccess(`${currentTab} créé avec succès`);
      }
      
      if (onBonAdded) {
        onBonAdded(bonData);
      }
      
      onClose();
    } catch (error: any) {
      showError(`Erreur: ${error.message || 'Une erreur est survenue'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Convertir un bon en bon de sortie
  const handleConvertToSortie = (_values: any, setFieldValue: any) => {
    setFieldValue('type', 'Sortie');
    setFieldValue('numero', generateBonReference('Sortie'));
    setFieldValue('fournisseur_id', '');
    setFieldValue('fournisseur_nom', '');
    initialValues = null;
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
                
                {/* Véhicule */}
                <div>
                  <label htmlFor="vehicule" className="block text-sm font-medium text-gray-700 mb-1">
                    Véhicule
                  </label>
                  <Field
                    type="text"
                    id="vehicule"
                    name="vehicule"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Ex: Camion 123-A-456"
                  />
                </div>
                
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
                
              {/* Client (Sortie, Comptant, Devis, Avoir) */}
              {(values.type === 'Sortie' || values.type === 'Devis' || values.type === 'Comptant' || values.type === 'Avoir') && (
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Client *
                    </label>
                    <button
                      type="button"
                      className="text-blue-600 underline text-xs"
                      onClick={() => setIsContactModalOpen('Client')}
                    >
                      Nouveau client
                    </button>
                  </div>
                  <Field
                    as="select"
                    id="client_id"
                    name="client_id"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const clientId = e.target.value;
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
                  >
                    <option value="">Sélectionnez un client</option>
                    {clients.map((client: Contact) => (
                      <option key={client.id} value={client.id}>
                        {client.nom_complet} {client.reference ? `(${client.reference})` : ''}
                      </option>
                    ))}
                  </Field>
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
                  <Field
                    as="select"
                    id="fournisseur_id"
                    name="fournisseur_id"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const fournisseurId = e.target.value;
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
                  >
                    <option value="">Sélectionnez un fournisseur</option>
                    {fournisseurs.map((fournisseur: Contact) => (
                      <option key={fournisseur.id} value={fournisseur.id}>
                        {fournisseur.nom_complet} {fournisseur.reference ? `(${fournisseur.reference})` : ''}
                      </option>
                    ))}
                  </Field>
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
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Référence</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Désignation</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix d'achat</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix unitaire</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                                <td className="px-4 py-2">
                                  <Field
                                    as="select"
                                    name={`items.${index}.product_reference`}
                                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                      const reference = e.target.value;
                                      setFieldValue(`items.${index}.product_reference`, reference);
                                      if (reference) {
                                        const product = products.find((p: any) => p.reference === reference);
                                        if (product) {
                                          setFieldValue(`items.${index}.product_id`, product.id);
                                          setFieldValue(`items.${index}.designation`, product.designation);
                                          setFieldValue(`items.${index}.prix_achat`, product.prix_achat || 0);
                                          setFieldValue(`items.${index}.prix_unitaire`, product.prix_vente || 0);
                                          // Recalculer le total
                                          const quantite = values.items[index].quantite || 1;
                                          setFieldValue(`items.${index}.total`, quantite * (product.prix_vente || 0));
                                        }
                                      }
                                    }}
                                  >
                                    <option value="">Sélectionner par référence</option>
                                    {products.map((product: any) => (
                                      <option key={`ref-${product.id}`} value={product.reference}>
                                        {product.reference}
                                      </option>
                                    ))}
                                  </Field>
                                </td>
                                
                                {/* Désignation */}
                                <td className="px-4 py-2">
                                  <Field
                                    as="select"
                                    name={`items.${index}.designation`}
                                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                      const designation = e.target.value;
                                      setFieldValue(`items.${index}.designation`, designation);
                                      if (designation) {
                                        const product = products.find((p: any) => p.designation === designation);
                                        if (product) {
                                          setFieldValue(`items.${index}.product_id`, product.id);
                                          setFieldValue(`items.${index}.product_reference`, product.reference);
                                          setFieldValue(`items.${index}.prix_achat`, product.prix_achat || 0);
                                          setFieldValue(`items.${index}.prix_unitaire`, product.prix_vente || 0);
                                          // Recalculer le total
                                          const quantite = values.items[index].quantite || 1;
                                          setFieldValue(`items.${index}.total`, quantite * (product.prix_vente || 0));
                                        }
                                      }
                                    }}
                                  >
                                    <option value="">Sélectionner par désignation</option>
                                    {products.map((product: any) => (
                                      <option key={`des-${product.id}`} value={product.designation}>
                                        {product.designation}
                                      </option>
                                    ))}
                                  </Field>
                                </td>
                                
                                {/* Quantité */}
                                <td className="px-4 py-2">
                                  <Field
                                    type="number"
                                    name={`items.${index}.quantite`}
                                    min="1"
                                    className="w-20 px-2 py-1 border border-gray-300 rounded-md text-sm"
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
                                <td className="px-4 py-2">
                                  <Field
                                    type="number"
                                    name={`items.${index}.prix_achat`}
                                    step="0.01"
                                    className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm bg-gray-100"
                                    disabled
                                  />
                                </td>
                                
                                {/* Prix unitaire (modifiable) */}
                                <td className="px-4 py-2">
                                  <Field
                                    type="number"
                                    name={`items.${index}.prix_unitaire`}
                                    step="0.01"
                                    className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                      const prixUnitaire = parseFloat(e.target.value) || 0;
                                      setFieldValue(`items.${index}.prix_unitaire`, prixUnitaire);
                                      // Recalculer le total
                                      const quantite = values.items[index].quantite || 1;
                                      setFieldValue(`items.${index}.total`, quantite * prixUnitaire);
                                    }}
                                  />
                                </td>
                                
                                {/* Total */}
                                <td className="px-4 py-2">
                                  <div className="text-sm font-medium">
                                    {((values.items[index].quantite || 0) * (values.items[index].prix_unitaire || 0)).toFixed(2)} DH
                                  </div>
                                </td>
                                
                                {/* Actions */}
                                <td className="px-4 py-2">
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
                <div>
                  {initialValues && values.type === 'Commande' && (
                    <button
                      type="button"
                      onClick={() => handleConvertToSortie(values, setFieldValue)}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md"
                    >
                      Convertir en Bon de Sortie
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  {initialValues && (
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
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                  >
                    {initialValues ? 'Mettre à jour' : values.type === 'Devis' ? 'Créer Devis' : 'Valider Bon'}
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
    </div>
  );
};

export default BonFormModal;
