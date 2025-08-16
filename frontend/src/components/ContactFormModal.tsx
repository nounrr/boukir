import React from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import type { Contact } from '../types';
import { useCreateContactMutation, useUpdateContactMutation } from '../store/api/contactsApi';
import { showSuccess, showError } from '../utils/notifications';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

// Schemas de validation dynamiques
const clientSchema = Yup.object({
  nom_complet: Yup.string().required('Nom complet requis'),
  telephone: Yup.string().nullable(),
  email: Yup.string().email("Format d'email invalide").nullable(),
  adresse: Yup.string().nullable(),
  ice: Yup.string().nullable(),
  rib: Yup.string().nullable(),
  solde: Yup.number()
    .typeError('Solde invalide')
    .required('Solde requis')
    .min(0, 'Le solde ne peut pas être négatif'),
  plafond: Yup.number()
    .nullable()
    .transform((value, originalValue) => (originalValue === '' ? null : value))
    .min(0, 'Le plafond ne peut pas être négatif'),
});

const fournisseurSchema = Yup.object({
  nom_complet: Yup.string().nullable(),
  telephone: Yup.string().nullable(),
  email: Yup.string().email("Format d'email invalide").nullable(),
  adresse: Yup.string().nullable(),
  ice: Yup.string().nullable(),
  rib: Yup.string().nullable(),
  solde: Yup.number()
    .nullable()
    .transform((value, originalValue) => (originalValue === '' ? null : value))
    .min(0, 'Le solde ne peut pas être négatif'),
  plafond: Yup.mixed().notRequired().nullable(),
});

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactType: 'Client' | 'Fournisseur';
  initialValues?: Partial<Contact>;
  onContactAdded?: (contact: Contact) => void;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  contactType,
  initialValues,
  onContactAdded,
}) => {
  const [createContact] = useCreateContactMutation();
  const [updateContact] = useUpdateContactMutation();
  const currentUser = useSelector((state: RootState) => state.auth.user);

  if (!isOpen) return null;

  const defaultValues = {
  societe: '',
    nom_complet: '',
    telephone: '',
    email: '',
    adresse: '',
    ice: '',
    rib: '',
    solde: 0,
    plafond: contactType === 'Client' ? 0 : null,
    ...initialValues
  };

  const title = initialValues?.id 
    ? (contactType === 'Client' ? 'Modifier Client' : 'Modifier Fournisseur')
    : (contactType === 'Client' ? 'Nouveau Client' : 'Nouveau Fournisseur');
  const buttonText = initialValues?.id 
    ? (contactType === 'Client' ? 'Modifier Client' : 'Modifier Fournisseur')
    : (contactType === 'Client' ? 'Créer Client' : 'Créer Fournisseur');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        <Formik
          initialValues={defaultValues}
          validationSchema={contactType === 'Client' ? clientSchema : fournisseurSchema}
          enableReinitialize={true}
          onSubmit={async (values) => {
            try {
              if (!currentUser?.id) {
                showError('Utilisateur non authentifié');
                return;
              }

              // Préparer les données du contact
              const contactData = {
                // Pour Fournisseur, le nom peut être vide; on envoie une chaîne vide pour rester compatible DB
                nom_complet: (values.nom_complet || '').toString(),
                societe: (values as any).societe || '',
                telephone: values.telephone || '',
                email: values.email || '',
                adresse: values.adresse || '',
                ice: values.ice || '',
                rib: values.rib || '',
                type: contactType,
                solde: typeof values.solde === 'number' ? values.solde : (values.solde ? Number(values.solde) : 0),
                ...(contactType === 'Client' && { plafond: values.plafond || undefined })
              };

              let result;
              if (initialValues?.id) {
                // Mise à jour d'un contact existant
                result = await updateContact({
                  id: initialValues.id,
                  updated_by: currentUser.id,
                  ...contactData
                }).unwrap();
                showSuccess(`${contactType} modifié avec succès!`);
              } else {
                // Création d'un nouveau contact
                result = await createContact({
                  ...contactData,
                  created_by: currentUser.id
                }).unwrap();
                showSuccess(`${contactType} créé avec succès!`);
              }
              
              if (onContactAdded) {
                onContactAdded(result);
              }
              
              onClose();
            } catch (error: any) {
              console.error('Erreur lors de l\'opération sur le contact:', error);
              showError(`Erreur lors de l'${initialValues?.id ? 'modification' : 'ajout'} du ${contactType.toLowerCase()}: ${error.message || 'Erreur inconnue'}`);
            }
          }}
        >
          {({ errors, touched }) => (
            <Form className="space-y-4">
              {/* Nom complet - pleine largeur */}
              <div>
                <label htmlFor="nom_complet" className="block text-sm font-medium text-gray-700 mb-1">
                  {contactType === 'Client' ? 'Nom complet *' : 'Nom complet (optionnel)'}
                </label>
                <Field
                  id="nom_complet"
                  name="nom_complet"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.nom_complet && touched.nom_complet && (
                  <p className="text-red-500 text-xs mt-1">{errors.nom_complet}</p>
                )}
              </div>

              {/* Société (nom de l'entreprise) */}
              <div>
                <label htmlFor="societe" className="block text-sm font-medium text-gray-700 mb-1">Société</label>
                <Field
                  id="societe"
                  name="societe"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom de la société"
                />
              </div>

              {/* Téléphone et Email - 2 colonnes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="telephone" className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone
                  </label>
                  <Field
                    id="telephone"
                    name="telephone"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: +212 522 123456"
                  />
                  {errors.telephone && touched.telephone && (
                    <p className="text-red-500 text-xs mt-1">{errors.telephone}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Field
                    id="email"
                    name="email"
                    type="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: contact@entreprise.ma"
                  />
                  {errors.email && touched.email && (
                    <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                  )}
                </div>
              </div>

              {/* Adresse - pleine largeur */}
              <div>
                <label htmlFor="adresse" className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse
                </label>
                <Field
                  id="adresse"
                  name="adresse"
                  as="textarea"
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Avenue Mohammed V, Casablanca"
                />
                {errors.adresse && touched.adresse && (
                  <p className="text-red-500 text-xs mt-1">{errors.adresse}</p>
                )}
              </div>

              {/* ICE et RIB - 2 colonnes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ice" className="block text-sm font-medium text-gray-700 mb-1">
                    ICE
                  </label>
                  <Field
                    id="ice"
                    name="ice"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: ICE123456789"
                  />
                  {errors.ice && touched.ice && (
                    <p className="text-red-500 text-xs mt-1">{errors.ice}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="rib" className="block text-sm font-medium text-gray-700 mb-1">
                    RIB
                  </label>
                  <Field
                    id="rib"
                    name="rib"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: RIB123456789012345678901"
                  />
                  {errors.rib && touched.rib && (
                    <p className="text-red-500 text-xs mt-1">{errors.rib}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Plafond (seulement pour les clients) */}
                {contactType === 'Client' && (
                  <div>
                    <label htmlFor="plafond" className="block text-sm font-medium text-gray-700 mb-1">
                      Plafond
                    </label>
                    <Field
                      id="plafond"
                      name="plafond"
                      type="number"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    {errors.plafond && touched.plafond && (
                      <p className="text-red-500 text-xs mt-1">{errors.plafond}</p>
                    )}
                  </div>
                )}

                {/* Solde */}
                <div>
                  <label htmlFor="solde" className="block text-sm font-medium text-gray-700 mb-1">
                    {contactType === 'Client' ? 'Solde à recevoir *' : 'Solde à payer (optionnel)'}
                  </label>
                  <Field
                    id="solde"
                    name="solde"
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  {errors.solde && touched.solde && (
                    <p className="text-red-500 text-xs mt-1">{errors.solde}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-white rounded-md ${
                    contactType === 'Client' 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {buttonText}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default ContactFormModal;
   