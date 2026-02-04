import React from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import type { Vehicule, Employee } from '../types';
import { useCreateVehiculeMutation, useUpdateVehiculeMutation } from '../store/api/vehiculesApi';
import { showSuccess, showError } from '../utils/notifications';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { useGetEmployeesQueryServer as useGetEmployeesQuery } from '../store/api/employeesApi.server';

// Schema de validation pour les véhicules
const vehiculeValidationSchema = Yup.object({
  nom: Yup.string().required('Nom requis'),
  marque: Yup.string(),
  modele: Yup.string(),
  immatriculation: Yup.string().required('Immatriculation requise'),
  annee: Yup.number().min(1900, 'Année invalide').max(new Date().getFullYear() + 1, 'Année invalide'),
  type_vehicule: Yup.string().required('Type de véhicule requis'),
  capacite_charge: Yup.number().min(0, 'La capacité ne peut pas être négative'),
  statut: Yup.string().required('Statut requis'),
  employe_id: Yup.number()
    .nullable()
    .transform((value, originalValue) => (originalValue === '' ? null : value)),
});

interface VehiculeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Partial<Vehicule>;
  onVehiculeAdded?: (vehicule: Vehicule) => void;
}

const VehiculeFormModal: React.FC<VehiculeFormModalProps> = ({
  isOpen,
  onClose,
  initialValues,
  onVehiculeAdded,
}) => {
  const [createVehicule] = useCreateVehiculeMutation();
  const [updateVehicule] = useUpdateVehiculeMutation();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { data: employeesAll = [] } = useGetEmployeesQuery();

  const chauffeurs = React.useMemo(() => {
    return (employeesAll as Employee[])
      .filter((e) => (e?.role === 'Chauffeur' || e?.role === 'ChefChauffeur') && !e?.deleted_at)
      .sort((a, b) => String(a.nom_complet || '').localeCompare(String(b.nom_complet || '')));
  }, [employeesAll]);

  if (!isOpen) return null;

  const { employe_id: initialEmployeId, ...restInitialValues } = initialValues ?? {};

  const defaultValues = {
    nom: '',
    marque: '',
    modele: '',
    immatriculation: '',
    annee: new Date().getFullYear(),
    type_vehicule: 'Camion' as const,
    capacite_charge: 0,
    statut: 'Disponible' as const,
    ...restInitialValues,
    // Normalize to string for <select>
    employe_id: initialEmployeId != null ? String(initialEmployeId) : '',
  };

  const title = initialValues?.id 
    ? 'Modifier Véhicule' 
    : 'Nouveau Véhicule';
  const buttonText = initialValues?.id 
    ? 'Modifier Véhicule' 
    : 'Créer Véhicule';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        <Formik
          initialValues={defaultValues}
          validationSchema={vehiculeValidationSchema}
          enableReinitialize={true}
          onSubmit={async (values, { setFieldError, setSubmitting }) => {
            try {
              if (!currentUser?.id) {
                showError('Utilisateur non authentifié');
                setSubmitting(false);
                return;
              }

              // Préparer les données du véhicule
              const vehiculeData = {
                nom: values.nom,
                marque: values.marque || undefined,
                modele: values.modele || undefined,
                immatriculation: values.immatriculation,
                annee: values.annee || undefined,
                type_vehicule: values.type_vehicule,
                capacite_charge: values.capacite_charge || undefined,
                statut: values.statut,
                employe_id:
                  (values as any).employe_id === ''
                    ? null
                    : Number((values as any).employe_id),
              };

              let result;
              if (initialValues?.id) {
                // Mise à jour d'un véhicule existant
                result = await updateVehicule({
                  id: initialValues.id,
                  updated_by: currentUser.id,
                  ...vehiculeData
                }).unwrap();
                showSuccess('Véhicule modifié avec succès!');
              } else {
                // Création d'un nouveau véhicule
                result = await createVehicule({
                  ...vehiculeData,
                  created_by: currentUser.id
                }).unwrap();
                showSuccess('Véhicule créé avec succès!');
              }
              
              if (onVehiculeAdded) {
                onVehiculeAdded(result);
              }
              
              onClose();
            } catch (error: any) {
              console.error('Erreur lors de l\'opération sur le véhicule:', error);
              const status = error?.status || error?.originalStatus;
              const serverMsg = error?.data?.message || error?.error || error?.message;
              if (status === 409) {
                // Conflit (ex: immatriculation déjà existante)
                setFieldError('immatriculation', serverMsg || 'Cette immatriculation existe déjà');
                showError(serverMsg || 'Cette immatriculation existe déjà');
              } else if (status === 400) {
                showError(serverMsg || 'Champs requis manquants');
              } else {
                showError(serverMsg || `Erreur lors de l'${initialValues?.id ? 'modification' : 'ajout'} du véhicule`);
              }
            }
            finally {
              setSubmitting(false);
            }
          }}
        >
          {({ errors, touched, isSubmitting }) => (
            <Form className="space-y-4">
              {/* Nom - pleine largeur */}
              <div>
                <label htmlFor="nom" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du véhicule *
                </label>
                <Field
                  id="nom"
                  name="nom"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Camion Livraison 1"
                />
                {errors.nom && touched.nom && (
                  <p className="text-red-500 text-xs mt-1">{errors.nom}</p>
                )}
              </div>

              {/* Marque et Modèle - 2 colonnes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="marque" className="block text-sm font-medium text-gray-700 mb-1">
                    Marque
                  </label>
                  <Field
                    id="marque"
                    name="marque"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Renault"
                  />
                  {errors.marque && touched.marque && (
                    <p className="text-red-500 text-xs mt-1">{errors.marque}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="modele" className="block text-sm font-medium text-gray-700 mb-1">
                    Modèle
                  </label>
                  <Field
                    id="modele"
                    name="modele"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Master"
                  />
                  {errors.modele && touched.modele && (
                    <p className="text-red-500 text-xs mt-1">{errors.modele}</p>
                  )}
                </div>
              </div>

              {/* Immatriculation et Année - 2 colonnes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="immatriculation" className="block text-sm font-medium text-gray-700 mb-1">
                    Immatriculation *
                  </label>
                  <Field
                    id="immatriculation"
                    name="immatriculation"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: 123456-A-12"
                  />
                  {errors.immatriculation && touched.immatriculation && (
                    <p className="text-red-500 text-xs mt-1">{errors.immatriculation}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="annee" className="block text-sm font-medium text-gray-700 mb-1">
                    Année
                  </label>
                  <Field
                    id="annee"
                    name="annee"
                    type="number"
                    min="1900"
                    max={new Date().getFullYear() + 1}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.annee && touched.annee && (
                    <p className="text-red-500 text-xs mt-1">{errors.annee}</p>
                  )}
                </div>
              </div>

              {/* Type de véhicule et Capacité - 2 colonnes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="type_vehicule" className="block text-sm font-medium text-gray-700 mb-1">
                    Type de véhicule *
                  </label>
                  <Field
                    id="type_vehicule"
                    name="type_vehicule"
                    as="select"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Camion">Camion</option>
                    <option value="Camionnette">Camionnette</option>
                    <option value="Voiture">Voiture</option>
                    <option value="Moto">Moto</option>
                    <option value="Autre">Autre</option>
                  </Field>
                  {errors.type_vehicule && touched.type_vehicule && (
                    <p className="text-red-500 text-xs mt-1">{errors.type_vehicule}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="capacite_charge" className="block text-sm font-medium text-gray-700 mb-1">
                    Capacité de charge (kg)
                  </label>
                  <Field
                    id="capacite_charge"
                    name="capacite_charge"
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  {errors.capacite_charge && touched.capacite_charge && (
                    <p className="text-red-500 text-xs mt-1">{errors.capacite_charge}</p>
                  )}
                </div>
              </div>

              {/* Chauffeur */}
              <div>
                <label htmlFor="employe_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Chauffeur
                </label>
                <Field
                  id="employe_id"
                  name="employe_id"
                  as="select"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Aucun chauffeur</option>
                  {chauffeurs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nom_complet || `Employé #${e.id}`}
                    </option>
                  ))}
                </Field>
                {(errors as any).employe_id && (touched as any).employe_id && (
                  <p className="text-red-500 text-xs mt-1">{(errors as any).employe_id}</p>
                )}
              </div>

              {/* Statut */}
              <div>
                <label htmlFor="statut" className="block text-sm font-medium text-gray-700 mb-1">
                  Statut *
                </label>
                <Field
                  id="statut"
                  name="statut"
                  as="select"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Disponible">Disponible</option>
                  <option value="En service">En service</option>
                  <option value="En maintenance">En maintenance</option>
                  <option value="Hors service">Hors service</option>
                </Field>
                {errors.statut && touched.statut && (
                  <p className="text-red-500 text-xs mt-1">{errors.statut}</p>
                )}
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
                  disabled={isSubmitting}
                  className={`px-4 py-2 text-white rounded-md ${isSubmitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
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

export default VehiculeFormModal;
