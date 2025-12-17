import React, { useMemo, useState, useCallback } from 'react';
import { Plus, Edit, Trash2, MoveVertical, ChevronDown, ChevronRight } from 'lucide-react';
import type { Category } from '../types';
import { useCreateCategoryMutation, useDeleteCategoryMutation, useGetCategoriesQuery, useUpdateCategoryMutation } from '../store/api/categoriesApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

type TreeNode = Category & { children: TreeNode[] };

const buildTree = (items: Category[]): TreeNode[] => {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];
  for (const c of items) map.set(c.id, { ...c, children: [] });
  for (const c of items) {
    const node = map.get(c.id)!;
    if (c.parent_id) {
      const parent = map.get(c.parent_id);
      if (parent) parent.children.push(node); else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
};

const collectDescendants = (node: TreeNode, set: Set<number>) => {
  set.add(node.id);
  for (const ch of node.children) collectDescendants(ch, set);
};

export const CategoryTreeManager: React.FC<{ search?: string }> = ({ search = '' }) => {
  const { data: categories = [], isLoading } = useGetCategoriesQuery();
  const [createCategory] = useCreateCategoryMutation();
  const [updateCategory] = useUpdateCategoryMutation();
  const [deleteCategory] = useDeleteCategoryMutation();

  const tree = useMemo(() => buildTree(categories), [categories]);
  const nodeIndex = useMemo(() => {
    const idx = new Map<number, TreeNode>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) { idx.set(n.id, n); if (n.children.length) walk(n.children); }
    };
    walk(tree);
    return idx;
  }, [tree]);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggle = (id: number) => setExpanded(s => ({ ...s, [id]: !s[id] }));

  const onDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleDropOn = async (targetId: number | null, e: React.DragEvent) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    const draggedId = Number(text);
    if (!draggedId || draggedId === targetId) return;
    // Prevent cycles
    if (targetId) {
      const target = nodeIndex.get(targetId);
      const dragged = nodeIndex.get(draggedId);
      if (target && dragged) {
        const desc = new Set<number>();
        collectDescendants(dragged, desc);
        if (desc.has(targetId)) {
          showError("Impossible: le parent choisi est un descendant");
          return;
        }
      }
    }
    try {
      await updateCategory({ id: draggedId, parent_id: targetId }).unwrap();
      showSuccess('Catégorie déplacée');
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Erreur de déplacement');
    }
  };

  const [showBatch, setShowBatch] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchParent, setBatchParent] = useState<number | ''>('');
  const allForSelect = useMemo(() => [{ id: 0, nom: 'Racine' } as any].concat(categories), [categories]);

  const handleBatchCreate = async () => {
    const names = batchText.split('\n').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) { showError('Entrez au moins un nom'); return; }
    const parent_id = batchParent === '' || batchParent === 0 ? null : Number(batchParent);
    try {
      for (const nom of names) {
        await createCategory({ nom, parent_id }).unwrap();
      }
      setBatchText('');
      showSuccess(`${names.length} catégories créées`);
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Erreur lors de la création en lot');
    }
  };

  const handleDelete = async (id: number) => {
    const cat = categories.find(c => c.id === id);
    if (cat && (String(cat.nom).toUpperCase() === 'UNCATEGORIZED' || cat.id === 1)) {
      showError('Cette catégorie est protégée et ne peut pas être supprimée');
      return;
    }
    const result = await showConfirmation('Suppression', 'Supprimer cette catégorie et ses sous-catégories ?', 'Supprimer', 'Annuler');
    if (!result.isConfirmed) return;
    try {
      await deleteCategory({ id }).unwrap();
      showSuccess('Catégorie supprimée');
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Erreur de suppression');
    }
  };

  const [editing, setEditing] = useState<{ id: number, nom: string } | null>(null);
  const startEdit = (node: TreeNode) => setEditing({ id: node.id, nom: node.nom });
  const commitEdit = async () => {
    if (!editing) return;
    try {
      await updateCategory({ id: editing.id, nom: editing.nom }).unwrap();
      setEditing(null);
      showSuccess('Catégorie mise à jour');
    } catch (e: any) {
      showError(e?.data?.message || e?.message || 'Erreur de mise à jour');
    }
  };

  const renderNode = useCallback((node: TreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded[node.id] ?? true;
    return (
      <div key={node.id} className="ml-2">
        <div
          className="flex items-center gap-2 py-1"
          onDragOver={onDragOver}
          onDrop={(e) => handleDropOn(node.id, e)}
        >
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="w-5 h-5 flex items-center justify-center text-gray-500"
            aria-label={isOpen ? 'Réduire' : 'Développer'}
          >
            {hasChildren ? (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="inline-block w-3" />}
          </button>
          <div
            draggable
            onDragStart={(e) => onDragStart(e, node.id)}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-300 bg-white shadow-sm hover:shadow cursor-move"
            title="Glisser pour reclasser"
          >
            <MoveVertical size={14} className="text-gray-400" />
            {editing?.id === node.id ? (
              <input
                value={editing.nom}
                onChange={(e) => setEditing({ id: node.id, nom: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                className="px-1 py-0.5 border rounded text-sm"
                autoFocus
              />
            ) : (
              <span className="text-sm font-medium">{node.nom}</span>
            )}
            {editing?.id === node.id ? (
              <button onClick={commitEdit} className="text-blue-600 text-xs">Enregistrer</button>
            ) : (
              <>
                <button onClick={() => startEdit(node)} className="text-blue-600 hover:text-blue-800" title="Modifier"><Edit size={14} /></button>
                <button onClick={() => handleDelete(node.id)} className="text-red-600 hover:text-red-800" title="Supprimer"><Trash2 size={14} /></button>
                <button onClick={() => setShowBatch(true)} className="text-green-600 hover:text-green-800" title="Ajouter des sous-catégories"><Plus size={14} /></button>
              </>
            )}
          </div>
        </div>
        {hasChildren && isOpen && (
          <div className="ml-6 border-l border-gray-200 pl-3">
            {node.children
              .sort((a, b) => String(a.nom).localeCompare(String(b.nom)))
              .map((ch) => renderNode(ch, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [expanded, editing]);

  // Filter tree by search (keeps parents of matches)
  const searchLc = search.trim().toLowerCase();
  const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
    if (!searchLc) return nodes;
    const res: TreeNode[] = [];
    for (const n of nodes) {
      const children = filterNodes(n.children);
      const selfMatch = String(n.nom || '').toLowerCase().includes(searchLc) || String(n.description || '').toLowerCase().includes(searchLc);
      if (selfMatch || children.length) {
        res.push({ ...n, children });
      }
    }
    return res;
  };
  const filteredTree = useMemo(() => filterNodes(tree), [tree, searchLc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Arborescence des catégories</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBatch((s) => !s)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50">
            <Plus size={16} /> Créer en lot
          </button>
          <div
            className="px-3 py-1.5 rounded-md border text-sm text-gray-600"
            onDragOver={onDragOver}
            onDrop={(e) => handleDropOn(null, e)}
            title="Déposer ici pour mettre à la racine"
          >
            Déposer ici pour Racine
          </div>
        </div>
      </div>

      {showBatch && (
        <div className="p-4 border rounded-lg bg-gray-50 space-y-3">
          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-700">Parent:</label>
            <select value={batchParent} onChange={(e) => setBatchParent(e.target.value === '' ? '' : Number(e.target.value))} className="px-2 py-1 border rounded">
              <option value="">Aucun (Racine)</option>
              {allForSelect.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <textarea
            rows={4}
            placeholder={"Une catégorie par ligne\nEx:\nCiment\nPeinture\nTuyaux"}
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
          />
          <div className="flex justify-end">
            <button onClick={handleBatchCreate} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Créer</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500">Chargement...</div>
      ) : filteredTree.length === 0 ? (
        <div className="text-sm text-gray-500">Aucun résultat</div>
      ) : (
        <div className="rounded-lg border p-3">
          {filteredTree
            .sort((a, b) => String(a.nom).localeCompare(String(b.nom)))
            .map((n) => renderNode(n, 0))}
        </div>
      )}
    </div>
  );
};

export default CategoryTreeManager;
