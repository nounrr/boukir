import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { useGetProductsQuery } from '../store/api/productsApi';
import { useDispatch } from 'react-redux';
import { api } from '../store/api/apiSlice';
import { useGetSortiesQuery } from '../store/api/sortiesApi';
import { useGetComptantQuery } from '../store/api/comptantApi';
import { useGetClientsQuery, useGetFournisseursQuery, useCreateContactMutation } from '../store/api/contactsApi';
// Removed unused: useGetPaymentsQuery, useGetBonsByTypeQuery
import { useCreateBonMutation, useUpdateBonMutation } from '../store/api/bonsApi';
import { useGetClientRemisesQuery, useGetRemiseItemsQuery, useCreateRemiseItemMutation, useCreateClientRemiseMutation } from '../store/api/remisesApi';
import { useAuth } from '../hooks/redux';
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
                      title={option.disabled ? "Client non sélectionnable - Plafond dépassé" : option.label}
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
  client_id: Yup.number().when('type', ([type], schema) => {
    if (type === 'Sortie' || type === 'Avoir') return schema.required('Client requis');
    // Pour Devis : client_id OU client_nom requis (pas les deux obligatoires)
    if (type === 'Devis') return schema.nullable();
    return schema.nullable();
  }),
  // Pour Comptant et Devis, on peut saisir un nom libre
  client_nom: Yup.string().when(['type', 'client_id'], ([type, client_id], schema) => {
    if (type === 'Comptant' || type === 'AvoirComptant') return schema.trim();
    if (type === 'Devis' && !client_id) return schema.trim().required('Veuillez sélectionner un client ou entrer un nom');
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

  useEffect(() => {
    if (!isOpen) return;
    if (values?.isNotCalculated) return;

    let contactName = '';
    if (values?.client_id) {
      const c = (clients || []).find((x: any) => String(x?.id) === String(values.client_id));
      contactName = String(c?.nom_complet || c?.nom || c?.name || '');
    }
    if (!contactName) {
      contactName = String(values?.client_nom || '');
    }

    if (isKhezinAwatifName(contactName)) {
      setFieldValue('isNotCalculated', true, false);
    }
  }, [isOpen, clients, values?.client_id, values?.client_nom, values?.isNotCalculated, setFieldValue]);

  return null;
};

/* --------------------------------- Composant -------------------------------- */
interface BonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirComptant' | 'AvoirFournisseur' | 'Devis' | 'Vehicule';
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
  const { user, token } = useAuth();
  const dispatch = useDispatch();
  const formikRef = useRef<FormikProps<any>>(null);
  // Container ref to detect when Enter is pressed within the products area
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  
  // État pour mémoriser si le PDG a accepté un client déjà au-dessus du plafond
  const [pdgApprovedOverLimit, setPdgApprovedOverLimit] = useState<{ clientId: string; timestamp: number } | null>(null);
  
  // Remises UI state
  const [showRemisePanel, setShowRemisePanel] = useState(false); // panel application des remises (affiche colonnes)
  const [showAddRemiseClient, setShowAddRemiseClient] = useState(false); // formulaire inline ajout client remise
  const [newRemiseClient, setNewRemiseClient] = useState({ nom: '', phone: '', cin: '' });
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
  const { data: employeesAll = [] } = useGetEmployeesQueryServer();
  const chauffeurs = useMemo(() => (employeesAll || []).filter((e: any) => e.role === 'Chauffeur'), [employeesAll]);
  const { data: products = [] } = useGetProductsQuery();
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const { data: sortiesHistory = [] } = useGetSortiesQuery(undefined);
  const { data: comptantHistory = [] } = useGetComptantQuery(undefined);
  // For cumulative balances
  // Removed unused aggregated queries to reduce unnecessary re-renders / warnings
  // const { data: commandesAll = [] } = useGetBonsByTypeQuery('Commande');
  // const { data: avoirsClientAll = [] } = useGetBonsByTypeQuery('Avoir');
  // const { data: avoirsFournisseurAll = [] } = useGetBonsByTypeQuery('AvoirFournisseur');
  // const { data: payments = [] } = useGetPaymentsQuery();

  // Mutations
  const [createBon] = useCreateBonMutation();
  const [updateBonMutation] = useUpdateBonMutation();
  // Removed unused hook to avoid TS noUnusedLocals error
  const [createRemiseItem] = useCreateRemiseItemMutation();
  const [createClientRemise] = useCreateClientRemiseMutation();
  const [createContact] = useCreateContactMutation();
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isSendingWhatsAppPdf, setIsSendingWhatsAppPdf] = useState(false);
  const apiBaseUrl = (import.meta as any)?.env?.VITE_API_BASE_URL || '';
  const productMap = useMemo(() => {
    const map = new Map<string, any>();
    (products || []).forEach((prod: any) => {
      if (prod?.id != null) {
        map.set(String(prod.id), prod);
      }
    });
    return map;
  }, [products]);

  const sanitizeFileSegment = (value: string | number | null | undefined, fallback = 'bon') => {
    if (value == null) return fallback;
    const cleaned = String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return cleaned || fallback;
  };

  const resolveBonContacts = (bonType: string, formValues: any) => {
    let clientContact: any;
    let fournisseurContact: any;

    if (['Sortie', 'Comptant', 'Avoir', 'AvoirComptant', 'Devis'].includes(bonType)) {
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
          email: formValues.client_email || '',
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
// 🆕 Saisie brute par ligne pour "quantite"
const [qtyRaw, setQtyRaw] = useState<Record<number, string>>({});
  /* ----------------------- Initialisation des valeurs ----------------------- */
  const getInitialValues = () => {
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

      const normalizedItems = (rawItems || []).map((it: any) => {
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

  const kg = Number(it.kg ?? it.kg_value ?? it.product_kg ?? it.product?.kg ?? it.produit?.kg ?? 0) || 0;

        if (productFound) {
          try {
            // Pour Commande en édition : si pas de prix_achat mais prix_unitaire (stocké) existe, l'utiliser.
            if ((!prix_achat || prix_achat === 0) && initialValues?.type === 'Commande' && prix_unitaire > 0) {
              prix_achat = prix_unitaire;
            } else if (!prix_achat || prix_achat === 0) {
              // Sinon fallback sur le prix_achat du produit.
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

        // Preserve variant/unit selection in edit mode
        const variant_id = toIdString(it.variant_id ?? it.variantId ?? it.variant?.id);
        const unit_id = toIdString(it.unit_id ?? it.unitId ?? it.unit?.id);

        return {
          _rowId: it._rowId || makeRowId(), // id stable
          ...it,
          product_id: it.product_id ?? it.produit_id ?? it.productId ?? it.product?.id ?? it.produit?.id,
          variant_id,
          unit_id,
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
        livraisons: Array.isArray((initialValues as any)?.livraisons)
          ? (initialValues as any).livraisons.map((l: any) => ({ vehicule_id: String(l.vehicule_id || ''), user_id: l.user_id ? String(l.user_id) : '' }))
          : [],
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
  phone: initialValues.phone || '',
        isNotCalculated: initialValues.isNotCalculated || false,
        statut: initialValues.statut || 'En attente',
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
      adresse_livraison: '',
      montant_ht: 0,
      montant_total: 0,
      isNotCalculated: false,
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
  try {
    // Suppression du blocage lié au stock: permettre la soumission même si la quantité dépasse le stock
    
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

  const cleanBonData = {
  date_creation: formatDateInputToMySQL(values.date_bon) || new Date().toISOString().slice(0,19).replace('T',' '), // assure string
      vehicule_id: vehiculeId,
      lieu_chargement: values.lieu_charge || '',
  adresse_livraison: values.adresse_livraison || '',
  phone: values.phone || null,
      isNotCalculated: values.isNotCalculated ? true : null,
      statut: values.statut || 'Brouillon',
  client_id: (requestType === 'Comptant' || requestType === 'AvoirComptant') ? undefined : (values.client_id ? parseInt(values.client_id) : undefined),
  client_nom: (requestType === 'Comptant' || requestType === 'AvoirComptant' || requestType === 'Devis') ? (values.client_nom || null) : undefined,
      fournisseur_id: values.fournisseur_id ? parseInt(values.fournisseur_id) : undefined,
      montant_total: montantTotal,
      created_by: user?.id || 1,
      // N'envoyer livraisons que si au moins un véhicule est défini
      livraisons: livraisonsClean.length ? livraisonsClean : undefined,
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
        // Pour les commandes, on ne souhaite PAS enregistrer un prix de vente ici.
        // On utilise la valeur de prix_achat comme prix_unitaire envoyé au backend
        // (la table conserve uniquement la colonne prix_unitaire pour Commande items).
        const prixUnitairePourDB = values.type === 'Commande' ? pa : pu;
        return {
          product_id: parseInt(item.product_id),
          variant_id: item.variant_id ? parseInt(item.variant_id) : null,
          unit_id: item.unit_id ? parseInt(item.unit_id) : null,
          quantite: q,
          prix_achat: pa,
          prix_unitaire: prixUnitairePourDB,
          remise_pourcentage: rp,
          remise_montant: rm,
          // Pour bon Commande, utiliser prix_achat pour le total; pour autres types, prix_unitaire
          total: q * (values.type === 'Commande' ? pa : pu),
        };
      }),
    };

    if (initialValues) {
      const updated = await updateBonMutation({ id: initialValues.id, type: requestType, ...cleanBonData }).unwrap();
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
                const numero = updated?.numero || initialValues?.numero || '';
                try {
                  await sendBonViaWhatsAppWithPdf({
                    bonType: requestType,
                    numero,
                    bonRecord: updated,
                    formValues: values,
                    phone: String(clientPhone),
                    bonId: updated?.id || initialValues?.id,
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
      // Vérification du plafond pour les bons clients (Sortie, Comptant, Avoir)
      if (['Sortie', 'Comptant', 'Avoir', 'AvoirComptant'].includes(requestType) && cleanBonData.client_id) {
        const client = clients.find((c: any) => Number(c.id) === cleanBonData.client_id);
        if (client && client.plafond && Number(client.plafond) > 0) {
          // Utiliser le solde cumulé fourni par le backend (fallback sur solde initial)
          const backendClientSolde = clients.find((c: any) => Number(c.id) === cleanBonData.client_id);
          const soldeCumule = Number(backendClientSolde?.solde_cumule ?? backendClientSolde?.solde ?? 0) || 0;
          const plafond = Number(client.plafond);
          const nouveauSolde = soldeCumule + montantTotal;
          
          // Cas 1: Client déjà au-dessus du plafond AVANT ce bon
          if (soldeCumule > plafond) {
            const depassementActuel = soldeCumule - plafond;
            
            if (user?.role === 'PDG') {
              // Vérifier si le PDG a déjà approuvé ce client récemment (dans les 30 dernières minutes)
              const hasRecentApproval = pdgApprovedOverLimit && 
                                       pdgApprovedOverLimit.clientId === cleanBonData.client_id.toString() &&
                                       (Date.now() - pdgApprovedOverLimit.timestamp) < 30 * 60 * 1000; // 30 min

              if (!hasRecentApproval) {
                // PDG : Alerte informative mais peut continuer
                const result = await showConfirmation(
                  `⚠️ ATTENTION - CLIENT DÉJÀ AU-DESSUS DU PLAFOND ⚠️\n\n` +
                  `Client: ${client.nom_complet}\n` +
                  `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                  `Plafond autorisé: ${plafond.toFixed(2)} DH\n` +
                  `Dépassement actuel: ${depassementActuel.toFixed(2)} DH\n\n` +
                  `Montant du nouveau bon: ${montantTotal.toFixed(2)} DH\n` +
                  `Solde après ce bon: ${nouveauSolde.toFixed(2)} DH\n\n` +
                  `Ce client a déjà dépassé son plafond de crédit.\n` +
                  `Voulez-vous tout de même créer ce bon ?`,
                  'Client au-dessus du plafond',
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
                `🚫 CRÉATION INTERDITE - CLIENT AU-DESSUS DU PLAFOND 🚫\n\n` +
                `Client: ${client.nom_complet}\n` +
                `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                `Plafond autorisé: ${plafond.toFixed(2)} DH\n` +
                `Dépassement actuel: ${depassementActuel.toFixed(2)} DH\n\n` +
                `❌ Ce client a déjà dépassé son plafond de crédit.\n` +
                `Vous n'êtes pas autorisé à créer de nouveaux bons pour ce client.\n` +
                `Contactez votre responsable.`
              );
              setSubmitting(false);
              return;
            }
          }
          // Cas 2: Client dans les limites mais ce bon le ferait dépasser
          else if (nouveauSolde > plafond) {
            const depassement = nouveauSolde - plafond;
            
            if (user?.role === 'PDG') {
              // PDG : Popup personnalisé avec boutons Continuer/Annuler
              const result = await showConfirmation(
                `⚠️ ATTENTION - CE BON DÉPASSERA LE PLAFOND ⚠️\n\n` +
                `Client: ${client.nom_complet}\n` +
                `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                `Montant du bon: ${montantTotal.toFixed(2)} DH\n` +
                `Nouveau solde: ${nouveauSolde.toFixed(2)} DH\n` +
                `Plafond autorisé: ${plafond.toFixed(2)} DH\n\n` +
                `Ce bon ferait dépasser le plafond de ${depassement.toFixed(2)} DH.\n\n` +
                `Voulez-vous autoriser la création malgré le dépassement ?`,
                'Dépassement de plafond détecté',
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
                `🚫 CRÉATION INTERDITE - DÉPASSEMENT DE PLAFOND 🚫\n\n` +
                `Client: ${client.nom_complet}\n` +
                `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                `Montant du bon: ${montantTotal.toFixed(2)} DH\n` +
                `Nouveau solde: ${nouveauSolde.toFixed(2)} DH\n` +
                `Plafond autorisé: ${plafond.toFixed(2)} DH\n\n` +
                `Ce bon dépasserait le plafond de ${depassement.toFixed(2)} DH.\n\n` +
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

      // Enregistrer les remises appliquées dans item_remises si un client remise est sélectionné
      if ((values.type === 'Sortie' || values.type === 'Comptant') && typeof selectedRemiseId === 'number') {
        const bonId = Number(created?.id || 0);
        if (bonId) {
          const promises = cleanBonData.items
            // Filtrer uniquement les remises positives (> 0)
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
  const getLastUnitPriceForComptantProduct = (
    productId: string | number | undefined
  ): number | null => {
    if (!productId) return null;
    const pid = String(productId);

    type HistItem = { prix_unitaire?: number; total?: number; quantite?: number };
    let bestPrice: number | null = null;
    let bestTime = -1;

    const accepted = new Set(['validé', 'valide', 'validée', 'en attente']);

    const scan = (bon: any) => {
      const statut = String(bon.statut || '').toLowerCase();
      if (!accepted.has(statut)) return; // n'inclut que Validé ou En attente
      const items = parseItems(bon.items);
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

    for (const b of comptantHistory as any[]) scan(b);
    return bestPrice;
  };

  // Prix fréquemment utilisé pour ce produit (global), sélectionne le dernier prix
  // qui a été répété au moins minCount fois (statut Validé uniquement).
  const getFrequentUnitPriceForProduct = (
    productId: string | number | undefined,
    minCount: number = 5
  ): { price: number; count: number } | null => {
    if (!productId) return null;
    const pid = String(productId);

    const normalizeMoneyKey = (value: any): number | null => {
      if (value == null) return null;
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.round(n * 100); // cents key
    };

    type Stat = { count: number; lastTime: number; price: number };
    const map = new Map<number, Stat>();

    const accepted = new Set(['validé', 'valide', 'validée', 'en attente']);
    const scan = (bon: any) => {
      const statut = String(bon.statut || '').toLowerCase();
      if (!accepted.has(statut)) return;
      const items = parseItems(bon.items);
      const bonTime = toTime(bon.date_creation || bon.date);
      for (const it of items as any[]) {
        const itPid = String((it as any).product_id ?? (it as any).id ?? '');
        if (itPid !== pid) continue;
        const priceRaw = (it as any).prix_unitaire ?? (it as any).prix ?? (it as any).price ?? 0;
        const key = normalizeMoneyKey(priceRaw);
        if (key == null) continue;
        const price = Number(typeof priceRaw === 'number' ? priceRaw : String(priceRaw).replace(',', '.')) || 0;
        const prev = map.get(key);
        if (prev) {
          const newCount = prev.count + 1;
          const newLast = Math.max(prev.lastTime, bonTime);
          map.set(key, { count: newCount, lastTime: newLast, price });
        } else {
          map.set(key, { count: 1, lastTime: bonTime, price });
        }
      }
    };

    for (const b of sortiesHistory as any[]) scan(b);
    for (const b of comptantHistory as any[]) scan(b);

    let best: Stat | null = null;
    for (const stat of map.values()) {
      if (stat.count >= minCount) {
        if (!best || stat.lastTime > best.lastTime) best = stat;
      }
    }
    return best ? { price: statNumber(best.price), count: best.count } : null;
  };

  const statNumber = (n: any): number => {
    const v = typeof n === 'number' ? n : Number(String(n).replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
  };

    // (Removed local cumulative balance calculations; using backend provided solde_cumule)

  // Fonction utilitaire pour vérifier le plafond en temps réel
  const checkClientCreditLimitRealTime = async (values: any) => {
    // Vérifier seulement pour les bons clients avec plafond
    if (!['Sortie', 'Comptant', 'Avoir', 'AvoirComptant'].includes(values.type) || !values.client_id) {
      return true;
    }

    const client = clients.find((c: any) => Number(c.id) === Number(values.client_id));
    if (!client || !client.plafond || Number(client.plafond) <= 0) {
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
  const soldeCumule = Number(backendClient?.solde_cumule) || 0;
    const plafond = Number(client.plafond);
    const nouveauSolde = soldeCumule + montantBon;

    // Si client déjà au-dessus du plafond
    if (soldeCumule > plafond) {
      if (user?.role === 'PDG') {
        // PDG : juste un rappel discret (pas de popup répétitive)
        console.warn(`⚠️ Client ${client.nom_complet} déjà au-dessus du plafond (${soldeCumule.toFixed(2)} DH / ${plafond.toFixed(2)} DH)`);
        return true;
      } else {
        // Autres rôles : bloquant
        showError(
          `🚫 MODIFICATION BLOQUÉE 🚫\n\n` +
          `Client ${client.nom_complet} a déjà dépassé son plafond.\n` +
          `Solde actuel: ${soldeCumule.toFixed(2)} DH\n` +
          `Plafond: ${plafond.toFixed(2)} DH\n\n` +
          `Vous ne pouvez pas modifier ce bon.`
        );
        return false;
      }
    }
    // Si ce bon ferait dépasser le plafond
    else if (nouveauSolde > plafond) {
      const depassement = nouveauSolde - plafond;
      
      if (user?.role === 'PDG') {
        // PDG : avertissement mais peut continuer
        console.warn(`⚠️ Ce bon ferait dépasser le plafond de ${depassement.toFixed(2)} DH pour ${client.nom_complet}`);
        return true;
      } else {
        // Autres rôles : bloquant
        showError(
          `🚫 MODIFICATION BLOQUÉE 🚫\n\n` +
          `Cette modification ferait dépasser le plafond de crédit.\n` +
          `Client: ${client.nom_complet}\n` +
          `Solde actuel: ${soldeCumule.toFixed(2)} DH\n` +
          `Nouveau solde: ${nouveauSolde.toFixed(2)} DH\n` +
          `Plafond: ${plafond.toFixed(2)} DH\n` +
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
  const priceForDisplay = values.type === 'Commande' ? pa : unit;
  const totalPrice = q * priceForDisplay;

  // Créer une version temporaire des valeurs avec le nouveau produit
  const tempValues = {
    ...values,
    items: values.items.map((item: any, idx: number) => 
      idx === rowIndex ? {
        ...item,
        product_id: product.id,
        prix_achat: pa,
        prix_unitaire: unit,
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-1 sm:p-2">
      <div className="bg-white rounded-lg w-[98vw] max-w-7xl max-h-[96vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="bg-blue-600 px-4 sm:px-6 py-3 rounded-t-lg flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-base sm:text-lg font-semibold text-white truncate">
            {initialValues ? 'Modifier' : 'Créer'} un {currentTab}
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
              <AutoCheckNonCalculatedForAwatif isOpen={isOpen} clients={clients as any[]} />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

                {/* Date */}
                <div>
                  <label htmlFor="date_bon" className="block text-sm font-medium text-gray-700 mb-1">
                    Date et heure du bon
                  </label>
                  <Field type="datetime-local" id="date_bon" name="date_bon" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
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
                  <Field type="text" id="lieu_charge" name="lieu_charge" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Ex: Entrepôt Casablanca" />
                </div>
                <div>
                  <label htmlFor="adresse_livraison" className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse de livraison
                  </label>
                  <Field type="text" id="adresse_livraison" name="adresse_livraison" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Adresse complète de livraison" />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone du bon
                  </label>
                  <Field type="text" id="phone" name="phone" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Numéro de téléphone lié à ce bon (facultatif)" />
                </div>
                <div className="flex items-center gap-2">
                  <Field type="checkbox" id="isNotCalculated" name="isNotCalculated" className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                  <label htmlFor="isNotCalculated" className="text-sm font-medium text-gray-700">
                    Non calculé
                  </label>
                  <span className="text-xs text-gray-500">(Cocher si ce bon ne doit pas être pris en compte dans les calculs)</span>
                </div>
              </div>

              {/* Multi-livraisons (véhicules + chauffeurs) */}
              {(currentTab !== 'Vehicule' || ((values.livraisons || []).length > 0)) && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Livraisons (multi-véhicules)</label>
                    <button
                      type="button"
                      className="px-2 py-1 text-sm bg-blue-600 text-white rounded"
                      onClick={() => setFieldValue('livraisons', [...(values.livraisons || []), { vehicule_id: '', user_id: '' }])}
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
                                value={l.vehicule_id || ''}
                                onChange={(e) => {
                                  const arr = [...(values.livraisons || [])];
                                  arr[idx] = { ...arr[idx], vehicule_id: e.target.value };
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
                                value={l.user_id || ''}
                                onChange={(e) => {
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
                              <button type="button" className="px-2 py-2 bg-red-600 text-white rounded" onClick={() => remove(idx)}>
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
                    options={clients.map((c: Contact) => {
                      const soldeCumule = Number(c.solde_cumule ?? c.solde ?? 0) || 0;
                      const plafond = Number(c.plafond || 0);
                      const isOverLimit = plafond > 0 && soldeCumule > plafond;
                      const depassement = isOverLimit ? soldeCumule - plafond : 0;
                      
                      // Pour les rôles non-PDG, désactiver les clients déjà au-dessus du plafond
                      const isDisabled = isOverLimit && user?.role !== 'PDG';
                      
                      return {
                        value: c.id.toString(),
                        label: isOverLimit 
                          ? `${c.nom_complet} ${c.reference ? `(${c.reference})` : ''} ⚠️ DÉPASSÉ de ${depassement.toFixed(2)} DH`
                          : `${c.nom_complet} ${c.reference ? `(${c.reference})` : ''}`,
                        data: c,
                        disabled: isDisabled
                      };
                    })}
                    value={values.client_id}
                    onChange={async (clientId) => {
                      const client = clients.find((c: Contact) => c.id.toString() === clientId);
                      if (!client) {
                        setFieldValue('client_id', clientId);
                        return;
                      }
                      
                      const soldeCumule = Number(client.solde_cumule ?? client.solde ?? 0) || 0;
                      const plafond = Number(client.plafond || 0);
                      const isOverLimit = plafond > 0 && soldeCumule > plafond;
                      
                      if (isOverLimit) {
                        const depassement = soldeCumule - plafond;
                        
                        if (user?.role === 'PDG') {
                          // PDG : Alerte mais peut continuer
                          const result = await showConfirmation(
                            `⚠️ ATTENTION - CLIENT DÉJÀ AU-DESSUS DU PLAFOND ⚠️\n\n` +
                            `Client: ${client.nom_complet}\n` +
                            `Solde cumulé actuel: ${soldeCumule.toFixed(2)} DH\n` +
                            `Plafond autorisé: ${plafond.toFixed(2)} DH\n` +
                            `Dépassement actuel: ${depassement.toFixed(2)} DH\n\n` +
                            `Ce client a déjà dépassé son plafond de crédit.\n` +
                            `Voulez-vous tout de même continuer avec ce client ?`,
                            'Client au-dessus du plafond',
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
                            `Plafond autorisé: ${plafond.toFixed(2)} DH\n` +
                            `Dépassement: ${depassement.toFixed(2)} DH\n\n` +
                            `❌ Ce client a déjà dépassé son plafond de crédit.\n` +
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
                    autoOpenOnFocus
                  />
                  <ErrorMessage name="client_id" component="div" className="text-red-500 text-sm mt-1" />
                  {values.client_id && (
                    <div className="mt-2 p-2 bg-blue-50 rounded">
                      <span className="text-sm text-blue-700 font-medium">Solde cumulé: </span>
                      <span className="text-sm text-blue-800 font-semibold">
                        {(() => {
                          const selectedClient = clients.find((c: Contact) => c.id.toString() === values.client_id.toString());
                          const solde = Number(selectedClient?.solde_cumule ?? selectedClient?.solde ?? 0);
                          return Number.isFinite(solde) ? `${solde.toFixed(2)} DH` : '—';
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

      {/* Client libre pour Comptant & AvoirComptant */}
      {(values.type === 'Comptant' || values.type === 'AvoirComptant') && (
                <div>
                  <label htmlFor="client_nom" className="block text-sm font-medium text-gray-700 mb-1">
        Client (texte libre){values.type === 'AvoirComptant' ? ' - Avoir Comptant' : ''}
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
                          const fournisseurSel = fournisseurs.find((f: Contact) => f.id.toString() === values.fournisseur_id.toString());
                          const solde = Number(fournisseurSel?.solde_cumule ?? fournisseurSel?.solde ?? 0);
                          return Number.isFinite(solde) ? `${solde.toFixed(2)} DH` : '—';
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
                        onClick={() => setShowRemisePanel((v) => !v)}
                        className="flex items-center text-purple-600 hover:text-purple-800"
                        title={showRemisePanel ? 'Masquer remises' : 'Afficher / appliquer des remises'}
                      >
                        {showRemisePanel ? 'Masquer remises' : 'Appliquer remises'}
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
                      {!showAddRemiseClient && (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowAddRemiseClient(true)}
                            className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700"
                          >
                            Ajouter
                          </button>
                          <div className="min-w-[280px]">
                            <SearchableSelect
                              options={(remiseClients || []).map((c: any) => ({
                                value: String(c.id),
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
                        </>
                      )}
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

                {showAddRemiseClient && (values.type === 'Sortie' || values.type === 'Comptant') && (
                  <div className="mb-4 p-3 border rounded bg-purple-50">
                    <h4 className="text-sm font-medium text-purple-700 mb-2">Nouveau client remise</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                      <input
                        type="text"
                        placeholder="Nom *"
                        className="px-3 py-2 border rounded text-sm"
                        value={newRemiseClient.nom}
                        onChange={(e) => setNewRemiseClient((c) => ({ ...c, nom: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Téléphone"
                        className="px-3 py-2 border rounded text-sm"
                        value={newRemiseClient.phone}
                        onChange={(e) => setNewRemiseClient((c) => ({ ...c, phone: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="CIN"
                        className="px-3 py-2 border rounded text-sm"
                        value={newRemiseClient.cin}
                        onChange={(e) => setNewRemiseClient((c) => ({ ...c, cin: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!newRemiseClient.nom}
                        onClick={async () => {
                          try {
                            const created: any = await createClientRemise({
                              nom: newRemiseClient.nom,
                              phone: newRemiseClient.phone || undefined,
                              cin: newRemiseClient.cin || undefined,
                            }).unwrap();
                            if (created?.id) {
                              setSelectedRemiseId(Number(created.id));
                              setShowRemisePanel(true); // afficher directement panel remises
                              showSuccess('Client remise ajouté');
                            }
                            setShowAddRemiseClient(false);
                            setNewRemiseClient({ nom: '', phone: '', cin: '' });
                          } catch (e: any) {
                            showError(e?.data?.message || 'Erreur création client remise');
                          }
                        }}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50"
                      >
                        Créer
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddRemiseClient(false); setNewRemiseClient({ nom: '', phone: '', cin: '' }); }}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                <div className="responsive-table-container">
                  <FieldArray name="items">
                    {({ remove }) => (
                      <table className="min-w-full divide-y divide-gray-200 table-mobile-compact">
                        <thead className="bg-gray-50">
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
                                <td className="px-1 py-2 w-[200px]">
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
                                        
                                        // Reset variant/unit
                                        setFieldValue(`items.${index}.variant_id`, '');
                                        setFieldValue(`items.${index}.unit_id`, '');

                                        setFieldValue(`items.${index}.prix_achat`, product.prix_achat || 0);
                                        setFieldValue(`items.${index}.cout_revient`, product.cout_revient || 0);
                                        // Charger les anciens pourcentages du produit par défaut
                                        setFieldValue(
                                          `items.${index}.cout_revient_pourcentage`,
                                          product.cout_revient_pourcentage ?? 0
                                        );
                                        setFieldValue(
                                          `items.${index}.prix_gros_pourcentage`,
                                          product.prix_gros_pourcentage ?? 0
                                        );
                                        setFieldValue(
                                          `items.${index}.prix_vente_pourcentage`,
                                          product.prix_vente_pourcentage ?? 0
                                        );
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

                                {/* Variante */}
                                <td className="px-1 py-2 w-[100px]">
                                  {(() => {
                                    const product = products.find((p: any) => String(p.id) === String(values.items[index].product_id));
                                    const variants = product?.variants ?? [];
                                    if (!product || variants.length === 0) {
                                      return <span className="text-xs text-gray-400">-</span>;
                                    }
                                    return (
                                      <select
                                        className="w-full px-1 py-1 text-sm border rounded"
                                        value={values.items[index].variant_id || ''}
                                        onChange={(e) => {
                                          const vId = e.target.value;
                                          setFieldValue(`items.${index}.variant_id`, vId);
                                          if (vId) {
                                            const variant = variants.find((v: any) => String(v.id) === vId);
                                            if (variant) {
                                              // Update price based on variant
                                              const variantBasePrice = values.type === 'Commande' ? Number(variant.prix_achat || 0) : Number(variant.prix_vente || 0);
                                              // If a unit is already selected, apply its conversion factor to the variant price
                                              const unitIdSel = values.items[index].unit_id;
                                              const unitsForProduct = product?.units ?? [];
                                              let effectivePrice = variantBasePrice;
                                              if (unitIdSel) {
                                                const unitSel = unitsForProduct.find((u: any) => String(u.id) === String(unitIdSel));
                                                const factorSel = Number(unitSel?.conversion_factor || 1) || 1;
                                                effectivePrice = Number((variantBasePrice * factorSel).toFixed(2));
                                              }
                                              if (values.type === 'Commande') {
                                                setFieldValue(`items.${index}.prix_achat`, effectivePrice);
                                              } else {
                                                setFieldValue(`items.${index}.prix_unitaire`, effectivePrice);
                                              }
                                              setUnitPriceRaw((prev) => ({ ...prev, [index]: String(effectivePrice) }));
                                              
                                              // Recalculate total
                                              const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
                                              setFieldValue(`items.${index}.total`, q * effectivePrice);
                                            }
                                          }
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
                                    const basePriceAchat = Number(product?.prix_achat ?? 0) || 0;
                                    const basePriceVente = Number(product?.prix_vente ?? 0) || 0;
                                    if (!product || units.length === 0) {
                                      return <span className="text-xs text-gray-400">{baseUnit}</span>;
                                    }
                                    return (
                                      <select
                                        className="w-full px-1 py-1 text-sm border rounded"
                                        value={values.items[index].unit_id || ''}
                                        onChange={(e) => {
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
                                              if (selectedVariantId) {
                                                const v = variantsForProduct.find((vv: any) => String(vv.id) === String(selectedVariantId));
                                                if (v) {
                                                  baseA = Number(v.prix_achat ?? basePriceAchat) || 0;
                                                  baseV = Number(v.prix_vente ?? basePriceVente) || 0;
                                                }
                                              }
                                              if (values.type === 'Commande') {
                                                newPrice = Number((baseA * factor).toFixed(2));
                                                setFieldValue(`items.${index}.prix_achat`, newPrice);
                                              } else {
                                                newPrice = Number((baseV * factor).toFixed(2));
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
                                            if (selectedVariantId) {
                                              const v = variantsForProduct.find((vv: any) => String(vv.id) === String(selectedVariantId));
                                              if (v) {
                                                baseA = Number(v.prix_achat ?? basePriceAchat) || 0;
                                                baseV = Number(v.prix_vente ?? basePriceVente) || 0;
                                              }
                                            }
                                            if (values.type === 'Commande') {
                                              newPrice = baseA;
                                              setFieldValue(`items.${index}.prix_achat`, newPrice);
                                            } else {
                                              newPrice = baseV;
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
      
      setFieldValue(`items.${index}.quantite`, q);
      setQtyRaw((prev) => ({ ...prev, [index]: formatNumber(q) }));
      const u = parseFloat(normalizeDecimal(unitPriceRaw[index] ?? '')) || 0;
      setFieldValue(`items.${index}.total`, q * u);
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
    let availableStock = 0;
    if (variantId && Array.isArray(product.variants)) {
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
    onBlur={async () => {
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
    const last = getLastUnitPriceForClientProduct(
      values.client_id,
      values.items[index].product_id
    );
    return last && Number.isFinite(last) ? (
      <div className="text-xs text-gray-500 mt-1">Dernier (Validé): {formatFull(Number(last))} DH</div>
    ) : null;
  })()}
  {/* Prix fréquemment utilisé (>=6) pour ce produit, option d'application */}
  {values.type !== 'Commande' && values.items[index].product_id && (() => {
    const freq = getFrequentUnitPriceForProduct(values.items[index].product_id, 6);
    if (!freq || !Number.isFinite(freq.price)) return null;
    const suggested = Number(freq.price);
    return (
      <label className="mt-1 flex items-center gap-2 text-[11px] text-gray-700">
        <input
          type="checkbox"
          onChange={(e) => {
            if (!e.target.checked) return;
            const p = suggested;
            setUnitPriceRaw((prev) => ({ ...prev, [index]: formatFull(p) }));
            setFieldValue(`items.${index}.prix_unitaire`, p);
            const q = parseFloat(normalizeDecimal(qtyRaw[index] ?? String(values.items[index].quantite ?? ''))) || 0;
            setFieldValue(`items.${index}.total`, q * p);
          }}
        />
        <span>
          Utiliser ce prix: <span className="font-semibold">{formatFull(suggested)} DH</span> (×{freq.count})
        </span>
      </label>
    );
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
    const lastC = getLastUnitPriceForComptantProduct(values.items[index].product_id);
    return lastC && Number.isFinite(lastC) ? (
      <div className="text-xs text-gray-500 mt-1">Dernier (Comptant): {formatFull(Number(lastC))} DH</div>
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
  return formatFull(q * u);
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
            parseFloat(normalizeDecimal(unitPriceRaw[idx] ?? String(item.prix_unitaire ?? ''))) || 0;
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
    {formatFull(
      values.items
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
    )}{' '}
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