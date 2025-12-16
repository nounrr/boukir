import React, { useRef } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import type { Brand } from '../types';
import {
  useCreateBrandMutation,
  useUpdateBrandMutation,
} from '../store/api/brandsApi';
import { showError, showSuccess } from '../utils/notifications';

const schema = Yup.object({
  nom: Yup.string().required('Nom requis'),
  description: Yup.string().nullable(),
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Partial<Brand>;
  onSaved?: (brand: Brand) => void;
}

const BrandFormModal: React.FC<Props> = ({ isOpen, onClose, initialValues, onSaved }) => {
  const [createBrand] = useCreateBrandMutation();
  const [updateBrand] = useUpdateBrandMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const defaults = {
    nom: '',
    description: '',
    ...initialValues,
  } as { nom: string; description?: string };

  const isEdit = Boolean(initialValues?.id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">{isEdit ? 'Modifier la marque' : 'Nouvelle marque'}</h3>
        <Formik
          initialValues={defaults}
          validationSchema={schema}
          enableReinitialize
          onSubmit={async (values, { setSubmitting }) => {
            try {
              const formData = new FormData();
              formData.append('nom', values.nom);
              if (values.description) formData.append('description', values.description);
              
              if (fileInputRef.current?.files?.[0]) {
                formData.append('image', fileInputRef.current.files[0]);
              }

              let saved: Brand;
              if (isEdit && initialValues?.id) {
                saved = await updateBrand({ id: initialValues.id, data: formData }).unwrap();
                showSuccess('Marque mise à jour');
              } else {
                saved = await createBrand(formData).unwrap();
                showSuccess('Marque créée');
              }
              onSaved?.(saved);
              onClose();
            } catch (e: any) {
              showError(e?.data?.message || e?.message || "Erreur lors de l'enregistrement");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ errors, touched, isSubmitting }) => (
            <Form className="space-y-4">
              <div>
                <label htmlFor="nom" className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <Field
                  id="nom"
                  name="nom"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Samsung"
                />
                {errors.nom && touched.nom && (
                  <p className="text-red-500 text-xs mt-1">{errors.nom}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Field
                  as="textarea"
                  id="description"
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Description optionnelle..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {initialValues?.image_url && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Image actuelle:</p>
                    <img 
                      src={`http://localhost:3001${initialValues.image_url}`} 
                      alt="Brand" 
                      className="h-16 object-contain border rounded p-1"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default BrandFormModal;
