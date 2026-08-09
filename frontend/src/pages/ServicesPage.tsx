import React, { useEffect, useMemo, useState } from 'react';
import { Field, Form, Formik } from 'formik';
import * as yup from 'yup';
import {
  ImagePlus,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type { SaveServiceData, Service, ServiceMaalemCategory } from '../types';
import { useGetActiveMaalemCategoriesQuery } from '../store/api/maalemCategoriesApi';
import {
  type ServiceStatusFilter,
  useCreateServiceMutation,
  useDeleteServiceMutation,
  useGetServicesQuery,
  useSetServiceStatusMutation,
  useUpdateServiceMutation,
} from '../store/api/servicesApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { toBackendUrl } from '../utils/url';

const validationSchema = yup.object({
  nom: yup.string().trim().min(2, 'Minimum 2 caractères').max(150, 'Maximum 150 caractères').required('Le nom est requis'),
  nom_ar: yup.string().trim().min(2, 'Minimum 2 caractères').max(150, 'Maximum 150 caractères').required('Le nom arabe est requis'),
  description: yup.string().trim().max(5000, 'Maximum 5000 caractères'),
  description_ar: yup.string().trim().max(5000, 'Maximum 5000 caractères'),
  category_ids: yup.array().of(yup.number().integer().positive()).min(1, 'Sélectionnez au moins une catégorie Maalem'),
  is_active: yup.boolean().required(),
});

interface FormValues {
  nom: string;
  nom_ar: string;
  description: string;
  description_ar: string;
  category_ids: number[];
  is_active: boolean;
}

function apiErrorMessage(error: unknown) {
  const candidate = error as {
    data?: { message?: string; errors?: Record<string, string> };
    error?: string;
    message?: string;
  };
  if (candidate?.data?.errors) {
    return Object.values(candidate.data.errors)[0] || candidate.data.message || 'Données invalides';
  }
  return candidate?.data?.message || candidate?.error || candidate?.message || 'Une erreur est survenue';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
}

function categoryAvailability(category: ServiceMaalemCategory) {
  return category.is_active && !category.deleted_at;
}

interface ServiceFormModalProps {
  service: Service | null;
  onClose: () => void;
}

const ServiceFormModal: React.FC<ServiceFormModalProps> = ({ service, onClose }) => {
  const { data: activeCategories = [], isLoading: categoriesLoading } = useGetActiveMaalemCategoriesQuery();
  const [createService] = useCreateServiceMutation();
  const [updateService] = useUpdateServiceMutation();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(service?.image_url ? toBackendUrl(service.image_url) : '');

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(removeImage || !service?.image_url ? '' : toBackendUrl(service.image_url));
      return undefined;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile, removeImage, service?.image_url]);

  const categoryOptions = useMemo(() => {
    const byId = new Map<number, ServiceMaalemCategory>();
    for (const category of activeCategories) {
      byId.set(category.id, { ...category, is_active: true, deleted_at: null });
    }
    for (const category of service?.categories || []) {
      if (!byId.has(category.id)) byId.set(category.id, category);
    }
    return [...byId.values()].sort((left, right) => left.nom.localeCompare(right.nom, 'fr'));
  }, [activeCategories, service?.categories]);

  const initialValues: FormValues = {
    nom: service?.nom || '',
    nom_ar: service?.nom_ar || '',
    description: service?.description || '',
    description_ar: service?.description_ar || '',
    category_ids: service?.categories.map(({ id }) => id) || [],
    is_active: service?.is_active ?? true,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="service-form-title">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 id="service-form-title" className="text-lg font-semibold text-gray-900">
            {service ? 'Modifier le service' : 'Nouveau service'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <Formik<FormValues>
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={async (values, { setSubmitting }) => {
            const payload: SaveServiceData = {
              nom: values.nom.trim(),
              nom_ar: values.nom_ar.trim(),
              description: values.description.trim() || null,
              description_ar: values.description_ar.trim() || null,
              category_ids: values.category_ids,
              is_active: values.is_active,
              image: imageFile,
              remove_image: removeImage,
            };
            try {
              if (service) {
                await updateService({ id: service.id, data: payload }).unwrap();
                void showSuccess('Service mis à jour');
              } else {
                await createService(payload).unwrap();
                void showSuccess('Service créé');
              }
              onClose();
            } catch (error) {
              await showError(apiErrorMessage(error));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ errors, touched, isSubmitting, values, setFieldValue }) => (
            <Form className="space-y-5 px-6 py-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="nom" className="mb-1 block text-sm font-medium text-gray-700">Nom *</label>
                  <Field id="nom" name="nom" className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Ex. Réparation de fuite d'eau" />
                  {touched.nom && errors.nom && <p className="mt-1 text-xs text-red-600">{errors.nom}</p>}
                </div>
                <div>
                  <label htmlFor="nom_ar" className="mb-1 block text-sm font-medium text-gray-700">Nom arabe *</label>
                  <Field id="nom_ar" name="nom_ar" dir="rtl" className="w-full rounded-md border border-gray-300 px-3 py-2 text-right focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="مثال: إصلاح تسرب المياه" />
                  {touched.nom_ar && errors.nom_ar && <p className="mt-1 text-xs text-red-600">{errors.nom_ar}</p>}
                </div>
                <div>
                  <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                  <Field as="textarea" id="description" name="description" rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                  {touched.description && errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
                </div>
                <div>
                  <label htmlFor="description_ar" className="mb-1 block text-sm font-medium text-gray-700">Description arabe</label>
                  <Field as="textarea" id="description_ar" name="description_ar" dir="rtl" rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 text-right focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                  {touched.description_ar && errors.description_ar && <p className="mt-1 text-xs text-red-600">{errors.description_ar}</p>}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">Image</span>
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-gray-300 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                    {previewUrl ? <img src={previewUrl} alt="Aperçu du service" className="h-full w-full object-cover" /> : <ImagePlus className="h-8 w-8 text-gray-400" />}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setImageFile(file);
                        if (file) setRemoveImage(false);
                      }}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700"
                    />
                    <p className="text-xs text-gray-500">JPG, PNG ou WebP, 10 Mo maximum.</p>
                    {(service?.image_url || imageFile) && (
                      <button type="button" onClick={() => { setImageFile(null); setRemoveImage(true); }} className="text-sm font-medium text-red-600 hover:text-red-700">
                        Retirer l'image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-gray-700">Catégories Maalem compatibles *</legend>
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
                  {categoriesLoading ? (
                    <p className="text-sm text-gray-500">Chargement des catégories…</p>
                  ) : categoryOptions.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucune catégorie Maalem active disponible.</p>
                  ) : categoryOptions.map((category) => {
                    const selected = values.category_ids.includes(category.id);
                    const available = categoryAvailability(category);
                    return (
                      <label key={category.id} className={`flex items-start gap-3 rounded-md border p-3 ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'} ${!available && !selected ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!available && !selected}
                          onChange={() => {
                            void setFieldValue(
                              'category_ids',
                              selected
                                ? values.category_ids.filter((id) => id !== category.id)
                                : [...values.category_ids, category.id]
                            );
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-800">{category.nom}</span>
                          <span dir="rtl" className="block w-fit text-xs text-gray-500">{category.nom_ar}</span>
                          {!available && <span className="mt-1 block text-xs font-medium text-amber-700">Inactive ou supprimée — conservation ou retrait uniquement</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {touched.category_ids && errors.category_ids && <p className="mt-1 text-xs text-red-600">{String(errors.category_ids)}</p>}
              </fieldset>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 p-3">
                <span>
                  <span className="block text-sm font-medium text-gray-800">Service actif</span>
                  <span className="block text-xs text-gray-500">Disponible pour les nouvelles demandes.</span>
                </span>
                <input type="checkbox" checked={values.is_active} onChange={(event) => void setFieldValue('is_active', event.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </label>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">Annuler</button>
                <button type="submit" disabled={isSubmitting || categoriesLoading} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

const CategoryBadges: React.FC<{ categories: ServiceMaalemCategory[] }> = ({ categories }) => (
  <div className="flex flex-wrap gap-1.5">
    {categories.map((category) => (
      <span key={category.id} className={`rounded-full px-2 py-1 text-xs font-medium ${categoryAvailability(category) ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
        {category.nom}{categoryAvailability(category) ? '' : ' (inactive)'}
      </span>
    ))}
  </div>
);

const ServicesPage: React.FC = () => {
  const [status, setStatus] = useState<ServiceStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { data: categoryOptions = [] } = useGetActiveMaalemCategoriesQuery();
  const [setServiceStatus, { isLoading: statusUpdating }] = useSetServiceStatusMutation();
  const [deleteService, { isLoading: deleting }] = useDeleteServiceMutation();
  const queryArgs = useMemo(() => ({ status, q: search.trim() || undefined, category_id: categoryId }), [status, search, categoryId]);
  const { data: services = [], isLoading, isFetching, isError, refetch } = useGetServicesQuery(queryArgs);

  const openCreate = () => { setEditingService(null); setModalOpen(true); };
  const openEdit = (service: Service) => { setEditingService(service); setModalOpen(true); };

  const toggleStatus = async (service: Service) => {
    if (service.is_active) {
      const confirmation = await showConfirmation(
        `Désactiver « ${service.nom} » ? Il ne sera plus disponible pour les nouvelles demandes. Les anciennes commandes resteront intactes.`,
        'Désactiver le service',
        'Désactiver'
      );
      if (!confirmation.isConfirmed) return;
    }
    try {
      await setServiceStatus({ id: service.id, is_active: !service.is_active }).unwrap();
      void showSuccess(service.is_active ? 'Service désactivé' : 'Service activé');
    } catch (error) {
      await showError(apiErrorMessage(error));
    }
  };

  const removeService = async (service: Service) => {
    const confirmation = await showConfirmation(
      `Supprimer logiquement « ${service.nom} » ? Il disparaîtra du catalogue sans effacer ses relations ni l'historique des anciennes commandes.`,
      'Supprimer le service',
      'Supprimer'
    );
    if (!confirmation.isConfirmed) return;
    try {
      await deleteService(service.id).unwrap();
      void showSuccess('Service supprimé du catalogue');
    } catch (error) {
      await showError(apiErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Catalogue des services</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Services administrés par l'équipe et catégories Maalem compatibles.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Nouveau service
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Rechercher un service…" />
          </div>
          <select value={categoryId || ''} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : undefined)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
            <option value="">Toutes les catégories</option>
            {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.nom}</option>)}
          </select>
          <div className="flex rounded-md border border-gray-200 bg-gray-50 p-1">
            {([['all', 'Tous'], ['active', 'Actifs'], ['inactive', 'Inactifs']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded px-3 py-1.5 text-sm font-medium ${status === value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">Chargement des services…</div>
        ) : isError ? (
          <div className="p-10 text-center"><p className="text-red-600">Impossible de charger les services.</p><button type="button" onClick={() => refetch()} className="mt-3 text-sm font-medium text-blue-600">Réessayer</button></div>
        ) : services.length === 0 ? (
          <div className="p-10 text-center text-gray-500">Aucun service ne correspond aux filtres.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Service</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Catégories Maalem</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Statut</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Mise à jour</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {services.map((service) => (
                    <tr key={service.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4"><div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                          {service.image_url ? <img src={toBackendUrl(service.image_url)} alt="" className="h-full w-full object-cover" /> : <Wrench className="h-5 w-5 text-gray-400" />}
                        </div>
                        <div><div className="font-medium text-gray-900">{service.nom}</div><div dir="rtl" className="mt-1 w-fit text-sm text-gray-500">{service.nom_ar}</div></div>
                      </div></td>
                      <td className="max-w-sm px-5 py-4"><CategoryBadges categories={service.categories} /></td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${service.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{service.is_active ? 'Actif' : 'Inactif'}</span></td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500">{formatDate(service.updated_at)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right"><div className="flex justify-end gap-1">
                        <button type="button" onClick={() => openEdit(service)} className="rounded-md p-2 text-blue-700 hover:bg-blue-50" title="Modifier"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => toggleStatus(service)} disabled={statusUpdating} className={`rounded-md p-2 disabled:opacity-50 ${service.is_active ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`} title={service.is_active ? 'Désactiver' : 'Activer'}>{service.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}</button>
                        <button type="button" onClick={() => removeService(service)} disabled={deleting} className="rounded-md p-2 text-red-700 hover:bg-red-50 disabled:opacity-50" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 md:hidden">
              {services.map((service) => (
                <article key={service.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">{service.image_url ? <img src={toBackendUrl(service.image_url)} alt="" className="h-full w-full object-cover" /> : <Wrench className="h-5 w-5 text-gray-400" />}</div>
                    <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><h2 className="font-semibold text-gray-900">{service.nom}</h2><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${service.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{service.is_active ? 'Actif' : 'Inactif'}</span></div><p dir="rtl" className="mt-1 w-fit text-sm text-gray-500">{service.nom_ar}</p></div>
                  </div>
                  <CategoryBadges categories={service.categories} />
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button type="button" onClick={() => openEdit(service)} className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-200 px-2 py-2 text-sm font-medium text-blue-700"><Pencil className="h-4 w-4" /> Modifier</button>
                    <button type="button" onClick={() => toggleStatus(service)} disabled={statusUpdating} className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-200 px-2 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">{service.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />} Statut</button>
                    <button type="button" onClick={() => removeService(service)} disabled={deleting} className="inline-flex items-center justify-center gap-1 rounded-md border border-red-200 px-2 py-2 text-sm font-medium text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Supprimer</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {isFetching && !isLoading && <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">Actualisation…</div>}
      </div>

      {modalOpen && <ServiceFormModal service={editingService} onClose={() => { setModalOpen(false); setEditingService(null); }} />}
    </div>
  );
};

export default ServicesPage;
