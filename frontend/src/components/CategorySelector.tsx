import React, { useState, useRef } from 'react';
import { X, GripVertical, Plus } from 'lucide-react';

interface CategorySelectorProps {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  categories: { id: number; nom: string; level: number }[];
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  selectedIds,
  onChange,
  categories,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const selectedCategories = selectedIds
    .map(id => categories.find(c => c.id === id))
    .filter((c): c is { id: number; nom: string; level: number } => !!c);

  const availableCategories = categories.filter(c => !selectedIds.includes(c.id));

  const handleAdd = (id: number) => {
    onChange([...selectedIds, id]);
    setIsDropdownOpen(false);
  };

  const handleRemove = (id: number) => {
    onChange(selectedIds.filter(catId => catId !== id));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = "move";
    // Optional: set drag image
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    dragOverItem.current = index;
    e.preventDefault();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dragIndex = dragItem.current;
    const dropIndex = dragOverItem.current;

    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      const newSelectedIds = [...selectedIds];
      const draggedItemContent = newSelectedIds[dragIndex];
      newSelectedIds.splice(dragIndex, 1);
      newSelectedIds.splice(dropIndex, 0, draggedItemContent);
      onChange(newSelectedIds);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-gray-300 rounded-md bg-gray-50">
        {selectedCategories.length === 0 && (
          <span className="text-gray-400 text-sm self-center">Aucune catégorie sélectionnée</span>
        )}
        {selectedCategories.map((cat, index) => (
          <div
            key={cat.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm cursor-move hover:border-blue-300 transition-colors select-none"
          >
            <GripVertical size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{cat.nom}</span>
            <button
              type="button"
              onClick={() => handleRemove(cat.id)}
              className="text-gray-400 hover:text-red-500 focus:outline-none"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus size={16} />
          Ajouter une catégorie
        </button>

        {isDropdownOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsDropdownOpen(false)}
            />
            <div className="absolute top-full left-0 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-50">
              {availableCategories.length === 0 ? (
                <div className="p-2 text-sm text-gray-500">Toutes les catégories sont sélectionnées</div>
              ) : (
                availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleAdd(cat.id)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                  >
                    {'\u00A0'.repeat(cat.level * 4)}{cat.nom}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Glissez-déposez les étiquettes pour changer l'ordre d'affichage.
      </p>
    </div>
  );
};
