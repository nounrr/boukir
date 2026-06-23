import { usePreviewMouvementMutation } from '../store/api/calcApi';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Formik, Form, Field, FieldArray, ErrorMessage, useFormikContext } from 'formik';
import type { FormikProps } from 'formik';
import * as Yup from 'yup';
import { Plus, Trash2, Search, Printer } from 'lucide-react';
import { showSuccess, showError, showConfirmation } from '../utils/notifications';
import { sendWhatsApp } from '../utils/notifications';
// Feature flag: show WhatsApp prompt popups after save/update
const SHOW_WHATSAPP_POPUP = false;
import { formatDateInputToMySQL, formatMySQLToDateTimeInput, getCurrentDateTimeInput, formatDateTimeWithHour } from '../utils/dateUtils';
import { useGetVehiculesQuery } from '../store/api/vehiculesApi';
import { useGetEmployeesQueryServer as useGetEmployeesQueryServer } from '../store/api/employeesApi.server';
import { useGetProductsQuery, useGetProductsWithSnapshotsQuery, useSearchBonProductsQuery, useSearchProductsWithSnapshotsQuery } from '../store/api/productsApi';
import { useDispatch } from 'react-redux';
import { api } from '../store/api/apiSlice';
import { useGetSortiesQuery } from '../store/api/sortiesApi';
import { useGetComptantPaymentsQuery, useGetComptantQuery } from '../store/api/comptantApi';
import { useGetClientsQuery, useGetFournisseursQuery, useGetChargesQuery, useCreateContactMutation, useGetContactQuery } from '../store/api/contactsApi';
// Removed unused: useGetPaymentsQuery
import { useGetBonsByTypeQuery, useCreateBonMutation, useUpdateBonMutation } from '../store/api/bonsApi';
import { useGetClientRemisesQuery, useGetAncienRemisesAbonnesQuery, useCreateClientRemiseMutation } from '../store/api/remisesApi';
import { useAuth } from '../hooks/redux';
import { useContactSoldeCumule } from '../hooks/useContactSoldeCumule';
import type { Contact } from '../types';
import ProductFormModal from './ProductFormModal';
import ContactFormModal from './ContactFormModal';
import BonPrintModal from './BonPrintModal';
import BonPrintTemplate from './BonPrintTemplate';
import { generatePDFBlobFromElement } from '../utils/pdf';
import { uploadBonPdf } from '../utils/uploads';

/* -------------------------- Select avec recherche -------------------------- */
interface SearchableSelectProps {
  options: { value: string; label: string; data?: any; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  valueLabelFallback?: string;
  className?: string;
  disabled?: boolean;
  maxDisplayItems?: number;
  minSearchChars?: number;
  autoOpenOnFocus?: boolean; // open dropdown when the control gains focus (for fast keyboard entry)
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, any>; // pass-through for focus/aria/data-attrs
  allowCreate?: boolean;
  onCreate?: (label: string) => void;
  createText?: string;
  onSearchTermChange?: (term: string) => void;
  loading?: boolean; // données en cours de chargement (liste différée)
}

const renderSearchableOptionLabel = (label: string) => {
  const parts = String(label || '').split(
    /(\|\s*(?:PA|PV|PV2):\s*[-+]?\d+(?:[.,]\d+)?\s*DH|\(\s*[-+]?\d+(?:[.,]\d+)?\s*\)|\|\s*(?:Bon|Snap)\s*#\d+|\|\s*Ref produit:\s*[^|]+|\[Lots fusionn[^\]]+\])/g
  ).filter(Boolean);

  return parts.map((part, index) => {
    const clean = part.trim();
    const key = `${clean}-${index}`;
    if (/^\|\s*PA:/i.test(clean)) {
      return <span key={key} className="mx-1 inline-flex rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">{clean.replace(/^\|\s*/, '')}</span>;
    }
    if (/^\|\s*PV:/i.test(clean)) {
      return <span key={key} className="mx-1 inline-flex rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700">{clean.replace(/^\|\s*/, '')}</span>;
    }
    if (/^\|\s*PV2:/i.test(clean)) {
      return <span key={key} className="mx-1 inline-flex rounded bg-cyan-50 px-1.5 py-0.5 font-semibold text-cyan-700">{clean.replace(/^\|\s*/, '')}</span>;
    }
    if (/^\(\s*[-+]?\d+(?:[.,]\d+)?\s*\)$/.test(clean)) {
      return <span key={key} className="mx-1 inline-flex rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">Qte {clean}</span>;
    }
    if (/^\|\s*(?:Bon|Snap)\s*#/i.test(clean)) {
      return <span key={key} className="mx-1 inline-flex rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">{clean.replace(/^\|\s*/, '')}</span>;
    }
    if (/^\|\s*Ref produit:/i.test(clean)) {
      return <span key={key} className="mx-1 inline-flex rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">{clean.replace(/^\|\s*/, '')}</span>;
    }
    if (/^\[Lots fusionn/i.test(clean)) {
      return <span key={key} className="mr-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{clean}</span>;
    }
    return <span key={key} className="text-gray-800">{part}</span>;
  });
};

const getDisabledOptionTitle = (option: { label: string; data?: any; disabled?: boolean }) => (
  option.disabled ? (option.data?.disabledReason || 'Client non selectionnable') : option.label
);

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
};

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  valueLabelFallback,
  className = '',
  disabled = false,
  maxDisplayItems = 100,
  minSearchChars = 2,
  autoOpenOnFocus = false,
  buttonProps,
  allowCreate = false,
  onCreate,
  createText = 'Créer',
  loading = false,
  onSearchTermChange,
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
  const displayLabel = selectedOption?.label || valueLabelFallback || placeholder;
  const canCreate = Boolean(
    allowCreate &&
      typeof onCreate === 'function' &&
      searchTerm.trim().length >= 2 &&
      allMatches.length === 0
  );

  useEffect(() => {
    onSearchTermChange?.(searchTerm);
  }, [onSearchTermChange, searchTerm]);

  // Focus search input when opening (preventScroll avoids page/modal jumping)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
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
        title={displayLabel}
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
        <span className="truncate pr-2">{displayLabel}</span>
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && !disabled && (
        <div className="relative z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b bg-gray-50">
            <input
              type="text"
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={minSearchChars > 0 ? `Rechercher... (minimum ${minSearchChars} caractères)` : 'Rechercher...'}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setDisplayCount(50);
                setHighlightIndex(0);
              }}
              ref={searchInputRef}
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
                    if (!opt.disabled) {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearchTerm('');
                    }
                    // Prevent the form-level Enter handler (which adds a row)
                    // from firing when selecting an option from the dropdown
                    e.preventDefault();
                    e.stopPropagation();
                  } else if (canCreate) {
                    const label = searchTerm.trim();
                    if (label) {
                      try {
                        onCreate?.(label);
                      } finally {
                        setIsOpen(false);
                        setSearchTerm('');
                        setHighlightIndex(-1);
                      }
                    }
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                Chargement…
              </div>
            ) : searchTerm.trim().length >= minSearchChars ? (
              filteredOptions.length === 0 ? (
                <div className="p-2 text-sm text-gray-500">
                  <div className="mb-2">Aucun résultat trouvé</div>
                  {canCreate && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left bg-green-50 hover:bg-green-100 text-green-800 text-sm rounded border border-green-200"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        const label = searchTerm.trim();
                        if (!label) return;
                        try {
                          onCreate?.(label);
                        } finally {
                          setIsOpen(false);
                          setSearchTerm('');
                          setHighlightIndex(-1);
                        }
                      }}
                    >
                      {createText} "{searchTerm.trim()}"
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {filteredOptions.map((option, idx) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={option.disabled}
                      className={`w-full px-3 py-2 text-left text-sm border-b border-gray-100 last:border-b-0 overflow-hidden ${
                        option.disabled 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : idx === highlightIndex 
                            ? 'bg-blue-50 hover:bg-gray-100' 
                            : 'hover:bg-gray-100'
                      }`}
                      onClick={(ev) => {
                        // Avoid bubbling to form handlers
                        ev.stopPropagation();
                        if (!option.disabled) {
                          onChange(option.value);
                          setIsOpen(false);
                          setSearchTerm('');
                          setHighlightIndex(-1);
                        }
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          // Prevent global Enter from adding a new line when choosing here
                          ev.preventDefault();
                          ev.stopPropagation();
                          if (!option.disabled) {
                            onChange(option.value);
                            setIsOpen(false);
                            setSearchTerm('');
                            setHighlightIndex(-1);
                          }
                        }
                      }}
                      title={getDisabledOptionTitle(option)}
                    >
                      <span className="block truncate">{renderSearchableOptionLabel(option.label)}</span>
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
                <div className="mb-2">Tapez au moins {minSearchChars} caractères pour rechercher</div>
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

const ContactSoldeCumuleHint: React.FC<{
  contactId?: string | number | null;
  contactType: 'Client' | 'Fournisseur';
  colorClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
}> = ({
  contactId,
  contactType,
  colorClassName = 'bg-blue-50',
  labelClassName = 'text-blue-700',
  valueClassName = 'text-blue-800',
}) => {
  const numericId = contactId ? Number(contactId) : null;
  const { soldeCumule, contact, isLoading } = useContactSoldeCumule(numericId, contactType);

  if (!numericId) return null;

  const hasValue = contact && Number.isFinite(Number(soldeCumule));

  return (
    <div className={`mt-2 p-2 rounded ${colorClassName}`}>
      <span className={`text-sm font-medium ${labelClassName}`}>Solde cumule: </span>
      <span className={`text-sm font-semibold ${valueClassName}`}>
        {isLoading ? 'Chargement...' : hasValue ? `${Number(soldeCumule).toFixed(2)} DH` : '-'}
      </span>
    </div>
  );
};

/* ---------------------------- Validation du bon ---------------------------- */
const bonValidationSchema = Yup.object({
  date_bon: Yup.string().required('Date du bon requise'),
  vehicule_id: Yup.number().nullable(),
  livraisons: Yup.array()
    .of(
      Yup.object({
        vehicule_id: Yup.number().typeError('Véhicule invalide').required('Véhicule requis'),
        user_id: Yup.number().nullable().optional(),
      })
    )
    .optional(),
  lieu_charge: Yup.string(),
  adresse_livraison: Yup.string(),
  phone: Yup.string().trim(),
  isNotCalculated: Yup.boolean(),
  vendre_au_fournisseur: Yup.boolean(),
  client_id: Yup.number().when(['type', 'vendre_au_fournisseur'], ([type, vendreAuFournisseur], schema) => {
    if (type === 'Sortie' && !vendreAuFournisseur) return schema.required('Client requis');
    if (type === 'Charge' || type === 'AvoirCharge') return schema.required('Client requis');
    if (type === 'Avoir' && !vendreAuFournisseur) return schema.required('Client requis');
    // Pour Devis : client_id OU client_nom requis (pas les deux obligatoires)
    if (type === 'Devis') return schema.nullable();
    return schema.nullable();
  }),
  // Pour Comptant et Devis, on peut saisir un nom libre
  client_nom: Yup.string().when(['type', 'client_id'], ([type, client_id], schema) => {
    if (type === 'Comptant' || type === 'AvoirComptant') return schema.trim();
    if (type === 'AvoirEcommerce') return schema.trim().required('Nom client requis');
    if (type === 'Devis' && !client_id) return schema.trim().required('Veuillez sélectionner un client ou entrer un nom');
    return schema.optional();
  }),
  ecommerce_order_id: Yup.string().optional(),
  order_number: Yup.string().optional(),
  customer_email: Yup.string().trim().optional(),
  fournisseur_id: Yup.number().when(['type', 'vendre_au_fournisseur'], ([type, vendreAuFournisseur], schema) => {
    if (type === 'Commande' || type === 'AvoirFournisseur' || ((type === 'Sortie' || type === 'Avoir') && vendreAuFournisseur)) return schema.required('Fournisseur requis');
    return schema.nullable();
  }),
  items: Yup.array().min(1, 'Au moins un produit requis'),
});

/* ------------------------------- Utilitaires ------------------------------- */
const makeRowId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const findCatalogProductForItem = (item: any, products: any[] = []) => {
  try {
    return (products || []).find((p: any) => {
      const pid = String(p?.id ?? p?.product_id ?? '');
      const pref = String(p?.reference ?? p?.ref ?? p?.id ?? '');
      const itemPid = String(item?.product_id ?? item?.produit_id ?? item?.product?.id ?? item?.productId ?? '');
      const itemPref = String(item?.product_reference ?? item?.reference ?? item?.product?.reference ?? '');
      if (itemPid && pid && itemPid === pid) return true;
      if (itemPref && pref && itemPref === pref) return true;
      return false;
    });
  } catch {
    return undefined;
  }
};

const resolveCatalogMetaForItem = (item: any, product: any = null, snapshot: any = null, variant: any = null) => {
  const productId = item?.product_id ?? item?.produit_id ?? item?.productId ?? item?.product?.id ?? item?.produit?.id ?? product?.id ?? snapshot?.id ?? '';
  const reference = String(
    item?.product_reference ??
      item?.reference ??
      item?.product?.reference ??
      item?.produit?.reference ??
      variant?.reference ??
      snapshot?.reference ??
      product?.reference ??
      productId ??
      ''
  ).trim();
  const designation = String(
    item?.designation ??
      item?.product_designation ??
      item?.product?.designation ??
      item?.produit?.designation ??
      snapshot?.designation ??
      product?.designation ??
      ''
  ).trim();
  const variantName = String(item?.variant_name ?? item?.variant?.variant_name ?? variant?.variant_name ?? snapshot?.variant_name ?? '').trim();

  return {
    productId: productId ? String(productId) : '',
    reference: reference || (productId ? String(productId) : ''),
    designation,
    variantName,
  };
};

const scaleDecimal = (value: any, factor: any = 1) => {
  const n = Number(value) || 0;
  const f = Number(factor) || 1;
  return n * f;
};

const getLatestSnapshotEntry = (entries: any[] = []) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries.reduce((latest: any, current: any) => {
    const latestId = Number(latest?.snapshot_id ?? latest?.id ?? 0) || 0;
    const currentId = Number(current?.snapshot_id ?? current?.id ?? 0) || 0;
    if (currentId !== latestId) return currentId > latestId ? current : latest;

    const latestTime = new Date(latest?.created_at ?? latest?.date_creation ?? 0).getTime();
    const currentTime = new Date(current?.created_at ?? current?.date_creation ?? 0).getTime();
    return currentTime > latestTime ? current : latest;
  });
};

const findSnapshotForProductVariant = (
  snapshotProducts: any[] = [],
  productId: any,
  variantId: any,
  prixVente?: any
) => {
  if (!productId || !Array.isArray(snapshotProducts) || snapshotProducts.length === 0) return null;
  const variantKey = String(variantId || '');
  const pv = prixVente !== undefined && prixVente !== null && prixVente !== '' ? Number(prixVente) : null;
  const candidates = snapshotProducts.filter((snap: any) => {
    if (!snap?.snapshot_id) return false;
    if (String(snap.id) !== String(productId)) return false;
    if (String(snap.variant_id || '') !== variantKey) return false;
    if (pv !== null && Number.isFinite(pv) && Number(snap.prix_vente ?? 0) !== pv) return false;
    const flag = snap.snapshot_en_validation;
    return flag == null ? true : Number(flag) !== 0;
  });
  if (candidates.length === 0) return null;

  const withStock = candidates.filter((snap: any) => Number(snap.snapshot_quantite ?? 0) > 0);
  const pool = withStock.length > 0 ? withStock : candidates;
  return [...pool].sort((a: any, b: any) => {
    const pa = Number(a.fifo_priority ?? 999);
    const pb = Number(b.fifo_priority ?? 999);
    if (pa !== pb) return pa - pb;
    return Number(a.snapshot_id ?? 0) - Number(b.snapshot_id ?? 0);
  })[0] || null;
};

const findLatestSnapshotForProductVariant = (
  snapshotProducts: any[] = [],
  productId: any,
  variantId: any
) => {
  if (!productId || !Array.isArray(snapshotProducts) || snapshotProducts.length === 0) return null;
  const variantKey = String(variantId || '');
  const candidates = snapshotProducts.filter((snap: any) => {
    if (!snap?.snapshot_id) return false;
    if (String(snap.id) !== String(productId)) return false;
    if (String(snap.variant_id || '') !== variantKey) return false;
    const flag = snap.snapshot_en_validation;
    return flag == null ? true : Number(flag) !== 0;
  });
  return getLatestSnapshotEntry(candidates);
};

const formatPrixAchatOption = (value: any) => {
  const price = Number(value) || 0;
  const formatted = Number.isInteger(price)
    ? String(price)
    : price.toFixed(2).replace(/\.?0+$/, '');
  return price > 0 ? `PA: ${formatted} DH` : '';
};

const formatPrixVenteOption = (value: any) => {
  const price = Number(value) || 0;
  const formatted = Number.isInteger(price)
    ? String(price)
    : price.toFixed(2).replace(/\.?0+$/, '');
  return price > 0 ? `PV: ${formatted} DH` : '';
};

const formatPrixVente2Option = (value: any) => {
  const price = Number(value) || 0;
  const formatted = Number.isInteger(price)
    ? String(price)
    : price.toFixed(2).replace(/\.?0+$/, '');
  return price > 0 ? `PV2: ${formatted} DH` : '';
};

const resolveOptionPrixAchat = (
  product: any,
  variant: any = null,
  snapshotProducts: any[] = []
) => {
  const snapshot = findLatestSnapshotForProductVariant(
    snapshotProducts,
    product?.id,
    variant?.id ?? null
  );
  return Number(snapshot?.prix_achat) || Number(variant?.prix_achat) || Number(product?.prix_achat) || 0;
};

const resolveOptionPrixVente = (
  product: any,
  variant: any = null,
  snapshotProducts: any[] = []
) => {
  const snapshot = findLatestSnapshotForProductVariant(
    snapshotProducts,
    product?.id,
    variant?.id ?? product?.variant_id ?? null
  );
  return Number(snapshot?.prix_vente) || Number(variant?.prix_vente) || Number(product?.prix_vente) || 0;
};

const resolveOptionPrixVente2 = (
  product: any,
  variant: any = null,
  snapshotProducts: any[] = []
) => {
  const snapshot = findLatestSnapshotForProductVariant(
    snapshotProducts,
    product?.id,
    variant?.id ?? product?.variant_id ?? null
  );
  return Number(snapshot?.prix_vente_2) || Number(variant?.prix_vente_2) || Number(product?.prix_vente_2) || 0;
};

const resolveItemCostContext = (
  item: any,
  products: any[] = [],
  snapshotProducts: any[] = []
) => {
  const product = findCatalogProductForItem(item, products);
  const snapshotId = item?.product_snapshot_id ?? item?.snapshot_id ?? null;
  const explicitSnapshot = snapshotId
    ? (snapshotProducts || []).find((s: any) => String(s?.snapshot_id) === String(snapshotId)) || null
    : null;
  const variantId = item?.variant_id ?? item?.variantId ?? item?.variant?.id ?? null;
  const itemPVRaw = item?.prix_unitaire ?? item?.prix_vente ?? null;
  const itemPV = itemPVRaw !== null && itemPVRaw !== undefined && itemPVRaw !== ''
    ? Number(itemPVRaw)
    : null;
  const mergedSnapshots = !explicitSnapshot && item?.product_id
    ? (snapshotProducts || [])
        .filter((s: any) => {
          if (!s?.snapshot_id) return false;
          if (String(s?.id) !== String(item.product_id)) return false;
          if (String(s?.variant_id || '') !== String(variantId || '')) return false;
          const flag = s?.snapshot_en_validation;
          const isActive = flag == null ? true : Number(flag) !== 0;
          if (!isActive || Number(s?.snapshot_quantite ?? 0) <= 0) return false;
          if (itemPV !== null && Number.isFinite(itemPV)) {
            return Number(s?.prix_vente ?? 0) === itemPV;
          }
          return true;
        })
        .sort((a: any, b: any) => (Number(a?.fifo_priority) || 999) - (Number(b?.fifo_priority) || 999))
    : [];
  const snapshot = explicitSnapshot || mergedSnapshots[0] || null;
  const variant = variantId && product?.variants?.length
    ? (product.variants as any[]).find((v: any) => String(v?.id) === String(variantId)) || null
    : null;
  const unitId = item?.unit_id ?? item?.unitId ?? item?.unit?.id ?? null;

  let convFactor = 1;
  if (unitId && product?.units?.length) {
    const unitObj = (product.units as any[]).find((u: any) => String(u?.id) === String(unitId));
    if (unitObj) {
      const isBase = unitObj.is_default || unitObj.facteur_isNormal;
      if (!isBase) {
        const f = Number(unitObj.conversion_factor) || 1;
        if (f > 0) convFactor = f;
      }
    } else if (item?.conversion_factor) {
      const f = Number(item.conversion_factor) || 1;
      if (f > 0) convFactor = f;
    }
  } else if (item?.conversion_factor) {
    const f = Number(item.conversion_factor) || 1;
    if (f > 0) convFactor = f;
  }

  const itemPA = Number(item?.prix_achat ?? item?.pa ?? item?.prixA ?? 0) || 0;
  const itemCR =
    Number(item?.cout_revient ?? item?.cout_rev ?? item?.cr ?? item?.cout ?? item?.prix_achat ?? itemPA) || 0;
  const snapshotPA = Number(snapshot?.prix_achat) || 0;
  const snapshotCR = Number(snapshot?.cout_revient) || snapshotPA || 0;
  const variantPA = Number(variant?.prix_achat) || 0;
  const variantCR = Number(variant?.cout_revient) || variantPA || 0;
  const productPA = Number(product?.prix_achat) || 0;
  const productCR = Number(product?.cout_revient) || productPA || 0;

  const basePA = snapshotPA || variantPA || productPA || itemPA || 0;
  const baseCR = snapshotCR || variantCR || productCR || itemCR || basePA || 0;

  return {
    product,
    snapshot,
    mergedSnapshots,
    isMergedSnapshotSelection: !explicitSnapshot && mergedSnapshots.length > 0,
    variant,
    requestedSnapshotId: snapshotId,
    requestedVariantId: variantId,
    requestedUnitId: unitId,
    convFactor,
    itemPA,
    itemCR,
    snapshotPA,
    snapshotCR,
    variantPA,
    variantCR,
    productPA,
    productCR,
    prix_achat: scaleDecimal(basePA, convFactor),
    cout_revient: scaleDecimal(baseCR, convFactor),
    source: snapshotPA || snapshotCR ? 'snapshot' : variantPA || variantCR ? 'variant' : productPA || productCR ? 'product' : 'item',
  };
};

const getCatalogPrixVente = (product: any, variantId?: any) => {
  const variant = variantId && product?.variants?.length
    ? (product.variants as any[]).find((v: any) => String(v?.id) === String(variantId))
    : null;
  return variant
    ? Number(variant.prix_vente ?? product?.prix_vente ?? 0)
    : Number(product?.prix_vente ?? 0);
};

const normalizeHumanName = (value: unknown) => {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const isKhezinAwatifName = (name: unknown) => {
  const n = normalizeHumanName(name);
  if (!n) return false;
  return ['khezin', 'awatif'].every((t) => n.includes(t));
};

const AutoCheckNonCalculatedForAwatif: React.FC<{ isOpen: boolean; clients: any[] }> = ({
  isOpen,
  clients,
}) => {
  const { values, setFieldValue } = useFormikContext<any>();
  // Track whether auto-check was already applied so user can manually uncheck
  const autoAppliedRef = useRef(false);
  // Reset when modal closes or client changes
  const prevClientRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      autoAppliedRef.current = false;
      prevClientRef.current = null;
      return;
    }

    // Reset auto-applied flag when client changes
    const currentClientKey = String(values?.client_id || '') + '|' + String(values?.client_nom || '');
    if (prevClientRef.current !== null && prevClientRef.current !== currentClientKey) {
      autoAppliedRef.current = false;
    }
    prevClientRef.current = currentClientKey;

    // Don't re-apply if already auto-checked once (user may have manually unchecked)
    if (autoAppliedRef.current) return;
    if (values?.isNotCalculated) return;

    let contactName = '';
    if (values?.client_id) {
      const c = (clients || []).find((x: any) => String(x?.id) === String(values.client_id));
      contactName = String(c?.nom_complet || c?.nom || c?.name || '');
    }
    if (!contactName) {
      contactName = String(values?.client_nom || '');
    }

    if (isKhezinAwatifName(contactName) || String(values?.client_id) === '568') {
      setFieldValue('isNotCalculated', true, false);
      autoAppliedRef.current = true;
    }
  }, [isOpen, clients, values?.client_id, values?.client_nom, values?.isNotCalculated, setFieldValue]);

  return null;
};

const ComptantPaidAmountField: React.FC<{
  qtyRaw: Record<number, string>;
  unitPriceRaw: Record<number, string>;
  paymentHistory?: any[];
  isEditMode?: boolean;
}> = ({ qtyRaw, unitPriceRaw, paymentHistory = [], isEditMode = false }) => {
  const { values, setFieldValue } = useFormikContext<any>();
  const normalizePaidDecimal = (value: string) => value.replace(/\s+/g, '').replace(',', '.');
  const isPaidDecimalLike = (value: string) => /^[0-9]*[.,]?[0-9]*$/.test(value);
  const formatPaidValue = (value: number) => {
    if (!Number.isFinite(value)) return '0';
    let formatted = String(value);
    if (/\.\d{10,}/.test(formatted)) {
      formatted = String(Math.round(value * 1e12) / 1e12);
    }
    if (formatted.includes('.')) {
      formatted = formatted.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    }
    return formatted;
  };
  const montantTotalFromItems = (values.items || []).reduce((sum: number, item: any, idx: number) => {
    const quantity = parseFloat(normalizePaidDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
    const price = unitPriceRaw[idx] !== undefined && unitPriceRaw[idx] !== ''
      ? parseFloat(normalizePaidDecimal(unitPriceRaw[idx])) || 0
      : Number(item.prix_unitaire || 0);
    return sum + quantity * price;
  }, 0);
  const montantTotalComptant = montantTotalFromItems > 0
    ? montantTotalFromItems
    : Number(values.montant_total || 0);
  const montantPayeHistorique = Array.isArray(paymentHistory)
    ? paymentHistory.reduce((sum: number, payment: any) => sum + (Number(payment?.montant || 0) || 0), 0)
    : 0;
  const rawValue = String(values.montant_paye_saisi ?? '');
  const montantPayeSaisi = parseFloat(normalizePaidDecimal(rawValue || '0')) || 0;
  const montantPayeTotal = Math.max(0, Math.min(montantPayeHistorique + montantPayeSaisi, montantTotalComptant));
  const reste = Math.max(0, Number((montantTotalComptant - montantPayeTotal).toFixed(2)));

  useEffect(() => {
    if (Math.abs(Number(values.reste || 0) - reste) > 0.000001) {
      setFieldValue('reste', reste, false);
    }
  }, [montantTotalComptant, montantPayeHistorique, montantPayeSaisi, reste, setFieldValue, values.reste]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label htmlFor="montant_paye" className="text-sm font-medium text-gray-700">
        {isEditMode ? 'Nouveau paiement (DH):' : 'Montant payé (DH):'}
      </label>
      <input
        type="text"
        id="montant_paye"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={rawValue}
        onChange={(e) => {
          const nextRawValue = e.target.value || '';
          if (!isPaidDecimalLike(nextRawValue)) return;
          setFieldValue('montant_paye_saisi', nextRawValue);
        }}
        onBlur={() => setFieldValue('montant_paye_saisi', rawValue ? formatPaidValue(montantPayeSaisi) : '')}
        onWheel={(e) => e.currentTarget.blur()}
        className="w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm"
      />
      <div className={`px-3 py-2 rounded-md text-sm font-medium ${Math.max(0, reste) <= 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
        Restant: {formatPaidValue(Math.max(0, reste))} DH
      </div>
    </div>
  );
};

const computeComptantMontantTotal = (
  values: any,
  qtyRaw: Record<number, string>,
  unitPriceRaw: Record<number, string>
) => {
  const normalizePaidDecimal = (value: string) => value.replace(/\s+/g, '').replace(',', '.');
  const montantTotalFromItems = (values.items || []).reduce((sum: number, item: any, idx: number) => {
    const quantity = parseFloat(normalizePaidDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
    const price = unitPriceRaw[idx] !== undefined && unitPriceRaw[idx] !== ''
      ? parseFloat(normalizePaidDecimal(unitPriceRaw[idx])) || 0
      : Number(item.prix_unitaire || 0);
    return sum + quantity * price;
  }, 0);

  return montantTotalFromItems > 0
    ? montantTotalFromItems
    : Number(values.montant_total || 0);
};

const getContactTotalCumule = (contact: any) => {
  if (contact?.total_cumule !== null && contact?.total_cumule !== undefined) {
    const totalCumule = Number(contact.total_cumule);
    if (Number.isFinite(totalCumule)) return totalCumule;
  }

  const soldeCumule = Number(contact?.solde_cumule);
  return Number.isFinite(soldeCumule) ? soldeCumule : 0;
};

const getContactCreditLimit = (contact: any) => {
  const plafond = Number(contact?.plafond);
  const garantie = Number(contact?.montant_garantie);
  const hasPlafond = Number.isFinite(plafond) && plafond > 0;
  const hasGarantie = Number.isFinite(garantie) && garantie > 0;

  if (!hasPlafond && !hasGarantie) return null;
  if (hasPlafond && hasGarantie) {
    return {
      amount: Math.min(plafond, garantie),
      label: plafond <= garantie ? 'plafond' : 'garantie',
      details: `Plafond: ${plafond.toFixed(2)} DH | Garantie: ${garantie.toFixed(2)} DH`,
    };
  }

  return hasPlafond
    ? { amount: plafond, label: 'plafond', details: `Plafond: ${plafond.toFixed(2)} DH` }
    : { amount: garantie, label: 'garantie', details: `Garantie: ${garantie.toFixed(2)} DH` };
};

const isContactBlocked = (contact: any) => {
  const value = contact?.bloque;
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return false;
};

/* --------------------------------- Composant -------------------------------- */
interface BonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: 'Commande' | 'Sortie' | 'Comptant' | 'Charge' | 'AvoirCharge' | 'Avoir' | 'AvoirComptant' | 'AvoirFournisseur' | 'AvoirEcommerce' | 'Devis' | 'Vehicule' | 'Ecommerce';
  initialValues?: any;
  onBonAdded?: (bon: any) => void;
  comptantPartialPaymentMode?: 'hidden' | 'required';
  defaultVendreAuFournisseur?: boolean;
}

const BonFormModal: React.FC<BonFormModalProps> = ({
  isOpen,
  onClose,
  currentTab,
  initialValues,
  onBonAdded,
  comptantPartialPaymentMode = 'hidden',
  defaultVendreAuFournisseur = false,
}) => {
  const [previewMouvement, { data: mouvementPreviewResp, isLoading: mouvementPreviewLoading }] = usePreviewMouvementMutation();

  const { user, token } = useAuth();
  const dispatch = useDispatch();
  const formikRef = useRef<FormikProps<any>>(null);
  const isEditMode = Boolean((initialValues as any)?.id);
  const isPDG = user?.role === 'PDG';
  const isChefChauffeur = user?.role === 'ChefChauffeur';
  const isQtyOnlyEdit = isChefChauffeur && isEditMode;
  // Container ref to detect when Enter is pressed within the products area
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  
  // État pour mémoriser si le PDG a accepté un client déjà au-dessus de sa limite
  const [pdgApprovedOverLimit, setPdgApprovedOverLimit] = useState<{ clientId: string; timestamp: number } | null>(null);
  
  // Remises UI state
  const [showRemisePanel, setShowRemisePanel] = useState(false); // panel application des remises (affiche colonnes)
  const [selectedRemiseId, setSelectedRemiseId] = useState<number | ''>('');
  const [bulkLineCount, setBulkLineCount] = useState('30');
  // New remise target (bon header)
  const [remiseTargetIsBonClient, setRemiseTargetIsBonClient] = useState(true);
  const { data: remiseClients = [] } = useGetClientRemisesQuery(undefined, { skip: !isOpen || !showRemisePanel });
  const { data: anciensAbonnes = [] } = useGetAncienRemisesAbonnesQuery(undefined, { skip: !isOpen || !showRemisePanel });
  const [localCreatedRemiseClients, setLocalCreatedRemiseClients] = useState<any[]>([]);
  const mergedRemiseClients = useMemo(() => {
    const byId = new Map<string, any>();
    for (const c of [...(localCreatedRemiseClients || []), ...(remiseClients || [])]) {
      const id = c?.id;
      if (id == null) continue;
      byId.set(String(id), c);
    }
    return Array.from(byId.values());
  }, [localCreatedRemiseClients, remiseClients]);
  const clientRemiseOptions = useMemo(
    () => (mergedRemiseClients || []).filter((c: any) => String(c?.type || 'client-remise') === 'client-remise'),
    [mergedRemiseClients]
  );
  const clientAbonneContactIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of (remiseClients || []) as any[]) {
      if (String(c?.type) !== 'client_abonne') continue;
      const contactId = Number(c?.contact_id);
      if (Number.isFinite(contactId) && contactId > 0) ids.add(contactId);
    }
    for (const row of (anciensAbonnes || []) as any[]) {
      const contactId = Number(row?.contact_id);
      if (Number.isFinite(contactId) && contactId > 0) ids.add(contactId);
    }
    return ids;
  }, [remiseClients, anciensAbonnes]);

  // Raw input for per-line remise (unit discount), similar to qtyRaw/unitPriceRaw
  const [remiseRaw, setRemiseRaw] = useState<Record<number, string>>({});
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState<null | 'Client' | 'Fournisseur'>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [targetRowIndex, setTargetRowIndex] = useState<number | null>(null);

  // PERF: ne RIEN charger au montage en mode création (formulaire vide instantané).
  // Les grosses listes (produits, snapshots, clients, fournisseurs, historiques) ne se
  // chargent qu'à la PREMIÈRE interaction de l'utilisateur avec le formulaire
  // (clic / focus / saisie), c.-à-d. quand il ouvre un select pour rechercher.
  // En mode édition OU formulaire pré-rempli (ex: avoir e-commerce avec items/contact
  // déjà choisis) on charge tout de suite : ces lignes ont besoin des données pour
  // s'afficher correctement.
  const isPrefilled = useMemo(() => {
    const iv = initialValues as any;
    if (!iv) return false;
    if (Array.isArray(iv.items) && iv.items.length > 0) return true;
    return Boolean(iv.client_id || iv.fournisseur_id || iv.client_nom || iv.ecommerce_order_id);
  }, [initialValues]);
  const loadImmediately = !isEditMode && isPrefilled;
  // Données des LIGNES (produits, snapshots, historiques) : chargées tout de suite en
  // édition/préremplissage car les items existants en ont besoin pour s'afficher.
  const [heavyDataReady, setHeavyDataReady] = useState<boolean>(() => loadImmediately);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const debouncedProductSearchTerm = useDebouncedValue(productSearchTerm.trim(), 250);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [fournisseurSearchTerm, setFournisseurSearchTerm] = useState('');
  const debouncedClientSearchTerm = useDebouncedValue(clientSearchTerm.trim(), 250);
  const debouncedFournisseurSearchTerm = useDebouncedValue(fournisseurSearchTerm.trim(), 250);
  // Listes de CONTACTS (clients/fournisseurs complets) : même en édition on NE charge
  // PAS toute la liste — le contact déjà choisi est récupéré par son ID (GET /contacts/:id).
  // La liste complète n'est chargée qu'à la première interaction (ouverture d'un select).
  useEffect(() => {
    // Quand on rouvre le formulaire, repartir de l'état initial.
    setHeavyDataReady(loadImmediately);
  }, [isOpen, loadImmediately]);
  // N'attacher les déclencheurs d'interaction que tant qu'au moins une liste reste à charger.

  // RTK Query hooks
  const { data: vehicules = [] } = useGetVehiculesQuery();
  const { data: employeesAll = [] } = useGetEmployeesQueryServer();
  const chauffeurs = useMemo(
    () =>
      (employeesAll || []).filter(
        (e: any) => (e?.role === 'Chauffeur' || e?.role === 'ChefChauffeur') && !e?.deleted_at
      ),
    [employeesAll]
  );
  const initialLineProducts = useMemo(() => {
    const raw = (initialValues as any)?.items;
    const rawItems = Array.isArray(raw)
      ? raw
      : (typeof raw === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })()
        : []);
    const byId = new Map<string, any>();

    for (const item of rawItems as any[]) {
      const productId = item?.product_id ?? item?.produit_id ?? item?.product?.id ?? item?.produit?.id;
      if (productId == null || productId === '') continue;
      const key = String(productId);
      const existing = byId.get(key) || {};
      const variantId = item?.variant_id ?? item?.variant?.id;
      const unitId = item?.unit_id ?? item?.unit?.id;

      const variants = Array.isArray(existing.variants) ? [...existing.variants] : [];
      if (variantId != null && variantId !== '' && !variants.some((v: any) => String(v.id) === String(variantId))) {
        variants.push({
          id: variantId,
          variant_name: item?.variant_name ?? item?.variant?.variant_name ?? '',
          reference: item?.variant_reference ?? item?.variant?.reference ?? '',
          prix_achat: Number(item?.prix_achat ?? item?.pa ?? 0) || 0,
          cout_revient: Number(item?.cout_revient ?? item?.cr ?? item?.prix_achat ?? 0) || 0,
          prix_vente: Number(item?.prix_unitaire ?? item?.prix_vente ?? 0) || 0,
        });
      }

      const units = Array.isArray(existing.units) ? [...existing.units] : [];
      if (unitId != null && unitId !== '' && !units.some((u: any) => String(u.id) === String(unitId))) {
        units.push({
          id: unitId,
          unit_name: item?.unite ?? item?.unit_name ?? item?.unit?.unit_name ?? 'piece',
          conversion_factor: Number(item?.conversion_factor ?? item?.unit?.conversion_factor ?? 1) || 1,
          is_default: false,
          facteur_isNormal: false,
        });
      }

      byId.set(key, {
        ...existing,
        id: productId,
        reference: item?.product_reference ?? item?.reference ?? item?.product?.reference ?? item?.produit?.reference ?? key,
        designation: item?.designation ?? item?.designation_custom ?? item?.product?.designation ?? item?.produit?.designation ?? '',
        prix_achat: Number(item?.prix_achat ?? item?.pa ?? existing.prix_achat ?? 0) || 0,
        cout_revient: Number(item?.cout_revient ?? item?.cr ?? item?.prix_achat ?? existing.cout_revient ?? 0) || 0,
        prix_vente: Number(item?.prix_unitaire ?? item?.prix_vente ?? existing.prix_vente ?? 0) || 0,
        prix_gros: Number(item?.prix_gros ?? existing.prix_gros ?? 0) || 0,
        kg: Number(item?.kg ?? item?.product?.kg ?? item?.produit?.kg ?? existing.kg ?? 0) || 0,
        variants,
        units,
      });
    }

    return Array.from(byId.values());
  }, [initialValues]);

  const mergeProductsById = (base: any[] = [], extra: any[] = []) => {
    const map = new Map<string, any>();
    for (const p of base) {
      if (p?.id != null) map.set(String(p.id), p);
    }
    for (const p of extra) {
      if (p?.id == null) continue;
      const key = String(p.id);
      map.set(key, { ...(map.get(key) || {}), ...p });
    }
    return Array.from(map.values());
  };

  const { data: allProducts = [] } = useGetProductsQuery(undefined, { skip: !heavyDataReady });
  // Snapshot-expanded products for Sortie/Comptant/Avoir/Charge types
  const useSnapshotSelection = ['Sortie', 'Comptant', 'Charge', 'AvoirCharge', 'Avoir', 'AvoirComptant', 'AvoirFournisseur'].includes(currentTab);
  const { data: allSnapshotProducts = [] } = useGetProductsWithSnapshotsQuery(undefined, { skip: !useSnapshotSelection || !heavyDataReady });
  const remoteProductSearchEnabled = !heavyDataReady && debouncedProductSearchTerm.length >= 2;
  const { data: searchedProductsResponse, isFetching: isSearchingProducts } = useSearchBonProductsQuery(
    { q: debouncedProductSearchTerm, limit: 80 },
    { skip: !remoteProductSearchEnabled }
  );
  const { data: searchedSnapshotProducts = [], isFetching: isSearchingSnapshotProducts } = useSearchProductsWithSnapshotsQuery(
    { q: debouncedProductSearchTerm, limit: 120 },
    { skip: !remoteProductSearchEnabled || !useSnapshotSelection }
  );
  const products = heavyDataReady
    ? allProducts
    : mergeProductsById(initialLineProducts, searchedProductsResponse?.data || []);
  const snapshotProducts = heavyDataReady ? allSnapshotProducts : searchedSnapshotProducts;
  const productSelectLoading = !heavyDataReady && remoteProductSearchEnabled && (
    useSnapshotSelection ? isSearchingSnapshotProducts : isSearchingProducts
  );

  // Smart filtering for snapshot products:
  // - Add mode: If a product+variant has snapshots with qty > 0, only show those (hide qty <= 0 snapshots)
  //             If ALL snapshots of a product+variant have qty <= 0, show only the latest snapshot
  // - Edit mode: show all snapshots (no qty filtering) so already-selected items remain visible
  // Then merge: non-PDG always merge, PDG merge only when same cout_revient + prix_vente
  const filteredSnapshotProducts = useMemo(() => {
    if (!snapshotProducts?.length) return snapshotProducts;

    // Group by product_id + variant_id (chaque variante est traitée indépendamment)
    const grouped = new Map<string, any[]>();
    for (const snap of snapshotProducts as any[]) {
      const key = `${snap.id}:${snap.variant_id || 0}`; // product_id:variant_id
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(snap);
    }

    const result: any[] = [];
    for (const [, entries] of grouped) {
      // In edit mode, keep ALL entries (no qty filtering) so existing items can be found
      if (isEditMode) {
        result.push(...entries);
        continue;
      }

      // Séparer les entrées snapshot vs non-snapshot (services, produits sans snapshot)
      const snapshotEntries = entries.filter((s: any) => !!s.snapshot_id);
      const nonSnapshotEntries = entries.filter((s: any) => !s.snapshot_id);

      if (snapshotEntries.length === 0) {
        // Pas de snapshots → garder les entrées produit normales
        result.push(...nonSnapshotEntries);
        continue;
      }

      // Prefer snapshots that are currently active in validation workflow
      const activeSnapshots = snapshotEntries.filter((s: any) => {
        const flag = (s as any).snapshot_en_validation;
        // When the backend doesn't expose it, treat as active
        return flag == null ? true : Number(flag) !== 0;
      });
      const candidateSnapshots = activeSnapshots.length > 0 ? activeSnapshots : snapshotEntries;

      // Snapshots avec qte > 0 (sur candidats)
      const withStock = candidateSnapshots.filter((s: any) => {
        const qty = Number(s.snapshot_quantite);
        return Number.isFinite(qty) && qty > 0;
      });

      if (withStock.length > 0) {
        // Produit+variante a des snapshots avec stock > 0 → afficher seulement ceux-là
        result.push(...withStock);
      } else {
        // TOUS les snapshots de cette variante ont qte <= 0 → afficher seulement le dernier
        const latest = candidateSnapshots.reduce((a: any, b: any) => {
          return Number(b.snapshot_id) > Number(a.snapshot_id) ? b : a;
        });
        result.push(latest);
      }
    }
    
    // Merge snapshots of same product+variant into ONE entry per distinct prix_vente.
    // ALL roles: same prix_vente → merge into one line. Different prix_vente → separate lines.
    const grouped2 = new Map<string, any[]>();
    for (const snap of result) {
      // Group by product_id + variant_id + prix_vente so different prices stay separate
      const pv = Number(snap.prix_vente ?? 0);
      const specialKey = Number(snap.snapshot_unite_special || 0)
        ? `special:${Number(snap.snapshot_facteur_barre || 0)}`
        : 'normal';
      const key = `${snap.id}:${snap.variant_id || 0}:${pv}:${specialKey}`;
      if (!grouped2.has(key)) grouped2.set(key, []);
      grouped2.get(key)!.push(snap);
    }

    const finalResult: any[] = [];
    for (const [, entries] of grouped2) {
      const snapshotEntries = entries.filter((s: any) => !!s.snapshot_id);
      const nonSnapshotEntries = entries.filter((s: any) => !s.snapshot_id);

      if (snapshotEntries.length > 1) {
        // Multiple snapshots with same prix_vente → merge into single entry
        const sortedSnaps = [...snapshotEntries].sort((a: any, b: any) =>
          (Number(a.fifo_priority) || 999) - (Number(b.fifo_priority) || 999)
        );
        const oldest = sortedSnaps[0];
        const latest = getLatestSnapshotEntry(snapshotEntries) || oldest;
        const totalQty = snapshotEntries.reduce((sum: number, s: any) => {
          const qty = Number(s.snapshot_quantite ?? 0);
          return sum + (qty > 0 ? qty : 0);
        }, 0);
        finalResult.push({
          ...oldest,
          snapshot_id: null,
          _isMerged: true,
          _mergedSnapshots: sortedSnaps,
          snapshot_quantite: totalQty,
          snapshot_unite_special: Number(oldest.snapshot_unite_special || 0),
          snapshot_nbr_barre: oldest.snapshot_nbr_barre ?? null,
          snapshot_facteur_barre: oldest.snapshot_facteur_barre ?? null,
          prix_achat: latest?.prix_achat ?? oldest?.prix_achat,
          prix_vente: oldest.prix_vente,
          cout_revient: latest?.cout_revient ?? latest?.prix_achat ?? oldest?.cout_revient,
        });
        finalResult.push(...nonSnapshotEntries);
      } else {
        // Single snapshot or non-snapshot → keep as-is
        finalResult.push(...entries);
      }
    }
    return finalResult;
  }, [snapshotProducts, isEditMode, isPDG]);

  // For Commande: flatten products + variants into a single selectable list
  // If prix_achat == prix_vente → single option; if different → show each variant separately
  const commandeProductOptions = useMemo(() => {
    if (!products?.length) return [];
    const options: { value: string; label: string; data: any }[] = [];

    for (const p of products as any[]) {
      const ref = String(p.reference ?? p.id);
      const nom = p.designation ?? '';
      const pa = Number(p.prix_achat || 0);
      const pv = Number(p.prix_vente || 0);
      const pv2Label = formatPrixVente2Option(p.prix_vente_2);
      const variants: any[] = p.variants ?? [];

      // Base product option
      const priceLabel = `${formatPrixAchatOption(pa) ? ` | ${formatPrixAchatOption(pa)}` : ''}${formatPrixVenteOption(pv) ? ` | ${formatPrixVenteOption(pv)}` : ''}`;
      options.push({
        value: String(p.id),
        label: `${ref} - ${nom}${priceLabel}${pv2Label ? ` | ${pv2Label}` : ''}`.trim(),
        data: p,
      });

      // Show each variant as separate option
      for (const v of variants) {
        const vpa = Number(v.prix_achat ?? pa);
        const vpv = Number(v.prix_vente ?? pv);
        const variantPv2Label = formatPrixVente2Option(v.prix_vente_2 ?? p.prix_vente_2);
        // If single variant with same pricing as parent, skip duplicate
        if (variants.length === 1 && vpa === pa && vpv === pv) continue;
        const varPriceLabel = `${formatPrixAchatOption(vpa) ? ` | ${formatPrixAchatOption(vpa)}` : ''}${formatPrixVenteOption(vpv) ? ` | ${formatPrixVenteOption(vpv)}` : ''}`;
        options.push({
          value: `var:${v.id}:${p.id}`,
          label: `${ref} - ${nom} - ${v.variant_name}${varPriceLabel}${variantPv2Label ? ` | ${variantPv2Label}` : ''}`.trim(),
          data: { ...p, _selectedVariant: v },
        });
      }
    }

    return options;
  }, [products]);

  const variantCatalogMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of products as any[]) {
      const productReference = String(p?.reference ?? p?.id ?? '').trim();
      for (const v of p?.variants ?? []) {
        map.set(`${p.id}:${v.id}`, {
          productId: p.id,
          productReference,
          productDesignation: String(p?.designation ?? '').trim(),
          variantId: v.id,
          variantName: String(v?.variant_name ?? '').trim(),
          variantReference: String(v?.reference ?? '').trim(),
          product: p,
          variant: v,
        });
      }
    }
    return map;
  }, [products]);

  const catalogProductVariantOptions = useMemo(() => {
    if (!products?.length) return [];
    const options: { value: string; label: string; data: any }[] = [];

    for (const p of products as any[]) {
      const productReference = String(p?.reference ?? p?.id ?? '').trim();
      const productDesignation = String(p?.designation ?? '').trim();
      const productPrixAchatLabel = formatPrixAchatOption(resolveOptionPrixAchat(p, null, snapshotProducts as any[]));
      const productPrixVenteLabel = formatPrixVenteOption(resolveOptionPrixVente(p, null, snapshotProducts as any[]));
      const productPrixVente2Label = formatPrixVente2Option(resolveOptionPrixVente2(p, null, snapshotProducts as any[]));
      options.push({
        value: String(p.id),
        label: `${productReference} - ${productDesignation}${productPrixAchatLabel ? ` | ${productPrixAchatLabel}` : ''}${productPrixVenteLabel ? ` | ${productPrixVenteLabel}` : ''}${productPrixVente2Label ? ` | ${productPrixVente2Label}` : ''}`.trim(),
        data: p,
      });

      for (const v of p?.variants ?? []) {
        const variantReference = String(v?.reference ?? '').trim();
        const variantName = String(v?.variant_name ?? '').trim();
        const displayReference = variantReference || productReference;
        const variantPrixAchatLabel = formatPrixAchatOption(resolveOptionPrixAchat(p, v, snapshotProducts as any[]));
        const variantPrixVenteLabel = formatPrixVenteOption(resolveOptionPrixVente(p, v, snapshotProducts as any[]));
        const variantPrixVente2Label = formatPrixVente2Option(resolveOptionPrixVente2(p, v, snapshotProducts as any[]));
        const extraParentRef =
          variantReference && productReference && variantReference !== productReference
            ? ` | Ref produit: ${productReference}`
            : '';
        options.push({
          value: `catalogvar:${v.id}:${p.id}`,
          label: `${displayReference} - ${productDesignation}${variantName ? ` - ${variantName}` : ''}${variantPrixAchatLabel ? ` | ${variantPrixAchatLabel}` : ''}${variantPrixVenteLabel ? ` | ${variantPrixVenteLabel}` : ''}${variantPrixVente2Label ? ` | ${variantPrixVente2Label}` : ''}${extraParentRef}`.trim(),
          data: { ...p, _selectedVariant: v },
        });
      }
    }

    return options;
  }, [products, snapshotProducts]);
  // PERF: options produits "simples" (référence - désignation) pour les lignes détaillées
  // (Charge). Mémoïsé pour NE PAS recalculer .map(products) à chaque frappe/render,
  // ce qui rendait la saisie très lente en édition.
  const simpleProductOptions = useMemo(
    () =>
      (products as any[]).map((p: any) => ({
        value: String(p.id),
        label: `${String(p.reference ?? p.id)} - ${p.designation}`,
        data: p,
      })),
    [products]
  );
  const clientSearchEnabled = debouncedClientSearchTerm.length >= 2;
  const fournisseurSearchEnabled = debouncedFournisseurSearchTerm.length >= 2;
  const { data: clientsResponse, isFetching: isSearchingClients } = useGetClientsQuery(
    { page: 1, limit: 80, search: debouncedClientSearchTerm },
    { skip: !clientSearchEnabled }
  );
  const { data: chargeClientsResponse, isFetching: isSearchingChargeClients } = useGetChargesQuery(
    { page: 1, limit: 80, search: debouncedClientSearchTerm },
    { skip: !clientSearchEnabled }
  );
  const { data: fournisseursResponse, isFetching: isSearchingFournisseurs } = useGetFournisseursQuery(
    { page: 1, limit: 80, search: debouncedFournisseurSearchTerm },
    { skip: !fournisseurSearchEnabled }
  );
  const clientsRaw = clientsResponse?.data || [];
  const chargeClientsRaw = chargeClientsResponse?.data || [];
  const fournisseursRaw = fournisseursResponse?.data || [];
  const currentContactTypeForSelect = String(currentTab || (initialValues as any)?.type || '');
  const isChargeContactSelect = ['Charge', 'AvoirCharge'].includes(currentContactTypeForSelect);
  const clientSelectLoading = clientSearchEnabled && (isChargeContactSelect ? isSearchingChargeClients : isSearchingClients);
  const fournisseurSelectLoading = fournisseurSearchEnabled && isSearchingFournisseurs;

  // À l'ouverture en modification, on récupère le contact (client/fournisseur) DÉJÀ
  // sélectionné directement par son ID (GET /contacts/:id), sans charger toute la liste.
  // On le fusionne ensuite dans les listes pour qu'il s'affiche et que toute la logique
  // (clients.find / fournisseurs.find) le retrouve même si la liste complète n'est pas chargée.
  const selectedClientId = useMemo(() => {
    const id = Number((initialValues as any)?.client_id ?? (initialValues as any)?.contact_id);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }, [initialValues]);
  const selectedFournisseurId = useMemo(() => {
    const id = Number((initialValues as any)?.fournisseur_id);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }, [initialValues]);
  const { data: selectedClientById } = useGetContactQuery(selectedClientId as number, { skip: !selectedClientId });
  const { data: selectedFournisseurById } = useGetContactQuery(selectedFournisseurId as number, { skip: !selectedFournisseurId });

  // Fusionne un contact (récupéré par ID) dans une liste sans créer de doublon.
  const mergeContactById = (list: Contact[], extra?: Contact): Contact[] => {
    if (!extra?.id) return list;
    if ((list || []).some((c: any) => String(c?.id) === String(extra.id))) return list;
    return [extra, ...(list || [])];
  };
  const clients = useMemo(
    () => mergeContactById(clientsRaw as Contact[], selectedClientById as Contact | undefined),
    [clientsRaw, selectedClientById]
  );
  const chargeClients = useMemo(
    () => mergeContactById(chargeClientsRaw as Contact[], selectedClientById as Contact | undefined),
    [chargeClientsRaw, selectedClientById]
  );
  const fournisseurs = useMemo(
    () => mergeContactById(fournisseursRaw as Contact[], selectedFournisseurById as Contact | undefined),
    [fournisseursRaw, selectedFournisseurById]
  );
  const currentModalType = String((initialValues as any)?.type || currentTab || '');
  const shouldFetchSortiesHistory = !isEditMode && (heavyDataReady || (
    isOpen &&
    ['Sortie', 'Avoir'].includes(currentModalType)
  ));
  const { data: sortiesHistory = [] } = useGetSortiesQuery(undefined, { skip: !shouldFetchSortiesHistory });
  const shouldFetchComptantHistory = !isEditMode && (heavyDataReady || (
    isOpen &&
    ['Comptant', 'AvoirComptant', 'Sortie', 'Avoir'].includes(currentModalType)
  ));
  const { data: comptantHistory = [] } = useGetComptantQuery(undefined, { skip: !shouldFetchComptantHistory });
  const { data: comptantPaymentsHistory = [] } = useGetComptantPaymentsQuery((initialValues as any)?.id, {
    skip: !isEditMode || currentTab !== 'Comptant' || !((initialValues as any)?.id),
  });
  const shouldFetchCommandesHistory = !isEditMode && isOpen && (
    currentModalType === 'Commande' ||
    currentModalType === 'AvoirFournisseur'
  );
  const { data: commandesHistory = [] } = useGetBonsByTypeQuery('Commande', { skip: !shouldFetchCommandesHistory });
  const shouldFetchAvoirsFournisseurHistory = !isEditMode && isOpen && currentModalType === 'AvoirFournisseur';
  const { data: avoirsFournisseurHistory = [] } = useGetBonsByTypeQuery('AvoirFournisseur', { skip: !shouldFetchAvoirsFournisseurHistory });
  const shouldFetchEcommerceOrders = isOpen && (currentTab === 'AvoirEcommerce' || String((initialValues as any)?.type || '') === 'AvoirEcommerce');
  const { data: ecommerceOrders = [] } = useGetBonsByTypeQuery('Ecommerce', { skip: !shouldFetchEcommerceOrders });
  // For cumulative balances
  // Removed unused aggregated queries to reduce unnecessary re-renders / warnings
  // const { data: avoirsClientAll = [] } = useGetBonsByTypeQuery('Avoir');
  // const { data: avoirsFournisseurAll = [] } = useGetBonsByTypeQuery('AvoirFournisseur');
  // const { data: payments = [] } = useGetPaymentsQuery();

  // Mutations
  const [createBon] = useCreateBonMutation();
  const [updateBonMutation] = useUpdateBonMutation();
  const [createClientRemise] = useCreateClientRemiseMutation();
  const [createContact] = useCreateContactMutation();
  const submitInProgressRef = useRef(false);
  const [isSavingBon, setIsSavingBon] = useState(false);
  const [isSendingWhatsAppPdf, setIsSendingWhatsAppPdf] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const apiBaseUrl = (import.meta as any)?.env?.VITE_API_BASE_URL || '';
  const allClients = useMemo(() => {
    const merged = [...clients, ...chargeClients];
    const byId = new Map<string, Contact>();
    merged.forEach((client: Contact) => {
      byId.set(String(client.id), client);
    });
    return Array.from(byId.values());
  }, [clients, chargeClients]);
  const selectableClients = useMemo(
    () => (['Charge', 'AvoirCharge'].includes(String(currentTab || (initialValues as any)?.type || '')) ? chargeClients : clients),
    [chargeClients, clients, currentTab, initialValues]
  );
  const buildClientOption = (c: Contact) => {
    const soldeCumule = getContactTotalCumule(c);
    const creditLimit = getContactCreditLimit(c);
    const limite = creditLimit?.amount ?? 0;
    const isOverLimit = Boolean(creditLimit && soldeCumule > limite);
    const depassement = isOverLimit ? soldeCumule - limite : 0;
    const isBlocked = isContactBlocked(c);
    const isDisabled = isBlocked || (isOverLimit && user?.role !== 'PDG');
    const blockedLabel = isBlocked ? ' - Client bloque' : '';
    const disabledReason = isBlocked
      ? 'Client bloque'
      : isOverLimit && user?.role !== 'PDG'
        ? 'Client non selectionnable - Plafond depasse'
        : undefined;
    const baseLabel = `${c.nom_complet} ${c.reference ? `(${c.reference})` : ''}${blockedLabel}`;

    return {
      value: c.id.toString(),
      label: isOverLimit ? `${baseLabel} - DEPASSE de ${depassement.toFixed(2)} DH` : baseLabel,
      data: { ...c, disabledReason },
      disabled: isDisabled,
    };
  };
  // PERF: options client mémoïsées — évite de recalculer buildClientOption (qui lit le
  // solde cumulé / plafond de chaque contact) à chaque frappe/render du formulaire.
  const clientOptions = useMemo(
    () => (selectableClients as Contact[]).map(buildClientOption),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectableClients, user?.role]
  );
  // PERF: options fournisseur mémoïsées (évite .map(fournisseurs) à chaque render).
  const fournisseurOptions = useMemo(
    () =>
      (fournisseurs as Contact[]).map((f: Contact) => ({
        value: f.id.toString(),
        label: `${f.nom_complet} ${f.reference ? `(${f.reference})` : ''}`,
        data: f,
      })),
    [fournisseurs]
  );
  const productMap = useMemo(() => {
    const map = new Map<string, any>();
    (products || []).forEach((prod: any) => {
      if (prod?.id != null) {
        map.set(String(prod.id), prod);
      }
    });
    return map;
  }, [products]);

  const getEcommerceOrderRef = (o: any) => String(o?.numero || o?.order_number || o?.id || '');

  const ecommerceOrdersByRef = useMemo(() => {
    const m = new Map<string, any>();
    for (const o of ecommerceOrders as any[]) {
      const ref = getEcommerceOrderRef(o);
      if (!ref) continue;
      if (!m.has(ref)) m.set(ref, o);
    }
    return m;
  }, [ecommerceOrders]);

  const ecommerceOrderOptions = useMemo(() => {
    return (ecommerceOrders as any[])
      .map((o) => {
        const ref = getEcommerceOrderRef(o);
        if (!ref) return null;
        const name = String(o?.client_nom || o?.customer_name || o?.customer?.name || '').trim();
        const total = Number(o?.montant_total ?? o?.total_amount ?? 0) || 0;
        return {
          value: ref,
          label: `${ref}${name ? ` • ${name}` : ''} • ${total.toFixed(2)} DH`,
          data: o,
        };
      })
      .filter(Boolean) as { value: string; label: string; data?: any }[];
  }, [ecommerceOrders]);

  const ecommerceClientOptions = useMemo(() => {
    return (clients || []).map((c: any) => {
      const name = String(c?.nom_complet || '').trim();
      const ref = String(c?.reference || '').trim();
      const phone = String(c?.telephone || c?.phone || '').trim();
      const blocked = isContactBlocked(c);
      const labelParts = [name, ref ? `(${ref})` : '', phone ? `• ${phone}` : ''].filter(Boolean);
      if (blocked) labelParts.push('- Client bloque');
      return {
        value: name,
        label: labelParts.join(' ').replace(/\s+/g, ' ').trim(),
        data: { ...c, disabledReason: blocked ? 'Client bloque' : undefined },
        disabled: blocked,
      };
    });
  }, [clients]);

  const normalizeEcommerceItemsToForm = (order: any) => {
    const rawItems = Array.isArray(order?.items) ? order.items : [];
    const normalized = rawItems
      .map((it: any) => {
        const productId = it?.product_id ?? it?.produit_id ?? it?.produit?.id ?? it?.product?.id;
        if (productId == null || productId === '') return null;

        const quantite = Number(it?.quantite ?? it?.quantity ?? 0) || 0;
        const prixUnitaire = Number(it?.prix_unitaire ?? it?.unit_price ?? it?.unitPrice ?? 0) || 0;
        const total = Number(it?.total ?? it?.montant_ligne ?? it?.subtotal ?? quantite * prixUnitaire) || 0;

        const productFromCatalog = productMap.get(String(productId));
        const product_reference =
          String(
            it?.product_reference ??
              it?.reference ??
              it?.produit?.reference ??
              it?.product?.reference ??
              (productFromCatalog?.reference ?? '')
          ) || String(productId);

        const designation =
          String(
            it?.designation ??
              it?.designation_custom ??
              it?.product_name ??
              it?.produit?.designation ??
              it?.product?.designation ??
              (productFromCatalog?.designation ?? '')
          ) || '';

        const kg = Number(it?.kg ?? it?.kg_value ?? it?.produit?.kg ?? it?.product?.kg ?? (productFromCatalog?.kg ?? 0)) || 0;

        return {
          _rowId: makeRowId(),
          product_id: String(productId),
          variant_id: String(it?.variant_id ?? it?.variantId ?? it?.variant?.id ?? ''),
          unit_id: String(it?.unit_id ?? it?.unitId ?? it?.unit?.id ?? ''),
          product_reference,
          designation,
          quantite,
          prix_achat: Number(it?.prix_achat ?? it?.pa ?? 0) || 0,
          cout_revient: Number(it?.cout_revient ?? it?.cr ?? 0) || 0,
          prix_unitaire: prixUnitaire,
          kg,
          unite_special: it.unite_special ? 1 : 0,
          nbr_barre: it.nbr_barre ?? '',
          facteur_barre: it.facteur_barre ?? null,
          total,
          unite: it?.unite ?? 'pièce',
        };
      })
      .filter(Boolean);

    return normalized.length
      ? normalized
      : [
          {
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
          },
        ];
  };

  const seedRawFromItems = (items: any[], bonType: string) => {
    setUnitPriceRaw(() => {
      const next: Record<number, string> = {};
      (items || []).forEach((it: any, idx: number) => {
        const v = bonType === 'Commande' ? it?.prix_achat : it?.prix_unitaire;
        next[idx] = v === undefined || v === null ? '' : String(v);
      });
      return next;
    });
    setQtyRaw(() => {
      const next: Record<number, string> = {};
      (items || []).forEach((it: any, idx: number) => {
        const q = it?.quantite;
        next[idx] = q === undefined || q === null ? '' : String(q);
      });
      return next;
    });
  };


  const createEmptyItem = () => ({
    _rowId: makeRowId(),
    line_mode: 'normal',
    product_id: '',
    product_reference: '',
    designation: '',
    designation_custom: '',
    quantite: 0,
    prix_achat: 0,
    prix_gros: 0,
    prix_unitaire: 0,
    cout_revient: 0,
    kg: 0,
    total: 0,
    unite: 'pièce',
    product_snapshot_id: null,
    unite_special: 0,
    nbr_barre: '',
    facteur_barre: null,
  });

  const createDetailedItem = () => ({
    ...createEmptyItem(),
    line_mode: 'detail',
    quantite: 1,
  });

  const appendEmptyItems = (requestedCount: number, focusLastRow = false) => {
    const count = Math.max(1, Math.min(100, Math.floor(requestedCount || 0)));
    const current = formikRef.current?.values ?? { items: [] };
    const currentItems = Array.isArray(current.items) ? current.items : [];
    const startIndex = currentItems.length;
    const newItems = Array.from({ length: count }, () => createEmptyItem());

    formikRef.current?.setFieldValue('items', [...currentItems, ...newItems]);
    setUnitPriceRaw((prev) => {
      const next = { ...prev };
      for (let i = 0; i < count; i += 1) {
        next[startIndex + i] = '0';
      }
      return next;
    });
    setQtyRaw((prev) => {
      const next = { ...prev };
      for (let i = 0; i < count; i += 1) {
        next[startIndex + i] = '0';
      }
      return next;
    });

    if (focusLastRow) {
      setTimeout(() => {
        const idx = startIndex + count - 1;
        const btn = document.querySelector(
          `[data-row="${idx}"][data-col="product"]`
        ) as HTMLElement | null;
        if (btn) (btn as any).focus?.();
      }, 50);
    }

    return startIndex;
  };

  const appendDetailedItem = () => {
    const current = formikRef.current?.values ?? { items: [] };
    const currentItems = Array.isArray(current.items) ? current.items : [];
    const startIndex = currentItems.length;

    formikRef.current?.setFieldValue('items', [...currentItems, createDetailedItem()]);
    setUnitPriceRaw((prev) => ({ ...prev, [startIndex]: '0' }));
    setQtyRaw((prev) => ({ ...prev, [startIndex]: '1' }));

    return startIndex;
  };

  const sanitizeFileSegment = (value: string | number | null | undefined, fallback = 'bon') => {
    if (value == null) return fallback;
    const cleaned = String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return cleaned || fallback;
  };

  const resolveBonContacts = (bonType: string, formValues: any) => {
    let clientContact: any;
    let fournisseurContact: any;

    if (['Sortie', 'Comptant', 'Avoir', 'AvoirComptant', 'AvoirEcommerce', 'Devis'].includes(bonType)) {
      const clientId = formValues?.client_id ?? formValues?.contact_id;
      if (clientId != null) {
        const found = clients.find((c: any) => String(c.id) === String(clientId));
        if (found) {
          clientContact = {
            ...found,
            email: found.email || '',
            adresse: found.adresse || '',
            telephone: found.telephone || '',
          };
        }
      }
      if (!clientContact && formValues?.client_nom) {
        clientContact = {
          nom_complet: formValues.client_nom,
          telephone: formValues.phone || '',
          email: formValues.customer_email || formValues.client_email || '',
          adresse: formValues.adresse_livraison || formValues.client_adresse || '',
          societe: formValues.client_societe || '',
        };
      }
    }

    if (['Commande', 'AvoirFournisseur'].includes(bonType)) {
      const fournisseurId = formValues?.fournisseur_id ?? formValues?.contact_id;
      if (fournisseurId != null) {
        const found = fournisseurs.find((f: any) => String(f.id) === String(fournisseurId));
        if (found) {
          fournisseurContact = {
            ...found,
            email: found.email || '',
            adresse: found.adresse || '',
            telephone: found.telephone || '',
          };
        }
      }
      if (!fournisseurContact && formValues?.fournisseur_nom) {
        fournisseurContact = {
          nom_complet: formValues.fournisseur_nom,
          telephone: formValues.phone || '',
          email: formValues.fournisseur_email || '',
          adresse: formValues.adresse_livraison || formValues.fournisseur_adresse || '',
          societe: formValues.fournisseur_societe || '',
        };
      }
    }

    return { clientContact, fournisseurContact };
  };

  const normalizeBonItemsForPdf = (bonType: string, formValues: any) => {
    const sourceItems = Array.isArray(formValues?.items) ? formValues.items : [];
    return sourceItems.map((item: any, index: number) => {
      const productId = item?.product_id ?? item?.id ?? item?.produit_id ?? '';
      const product = productId ? productMap.get(String(productId)) : undefined;
      const designation = item?.designation
        || item?.nom
        || item?.name
        || product?.designation
        || product?.nom
        || product?.name
        || `Article ${index + 1}`;
      const description = item?.description || product?.description || '';
      const qtyRawValue = item?.quantite ?? item?.qty ?? 0;
      const qtyNumber = Number(parseFloat(String(qtyRawValue).replace(',', '.')));
      const quantite = Number.isFinite(qtyNumber) ? qtyNumber : 0;
      const priceSource = bonType === 'Commande'
        ? (item?.prix_achat ?? product?.prix_achat ?? item?.prix_unitaire ?? item?.prix ?? 0)
        : (item?.prix_unitaire ?? item?.prix ?? product?.prix_vente ?? product?.prix ?? 0);
      const priceNumber = Number(parseFloat(String(priceSource).replace(',', '.')));
      const prix_unitaire = Number.isFinite(priceNumber) ? priceNumber : 0;
      return {
        ...item,
        product_id: productId,
        designation,
        description,
        quantite,
        prix_unitaire,
      };
    });
  };

  const sendBonViaWhatsAppWithPdf = async (params: {
    bonType: string;
    numero?: string;
    bonRecord: any;
    formValues: any;
    phone: string;
    bonId?: number;
    montantTotalValue?: number;
  }) => {
    const { bonType, numero, bonRecord, formValues, phone, bonId, montantTotalValue } = params;
    if (!phone) {
      throw new Error('Numéro de téléphone introuvable pour ce bon.');
    }
    if (isSendingWhatsAppPdf) {
      throw new Error('Un envoi WhatsApp est déjà en cours.');
    }

    setIsSendingWhatsAppPdf(true);
    try {
      const normalizedItems = normalizeBonItemsForPdf(bonType, formValues);
      const { clientContact, fournisseurContact } = resolveBonContacts(bonType, formValues);
      const contactName = clientContact?.nom_complet
        || fournisseurContact?.nom_complet
        || formValues?.client_nom
        || formValues?.fournisseur_nom
        || '';
      const montant = Number(
        Number.isFinite(montantTotalValue) ? montantTotalValue : (formValues?.montant_total ?? bonRecord?.montant_total ?? 0)
      ).toFixed(2);
      const dateValue = bonRecord?.date_creation || formValues?.date_creation;
      const messageLines = [
        contactName ? `Bonjour ${contactName}` : 'Bonjour',
        `Type: ${bonType}`,
        numero ? `Numéro: ${numero}` : '',
        `Montant: ${montant} DH`,
        dateValue ? `Date: ${formatDateTimeWithHour(dateValue)}` : '',
        formValues?.adresse_livraison ? `Adresse: ${formValues.adresse_livraison}` : '',
        formValues?.lieu_charge ? `Lieu de chargement: ${formValues.lieu_charge}` : (formValues?.lieu_chargement ? `Lieu de chargement: ${formValues.lieu_chargement}` : ''),
        formValues?.observations ? `Note: ${formValues.observations}` : '',
        normalizedItems.length
          ? 'Articles:\n' + normalizedItems.map((it: any) => {
              const unit = it.prix_unitaire || it.prix || 0;
              return `  - ${it.designation || ''} x${it.quantite || 0} @ ${Number(unit).toFixed(2)} DH`;
            }).join('\n')
          : '',
        'Merci.'
      ].filter(Boolean);

      const bonForTemplate = {
        ...bonRecord,
        ...formValues,
        type: bonType,
        numero: numero || bonRecord?.numero,
        items: normalizedItems,
        phone: formValues?.phone || bonRecord?.phone,
      };

      const pdfElement = (
        <BonPrintTemplate
          bon={bonForTemplate}
          client={clientContact as Contact | undefined}
          fournisseur={fournisseurContact as Contact | undefined}
          products={products as any}
          size="A4"
        />
      );

      const pdfBlob = await generatePDFBlobFromElement(pdfElement);
      const safeNumero = sanitizeFileSegment(numero || bonType);
      const fileName = `${safeNumero}-${Date.now()}.pdf`;

      const uploadResult = await uploadBonPdf(pdfBlob, fileName, {
        token: token || undefined,
        bonId,
        bonType,
      });

      const baseForUrl = apiBaseUrl || window.location.origin;
      const mediaUrl = uploadResult.absoluteUrl
        || `${baseForUrl.replace(/\/$/, '')}${uploadResult.url.startsWith('/') ? '' : '/'}${uploadResult.url}`;

      const whatsappMessage = messageLines.join('\n');
      const result = await sendWhatsApp(phone, whatsappMessage, [mediaUrl], token || undefined);
      showSuccess('Message WhatsApp envoyé avec PDF.');
      return result;
    } finally {
      setIsSendingWhatsAppPdf(false);
    }
  };

  /* -------------------- Helpers décimaux pour prix_unitaire -------------------- */
  const normalizeDecimal = (s: string) => s.replace(/\s+/g, '').replace(',', '.');
  const isDecimalLike = (s: string) => /^[0-9]*[.,]?[0-9]*$/.test(s);
  // Ne pas arrondir automatiquement; retourner la valeur telle quelle (normalisée) sans réduire la précision
  const formatNumber = (n: number) => (isFinite(n) ? String(n) : '0');
  // Format d'affichage sans perte de précision utilisateur (supprime juste les zéros finaux inutilement longs)
  const formatFull = (n: number) => {
    if (!Number.isFinite(n)) return '0';
    let s = String(n);
    // Si représentation flottante longue type 3.3000000000000003, tenter un arrondi léger à 12 décimales
    if (/\.\d{10,}/.test(s)) {
      const rounded = Math.round(n * 1e12) / 1e12;
      s = String(rounded);
    }
    if (s.includes('.')) s = s.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'');
    return s;
  };

  // Saisie brute par ligne pour "prix_unitaire"
  const [unitPriceRaw, setUnitPriceRaw] = useState<Record<number, string>>({});
  // When user clicks other controls (variant/unit/product), we suppress the async price onBlur commit
  // to avoid race conditions (blur finishing after onChange).
  const suppressPriceBlurRef = useRef<{ row: number; ts: number } | null>(null);
// 🆕 Saisie brute par ligne pour "quantite"
const [qtyRaw, setQtyRaw] = useState<Record<number, string>>({});

  const getCommandeSpecialFields = (item: any, quantite: number) => {
    const isSpecial = !!item?.unite_special;
    const nbrBarre = isSpecial ? parseFloat(normalizeDecimal(String(item?.nbr_barre ?? '0'))) || 0 : 0;
    return {
      unite_special: isSpecial ? 1 : 0,
      nbr_barre: isSpecial ? nbrBarre : null,
      facteur_barre: isSpecial && nbrBarre > 0 ? quantite / nbrBarre : null,
    };
  };

  const getSnapshotBarreFactor = (item: any) => {
    if (!item?.unite_special) return 0;
    const factor = parseFloat(normalizeDecimal(String(item?.facteur_barre ?? '0'))) || 0;
    return factor > 0 ? factor : 0;
  };

  // Backend mouvement preview (debounced) to keep displayed mouvement aligned with server during edits
  useEffect(() => {
    if (!isOpen) return;

    // Only meaningful for these types (same as BonsPage column)
    const type = String((formikRef.current?.values as any)?.type || currentTab || '');
    if (!['Sortie', 'Comptant', 'Charge', 'AvoirCharge', 'Avoir', 'AvoirComptant'].includes(type)) return;

    const handle = setTimeout(() => {
      try {
        const values = (formikRef.current?.values as any) || {};
        const items = Array.isArray(values.items) ? values.items : [];
        const payloadItems = items.map((item: any, idx: number) => {
          const q = parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
          const enteredPrice = parseFloat(normalizeDecimal(unitPriceRaw[idx] ?? String(item.prix_unitaire ?? ''))) || 0;
          const rm = parseFloat(normalizeDecimal(remiseRaw[idx] ?? String(item.remise_montant ?? ''))) || 0;
          const cr = parseFloat(normalizeDecimal(String(item.cout_revient ?? item.cout_rev ?? item.cout ?? ''))) || 0;
          const pa = parseFloat(normalizeDecimal(String(item.prix_achat ?? item.pa ?? item.prixA ?? ''))) || 0;
          const pu = type === 'Charge' && item?.product_id ? (cr || pa) : enteredPrice;
          return {
            ...item,
            quantite: q,
            prix_unitaire: pu,
            remise_montant: rm,
            cout_revient: cr,
            prix_achat: pa,
          };
        });

        previewMouvement({ type, items: payloadItems });
      } catch {
        // ignore preview errors
      }
    }, 350);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentTab, qtyRaw, unitPriceRaw, remiseRaw, showRemisePanel]);
  /* ----------------------- Initialisation des valeurs ----------------------- */
  const getInitialValues = () => {
  const isRequiredUnpaidComptant =
    currentTab === 'Comptant' && comptantPartialPaymentMode === 'required';

  if (initialValues) {
  // (formatDateForInput removed - unused after refactor)

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

      // ── Pre-merge FIFO-split rows using raw backend values ──
      // FIFO rows share same product_id + variant_id; ALWAYS merge same product+variant on edit.
      // The user explicitly wants a single visual line per product, snapshots collected for display.
      const preMergeMap = new Map<string, any>();
      const preMergedRaw: any[] = [];
      for (const it of (rawItems || [])) {
        const pid = String(it.product_id ?? it.produit_id ?? it.product?.id ?? '');
        const vid = String(it.variant_id ?? it.variantId ?? it.variant?.id ?? '');
        if (!pid) {
          // Skip merging for items without a product (custom designation lines)
          preMergedRaw.push({ ...it, _merged_snapshot_ids: it.product_snapshot_id ? [it.product_snapshot_id] : [] });
          continue;
        }
        const key = `${pid}:${vid}`;
        if (preMergeMap.has(key)) {
          const ex = preMergeMap.get(key)!;
          ex.quantite = Number(ex.quantite ?? 0) + Number(it.quantite ?? 0);
          ex.total = Number(ex.total ?? 0) + Number(it.total ?? 0);
          if (it.product_snapshot_id) {
            if (!Array.isArray(ex._merged_snapshot_ids)) ex._merged_snapshot_ids = [];
            if (!ex._merged_snapshot_ids.includes(it.product_snapshot_id)) {
              ex._merged_snapshot_ids.push(it.product_snapshot_id);
            }
          }
          ex.product_snapshot_id = null;
        } else {
          const clone = { ...it, _merged_snapshot_ids: it.product_snapshot_id ? [it.product_snapshot_id] : [] };
          preMergeMap.set(key, clone);
          preMergedRaw.push(clone);
        }
      }

      const normalizedItems = (preMergedRaw || []).map((it: any) => {
        const toIdString = (v: any): string => {
          if (v == null || v === '') return '';
          // Handle mysql Buffer-like values defensively
          if (typeof v === 'object' && v?.type === 'Buffer' && Array.isArray(v?.data)) {
            try {
              const asText = new TextDecoder().decode(Uint8Array.from(v.data.map((n: any) => Number(n) || 0)));
              return asText || '';
            } catch {
              return '';
            }
          }
          return String(v);
        };

        const resolvedCostContext = resolveItemCostContext(it, products as any[], snapshotProducts as any[]);
        const productFound = resolvedCostContext.product;
        const snapshotFound = resolvedCostContext.snapshot;
        const variantFound = resolvedCostContext.variant;

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

  const kg = Number(it.kg ?? it.kg_value ?? it.product_kg ?? it.product?.kg ?? it.produit?.kg ?? 0) || 0;

        // Resolve unit conversion factor
        const unitId = it.unit_id ?? it.unitId ?? it.unit?.id;
        let convFactor = 1;
        if (unitId && productFound?.units?.length) {
          const unitObj = (productFound.units as any[]).find((u: any) => String(u.id) === String(unitId));
          if (unitObj) {
            const isBase = unitObj.is_default || unitObj.facteur_isNormal;
            if (!isBase) {
              const f = Number(unitObj.conversion_factor) || 1;
              if (f > 0) convFactor = f;
            }
          }
        }

        const isCommandeEdit = initialValues?.type === 'Commande';

        // Priority: snapshot → variant → item → product catalog
        // For Commande edit mode, keep the purchase price stored on the bon item itself.
        if (!isCommandeEdit && (snapshotFound || variantFound)) {
          // Snapshot/variant are the authoritative source for COST only (PA/CR)
          // prix_unitaire (selling price) comes from the bon items table, NOT from snapshot
          const bestPA = Number(snapshotFound?.prix_achat) || Number(variantFound?.prix_achat);
          const bestCR = Number(snapshotFound?.cout_revient) || Number(variantFound?.cout_revient);
          if (bestPA) prix_achat = scaleDecimal(bestPA, convFactor);
          if (bestCR) cout_revient = scaleDecimal(bestCR, convFactor);
        } else {
          // No snapshot/variant — use item values or fallback to product catalog
          if (!prix_achat || prix_achat === 0) {
            if (isCommandeEdit && prix_unitaire > 0) {
              prix_achat = prix_unitaire;
            } else {
              const basePA = Number((productFound as any)?.prix_achat) || 0;
              prix_achat = basePA ? scaleDecimal(basePA, convFactor) : prix_achat;
            }
          }
          if (!cout_revient || cout_revient === 0) {
            const baseCR = Number((productFound as any)?.cout_revient) || 0;
            cout_revient = baseCR ? scaleDecimal(baseCR, convFactor) : cout_revient;
          }
          if (!prix_unitaire || prix_unitaire === 0) {
            prix_unitaire = Number((productFound as any)?.prix_vente) || prix_unitaire;
          }
        }

        if (resolvedCostContext.source !== 'item') {
          if (!isCommandeEdit) {
            prix_achat = resolvedCostContext.prix_achat;
          }
          cout_revient = resolvedCostContext.cout_revient;
        }

        if (productFound) {
          try {
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

        // Preserve variant/unit selection in edit mode
        const variant_id = toIdString(it.variant_id ?? it.variantId ?? it.variant?.id);
        const unit_id = toIdString(it.unit_id ?? it.unitId ?? it.unit?.id);
        if (initialValues?.type !== 'Commande' && variant_id && productFound?.variants?.length) {
          const catalogVariant = (productFound.variants as any[]).find((v: any) => String(v.id) === String(variant_id));
          if (catalogVariant) {
            const variantPrixVente = Number(catalogVariant.prix_vente ?? (productFound as any)?.prix_vente ?? prix_unitaire) || 0;
            prix_unitaire = scaleDecimal(variantPrixVente, convFactor);
          }
        }

        const quantite = Number(it.quantite ?? it.qty ?? 0) || 0;
        const total = quantite * prix_unitaire;
        const normalizedProductId = it.product_id ?? it.produit_id ?? it.productId ?? it.product?.id ?? it.produit?.id;
        const isFreeChargeLine = ['Charge', 'AvoirCharge'].includes(String(initialValues?.type || currentTab || '')) && !normalizedProductId;
        const normalizedDesignation = it.designation ?? it.product_designation ?? it.product?.designation ?? it.produit?.designation ?? '';

        return {
          _rowId: it._rowId || makeRowId(), // id stable
          ...it,
          line_mode: isFreeChargeLine ? 'detail' : (it.line_mode || 'normal'),
          product_id: normalizedProductId,
          variant_id,
          unit_id,
          product_reference:
            it.product_reference ??
            it.variant_reference ??
            it.reference ??
            (it.product?.reference ?? it.produit?.reference) ??
            (it.product_id ? String(it.product_id) : ''),
          designation: normalizedDesignation,
          designation_custom: it.designation_custom ?? (isFreeChargeLine ? normalizedDesignation : ''),
          variant_name: it.variant_name ?? it.variant?.variant_name ?? '',
          variant_reference: it.variant_reference ?? it.variant?.reference ?? '',
          quantite,
          prix_achat,
          cout_revient,
          prix_unitaire,
          kg,
          unite_special: it.unite_special ? 1 : 0,
          nbr_barre: it.nbr_barre ?? '',
          facteur_barre: it.facteur_barre ?? null,
          total,
        };
      });

      // ── Merge items with same product_id + variant_id into a single row ──
      // This collapses FIFO-split rows back into one visible line.
      // On re-submit, the FIFO logic will re-split them to the correct snapshots.
      const mergedItems: any[] = [];
      const mergeMap = new Map<string, any>();
      for (const item of normalizedItems) {
        if (!item.product_id) {
          mergedItems.push({ ...item, merged_snapshot_ids: Array.isArray(item._merged_snapshot_ids) ? item._merged_snapshot_ids : (item.product_snapshot_id ? [item.product_snapshot_id] : []) });
          continue;
        }
        const key = `${item.product_id}:${item.variant_id || ''}`;
        if (mergeMap.has(key)) {
          const existing = mergeMap.get(key)!;
          existing.quantite = Number(existing.quantite) + Number(item.quantite || 0);
          existing.total = Number(existing.total) + Number(item.total || 0);
          // Collect snapshot IDs not already tracked by pre-merge
          const incomingIds: any[] = Array.isArray(item._merged_snapshot_ids) ? item._merged_snapshot_ids : (item.product_snapshot_id ? [item.product_snapshot_id] : []);
          for (const sid of incomingIds) {
            if (sid && !existing.merged_snapshot_ids.includes(sid)) existing.merged_snapshot_ids.push(sid);
          }
          existing.product_snapshot_id = null;
        } else {
          // Prefer pre-merge snapshot list if available
          const snapIds: any[] = Array.isArray(item._merged_snapshot_ids) ? item._merged_snapshot_ids : (item.product_snapshot_id ? [item.product_snapshot_id] : []);
          const merged = {
            ...item,
            merged_snapshot_ids: snapIds,
          };
          mergeMap.set(key, merged);
          mergedItems.push(merged);
        }
      }

      return {
        ...initialValues,
        client_id: (initialValues.client_id || '').toString(),
        fournisseur_id: (initialValues.fournisseur_id || '').toString(),
        vehicule_id: (initialValues.vehicule_id || '').toString(),
        ecommerce_order_id: String((initialValues as any).ecommerce_order_id || ''),
        order_number: String((initialValues as any).order_number || ''),
        customer_name: String((initialValues as any).customer_name || (initialValues as any).client_nom || ''),
        customer_email: String((initialValues as any).customer_email || ''),
        livraisons: Array.isArray((initialValues as any)?.livraisons)
          ? (initialValues as any).livraisons.map((l: any) => ({ vehicule_id: String(l.vehicule_id || ''), user_id: l.user_id ? String(l.user_id) : '' }))
          : [],
        lieu_charge: initialValues.lieu_chargement || initialValues.lieu_charge || '',
        date_bon: formatMySQLToDateTimeInput(initialValues.date_creation || initialValues.date_bon || '') || getCurrentDateTimeInput(),
        items: mergedItems,
        montant_ht: initialValues.montant_ht || 0,
        montant_total: initialValues.montant_total || 0,
        montant_ignorer: Number((initialValues as any).montant_ignorer || 0),
        client_nom: initialValues.client_nom || '',
        client_adresse: initialValues.client_adresse || '',
        client_societe: initialValues.client_societe || initialValues.societe || '',
        fournisseur_nom: initialValues.fournisseur_nom || '',
        fournisseur_adresse: initialValues.fournisseur_adresse || '',
        fournisseur_societe: initialValues.fournisseur_societe || '',
  adresse_livraison: initialValues.adresse_livraison || initialValues.adresse_livraison || '',
  phone: initialValues.phone || initialValues.customer_phone || '',
        vendre_au_fournisseur: initialValues.vendre_au_fournisseur === true || initialValues.vendre_au_fournisseur === 1 || String(initialValues.vendre_au_fournisseur) === '1',
        isNotCalculated: initialValues.isNotCalculated === true || initialValues.isNotCalculated === 1 ? true : false,
        payer_partiellement: initialValues.non_paye === true || initialValues.non_paye === 1 || false,
        reste: initialValues.reste || 0,
        montant_paye_saisi: '',
        statut: initialValues.statut || 'En attente',
        inclus_en_caisse: Number((initialValues as any)?.inclus_en_caisse) === 1,
      };
    }

    return {
  type: currentTab,
      date_bon: getCurrentDateTimeInput(),
  vehicule_id: '',
  livraisons: [] as Array<{ vehicule_id: string; user_id?: string }>,
      lieu_charge: '',
      date_validation: '',
  statut: 'En attente',
  phone: '',
      client_id: '',
      client_nom: '',
      client_adresse: '',
      client_societe: '',
      fournisseur_id: '',
      fournisseur_nom: '',
      fournisseur_adresse: '',
      fournisseur_societe: '',
      vendre_au_fournisseur: (currentTab === 'Sortie' || currentTab === 'Avoir') && defaultVendreAuFournisseur,
    ecommerce_order_id: '',
    order_number: '',
    customer_name: '',
    customer_email: '',
      adresse_livraison: '',
      montant_ht: 0,
      montant_total: 0,
      montant_ignorer: 0,
      isNotCalculated: false,
      payer_partiellement: isRequiredUnpaidComptant,
      reste: 0,
      montant_paye_saisi: isRequiredUnpaidComptant ? '0' : '',
      items: [
        {
          _rowId: makeRowId(), // id stable
          product_id: '',
          product_reference: '',
          designation: '',
          designation_custom: '',
          quantite: 0,
          prix_achat: 0,
          prix_gros: 0,
          prix_unitaire: 0,
          cout_revient: 0,
          kg: 0,
          total: 0,
          unite: 'pièce',
          product_snapshot_id: null,
          unite_special: 0,
          nbr_barre: '',
          facteur_barre: null,
        },
      ],
      is_transformed: false,
      inclus_en_caisse: false,
      created_by: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

  // Mémoïser les initial values pour éviter les resets Formik intempestifs
  const initialFormValues = useMemo(
    () => getInitialValues(),
    [currentTab, initialValues?.id, comptantPartialPaymentMode, defaultVendreAuFournisseur] // ne PAS inclure products ici
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

  // Auto-open remise panel in edit mode if this bon already has remises applied
  try {
    const type = String((initialValues as any)?.type || currentTab || '');
    if ((type === 'Sortie' || type === 'Comptant') && initialValues) {
      const hasItemRemise = (items || []).some((it: any) => {
        const m = Number(it?.remise_montant ?? 0);
        const p = Number(it?.remise_pourcentage ?? 0);
        // Use a small epsilon for float comparison to avoid false positives on 0
        return Math.abs(m) > 0.001 || Math.abs(p) > 0.001;
      });
      const hasHeaderTarget = Number((initialValues as any)?.remise_is_client ?? 1) === 0;
      // Only auto-open if there is an ACTUAL non-zero remise
      const shouldOpen = Boolean(hasItemRemise || hasHeaderTarget);
      
      // Force panel CLOSED if no actual remise exists, even if previously open
      if (!shouldOpen) {
        setShowRemisePanel(false);
      } else {
        setShowRemisePanel(true);
        if (type === 'Comptant') {
          // Comptant has no client_id in most cases
          setRemiseTargetIsBonClient(false);
        }
      }
    } else {
      setShowRemisePanel(false);
    }
  } catch {
    setShowRemisePanel(false);
  }

  // Seed remise target for Sortie/Comptant in edit mode
  try {
    const type = String((initialValues as any)?.type || currentTab || '');
    if ((type === 'Sortie' || type === 'Comptant') && initialValues) {
      const isClient = Number((initialValues as any)?.remise_is_client ?? 1) === 1;
      setRemiseTargetIsBonClient(isClient);
      if (!isClient) {
        const rid = (initialValues as any)?.remise_id;
        const parsed = rid == null || rid === '' ? '' : Number(rid);
        setSelectedRemiseId(Number.isFinite(parsed as any) ? (parsed as any) : '');
      } else {
        setSelectedRemiseId('');
      }
    } else {
      setRemiseTargetIsBonClient(true);
      setSelectedRemiseId('');
    }
  } catch {
    setRemiseTargetIsBonClient(true);
    setSelectedRemiseId('');
  }
  setLocalCreatedRemiseClients([]);
}, [initialFormValues]);

  // Quand on ouvre pour créer un NOUVEAU (pas d'initialValues), forcer un reset complet pour vider tout résidu
  useEffect(() => {
    if (isOpen && !initialValues) {
      const fresh = getInitialValues();
      if (formikRef.current) {
        formikRef.current.resetForm({ values: fresh });
      }
      setUnitPriceRaw({});
      setQtyRaw({});
      setRemiseRaw({});
      setSelectedRemiseId('');
      setRemiseTargetIsBonClient(true);
      setLocalCreatedRemiseClients([]);
      setShowRemisePanel(false);
      setPdgApprovedOverLimit(null); // Reset PDG approval
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialValues]);

  // Reset PDG approval when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPdgApprovedOverLimit(null);
    }
  }, [isOpen]);

  // 🔧 Patch item prices from snapshot/product data when async queries finish loading
  // This handles the case where getInitialValues() ran before products/snapshots were available
  // Also ensures cout_revient & prix_achat are always unit-adjusted when a unit is selected
  useEffect(() => {
    if (!isOpen || !formikRef.current) return;
    if (!(products as any[])?.length && !(snapshotProducts as any[])?.length) return;
    const items = formikRef.current.values?.items || [];
    let anyPatched = false;
    items.forEach((item: any, idx: number) => {
      if (!item.product_id) return;

      const prod = (products as any[]).find((p: any) => String(p.id) === String(item.product_id));

      // Resolve snapshot if available
      const snapId = item.product_snapshot_id;
      const snap = snapId && (snapshotProducts as any[])?.length
        ? (snapshotProducts as any[]).find((s: any) => String(s.snapshot_id) === String(snapId))
        : null;

      // Resolve variant
      const variant = item.variant_id && prod?.variants
        ? (prod.variants as any[]).find((v: any) => String(v.id) === String(item.variant_id))
        : null;

      // Base PA/CR from best source: snapshot → variant → product catalog
      const meta = resolveCatalogMetaForItem(item, prod, snap, variant);
      const currentRef = String(item.product_reference ?? item.reference ?? '').trim();
      const currentDesignation = String(item.designation ?? item.product_designation ?? '').trim();
      if (meta.reference && (!currentRef || currentRef === String(item.product_id))) {
        formikRef.current!.setFieldValue(`items.${idx}.product_reference`, meta.reference);
        anyPatched = true;
      }
      if (meta.designation && !currentDesignation) {
        formikRef.current!.setFieldValue(`items.${idx}.designation`, meta.designation);
        anyPatched = true;
      }
      if (meta.variantName && !String(item.variant_name ?? '').trim()) {
        formikRef.current!.setFieldValue(`items.${idx}.variant_name`, meta.variantName);
        anyPatched = true;
      }

      const latestSnap = findLatestSnapshotForProductVariant(snapshotProducts as any[], item.product_id, item.variant_id);
      const bestPA = Number(latestSnap?.prix_achat) || Number(variant?.prix_achat) || Number(prod?.prix_achat) || Number(snap?.prix_achat) || 0;
      const bestCR = Number(latestSnap?.cout_revient) || Number(latestSnap?.prix_achat) || Number(variant?.cout_revient) || Number(prod?.cout_revient) || Number(snap?.cout_revient) || bestPA || 0;

      if (!bestPA && !bestCR) return;

      // Resolve unit conversion factor
      let convFactor = 1;
      if (item.unit_id && prod?.units?.length) {
        const unitObj = (prod.units as any[]).find((u: any) => String(u.id) === String(item.unit_id));
        if (unitObj) {
          const isBase = unitObj.is_default || unitObj.facteur_isNormal;
          if (!isBase) {
            const f = Number(unitObj.conversion_factor) || 1;
            if (f > 0) convFactor = f;
          }
        }
      }

      // ALWAYS apply: base value × unit conversion factor
      // prix_unitaire is NOT patched — it comes from the bon items table (actual selling price)
      const currentPA = Number(item.prix_achat) || 0;
      const currentCR = Number(item.cout_revient) || 0;
      const finalPA = scaleDecimal(bestPA, convFactor);
      const finalCR = scaleDecimal(bestCR, convFactor);
      const resolvedPA = finalPA;
      const resolvedCR = finalCR;
      if (resolvedPA > 0 && currentPA !== resolvedPA) {
        formikRef.current!.setFieldValue(`items.${idx}.prix_achat`, resolvedPA);
        anyPatched = true;
      }
      if (resolvedCR > 0 && currentCR !== resolvedCR) {
        formikRef.current!.setFieldValue(`items.${idx}.cout_revient`, resolvedCR);
        anyPatched = true;
      }
      if (snap && item.unite_special == null && Number(snap.snapshot_unite_special || 0) === 1) {
        formikRef.current!.setFieldValue(`items.${idx}.unite_special`, 1);
        formikRef.current!.setFieldValue(`items.${idx}.facteur_barre`, Number(snap.snapshot_facteur_barre || 0) || null);
        anyPatched = true;
      }
    });
    if (anyPatched) {
      console.log('🔧 [UNIT/SNAPSHOT PATCH] Patched item PA/CR with unit conversion factor');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotProducts, products, isOpen]);

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
    return (currentType === 'Sortie' || currentType === 'Comptant') ? [...base, 'remise'] : [...base];
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
  if (submitInProgressRef.current) {
    return;
  }
  submitInProgressRef.current = true;
  setIsSavingBon(true);
  try {

    const selectedClientId = values.client_id ? Number(values.client_id) : null;
    const selectedClient = selectedClientId
      ? allClients.find((c: any) => Number(c?.id) === selectedClientId)
      : null;
    if (selectedClient && isContactBlocked(selectedClient)) {
      showError(`Client bloque: ${selectedClient.nom_complet || selectedClientId}. Vous ne pouvez pas creer un bon ou un avoir pour ce client.`);
      setSubmitting(false);
      return;
    }
    if (isChefChauffeur && !isEditMode) {
      showError('Permission refusée: Chef Chauffeur ne peut pas créer des bons/avoirs.');
      setSubmitting(false);
      return;
    }

    // Validation stricte: chaque ligne produit doit avoir une quantité > 0
    const invalidQtyRows: number[] = Array.isArray(values.items)
      ? values.items
          .map((item: any, idx: number) => {
            const q = parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item?.quantite ?? '')));
            return !Number.isFinite(q) || q <= 0 ? idx : -1;
          })
          .filter((i: number) => i >= 0)
      : [];
    if (invalidQtyRows.length > 0) {
      const humanRows = invalidQtyRows.map((i) => i + 1).join(', ');
      const msg = `Chaque produit doit avoir une quantité strictement supérieure à 0. Lignes concernées: ${humanRows}.`;
      setFieldError?.('items', msg);
      showError(msg);
      // Focaliser la première ligne invalide sur la cellule quantité
      try { setTimeout(() => focusCell(invalidQtyRows[0], 'qty'), 0); } catch {}
      setSubmitting(false);
      return;
    }

    if (values.type === 'Charge' || values.type === 'AvoirCharge') {
      const invalidDesignationRows = Array.isArray(values?.items)
        ? values.items
            .map((item: any, idx: number) => {
              if (item?.line_mode !== 'detail') {
                return String(item?.product_id || '').trim() ? -1 : idx;
              }
              const hasProduct = String(item?.product_id || '').trim() !== '';
              const designation = String(item?.designation_custom ?? item?.designation ?? '').trim();
              return hasProduct || designation ? -1 : idx;
            })
            .filter((i: number) => i >= 0)
        : [];
      if (invalidDesignationRows.length > 0) {
        const humanRows = invalidDesignationRows.map((i: number) => i + 1).join(', ');
        const msg = `Désignation requise pour les lignes ${humanRows}.`;
        setFieldError?.('items', msg);
        showError(msg);
        setSubmitting(false);
        return;
      }
    }

    // Variant mandatory guard
    const missingVariantRows = Array.isArray(values?.items)
      ? values.items
          .map((item: any, idx: number) => {
            if (item?.line_mode === 'detail' || !item?.product_id) return -1;
            const product = products.find((p: any) => String(p.id) === String(item?.product_id));
            const variants = product?.variants ?? [];
            const hasVariants = Array.isArray(variants) && variants.length > 0;
            const required = hasVariants && !!(product as any)?.isObligatoireVariant;
            const selected = String(item?.variant_id ?? '').trim();
            return required && !selected ? idx : -1;
          })
          .filter((i: number) => i >= 0)
      : [];
    if (missingVariantRows.length > 0) {
      const humanRows = missingVariantRows.map((i: number) => i + 1).join(', ');
      const msg = `Variante obligatoire: veuillez sélectionner une variante pour les lignes ${humanRows}.`;
      setFieldError?.('items', msg);
      showError(msg);
      try { setTimeout(() => focusCell(missingVariantRows[0], 'variant'), 0); } catch {}
      setSubmitting(false);
      return;
    }
    // Suppression du blocage lié au stock: permettre la soumission même si la quantité dépasse le stock

    // Validation prix de vente pour bons/avoirs de vente.
    // Le cout de revient peut etre nul; seul le prix de vente doit etre strictement positif.
    const saleTypes = ['Sortie', 'Comptant', 'Avoir', 'AvoirComptant', 'AvoirEcommerce'];
    if (saleTypes.includes(values.type)) {
      const invalidSalePriceRows: number[] = [];
      (values.items || []).forEach((item: any, idx: number) => {
        if (item?.line_mode === 'detail') return;
        if (!item?.product_id && !item?.designation_custom && !item?.designation) return;
        const rawPrice = unitPriceRaw[idx] !== undefined && unitPriceRaw[idx] !== ''
          ? unitPriceRaw[idx]
          : item.prix_unitaire;
        const prixVente = typeof rawPrice === 'string'
          ? parseFloat(normalizeDecimal(rawPrice)) || 0
          : Number(rawPrice) || 0;
        if (!Number.isFinite(prixVente) || prixVente <= 0) {
          invalidSalePriceRows.push(idx);
        }
      });
      if (invalidSalePriceRows.length > 0) {
        const rows = invalidSalePriceRows.map((idx) => idx + 1).join(', ');
        const msg = `prix de vente doit etre > 0 (lignes ${rows}).`;
        setFieldError?.('items', msg);
        showError(msg);
        try { setTimeout(() => focusCell(invalidSalePriceRows[0], 'unit'), 0); } catch {}
        setSubmitting(false);
        return;
      }
    }

    const montantTotal = values.items.reduce((sum: number, item: any, idx: number) => {
      const q =
        parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
      
      // Pour bon Commande, utiliser prix_achat; pour autres types (y compris Charge), prix_unitaire
      // Lire depuis unitPriceRaw en priorité (valeur saisie) pour éviter le décalage avec onBlur async
      const priceField = values.type === 'Commande' ? 'prix_achat' : 'prix_unitaire';
      const enteredPrice = unitPriceRaw[idx] !== undefined && unitPriceRaw[idx] !== ''
        ? parseFloat(normalizeDecimal(unitPriceRaw[idx])) || 0
        : (typeof item[priceField] === 'string'
          ? parseFloat(String(item[priceField]).replace(',', '.')) || 0
          : Number(item[priceField]) || 0);
      const u = values.type === 'Charge' && item?.product_id
        ? (Number(item.cout_revient) || Number(item.prix_achat) || 0)
        : enteredPrice;
      return sum + q * u;
    }, 0);

    const requestType = values.type;
    let vehiculeId: number | undefined = undefined;
    if (!['Avoir', 'AvoirCharge', 'AvoirFournisseur', 'AvoirComptant', 'AvoirEcommerce'].includes(requestType) && values.vehicule_id) {
      vehiculeId = parseInt(values.vehicule_id);
    }

    // Préparer les livraisons (multi-véhicules + chauffeur) si fournis
    const livraisonsClean = Array.isArray(values.livraisons)
      ? (values.livraisons as Array<{ vehicule_id: string | number; user_id?: string | number }>)
          .map((l) => {
            const vehId = Number(l?.vehicule_id);
            const userId = l?.user_id === '' || l?.user_id == null ? null : Number(l.user_id);
            return Number.isFinite(vehId) && vehId > 0
              ? { vehicule_id: vehId, user_id: userId }
              : null;
          })
          .filter((x): x is { vehicule_id: number; user_id: number | null } => x !== null)
      : [];

    // Remise target validation (Sortie/Comptant)
    // Only validate if panel is open AND at least one item actually has a remise applied
    const hasAnyItemRemise = (values.items || []).some((it: any) => {
      const m = Number(it?.remise_montant ?? 0) || 0;
      const p = Number(it?.remise_pourcentage ?? 0) || 0;
      return m !== 0 || p !== 0;
    });
    const bonClientId = values.client_id ? Number(values.client_id) : null;
    const bonClientIsAbonne = bonClientId != null && Number.isFinite(bonClientId) && clientAbonneContactIds.has(bonClientId);
    if ((requestType === 'Sortie' || requestType === 'Comptant') && showRemisePanel && hasAnyItemRemise) {
      if (requestType === 'Sortie' && remiseTargetIsBonClient && !values.client_id) {
        const msg = "Choisissez un client pour 'Même client du bon', ou décochez et choisissez un client remise.";
        showError(msg);
        setSubmitting(false);
        return;
      }

      if (!remiseTargetIsBonClient) {
        const hasSelected = typeof selectedRemiseId === 'number';
        if (!hasSelected && !bonClientIsAbonne) {
          const msg = 'Veuillez sélectionner un client remise (ou créer depuis la recherche).';
          showError(msg);
          setSubmitting(false);
          return;
        }
      }
    }

    // Remise target resolution for payload
    // Goal: when editing, do NOT change remise target unless user opened the remise panel.
    const shouldSendRemiseTarget = requestType === 'Sortie' || requestType === 'Comptant';

    const existingRemiseIsClient = initialValues ? Number((initialValues as any)?.remise_is_client ?? 0) : 0;
    const existingRemiseIdRaw = initialValues ? (initialValues as any)?.remise_id : undefined;
    const existingRemiseId =
      existingRemiseIdRaw == null || existingRemiseIdRaw === '' ? null : Number(existingRemiseIdRaw);
    const computeRemiseTargetFromUi = () => {
      if (requestType === 'Comptant') {
        // Comptant often has no client_id; keep target as "other client remise".
        return {
          remise_is_client: 0,
          remise_id: typeof selectedRemiseId === 'number' ? selectedRemiseId : null,
          remise_client_nom: undefined,
        };
      }

      // Sortie
      // Si l'utilisateur a explicitement décoché "Même client du bon" et choisi un client-remise,
      // sa sélection l'emporte (même si le client du bon est abonné).
      if (!remiseTargetIsBonClient) {
        return {
          remise_is_client: 0,
          remise_id: typeof selectedRemiseId === 'number' ? selectedRemiseId : null,
          remise_client_nom: undefined,
        };
      }

      if (bonClientIsAbonne) {
        return { remise_is_client: 1, remise_id: null, remise_client_nom: undefined };
      }

      // remiseTargetIsBonClient = true: backend résout remise_id depuis client_id
      return { remise_is_client: 1, remise_id: null, remise_client_nom: undefined };
    };

    const effectiveRemiseTarget = !shouldSendRemiseTarget
      ? { remise_is_client: undefined, remise_id: undefined, remise_client_nom: undefined }
      : showRemisePanel
      ? computeRemiseTargetFromUi()
      : initialValues
      ? (() => {
          // Logic for existing bons (edit mode) without opening remise panel
          let rawIsClient = Number.isFinite(existingRemiseIsClient) ? (existingRemiseIsClient ? 1 : 0) : 0;
          // Safety: if it says is_client=1 but we have no client_id (e.g. Comptant or unlinked Sortie), force 0
          if (rawIsClient === 1) {
             if (requestType === 'Comptant') rawIsClient = 0;
             if (requestType === 'Sortie' && !values.client_id) rawIsClient = 0;
          }
          return {
            remise_is_client: rawIsClient,
            remise_id: Number.isFinite(existingRemiseId as any) ? (existingRemiseId as any) : null,
            remise_client_nom: undefined,
          };
        })()
      : requestType === 'Comptant'
      ? { remise_is_client: 0, remise_id: null, remise_client_nom: undefined }
      // New Sortie without opening the remise panel: default to the bon client when available.
      : { remise_is_client: values.client_id ? 1 : 0, remise_id: null, remise_client_nom: undefined };

    let cleanBonData: any = {
  date_creation: formatDateInputToMySQL(values.date_bon) || new Date().toISOString().slice(0,19).replace('T',' '), // assure string
      vehicule_id: vehiculeId,
      lieu_chargement: values.lieu_charge || '',
  adresse_livraison: values.adresse_livraison || '',
  phone: values.phone || null,
      isNotCalculated: values.isNotCalculated ? true : null,
      statut: values.statut || 'Brouillon',
  vendre_au_fournisseur: (requestType === 'Sortie' || requestType === 'Avoir') && values.vendre_au_fournisseur ? 1 : undefined,
  client_id: (requestType === 'Comptant' || requestType === 'AvoirComptant' || requestType === 'AvoirEcommerce' || ((requestType === 'Sortie' || requestType === 'Avoir') && values.vendre_au_fournisseur)) ? undefined : (values.client_id ? parseInt(values.client_id) : undefined),
  client_nom: (requestType === 'Comptant' || requestType === 'AvoirComptant' || requestType === 'Devis') ? (values.client_nom || null) : undefined,
  montant_ignorer: requestType === 'Comptant' ? (Number(values.montant_ignorer || 0) || 0) : undefined,
  reste: (requestType === 'Comptant' && values.payer_partiellement) ? (values.reste || 0) : 0,
  non_paye: requestType === 'Comptant' ? !!values.payer_partiellement : undefined,
      fournisseur_id: values.fournisseur_id ? parseInt(values.fournisseur_id) : undefined,
      inclus_en_caisse: (requestType === 'Charge' || requestType === 'Commande') ? (values.inclus_en_caisse ? 1 : 0) : undefined,
      ...(requestType === 'AvoirEcommerce'
        ? {
            ecommerce_order_id: values.ecommerce_order_id ? Number(values.ecommerce_order_id) : undefined,
            order_number: values.order_number || null,
            customer_name: values.client_nom || null,
            customer_email: values.customer_email || null,
            customer_phone: values.phone || null,
          }
        : {}),
      // New remise target stored on Sortie/Comptant header
      remise_is_client: (requestType === 'Sortie' || requestType === 'Comptant') ? effectiveRemiseTarget.remise_is_client : undefined,
      remise_id: (requestType === 'Sortie' || requestType === 'Comptant') ? effectiveRemiseTarget.remise_id : undefined,
      remise_client_nom: (requestType === 'Sortie' || requestType === 'Comptant') ? effectiveRemiseTarget.remise_client_nom : undefined,
      montant_total: montantTotal,
      created_by: user?.id || 1,
      // N'envoyer livraisons que si au moins un véhicule est défini
      livraisons: livraisonsClean.length ? livraisonsClean : undefined,
      items: (requestType === 'Charge' || requestType === 'AvoirCharge')
        ? values.items.flatMap((item: any, idx: number) => {
            const q = parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
            const prixAchat = typeof item.prix_achat === 'string'
              ? parseFloat(String(item.prix_achat).replace(',', '.')) || 0
              : Number(item.prix_achat) || 0;
            const coutRevient = typeof item.cout_revient === 'string'
              ? parseFloat(String(item.cout_revient).replace(',', '.')) || 0
              : Number(item.cout_revient) || 0;
            const prixGros = typeof item.prix_gros === 'string'
              ? parseFloat(String(item.prix_gros).replace(',', '.')) || 0
              : Number(item.prix_gros) || 0;
            const enteredPrice = typeof item.prix_unitaire === 'string'
              ? parseFloat(String(item.prix_unitaire).replace(',', '.')) || 0
              : Number(item.prix_unitaire) || 0;
            const prixVente = requestType === 'Charge' && item?.product_id
              ? (coutRevient || prixAchat)
              : enteredPrice;
            const designation = String(item.line_mode === 'detail' ? (item.designation_custom || item.designation || '') : (item.designation || item.designation_custom || '')).trim();
            if ((!designation && !item.product_id) || q <= 0) return [];
            return [{
              product_id: item.product_id ? parseInt(item.product_id) : null,
              variant_id: item.variant_id ? parseInt(item.variant_id) : null,
              unit_id: item.unit_id ? parseInt(item.unit_id) : null,
              product_snapshot_id: item.product_snapshot_id ? parseInt(item.product_snapshot_id) : null,
              is_indisponible: item.is_indisponible ? 1 : 0,
              designation_custom: designation,
              quantite: q,
              prix_achat: prixAchat,
              cout_revient: coutRevient,
              prix_gros: prixGros,
              prix_unitaire: prixVente,
              total: q * prixVente,
            }];
          })
        : values.items.flatMap((item: any, idx: number) => {
        const q =
          parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
        // Lire depuis unitPriceRaw en priorité (valeur saisie) pour éviter le décalage avec onBlur async
        const pa = unitPriceRaw[idx] !== undefined && unitPriceRaw[idx] !== '' && values.type === 'Commande'
          ? parseFloat(normalizeDecimal(unitPriceRaw[idx])) || 0
          : (typeof item.prix_achat === 'string'
            ? parseFloat(String(item.prix_achat).replace(',', '.')) || 0
            : Number(item.prix_achat) || 0);
        const pu = unitPriceRaw[idx] !== undefined && unitPriceRaw[idx] !== '' && values.type !== 'Commande'
          ? parseFloat(normalizeDecimal(unitPriceRaw[idx])) || 0
          : (typeof item.prix_unitaire === 'string'
            ? parseFloat(String(item.prix_unitaire).replace(',', '.')) || 0
            : Number(item.prix_unitaire) || 0);
        const rp =
          typeof item.remise_pourcentage === 'string'
            ? parseFloat(String(item.remise_pourcentage).replace(',', '.')) || 0
            : Number(item.remise_pourcentage) || 0;
        const rm =
          typeof item.remise_montant === 'string'
            ? parseFloat(String(item.remise_montant).replace(',', '.')) || 0
            : Number(item.remise_montant) || 0;
        // Pour les commandes, on ne souhaite PAS enregistrer un prix de vente ici.
        // On utilise la valeur de prix_achat comme prix_unitaire envoyé au backend
        // (la table conserve uniquement la colonne prix_unitaire pour Commande items).
        const prixUnitairePourDB = values.type === 'Commande' ? pa : pu;
        const priceForTotal = values.type === 'Commande' ? pa : pu;

        // Déterminer si le produit est indisponible et gérer le split de quantité
        const snapId = item.product_snapshot_id ? parseInt(item.product_snapshot_id) : null;
        // ── FIFO allocation for merged items (no specific snapshot_id) ──
        // Applies to all roles when snapshots were merged (same prix_vente)
        if (!snapId && useSnapshotSelection && snapshotProducts?.length && item.product_id) {
          const itemPV = Number(pu) || 0;
          const explicitMergedIds: any[] = Array.isArray(item.merged_snapshot_ids) ? item.merged_snapshot_ids : [];
          const allSnaps = (snapshotProducts as any[])
            .filter((s: any) => {
              if (!s.snapshot_id) return false;
              if (String(s.id) !== String(item.product_id)) return false;
              if (String(s.variant_id || '') !== String(item.variant_id || '')) return false;
              if (Number(s.snapshot_quantite) <= 0) return false;
              // If user-tracked merged ids exist (from auto-collection on qty overflow), use them directly
              if (explicitMergedIds.length > 0) {
                return explicitMergedIds.map(String).includes(String(s.snapshot_id));
              }
              // Otherwise fall back to same-prix_vente grouping
              return Number(s.prix_vente ?? 0) === itemPV;
            })
            .sort((a: any, b: any) => (Number(a.fifo_priority) || 999) - (Number(b.fifo_priority) || 999));

          if (allSnaps.length > 0) {
            const fifoItems: any[] = [];
            let remaining = q;

            for (const snap of allSnaps) {
              if (remaining <= 0) break;
              const snapAvail = Number(snap.snapshot_quantite) || 0;
              const take = Math.min(remaining, snapAvail);
              fifoItems.push({
                product_id: parseInt(item.product_id),
                variant_id: item.variant_id ? parseInt(item.variant_id) : null,
                unit_id: item.unit_id ? parseInt(item.unit_id) : null,
                product_snapshot_id: snap.snapshot_id,
                quantite: take,
                prix_achat: pa,
                prix_unitaire: prixUnitairePourDB,
                remise_pourcentage: rp,
                remise_montant: rm,
                is_indisponible: false,
                ...(values.type === 'Commande' ? getCommandeSpecialFields(item, take) : {}),
                total: take * priceForTotal,
              });
              remaining -= take;
            }

            // Remaining qty after all snapshots exhausted → is_indisponible
            if (remaining > 0) {
              const lastSnap = allSnaps[allSnaps.length - 1] || null;
              fifoItems.push({
                product_id: parseInt(item.product_id),
                variant_id: item.variant_id ? parseInt(item.variant_id) : null,
                unit_id: item.unit_id ? parseInt(item.unit_id) : null,
                product_snapshot_id: lastSnap?.snapshot_id || null,
                quantite: remaining,
                prix_achat: pa,
                prix_unitaire: prixUnitairePourDB,
                remise_pourcentage: rp,
                remise_montant: rm,
                is_indisponible: true,
                ...(values.type === 'Commande' ? getCommandeSpecialFields(item, remaining) : {}),
                total: remaining * priceForTotal,
              });
            }
            return fifoItems;
          }
        }
        // ── End FIFO allocation ──

        let availableQty = Infinity; // par défaut, pas de limite

        if (snapId && useSnapshotSelection && snapshotProducts?.length) {
          const snap = (snapshotProducts as any[]).find((s: any) => String(s.snapshot_id) === String(snapId));
          if (snap) {
            // If snapshot is not active (en_validation=0), treat it as out of stock
            const flag = (snap as any).snapshot_en_validation;
            const isActive = flag == null ? true : Number(flag) !== 0;
            availableQty = isActive ? Number(snap.snapshot_quantite ?? 0) : 0;
          }
        } else if (!snapId && item.product_id) {
          const prod = products.find((p: any) => String(p.id) === String(item.product_id));
          if (prod) {
            availableQty = Number((prod as any).quantite ?? (prod as any).stock ?? 0);
          }
        }

        // Cas 1: Tout est indisponible (stock <= 0)
        if (availableQty <= 0) {
          return [{
            product_id: parseInt(item.product_id),
            variant_id: item.variant_id ? parseInt(item.variant_id) : null,
            unit_id: item.unit_id ? parseInt(item.unit_id) : null,
            product_snapshot_id: snapId,
            quantite: q,
            prix_achat: pa,
            prix_unitaire: prixUnitairePourDB,
            remise_pourcentage: rp,
            remise_montant: rm,
            is_indisponible: true,
            ...(values.type === 'Commande' ? getCommandeSpecialFields(item, q) : {}),
            total: q * priceForTotal,
          }];
        }

        // Cas 2: Quantité demandée > stock disponible → split en 2 items
        if (q > availableQty && availableQty < Infinity) {
          const qtyDispo = availableQty;
          const qtyIndispo = q - availableQty;
          return [
            // Item disponible (quantité couverte par le stock)
            {
              product_id: parseInt(item.product_id),
              variant_id: item.variant_id ? parseInt(item.variant_id) : null,
              unit_id: item.unit_id ? parseInt(item.unit_id) : null,
              product_snapshot_id: snapId,
              quantite: qtyDispo,
              prix_achat: pa,
              prix_unitaire: prixUnitairePourDB,
              remise_pourcentage: rp,
              remise_montant: rm,
              is_indisponible: false,
              ...(values.type === 'Commande' ? getCommandeSpecialFields(item, qtyDispo) : {}),
              total: qtyDispo * priceForTotal,
            },
            // Item indisponible (quantité restante non couverte)
            {
              product_id: parseInt(item.product_id),
              variant_id: item.variant_id ? parseInt(item.variant_id) : null,
              unit_id: item.unit_id ? parseInt(item.unit_id) : null,
              product_snapshot_id: snapId,
              quantite: qtyIndispo,
              prix_achat: pa,
              prix_unitaire: prixUnitairePourDB,
              remise_pourcentage: rp,
              remise_montant: rm,
              is_indisponible: true,
              ...(values.type === 'Commande' ? getCommandeSpecialFields(item, qtyIndispo) : {}),
              total: qtyIndispo * priceForTotal,
            },
          ];
        }

        // Cas 3: Stock suffisant → tout disponible
        return [{
          product_id: parseInt(item.product_id),
          variant_id: item.variant_id ? parseInt(item.variant_id) : null,
          unit_id: item.unit_id ? parseInt(item.unit_id) : null,
          product_snapshot_id: snapId,
          quantite: q,
          prix_achat: pa,
          prix_unitaire: prixUnitairePourDB,
          remise_pourcentage: rp,
          remise_montant: rm,
          is_indisponible: false,
          ...(values.type === 'Commande' ? getCommandeSpecialFields(item, q) : {}),
          total: q * priceForTotal,
        }];
      }),
    };

    if (requestType === 'Comptant') {
      if (values.payer_partiellement) {
      const montantPayeSaisi = parseFloat(normalizeDecimal(String(values.montant_paye_saisi ?? ''))) || 0;
      cleanBonData.paiements_non_payes = montantPayeSaisi > 0
        ? [{
            montant: Number(montantPayeSaisi.toFixed(2)),
            date_paiement: cleanBonData.date_creation,
            note: isEditMode
              ? 'Paiement ajouté depuis modification du bon comptant non payé'
              : 'Paiement initial du bon comptant non payé',
          }]
        : [];
      } else {
        cleanBonData.paiements_non_payes = [];
      }
    }

    // ChefChauffeur: en modification, autoriser seulement les quantités (tout le reste est verrouillé)
    if (isQtyOnlyEdit) {
      const locked = (initialValues as any) || {};
      const lockedItems: any[] = Array.isArray(locked?.items) ? locked.items : [];

      // Lock header fields (server will also enforce)
      cleanBonData = {
        ...cleanBonData,
        date_creation: locked?.date_creation ?? cleanBonData.date_creation,
        vehicule_id: locked?.vehicule_id ?? cleanBonData.vehicule_id,
        lieu_chargement: locked?.lieu_chargement ?? cleanBonData.lieu_chargement,
        adresse_livraison: locked?.adresse_livraison ?? cleanBonData.adresse_livraison,
        phone: locked?.phone ?? cleanBonData.phone,
        isNotCalculated: locked?.isNotCalculated ?? cleanBonData.isNotCalculated,
        statut: locked?.statut ?? cleanBonData.statut,
        client_id: locked?.client_id ?? cleanBonData.client_id,
        client_nom: locked?.client_nom ?? cleanBonData.client_nom,
        fournisseur_id: locked?.fournisseur_id ?? cleanBonData.fournisseur_id,
        remise_is_client: locked?.remise_is_client ?? cleanBonData.remise_is_client,
        remise_id: locked?.remise_id ?? cleanBonData.remise_id,
        remise_client_nom: locked?.remise_client_nom ?? cleanBonData.remise_client_nom,
        // Never allow editing livraisons in qty-only mode
        livraisons: undefined,
      };

      cleanBonData.items = (cleanBonData.items || []).map((it: any, idx: number) => {
        const ex = lockedItems[idx];
        if (!ex) return it;
        const q = Number(it?.quantite ?? 0) || 0;
        const exPrix = Number(ex?.prix_unitaire ?? it?.prix_unitaire ?? 0) || 0;
        const exRp = Number(ex?.remise_pourcentage ?? it?.remise_pourcentage ?? 0) || 0;
        const exRm = Number(ex?.remise_montant ?? it?.remise_montant ?? 0) || 0;
        return {
          product_id: Number(ex?.product_id ?? it?.product_id),
          variant_id: ex?.variant_id ?? it?.variant_id ?? null,
          unit_id: ex?.unit_id ?? it?.unit_id ?? null,
          quantite: q,
          prix_unitaire: exPrix,
          remise_pourcentage: exRp,
          remise_montant: exRm,
          unite_special: ex?.unite_special ?? it?.unite_special ?? 0,
          nbr_barre: ex?.nbr_barre ?? it?.nbr_barre ?? null,
          facteur_barre: ex?.facteur_barre ?? it?.facteur_barre ?? null,
          total: q * exPrix,
        };
      });
      cleanBonData.montant_total = (cleanBonData.items || []).reduce((s: number, r: any) => s + (Number(r?.total) || 0), 0);
    }

    if (isEditMode) {
      const updated = await updateBonMutation({ id: (initialValues as any).id, type: requestType, ...cleanBonData }).unwrap();
      const mergedUpdatedBon = {
        ...(initialValues as any),
        ...cleanBonData,
        ...(updated && typeof updated === 'object' ? updated : {}),
        id: (initialValues as any).id,
        type: requestType,
      };
      // Rafraîchir les stocks produits immédiatement après mise à jour du bon
      try { dispatch(api.util.invalidateTags(['Product'])); } catch {}
      // Optionally show WhatsApp prompt on update
      if (SHOW_WHATSAPP_POPUP) {
        await (await import('sweetalert2')).default.fire({
          title: 'Bon mis à jour avec succès',
          html: '<div style="text-align:left">Voulez-vous envoyer ce bon au client via WhatsApp ?</div>',
          showCancelButton: true,
          confirmButtonText: 'Envoyer WhatsApp',
          cancelButtonText: 'Fermer',
          reverseButtons: true
        }).then(async (res) => {
          if (res.isConfirmed) {
            try {
              const clientPhone = values.phone || (clients.find((c: any) => String(c.id) === String(values.client_id))?.telephone);
              if (!clientPhone) {
                showError('Numéro de téléphone client introuvable. Renseignez le champ téléphone.');
              } else {
                const numero = mergedUpdatedBon?.numero || (initialValues as any)?.numero || '';
                try {
                  await sendBonViaWhatsAppWithPdf({
                    bonType: requestType,
                    numero,
                    bonRecord: mergedUpdatedBon,
                    formValues: values,
                    phone: String(clientPhone),
                    bonId: mergedUpdatedBon?.id || (initialValues as any)?.id,
                    montantTotalValue: montantTotal,
                  });
                } catch (err: any) {
                  console.error('WhatsApp API error:', err);
                  showError((err && err.message) ? err.message : 'Échec de l\'envoi WhatsApp');
                }
              }
            } catch (err: any) {
              showError(err?.message || 'Échec de l\'envoi WhatsApp');
            }
          }
        });
      }
      onBonAdded && onBonAdded(mergedUpdatedBon);
      // Note: La mise à jour des prix des produits pour les bons Commande
      // est maintenant gérée par le backend lors du changement de statut vers "Validé"
      // (voir backend/routes/commandes.js PATCH /:id/statut)
    } else {
      // Vérification de la limite plafond/garantie pour les bons clients.
      if (['Sortie', 'Comptant', 'Avoir', 'AvoirComptant'].includes(requestType) && cleanBonData.client_id) {
        const client = clients.find((c: any) => Number(c.id) === cleanBonData.client_id);
        const creditLimit = getContactCreditLimit(client);
        if (client && creditLimit) {
          // Utiliser total_cumule comme sur la page clients, puis ajouter le total du bon courant.
          const backendClientSolde = clients.find((c: any) => Number(c.id) === cleanBonData.client_id);
          const soldeCumule = getContactTotalCumule(backendClientSolde);
          const limite = creditLimit.amount;
          const nouveauSolde = soldeCumule + montantTotal;
          
          // Cas 1: Client déjà au-dessus de la limite AVANT ce bon
          if (soldeCumule > limite) {
            const depassementActuel = soldeCumule - limite;
            
            if (user?.role === 'PDG') {
              // Vérifier si le PDG a déjà approuvé ce client récemment (dans les 30 dernières minutes)
              const hasRecentApproval = pdgApprovedOverLimit && 
                                       pdgApprovedOverLimit.clientId === cleanBonData.client_id.toString() &&
                                       (Date.now() - pdgApprovedOverLimit.timestamp) < 30 * 60 * 1000; // 30 min

              if (!hasRecentApproval) {
                // PDG : Alerte informative mais peut continuer
                const result = await showConfirmation(
                  `⚠️ ATTENTION - CLIENT DÉJÀ AU-DESSUS DE LA LIMITE ⚠️\n\n` +
                  `Client: ${client.nom_complet}\n` +
                  `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                  `${creditLimit.details}\n` +
                  `Limite appliquée (${creditLimit.label}): ${limite.toFixed(2)} DH\n` +
                  `Dépassement actuel: ${depassementActuel.toFixed(2)} DH\n\n` +
                  `Montant du nouveau bon: ${montantTotal.toFixed(2)} DH\n` +
                  `Solde après ce bon: ${nouveauSolde.toFixed(2)} DH\n\n` +
                  `Ce client a déjà dépassé sa limite de crédit.\n` +
                  `Voulez-vous tout de même créer ce bon ?`,
                  'Client au-dessus de la limite',
                  'Continuer',
                  'Annuler'
                );
                
                if (!result.isConfirmed) {
                  setSubmitting(false);
                  return;
                }
              }
              // Si approbation récente ou nouvelle approbation, continuer
            } else {
              // Autres rôles : Interdiction complète
              showError(
                `🚫 CRÉATION INTERDITE - CLIENT AU-DESSUS DE LA LIMITE 🚫\n\n` +
                `Client: ${client.nom_complet}\n` +
                `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                `${creditLimit.details}\n` +
                `Limite appliquée (${creditLimit.label}): ${limite.toFixed(2)} DH\n` +
                `Dépassement actuel: ${depassementActuel.toFixed(2)} DH\n\n` +
                `❌ Ce client a déjà dépassé sa limite de crédit.\n` +
                `Vous n'êtes pas autorisé à créer de nouveaux bons pour ce client.\n` +
                `Contactez votre responsable.`
              );
              setSubmitting(false);
              return;
            }
          }
          // Cas 2: Client dans les limites mais ce bon le ferait dépasser
          else if (nouveauSolde > limite) {
            const depassement = nouveauSolde - limite;
            
            if (user?.role === 'PDG') {
              // PDG : Popup personnalisé avec boutons Continuer/Annuler
              const result = await showConfirmation(
                `⚠️ ATTENTION - CE BON DÉPASSERA LA LIMITE ⚠️\n\n` +
                `Client: ${client.nom_complet}\n` +
                `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                `Montant du bon: ${montantTotal.toFixed(2)} DH\n` +
                `Nouveau solde: ${nouveauSolde.toFixed(2)} DH\n` +
                `${creditLimit.details}\n` +
                `Limite appliquée (${creditLimit.label}): ${limite.toFixed(2)} DH\n\n` +
                `Ce bon ferait dépasser la limite de ${depassement.toFixed(2)} DH.\n\n` +
                `Voulez-vous autoriser la création malgré le dépassement ?`,
                'Dépassement de limite détecté',
                'Continuer',
                'Annuler'
              );
              
              if (!result.isConfirmed) {
                setSubmitting(false);
                return;
              }
            } else {
              // Autres rôles : Annulation automatique
              showError(
                `🚫 CRÉATION INTERDITE - DÉPASSEMENT DE LIMITE 🚫\n\n` +
                `Client: ${client.nom_complet}\n` +
                `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                `Montant du bon: ${montantTotal.toFixed(2)} DH\n` +
                `Nouveau solde: ${nouveauSolde.toFixed(2)} DH\n` +
                `${creditLimit.details}\n` +
                `Limite appliquée (${creditLimit.label}): ${limite.toFixed(2)} DH\n\n` +
                `Ce bon dépasserait la limite de ${depassement.toFixed(2)} DH.\n\n` +
                `❌ Vous n'êtes pas autorisé à créer ce bon.\n` +
                `Veuillez réduire le montant ou contacter votre responsable.`
              );
              setSubmitting(false);
              return;
            }
          }
        }
      }

      const created = await createBon({ type: requestType, ...cleanBonData }).unwrap();
      // Rafraîchir les stocks produits immédiatement après création du bon
      try { dispatch(api.util.invalidateTags(['Product'])); } catch {}
      // Optionally show WhatsApp prompt on create
      if (SHOW_WHATSAPP_POPUP) {
        await (await import('sweetalert2')).default.fire({
          title: `${currentTab} créé avec succès`,
          html: '<div style="text-align:left">Le bon a été créé. Voulez-vous l\'envoyer au client via WhatsApp ?</div>',
          showCancelButton: true,
          confirmButtonText: 'Envoyer WhatsApp',
          cancelButtonText: 'Fermer',
          reverseButtons: true
        }).then(async (res) => {
          if (res.isConfirmed) {
            try {
              const clientPhone = values.phone || (clients.find((c: any) => String(c.id) === String(values.client_id))?.telephone);
              if (!clientPhone) {
                showError('Numéro de téléphone client introuvable. Renseignez le champ téléphone.');
              } else {
                const numero = created?.numero || '';
                try {
                  await sendBonViaWhatsAppWithPdf({
                    bonType: requestType,
                    numero,
                    bonRecord: created,
                    formValues: values,
                    phone: String(clientPhone),
                    bonId: created?.id,
                    montantTotalValue: montantTotal,
                  });
                } catch (err: any) {
                  console.error('WhatsApp API error:', err);
                  showError((err && err.message) ? err.message : 'Échec de l\'envoi WhatsApp');
                }
              }
            } catch (err: any) {
              showError(err?.message || 'Échec de l\'envoi WhatsApp');
            }
          }
        });
      }
      // Note: La mise à jour des prix des produits pour les bons Commande
      // est maintenant gérée par le backend lors du changement de statut vers "Validé"
      // (voir backend/routes/commandes.js PATCH /:id/statut)
    }

    if (!isEditMode) {
      onBonAdded && onBonAdded(cleanBonData);
    }
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
    submitInProgressRef.current = false;
    setIsSavingBon(false);
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
    productId: string | number | undefined,
    variantId?: string | number | undefined,
    unitId?: string | number | undefined
  ): number | null => {
    if (!clientId || !productId) return null;
    const cid = String(clientId);
    const pid = String(productId);
    const wantedVariantId = variantId == null || variantId === '' ? null : String(variantId);
    const wantedUnitId = unitId == null || unitId === '' ? null : String(unitId);

    type HistItem = { prix_unitaire?: number; total?: number; quantite?: number };
    let bestConfirmedPrice: number | null = null;
    let bestConfirmedTime = -1;
    let bestPendingPrice: number | null = null;
    let bestPendingTime = -1;

    const confirmedStatuses = new Set(['validé', 'valide', 'validée', 'livré', 'livre']);
    const pendingStatuses = new Set(['en attente']);

    const collectBestPrice = (requireExactVariantUnit: boolean) => {
      bestConfirmedPrice = null;
      bestConfirmedTime = -1;
      bestPendingPrice = null;
      bestPendingTime = -1;

      const scan = (bon: any, itemsField: any) => {
        const statut = String(bon.statut || '').toLowerCase();
        const isConfirmed = confirmedStatuses.has(statut);
        const isPending = pendingStatuses.has(statut);
        if (!isConfirmed && !isPending) return;

        const items = parseItems(itemsField);
        const bonClientId = String(bon.client_id ?? bon.contact_id ?? '');
        if (cid && bonClientId !== cid) return;

        const bonTime = toTime(bon.date_creation || bon.date);

        for (const it of items as HistItem[]) {
          const itPid = String((it as any).product_id ?? (it as any).id ?? '');
          if (itPid !== pid) continue;

          if (requireExactVariantUnit) {
            const itVariantId = (it as any).variant_id == null || (it as any).variant_id === '' ? null : String((it as any).variant_id);
            const itUnitId = (it as any).unit_id == null || (it as any).unit_id === '' ? null : String((it as any).unit_id);
            if (wantedVariantId !== null && itVariantId !== wantedVariantId) continue;
            if (wantedUnitId !== null && itUnitId !== wantedUnitId) continue;
          }

          const price = Number((it as any).prix_unitaire ?? (it as any).price ?? 0);
          if (!Number.isFinite(price) || price <= 0) continue;

          if (isConfirmed && bonTime > bestConfirmedTime) {
            bestConfirmedTime = bonTime;
            bestConfirmedPrice = price;
          } else if (isPending && bonTime > bestPendingTime) {
            bestPendingTime = bonTime;
            bestPendingPrice = price;
          }
        }
      };

      for (const b of sortiesHistory as any[]) scan(b, (b as any).items);
      for (const b of comptantHistory as any[]) scan(b, (b as any).items);

      return bestConfirmedPrice ?? bestPendingPrice;
    };

    const requiresExactVariantUnit = wantedVariantId !== null || wantedUnitId !== null;
    if (requiresExactVariantUnit) {
      const exactMatchPrice = collectBestPrice(true);
      if (exactMatchPrice != null) return exactMatchPrice;
    }

    return collectBestPrice(false);
  };

  const getLastSortieUnitPriceForClientProduct = (
    clientId: string | number | undefined,
    productId: string | number | undefined,
    variantId?: string | number | undefined,
    unitId?: string | number | undefined
  ): number | null => {
    if (!clientId || !productId) return null;
    const cid = String(clientId);
    const pid = String(productId);
    const wantedVariantId = variantId == null || variantId === '' ? null : String(variantId);
    const wantedUnitId = unitId == null || unitId === '' ? null : String(unitId);

    type HistItem = { prix_unitaire?: number; price?: number };
    let bestPrice: number | null = null;
    let bestTime = -1;
    let bestBonId = -1;
    const acceptedStatuses = new Set(['validÃ©', 'valide', 'validÃ©e', 'livrÃ©', 'livre', 'en attente']);

    const scan = (bon: any, matchVariant: boolean, matchUnit: boolean) => {
      const statut = String(bon.statut || '').toLowerCase();
      if (!acceptedStatuses.has(statut)) return;

      const bonClientId = String(bon.client_id ?? bon.contact_id ?? '');
      if (bonClientId !== cid) return;

      const bonTime = toTime(bon.date_creation || bon.date);
      const bonId = Number(bon.id || 0);
      const items = parseItems(bon.items);

      for (const it of items as HistItem[]) {
        const itPid = String((it as any).product_id ?? (it as any).id ?? '');
        if (itPid !== pid) continue;

        const itVariantId = (it as any).variant_id == null || (it as any).variant_id === '' ? null : String((it as any).variant_id);
        const itUnitId = (it as any).unit_id == null || (it as any).unit_id === '' ? null : String((it as any).unit_id);
        if (matchVariant && wantedVariantId !== null && itVariantId !== wantedVariantId) continue;
        if (matchUnit && wantedUnitId !== null && itUnitId !== wantedUnitId) continue;

        const price = Number((it as any).prix_unitaire ?? (it as any).price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        if (bonTime > bestTime || (bonTime === bestTime && bonId > bestBonId)) {
          bestTime = bonTime;
          bestBonId = bonId;
          bestPrice = price;
        }
      }
    };

    const collect = (matchVariant: boolean, matchUnit: boolean) => {
      bestPrice = null;
      bestTime = -1;
      bestBonId = -1;
      for (const b of sortiesHistory as any[]) scan(b, matchVariant, matchUnit);
      return bestPrice;
    };

    if (wantedVariantId !== null && wantedUnitId !== null) {
      const exactMatchPrice = collect(true, true);
      if (exactMatchPrice != null) return exactMatchPrice;
    }

    if (wantedVariantId !== null) {
      return collect(true, false);
    }

    if (wantedUnitId !== null) {
      const exactUnitPrice = collect(false, true);
      if (exactUnitPrice != null) return exactUnitPrice;
    }

    return collect(false, false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const formik = formikRef.current;
    const values = formik?.values as any;
    if (!formik) return;
    const type = String(values?.type || '');
    if (!['Commande', 'Sortie', 'Comptant', 'Avoir', 'AvoirComptant', 'AvoirFournisseur'].includes(type)) return;

    (values.items || []).forEach((item: any, index: number) => {
      if (!item?.product_id) return;
      const fallbackPrice = type === 'Commande'
        ? Number(item.prix_achat ?? 0)
        : Number(item.prix_unitaire ?? 0);
      const lastPrice = resolvePreferredUnitPrice(
        values,
        item.product_id,
        item.variant_id,
        item.unit_id,
        fallbackPrice
      );
      if (lastPrice == null || !Number.isFinite(lastPrice)) return;

      const priceField = type === 'Commande' ? 'prix_achat' : 'prix_unitaire';
      const currentPrice = Number(item?.[priceField] ?? 0);
      if (Math.abs(currentPrice - lastPrice) < 0.0001) return;

      void formik.setFieldValue(`items.${index}.${priceField}`, lastPrice);
      if (type !== 'Commande') {
        void formik.setFieldValue(`items.${index}.prix_unitaire`, lastPrice);
      }
      setUnitPriceRaw((prev) => ({ ...prev, [index]: String(lastPrice) }));
      const qty = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(item.quantite ?? ''))) || 0;
      void formik.setFieldValue(`items.${index}.total`, qty * lastPrice);
    });
  }, [
    isOpen,
    sortiesHistory,
    comptantHistory,
    commandesHistory,
    avoirsFournisseurHistory,
    qtyRaw,
  ]);

  const getLastQuantityForClientProduct = (
    clientId: string | number | undefined,
    productId: string | number | undefined
  ): number | null => {
    if (!clientId || !productId) return null;
    const cid = String(clientId);
    const pid = String(productId);

    type HistItem = { quantite?: number };
    let bestQty: number | null = null;
    let bestTime = -1;

    const scan = (bon: any, itemsField: any) => {
      // Ne considérer que les bons VALIDÉS
      const statut = String(bon.statut || '').toLowerCase();
      if (statut !== 'validé' && statut !== 'valide' && statut !== 'validée') return;
      const items = parseItems(itemsField);
      const bonClientId = String(bon.client_id ?? bon.contact_id ?? '');
      if (bonClientId !== cid) return;
      const bonTime = toTime(bon.date_creation || bon.date);

      for (const it of items as HistItem[]) {
        const itPid = String((it as any).product_id ?? (it as any).id ?? '');
        if (itPid !== pid) continue;
        const qty = Number((it as any).quantite ?? (it as any).qte ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        if (bonTime > bestTime) {
          bestTime = bonTime;
          bestQty = qty;
        }
      }
    };

    for (const b of sortiesHistory as any[]) scan(b, (b as any).items);
    for (const b of comptantHistory as any[]) scan(b, (b as any).items);
    return bestQty;
  };

  // Dernier prix pour Comptant/AvoirComptant par produit (ignore le client),
  // accepte les statuts "Validé" et "En attente". N'affecte pas la logique Sortie.
  const getLastUnitPricesForComptantProduct = (
    productId: string | number | undefined,
    variantId?: string | number | undefined,
    unitId?: string | number | undefined,
    limit = 4
  ): number[] => {
    if (!productId) return [];
    const pid = String(productId);
    const wantedVariantId = variantId == null || variantId === '' ? null : String(variantId);
    const wantedUnitId = unitId == null || unitId === '' ? null : String(unitId);

    type HistItem = { prix_unitaire?: number; total?: number; quantite?: number };
    const prices: Array<{ price: number; time: number; bonId: number }> = [];

    const accepted = new Set(['validé', 'valide', 'validée', 'en attente']);

    const scan = (bon: any, requireExactVariantUnit: boolean) => {
      const statut = String(bon.statut || '').toLowerCase();
      if (!accepted.has(statut)) return; // n'inclut que Validé ou En attente
      const items = parseItems(bon.items);
      const bonTime = toTime(bon.date_creation || bon.date);
      for (const it of items as HistItem[]) {
        const itPid = String((it as any).product_id ?? (it as any).id ?? '');
        if (itPid !== pid) continue;
        if (requireExactVariantUnit) {
          const itVariantId = (it as any).variant_id == null || (it as any).variant_id === '' ? null : String((it as any).variant_id);
          const itUnitId = (it as any).unit_id == null || (it as any).unit_id === '' ? null : String((it as any).unit_id);
          if (wantedVariantId !== null && itVariantId !== wantedVariantId) continue;
          if (wantedUnitId !== null && itUnitId !== wantedUnitId) continue;
        }
        const price = Number((it as any).prix_unitaire ?? (it as any).price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        prices.push({ price, time: bonTime, bonId: Number(bon.id || 0) });
      }
    };

    const collect = (requireExactVariantUnit: boolean) => {
      prices.length = 0;
      for (const b of comptantHistory as any[]) scan(b, requireExactVariantUnit);
      return [...prices]
        .sort((a, b) => (b.time - a.time) || (b.bonId - a.bonId))
        .slice(0, Math.max(1, limit))
        .map((entry) => entry.price);
    };

    const requiresExactVariantUnit = wantedVariantId !== null || wantedUnitId !== null;
    if (requiresExactVariantUnit) {
      const exact = collect(true);
      if (exact.length > 0) return exact;
    }
    return collect(false);
  };

  const getLastPurchasePriceForSupplierProduct = (
    bonType: string,
    fournisseurId: string | number | undefined,
    productId: string | number | undefined,
    variantId?: string | number | undefined,
    unitId?: string | number | undefined
  ): number | null => {
    if (!fournisseurId || !productId) return null;
    const fid = String(fournisseurId);
    const pid = String(productId);
    const wantedVariantId = variantId == null || variantId === '' ? null : String(variantId);
    const wantedUnitId = unitId == null || unitId === '' ? null : String(unitId);

    type HistItem = { prix_achat?: number; prix_unitaire?: number; price?: number };
    let bestConfirmedPrice: number | null = null;
    let bestConfirmedTime = -1;
    let bestPendingPrice: number | null = null;
    let bestPendingTime = -1;

    const confirmedStatuses = new Set(['validé', 'valide', 'validée', 'livré', 'livre']);
    const pendingStatuses = new Set(['en attente']);

    const collectBestPrice = (requireExactVariantUnit: boolean) => {
      bestConfirmedPrice = null;
      bestConfirmedTime = -1;
      bestPendingPrice = null;
      bestPendingTime = -1;

      const scan = (bon: any, itemsField: any) => {
        const statut = String(bon.statut || '').toLowerCase();
        const isConfirmed = confirmedStatuses.has(statut);
        const isPending = pendingStatuses.has(statut);
        if (!isConfirmed && !isPending) return;

        const bonSupplierId = String(bon.fournisseur_id ?? bon.contact_id ?? '');
        if (bonSupplierId !== fid) return;

        const items = parseItems(itemsField);
        const bonTime = toTime(bon.date_creation || bon.date);

        for (const it of items as HistItem[]) {
          const itPid = String((it as any).product_id ?? (it as any).id ?? '');
          if (itPid !== pid) continue;

          if (requireExactVariantUnit) {
            const itVariantId = (it as any).variant_id == null || (it as any).variant_id === '' ? null : String((it as any).variant_id);
            const itUnitId = (it as any).unit_id == null || (it as any).unit_id === '' ? null : String((it as any).unit_id);
            if (wantedVariantId !== null && itVariantId !== wantedVariantId) continue;
            if (wantedUnitId !== null && itUnitId !== wantedUnitId) continue;
          }

          const price = Number((it as any).prix_achat ?? (it as any).prix_unitaire ?? (it as any).price ?? 0);
          if (!Number.isFinite(price) || price <= 0) continue;

          if (isConfirmed && bonTime > bestConfirmedTime) {
            bestConfirmedTime = bonTime;
            bestConfirmedPrice = price;
          } else if (isPending && bonTime > bestPendingTime) {
            bestPendingTime = bonTime;
            bestPendingPrice = price;
          }
        }
      };

      const supplierHistory = bonType === 'AvoirFournisseur'
        ? [...(commandesHistory as any[]), ...(avoirsFournisseurHistory as any[])]
        : commandesHistory;

      for (const b of supplierHistory as any[]) scan(b, (b as any).items);
      return bestConfirmedPrice ?? bestPendingPrice;
    };

    const requiresExactVariantUnit = wantedVariantId !== null || wantedUnitId !== null;
    if (requiresExactVariantUnit) {
      const exactMatchPrice = collectBestPrice(true);
      if (exactMatchPrice != null) return exactMatchPrice;
    }

    return collectBestPrice(false);
  };

  const getLastSalePriceForSupplierProduct = (
    fournisseurId: string | number | undefined,
    productId: string | number | undefined,
    variantId?: string | number | undefined,
    unitId?: string | number | undefined
  ): number | null => {
    if (!fournisseurId || !productId) return null;
    const fid = String(fournisseurId);
    const pid = String(productId);
    const wantedVariantId = variantId == null || variantId === '' ? null : String(variantId);
    const wantedUnitId = unitId == null || unitId === '' ? null : String(unitId);

    let bestPrice: number | null = null;
    let bestTime = -1;
    let bestBonId = -1;
    const rejectedStatuses = new Set(['annule', 'annulÃ©', 'annulée', 'annulÃ©e', 'annulé']);

    const scan = (bon: any, matchVariantUnit: boolean) => {
      const statut = String(bon.statut || '').toLowerCase();
      if (rejectedStatuses.has(statut)) return;
      const isSupplierSale =
        bon.vendre_au_fournisseur === true ||
        bon.vendre_au_fournisseur === 1 ||
        String(bon.vendre_au_fournisseur ?? '') === '1';
      if (!isSupplierSale) return;
      const bonSupplierId = String(bon.fournisseur_id ?? bon.contact_id ?? '');
      if (bonSupplierId !== fid) return;

      const bonTime = toTime(bon.date_creation || bon.date);
      const bonId = Number(bon.id || 0);
      const items = parseItems(bon.items);

      for (const it of items as any[]) {
        const itPid = String(it?.product_id ?? it?.id ?? '');
        if (itPid !== pid) continue;
        if (matchVariantUnit) {
          const itVariantId = it?.variant_id == null || it?.variant_id === '' ? null : String(it.variant_id);
          const itUnitId = it?.unit_id == null || it?.unit_id === '' ? null : String(it.unit_id);
          if (wantedVariantId !== null && itVariantId !== wantedVariantId) continue;
          if (wantedUnitId !== null && itUnitId !== wantedUnitId) continue;
        }
        const price = Number(it?.prix_unitaire ?? it?.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        if (bonTime > bestTime || (bonTime === bestTime && bonId > bestBonId)) {
          bestTime = bonTime;
          bestBonId = bonId;
          bestPrice = price;
        }
      }
    };

    const collect = (matchVariantUnit: boolean) => {
      bestPrice = null;
      bestTime = -1;
      bestBonId = -1;
      for (const b of sortiesHistory as any[]) scan(b, matchVariantUnit);
      return bestPrice;
    };

    if (wantedVariantId !== null || wantedUnitId !== null) {
      const exact = collect(true);
      if (exact != null) return exact;
    }
    return collect(false);
  };

  const resolvePreferredUnitPrice = (
    values: any,
    productId: string | number | undefined,
    variantId: string | number | undefined,
    unitId: string | number | undefined,
    fallbackPrice: number
  ): number => {
    const type = String(values?.type || '');
    const fallback = Number(fallbackPrice || 0);

    if (type === 'Commande') {
      return getLastPurchasePriceForSupplierProduct(type, values?.fournisseur_id, productId, variantId, unitId) ?? fallback;
    }

    if (type === 'AvoirFournisseur') {
      return getLastPurchasePriceForSupplierProduct(type, values?.fournisseur_id, productId, variantId, unitId) ?? fallback;
    }

    if ((type === 'Sortie' || type === 'Avoir') && values?.vendre_au_fournisseur) {
      return getLastSalePriceForSupplierProduct(values?.fournisseur_id, productId, variantId, unitId) ?? fallback;
    }

    if (type === 'Avoir' && !values?.vendre_au_fournisseur) {
      return getLastSortieUnitPriceForClientProduct(values?.client_id, productId, variantId, unitId) ?? fallback;
    }

    if (type === 'Sortie') {
      return getLastUnitPriceForClientProduct(values?.client_id, productId, variantId, unitId) ?? fallback;
    }

    if (type === 'Comptant' || type === 'AvoirComptant') {
      return getLastUnitPricesForComptantProduct(productId, variantId, unitId, 1)[0] ?? fallback;
    }

    return fallback;
  };

    // (Removed local cumulative balance calculations; using backend provided solde_cumule)

  // Fonction utilitaire pour vérifier la limite de crédit en temps réel
  const checkClientCreditLimitRealTime = async (values: any) => {
    // Vérifier seulement pour les bons clients avec plafond ou garantie
    if (!['Sortie', 'Comptant', 'Avoir', 'AvoirComptant'].includes(values.type) || !values.client_id) {
      return true;
    }

    const client = clients.find((c: any) => Number(c.id) === Number(values.client_id));
    const creditLimit = getContactCreditLimit(client);
    if (!client || !creditLimit) {
      return true;
    }

    // Calculer le montant du bon actuel en utilisant les valeurs passées en paramètre
    const montantBon = values.items.reduce((sum: number, item: any) => {
      const q = Number(item.quantite || 0);
      const priceField = values.type === 'Commande' ? 'prix_achat' : 'prix_unitaire';
      const u = Number(item[priceField] || 0);
      return sum + q * u;
    }, 0);

  const backendClient = clients.find((c: any) => c.id.toString() === values.client_id.toString());
  const soldeCumule = getContactTotalCumule(backendClient);
    const limite = creditLimit.amount;
    const nouveauSolde = soldeCumule + montantBon;

    // Si client déjà au-dessus de la limite
    if (soldeCumule > limite) {
      if (user?.role === 'PDG') {
        // PDG : juste un rappel discret (pas de popup répétitive)
        console.warn(`⚠️ Client ${client.nom_complet} déjà au-dessus de la limite (${soldeCumule.toFixed(2)} DH / ${limite.toFixed(2)} DH)`);
        return true;
      } else {
        // Autres rôles : bloquant
        showError(
          `🚫 MODIFICATION BLOQUÉE 🚫\n\n` +
          `Client ${client.nom_complet} a déjà dépassé sa limite.\n` +
          `Solde actuel: ${soldeCumule.toFixed(2)} DH\n` +
          `${creditLimit.details}\n` +
          `Limite appliquée (${creditLimit.label}): ${limite.toFixed(2)} DH\n\n` +
          `Vous ne pouvez pas modifier ce bon.`
        );
        return false;
      }
    }
    // Si ce bon ferait dépasser la limite
    else if (nouveauSolde > limite) {
      const depassement = nouveauSolde - limite;
      
      if (user?.role === 'PDG') {
        // PDG : avertissement mais peut continuer
        console.warn(`⚠️ Ce bon ferait dépasser la limite de ${depassement.toFixed(2)} DH pour ${client.nom_complet}`);
        return true;
      } else {
        // Autres rôles : bloquant
        showError(
          `🚫 MODIFICATION BLOQUÉE 🚫\n\n` +
          `Cette modification ferait dépasser la limite de crédit.\n` +
          `Client: ${client.nom_complet}\n` +
          `Solde actuel: ${soldeCumule.toFixed(2)} DH\n` +
          `Nouveau solde: ${nouveauSolde.toFixed(2)} DH\n` +
          `${creditLimit.details}\n` +
          `Limite appliquée (${creditLimit.label}): ${limite.toFixed(2)} DH\n` +
          `Dépassement: ${depassement.toFixed(2)} DH`
        );
        return false;
      }
    }

    return true;
  };

  // (Removed debugging breakdown + fournisseur local balance; rely on backend fields.)

  /* ------------------------------ Appliquer produit ------------------------------ */
  /* ------------------------------ Appliquer produit ------------------------------ */
const applyProductToRow = async (rowIndex: number, product: any) => {
  if (!formikRef.current) return;
  const setFieldValue = formikRef.current.setFieldValue;
  const values = formikRef.current.values;

  const unit = Number(product.prix_vente || 0);
  const pa = Number(product.prix_achat || 0);
  const cr = Number(product.cout_revient || 0);
  const kg = Number(product.kg || 0);
  const q = Number(values.items?.[rowIndex]?.quantite || 0);

  // Pour bon Commande, utiliser prix_achat; pour autres types, prix_unitaire
  const chargePrice = cr || pa || 0;
  const preferredPrice = resolvePreferredUnitPrice(
    values,
    product.id,
    product.variant_id,
    values.items?.[rowIndex]?.unit_id,
    values.type === 'Commande' ? pa : unit
  );
  const salePrice = values.type === 'Charge' ? chargePrice : preferredPrice;
  const priceForDisplay = values.type === 'Commande' ? preferredPrice : salePrice;
  const totalPrice = q * priceForDisplay;

  // Créer une version temporaire des valeurs avec le nouveau produit
  const tempValues = {
    ...values,
    items: values.items.map((item: any, idx: number) => 
      idx === rowIndex ? {
        ...item,
        product_id: product.id,
        prix_achat: values.type === 'Commande' ? preferredPrice : pa,
        prix_unitaire: values.type === 'Charge' ? chargePrice : salePrice,
        total: totalPrice
      } : item
    )
  };

  // Vérifier le plafond avant d'appliquer les changements
  const canProceed = await checkClientCreditLimitRealTime(tempValues);
  if (!canProceed) {
    return; // Bloquer la modification
  }

  setFieldValue(`items.${rowIndex}.product_id`, product.id);
  setFieldValue(`items.${rowIndex}.product_reference`, String(product.reference ?? product.id));
  setFieldValue(`items.${rowIndex}.designation`, product.designation || '');
  setFieldValue(`items.${rowIndex}.prix_achat`, values.type === 'Commande' ? preferredPrice : pa);
  setFieldValue(`items.${rowIndex}.cout_revient`, cr);
  setFieldValue(`items.${rowIndex}.prix_unitaire`, values.type === 'Charge' ? chargePrice : salePrice);
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
  if (!isOpen) return null;

  return (
  <div
    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-1 sm:p-2"
  >
    <div className="bg-white rounded-lg w-[90vw] max-h-[96vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="bg-blue-600 px-4 sm:px-6 py-3 rounded-t-lg flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-base sm:text-lg font-semibold text-white truncate">
            {isEditMode ? 'Modifier' : 'Créer'} un {currentTab}
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
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
              {isQtyOnlyEdit && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                  Chef Chauffeur: modification limitée — vous pouvez changer uniquement les quantités.
                </div>
              )}
              <AutoCheckNonCalculatedForAwatif isOpen={isOpen} clients={clients as any[]} />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

                {/* Date */}
                <div>
                  <label htmlFor="date_bon" className="block text-sm font-medium text-gray-700 mb-1">
                    Date et heure du bon
                  </label>
                  <Field type="datetime-local" id="date_bon" name="date_bon" disabled={isQtyOnlyEdit} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  <ErrorMessage name="date_bon" component="div" className="text-red-500 text-sm mt-1" />
                </div>

                {/* Champ Véhicule (ancien) retiré de l'UI; utiliser la section Livraisons (multi-véhicules) ci-dessous */}
                {/* Véhicule (affiché uniquement pour les bons de type Véhicule) */}
                {currentTab === 'Vehicule' && (
                  <div>
                    <label htmlFor="vehicule_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Véhicule
                    </label>
                    <select
                      id="vehicule_id"
                      name="vehicule_id"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      disabled={isQtyOnlyEdit}
                      value={values.vehicule_id || ''}
                      onChange={(e) => setFieldValue('vehicule_id', e.target.value)}
                    >
                      <option value="">Sélectionner</option>
                      {(vehicules || []).map((v: any) => (
                        <option key={v.id} value={String(v.id)}>
                          {v.nom} - {v.immatriculation}
                        </option>
                      ))}
                    </select>
                    <ErrorMessage name="vehicule_id" component="div" className="text-red-500 text-sm mt-1" />
                  </div>
                )}

                {/* Lieu / Adresse */}
                <div>
                  <label htmlFor="lieu_charge" className="block text-sm font-medium text-gray-700 mb-1">
                    Lieu de charge
                  </label>
                  <Field type="text" id="lieu_charge" name="lieu_charge" disabled={isQtyOnlyEdit} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Ex: Entrepôt Casablanca" />
                </div>
                <div>
                  <label htmlFor="adresse_livraison" className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse de livraison
                  </label>
                  <Field type="text" id="adresse_livraison" name="adresse_livraison" disabled={isQtyOnlyEdit} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Adresse complète de livraison" />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone du bon
                  </label>
                  <Field type="text" id="phone" name="phone" disabled={isQtyOnlyEdit} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Numéro de téléphone lié à ce bon (facultatif)" />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isNotCalculated"
                    checked={!!values.isNotCalculated}
                    onChange={(e) => setFieldValue('isNotCalculated', e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isNotCalculated" className="text-sm font-medium text-gray-700">
                    Non calculé
                  </label>
                  <span className="text-xs text-gray-500">(Cocher si ce bon ne doit pas être pris en compte dans les calculs)</span>
                </div>
                {(values.type === 'Charge' || values.type === 'Commande') && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="inclus_en_caisse"
                      checked={!!values.inclus_en_caisse}
                      onChange={(e) => setFieldValue('inclus_en_caisse', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="inclus_en_caisse" className="text-sm font-medium text-gray-700">
                      Inclus en caisse
                    </label>
                  </div>
                )}
              </div>

              {/* Multi-livraisons (véhicules + chauffeurs) */}
              {(currentTab !== 'Vehicule' || ((values.livraisons || []).length > 0)) && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Livraisons (multi-véhicules)</label>
                    <button
                      type="button"
                      className="px-2 py-1 text-sm bg-blue-600 text-white rounded"
                      disabled={isQtyOnlyEdit}
                      onClick={() => {
                        if (isQtyOnlyEdit) return;
                        setFieldValue('livraisons', [...(values.livraisons || []), { vehicule_id: '', user_id: '' }]);
                      }}
                    >
                      Ajouter véhicule + chauffeur
                    </button>
                  </div>
                  <FieldArray name="livraisons">
                    {({ remove }) => (
                      <div className="space-y-2">
                        {(values.livraisons || []).map((l: any, idx: number) => (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end bg-gray-50 p-3 rounded">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Véhicule</label>
                              <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                disabled={isQtyOnlyEdit}
                                value={l.vehicule_id || ''}
                                onChange={(e) => {
                                  if (isQtyOnlyEdit) return;
                                  const selectedVehiculeId = e.target.value;
                                  const selectedVehicule = (vehicules || []).find((v: any) => String(v?.id) === String(selectedVehiculeId));
                                  const linkedChauffeurId = selectedVehicule?.employe_id;
                                  const linkedChauffeurExists = linkedChauffeurId != null && (chauffeurs || []).some((c: any) => Number(c?.id) === Number(linkedChauffeurId));

                                  const arr = [...(values.livraisons || [])];
                                  arr[idx] = {
                                    ...arr[idx],
                                    vehicule_id: selectedVehiculeId,
                                    // Auto-select linked chauffeur if vehicule has one
                                    user_id: linkedChauffeurExists ? String(linkedChauffeurId) : '',
                                  };
                                  setFieldValue('livraisons', arr);
                                }}
                              >
                                <option value="">Sélectionner</option>
                                {vehicules.map((v: any) => (
                                  <option key={v.id} value={String(v.id)}>
                                    {v.nom} - {v.immatriculation}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Chauffeur (optionnel)</label>
                              <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                disabled={isQtyOnlyEdit}
                                value={l.user_id || ''}
                                onChange={(e) => {
                                  if (isQtyOnlyEdit) return;
                                  const arr = [...(values.livraisons || [])];
                                  arr[idx] = { ...arr[idx], user_id: e.target.value };
                                  setFieldValue('livraisons', arr);
                                }}
                              >
                                <option value="">Aucun</option>
                                {chauffeurs.map((c: any) => (
                                  <option key={c.id} value={String(c.id)}>
                                    {c.nom_complet || c.cin}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" disabled={isQtyOnlyEdit} className="px-2 py-2 bg-red-600 text-white rounded disabled:opacity-60" onClick={() => !isQtyOnlyEdit && remove(idx)}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </FieldArray>
                </div>
              )}

              {/* Client */}
              {((values.type === 'Sortie' && !values.vendre_au_fournisseur) || values.type === 'Charge' || values.type === 'AvoirCharge' || values.type === 'Devis' || (values.type === 'Avoir' && !values.vendre_au_fournisseur)) && (
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Client {(values.type === 'Sortie' || values.type === 'Avoir' || values.type === 'Charge' || values.type === 'AvoirCharge') ? '*' : '(optionnel)'}
                    </label>
                    <button
                      type="button"
                      className="text-blue-600 underline text-xs"
                      disabled={isQtyOnlyEdit}
                      onClick={() => {
                        if (isQtyOnlyEdit) return;
                        setIsContactModalOpen('Client');
                      }}
                    >
                      Nouveau client
                    </button>
                  </div>
                  <SearchableSelect
                    loading={clientSelectLoading}
                    onSearchTermChange={setClientSearchTerm}
                    options={clientOptions}
                    value={values.client_id}
                    valueLabelFallback={values.client_nom || ''}
                    disabled={isQtyOnlyEdit}
                    onChange={async (clientId) => {
                      if (isQtyOnlyEdit) return;
                      const client = selectableClients.find((c: Contact) => c.id.toString() === clientId);
                      if (!client) {
                        setFieldValue('client_id', clientId);
                        return;
                      }
                      if (isContactBlocked(client)) {
                        showError(`Client bloque: ${client.nom_complet || clientId}. Vous ne pouvez pas creer un bon ou un avoir pour ce client.`);
                        return;
                      }
                      
                      const soldeCumule = getContactTotalCumule(client);
                      const creditLimit = getContactCreditLimit(client);
                      const limite = creditLimit?.amount ?? 0;
                      const isOverLimit = Boolean(creditLimit && soldeCumule > limite);
                      
                      if (isOverLimit) {
                        const depassement = soldeCumule - limite;
                        
                        if (user?.role === 'PDG') {
                          // PDG : Alerte mais peut continuer
                          const result = await showConfirmation(
                            `⚠️ ATTENTION - CLIENT DÉJÀ AU-DESSUS DE LA LIMITE ⚠️\n\n` +
                            `Client: ${client.nom_complet}\n` +
                            `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                            `${creditLimit?.details}\n` +
                            `Limite appliquée (${creditLimit?.label}): ${limite.toFixed(2)} DH\n` +
                            `Dépassement actuel: ${depassement.toFixed(2)} DH\n\n` +
                            `Ce client a déjà dépassé sa limite de crédit.\n` +
                            `Voulez-vous tout de même continuer avec ce client ?`,
                            'Client au-dessus de la limite',
                            'Continuer',
                            'Choisir un autre client'
                          );
                          
                          if (result.isConfirmed) {
                            // PDG accepte de continuer - mémoriser cette approbation
                            setPdgApprovedOverLimit({
                              clientId: clientId,
                              timestamp: Date.now()
                            });
                            setFieldValue('client_id', clientId);
                            setFieldValue('client_nom', client.nom_complet);
                            setFieldValue('client_adresse', client.adresse || '');
                            setFieldValue('client_societe', (client as any).societe || '');
                            // Clear client_nom when selecting from dropdown
                            if (values.type === 'Devis') setFieldValue('client_nom', '');
                          }
                          // Sinon ne pas sélectionner le client
                        } else {
                          // Autres rôles : Interdiction complète
                          showError(
                            `🚫 CLIENT NON SÉLECTIONNABLE 🚫\n\n` +
                            `Client: ${client.nom_complet}\n` +
                            `Solde cumulé: ${soldeCumule.toFixed(2)} DH\n` +
                            `${creditLimit?.details}\n` +
                            `Limite appliquée (${creditLimit?.label}): ${limite.toFixed(2)} DH\n` +
                            `Dépassement: ${depassement.toFixed(2)} DH\n\n` +
                            `❌ Ce client a déjà dépassé sa limite de crédit.\n` +
                            `Veuillez choisir un autre client ou contactez votre responsable.`
                          );
                          // Ne pas sélectionner le client
                        }
                      } else {
                        // Client dans les limites, sélection normale
                        setFieldValue('client_id', clientId);
                        setFieldValue('client_nom', client.nom_complet);
                        setFieldValue('client_adresse', client.adresse || '');
                        setFieldValue('client_societe', (client as any).societe || '');
                        // Reset previous PDG approval when selecting different client
                        setPdgApprovedOverLimit(null);
                        // Clear client_nom when selecting from dropdown
                        if (values.type === 'Devis') setFieldValue('client_nom', '');
                      }
                    }}
                    placeholder="Sélectionnez un client"
                    className="w-full"
                    maxDisplayItems={200}
                    minSearchChars={2}
                    autoOpenOnFocus
                  />
                  <ErrorMessage name="client_id" component="div" className="text-red-500 text-sm mt-1" />
                  {values.client_id && <ContactSoldeCumuleHint contactId={values.client_id} contactType="Client" />}
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
                  
                  {/* Champ client_nom pour devis (alternative au client_id) */}
                  {values.type === 'Devis' && (
                    <div className="mt-3">
                      <div className="text-center text-sm text-gray-500 mb-2">-- OU --</div>
                      <label htmlFor="client_nom_devis" className="block text-sm font-medium text-gray-700 mb-1">
                        Nom du client (texte libre)
                      </label>
                      <Field
                        type="text"
                        id="client_nom_devis"
                        name="client_nom"
                        placeholder="Entrer le nom du client"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setFieldValue('client_nom', e.target.value);
                          // Clear client_id when typing in client_nom
                          if (e.target.value.trim()) {
                            setFieldValue('client_id', '');
                            setFieldValue('client_adresse', '');
                            setFieldValue('client_societe', '');
                          }
                        }}
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        Ce client ne sera pas ajouté automatiquement à la page Contacts.
                      </div>
                      <ErrorMessage name="client_nom" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                  )}
                </div>
              )}

      {/* Client libre pour Comptant / AvoirComptant / AvoirEcommerce */}
      {(values.type === 'Comptant' || values.type === 'AvoirComptant' || values.type === 'AvoirEcommerce') && (
                <div>
                  <label htmlFor="client_nom" className="block text-sm font-medium text-gray-700 mb-1">
        {values.type === 'AvoirEcommerce'
          ? 'Client (E-commerce)'
          : `Client (texte libre)${values.type === 'AvoirComptant' ? ' - Avoir Comptant' : ''}`}
                  </label>
                  {values.type === 'AvoirEcommerce' ? (
                    <SearchableSelect
                      loading={clientSelectLoading}
                      onSearchTermChange={setClientSearchTerm}
                      options={ecommerceClientOptions}
                      value={values.client_nom || ''}
                      valueLabelFallback={values.client_nom || ''}
                      onChange={(v) => {
                        if (!v) return;
                        const opt = (ecommerceClientOptions || []).find((x) => x.value === v);
                        const c = opt?.data;
                        if (c && isContactBlocked(c)) {
                          showError(`Client bloque: ${c.nom_complet || v}. Vous ne pouvez pas creer un bon ou un avoir pour ce client.`);
                          return;
                        }
                        setFieldValue('client_nom', v);
                        if (c) {
                          setFieldValue('customer_email', c.email || values.customer_email || '');
                          setFieldValue('phone', c.telephone || c.phone || values.phone || '');
                        }
                      }}
                      placeholder="Rechercher un client e-commerce"
                      className="w-full"
                      maxDisplayItems={200}
                      minSearchChars={2}
                      autoOpenOnFocus
                    />
                  ) : (
                    <Field
                      type="text"
                      id="client_nom"
                      name="client_nom"
                      placeholder="Saisir le nom du client"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  )}
                  {values.type === 'AvoirEcommerce' && (
                    <>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="customer_email" className="block text-sm font-medium text-gray-700 mb-1">
                            Email (optionnel)
                          </label>
                          <Field
                            type="email"
                            id="customer_email"
                            name="customer_email"
                            placeholder="ex: client@email.com"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label htmlFor="order_number" className="block text-sm font-medium text-gray-700 mb-1">
                            Commande (référence)
                          </label>
                          <SearchableSelect
                            options={(() => {
                              const base = ecommerceOrderOptions || [];
                              const v = String(values.order_number || '').trim();
                              if (v && !base.some((o) => o.value === v)) {
                                return [{ value: v, label: v, data: { custom: true } }, ...base];
                              }
                              return base;
                            })()}
                            value={values.order_number || ''}
                            onChange={(ref) => {
                              setFieldValue('order_number', ref);
                              const order = ecommerceOrdersByRef.get(String(ref)) || null;
                              if (order) {
                                setFieldValue('ecommerce_order_id', String(order.id || ''));
                                // Force client selection from the full contacts list.
                                const orderName = String(order.client_nom || order.customer_name || '').trim();
                                const matched = (clients || []).find((c: any) => {
                                  const cName = String(c?.nom_complet || '').trim();
                                  if (!cName || !orderName) return false;
                                  return normalizeHumanName(cName) === normalizeHumanName(orderName);
                                });
                                if (matched) {
                                  if (isContactBlocked(matched)) {
                                    showError(`Client bloque: ${matched.nom_complet || orderName}. Vous ne pouvez pas creer un bon ou un avoir pour ce client.`);
                                    setFieldValue('client_nom', '');
                                    return;
                                  }
                                  setFieldValue('client_nom', String(matched.nom_complet || ''));
                                  setFieldValue('customer_email', matched.email || values.customer_email || '');
                                  setFieldValue('phone', (matched as any).telephone || (matched as any).phone || (values as any).phone || '');
                                } else {
                                  // If we can't match, clear to force picking a valid client from list.
                                  setFieldValue('client_nom', '');
                                  setFieldValue('customer_email', order.customer_email || order.email || values.customer_email || '');
                                  setFieldValue('phone', order.phone || order.customer_phone || values.phone || '');
                                }
                                setFieldValue('adresse_livraison', order.adresse_livraison || values.adresse_livraison || '');

                                const nextItems = normalizeEcommerceItemsToForm(order);
                                setFieldValue('items', nextItems);
                                seedRawFromItems(nextItems, values.type);
                              } else {
                                // If user cleared selection, unlink order but keep manual items
                                if (!ref) setFieldValue('ecommerce_order_id', '');
                              }
                            }}
                            placeholder="Rechercher une commande (ORD...)"
                            className="w-full"
                            maxDisplayItems={200}
                            autoOpenOnFocus
                            allowCreate
                            createText="Utiliser"
                            onCreate={(label) => {
                              setFieldValue('order_number', label);
                              setFieldValue('ecommerce_order_id', '');
                            }}
                          />
                          <ErrorMessage name="order_number" component="div" className="text-red-500 text-sm mt-1" />
                        </div>
                      </div>
                      {/* hidden but validated */}
                      <Field type="hidden" name="ecommerce_order_id" />
                      <ErrorMessage name="ecommerce_order_id" component="div" className="text-red-500 text-sm mt-1" />
                    </>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
        Ce client ne sera pas ajouté à la page Contacts.
                  </div>
                  {values.type === 'AvoirEcommerce' && (
                    <ErrorMessage name="client_nom" component="div" className="text-red-500 text-sm mt-1" />
                  )}
                </div>
              )}

              {/* Partial Payment Option for Comptant - Moved outside client block for visibility */}
              {values.type === 'Comptant' && (
                <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 mb-4">
                  <div className="mb-3 max-w-xs">
                    <label htmlFor="montant_ignorer" className="block text-sm font-medium text-gray-700 mb-1">
                      Montant ignoré fond caisse (DH)
                    </label>
                    <Field
                      id="montant_ignorer"
                      name="montant_ignorer"
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm"
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      Fond caisse prendra: total - montant ignoré.
                    </div>
                  </div>
                  {comptantPartialPaymentMode === 'hidden' && (
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <input
                        type="checkbox"
                        checked={!!values.payer_partiellement}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const montantTotalComptant = computeComptantMontantTotal(values, qtyRaw, unitPriceRaw);
                          const montantPayeHistorique = Array.isArray(comptantPaymentsHistory)
                            ? comptantPaymentsHistory.reduce((sum: number, payment: any) => sum + (Number(payment?.montant || 0) || 0), 0)
                            : 0;
                          setFieldValue('payer_partiellement', checked);
                          if (checked) {
                            const resteInitial = Math.max(0, Number((montantTotalComptant - montantPayeHistorique).toFixed(2)));
                            setFieldValue('reste', resteInitial);
                            setFieldValue('montant_paye_saisi', '');
                          } else {
                            setFieldValue('reste', 0);
                            setFieldValue('montant_paye_saisi', '');
                          }
                        }}
                      />
                      Bon comptant non paye
                    </label>
                  )}
                  {comptantPartialPaymentMode === 'required' && (
                    <div className="text-sm font-medium text-gray-800">Bon comptant non payé</div>
                  )}
                      {values.payer_partiellement && (
                    <div className={`mt-3 animate-fadeIn ${comptantPartialPaymentMode === 'required' ? '' : 'pl-6'}`}>
                      <div className="flex items-center gap-3">
                        <ComptantPaidAmountField
                          qtyRaw={qtyRaw}
                          unitPriceRaw={unitPriceRaw}
                          paymentHistory={comptantPaymentsHistory}
                          isEditMode={isEditMode}
                        />
                      </div>
                      {isEditMode && Array.isArray(comptantPaymentsHistory) && comptantPaymentsHistory.length > 0 && (
                        <div className="mt-3 rounded-md border border-blue-200 bg-white p-3">
                          <div className="text-sm font-semibold text-gray-800 mb-2">Historique des paiements</div>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {comptantPaymentsHistory.map((payment: any) => (
                              <div
                                key={payment.id}
                                className="flex items-start justify-between gap-3 rounded border border-gray-200 px-3 py-2 text-sm"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-gray-800">
                                    {formatDateTimeWithHour(payment.date_paiement)}
                                  </div>
                                  <div className="text-xs text-gray-500 break-words">
                                    {payment.note || 'Sans note'}
                                  </div>
                                </div>
                                <div className="shrink-0 font-semibold text-blue-700">
                                  {Number(payment.montant || 0).toFixed(2)} DH
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Fournisseur */}
              {(values.type === 'Commande' || values.type === 'AvoirFournisseur' || ((values.type === 'Sortie' || values.type === 'Avoir') && values.vendre_au_fournisseur)) && (
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="fournisseur_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Fournisseur *
                    </label>
                    <button
                      type="button"
                      className="text-blue-600 underline text-xs"
                      disabled={isQtyOnlyEdit}
                      onClick={() => {
                        if (isQtyOnlyEdit) return;
                        setIsContactModalOpen('Fournisseur');
                      }}
                    >
                      Nouveau fournisseur
                    </button>
                  </div>
                  <SearchableSelect
                    loading={fournisseurSelectLoading}
                    onSearchTermChange={setFournisseurSearchTerm}
                    options={fournisseurOptions}
                    value={values.fournisseur_id}
                    valueLabelFallback={values.fournisseur_nom || ''}
                    disabled={isQtyOnlyEdit}
                    onChange={(fournisseurId) => {
                      if (isQtyOnlyEdit) return;
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
                    minSearchChars={2}
                    autoOpenOnFocus
                  />
                  <ErrorMessage name="fournisseur_id" component="div" className="text-red-500 text-sm mt-1" />
                  {values.fournisseur_id && (
                    <ContactSoldeCumuleHint
                      contactId={values.fournisseur_id}
                      contactType="Fournisseur"
                      colorClassName="bg-orange-50"
                      labelClassName="text-orange-700"
                      valueClassName="text-orange-800"
                    />
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
                        disabled={isQtyOnlyEdit}
                        onClick={() => {
                          if (isQtyOnlyEdit) return;
                          const next = !showRemisePanel;
                          setShowRemisePanel(next);
                          if (next && values.type === 'Comptant') {
                            setRemiseTargetIsBonClient(false);
                          }
                        }}
                        className="flex items-center text-purple-600 hover:text-purple-800 disabled:opacity-60"
                        title={showRemisePanel ? 'Masquer remises' : 'Afficher / appliquer des remises'}
                      >
                        {showRemisePanel ? 'Masquer remises' : 'Appliquer remises'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isQtyOnlyEdit}
                      onClick={() => {
                        if (isQtyOnlyEdit) return;
                        appendEmptyItems(1, true);
                      }}
                      className="flex items-center text-blue-600 hover:text-blue-800 disabled:opacity-60"
                    >
                      <Plus size={16} className="mr-1" /> Ajouter ligne
                    </button>
                    {(values.type === 'Charge' || values.type === 'AvoirCharge') && (
                      <button
                        type="button"
                        disabled={isQtyOnlyEdit}
                        onClick={() => {
                          if (isQtyOnlyEdit) return;
                          appendDetailedItem();
                        }}
                        className="flex items-center text-amber-600 hover:text-amber-800 disabled:opacity-60"
                      >
                        <Plus size={16} className="mr-1" /> Ajouter ligne détaillée
                      </button>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        inputMode="numeric"
                        value={bulkLineCount}
                        disabled={isQtyOnlyEdit}
                        onChange={(e) => setBulkLineCount(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                        className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                        aria-label="Nombre de lignes à ajouter"
                      />
                      <button
                        type="button"
                        disabled={isQtyOnlyEdit}
                        onClick={() => {
                          if (isQtyOnlyEdit) return;
                          appendEmptyItems(Number(bulkLineCount || 0), false);
                        }}
                        className="flex items-center text-indigo-600 hover:text-indigo-800 disabled:opacity-60"
                      >
                        <Plus size={16} className="mr-1" /> Ajouter plusieurs
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isQtyOnlyEdit}
                      onClick={() => {
                        if (isQtyOnlyEdit) return;
                        const rowIndex = appendEmptyItems(1, false);
                        setTargetRowIndex(rowIndex);
                        setIsProductModalOpen(true);
                      }}
                      className="flex items-center text-green-600 hover:text-green-800 disabled:opacity-60"
                    >
                      <Plus size={16} className="mr-1" /> Nouveau produit
                    </button>
                  </div>
                </div>

                {/* Remise panel */}
                {showRemisePanel && (values.type === 'Sortie' || values.type === 'Comptant') && (
                  <div className="mb-4 p-3 border rounded bg-purple-50">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-sm text-gray-700">Remise pour</label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={remiseTargetIsBonClient}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRemiseTargetIsBonClient(checked);
                            if (checked) {
                              setSelectedRemiseId('');
                            }
                          }}
                        />
                        Même client du bon
                      </label>

                      {!remiseTargetIsBonClient && (
                        <div className="min-w-[280px]">
                          <SearchableSelect
                            options={(clientRemiseOptions || []).map((c: any) => ({
                              value: String(c.id),
                              label: `${c.nom || ''}${c.cin ? ' ' + c.cin : ''}${c.phone ? ' ' + c.phone : ''}`.trim(),
                              data: c,
                            }))}
                            value={typeof selectedRemiseId === 'number' ? String(selectedRemiseId) : ''}
                            onChange={(v) => setSelectedRemiseId(v ? Number(v) : '')}
                            placeholder="Choisir ou créer un client remise"
                            className="w-[280px]"
                            autoOpenOnFocus
                            allowCreate
                            createText="Créer"
                            onCreate={async (label) => {
                              try {
                                const created: any = await createClientRemise({
                                  nom: label,
                                  type: 'client-remise',
                                }).unwrap();
                                if (created?.id) {
                                  setLocalCreatedRemiseClients((prev) => {
                                    const exists = (prev || []).some((x: any) => String(x?.id) === String(created.id));
                                    return exists ? (prev || []) : [created, ...(prev || [])];
                                  });
                                  setSelectedRemiseId(Number(created.id));
                                  showSuccess('Client remise créé');
                                }
                              } catch (e: any) {
                                showError(e?.data?.message || 'Erreur création client remise');
                              }
                            }}
                          />
                        </div>
                      )}

                      {values.type === 'Sortie' && remiseTargetIsBonClient && !values.client_id && (
                        <span className="text-xs text-orange-700">
                          Pour "Même client", sélectionnez un client.
                        </span>
                      )}

                      {(() => {
                        const c = typeof selectedRemiseId === 'number' ? clientRemiseOptions.find((x: any) => x.id === selectedRemiseId) : null;
                        return c ? (
                          <span className="text-sm text-gray-600">Total Remise (profil): {Number(c.total_remise || 0).toFixed(2)} DH</span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                )}

                {(() => {
                  if (false && values.type === 'Charge') {
                    return (
                      <>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                          <div className="text-gray-700">
                            {values.items.length === 0
                              ? 'Aucune ligne charge'
                              : `${values.items.length} lignes charge dans le bon`}
                          </div>
                        </div>

                        <div className="responsive-table-container max-h-[58vh] rounded-lg border border-gray-200 bg-white shadow-sm">
                          <FieldArray name="items">
                            {({ remove }) => (
                              <table className="min-w-full divide-y divide-gray-200 table-mobile-compact">
                                <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                                  <tr>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[220px]">Désignation</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[220px]">Produit catalogue</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">Qté</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">Prix achat</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">Cout revient</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">Prix gros</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">Prix vente</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Total</th>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[50px]">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {values.items.map((row: any, index: number) => {
                                    const isDetailedLine = row.line_mode === 'detail';
                                    const chargeTotal = (Number(row.prix_unitaire) || 0) * (parseFloat(normalizeDecimal(qtyRaw[index] ?? String(row.quantite ?? ''))) || 0);
                                    return (
                                      <tr key={row._rowId || `charge-item-${index}`}>
                                        <td className="px-1 py-2">
                                          {isDetailedLine ? (
                                            <input
                                              type="text"
                                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                              value={row.designation_custom ?? row.designation ?? ''}
                                              onChange={(e) => {
                                                setFieldValue(`items.${index}.designation_custom`, e.target.value);
                                                setFieldValue(`items.${index}.designation`, e.target.value);
                                              }}
                                              placeholder="Ex: Charge 1 mazot"
                                              disabled={isQtyOnlyEdit}
                                            />
                                          ) : (
                                            <div className="space-y-1">
                                              {String(row.designation || '').trim() && (
                                                <div className="text-sm font-medium text-gray-800">
                                                  {String(row.designation || '').trim()}
                                                </div>
                                              )}
                                              {row.product_reference && (
                                                <div className="text-[11px] text-gray-500">
                                                  {`Ref ${row.product_reference}`}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-1 py-2">
                                          <SearchableSelect
                                            loading={!heavyDataReady}
                                            options={simpleProductOptions}
                                            value={row.product_id ? String(row.product_id) : ''}
                                            valueLabelFallback=""
                                            onChange={(selectedValue) => {
                                              const product = products.find((p: any) => String(p.id) === String(selectedValue));
                                              if (!product) return;
                                              const qty = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                              const prixAchat = Number(product.prix_achat || 0);
                                              setFieldValue(`items.${index}.product_id`, product.id);
                                              setFieldValue(`items.${index}.product_reference`, String(product.reference ?? product.id));
                                              setFieldValue(`items.${index}.designation`, product.designation || '');
                                              if (isDetailedLine && !String(values.items[index].designation_custom || '').trim()) {
                                                setFieldValue(`items.${index}.designation_custom`, product.designation || '');
                                              }
                                              setFieldValue(`items.${index}.prix_achat`, prixAchat);
                                              setFieldValue(`items.${index}.cout_revient`, Number(product.cout_revient || 0));
                                              setFieldValue(`items.${index}.prix_gros`, Number(product.prix_gros || 0));
                                              setFieldValue(`items.${index}.prix_unitaire`, Number(product.prix_vente || 0));
                                              setFieldValue(`items.${index}.kg`, Number(product.kg || 0));
                                              setFieldValue(`items.${index}.total`, qty * prixAchat);
                                            }}
                                            placeholder="Produit optionnel"
                                            className="w-full"
                                          />
                                        </td>
                                        <td className="px-1 py-2">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                            value={qtyRaw[index] ?? String(row.quantite ?? '')}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              if (!isDecimalLike(raw)) return;
                                              setQtyRaw((prev) => ({ ...prev, [index]: raw }));
                                              const q = parseFloat(normalizeDecimal(raw)) || 0;
                                              setFieldValue(`items.${index}.quantite`, q);
                                              setFieldValue(`items.${index}.total`, q * (Number(values.items[index].prix_unitaire) || 0));
                                            }}
                                            disabled={isQtyOnlyEdit}
                                          />
                                        </td>
                                        {(['prix_achat', 'cout_revient', 'prix_gros', 'prix_unitaire'] as const).map((field) => (
                                          <td key={field} className="px-1 py-2">
                                            <input
                                              type="text"
                                              inputMode="decimal"
                                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                              value={String(values.items[index]?.[field] ?? '')}
                                              onChange={(e) => {
                                                const raw = e.target.value;
                                                if (!isDecimalLike(raw)) return;
                                                const nextValue = parseFloat(normalizeDecimal(raw)) || 0;
                                                setFieldValue(`items.${index}.${field}`, nextValue);
                                                if (field === 'prix_unitaire') {
                                                  const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                                  setFieldValue(`items.${index}.total`, q * nextValue);
                                                }
                                              }}
                                              disabled={isQtyOnlyEdit}
                                            />
                                          </td>
                                        ))}
                                        <td className="px-1 py-2 text-sm font-medium">{formatFull(chargeTotal)} DH</td>
                                        <td className="px-1 py-2">
                                          <button
                                            type="button"
                                            disabled={isQtyOnlyEdit}
                                            onClick={() => {
                                              remove(index);
                                              setQtyRaw((prev) => {
                                                const next = { ...prev };
                                                delete next[index];
                                                return next;
                                              });
                                            }}
                                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                          {!isDetailedLine && (
                                            <button
                                              type="button"
                                              disabled={isQtyOnlyEdit}
                                              onClick={() => {
                                                setFieldValue(`items.${index}.line_mode`, 'detail');
                                              }}
                                              className="mt-2 block text-[11px] text-amber-700 hover:text-amber-900 disabled:opacity-50"
                                            >
                                              Passer en détaillée
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </FieldArray>
                        </div>
                      </>
                    );
                  }

                  const showProfitColumn = ['Sortie','Comptant','Charge','Avoir','AvoirComptant'].includes(values.type);
                  const showCommandeSpecialColumns = values.type === 'Commande';
                  const showRemiseColumn = showRemisePanel && (values.type === 'Sortie' || values.type === 'Comptant');
                  const visibleEntries = ((values.type === 'Charge' || values.type === 'AvoirCharge')
                    ? values.items.map((row: any, index: number) => ({ row, index })).filter(({ row }) => row?.line_mode !== 'detail')
                    : values.items.map((row: any, index: number) => ({ row, index })));
                  const showSnapshotBarreColumn = values.type !== 'Commande' && visibleEntries.some(({ row }: any) => !!row?.unite_special);
                  const detailedChargeEntries = (values.type === 'Charge' || values.type === 'AvoirCharge')
                    ? values.items.map((row: any, index: number) => ({ row, index })).filter(({ row }) => row?.line_mode === 'detail')
                    : [];
                  const emptyColSpan = 8 + (showRemiseColumn ? 1 : 0) + (showProfitColumn ? 1 : 0) + (showCommandeSpecialColumns ? 3 : 0) + (showSnapshotBarreColumn ? 1 : 0);

                  return (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                        <div className="text-gray-700">
                          {visibleEntries.length === 0
                            ? 'Aucune ligne produit'
                            : `${visibleEntries.length} lignes produit dans le bon`}
                        </div>
                      </div>

                      <div className="responsive-table-container max-h-[58vh] rounded-lg border border-gray-200 bg-white shadow-sm">
                        <FieldArray name="items">
                          {({ remove }) => (
                            <table className="min-w-full divide-y divide-gray-200 table-mobile-compact">
                              <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[200px]">
                              Produit (Réf - Désignation)
                            </th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                              Variante
                            </th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                              Unité
                            </th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">
                              Qté
                            </th>
                            {showCommandeSpecialColumns && (
                              <>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[70px]">
                                  Unit sp.
                                </th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[85px]">
                                  Nbr barre
                                </th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[85px]">
                                  Facteur
                                </th>
                              </>
                            )}
                            {showSnapshotBarreColumn && (
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">
                                Nbr barre
                              </th>
                            )}
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
                            {showProfitColumn && (
                              <th className="px-2 py-2 text-left text-xs font-medium text-green-600 uppercase tracking-wider w-[80px]">
                                Profit
                              </th>
                            )}
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[50px]">
                              Actions
                            </th>
                          </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                          {visibleEntries.length === 0 ? (
                            <tr>
                              <td colSpan={emptyColSpan} className="px-4 py-4 text-center text-sm text-gray-500">
                                Aucun produit ajouté. Cliquez sur "Ajouter un produit" pour commencer.
                              </td>
                            </tr>
                          ) : (
                            visibleEntries.map(({ row, index }: any) => {
                              return (
                              <tr key={row._rowId || `item-${index}`}>
                                {/* Produit combiné (Réf - Désignation) */}
                                <td className="px-1 py-2 w-[200px]">
                                  <SearchableSelect
                                    loading={productSelectLoading}
                                    onSearchTermChange={setProductSearchTerm}
                                    options={(() => {
                                      if (useSnapshotSelection && filteredSnapshotProducts.length > 0) {
                                        // Smart filtered: qty>0 snapshots shown, or latest snapshot if all qty<=0
                                        const sorted = [...filteredSnapshotProducts].sort((a: any, b: any) => {
                                          // Group by product designation for alphabetical browsing
                                          const desA = String(a.designation ?? '').toLowerCase();
                                          const desB = String(b.designation ?? '').toLowerCase();
                                          if (desA !== desB) return desA.localeCompare(desB);
                                          // Same product: sort by variant name
                                          const vA = String(a.variant_name ?? '').toLowerCase();
                                          const vB = String(b.variant_name ?? '').toLowerCase();
                                          if (vA !== vB) return vA.localeCompare(vB);
                                          // Same product+variant: FIFO priority (1 = oldest = first)
                                          const pA = Number(a.fifo_priority ?? 999);
                                          const pB = Number(b.fifo_priority ?? 999);
                                          return pA - pB;
                                        });
                                        const snapshotOptions = sorted.map((p: any) => {
                                          const variantMeta = p.variant_id
                                            ? variantCatalogMap.get(`${p.id}:${p.variant_id}`)
                                            : null;
                                          const displayReference = String(
                                            variantMeta?.variantReference || (p.reference ?? p.id)
                                          ).trim();
                                          const variantLabel = String(
                                            p.variant_name ?? variantMeta?.variantName ?? ''
                                          ).trim();
                                          const parentRefSuffix =
                                            variantMeta?.variantReference &&
                                            variantMeta?.productReference &&
                                            variantMeta.variantReference !== variantMeta.productReference
                                              ? ` | Ref produit: ${variantMeta.productReference}`
                                              : '';
                                          // Merged entry: single line per product+variant+prix_vente
                                          if (p._isMerged) {
                                            const nom = p.designation ?? '';
                                            const variant = variantLabel ? ` - ${variantLabel}` : '';
                                            const catalogProduct = productMap.get(String(p.id));
                                            const prixVenteLabel = formatPrixVenteOption(p.prix_vente ?? variantMeta?.variant?.prix_vente ?? catalogProduct?.prix_vente);
                                            const prixVente2Label = formatPrixVente2Option(p.prix_vente_2 ?? variantMeta?.variant?.prix_vente_2 ?? catalogProduct?.prix_vente_2);
                                            const qte = `${formatPrixAchatOption(p.prix_achat) ? ` | ${formatPrixAchatOption(p.prix_achat)}` : ''}${prixVenteLabel ? ` | ${prixVenteLabel}` : ''}${prixVente2Label ? ` | ${prixVente2Label}` : ''}${p.snapshot_quantite != null ? ` (${Number(p.snapshot_quantite)})` : ''}`;
                                            const pv = Number(p.prix_vente ?? 0);
                                            return {
                                              value: `merged:${p.id}:${p.variant_id || 0}:${pv}`,
                                              label: `[Lots fusionnés] ${displayReference} - ${nom}${variant}${qte}${parentRefSuffix}`.trim(),
                                              data: p,
                                            };
                                          }
                                          // Individual snapshot lines (different prix_vente)
                                          const fifo = p.fifo_priority;
                                          const priorityTag = fifo === 1 ? '⭐' : fifo ? `#${fifo}` : '';
                                          const nom = p.designation ?? '';
                                          const variant = variantLabel ? ` - ${variantLabel}` : '';
                                          const catalogProduct = productMap.get(String(p.id));
                                          const prixVenteLabel = formatPrixVenteOption(p.prix_vente ?? variantMeta?.variant?.prix_vente ?? catalogProduct?.prix_vente);
                                          const prixVente2Label = formatPrixVente2Option(p.prix_vente_2 ?? variantMeta?.variant?.prix_vente_2 ?? catalogProduct?.prix_vente_2);
                                          const qte = `${formatPrixAchatOption(p.prix_achat || resolveOptionPrixAchat(p, variantMeta?.variant ?? null, snapshotProducts as any[])) ? ` | ${formatPrixAchatOption(p.prix_achat || resolveOptionPrixAchat(p, variantMeta?.variant ?? null, snapshotProducts as any[]))}` : ''}${prixVenteLabel ? ` | ${prixVenteLabel}` : ''}${prixVente2Label ? ` | ${prixVente2Label}` : ''}${p.snapshot_quantite != null ? ` (${Number(p.snapshot_quantite)})` : ''}`;
                                          const bonInfo = p.bon_commande_id ? `Bon #${p.bon_commande_id}` : p.snapshot_id ? `Snap #${p.snapshot_id}` : '';
                                          return {
                                            value: p.snapshot_id ? `snap:${p.snapshot_id}:${p.id}` : String(p.id),
                                            label: p.snapshot_id
                                              ? `${priorityTag} ${displayReference} - ${nom}${variant}${qte}${parentRefSuffix} | ${bonInfo}`.trim()
                                              : `${displayReference} - ${nom}${variant}${parentRefSuffix}`.trim(),
                                            data: p,
                                          };
                                        });

                                        const presentKeys = new Set<string>(
                                          sorted.map((p: any) => `${String(p?.id)}:${String(p?.variant_id || 0)}`)
                                        );
                                        const extraProductOptions = catalogProductVariantOptions.filter((option) => {
                                          if (String(option.value).startsWith('catalogvar:')) {
                                            const [, variantId, productId] = String(option.value).split(':');
                                            return !presentKeys.has(`${productId}:${variantId}`);
                                          }
                                          return !presentKeys.has(`${String(option.value)}:0`);
                                        });

                                        return [...snapshotOptions, ...extraProductOptions];
                                      }
                                      // For Commande: use flattened product+variant list
                                      if (values.type === 'Commande') {
                                        return commandeProductOptions;
                                      }
                                      return catalogProductVariantOptions;
                                    })()}
                                    value={(() => {
                                      const snapId = values.items[index].product_snapshot_id;
                                      const prodId = values.items[index].product_id;
                                      const varId = values.items[index].variant_id;
                                      if (useSnapshotSelection && snapId) {
                                        return `snap:${snapId}:${prodId}`;
                                      }
                                      // For merged items (all roles): return merged value format with prix_vente
                                      if (useSnapshotSelection && prodId && !snapId) {
                                        const pv = Number(values.items[index].prix_unitaire ?? 0);
                                        const hasMergedSnapshot = (filteredSnapshotProducts as any[]).some(
                                          (p: any) =>
                                            p._isMerged &&
                                            String(p.id) === String(prodId) &&
                                            String(p.variant_id || 0) === String(varId || 0) &&
                                            Number(p.prix_vente ?? 0) === pv
                                        );
                                        if (hasMergedSnapshot) {
                                          return `merged:${prodId}:${varId || 0}:${pv}`;
                                        }
                                        if (varId) {
                                          return `catalogvar:${varId}:${prodId}`;
                                        }
                                      }
                                      // For Commande: if a variant is selected, use var: prefix
                                      if (values.type === 'Commande' && varId) {
                                        return `var:${varId}:${prodId}`;
                                      }
                                      if (values.type !== 'Commande' && varId) {
                                        return `catalogvar:${varId}:${prodId}`;
                                      }
                                      // product_snapshot_id is null → match directly by product_id
                                      return String(prodId || '');
                                    })()}
                                    valueLabelFallback={(() => {
                                      const prodId = values.items[index].product_id;
                                      if (!prodId) return '';

                                      const ref = String(values.items[index].product_reference ?? prodId).trim();
                                      const fromRow = String(values.items[index].designation ?? '').trim();
                                      const variantId = values.items[index].variant_id;
                                      let variantSuffix = '';
                                      if (variantId) {
                                        const fromCatalog = products.find((p: any) => String(p.id) === String(prodId));
                                        const v = (fromCatalog?.variants ?? []).find((vv: any) => String(vv.id) === String(variantId));
                                        const fromSnapshot = (snapshotProducts as any[]).find(
                                          (s: any) => String(s.id) === String(prodId) && String(s.variant_id || '') === String(variantId)
                                        );
                                        const variantName = String(
                                          values.items[index].variant_name ?? fromSnapshot?.variant_name ?? v?.variant_name ?? ''
                                        ).trim();
                                        if (variantName) variantSuffix = ` - ${variantName}`;
                                      }
                                      const isMerged = (() => {
                                        if (!useSnapshotSelection) return false;
                                        const snapId = values.items[index].product_snapshot_id;
                                        if (snapId) return false;
                                        const pv = Number(values.items[index].prix_unitaire ?? 0);
                                        return (filteredSnapshotProducts as any[]).some(
                                          (p: any) =>
                                            p._isMerged &&
                                            String(p.id) === String(prodId) &&
                                            String(p.variant_id || 0) === String(variantId || 0) &&
                                            Number(p.prix_vente ?? 0) === pv
                                        );
                                      })();
                                      const prefix = isMerged ? '[Lots fusionnés] ' : '';

                                      if (fromRow) return `${prefix}${ref} - ${fromRow}${variantSuffix}`.trim();

                                      const fromCatalog = products.find((p: any) => String(p.id) === String(prodId));
                                      const des = String(fromCatalog?.designation ?? '').trim();
                                      return des ? `${prefix}${ref} - ${des}${variantSuffix}`.trim() : `${prefix}${ref}`;
                                    })()}
                                    onChange={(selectedValue) => {
                                      if (isQtyOnlyEdit) return;
                                      let product: any = null;
                                      let selectedVariant: any = null;

                                      // Handle Commande variant selection: "var:<variantId>:<productId>"
                                      if (selectedValue.startsWith('var:')) {
                                        const parts = selectedValue.split(':');
                                        const variantId = parseInt(parts[1]);
                                        const productId = parseInt(parts[2]);
                                        product = products.find((p: any) => p.id === productId);
                                        if (product) {
                                          selectedVariant = (product.variants ?? []).find((v: any) => v.id === variantId);
                                        }
                                      } else if (selectedValue.startsWith('catalogvar:')) {
                                        const parts = selectedValue.split(':');
                                        const variantId = parseInt(parts[1]);
                                        const productId = parseInt(parts[2]);
                                        product = products.find((p: any) => p.id === productId);
                                        if (product) {
                                          selectedVariant = (product.variants ?? []).find((v: any) => v.id === variantId);
                                        }
                                      } else if (selectedValue.startsWith('merged:')) {
                                        // Merged product selection: "merged:<productId>:<variantId>:<prixVente>"
                                        const parts = selectedValue.split(':');
                                        const productId = parseInt(parts[1]);
                                        const variantId = parseInt(parts[2]) || null;
                                        const pvMatch = parseFloat(parts[3]) || 0;
                                        product = (filteredSnapshotProducts as any[]).find(
                                          (p: any) => p._isMerged && p.id === productId &&
                                            (String(p.variant_id || 0) === String(variantId || 0)) &&
                                            Number(p.prix_vente ?? 0) === pvMatch
                                        );
                                        if (!product) {
                                          product = (products as any[]).find((p: any) => String(p.id) === String(productId)) || null;
                                        }
                                      } else if (useSnapshotSelection && snapshotProducts.length > 0) {
                                        // Parse selectedValue: "snap:<snapId>:<productId>" or "p:<productId>:<idx>"
                                        if (selectedValue.startsWith('snap:')) {
                                          const parts = selectedValue.split(':');
                                          const snapId = parseInt(parts[1]);
                                          product = snapshotProducts.find((p: any) => String(p.snapshot_id) === String(snapId));
                                          // If snapshot row is missing (deleted/not returned), fallback to base product table
                                          if (!product) {
                                            const productIdFromValue = parts[2];
                                            if (productIdFromValue) {
                                              product = (products as any[]).find((p: any) => String(p.id) === String(productIdFromValue)) || null;
                                            }
                                          }
                                        } else if (selectedValue.startsWith('p:')) {
                                          const parts = selectedValue.split(':');
                                          const pId = parseInt(parts[1]);
                                          product = snapshotProducts.find((p: any) => p.id === pId && !p.snapshot_id);
                                          if (!product) {
                                            product = (products as any[]).find((p: any) => String(p.id) === String(pId)) || null;
                                          }
                                        } else {
                                          product = snapshotProducts.find((p: any) => String(p.id) === selectedValue);
                                          if (!product) {
                                            product = (products as any[]).find((p: any) => String(p.id) === String(selectedValue)) || null;
                                          }
                                        }
                                      } else {
                                        product = products.find((p: any) => String(p.id) === selectedValue);
                                      }

                                        if (product) {
                                          // 🔍 DEBUG: Product selection
                                          console.log('🟢 [PRODUCT SELECT]', {
                                            row: index,
                                            product_id: product.id,
                                          designation: product.designation,
                                          snapshot_id: product.snapshot_id || null,
                                          variant_id: selectedVariant?.id || product.variant_id || null,
                                          isSnapshot: !!product.snapshot_id,
                                          'product.prix_achat': product.prix_achat,
                                          'product.cout_revient': product.cout_revient,
                                          'product.prix_vente': product.prix_vente,
                                          selectedVariant: selectedVariant ? selectedVariant.variant_name : null,
                                          allProductKeys: Object.keys(product),
                                        });
                                        setFieldValue(`items.${index}.product_id`, product.id);
                                        setFieldValue(
                                          `items.${index}.product_reference`,
                                          String(selectedVariant?.reference ?? product.reference ?? product.id)
                                        );
                                        setFieldValue(`items.${index}.designation`, product.designation || '');
                                        
                                        // Set snapshot reference
                                        // For merged lots: resolve the best FIFO snapshot from _mergedSnapshots or snapshotProducts
                                        let resolvedSnapshotId: number | null = product.snapshot_id || null;
                                        if (!resolvedSnapshotId && product._isMerged) {
                                          const mergedSnaps: any[] = product._mergedSnapshots ?? [];
                                          const bestMergedSnap = mergedSnaps.length > 0
                                            ? mergedSnaps[0] // already sorted by fifo_priority
                                            : findSnapshotForProductVariant(
                                                snapshotProducts as any[],
                                                product.id,
                                                selectedVariant?.id ?? product.variant_id ?? null,
                                                Number(product.prix_vente ?? 0)
                                              );
                                          resolvedSnapshotId = bestMergedSnap?.snapshot_id ?? null;
                                        }
                                        setFieldValue(`items.${index}.product_snapshot_id`, resolvedSnapshotId);
                                        if (values.type !== 'Commande') {
                                          const isSpecialSnapshot = Number(product.snapshot_unite_special || 0) === 1;
                                          setFieldValue(`items.${index}.unite_special`, isSpecialSnapshot ? 1 : 0);
                                          setFieldValue(`items.${index}.nbr_barre`, '');
                                          setFieldValue(
                                            `items.${index}.facteur_barre`,
                                            isSpecialSnapshot ? (Number(product.snapshot_facteur_barre || 0) || null) : null
                                          );
                                        }
                                        
                                        // Handle variant: from flat Commande selection or from snapshot
                                        if (selectedVariant) {
                                          setFieldValue(`items.${index}.variant_id`, selectedVariant.id);
                                        } else if (product.variant_id) {
                                          setFieldValue(`items.${index}.variant_id`, product.variant_id);
                                        } else {
                                          setFieldValue(`items.${index}.variant_id`, '');
                                        }
                                        setFieldValue(`items.${index}.unit_id`, '');

                                        const catalogProduct = (products as any[]).find(
                                          (p: any) => String(p.id) === String(product.id)
                                        );
                                        const productVariantId = selectedVariant?.id || product.variant_id || null;
                                        const catalogVariant = selectedVariant || (
                                          productVariantId && catalogProduct?.variants?.length
                                            ? (catalogProduct.variants as any[]).find(
                                                (v: any) => String(v.id) === String(productVariantId)
                                              ) || null
                                            : null
                                        );

                                        const latestSnapshotForCost = findLatestSnapshotForProductVariant(
                                          snapshotProducts as any[],
                                          product.id,
                                          productVariantId
                                        );

                                        const effectivePA = latestSnapshotForCost
                                          ? Number(latestSnapshotForCost.prix_achat ?? product.prix_achat ?? 0)
                                          : selectedVariant
                                            ? Number(selectedVariant.prix_achat ?? product.prix_achat ?? 0)
                                            : Number(product.prix_achat || 0);
                                        const effectivePV = catalogVariant
                                          ? Number(catalogVariant.prix_vente ?? catalogProduct?.prix_vente ?? product.prix_vente ?? 0)
                                          : Number((catalogProduct?.prix_vente ?? product.prix_vente) || 0);
                                        const effectiveCR = latestSnapshotForCost
                                          ? Number(latestSnapshotForCost.cout_revient ?? latestSnapshotForCost.prix_achat ?? product.cout_revient ?? 0)
                                          : selectedVariant
                                            ? Number(selectedVariant.cout_revient ?? product.cout_revient ?? 0)
                                            : Number(product.cout_revient || 0);

                                        setFieldValue(`items.${index}.prix_achat`, effectivePA);
                                        setFieldValue(`items.${index}.cout_revient`, effectiveCR);
                                        setFieldValue(
                                          `items.${index}.cout_revient_pourcentage`,
                                          selectedVariant?.cout_revient_pourcentage ?? product.cout_revient_pourcentage ?? 0
                                        );
                                        setFieldValue(
                                          `items.${index}.prix_gros_pourcentage`,
                                          selectedVariant?.prix_gros_pourcentage ?? product.prix_gros_pourcentage ?? 0
                                        );
                                        setFieldValue(
                                          `items.${index}.prix_vente_pourcentage`,
                                          catalogVariant?.prix_vente_pourcentage ?? product.prix_vente_pourcentage ?? 0
                                        );
                                        const effectiveChargePrice = effectiveCR || effectivePA || 0;
                                        const preferredPrice = resolvePreferredUnitPrice(
                                          values,
                                          product.id,
                                          productVariantId,
                                          values.items[index]?.unit_id,
                                          values.type === 'Commande' ? effectivePA : effectivePV
                                        );
                                        const effectiveUnitPrice = values.type === 'Charge'
                                          ? effectiveChargePrice
                                          : preferredPrice;
                                        if (values.type === 'Commande') {
                                          setFieldValue(`items.${index}.prix_achat`, preferredPrice);
                                        }
                                        setFieldValue(`items.${index}.prix_unitaire`, effectiveUnitPrice);
                                        const priceForDisplay = values.type === 'Commande' ? preferredPrice : effectiveUnitPrice;
                                        setUnitPriceRaw((prev) => ({ ...prev, [index]: String(priceForDisplay) }));
                                        setFieldValue(`items.${index}.kg`, product.kg ?? 0);
                                        const q =
                                          parseFloat(
                                            normalizeDecimal(
                                              qtyRaw[index] ?? String(values.items[index].quantite ?? '')
                                            )
                                          ) || 0;
                                        setFieldValue(`items.${index}.total`, q * priceForDisplay);
                                        setTimeout(() => focusCell(index, 'qty'), 0);
                                      }
                                    }}
                                    placeholder="Sélectionner produit"
                                    className="w-full"
                                    disabled={isQtyOnlyEdit}
                                    maxDisplayItems={300}
                                    minSearchChars={2}
                                    autoOpenOnFocus
                                    buttonProps={{
                                      'data-row': index as any,
                                      'data-col': 'product' as any,
                                      onKeyDown: onCellKeyDown(index, 'product'),
                                    }}
                                  />
                                </td>

                                {/* Variante */}
                                <td className="px-1 py-2 w-[100px]">
                                  {(() => {
                                    const product = products.find((p: any) => String(p.id) === String(values.items[index].product_id));
                                    const variants = product?.variants ?? [];
                                    const isRequired = !!(product as any)?.isObligatoireVariant && Array.isArray(variants) && variants.length > 0;
                                    const isMissing = isRequired && !String(values.items[index].variant_id || '').trim();
                                    if (!product || variants.length === 0) {
                                      return <span className="text-xs text-gray-400">-</span>;
                                    }
                                    return (
                                      <select
                                        className={`w-full px-1 py-1 text-sm border rounded ${isMissing ? 'border-red-500' : ''}`}
                                        disabled={isQtyOnlyEdit}
                                        value={values.items[index].variant_id || ''}
                                        data-row={index}
                                        data-col="variant"
                                        onPointerDown={() => {
                                          suppressPriceBlurRef.current = { row: index, ts: Date.now() };
                                        }}
                                        onChange={(e) => {
                                          if (isQtyOnlyEdit) return;
                                          const vId = e.target.value;
                                          setFieldValue(`items.${index}.variant_id`, vId);
                                          const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                          const unitIdSel = values.items[index].unit_id;
                                          const unitsForProduct = product?.units ?? [];

                                          const factorSel = unitIdSel
                                            ? Number(
                                                (unitsForProduct.find((u: any) => String(u.id) === String(unitIdSel)) || {})
                                                  .conversion_factor
                                              ) || 1
                                            : 1;

                                          // Try to resolve snapshot product for more accurate historic prices
                                          let snapshotProd: any = null;
                                          const snapIdForRow = values.items[index].product_snapshot_id;
                                          if (snapIdForRow && useSnapshotSelection && snapshotProducts.length > 0) {
                                            snapshotProd = snapshotProducts.find((p: any) => String(p.snapshot_id) === String(snapIdForRow)) || null;
                                          }

                                          if (vId) {
                                            const variant = variants.find((v: any) => String(v.id) === vId);
                                            if (variant) {
                                              snapshotProd = useSnapshotSelection && snapshotProducts.length > 0
                                                ? findSnapshotForProductVariant(
                                                    snapshotProducts as any[],
                                                    values.items[index].product_id,
                                                    vId,
                                                    getCatalogPrixVente(product, vId)
                                                  )
                                                : null;
                                              setFieldValue(`items.${index}.product_snapshot_id`, snapshotProd?.snapshot_id || null);
                                              // Keep purchase/cost consistent avec variante + snapshot + unité
                                              // Use || (not ??) so that 0 values fall through to snapshot/product
                                              const baseAchat =
                                                Number(snapshotProd?.prix_achat) ||
                                                Number(variant.prix_achat) ||
                                                Number(product?.prix_achat) ||
                                                0;
                                              const baseCoutRevient: number =
                                                Number(snapshotProd?.cout_revient) ||
                                                Number((variant as any).cout_revient) ||
                                                Number(product?.cout_revient) ||
                                                baseAchat ||
                                                0;
                                              // 🔍 DEBUG: Variant selected
                                              console.log('🟡 [VARIANT SELECT]', {
                                                row: index,
                                                variant_id: vId,
                                                variant_name: variant.variant_name,
                                                'variant.prix_achat': variant.prix_achat,
                                                'variant.cout_revient': (variant as any).cout_revient,
                                                'variant.prix_vente': variant.prix_vente,
                                                snapshotProd_found: !!snapshotProd,
                                                snapIdForRow: snapshotProd?.snapshot_id || null,
                                                'snapshotProd?.prix_achat': snapshotProd?.prix_achat,
                                                'snapshotProd?.cout_revient': snapshotProd?.cout_revient,
                                                'catalog.prix_vente': getCatalogPrixVente(product, vId),
                                                'product.prix_achat': product?.prix_achat,
                                                'product.cout_revient': product?.cout_revient,
                                                'product.prix_vente': product?.prix_vente,
                                                resolved_baseAchat: baseAchat,
                                                resolved_baseCoutRevient: baseCoutRevient,
                                                unitFactor: factorSel,
                                                final_prix_achat: scaleDecimal(baseAchat, factorSel),
                                                final_cout_revient: scaleDecimal(baseCoutRevient, factorSel),
                                              });
                                              setFieldValue(`items.${index}.prix_achat`, scaleDecimal(baseAchat, factorSel));
                                              setFieldValue(
                                                `items.${index}.cout_revient`,
                                                scaleDecimal(baseCoutRevient, factorSel)
                                              );

                                              // Update price based on variant
                                              const variantBasePrice = values.type === 'Commande'
                                                ? Number(variant.prix_achat || snapshotProd?.prix_achat || product?.prix_achat || 0)
                                                : values.type === 'Charge'
                                                  ? baseCoutRevient
                                                  : getCatalogPrixVente(product, vId);

                                              // If a unit is already selected, apply its conversion factor to the variant price
                                              let effectivePrice = variantBasePrice;
                                              if (unitIdSel) {
                                                effectivePrice = scaleDecimal(variantBasePrice, factorSel);
                                              }
                                              if (values.type !== 'Charge') {
                                                effectivePrice = resolvePreferredUnitPrice(
                                                  values,
                                                  values.items[index].product_id,
                                                  vId,
                                                  unitIdSel,
                                                  effectivePrice
                                                );
                                              }

                                              if (values.type === 'Commande') {
                                                setFieldValue(`items.${index}.prix_achat`, effectivePrice);
                                              } else {
                                                setFieldValue(`items.${index}.prix_unitaire`, effectivePrice);
                                              }
                                              setUnitPriceRaw((prev) => ({ ...prev, [index]: String(effectivePrice) }));
                                              setFieldValue(`items.${index}.total`, q * effectivePrice);
                                            }
                                            return;
                                          }

                                          // Variant cleared => revert to base snapshot/product price (respect unit selection)
                                          const snapIdForRow2 = values.items[index].product_snapshot_id;
                                          let snapshotProd2: any = null;
                                          if (useSnapshotSelection && snapshotProducts.length > 0) {
                                            snapshotProd2 = findSnapshotForProductVariant(
                                              snapshotProducts as any[],
                                              values.items[index].product_id,
                                              '',
                                              getCatalogPrixVente(product)
                                            );
                                            setFieldValue(`items.${index}.product_snapshot_id`, snapshotProd2?.snapshot_id || null);
                                          } else if (snapIdForRow2) {
                                            snapshotProd2 = null;
                                            setFieldValue(`items.${index}.product_snapshot_id`, null);
                                          }

                                          const basePriceAchat = Number(snapshotProd2?.prix_achat) || Number(product?.prix_achat) || 0;
                                          const basePriceVente = getCatalogPrixVente(product);
                                          const baseCoutRevient = Number(snapshotProd2?.cout_revient) || Number(product?.cout_revient) || basePriceAchat || 0;

                                          let effectivePrice = values.type === 'Commande'
                                            ? basePriceAchat
                                            : values.type === 'Charge'
                                              ? baseCoutRevient
                                              : basePriceVente;
                                          if (unitIdSel) {
                                            const unitSel = unitsForProduct.find((u: any) => String(u.id) === String(unitIdSel));
                                            const factorSel = Number(unitSel?.conversion_factor || 1) || 1;

                                            // Always scale purchase/cost with unit factor
                                            setFieldValue(`items.${index}.prix_achat`, scaleDecimal(basePriceAchat, factorSel));
                                            setFieldValue(
                                              `items.${index}.cout_revient`,
                                              scaleDecimal(baseCoutRevient, factorSel)
                                            );

                                            if (values.type === 'Commande') {
                                              effectivePrice = scaleDecimal(basePriceAchat, factorSel);
                                            } else if (values.type === 'Charge') {
                                              effectivePrice = scaleDecimal(baseCoutRevient, factorSel);
                                            } else {
                                              const unitPv = unitSel?.prix_vente;
                                              const pvNum = unitPv === null || unitPv === undefined ? null : Number(unitPv);
                                              if (pvNum !== null && Number.isFinite(pvNum)) {
                                                effectivePrice = pvNum;
                                              } else if (values.type === 'Charge') {
                                                newPrice = scaleDecimal(baseCR, factor);
                                              } else {
                                                effectivePrice = scaleDecimal(basePriceVente, factorSel);
                                              }
                                            }
                                          } else {
                                            // No unit selected => base purchase/cost
                                            setFieldValue(`items.${index}.prix_achat`, basePriceAchat);
                                            setFieldValue(`items.${index}.cout_revient`, baseCoutRevient);
                                          }
                                          if (values.type !== 'Charge') {
                                            effectivePrice = resolvePreferredUnitPrice(
                                              values,
                                              values.items[index].product_id,
                                              '',
                                              unitIdSel,
                                              effectivePrice
                                            );
                                          }

                                          if (values.type === 'Commande') {
                                            setFieldValue(`items.${index}.prix_achat`, effectivePrice);
                                          } else {
                                            setFieldValue(`items.${index}.prix_unitaire`, effectivePrice);
                                          }
                                          setUnitPriceRaw((prev) => ({ ...prev, [index]: String(effectivePrice) }));
                                          setFieldValue(`items.${index}.total`, q * effectivePrice);
                                        }}
                                      >
                                        <option value="">--</option>
                                        {variants.map((v: any) => (
                                          <option key={v.id} value={v.id}>
                                            {v.variant_name}
                                          </option>
                                        ))}
                                      </select>
                                    );
                                  })()}
                                </td>

                                {/* Unité */}
                                <td className="px-1 py-2 w-[100px]">
                                  {(() => {
                                    const product = products.find((p: any) => String(p.id) === String(values.items[index].product_id));
                                    const units = product?.units ?? [];
                                    const baseUnit = product?.base_unit || 'u';
                                    // Resolve snapshot product if available for this row
                                    let snapshotProd: any = null;
                                    const snapIdForRow = values.items[index].product_snapshot_id;
                                    if (snapIdForRow && useSnapshotSelection && snapshotProducts.length > 0) {
                                      snapshotProd = snapshotProducts.find((p: any) => String(p.snapshot_id) === String(snapIdForRow)) || null;
                                    }

                                    const basePriceAchat = Number(snapshotProd?.prix_achat) || Number(product?.prix_achat) || 0;
                                    const basePriceVente = getCatalogPrixVente(product, values.items[index].variant_id);
                                    if (!product || units.length === 0) {
                                      const displayUnit = !product && values.items[index].unite ? values.items[index].unite : baseUnit;
                                      return <span className="text-xs text-gray-400">{displayUnit}</span>;
                                    }
                                    return (
                                      <select
                                        className="w-full px-1 py-1 text-sm border rounded"
                                        disabled={isQtyOnlyEdit}
                                        value={values.items[index].unit_id || ''}
                                        onChange={(e) => {
                                          if (isQtyOnlyEdit) return;
                                          const uId = e.target.value;
                                          setFieldValue(`items.${index}.unit_id`, uId);
                                          
                                          let newPrice = 0;
                                          const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                          
                                          if (uId) {
                                            // Unit selected - use unit's price
                                            const unit = units.find((u: any) => String(u.id) === uId);
                                            if (unit) {
                                              const factor = Number(unit.conversion_factor || 1) || 1;
                                              // If a variant is selected, use its base price instead of product's
                                              const selectedVariantId = values.items[index].variant_id;
                                              const variantsForProduct = product?.variants ?? [];
                                              let baseA = basePriceAchat;
                                              let baseV = basePriceVente;
                                              let baseCR = Number(snapshotProd?.cout_revient) || Number(product?.cout_revient) || basePriceAchat || 0;
                                              // 🔍 DEBUG: Unit selected (before variant override)
                                              console.log('🔵 [UNIT SELECT] base values', {
                                                row: index,
                                                unit_id: uId,
                                                unit_name: unit.unit_name,
                                                factor,
                                                snapshotProd_found: !!snapshotProd,
                                                snapIdForRow: values.items[index].product_snapshot_id,
                                                'snapshotProd?.prix_achat': snapshotProd?.prix_achat,
                                                'snapshotProd?.cout_revient': snapshotProd?.cout_revient,
                                                'catalog.prix_vente': getCatalogPrixVente(product, selectedVariantId),
                                                'product.prix_achat': product?.prix_achat,
                                                'product.cout_revient': product?.cout_revient,
                                                'product.prix_vente': product?.prix_vente,
                                                basePriceAchat,
                                                basePriceVente,
                                                baseCR_initial: baseCR,
                                                selectedVariantId: selectedVariantId || 'none',
                                              });
                                              if (selectedVariantId) {
                                                const v = variantsForProduct.find((vv: any) => String(vv.id) === String(selectedVariantId));
                                                if (v) {
                                                  baseA = Number(v.prix_achat) || basePriceAchat || 0;
                                                  baseV = getCatalogPrixVente(product, selectedVariantId) || basePriceVente || 0;
                                                  baseCR = Number((v as any).cout_revient) || baseCR;
                                                }
                                              }

                                              // Always keep purchase/cost values aligned with unit conversion (even for sales bons)
                                              setFieldValue(`items.${index}.prix_achat`, scaleDecimal(baseA, factor));
                                              setFieldValue(`items.${index}.cout_revient`, scaleDecimal(baseCR, factor));
                                              // 🔍 DEBUG: Unit selected (after variant override)
                                              console.log('🔵 [UNIT SELECT] final values', {
                                                row: index,
                                                baseA_afterVariant: baseA,
                                                baseV_afterVariant: baseV,
                                                baseCR_afterVariant: baseCR,
                                                final_prix_achat: scaleDecimal(baseA, factor),
                                                final_cout_revient: scaleDecimal(baseCR, factor),
                                              });

                                              if (values.type === 'Commande') {
                                                newPrice = scaleDecimal(baseA, factor);
                                                setFieldValue(`items.${index}.prix_achat`, newPrice);
                                              } else {
                                                // If unit has an explicit selling price override, prefer it (only when no variant is selected)
                                                const unitPv = unit?.prix_vente;
                                                const pvNum = unitPv === null || unitPv === undefined ? null : Number(unitPv);
                                                if (!selectedVariantId && pvNum !== null && Number.isFinite(pvNum)) {
                                                  newPrice = pvNum;
                                                } else {
                                                  newPrice = scaleDecimal(baseV, factor);
                                                }
                                                newPrice = resolvePreferredUnitPrice(
                                                  values,
                                                  values.items[index].product_id,
                                                  selectedVariantId,
                                                  uId,
                                                  newPrice
                                                );
                                                setFieldValue(`items.${index}.prix_unitaire`, newPrice);
                                              }
                                              setUnitPriceRaw((prev) => ({ ...prev, [index]: String(newPrice) }));
                                              setFieldValue(`items.${index}.total`, q * newPrice);
                                            }
                                          } else {
                                            // Unit deselected - revert to base product price
                                            // If a variant is selected, revert to variant's base price; else product's base price
                                            const selectedVariantId = values.items[index].variant_id;
                                            const variantsForProduct = product?.variants ?? [];
                                            let baseA = basePriceAchat;
                                            let baseV = basePriceVente;
                                            let baseCR = Number(snapshotProd?.cout_revient) || Number(product?.cout_revient) || basePriceAchat || 0;
                                            if (selectedVariantId) {
                                              const v = variantsForProduct.find((vv: any) => String(vv.id) === String(selectedVariantId));
                                              if (v) {
                                                baseA = Number(v.prix_achat) || basePriceAchat || 0;
                                                baseV = getCatalogPrixVente(product, selectedVariantId) || basePriceVente || 0;
                                                baseCR = Number((v as any).cout_revient) || baseCR;
                                              }
                                            }

                                            // Revert purchase/cost to base unit values
                                            setFieldValue(`items.${index}.prix_achat`, baseA);
                                            setFieldValue(`items.${index}.cout_revient`, baseCR);

                                            if (values.type === 'Commande') {
                                              newPrice = baseA;
                                              setFieldValue(`items.${index}.prix_achat`, newPrice);
                                            } else {
                                              newPrice = values.type === 'Charge' ? baseCR : baseV;
                                              if (values.type !== 'Charge') {
                                                newPrice = resolvePreferredUnitPrice(
                                                  values,
                                                  values.items[index].product_id,
                                                  selectedVariantId,
                                                  '',
                                                  newPrice
                                                );
                                              }
                                              setFieldValue(`items.${index}.prix_unitaire`, newPrice);
                                            }
                                            setUnitPriceRaw((prev) => ({ ...prev, [index]: String(newPrice) }));
                                            setFieldValue(`items.${index}.total`, q * newPrice);
                                          }
                                        }}
                                      >
                                        <option value="">{baseUnit}</option>
                                        {units.map((u: any) => (
                                          <option key={u.id} value={u.id}>
                                            {u.unit_name}
                                          </option>
                                        ))}
                                      </select>
                                    );
                                  })()}
                                </td>


                                {/* Quantité */}
<td className="px-1 py-2 w-[80px]">
  <input
    type="text"
    inputMode="decimal"
    pattern="[0-9]*[.,]?[0-9]*"
    name={`items.${index}.quantite`}
    className={"w-full px-2 py-1 border rounded-md text-sm border-gray-300"}
    value={qtyRaw[index] ?? ''}
    onChange={(e) => {
      const raw = e.target.value;
      if (!isDecimalLike(raw)) return;
      setQtyRaw((prev) => ({ ...prev, [index]: raw }));

      const q = parseFloat(normalizeDecimal(raw)) || 0;
      const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      setFieldValue(`items.${index}.total`, q * u);
      if (values.type === 'Commande' && values.items[index].unite_special) {
        const n = parseFloat(normalizeDecimal(String(values.items[index].nbr_barre ?? '0'))) || 0;
        setFieldValue(`items.${index}.facteur_barre`, n > 0 ? q / n : null);
      } else if (values.type !== 'Commande' && values.items[index].unite_special) {
        const factor = getSnapshotBarreFactor(values.items[index]);
        if (factor > 0) setFieldValue(`items.${index}.nbr_barre`, q / factor);
      }
      
      // Ne plus restreindre la quantité par le stock disponible (demande utilisateur)
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
    onBlur={async () => {
      const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? '')) || 0;
      
      // Créer une version temporaire des valeurs avec la nouvelle quantité
      const tempValues = {
        ...values,
        items: values.items.map((item: any, idx: number) => 
          idx === index ? { ...item, quantite: q } : item
        )
      };
      
      // Vérifier le plafond avant d'appliquer les changements
      const canProceed = await checkClientCreditLimitRealTime(tempValues);
      if (!canProceed) {
        // Remettre l'ancienne valeur
        setQtyRaw((prev) => ({ ...prev, [index]: String(values.items[index].quantite || 0) }));
        return;
      }
      
      // --- Auto-snapshot collection: si qté dépasse le snapshot dispo, garder UNE seule ligne ---
      // et collecter les snapshot IDs traversés dans merged_snapshot_ids pour affichage en orange.
      // La FIFO allocation au submit s'occupera de splitter en plusieurs items backend.
      if (useSnapshotSelection && snapshotProducts.length > 0) {
        const currentSnapId = values.items[index].product_snapshot_id;
        if (currentSnapId) {
          const currentSnap = snapshotProducts.find((p: any) => String(p.snapshot_id) === String(currentSnapId));
          const snapQty = Number(currentSnap?.snapshot_quantite ?? 0);
          if (snapQty > 0 && q > snapQty) {
            const prodId = currentSnap.id;
            const varId = currentSnap.variant_id || 0;

            // Collect all FIFO snapshots that will be consumed by this quantity
            const allSnapsForProduct = (snapshotProducts as any[])
              .filter((p: any) =>
                p.id === prodId &&
                (p.variant_id || 0) === varId &&
                p.snapshot_id &&
                Number(p.snapshot_quantite ?? 0) > 0 &&
                Number(p.fifo_priority ?? 999) >= Number(currentSnap.fifo_priority ?? 0)
              )
              .sort((a: any, b: any) => Number(a.fifo_priority ?? 999) - Number(b.fifo_priority ?? 999));

            const consumedSnapshotIds: any[] = [];
            let remaining = q;
            for (const s of allSnapsForProduct) {
              if (remaining <= 0) break;
              consumedSnapshotIds.push(s.snapshot_id);
              remaining -= Number(s.snapshot_quantite ?? 0);
            }

            if (consumedSnapshotIds.length > 1) {
              // Update merged_snapshot_ids on the existing line; do NOT create a new row
              setFieldValue(`items.${index}.merged_snapshot_ids`, consumedSnapshotIds);
              setFieldValue(`items.${index}.product_snapshot_id`, null);
              setFieldValue(`items.${index}.quantite`, q);
              setQtyRaw((prev) => ({ ...prev, [index]: formatNumber(q) }));
              const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
              setFieldValue(`items.${index}.total`, q * u);
              return;
            }
          }
        }
      }

      setFieldValue(`items.${index}.quantite`, q);
      setQtyRaw((prev) => ({ ...prev, [index]: formatNumber(q) }));
      const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      setFieldValue(`items.${index}.total`, q * u);
      if (values.type === 'Commande' && values.items[index].unite_special) {
        const n = parseFloat(normalizeDecimal(String(values.items[index].nbr_barre ?? '0'))) || 0;
        setFieldValue(`items.${index}.facteur_barre`, n > 0 ? q / n : null);
      } else if (values.type !== 'Commande' && values.items[index].unite_special) {
        const factor = getSnapshotBarreFactor(values.items[index]);
        if (factor > 0) setFieldValue(`items.${index}.nbr_barre`, q / factor);
      }
    }}
  data-row={index}
  data-col="qty"
  onKeyDown={onCellKeyDown(index, 'qty')}
  />
  {(() => {
    // Afficher la quantité prédite après création de ce bon
    const product = products.find((p: any) => String(p.id) === String(values.items[index].product_id));
    if (!product) return null;
    const variantId = values.items[index].variant_id;
    const snapIdForStock = values.items[index].product_snapshot_id;
    let availableStock = 0;

    if (useSnapshotSelection && snapshotProducts?.length) {
      // Use snapshot quantities from product_snapshot table
      if (snapIdForStock) {
        // Specific snapshot selected (PDG) → use that snapshot's qty
        const snap = (snapshotProducts as any[]).find((s: any) => s.snapshot_id === Number(snapIdForStock));
        availableStock = Number(snap?.snapshot_quantite ?? 0);
      } else {
        // Merged selection → sum all snapshot quantities for this product+variant
        const matchingSnaps = (snapshotProducts as any[]).filter((s: any) =>
          String(s.id) === String(values.items[index].product_id) &&
          String(s.variant_id || '') === String(variantId || '') &&
          s.snapshot_id &&
          Number(s.snapshot_quantite) > 0
        );
        
        availableStock = matchingSnaps.reduce((sum: number, s: any) => sum + Number(s.snapshot_quantite ?? 0), 0);
      }
    } else if (variantId && Array.isArray(product.variants)) {
      const variant = product.variants.find((v: any) => String(v.id) === String(variantId));
      availableStock = Number(variant?.stock_quantity || 0);
    } else {
      availableStock = Number(product.quantite || 0);
    }

    const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
    const units = product.units || [];
    const baseUnit = product.base_unit || 'u';
    const selectedUnitId = values.items[index].unit_id;
    const factor = selectedUnitId ? (Number((units.find((u: any) => String(u.id) === String(selectedUnitId)) || {}).conversion_factor) || 1) : 1;
    let multiplier = 0;
    switch (values.type) {
      case 'Commande':
      case 'Avoir':
      case 'AvoirComptant':
        multiplier = +1; break;
      case 'Sortie':
      case 'Comptant':
      case 'AvoirFournisseur':
        multiplier = -1; break;
      default:
        multiplier = 0; // Devis, Vehicule : pas d'effet stock
    }
    const predicted = availableStock + multiplier * (q * factor);
    return (
      <div className="text-[10px] text-gray-600 mt-0.5">Stock après création: {formatFull(Number(predicted))} {baseUnit}</div>
    );
  })()}
</td>

                                {showCommandeSpecialColumns && (
                                  <>
                                    <td className="px-1 py-2 text-center w-[70px]">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        checked={!!values.items[index].unite_special}
                                        disabled={isQtyOnlyEdit}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          setFieldValue(`items.${index}.unite_special`, checked ? 1 : 0);
                                          if (!checked) {
                                            setFieldValue(`items.${index}.nbr_barre`, '');
                                            setFieldValue(`items.${index}.facteur_barre`, null);
                                            return;
                                          }
                                          const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                          const n = parseFloat(normalizeDecimal(String(values.items[index].nbr_barre ?? '0'))) || 0;
                                          setFieldValue(`items.${index}.facteur_barre`, n > 0 ? q / n : null);
                                        }}
                                      />
                                    </td>
                                    <td className="px-1 py-2 w-[85px]">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        pattern="[0-9]*[.,]?[0-9]*"
                                        className="w-full px-2 py-1 border rounded-md text-sm border-gray-300 disabled:bg-gray-100"
                                        value={values.items[index].nbr_barre ?? ''}
                                        disabled={isQtyOnlyEdit || !values.items[index].unite_special}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          if (!isDecimalLike(raw)) return;
                                          setFieldValue(`items.${index}.nbr_barre`, raw);
                                          const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                          const n = parseFloat(normalizeDecimal(raw)) || 0;
                                          setFieldValue(`items.${index}.facteur_barre`, n > 0 ? q / n : null);
                                        }}
                                      />
                                    </td>
                                    <td className="px-1 py-2 w-[85px]">
                                      <input
                                        type="text"
                                        className="w-full px-2 py-1 border rounded-md text-sm border-gray-200 bg-gray-100 text-gray-700"
                                        value={values.items[index].unite_special ? formatFull(Number(values.items[index].facteur_barre ?? 0)) : ''}
                                        disabled
                                      />
                                    </td>
                                  </>
                                )}
                                {showSnapshotBarreColumn && (
                                  <td className="px-1 py-2 w-[90px]">
                                    {values.items[index].unite_special ? (
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        pattern="[0-9]*[.,]?[0-9]*"
                                        className="w-full px-2 py-1 border rounded-md text-sm border-gray-300 disabled:bg-gray-100"
                                        value={values.items[index].nbr_barre ?? ''}
                                        disabled={isQtyOnlyEdit}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          if (!isDecimalLike(raw)) return;
                                          setFieldValue(`items.${index}.nbr_barre`, raw);
                                          const factor = getSnapshotBarreFactor(values.items[index]);
                                          const bars = parseFloat(normalizeDecimal(raw)) || 0;
                                          const q = factor > 0 ? bars * factor : 0;
                                          setFieldValue(`items.${index}.quantite`, q);
                                          setQtyRaw((prev) => ({ ...prev, [index]: q > 0 ? formatNumber(q) : '' }));
                                          const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
                                          setFieldValue(`items.${index}.total`, q * u);
                                        }}
                                      />
                                    ) : (
                                      <span className="text-xs text-gray-400">-</span>
                                    )}
                                  </td>
                                )}

                                {/* SERIE / Info rapide + debug snapshot */}
                                <td className="px-1 py-2 text-sm text-gray-700">
                                  {(() => {
                                    const item = values.items[index];
                                    const product = products.find((p: any) => String(p.id) === String(item.product_id));
                                    const unitId = item.unit_id;
                                    const units = product?.units ?? [];
                                    const unitObj = unitId ? units.find((u: any) => String(u.id) === String(unitId)) : null;
                                    const factor = unitObj ? (Number(unitObj.conversion_factor) || 1) : 1;

                                    // Resolve base PA/CR for display only.
                                    // If several active snapshots have stock, show the latest snapshot values.
                                    let snapshotProd: any = null;
                                    const snapId = item.product_snapshot_id;
                                    if (snapId && snapshotProducts.length > 0) {
                                      snapshotProd = snapshotProducts.find((p: any) => String(p.snapshot_id) === String(snapId)) || null;
                                    }
                                    const variantId = item.variant_id;
                                    const variant = variantId && product?.variants?.length
                                      ? (product.variants as any[]).find((v: any) => String(v.id) === String(variantId)) || null
                                      : null;
                                    const activeSnapshotsForRow = (snapshotProducts as any[] || []).filter((snap: any) => {
                                      if (!snap?.snapshot_id) return false;
                                      if (String(snap.id) !== String(item.product_id)) return false;
                                      if (String(snap.variant_id || '') !== String(variantId || '')) return false;
                                      const flag = snap.snapshot_en_validation;
                                      const isActive = flag == null ? true : Number(flag) !== 0;
                                      return isActive && Number(snap.snapshot_quantite ?? 0) > 0;
                                    });
                                    const latestActiveSnapshot = activeSnapshotsForRow.length > 0
                                      ? getLatestSnapshotEntry(activeSnapshotsForRow)
                                      : null;

                                    const basePA =
                                      Number(latestActiveSnapshot?.prix_achat) ||
                                      Number(snapshotProd?.prix_achat) ||
                                      Number(variant?.prix_achat) ||
                                      Number(product?.prix_achat) ||
                                      0;
                                    const baseCR =
                                      Number(latestActiveSnapshot?.cout_revient) ||
                                      Number(latestActiveSnapshot?.prix_achat) ||
                                      Number(snapshotProd?.cout_revient) ||
                                      Number((variant as any)?.cout_revient) ||
                                      Number(product?.cout_revient) ||
                                      basePA ||
                                      0;
                                    const basePV =
                                      Number(latestActiveSnapshot?.prix_vente) ||
                                      Number(snapshotProd?.prix_vente) ||
                                      Number((variant as any)?.prix_vente) ||
                                      Number(product?.prix_vente) ||
                                      0;
                                    const basePV2 =
                                      Number(latestActiveSnapshot?.prix_vente_2) ||
                                      Number(snapshotProd?.prix_vente_2) ||
                                      Number((variant as any)?.prix_vente_2) ||
                                      Number(product?.prix_vente_2) ||
                                      0;

                                    // Apply factor to base values; fall back to formik if base is 0
                                    const displayPA = basePA
                                      ? scaleDecimal(basePA, factor)
                                      : Number(item.prix_achat) || 0;
                                    const displayCR = baseCR
                                      ? scaleDecimal(baseCR, factor)
                                      : Number(item.cout_revient) || 0;
                                    const displayPV = basePV ? scaleDecimal(basePV, factor) : Number(item.prix_unitaire) || 0;
                                    const displayPV2 = basePV2 ? scaleDecimal(basePV2, factor) : 0;

                                    return <div>{`PA${displayPA} CR${displayCR} PV${displayPV} PV2${displayPV2}`}</div>;
                                  })()}
                                  <div className="text-[9px] text-orange-600">
                                    {(() => {
                                      const item = values.items[index];
                                      const mergedIds: any[] = Array.isArray(item.merged_snapshot_ids) && item.merged_snapshot_ids.length > 0
                                        ? item.merged_snapshot_ids
                                        : item.product_snapshot_id ? [item.product_snapshot_id] : [];
                                      return <>
                                        snap:{mergedIds.length > 0 ? mergedIds.join('+') : '-'}
                                        {' '}v:{String(item.variant_id || '-')}
                                        {' '}u:{String(item.unit_id || '-')}
                                      </>;
                                    })()}
                                  </div>
                                </td>

                                {/* Prix unitaire / Prix d'achat selon le type */}
<td className="px-1 py-2 w-[90px]">
  <input
    type="text"
    inputMode="decimal"
    pattern="[0-9]*[.,]?[0-9]*"
    name={values.type === 'Commande' ? `items.${index}.prix_achat` : `items.${index}.prix_unitaire`}
    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
    disabled={isQtyOnlyEdit || (values.type === 'Charge' && !!values.items[index]?.product_id)}
    value={values.type === 'Charge' && values.items[index]?.product_id
      ? String(resolveItemCostContext(values.items[index], products as any[], snapshotProducts as any[]).cout_revient || 0)
      : (unitPriceRaw[index] ?? '')}
    onChange={(e) => {
      if (isQtyOnlyEdit) return;
      const raw = e.target.value;
      if (!isDecimalLike(raw)) return;
      setUnitPriceRaw((prev) => ({ ...prev, [index]: raw }));

      const unit = parseFloat(normalizeDecimal(raw)) || 0;
      // Sync Formik immédiatement pour que handleSubmit ait la bonne valeur
      if (values.type === 'Commande') {
        setFieldValue(`items.${index}.prix_achat`, unit);
      } else {
        setFieldValue(`items.${index}.prix_unitaire`, unit);
      }
      const q =
        parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
      setFieldValue(`items.${index}.total`, q * unit);
    }}
    onBlur={async () => {
      if (isQtyOnlyEdit) return;

      // If blur happened because user clicked variant/unit/product selector, don't commit
      const sup = suppressPriceBlurRef.current;
      if (sup && sup.row === index && Date.now() - sup.ts < 600) {
        suppressPriceBlurRef.current = null;
        return;
      }
      const val = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      
      // Créer une version temporaire des valeurs avec le nouveau prix
      const tempValues = {
        ...values,
        items: values.items.map((item: any, idx: number) => 
          idx === index ? {
            ...item,
            [values.type === 'Commande' ? 'prix_achat' : 'prix_unitaire']: val
          } : item
        )
      };
      
      // Vérifier le plafond avant d'appliquer les changements
      const canProceed = await checkClientCreditLimitRealTime(tempValues);
      if (!canProceed) {
        // Remettre l'ancienne valeur
        const oldVal = values.type === 'Commande' ? values.items[index].prix_achat : values.items[index].prix_unitaire;
        setUnitPriceRaw((prev) => ({ ...prev, [index]: String(oldVal || 0) }));
        return;
      }
      
      if (values.type === 'Commande') {
        setFieldValue(`items.${index}.prix_achat`, val);
      } else {
        setFieldValue(`items.${index}.prix_unitaire`, val);
      }
      // Conserver la saisie brute (normalisée . pour décimale) sans arrondi
      setUnitPriceRaw((prev) => ({ ...prev, [index]: (unitPriceRaw[index] ?? '').replace(',', '.') }));

      const q =
        parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
      setFieldValue(`items.${index}.total`, q * val);
    }}
  data-row={index}
  data-col="unit"
  onKeyDown={onCellKeyDown(index, 'unit')}
  />
  {values.client_id && values.items[index].product_id && (() => {
    const last = values.type === 'Avoir' && !values.vendre_au_fournisseur
      ? getLastSortieUnitPriceForClientProduct(
          values.client_id,
          values.items[index].product_id,
          values.items[index].variant_id,
          values.items[index].unit_id
        )
      : getLastUnitPriceForClientProduct(
          values.client_id,
          values.items[index].product_id,
          values.items[index].variant_id,
          values.items[index].unit_id
        );
    return last && Number.isFinite(last) ? (
      <div className="text-xs text-blue-600 font-medium mt-1">
        {values.type === 'Avoir' && !values.vendre_au_fournisseur ? 'Dernier prix Bon Sortie' : 'Dernier prix client'}: {formatFull(Number(last))} DH
      </div>
    ) : null;
  })()}
  {values.client_id && values.items[index].product_id && (() => {
    const lastQty = getLastQuantityForClientProduct(
      values.client_id,
      values.items[index].product_id
    );
    return lastQty && Number.isFinite(lastQty) ? (
      <div className="text-xs text-gray-500">Dernier stock acheté (Validé): {formatFull(Number(lastQty))}</div>
    ) : null;
  })()}
  {/* Dernier prix pour Comptant/AvoirComptant (ignore le client, accepte Validé/En attente) */}
  {(values.items[index].product_id && (values.type === 'Comptant' || values.type === 'AvoirComptant')) && (() => {
    const lastPrices = getLastUnitPricesForComptantProduct(
      values.items[index].product_id,
      values.items[index].variant_id,
      values.items[index].unit_id,
      4
    );
    return lastPrices.length > 0 ? (
      <div className="text-xs text-gray-500 mt-1">
        4 derniers prix (Comptant): {lastPrices.map((price) => `${formatFull(Number(price))} DH`).join(' / ')}
      </div>
    ) : null;
  })()}
  {(values.fournisseur_id && values.items[index].product_id && (values.type === 'Commande' || values.type === 'AvoirFournisseur')) && (() => {
    const lastPurchase = getLastPurchasePriceForSupplierProduct(
      values.type,
      values.fournisseur_id,
      values.items[index].product_id,
      values.items[index].variant_id,
      values.items[index].unit_id
    );
    return lastPurchase && Number.isFinite(lastPurchase) ? (
      <div className="text-xs text-amber-700 font-medium mt-1">Dernier prix: {formatFull(Number(lastPurchase))} DH</div>
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
                                      disabled={isQtyOnlyEdit}
                                      value={remiseRaw[index] ?? ''}
                                      onChange={(e) => {
                                        if (isQtyOnlyEdit) return;
                                        const raw = e.target.value;
                                        if (!isDecimalLike(raw)) return;
                                        setRemiseRaw((prev) => ({ ...prev, [index]: raw }));
                                      }}
                                      onBlur={() => {
                                        if (isQtyOnlyEdit) return;
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
      const u = values.type === 'Charge' && values.items[index]?.product_id
        ? resolveItemCostContext(values.items[index], products as any[], snapshotProducts as any[]).cout_revient
        : (parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0);
  return formatFull(q * u);
    })()}{' '}
    DH
  </div>
</td>

                                {/* Profit par ligne */}
                                {showProfitColumn && (
<td className="px-1 py-2 w-[80px]">
  {(() => {
    const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
    const enteredPrice = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
    const remise = Number(values.items[index].remise_montant || 0);

    // Compute CR with unit conversion factor applied (safety net for edit mode initial load)
    const itemRow = values.items[index];
    const profitProduct = (products as any[]).find((p: any) => String(p.id) === String(itemRow.product_id));
    let profitSnap: any = null;
    if (itemRow.product_snapshot_id && (snapshotProducts as any[])?.length) {
      profitSnap = (snapshotProducts as any[]).find((s: any) => String(s.snapshot_id) === String(itemRow.product_snapshot_id));
    }
    let profitVariant: any = null;
    if (itemRow.variant_id && profitProduct?.variants?.length) {
      profitVariant = (profitProduct.variants as any[]).find((v: any) => String(v.id) === String(itemRow.variant_id));
    }
    const baseCR = Number(profitSnap?.cout_revient) || Number(profitVariant?.cout_revient) || Number(profitProduct?.cout_revient) || Number(profitProduct?.prix_achat) || 0;
    let profitConvFactor = 1;
    if (itemRow.unit_id && profitProduct?.units?.length) {
      const profitUnit = (profitProduct.units as any[]).find((u: any) => String(u.id) === String(itemRow.unit_id));
      if (profitUnit && !profitUnit.is_default && !profitUnit.facteur_isNormal) {
        const f = Number(profitUnit.conversion_factor) || 1;
        if (f > 0) profitConvFactor = f;
      }
    }
    const cr = baseCR > 0 ? scaleDecimal(baseCR, profitConvFactor) : (Number(itemRow.cout_revient) || Number(itemRow.prix_achat) || 0);

    const pv = values.type === 'Charge' && itemRow?.product_id ? cr : enteredPrice;
    const profit = (pv - cr) * q - remise * q;
    const cls = profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-400';
    return (
      <div className={`text-sm font-semibold ${cls}`} title={`PV=${pv} CR=${cr} Q=${q} R=${remise}`}>
        {profit.toFixed(2)}
      </div>
    );
  })()}
</td>
                                )}


                                {/* Actions */}
<td className="px-1 py-2 w-[50px]">
  <button
    type="button"
    disabled={isQtyOnlyEdit}
    onClick={() => {
      if (isQtyOnlyEdit) return;
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
    className="text-red-600 hover:text-red-800 disabled:opacity-60"
  data-row={index}
  data-col="delete"
  >
    <Trash2 size={16} />
  </button>
</td>

                              </tr>
                              );
                            })
                          )}
                              </tbody>
                            </table>
                          )}
                        </FieldArray>
                      </div>

                      {(values.type === 'Charge' || values.type === 'AvoirCharge') && (
                        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-amber-900">Lignes détaillées</h4>
                            <span className="text-xs text-amber-700">
                              {detailedChargeEntries.length === 0
                                ? 'Aucune ligne détaillée'
                                : `${detailedChargeEntries.length} ligne(s) détaillée(s)`}
                            </span>
                          </div>

                          {detailedChargeEntries.length === 0 ? (
                            <div className="text-sm text-amber-800">
                              Utilisez le bouton `Ajouter ligne détaillée` pour saisir un produit manuel.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {detailedChargeEntries.map(({ row, index }: any) => {
                                const chargeTotal = (Number(values.items[index]?.prix_unitaire) || 0) * (parseFloat(normalizeDecimal(qtyRaw[index] ?? String(row.quantite ?? ''))) || 0);
                                return (
                                  <div key={row._rowId || `charge-detail-${index}`} className="grid grid-cols-1 gap-3 rounded border border-amber-200 bg-white p-3">
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-gray-700">Désignation</label>
                                      <textarea
                                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                        value={row.designation_custom ?? row.designation ?? ''}
                                        onChange={(e) => {
                                          setFieldValue(`items.${index}.designation_custom`, e.target.value);
                                          setFieldValue(`items.${index}.designation`, e.target.value);
                                        }}
                                        placeholder="Ex: Charge 1 mazot"
                                        disabled={isQtyOnlyEdit}
                                        rows={3}
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-gray-700">Qté</label>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                        value={qtyRaw[index] ?? String(row.quantite ?? '')}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          if (!isDecimalLike(raw)) return;
                                          setQtyRaw((prev) => ({ ...prev, [index]: raw }));
                                          const q = parseFloat(normalizeDecimal(raw)) || 0;
                                          setFieldValue(`items.${index}.quantite`, q);
                                          setFieldValue(`items.${index}.total`, q * (Number(values.items[index].prix_unitaire) || 0));
                                        }}
                                        disabled={isQtyOnlyEdit}
                                      />
                                    </div>
                                    {(['prix_achat', 'cout_revient', 'prix_gros', 'prix_unitaire'] as const).map((field) => (
                                      <div key={field} className={field === 'prix_unitaire' ? '' : 'hidden'}>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">
                                          {field === 'prix_achat' ? 'Prix achat' : field === 'cout_revient' ? 'Cout revient' : field === 'prix_gros' ? 'Prix gros' : 'Prix vente'}
                                        </label>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                          value={String(values.items[index]?.[field] ?? '')}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            if (!isDecimalLike(raw)) return;
                                            const nextValue = parseFloat(normalizeDecimal(raw)) || 0;
                                            setFieldValue(`items.${index}.${field}`, nextValue);
                                            if (field === 'prix_unitaire') {
                                              const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                              setFieldValue(`items.${index}.total`, q * nextValue);
                                            }
                                          }}
                                          disabled={isQtyOnlyEdit}
                                        />
                                      </div>
                                    ))}
                                    <div className="flex items-end justify-end gap-3 md:col-span-8">
                                      <div className="hidden text-sm font-semibold text-gray-800">Total: {formatFull(chargeTotal)} DH</div>
                                      <button
                                        type="button"
                                        disabled={isQtyOnlyEdit}
                                        onClick={() => {
                                          const nextItems = [...(values.items || [])];
                                          nextItems.splice(index, 1);
                                          setFieldValue('items', nextItems);

                                          setUnitPriceRaw((prev) => {
                                            const copy = { ...prev };
                                            delete copy[index];
                                            const compacted: Record<number, string> = {};
                                            let j = 0;
                                            for (let i = 0; i < values.items.length; i += 1) {
                                              if (i === index) continue;
                                              compacted[j] = copy[i] ?? '';
                                              j += 1;
                                            }
                                            return compacted;
                                          });

                                          setQtyRaw((prev) => {
                                            const copy = { ...prev };
                                            delete copy[index];
                                            const compacted: Record<number, string> = {};
                                            let j = 0;
                                            for (let i = 0; i < values.items.length; i += 1) {
                                              if (i === index) continue;
                                              compacted[j] = copy[i] ?? '';
                                              j += 1;
                                            }
                                            return compacted;
                                          });
                                        }}
                                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                    </>
                  );
                })()}

                <div className="hidden mt-4 bg-amber-50 border border-amber-300 rounded-md p-3 text-xs overflow-x-auto">
                  <div className="font-semibold text-amber-900 mb-2">Debug PA / CR</div>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-amber-100 text-left">
                        <th className="border px-2 py-1">Ligne</th>
                        <th className="border px-2 py-1">Produit</th>
                        <th className="border px-2 py-1">IDs sélectionnés</th>
                        <th className="border px-2 py-1">Snapshot trouvé</th>
                        <th className="border px-2 py-1">Valeurs item</th>
                        <th className="border px-2 py-1">Valeurs snapshot</th>
                        <th className="border px-2 py-1">Valeurs variant</th>
                        <th className="border px-2 py-1">Valeurs product</th>
                        <th className="border px-2 py-1">Résolution finale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(values.items || []).map((item: any, idx: number) => {
                        const debug = resolveItemCostContext(item, products as any[], snapshotProducts as any[]);
                        const sourceClass =
                          debug.source === 'snapshot'
                            ? 'text-green-700'
                            : debug.source === 'variant'
                              ? 'text-purple-700'
                              : debug.source === 'product'
                                ? 'text-orange-700'
                                : 'text-red-700';
                        return (
                          <tr key={`debug-${idx}`} className="align-top">
                            <td className="border px-2 py-1">{idx + 1}</td>
                            <td className="border px-2 py-1">
                              <div>{item.designation || item.product_id || '-'}</div>
                              <div className="text-gray-500">id:{String(item.product_id || '-')}</div>
                            </td>
                            <td className="border px-2 py-1">
                              <div>snap demandé: {String(debug.requestedSnapshotId || '-')}</div>
                              <div>variant demandé: {String(debug.requestedVariantId || '-')}</div>
                              <div>unit demandé: {String(debug.requestedUnitId || '-')}</div>
                            </td>
                            <td className="border px-2 py-1">
                              <div>
                                snapshot trouvé: {debug.isMergedSnapshotSelection
                                  ? `lots FIFO: ${(debug.mergedSnapshots || []).map((s: any) => s.snapshot_id).join(',')}`
                                  : String(debug.snapshot?.snapshot_id ?? debug.snapshot?.id ?? '-')}
                              </div>
                              <div>qty snapshot: {String(debug.snapshot?.snapshot_quantite ?? debug.snapshot?.quantite ?? '-')}</div>
                              <div>factor unité: {debug.convFactor}</div>
                            </td>
                            <td className="border px-2 py-1">
                              <div>PA: {Number(debug.itemPA || 0)}</div>
                              <div>CR: {Number(debug.itemCR || 0)}</div>
                            </td>
                            <td className="border px-2 py-1 text-blue-700">
                              <div>PA: {Number(debug.snapshotPA || 0)}</div>
                              <div>CR: {Number(debug.snapshotCR || 0)}</div>
                            </td>
                            <td className="border px-2 py-1 text-purple-700">
                              <div>PA: {Number(debug.variantPA || 0)}</div>
                              <div>CR: {Number(debug.variantCR || 0)}</div>
                            </td>
                            <td className="border px-2 py-1 text-gray-700">
                              <div>PA: {Number(debug.productPA || 0)}</div>
                              <div>CR: {Number(debug.productCR || 0)}</div>
                            </td>
                            <td className="border px-2 py-1">
                              <div className={`font-semibold uppercase ${sourceClass}`}>source: {debug.source}</div>
                              <div>PA final: {Number(debug.prix_achat || 0)}</div>
                              <div>CR final: {Number(debug.cout_revient || 0)}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Récapitulatif */}
                <div className="mt-4 bg-gray-50 p-4 rounded-md">
                 {/* Total poids (kg) */}
<div className="flex justify-between items-center mt-2">
  <span className="text-md font-semibold">Total poids (kg):</span>
  <span className="text-md font-semibold text-gray-700">
    {formatFull(values.items.reduce((sum: number, item: any, idx: number) => {
      const itemKg = Number(item.kg ?? item.product?.kg ?? 0) || 0;
      const raw = qtyRaw[idx];
      const q = raw !== undefined && raw !== '' ? (parseFloat(normalizeDecimal(raw)) || 0) : (Number(item.quantite ?? item.qty ?? 0) || 0);
      return sum + itemKg * q;
    }, 0))} kg
  </span>
</div>
                  {/* Total DH */}
<div className="flex justify-between items-center border-t pt-2">
  <span className="text-md font-semibold">Total:</span>
  <span className="text-md font-semibold">
    {formatFull(
          values.items
        .reduce((sum: number, item: any, idx: number) => {
          const q =
            parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
          const u =
            (values.type === 'Charge' || values.type === 'AvoirCharge')
              ? (typeof item.prix_unitaire === 'string'
                ? parseFloat(String(item.prix_unitaire).replace(',', '.')) || 0
                : Number(item.prix_unitaire) || 0)
              : (parseFloat(normalizeDecimal(unitPriceRaw[idx] ?? String(item.prix_unitaire ?? ''))) || 0);
          return sum + q * u;
        }, 0)
    )}{' '}
    DH
  </span>
</div>

{/* Total Remises (DH) */}
{showRemisePanel && (values.type === 'Sortie' || values.type === 'Comptant') && (
  <div className="flex justify-between items-center mt-2">
    <span className="text-md font-semibold text-purple-700">Total Remises:</span>
    <span className="text-md font-semibold text-purple-700">
      {formatFull(
        values.items
          .reduce((sum: number, item: any, idx: number) => {
            const q = parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
            const rRaw = item.remise_montant ?? 0;
            const r = typeof rRaw === 'string' ? parseFloat(String(rRaw).replace(',', '.')) || 0 : Number(rRaw) || 0;
            return sum + r * q;
          }, 0)
      )}{' '}
      DH
    </span>
  </div>
)}

{/* Mouvement */}
<div className="flex justify-between items-center mt-2">
  <span className="text-md font-semibold text-green-700">Mouvement:</span>
  <span className="text-md font-semibold text-green-700">
    {(() => {
      const backend = (mouvementPreviewResp as any)?.mouvement_calc;
      if (backend && typeof backend.profit === 'number') {
        return formatFull(Number(backend.profit || 0));
      }
      if (mouvementPreviewLoading) {
        return '...';
      }
      // Fallback local calc if preview not available (with unit conversion)
      const local = (values.items || []).reduce((sum: number, item: any, idx: number) => {
        const q = parseFloat(normalizeDecimal(qtyRaw[idx] ?? String(item.quantite ?? ''))) || 0;
        const enteredPrice = parseFloat(normalizeDecimal(unitPriceRaw[idx] ?? String(item.prix_unitaire ?? ''))) || 0;
        const itemCR =
          parseFloat(normalizeDecimal(String(item.cout_revient ?? item.cout_rev ?? item.cout ?? ''))) || 0;
        const itemPA =
          parseFloat(normalizeDecimal(String(item.prix_achat ?? item.pa ?? item.prixA ?? ''))) || 0;
        const prixVente = values.type === 'Charge' && item?.product_id
          ? (itemCR || itemPA)
          : enteredPrice;
        const remise =
          parseFloat(normalizeDecimal(remiseRaw[idx] ?? String(item.remise_montant ?? item.remise_valeur ?? ''))) || 0;

        if (item?.line_mode === 'detail') {
          const coutRevientDetail = itemCR || itemPA;
          return sum + (prixVente - coutRevientDetail) * q - remise * q;
        }

        // Compute CR with unit conversion factor
        const mvProd = (products as any[]).find((p: any) => String(p.id) === String(item.product_id));
        let mvSnap: any = null;
        if (item.product_snapshot_id && (snapshotProducts as any[])?.length) {
          mvSnap = (snapshotProducts as any[]).find((s: any) => String(s.snapshot_id) === String(item.product_snapshot_id));
        }
        let mvVar: any = null;
        if (item.variant_id && mvProd?.variants?.length) {
          mvVar = (mvProd.variants as any[]).find((v: any) => String(v.id) === String(item.variant_id));
        }
        const mvBaseCR = Number(mvSnap?.cout_revient) || Number(mvVar?.cout_revient) || Number(mvProd?.cout_revient) || Number(mvProd?.prix_achat) || 0;
        let mvFactor = 1;
        if (item.unit_id && mvProd?.units?.length) {
          const mvUnit = (mvProd.units as any[]).find((u: any) => String(u.id) === String(item.unit_id));
          if (mvUnit && !mvUnit.is_default && !mvUnit.facteur_isNormal) {
            const f = Number(mvUnit.conversion_factor) || 1;
            if (f > 0) mvFactor = f;
          }
        }
        const coutRevient = mvBaseCR > 0 ? scaleDecimal(mvBaseCR, mvFactor) : (itemCR || itemPA);
        return sum + (prixVente - coutRevient) * q - remise * q;
      }, 0);
      return formatFull(local);
    })()}
    DH
  </span>
</div>
                </div>
              </div>

              {/* Footer actions - Position normale en bas du contenu */}
              <div className="border-t bg-gray-50 px-4 sm:px-6 py-4 mt-6 flex flex-wrap gap-3 justify-between items-center">
                <div className="flex gap-2 flex-wrap">
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
                    hidden
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
                          isNotCalculated: true,
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
                    disabled={isSavingBon || isSubmitting || (isChefChauffeur && !isEditMode)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {(() => {
                      if (isSavingBon || isSubmitting) return isEditMode ? 'Mise à jour...' : 'Validation...';
                      if (isEditMode) return 'Mettre à jour';
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
          const inject = (rowIndex: number) => {
            void applyProductToRow(rowIndex, newProduct);
            setTargetRowIndex(null);
          };

          const rowIndex = targetRowIndex;
          if (rowIndex === null || rowIndex === undefined || !values.items?.[rowIndex]) {
            const newIndex = values.items?.length ?? 0;
            formikRef.current.setFieldValue('items', [...(values.items ?? []), createEmptyItem()]);
            setUnitPriceRaw((prev) => ({ ...prev, [newIndex]: '0' }));
            setQtyRaw((prev) => ({ ...prev, [newIndex]: '0' }));
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
        defaultIsCharge={isContactModalOpen === 'Client' && ['Charge', 'AvoirCharge'].includes(String(currentTab || (initialValues as any)?.type || ''))}
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
          client={allClients.find((c: Contact) => c.id.toString() === initialValues.client_id?.toString())}
          fournisseur={fournisseurs.find((f: Contact) => f.id.toString() === initialValues.fournisseur_id?.toString())}
        />
      )}
    </div>
  );
};

export default BonFormModal;
