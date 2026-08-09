import React, { useMemo, useState } from 'react';
import { Field, Form, Formik } from 'formik';
import * as yup from 'yup';
import { Pencil, Plus, Power, PowerOff, Search, Tags, X } from 'lucide-react';
import type { MaalemCategory, SaveMaalemCategoryData } from '../types';
import {
  type MaalemCategoryStatusFilter,
  useCreateMaalemCategoryMutation,
  useGetMaalemCategoriesQuery,
  useSetMaalemCategoryStatusMutation,
  useUpdateMaalemCategoryMutation,
} from '../store/api/maalemCategoriesApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';

const validationSchema = yup.object({
  nom: yup.string().trim().min(2, 'Minimum 2 caractères').max(100, 'Maximum 100 caractères').required('Le nom est requis'),
  nom_ar: yup.string().trim().min(2, 'Minimum 2 caractères').max(100, 'Maximum 100 caractères').required('Le nom arabe est requis'),
  description: yup.string().trim().max(1000, 'Maximum 1000 caractères'),
  is_active: yup.boolean().required(),
});

interface FormValues {
  nom: string;
  nom_ar: string;
  description: string;
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
  return candidate?.data?.message || candidate?.error || candidate?.message || "Une erreur est survenue";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
}

interface CategoryFormModalProps {
  category: MaalemCategory | null;
  onClose: () => void;
}

const CategoryFormModal: React.FC<CategoryFormModalProps> = ({ category, onClose }) => {
  const [createCategory] = useCreateMaalemCategoryMutation();
  const [updateCategory] = useUpdateMaalemCategoryMutation();

  const initialValues: FormValues = {
    nom: category?.nom || '',
    nom_ar: category?.nom_ar || '',
    description: category?.description || '',
    is_active: category?.is_active ?? true,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="maalem-category-form-title">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id="maalem-category-form-title" className="text-lg font-semibold text-gray-900">
            {category ? 'Modifier la catégorie Maalem' : 'Nouvelle catégorie Maalem'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <Formik<FormValues>
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={async (values, { setSubmitting }) => {
            const payload: SaveMaalemCategoryData = {
              nom: values.nom.trim(),
              nom_ar: values.nom_ar.trim(),
              description: values.description.trim() || null,
              is_active: values.is_active,
            };

            try {
              if (category) {
                await updateCategory({ id: category.id, data: payload }).unwrap();
                void showSuccess('Catégorie Maalem mise à jour');
              } else {
                await createCategory(payload).unwrap();
                void showSuccess('Catégorie Maalem créée');
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
              <div>
                <label htmlFor="nom" className="mb-1 block text-sm font-medium text-gray-700">Nom *</label>
                <Field id="nom" name="nom" className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Ex. Plombier" />
                {touched.nom && errors.nom && <p className="mt-1 text-xs text-red-600">{errors.nom}</p>}
              </div>

              <div>
                <label htmlFor="nom_ar" className="mb-1 block text-sm font-medium text-gray-700">Nom arabe *</label>
                <Field id="nom_ar" name="nom_ar" dir="rtl" className="w-full rounded-md border border-gray-300 px-3 py-2 text-right focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="مثال: سباك" />
                {touched.nom_ar && errors.nom_ar && <p className="mt-1 text-xs text-red-600">{errors.nom_ar}</p>}
              </div>

              <div>
                <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <Field as="textarea" id="description" name="description" rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Description optionnelle…" />
                {touched.description && errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 p-3">
                <span>
                  <span className="block text-sm font-medium text-gray-800">Catégorie active</span>
                  <span className="block text-xs text-gray-500">Disponible pour les nouvelles inscriptions et candidatures.</span>
                </span>
                <input
                  type="checkbox"
                  checked={values.is_active}
                  onChange={(event) => setFieldValue('is_active', event.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
                  Annuler
                </button>
                <button type="submit" disabled={isSubmitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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

const MaalemCategoriesPage: React.FC = () => {
  const [status, setStatus] = useState<MaalemCategoryStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaalemCategory | null>(null);
  const [setCategoryStatus, { isLoading: isStatusUpdating }] = useSetMaalemCategoryStatusMutation();

  const queryArgs = useMemo(() => ({ status, q: search.trim() || undefined }), [status, search]);
  const { data: categories = [], isLoading, isFetching, isError, refetch } = useGetMaalemCategoriesQuery(queryArgs);

  const openCreate = () => {
    setEditingCategory(null);
    setModalOpen(true);
  };

  const openEdit = (category: MaalemCategory) => {
    setEditingCategory(category);
    setModalOpen(true);
  };

  const toggleStatus = async (category: MaalemCategory) => {
    if (category.is_active) {
      const confirmation = await showConfirmation(
        `Désactiver « ${category.nom} » ? Elle ne sera plus proposée aux nouvelles candidatures. Les relations historiques seront conservées.`,
        'Désactiver la catégorie',
        'Désactiver'
      );
      if (!confirmation.isConfirmed) return;
    }

    try {
      await setCategoryStatus({ id: category.id, is_active: !category.is_active }).unwrap();
      void showSuccess(category.is_active ? 'Catégorie désactivée' : 'Catégorie activée');
    } catch (error) {
      await showError(apiErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Tags className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Catégories Maalem</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Référentiel métier destiné aux futurs profils, services et candidatures Maalem.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Nouvelle catégorie
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Rechercher par nom…" />
          </div>
          <div className="flex rounded-md border border-gray-200 bg-gray-50 p-1">
            {([
              ['all', 'Toutes'],
              ['active', 'Actives'],
              ['inactive', 'Inactives'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded px-3 py-1.5 text-sm font-medium ${status === value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">Chargement des catégories…</div>
        ) : isError ? (
          <div className="p-10 text-center">
            <p className="text-red-600">Impossible de charger les catégories Maalem.</p>
            <button type="button" onClick={() => refetch()} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">Réessayer</button>
          </div>
        ) : categories.length === 0 ? (
          <div className="p-10 text-center text-gray-500">Aucune catégorie ne correspond aux filtres.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Catégorie</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Statut</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Mise à jour</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {categories.map((category) => (
                    <tr key={category.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{category.nom}</div>
                        <div dir="rtl" className="mt-1 w-fit text-sm text-gray-500">{category.nom_ar}</div>
                      </td>
                      <td className="max-w-md px-6 py-4 text-sm text-gray-600">{category.description || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${category.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {category.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(category.updated_at)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <button type="button" onClick={() => openEdit(category)} className="mr-2 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
                          <Pencil className="h-4 w-4" /> Modifier
                        </button>
                        <button type="button" onClick={() => toggleStatus(category)} disabled={isStatusUpdating} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${category.is_active ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`}>
                          {category.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          {category.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 md:hidden">
              {categories.map((category) => (
                <article key={category.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-gray-900">{category.nom}</h2>
                      <p dir="rtl" className="mt-1 w-fit text-sm text-gray-500">{category.nom_ar}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${category.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {category.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {category.description && <p className="text-sm text-gray-600">{category.description}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => openEdit(category)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-blue-700">
                      <Pencil className="h-4 w-4" /> Modifier
                    </button>
                    <button type="button" onClick={() => toggleStatus(category)} disabled={isStatusUpdating} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">
                      {category.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      {category.is_active ? 'Désactiver' : 'Activer'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {isFetching && !isLoading && <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">Actualisation…</div>}
      </div>

      {modalOpen && (
        <CategoryFormModal
          category={editingCategory}
          onClose={() => {
            setModalOpen(false);
            setEditingCategory(null);
          }}
        />
      )}
    </div>
  );
};

export default MaalemCategoriesPage;
