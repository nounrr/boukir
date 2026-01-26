import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
  import { Plus, Search, Trash2, Edit, Eye, CheckCircle2, Clock, XCircle, Printer, Copy, ChevronUp, ChevronDown, MoreHorizontal, Send } from 'lucide-react';
import { useCreateBonLinkMutation, useGetBonLinksBatchMutation } from '../store/api/bonLinksApi';
  import { Formik, Form, Field } from 'formik';
  import ProductFormModal from '../components/ProductFormModal';
  import ContactFormModal from '../components/ContactFormModal';
  import DevisTransformModal from '../components/DevisTransformModal';
  import BonFormModal from '../components/BonFormModal';
  import AvoirFormModal from '../components/AvoirFormModal';
  import ThermalPrintModal from '../components/ThermalPrintModal';
  import BonPrintModal from '../components/BonPrintModal';
  import SearchableSelect from '../components/SearchableSelect';
  import { 
    useGetBonsByTypeQuery, 
    useDeleteBonMutation, 
    useUpdateBonStatusMutation,
    useCreateBonMutation
  } from '../store/api/bonsApi';
  import { 
    useGetClientsQuery, 
  useGetFournisseursQuery
  } from '../store/api/contactsApi';
  import { useGetProductsQuery } from '../store/api/productsApi';
  import { showError, showSuccess, showConfirmation } from '../utils/notifications';
  import BonPrintTemplate from '../components/BonPrintTemplate';
  import { generatePDFBlobFromElement } from '../utils/pdf';
  import { uploadBonPdf } from '../utils/uploads';
  import { formatDateSpecial, formatDateTimeWithHour } from '../utils/dateUtils';
  import { useSelector } from 'react-redux';
  import type { RootState } from '../store';
  import { getBonNumeroDisplay } from '../utils/numero';
  import { logout } from '../store/slices/authSlice';
  import { useAppDispatch, useAuth } from '../hooks/redux';
  import { canModifyBons } from '../utils/permissions';
  import { useNavigate } from 'react-router-dom';
  
  

// Centralize action/status icon size for easier adjustment
const ACTION_ICON_SIZE = 24; // increased from 20 per user request

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

// eslint-disable-next-line sonarjs/cognitive-complexity
const BonsPage = () => {
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState<'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirComptant' | 'AvoirFournisseur' | 'Devis' | 'Vehicule' | 'Ecommerce'>('Commande');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedBon, setSelectedBon] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [isNewVehicleModalOpen, setIsNewVehicleModalOpen] = useState(false);
  const [isCreateAvoirModalOpen, setIsCreateAvoirModalOpen] = useState(false);
  const [selectedBonForAvoir, setSelectedBonForAvoir] = useState<any>(null);
  const [isCreateAvoirClientModalOpen, setIsCreateAvoirClientModalOpen] = useState(false);
  const [selectedBonForAvoirClient, setSelectedBonForAvoirClient] = useState<any>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isDevisTransformModalOpen, setIsDevisTransformModalOpen] = useState(false);
  const [selectedDevisToTransform, setSelectedDevisToTransform] = useState<any>(null);
  const [isThermalPrintModalOpen, setIsThermalPrintModalOpen] = useState(false);
  const [selectedBonForPrint, setSelectedBonForPrint] = useState<any>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedBonForPDFPrint, setSelectedBonForPDFPrint] = useState<any>(null);
  // État pour la modal de duplication AWATEF
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [selectedBonForDuplicate, setSelectedBonForDuplicate] = useState<any>(null);
  const [duplicateType, setDuplicateType] = useState<'fournisseur' | 'client' | 'comptant' | 'avoirClient' | 'avoirFournisseur' | 'avoirComptant'>('client');
  const [selectedContactForDuplicate, setSelectedContactForDuplicate] = useState<string>('');
  const [comptantClientName, setComptantClientName] = useState<string>('');
  const [isDuplicationComplete, setIsDuplicationComplete] = useState(true);
  const [selectedArticlesForDuplicate, setSelectedArticlesForDuplicate] = useState<number[]>([]);
  // Clé pour forcer le remontage du formulaire (assure un état 100% vierge entre créations)
  const [bonFormKey, setBonFormKey] = useState(0);

  // Menu actions state
  const [openMenuBonId, setOpenMenuBonId] = useState<string | null>(null);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  // Sorting
  const [sortField, setSortField] = useState<'numero' | 'date' | 'contact' | 'montant' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Auth context
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const isEmployee = currentUser?.role === 'Employé';
  // Manager full access only for Commande & AvoirFournisseur
  const isFullAccessManager = currentUser?.role === 'Manager' && (currentTab === 'Commande' || currentTab === 'AvoirFournisseur');
  const isManager = currentUser?.role === 'Manager';
  // ManagerPlus role value (not needed here currently)
  
  // Feature flag: show WhatsApp button only for PDG and Manager+
  const SHOW_WHATSAPP_BUTTON = currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus';

  // Helper to build the per-type storage key for auto-send checkbox
  const getAutoSendKey = (type: string) => `autoSendWhatsAppOnValidation_${type}`;

  // Auto-send WhatsApp on validation (stored per bon type in localStorage)
  // Legacy migration: if global key exists and per-type key missing for initial tab, migrate value.
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState<boolean>(() => {
    try {
      const initialType = 'Commande'; // corresponds to initial currentTab default
      const perTypeKey = getAutoSendKey(initialType);
      const perTypeVal = localStorage.getItem(perTypeKey);
      if (perTypeVal != null) return perTypeVal === 'true';
      // Migrate legacy global key
      const legacy = localStorage.getItem('autoSendWhatsAppOnValidation');
      if (legacy != null) {
        localStorage.setItem(perTypeKey, legacy);
        return legacy === 'true';
      }
      return false;
    } catch {
      return false;
    }
  });

  // Persist per-type value whenever it changes for the active tab
  useEffect(() => {
    try {
      const key = getAutoSendKey(currentTab);
      localStorage.setItem(key, String(autoSendWhatsApp));
    } catch (error) {
      console.warn('Erreur lors de la sauvegarde de autoSendWhatsApp (per-type):', error);
    }
  }, [autoSendWhatsApp, currentTab]);

  // Load the per-type value when the tab changes (with legacy fallback)
  useEffect(() => {
    try {
      const key = getAutoSendKey(currentTab);
      const val = localStorage.getItem(key);
      if (val != null) {
        setAutoSendWhatsApp(val === 'true');
      } else {
        // Fallback migration from legacy global key if present
        const legacy = localStorage.getItem('autoSendWhatsAppOnValidation');
        if (legacy != null) {
          setAutoSendWhatsApp(legacy === 'true');
          localStorage.setItem(key, legacy);
        } else {
          setAutoSendWhatsApp(false);
        }
      }
    } catch (error) {
      console.warn('Erreur lors du chargement de autoSendWhatsApp (per-type):', error);
    }
  }, [currentTab]);

  // RTK Query hooks
  // Load bons by type
  const { data: bons = [], isLoading: bonsLoading } = useGetBonsByTypeQuery(currentTab);
  const { data: clients = [], isLoading: clientsLoading } = useGetClientsQuery();
  const { data: suppliers = [], isLoading: suppliersLoading } = useGetFournisseursQuery();
  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useGetProductsQuery();
  const [deleteBonMutation] = useDeleteBonMutation();
  const [updateBonStatus] = useUpdateBonStatusMutation();
  const [createBon] = useCreateBonMutation();
  // Bon links API: record duplications
  const [createBonLink] = useCreateBonLinkMutation();
  const [getBonLinksBatch] = useGetBonLinksBatchMutation();
  const [bonLinksMap, setBonLinksMap] = useState<Record<string, { outgoing: any[]; incoming: any[] }>>({});

  // Helper to format numero for a type+id quickly
  const formatNumeroByType = (type: string, id: number) => {
    const map: Record<string, string> = {
      'Commande': 'CMD',
      'Sortie': 'SOR',
      'Comptant': 'COM',
      'Devis': 'DEV',
      'Avoir': 'AVC',
      'AvoirFournisseur': 'AVF',
      'AvoirComptant': 'AVC',
      'Vehicule': 'VEH',
      'Ecommerce': 'ORD',
    };
    const pref = map[type] || (type?.slice(0, 3).toUpperCase());
    return `${pref}${String(id).padStart(2, '0')}`;
  };
  const dispatch = useAppDispatch();
  // Column resizing state (persistent during the component lifetime)
  const showAuditCols = currentUser?.role === 'PDG' || currentUser?.role === 'Manager' || currentUser?.role === 'ManagerPlus';
  const defaultColWidths = useMemo(() => {
    const base = ['120','120','220','160','220','120','80','120']; // numero,date,contact,téléphone,adresse,montant,poids,mouvement
    if (showAuditCols) {
      base.push('140','140'); // created_by, updated_by
    }
    base.push('180','120','120'); // lié, statut, actions
    return base.map(v => `${v}px`);
  }, [showAuditCols]);

  // Load column widths from localStorage or use defaults
  const getStoredColWidths = useCallback(() => {
    try {
      const storageKey = `bonsPage_colWidths_${showAuditCols ? 'with' : 'without'}Audit`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate that stored widths match expected column count
        if (Array.isArray(parsed) && parsed.length === defaultColWidths.length) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Erreur lors du chargement des largeurs de colonnes:', error);
    }
    return defaultColWidths;
  }, [defaultColWidths, showAuditCols]);

  const [colWidths, setColWidths] = useState<string[]>(getStoredColWidths);

  // Save column widths to localStorage whenever they change
  useEffect(() => {
    try {
      const storageKey = `bonsPage_colWidths_${showAuditCols ? 'with' : 'without'}Audit`;
      localStorage.setItem(storageKey, JSON.stringify(colWidths));
    } catch (error) {
      console.warn('Erreur lors de la sauvegarde des largeurs de colonnes:', error);
    }
  }, [colWidths, showAuditCols]);

  // Update widths when audit cols toggle (load from localStorage for new configuration)
  useEffect(() => {
    setColWidths(getStoredColWidths());
  }, [getStoredColWidths]);

  const resizingRef = useRef<{colIndex:number; startX:number; startWidth:number; isResizing:boolean}>({
    colIndex: -1,
    startX: 0,
    startWidth: 0,
    isResizing: false
  });
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculer la largeur minimale basée sur le contenu de la colonne
  // (column measurement helper removed - unused)

  const onMouseMove = useCallback((e: MouseEvent) => {
    const r = resizingRef.current;

    // Si on est en train de redimensionner
    if (r.isResizing && r.colIndex >= 0) {
      const delta = e.clientX - r.startX;
      const minWidth = 30; // Largeur minimale absolue simple
      const newW = Math.max(minWidth, Math.round(r.startWidth + delta));
      setColWidths((prev) => {
        const next = [...prev];
        next[r.colIndex] = `${newW}px`;
        return next;
      });
      return;
    }

    // Détecter si on est près d'un bord de colonne pour changer le curseur
    const table = document.querySelector('.responsive-table') as HTMLTableElement;
    if (!table) return;

    // Pour un redimensionnement libre, on supprime la logique de détection automatique
    // Le curseur sera géré par les poignées de redimensionnement uniquement
  }, [colWidths]);

  const onMouseDown = useCallback((_e: MouseEvent) => {
    // Fonction simplifiée - la logique de redimensionnement est maintenant dans startResize
    return;
  }, []);

  const stopResize = useCallback(() => {
    resizingRef.current.isResizing = false;

    // Remove resizing class from table
    const table = document.querySelector('.responsive-table') as HTMLTableElement;
    if (table) {
      table.classList.remove('resizing');
      table.style.cursor = '';
    }

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopResize);
  }, [onMouseMove]);

  const startResize = useCallback((e: React.MouseEvent, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    resizingRef.current.colIndex = colIndex;
    resizingRef.current.isResizing = true;
    resizingRef.current.startX = e.clientX;
    resizingRef.current.startWidth = parseInt(String(colWidths[colIndex] || '120').replace('px',''));

    // Add resizing class to table for visual feedback
    const table = document.querySelector('.responsive-table') as HTMLTableElement;
    if (table) table.classList.add('resizing');

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
  }, [colWidths, onMouseMove, stopResize]);
  // const [markBonAsAvoir] = useMarkBonAsAvoirMutation();
  // Changer le statut d'un bon (Commande / Sortie / Comptant)
  const handleChangeStatus = async (bon: any, statut: 'Validé' | 'En attente' | 'Annulé' | 'Accepté' | 'Envoyé' | 'Refusé') => {
    try {
      // Employé: uniquement Annuler ou En attente, mais pas sur les bons déjà validés
      if (isEmployee) {
        if (bon.statut === 'Validé') {
          showError("Permission refusée: l'employé ne peut pas modifier un bon déjà validé.");
          return;
        }
        if (!['Annulé','En attente'].includes(statut)) {
          showError("Permission refusée: l'employé ne peut que mettre En attente ou Annuler.");
          return;
        }
      }
      // Manager: cannot turn a Validé bon into Annulé
      if (isManager) {
        if (bon.statut === 'Validé' && statut === 'Annulé') {
          showError("Permission refusée: un Manager ne peut pas annuler un bon déjà validé.");
          return;
        }
      }
      // Si c'est un devis et qu'on l'accepte, ouvrir le modal de transformation
      if (bon.type === 'Devis' && statut === 'Accepté') {
        setSelectedDevisToTransform(bon);
        setIsDevisTransformModalOpen(true);
        return;
      }
      
      await updateBonStatus({ id: bon.id, statut, type: bon.type || currentTab }).unwrap();
      showSuccess(`Statut mis à jour: ${statut}`);
      // IMPORTANT: refetch stock/products after status change (validation or cancel)
      refetchProducts();

      // Auto-send WhatsApp if enabled and status is Validé
      if (autoSendWhatsApp && statut === 'Validé' && SHOW_WHATSAPP_BUTTON) {
        // Send WhatsApp automatically without popup (skipConfirmation = true)
        try {
          await handleSendWhatsAppFromRow(bon, true);
        } catch (error) {
          console.error('Erreur lors de l\'envoi automatique WhatsApp:', error);
          // Don't show error to user - it's automatic
        }
      }
    } catch (error: any) {
      console.error('Erreur mise à jour statut:', error);
      const status = error?.status;
      const msg = error?.data?.message || error?.message || 'Erreur inconnue';
      if (status === 401) {
        showError('Session expirée. Veuillez vous reconnecter.');
        dispatch(logout());
      } else {
        showError(`Erreur lors du changement de statut: ${msg}`);
      }
    }
  };
  // Hooks retirés pour éviter les warnings tant que la migration RTK n'est pas terminée

  // ...

  // Helper to get contact name (client or fournisseur) used by filtering/render
  const getContactName = (bon: any) => {
    // Comptant et Devis: if client_nom is present (free text), prefer it
    if ((bon?.type === 'Comptant' || bon?.type === 'AvoirComptant' || currentTab === 'Comptant' || currentTab === 'AvoirComptant' || bon?.type === 'Devis' || currentTab === 'Devis' || bon?.type === 'Ecommerce' || currentTab === 'Ecommerce') && bon?.client_nom) {
      return bon.client_nom;
    }
    const clientId = bon?.client_id ?? bon?.contact_id;
    if (clientId && clients.length > 0) {
      const client = clients.find((c: any) => String(c.id) === String(clientId));
      return client ? client.nom_complet : 'Client supprimé';
    }
    if (bon?.fournisseur_id && suppliers.length > 0) {
      const supplier = suppliers.find((s: any) => String(s.id) === String(bon.fournisseur_id));
      return supplier ? supplier.nom_complet : 'Fournisseur supprimé';
    }
    return 'Non défini';
  };

  // Safely render any text value (handles Buffer-like {type:'Buffer', data:[..]})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isBufferLike = (o: any): o is { type: 'Buffer'; data: number[] } => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return !!o && typeof o === 'object' && (o as any).type === 'Buffer' && Array.isArray((o as any).data);
  };
  const safeText = (v: any): string => {
    if (v == null) return '-';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (isBufferLike(v)) {
      try {
        const arr = Uint8Array.from(v.data.map((n) => Number(n) || 0));
        return new TextDecoder().decode(arr) || '-';
      } catch {
        return '[binaire]';
      }
    }
    return String(v);
  };

  const formatPaymentMethod = (v: any): string => {
    const raw = (v == null ? '' : String(v)).trim();
    if (!raw) return '-';
    const s = raw.toLowerCase();
    if (s === 'solde') return 'Solde';
    if (s === 'cod' || s === 'cash_on_delivery' || s === 'cashondelivery') return 'Paiement à la livraison';
    if (s === 'card' || s === 'stripe' || s === 'online') return 'Carte (en ligne)';
    if (s === 'bank_transfer' || s === 'virement') return 'Virement';
    return raw;
  };

  const formatDeliveryMethod = (v: any): string => {
    const raw = (v == null ? '' : String(v)).trim();
    if (!raw) return '-';
    const s = raw.toLowerCase();
    if (s === 'pickup' || s === 'retrait') return 'Retrait';
    if (s === 'delivery' || s === 'livraison') return 'Livraison';
    return raw;
  };

  // Flatten a bon into a single searchable string containing most fields and nested item values
  const flattenBonForSearch = (bon: any): string => {
    const parts: string[] = [];

    // Normalize phone numbers to a short canonical form (last 9 digits for Morocco)
    const normalizePhone = (p: string | number | undefined | null) => {
      if (p == null) return '';
      const s = String(p).replace(/\D+/g, '');
      if (!s) return '';
      // If longer than 9, keep the last 9 digits (subscriber number)
      return s.length > 9 ? s.slice(-9) : s;
    };

    const push = (v: any) => {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        parts.push(String(v));
        return;
      }
      // Handle Buffer-like objects
      if (isBufferLike(v)) {
        parts.push(safeText(v));
        return;
      }
      // Arrays and objects will be processed recursively below
    };

    // Basic known fields
    try {
      push(getDisplayNumero(bon));
      push(bon?.statut);
      push(getContactName(bon));
      push(bon?.client_nom);
      push(bon?.adresse_livraison);
      push(bon?.lieu_chargement);
      push(bon?.observations || bon?.note || bon?.notes);
      push(String(computeMontantTotal(bon) || ''));

      // Chauffeur / véhicule related fields
      push(bon?.chauffeur || bon?.chauffeur_nom || bon?.driver || bon?.driver_name);
      push(bon?.vehicule_nom || bon?.vehicule || bon?.vehicle || '');
      push(bon?.immatriculation || bon?.vehicle_immatriculation || bon?.numero_immatriculation || '');

      // Dates: include ISO and simple local date so searching by yyyy-mm-dd or dd/mm/yyyy can match
      if (bon?.date_creation) {
        try {
          const d = new Date(bon.date_creation);
          if (!isNaN(d.getTime())) {
            // full ISO with time
            push(d.toISOString());
            // ISO short yyyy-mm-dd
            push(d.toISOString().slice(0, 10));
            // locale representations
            push(d.toLocaleDateString());
            push(d.toLocaleString());
            // dd/mm/yyyy and dd-mm-yyyy with zero padding
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = String(d.getFullYear());
            push(`${dd}/${mm}/${yyyy}`);
            push(`${dd}-${mm}-${yyyy}`);
            // mm/dd/yyyy also (some users may type month first)
            push(`${mm}/${dd}/${yyyy}`);
          } else {
            push(String(bon.date_creation));
          }
        } catch {
          push(String(bon.date_creation));
        }
      }
    } catch (e) {
      // ignore helper errors
    }

  // Phone resolution (try common places)
  const phoneCandidates: string[] = [];
  if (bon?.phone) phoneCandidates.push(String(bon.phone));
    const clientId = bon?.client_id ?? bon?.contact_id;
    if (clientId && clients.length > 0) {
      const client = clients.find((c: any) => String(c.id) === String(clientId));
      if (client) {
        if (client.telephone) phoneCandidates.push(String(client.telephone));
        if (client.nom_complet) parts.push(String(client.nom_complet));
      }
    }
    if (bon?.fournisseur_id && suppliers.length > 0) {
      const supplier = suppliers.find((s: any) => String(s.id) === String(bon.fournisseur_id));
      if (supplier) {
        if (supplier.telephone) phoneCandidates.push(String(supplier.telephone));
        if (supplier.nom_complet) parts.push(String(supplier.nom_complet));
      }
    }
    if (phoneCandidates.length) parts.push(phoneCandidates.join(' '));
    // Also push normalized phone tokens so different formats match same canonical number
    const normalizedPhones = phoneCandidates.map(p => normalizePhone(p)).filter(Boolean);
    if (normalizedPhones.length) parts.push(normalizedPhones.join(' '));

    // Add full-digit tokens and country-code mapped variants (Morocco: country code 212)
    const countryCode = '212';
    const fullDigitTokens: string[] = [];
    for (const raw of phoneCandidates) {
      const digits = String(raw).replace(/\D+/g, '');
      if (!digits) continue;
      fullDigitTokens.push(digits);
      // if number is national like 06xxxxxxxx, add international form 2126xxxxxxxx
      if (digits.length >= 9 && digits.startsWith('0')) {
        const rest = digits.slice(1);
        fullDigitTokens.push(countryCode + rest);
      }
      // if number is international like 2126xxxxxxxx, add national form 06xxxxxxxx
      if (digits.startsWith(countryCode)) {
        const rest = digits.slice(countryCode.length);
        if (rest.length > 0) fullDigitTokens.push('0' + rest);
      }
    }
    if (fullDigitTokens.length) parts.push(fullDigitTokens.join(' '));

    // Recursively collect primitive values from the bon (shallow depth to avoid huge dumps)
    const collect = (obj: any, depth = 0) => {
      if (obj == null || depth > 3) return;
      if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
        parts.push(String(obj));
        return;
      }
      if (Array.isArray(obj)) {
        for (const it of obj) collect(it, depth + 1);
        return;
      }
      if (typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          const val = obj[k];
          if (val == null) continue;
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            parts.push(String(val));
          } else if (Array.isArray(val)) {
            for (const it of val) collect(it, depth + 1);
          } else if (isBufferLike(val)) {
            parts.push(safeText(val));
          } else if (typeof val === 'object') {
            // skip very large nested objects (keep depth small)
            collect(val, depth + 1);
          }
        }
      }
    };

    // Ensure items are included
    const items = parseItemsSafe(bon?.items);
    if (items && items.length) collect(items, 0);

    // Include other bon fields generically
    collect(bon, 0);

    return parts.join(' ').toLowerCase();
  };

    // Ensure Devis numbers are displayed with uppercase DEV prefix and Avoirs with AVO prefix
  const getDisplayNumero = (bon: any) => getBonNumeroDisplay({ id: bon?.id, type: bon?.type, numero: bon?.numero });

  // Compute mouvement (profit) and margin% for a bon EXACTLY comme dans BonFormModal :
  // FORMULE: profit = Σ ( (prix_unitaire - (cout_revient || prix_achat)) * quantite )
  // (Ne pas soustraire la remise unitaire ici – le modal n'intègre pas la remise dans Mouvement.)
  // margin% = profit / Σ( (cout_revient || prix_achat) * quantite ) * 100
  const parseItemsSafe = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
  };
  const resolveCost = (it: any): number => {
    if (it.cout_revient !== undefined && it.cout_revient !== null) return Number(it.cout_revient) || 0;
    if (it.prix_achat !== undefined && it.prix_achat !== null) return Number(it.prix_achat) || 0;
    const pid = it.product_id || it.produit_id;
    if (pid) {
      const prod = (products as any[]).find(p => String(p.id) === String(pid));
      if (prod) return Number(prod.cout_revient ?? prod.prix_achat ?? 0) || 0;
    }
    return 0;
  };
  const computeMouvementDetail = (bon: any): { profit: number; costBase: number; marginPct: number | null } => {
    const items = parseItemsSafe(bon?.items);
    let profit = 0; let costBase = 0;
    const type = bon?.type || currentTab;
    const applyRemise = ['Sortie','Comptant','Avoir','AvoirComptant'].includes(type);
    for (const it of items) {
      const q = Number(it.quantite ?? it.qty ?? 0) || 0;
      if (!q) continue;
      const prixVente = Number(it.prix_unitaire ?? 0) || 0;
      let cost = 0;
      if (it.cout_revient !== undefined && it.cout_revient !== null) cost = Number(it.cout_revient) || 0;
      else if (it.prix_achat !== undefined && it.prix_achat !== null) cost = Number(it.prix_achat) || 0;
      else cost = resolveCost(it);
      const remiseUnitaire = Number(it.remise_montant || it.remise_valeur || 0) || 0; // support legacy key
      const remiseTotale = remiseUnitaire * q;
      // Profit net si types concernés, sinon brut
      profit += (prixVente - cost) * q - (applyRemise ? remiseTotale : 0);
      costBase += cost * q;
    }
    const marginPct = costBase > 0 ? (profit / costBase) * 100 : null;
    return { profit, costBase, marginPct };
  };

  // Calcule le montant total d'un bon (aligné avec BonFormModal + tolérant aux données backend hétérogènes)
  const computeMontantTotal = (bon: any): number => {
    const items = parseItemsSafe(bon?.items);
    if (!items.length) return Number(bon?.montant_total) || 0; // fallback direct
    const type = bon?.type || currentTab;

    const parseNum = (v: any): number => {
      if (v == null || v === '') return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      if (typeof v === 'string') {
        const cleaned = v.replace(/\s+/g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
      }
      return 0;
    };

    let total = 0;
    for (const item of items) {
      const q = parseNum(item.quantite ?? item.qty ?? item.qte);
      if (!q) continue;

      // Priorité:
      // 1. Champ total / montant_ligne déjà calculé (fiable si présent)
      // 2. Pour Commande: prix_achat sinon fallback prix_unitaire
      // 3. Pour autres types: prix_unitaire sinon fallback prix_achat
      // 4. Fallback supplémentaire: prix, prixVente
      let lineTotal: number | null = null;
      const rawLineTotal = item.total ?? item.montant_ligne ?? item.montantLigne;
      if (rawLineTotal != null) {
        const lt = parseNum(rawLineTotal);
        if (lt > 0) lineTotal = lt; // n'utiliser que si positif
      }

      if (lineTotal == null) {
        let unitPrice: number;
        if (type === 'Commande') {
          const puAchat = parseNum(item.prix_achat);
            // certains items provenant d'anciennes versions n'ont que prix_unitaire
          const puVenteFallback = parseNum(item.prix_unitaire);
          unitPrice = puAchat > 0 ? puAchat : (puVenteFallback > 0 ? puVenteFallback : parseNum(item.prix));
        } else {
          const puVente = parseNum(item.prix_unitaire);
          const puAchatFallback = parseNum(item.prix_achat);
          unitPrice = puVente > 0 ? puVente : (puAchatFallback > 0 ? puAchatFallback : parseNum(item.prixVente ?? item.prix));
        }
        lineTotal = q * unitPrice;
      }

      total += lineTotal;
    }

    // Si total calculé = 0 mais backend fournit montant_total non nul, utiliser celui-ci
    if (total === 0) {
      const backendTotal = parseNum(bon?.montant_total);
      if (backendTotal > 0) return backendTotal;
    }
    return total;
  };

  // Calcule le poids total d'un bon = somme (quantite * kg_unitaire)
  const computeTotalPoids = (bon: any): number => {
    const items = parseItemsSafe(bon?.items);
    let total = 0;
    for (const it of items) {
      const q = Number(it.quantite ?? it.qty ?? 0) || 0;
      if (!q) continue;
      let kgUnit = Number(it.kg ?? it.kg_value ?? 0);
      if (!kgUnit) {
        const pid = it.product_id || it.produit_id;
        const prod = (products as any[]).find(p => String(p.id) === String(pid));
        kgUnit = Number(prod?.kg ?? 0) || 0;
      }
  // Ancien fallback supprimé: si le poids n'est pas défini ou vaut 0, on considère désormais 0 (pas 1)
      total += kgUnit * q;
    }
    return total;
  };

  // Handle sorting
  const handleSort = (field: 'numero' | 'date' | 'contact' | 'montant') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // On ne filtre plus par bon.type car la requête est déjà segmentée par onglet,
    // et certains endpoints ne renvoyaient pas `type`.
  const sortedBons = useMemo(() => {
    // First filter - search across all bon attributes and nested item values
    const filtered = bons.filter(bon => {
      const term = (searchTerm || '').trim().toLowerCase();
      const searchText = flattenBonForSearch(bon);

      // Also compare normalized phone digits (last 9 digits) so +2126... and 06... match
      const normalizePhoneLocal = (s: string) => {
        if (!s) return '';
        const digits = s.replace(/\D+/g, '');
        return digits.length > 9 ? digits.slice(-9) : digits;
      };

      const termDigits = normalizePhoneLocal(term);

      const matchesSearch = !term || (
        searchText.includes(term) ||
        (termDigits && searchText.includes(termDigits))
      );

      const matchesStatus = !statusFilter || statusFilter.length === 0 ? true : (bon.statut && statusFilter.includes(String(bon.statut)));

      return matchesSearch && matchesStatus;
    });

    // Then sort
    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'numero':
          aValue = getDisplayNumero(a).toLowerCase();
          bValue = getDisplayNumero(b).toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.date_creation || 0).getTime();
          bValue = new Date(b.date_creation || 0).getTime();
          break;
        case 'contact':
          aValue = (currentTab === 'Vehicule' ? (a.vehicule_nom || '') : getContactName(a)).toLowerCase();
          bValue = (currentTab === 'Vehicule' ? (b.vehicule_nom || '') : getContactName(b)).toLowerCase();
          break;
        case 'montant':
          aValue = computeMontantTotal(a);
          bValue = computeMontantTotal(b);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [bons, searchTerm, statusFilter, sortField, sortDirection, currentTab, clients, suppliers]);

  // Pagination
  const totalItems = sortedBons.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBons = sortedBons.slice(startIndex, endIndex);

  // Fetch linked info for the visible bons
  useEffect(() => {
    const ids = paginatedBons.map((b) => b.id).filter(Boolean);
    if (!ids.length) { setBonLinksMap({}); return; }
    // Only request for known types
    const type = currentTab as string;
    getBonLinksBatch({ type, ids }).unwrap()
      .then((res) => setBonLinksMap(res || {}))
      .catch(() => setBonLinksMap({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, startIndex, endIndex, sortedBons.length]);

  // showAuditCols already declared earlier; reuse it

  // Audit meta: created_by_name and updated_by_name per bon id, by type->table mapping
  const tableForType = (t: string) => {
    switch (t) {
      case 'Commande': return 'bons_commande';
      case 'Sortie': return 'bons_sortie';
      case 'Comptant': return 'bons_comptant';
      case 'Devis': return 'devis';
      case 'Avoir': return 'avoirs_client';
      case 'AvoirFournisseur': return 'avoirs_fournisseur';
      case 'AvoirComptant': return 'avoirs_comptant';
      case 'Ecommerce': return 'ecommerce_orders';
      case 'Vehicule': return 'bons_vehicule';
      default: return '';
    }
  };
  const [auditMeta, setAuditMeta] = useState<Record<string, { created_by_name: string|null; updated_by_name: string|null }>>({});
  const { token } = useAuth();
  const apiBaseUrl = (import.meta as any)?.env?.VITE_API_BASE_URL || '';
  // Helper: envoyer WhatsApp pour un bon depuis la liste
  // (imports moved to top of file)
  const resolveBonPhone = (bon: any): string | null => {
    // Priorité: bon.phone si présent
    if (bon?.phone) return String(bon.phone);
    // Client selon type
    const type = bon?.type || currentTab;
    const clientId = bon?.client_id ?? bon?.contact_id;
    if (['Sortie','Comptant','Avoir','AvoirComptant','Devis'].includes(type)) {
      if (clientId && clients.length > 0) {
        const client = clients.find((c: any) => String(c.id) === String(clientId));
        if (client?.telephone) return String(client.telephone);
      }
    }
    // Fournisseur pour Commande / AvoirFournisseur
    if (['Commande','AvoirFournisseur'].includes(type)) {
      const fournisseurId = bon?.fournisseur_id ?? bon?.contact_id;
      if (fournisseurId && suppliers.length > 0) {
        const supplier = suppliers.find((s: any) => String(s.id) === String(fournisseurId));
        if (supplier?.telephone) return String(supplier.telephone);
      }
    }
    return null;
  };
  const handleSendWhatsAppFromRow = async (bon: any, skipConfirmation = false) => {
    // Debug helper to surface the media URL in case of error (needs outer scope for catch)
    let debugMediaUrl: string | null = null;
    try {
      const bonKey = bon?.id != null ? String(bon.id) : '__unknown__';
      setSendingWhatsAppId(bonKey);

      const toPhone = resolveBonPhone(bon);
      if (!toPhone) {
        if (!skipConfirmation) showError("Numéro de téléphone introuvable pour ce bon.");
        return;
      }

      const parseItems = (rawItems: any) => {
        if (Array.isArray(rawItems)) return rawItems;
        if (typeof rawItems === 'string') {
          try {
            const parsed = JSON.parse(rawItems);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      };

      const bonItems = parseItems(bon.items);
      const defaultLines = [
        `Bonjour ${getContactName(bon) || ''}`,
        `Type: ${bon.type || currentTab}`,
        `Numéro: ${getDisplayNumero(bon)}`,
        `Montant: ${computeMontantTotal(bon).toFixed(2)} DH`,
        bon.date_creation ? `Date: ${formatDateTimeWithHour(bon.date_creation)}` : '',
        bon.adresse_livraison ? `Adresse: ${bon.adresse_livraison}` : '',
        bon.lieu_chargement ? `Lieu de chargement: ${bon.lieu_chargement}` : '',
        bon.observations ? `Note: ${bon.observations}` : '',
        bonItems.length
          ? 'Articles:\n' + bonItems.map((it: any) => {
              const unit = it.prix_unitaire || it.prix || 0;
              return `  - ${it.nom || it.name || it.designation || ''} x${it.quantite || it.qty || 1} @ ${Number(unit).toFixed(2)} DH`;
            }).join('\n')
          : '',
        'Merci.'
      ].filter(Boolean);
      const initialMessage = defaultLines.join('\n');

      let editedMessage = initialMessage;
      let selectedCompany: 'DIAMOND' | 'MPC' = 'DIAMOND';
      let selectedUsePromo: boolean = false;

      // 1) Popup de prévisualisation/édition du message (sauf si skipConfirmation)
      if (!skipConfirmation) {
        const Swal = (await import('sweetalert2')).default;
        
        const result = await Swal.fire({
          title: 'Message WhatsApp',
          html: `
            <div style="text-align:left;font-size:13px;margin-bottom:12px">
              <div style="margin-bottom:6px">Téléphone: <b>${toPhone}</b></div>
              <div style="margin-bottom:8px">
                <label style="font-weight:600;display:block;margin-bottom:4px">Choisir l'en-tête:</label>
                <select id="company-select" class="swal2-input" style="width:100%;padding:8px;font-size:14px">
                  <option value="DIAMOND">DIAMOND BOUKIR</option>
                  <option value="MPC">MPC</option>
                </select>
              </div>
              <div style="margin-top:6px;display:flex;align-items:center;gap:8px">
                <input type="checkbox" id="use-promo-checkbox" />
                <label for="use-promo-checkbox" style="cursor:pointer">Utiliser promo (afficher prix original et %)</label>
              </div>
            </div>
          `,
          input: 'textarea',
          inputValue: initialMessage,
          inputAttributes: { 'aria-label': 'Message WhatsApp' },
          showCancelButton: true,
          confirmButtonText: 'Envoyer WhatsApp',
          cancelButtonText: 'Annuler',
          heightAuto: false,
          customClass: { popup: 'swal2-show' },
          preConfirm: (val) => {
            const companySelect = document.getElementById('company-select') as HTMLSelectElement;
            const usePromoCheckbox = document.getElementById('use-promo-checkbox') as HTMLInputElement;
            return {
              message: typeof val === 'string' ? val : initialMessage,
              company: (companySelect?.value || 'DIAMOND') as 'DIAMOND' | 'MPC',
              usePromo: !!usePromoCheckbox?.checked
            };
          }
        });
        if (!result.isConfirmed) return; // annulé
        editedMessage = (result.value as any)?.message || initialMessage;
        selectedCompany = (result.value as any)?.company || 'DIAMOND';
        selectedUsePromo = (result.value as any)?.usePromo === true;
      }

      // 2) Générer le PDF et envoyer
      const type = bon?.type || currentTab;
      let resolvedClient: any;
      let resolvedSupplier: any;
      if (['Sortie', 'Comptant', 'Avoir', 'AvoirComptant', 'Devis'].includes(type)) {
        const clientId = bon?.client_id ?? bon?.contact_id;
        if (clientId && clients.length > 0) {
          resolvedClient = clients.find((c: any) => String(c.id) === String(clientId));
        }
      }
      if (['Commande', 'AvoirFournisseur'].includes(type)) {
        const fournisseurId = bon?.fournisseur_id ?? bon?.contact_id;
        if (fournisseurId && suppliers.length > 0) {
          resolvedSupplier = suppliers.find((s: any) => String(s.id) === String(fournisseurId));
        }
      }

      const pdfElement = (
        <BonPrintTemplate
          bon={bon}
          client={resolvedClient}
          fournisseur={resolvedSupplier}
          products={products as any}
          size="A4"
          companyType={selectedCompany}
          usePromo={selectedUsePromo}
        />
      );

      const pdfBlob = await generatePDFBlobFromElement(pdfElement);
      const numero = getDisplayNumero(bon) || `bon-${bon?.id || 'document'}`;
      const safeNumero = numero.replace(/[^a-zA-Z0-9_-]/g, '_') || `bon_${Date.now()}`;
      const fileName = `${safeNumero}.pdf`;

      const uploadResult = await uploadBonPdf(pdfBlob, fileName, {
        token: token || undefined,
        bonId: bon?.id,
        bonType: type,
      });

      const baseForUrl = apiBaseUrl || window.location.origin;
      const mediaUrl = uploadResult.absoluteUrl || `${baseForUrl.replace(/\/$/, '')}${uploadResult.url.startsWith('/') ? '' : '/'}${uploadResult.url}`;
      // Store for error visibility
      debugMediaUrl = mediaUrl;
      console.debug('[WhatsApp] Media URL prepared:', debugMediaUrl, uploadResult);

      // Utiliser la route /whatsapp/bon pour tous les types (envoie le PDF en pièce jointe)
      const numeroDisplay = getDisplayNumero(bon) || 'N/A';
      const montantDisplay = computeMontantTotal(bon).toFixed(2);
      
      try {
        const resp = await fetch('/api/notifications/whatsapp/bon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            to: toPhone,
            pdfUrl: debugMediaUrl, // URL absolue générée et uploadée
            numero: numeroDisplay,
            total: montantDisplay,
            devise: 'DH'
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.ok) {
          if (!skipConfirmation) {
            const Swal = (await import('sweetalert2')).default;
            const sentMessage = `${editedMessage}\nPDF: ${debugMediaUrl}`;
            await Swal.fire({
              title: 'WhatsApp (PDF) envoyé',
              html: `<div style="text-align:left;font-size:13px;margin-bottom:12px">Message envoyé à: <b>${toPhone}</b></div>
                     <textarea readonly style="width:100%;min-height:200px;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:12px;font-family:monospace;resize:vertical">${sentMessage}</textarea>`,
              icon: 'success',
              confirmButtonText: 'OK',
              heightAuto: false,
              customClass: { popup: 'swal2-show' }
            });
          }
        } else {
          const msg = data?.message || data?.error || `Échec WhatsApp (${resp.status})`;
          if (!skipConfirmation) showError(msg);
          console.warn('[WhatsApp] Envoi PDF échoué', { toPhone, debugMediaUrl, data });
        }
      } catch (e: any) {
        if (!skipConfirmation) showError(e?.message || 'Erreur envoi PDF WhatsApp');
        console.error('[WhatsApp] Exception envoi PDF', e);
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Erreur lors de l\'envoi WhatsApp';
      // Surface the media URL if available
      if (!skipConfirmation) {
        showError(`${msg}\nLien média: ${typeof debugMediaUrl === 'string' && debugMediaUrl ? debugMediaUrl : 'N/A'}`);
      }
      console.error('[WhatsApp] Exception lors de l\'envoi. URL:', debugMediaUrl, err);
    } finally {
      setSendingWhatsAppId(null);
    }
  };
  useEffect(() => {
    if (!showAuditCols) { setAuditMeta({}); return; }
    const ids = paginatedBons.map(b => b.id).filter(Boolean);
    const t = tableForType(currentTab);
    if (!ids.length || !t) { setAuditMeta({}); return; }
    const ctrl = new AbortController();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`/api/audit/meta?table=${encodeURIComponent(t)}&ids=${ids.join(',')}`, { signal: ctrl.signal, headers })
      .then(r => r.ok ? r.json() : r.text().then(tx => Promise.reject(new Error(tx))))
      .then(obj => setAuditMeta(obj || {}))
      .catch(() => {})
      .finally(() => {});
    return () => ctrl.abort();
  }, [currentTab, startIndex, endIndex, sortedBons.length, token, showAuditCols]);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuBonId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Add table mouse events for column resizing
  useEffect(() => {
    const table = document.querySelector('.responsive-table') as HTMLTableElement;
    if (table) {
      table.addEventListener('mousemove', onMouseMove);
      table.addEventListener('mousedown', onMouseDown);
      return () => {
        table.removeEventListener('mousemove', onMouseMove);
        table.removeEventListener('mousedown', onMouseDown);
      };
    }
  }, [onMouseMove, onMouseDown]);

  // Réinitialiser la page quand on change d'onglet ou de recherche
  useEffect(() => {
    setCurrentPage(1);
  }, [currentTab, searchTerm]);

  // Tabs configuration
  const tabs = useMemo(() => ([
    { key: 'Commande', label: 'Bon de Commande' },
    { key: 'Sortie', label: 'Bon de Sortie' },
    { key: 'Comptant', label: 'Bon Comptant' },
    { key: 'Vehicule', label: 'Bon Véhicule' },
    { key: 'Avoir', label: 'Avoir Client' },
    { key: 'AvoirComptant', label: 'Avoir Comptant' },
    { key: 'AvoirFournisseur', label: 'Avoir Fournisseur' },
    { key: 'Ecommerce', label: 'Bon Ecommerce' },
    { key: 'Devis', label: 'Devis' }
  ]), []);

  // Fonction pour ouvrir le modal de création d'un nouveau bon
  const handleAddNew = () => {
    setSelectedBon(null);
    setIsCreateModalOpen(true);
  };

  const handleDelete = async (bonToDelete: any) => {
      if (isEmployee) {
        showError("Permission refusée: l'employé ne peut pas supprimer un bon.");
        return;
      }
      const result = await showConfirmation(
        'Cette action est irréversible.',
        'Êtes-vous sûr de vouloir supprimer ce bon ?',
        'Oui, supprimer',
        'Annuler'
      );
      
      if (result.isConfirmed) {
        try {
      await deleteBonMutation({ id: bonToDelete.id, type: bonToDelete.type || currentTab }).unwrap();
          showSuccess('Bon supprimé avec succès');
          // Rafraîchir les produits pour mettre à jour les quantités immédiatement
          try { refetchProducts(); } catch {}
        } catch (error: any) {
          console.error('Erreur lors de la suppression:', error);
          showError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
        }
      }
    };
  
  // Marquer un bon comme Avoir: Sortie/Comptant -> Avoir Client, Commande -> Avoir Fournisseur
  // (Fonction mark-as-avoir retirée si non utilisée)
    

  // (cancel avoir handled via handleChangeStatus and permissions)
    // Remettre un avoir en attente depuis validé
    const handleAvoirBackToWaiting = async (bon: any) => {
      try {
        if (!currentUser?.id) {
          showError('Utilisateur non authentifié');
          return;
        }
        await updateBonStatus({ id: bon.id, statut: 'En attente', type: bon.type }).unwrap();
        showSuccess('Avoir remis en attente');
      } catch (error: any) {
        console.error('Erreur lors de la mise à jour:', error);
        showError(`Erreur: ${error.message || 'Erreur inconnue'}`);
      }
    };
    
    // Fonction pour gérer la duplication AWATEF
    const handleDuplicateAwatef = async () => {
      if (!selectedBonForDuplicate) return;
      
      try {
        // Helper pour convertir les dates au format MySQL
        const formatDateForMySQL = (dateString: string | null | undefined): string => {
          if (!dateString) {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
          }
          try {
            const date = new Date(dateString);
            return date.toISOString().slice(0, 19).replace('T', ' ');
          } catch {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
          }
        };

        // Créer le nouveau bon selon le type sélectionné
        let newBonData: any = {
          date_creation: formatDateForMySQL(selectedBonForDuplicate.date_creation),
          created_at: formatDateForMySQL(selectedBonForDuplicate.created_at),
          vehicule_id: selectedBonForDuplicate.vehicule_id || undefined,
          lieu_chargement: selectedBonForDuplicate.lieu_chargement || selectedBonForDuplicate.lieu_charge || '',
          adresse_livraison: selectedBonForDuplicate.adresse_livraison || '',
          statut: 'En attente',
          montant_total: selectedBonForDuplicate.montant_total || 0,
          created_by: currentUser?.id || 1,
          items: selectedBonForDuplicate.items || []
        };

        const shouldMarkNotCalculated = (() => {
          if (duplicateType === 'comptant' || duplicateType === 'avoirComptant') {
            return isKhezinAwatifName(comptantClientName);
          }
          // client/fournisseur selection by id
          if (selectedContactForDuplicate) {
            const list = duplicateType === 'fournisseur' || duplicateType === 'avoirFournisseur' ? suppliers : clients;
            const match = (list as any[]).find((c: any) => String(c?.id) === String(selectedContactForDuplicate));
            const name = match?.nom_complet || match?.nom || match?.name;
            return isKhezinAwatifName(name);
          }
          return false;
        })();

        // Traiter les articles selon le type de duplication
        const sourceItems = parseItemsSafe(selectedBonForDuplicate.items);
        let itemsToDuplicate = sourceItems;
        
        if (!isDuplicationComplete && selectedArticlesForDuplicate.length > 0) {
          // Duplication par articles sélectionnés
          itemsToDuplicate = sourceItems.filter((_, index) => selectedArticlesForDuplicate.includes(index));
        }
        
        if (duplicateType === 'fournisseur') {
          // Dupliquer vers Commande en utilisant le PRIX D'ACHAT (cout_revient/prix_achat) comme prix_unitaire
          newBonData.type = 'Commande';
          newBonData.fournisseur_id = parseInt(selectedContactForDuplicate);

          const mapped = itemsToDuplicate.map((it: any) => {
            const q = Number(it.quantite ?? it.qty ?? 0) || 0;
            // Prix d'achat / coût de revient depuis l'item ou le produit
            const purchaseUnit = resolveCost(it);
            const total = Number(purchaseUnit) * q;
            return {
              product_id: it.product_id || it.produit_id || it.id,
              quantite: q,
              prix_unitaire: Number(purchaseUnit) || 0,
              remise_pourcentage: 0,
              remise_montant: 0,
              total,
            };
          }).filter((it: any) => it.product_id && it.quantite > 0);

          const newTotal = mapped.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0);
          newBonData.items = mapped;
          newBonData.montant_total = newTotal;
        } else if (duplicateType === 'client') {
          newBonData.type = 'Sortie';
          newBonData.client_id = parseInt(selectedContactForDuplicate);
          newBonData.items = itemsToDuplicate;
          
          // Recalculer le montant total si duplication partielle
          if (!isDuplicationComplete) {
            const newTotal = itemsToDuplicate.reduce((sum: number, it: any) => {
              const q = Number(it.quantite ?? it.qty ?? 0) || 0;
              const price = Number(it.prix_unitaire ?? 0) || 0;
              return sum + (q * price);
            }, 0);
            newBonData.montant_total = newTotal;
          }
        } else if (duplicateType === 'comptant') {
          newBonData.type = 'Comptant';
          newBonData.client_nom = comptantClientName;
          newBonData.items = itemsToDuplicate;
          
          // Recalculer le montant total si duplication partielle
          if (!isDuplicationComplete) {
            const newTotal = itemsToDuplicate.reduce((sum: number, it: any) => {
              const q = Number(it.quantite ?? it.qty ?? 0) || 0;
              const price = Number(it.prix_unitaire ?? 0) || 0;
              return sum + (q * price);
            }, 0);
            newBonData.montant_total = newTotal;
          }
        } else if (duplicateType === 'avoirClient') {
          newBonData.type = 'Avoir';
          newBonData.client_id = parseInt(selectedContactForDuplicate);
          newBonData.items = itemsToDuplicate;
          
          // Recalculer le montant total si duplication partielle
          if (!isDuplicationComplete) {
            const newTotal = itemsToDuplicate.reduce((sum: number, it: any) => {
              const q = Number(it.quantite ?? it.qty ?? 0) || 0;
              const price = Number(it.prix_unitaire ?? 0) || 0;
              return sum + (q * price);
            }, 0);
            newBonData.montant_total = newTotal;
          }
        } else if (duplicateType === 'avoirFournisseur') {
          newBonData.type = 'AvoirFournisseur';
          newBonData.fournisseur_id = parseInt(selectedContactForDuplicate);
          newBonData.items = itemsToDuplicate;
          
          // Recalculer le montant total si duplication partielle
          if (!isDuplicationComplete) {
            const newTotal = itemsToDuplicate.reduce((sum: number, it: any) => {
              const q = Number(it.quantite ?? it.qty ?? 0) || 0;
              const price = Number(it.prix_unitaire ?? 0) || 0;
              return sum + (q * price);
            }, 0);
            newBonData.montant_total = newTotal;
          }
        } else if (duplicateType === 'avoirComptant') {
          newBonData.type = 'AvoirComptant';
          newBonData.client_nom = comptantClientName;
          newBonData.items = itemsToDuplicate;
          
          // Recalculer le montant total si duplication partielle
          if (!isDuplicationComplete) {
            const newTotal = itemsToDuplicate.reduce((sum: number, it: any) => {
              const q = Number(it.quantite ?? it.qty ?? 0) || 0;
              const price = Number(it.prix_unitaire ?? 0) || 0;
              return sum + (q * price);
            }, 0);
            newBonData.montant_total = newTotal;
          }
        }

        if (shouldMarkNotCalculated) {
          newBonData.isNotCalculated = true;
        }
        
        // Créer le bon directement via l'API
        const created = await createBon({ type: newBonData.type, ...newBonData }).unwrap();
        try {
          // Try to record duplication link (best-effort)
          const sourceType = selectedBonForDuplicate.type || currentTab;
          const targetType = newBonData.type;
          const sourceId = Number(selectedBonForDuplicate.id);
          const targetId = Number(created?.id || created?.data?.id);
          if (sourceId && targetId && sourceType && targetType) {
            if (createBonLink) {
              await createBonLink({
                relation_type: 'duplication',
                source_bon_type: sourceType,
                source_bon_id: sourceId,
                target_bon_type: targetType,
                target_bon_id: targetId,
              }).unwrap?.();
            }
          }
        } catch {
          // non-blocking
        }
        
        const dupTypeText = isDuplicationComplete ? 'complète' : 'partielle';
        showSuccess(`${newBonData.type} dupliqué avec succès (duplication ${dupTypeText}) !`);
        
        // Fermer la modal de duplication et réinitialiser les états
        setIsDuplicateModalOpen(false);
        setSelectedBonForDuplicate(null);
        setSelectedContactForDuplicate('');
        setComptantClientName('');
        setIsDuplicationComplete(true);
        setSelectedArticlesForDuplicate([]);
        
        // Changer l'onglet vers le bon type créé si nécessaire
        if (newBonData.type !== currentTab) {
          setCurrentTab(newBonData.type);
        }
        
      } catch (error: any) {
        console.error('Erreur lors de la duplication:', error);
        showError(`Erreur lors de la duplication: ${error?.data?.message || error.message || 'Erreur inconnue'}`);
      }
    };
    
    

  return (
      <div className="p-6">
        {/* Loading indicator */}
        {(bonsLoading || clientsLoading || suppliersLoading || productsLoading) && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">Chargement des données...</span>
          </div>
        )}
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Gestion des Bons</h1>
            {/* Badge de rôle pour débogage */}
            <div className="flex flex-col gap-1">
              {(() => {
                let roleCls = 'bg-blue-100 text-blue-800';
                if (currentUser?.role === 'PDG') roleCls = 'bg-red-100 text-red-800';
                else if (currentUser?.role === 'ManagerPlus') roleCls = 'bg-purple-100 text-purple-800';
                else if (currentUser?.role === 'Manager') roleCls = 'bg-orange-100 text-orange-800';
                return (
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${roleCls}`}>
                    Rôle: {currentUser?.role || 'Non défini'}
                  </span>
                );
              })()}
              <span className={`text-xs px-2 py-1 rounded ${
                canModifyBons(currentUser) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {canModifyBons(currentUser) ? '✅ Peut modifier les bons' : '❌ Lecture seule'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedBon(null);
                // Incrémenter la clé pour forcer un remontage du composant modal (nettoyage complet de l'état interne)
                setBonFormKey(k => k + 1);
                setIsCreateModalOpen(true);
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              <Plus size={20} />
              Nouveau {currentTab}
            </button>
            <button
              onClick={() => navigate('/inventaire')}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors"
              title="Enregistrer un inventaire (ne modifie pas le stock)"
            >
              <Plus size={20} />
              Enregistrer inventaire
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCurrentTab(tab.key as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  currentTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        
  {/* Contenu standard */}
        {/* Barre de filtres et actions au-dessus du tableau */}
        <div className="bg-white rounded-lg shadow mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Bouton Ajouter */}
            <button
              onClick={handleAddNew}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus size={18} className="mr-2" />
              Ajouter {currentTab}
            </button>

            {/* Recherche */}
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Rechercher par numéro, statut, client, téléphone ou montant..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>

            {/* Filtre Statut */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap" htmlFor="statusFilter">Statut:</label>
              <select
                multiple
                value={statusFilter}
                onChange={(e) => setStatusFilter(Array.from(e.target.selectedOptions).map(o => o.value))}
                className="px-2 py-1 border border-gray-300 rounded-md h-20 text-sm min-w-[120px]"
                id="statusFilter"
              >
                {['En attente','Validé','Refusé','Annulé'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex flex-col gap-1">
                <button type="button" className="px-2 py-0.5 bg-gray-100 rounded text-xs hover:bg-gray-200" onClick={() => setStatusFilter([])}>Tous</button>
                <button type="button" className="px-2 py-0.5 bg-gray-100 rounded text-xs hover:bg-gray-200" onClick={() => setStatusFilter(['En attente','Validé','Refusé','Annulé'])}>Tout</button>
              </div>
            </div>

            {/* Checkbox WhatsApp automatique */}
            {SHOW_WHATSAPP_BUTTON && (
              <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md bg-green-50">
                <input
                  type="checkbox"
                  id="autoSendWhatsApp"
                  checked={autoSendWhatsApp}
                  onChange={(e) => setAutoSendWhatsApp(e.target.checked)}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <label htmlFor="autoSendWhatsApp" className="text-xs text-gray-700 cursor-pointer whitespace-nowrap">
                  📱 WhatsApp auto
                </label>
              </div>
            )}

            {/* Pagination compacte */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-600 whitespace-nowrap">
                {startIndex + 1}-{Math.min(endIndex, totalItems)} / {totalItems}
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-300 rounded px-2 py-1 text-xs"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

  {/* Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="responsive-table-container">
            <table
              className="responsive-table responsive-table-min divide-y divide-gray-200 table-mobile-compact"
              style={{ minWidth: 960, tableLayout: 'fixed', width: 'auto' }}
            >
              {/* colgroup driven by colWidths so headers/cols can be resized */}
              <colgroup>
                {colWidths.map((w, idx) => (
                  <col key={idx} style={{ width: w }} />
                ))}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 relative"
                    onClick={() => handleSort('numero')}
                  >
                    <div className="flex items-center gap-1">
                      Numéro
                      {sortField === 'numero' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 0)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 relative"
                    onClick={() => handleSort('date')}
                  >
                    <div className="flex items-center gap-1">
                      Date création
                      {sortField === 'date' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 1)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 relative"
                    onClick={() => handleSort('contact')}
                  >
                    <div className="flex items-center gap-1">
                      {(() => {
                        if (currentTab === 'Vehicule') return 'Véhicule';
                        if (currentTab === 'AvoirFournisseur' || currentTab === 'Commande') return 'Fournisseur';
                        return 'Client';
                      })()}
                      {sortField === 'contact' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 2)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  {/* Téléphone (nouvelle colonne) */}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Téléphone
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 3)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  {/* Adresse livraison index décalé */}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Adresse livraison
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 4)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 relative"
                    onClick={() => handleSort('montant')}
                  >
                    <div className="flex items-center gap-1">
                      Montant
                      {sortField === 'montant' && (
                        sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 5)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Poids (kg)
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 6)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Mouvement
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, 7)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  {showAuditCols && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                        Créé par
                        <span 
                          className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                          onMouseDown={(e) => startResize(e, 8)}
                          title="Glisser pour redimensionner"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                        Dernier modifié par
                        <span 
                          className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                          onMouseDown={(e) => startResize(e, 9)}
                          title="Glisser pour redimensionner"
                        />
                      </th>
                    </>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Lié
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, showAuditCols ? 10 : 8)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Statut
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, showAuditCols ? 11 : 9)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Actions
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, showAuditCols ? 12 : 10)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedBons.length === 0 ? (
                  <tr>
                    <td colSpan={showAuditCols ? 13 : 11} className="px-6 py-4 text-center text-sm text-gray-500">
                      Aucun bon trouvé pour {currentTab}
                    </td>
                  </tr>
                ) : (
                  paginatedBons.map((bon) => (
                    <tr
                      key={bon.id}
                      className={`hover:bg-gray-50 transition-colors ${bon.statut === 'Validé' ? 'bg-green-100 border-l-4 border-green-500/70 shadow-[inset_0_0_0_9999px_rgba(34,197,94,0.08)]' : ''}`}
                    >
                      <td className="px-4 py-2 text-sm">{getDisplayNumero(bon)}</td>
                      <td className="px-4 py-2 text-sm">
                        <div className="text-sm text-gray-700">{formatDateTimeWithHour(bon.date_creation)}</div>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {currentTab === 'Vehicule' ? (
                          (bon?.livraisons && Array.isArray(bon.livraisons) && bon.livraisons.length > 0) ? (
                            <div className="space-y-1">
                              {(bon.livraisons || []).map((l: any, idx: number) => {
                                const li = l as any;
                                const bAny = bon as any;
                                const vehName = li.vehicule_nom || li.vehicule || li.vehicle || bAny.vehicule_nom || '-';
                                const immat = li.immatriculation || li.immatric || bAny.immatriculation || '';
                                const chauffeur = li.user_nom || li.chauffeur || li.driver_name || '';
                                return (
                                  <div key={idx} className="flex flex-col">
                                    <div className="text-sm font-medium text-gray-800">{vehName}{immat ? ` • ${immat}` : ''}</div>
                                    {chauffeur ? <div className="text-xs text-gray-500">Chauffeur: {chauffeur}</div> : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <>{bon.vehicule_nom || '-'}</>
                          )
                        ) : (
                          currentTab === 'Ecommerce' || bon?.type === 'Ecommerce' ? (
                            <div className="flex flex-col">
                              <span className="text-sm text-gray-800">{getContactName(bon)}</span>
                              {(() => {
                                const bAny = bon as any;
                                const email = bAny?.customer_email || bAny?.email || bAny?.customerEmail;
                                return email ? (
                                  <span className="text-xs text-gray-500">{safeText(email)}</span>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                );
                              })()}
                            </div>
                          ) : (
                            getContactName(bon)
                          )
                        )}
                      </td>
                      {/* Téléphone cell */}
                      <td className="px-4 py-2 text-sm">
                        {(() => {
                          // Use resolved phone based on type (same logic as resolveBonPhone)
                          const phone = resolveBonPhone(bon);
                          return phone ? (
                            <span className="inline-flex items-center gap-1">
                              <span>{phone}</span>
                              {SHOW_WHATSAPP_BUTTON ? (
                                <button
                                  onClick={() => handleSendWhatsAppFromRow(bon)}
                                  className="text-emerald-600 hover:text-emerald-800"
                                  title="Envoyer WhatsApp"
                                >
                                  <Send size={14} />
                                </button>
                              ) : null}
                            </span>
                          ) : <span className="text-gray-400">-</span>;
                        })()}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {(() => {
                          const bAny = bon as any;
                          const addr = bAny?.adresse_livraison ?? bAny?.adresseLivraison ?? '-';
                          const isEcom = currentTab === 'Ecommerce' || bon?.type === 'Ecommerce';
                          const deliveryMethod = bAny?.delivery_method ?? bAny?.deliveryMethod;
                          const pickupId = bAny?.pickup_location_id ?? bAny?.pickupLocationId ?? bAny?.pickup_location?.id;
                          return (
                            <div className="flex flex-col">
                              <span className="text-sm text-gray-700">{safeText(addr)}</span>
                              {isEcom ? (
                                <span className="text-xs text-gray-500">
                                  {formatDeliveryMethod(deliveryMethod)}
                                  {pickupId ? ` • Pickup #${safeText(pickupId)}` : ''}
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm font-semibold text-gray-900">{computeMontantTotal(bon).toFixed(2)} DH</div>
                        <div className="text-xs text-gray-500">{bon.items?.length || 0} articles</div>
                        {(() => {
                          const isEcom = currentTab === 'Ecommerce' || bon?.type === 'Ecommerce';
                          if (!isEcom) return null;
                          const bAny = bon as any;
                          const pm = bAny?.payment_method ?? bAny?.paymentMethod;
                          const ps = bAny?.payment_status ?? bAny?.paymentStatus;
                          return (
                            <div className="text-xs text-gray-500">
                              <span className="font-medium">Paiement:</span> {formatPaymentMethod(pm)}
                              {ps ? ` • ${safeText(ps)}` : ''}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2 text-sm">{computeTotalPoids(bon).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm">
                        {(() => {
                          // Show mouvement only for sales/stock out types (Sortie, Comptant, Avoir, AvoirComptant)
                          const type = bon.type || currentTab;
                          if (!['Sortie','Comptant','Avoir','AvoirComptant'].includes(type)) return <span className="text-gray-400">-</span>;
                          // If bon is marked as non-calculated, do not compute mouvement
                          const bAny = bon as any;
                          const nonCalculated = bAny?.isNotCalculated === true || bAny?.isNotCalculated === 1 || bAny?.is_not_calculated === true || bAny?.is_not_calculated === 1;
                          if (nonCalculated) {
                            return <span className="text-gray-400">-</span>;
                          }
                          const { profit, marginPct } = computeMouvementDetail(bon);
                          let cls = 'text-gray-600';
                          if (profit > 0) cls = 'text-green-600';
                          else if (profit < 0) cls = 'text-red-600';
                          return (
                            <span className={`font-semibold ${cls}`}> 
                              {profit.toFixed(2)} DH{marginPct !== null && (
                                <span className="text-xs font-normal ml-1">({marginPct.toFixed(1)}%)</span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      {showAuditCols && (
                        <>
                          <td className="px-4 py-2 text-sm">
                            {(() => {
                              const meta = auditMeta[String(bon.id)];
                              return safeText(meta?.created_by_name);
                            })()}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {(() => {
                              const meta = auditMeta[String(bon.id)];
                              return safeText(meta?.updated_by_name);
                            })()}
                          </td>
                        </>
                      )}
                      {/* Linked info (placed after audit cols, before Statut) */}
                      <td className="px-4 py-2 text-xs text-gray-700">
                        {(() => {
                          const lk = bonLinksMap[String(bon.id)] || { outgoing: [], incoming: [] };
                          if ((!lk.incoming || lk.incoming.length === 0) && (!lk.outgoing || lk.outgoing.length === 0)) {
                            return <span className="text-gray-400">-</span>;
                          }
                          return (
                            <div className="space-y-1">
                              {lk.incoming?.map((r, idx) => (
                                <div key={`in-${idx}`} className="flex items-center gap-1">
                                  <span className="inline-block px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded">de</span>
                                  <span></span>
                                  <span className="text-gray-500">{r.from_type} {formatNumeroByType(r.from_type, r.from_id)}</span>
                                </div>
                              ))}
                              {lk.outgoing?.map((r, idx) => (
                                <div key={`out-${idx}`} className="flex items-center gap-1">
                                  <span className="inline-block px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded">vers</span>
                                  <span></span>
                                  <span className="text-gray-500">{r.to_type} {formatNumeroByType(r.to_type, r.to_id)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-2 px-2 py-1 text-xs font-semibold rounded-full ${getStatusClasses(bon.statut)}`}>
                          {getStatusIcon(bon.statut)}
                          {bon.statut || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-2 items-center relative">
                          {/* Always visible: Print thermal */}
                          <button
                            onClick={() => { 
                              setSelectedBonForPrint(bon); 
                              setIsThermalPrintModalOpen(true); 
                            }}
                            className="text-purple-600 hover:text-purple-800"
                            title="Imprimer (Thermique 5cm)"
                          >
                            <Printer size={ACTION_ICON_SIZE} />
                          </button>
                          
                          {/* Always visible: Print PDF */}
                          <button
                            onClick={() => { 
                              setSelectedBonForPDFPrint(bon); 
                              setIsPrintModalOpen(true); 
                            }}
                            className="text-green-600 hover:text-green-800"
                            title="Imprimer PDF (A4/A5)"
                          >
                            <Printer size={ACTION_ICON_SIZE} />
                          </button>

                          {/* WhatsApp: bouton visible dans la colonne Actions */}
                          {SHOW_WHATSAPP_BUTTON && (() => {
                            const toPhone = resolveBonPhone(bon);
                            const bonKey = bon?.id != null ? String(bon.id) : '__unknown__';
                            const isSending = sendingWhatsAppId === bonKey;
                            return (
                              <button
                                onClick={() => toPhone ? handleSendWhatsAppFromRow(bon) : undefined}
                                className={`inline-flex items-center text-emerald-600 hover:text-emerald-800 ${isSending ? 'opacity-60 cursor-not-allowed' : ''} ${!toPhone ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={!toPhone ? 'Numéro introuvable' : (isSending ? 'Envoi en cours...' : 'Envoyer WhatsApp')}
                                disabled={isSending || !toPhone}
                                aria-busy={isSending}
                              >
                                <Send size={ACTION_ICON_SIZE} />
                              </button>
                            );
                          })()}
                          
                          {/* Validation icon - visible for authorized users and non-validated bons */}
                          {(() => {
                            // Don't show validation icon if already validated/accepted
                            if (bon.statut === 'Validé' || bon.statut === 'Accepté') return null;
                            
                            // Show validation icon for:
                            // - PDG and ManagerPlus on all relevant tabs
                            // - Manager on Commande & AvoirFournisseur only
                            const canValidate = currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus' ||
                              (currentUser?.role === 'Manager' && (bon.type === 'Commande' || currentTab === 'Commande' || bon.type === 'AvoirFournisseur' || currentTab === 'AvoirFournisseur'));
                            
                            if (!canValidate) return null;
                            
                            // Show validation for different tab types
                            const showForCommande = (currentTab === 'Commande' || (currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus') && (currentTab === 'Sortie' || currentTab === 'Comptant'));
                            const showForAvoir = ((currentTab === 'AvoirFournisseur' && (isFullAccessManager || currentUser?.role === 'Manager')) || 
                              ((currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus') && (currentTab === 'Avoir' || currentTab === 'AvoirFournisseur' || currentTab === 'AvoirComptant')));
                            const showForDevis = currentTab === 'Devis' && (currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus');
                            
                            if (!showForCommande && !showForAvoir && !showForDevis) return null;
                            
                            const actionText = showForDevis ? 'Accepter' : 'Valider';
                            const statusToSet = showForDevis ? 'Accepté' : 'Validé';
                            
                            return (
                              <button
                                onClick={() => handleChangeStatus(bon, statusToSet)}
                                className="text-emerald-600 hover:text-emerald-800"
                                title={actionText}
                              >
                                <CheckCircle2 size={ACTION_ICON_SIZE} />
                              </button>
                            );
                          })()}
                          
                          {/* Edit icon - visible for authorized users and editable bons */}
                          {(() => {
                            // Block editing for validated bons (all users)
                            if (bon.statut === 'Validé') return null;
                            
                            // Don't show edit for cancelled bons
                            if (bon.statut === 'Annulé') return null;
                            
                            return canModifyBons(currentUser) ? (
                              <button
                                onClick={() => {
                                  // Double-check validation status before opening modal
                                  if (bon.statut === 'Validé') {
                                    showError('Impossible de modifier un bon validé.');
                                    return;
                                  }
                                  setSelectedBon(bon);
                                  setIsCreateModalOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-800"
                                title="Modifier"
                              >
                                <Edit size={ACTION_ICON_SIZE} />
                              </button>
                            ) : null;
                          })()}
                          
                          {/* 3-dot menu for other actions */}
                          <div className="relative" ref={openMenuBonId === String(bon.id) ? menuRef : null}>
                            <button
                              onClick={() => setOpenMenuBonId(openMenuBonId === String(bon.id) ? null : String(bon.id))}
                              className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-100"
                              title="Plus d'actions"
                            >
                              <MoreHorizontal size={ACTION_ICON_SIZE} />
                            </button>
                            
                            {/* Popup menu */}
                            {openMenuBonId === String(bon.id) && (
                              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 p-1">
                                <div className="flex flex-col gap-1">
                                  {/* Status-change actions - Secondary actions only (En attente/Annuler) */}
                                  {(() => {
                                    // Full privileged actions for:
                                    //  - PDG and ManagerPlus on all relevant tabs
                                    //  - Manager on Commande & AvoirFournisseur (align backend)
                                    if (currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus' || (currentUser?.role === 'Manager' && (bon.type === 'Commande' || currentTab === 'Commande' || bon.type === 'AvoirFournisseur' || currentTab === 'AvoirFournisseur'))) {
                                      return (
                                        <>
                                          {(currentTab === 'Commande' || (currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus') && (currentTab === 'Sortie' || currentTab === 'Comptant')) && (
                                            <div className="flex gap-1">
                                              {/* Show "En attente" only if not already "En attente" */}
                                              {bon.statut !== 'En attente' && (
                                                <button 
                                                  onClick={() => { handleChangeStatus(bon, 'En attente'); setOpenMenuBonId(null); }}
                                                  className="p-2 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-800 rounded"
                                                  title="Mettre En attente"
                                                >
                                                  <Clock size={16} />
                                                </button>
                                              )}
                                              {/* Show "Annuler" only if not already "Annulé" or "Validé" */}
                                              {bon.statut !== 'Annulé' && bon.statut !== 'Validé' && (
                                                <button 
                                                  onClick={() => { handleChangeStatus(bon, 'Annulé'); setOpenMenuBonId(null); }}
                                                  className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                                  title="Annuler"
                                                >
                                                  <XCircle size={16} />
                                                </button>
                                              )}
                                            </div>
                                          )}
                                          {( (currentTab === 'AvoirFournisseur' && (isFullAccessManager || currentUser?.role === 'Manager')) || ((currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus') && (currentTab === 'Avoir' || currentTab === 'AvoirFournisseur' || currentTab === 'AvoirComptant')) ) && (
                                            <div className="flex gap-1">
                                              {/* Show "En attente" only if not already "En attente" */}
                                              {bon.statut !== 'En attente' && (
                                                <button 
                                                  onClick={() => { handleChangeStatus(bon, 'En attente'); setOpenMenuBonId(null); }}
                                                  className="p-2 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-800 rounded"
                                                  title="Mettre en attente"
                                                >
                                                  <Clock size={16} />
                                                </button>
                                              )}
                                              {/* Show "Annuler" only if not already "Annulé" or "Validé" */}
                                              {bon.statut !== 'Annulé' && bon.statut !== 'Validé' && (
                                                <button 
                                                  onClick={() => { handleChangeStatus(bon, 'Annulé'); setOpenMenuBonId(null); }}
                                                  className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                                  title="Annuler l'avoir"
                                                >
                                                  <XCircle size={16} />
                                                </button>
                                              )}
                                            </div>
                                          )}
                                          {currentTab === 'Devis' && currentUser?.role === 'PDG' && (
                                            <div className="flex gap-1">
                                              {/* Show "En attente" only if not already "En attente" */}
                                              {bon.statut !== 'En attente' && (
                                                <button 
                                                  onClick={() => { handleChangeStatus(bon, 'En attente'); setOpenMenuBonId(null); }}
                                                  className="p-2 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-800 rounded"
                                                  title="Mettre En attente"
                                                >
                                                  <Clock size={16} />
                                                </button>
                                              )}
                                              {/* Show "Annuler" only if not already "Annulé" or "Validé" */}
                                              {bon.statut !== 'Annulé' && bon.statut !== 'Validé' && (
                                                <button 
                                                  onClick={() => { handleChangeStatus(bon, 'Annulé'); setOpenMenuBonId(null); }}
                                                  className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                                  title="Annuler le devis"
                                                >
                                                  <XCircle size={16} />
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </>
                                      );
                                    }
                                    if (isEmployee) {
                                      return (
                                        <>
                                          {(currentTab === 'Commande' || currentTab === 'Sortie' || currentTab === 'Comptant' || currentTab === 'Devis') && bon.statut !== 'Validé' && (
                                            <div className="flex gap-1">
                                              <button 
                                                onClick={() => { handleChangeStatus(bon, 'En attente'); setOpenMenuBonId(null); }}
                                                className="p-2 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-800 rounded"
                                                title="Mettre En attente"
                                              >
                                                <Clock size={16} />
                                              </button>
                                              <button 
                                                onClick={() => { handleChangeStatus(bon, 'Annulé'); setOpenMenuBonId(null); }}
                                                className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                                title="Annuler"
                                              >
                                                <XCircle size={16} />
                                              </button>
                                            </div>
                                          )}
                                          {(currentTab === 'Avoir' || currentTab === 'AvoirFournisseur' || currentTab === 'AvoirComptant') && bon.statut !== 'Validé' && (
                                            <div className="flex gap-1">
                                              <button 
                                                onClick={() => { handleChangeStatus(bon, 'En attente'); setOpenMenuBonId(null); }}
                                                className="p-2 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-800 rounded"
                                                title="Remettre En attente"
                                              >
                                                <Clock size={16} />
                                              </button>
                                              <button 
                                                onClick={() => { handleChangeStatus(bon, 'Annulé'); setOpenMenuBonId(null); }}
                                                className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                                title="Annuler l'avoir"
                                              >
                                                <XCircle size={16} />
                                              </button>
                                            </div>
                                          )}
                                        </>
                                      );
                                    }
                                    // Managers (other tabs) limited: can only Annuler if not already cancelled or validated
                                    if (isManager && bon.statut !== 'Annulé' && bon.statut !== 'Validé') {
                                      return (
                                        <button 
                                          onClick={() => { handleChangeStatus(bon, 'Annulé'); setOpenMenuBonId(null); }}
                                          className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                          title="Annuler"
                                        >
                                          <XCircle size={16} />
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}
                                  
                                  {/* Other actions */}
                                  <div className="flex gap-1">
                                    {/* Audit history */}
                                    {(currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus' || (currentUser?.role === 'Manager' && (bon.type === 'Commande' || currentTab === 'Commande' || bon.type === 'AvoirFournisseur' || currentTab === 'AvoirFournisseur'))) && (
                                      <button
                                        onClick={() => {
                                          const t = tableForType(bon.type || currentTab);
                                          if (t) navigate(`/audit?mode=group&t=${encodeURIComponent(t)}&id=${encodeURIComponent(String(bon.id))}&details=1`);
                                          setOpenMenuBonId(null);
                                        }}
                                        className="p-2 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 rounded"
                                        title="Voir l'historique d'audit"
                                      >
                                        <Clock size={16} />
                                      </button>
                                    )}
                                    
                                    {/* View */}
                                    {currentUser?.role !== 'Employé' && (
                                      <button
                                        onClick={() => { setSelectedBon(bon); setIsViewModalOpen(true); setOpenMenuBonId(null); }}
                                        className="p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-800 rounded"
                                        title="Voir"
                                      >
                                        <Eye size={16} />
                                      </button>
                                    )}
                                    
                                    {/* Duplicate - Only for non-cancelled bons */}
                                    {((currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus') || (currentUser?.role === 'Manager' && (bon.type === 'Commande' || currentTab === 'Commande' || bon.type === 'AvoirFournisseur' || currentTab === 'AvoirFournisseur'))) && bon.statut !== 'Annulé' && (
                                      <button
                                        onClick={() => {
                                          setSelectedBonForDuplicate(bon);
                                          setIsDuplicateModalOpen(true);
                                          setOpenMenuBonId(null);
                                        }}
                                        className="p-2 text-pink-600 hover:bg-pink-50 hover:text-pink-800 rounded"
                                        title="Dupliquer AWATEF"
                                      >
                                        <Copy size={16} />
                                      </button>
                                    )}
                                    
                                    {/* Delete - Only PDG and only for non-validated bons */}
                                    {currentUser?.role === 'PDG' && bon.statut !== 'Validé' && bon.statut !== 'Accepté' && (
                                      <button
                                        onClick={() => { handleDelete(bon); setOpenMenuBonId(null); }}
                                        className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                        title="Supprimer"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
  

        {/* Navigation de pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex justify-center items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Précédent
            </button>
            
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 border rounded-md ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Suivant
            </button>
          </div>
        )}

        {/* Modal de création/édition */}
        <BonFormModal
          key={bonFormKey}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          currentTab={currentTab}
          initialValues={selectedBon || undefined}
          onBonAdded={(newBon) => {
            // Le bon est automatiquement ajouté au store Redux
            const labelTab = String(currentTab);
            showSuccess(`${labelTab} ${getDisplayNumero(newBon)} ${selectedBon ? 'mis à jour' : 'créé'} avec succès!`);
            setIsCreateModalOpen(false);
            setSelectedBon(null);
          }}
        />

        {/* Modal de visualisation */}
        {isViewModalOpen && selectedBon && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Détails du Bon {getDisplayNumero(selectedBon)}</h2>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              {currentUser?.role === 'PDG' && (
                <div className="mb-3">
                  <button
                    onClick={() => {
                      const t = tableForType(selectedBon.type || currentTab);
                      if (t) navigate(`/audit?mode=group&t=${encodeURIComponent(t)}&id=${encodeURIComponent(String(selectedBon.id))}&details=1`);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Clock size={16} /> Voir l'historique d'audit
                  </button>
                </div>
              )}
              
              {selectedBon && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Numéro:</p>
                      <p className="text-lg">{getDisplayNumero(selectedBon)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Type:</p>
                      <p className="text-lg">{selectedBon.type}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Date de création:</p>
                      <p className="text-lg">{formatDateSpecial(selectedBon.date_creation)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Statut:</p>
                        <span className={`inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold rounded-full ${getStatusClasses(selectedBon.statut)}`}>
                        {getStatusIcon(selectedBon.statut)}
                        {selectedBon.statut}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Contact:</p>
                      <p className="text-lg">{getContactName(selectedBon)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Montant total:</p>
                      <p className="text-lg font-bold text-blue-600">{computeMontantTotal(selectedBon).toFixed(2)} DH</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Poids total:</p>
                      <p className="text-lg font-bold text-amber-600">{computeTotalPoids(selectedBon).toFixed(2)} kg</p>
                    </div>
                  </div>

                  <div className="border rounded-md p-4">
                    <h3 className="font-bold mb-3">Produits</h3>
                    <div className="responsive-table-container">
                      <table
                        className="responsive-table responsive-table-min divide-y divide-gray-200 table-mobile-compact"
                        style={{ minWidth: 600 }}
                      >
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qté</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Kg/U</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Poids</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">PU</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedBon.items.map((item: any) => {
                            const pid = item.product_id ?? item.produit_id;
                            const product = products.find((p: any) => String(p.id) === String(pid));
                            const designation = item.designation || item.designation_custom || product?.designation || 'Produit';
                            const q = Number(item.quantite ?? item.qty ?? 0) || 0;
                            const rawKgCandidate = item.kg ?? item.kg_value;
                            let kgUnit: number;
                            if (rawKgCandidate === undefined || rawKgCandidate === null || rawKgCandidate === '') {
                              // fallback uniquement si totalement absent
                              const prodKg = product?.kg;
                              kgUnit = (prodKg === undefined || prodKg === null) ? 0 : Number(prodKg) || 0;
                            } else {
                              kgUnit = Number(rawKgCandidate) || 0; // si 0 => reste 0
                            }
                            const poids = kgUnit * q;
                            return (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-700">{designation}</td>
                                <td className="px-4 py-2 text-sm text-right">{q}</td>
                                <td className="px-4 py-2 text-sm text-right">{kgUnit.toFixed(2)}</td>
                                <td className="px-4 py-2 text-sm text-right font-medium">{poids.toFixed(2)}</td>
                                <td className="px-4 py-2 text-sm text-right">{Number(item.prix_unitaire || 0).toFixed(2)} DH</td>
                                <td className="px-4 py-2 text-sm text-right font-semibold">{Number(item.montant_ligne || item.total || 0).toFixed(2)} DH</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end text-base font-semibold mt-2">
                      Total poids: {computeTotalPoids(selectedBon).toFixed(2)} kg | Total montant: {computeMontantTotal(selectedBon).toFixed(2)} DH
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setIsViewModalOpen(false)}
                      className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Fermer
                    </button>
                    {selectedBon.statut === 'Brouillon' && (
                      <>
                        <button
                          onClick={() => {
                            showSuccess('Bon validé');
                            setIsViewModalOpen(false);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                        >
                          Valider
                        </button>
                        <button
                          onClick={() => {
                            showSuccess('Bon annulé');
                            setIsViewModalOpen(false);
                          }}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
                        >
                          Annuler
                        </button>
                      </>
                    )}
                    {selectedBon.statut === 'Validé' && (
                      <>
                        {(selectedBon.type !== 'Avoir' && selectedBon.type !== 'AvoirFournisseur') && !isEmployee && (
                          <button
                            onClick={() => {
                              showSuccess('Bon marqué comme livré');
                              setIsViewModalOpen(false);
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                          >
                            Marquer comme livré
                          </button>
                        )}
                        {(selectedBon.type === 'Avoir' || selectedBon.type === 'AvoirFournisseur') && !isEmployee && (
                          <>
                            {/* Do not show cancel on validated bon; only allow putting back to waiting */}
                            <button
                              onClick={() => {
                                handleAvoirBackToWaiting(selectedBon);
                                setIsViewModalOpen(false);
                              }}
                              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md"
                            >
                              Remettre en attente
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal pour nouveau client */}
        <ContactFormModal
          isOpen={isNewClientModalOpen}
          onClose={() => setIsNewClientModalOpen(false)}
          contactType="Client"
          onContactAdded={() => {
            showSuccess('Client créé avec succès!');
          }}
        />

        {/* Modal pour nouveau fournisseur */}
        <ContactFormModal
          isOpen={isNewSupplierModalOpen}
          onClose={() => setIsNewSupplierModalOpen(false)}
          contactType="Fournisseur"
          onContactAdded={() => {
            showSuccess('Fournisseur créé avec succès!');
          }}
        />

        {/* Modal pour nouveau véhicule */}
        {isNewVehicleModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Nouveau Véhicule</h3>
              <Formik
                initialValues={{
                  immatriculation: '',
                  marque: '',
                  modele: '',
                  type_vehicule: ''
                }}
                onSubmit={(values) => {
                  // Simulation de création de véhicule
                  console.log('Nouveau véhicule:', values);
                  showSuccess(`Véhicule ${values.immatriculation} créé avec succès!`);
                  setIsNewVehicleModalOpen(false);
                }}
              >
                <Form className="space-y-4">
                  <div>
                    <label htmlFor="veh-immatriculation" className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                    <Field
                      id="veh-immatriculation"
                      name="immatriculation"
                      type="text"
                      placeholder="Ex: 12-A-3456"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="veh-marque" className="block text-sm font-medium text-gray-700 mb-1">Marque</label>
                    <Field
                      id="veh-marque"
                      name="marque"
                      type="text"
                      placeholder="Ex: Mercedes, Renault, Peugeot"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="veh-modele" className="block text-sm font-medium text-gray-700 mb-1">Modèle</label>
                    <Field
                      id="veh-modele"
                      name="modele"
                      type="text"
                      placeholder="Ex: Actros, Master, Boxer"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="veh-type" className="block text-sm font-medium text-gray-700 mb-1">Type de véhicule</label>
                    <Field
                      id="veh-type"
                      name="type_vehicule"
                      as="select"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sélectionner un type</option>
                      <option value="Camion">Camion</option>
                      <option value="Fourgon">Fourgon</option>
                      <option value="Utilitaire">Utilitaire</option>
                      <option value="Tracteur">Tracteur</option>
                    </Field>
                  </div>
                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsNewVehicleModalOpen(false)}
                      className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Créer Véhicule
                    </button>
                  </div>
                </Form>
              </Formik>
            </div>
          </div>
        )}

        {/* Modal pour créer un avoir */}
        <AvoirFormModal
          isOpen={isCreateAvoirModalOpen}
          onClose={() => {
            setIsCreateAvoirModalOpen(false);
            setSelectedBonForAvoir(null);
          }}
          bonOrigine={selectedBonForAvoir}
          onAvoirCreated={() => {
            showSuccess('Avoir fournisseur créé avec succès');
            setIsCreateAvoirModalOpen(false);
            setSelectedBonForAvoir(null);
            setCurrentTab('AvoirFournisseur');
          }}
        />

        {/* Modal pour créer un avoir client */}
        <AvoirFormModal
          isOpen={isCreateAvoirClientModalOpen}
          onClose={() => {
            setIsCreateAvoirClientModalOpen(false);
            setSelectedBonForAvoirClient(null);
          }}
          bonOrigine={selectedBonForAvoirClient}
          onAvoirCreated={() => {
            showSuccess('Avoir client créé avec succès');
            setIsCreateAvoirClientModalOpen(false);
            setSelectedBonForAvoirClient(null);
            setCurrentTab('Avoir');
          }}
        />

        {/* Modal Impression Thermique */}
        <ThermalPrintModal
          isOpen={isThermalPrintModalOpen}
          onClose={() => {
            setIsThermalPrintModalOpen(false);
            setSelectedBonForPrint(null);
          }}
          bon={selectedBonForPrint}
          type={(currentTab === 'Avoir' || currentTab === 'AvoirComptant') ? 'AvoirClient' : currentTab}
          products={products}
          contact={(() => {
            const b = selectedBonForPrint;
            if (!b) return null;
            // Devis: always a client; prefer client_id, fallback to contact_id, then client_nom
            if (currentTab === 'Devis') {
              const id = b.client_id ?? b.contact_id;
              const found = clients.find((c) => String(c.id) === String(id)) || null;
              if (!found && b.client_nom) {
                // Build a minimal contact-like object for display with client_nom
                return { nom_complet: b.client_nom } as any;
              }
              return found;
            }
            // Commande & AvoirFournisseur: suppliers; prefer fournisseur_id, fallback to contact_id
            if (currentTab === 'Commande' || currentTab === 'AvoirFournisseur') {
              const id = b.fournisseur_id ?? b.contact_id;
              return suppliers.find((s) => String(s.id) === String(id)) || null;
            }
            // Sortie / Comptant / Avoir (client): prefer client_id, fallback to contact_id
            const clientId = b.client_id ?? b.contact_id;
            const found = clients.find((c) => String(c.id) === String(clientId)) || null;
            if (!found && ((currentTab === 'Comptant' || b.type === 'Comptant' || currentTab === 'AvoirComptant' || b.type === 'AvoirComptant') && b.client_nom)) {
              // Build a minimal contact-like object for display
              return { nom_complet: b.client_nom } as any;
            }
            return found;
          })()}
          items={selectedBonForPrint?.items || []}
        />

        {/* Modal Transformation Devis */}
  <DevisTransformModal 
          isOpen={isDevisTransformModalOpen}
          onClose={() => {
            setIsDevisTransformModalOpen(false);
            setSelectedDevisToTransform(null);
          }}
          devis={selectedDevisToTransform}
          onTransformComplete={() => {
            // Rafraîchir les données ou effectuer d'autres actions après la transformation
          }}
        />

        {/* Modal Nouveau Produit */}
        <ProductFormModal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          onProductAdded={(newProduct) => {
            // Le produit est automatiquement ajouté au store Redux
            console.log('Nouveau produit ajouté:', newProduct);
            setIsProductModalOpen(false);
            showSuccess('Produit ajouté avec succès !');
          }}
        />

        {/* Modal Impression PDF */}
        <BonPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => {
            setIsPrintModalOpen(false);
            setSelectedBonForPDFPrint(null);
          }}
          bon={selectedBonForPDFPrint}
          products={products}
          client={(() => {
            if (!selectedBonForPDFPrint) return undefined;
            const bon = selectedBonForPDFPrint;
            const found = clients.find(c => c.id === bon.client_id);
            if (!found && ((bon.type === 'Comptant' || currentTab === 'Comptant' || bon.type === 'AvoirComptant' || currentTab === 'AvoirComptant' || bon.type === 'Devis' || currentTab === 'Devis') && bon.client_nom)) {
              return { id: 0, nom_complet: bon.client_nom, type: 'Client', solde: 0, created_at: '', updated_at: '' } as any;
            }
            return found;
          })()}
          fournisseur={(() => {
            if (!selectedBonForPDFPrint) return undefined;
            return suppliers.find(s => s.id === selectedBonForPDFPrint.fournisseur_id || s.id === selectedBonForPDFPrint.contact_id);
          })()}
        />

        {/* Modal de duplication AWATEF */}
        {isDuplicateModalOpen && selectedBonForDuplicate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Dupliquer le bon {getDisplayNumero(selectedBonForDuplicate)}</h2>
                <button
                  onClick={() => {
                    setIsDuplicateModalOpen(false);
                    setSelectedBonForDuplicate(null);
                    setSelectedContactForDuplicate('');
                    setComptantClientName('');
                    setIsDuplicationComplete(true);
                    setSelectedArticlesForDuplicate([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-2">
                      Dupliquer vers quel type de bon ?
                    </legend>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="client"
                          checked={duplicateType === 'client'}
                          onChange={(e) => setDuplicateType(e.target.value as 'client')}
                          className="mr-2"
                        />
                        <span>Bon de Sortie (Client)</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="fournisseur"
                          checked={duplicateType === 'fournisseur'}
                          onChange={(e) => setDuplicateType(e.target.value as 'fournisseur')}
                          className="mr-2"
                        />
                        <span>Bon de Commande (Fournisseur)</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="comptant"
                          checked={duplicateType === 'comptant'}
                          onChange={(e) => setDuplicateType(e.target.value as 'comptant')}
                          className="mr-2"
                        />
                        <span>Bon Comptant</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="avoirClient"
                          checked={duplicateType === 'avoirClient'}
                          onChange={(e) => setDuplicateType(e.target.value as 'avoirClient')}
                          className="mr-2"
                        />
                        <span>Avoir Client</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="avoirFournisseur"
                          checked={duplicateType === 'avoirFournisseur'}
                          onChange={(e) => setDuplicateType(e.target.value as 'avoirFournisseur')}
                          className="mr-2"
                        />
                        <span>Avoir Fournisseur</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="duplicateType"
                          value="avoirComptant"
                          checked={duplicateType === 'avoirComptant'}
                          onChange={(e) => setDuplicateType(e.target.value as 'avoirComptant')}
                          className="mr-2"
                        />
                        <span>Avoir Comptant</span>
                      </label>
                    </div>
                  </fieldset>
                </div>

                <div>
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-2">Mode de duplication :</legend>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isDuplicationComplete}
                          onChange={(e) => {
                            setIsDuplicationComplete(e.target.checked);
                            if (e.target.checked) {
                              setSelectedArticlesForDuplicate([]);
                            }
                          }}
                          className="mr-2"
                        />
                        <span>Duplication complète (tous les articles)</span>
                      </label>
                      {!isDuplicationComplete && (
                        <div className="mt-3 p-3 bg-gray-50 rounded border">
                          <p className="text-sm text-gray-700 mb-2">Sélectionner les articles à dupliquer :</p>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {parseItemsSafe(selectedBonForDuplicate?.items || []).map((item: any, index: number) => {
                              const productName = products.find(p => String(p.id) === String(item.product_id || item.produit_id))?.designation || `Article ${index + 1}`;
                              return (
                                <label key={index} className="flex items-center text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedArticlesForDuplicate.includes(index)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedArticlesForDuplicate(prev => [...prev, index]);
                                      } else {
                                        setSelectedArticlesForDuplicate(prev => prev.filter(i => i !== index));
                                      }
                                    }}
                                    className="mr-2"
                                  />
                                  <span>
                                    {productName} - Qté: {item.quantite || item.qty || 0} - 
                                    Prix: {Number(item.prix_unitaire || 0).toFixed(2)} €
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          {selectedArticlesForDuplicate.length === 0 && (
                            <p className="text-sm text-red-600 mt-2">Veuillez sélectionner au moins un article à dupliquer.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </fieldset>
                </div>

                {(duplicateType === 'client' || duplicateType === 'avoirClient') && (
                  <div>
                    <label htmlFor="client-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Sélectionner un client
                    </label>
                    <SearchableSelect
                      id="client-select"
                      options={clients.map((client: any) => {
                        const reference = client.reference ? `(${client.reference})` : '';
                        return {
                          value: client.id.toString(),
                          label: `${client.nom_complet} ${reference}`,
                          data: client,
                        };
                      })}
                      value={selectedContactForDuplicate}
                      onChange={(value) => setSelectedContactForDuplicate(value)}
                      placeholder="Rechercher un client..."
                      className="w-full"
                    />
                  </div>
                )}

                {(duplicateType === 'fournisseur' || duplicateType === 'avoirFournisseur') && (
                  <div>
                    <label htmlFor="fournisseur-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Sélectionner un fournisseur
                    </label>
                    <SearchableSelect
                      id="fournisseur-select"
                      options={suppliers.map((supplier: any) => {
                        const reference = supplier.reference ? `(${supplier.reference})` : '';
                        return {
                          value: supplier.id.toString(),
                          label: `${supplier.nom_complet} ${reference}`,
                          data: supplier,
                        };
                      })}
                      value={selectedContactForDuplicate}
                      onChange={(value) => setSelectedContactForDuplicate(value)}
                      placeholder="Rechercher un fournisseur..."
                      className="w-full"
                    />
                  </div>
                )}

                {(duplicateType === 'comptant' || duplicateType === 'avoirComptant') && (
                  <div>
                    <label htmlFor="client-name-input" className="block text-sm font-medium text-gray-700 mb-2">
                      Nom du client
                    </label>
                    <input
                      id="client-name-input"
                      type="text"
                      value={comptantClientName}
                      onChange={(e) => setComptantClientName(e.target.value)}
                      placeholder="Entrer le nom du client..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setIsDuplicateModalOpen(false);
                      setSelectedBonForDuplicate(null);
                      setSelectedContactForDuplicate('');
                      setComptantClientName('');
                      setIsDuplicationComplete(true);
                      setSelectedArticlesForDuplicate([]);
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDuplicateAwatef}
                    disabled={
                      !selectedBonForDuplicate ||
                      ((duplicateType === 'client' || duplicateType === 'avoirClient') && !selectedContactForDuplicate) ||
                      ((duplicateType === 'fournisseur' || duplicateType === 'avoirFournisseur') && !selectedContactForDuplicate) ||
                      ((duplicateType === 'comptant' || duplicateType === 'avoirComptant') && !comptantClientName.trim()) ||
                      (!isDuplicationComplete && selectedArticlesForDuplicate.length === 0)
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Dupliquer {!isDuplicationComplete ? `(${selectedArticlesForDuplicate.length} article${selectedArticlesForDuplicate.length > 1 ? 's' : ''})` : ''}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  export default BonsPage;
  function getStatusClasses(statut?: string) {
    switch (statut) {
      case 'Brouillon':
        return 'bg-gray-200 text-gray-700';
      case 'Validé':
      case 'Accepté':
      case 'Livré':
        return 'bg-green-200 text-green-700';
      case 'En attente':
      case 'Envoyé':
        return 'bg-blue-200 text-blue-700';
      case 'Avoir':
        return 'bg-purple-200 text-purple-700';
      case 'Annulé':
      case 'Refusé':
      case 'Expiré':
        return 'bg-red-200 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }
  function getStatusIcon(statut?: string) {
    const s = String(statut || '').toLowerCase();
    if (s.includes('en attente') || s === 'attente') return <Clock size={14} />;
    if (s.includes('valid')) return <CheckCircle2 size={14} />;
    if (s.includes('refus')) return <XCircle size={14} />;
    if (s.includes('annul')) return <XCircle size={14} />;
    return null;
  }