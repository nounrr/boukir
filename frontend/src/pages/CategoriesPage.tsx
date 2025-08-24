import React, { useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Search, Tags } from 'lucide-react';
import type { Category } from '../types';
import {
	useGetCategoriesQuery,
	useDeleteCategoryMutation,
} from '../store/api/categoriesApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import CategoryFormModal from '../components/CategoryFormModal';

const CategoriesPage: React.FC = () => {
	const { data: categories = [], isLoading } = useGetCategoriesQuery();
	const [deleteCategory] = useDeleteCategoryMutation();

	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState<Category | null>(null);
	const [search, setSearch] = useState('');

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		if (!q) return categories;
		return categories.filter((c) =>
			(c.nom || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
		);
	}, [categories, search]);

	const handleAdd = () => {
		setEditingCategory(null);
		setIsModalOpen(true);
	};

	const handleEdit = (cat: Category) => {
		setEditingCategory(cat);
		setIsModalOpen(true);
	};

	const handleDelete = async (id: number) => {
		const result = await showConfirmation(
			'Suppression définitive',
			'Voulez-vous vraiment supprimer cette catégorie ? Cette action est irréversible.',
			'Oui, supprimer',
			'Annuler'
		);
		if (!result.isConfirmed) return;
		try {
			await deleteCategory({ id }).unwrap();
			showSuccess('Catégorie supprimée');
		} catch (e: any) {
			showError(e?.data?.message || e?.message || 'Erreur lors de la suppression');
		}
	};

	return (
		<div className="p-6">
			<div className="flex justify-between items-center mb-6">
				<div className="flex items-center gap-3">
					<Tags className="text-purple-600" size={28} />
					<h1 className="text-2xl font-bold text-gray-900">Catégories</h1>
				</div>
				<button
					onClick={handleAdd}
					className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
				>
					<Plus size={18} /> Nouvelle catégorie
				</button>
			</div>

			<div className="mb-6">
				<div className="relative max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
					<input
						type="text"
						placeholder="Rechercher par nom ou description..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
			</div>

			<div className="bg-white rounded-lg shadow overflow-hidden">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
											{isLoading && (
												<tr>
													<td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">Chargement...</td>
												</tr>
											)}
											{!isLoading && filtered.length === 0 && (
												<tr>
													<td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">Aucune catégorie</td>
												</tr>
											)}
											{!isLoading && filtered.length > 0 && (
								filtered.map((c) => (
									<tr key={c.id} className="hover:bg-gray-50">
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">{c.nom}</div>
										</td>
										<td className="px-6 py-4">
											<div className="text-sm text-gray-700">{c.description || '-'}</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
											<div className="flex gap-2">
												<button
													onClick={() => handleEdit(c)}
													className="text-blue-600 hover:text-blue-900"
													title="Modifier"
												>
													<Edit size={16} />
												</button>
												{!(String(c.nom).toUpperCase() === 'UNCATEGORIZED' || c.id === 1) && (
													<button
														onClick={() => handleDelete(c.id)}
														className="text-red-600 hover:text-red-900"
														title="Supprimer"
													>
														<Trash2 size={16} />
													</button>
												)}
											</div>
										</td>
									</tr>
												))
											)}
						</tbody>
					</table>
				</div>
			</div>

			<CategoryFormModal
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				initialValues={editingCategory || undefined}
			onSaved={(cat: Category) => {
					setIsModalOpen(false);
					setEditingCategory(null);
					showSuccess(`Catégorie ${editingCategory ? 'modifiée' : 'créée'}: ${cat.nom}`);
				}}
			/>
		</div>
	);
};

export default CategoriesPage;

