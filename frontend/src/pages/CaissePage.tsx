import { useState, useMemo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useAppSelector, useAuth } from '../hooks/redux';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { 
  Plus, 
  Search, 
  Eye, 
  Edit, 
    Trash2, 
  Check,
  Clock,
  XCircle,
  CreditCard, 
  DollarSign,
  Receipt,
  Filter,
  Calendar,
  User,
  LogOut,
  X,
  Printer,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Wallet
} from 'lucide-react';
import type { Payment, Bon, Contact } from '../types';
import { displayBonNumero } from '../utils/numero';
import { useGetCaisseBonsContextQuery } from '../store/api/bonsApi';
import { useGetAllClientsQuery, useGetAllFournisseursQuery } from '../store/api/contactsApi';
import { useGetClientRemisesQuery, useGetDirectContactRemiseBalancesQuery } from '../store/api/remisesApi';
import { useGetTalonsQuery } from '../store/api/talonsApi';
import { showSuccess, showError, showConfirmation } from '../utils/notifications';
import { canModifyPayments } from '../utils/permissions';
import { formatDateTimeWithHour, formatDateInputToMySQL, formatMySQLToDateTimeInput, getCurrentDateTimeInput } from '../utils/dateUtils';
import { resetFilters } from '../store/slices/paymentsSlice';
import { toBackendUrl } from '../utils/url';
import { useGetPaymentsQuery, useGetPaymentsPagedQuery, useCreatePaymentMutation, useUpdatePaymentMutation, useDeletePaymentMutation, useGetPersonnelNamesQuery, useChangePaymentStatusMutation } from '../store/api/paymentsApi';
import { useUploadPaymentImageMutation, useDeletePaymentImageMutation } from '../store/api/uploadApi';
import SearchableSelect from '../components/SearchableSelect';
import { logout } from '../store/slices/authSlice';
import PaymentPrintModal from '../components/PaymentPrintModal';
import PaymentGroupPrintModal from '../components/PaymentGroupPrintModal';
import { useCreateOldTalonCaisseMutation } from '../store/slices/oldTalonsCaisseSlice';

const DIRECT_CONTACT_OFFSET = 10_000_000;

type RemiseAccountType = 'client-remise' | 'client_abonne' | 'direct-client';

type RemisePaymentAccount = {
  id: number;
  nom: string;
  type: RemiseAccountType;
  contact_id?: number | null;
  contact_nom?: string | null;
  contact_societe?: string | null;
  contact_reference?: string | null;
  earned_total?: number;
  used_total?: number;
  available_total?: number;
};

const CaissePage = () => {
  const dispatch = useDispatch();

  function normalizePaymentStatut(s: any): 'En attente' | 'Validé' | 'Refusé' | 'Annulé' | string {
    if (!s) return '';
    const norm = String(s).toLowerCase().trim();
    if (norm === 'en attente' || norm === 'attente') return 'En attente';
    if (norm === 'validé' || norm === 'valide') return 'Validé';
    if (norm === 'refusé' || norm === 'refuse') return 'Refusé';
    if (norm === 'annulé' || norm === 'annule') return 'Annulé';
    return String(s);
  }
  
  // État local
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState<'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Traite' | 'Remise'>('all');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [groupPrintId, setGroupPrintId] = useState<string | null>(null); // payment_group_id en cours d'impression groupée
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // groupes dépliés dans le tableau
  const [createOpenedAt, setCreateOpenedAt] = useState<string | null>(null); // capture datetime à l'ouverture du modal création

  // Sorting
  const [sortField, setSortField] = useState<'numero' | 'date' | 'contact' | 'montant' | 'montant_ignorer' | 'echeance' | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Redux data
  const user = useAppSelector(state => state.auth.user);
  const isPdgOrManagerPlus = user?.role === 'PDG' || user?.role === 'ManagerPlus';
  const { data: clients = [] } = useGetAllClientsQuery(undefined);
  const { data: fournisseurs = [] } = useGetAllFournisseursQuery(undefined);
  const { data: talons = [] } = useGetTalonsQuery(undefined);
  const paymentSortBy = sortField || 'date';
  const { data: paymentsPagedResponse } = useGetPaymentsPagedQuery({
    page: currentPage,
    limit: itemsPerPage,
    search: searchTerm || undefined,
    date: dateFilter || undefined,
    mode: modeFilter !== 'all' ? modeFilter : undefined,
    status: statusFilter.length ? statusFilter.join(',') : undefined,
    sortBy: paymentSortBy,
    sortDir: sortDirection,
  });
  const needsAllPayments = isCreateModalOpen || isViewModalOpen || isPrintModalOpen;
  const { data: allPaymentsForHistory = [] } = useGetPaymentsQuery(undefined, { skip: !needsAllPayments });
  const { data: clientRemisesRaw = [] } = useGetClientRemisesQuery();
  const { data: directContactBalances = [] } = useGetDirectContactRemiseBalancesQuery();
  const payments = paymentsPagedResponse?.data || [];
  const paymentsForHistory = needsAllPayments ? allPaymentsForHistory : payments;
  const [createPayment] = useCreatePaymentMutation();
  const [updatePaymentApi] = useUpdatePaymentMutation();
  const [deletePaymentApi] = useDeletePaymentMutation();
  const [changePaymentStatusApi] = useChangePaymentStatusMutation();
  const [uploadPaymentImage] = useUploadPaymentImageMutation();
  const [deletePaymentImage] = useDeletePaymentImageMutation();
  const { data: personnelNames = [] } = useGetPersonnelNamesQuery();
  const [createOldTalonCaisse] = useCreateOldTalonCaisseMutation();
  const { token } = useAuth();
  const remiseAccounts = useMemo<RemisePaymentAccount[]>(() => {
    if (!Array.isArray(clientRemisesRaw)) return [];
    return clientRemisesRaw.map((row: any) => ({
      id: Number(row.id),
      nom: String(row.nom || row.contact_nom || `Remise #${row.id}`),
      type: row.type === 'client_abonne' ? 'client_abonne' : 'client-remise',
      contact_id: row.contact_id != null ? Number(row.contact_id) : null,
      contact_nom: row.contact_nom ?? null,
      contact_societe: row.contact_societe ?? null,
      earned_total: Number(row.remise_gagnee_total ?? row.total_remise ?? 0),
      used_total: Number(row.remise_utilisee ?? 0),
      available_total: Number(
        row.remise_disponible ??
        ((Number(row.remise_gagnee_total ?? row.total_remise ?? 0) || 0) - (Number(row.remise_utilisee ?? 0) || 0))
      ),
    }));
  }, [clientRemisesRaw]);

  // Map contact_id → client_abonne account (for "clients bons" tab behavior in the filter)
  const clientAbonneAccountByContactId = useMemo(() => {
    const map = new Map<number, RemisePaymentAccount>();
    for (const acc of remiseAccounts) {
      if (acc.type === 'client_abonne' && acc.contact_id) {
        const current = map.get(acc.contact_id);
        if (!current || Number(acc.id) > Number(current.id)) {
          map.set(acc.contact_id, acc);
        }
      }
    }
    return map;
  }, [remiseAccounts]);

  // All contacts with available remise, mirroring RemisesPage "clients bons" tab
  const directClientAbonneAccounts = useMemo<RemisePaymentAccount[]>(() => {
    const result: RemisePaymentAccount[] = [];
    const seenContactIds = new Set<number>();

    // 1. Contacts WITH a linked client_abonne account (use account ID + available)
    for (const contact of clients) {
      const cId = Number((contact as any).id);
      if (!Number.isFinite(cId) || cId <= 0) continue;
      const acc = clientAbonneAccountByContactId.get(cId);
      if (!acc) continue;
      seenContactIds.add(cId);
      result.push({
        ...acc,
        nom: String((contact as any).nom_complet || (contact as any).nom || acc.nom),
        contact_nom: null,
        contact_societe: String((contact as any).societe || acc.contact_societe || ''),
        contact_reference: String((contact as any).reference || ''),
      });
    }

    // 2. Contacts WITHOUT linked account but WITH bons remise (direct-client flow)
    for (const balance of directContactBalances) {
      const cId = Number(balance.contact_id);
      if (seenContactIds.has(cId)) continue;
      if (Number(balance.available_total || 0) <= 0) continue;
      result.push({
        id: DIRECT_CONTACT_OFFSET + cId,
        nom: String(balance.nom_complet || `Contact #${cId}`),
        type: 'direct-client',
        contact_id: cId,
        contact_nom: null,
        contact_societe: String(balance.societe || ''),
        contact_reference: String(balance.reference || ''),
        earned_total: Number(balance.earned_total || 0),
        used_total: Number(balance.used_total || 0),
        available_total: Number(balance.available_total || 0),
      });
    }

    result.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return result;
  }, [clients, clientAbonneAccountByContactId, directContactBalances]);

  // Audit meta for payments (created_by_name / updated_by_name)
  const [paymentsMeta, setPaymentsMeta] = useState<Record<string, { created_by_name: any; updated_by_name: any }>>({});

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
        return new TextDecoder('utf-8').decode(new Uint8Array(v.data));
      } catch {
        return '[Binary]';
      }
    }
    return String(v);
  };

  const getRemiseTypeLabel = (type?: string | null) => {
    if (type === 'client_abonne') return 'Client abonné';
    if (type === 'direct-client') return 'Client direct (bons)';
    return 'Client remise';
  };

  const getPaymentContactName = (payment: Payment) => {
    if (payment.mode_paiement === 'Remise' && payment.remise_account_name) {
      return payment.remise_account_name;
    }
    if (payment.type_paiement === 'Fournisseur') {
      return fournisseurs.find((f) => f.id === payment.contact_id)?.nom_complet || '-';
    }
    return clients.find((c) => c.id === payment.contact_id)?.nom_complet || '-';
  };

  const getPaymentSociete = (payment: Payment) => {
    if (payment.mode_paiement === 'Remise') {
      return clients.find((c) => c.id === payment.contact_id)?.societe || getRemiseTypeLabel(payment.remise_account_type);
    }
    if (payment.type_paiement === 'Fournisseur') {
      return fournisseurs.find((f) => f.id === payment.contact_id)?.societe || '-';
    }
    return clients.find((c) => c.id === payment.contact_id)?.societe || '-';
  };

  const getPaymentTypeBadge = (payment: Payment) => {
    if (payment.mode_paiement === 'Remise') return 'Remise';
    if (payment.type_paiement === 'Fournisseur' && Number((payment as any).payment ?? 0) === 1) return 'Paiement FO';
    return payment.type_paiement;
  };

  const isSupplierFoPayment = (payment: Payment) =>
    payment.type_paiement === 'Fournisseur' && Number((payment as any).payment ?? 0) === 1;

  const getPaymentTypeBadgeClasses = (payment: Payment) => {
    if (isSupplierFoPayment(payment)) return 'bg-purple-100 text-purple-800';
    if (payment.type_paiement === 'Fournisseur') return 'bg-orange-100 text-orange-800';
    if (payment.mode_paiement === 'Remise') return 'bg-amber-100 text-amber-800';
    return 'bg-emerald-100 text-emerald-800';
  };
  
  // Bons from database: utiliser les mêmes sources que BonFormModal
  const { data: bonsContext, isLoading: bonsLoading } = useGetCaisseBonsContextQuery();
  const sorties = bonsContext?.sorties || [];
  const comptantsRaw = bonsContext?.comptants || [];
  const commandes = bonsContext?.commandes || [];
  // Charger les avoirs pour les afficher dans l'historique du solde cumulé
  const avoirsClient = bonsContext?.avoirsClient || [];
  const avoirsFournisseur = bonsContext?.avoirsFournisseur || [];
  // Bons e-commerce (commandes e-commerce + avoirs e-commerce)
  const ecommerceOrders = bonsContext?.ecommerceOrders || [];
  const avoirsEcommerce = bonsContext?.avoirsEcommerce || [];
  const bons: Bon[] = [
    ...(Array.isArray(sorties) ? sorties : []),
    ...(Array.isArray(comptantsRaw) ? comptantsRaw.filter((b: any) => !!b.client_id) : []),
    ...(Array.isArray(commandes) ? commandes : []),
    ...(Array.isArray(avoirsClient) ? avoirsClient : []),
    ...(Array.isArray(avoirsFournisseur) ? avoirsFournisseur : []),
    ...(Array.isArray(ecommerceOrders) ? ecommerceOrders : []),
    ...(Array.isArray(avoirsEcommerce) ? avoirsEcommerce : []),
  ];

  // Backend now provides payments; no mock seeding

  // Available statuses for payments
  const availableStatuses = ['En attente', 'Validé', 'Refusé', 'Annulé'];

  // Handle sorting
  const handleSort = (field: 'numero' | 'date' | 'contact' | 'montant' | 'montant_ignorer' | 'echeance') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'date' ? 'desc' : 'asc');
    }
  };

  // Filtrer et trier les paiements
  // Helper: flatten a payment into a searchable string (includes phones, dates, contact, bank, notes, personnel, talon/bon refs)
  const flattenPaymentForSearch = (payment: any): string => {
    const parts: string[] = [];

    const push = (v: any) => {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        parts.push(String(v));
        return;
      }
      if (isBufferLike(v)) {
        parts.push(safeText(v));
        return;
      }
    };

    // Normalize phone digits (keep last 9 digits for Morocco)
    const normalizePhone = (p: any) => {
      if (p == null) return '';
      const s = String(p).replace(/\D+/g, '');
      if (!s) return '';
      return s.length > 9 ? s.slice(-9) : s;
    };

    // Basic payment fields
    push(payment.id);
    push(payment.numero);
    push(payment.code_reglement);
    push(payment.mode_paiement);
    push((payment as any).remise_account_name);
    push((payment as any).remise_account_type);
    push(payment.statut);
    push(payment.notes);
    push(payment.banque);
    push(payment.cheque_num || payment.numero_cheque || payment.chequeNumber);
    push(String(payment.montant || payment.montant_total || ''));
    push(String(payment.montant_ignorer || ''));

    // Dates: payment date and echeance in multiple formats
    const pushDateTokens = (dateVal: any) => {
      if (!dateVal) return;
      try {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          parts.push(d.toISOString());
          parts.push(d.toISOString().slice(0,10));
          const dd = String(d.getDate()).padStart(2,'0');
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const yyyy = String(d.getFullYear());
          parts.push(`${dd}/${mm}/${yyyy}`);
          parts.push(`${dd}-${mm}-${yyyy}`);
          parts.push(`${mm}/${dd}/${yyyy}`);
          parts.push(d.toLocaleDateString());
        } else {
          parts.push(String(dateVal));
        }
      } catch {
        parts.push(String(dateVal));
      }
    };
    pushDateTokens(payment.date_paiement);
    pushDateTokens(payment.date_echeance);

    // Contact info (client or fournisseur)
    const cid = String(payment.contact_id || payment.client_id || payment.fournisseur_id || '');
    push(cid);
    if (cid) {
      const c = clients.find((cl: any) => String(cl.id) === cid);
      const f = c ? undefined : fournisseurs.find((fo: any) => String(fo.id) === cid);
      if (c) {
        push(c.id);
        push(c.reference);
        push(c.nom_complet);
        push(c.telephone);
        push(c.societe);
      }
      if (f) {
        push(f.id);
        push(f.reference);
        push(f.nom_complet);
        push(f.telephone);
        push(f.societe);
      }
    }

    // Personnel / user who recorded payment
    if (payment.personnel) push(payment.personnel);
    if (payment.personnel_id) {
      const p: any = personnelNames.find((pn: any) => String(pn.id) === String(payment.personnel_id));
      if (p) {
        if (typeof p === 'string') {
          push(p);
        } else {
          const anyP: any = p;
          push(anyP.name || anyP.nom || anyP.nom_complet || '');
        }
      }
    }

    // Talon / bon references
    push(payment.talon_num || payment.talon || payment.talon_id || '');
    push(payment.bon_numero || payment.bon || payment.bon_id || '');

    // Include payment display like PAY01 so searching PAY01/PAY1 works
    try {
      const pid = String(payment?.id ?? '').trim();
      if (pid) {
        const padded = `PAY${pid.padStart(2, '0')}`;
        parts.push(padded);
        // also add non-padded variant (PAY1) and normalized version
        parts.push(`PAY${pid}`);
        parts.push(padded.toLowerCase());
        parts.push(`PAY${pid}`.toLowerCase());
        parts.push((`PAY${pid.padStart(2, '0')}`).replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
      }
    } catch {}

    // Normalize helper: remove non-alphanum and lowercase
    const normalizeAlphaNum = (s: any) => {
      if (s == null) return '';
      try {
        return String(s).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      } catch {
        return '';
      }
    };

    // If payment references a bon, include the bon's standard display (e.g., SOR19, COM20)
    try {
      const bid = (payment?.bon_id ?? payment?.bon) || payment?.bon_numero || null;
      if (bid) {
        const theBon = bons.find((b: any) => String(b.id) === String(bid) || String(b.numero || '') === String(bid));
        if (theBon) {
          const disp = displayBonNumero(theBon);
          parts.push(disp);
          const norm = normalizeAlphaNum(disp);
          if (norm) parts.push(norm);
        }
        // Also consider payment.bon_numero even if no matching bon object
        const rawBonNum = payment?.bon_numero || payment?.bon || '';
        if (rawBonNum) {
          parts.push(String(rawBonNum));
          const normRaw = normalizeAlphaNum(rawBonNum);
          if (normRaw) parts.push(normRaw);
        }
      }
    } catch {}

    // Collect shallow primitive fields
    try {
      for (const k of Object.keys(payment)) {
        const v = payment[k];
        if (v == null) continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') parts.push(String(v));
      }
    } catch {}

    // Phone tokens: gather known phone fields and normalized/country variants
    const phoneCandidates: string[] = [];
    if (payment.phone) phoneCandidates.push(String(payment.phone));
    // also look at contact/fournisseur phone collected above
    const cidNum = String(payment.contact_id || payment.client_id || payment.fournisseur_id || '');
    if (cidNum) {
      const c = clients.find((cl: any) => String(cl.id) === cidNum);
      const f = fournisseurs.find((fo: any) => String(fo.id) === cidNum);
      if (c && c.telephone) phoneCandidates.push(String(c.telephone));
      if (f && f.telephone) phoneCandidates.push(String(f.telephone));
    }

    if (phoneCandidates.length) parts.push(phoneCandidates.join(' '));
    const normalizedPhones = phoneCandidates.map(p => normalizePhone(p)).filter(Boolean);
    if (normalizedPhones.length) parts.push(normalizedPhones.join(' '));

    // Country mapping similar to BonsPage (Morocco)
    const countryCode = '212';
    const fullDigitTokens: string[] = [];
    for (const raw of phoneCandidates) {
      const digits = String(raw).replace(/\D+/g, '');
      if (!digits) continue;
      fullDigitTokens.push(digits);
      if (digits.length >= 9 && digits.startsWith('0')) {
        const rest = digits.slice(1);
        fullDigitTokens.push(countryCode + rest);
      }
      if (digits.startsWith(countryCode)) {
        const rest = digits.slice(countryCode.length);
        if (rest.length > 0) fullDigitTokens.push('0' + rest);
      }
    }
    if (fullDigitTokens.length) parts.push(fullDigitTokens.join(' '));

    return parts.join(' ').toLowerCase();
  };

  const getPaymentGrossAmount = (payment: Payment | any) => Number(payment?.montant ?? payment?.montant_total ?? 0) || 0;
  const getPaymentIgnoredAmount = (payment: Payment | any) => Number(payment?.montant_ignorer ?? 0) || 0;
  const getPaymentPaidAmount = (payment: Payment | any) =>
    Math.max(getPaymentGrossAmount(payment), 0);

  const sortedPayments = useMemo(() => {
    return payments;
    // First filter
    const filtered = payments.filter((payment: Payment) => {
      const term = searchTerm.trim().toLowerCase();
      const searchText = flattenPaymentForSearch(payment);

      // Also compare normalized phone digits
      const normalizeTermDigits = (s: string) => {
        if (!s) return '';
        const digits = s.replace(/\D+/g, '');
        return digits.length > 9 ? digits.slice(-9) : digits;
      };
      const termDigits = normalizeTermDigits(term);

      const normalizeAlphaTerm = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const termAlpha = normalizeAlphaTerm(term);

      const matchesSearch = !term || (
        searchText.includes(term) ||
        (termDigits && searchText.includes(termDigits)) ||
        (termAlpha && searchText.includes(termAlpha))
      );

      const matchesDate = !dateFilter || payment.date_paiement === dateFilter;

      const matchesMode = modeFilter === 'all' || payment.mode_paiement === modeFilter;

      const matchesStatus = (() => {
        if (!statusFilter || (Array.isArray(statusFilter) && statusFilter.length === 0)) return true;
        const pStat = String((payment as any).statut || '').toString();
        return statusFilter.includes(pStat);
      })();

      return matchesSearch && matchesDate && matchesMode && matchesStatus;
    });

    // Then sort
    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      const getContactName = (payment: Payment) => {
        const byName =
          (payment as any).remise_account_name ||
          (payment as any).contact_nom ||
          (payment as any).client_nom ||
          (payment as any).fournisseur_nom ||
          '';
        if (byName) return String(byName).toLowerCase();
        const cid = String((payment as any).contact_id || (payment as any).client_id || (payment as any).fournisseur_id || '');
        if (cid) {
          const c = clients.find((cl: any) => String(cl.id) === cid);
          if (c) return String(c.nom_complet || '').toLowerCase();
          const f = fournisseurs.find((fo: any) => String(fo.id) === cid);
          if (f) return String(f.nom_complet || '').toLowerCase();
        }
        return '';
      };

      const getDisplayNumeroPayment = (payment: Payment) => {
        const id = String(payment?.id ?? '').trim();
        if (!id) return '';
        return `PAY${id.padStart(2, '0')}`;
      };

      switch (sortField) {
        case 'numero':
          aValue = getDisplayNumeroPayment(a).toLowerCase();
          bValue = getDisplayNumeroPayment(b).toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.date_paiement || 0).getTime();
          bValue = new Date(b.date_paiement || 0).getTime();
          break;
        case 'contact':
          aValue = getContactName(a);
          bValue = getContactName(b);
          break;
        case 'montant':
          aValue = getPaymentPaidAmount(a);
          bValue = getPaymentPaidAmount(b);
          break;
        case 'montant_ignorer':
          aValue = Number((a as any).montant_ignorer || 0);
          bValue = Number((b as any).montant_ignorer || 0);
          break;
        case 'echeance':
          aValue = a.date_echeance ? new Date(a.date_echeance).getTime() : Number.POSITIVE_INFINITY;
          bValue = b.date_echeance ? new Date(b.date_echeance).getTime() : Number.POSITIVE_INFINITY;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [payments]);

  // Fetch audit meta for displayed payments
  useEffect(() => {
    const ids = sortedPayments.map((p: any) => p.id).filter(Boolean);
    if (!ids.length) { setPaymentsMeta({}); return; }
    const ctrl = new AbortController();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`/api/audit/meta?table=payments&ids=${ids.join(',')}`, { signal: ctrl.signal, headers })
      .then(r => r.ok ? r.json() : r.text().then(tx => Promise.reject(new Error(tx))))
      .then(obj => setPaymentsMeta(obj || {}))
      .catch(() => {})
      .finally(() => {});
    return () => ctrl.abort();
  }, [sortedPayments, token]);

  // Pagination des paiements
  const totalPayments = paymentsPagedResponse?.pagination?.total ?? sortedPayments.length;
  const totalPages = paymentsPagedResponse?.pagination?.totalPages ?? Math.ceil(totalPayments / itemsPerPage);
  const paginatedPayments = sortedPayments;

  // Regroupement des paiements par payment_group_id (paiements créés ensemble)
  const paymentsByGroup = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of paginatedPayments) {
      const gid = (p as any).payment_group_id;
      if (gid) {
        if (!map.has(gid)) map.set(gid, []);
        map.get(gid)!.push(p);
      }
    }
    // Un groupe doit contenir au moins 2 paiements visibles pour être traité comme groupe
    for (const [gid, arr] of Array.from(map.entries())) {
      if (arr.length < 2) map.delete(gid);
    }
    return map;
  }, [paginatedPayments]);

  const getGroupOf = (payment: Payment): Payment[] | null => {
    const gid = (payment as any).payment_group_id;
    if (!gid) return null;
    return paymentsByGroup.get(gid) || null;
  };

  const toggleGroup = (gid: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  const handlePrintGroup = (gid: string) => {
    setGroupPrintId(gid);
  };

  const groupPaymentsToPrint = useMemo(() => {
    if (!groupPrintId) return [];
    return (payments as Payment[]).filter((p: any) => p.payment_group_id === groupPrintId);
  }, [groupPrintId, payments]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, statusFilter, modeFilter, sortField, sortDirection]);

  // Calculs statistiques
  const amountOf = (p: Payment) => getPaymentPaidAmount(p);
  const paymentTotals = paymentsPagedResponse?.totals;
  const totalEncaissements = paymentTotals?.totalEncaissements ?? sortedPayments.reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalEspeces = paymentTotals?.totalEspeces ?? sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Espèces')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalCheques = paymentTotals?.totalCheques ?? sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Chèque')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalVirements = paymentTotals?.totalVirements ?? sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Virement')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalTraites = paymentTotals?.totalTraites ?? sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Traite')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalRemises = paymentTotals?.totalRemises ?? sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Remise')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);

  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce paiement ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deletePaymentApi({ id }).unwrap();
        showSuccess('Paiement supprimé avec succès');
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression du paiement');
      }
    }
  };

  const handleViewPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsViewModalOpen(true);
  };

  const handleEditPayment = (payment: Payment) => {
    // Règle: un paiement Validé ne doit pas être modifié directement.
    // Il faut d'abord le remettre en attente (PDG / ManagerPlus).
    if (normalizePaymentStatut((payment as any)?.statut) === 'Validé') {
      showError("Paiement déjà validé. Pour le modifier, remettez d'abord son statut à 'En attente' (PDG/ManagerPlus). ");
      return;
    }

    setSelectedPayment(payment);
    // Réinitialiser l'état de l'image
    setSelectedImage(null);
    setImagePreview(payment.image_url || '');
    // Set the original payment datetime for proper pre-filling
    setCreateOpenedAt(formatMySQLToDateTimeInput(payment.date_paiement));
    setIsCreateModalOpen(true);
  };

  const handlePrintPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsPrintModalOpen(true);
  };

  // Change payment statut helper (only change statut via table actions)
  const changePaymentStatus = async (paymentId: number, newStatut: 'En attente'|'Validé'|'Refusé'|'Annulé') => {
    try {
      // Autoriser le "déverrouillage" (Validé -> En attente) uniquement pour PDG/ManagerPlus
      const current = (payments || []).find((p: any) => Number(p?.id) === Number(paymentId));
      const currentStatut = normalizePaymentStatut(current?.statut);
      if (currentStatut === 'Validé' && newStatut === 'En attente' && !isPdgOrManagerPlus) {
        showError("Seuls PDG/ManagerPlus peuvent remettre un paiement Validé en 'En attente'.");
        return;
      }

      await changePaymentStatusApi({ id: paymentId, statut: newStatut }).unwrap();
      showSuccess(`Statut mis à jour: ${newStatut}`);
    } catch (err: any) {
      console.error('Erreur mise à jour statut:', err);
      showError(err?.data?.message || err?.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  // Popup menu state for row actions
  const [openMenuPaymentId, setOpenMenuPaymentId] = useState<number|null>(null);
  const menuRef = useRef<HTMLDivElement|null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuPaymentId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setSelectedPayment(null);
    setSelectedImage(null);
    setImagePreview('');
  };

  const handleLogout = async () => {
    const result = await showConfirmation(
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      'Vous devrez vous reconnecter pour accéder à l\'application.',
      'Oui, se déconnecter',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      dispatch(logout());
      showSuccess('Déconnexion réussie');
    }
  };

  // Schéma de validation
 const toNull = (v: any, orig: any) => (orig === '' ? null : v);

 // On traite les dates comme des chaînes 'YYYY-MM-DD' pour éviter les conversions en Date par Yup
 const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;
 // Regex pour datetime-local: YYYY-MM-DDTHH:MM
 const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const paymentValidationSchema = Yup.object({
  montant: Yup.number()
    .typeError('Le montant doit être un nombre')
    .required('Montant est requis')
    .positive('Le montant doit être positif'),

  montant_ignorer: Yup.number()
    .transform((v, orig) => (orig === '' ? 0 : v))
    .typeError('Le montant ignoré doit être un nombre')
    .min(0, 'Le montant ignoré doit être positif ou nul'),
  remise: Yup.boolean().default(false),

  mode_paiement: Yup.mixed<'Espèces'|'Chèque'|'Virement'|'Traite'|'Remise'>()
    .oneOf(['Espèces','Chèque','Virement','Traite','Remise'], 'Mode invalide')
    .required('Mode de paiement est requis'),

  date_paiement: Yup.string()
    .required('Date de paiement est requise')
    .matches(datetimeLocalRegex, 'Date de paiement invalide (format attendu YYYY-MM-DDTHH:MM)'),

  statut: Yup.string()
    .oneOf(['En attente','Validé','Refusé','Annulé'], 'Statut invalide')
    .required('Statut est requis'),

  contact_id: Yup.number()
    .transform((v, orig) => (orig === '' ? null : v))
    .typeError('Contact invalide')
    .integer('Contact invalide')
    .when(['contact_optional', 'mode_paiement'], {
      is: (contact_optional: boolean, mode_paiement: string) => contact_optional || mode_paiement === 'Remise',
      then: (schema) => schema.nullable().notRequired(),
      otherwise: (schema) => schema.required('Contact est requis'),
    }),

  remise_account_id: Yup.number()
    .transform((v, orig) => (orig === '' ? null : v))
    .nullable()
    .when('mode_paiement', {
      is: 'Remise',
      then: (schema) => schema.required('Bénéficiaire remise requis').typeError('Bénéficiaire remise requis'),
      otherwise: (schema) => schema.nullable().notRequired(),
    }),

  code_reglement: Yup.string()
    .transform(toNull)
    .nullable(),

  banque: Yup.string()
    .transform(toNull)
    .nullable(),

  personnel: Yup.string()
    .transform(toNull)
    .nullable(),

  date_echeance: Yup.string()
    .transform((v, orig) => (orig === '' ? null : v))
    .nullable()
    .test('ymd-format', 'Date d\'échéance invalide (format attendu YYYY-MM-DD)', (val) => {
      if (val == null || val === '') return true;
      return ymdRegex.test(val);
    }),

  notes: Yup.string().transform(toNull).nullable(),
  // bon_id comes from a select. To avoid collisions between tables, we store a composite value like "Comptant:123".
  bon_id: Yup.string().transform(toNull).nullable(),
  bon_type: Yup.string().transform(toNull).nullable(),
  talon_id: Yup.number().transform((v, orig) => (orig === '' ? null : v)).nullable(),
  payment_lines: Yup.array().of(
    Yup.object({
      montant: Yup.number()
        .typeError('Le montant doit être un nombre')
        .required('Montant est requis')
        .positive('Le montant doit être positif'),
      montant_ignorer: Yup.number()
        .transform((v, orig) => (orig === '' ? 0 : v))
        .typeError('Le montant ignoré doit être un nombre')
        .min(0, 'Le montant ignoré doit être positif ou nul'),
      remise: Yup.boolean().default(false),
      mode_paiement: Yup.mixed<'Espèces'|'Chèque'|'Virement'|'Traite'|'Remise'>()
        .oneOf(['Espèces','Chèque','Virement','Traite','Remise'], 'Mode invalide')
        .required('Mode de paiement est requis'),
      date_paiement: Yup.string().transform(toNull).nullable(),
      bon_id: Yup.string().transform(toNull).nullable(),
      talon_id: Yup.number().transform((v, orig) => (orig === '' ? null : v)).nullable(),
      code_reglement: Yup.string().transform(toNull).nullable(),
      banque: Yup.string().transform(toNull).nullable(),
      date_echeance: Yup.string()
        .transform((v, orig) => (orig === '' ? null : v))
        .nullable()
        .test('ymd-format', 'Date d\'échéance invalide (format attendu YYYY-MM-DD)', (val) => {
          if (val == null || val === '') return true;
          return ymdRegex.test(val);
        }),
      notes: Yup.string().transform(toNull).nullable(),
    })
  ),
});

  // Function to display payment numbers with PAY prefix
  const getDisplayNumeroPayment = (payment: Payment) => {
    const id = String(payment?.id ?? '').trim();
    if (!id) return '';
    return `PAY${id.padStart(2, '0')}`;
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Vérifier le type de fichier
      if (!file.type.startsWith('image/')) {
        showError('Veuillez sélectionner un fichier image valide');
        return;
      }
  // Taille illimitée acceptée (suppression de la limite 5MB)
      setSelectedImage(file);
      
      // Créer une preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    // Si c'est une image existante sur le serveur, on peut la supprimer
    if (selectedPayment?.image_url && !selectedImage) {
      deleteImageFromServer(selectedPayment.image_url);
    }
    setSelectedImage(null);
    setImagePreview('');
  };

  // Ajuster type/contact selon le bon choisi
  const onBonChange = (e: React.ChangeEvent<HTMLSelectElement>, setFieldValue: (f: string, v: any) => void, currentType: 'Client'|'Fournisseur') => {
    const val = e.target.value;

    const parseBonValue = (raw: any): { id: string; type: string | null } => {
      const s = String(raw ?? '').trim();
      if (!s) return { id: '', type: null };
      if (s.includes(':')) {
        const [t, id] = s.split(':', 2);
        return { id: String(id ?? '').trim(), type: String(t ?? '').trim() || null };
      }
      return { id: s, type: null };
    };

    const parsed = parseBonValue(val);
    setFieldValue('bon_id', val);
    setFieldValue('bon_type', parsed.type);

    const bon = bons.find((b: Bon) => String(b.id) === String(parsed.id) && (!parsed.type || String(b.type) === String(parsed.type)));
    if (bon) {
      // Respect current selected payer type; just populate matching contact
      if (currentType === 'Fournisseur') {
        setFieldValue('contact_optional', false);
        const fid = bon.fournisseur_id;
        if (fid) setFieldValue('contact_id', String(fid));
      } else {
        // Note: pour les bons e-commerce sans client_id, on garde le contact sélectionné.
        // L'association se fait via l'historique (match tel/email) côté calculateContactSoldeHistory.
        if (bon.type === 'Comptant' && !bon.client_id) {
          setFieldValue('contact_optional', true);
          setFieldValue('contact_id', '');
        } else {
          setFieldValue('contact_optional', false);
          const cid = bon.client_id;
          if (cid) setFieldValue('contact_id', String(cid));
        }
      }
    } else {
      setFieldValue('type_paiement', 'Client');
      setFieldValue('contact_optional', false);
    }
  };

  // Fonction pour uploader l'image vers le serveur
  const uploadImageToServer = async (file: File): Promise<string> => {
    try {
      setUploadingImage(true);
      const result = await uploadPaymentImage(file).unwrap();
      if (result.success) {
        return result.imageUrl;
      } else {
        throw new Error(result.message || 'Erreur lors de l\'upload');
      }
    } catch (error: any) {
      console.error('Erreur upload image:', error);
      showError(error?.data?.message || error?.message || 'Erreur lors de l\'upload de l\'image');
      throw error;
    } finally {
      setUploadingImage(false);
    }
  };

  // Fonction pour supprimer une image du serveur
  const deleteImageFromServer = async (imageUrl: string): Promise<void> => {
    try {
      // Extraire le nom du fichier depuis l'URL
      const filename = imageUrl.split('/').pop();
      if (filename) {
        await deletePaymentImage(filename).unwrap();
      }
    } catch (error: any) {
      console.error('Erreur suppression image:', error);
      // Ne pas afficher d'erreur à l'utilisateur car c'est optionnel
    }
  };

  const getInitialValues = () => {
    if (selectedPayment) {
      let contactOptional = false;
      if (selectedPayment.bon_id) {
        const related = bons.find((b: Bon) => b.id === selectedPayment.bon_id && (!selectedPayment.bon_type || String(b.type) === String(selectedPayment.bon_type)));
        if (related && related.type === 'Comptant' && !related.client_id) contactOptional = true;
      }
      
      // Debug: afficher les valeurs pour comprendre le problème
      console.log('=== DEBUG getInitialValues ===');
      console.log('selectedPayment:', selectedPayment);
      console.log('selectedPayment.date_paiement:', selectedPayment.date_paiement);
      console.log('typeof date_paiement:', typeof selectedPayment.date_paiement);
      console.log('formatMySQLToDateTimeInput result:', formatMySQLToDateTimeInput(selectedPayment.date_paiement));
      console.log('getCurrentDateTimeInput result:', getCurrentDateTimeInput());
      console.log('=== FIN DEBUG ===');
      
      return {
        type_paiement: selectedPayment.type_paiement || 'Client',
        contact_optional: contactOptional,
        contact_id: selectedPayment.contact_id || '',
        payment_fournisseur: Number((selectedPayment as any).payment || 0) === 1,
        remise_account_id: selectedPayment.remise_account_type === 'direct-client'
          ? (selectedPayment.contact_id ? String(DIRECT_CONTACT_OFFSET + Number(selectedPayment.contact_id)) : '')
          : (selectedPayment.remise_account_id || ''),
        remise_filter_client_remise: selectedPayment.remise_account_type === 'client-remise',
        remise_filter_client_abonne: selectedPayment.remise_account_type !== 'client-remise',
        bon_id: selectedPayment.bon_id ? (selectedPayment.bon_type ? `${selectedPayment.bon_type}:${selectedPayment.bon_id}` : String(selectedPayment.bon_id)) : '',
        bon_type: selectedPayment.bon_type || '',
        montant: selectedPayment.montant || selectedPayment.montant_total,
        montant_ignorer: selectedPayment.montant_ignorer || 0,
        remise: Number(selectedPayment.remise ?? 0) === 1,
        mode_paiement: selectedPayment.mode_paiement,
        statut: selectedPayment.statut || 'En attente',
        date_paiement: formatMySQLToDateTimeInput(selectedPayment.date_paiement) || getCurrentDateTimeInput(),
        notes: selectedPayment.notes || selectedPayment.designation || '',
        banque: selectedPayment.banque || '',
        personnel: selectedPayment.personnel || '',
        date_echeance: selectedPayment.date_echeance || '',
        code_reglement: selectedPayment.code_reglement || '',
        talon_id: selectedPayment.talon_id || '',
        payment_lines: [],
      };
    }
    return {
      type_paiement: 'Client',
      contact_optional: false,
      contact_id: '',
      payment_fournisseur: false,
      remise_account_id: '',
      remise_filter_client_remise: true,
      remise_filter_client_abonne: true,
      bon_id: '',
      bon_type: '',
      montant: 0,
      montant_ignorer: 0,
      remise: false,
      mode_paiement: 'Espèces',
      statut: 'En attente',
      date_paiement: createOpenedAt || getCurrentDateTimeInput(),
      notes: '',
      banque: '',
      personnel: '',
      date_echeance: '',
      code_reglement: '',
      talon_id: '',
      payment_lines: [],
    };
  };

  const handleSubmit = async (values: any) => {
    try {
      const parseBonValue = (raw: any): { bonId: number | null; bonType: string | null } => {
        const s = String(raw ?? '').trim();
        if (!s) return { bonId: null, bonType: null };
        if (s.includes(':')) {
          const [t, id] = s.split(':', 2);
          const bonId = id && String(id).trim() !== '' ? Number(id) : NaN;
          return { bonId: Number.isFinite(bonId) ? bonId : null, bonType: String(t ?? '').trim() || null };
        }
        const bonId = Number(s);
        return { bonId: Number.isFinite(bonId) ? bonId : null, bonType: null };
      };

      const selectedRemiseId = Number(values.remise_account_id || 0);
      const isDirectContact = selectedRemiseId >= DIRECT_CONTACT_OFFSET;
      const directContactId = isDirectContact ? selectedRemiseId - DIRECT_CONTACT_OFFSET : null;
      const selectedRemiseAccount = !isDirectContact && selectedRemiseId
        ? remiseAccounts.find((account) => Number(account.id) === selectedRemiseId)
        : undefined;
      const selectedDirectBalance = isDirectContact
        ? directContactBalances.find((b: any) => Number(b.contact_id) === directContactId)
        : null;
      const mainLine = {
        montant: values.montant,
        montant_ignorer: values.montant_ignorer,
        remise: values.remise,
        mode_paiement: values.mode_paiement,
        date_paiement: values.date_paiement,
        bon_id: values.bon_id,
        talon_id: values.talon_id,
        code_reglement: values.code_reglement,
        banque: values.banque,
        personnel: values.personnel,
        date_echeance: values.date_echeance,
        notes: values.notes,
      };
      const paymentLines = selectedPayment
        ? [mainLine]
        : [
            mainLine,
            ...((Array.isArray(values.payment_lines) ? values.payment_lines : [])
              .filter((line: any) => String(line?.montant ?? '').trim() !== '')),
          ];
      const remiseAmount = paymentLines
        .filter((line: any) => line.mode_paiement === 'Remise')
        .reduce((sum: number, line: any) => sum + Number(line.montant || 0), 0);
      const ignoredRemiseAmount = paymentLines
        .filter((line: any) =>
          Boolean(line.remise) &&
          values.type_paiement === 'Client' &&
          Boolean(values.contact_id) &&
          line.mode_paiement !== 'Remise' &&
          Number(line.montant_ignorer || 0) > 0
        )
        .reduce((sum: number, line: any) => sum + Number(line.montant_ignorer || 0), 0);

      if (ignoredRemiseAmount > 0 && ['En attente', 'Validé'].includes(String(values.statut || ''))) {
        const ordinaryContactId = Number(values.contact_id);
        const authoritativeAccount = clientAbonneAccountByContactId.get(ordinaryContactId);
        const directBalance = directContactBalances.find(
          (balance: any) => Number(balance.contact_id) === ordinaryContactId
        );
        let allowedIgnoredRemise = authoritativeAccount
          ? Number(authoritativeAccount.available_total || 0)
          : Number(directBalance?.available_total || 0);
        if (
          Number(selectedPayment?.remise ?? 0) === 1 &&
          selectedPayment?.mode_paiement !== 'Remise' &&
          Number(selectedPayment?.contact_id) === ordinaryContactId &&
          ['En attente', 'Validé'].includes(String(selectedPayment?.statut || ''))
        ) {
          allowedIgnoredRemise += Number(selectedPayment?.montant_ignorer || 0);
        }
        if (ignoredRemiseAmount > allowedIgnoredRemise + 0.000001) {
          showError(`Le montant ignoré dépasse la remise disponible (${allowedIgnoredRemise.toFixed(2)} DH)`);
          return;
        }
      }

      if (remiseAmount > 0) {
        if (!selectedRemiseAccount && !selectedDirectBalance) {
          showError('Sélectionnez un bénéficiaire remise');
          return;
        }
        let allowedAmount = selectedRemiseAccount
          ? Number(selectedRemiseAccount.available_total || 0)
          : Number(selectedDirectBalance?.available_total || 0);
        if (selectedRemiseAccount && selectedPayment?.mode_paiement === 'Remise' && Number(selectedPayment.remise_account_id || 0) === Number(selectedRemiseAccount.id) && ['En attente', 'Validé'].includes(String(selectedPayment.statut || ''))) {
          allowedAmount += Number(selectedPayment.montant ?? selectedPayment.montant_total ?? 0);
        }
        if (selectedDirectBalance && selectedPayment?.mode_paiement === 'Remise' && !selectedPayment.remise_account_id && Number(selectedPayment.contact_id) === directContactId && ['En attente', 'Validé'].includes(String(selectedPayment.statut || ''))) {
          allowedAmount += Number(selectedPayment.montant ?? selectedPayment.montant_total ?? 0);
        }
        if (remiseAmount > allowedAmount + 0.000001) {
          showError(`Le montant dépasse la remise disponible (${allowedAmount.toFixed(2)} DH)`);
          return;
        }
      }

      // Upload de l'image si présente
      let imageUrl: string | null = selectedPayment?.image_url || '';
      const hasImagePaymentMode = paymentLines.some((line: any) => line.mode_paiement === 'Chèque' || line.mode_paiement === 'Traite');
      if (selectedImage && hasImagePaymentMode) {
        imageUrl = await uploadImageToServer(selectedImage);
      } else if (selectedPayment && !selectedImage && !imagePreview && selectedPayment.image_url) {
        // L'utilisateur a supprimé l'image existante
        imageUrl = null;
      }

  const buildPaymentData = (line: any): any => {
    const lineModePaiement = line.mode_paiement;
    const isLineRemise = lineModePaiement === 'Remise';
    // Normaliser les champs optionnels par ligne (éviter '' pour les colonnes DATE/NULLABLE)
    const lineBon = parseBonValue(line.bon_id);
    const cleanedDatePaiement = formatDateInputToMySQL(line.date_paiement || values.date_paiement); // Datetime-local inclut déjà l'heure
    const cleanedBanque = line.banque?.trim() ? line.banque : null;
    // Le nom de la personne est lié au payeur: les lignes supplémentaires héritent du paiement principal
    const linePersonnel = line.personnel ?? values.personnel;
    const cleanedPersonnel = linePersonnel?.trim() ? linePersonnel : null;
    // date_echeance reste en format DATE (YYYY-MM-DD)
    const cleanedDateEcheance = line.date_echeance?.trim() ? line.date_echeance : null;
    const cleanedCodeReglement = line.code_reglement?.trim() ? line.code_reglement : null;
    const cleanedTalonId = line.talon_id ? Number(line.talon_id) : null;
    return {
        id: selectedPayment ? selectedPayment.id : Date.now(),
      type_paiement: isLineRemise ? 'Client' : (values.type_paiement || 'Client'),
      contact_id: isLineRemise
        ? (isDirectContact ? directContactId : (selectedRemiseAccount?.contact_id ? Number(selectedRemiseAccount.contact_id) : null))
        : (values.contact_id ? Number(values.contact_id) : null),
      payment: values.type_paiement === 'Fournisseur' && values.payment_fournisseur ? 1 : 0,
      remise_account_id: isLineRemise && !isDirectContact && selectedRemiseAccount ? Number(selectedRemiseAccount.id) : null,
      remise_account_type: isLineRemise
        ? (isDirectContact ? 'direct-client' : (selectedRemiseAccount ? selectedRemiseAccount.type : null))
        : null,
      remise_account_name: isLineRemise
        ? (isDirectContact ? (selectedDirectBalance?.nom_complet || null) : (selectedRemiseAccount ? selectedRemiseAccount.nom : null))
        : null,
  bon_id: lineBon.bonId,
  bon_type: lineBon.bonId ? lineBon.bonType : null,
        montant_total: Number(line.montant),
        montant: Number(line.montant), // Alias
        montant_ignorer: Number(line.montant_ignorer || 0),
        remise:
          Boolean(line.remise) &&
          values.type_paiement === 'Client' &&
          Boolean(values.contact_id) &&
          Number(line.montant_ignorer || 0) > 0 &&
          lineModePaiement !== 'Remise'
            ? 1
            : 0,
        mode_paiement: lineModePaiement,
  statut: values.statut,
        date_paiement: cleanedDatePaiement,
        designation: line.notes || '',
        notes: line.notes || '', // Alias
        // champs optionnels normalisés
        banque: cleanedBanque,
        personnel: cleanedPersonnel,
        date_echeance: cleanedDateEcheance,
        code_reglement: cleanedCodeReglement,
        talon_id: cleanedTalonId,
  image_url: imageUrl,
        created_by: user?.id || 1,
        updated_by: selectedPayment ? user?.id || 1 : undefined,
        updated_at: new Date().toISOString(),
      };
  };

  const paymentData: any = buildPaymentData(paymentLines[0]);

      if (selectedPayment) {
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = paymentData;
        await updatePaymentApi({ id: selectedPayment.id, updated_by: user?.id || 1, ...rest }).unwrap();
        showSuccess('Paiement mis à jour avec succès');
        // Fermer le modal après modification
        setIsCreateModalOpen(false);
        setSelectedPayment(null);
        setSelectedImage(null);
        setImagePreview('');
      } else {
        const createdPayments: Payment[] = [];
        // Si plusieurs paiements sont créés depuis le même formulaire,
        // les regrouper avec un identifiant commun (payment_group_id).
        const paymentGroupId = paymentLines.length > 1
          ? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `grp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)
          : null;
        for (const line of paymentLines) {
          const paymentData = buildPaymentData(line);
          const body: any = {
          payment_group_id: paymentGroupId,
          type_paiement: paymentData.type_paiement,
          bon_id: paymentData.bon_id,
          bon_type: paymentData.bon_type,
          remise_account_id: paymentData.remise_account_id,
          remise_account_type: paymentData.remise_account_type,
          remise_account_name: paymentData.remise_account_name,
          montant_total: paymentData.montant_total,
          montant_ignorer: paymentData.montant_ignorer,
          remise: paymentData.remise,
          mode_paiement: paymentData.mode_paiement,
          statut: paymentData.statut,
          date_paiement: paymentData.date_paiement,
          designation: paymentData.designation,
          date_echeance: paymentData.date_echeance,
          banque: paymentData.banque,
          personnel: paymentData.personnel,
          code_reglement: paymentData.code_reglement,
          payment: paymentData.payment,
          talon_id: paymentData.talon_id,
          image_url: paymentData.image_url,
          created_by: user?.id || 1,
        };
        if (paymentData.contact_id !== null) body.contact_id = paymentData.contact_id;
        const created = await createPayment(body).unwrap();
        // Duplication dans old_talons_caisse (legacy) pour TOUT paiement associé à un talon
        try {
          if (created?.talon_id) {
            // Normaliser toutes les dates en format YYYY-MM-DD pour la table legacy
            const toYMD = (d: any): string | null => {
              if (!d) return null;
              if (typeof d === 'string') {
                // 1) si déjà au format (ou commence par) YYYY-MM-DD, prendre les 10 premiers
                if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
                // 2) extraire un motif YYYY-MM-DD si présent dans la chaîne
                const m = d.match(/(\d{4}-\d{2}-\d{2})/);
                if (m) return m[1];
                // 3) tenter une conversion Date() puis ISO
                const dt = new Date(d);
                if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
                return null;
              }
              if (d instanceof Date) {
                return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
              }
              // number ou autre
              const dt = new Date(d);
              return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
            };

            const oldPayload = {
              date_paiement: toYMD(created.date_paiement),
              fournisseur: created.type_paiement === 'Fournisseur'
                ? (fournisseurs.find(f => f.id === created.contact_id)?.nom_complet || 'Fournisseur')
                : (created.mode_paiement === 'Remise'
                  ? (created.remise_account_name || clients.find(c => c.id === created.contact_id)?.nom_complet || 'Client')
                  : (clients.find(c => c.id === created.contact_id)?.nom_complet || 'Client')),
              montant_cheque: Number(created.montant_total || 0),
              // Pour les modes non-chèque/traite, on garde une date_cheque cohérente (date échéance si dispo sinon date paiement)
              date_cheque: toYMD(created.date_echeance) ?? toYMD(created.date_paiement),
              numero_cheque: created.code_reglement || null,
              validation: created.statut || 'En attente',
              banque: created.banque || undefined,
              personne: created.personnel || undefined,
              factures: created.designation || undefined,
              disponible: undefined,
              id_talon: created.talon_id,
            } as const;
            // Post silently; ignore failures so main save succeeds
            await createOldTalonCaisse(oldPayload as any).unwrap().catch(() => {});
          }
        } catch {}
          createdPayments.push(created);
          void createdPayments.length;
        }
  showSuccess('Paiement enregistré avec succès !');
  // Fermer le modal et réinitialiser les champs et l'image
  setIsCreateModalOpen(false);
  setSelectedPayment(null);
  setSelectedImage(null);
  setImagePreview('');
  setCreateOpenedAt(null);
      }
      
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      showError('Erreur lors de la sauvegarde du paiement');
    }
  };

  // Version détaillée (même format que le select: NUMERO - MONTANT DH)
  const getBonInfoDetailed = (bonId?: number, bonType?: string | null) => {
    if (!bonId) return 'Paiement libre';
    const bon = bons.find((b: Bon) => b.id === bonId && (!bonType || String(b.type) === String(bonType)));
    if (!bon) return 'Bon supprimé';
    return `${displayBonNumero(bon)} - ${Number(bon.montant_total ?? 0)} DH`;
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'Espèces':
        return <DollarSign size={16} className="text-green-600" />;
      case 'Chèque':
        return <Receipt size={16} className="text-blue-600" />;
      case 'Virement':
        return <CreditCard size={16} className="text-purple-600" />;
      case 'Traite':
        return <Receipt size={16} className="text-orange-600" />;
      case 'Remise':
        return <Receipt size={16} className="text-amber-600" />;
      default:
        return <DollarSign size={16} className="text-gray-600" />;
    }
  };

  const displayStatut = (s?: string) => {
    if (!s) return '-';
  const norm = String(s).toLowerCase();
  if (norm === 'en attente' || norm === 'attente') return 'En attente';
  if (norm === 'validé' || norm === 'valide') return 'Validé';
  if (norm === 'refusé' || norm === 'refuse') return 'Refusé';
  if (norm === 'annulé' || norm === 'annule') return 'Annulé';
  return s;
  };

  function getStatusClasses(statut?: string) {
    switch (String(statut || '').trim()) {
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

  const getStatusIcon = (statut?: string) => {
  const s = String(statut || '').toLowerCase();
  // Icons should inherit the text color from the badge container
  if (s.includes('en attente') || s === 'attente') return <Clock size={14} className="text-current" />;
  if (s.includes('valid')) return <Check size={14} className="text-current" />;
  // Use XCircle for refusé/annulé to keep a consistent filled cross icon
  if (s.includes('refus')) return <XCircle size={14} className="text-current" />;
  if (s.includes('annul')) return <XCircle size={14} className="text-current" />;
  return null;
  };

  // Format date as YYYY-MM-DD for table display
  const formatYMD = (d?: string) => {
    if (!d) return '';
    if (d === '0000-00-00') return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    if (d.includes('T')) return d.slice(0, 10);
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return d;
  };

  const getReferencePlaceholder = (mode: string) => {
    switch (mode) {
      case 'Chèque':
  return 'Code/Numéro de chèque';
      case 'Virement':
  return 'Code/Numéro de virement';
      case 'Traite':
  return 'Code/Numéro de traite';
      default:
  return 'Code règlement (optionnel)';
    }
  };

  const formatTotalCumule = (value: number) =>
    `${new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} DH`;

  const normalizeContactTotalCumule = (contact?: Contact | null) => {
    const total = contact?.total_cumule;
    return total !== null && total !== undefined ? Number(total) || 0 : null;
  };

  const getTotalCumuleBadgeClasses = (value: number) => {
    if (value > 0) return 'border border-red-200 bg-red-50 text-red-700';
    if (value < 0) return 'border border-green-200 bg-green-50 text-green-700';
    return 'border border-gray-200 bg-gray-100 text-gray-600';
  };

  const getContactSelectLabel = (contact: Contact, kind: 'Client' | 'Fournisseur') => {
    const reference = String(contact.reference || contact.id).trim();
    const totalCumule = normalizeContactTotalCumule(contact);
    return [
      `Réf ${reference}`,
      String(contact.nom_complet || `${kind} #${contact.id}`).trim(),
      contact.societe ? String(contact.societe).trim() : '',
      contact.telephone ? String(contact.telephone).trim() : '',
      `ID ${contact.id}`,
      totalCumule === null ? '' : `Total cumulé ${formatTotalCumule(totalCumule)}`,
    ].filter(Boolean).join(' - ');
  };

  const renderContactSelectContent = (option: { data?: any }) => {
    const contact = option.data as Contact | undefined;
    if (!contact) return null;
    const totalCumule = normalizeContactTotalCumule(contact);

    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700">
          Réf {contact.reference || contact.id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{contact.nom_complet}</span>
          {contact.societe && (
            <span className="block truncate text-xs text-gray-500">{contact.societe}</span>
          )}
        </span>
        {totalCumule !== null && (
          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold sm:ml-auto ${getTotalCumuleBadgeClasses(totalCumule)}`}>
            Total cumulé : {formatTotalCumule(totalCumule)}
          </span>
        )}
      </div>
    );
  };

  const getContactTotalCumule = (contactId: string | number, type: 'Client' | 'Fournisseur') => {
    if (!contactId) return null;
    const source = type === 'Fournisseur' ? fournisseurs : clients;
    const contact = source.find((c: any) => Number(c.id) === Number(contactId));
    return normalizeContactTotalCumule(contact);
  };

  // Rendu d'une ligne de paiement (utilisée pour les paiements simples et les items d'un groupe déplié)
  const renderPaymentRow = (payment: Payment, isGroupChild: boolean) => (
    <tr
      key={payment.id}
      className={`hover:bg-gray-50 transition-colors ${isGroupChild ? 'bg-blue-50/40 border-l-4 border-blue-200' : ''} ${payment.statut === 'Validé' ? (isSupplierFoPayment(payment) ? 'bg-purple-100 border-l-4 border-purple-500/70 shadow-[inset_0_0_0_9999px_rgba(168,85,247,0.06)]' : 'bg-green-100 border-l-4 border-green-500/70 shadow-[inset_0_0_0_9999px_rgba(34,197,94,0.06)]') : ''}`}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <div className={`flex items-center gap-2 ${isGroupChild ? 'pl-8' : ''}`}>
          {isGroupChild && <span className="text-[12px] text-blue-400">↳</span>}
          <div className="text-sm font-medium text-gray-900">{getDisplayNumeroPayment(payment)}</div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-700">{payment.date_paiement ? formatDateTimeWithHour(payment.date_paiement) : '-'}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{getBonInfoDetailed(payment.bon_id, (payment as any).bon_type)}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPaymentTypeBadgeClasses(payment)}`}>
            {getPaymentTypeBadge(payment)}
          </span>
          <span className="truncate max-w-[220px]" title={getPaymentContactName(payment)}>
            {getPaymentContactName(payment)}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 truncate max-w-[220px]" title={getPaymentSociete(payment)}>
          {getPaymentSociete(payment)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {getModeIcon(payment.mode_paiement)}
          <span className="text-sm text-gray-900">{payment.mode_paiement}</span>
          {payment.image_url && (payment.mode_paiement === 'Chèque' || payment.mode_paiement === 'Traite') && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 ml-2">📷 Image</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-xs text-gray-700 max-w-[140px] truncate" title={payment.code_reglement || ''}>
          {payment.code_reglement || '-'}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-semibold text-gray-900">{getPaymentPaidAmount(payment)} DH</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-semibold text-orange-700">{Number(payment.montant_ignorer ?? 0)} DH</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{payment.date_echeance ? formatYMD(payment.date_echeance) : '-'}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div>
          <span className={`inline-flex items-center gap-2 px-2 py-1 text-xs font-semibold rounded-full ${getStatusClasses(displayStatut(payment.statut))}`}>
            {getStatusIcon(displayStatut(payment.statut))}
            {displayStatut(payment.statut)}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{safeText((paymentsMeta as any)[payment.id]?.created_by_name)}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{safeText((paymentsMeta as any)[payment.id]?.updated_by_name)}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 relative" ref={openMenuPaymentId === payment.id ? menuRef : null}>
            {isPdgOrManagerPlus && (
              <button
                onClick={() => changePaymentStatus(payment.id, 'Validé')}
                className={`p-1 rounded ${payment.statut === 'Validé' ? 'text-green-600' : 'text-gray-500 hover:text-green-600'}`}
                title="Valider"
                disabled={payment.statut === 'Validé'}
              >
                <Check size={18} />
              </button>
            )}
            {isPdgOrManagerPlus && (
              <button
                onClick={() => handleEditPayment(payment)}
                className={`p-1 rounded ${normalizePaymentStatut(payment.statut) === 'Validé' ? 'text-gray-300 cursor-not-allowed' : 'text-green-600 hover:text-green-700'}`}
                title={normalizePaymentStatut(payment.statut) === 'Validé' ? "Paiement validé: remettre en attente pour modifier" : 'Modifier'}
                disabled={normalizePaymentStatut(payment.statut) === 'Validé'}
              >
                <Edit size={18} />
              </button>
            )}
            <button
              onClick={() => handlePrintPayment(payment)}
              className="p-1 rounded text-purple-600 hover:text-purple-700"
              title="Imprimer"
            >
              <Printer size={18} />
            </button>
            <button
              onClick={() => setOpenMenuPaymentId(openMenuPaymentId === payment.id ? null : payment.id)}
              className="p-1 rounded text-gray-500 hover:text-gray-700"
              title="Plus"
            >
              <MoreVertical size={18} />
            </button>
            {openMenuPaymentId === payment.id && (
              <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-20 animate-fade-in">
                <ul className="text-xs py-1">
                  <li>
                    <button
                      onClick={() => { handleViewPayment(payment); setOpenMenuPaymentId(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-blue-600"
                    >
                      <Eye size={16} /> Voir
                    </button>
                  </li>
                  <li>
                    {isPdgOrManagerPlus ? (
                      <button
                        onClick={() => { changePaymentStatus(payment.id, 'En attente'); setOpenMenuPaymentId(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-600"
                        disabled={payment.statut === 'En attente'}
                      >
                        <Clock size={16} /> Attente
                      </button>
                    ) : null}
                  </li>
                  {(user?.role === 'PDG' || user?.role === 'ManagerPlus') && (
                    <>
                      <li>
                        <button
                          onClick={() => { changePaymentStatus(payment.id, 'Refusé'); setOpenMenuPaymentId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-orange-600"
                          disabled={payment.statut === 'Refusé'}
                        >
                          <X size={16} /> Refuser
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => { changePaymentStatus(payment.id, 'Annulé'); setOpenMenuPaymentId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-red-600"
                          disabled={payment.statut === 'Annulé'}
                        >
                          <XCircle size={16} /> Annuler
                        </button>
                      </li>
                    </>
                  )}
                  {user?.role === 'PDG' && (
                    <li>
                      <button
                        onClick={() => { handleDelete(payment.id); setOpenMenuPaymentId(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-red-600"
                      >
                        <Trash2 size={16} /> Supprimer
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="p-2 sm:p-3">
      {/* Header avec informations utilisateur */}
      <div className="flex flex-col gap-2 md:flex-row md:justify-between md:items-center mb-4 bg-white rounded-lg shadow p-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Gestion de la Caisse</h1>
          {user && (
            <div className="flex items-center flex-wrap gap-2 text-sm text-gray-600">
              <User size={16} />
              <span className="font-medium truncate max-w-[160px] sm:max-w-none">{user.nom_complet}</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                {user.role}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                canModifyPayments(user) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {canModifyPayments(user) ? '✅ Peut modifier les paiements' : '❌ Lecture seule'}
              </span>
            </div>
          )}
        </div>
  <div className="flex flex-wrap gap-2">
          <Link
            to="/fond-caisse"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-md transition-colors text-sm"
          >
            <Wallet size={18} className="shrink-0" />
            <span className="whitespace-nowrap">Fond caisse / coffre</span>
          </Link>
          <button
            onClick={() => {
              setSelectedPayment(null);
              setSelectedImage(null);
              setImagePreview('');
              setCreateOpenedAt(getCurrentDateTimeInput());
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-md transition-colors text-sm"
          >
            <Plus size={18} className="shrink-0" />
            <span className="whitespace-nowrap">Nouveau Paiement</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded-md transition-colors text-sm"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="whitespace-nowrap">Déconnexion</span>
          </button>
        </div>
      </div>

  {/* Statistiques de caisse */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-4">
    <div className="bg-white p-2 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Encaissements</p>
              <p className="text-2xl font-bold text-gray-900">{totalEncaissements.toFixed(2)} DH</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

  <div className="bg-white p-2 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Espèces</p>
              <p className="text-xl font-bold text-green-600">{totalEspeces} DH</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

  <div className="bg-white p-2 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Chèques</p>
              <p className="text-xl font-bold text-blue-600">{totalCheques} DH</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Receipt className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

  <div className="bg-white p-2 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Virements</p>
              <p className="text-xl font-bold text-purple-600">{totalVirements} DH</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <CreditCard className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

  <div className="bg-white p-2 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Traites</p>
              <p className="text-xl font-bold text-orange-600">{totalTraites} DH</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <Receipt className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>

  <div className="bg-white p-2 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Remises</p>
              <p className="text-xl font-bold text-amber-600">{totalRemises} DH</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-full">
              <Receipt className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="flex flex-col gap-2 md:flex-row md:justify-between md:items-center mb-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-start sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher (N° paiement, Ref client, Nom, Société, Notes, Montant)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setCurrentPage(1);
                  setSearchTerm(searchInput.trim());
                }
              }}
              className="w-full sm:w-72 pl-9 pr-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setCurrentPage(1);
              setSearchTerm(searchInput.trim());
            }}
            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Rechercher
          </button>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar size={16} className="text-gray-500" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-gray-500" />
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as any)}
              className="flex-1 sm:flex-none px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tous les modes</option>
              <option value="Espèces">Espèces</option>
              <option value="Chèque">Chèque</option>
              <option value="Virement">Virement</option>
              <option value="Traite">Traite</option>
              <option value="Remise">Remise</option>
            </select>
          </div>

          <div className="flex items-start gap-2 w-full sm:w-auto">
            <label className="text-sm text-gray-600">Statut</label>
            <select
              multiple
              value={statusFilter}
              onChange={(e) => setStatusFilter(Array.from(e.target.selectedOptions).map(o => o.value))}
              className="px-2 py-1 border border-gray-300 rounded-md h-24 text-sm"
              title="Filtrer par statut (sélection multiple)"
            >
              {availableStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex flex-col gap-1 ml-2 shrink-0">
              <button type="button" className="px-2 py-1 bg-gray-100 rounded text-xs" onClick={() => setStatusFilter([])}>Tous</button>
              <button type="button" className="px-2 py-1 bg-gray-100 rounded text-xs" onClick={() => setStatusFilter([...availableStatuses])}>Tout</button>
            </div>
          </div>
        </div>
        
        <button
          onClick={() => {
            setSearchTerm('');
            setSearchInput('');
            setDateFilter('');
            setModeFilter('all');
            setStatusFilter([]);
            dispatch(resetFilters());
          }}
          className="self-start md:self-auto px-2 py-1 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
        >
          Réinitialiser
        </button>
      </div>

      {/* Table des paiements (desktop) */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <div className="responsive-table-container gradient-mask">
          <table className="responsive-table responsive-table-min divide-y divide-gray-200 text-sm table-sticky-header">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('numero')}
                >
                  <div className="flex items-center gap-1">
                    Numéro
                    {sortField === 'numero' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Date paiement
                    {sortField === 'date' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Bon associé
                </th>
                <th 
                  className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('contact')}
                >
                  <div className="flex items-center gap-1">
                    Client / Fournisseur
                    {sortField === 'contact' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Société
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Mode de paiement
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Règlement
                </th>
                <th 
                  className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('montant')}
                >
                  <div className="flex items-center gap-1">
                    Payé
                    {sortField === 'montant' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('montant_ignorer')}
                >
                  <div className="flex items-center gap-1">
                    Montant ignoré
                    {sortField === 'montant_ignorer' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('echeance')}
                >
                  <div className="flex items-center gap-1">
                    Échéance
                    {sortField === 'echeance' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Statut
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Créé par
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Dernière modif.
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-6 py-4 text-center text-sm text-gray-500">
                    Aucun paiement trouvé
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((payment: Payment) => {
                  const group = getGroupOf(payment);
                  const gid = (payment as any).payment_group_id as string | undefined;
                  const inGroup = !!group;
                  // Première occurrence du groupe dans la liste => on émet la ligne d'en-tête
                  const isGroupFirst = inGroup && group![0]?.id === payment.id;
                  const isExpanded = !!gid && expandedGroups.has(gid);

                  // Membres d'un groupe: rendus uniquement quand le groupe est déplié,
                  // et émis tous ensemble (avec l'en-tête) au niveau de la première occurrence.
                  // Les occurrences suivantes ne rendent rien (déjà rendues par l'en-tête).
                  if (inGroup && !isGroupFirst) return null;

                  if (inGroup && isGroupFirst) {
                    const groupTotal = group!.reduce((s, p) => s + getPaymentPaidAmount(p), 0);
                    const groupTotalIgnorer = group!.reduce((s, p) => s + Number(p.montant_ignorer ?? 0), 0);
                    const premierNum = getDisplayNumeroPayment(group![0]);
                    const dernierNum = getDisplayNumeroPayment(group![group!.length - 1]);
                    const serieLabel = group!.length > 1 ? `${premierNum} → ${dernierNum}` : premierNum;
                    return [
                        /* Ligne d'en-tête du groupe (accordéon) */
                        <tr
                          key={`grp-${gid}`}
                          className="bg-blue-50 border-l-4 border-blue-500 cursor-pointer hover:bg-blue-100 transition-colors"
                          onClick={() => toggleGroup(gid!)}
                        >
                          <td className="px-6 py-3 whitespace-nowrap" colSpan={7}>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleGroup(gid!); }}
                                className="p-0.5 rounded text-blue-600 hover:bg-blue-200"
                                title={isExpanded ? 'Replier le groupe' : 'Déplier le groupe'}
                              >
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </button>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-600 text-white">
                                Groupe ({group!.length})
                              </span>
                              <span className="text-sm font-medium text-blue-900">Série {serieLabel}</span>
                              <span className="text-xs text-blue-700 truncate max-w-[220px]" title={getPaymentContactName(group![0])}>
                                — {getPaymentContactName(group![0])}
                              </span>
                            </div>
                          </td>
                          {/* Total payé */}
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="text-sm font-bold text-blue-800">{groupTotal} DH</div>
                          </td>
                          {/* Total montant ignoré */}
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="text-sm font-bold text-orange-800">{groupTotalIgnorer} DH</div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap" colSpan={4}></td>
                          {/* Actions: imprimer le bon de groupe */}
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePrintGroup(gid!); }}
                              className="p-1 rounded text-blue-600 hover:text-blue-700"
                              title={`Imprimer le bon de groupe (${group!.length} paiements)`}
                            >
                              <Receipt size={18} />
                            </button>
                          </td>
                        </tr>,
                        /* Items du groupe (tous les paiements) quand déplié */
                        ...(isExpanded ? group!.map((member: Payment) => renderPaymentRow(member, true)) : []),
                    ];
                  }

                  // Paiement normal (hors groupe)
                  return renderPaymentRow(payment, false);
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPayments > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Affichage {((currentPage - 1) * itemsPerPage) + 1} à {Math.min(currentPage * itemsPerPage, totalPayments)} sur {totalPayments} paiements
              </div>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={10}>10 par page</option>
                <option value={20}>20 par page</option>
                <option value={50}>50 par page</option>
                <option value={100}>100 par page</option>
              </select>
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPayments > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Affichage {((currentPage - 1) * itemsPerPage) + 1} à {Math.min(currentPage * itemsPerPage, totalPayments)} sur {totalPayments} paiements
              </div>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={10}>10 par page</option>
                <option value={20}>20 par page</option>
                <option value={50}>50 par page</option>
                <option value={100}>100 par page</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Premier
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Précédent
              </button>
              
              <div className="flex items-center gap-1">
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
                      className={`px-3 py-1 text-sm font-medium rounded-md ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Dernier
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contrôles de tri mobile */}
      <div className="md:hidden mb-2 bg-white rounded-lg shadow p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Trier par:</span>
            <select
              value={sortField || ''}
              onChange={(e) => {
                const field = e.target.value as 'numero' | 'date' | 'contact' | 'montant' | 'montant_ignorer' | 'echeance';
                if (field) {
                  handleSort(field);
                }
              }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Sans tri</option>
              <option value="numero">Numéro</option>
              <option value="date">Date</option>
              <option value="contact">Contact</option>
              <option value="montant">Montant</option>
              <option value="montant_ignorer">Montant ignoré</option>
              <option value="echeance">Échéance</option>
            </select>
          </div>
          {sortField && (
            <button
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              className="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              title={`Tri ${sortDirection === 'asc' ? 'croissant' : 'décroissant'}`}
            >
              {sortDirection === 'asc' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Liste mobile des paiements */}
      <div className="md:hidden space-y-2 mb-6">
        {paginatedPayments.length === 0 ? (
          <div className="text-center text-sm text-gray-500 bg-white rounded-lg p-3 shadow">Aucun paiement trouvé</div>
        ) : (
          paginatedPayments.map((payment: Payment) => {
            const contactName = getPaymentContactName(payment);
            const societe = getPaymentSociete(payment);
            return (
              <div
                key={payment.id}
                className={`rounded-lg shadow p-2 flex flex-col gap-2 transition-colors ${payment.statut === 'Validé' ? (isSupplierFoPayment(payment) ? 'bg-purple-100 border-l-4 border-purple-500/70' : 'bg-green-100 border-l-4 border-green-500/70') : 'bg-white'}`}
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-gray-900">{getDisplayNumeroPayment(payment)}</h3>
                    <p className="text-xs text-gray-500">{payment.date_paiement ? formatDateTimeWithHour(payment.date_paiement) : '-'}</p>
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full ${getStatusClasses(displayStatut(payment.statut))}`}>
                      {getStatusIcon(displayStatut(payment.statut))}
                      {displayStatut(payment.statut)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${getPaymentTypeBadgeClasses(payment)}`}>{getPaymentTypeBadge(payment)}</span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{payment.mode_paiement}</span>
                  {payment.image_url && (payment.mode_paiement === 'Chèque' || payment.mode_paiement === 'Traite') && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">Image</span>
                  )}
                </div>
                <div className="text-sm">
                  <p className="font-medium text-gray-800 truncate">{contactName}</p>
                  <p className="text-gray-500 text-xs truncate">{societe}</p>
                  <p className="mt-1 text-gray-700 font-semibold">{getPaymentPaidAmount(payment)} DH</p>
                  <p className="text-xs font-semibold text-orange-700">Montant ignoré: {Number(payment.montant_ignorer ?? 0)} DH</p>
                  {payment.date_echeance && (
                    <p className="text-xs text-gray-500">Échéance: {formatYMD(payment.date_echeance)}</p>
                  )}
                  <p className="text-xs text-gray-500">{getBonInfoDetailed(payment.bon_id, (payment as any).bon_type)}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                    <div>
                      <span className="text-gray-400">Créé par:</span> <span className="text-gray-700">{safeText((paymentsMeta as any)[payment.id]?.created_by_name)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Dernière modif.:</span> <span className="text-gray-700">{safeText((paymentsMeta as any)[payment.id]?.updated_by_name)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {/* Actions principales */}
                  <button onClick={() => handleViewPayment(payment)} className="flex items-center gap-1 text-blue-600 text-xs font-medium px-2 py-1 bg-blue-50 rounded">
                    <Eye size={18} /> Voir
                  </button>
                  {isPdgOrManagerPlus && (
                    <button
                      onClick={() => handleEditPayment(payment)}
                      disabled={normalizePaymentStatut(payment.statut) === 'Validé'}
                      className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${normalizePaymentStatut(payment.statut) === 'Validé' ? 'text-gray-300 bg-gray-50 cursor-not-allowed' : 'text-green-600 bg-green-50'}`}
                      title={normalizePaymentStatut(payment.statut) === 'Validé' ? "Paiement validé: remettre en attente pour modifier" : 'Modifier'}
                    >
                      <Edit size={18} /> Edit
                    </button>
                  )}
                  <button onClick={() => handlePrintPayment(payment)} className="flex items-center gap-1 text-purple-600 text-xs font-medium px-2 py-1 bg-purple-50 rounded">
                    <Printer size={18} /> Imp
                  </button>
                  {user?.role === 'PDG' && (
                    <button onClick={() => handleDelete(payment.id)} className="flex items-center gap-1 text-red-600 text-xs font-medium px-2 py-1 bg-red-50 rounded">
                      <Trash2 size={18} /> Suppr
                    </button>
                  )}
                  {/* Changement de statut condensé */}
                  <div className="flex items-center gap-1 ml-auto">
                    {isPdgOrManagerPlus && (
                      <button onClick={() => changePaymentStatus(payment.id, 'En attente')} className={`p-1 rounded ${payment.statut === 'En attente' ? 'text-yellow-700' : 'text-gray-400'}`} title="En attente">
                        <Clock size={18} />
                      </button>
                    )}
                    {user?.role === 'Employé' ? (
                      <button onClick={() => changePaymentStatus(payment.id, 'Annulé')} className={`p-1 rounded ${payment.statut === 'Annulé' ? 'text-red-700' : 'text-gray-400'}`} title="Annuler">
                        <XCircle size={18} />
                      </button>
                    ) : isPdgOrManagerPlus ? (
                      <>
                        <button onClick={() => changePaymentStatus(payment.id, 'Validé')} className={`p-1 rounded ${payment.statut === 'Validé' ? 'text-green-600' : 'text-gray-400'}`} title="Valider">
                          <Check size={18} />
                        </button>
                        <button onClick={() => changePaymentStatus(payment.id, 'Refusé')} className={`p-1 rounded ${payment.statut === 'Refusé' ? 'text-orange-600' : 'text-gray-400'}`} title="Refuser">
                          <X size={18} />
                        </button>
                        <button onClick={() => changePaymentStatus(payment.id, 'Annulé')} className={`p-1 rounded ${payment.statut === 'Annulé' ? 'text-red-700' : 'text-gray-400'}`} title="Annuler">
                          <XCircle size={18} />
                        </button>
                      </>
                    ) : (
                      // Manager or other roles: only En attente button is available (rendered earlier)
                      null
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Mobile */}
      {totalPayments > 0 && (
        <div className="md:hidden mb-4 bg-white rounded-lg shadow p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalPayments)} sur {totalPayments}
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Préc
              </button>
              
              <div className="flex items-center gap-1 text-sm">
                <span className="font-medium">{currentPage}</span>
                <span className="text-gray-500">/ {totalPages}</span>
              </div>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suiv →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création/édition */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg p-4 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedPayment ? 'Modifier' : 'Enregistrer'} un paiement
                </h2>
                {!selectedPayment && (
                  <p className="text-sm text-blue-600 mt-1">
                    💡 Le formulaire reste ouvert après l'ajout pour permettre la saisie rapide de plusieurs paiements
                  </p>
                )}
              </div>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <Formik
              initialValues={getInitialValues()}
              enableReinitialize
              validationSchema={paymentValidationSchema}
              onSubmit={handleSubmit}
            >
              {({ values, setFieldValue }) => {
                const isFournisseurPayment = values.type_paiement === 'Fournisseur';
                const isRemisePayment = values.mode_paiement === 'Remise';
                const canUseIgnoredRemise =
                  !isFournisseurPayment &&
                  Boolean(values.contact_id) &&
                  Number(values.montant_ignorer || 0) > 0 &&
                  !isRemisePayment;
                const selectedRemiseId = Number(values.remise_account_id || 0);
                const filteredRemiseAccounts: RemisePaymentAccount[] = [];
                if (values.remise_filter_client_remise) {
                  for (const acc of remiseAccounts) {
                    if (acc.type !== 'client-remise') continue;
                    if (Number(acc.available_total || 0) > 0 || Number(acc.id) === selectedRemiseId)
                      filteredRemiseAccounts.push(acc);
                  }
                }
                if (values.remise_filter_client_abonne) {
                  for (const acc of directClientAbonneAccounts) {
                    if (Number(acc.available_total || 0) > 0 || Number(acc.id) === selectedRemiseId)
                      filteredRemiseAccounts.push(acc);
                  }
                }
                const _isDirectContact = selectedRemiseId >= DIRECT_CONTACT_OFFSET;
                const _directContactId = _isDirectContact ? selectedRemiseId - DIRECT_CONTACT_OFFSET : null;
                const selectedRemiseAccount = !_isDirectContact && selectedRemiseId
                  ? remiseAccounts.find((account) => Number(account.id) === selectedRemiseId)
                  : null;
                const selectedDirectBalance = _isDirectContact
                  ? directContactBalances.find((b: any) => Number(b.contact_id) === _directContactId)
                  : null;
                const allowedRemiseAmount = (() => {
                  if (selectedRemiseAccount) {
                    let total = Number(selectedRemiseAccount.available_total || 0);
                    if (selectedPayment?.mode_paiement === 'Remise' && Number(selectedPayment.remise_account_id || 0) === Number(selectedRemiseAccount.id) && ['En attente', 'Validé'].includes(String(selectedPayment.statut || ''))) {
                      total += Number(selectedPayment.montant ?? selectedPayment.montant_total ?? 0);
                    }
                    return total;
                  }
                  if (selectedDirectBalance) {
                    let total = Number(selectedDirectBalance.available_total || 0);
                    if (selectedPayment?.mode_paiement === 'Remise' && !selectedPayment.remise_account_id && Number(selectedPayment.contact_id) === _directContactId && ['En attente', 'Validé'].includes(String(selectedPayment.statut || ''))) {
                      total += Number(selectedPayment.montant ?? selectedPayment.montant_total ?? 0);
                    }
                    return total;
                  }
                  return 0;
                })();
                return (
                <Form
                  className="space-y-6"
                  onKeyDown={(e: React.KeyboardEvent<HTMLFormElement>) => {
                    const target = e.target as HTMLElement | null;

                    // Navigation avec flèches gauche/droite: navigation globale précédent/suivant si curseur aux bords
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      const formEl = e.currentTarget as HTMLFormElement;
                      // Calculer si on doit déplacer le focus
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

                      // Collecter les éléments focusables
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
                        // Si l'élément suivant est notre SearchableSelect, laisser onFocus l'ouvrir automatiquement
                        // (autoOpenOnFocus gère l'ouverture et le focus de la recherche)
                        // Essayer de sélectionner tout le texte pour les inputs
                        try {
                          if ((nextEl as any).select) (nextEl as any).select();
                        } catch {}
                      }
                    }

                    // Navigation haut/bas pour se déplacer verticalement entre les champs
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      const formEl = e.currentTarget as HTMLFormElement;
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
                      
                      // Pour la navigation verticale, on cherche l'élément dans la ligne suivante/précédente
                      const delta = e.key === 'ArrowDown' ? 3 : -3; // grid-cols-3, donc on saute de 3 éléments
                      let nextIndex = currentIndex + delta;
                      nextIndex = Math.max(0, Math.min(focusables.length - 1, nextIndex));
                      const nextEl = focusables[nextIndex];
                      if (nextEl) {
                        e.preventDefault();
                        nextEl.focus();
                        // Si l'élément suivant est notre SearchableSelect, laisser onFocus l'ouvrir automatiquement
                        // (autoOpenOnFocus gère l'ouverture et le focus de la recherche)
                        // Essayer de sélectionner tout le texte pour les inputs
                        try {
                          if ((nextEl as any).select) (nextEl as any).select();
                        } catch {}
                      }
                    }
                  }}
                >
                  {/* Payeur: type de paiement + client/fournisseur seulement */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="type_paiement" className="block text-sm font-medium text-gray-700 mb-1">
                        Type de paiement
                      </label>
                      {isRemisePayment ? (
                        <div className="w-full border border-amber-200 bg-amber-50 text-amber-800 rounded-md px-3 py-2 text-sm font-medium">
                          Client via remise
                        </div>
                      ) : (
                        <Field
                          as="select"
                          id="type_paiement"
                          name="type_paiement"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onChange={(e: any) => {
                            setFieldValue('type_paiement', e.target.value);
                            setFieldValue('contact_id', '');
                            setFieldValue('payment_fournisseur', false);
                            setFieldValue('bon_id', '');
                          }}
                        >
                          <option value="Client">Client</option>
                          <option value="Fournisseur">Fournisseur</option>
                        </Field>
                      )}
                    </div>
                    <div>
                      {isRemisePayment ? (
                        <>
                          <label htmlFor="remise_account_id" className="block text-sm font-medium text-gray-700 mb-1">
                            Bénéficiaire remise *
                          </label>
                          <div className="flex items-center gap-4 mb-2 text-sm text-gray-700">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={Boolean(values.remise_filter_client_remise)}
                                onChange={(e) => {
                                  setFieldValue('remise_filter_client_remise', e.target.checked);
                                  setFieldValue('remise_account_id', '');
                                  setFieldValue('contact_id', '');
                                  setFieldValue('bon_id', '');
                                }}
                              />
                              Client remise
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={Boolean(values.remise_filter_client_abonne)}
                                onChange={(e) => {
                                  setFieldValue('remise_filter_client_abonne', e.target.checked);
                                  setFieldValue('remise_account_id', '');
                                  setFieldValue('contact_id', '');
                                  setFieldValue('bon_id', '');
                                }}
                              />
                              Clients (bons)
                            </label>
                          </div>
                          <SearchableSelect
                            id="remise_account_id"
                            options={filteredRemiseAccounts.map((account) => ({
                              value: String(account.id),
                              label: [
                                account.nom,
                                account.contact_nom || '',
                                account.contact_reference || '',
                                account.contact_societe || '',
                                getRemiseTypeLabel(account.type),
                                `${Number(account.available_total || 0).toFixed(2)} DH`,
                              ].filter(Boolean).join(' - '),
                              data: account,
                            }))}
                            value={values.remise_account_id ? String(values.remise_account_id) : ''}
                            onChange={(value) => {
                              const numVal = Number(value);
                              const account = remiseAccounts.find((entry) => Number(entry.id) === numVal);
                              const directAcc = !account ? directClientAbonneAccounts.find((a) => Number(a.id) === numVal) : null;
                              setFieldValue('remise_account_id', value);
                              setFieldValue('type_paiement', 'Client');
                              setFieldValue('contact_optional', true);
                              setFieldValue('contact_id',
                                account?.contact_id ? String(account.contact_id) :
                                (directAcc?.contact_id ? String(directAcc.contact_id) : '')
                              );
                              setFieldValue('bon_id', '');
                            }}
                            placeholder="Sélectionner un bénéficiaire remise"
                            className="w-full"
                            autoOpenOnFocus={true}
                          />
                          <ErrorMessage name="remise_account_id" component="div" className="text-red-500 text-sm mt-1" />
                          {(selectedRemiseAccount || selectedDirectBalance) && (
                            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
                              <div>Type: {getRemiseTypeLabel(selectedRemiseAccount?.type ?? (selectedDirectBalance ? 'direct-client' : undefined))}</div>
                              <div>Total gagné: {Number(selectedRemiseAccount?.earned_total ?? selectedDirectBalance?.earned_total ?? 0).toFixed(2)} DH</div>
                              <div>Remise utilisée: {Number(selectedRemiseAccount?.used_total ?? selectedDirectBalance?.used_total ?? 0).toFixed(2)} DH</div>
                              <div className="font-semibold">Disponible: {allowedRemiseAmount.toFixed(2)} DH</div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <label htmlFor="contact_id" className="block text-sm font-medium text-gray-700 mb-1">
                            {isFournisseurPayment ? 'Fournisseur payeur' : 'Client payeur'} {values.contact_optional ? '' : '*'}
                          </label>
                          <SearchableSelect
                            id="contact_id_select"
                            options={(isFournisseurPayment ? fournisseurs : clients).map((c: Contact) => ({
                              value: String(c.id),
                              label: getContactSelectLabel(c, isFournisseurPayment ? 'Fournisseur' : 'Client'),
                              data: c,
                            }))}
                            value={values.contact_id ? String(values.contact_id) : ''}
                            onChange={(v) => { setFieldValue('contact_id', v); setFieldValue('contact_optional', false); setFieldValue('bon_id', ''); }}
                            placeholder={isFournisseurPayment ? 'Sélectionner un fournisseur' : 'Sélectionner un client'}
                            className="w-full"
                            autoOpenOnFocus={true}
                            renderOption={renderContactSelectContent}
                            renderValue={renderContactSelectContent}
                          />
                          <ErrorMessage name="contact_id" component="div" className="text-red-500 text-sm mt-1" />
                          {isFournisseurPayment && values.contact_id && (
                            <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={Boolean(values.payment_fournisseur)}
                                onChange={(e) => setFieldValue('payment_fournisseur', e.target.checked)}
                              />
                              Payment fournisseur
                            </label>
                          )}
                          {values.contact_id && (() => {
                            const totalCumule = getContactTotalCumule(values.contact_id, isFournisseurPayment ? 'Fournisseur' : 'Client');
                            if (totalCumule === null) return null;
                            return (
                              <div className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-semibold ${getTotalCumuleBadgeClasses(totalCumule)}`}>
                                Total cumulé : {formatTotalCumule(totalCumule)}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                  {/* Numéro supprimé: il sera égal à l'ID automatiquement */}

                  {/* Premier paiement: section séparée comme les paiements supplémentaires */}
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-900">Paiement 1</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div>
                      <label htmlFor="date_paiement" className="block text-sm font-medium text-gray-700 mb-1">
                        Date et heure de paiement *
                      </label>
                      <Field
                        id="date_paiement"
                        name="date_paiement"
                        type="datetime-local"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="date_paiement" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="montant" className="block text-sm font-medium text-gray-700 mb-1">
                        Montant *
                      </label>
                      <Field
                        id="montant"
                        name="montant"
                        type="number"
                        step="0.01"
                        max={isRemisePayment && selectedRemiseAccount ? allowedRemiseAmount : undefined}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="montant" component="div" className="text-red-500 text-sm mt-1" />
                      {isRemisePayment && selectedRemiseAccount && (
                        <p className="text-xs text-amber-700 mt-1">Maximum disponible: {allowedRemiseAmount.toFixed(2)} DH</p>
                      )}
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label htmlFor="montant_ignorer" className="block text-sm font-medium text-gray-700 mb-1">
                        Montant ignoré
                      </label>
                      <div className="flex items-stretch">
                        <Field
                          id="montant_ignorer"
                          name="montant_ignorer"
                          type="number"
                          step="0.01"
                          min="0"
                          className="min-w-0 flex-1 rounded-l-md border border-gray-300 px-3 py-2 focus:z-10 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <label
                          className={`inline-flex select-none items-center gap-2 rounded-r-md border border-l-0 px-3 text-sm font-medium transition-colors ${
                            canUseIgnoredRemise
                              ? 'cursor-pointer border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                              : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                          }`}
                        >
                          <Field
                            type="checkbox"
                            name="remise"
                            disabled={!canUseIgnoredRemise}
                            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-2 focus:ring-amber-500"
                          />
                          Remise
                        </label>
                      </div>
                      <p className="mt-1 text-xs text-amber-700">
                        Cochée, cette somme est déduite du solde remise du client.
                      </p>
                      <ErrorMessage name="montant_ignorer" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="mode_paiement" className="block text-sm font-medium text-gray-700 mb-1">
                        Mode de paiement *
                      </label>
                      <Field
                        as="select"
                        id="mode_paiement"
                        name="mode_paiement"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e: any) => {
                          const nextMode = e.target.value;
                          setFieldValue('mode_paiement', nextMode);
                          if (nextMode === 'Remise') {
                            setFieldValue('remise', false);
                            setFieldValue('type_paiement', 'Client');
                            setFieldValue('contact_optional', true);
                            setFieldValue('contact_id', '');
                            setFieldValue('bon_id', '');
                          } else {
                            setFieldValue('remise_account_id', '');
                            setFieldValue('remise_filter_client_remise', true);
                            setFieldValue('remise_filter_client_abonne', true);
                            setFieldValue('contact_optional', false);
                          }
                        }}
                      >
                        <option value="Espèces">Espèces</option>
                        <option value="Chèque">Chèque (avec possibilité d'image)</option>
                        <option value="Virement">Virement</option>
                        <option value="Traite">Traite (avec possibilité d'image)</option>
                        <option value="Remise">Remise</option>
                      </Field>
                      <ErrorMessage name="mode_paiement" component="div" className="text-red-500 text-sm mt-1" />
                      <p className="text-xs text-gray-500 mt-1">
                        {isRemisePayment ? 'Le paiement remise est limité par le total disponible du bénéficiaire sélectionné.' : '💡 Sélectionnez "Chèque" ou "Traite" pour pouvoir ajouter une image'}
                      </p>
                    </div>

                    {/* statut removed from creation modal: default kept as 'En attente' server-side */}

                    <div>
                      <label htmlFor="bon_id" className="block text-sm font-medium text-gray-700 mb-1">
                        Bon associé (optionnel)
                      </label>
                      <Field
                        as="select"
                        id="bon_id"
                        name="bon_id"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e: any) => onBonChange(e, setFieldValue, (values.type_paiement as 'Client'|'Fournisseur'))}
                      >
                        <option value="">Paiement libre (sans bon associé)</option>
                        {(!values.contact_id && !isRemisePayment) || (isRemisePayment && !selectedRemiseAccount?.contact_id) || bonsLoading
                          ? <option disabled>{bonsLoading ? 'Chargement...' : (isRemisePayment ? 'Aucun bon disponible pour ce bénéficiaire' : 'Sélectionnez un contact d\'abord')}</option>
                          : bons
                              .filter((b: any) => {
                                const cid = isRemisePayment ? selectedRemiseAccount?.contact_id : values.contact_id;
                                if (!cid) return false;
                                const clientMatch = !isFournisseurPayment && (String(b.client_id) === String(cid) || String(b.fournisseur_id) === String(cid));
                                const fournisseurMatch = isFournisseurPayment && String(b.fournisseur_id) === String(cid);
                                return clientMatch || fournisseurMatch;
                              })
                              .map((b: any) => {
                                const dateStr = b.date_creation ? new Date(b.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                                const montant = Number(b.montant_total ?? 0).toFixed(2);
                                const num = b.numero ?? `#${b.id}`;
                                return (
                                  <option key={`${b.type}:${b.id}`} value={`${b.type}:${b.id}`}>
                                    {dateStr} | {num} | {montant} DH
                                  </option>
                                );
                              })
                        }
                      </Field>
                    </div>

                    <div>
                      <label htmlFor="talon_id" className="block text-sm font-medium text-gray-700 mb-1">
                        Talon associé (optionnel)
                      </label>
                      <Field
                        as="select"
                        id="talon_id"
                        name="talon_id"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Aucun talon</option>
                        {talons.map((talon: any) => (
                          <option key={talon.id} value={talon.id}>
                            {talon.nom} {talon.phone ? `- ${talon.phone}` : ''}
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage name="talon_id" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="code_reglement" className="block text-sm font-medium text-gray-700 mb-1">
                        Code règlement (optionnel)
                      </label>
                      <Field
                        id="code_reglement"
                        name="code_reglement"
                        type="text"
                        placeholder={getReferencePlaceholder(values.mode_paiement)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="code_reglement" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    {/* Champs optionnels pour tous les types de paiement */}
                    <div>
                      <label htmlFor="banque" className="block text-sm font-medium text-gray-700 mb-1">
                        Banque (optionnel)
                      </label>
                      <Field
                        id="banque"
                        name="banque"
                        type="text"
                        placeholder="Ex: BMCE Bank"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="banque" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="date_echeance" className="block text-sm font-medium text-gray-700 mb-1">
                        Date d'échéance (optionnel)
                      </label>
                      <Field
                        id="date_echeance"
                        name="date_echeance"
                        type="date"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="date_echeance" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    {/* Upload d'image seulement pour Chèque et Traite */}
                    {(values.mode_paiement === 'Chèque' || values.mode_paiement === 'Traite') && (
                      <div className="col-span-2 md:col-span-3">
                        <label htmlFor="file_input" className="block text-sm font-medium text-gray-700 mb-1">
                          📷 Image du {values.mode_paiement === 'Chèque' ? 'chèque' : 'traite'} (optionnel)
                        </label>
                        <div className="space-y-3">
                          {imagePreview && (
                            <div className="relative inline-block">
                              <img
                                src={imagePreview.startsWith('http') || imagePreview.startsWith('blob:') 
                                  ? imagePreview 
                                  : toBackendUrl(imagePreview)}
                                alt="Preview"
                                className="w-full max-w-xs h-32 object-cover rounded-lg border shadow-sm"
                                onError={(e) => {
                                  console.error('Erreur chargement preview:', imagePreview);
                                  e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRkZGIiBzdHJva2U9IiNEREQiLz4KPHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHg9IjMwIiB5PSIzMCI+CjxwYXRoIGQ9Ik04MCAyMEgyMEM5LjcgMjAgMCA5LjMgMCAyMFYzMEgxMDBWMjBDMTAwIDkuMyA5MC4zIDIwIDgwIDIwWiIgZmlsbD0iI0NDQyIvPgo8L3N2Zz4KPC9zdmc+';
                                }}
                              />
                              <button
                                type="button"
                                onClick={removeImage}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-md"
                                title="Supprimer l'image"
                                disabled={uploadingImage}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          )}
                          {uploadingImage && (
                            <div className="flex items-center gap-2 text-blue-600">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span className="text-sm">Upload en cours...</span>
                            </div>
                          )}
                          <input
                            id="file_input"
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <p className="text-xs text-gray-500">
                            📁 Formats acceptés: JPEG, JPG, PNG, GIF (taille illimitée)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <Field
                      as="textarea"
                      id="notes"
                      name="notes"
                      rows="3"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Informations complémentaires..."
                    />
                  </div>
                  </div>

                  {!selectedPayment && (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">Paiements supplementaires</h3>
                          <p className="text-xs text-gray-500">Chaque paiement ajoute possede ses propres champs (montant, mode, date, bon, talon, banque...).</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFieldValue('payment_lines', [
                            ...(Array.isArray(values.payment_lines) ? values.payment_lines : []),
                            {
                              montant: '',
                              montant_ignorer: '',
                              remise: false,
                              mode_paiement: values.mode_paiement || 'Espèces',
                              date_paiement: values.date_paiement || getCurrentDateTimeInput(),
                              bon_id: '',
                              talon_id: '',
                              code_reglement: '',
                              banque: '',
                              date_echeance: '',
                              notes: '',
                            },
                          ])}
                          className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                        >
                          <Plus size={16} />
                          Ajouter un paiement
                        </button>
                      </div>

                      {Array.isArray(values.payment_lines) && values.payment_lines.length > 0 && (
                        <div className="space-y-3">
                          {values.payment_lines.map((line: any, index: number) => (
                            <div key={index} className="rounded-md border border-gray-200 bg-white p-4">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <h4 className="text-sm font-semibold text-gray-800">Paiement {index + 2}</h4>
                                <button
                                  type="button"
                                  onClick={() => setFieldValue(
                                    'payment_lines',
                                    (Array.isArray(values.payment_lines) ? values.payment_lines : []).filter((_: any, i: number) => i !== index)
                                  )}
                                  className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 px-3 text-red-600 hover:bg-red-50"
                                  title="Supprimer ce paiement"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Date et heure de paiement
                                  </label>
                                  <Field
                                    name={`payment_lines.${index}.date_paiement`}
                                    type="datetime-local"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <ErrorMessage name={`payment_lines.${index}.date_paiement`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Montant *
                                  </label>
                                  <Field
                                    name={`payment_lines.${index}.montant`}
                                    type="number"
                                    step="0.01"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <ErrorMessage name={`payment_lines.${index}.montant`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Montant ignoré
                                  </label>
                                  <div className="flex items-stretch">
                                    <Field
                                      name={`payment_lines.${index}.montant_ignorer`}
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      className="min-w-0 flex-1 rounded-l-md border border-gray-300 px-3 py-2 focus:z-10 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                    <label
                                      className={`inline-flex select-none items-center gap-2 rounded-r-md border border-l-0 px-2 text-xs font-medium transition-colors ${
                                        !isFournisseurPayment &&
                                        Boolean(values.contact_id) &&
                                        Number(line.montant_ignorer || 0) > 0 &&
                                        line.mode_paiement !== 'Remise'
                                          ? 'cursor-pointer border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                          : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                      }`}
                                    >
                                      <Field
                                        type="checkbox"
                                        name={`payment_lines.${index}.remise`}
                                        disabled={
                                          isFournisseurPayment ||
                                          !values.contact_id ||
                                          Number(line.montant_ignorer || 0) <= 0 ||
                                          line.mode_paiement === 'Remise'
                                        }
                                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-2 focus:ring-amber-500"
                                      />
                                      Remise
                                    </label>
                                  </div>
                                  <p className="mt-1 text-xs text-amber-700">
                                    Déduit ce montant du solde remise du client.
                                  </p>
                                  <ErrorMessage name={`payment_lines.${index}.montant_ignorer`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Mode de paiement *
                                  </label>
                                  <Field
                                    as="select"
                                    name={`payment_lines.${index}.mode_paiement`}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="Espèces">Espèces</option>
                                    <option value="Chèque">Chèque</option>
                                    <option value="Virement">Virement</option>
                                    <option value="Traite">Traite</option>
                                    <option value="Remise">Remise</option>
                                  </Field>
                                  <ErrorMessage name={`payment_lines.${index}.mode_paiement`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Bon associé (optionnel)
                                  </label>
                                  <Field
                                    as="select"
                                    name={`payment_lines.${index}.bon_id`}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Paiement libre (sans bon associé)</option>
                                    {(!values.contact_id && !isRemisePayment) || (isRemisePayment && !selectedRemiseAccount?.contact_id) || bonsLoading
                                      ? <option disabled>{bonsLoading ? 'Chargement...' : (isRemisePayment ? 'Aucun bon disponible pour ce bénéficiaire' : 'Sélectionnez un contact d\'abord')}</option>
                                      : bons
                                          .filter((b: any) => {
                                            const cid = isRemisePayment ? selectedRemiseAccount?.contact_id : values.contact_id;
                                            if (!cid) return false;
                                            const clientMatch = !isFournisseurPayment && (String(b.client_id) === String(cid) || String(b.fournisseur_id) === String(cid));
                                            const fournisseurMatch = isFournisseurPayment && String(b.fournisseur_id) === String(cid);
                                            return clientMatch || fournisseurMatch;
                                          })
                                          .map((b: any) => {
                                            const dateStr = b.date_creation ? new Date(b.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                                            const montantBon = Number(b.montant_total ?? 0).toFixed(2);
                                            const numBon = b.numero ?? `#${b.id}`;
                                            return (
                                              <option key={`${b.type}:${b.id}`} value={`${b.type}:${b.id}`}>
                                                {dateStr} | {numBon} | {montantBon} DH
                                              </option>
                                            );
                                          })
                                    }
                                  </Field>
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Talon associé (optionnel)
                                  </label>
                                  <Field
                                    as="select"
                                    name={`payment_lines.${index}.talon_id`}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Aucun talon</option>
                                    {talons.map((talon: any) => (
                                      <option key={talon.id} value={talon.id}>
                                        {talon.nom} {talon.phone ? `- ${talon.phone}` : ''}
                                      </option>
                                    ))}
                                  </Field>
                                  <ErrorMessage name={`payment_lines.${index}.talon_id`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Code règlement (optionnel)
                                  </label>
                                  <Field
                                    name={`payment_lines.${index}.code_reglement`}
                                    type="text"
                                    placeholder={getReferencePlaceholder(line.mode_paiement)}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <ErrorMessage name={`payment_lines.${index}.code_reglement`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Banque (optionnel)
                                  </label>
                                  <Field
                                    name={`payment_lines.${index}.banque`}
                                    type="text"
                                    placeholder="Ex: BMCE Bank"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <ErrorMessage name={`payment_lines.${index}.banque`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Date d'échéance (optionnel)
                                  </label>
                                  <Field
                                    name={`payment_lines.${index}.date_echeance`}
                                    type="date"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <ErrorMessage name={`payment_lines.${index}.date_echeance`} component="div" className="mt-1 text-sm text-red-500" />
                                </div>
                                <div className="col-span-2 md:col-span-3">
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Notes
                                  </label>
                                  <Field
                                    as="textarea"
                                    name={`payment_lines.${index}.notes`}
                                    rows="2"
                                    placeholder="Informations complémentaires..."
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                    >
                      {selectedPayment ? 'Mettre à jour' : 'Enregistrer et continuer'}
                    </button>
                  </div>
                </Form>
                );
              }}
            </Formik>
          </div>
        </div>
      )}

      {/* Modal de visualisation */}
      {isViewModalOpen && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Détails du Paiement {getDisplayNumeroPayment(selectedPayment)}</h2>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-600">Numéro:</p>
                  <p className="text-lg">{getDisplayNumeroPayment(selectedPayment)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Date de paiement:</p>
                  <p className="text-lg">{selectedPayment.date_paiement ? formatYMD(selectedPayment.date_paiement) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Payé:</p>
                  <p className="text-xl font-bold text-blue-600">{getPaymentPaidAmount(selectedPayment)} DH</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Montant ignoré:</p>
                  <p className="text-xl font-bold text-orange-700">{Number(selectedPayment.montant_ignorer ?? 0)} DH</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Mode de paiement:</p>
                  <div className="flex items-center gap-2">
                    {getModeIcon(selectedPayment.mode_paiement)}
                    <span className="text-lg">{selectedPayment.mode_paiement}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Bon associé:</p>
                  <p className="text-lg">{selectedPayment.bon_id }</p>
                </div>
                
                
                {/* Affichage des champs spécifiques aux chèques, traites et virements */}
                {(selectedPayment.mode_paiement === 'Chèque' || selectedPayment.mode_paiement === 'Traite' || selectedPayment.mode_paiement === 'Virement') && (
                  <>
          {selectedPayment.code_reglement && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Code règlement:</p>
            <p className="text-lg">{selectedPayment.code_reglement}</p>
                      </div>
                    )}
                    {selectedPayment.banque && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Banque:</p>
                        <p className="text-lg">{selectedPayment.banque}</p>
                      </div>
                    )}
                    {selectedPayment.personnel && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Nom de la personne:</p>
                        <p className="text-lg">{selectedPayment.personnel}</p>
                      </div>
                    )}
          {selectedPayment.date_echeance && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Date d'échéance:</p>
            <p className="text-lg">{formatYMD(selectedPayment.date_echeance)}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Affichage de l'image du chèque/traite */}
              {selectedPayment.image_url && (selectedPayment.mode_paiement === 'Chèque' || selectedPayment.mode_paiement === 'Traite') && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-600 mb-3">
                    Image du {selectedPayment.mode_paiement === 'Chèque' ? 'chèque' : 'traite'}:
                  </p>
                  <div className="border rounded-lg overflow-hidden shadow-sm bg-gray-50 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Construire l'URL complète de l'image
                        const imageUrl = selectedPayment.image_url || '';
                        const fullImageUrl = imageUrl.startsWith('http') 
                          ? imageUrl 
                          : toBackendUrl(imageUrl);
                        window.open(fullImageUrl, '_blank');
                      }}
                      className="w-full focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      title="Cliquer pour agrandir"
                    >
                      <img
                        src={(() => {
                          const imageUrl = selectedPayment.image_url || '';
                          return imageUrl.startsWith('http') 
                            ? imageUrl 
                            : toBackendUrl(imageUrl);
                        })()}
                        alt={`${selectedPayment.mode_paiement} ${selectedPayment.id}`}
                        className="w-full max-w-lg h-auto max-h-64 object-contain mx-auto rounded hover:opacity-90 transition-opacity"
                        onError={(e) => {
                          // En cas d'erreur de chargement, masquer l'image
                          console.error('Erreur chargement image:', selectedPayment.image_url);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </button>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      Cliquez sur l'image pour l'agrandir
                    </p>
                  </div>
                </div>
              )}

              {selectedPayment.notes && (
                <div>
                  <p className="text-sm font-semibold text-gray-600">Notes:</p>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-md">{selectedPayment.notes}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-xs text-gray-500">
                  Date de paiement: {selectedPayment.date_paiement ? new Date(selectedPayment.date_paiement).toLocaleString('fr-FR') : '-'}
                  {selectedPayment.updated_at && (
                    <>
                      <br />
                      Modifié le {new Date(selectedPayment.updated_at).toLocaleString('fr-FR')}
                    </>
                  )}
                </p>
              </div>

              <div className="flex justify-end space-x-6 pt-4">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Fermer
                </button>
                <button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    handleEditPayment(selectedPayment);
                  }}
                  disabled={normalizePaymentStatut((selectedPayment as any)?.statut) === 'Validé'}
                  className={`px-4 py-2 rounded-md ${normalizePaymentStatut((selectedPayment as any)?.statut) === 'Validé' ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  title={normalizePaymentStatut((selectedPayment as any)?.statut) === 'Validé' ? "Paiement validé: remettre en attente pour modifier" : 'Modifier'}
                >
                  Modifier
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                >
                  Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'impression paiement */}
      {isPrintModalOpen && selectedPayment && (
        <PaymentPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          payment={selectedPayment}
          client={selectedPayment.type_paiement === 'Client' ? clients.find(c => c.id === selectedPayment.contact_id) : undefined}
          fournisseur={selectedPayment.type_paiement === 'Fournisseur' ? fournisseurs.find(f => f.id === selectedPayment.contact_id) : undefined}
          allPayments={paymentsForHistory}
        />
      )}

      {/* Modal d'impression groupe de paiements */}
      {groupPrintId && groupPaymentsToPrint.length > 0 && (
        <PaymentGroupPrintModal
          isOpen={!!groupPrintId}
          onClose={() => setGroupPrintId(null)}
          payments={groupPaymentsToPrint}
          getContactName={getPaymentContactName}
          getSociete={getPaymentSociete}
          client={groupPaymentsToPrint[0]?.type_paiement === 'Client' ? clients.find(c => c.id === groupPaymentsToPrint[0]?.contact_id) : undefined}
          fournisseur={groupPaymentsToPrint[0]?.type_paiement === 'Fournisseur' ? fournisseurs.find(f => f.id === groupPaymentsToPrint[0]?.contact_id) : undefined}
        />
      )}
    </div>
  );
};

export default CaissePage;
