import React from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import type { Category } from '../types';
import {
	useCreateCategoryMutation,
	useUpdateCategoryMutation,
<<<<<<< HEAD
=======
	useGetCategoriesQuery,
>>>>>>> fb6d9e11b478e0add53abfe48811630f2f31df79
} from '../store/api/categoriesApi';
import { showError, showSuccess } from '../utils/notifications';

const schema = Yup.object({
	nom: Yup.string().required('Nom requis'),
	description: Yup.string().nullable(),
<<<<<<< HEAD
=======
	parent_id: Yup.number().nullable(),
>>>>>>> fb6d9e11b478e0add53abfe48811630f2f31df79
});

interface Props {
	isOpen: boolean;
	onClose: () => void;
	initialValues?: Partial<Category>;
	onSaved?: (cat: Category) => void;
}

const CategoryFormModal: React.FC<Props> = ({ isOpen, onClose, initialValues, onSaved }) => {
	const { user } = useSelector((s: RootState) => s.auth);
	const [createCategory] = useCreateCategoryMutation();
	const [updateCategory] = useUpdateCategoryMutation();
<<<<<<< HEAD
=======
	const { data: categories } = useGetCategoriesQuery();
>>>>>>> fb6d9e11b478e0add53abfe48811630f2f31df79

	if (!isOpen) return null;

	const defaults = {
		nom: '',
		description: '',
<<<<<<< HEAD
		...initialValues,
	} as { nom: string; description?: string };

	const isEdit = Boolean(initialValues?.id);
=======
		parent_id: '',
		...initialValues,
	} as { nom: string; description?: string; parent_id?: string | number | null };

	const isEdit = Boolean(initialValues?.id);
	
	// Filter out self if editing to prevent circular dependency
	const availableParents = categories?.filter(c => !isEdit || c.id !== initialValues?.id) || [];
>>>>>>> fb6d9e11b478e0add53abfe48811630f2f31df79

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white rounded-lg p-6 w-full max-w-md">
				<h3 className="text-lg font-semibold mb-4">{isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h3>
				<Formik
					initialValues={defaults}
					validationSchema={schema}
					enableReinitialize
					onSubmit={async (values, { setSubmitting }) => {
						try {
							let saved: Category;
<<<<<<< HEAD
							if (isEdit && initialValues?.id) {
								saved = await updateCategory({ id: initialValues.id, updated_by: user?.id || 1, ...values }).unwrap();
								showSuccess('Catégorie mise à jour');
							} else {
								saved = await createCategory({ ...values, created_by: user?.id || 1 }).unwrap();
=======
							const payload = {
								...values,
								parent_id: values.parent_id ? Number(values.parent_id) : null,
							};

							if (isEdit && initialValues?.id) {
								saved = await updateCategory({ id: initialValues.id, updated_by: user?.id || 1, ...payload }).unwrap();
								showSuccess('Catégorie mise à jour');
							} else {
								saved = await createCategory({ ...payload, created_by: user?.id || 1 }).unwrap();
>>>>>>> fb6d9e11b478e0add53abfe48811630f2f31df79
								showSuccess('Catégorie créée');
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
									placeholder="Ex: Ciment"
								/>
								{errors.nom && touched.nom && (
									<p className="text-red-500 text-xs mt-1">{errors.nom}</p>
								)}
							</div>
<<<<<<< HEAD
=======
							
							<div>
								<label htmlFor="parent_id" className="block text-sm font-medium text-gray-700 mb-1">Catégorie Parente</label>
								<Field
									as="select"
									id="parent_id"
									name="parent_id"
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
								>
									<option value="">Aucune (Racine)</option>
									{availableParents.map(cat => (
										<option key={cat.id} value={cat.id}>{cat.nom}</option>
									))}
								</Field>
							</div>

>>>>>>> fb6d9e11b478e0add53abfe48811630f2f31df79
							<div>
								<label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
								<Field
									id="description"
									name="description"
									as="textarea"
									rows={3}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
									placeholder="Notes ou détails"
								/>
								{errors.description && touched.description && (
									<p className="text-red-500 text-xs mt-1">{errors.description}</p>
								)}
							</div>
							<div className="flex justify-end gap-2 pt-2">
								<button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50">Annuler</button>
								<button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
									{isEdit ? 'Enregistrer' : 'Créer'}
								</button>
							</div>
						</Form>
					)}
				</Formik>
			</div>
		</div>
	);
};

export default CategoryFormModal;

