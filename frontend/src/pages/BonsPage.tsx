import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
  import { Plus, Search, Trash2, Edit, Eye, CheckCircle2, Clock, XCircle, Printer, Copy, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Send, Package, Truck, RotateCcw } from 'lucide-react';
import { createPortal } from 'react-dom';
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
    useUpdateEcommerceOrderStatusMutation,
    useUpdateEcommerceOrderRemisesMutation,
    useCreateBonMutation
  } from '../store/api/bonsApi';
  import { 
    useGetAllClientsQuery, 
  useGetAllFournisseursQuery
  } from '../store/api/contactsApi';
  import { useGetProductsQuery, useGetProductsWithSnapshotsQuery } from '../store/api/productsApi';
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
  const [currentTab, setCurrentTab] = useState<'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirComptant' | 'AvoirFournisseur' | 'AvoirEcommerce' | 'Devis' | 'Vehicule' | 'Ecommerce'>('Commande');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedBon, setSelectedBon] = useState<any>(null);

  const [isEcommerceRemiseModalOpen, setIsEcommerceRemiseModalOpen] = useState(false);
  const [selectedEcommerceForRemise, setSelectedEcommerceForRemise] = useState<any>(null);
  const [ecommerceRemiseDraftItems, setEcommerceRemiseDraftItems] = useState<Array<any>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  // Nouveau filtre: si coché, ne montrer que les bons partiellement payés (reste > 0)
  const [showPartialOnly, setShowPartialOnly] = useState(false);
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
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null);
  const [pendingOpenAvoirEcommercePicker, setPendingOpenAvoirEcommercePicker] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  // Sorting
  const [sortField, setSortField] = useState<'numero' | 'date' | 'contact' | 'montant' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Auth context
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const isPdg = currentUser?.role === 'PDG';
  const isEmployee = currentUser?.role === 'Employé';
  const isChefChauffeur = currentUser?.role === 'ChefChauffeur';
  // Manager full access only for Commande & AvoirFournisseur
  const isFullAccessManager = currentUser?.role === 'Manager' && (currentTab === 'Commande' || currentTab === 'AvoirFournisseur');
  const isManager = currentUser?.role === 'Manager';
  // Employé ID 26: accès complet sur le tab Commande (créer, modifier, changer statut)
  const isEmployee26CommandeOverride = isEmployee && currentUser?.id === 26 && currentTab === 'Commande';
  // ManagerPlus role value (not needed here currently)
  
  // Feature flag: show WhatsApp button only for PDG and Manager+
  const SHOW_WHATSAPP_BUTTON = currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus';

  // Lock body scroll when any modal is open so only modal content scrolls
  const anyModalOpen = isCreateModalOpen || isViewModalOpen || isEcommerceRemiseModalOpen ||
    isNewClientModalOpen || isNewSupplierModalOpen || isNewVehicleModalOpen ||
    isCreateAvoirModalOpen || isCreateAvoirClientModalOpen || isProductModalOpen ||
    isDevisTransformModalOpen || isThermalPrintModalOpen || isPrintModalOpen || isDuplicateModalOpen;
  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [anyModalOpen]);

  // UI restrictions:
  // - Ecommerce + AvoirEcommerce: allowed for PDG and ChefChauffeur
  // - Devis: not allowed for ChefChauffeur
  useEffect(() => {
    const canSeeEcommerce = isPdg || isChefChauffeur;
    if (!canSeeEcommerce && (currentTab === 'Ecommerce' || currentTab === 'AvoirEcommerce')) {
      setCurrentTab('Commande');
      return;
    }
    // ChefChauffeur: hide Commande tab
    if (isChefChauffeur && currentTab === 'Commande') {
      setCurrentTab('Sortie');
      return;
    }
    if (isChefChauffeur && currentTab === 'Devis') {
      setCurrentTab('Sortie');
    }
  }, [isPdg, isChefChauffeur, currentTab]);

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
  const { data: clients = [], isLoading: clientsLoading } = useGetAllClientsQuery();
  const { data: suppliers = [], isLoading: suppliersLoading } = useGetAllFournisseursQuery();
  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useGetProductsQuery();
  // Snapshot-expanded products (with historic prix_achat/cout_revient per bon de commande)
  const { data: snapshotProducts = [] } = useGetProductsWithSnapshotsQuery();
  const [deleteBonMutation] = useDeleteBonMutation();
  const [updateBonStatus] = useUpdateBonStatusMutation();
  const [updateEcommerceOrderStatus] = useUpdateEcommerceOrderStatusMutation();
  const [updateEcommerceOrderRemises, { isLoading: isSavingEcommerceRemises }] = useUpdateEcommerceOrderRemisesMutation();
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
      'AvoirEcommerce': 'AVE',
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
    base.push('180','120','140','120'); // lié, statut, payment_status, actions
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
  const tabsNavRef = useRef<HTMLElement>(null);

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
      // ChefChauffeur: lecture seule avec exception: peut uniquement Annuler / Mettre en attente
      // (utile pour ajuster le stock via Annulation sur Comptant/Sortie)
      if (isChefChauffeur) {
        if (bon.statut === 'Validé') {
          showError('Permission refusée: Chef Chauffeur ne peut pas modifier un bon déjà validé.');
          return;
        }
        if (!['Annulé', 'En attente'].includes(statut)) {
          showError('Permission refusée: Chef Chauffeur peut uniquement mettre En attente ou Annuler.');
          return;
        }
      }

      // Employé: uniquement Annuler ou En attente, mais pas sur les bons déjà validés
      // Exception: employé ID 26 a accès complet sur Commande
      if (isEmployee && !isEmployee26CommandeOverride) {
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

  const getEcommerceStatusValue = (bon: any): string => {
    const raw = (bon as any)?.ecommerce_status ?? bon?.statut ?? bon?.status;
    return String(raw || '').trim().toLowerCase();
  };

  const round2 = (v: any): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  };

  const openEcommerceRemiseEditor = (bon: any) => {
    const raw = (bon as any)?.ecommerce_raw ?? bon;
    const rawItems: any[] = Array.isArray(raw?.items) ? raw.items : [];
    const draft = rawItems.map((it: any) => {
      const subtotal = Number(it.subtotal ?? it.montant_ligne ?? 0) || 0;
      const remise_amount = Number(it.remise_amount ?? 0) || 0;
      const remise_percent_applied = Number(it.remise_percent_applied ?? (subtotal > 0 ? (remise_amount / subtotal) * 100 : 0)) || 0;
      const labelParts = [it.product_name, it.variant_name, it.unit_name].filter((v: any) => v != null && String(v).trim() !== '');
      return {
        order_item_id: Number(it.id ?? it.order_item_id),
        label: labelParts.length ? labelParts.join(' • ') : (it.product_name || 'Article'),
        quantity: Number(it.quantity ?? it.quantite ?? 0) || 0,
        unit_price: Number(it.unit_price ?? it.prix_unitaire ?? 0) || 0,
        subtotal: subtotal,
        remise_percent_applied: round2(remise_percent_applied),
        remise_amount: round2(remise_amount),
      };
    }).filter((it: any) => Number.isFinite(it.order_item_id));

    setSelectedEcommerceForRemise(bon);
    setEcommerceRemiseDraftItems(draft);
    setIsEcommerceRemiseModalOpen(true);
  };

  const canChangeEcommerceStatus = isPdg;

  const handleChangeEcommerceStatus = async (
    bon: any,
    status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
  ) => {
    try {
      if (!canChangeEcommerceStatus) {
        showError('Permission refusée: vous ne pouvez pas changer le statut e-commerce.');
        return;
      }
      await updateEcommerceOrderStatus({ id: bon.id, status }).unwrap();
      showSuccess(`Statut e-commerce mis à jour: ${status}`);
    } catch (error: any) {
      console.error('Erreur mise à jour statut e-commerce:', error);
      const httpStatus = error?.status;
      const msg = error?.data?.message || error?.message || 'Erreur inconnue';
      if (httpStatus === 401) {
        showError('Session expirée. Veuillez vous reconnecter.');
        dispatch(logout());
      } else {
        showError(`Erreur lors du changement de statut: ${msg}`);
      }
    }
  };

  const handleChangeEcommercePaymentStatus = async (
    bon: any,
    payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  ) => {
    try {
      if (!canChangeEcommerceStatus) {
        showError('Permission refusée: vous ne pouvez pas changer le payment status e-commerce.');
        return;
      }
      await updateEcommerceOrderStatus({ id: bon.id, payment_status }).unwrap();
      showSuccess(`Payment status e-commerce mis à jour: ${payment_status}`);
    } catch (error: any) {
      console.error('Erreur mise à jour payment status e-commerce:', error);
      const httpStatus = error?.status;
      const msg = error?.data?.message || error?.message || 'Erreur inconnue';
      if (httpStatus === 401) {
        showError('Session expirée. Veuillez vous reconnecter.');
        dispatch(logout());
      } else {
        showError(`Erreur lors du changement de payment status: ${msg}`);
      }
    }
  };
  // Hooks retirés pour éviter les warnings tant que la migration RTK n'est pas terminée

  // ...

  // Helper to get contact name (client or fournisseur) used by filtering/render
  const getContactName = (bon: any) => {
    const ecommerceRaw = bon?.ecommerce_raw ?? bon;

    const ecommerceUserId = ecommerceRaw?.user_id != null && ecommerceRaw?.user_id !== '' ? Number(ecommerceRaw.user_id) : null;
    const ecommerceContactFromUserId =
      ecommerceUserId != null && Number.isFinite(ecommerceUserId)
        ? (clients || []).find((c: any) => Number(c?.id) === ecommerceUserId)
        : null;

    // Prefer contact lookup by user_id for e-commerce bons when available
    if ((bon?.type === 'Ecommerce' || currentTab === 'Ecommerce' || bon?.type === 'AvoirEcommerce' || currentTab === 'AvoirEcommerce') && ecommerceContactFromUserId?.nom_complet) {
      return String(ecommerceContactFromUserId.nom_complet);
    }

    const ecommerceContactName =
      ecommerceRaw?.contact_nom_complet ||
      ecommerceRaw?.contact_name ||
      [ecommerceRaw?.contact_prenom, ecommerceRaw?.contact_nom]
        .filter((v: any) => v != null && String(v).trim() !== '')
        .join(' ')
        .trim() ||
      null;

    if ((bon?.type === 'Ecommerce' || currentTab === 'Ecommerce' || bon?.type === 'AvoirEcommerce' || currentTab === 'AvoirEcommerce') && ecommerceContactName) {
      return String(ecommerceContactName);
    }

    // Comptant et Devis: if client_nom is present (free text), prefer it
    const freeClientName = bon?.client_nom ?? bon?.customer_name;
    if (
      (bon?.type === 'Comptant' || bon?.type === 'AvoirComptant' || currentTab === 'Comptant' || currentTab === 'AvoirComptant' ||
       bon?.type === 'Devis' || currentTab === 'Devis' ||
       bon?.type === 'Ecommerce' || currentTab === 'Ecommerce' ||
       bon?.type === 'AvoirEcommerce' || currentTab === 'AvoirEcommerce') &&
      freeClientName
    ) {
      return String(freeClientName);
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
  // FORMULE: profit = Σ ( (prix_unitaire - adjustedCost) * quantite )
  // adjustedCost = (variant.cout_revient || variant.prix_achat || item.cout_revient || item.prix_achat || product.cout_revient || product.prix_achat) × conversion_factor
  // margin% = profit / Σ( adjustedCost * quantite ) * 100
  const parseItemsSafe = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
  };

  const resolveCostWithVariantUnit = (it: any): number => {
    const pid = it.product_id || it.produit_id;
    const prod = pid ? (products as any[]).find((p) => String(p.id) === String(pid)) : null;

    const toNum = (v: any): number => {
      if (v == null || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };

    // 1) Snapshot-level cost (priorité absolue: données historiques gelées)
    let baseCost = 0;
    let usedItemLevel = false;
    if (it.product_snapshot_id && (snapshotProducts as any[])?.length) {
      const snap = (snapshotProducts as any[]).find((p: any) => String(p.snapshot_id) === String(it.product_snapshot_id));
      if (snap) {
        baseCost = toNum((snap as any).cout_revient) || toNum((snap as any).prix_achat);
      }
    }

    // 2) Variant-level cost
    if (!baseCost && it.variant_id && prod?.variants) {
      const v = (prod.variants as any[]).find((vr: any) => String(vr.id) === String(it.variant_id));
      if (v) {
        baseCost = toNum((v as any).cout_revient) || toNum((v as any).prix_achat);
      }
    }

    // 3) Item-level cost (snapshot / historique) avec toutes les clés possibles
    if (!baseCost) {
      const itemCostCandidates = [
        it.cout_revient,
        it.cout_rev,
        it.cout,
        it.prix_achat,
        it.pa,
        it.prixA,
        it.product?.cout_revient,
        it.produit?.cout_revient,
        it.product?.prix_achat,
        it.produit?.prix_achat,
      ];
      for (const c of itemCostCandidates) {
        const n = toNum(c);
        if (n > 0) {
          baseCost = n;
          usedItemLevel = true;
          break;
        }
      }
    }

    // 4) Product-level cost
    if (!baseCost && prod) {
      const pAny: any = prod;
      baseCost =
        toNum(pAny.cout_revient) ||
        toNum(pAny.cr) ||
        toNum(pAny.cout) ||
        toNum(pAny.prix_achat);
    }

    if (!baseCost) return 0;

    // 5) Facteur de conversion unité : uniquement si on a utilisé un coût base snapshot/variant/produit
    let convFactor = 1;
    if (!usedItemLevel && it.unit_id && prod?.units) {
      const u = (prod.units as any[]).find((un: any) => String(un.id) === String(it.unit_id));
      if (u) {
        const f = toNum((u as any).conversion_factor);
        if (f > 0) convFactor = f;
      }
    }

    return baseCost * convFactor;
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
      const cost = resolveCostWithVariantUnit(it);
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

      const matchesPartial = !showPartialOnly || (currentTab === 'Comptant' && Number(bon.reste) > 0);

      return matchesSearch && matchesStatus && matchesPartial;
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
      case 'AvoirEcommerce': return 'avoirs_ecommerce';
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
    // Priorité: customer_phone / phone si présent (e-commerce)
    if ((bon as any)?.customer_phone) return String((bon as any).customer_phone);
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
      if (!openMenuBonId) return;
      const target = event.target as Node;
      if (menuAnchorEl && menuAnchorEl.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
        setOpenMenuBonId(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuBonId, menuAnchorEl]);

  // Keep dropdown position synced (scroll/resize)
  useEffect(() => {
    if (!openMenuBonId || !menuAnchorEl) return;

    const update = () => {
      const rect = menuAnchorEl.getBoundingClientRect();
      // Position to the bottom-right of the anchor; the menu itself will translateX(-100%)
      setMenuPosition({ top: rect.bottom + 6, left: rect.right });
    };

    update();
    const onMove = () => update();
    window.addEventListener('resize', onMove);
    // capture=true so it reacts to scroll on any container
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [openMenuBonId, menuAnchorEl]);

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

  // Réinitialiser la page quand on change d'onglet ou de recherche, et reset le filtre partiel
  useEffect(() => {
    setCurrentPage(1);
    if (currentTab !== 'Comptant') {
      setShowPartialOnly(false);
    }
  }, [currentTab, searchTerm]);

  // Tabs configuration
  const tabs = useMemo(() => {
    const base = [
      { key: 'Commande', label: 'Bon de Commande' },
      { key: 'Sortie', label: 'Bon de Sortie' },
      { key: 'Comptant', label: 'Bon Comptant' },
      { key: 'Vehicule', label: 'Bon Véhicule' },
      { key: 'Avoir', label: 'Avoir Client' },
      { key: 'AvoirComptant', label: 'Avoir Comptant' },
      { key: 'AvoirFournisseur', label: 'Avoir Fournisseur' },
      { key: 'AvoirEcommerce', label: 'Avoir Ecommerce' },
      { key: 'Ecommerce', label: 'Bon Ecommerce' },
      { key: 'Devis', label: 'Devis' }
    ];

    // ChefChauffeur: allow ecommerce tabs, but no Devis, and hide Commande
    if (isChefChauffeur) {
      return base.filter((t) => t.key !== 'Devis' && t.key !== 'Commande');
    }

    // Non-PDG: hide ecommerce tabs
    if (!isPdg) {
      return base.filter((t) => t.key !== 'Ecommerce' && t.key !== 'AvoirEcommerce');
    }

    return base;
  }, [isPdg, isChefChauffeur]);

  const toMySQLDateTime = (d: Date = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');

  const openBlankAvoirEcommerceModal = useCallback(() => {
    if (!isPdg) {
      showError('Permission refusée: seul le PDG peut créer un avoir e-commerce.');
      return;
    }

    setSelectedBon({
      type: 'AvoirEcommerce',
      ecommerce_order_id: '',
      order_number: '',
      client_nom: '',
      customer_email: '',
      phone: '',
      adresse_livraison: '',
      date_creation: toMySQLDateTime(new Date()),
      statut: 'En attente',
      items: [],
    });
    setBonFormKey((k) => k + 1);
    setIsCreateModalOpen(true);
  }, [isPdg, toMySQLDateTime]);

  const openAvoirEcommerceModalFromOrder = useCallback((bon: any) => {
    if (!bon?.id) {
      showError('Commande e-commerce invalide');
      return;
    }

    const items = Array.isArray(bon?.items) ? bon.items : [];
    if (items.length === 0) {
      showError('Cette commande ne contient aucun article');
      return;
    }

    const normalizedItems = items.map((it: any) => {
      const productId = it?.product_id ?? it?.produit_id ?? it?.produit?.id;
      const quantite = Number(it?.quantite ?? it?.quantity ?? 0);
      const prixUnitaire = Number(it?.prix_unitaire ?? it?.unit_price ?? it?.unitPrice ?? 0);
      const total = Number(it?.total ?? it?.montant_ligne ?? it?.subtotal ?? (quantite * prixUnitaire));
      const designation = it?.designation ?? it?.designation_custom ?? it?.produit?.designation ?? it?.produit?.name ?? '';
      const kg = Number(it?.kg ?? it?.kg_value ?? it?.produit?.kg ?? 0);
      return {
        product_id: productId != null ? String(productId) : '',
        product_reference: String(it?.product_reference ?? it?.reference ?? ''),
        designation,
        quantite,
        prix_unitaire: prixUnitaire,
        prix_achat: Number(it?.prix_achat ?? it?.pa ?? 0) || 0,
        cout_revient: Number(it?.cout_revient ?? it?.cr ?? it?.cout ?? 0) || 0,
        kg,
        total,
      };
    });

    setSelectedBon({
      type: 'AvoirEcommerce',
      ecommerce_order_id: bon.id,
      order_number: bon.numero || bon.order_number || null,
      client_nom: bon.client_nom || bon.customer_name || '',
      customer_email: bon.customer_email || bon.email || '',
      phone: bon.phone || bon.customer_phone || '',
      adresse_livraison: bon.adresse_livraison || '',
      date_creation: toMySQLDateTime(new Date()),
      statut: 'En attente',
      items: normalizedItems,
    });
    // Force remount to reset internal state when switching from edit/create
    setBonFormKey((k) => k + 1);
    setIsCreateModalOpen(true);
  }, [toMySQLDateTime]);

  const handleCreateEcommerceAvoir = async (bon: any) => {
    try {
      if (!currentUser?.id) {
        showError('Utilisateur non authentifié');
        return;
      }
      if (!bon?.id) {
        showError('Commande e-commerce invalide');
        return;
      }

      const result = await showConfirmation(
        'Créer un avoir e-commerce',
        `Créer un avoir pour la commande ${bon?.numero || bon?.order_number || bon?.id} ?`,
        'Créer',
        'Annuler'
      );
      if (!result.isConfirmed) return;

      // Open the same popup as other avoirs to let user select/edit products & quantities.
      openAvoirEcommerceModalFromOrder(bon);
    } catch (error: any) {
      console.error('Erreur création avoir ecommerce:', error);
      showError(`Erreur: ${error?.data?.message || error?.message || 'Erreur inconnue'}`);
    }
  };

  // Ajouter un avoir e-commerce à partir d'une commande e-commerce visible (sélection via popup)
  // (déclaré après handleCreateEcommerceAvoir pour éviter TDZ)
  const handleAddAvoirEcommerce = useCallback(async () => {
    try {
      if (!isPdg) {
        showError('Permission refusée: seul le PDG peut créer un avoir e-commerce.');
        return;
      }
      if (currentTab !== 'Ecommerce') {
        showError('Cette action est disponible uniquement dans l\'onglet Bon Ecommerce.');
        return;
      }
      if (!paginatedBons.length) {
        showError('Aucune commande e-commerce visible pour créer un avoir.');
        return;
      }

      const Swal = (await import('sweetalert2')).default;
      const inputOptions: Record<string, string> = {};

      for (const o of paginatedBons) {
        const id = o?.id;
        if (id == null) continue;
        const bAny = o as any;
        const numero = bAny?.numero || bAny?.order_number || id;
        const name = bAny?.client_nom || bAny?.customer_name || getContactName(o);
        const total = computeMontantTotal(o);
        inputOptions[String(id)] = `${numero} • ${name} • ${Number(total || 0).toFixed(2)} DH`;
      }

      const result = await Swal.fire({
        title: 'Créer un avoir e-commerce',
        text: 'Choisissez une commande e-commerce (liste actuelle) :',
        input: 'select',
        inputOptions,
        inputPlaceholder: 'Sélectionner une commande',
        showCancelButton: true,
        confirmButtonText: 'Créer',
        cancelButtonText: 'Annuler',
        heightAuto: false,
        customClass: { popup: 'swal2-show' },
      });
      if (!result.isConfirmed) return;

      const selectedId = String(result.value ?? '');
      const selectedOrder = paginatedBons.find((x) => String(x?.id) === selectedId);
      if (!selectedOrder) {
        showError('Commande e-commerce introuvable.');
        return;
      }

      openAvoirEcommerceModalFromOrder(selectedOrder);
    } catch (e: any) {
      console.error('Erreur création avoir e-commerce (bouton):', e);
      showError(e?.message || 'Erreur lors de la création de l\'avoir e-commerce');
    }
  }, [isPdg, currentTab, paginatedBons, getContactName, computeMontantTotal, openAvoirEcommerceModalFromOrder]);

  // If user clicks the button from AvoirEcommerce tab, we switch to Ecommerce then open the picker.
  useEffect(() => {
    if (!pendingOpenAvoirEcommercePicker) return;
    if (!isPdg) { setPendingOpenAvoirEcommercePicker(false); return; }
    if (currentTab !== 'Ecommerce') return;

    setPendingOpenAvoirEcommercePicker(false);
    // Fire and forget; errors are handled inside.
    void handleAddAvoirEcommerce();
  }, [pendingOpenAvoirEcommercePicker, currentTab, isPdg, handleAddAvoirEcommerce]);

  // Fonction pour ouvrir le modal de création d'un nouveau bon
  const handleAddNew = () => {
    if (isChefChauffeur) {
      showError("Permission refusée: Chef Chauffeur ne peut pas ajouter de bon/avoir/devis.");
      return;
    }
    setSelectedBon(null);
    // Forcer un remontage du modal pour repartir sur un état vierge
    setBonFormKey((k) => k + 1);
    setIsCreateModalOpen(true);
  };

  const handleDelete = async (bonToDelete: any) => {
      if (isEmployee && !isEmployee26CommandeOverride) {
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
            const purchaseUnit = resolveCostWithVariantUnit(it);
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
                canModifyBons(currentUser) || isChefChauffeur || isEmployee26CommandeOverride ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {canModifyBons(currentUser) || isEmployee26CommandeOverride
                  ? '✅ Peut modifier les bons'
                  : isChefChauffeur
                    ? '📝 Quantité/Statut seulement'
                    : '❌ Lecture seule'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isChefChauffeur && (
              <button
                onClick={handleAddNew}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                <Plus size={20} />
                Nouveau {currentTab}
              </button>
            )}
          </div>
        </div>

        {/* Tabs Slider */}
        <div className="border-b border-gray-200 mb-6 relative flex items-center">
          {/* Left Arrow */}
          <button
            type="button"
            onClick={() => {
              const el = tabsNavRef.current;
              if (el) el.scrollBy({ left: -150, behavior: 'smooth' });
            }}
            className="flex-shrink-0 p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors z-10"
            aria-label="Scroll tabs left"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Scrollable tabs container */}
          <nav
            ref={tabsNavRef}
            className="-mb-px flex space-x-2 overflow-x-auto scrollbar-hide scroll-smooth flex-1 px-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onWheel={(e) => {
              // Convert vertical mouse wheel to horizontal scroll
              if (tabsNavRef.current && e.deltaY !== 0) {
                e.preventDefault();
                tabsNavRef.current.scrollBy({ left: e.deltaY, behavior: 'smooth' });
              }
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCurrentTab(tab.key as any)}
                className={`py-2 px-3 border-b-2 font-medium text-sm whitespace-nowrap flex-shrink-0 transition-colors ${
                  currentTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right Arrow */}
          <button
            type="button"
            onClick={() => {
              const el = tabsNavRef.current;
              if (el) el.scrollBy({ left: 150, behavior: 'smooth' });
            }}
            className="flex-shrink-0 p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors z-10"
            aria-label="Scroll tabs right"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        
  {/* Contenu standard */}
        {/* Barre de filtres et actions au-dessus du tableau */}
        <div className="bg-white rounded-lg shadow mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {(currentTab === 'Ecommerce' || currentTab === 'AvoirEcommerce') && isPdg && (
              <button
                onClick={() => {
                  openBlankAvoirEcommerceModal();
                }}
                className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
                title="Créer un avoir e-commerce"
              >
                <RotateCcw size={18} className="mr-2" />
                Ajouter Avoir Ecommerce
              </button>
            )}

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

            {/* Checkbox Partiellement payés (Comptant uniquement) */}
            {currentTab === 'Comptant' && (
              <div className="flex items-center gap-2 px-3 py-2 border border-yellow-200 rounded-md bg-yellow-50">
                <input
                  type="checkbox"
                  id="showPartialOnly"
                  checked={showPartialOnly}
                  onChange={(e) => setShowPartialOnly(e.target.checked)}
                  className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                />
                <label htmlFor="showPartialOnly" className="text-sm font-medium text-gray-700 cursor-pointer whitespace-nowrap">
                  Reste à payer
                </label>
              </div>
            )}

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
                    Payment status
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, showAuditCols ? 12 : 10)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    Actions
                    <span 
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-400 bg-blue-200 opacity-30 hover:opacity-80 transition-opacity"
                      onMouseDown={(e) => startResize(e, showAuditCols ? 13 : 11)}
                      title="Glisser pour redimensionner"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedBons.length === 0 ? (
                  <tr>
                    <td colSpan={showAuditCols ? 14 : 12} className="px-6 py-4 text-center text-sm text-gray-500">
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
                          currentTab === 'Ecommerce' || currentTab === 'AvoirEcommerce' || bon?.type === 'Ecommerce' || bon?.type === 'AvoirEcommerce' ? (
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
                        {currentTab === 'Comptant' && (bon.reste > 0) && (
                          <div className="text-xs font-semibold text-orange-600 mt-1 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                            Reste: {Number(bon.reste).toFixed(2)} DH
                          </div>
                        )}
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
                          // Always use frontend snapshot-aware computation (backend mouvement_calc doesn't use snapshots)
                          const { profit, marginPct } = computeMouvementDetail(bon);
                          // Build debug tooltip showing per-item cost resolution
                          const debugItems = parseItemsSafe(bon?.items);
                          const debugLines = debugItems.map((it: any, idx: number) => {
                            const snapId = it.product_snapshot_id;
                            const cost = resolveCostWithVariantUnit(it);
                            const pv = Number(it.prix_unitaire ?? 0) || 0;
                            const q = Number(it.quantite ?? 0) || 0;
                            return `#${idx} ${(it.designation || '').slice(0,20)} | snap:${snapId||'-'} var:${it.variant_id||'-'} u:${it.unit_id||'-'} | PA/CR=${cost} PV=${pv} Q=${q} => ${((pv-cost)*q).toFixed(2)}`;
                          });
                          const debugTitle = debugLines.join('\n');
                          let cls = 'text-gray-600';
                          if (profit > 0) cls = 'text-green-600';
                          else if (profit < 0) cls = 'text-red-600';
                          return (
                            <span className={`font-semibold ${cls} cursor-help`} title={debugTitle}> 
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
                          const bAny = bon as any;
                          const extraIncoming: Array<{ from_type: string; from_id: any }> = [];
                          const type = bon?.type || currentTab;
                          if (type === 'AvoirEcommerce') {
                            const orderId = bAny?.ecommerce_order_id ?? bAny?.order_id;
                            if (orderId != null && orderId !== '') {
                              extraIncoming.push({ from_type: 'Ecommerce', from_id: orderId });
                            }
                          }

                          const lk = bonLinksMap[String(bon.id)] || { outgoing: [], incoming: [] };
                          if (
                            (!lk.incoming || lk.incoming.length === 0) &&
                            (!lk.outgoing || lk.outgoing.length === 0) &&
                            extraIncoming.length === 0
                          ) {
                            return <span className="text-gray-400">-</span>;
                          }
                          return (
                            <div className="space-y-1">
                              {extraIncoming.map((r, idx) => (
                                <div key={`x-in-${idx}`} className="flex items-center gap-1">
                                  <span className="inline-block px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded">de</span>
                                  <span></span>
                                  <span className="text-gray-500">{r.from_type} {formatNumeroByType(r.from_type, r.from_id)}</span>
                                </div>
                              ))}
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
                      <td className="px-4 py-2">
                        {(() => {
                          const isEcom = currentTab === 'Ecommerce' || bon?.type === 'Ecommerce';
                          if (!isEcom) return <span className="text-gray-400">-</span>;
                          const bAny = bon as any;
                          const currentPs = String(bAny?.payment_status ?? bAny?.paymentStatus ?? '').trim().toLowerCase() as any;
                          const value: 'pending' | 'paid' | 'failed' | 'refunded' =
                            (['pending', 'paid', 'failed', 'refunded'].includes(currentPs) ? currentPs : 'pending');
                          return (
                            <select
                              value={value}
                              onChange={(e) => handleChangeEcommercePaymentStatus(bon, e.target.value as any)}
                              disabled={!canChangeEcommerceStatus}
                              className="w-full max-w-[160px] text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-60"
                              title={!canChangeEcommerceStatus ? 'Permission refusée' : 'Changer payment status'}
                            >
                              <option value="pending">pending</option>
                              <option value="paid">paid</option>
                              <option value="failed">failed</option>
                              <option value="refunded">refunded</option>
                            </select>
                          );
                        })()}
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

                          {/* Ecommerce: always visible confirm icon (others in 3-dot menu) */}
                          {(() => {
                            const isEcom = currentTab === 'Ecommerce' || bon?.type === 'Ecommerce';
                            if (!isEcom || !canChangeEcommerceStatus) return null;
                            const s = getEcommerceStatusValue(bon);
                            if (s !== 'pending') return null;
                            return (
                              <button
                                onClick={() => handleChangeEcommerceStatus(bon, 'confirmed')}
                                className="text-emerald-600 hover:text-emerald-800"
                                title="Confirmer (E-commerce)"
                              >
                                <CheckCircle2 size={ACTION_ICON_SIZE} />
                              </button>
                            );
                          })()}

                          {/* Avoir e-commerce: always visible validate + back-to-pending */}
                          {(() => {
                            const isAvoirEcom = currentTab === 'AvoirEcommerce' || bon?.type === 'AvoirEcommerce';
                            if (!isAvoirEcom) return null;
                            // UI restriction already hides this tab for non-PDG, but keep it safe.
                            if (currentUser?.role !== 'PDG') return null;
                            if (bon.statut === 'Annulé') return null;

                            return (
                              <>
                                {bon.statut !== 'Validé' && (
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'Validé')}
                                    className="text-emerald-600 hover:text-emerald-800"
                                    title="Valider (Avoir e-commerce)"
                                  >
                                    <CheckCircle2 size={ACTION_ICON_SIZE} />
                                  </button>
                                )}
                                {bon.statut === 'Validé' && (
                                  <button
                                    onClick={() => handleChangeStatus(bon, 'En attente')}
                                    className="text-yellow-600 hover:text-yellow-800"
                                    title="Revenir en attente (Avoir e-commerce)"
                                  >
                                    <Clock size={ACTION_ICON_SIZE} />
                                  </button>
                                )}
                              </>
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
                            
                            const isEcom = currentTab === 'Ecommerce' || bon?.type === 'Ecommerce';
                            const canOpenEditModal = canModifyBons(currentUser) || isEmployee26CommandeOverride || (isChefChauffeur && !isEcom);
                            return canOpenEditModal ? (
                              <button
                                onClick={() => {
                                  // Double-check validation status before opening modal
                                  if (bon.statut === 'Validé') {
                                    showError('Impossible de modifier un bon validé.');
                                    return;
                                  }
                                  if (isEcom) {
                                    openEcommerceRemiseEditor(bon);
                                    return;
                                  }
                                  setSelectedBon(bon);
                                  setIsCreateModalOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-800"
                                title={isChefChauffeur ? 'Modifier (quantité seulement)' : 'Modifier'}
                              >
                                <Edit size={ACTION_ICON_SIZE} />
                              </button>
                            ) : null;
                          })()}
                          
                          {/* Eye icon - visible directly for non-PDG/non-ManagerPlus roles */}
                          {currentUser?.role !== 'PDG' && currentUser?.role !== 'ManagerPlus' && (
                            <button
                              onClick={() => { setSelectedBon(bon); setIsViewModalOpen(true); }}
                              className="text-gray-600 hover:text-gray-800"
                              title="Voir"
                            >
                              <Eye size={ACTION_ICON_SIZE} />
                            </button>
                          )}

                          {/* 3-dot menu for other actions */}
                          <div className="relative" ref={openMenuBonId === String(bon.id) ? menuRef : null}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = openMenuBonId === String(bon.id) ? null : String(bon.id);
                                setOpenMenuBonId(next);
                                if (next) {
                                  setMenuAnchorEl(e.currentTarget as HTMLElement);
                                } else {
                                  setMenuAnchorEl(null);
                                  setMenuPosition(null);
                                }
                              }}
                              className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-100"
                              title="Plus d'actions"
                            >
                              <MoreHorizontal size={ACTION_ICON_SIZE} />
                            </button>
                            
                            {/* Popup menu */}
                            {openMenuBonId === String(bon.id) && menuPosition && createPortal(
                              <>
                                {/* Backdrop to guarantee click-outside works even inside scroll containers */}
                                <div
                                  className="fixed inset-0 z-[10040]"
                                  onClick={() => { setOpenMenuBonId(null); setMenuAnchorEl(null); setMenuPosition(null); }}
                                />
                                {/* Fullscreen layer for absolute positioning */}
                                <div className="fixed inset-0 z-[10050] pointer-events-none">
                                  <div
                                    ref={menuRef}
                                    className="absolute pointer-events-auto bg-white border border-gray-200 rounded-md shadow-lg p-1"
                                    style={{ top: menuPosition.top, left: menuPosition.left, transform: 'translateX(-100%)' }}
                                  >
                                    <div className="flex flex-col gap-1">
                                  {/* Status-change actions */}
                                  {(() => {
                                    const isEcom = currentTab === 'Ecommerce' || bon?.type === 'Ecommerce';
                                    if (!isEcom || !canChangeEcommerceStatus) return null;
                                    const current = getEcommerceStatusValue(bon);
                                    const actions: Array<{ status: any; title: string; cls: string; Icon: any }> = [
                                      { status: 'pending', title: 'pending', cls: 'text-yellow-600 hover:bg-yellow-50 hover:text-yellow-800', Icon: Clock },
                                      { status: 'confirmed', title: 'confirmed', cls: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800', Icon: CheckCircle2 },
                                      { status: 'processing', title: 'processing', cls: 'text-blue-600 hover:bg-blue-50 hover:text-blue-800', Icon: Package },
                                      { status: 'shipped', title: 'shipped', cls: 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800', Icon: Truck },
                                      { status: 'delivered', title: 'delivered', cls: 'text-green-600 hover:bg-green-50 hover:text-green-800', Icon: CheckCircle2 },
                                      { status: 'cancelled', title: 'cancelled', cls: 'text-red-600 hover:bg-red-50 hover:text-red-800', Icon: XCircle },
                                      { status: 'refunded', title: 'refunded', cls: 'text-purple-600 hover:bg-purple-50 hover:text-purple-800', Icon: RotateCcw },
                                    ];
                                    return (
                                      <div className="flex gap-1">
                                        {actions.map(({ status, title, cls, Icon }) => {
                                          if (String(status) === current) return null;
                                          return (
                                            <button
                                              key={String(status)}
                                              onClick={() => {
                                                handleChangeEcommerceStatus(bon, status);
                                                setOpenMenuBonId(null);
                                              }}
                                              className={`p-2 rounded ${cls}`}
                                              title={`Changer statut: ${title}`}
                                            >
                                              <Icon size={16} />
                                            </button>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}

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
                                          {(
                                            (currentTab === 'AvoirFournisseur' && (isFullAccessManager || currentUser?.role === 'Manager')) ||
                                            ((currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus') && (currentTab === 'Avoir' || currentTab === 'AvoirFournisseur' || currentTab === 'AvoirComptant')) ||
                                            (currentUser?.role === 'PDG' && currentTab === 'AvoirEcommerce')
                                          ) && (
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
                                    if (isEmployee && !isEmployee26CommandeOverride) {
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
                                          {(currentTab === 'Avoir' || currentTab === 'AvoirFournisseur' || currentTab === 'AvoirComptant' || currentTab === 'AvoirEcommerce') && bon.statut !== 'Validé' && (
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

                                    // ChefChauffeur: secondary actions only (En attente / Annuler) on non-validé bons
                                    if (isChefChauffeur && bon.statut !== 'Validé') {
                                      const isDocTab = (
                                        currentTab === 'Commande' ||
                                        currentTab === 'Sortie' ||
                                        currentTab === 'Comptant' ||
                                        currentTab === 'Devis' ||
                                        currentTab === 'Avoir' ||
                                        currentTab === 'AvoirFournisseur' ||
                                        currentTab === 'AvoirComptant' ||
                                        currentTab === 'AvoirEcommerce' ||
                                        currentTab === 'Vehicule'
                                      );
                                      if (!isDocTab) return null;
                                      return (
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => { handleChangeStatus(bon, 'En attente'); setOpenMenuBonId(null); }}
                                            className="p-2 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-800 rounded"
                                            title="Mettre En attente"
                                          >
                                            <Clock size={16} />
                                          </button>
                                          {bon.statut !== 'Annulé' && (
                                            <button
                                              onClick={() => { handleChangeStatus(bon, 'Annulé'); setOpenMenuBonId(null); }}
                                              className="p-2 text-red-600 hover:bg-red-50 hover:text-red-800 rounded"
                                              title="Annuler"
                                            >
                                              <XCircle size={16} />
                                            </button>
                                          )}
                                        </div>
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

                                    {/* Ecommerce: create credit note */}
                                    {(currentTab === 'Ecommerce' || bon?.type === 'Ecommerce') && currentUser?.role === 'PDG' && (
                                      <button
                                        onClick={() => {
                                          handleCreateEcommerceAvoir(bon);
                                          setOpenMenuBonId(null);
                                        }}
                                        className="p-2 text-purple-600 hover:bg-purple-50 hover:text-purple-800 rounded"
                                        title="Créer un avoir e-commerce"
                                      >
                                        <RotateCcw size={16} />
                                      </button>
                                    )}
                                    
                                    {/* View - only in menu for PDG/ManagerPlus (others have it directly visible) */}
                                    {(currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus') && (
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
                              </div>
                          </>,
                          document.body
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
          currentTab={currentTab as any}
          initialValues={selectedBon || undefined}
          onBonAdded={(newBon) => {
            // Le bon est automatiquement ajouté au store Redux
            const labelTab = String(newBon?.type || currentTab);
            showSuccess(`${labelTab} ${getDisplayNumero(newBon)} ${selectedBon ? 'mis à jour' : 'créé'} avec succès!`);
            setIsCreateModalOpen(false);
            setSelectedBon(null);
            if (newBon?.type && newBon.type !== currentTab) {
              setCurrentTab(newBon.type);
            }
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

                  {(selectedBon?.type === 'Ecommerce' || currentTab === 'Ecommerce') && (() => {
                    const raw = (selectedBon as any)?.ecommerce_raw ?? selectedBon;
                    const uid = raw?.user_id != null && raw?.user_id !== '' ? Number(raw.user_id) : null;
                    const contactFromUserId =
                      uid != null && Number.isFinite(uid)
                        ? (clients || []).find((c: any) => Number(c?.id) === uid)
                        : null;
                    return (
                      <div className="space-y-4">
                        {/* Numéro commande & Client */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            Client & Commande
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">order_number</span>
                              <p className="font-semibold text-gray-900">{raw?.order_number || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">user_id</span>
                              <p className="font-semibold text-gray-900">{raw?.user_id ?? '-'}</p>
                            </div>
                            <div className="md:col-span-2">
                              <span className="text-gray-500">Client (table contacts)</span>
                              <p className="font-semibold text-gray-900">
                                {contactFromUserId?.nom_complet
                                  ? String(contactFromUserId.nom_complet)
                                  : (uid != null ? 'Contact introuvable' : '-')}
                              </p>
                              {(contactFromUserId?.telephone || contactFromUserId?.email || contactFromUserId?.reference) && (
                                <p className="text-xs text-gray-600 mt-1">
                                  {[
                                    contactFromUserId?.reference ? `Ref: ${String(contactFromUserId.reference)}` : null,
                                    contactFromUserId?.telephone ? `Tel: ${String(contactFromUserId.telephone)}` : null,
                                    contactFromUserId?.email ? `Email: ${String(contactFromUserId.email)}` : null,
                                  ].filter(Boolean).join(' • ')}
                                </p>
                              )}
                              {contactFromUserId?.solde_cumule != null && (
                                <p className="text-xs text-gray-600 mt-1">
                                  Solde cumulé: {Number(contactFromUserId.solde_cumule).toFixed(2)} DH
                                </p>
                              )}
                            </div>
                            <div>
                              <span className="text-gray-500">contact_nom_complet</span>
                              <p className="font-semibold text-gray-900">{raw?.contact_nom_complet || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">customer_name</span>
                              <p className="font-semibold text-gray-900">{raw?.customer_name || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">customer_email</span>
                              <p className="font-semibold text-gray-900 break-all">{raw?.customer_email || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">customer_phone</span>
                              <p className="font-semibold text-gray-900">{raw?.customer_phone || '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Adresse de livraison */}
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-green-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Truck size={14} />
                            Adresse de livraison
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="col-span-2">
                              <span className="text-gray-500">shipping_address_line1</span>
                              <p className="font-semibold text-gray-900">{raw?.shipping_address_line1 || '-'}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-500">shipping_address_line2</span>
                              <p className="font-semibold text-gray-900">{raw?.shipping_address_line2 || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">shipping_city</span>
                              <p className="font-semibold text-gray-900">{raw?.shipping_city || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">shipping_state</span>
                              <p className="font-semibold text-gray-900">{raw?.shipping_state || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">shipping_postal_code</span>
                              <p className="font-semibold text-gray-900">{raw?.shipping_postal_code || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">shipping_country</span>
                              <p className="font-semibold text-gray-900">{raw?.shipping_country || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">delivery_method</span>
                              <p className="font-semibold text-gray-900">{raw?.delivery_method || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">pickup_location_id</span>
                              <p className="font-semibold text-gray-900">{raw?.pickup_location_id ?? '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Montants */}
                        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                            Montants
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">subtotal</span>
                              <p className="font-semibold text-gray-900">{raw?.subtotal != null ? `${Number(raw.subtotal).toFixed(2)} DH` : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">tax_amount</span>
                              <p className="font-semibold text-gray-900">{raw?.tax_amount != null ? `${Number(raw.tax_amount).toFixed(2)} DH` : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">shipping_cost</span>
                              <p className="font-semibold text-gray-900">{raw?.shipping_cost != null ? `${Number(raw.shipping_cost).toFixed(2)} DH` : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">discount_amount</span>
                              <p className="font-semibold text-gray-900">{raw?.discount_amount != null ? `${Number(raw.discount_amount).toFixed(2)} DH` : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">promo_code</span>
                              <p className="font-semibold text-gray-900">{raw?.promo_code || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">promo_discount_amount</span>
                              <p className="font-semibold text-gray-900">{raw?.promo_discount_amount != null ? `${Number(raw.promo_discount_amount).toFixed(2)} DH` : '-'}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-500">total_amount</span>
                              <p className="font-bold text-blue-700 text-lg">{raw?.total_amount != null ? `${Number(raw.total_amount).toFixed(2)} DH` : '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Paiement & Solde */}
                        <div className="bg-gradient-to-r from-cyan-50 to-sky-50 border border-cyan-100 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-cyan-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                            Paiement & Solde
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">payment_method</span>
                              <p className="font-semibold text-gray-900">{raw?.payment_method || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">payment_status</span>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                raw?.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                                raw?.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>{raw?.payment_status || '-'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">is_solde</span>
                              <p className="font-semibold text-gray-900">{raw?.is_solde != null ? (raw.is_solde ? 'Oui' : 'Non') : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">solde_amount</span>
                              <p className="font-semibold text-gray-900">{raw?.solde_amount != null ? `${Number(raw.solde_amount).toFixed(2)} DH` : '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Remise (fidélité) */}
                        <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-100 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-pink-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                            Remise (fidélité)
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">remise_used_amount</span>
                              <p className="font-semibold text-gray-900">{raw?.remise_used_amount != null ? `${Number(raw.remise_used_amount).toFixed(2)} DH` : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">remise_earned_amount</span>
                              <p className="font-semibold text-gray-900">{raw?.remise_earned_amount != null ? `${Number(raw.remise_earned_amount).toFixed(2)} DH` : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">remise_earned_at</span>
                              <p className="font-semibold text-gray-900">{raw?.remise_earned_at ? formatDateTimeWithHour(raw.remise_earned_at) : '-'}</p>
                            </div>
                            {isPdg && (
                              <div className="md:col-span-4 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => openEcommerceRemiseEditor(selectedBon)}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-pink-300 text-pink-700 hover:bg-pink-50"
                                  title="Modifier les remises par article"
                                >
                                  <Edit size={14} /> Modifier remises
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Remises par article */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Remises par article</h3>
                          {(() => {
                            const items: any[] = Array.isArray(raw?.items) ? raw.items : [];
                            const totalRemise = items.reduce((acc: number, it: any) => acc + (Number(it?.remise_amount) || 0), 0);
                            return (
                              <div className="responsive-table-container">
                                <table className="responsive-table responsive-table-min divide-y divide-gray-200 table-mobile-compact" style={{ minWidth: 700 }}>
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qté</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">PU</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sous-total</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Remise %</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Remise</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {items.length === 0 ? (
                                      <tr>
                                        <td colSpan={6} className="px-4 py-3 text-sm text-gray-500">Aucun article</td>
                                      </tr>
                                    ) : (
                                      items.map((it: any) => {
                                        const labelParts = [it.product_name, it.variant_name, it.unit_name].filter((v: any) => v != null && String(v).trim() !== '');
                                        const label = labelParts.length ? labelParts.join(' • ') : (it.product_name || 'Article');
                                        const q = Number(it.quantity || 0) || 0;
                                        const pu = Number(it.unit_price || 0) || 0;
                                        const sub = Number(it.subtotal || 0) || 0;
                                        const rp = Number(it.remise_percent_applied || 0) || 0;
                                        const ra = Number(it.remise_amount || 0) || 0;
                                        return (
                                          <tr key={String(it.id)} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-sm text-gray-700">{label}</td>
                                            <td className="px-4 py-2 text-sm text-right">{q}</td>
                                            <td className="px-4 py-2 text-sm text-right">{pu.toFixed(2)} DH</td>
                                            <td className="px-4 py-2 text-sm text-right">{sub.toFixed(2)} DH</td>
                                            <td className="px-4 py-2 text-sm text-right">{rp.toFixed(2)}%</td>
                                            <td className="px-4 py-2 text-sm text-right font-semibold text-pink-700">{ra.toFixed(2)} DH</td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                                <div className="flex justify-end text-sm font-semibold mt-2 text-pink-800">
                                  Total remise (articles): {Number(totalRemise || 0).toFixed(2)} DH
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Statut & Dates */}
                        <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50 border border-purple-100 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-purple-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Clock size={14} />
                            Statut & Dates
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">status</span>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                raw?.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                                raw?.status === 'shipped' ? 'bg-indigo-100 text-indigo-800' :
                                raw?.status === 'delivered' ? 'bg-green-100 text-green-800' :
                                raw?.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>{raw?.status || '-'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">confirmed_at</span>
                              <p className="font-semibold text-gray-900">{raw?.confirmed_at ? formatDateTimeWithHour(raw.confirmed_at) : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">shipped_at</span>
                              <p className="font-semibold text-gray-900">{raw?.shipped_at ? formatDateTimeWithHour(raw.shipped_at) : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">delivered_at</span>
                              <p className="font-semibold text-gray-900">{raw?.delivered_at ? formatDateTimeWithHour(raw.delivered_at) : '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">cancelled_at</span>
                              <p className="font-semibold text-gray-900">{raw?.cancelled_at ? formatDateTimeWithHour(raw.cancelled_at) : '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Notes</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">customer_notes</span>
                              <p className="font-semibold text-gray-900">{raw?.customer_notes || '-'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">admin_notes</span>
                              <p className="font-semibold text-gray-900">{raw?.admin_notes || '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Bouton copier JSON (discret) */}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const text = JSON.stringify(raw, null, 2);
                                await navigator.clipboard.writeText(text);
                                showSuccess('Données JSON copiées');
                              } catch (e) {
                                console.error('Copy ecommerce order failed', e);
                                showError('Impossible de copier');
                              }
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
                            title="Copier JSON brut"
                          >
                            <Copy size={14} /> Copier JSON
                          </button>
                        </div>
                      </div>
                    );
                  })()}

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
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">PA/CR</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">PU</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {parseItemsSafe(selectedBon.items).length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-3 text-sm text-gray-500">
                                Aucun produit
                              </td>
                            </tr>
                          ) : (
                          parseItemsSafe(selectedBon.items).map((item: any) => {
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
                            const resolvedCost = resolveCostWithVariantUnit(item);
                            return (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-700">
                                  {designation}
                                  {item.product_snapshot_id && (
                                    <span className="ml-1 text-[10px] text-blue-500">snap:{item.product_snapshot_id}</span>
                                  )}
                                  {item.variant_id && (
                                    <span className="ml-1 text-[10px] text-purple-500">v:{item.variant_id}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm text-right">{q}</td>
                                <td className="px-4 py-2 text-sm text-right">{kgUnit.toFixed(2)}</td>
                                <td className="px-4 py-2 text-sm text-right font-medium">{poids.toFixed(2)}</td>
                                <td className="px-4 py-2 text-sm text-right text-orange-600" title={`item.pa=${item.prix_achat} item.cr=${item.cout_revient} resolved=${resolvedCost}`}>{resolvedCost.toFixed(2)} DH</td>
                                <td className="px-4 py-2 text-sm text-right">{Number(item.prix_unitaire || 0).toFixed(2)} DH</td>
                                <td className="px-4 py-2 text-sm text-right font-semibold">{Number(item.montant_ligne || item.total || 0).toFixed(2)} DH</td>
                              </tr>
                            );
                          }))}
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
                        {(selectedBon.type !== 'Avoir' && selectedBon.type !== 'AvoirFournisseur') && (!isEmployee || isEmployee26CommandeOverride) && (
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
                        {(selectedBon.type === 'Avoir' || selectedBon.type === 'AvoirFournisseur') && (!isEmployee || isEmployee26CommandeOverride) && (
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

        {/* Modal: modifier remises e-commerce */}
        {isEcommerceRemiseModalOpen && selectedEcommerceForRemise && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Modifier remises (E-commerce) {getDisplayNumero(selectedEcommerceForRemise)}</h2>
                <button
                  onClick={() => setIsEcommerceRemiseModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="border rounded-md p-4">
                <div className="responsive-table-container">
                  <table className="responsive-table responsive-table-min divide-y divide-gray-200 table-mobile-compact" style={{ minWidth: 760 }}>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sous-total</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Remise %</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Remise (DH)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ecommerceRemiseDraftItems.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-3 text-sm text-gray-500">Aucun article</td>
                        </tr>
                      ) : (
                        ecommerceRemiseDraftItems.map((it: any) => (
                          <tr key={String(it.order_item_id)} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-700">{String(it.label || 'Article')}</td>
                            <td className="px-4 py-2 text-sm text-right">{Number(it.subtotal || 0).toFixed(2)} DH</td>
                            <td className="px-4 py-2 text-sm text-right">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={100}
                                value={String(it.remise_percent_applied ?? 0)}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                  const sub = Number(it.subtotal || 0) || 0;
                                  const amt = round2((sub * v) / 100);
                                  setEcommerceRemiseDraftItems((prev) => prev.map((x: any) => x.order_item_id === it.order_item_id ? ({ ...x, remise_percent_applied: v, remise_amount: amt }) : x));
                                }}
                                className="w-24 text-right text-xs border border-gray-300 rounded px-2 py-1"
                              />
                              <span className="text-xs text-gray-500 ml-1">%</span>
                            </td>
                            <td className="px-4 py-2 text-sm text-right">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={String(it.remise_amount ?? 0)}
                                onChange={(e) => {
                                  const amt = Math.max(0, round2(Number(e.target.value) || 0));
                                  const sub = Number(it.subtotal || 0) || 0;
                                  const pct = sub > 0 ? round2((amt / sub) * 100) : 0;
                                  setEcommerceRemiseDraftItems((prev) => prev.map((x: any) => x.order_item_id === it.order_item_id ? ({ ...x, remise_amount: amt, remise_percent_applied: Math.max(0, Math.min(100, pct)) }) : x));
                                }}
                                className="w-28 text-right text-xs border border-gray-300 rounded px-2 py-1"
                              />
                              <span className="text-xs text-gray-500 ml-1">DH</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setIsEcommerceRemiseModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={isSavingEcommerceRemises}
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    try {
                      const orderId = Number((selectedEcommerceForRemise as any)?.id);
                      if (!Number.isFinite(orderId)) {
                        showError('Commande invalide');
                        return;
                      }
                      const payloadItems = ecommerceRemiseDraftItems.map((it: any) => ({
                        order_item_id: Number(it.order_item_id),
                        remise_percent_applied: Number(it.remise_percent_applied) || 0,
                        remise_amount: Number(it.remise_amount) || 0,
                      }));
                      const res = await updateEcommerceOrderRemises({ id: orderId, items: payloadItems }).unwrap();
                      showSuccess('Remises e-commerce mises à jour');

                      if (res?.items) {
                        setSelectedBon((prev: any) => {
                          if (!prev || Number(prev?.id) !== orderId) return prev;
                          const rawPrev = (prev as any)?.ecommerce_raw ?? prev;
                          return { ...prev, ecommerce_raw: { ...rawPrev, items: res.items, remise_earned_amount: res.remise_earned_amount } };
                        });
                      }

                      setIsEcommerceRemiseModalOpen(false);
                    } catch (error: any) {
                      console.error('Erreur mise à jour remises e-commerce:', error);
                      const httpStatus = error?.status;
                      const msg = error?.data?.message || error?.message || 'Erreur inconnue';
                      if (httpStatus === 401) {
                        showError('Session expirée. Veuillez vous reconnecter.');
                        dispatch(logout());
                      } else {
                        showError(`Erreur lors de la mise à jour des remises: ${msg}`);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-md disabled:opacity-60"
                  disabled={isSavingEcommerceRemises}
                >
                  {isSavingEcommerceRemises ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
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
          type={((currentTab === 'Avoir' || currentTab === 'AvoirComptant') ? 'AvoirClient' : currentTab) as any}
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
    const raw = String(statut || '').trim();
    const s = raw.toLowerCase();
    if (['pending'].includes(s) || s.includes('en attente') || s === 'attente') return 'bg-blue-200 text-blue-700';
    if (['confirmed', 'delivered'].includes(s) || s.includes('valid') || s.includes('accept') || s.includes('livr')) return 'bg-green-200 text-green-700';
    if (['processing', 'shipped'].includes(s) || s.includes('envoy')) return 'bg-indigo-200 text-indigo-700';
    if (['cancelled'].includes(s) || s.includes('annul') || s.includes('refus') || s.includes('expir')) return 'bg-red-200 text-red-700';
    if (['refunded'].includes(s)) return 'bg-purple-200 text-purple-700';
    switch (raw) {
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
    if (s === 'pending' || s.includes('en attente') || s === 'attente') return <Clock size={14} />;
    if (s === 'processing') return <Package size={14} />;
    if (s === 'shipped') return <Truck size={14} />;
    if (s === 'refunded') return <RotateCcw size={14} />;
    if (s === 'confirmed' || s === 'delivered' || s.includes('valid') || s.includes('accept') || s.includes('livr')) return <CheckCircle2 size={14} />;
    if (s.includes('refus') || s.includes('annul') || s === 'cancelled') return <XCircle size={14} />;
    return null;
  }