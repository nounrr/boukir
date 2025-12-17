import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { Category } from '../types';

interface CategoryTreeSelectProps {
  categories: Category[];
  selectedId: number | null;
  onChange: (id: number) => void;
}

export const CategoryTreeSelect: React.FC<CategoryTreeSelectProps> = ({
  categories,
  selectedId,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Build tree structure
  const tree = useMemo(() => {
    const roots = categories.filter(c => !c.parent_id);
    const childrenMap = new Map<number, Category[]>();
    categories.forEach(c => {
      if (c.parent_id) {
        const list = childrenMap.get(c.parent_id) || [];
        list.push(c);
        childrenMap.set(c.parent_id, list);
      }
    });
    return { roots, childrenMap };
  }, [categories]);

  // Get selected category name
  const selectedCategory = categories.find(c => c.id === selectedId);

  // Filter categories by search term
  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categories;
    const term = searchTerm.toLowerCase();
    return categories.filter(c => 
      c.nom?.toLowerCase().includes(term)
    );
  }, [categories, searchTerm]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (catId: number) => {
    onChange(catId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(0);
    setSearchTerm('');
  };

  const renderCategoryTree = (cats: Category[], level: number = 0) => {
    return cats.map(cat => {
      const children = tree.childrenMap.get(cat.id) || [];
      const hasChildren = children.length > 0;
      const isDisabled = hasChildren;

      return (
        <div key={cat.id}>
          <button
            type="button"
            onClick={() => !isDisabled && handleSelect(cat.id)}
            disabled={isDisabled}
            className={`
              w-full text-left px-3 py-2 flex items-center gap-2 transition-colors
              ${isDisabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : 'hover:bg-blue-50 cursor-pointer'}
              ${selectedId === cat.id ? 'bg-blue-100 text-blue-700 font-medium' : ''}
            `}
            style={{ paddingLeft: `${level * 20 + 12}px` }}
          >
            {hasChildren && <ChevronRight className="w-3 h-3" />}
            {!hasChildren && <div className="w-3" />}
            <span className={hasChildren ? 'font-semibold' : ''}>
              {cat.nom}
              {hasChildren && <span className="text-xs ml-2 text-gray-500">(parente)</span>}
            </span>
          </button>
          {children.length > 0 && renderCategoryTree(children, level + 1)}
        </div>
      );
    });
  };

  const renderFilteredResults = () => {
    // Get parent names for context
    const getParentName = (catId: number): string => {
      const cat = categories.find(c => c.id === catId);
      if (!cat?.parent_id) return '';
      const parent = categories.find(c => c.id === cat.parent_id);
      return parent?.nom || '';
    };

    return filteredCategories
      .filter(cat => !tree.childrenMap.has(cat.id)) // Only show leaf categories (no children)
      .map(cat => {
        const parentName = getParentName(cat.id);
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleSelect(cat.id)}
            className={`
              w-full text-left px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors
              ${selectedId === cat.id ? 'bg-blue-100 text-blue-700 font-medium' : ''}
            `}
          >
            <div className="flex flex-col">
              <span className="text-gray-900">{cat.nom}</span>
              {parentName && (
                <span className="text-xs text-gray-500">dans {parentName}</span>
              )}
            </div>
          </button>
        );
      });
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Select Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-left flex items-center justify-between"
      >
        <span className={selectedCategory ? 'text-gray-900' : 'text-gray-500'}>
          {selectedCategory ? selectedCategory.nom : 'Sélectionner une catégorie'}
        </span>
        <div className="flex items-center gap-1">
          {selectedCategory && (
            <X
              className="w-4 h-4 text-gray-400 hover:text-gray-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-hidden flex flex-col">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher une catégorie..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Category List */}
          <div className="overflow-y-auto flex-1">
            {filteredCategories.length === 0 ? (
              <div className="p-4 text-center text-gray-500">Aucune catégorie trouvée</div>
            ) : searchTerm ? (
              // Show filtered results as flat list when searching
              renderFilteredResults()
            ) : (
              // Show full tree when not searching
              renderCategoryTree(tree.roots)
            )}
          </div>
        </div>
      )}
    </div>
  );
};
