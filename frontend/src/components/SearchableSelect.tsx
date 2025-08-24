import React, { useState, useRef, useEffect } from 'react';

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
  autoOpenOnFocus?: boolean;
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
  autoOpenOnFocus = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(50);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastOpenAtRef = useRef<number>(0);

  // Multi-word search: every token must be contained in the label (order-independent)
  const norm = (s: string) => s.toLowerCase();
  const tokens = norm(searchTerm).split(/\s+/).filter(Boolean);
  const matchLabel = (label: string) => {
    const L = norm(label);
    if (tokens.length === 0) return true;
    return tokens.every((t) => L.includes(t));
  };
  const allMatches = options.filter((o) => matchLabel(o.label));
  const filteredOptions = allMatches.slice(0, displayCount);
  const hasMoreItems = allMatches.length > displayCount;
  const selectedOption = options.find(o => o.value === value);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        // reset highlight on open
        setHighlightIndex(filteredOptions.length > 0 ? 0 : -1);
      }, 0);
    }
  }, [isOpen, filteredOptions.length]);

  return (
    <div className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white disabled:bg-gray-100 min-h-[38px] flex items-center justify-between"
        onClick={(ev) => {
          if (disabled) return;
          // If we just auto-opened on focus, ignore the immediate click that may arrive next
          const now = Date.now();
          if (isOpen) {
            // Only allow close if not within the debounce window
            if (now - lastOpenAtRef.current < 120) {
              ev.stopPropagation();
              return;
            }
            setIsOpen(false);
          } else {
            setIsOpen(true);
            lastOpenAtRef.current = now;
          }
        }}
        onFocus={() => { 
          if (!disabled && autoOpenOnFocus) {
            setTimeout(() => {
              setIsOpen(true);
              lastOpenAtRef.current = Date.now();
            }, 10);
          }
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          // Open on typing, Enter, Space or ArrowDown
          const openKeys = ['Enter', ' ', 'ArrowDown'];
          const isChar = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
          if (!isOpen && (openKeys.includes(e.key) || isChar)) {
            setIsOpen(true);
            lastOpenAtRef.current = Date.now();
            if (isChar) setSearchTerm((prev) => prev + e.key);
            e.preventDefault();
            e.stopPropagation();
          }
        }}
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
              onChange={(e) => { 
                setSearchTerm(e.target.value); 
                setDisplayCount(50); 
                setHighlightIndex(0);
              }}
              onKeyDown={(e) => {
                // Prevent the parent form's arrow navigation and Enter submit while searching
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.preventDefault();
                }
                
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  e.stopPropagation();
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightIndex((i) => Math.min((i < 0 ? 0 : i) + 1, filteredOptions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightIndex((i) => Math.max((i < 0 ? 0 : i) - 1, 0));
                } else if (e.key === 'Enter') {
                  if (highlightIndex >= 0 && filteredOptions[highlightIndex]) {
                    const opt = filteredOptions[highlightIndex];
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchTerm('');
                    setHighlightIndex(-1);
                    // Prevent the form-level Enter handler from firing
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }
              }}
              ref={searchInputRef}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {searchTerm.trim().length < 2 && (
              <div className="p-3 text-sm text-gray-500 text-center">
                <div className="mb-2">Tapez au moins 2 caractères pour rechercher</div>
                <div className="text-xs text-gray-400">{options.length} éléments disponibles</div>
              </div>
            )}
            {searchTerm.trim().length >= 2 && filteredOptions.length === 0 && (
              <div className="p-2 text-sm text-gray-500">Aucun résultat trouvé</div>
            )}
            {searchTerm.trim().length >= 2 && filteredOptions.length > 0 && (
              <>
                {filteredOptions.map((option, idx) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`w-full px-3 py-2 text-left hover:bg-gray-100 text-sm border-b border-gray-100 last:border-b-0 overflow-hidden ${idx === highlightIndex ? 'bg-blue-50' : ''}`}
                    onClick={(ev) => { 
                      ev.stopPropagation(); 
                      onChange(option.value); 
                      setIsOpen(false); 
                      setSearchTerm(''); 
                      setHighlightIndex(-1);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        ev.stopPropagation();
                        onChange(option.value);
                        setIsOpen(false);
                        setSearchTerm('');
                        setHighlightIndex(-1);
                      }
                    }}
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
                    Charger plus... ({filteredOptions.length} sur {allMatches.length})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <button type="button" tabIndex={-1} aria-hidden className="fixed inset-0 z-0" aria-label="Fermer la liste" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
};export default SearchableSelect;
