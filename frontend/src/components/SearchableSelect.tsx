import React, { useState } from 'react';

interface Option { value: string; label: string; data?: any }

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  maxDisplayItems?: number;
  id?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  className = "",
  disabled = false,
  maxDisplayItems = 100,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(50);

  const filteredOptions = options
    .filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()))
    .slice(0, displayCount);

  const hasMoreItems = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())).length > displayCount;
  const selectedOption = options.find(o => o.value === value);

  return (
    <div className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white disabled:bg-gray-100 min-h-[38px] flex items-center justify-between"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={selectedOption ? selectedOption.label : placeholder}
      >
        <span className="truncate pr-2">{selectedOption ? selectedOption.label : placeholder}</span>
        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="6"/></svg>
      </button>

      {isOpen && !disabled && (
        <div className="relative z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b bg-gray-50">
            <input
              type="text"
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Rechercher... (minimum 2 caractères)"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setDisplayCount(50); }}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {searchTerm.length < 2 && (
              <div className="p-3 text-sm text-gray-500 text-center">
                <div className="mb-2">Tapez au moins 2 caractères pour rechercher</div>
                <div className="text-xs text-gray-400">{options.length} éléments disponibles</div>
              </div>
            )}
            {searchTerm.length >= 2 && filteredOptions.length === 0 && (
              <div className="p-2 text-sm text-gray-500">Aucun résultat trouvé</div>
            )}
            {searchTerm.length >= 2 && filteredOptions.length > 0 && (
              <>
                {filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 text-sm border-b border-gray-100 last:border-b-0 overflow-hidden"
                    onClick={() => { onChange(option.value); setIsOpen(false); setSearchTerm(''); }}
                    title={option.label}
                  >
                    <span className="block truncate">{option.label}</span>
                  </button>
                ))}
                {hasMoreItems && (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-center text-blue-600 hover:bg-blue-50 text-sm border-t"
                    onClick={() => setDisplayCount(prev => Math.min(prev + 50, maxDisplayItems))}
                  >
                    Charger plus... ({filteredOptions.length} sur {options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase())).length})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <button type="button" className="fixed inset-0 z-0" aria-label="Fermer la liste" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
};

export default SearchableSelect;
