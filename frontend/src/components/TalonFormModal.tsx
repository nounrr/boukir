import React from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import type { Talon } from '../types';
import { useCreateTalonMutation, useUpdateTalonMutation } from '../store/api/talonsApi';
import { showSuccess, showError } from '../utils/notifications';

// Schema de validation pour les talons
const talonValidationSchema = Yup.object({
  nom: Yup.string().required('Nom requis').trim(),
  phone: Yup.string().trim(),
});

interface TalonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Partial<Talon>;
  onTalonAdded?: (talon: Talon) => void;
}

const getButtonText = (initialValues?: Partial<Talon>) => {
  return initialValues?.id ? 'Modifier' : 'Créer';
};

const TalonFormModal: React.FC<TalonFormModalProps> = ({
  isOpen,
  onClose,
  initialValues,
  onTalonAdded,
}) => {
  const [createTalon] = useCreateTalonMutation();
  const [updateTalon] = useUpdateTalonMutation();

  if (!isOpen) return null;

  const defaultValues = {
    nom: '',
    phone: '',
    ...initialValues
  };

  const handleSubmit = async (values: any, { setSubmitting }: any) => {
    try {
      const talonData = {
        nom: values.nom.trim(),
        phone: values.phone?.trim() || null,
      };

      let result;
      if (initialValues?.id) {
        // Modification
        result = await updateTalon({ id: initialValues.id, ...talonData }).unwrap();
        showSuccess('Talon modifié avec succès');
      } else {
        // Création
        result = await createTalon(talonData).unwrap();
        showSuccess('Talon créé avec succès');
      }

      onTalonAdded?.(result);
      onClose();
    } catch (error: any) {
      console.error('Erreur:', error);
      showError(error?.data?.error || 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {initialValues?.id ? 'Modifier le talon' : 'Nouveau talon'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <Formik
          initialValues={defaultValues}
          validationSchema={talonValidationSchema}
          onSubmit={handleSubmit}
          enableReinitialize={true}
        >
          {({ isSubmitting }) => (
            <Form className="space-y-4">
              {/* Nom */}
              <div>
                <label htmlFor="nom" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom *
                </label>
                <Field
                  type="text"
                  id="nom"
                  name="nom"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom du talon"
                />
                <ErrorMessage name="nom" component="div" className="text-red-500 text-sm mt-1" />
              </div>

              {/* Téléphone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Téléphone
                </label>
                <Field
                  type="text"
                  id="phone"
                  name="phone"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Numéro de téléphone"
                />
                <ErrorMessage name="phone" component="div" className="text-red-500 text-sm mt-1" />
              </div>

              {/* Boutons */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'En cours...' : getButtonText(initialValues)}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default TalonFormModal;
