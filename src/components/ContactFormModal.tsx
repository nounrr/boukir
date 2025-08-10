import React from 'react';
import { useDispatch } from 'react-redux';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import type { Contact } from '../types';
import { addContact } from '../store/slices/contactsSlice';
import { showSuccess, showError } from '../utils/notifications';
import { generateClientReference, generateSupplierReference } from '../utils/referenceUtils';

// Schema de validation pour les contacts
const contactValidationSchema = Yup.object({
  nom_complet: Yup.string().required('Nom complet requis'),
  telephone: Yup.string(),
  email: Yup.string().email('Format d\'email invalide'),
  adresse: Yup.string(),
  ice: Yup.string(),
  rib: Yup.string(),
  solde: Yup.number().required('Solde requis').min(0, 'Le solde ne peut pas être négatif'),
  plafond: Yup.number().nullable().min(0, 'Le plafond ne peut pas être négatif'),
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
  const dispatch = useDispatch();

  if (!isOpen) return null;

  const defaultValues = {
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

  const getReference = () => {
    if (contactType === 'Client') {
      return generateClientReference();
    } else {
      return generateSupplierReference();
    }
  };

  const title = contactType === 'Client' ? 'Nouveau Client' : 'Nouveau Fournisseur';
  const buttonText = contactType === 'Client' ? 'Créer Client' : 'Créer Fournisseur';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        <Formik
          initialValues={defaultValues}
          validationSchema={contactValidationSchema}
          onSubmit={(values) => {
            try {
              // Créer un nouveau contact
              const newContact: Contact = {
                id: Date.now(), // Génération d'un ID simple
                reference: getReference(),
                nom_complet: values.nom_complet,
                telephone: values.telephone || '',
                email: values.email || '',
                adresse: values.adresse || '',
                ice: values.ice || '',
                rib: values.rib || '',
                type: contactType,
                solde: values.solde || 0,
                plafond: contactType === 'Client' ? values.plafond || undefined : undefined,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              dispatch(addContact(newContact));
              showSuccess(`${contactType} créé avec succès!`);
              
              if (onContactAdded) {
                onContactAdded(newContact);
              }
              
              onClose();
            } catch (error: any) {
              showError(`Erreur lors de la création du ${contactType.toLowerCase()}: ${error.message || 'Erreur inconnue'}`);
            }
          }}
        >
          {({ errors, touched }) => (
            <Form className="space-y-4">
              {/* Nom complet - pleine largeur */}
              <div>
                <label htmlFor="nom_complet" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet *
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
                    {contactType === 'Client' ? 'Solde à recevoir' : 'Solde à payer'} *
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
