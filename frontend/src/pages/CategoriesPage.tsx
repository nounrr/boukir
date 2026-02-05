import React, { useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Search, Tags, FolderTree } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Category } from '../types';
import {
	useGetCategoriesQuery,
	useDeleteCategoryMutation,
} from '../store/api/categoriesApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import CategoryFormModal from '../components/CategoryFormModal';
import { toBackendUrl } from '../utils/url';

const CategoriesPage: React.FC = () => {
	const { data: categories = [], isLoading } = useGetCategoriesQuery();
	const [deleteCategory] = useDeleteCategoryMutation();

	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState<Category | null>(null);
	const [search, setSearch] = useState('');
	const [hoverPreview, setHoverPreview] = useState<null | {
		url: string;
		x: number;
		y: number;
		alt: string;
	}>(null);

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		if (!q) return categories;
		return categories.filter((c) =>
			(c.nom || '').toLowerCase().includes(q) ||
			(c.nom_ar || '').toLowerCase().includes(q) ||
			(c.nom_en || '').toLowerCase().includes(q) ||
			(c.nom_zh || '').toLowerCase().includes(q) ||
			(c.description || '').toLowerCase().includes(q)
		);
	}, [categories, search]);

	const handleAdd = () => {
		setEditingCategory(null);
		setIsModalOpen(true);
	};

	const getParentName = (parentId: number | null | undefined) => {
		if (!parentId) return '-';
		const parent = categories.find(c => c.id === parentId);
		return parent ? parent.nom : 'Inconnu';
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
			{/* Hover image preview (fixed overlay so it isn't clipped by table overflow) */}
			{hoverPreview?.url && typeof window !== 'undefined' && (() => {
				const maxW = 420;
				const maxH = 320;
				const pad = 16;
				const left = Math.max(
					pad,
					Math.min(hoverPreview.x + 18, window.innerWidth - maxW - pad)
				);
				const top = Math.max(
					pad,
					Math.min(hoverPreview.y + 18, window.innerHeight - maxH - pad)
				);

				return (
					<div
						className="fixed z-[9999] pointer-events-none"
						style={{ left, top, maxWidth: maxW, maxHeight: maxH }}
					>
						<div className="w-fit h-fit max-w-[420px] max-h-[320px] rounded-lg border border-gray-200 bg-white shadow-2xl overflow-hidden p-2">
							<img
								src={hoverPreview.url}
								alt={hoverPreview.alt}
								className="block max-w-full max-h-[304px] object-contain bg-white"
							/>
						</div>
					</div>
				);
			})()}

			<div className="flex justify-between items-center mb-6">
				<div className="flex items-center gap-3">
					<Tags className="text-purple-600" size={28} />
					<h1 className="text-2xl font-bold text-gray-900">Catégories</h1>
				</div>
				<div className="flex gap-2">
					<Link
						to="/category-management"
						className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md"
					>
						<FolderTree size={18} /> Organiser les catégories
					</Link>
					<button
						onClick={handleAdd}
						className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
					>
						<Plus size={18} /> Nouvelle catégorie
					</button>
				</div>
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
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
											{isLoading && (
												<tr>
													<td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">Chargement...</td>
												</tr>
											)}
											{!isLoading && filtered.length === 0 && (
												<tr>
													<td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">Aucune catégorie</td>
												</tr>
											)}
											{!isLoading && filtered.length > 0 && (
								filtered.map((c) => (
									<tr key={c.id} className="hover:bg-gray-50">
										<td className="px-6 py-4 whitespace-nowrap">
											{c.image_url ? (
												<div
													className="inline-block"
													onMouseEnter={(e) => {
														setHoverPreview({
															url: toBackendUrl(c.image_url),
															x: e.clientX,
															y: e.clientY,
															alt: String(c.nom ?? 'Image catégorie'),
														});
													}}
													onMouseMove={(e) => {
														setHoverPreview((prev) => {
															if (!prev) return prev;
															const nextUrl = toBackendUrl(c.image_url);
															if (prev.url !== nextUrl) return prev;
															return { ...prev, x: e.clientX, y: e.clientY };
														});
													}}
													onMouseLeave={() => setHoverPreview(null)}
												>
													<img
														src={toBackendUrl(c.image_url)}
														alt={c.nom}
														className="h-10 w-10 object-cover rounded"
													/>
												</div>
											) : (
												<div className="h-10 w-10 bg-gray-200 rounded" />
											)}
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">{c.nom}</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm text-gray-500">{getParentName(c.parent_id)}</div>
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

