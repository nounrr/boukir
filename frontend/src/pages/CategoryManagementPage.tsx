import React, { useMemo, useState } from 'react';
import { FolderTree, PlusCircle, Pencil, Trash, ChevronDown, ChevronRight, Search, ArrowLeft, AlertCircle, Package, GripVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Category } from '../types';
import {
	useGetCategoriesQuery,
	useCreateCategoryMutation,
	useUpdateCategoryMutation,
	useDeleteCategoryMutation,
	useLazyGetCategoryUsageQuery,
} from '../store/api/categoriesApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

const CategoryManagementPage: React.FC = () => {
	const { data: categories = [], isLoading } = useGetCategoriesQuery();
	const [createCategory] = useCreateCategoryMutation();
	const [updateCategory] = useUpdateCategoryMutation();
	const [deleteCategory] = useDeleteCategoryMutation();
	const [getUsage] = useLazyGetCategoryUsageQuery();

	const [search, setSearch] = useState('');
	const [expanded, setExpanded] = useState<Record<number, boolean>>({});
	const [editing, setEditing] = useState<{ id: number; nom: string } | null>(null);
	const [dragging, setDragging] = useState<number | null>(null);
	const [dragOver, setDragOver] = useState<{ id: number; position: 'before' | 'after' | 'inside' } | null>(null);

	// Create category state
	const [showCreate, setShowCreate] = useState<{ parentId: number | null } | null>(null);
	const [createName, setCreateName] = useState('');
	const [createDescription, setCreateDescription] = useState('');

	// Build hierarchy recursively
	const buildTree = (parentId: number | null): Category[] => {
		return categories
			.filter(cat => cat.parent_id === parentId)
			.sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')))
			.map(cat => cat);
	};

	const hierarchy = useMemo(() => buildTree(null), [categories]);

	// Filter hierarchy by search
	const filteredCategories = useMemo(() => {
		if (!search) return categories;
		const q = search.toLowerCase();
		return categories.filter((cat) =>
			String(cat.nom || '').toLowerCase().includes(q)
		);
	}, [categories, search]);

	const toggleExpand = (id: number) => {
		setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const expandAll = () => {
		const allExpanded: Record<number, boolean> = {};
		categories.forEach(cat => {
			if (categories.some(c => c.parent_id === cat.id)) {
				allExpanded[cat.id] = true;
			}
		});
		setExpanded(allExpanded);
	};

	const collapseAll = () => {
		setExpanded({});
	};

	const handleCreate = async () => {
		if (!createName.trim()) {
			showError('Le nom est requis');
			return;
		}
		try {
			await createCategory({
				nom: createName,
				description: createDescription || undefined,
				parent_id: showCreate?.parentId || null,
				created_by: 1,
			}).unwrap();
			setCreateName('');
			setCreateDescription('');
			setShowCreate(null);
			showSuccess('Catégorie créée avec succès');
		} catch (e: any) {
			showError(e?.data?.message || e?.message || 'Erreur lors de la création');
		}
	};

	const handleEdit = async (id: number, nom: string) => {
		try {
			await updateCategory({ id, nom, updated_by: 1 }).unwrap();
			setEditing(null);
			showSuccess('Catégorie modifiée');
		} catch (e: any) {
			showError(e?.data?.message || e?.message || 'Erreur lors de la modification');
		}
	};

	const handleDelete = async (id: number) => {
		try {
			const usageResult = await getUsage(id).unwrap();
			const { productCount, subcategoryCount, canDelete } = usageResult;

			if (!canDelete) {
				let message = 'Impossible de supprimer cette catégorie:\n';
				if (productCount > 0) message += `- ${productCount} produit(s) lié(s)\n`;
				if (subcategoryCount > 0) message += `- ${subcategoryCount} sous-catégorie(s)`;
				showError(message);
				return;
			}

			const confirmed = await showConfirmation(
				'Supprimer cette catégorie ?',
				'Cette action est irréversible'
			);
			if (!confirmed) return;

		await deleteCategory({ id }).unwrap();
			showSuccess('Catégorie supprimée');
		} catch (e: any) {
			showError(e?.data?.message || e?.message || 'Erreur lors de la suppression');
		}
	};

	// Drag & Drop handlers
	const handleDragStart = (e: React.DragEvent, id: number) => {
		e.stopPropagation();
		setDragging(id);
		e.dataTransfer.effectAllowed = 'move';
	};

	const handleDragEnd = () => {
		setDragging(null);
		setDragOver(null);
	};

	const handleDragOver = (e: React.DragEvent, targetId: number) => {
		e.preventDefault();
		e.stopPropagation();
		
		if (dragging === null || dragging === targetId) return;

		const rect = e.currentTarget.getBoundingClientRect();
		const mouseY = e.clientY - rect.top;
		const height = rect.height;

		let position: 'before' | 'after' | 'inside' = 'inside';
		
		if (mouseY < height * 0.25) {
			position = 'before';
		} else if (mouseY > height * 0.75) {
			position = 'after';
		} else {
			position = 'inside';
		}

		setDragOver({ id: targetId, position });
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.stopPropagation();
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		
		if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
			setDragOver(null);
		}
	};

	const handleDrop = async (e: React.DragEvent, targetId: number) => {
		e.preventDefault();
		e.stopPropagation();

		if (dragging === null || dragging === targetId) {
			setDragging(null);
			setDragOver(null);
			return;
		}

		const draggedCat = categories.find(c => c.id === dragging);
		const targetCat = categories.find(c => c.id === targetId);

		if (!draggedCat || !targetCat) {
			setDragging(null);
			setDragOver(null);
			return;
		}

		try {
			let newParentId: number | null = null;

			if (dragOver?.position === 'inside') {
				// Move inside target (become child)
				newParentId = targetId;
			} else {
				// Move before/after target (become sibling)
				newParentId = targetCat.parent_id || null;
			}

			// Update the dragged category
			await updateCategory({
				id: dragging,
				parent_id: newParentId,
				updated_by: 1,
			}).unwrap();

			showSuccess('Catégorie déplacée avec succès');
		} catch (e: any) {
			showError(e?.data?.message || e?.message || 'Erreur lors du déplacement');
		}

		setDragging(null);
		setDragOver(null);
	};

	// Render category row
	const renderCategory = (cat: Category, level: number = 0): React.ReactNode => {
		const children = buildTree(cat.id);
		const hasChildren = children.length > 0;
		const isExpanded = expanded[cat.id];
		const isEditing = editing?.id === cat.id;
		const isDragging = dragging === cat.id;
		const isDragOver = dragOver?.id === cat.id;

		const showSearch = search.trim() !== '';
		const isVisible = showSearch ? filteredCategories.some(c => c.id === cat.id) : true;

		if (!isVisible) return null;

		return (
			<div key={cat.id} className={isDragging ? 'opacity-50' : ''}>
				<div
					className={`
						group flex items-center gap-2 py-2 px-3 hover:bg-gray-50 border-l-4 transition-all
						${isDragOver && dragOver.position === 'inside' ? 'border-l-blue-500 bg-blue-50' : 'border-l-transparent'}
						${isDragOver && dragOver.position === 'before' ? 'border-t-2 border-t-blue-500' : ''}
						${isDragOver && dragOver.position === 'after' ? 'border-b-2 border-b-blue-500' : ''}
					`}
					draggable={!isEditing}
					onDragStart={(e) => handleDragStart(e, cat.id)}
					onDragEnd={handleDragEnd}
					onDragOver={(e) => handleDragOver(e, cat.id)}
					onDragLeave={handleDragLeave}
					onDrop={(e) => handleDrop(e, cat.id)}
					style={{ paddingLeft: `${level * 24 + 12}px` }}
				>
					{/* Drag handle */}
					<GripVertical className="w-4 h-4 text-gray-400 cursor-move opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />

					{/* Expand/collapse button */}
					{hasChildren ? (
						<button
							onClick={() => toggleExpand(cat.id)}
							className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
						>
							{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
						</button>
					) : (
						<div className="w-6" />
					)}

					{/* Icon */}
					{hasChildren ? (
						<FolderTree className="w-4 h-4 text-purple-600 flex-shrink-0" />
					) : (
						<Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
					)}

					{/* Name */}
					{isEditing ? (
						<input
							autoFocus
							className="flex-1 px-2 py-1 border rounded"
							value={editing.nom}
							onChange={(e) => setEditing({ ...editing, nom: e.target.value })}
							onBlur={() => {
								if (editing.nom.trim() && editing.nom !== cat.nom) {
									handleEdit(cat.id, editing.nom);
								} else {
									setEditing(null);
								}
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.currentTarget.blur();
								} else if (e.key === 'Escape') {
									setEditing(null);
								}
							}}
						/>
					) : (
						<span className="flex-1 font-medium text-gray-900">
							{cat.nom}
							{hasChildren && <span className="ml-2 text-xs text-gray-500">({children.length})</span>}
						</span>
					)}

					{/* Actions */}
					<div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
						<button
							onClick={() => setShowCreate({ parentId: cat.id })}
							className="p-2 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-700 rounded-lg transition-all hover:scale-110"
							title="Ajouter une sous-catégorie"
						>
							<PlusCircle className="w-4 h-4" />
						</button>
						<button
							onClick={() => setEditing({ id: cat.id, nom: cat.nom || '' })}
							className="p-2 hover:bg-blue-100 text-blue-600 hover:text-blue-700 rounded-lg transition-all hover:scale-110"
							title="Modifier"
						>
							<Pencil className="w-4 h-4" />
						</button>
						<button
							onClick={() => handleDelete(cat.id)}
							className="p-2 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-lg transition-all hover:scale-110"
							title="Supprimer"
						>
							<Trash className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Children */}
				{hasChildren && isExpanded && (
					<div>
						{children.map(child => renderCategory(child, level + 1))}
					</div>
				)}
			</div>
		);
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-gray-500">Chargement...</div>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-7xl mx-auto">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-3">
					<Link
						to="/categories"
						className="p-2 hover:bg-gray-100 rounded-full transition-colors"
					>
						<ArrowLeft className="w-5 h-5" />
					</Link>
					<div>
						<h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
							<FolderTree className="w-7 h-7 text-purple-600" />
							Organisation des Catégories
						</h1>
						<p className="text-sm text-gray-600 mt-1">
							Glissez-déposez pour organiser la hiérarchie des catégories (niveaux illimités)
						</p>
					</div>
				</div>
			</div>

			{/* Info box */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
				<AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
				<div className="text-sm text-blue-900">
					<p className="font-medium mb-1">Comment organiser vos catégories :</p>
					<ul className="list-disc list-inside space-y-1 ml-2">
						<li>Glissez une catégorie <strong>au milieu</strong> d'une autre pour en faire une sous-catégorie</li>
						<li>Glissez <strong>en haut ou en bas</strong> pour réordonner au même niveau</li>
						<li>Vous pouvez créer plusieurs niveaux de sous-catégories</li>
						<li>Les catégories avec produits ne peuvent pas être supprimées</li>
					</ul>
				</div>
			</div>

			{/* Search and controls */}
			<div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
				<div className="p-4 flex items-center gap-3">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							type="text"
							placeholder="Rechercher une catégorie..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
						/>
					</div>
					<button
						onClick={() => setShowCreate({ parentId: null })}
						className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all hover:shadow-lg flex items-center gap-2"
					>
						<PlusCircle className="w-5 h-5" />
						Nouvelle Catégorie
					</button>
					<button
						onClick={expandAll}
						className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
					>
						Tout Développer
					</button>
					<button
						onClick={collapseAll}
						className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
					>
						Tout Réduire
					</button>
				</div>
			</div>

			{/* Create form */}
			{showCreate && (
				<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
					<h3 className="font-semibold text-gray-900 mb-3">
						{showCreate.parentId ? 'Nouvelle Sous-catégorie' : 'Nouvelle Catégorie Principale'}
					</h3>
					<div className="space-y-3">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Nom*</label>
							<input
								autoFocus
								type="text"
								value={createName}
								onChange={(e) => setCreateName(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
								placeholder="Nom de la catégorie"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
							<textarea
								value={createDescription}
								onChange={(e) => setCreateDescription(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
								placeholder="Description (optionnelle)"
								rows={2}
							/>
						</div>
						<div className="flex items-center gap-2">
							<button
								onClick={handleCreate}
								className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
							>
								Créer
							</button>
							<button
								onClick={() => {
									setShowCreate(null);
									setCreateName('');
									setCreateDescription('');
								}}
								className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
							>
								Annuler
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Category tree */}
			<div className="bg-white rounded-lg shadow-sm border border-gray-200">
				{hierarchy.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<FolderTree className="w-12 h-12 mx-auto mb-3 text-gray-300" />
						<p>Aucune catégorie trouvée</p>
						<p className="text-sm mt-1">Créez votre première catégorie pour commencer</p>
					</div>
				) : (
					<div className="divide-y divide-gray-100">
						{hierarchy.map(cat => renderCategory(cat, 0))}
					</div>
				)}
			</div>
		</div>
	);
};

export default CategoryManagementPage;
