import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Formik, Form, Field, FieldArray, ErrorMessage } from 'formik';
import type { FormikProps } from 'formik';
import * as Yup from 'yup';
import { Plus, Trash2, Search, Printer } from 'lucide-react';
import { showSuccess, showError } from '../utils/notifications';
import { formatDateInputToMySQL, formatMySQLToDateTimeInput, getCurrentDateTimeInput } from '../utils/dateUtils';
import { useGetVehiculesQuery } from '../store/api/vehiculesApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import { useGetSortiesQuery } from '../store/api/sortiesApi';
import { useGetComptantQuery } from '../store/api/comptantApi';
import { useGetClientsQuery, useGetFournisseursQuery, useCreateContactMutation } from '../store/api/contactsApi';
import { useGetPaymentsQuery } from '../store/api/paymentsApi';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useCreateBonMutation, useUpdateBonMutation } from '../store/api/bonsApi';
import { useGetClientRemisesQuery, useGetRemiseItemsQuery, useCreateRemiseItemMutation } from '../store/api/remisesApi';
import { useAuth } from '../hooks/redux';
import type { Contact } from '../types';
import ProductFormModal from './ProductFormModal';
import ContactFormModal from './ContactFormModal';
import BonPrintModal from './BonPrintModal';

/* -------------------------- Select avec recherche -------------------------- */
interface SearchableSelectProps {
  options: { value: string; label: string; data?: any }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  maxDisplayItems?: number;
  autoOpenOnFocus?: boolean; // open dropdown when the control gains focus (for fast keyboard entry)
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, any>; // pass-through for focus/aria/data-attrs
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  maxDisplayItems = 100,
  autoOpenOnFocus = false,
  buttonProps,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(50);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Multi-word search: every token typed must be present in the label (order-independent)
  const norm = (s: string) => s.toLowerCase();
  const tokens = norm(searchTerm).split(/\s+/).filter(Boolean);
  const matchLabel = (label: string) => {
    const L = norm(label);
    if (tokens.length === 0) return true;
    return tokens.every((t) => L.includes(t));
  };

  const allMatches = options.filter((option) => matchLabel(option.label));
  const filteredOptions = allMatches.slice(0, displayCount);
  const hasMoreItems = allMatches.length > displayCount;

  const selectedOption = options.find((opt) => opt.value === value);

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
        type="button"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white disabled:bg-gray-100 min-h-[38px] flex items-center justify-between"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={selectedOption ? selectedOption.label : placeholder}
        onFocus={(e) => {
          buttonProps?.onFocus?.(e);
          if (!disabled && autoOpenOnFocus) setIsOpen(true);
        }}
        onKeyDown={(e) => {
          buttonProps?.onKeyDown?.(e);
          if (disabled) return;
          // Open on typing, Enter, Space or ArrowDown
          const openKeys = ['Enter', ' ', 'ArrowDown'];
          const isChar = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
          if (!isOpen && (openKeys.includes(e.key) || isChar)) {
            setIsOpen(true);
            if (isChar) setSearchTerm((prev) => prev + e.key);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }}
        {...buttonProps}
      >
        <span className="truncate pr-2">{selectedOption ? selectedOption.label : placeholder}</span>
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
              ref={searchInputRef}
              autoFocus
              onKeyDown={(e) => {
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
                    // Prevent the form-level Enter handler (which adds a row)
                    // from firing when selecting an option from the dropdown
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {searchTerm.trim().length >= 2 ? (
              filteredOptions.length === 0 ? (
                <div className="p-2 text-sm text-gray-500">Aucun résultat trouvé</div>
              ) : (
                <>
                  {filteredOptions.map((option, idx) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`w-full px-3 py-2 text-left hover:bg-gray-100 text-sm border-b border-gray-100 last:border-b-0 overflow-hidden ${idx === highlightIndex ? 'bg-blue-50' : ''}`}
                      onClick={(ev) => {
                        // Avoid bubbling to form handlers
                        ev.stopPropagation();
                        onChange(option.value);
                        setIsOpen(false);
                        setSearchTerm('');
                        setHighlightIndex(-1);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          // Prevent global Enter from adding a new line when choosing here
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
                      onClick={() => setDisplayCount((prev) => Math.min(prev + 50, maxDisplayItems))}
                    >
                      Charger plus... ({filteredOptions.length} sur {allMatches.length})
                    </button>
                  )}
                </>
              )
            ) : (
              <div className="p-3 text-sm text-gray-500 text-center">
                <div className="mb-2">Tapez au moins 2 caractères pour rechercher</div>
                <div className="text-xs text-gray-400">{options.length} éléments disponibles</div>
              </div>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
          aria-label="Fermer la liste"
        />
      )}
    </div>
  );
};

/* ---------------------------- Validation du bon ---------------------------- */
const bonValidationSchema = Yup.object({
  date_bon: Yup.string().required('Date du bon requise'),
  vehicule_id: Yup.number().nullable(),
  lieu_charge: Yup.string(),
  adresse_livraison: Yup.string(),
  client_id: Yup.number().when('type', ([type], schema) => {
    if (type === 'Sortie' || type === 'Avoir') return schema.required('Client requis');
    return schema.nullable();
  }),
  // Pour Comptant, on saisit un nom libre
  client_nom: Yup.string().when('type', ([type], schema) => {
    if (type === 'Comptant') return schema.trim();
    return schema.optional();
  }),
  fournisseur_id: Yup.number().when('type', ([type], schema) => {
    if (type === 'Commande' || type === 'AvoirFournisseur') return schema.required('Fournisseur requis');
    return schema.nullable();
  }),
  items: Yup.array().min(1, 'Au moins un produit requis'),
});

/* ------------------------------- Utilitaires ------------------------------- */
const makeRowId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/* --------------------------------- Composant -------------------------------- */
interface BonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'Devis' | 'Vehicule';
  initialValues?: any;
  onBonAdded?: (bon: any) => void;
}

const BonFormModal: React.FC<BonFormModalProps> = ({
  isOpen,
  onClose,
  currentTab,
  initialValues,
  onBonAdded,
}) => {
  const { user } = useAuth();
  const formikRef = useRef<FormikProps<any>>(null);
  // Container ref to detect when Enter is pressed within the products area
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  // Remises UI state
  const [showRemisePanel, setShowRemisePanel] = useState(false);
  const [selectedRemiseId, setSelectedRemiseId] = useState<number | ''>('');
  const { data: remiseClients = [] } = useGetClientRemisesQuery();
  const { data: remiseItems = [] } = useGetRemiseItemsQuery(
    (typeof selectedRemiseId === 'number' ? selectedRemiseId : (undefined as unknown as number)),
    { skip: !(typeof selectedRemiseId === 'number') }
  );

  // Raw input for per-line remise (unit discount), similar to qtyRaw/unitPriceRaw
  const [remiseRaw, setRemiseRaw] = useState<Record<number, string>>({});
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState<null | 'Client' | 'Fournisseur'>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [targetRowIndex, setTargetRowIndex] = useState<number | null>(null);

  // RTK Query hooks
  const { data: vehicules = [] } = useGetVehiculesQuery();
  const { data: products = [] } = useGetProductsQuery();
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const { data: sortiesHistory = [] } = useGetSortiesQuery(undefined);
  const { data: comptantHistory = [] } = useGetComptantQuery(undefined);
  // For cumulative balances
  const { data: commandesAll = [] } = useGetBonsByTypeQuery('Commande');
  const { data: avoirsClientAll = [] } = useGetBonsByTypeQuery('Avoir');
  const { data: avoirsFournisseurAll = [] } = useGetBonsByTypeQuery('AvoirFournisseur');
  const { data: payments = [] } = useGetPaymentsQuery();

  // Mutations
  const [createBon] = useCreateBonMutation();
  const [updateBonMutation] = useUpdateBonMutation();
  const [createRemiseItem] = useCreateRemiseItemMutation();
  const [createContact] = useCreateContactMutation();
  const [isDuplicating, setIsDuplicating] = useState(false);

  /* -------------------- Helpers décimaux pour prix_unitaire -------------------- */
  const normalizeDecimal = (s: string) => s.replace(/\s+/g, '').replace(',', '.');
  const isDecimalLike = (s: string) => /^[0-9]*[.,]?[0-9]*$/.test(s);
  const formatNumber = (n: number) => (isFinite(n) ? String(parseFloat((n || 0).toFixed(2))) : '0');

  // Saisie brute par ligne pour "prix_unitaire"
  const [unitPriceRaw, setUnitPriceRaw] = useState<Record<number, string>>({});
// 🆕 Saisie brute par ligne pour "quantite"
const [qtyRaw, setQtyRaw] = useState<Record<number, string>>({});
  /* ----------------------- Initialisation des valeurs ----------------------- */
  const getInitialValues = () => {
    if (initialValues) {
      const formatDateForInput = (dateStr: string) => {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        if (dateStr.includes('-') && dateStr.split('-').length === 3 && dateStr.split('-')[0].length === 4) {
          return dateStr.split('T')[0];
        }
        const date = new Date(dateStr);
        return !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      };

      const rawItems = Array.isArray(initialValues.items)
        ? initialValues.items
        : typeof initialValues.items === 'string'
        ? (() => {
            try {
              return JSON.parse(initialValues.items || '[]');
            } catch {
              return [];
            }
          })()
        : [];

      const normalizedItems = (rawItems || []).map((it: any) => {
        const findProductInCatalog = () => {
          try {
            if (!products || !Array.isArray(products)) return undefined;
            return products.find((p: any) => {
              const pid = String(p.id ?? p.product_id ?? '');
              const pref = String(p.reference ?? p.ref ?? p.id ?? '');
              const itPid = String(it.product_id ?? it.produit_id ?? it.product?.id ?? it.productId ?? '');
              const itPref = String(it.product_reference ?? it.reference ?? (it.product && it.product.reference) ?? '');
              if (itPid && pid && itPid === pid) return true;
              if (itPref && pref && itPref === pref) return true;
              return false;
            });
          } catch {
            return undefined;
          }
        };

        const productFound = findProductInCatalog();

        let prix_achat =
          Number(it.prix_achat ?? it.pa ?? it.prixA ?? it.product?.prix_achat ?? it.produit?.prix_achat ?? 0) || 0;
        let cout_revient =
          Number(
            it.cout_revient ??
              it.cout_rev ??
              it.cout ??
              it.product?.cout_revient ??
              it.produit?.cout_revient ??
              it.prix_achat ??
              prix_achat
          ) || 0;
        let prix_unitaire =
          Number(
            it.prix_unitaire ??
              it.prix_vente ??
              it.prix_vente_pourcentage ??
              it.product?.prix_vente ??
              it.produit?.prix_vente ??
              0
          ) || 0;

        const kg = Number(it.kg ?? it.kg_value ?? it.product?.kg ?? it.produit?.kg ?? 0) || 0;

        if (productFound) {
          try {
            if (!prix_achat || prix_achat === 0) {
              prix_achat = Number((productFound as any).prix_achat ?? (productFound as any).pa ?? 0) || prix_achat;
            }
            if (!cout_revient || cout_revient === 0) {
              cout_revient =
                Number((productFound as any).cout_revient ?? (productFound as any).cr ?? (productFound as any).cout ?? 0) ||
                cout_revient;
            }
            if (!prix_unitaire || prix_unitaire === 0) {
              prix_unitaire =
                Number((productFound as any).prix_vente ?? (productFound as any).prix_unitaire ?? (productFound as any).price ?? 0) ||
                prix_unitaire;
            }
            it.product_id = it.product_id ?? it.produit_id ?? it.product?.id ?? it.productId ?? productFound.id;
            it.product_reference =
              it.product_reference ??
              it.reference ??
              (it.product && it.product.reference) ??
              String((productFound as any).reference ?? (productFound as any).id ?? '');
            it.designation =
              it.designation ??
              it.product_designation ??
              it.product?.designation ??
              it.produit?.designation ??
              (productFound as any).designation ??
              it.designation;
          } catch {}
        }

        const quantite = Number(it.quantite ?? it.qty ?? 0) || 0;
        const total = Number(it.total ?? it.montant_ligne ?? quantite * prix_unitaire) || quantite * prix_unitaire;

        return {
          _rowId: it._rowId || makeRowId(), // id stable
          ...it,
          product_id: it.product_id ?? it.produit_id ?? it.productId ?? it.product?.id ?? it.produit?.id,
          product_reference:
            it.product_reference ??
            it.reference ??
            (it.product?.reference ?? it.produit?.reference) ??
            (it.product_id ? String(it.product_id) : ''),
          designation: it.designation ?? it.product_designation ?? it.product?.designation ?? it.produit?.designation ?? '',
          quantite,
          prix_achat,
          cout_revient,
          prix_unitaire,
          kg,
          total,
        };
      });

      return {
        ...initialValues,
        client_id: (initialValues.client_id || '').toString(),
        fournisseur_id: (initialValues.fournisseur_id || '').toString(),
        vehicule_id: (initialValues.vehicule_id || '').toString(),
        lieu_charge: initialValues.lieu_chargement || initialValues.lieu_charge || '',
        date_bon: formatMySQLToDateTimeInput(initialValues.date_creation || initialValues.date_bon || '') || getCurrentDateTimeInput(),
        items: normalizedItems,
        montant_ht: initialValues.montant_ht || 0,
        montant_total: initialValues.montant_total || 0,
        client_nom: initialValues.client_nom || '',
        client_adresse: initialValues.client_adresse || '',
        client_societe: initialValues.client_societe || initialValues.societe || '',
        fournisseur_nom: initialValues.fournisseur_nom || '',
        fournisseur_adresse: initialValues.fournisseur_adresse || '',
        fournisseur_societe: initialValues.fournisseur_societe || '',
        adresse_livraison: initialValues.adresse_livraison || initialValues.adresse_livraison || '',
        statut: initialValues.statut || 'En attente',
      };
    }

    return {
      type: currentTab,
      date_bon: getCurrentDateTimeInput(),
      vehicule_id: '',
      lieu_charge: '',
      date_validation: '',
      statut: 'En attente',
      client_id: '',
      client_nom: '',
      client_adresse: '',
      client_societe: '',
      fournisseur_id: '',
      fournisseur_nom: '',
      fournisseur_adresse: '',
      fournisseur_societe: '',
      adresse_livraison: '',
      montant_ht: 0,
      montant_total: 0,
      items: [
        {
          _rowId: makeRowId(), // id stable
          product_id: '',
          product_reference: '',
          designation: '',
          quantite: 0,
          prix_achat: 0,
          prix_unitaire: 0,
          cout_revient: 0,
          kg: 0,
          total: 0,
          unite: 'pièce',
        },
      ],
      is_transformed: false,
      created_by: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

  // Mémoïser les initial values pour éviter les resets Formik intempestifs
  const initialFormValues = useMemo(
    () => getInitialValues(),
    [currentTab, initialValues?.id] // ne PAS inclure products ici
  );

  // Seed la saisie brute quand initial values changent / modal ouvre
 useEffect(() => {
  const items = initialFormValues?.items || [];
  setUnitPriceRaw(() => {
    const next: Record<number, string> = {};
    items.forEach((it: any, idx: number) => {
      // Pour les commandes, utiliser prix_achat, sinon prix_unitaire
      const v = currentTab === 'Commande' ? it?.prix_achat : it?.prix_unitaire;
      next[idx] = v === undefined || v === null ? '' : String(v);
    });
    return next;
  });

  // 🆕 Seed des quantités
  setQtyRaw(() => {
    const next: Record<number, string> = {};
    items.forEach((it: any, idx: number) => {
      const q = it?.quantite;
      next[idx] = q === undefined || q === null ? '' : String(q);
    });
    return next;
  });

  // Seed des remises unitaires (si existantes)
  setRemiseRaw(() => {
    const next: Record<number, string> = {};
    items.forEach((it: any, idx: number) => {
      const v = it?.remise_montant;
      next[idx] = v === undefined || v === null ? '' : String(v);
    });
    return next;
  });
}, [initialFormValues]);

  // Focus manager for arrow navigation between cells
  const focusCell = (rowIndex: number, colKey: string) => {
    const el = document.querySelector(
      `[data-row="${rowIndex}"][data-col="${colKey}"]`
    ) as HTMLElement | null;
    if (el) {
      (el as any).focus?.();
    }
  };

  const getColOrder = () => {
    const currentType = formikRef.current?.values?.type as string | undefined;
    const base = ['product', 'qty', 'unit'] as const;
    return showRemisePanel && (currentType === 'Sortie' || currentType === 'Comptant')
      ? [...base, 'remise']
      : [...base];
  };

  const onCellKeyDown = (rowIndex: number, colKey: string) => (e: React.KeyboardEvent<any>) => {
    const cols = getColOrder();
    const idx = cols.indexOf(colKey as any);
    if (e.key === 'ArrowRight') {
      const nextCol = cols[Math.min(idx + 1, cols.length - 1)];
      focusCell(rowIndex, nextCol);
  e.preventDefault();
  e.stopPropagation();
    } else if (e.key === 'ArrowLeft') {
      const prevCol = cols[Math.max(idx - 1, 0)];
      focusCell(rowIndex, prevCol);
  e.preventDefault();
  e.stopPropagation();
    } else if (e.key === 'ArrowDown') {
      const nextRow = Math.min(rowIndex + 1, (formikRef.current?.values?.items?.length || 1) - 1);
      focusCell(nextRow, colKey);
  e.preventDefault();
  e.stopPropagation();
    } else if (e.key === 'ArrowUp') {
      const prevRow = Math.max(rowIndex - 1, 0);
      focusCell(prevRow, colKey);
  e.preventDefault();
  e.stopPropagation();
    }
  };

  // Global key handler: prevent Enter from submitting
  const handleFormKeyDown = (
    e: React.KeyboardEvent<HTMLFormElement>
  ) => {
    const target = e.target as HTMLElement | null;

    // Enter: submit the form (unless intercepted by inner controls like SearchableSelect)
    if (e.key === 'Enter') {
      const isTextarea = target && target.tagName === 'TEXTAREA';
      if (isTextarea) return; // let textarea handle Enter normally
      e.preventDefault();
      e.stopPropagation();
      formikRef.current?.submitForm();
      return;
    }

    // 3) Flèches gauche/droite: navigation globale précédent/suivant si curseur aux bords
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const formEl = e.currentTarget as HTMLFormElement;
      // Compute whether we should move focus
      let shouldMove = true;
      const t = target as any;
      const isInputOrTextarea = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (isInputOrTextarea && typeof t.selectionStart === 'number' && typeof t.selectionEnd === 'number') {
        const valueLength = (t.value ?? '').length as number;
        if (e.key === 'ArrowLeft') {
          shouldMove = t.selectionStart === 0 && t.selectionEnd === 0;
        } else {
          shouldMove = t.selectionStart === valueLength && t.selectionEnd === valueLength;
        }
      }
      if (!shouldMove) return; // laisser bouger le curseur dans le champ

      // collect focusables
      const focusableSelector = [
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');
      const focusables = Array.from(formEl.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((el) => el.offsetParent !== null || el.getAttribute('aria-hidden') !== 'true');
      const currentIndex = focusables.indexOf(target as HTMLElement);
      if (currentIndex === -1) return;
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      let nextIndex = currentIndex + delta;
      nextIndex = Math.max(0, Math.min(focusables.length - 1, nextIndex));
      const nextEl = focusables[nextIndex];
      if (nextEl) {
        e.preventDefault();
        nextEl.focus();
        // Try select all for inputs
        try {
          if ((nextEl as any).select) (nextEl as any).select();
        } catch {}
      }
    }
  };

  /* ------------------------------ Soumission ------------------------------ */
  /* ------------------------------ Soumission ------------------------------ */
const handleSubmit = async (values: any, { setSubmitting, setFieldError }: any) => {
  try {
    const montantTotal = values.items.reduce((sum: number, item: any, idx: number) => {
      const q =
        parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
      
      // Pour bon Commande, utiliser prix_achat; pour autres types, prix_unitaire
      const priceField = values.type === 'Commande' ? 'prix_achat' : 'prix_unitaire';
      const u =
        typeof item[priceField] === 'string'
          ? parseFloat(String(item[priceField]).replace(',', '.')) || 0
          : Number(item[priceField]) || 0;
      return sum + q * u;
    }, 0);

    const requestType = values.type;
    let vehiculeId: number | undefined = undefined;
    if (requestType !== 'Avoir' && requestType !== 'AvoirFournisseur' && values.vehicule_id) {
      vehiculeId = parseInt(values.vehicule_id);
    }

  const cleanBonData = {
      date_creation: formatDateInputToMySQL(values.date_bon), // Datetime-local inclut déjà l'heure
      vehicule_id: vehiculeId,
      lieu_chargement: values.lieu_charge || '',
      adresse_livraison: values.adresse_livraison || '',
      statut: values.statut || 'Brouillon',
      client_id: requestType === 'Comptant' ? undefined : (values.client_id ? parseInt(values.client_id) : undefined),
      client_nom: requestType === 'Comptant' ? (values.client_nom || null) : undefined,
      fournisseur_id: values.fournisseur_id ? parseInt(values.fournisseur_id) : undefined,
      montant_total: montantTotal,
      created_by: user?.id || 1,
      items: values.items.map((item: any, idx: number) => {
        const q =
          parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
        const pa =
          typeof item.prix_achat === 'string'
            ? parseFloat(String(item.prix_achat).replace(',', '.')) || 0
            : Number(item.prix_achat) || 0;
        const pu =
          typeof item.prix_unitaire === 'string'
            ? parseFloat(String(item.prix_unitaire).replace(',', '.')) || 0
            : Number(item.prix_unitaire) || 0;
        const rp =
          typeof item.remise_pourcentage === 'string'
            ? parseFloat(String(item.remise_pourcentage).replace(',', '.')) || 0
            : Number(item.remise_pourcentage) || 0;
        const rm =
          typeof item.remise_montant === 'string'
            ? parseFloat(String(item.remise_montant).replace(',', '.')) || 0
            : Number(item.remise_montant) || 0;
        return {
          product_id: parseInt(item.product_id),
          quantite: q,
          prix_achat: pa,
          prix_unitaire: pu,
          remise_pourcentage: rp,
          remise_montant: rm,
          // Pour bon Commande, utiliser prix_achat pour le total; pour autres types, prix_unitaire
          total: q * (values.type === 'Commande' ? pa : pu),
        };
      }),
    };

    if (initialValues) {
      await updateBonMutation({ id: initialValues.id, type: requestType, ...cleanBonData }).unwrap();
      showSuccess('Bon mis à jour avec succès');

      // Enregistrer/ajouter les remises pour un bon existant si un client remise est choisi
      if ((values.type === 'Sortie' || values.type === 'Comptant') && typeof selectedRemiseId === 'number') {
        const bonId = Number(initialValues.id || 0);
        if (bonId) {
          const promises = cleanBonData.items
            .filter((it: any) => Number(it.remise_montant || 0) > 0)
            .map((it: any) =>
              createRemiseItem({
                clientRemiseId: selectedRemiseId,
                data: {
                  product_id: it.product_id,
                  qte: it.quantite,
                  prix_remise: it.remise_montant,
                  bon_id: bonId,
                  bon_type: values.type,
                  statut: 'Validé',
                },
              }).unwrap().catch(() => null)
            );
          try { await Promise.all(promises); } catch {}
        }
      }
    } else {
      const created = await createBon({ type: requestType, ...cleanBonData }).unwrap();
      showSuccess(`${currentTab} créé avec succès`);

      // Enregistrer les remises appliquées dans item_remises si un client remise est sélectionné
      if ((values.type === 'Sortie' || values.type === 'Comptant') && typeof selectedRemiseId === 'number') {
        const bonId = Number(created?.id || 0);
        if (bonId) {
          const promises = cleanBonData.items
            .filter((it: any) => Number(it.remise_montant || 0) > 0)
            .map((it: any) =>
              createRemiseItem({
                clientRemiseId: selectedRemiseId,
                data: {
                  product_id: it.product_id,
                  qte: it.quantite,
                  prix_remise: it.remise_montant, // DH par unité
                  bon_id: bonId,
                  bon_type: values.type,
                  statut: 'Validé',
                },
              }).unwrap().catch(() => null)
            );
          try { await Promise.all(promises); } catch {}
        }
      }
    }

    onBonAdded && onBonAdded(cleanBonData);
    onClose();
  } catch (error: any) {
    console.error('Erreur lors de la soumission:', error);
    // Extraire les champs manquants renvoyés par l'API
    const missing: string[] = Array.isArray(error?.data?.missing) ? error.data.missing : [];
    if (missing.length) {
      // Mapper les noms backend -> labels/front
      const label = (f: string) => {
        switch (f) {
          case 'type': return 'Type';
          case 'date_creation': return 'Date du bon';
          case 'montant_total': return 'Montant total';
          case 'created_by': return 'Créé par';
          case 'statut': return 'Statut';
          default: return f;
        }
      };
      // Définir des erreurs ciblées pour les champs Formik correspondants
      if (missing.includes('date_creation')) {
        setFieldError?.('date_bon', 'Date du bon requise');
      }
      if (missing.includes('montant_total')) {
        setFieldError?.('items', 'Total manquant: ajoutez au moins un produit avec quantité et prix');
      }
      if (missing.includes('statut')) {
        setFieldError?.('statut', 'Statut requis');
      }
      const msg = `Champs requis manquants: ${missing.map(label).join(', ')}`;
      showError(msg);
    } else {
      showError(`Erreur: ${error?.data?.message || error.message || 'Une erreur est survenue'}`);
    }
  } finally {
    setSubmitting(false);
  }
};


  /* ------------------------- Utilitaires d'historique ------------------------- */
  const parseItems = (items: any): any[] => {
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const toTime = (d: any): number => {
    if (!d) return 0;
    const s = typeof d === 'string' ? d : String(d);
    const dt = new Date(s.includes('T') || s.includes('-') ? s : s.replace(/(\d{2})-(\d{2})-(\d{2,4})/, '20$3-$2-$1'));
    const t = dt.getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const getLastUnitPriceForClientProduct = (
    clientId: string | number | undefined,
    productId: string | number | undefined
  ): number | null => {
    if (!clientId || !productId) return null;
    const cid = String(clientId);
    const pid = String(productId);

    type HistItem = { prix_unitaire?: number; total?: number; quantite?: number };
    let bestPrice: number | null = null;
    let bestTime = -1;

    const scan = (bon: any, itemsField: any) => {
      const items = parseItems(itemsField);
      const bonClientId = String(bon.client_id ?? bon.contact_id ?? '');
      if (bonClientId !== cid) return;
      const bonTime = toTime(bon.date_creation || bon.date);
      for (const it of items as HistItem[]) {
        const itPid = String((it as any).product_id ?? (it as any).id ?? '');
        if (itPid !== pid) continue;
        const price = Number((it as any).prix_unitaire ?? (it as any).price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        if (bonTime > bestTime) {
          bestTime = bonTime;
          bestPrice = price;
        }
      }
    };

    for (const b of sortiesHistory as any[]) scan(b, (b as any).items);
    for (const b of comptantHistory as any[]) scan(b, (b as any).items);
    return bestPrice;
  };

  // ---------------- Solde cumulé (comme sur ContactsPage) -----------------
  const computeClientBalance = (clientId: string | null | undefined) => {
    if (!clientId) return null;
    const cidNum = Number(clientId);
    const contact = clients.find((c: any) => Number(c.id) === cidNum);
    // Align with Contacts page: start from DB solde (initial) for this contact
    const base = Number((contact as any)?.solde ?? 0) || 0;

    const sum = (arr: any[], pickId: 'client_id' | 'fournisseur_id' = 'client_id') =>
      (arr || []).reduce((s, b: any) => s + (Number(b?.montant_total ?? 0) || 0) * (Number(b?.[pickId]) === cidNum ? 1 : 0), 0);

    const ventes = sum(sortiesHistory as any[], 'client_id') + sum(comptantHistory as any[], 'client_id');
    const avoirs = sum(avoirsClientAll as any[], 'client_id');
    // Contacts page sums all payments by contact_id (no statut/type filtering)
    const pays = (payments as any[]).reduce((s, p: any) => {
      return s + (Number(p?.contact_id) === cidNum ? Number(p?.montant ?? p?.montant_total ?? 0) || 0 : 0);
    }, 0);

    // Formula consistent with Contacts: solde (DB) + ventes - avoirs - paiements
    return base + ventes - avoirs - pays;
  };

  // Helper: detailed breakdown for client balance (for debugging/logging)
  const getClientBalanceBreakdown = (clientId: string | null | undefined) => {
    if (!clientId) return null;
    const cidNum = Number(clientId);
    const contact = clients.find((c: any) => Number(c.id) === cidNum);
    const base = Number((contact as any)?.solde ?? 0) || 0;

    const sum = (arr: any[], pickId: 'client_id' | 'fournisseur_id' = 'client_id') =>
      (arr || []).reduce((s, b: any) => s + (Number(b?.montant_total ?? 0) || 0) * (Number(b?.[pickId]) === cidNum ? 1 : 0), 0);

    const sortiesSum = sum(sortiesHistory as any[], 'client_id');
    const comptantSum = sum(comptantHistory as any[], 'client_id');
    const ventes = sortiesSum + comptantSum;
    const avoirs = sum(avoirsClientAll as any[], 'client_id');
    const paymentsSum = (payments as any[]).reduce((s, p: any) => {
      return s + (Number(p?.contact_id) === cidNum ? Number(p?.montant ?? p?.montant_total ?? 0) || 0 : 0);
    }, 0);

    const total = base + ventes - avoirs - paymentsSum;
    return { base, sorties: sortiesSum, comptant: comptantSum, ventes, avoirs, payments: paymentsSum, total };
  };

  const computeFournisseurBalance = (fournisseurId: string | null | undefined) => {
    if (!fournisseurId) return null;
    const fidNum = Number(fournisseurId);
    const contact = fournisseurs.find((f: any) => Number(f.id) === fidNum);
    // Align with Contacts: start from DB solde
    const base = Number((contact as any)?.solde ?? 0) || 0;

    const sum = (arr: any[], pickId: 'client_id' | 'fournisseur_id' = 'fournisseur_id') =>
      (arr || []).reduce((s, b: any) => s + (Number(b?.montant_total ?? 0) || 0) * (Number(b?.[pickId]) === fidNum ? 1 : 0), 0);

    const achats = sum(commandesAll as any[], 'fournisseur_id');
    const avoirs = sum(avoirsFournisseurAll as any[], 'fournisseur_id');
    // Sum all payments by contact_id (no statut/type filtering)
    const pays = (payments as any[]).reduce((s, p: any) => {
      return s + (Number(p?.contact_id) === fidNum ? Number(p?.montant ?? p?.montant_total ?? 0) || 0 : 0);
    }, 0);

    // Fournisseur balance: initial + achats - avoirs - paiements
    return base + achats - avoirs - pays;
  };

  /* ------------------------------ Appliquer produit ------------------------------ */
  /* ------------------------------ Appliquer produit ------------------------------ */
const applyProductToRow = (rowIndex: number, product: any) => {
  if (!formikRef.current) return;
  const setFieldValue = formikRef.current.setFieldValue;
  const values = formikRef.current.values;

  const unit = Number(product.prix_vente || 0);
  const pa = Number(product.prix_achat || 0);
  const cr = Number(product.cout_revient || 0);
  const kg = Number(product.kg || 0);
  const q = Number(values.items?.[rowIndex]?.quantite || 0);

  // Pour bon Commande, utiliser prix_achat; pour autres types, prix_unitaire
  const priceForDisplay = values.type === 'Commande' ? pa : unit;
  const totalPrice = q * priceForDisplay;

  setFieldValue(`items.${rowIndex}.product_id`, product.id);
  setFieldValue(`items.${rowIndex}.product_reference`, String(product.reference ?? product.id));
  setFieldValue(`items.${rowIndex}.designation`, product.designation || '');
  setFieldValue(`items.${rowIndex}.prix_achat`, pa);
  setFieldValue(`items.${rowIndex}.cout_revient`, cr);
  setFieldValue(`items.${rowIndex}.prix_unitaire`, unit);
  setFieldValue(`items.${rowIndex}.kg`, kg);
  setFieldValue(`items.${rowIndex}.total`, totalPrice);

  // garder la saisie brute synchronisée avec le bon champ selon le type
  setUnitPriceRaw((prev) => ({ ...prev, [rowIndex]: String(priceForDisplay) }));
  setQtyRaw((prev) => ({ ...prev, [rowIndex]: prev[rowIndex] ?? '0' }));

  window.setTimeout(() => {
    const input = document.querySelector(
      `input[name="items.${rowIndex}.quantite"]`
    ) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }, 120);
};


  if (!isOpen) return null;

  /* ---------------------------------- Render --------------------------------- */
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-10xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{initialValues ? 'Modifier' : 'Créer'} un {currentTab}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <Formik
          initialValues={initialFormValues}
          enableReinitialize={true}
          validationSchema={bonValidationSchema}
          onSubmit={handleSubmit}
          innerRef={formikRef}
        >
          {({ values, isSubmitting, setFieldValue }) => (
            <Form
              className="space-y-4"
              onKeyDown={(e) => handleFormKeyDown(e)}
            >
              <div className="grid grid-cols-2 gap-4">

                {/* Date */}
                <div>
                  <label htmlFor="date_bon" className="block text-sm font-medium text-gray-700 mb-1">
                    Date et heure du bon
                  </label>
                  <Field type="datetime-local" id="date_bon" name="date_bon" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  <ErrorMessage name="date_bon" component="div" className="text-red-500 text-sm mt-1" />
                </div>

                {/* Véhicule */}
                {values.type !== 'Avoir' && values.type !== 'AvoirFournisseur' && (
                  <div>
                    <label htmlFor="vehicule_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Véhicule
                    </label>
                    <Field as="select" id="vehicule_id" name="vehicule_id" className="w-full px-3 py-2 border border-gray-300 rounded-md">
                      <option value="">-- Sélectionner un véhicule --</option>
                      {vehicules
                        .filter((v) => v.statut === 'Disponible' || v.statut === 'En service')
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nom} - {v.immatriculation} ({v.type_vehicule})
                          </option>
                        ))}
                    </Field>
                    <ErrorMessage name="vehicule_id" component="div" className="text-red-500 text-sm mt-1" />
                  </div>
                )}

                {/* Lieu / Adresse */}
                <div>
                  <label htmlFor="lieu_charge" className="block text-sm font-medium text-gray-700 mb-1">
                    Lieu de charge
                  </label>
                  <Field type="text" id="lieu_charge" name="lieu_charge" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Ex: Entrepôt Casablanca" />
                </div>
                <div>
                  <label htmlFor="adresse_livraison" className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse de livraison
                  </label>
                  <Field type="text" id="adresse_livraison" name="adresse_livraison" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Adresse complète de livraison" />
                </div>
              </div>

              {/* Client */}
              {(values.type === 'Sortie' || values.type === 'Devis' || values.type === 'Avoir') && (
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Client {(values.type === 'Sortie' || values.type === 'Avoir') ? '*' : '(optionnel)'}
                    </label>
                    <button
                      type="button"
                      className="text-blue-600 underline text-xs"
                      onClick={() => setIsContactModalOpen('Client')}
                    >
                      Nouveau client
                    </button>
                  </div>
                  <SearchableSelect
                    options={clients.map((c: Contact) => ({
                      value: c.id.toString(),
                      label: `${c.nom_complet} ${c.reference ? `(${c.reference})` : ''}`,
                      data: c,
                    }))}
                    value={values.client_id}
                    onChange={(clientId) => {
                      setFieldValue('client_id', clientId);
                      if (clientId) {
                        const c = clients.find((x: Contact) => x.id.toString() === clientId);
                        if (c) {
                          setFieldValue('client_nom', c.nom_complet);
                          setFieldValue('client_adresse', c.adresse || '');
                          setFieldValue('client_societe', (c as any).societe || '');
                          // Debug: log detailed breakdown of client balance calculation
                          const breakdown = getClientBalanceBreakdown(clientId);
                          if (breakdown) {
                            // Keep it compact and readable in console
                            console.groupCollapsed(`Solde cumulé (Client ${c.id} - ${c.nom_complet})`);
                            console.log('Formule: solde(DB) + ventes - avoirs - paiements');
                            console.table({
                              base_db: breakdown.base,
                              ventes_sorties: breakdown.sorties,
                              ventes_comptant: breakdown.comptant,
                              ventes_total: breakdown.ventes,
                              avoirs: breakdown.avoirs,
                              paiements: breakdown.payments,
                              total: breakdown.total,
                            });
                            console.groupEnd();
                          }
                        }
                      } else {
                        setFieldValue('client_nom', '');
                        setFieldValue('client_adresse', '');
                      }
                    }}
                    placeholder="Sélectionnez un client"
                    className="w-full"
                    maxDisplayItems={200}
                    autoOpenOnFocus
                  />
                  <ErrorMessage name="client_id" component="div" className="text-red-500 text-sm mt-1" />
                  {values.client_id && (
                    <div className="mt-2 p-2 bg-blue-50 rounded">
                      <span className="text-sm text-blue-700 font-medium">Solde cumulé: </span>
                      <span className="text-sm text-blue-800 font-semibold">
                        {(() => {
                          const solde = computeClientBalance(values.client_id);
                          return solde != null ? `${solde.toFixed(2)} DH` : '—';
                        })()}
                      </span>
                    </div>
                  )}
                  {values.client_adresse && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Adresse: </span>
                      <span className="text-sm">{values.client_adresse}</span>
                    </div>
                  )}
                  {values.client_societe && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Société: </span>
                      <span className="text-sm">{values.client_societe}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Client libre pour Comptant */}
              {values.type === 'Comptant' && (
                <div>
                  <label htmlFor="client_nom" className="block text-sm font-medium text-gray-700 mb-1">
                    Client (texte libre)
                  </label>
                  <Field
                    type="text"
                    id="client_nom"
                    name="client_nom"
                    placeholder="Saisir le nom du client"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Ce client ne sera pas ajouté à la page Contacts.
                  </div>
                </div>
              )}

              {/* Fournisseur */}
              {(values.type === 'Commande' || values.type === 'AvoirFournisseur') && (
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="fournisseur_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Fournisseur *
                    </label>
                    <button
                      type="button"
                      className="text-blue-600 underline text-xs"
                      onClick={() => setIsContactModalOpen('Fournisseur')}
                    >
                      Nouveau fournisseur
                    </button>
                  </div>
                  <SearchableSelect
                    options={fournisseurs.map((f: Contact) => ({
                      value: f.id.toString(),
                      label: `${f.nom_complet} ${f.reference ? `(${f.reference})` : ''}`,
                      data: f,
                    }))}
                    value={values.fournisseur_id}
                    onChange={(fournisseurId) => {
                      setFieldValue('fournisseur_id', fournisseurId);
                      if (fournisseurId) {
                        const f = fournisseurs.find((x: Contact) => x.id.toString() === fournisseurId);
                        if (f) {
                          setFieldValue('fournisseur_nom', f.nom_complet);
                          setFieldValue('fournisseur_adresse', f.adresse || '');
                          setFieldValue('fournisseur_societe', (f as any).societe || '');
                        }
                      } else {
                        setFieldValue('fournisseur_nom', '');
                        setFieldValue('fournisseur_adresse', '');
                      }
                    }}
                    placeholder="Sélectionnez un fournisseur"
                    className="w-full"
                    maxDisplayItems={200}
                    autoOpenOnFocus
                  />
                  <ErrorMessage name="fournisseur_id" component="div" className="text-red-500 text-sm mt-1" />
                  {values.fournisseur_id && (
                    <div className="mt-2 p-2 bg-blue-50 rounded">
                      <span className="text-sm text-blue-700 font-medium">Solde cumulé: </span>
                      <span className="text-sm text-blue-800 font-semibold">
                        {(() => {
                          const solde = computeFournisseurBalance(values.fournisseur_id);
                          return solde != null ? `${solde.toFixed(2)} DH` : '—';
                        })()}
                      </span>
                    </div>
                  )}
                  {values.fournisseur_adresse && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Adresse: </span>
                      <span className="text-sm">{values.fournisseur_adresse}</span>
                    </div>
                  )}
                  {values.fournisseur_societe && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Société: </span>
                      <span className="text-sm">{values.fournisseur_societe}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Produits */}
              <div className="mt-6" ref={itemsContainerRef}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-md font-medium">Produits</h3>
                  <div className="flex gap-2">
                    {(values.type === 'Sortie' || values.type === 'Comptant') && (
                      <button
                        type="button"
                        onClick={() => setShowRemisePanel((s) => !s)}
                        className="flex items-center text-purple-600 hover:text-purple-800"
                      >
                        <Plus size={16} className="mr-1" /> Appliquer remise
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const newItem = {
                          _rowId: makeRowId(),
                          product_id: '',
                          product_reference: '',
                          designation: '',
                          quantite: 0,
                          prix_achat: 0,
                          prix_unitaire: 0,
                          cout_revient: 0,
                          kg: 0,
                          total: 0,
                          unite: 'pièce',
                        };
                        setFieldValue('items', [...values.items, newItem]);
                        setUnitPriceRaw((prev) => ({ ...prev, [values.items.length]: '0' }));
                        setQtyRaw((prev) => ({ ...prev, [values.items.length]: '0' })); // ou [newIndex]

                        // Focus the new row's product selector and auto-open search
                        setTimeout(() => {
                          const idx = values.items.length; // new index after push
                          const btn = document.querySelector(
                            `[data-row="${idx}"][data-col="product"]`
                          ) as HTMLElement | null;
                          if (btn) (btn as any).focus?.();
                        }, 50);

                      }}
                      className="flex items-center text-blue-600 hover:text-blue-800"
                    >
                      <Plus size={16} className="mr-1" /> Ajouter ligne
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const current = formikRef.current?.values ?? { items: [] };
                        const emptyRow = {
                          _rowId: makeRowId(),
                          product_id: '',
                          product_reference: '',
                          designation: '',
                          quantite: 0,
                          prix_achat: 0,
                          prix_unitaire: 0,
                          cout_revient: 0,
                          kg: 0,
                          total: 0,
                          unite: 'pièce',
                        };

                        const rowIndex = current.items?.length ?? 0;
                        formikRef.current?.setFieldValue('items', [...(current.items ?? []), emptyRow]);
                        setUnitPriceRaw((prev) => ({ ...prev, [rowIndex]: '0' }));
                        setTargetRowIndex(rowIndex);
                        setIsProductModalOpen(true);
                      }}
                      className="flex items-center text-green-600 hover:text-green-800"
                    >
                      <Plus size={16} className="mr-1" /> Nouveau produit
                    </button>
                  </div>
                </div>

                {/* Remise panel */}
                {showRemisePanel && (values.type === 'Sortie' || values.type === 'Comptant') && (
                  <div className="mb-4 p-3 border rounded bg-purple-50">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-sm text-gray-700">Client Remise</label>
                      <div className="min-w-[280px]">
                        <SearchableSelect
                          options={(remiseClients || []).map((c: any) => ({
                            value: String(c.id),
                            // include name, CIN, phone in label for multi-word search
                            label: `${c.nom || ''}${c.cin ? ' ' + c.cin : ''}${c.phone ? ' ' + c.phone : ''}`.trim(),
                            data: c,
                          }))}
                          value={typeof selectedRemiseId === 'number' ? String(selectedRemiseId) : ''}
                          onChange={(v) => setSelectedRemiseId(v ? Number(v) : '')}
                          placeholder="Rechercher par nom, CIN ou téléphone"
                          className="w-[280px]"
                          autoOpenOnFocus
                        />
                      </div>
                      {(() => {
                        const c = typeof selectedRemiseId === 'number' ? remiseClients.find((x: any) => x.id === selectedRemiseId) : null;
                        return c ? (
                          <span className="text-sm text-gray-600">Total Remise (profil): {Number(c.total_remise || 0).toFixed(2)} DH</span>
                        ) : null;
                      })()}
                      <button
                        type="button"
                        disabled={!(typeof selectedRemiseId === 'number')}
                        onClick={() => {
                          if (!(typeof selectedRemiseId === 'number')) return;
                          // Build map product_id -> prix_remise
                          const map = new Map<number, number>();
                          (remiseItems || []).forEach((ri: any) => {
                            if (ri.product_id) map.set(Number(ri.product_id), Number(ri.prix_remise || 0));
                          });
                          // Apply to current items
                          values.items.forEach((row: any, idx: number) => {
                            const pid = Number(row.product_id || 0);
                            if (!pid) return;
                            if (map.has(pid)) {
                              const r = map.get(pid)!;
                              setFieldValue(`items.${idx}.remise_montant`, r);
                              setRemiseRaw((prev) => ({ ...prev, [idx]: String(r) }));
                            }
                          });
                        }}
                        className="px-3 py-1 bg-purple-600 text-white rounded disabled:opacity-50"
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <FieldArray name="items">
                    {({ remove }) => (
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[260px]">
                              Produit (Réf - Désignation)
                            </th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">
                              Qté
                            </th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">
                              SERIE
                            </th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">
                              {values.type === 'Commande' ? 'Prix d\'achat' : 'P. Unit.'}
                            </th>
                            {showRemisePanel && (values.type === 'Sortie' || values.type === 'Comptant') && (
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">
                                Remise (DH/u)
                              </th>
                            )}
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">
                              Total
                            </th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[50px]">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {values.items.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-4 text-center text-sm text-gray-500">
                                Aucun produit ajouté. Cliquez sur "Ajouter un produit" pour commencer.
                              </td>
                            </tr>
                          ) : (
                            values.items.map((row: any, index: number) => (
                              <tr key={row._rowId || `item-${index}`}>
                                {/* Produit combiné (Réf - Désignation) */}
                                <td className="px-1 py-2 w-[260px]">
                                  <SearchableSelect
                                    options={products.map((p: any) => ({
                                      value: String(p.id),
                                      label: `${String(p.reference ?? p.id)} - ${p.designation ?? ''}`.trim(),
                                      data: p,
                                    }))}
                                    value={String(values.items[index].product_id || '')}
                                    onChange={(productId) => {
                                      const product = products.find((p: any) => String(p.id) === productId);
                                      if (product) {
                                        setFieldValue(`items.${index}.product_id`, product.id);
                                        setFieldValue(
                                          `items.${index}.product_reference`,
                                          String(product.reference ?? product.id)
                                        );
                                        setFieldValue(`items.${index}.designation`, product.designation || '');
                                        setFieldValue(`items.${index}.prix_achat`, product.prix_achat || 0);
                                        setFieldValue(`items.${index}.cout_revient`, product.cout_revient || 0);
                                        const unit = product.prix_vente || 0;
                                        const pa = product.prix_achat || 0;
                                        setFieldValue(`items.${index}.prix_unitaire`, unit);
                                        // Pour bon Commande, utiliser prix_achat; pour autres types, prix_unitaire
                                        const priceForDisplay = values.type === 'Commande' ? pa : unit;
                                        setUnitPriceRaw((prev) => ({ ...prev, [index]: String(priceForDisplay) }));
                                        setFieldValue(`items.${index}.kg`, product.kg ?? 0);
                                        const q =
                                          parseFloat(
                                            normalizeDecimal(
                                              qtyRaw[index] ?? String(values.items[index].quantite ?? '')
                                            )
                                          ) || 0;
                                        setFieldValue(`items.${index}.total`, q * priceForDisplay);
                                        // After choosing product, focus qty
                                        setTimeout(() => focusCell(index, 'qty'), 0);
                                      }
                                    }}
                                    placeholder="Sélectionner produit"
                                    className="w-full"
                                    maxDisplayItems={300}
                                    autoOpenOnFocus
                                    buttonProps={{
                                      'data-row': index as any,
                                      'data-col': 'product' as any,
                                      onKeyDown: onCellKeyDown(index, 'product'),
                                    }}
                                  />
                                </td>


                                {/* Quantité */}
<td className="px-1 py-2 w-[80px]">
  <input
    type="text"
    inputMode="decimal"
    pattern="[0-9]*[.,]?[0-9]*"
    name={`items.${index}.quantite`}
    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
    value={qtyRaw[index] ?? ''}
    onChange={(e) => {
      const raw = e.target.value;
      if (!isDecimalLike(raw)) return;                 // réutilise ta fn existante
      setQtyRaw((prev) => ({ ...prev, [index]: raw }));

      const q = parseFloat(normalizeDecimal(raw)) || 0; // réutilise normalizeDecimal
      const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      setFieldValue(`items.${index}.total`, q * u);
    }}
    onFocus={(e) => {
      // Sélection rapide (sécurisé)
      const target = e.currentTarget;
      setTimeout(() => {
        try { target && typeof (target as any).select === 'function' && (target as any).select(); } catch {}
      }, 0);
      // Effacer si 0
      const current = qtyRaw[index];
      if (current === '0' || current === '0.00' || current === '0,00') {
        setQtyRaw((prev) => ({ ...prev, [index]: '' }));
      }
    }}
    onBlur={() => {
      const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? '')) || 0;
      setFieldValue(`items.${index}.quantite`, q);
      setQtyRaw((prev) => ({ ...prev, [index]: formatNumber(q) })); // même formateur que prix
      const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      setFieldValue(`items.${index}.total`, q * u);
    }}
  data-row={index}
  data-col="qty"
  onKeyDown={onCellKeyDown(index, 'qty')}
  />
</td>


                                {/* SERIE / Info rapide */}
                                <td className="px-1 py-2 text-sm text-gray-700">
                                  {`PA${values.items[index].prix_achat ?? 0}CR${
                                    values.items[index].cout_revient ?? 0
                                  }`}
                                </td>

                                {/* Prix unitaire / Prix d'achat selon le type */}
<td className="px-1 py-2 w-[90px]">
  <input
    type="text"
    inputMode="decimal"
    pattern="[0-9]*[.,]?[0-9]*"
    name={values.type === 'Commande' ? `items.${index}.prix_achat` : `items.${index}.prix_unitaire`}
    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
    value={unitPriceRaw[index] ?? ''}
    onChange={(e) => {
      const raw = e.target.value;
      if (!isDecimalLike(raw)) return;
      setUnitPriceRaw((prev) => ({ ...prev, [index]: raw }));

      const unit = parseFloat(normalizeDecimal(raw)) || 0;
      const q =
        parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
      setFieldValue(`items.${index}.total`, q * unit);
    }}
    onBlur={() => {
      const val = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      if (values.type === 'Commande') {
        setFieldValue(`items.${index}.prix_achat`, val);
      } else {
        setFieldValue(`items.${index}.prix_unitaire`, val);
      }
      setUnitPriceRaw((prev) => ({ ...prev, [index]: formatNumber(val) }));

      const q =
        parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
      setFieldValue(`items.${index}.total`, q * val);
    }}
  data-row={index}
  data-col="unit"
  onKeyDown={onCellKeyDown(index, 'unit')}
  />
  {values.client_id && values.items[index].product_id && (() => {
    const last = getLastUnitPriceForClientProduct(
      values.client_id,
      values.items[index].product_id
    );
    return last && Number.isFinite(last) ? (
      <div className="text-xs text-gray-500 mt-1">Dernier: {Number(last).toFixed(2)} DH</div>
    ) : null;
  })()}
</td>


                                {/* Remise unitaire (DH) - Sortie/Comptant */}
                                {showRemisePanel && (values.type === 'Sortie' || values.type === 'Comptant') && (
                  <td className="px-1 py-2 w-[90px]">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      pattern="[0-9]*[.,]?[0-9]*"
                                      name={`items.${index}.remise_montant`}
                                      className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                      value={remiseRaw[index] ?? ''}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (!isDecimalLike(raw)) return;
                                        setRemiseRaw((prev) => ({ ...prev, [index]: raw }));
                                      }}
                                      onBlur={() => {
                                        const val = parseFloat(normalizeDecimal(remiseRaw[index] ?? '')) || 0;
                                        setFieldValue(`items.${index}.remise_montant`, val);
                                        setRemiseRaw((prev) => ({ ...prev, [index]: formatNumber(val) }));
                                      }}
                    data-row={index}
                    data-col="remise"
                    onKeyDown={onCellKeyDown(index, 'remise')}
                                    />
                                  </td>
                                )}

                                {/* Total */}
<td className="px-1 py-2 w-[90px]">
  <div className="text-sm font-medium">
    {(() => {
      const q =
        parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
      const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      return (q * u).toFixed(2);
    })()}{' '}
    DH
  </div>
</td>


                                {/* Actions */}
<td className="px-1 py-2 w-[50px]">
  <button
    type="button"
    onClick={() => {
      remove(index);

      // compacter unitPriceRaw
      setUnitPriceRaw((prev) => {
        const copy = { ...prev };
        delete copy[index];
        const compacted: Record<number, string> = {};
        const newLen = values.items.length - 1; // après remove
        for (let i = 0, j = 0; i <= newLen; i++) {
          if (i === index) continue;
          compacted[j] = copy[i] ?? '';
          j++;
        }
        return compacted;
      });

      // compacter qtyRaw
      setQtyRaw((prev) => {
        const copy = { ...prev };
        delete copy[index];
        const compacted: Record<number, string> = {};
        const newLen = values.items.length - 1; // après remove
        for (let i = 0, j = 0; i <= newLen; i++) {
          if (i === index) continue;
          compacted[j] = copy[i] ?? '';
          j++;
        }
        return compacted;
      });

      // compacter remiseRaw
      setRemiseRaw((prev) => {
        const copy = { ...prev } as Record<number, string>;
        delete copy[index];
        const compacted: Record<number, string> = {};
        const newLen = values.items.length - 1; // après remove
        for (let i = 0, j = 0; i <= newLen; i++) {
          if (i === index) continue;
          compacted[j] = copy[i] ?? '';
          j++;
        }
        return compacted;
      });
    }}
    className="text-red-600 hover:text-red-800"
  data-row={index}
  data-col="delete"
  >
    <Trash2 size={16} />
  </button>
</td>

                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </FieldArray>
                </div>

                {/* Récapitulatif */}
                <div className="mt-4 bg-gray-50 p-4 rounded-md">
                 {/* Total poids (kg) */}
<div className="flex justify-between items-center mt-2">
  <span className="text-md font-semibold">Total poids (kg):</span>
  <span className="text-md font-semibold text-gray-700">
    {values.items
      .reduce((sum: number, item: any, idx: number) => {
        const itemKg = Number(item.kg ?? item.product?.kg ?? 0) || 0;
        const q =
          parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
        return sum + itemKg * q;
      }, 0)
      .toFixed(2)}{' '}
    kg
  </span>
</div>
                  {/* Total DH */}
<div className="flex justify-between items-center border-t pt-2">
  <span className="text-md font-semibold">Total:</span>
  <span className="text-md font-semibold">
    {values.items
      .reduce((sum: number, item: any, idx: number) => {
        const q =
          parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
        const u =
          parseFloat(normalizeDecimal(unitPriceRaw[idx] ?? String(item.prix_unitaire ?? ''))) || 0;
        return sum + q * u;
      }, 0)
      .toFixed(2)}{' '}
    DH
  </span>
</div>

{/* Total Remises (DH) */}
{(values.type === 'Sortie' || values.type === 'Comptant') && (
  <div className="flex justify-between items-center mt-2">
    <span className="text-md font-semibold text-purple-700">Total Remises:</span>
    <span className="text-md font-semibold text-purple-700">
      {values.items
        .reduce((sum: number, item: any, idx: number) => {
          const q = parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
          const rRaw = item.remise_montant ?? 0;
          const r = typeof rRaw === 'string' ? parseFloat(String(rRaw).replace(',', '.')) || 0 : Number(rRaw) || 0;
          return sum + r * q;
        }, 0)
        .toFixed(2)}{' '}
      DH
    </span>
  </div>
)}

{/* Mouvement */}
<div className="flex justify-between items-center mt-2">
  <span className="text-md font-semibold text-green-700">Mouvement:</span>
  <span className="text-md font-semibold text-green-700">
    {values.items
      .reduce((sum: number, item: any, idx: number) => {
        const q =
          parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
        const prixVente =
          parseFloat(normalizeDecimal(unitPriceRaw[idx] ?? String(item.prix_unitaire ?? ''))) || 0;
        const crRaw = item.cout_revient ?? item.prix_achat ?? 0;
        const coutRevient =
          typeof crRaw === 'string'
            ? parseFloat(String(crRaw).replace(',', '.')) || 0
            : Number(crRaw) || 0;
        return sum + (prixVente - coutRevient) * q;
      }, 0)
      .toFixed(2)}{' '}
    DH
  </span>
</div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="border-t pt-4 mt-6 flex justify-between">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  {initialValues && (
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                    >
                      <Printer size={16} className="mr-1" />
                      Imprimer
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isDuplicating || (values.items?.length || 0) === 0}
                    onClick={async () => {
                      try {
                        setIsDuplicating(true);
                        // 1) Préparer les items/total à partir du formulaire courant
                        const items = (values.items || []).map((row: any, idx: number) => {
                          const q =
                            parseFloat(String((qtyRaw as any)[idx] ?? row.quantite ?? '0').replace(',', '.')) || 0;
                          const pu =
                            parseFloat(String((unitPriceRaw as any)[idx] ?? row.prix_unitaire ?? '0').replace(',', '.')) || 0;
                          const remiseP = Number(row.remise_pourcentage ?? 0) || 0;
                          const remiseM = Number(row.remise_montant ?? 0) || 0;
                          return {
                            product_id: Number(row.product_id),
                            quantite: q,
                            prix_unitaire: pu,
                            remise_pourcentage: remiseP,
                            remise_montant: remiseM,
                            total: q * pu,
                          };
                        });
                        const montantTotal = items.reduce((s: number, it: any) => s + Number(it.total || 0), 0);

                        // 2) Chercher/Créer le client fixe "khezin awatif"
                        const targetName = 'khezin awatif';
                        let awatef = (clients || []).find(
                          (c: any) => String(c.nom_complet || '').toLowerCase().trim() === targetName
                        );
                        if (!awatef) {
                          awatef = await createContact({
                            nom_complet: 'khezin awatif',
                            type: 'Client',
                            created_by: user?.id || 1,
                          }).unwrap();
                        }

                        // 3) Créer l'Avoir Client pour AWATEF, en ignorant le client du bon courant
                        await createBon({
                          type: 'Avoir',
                          date_creation: formatDateInputToMySQL(values.date_bon || getCurrentDateTimeInput()), // Datetime-local inclut déjà l'heure
                          client_id: Number(awatef.id),
                          adresse_livraison: values.adresse_livraison || '',
                          montant_total: montantTotal,
                          statut: 'En attente',
                          created_by: user?.id || 1,
                          items,
                        }).unwrap();

                        showSuccess("Avoir client dupliqué pour 'khezin awatif'.");
                      } catch (err: any) {
                        console.error('Duplication AWATEF échouée:', err);
                        showError(err?.data?.message || err?.message || 'Erreur lors de la duplication');
                      } finally {
                        setIsDuplicating(false);
                      }
                    }}
                    className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-md disabled:opacity-60"
                    title="Dupliquer ce bon en Avoir Client pour le client fixe AWATEF"
                  >
                    {isDuplicating ? 'Duplication…' : 'Dupliquer AWATEF'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                  >
                    {(() => {
                      if (initialValues) return 'Mettre à jour';
                      if (values.type === 'Devis') return 'Créer Devis';
                      return 'Valider Bon';
                    })()}
                  </button>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      </div>

      {/* Modal Produit */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => {
          setIsProductModalOpen(false);
          setTargetRowIndex(null);
        }}
        onProductAdded={(newProduct) => {
          showSuccess('Nouveau produit ajouté avec succès!');
          setIsProductModalOpen(false);
          if (!formikRef.current) return;

          const values = formikRef.current.values;
          let rowIndex = targetRowIndex;

          const emptyRow = {
            _rowId: makeRowId(),
            product_id: '',
            product_reference: '',
            designation: '',
            quantite: 0,
            prix_achat: 0,
            prix_unitaire: 0,
            cout_revient: 0,
            kg: 0,
            total: 0,
            unite: 'pièce',
          };

          const inject = (idx: number) => {
            requestAnimationFrame(() => {
              applyProductToRow(idx, {
                id: newProduct.id,
                reference: newProduct.reference,
                designation: newProduct.designation,
                prix_vente: Number(newProduct.prix_vente ?? 0),
                prix_achat: Number(newProduct.prix_achat ?? 0),
                cout_revient: Number(newProduct.cout_revient ?? 0),
                kg: Number(newProduct.kg ?? 0),
              });
              setTargetRowIndex(null);
            });
          };

          if (rowIndex == null) {
            const newIndex = values.items?.length ?? 0;
            formikRef.current.setFieldValue('items', [...(values.items ?? []), emptyRow]);
            setUnitPriceRaw((prev) => ({ ...prev, [newIndex]: '0' }));
            inject(newIndex);
          } else {
            inject(rowIndex);
          }
        }}
      />

      {/* Modal Contact */}
      <ContactFormModal
        isOpen={!!isContactModalOpen}
        onClose={() => setIsContactModalOpen(null)}
        contactType={isContactModalOpen || 'Client'}
        onContactAdded={(newContact) => {
          // Sélection AUTO du contact nouvellement créé
          showSuccess(`${newContact.type} ajouté avec succès!`);
          setIsContactModalOpen(null);

          if (formikRef.current) {
            if (newContact.type === 'Client') {
              formikRef.current.setFieldValue('client_id', String(newContact.id));
              formikRef.current.setFieldValue('client_nom', newContact.nom_complet);
              formikRef.current.setFieldValue('client_adresse', newContact.adresse || '');
              formikRef.current.setFieldValue('client_societe', (newContact as any).societe || '');
              // Focus visuel
              setTimeout(() => {
                const btn = document.querySelector('label[for="client_id"]') as HTMLElement | null;
                if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            } else if (newContact.type === 'Fournisseur') {
              formikRef.current.setFieldValue('fournisseur_id', String(newContact.id));
              formikRef.current.setFieldValue('fournisseur_nom', newContact.nom_complet);
              formikRef.current.setFieldValue('fournisseur_adresse', newContact.adresse || '');
              formikRef.current.setFieldValue('fournisseur_societe', (newContact as any).societe || '');
              setTimeout(() => {
                const btn = document.querySelector('label[for="fournisseur_id"]') as HTMLElement | null;
                if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }
          }
        }}
      />

      {/* Modal Impression */}
      {initialValues && (
        <BonPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          bon={initialValues}
          client={clients.find((c: Contact) => c.id.toString() === initialValues.client_id?.toString())}
          fournisseur={fournisseurs.find((f: Contact) => f.id.toString() === initialValues.fournisseur_id?.toString())}
        />
      )}
    </div>
  );
};

export default BonFormModal;
