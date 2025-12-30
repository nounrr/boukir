import React, { useMemo, useState } from 'react';
import {
  Plus, Edit, Trash2, Search, Users, Truck, Phone, Mail, MapPin,
  CreditCard, Building2, DollarSign, Eye, Printer, Calendar, FileText,
  ChevronUp, ChevronDown, Receipt, AlertTriangle, Settings, Send
} from 'lucide-react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import type { Contact } from '../types'; // Contact now includes optional solde_cumule from backend
import {
  useGetClientsQuery,
  useGetFournisseursQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation
} from '../store/api/contactsApi';
import { useCreateClientRemiseMutation, useCreateRemiseItemMutation, useLazyGetClientAbonneByContactQuery } from '../store/api/remisesApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import { useGetProductsQuery } from '../store/api/productsApi';
import { useGetPaymentsQuery } from '../store/api/paymentsApi';
import ContactFormModal from '../components/ContactFormModal';
import { useGetArtisanRequestsQuery, useApproveArtisanRequestMutation, useRejectArtisanRequestMutation } from '../store/api/notificationsApi';
import ContactPrintModal from '../components/ContactPrintModal';
import ContactPrintTemplate from '../components/ContactPrintTemplate';
import PeriodConfig from '../components/PeriodConfig';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { formatDateDMY, formatDateTimeWithHour } from '../utils/dateUtils';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import logo from '../components/logo.png';
import { generatePDFBlobFromElement } from '../utils/pdf';
import { uploadBonPdf } from '../utils/uploads';
// Validation du formulaire de contact
const contactValidationSchema = Yup.object({
  nom_complet: Yup.string().nullable(),
  telephone: Yup.string().nullable(),
  email: Yup.string().email('Email invalide').nullable(),
  adresse: Yup.string().nullable(),
  rib: Yup.string().nullable(),
  ice: Yup.string().nullable(),
  solde: Yup.number().nullable(),
  plafond: Yup.number().nullable(),
});

const ContactsPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const isEmployee = (currentUser?.role === 'Employé');
  const SHOW_WHATSAPP_BUTTON = currentUser?.role === 'PDG' || currentUser?.role === 'ManagerPlus';
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const [createContact] = useCreateContactMutation();
  const [updateContactMutation] = useUpdateContactMutation();
  const [deleteContactMutation] = useDeleteContactMutation();
  const [createClientRemise] = useCreateClientRemiseMutation();
  const [createRemiseItem] = useCreateRemiseItemMutation();

  // Fonction pour détecter les contacts en retard de paiement (solde > 0 fixe depuis la période configurée)
  const isOverdueContact = (contact: Contact): boolean => {
    const backend = (contact as any).solde_cumule;
    let solde: number;

    if (backend != null) {
      solde = Number(backend) || 0;
    } else {
      // Calcul local du solde si pas de valeur backend
      const base = Number(contact.solde) || 0;
      // Pour simplifier, on prend juste le solde de base ici
      solde = base;
    }

    if (solde <= 0) return false;

    // Si pas de date de dernière modification, considérer comme en retard
    if (!contact.updated_at) return true;

    try {
      const lastUpdate = new Date(contact.updated_at);
      const now = new Date();

      // Vérifier que la date est valide
      if (isNaN(lastUpdate.getTime())) {
        console.warn('Date invalide pour contact:', contact.id, contact.updated_at);
        return true; // Considérer comme en retard si date invalide
      }

      // Calculer la différence en millisecondes
      const diffMs = now.getTime() - lastUpdate.getTime();

      if (overdueUnit === 'days') {
        // Convertir en jours
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return diffDays >= overdueValue;
      } else {
        // Convertir en mois (approximatif: 30 jours par mois)
        const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
        return diffMonths >= overdueValue;
      }
    } catch (error) {
      console.error('Erreur calcul date pour contact:', contact.id, error);
      return true; // En cas d'erreur, considérer comme en retard
    }
  };

  // Backend products for enriching product details (remove fake data)
  const { data: products = [] } = useGetProductsQuery();
  // Allow selecting bons to control print content
  const [selectedBonIds, setSelectedBonIds] = React.useState<Set<number>>(new Set());

  const [activeTab, setActiveTab] = useState<'clients' | 'fournisseurs'>('clients');
  const [clientSubTab, setClientSubTab] = useState<'all' | 'backoffice' | 'ecommerce' | 'artisan-requests'>('all');
  // Forcer les employés à rester sur l'onglet clients uniquement
  React.useEffect(() => {
    if (isEmployee && activeTab !== 'clients') setActiveTab('clients');
  }, [isEmployee, activeTab]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // États pour la configuration des périodes
  const [showSettings, setShowSettings] = useState(false);
  const [overdueValue, setOverdueValue] = useState(() => {
    const saved = localStorage.getItem('contacts-overdue-value');
    return saved ? parseInt(saved) : 4;
  });
  const [overdueUnit, setOverdueUnit] = useState<'days' | 'months'>(() => {
    const saved = localStorage.getItem('contacts-overdue-unit');
    return (saved as 'days' | 'months') || 'months';
  });

  // Sauvegarder les paramètres dans localStorage
  React.useEffect(() => {
    localStorage.setItem('contacts-overdue-value', overdueValue.toString());
    localStorage.setItem('contacts-overdue-unit', overdueUnit);
  }, [overdueValue, overdueUnit]);
  // États pour l'application des remises
  const [showRemiseMode, setShowRemiseMode] = useState(false);
  const [remisePrices, setRemisePrices] = useState<Record<string, number>>({});
  const [selectedItemsForRemise, setSelectedItemsForRemise] = useState<Set<string>>(new Set());
  const isAllowedStatut = (s: any) => {
    if (!s) return false;
    const norm = String(s).toLowerCase();
    return norm === 'validé' || norm === 'valide' || norm === 'en attente' || norm === 'attente';
  };
  // Print modal state
  const [printModal, setPrintModal] = useState<{ open: boolean; mode: 'products' | null }>({ open: false, mode: null });
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [printProducts, setPrintProducts] = useState<any[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  // Charger les bons réels (selon type). Chargés globalement pour stats/solde.
  const { data: commandes = [] } = useGetBonsByTypeQuery('Commande');
  const { data: sorties = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: devis = [] } = useGetBonsByTypeQuery('Devis');
  const { data: comptants = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: avoirsClient = [] } = useGetBonsByTypeQuery('Avoir');
  const { data: avoirsFournisseur = [] } = useGetBonsByTypeQuery('AvoirFournisseur');
  const { data: payments = [] } = useGetPaymentsQuery();
  // Remises tab removed

  // Agrégats pour calculer les soldes des clients
  const salesByClient = useMemo(() => {
    const map = new Map<number, number>();
    const add = (clientId?: number, amount?: any) => {
      if (!clientId) return;
      const val = Number(amount || 0);
      map.set(clientId, (map.get(clientId) || 0) + val);
    };
    const subtract = (clientId?: number, amount?: any) => {
      if (!clientId) return;
      const val = Number(amount || 0);
      map.set(clientId, (map.get(clientId) || 0) - val);
    };

    // Ajouter les ventes (sorties et comptants)
    sorties.forEach((b: any) => { if (isAllowedStatut(b.statut)) add(b.client_id, b.montant_total); });
    comptants.forEach((b: any) => { if (isAllowedStatut(b.statut)) add(b.client_id, b.montant_total); });

    // Soustraire les avoirs clients (crédits/remboursements)
    avoirsClient.forEach((b: any) => { if (isAllowedStatut(b.statut)) subtract(b.client_id, b.montant_total); });

    return map;
  }, [sorties, comptants, avoirsClient]);

  const paymentsByContact = useMemo(() => {
    const map = new Map<number, number>();
    payments.forEach((p: any) => {
      const cid = p.contact_id; // peut être undefined dans les mocks => 0 par défaut
      if (!cid) return;
      // N'inclure que les paiements avec statut autorisé (En attente / Validé)
      if (!isAllowedStatut(p.statut)) return;
      const amt = Number(p.montant ?? p.montant_total ?? 0);
      map.set(cid, (map.get(cid) || 0) + amt);
    });
    return map;
  }, [payments]);

  // Agrégats pour calculer les soldes des fournisseurs (Commandes)
  const purchasesByFournisseur = useMemo(() => {
    const map = new Map<number, number>();
    const add = (fournisseurId?: number, amount?: any) => {
      if (!fournisseurId) return;
      const val = Number(amount || 0);
      map.set(fournisseurId, (map.get(fournisseurId) || 0) + val);
    };
    const subtract = (fournisseurId?: number, amount?: any) => {
      if (!fournisseurId) return;
      const val = Number(amount || 0);
      map.set(fournisseurId, (map.get(fournisseurId) || 0) - val);
    };

    // Ajouter les achats (commandes)
    commandes.forEach((b: any) => { if (isAllowedStatut(b.statut)) add(b.fournisseur_id, b.montant_total); });

    // Soustraire les avoirs fournisseurs (crédits/remboursements)
    avoirsFournisseur.forEach((b: any) => { if (isAllowedStatut(b.statut)) subtract(b.fournisseur_id, b.montant_total); });

    return map;
  }, [commandes, avoirsFournisseur]);

  // Util: filtre de période (accepte ISO ou format JJ-MM-YYYY). Inclusif.
  const isWithinDateRange = (dateValue?: string | null) => {
    // Pas de filtre actif => toujours vrai
    if (!(dateFrom || dateTo)) return true;
    if (!dateValue) return false; // filtre actif mais pas de date -> exclu

    let d: Date | null = null;
    // Si format JJ-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateValue)) {
      const [jj, mm, yyyy] = dateValue.split('-');
      d = new Date(`${yyyy}-${mm}-${jj}T00:00:00`);
    } else {
      // Tenter de tronquer à 10 chars (YYYY-MM-DD) pour neutraliser fuseaux
      const base = dateValue.length >= 10 ? dateValue.slice(0, 10) : dateValue;
      // Si déjà au format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
        d = new Date(`${base}T00:00:00`);
      } else {
        // Dernier recours: Date native
        const tmp = new Date(dateValue);
        if (!isNaN(tmp.getTime())) d = tmp; else return false;
      }
    }
    if (!d || isNaN(d.getTime())) return false;

    // Normaliser comparaison par jour (ignorer l'heure)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null; // inclusif fin de journée
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };

  // Function to display payment numbers with PAY prefix
  const getDisplayNumeroPayment = (payment: any) => {
    try {
      const raw = String(payment?.numero ?? payment?.id ?? '').trim();
      if (raw === '') return raw;

      // remove any leading 'pay', 'pa', 'p-' (case-insensitive) and optional separators
      const suffix = raw.replace(/^(pay|pa|p-?)\s*[-:\s]*/i, '');
      return `PAY${suffix}`;
    } catch (e) {
      return String(payment?.numero ?? payment?.id ?? '');
    }
  };



  // Bons du contact sélectionné
  const bonsForContact = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const isClient = selectedContact.type === 'Client';
    const id = selectedContact.id;
    const list: any[] = [];

    // Pour un client: sorties, comptants, avoirs client (EXCLUDING Devis per UI request)
    if (isClient) {
      for (const b of sorties) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Sortie' });
      // Devis intentionally excluded from detail/transactions per requirement
      for (const b of comptants) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Comptant' });
      for (const b of avoirsClient) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Avoir' });
    } else {
      // Fournisseur: commandes, avoirs fournisseur
      for (const b of commandes) if (b.fournisseur_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Commande' });
      for (const b of avoirsFournisseur) if (b.fournisseur_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'AvoirFournisseur' });
    }

    // Filtre période + tri
    const filtered = list.filter((b) => isWithinDateRange(b.date_creation));
    filtered.sort((a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime());
    return filtered;
  }, [selectedContact, sorties, devis, comptants, avoirsClient, commandes, avoirsFournisseur, dateFrom, dateTo]);


  const productHistory = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const items: any[] = [];
    // Helper to resolve cost like in BonsPage: prefer cout_revient, then prix_achat, then product fallback
    const resolveCost = (it: any) => {
      if (it == null) return 0;
      if (it.cout_revient !== undefined && it.cout_revient !== null) return Number(it.cout_revient) || 0;
      if (it.prix_achat !== undefined && it.prix_achat !== null) return Number(it.prix_achat) || 0;
      const pid = it.product_id || it.produit_id;
      if (pid) {
        const prod = (products as any[]).find(p => String(p.id) === String(pid));
        if (prod) {
          if (prod.cout_revient !== undefined && prod.cout_revient !== null) return Number(prod.cout_revient) || 0;
          if (prod.prix_achat !== undefined && prod.prix_achat !== null) return Number(prod.prix_achat) || 0;
        }
      }
      return 0;
    };

    // Ajouter les produits des bons
    for (const b of bonsForContact) {
      const bDate = formatDateDMY(b.date_creation);
      const bonItems = Array.isArray(b.items) ? b.items : [];
      for (const it of bonItems) {
        const prod = products.find((p) => p.id === it.product_id);
        const ref = prod ? String(prod.reference ?? prod.id) : String(it.product_id);
        const des = prod ? prod.designation : (it.designation || '');
        const prixUnit = Number(it.prix_unitaire ?? it.prix ?? 0) || 0;
        // Remises éventuelles
        const remise_pourcentage = parseFloat(String(it.remise_pourcentage ?? it.remise_pct ?? 0)) || 0;
        const remise_montant = parseFloat(String(it.remise_montant ?? it.remise_valeur ?? 0)) || 0;
        let total = Number((it as any).total ?? (it as any).montant_ligne);
        if (!Number.isFinite(total) || total === 0) {
          total = (Number(it.quantite) || 0) * prixUnit;
          if (remise_pourcentage > 0) total = total * (1 - remise_pourcentage / 100);
          if (remise_montant > 0) total = total - remise_montant;
        }
        // Compute mouvement (profit) and remises per the BonsPage rules
        const q = Number(it.quantite) || 0;
        const cost = resolveCost(it);
        const mouvement = (prixUnit - cost) * q;
        const remiseUnitaire = Number(it.remise_montant || it.remise_valeur || 0) || 0; // per-unit remise as in BonsPage
        const remiseTotale = remiseUnitaire * q;
        // Apply remises only for types that affect mouvement (same list as BonsPage)
        const applyRemise = ['Sortie', 'Comptant', 'Avoir', 'AvoirComptant'].includes(b.type);
        const benefice = mouvement - (applyRemise ? remiseTotale : 0);
        // Déterminer le type d'item basé sur le type de bon
        const itemType = (b.type === 'Avoir' || b.type === 'AvoirFournisseur') ? 'avoir' : 'produit';
        items.push({
          id: `${b.id}-${it.product_id}-${it.id ?? Math.random()}`,
          bon_id: b.id,
          bon_numero: b.numero,
          code_reglement: b.code_reglement,
          bon_type: b.type,
          bon_date: bDate,
          bon_date_iso: b.date_creation, // Date ISO pour l'affichage avec heure
          bon_statut: b.statut,
          product_id: it.product_id, // Ajouter product_id pour les remises
          product_reference: ref,
          product_designation: des,
          quantite: Number(it.quantite) || 0,
          prix_unitaire: prixUnit,
          total,
          mouvement,
          remise_unitaire: remiseUnitaire,
          remise_totale: remiseTotale,
          benefice,
          type: itemType,
          created_at: b.created_at,
          remise_pourcentage,
          remise_montant,
          adresse_livraison: b.adresse_livraison || '',
        });
      }
    }

    // Ajouter les paiements comme des entrées séparées
    const paymentsForContact = payments.filter(
      (p: any) => String(p.contact_id) === String(selectedContact.id) && isAllowedStatut(p.statut)
    );
    for (const p of paymentsForContact) {
      items.push({
        id: `payment-${p.id}`,
        bon_numero: getDisplayNumeroPayment(p),
        bon_type: 'Paiement',
        bon_date: formatDateDMY(p.date_paiement || new Date().toISOString()),
        bon_date_iso: p.date_paiement, // conserver la date/heure réelle du paiement
        bon_statut: p.statut ? String(p.statut) : 'Paiement',
        product_reference: 'PAIEMENT',
        product_designation: `Paiement ${p.mode_paiement || 'Espèces'}`,
        quantite: 1,
        prix_unitaire: Number(p.montant ?? p.montant_total ?? 0) || 0,
        total: Number(p.montant ?? p.montant_total ?? 0) || 0,
        type: 'paiement',
        created_at: p.created_at,
      });
    }

    // Appliquer le filtre de période maintenant :
    //  - Les bons sont déjà filtrés par date_creation dans bonsForContact
    //  - Les paiements doivent être filtrés ici via leur date_paiement (stockée dans bon_date_iso)
    if (dateFrom || dateTo) {
      const filtered = items.filter((it) => {
        // Priorité à la date ISO si disponible, sinon utiliser la date affichée (JJ-MM-YYYY)
        return isWithinDateRange(it.bon_date_iso || it.bon_date);
      });
      items.length = 0;
      items.push(...filtered);
    }

    // Si un filtre de période est actif, il faut d'abord calculer le solde au début de la période
    // en prenant en compte TOUTES les transactions antérieures (même celles filtrées)
    let soldeDebutPeriode = Number(selectedContact?.solde ?? 0);

    if (dateFrom || dateTo) {
      // Créer une liste complète de TOUTES les transactions (sans filtre de période)
      const allItems: any[] = [];

      // Tous les bons du contact (sans filtre de date)
      const allBonsForContact = (() => {
        if (!selectedContact) return [] as any[];
        const isClient = selectedContact.type === 'Client';
        const id = selectedContact.id;
        const list: any[] = [];

        if (isClient) {
          for (const b of sorties) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Sortie' });
          for (const b of comptants) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Comptant' });
          for (const b of avoirsClient) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Avoir' });
        } else {
          for (const b of commandes) if (b.fournisseur_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Commande' });
          for (const b of avoirsFournisseur) if (b.fournisseur_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'AvoirFournisseur' });
        }

        return list.sort((a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime());
      })();

      // Ajouter tous les produits des bons (sans filtre)
      for (const b of allBonsForContact) {
        const bonItems = Array.isArray(b.items) ? b.items : [];
        for (const it of bonItems) {
          const total = Number((it as any).total ?? (it as any).montant_ligne) ||
            ((Number(it.quantite) || 0) * (Number(it.prix_unitaire ?? it.prix ?? 0) || 0));
          const itemType = (b.type === 'Avoir' || b.type === 'AvoirFournisseur') ? 'avoir' : 'produit';
          allItems.push({
            bon_date_iso: b.date_creation,
            total,
            type: itemType,
          });
        }
      }

      // Ajouter tous les paiements (sans filtre)
      const allPaymentsForContact = payments.filter(
        (p: any) => String(p.contact_id) === String(selectedContact.id) && isAllowedStatut(p.statut)
      );
      for (const p of allPaymentsForContact) {
        allItems.push({
          bon_date_iso: p.date_paiement,
          total: Number(p.montant ?? p.montant_total ?? 0) || 0,
          type: 'paiement',
        });
      }

      // Trier toutes les transactions par date
      allItems.sort((a, b) => new Date(a.bon_date_iso).getTime() - new Date(b.bon_date_iso).getTime());

      // Calculer le solde au début de la période en excluant les transactions de la période
      const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
      for (const item of allItems) {
        const itemDate = new Date(item.bon_date_iso);
        // Si la transaction est antérieure au début de la période, l'inclure dans le calcul
        if (from && itemDate < from) {
          const montant = Number(item.total) || 0;
          if (item.type === 'produit') {
            soldeDebutPeriode += montant;
          } else if (item.type === 'paiement' || item.type === 'avoir') {
            soldeDebutPeriode -= montant;
          }
        }
      }
    }

    // Tri par date/heure réelle si bon_date_iso dispo, sinon fallback sur bon_date (JJ-MM-YYYY)
    items.sort((a, b) => {
      const dateA = a.bon_date_iso
        ? new Date(a.bon_date_iso).getTime()
        : (() => {
          const [da, ma, ya] = a.bon_date.split('-');
          const YA = ya.length === 2 ? `20${ya}` : ya;
          return new Date(`${YA}-${ma}-${da}`).getTime();
        })();
      const dateB = b.bon_date_iso
        ? new Date(b.bon_date_iso).getTime()
        : (() => {
          const [db, mb, yb] = b.bon_date.split('-');
          const YB = yb.length === 2 ? `20${yb}` : yb;
          return new Date(`${YB}-${mb}-${db}`).getTime();
        })();
      return dateA - dateB;
    });

    // Commencer avec le solde au début de la période (ou solde initial si pas de filtre)
    let soldeCumulatif = soldeDebutPeriode;
    return items.map((item) => {
      const montant = Number(item.total) || 0;
      if (item.type === 'produit') {
        soldeCumulatif += montant; // débit (augmentation)
      } else if (item.type === 'paiement' || item.type === 'avoir') {
        soldeCumulatif -= montant; // crédit (diminution)
      }
      return { ...item, soldeCumulatif };
    });
  }, [selectedContact, bonsForContact, products, payments, dateFrom, dateTo]);

  // Plus de filtre de statut dynamique
  const filteredProductHistory = productHistory;

  // Search term and filtering for the Products detail tab
  const [productSearch, setProductSearch] = useState('');
  const [sortField, setSortField] = useState<'nom' | 'societe' | 'solde' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const searchedProductHistory = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return filteredProductHistory;
    return filteredProductHistory.filter((i: any) => {
      const ref = String(i.product_reference || '').toLowerCase();
      const des = String(i.product_designation || '').toLowerCase();
      const num = String(i.bon_numero || '').toLowerCase();
      return ref.includes(term) || des.includes(term) || num.includes(term);
    });
  }, [filteredProductHistory, productSearch]);

  // Historique complet des produits (sans filtre de date) - utilisé pour les calculs
  const allProductHistory = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const initialSolde = Number(selectedContact?.solde ?? 0);
    const ouverture = (selectedContact as any).date_ouverture || selectedContact.created_at || null;

    const initRow = {
      id: 'initial-solde-produit-all',
      bon_numero: '—',
      bon_type: 'Solde initial',
      bon_date: '',
      bon_statut: '-',
      product_reference: '—',
      product_designation: 'Solde initial',
      quantite: 0,
      prix_unitaire: 0,
      total: 0,
      type: 'solde',
      created_at: '',
      soldeCumulatif: initialSolde,
      syntheticInitial: true,
    } as any;

    // Toujours inclure toutes les transactions pour les calculs complets
    return [initRow, ...filteredProductHistory];
  }, [filteredProductHistory, selectedContact]);

  // Solde net final (solde cumulé après la dernière ligne) pour le bloc récapitulatif
  const finalSoldeNet = useMemo(() => {
    if (!selectedContact) return 0;
    const arr = allProductHistory; // Utiliser l'historique complet
    if (!arr || arr.length === 0) return Number(selectedContact.solde ?? 0);
    const last = arr[arr.length - 1];
    return Number(last.soldeCumulatif ?? selectedContact.solde ?? 0);
  }, [allProductHistory, selectedContact]);

  // Totaux affichés (pour l'impression - doivent correspondre exactement au tableau)
  const displayedTotals = useMemo(() => {
    const baseRows = selectedProductIds.size > 0
      ? searchedProductHistory.filter((i: any) => selectedProductIds.has(String(i.id)))
      : searchedProductHistory;

    let totalQty = 0;
    let totalAmount = 0;

    baseRows.forEach((row: any) => {
      if (row.syntheticInitial) return;

      const amount = Number(row.total) || 0;

      if (row.type === 'produit') {
        totalQty += Number(row.quantite) || 0;
        totalAmount += amount;
      } else if (row.type === 'paiement' || row.type === 'avoir') {
        totalAmount -= amount;
      }
    });

    return { totalQty, totalAmount };
  }, [searchedProductHistory, selectedProductIds]);


  const displayedProductHistory = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const initialSolde = Number(selectedContact?.solde ?? 0);
    // Date d'ouverture du compte (ou date de création du contact)
    const ouverture = (selectedContact as any).date_ouverture || selectedContact.created_at || null;
    let showSoldeInitial = true;
    if (dateFrom) {
      // Si la période commence après la date d'ouverture, on ne montre pas le solde initial
      if (ouverture) {
        const ouvertureDate = new Date(ouverture.slice(0, 10));
        const fromDate = new Date(dateFrom + 'T00:00:00');
        if (fromDate > ouvertureDate) showSoldeInitial = false;
      } else {
        // Si pas de date d'ouverture, on masque si dateFrom existe
        showSoldeInitial = false;
      }
    }

    // Créer un map des soldes cumulés à partir de l'historique complet
    const soldesMap = new Map<string, number>();
    allProductHistory.forEach((item) => {
      soldesMap.set(item.id, item.soldeCumulatif);
    });

    // Filtrer les transactions par date mais garder les soldes calculés sur l'historique complet
    const filteredTransactions = searchedProductHistory.map(item => ({
      ...item,
      soldeCumulatif: soldesMap.get(item.id) || item.soldeCumulatif
    }));

    // Calculer le solde au début de la période filtrée
    let soldeDebutPeriode = initialSolde;
    if (dateFrom && !showSoldeInitial) {
      // Trouver le solde juste avant la période filtrée
      const beforePeriod = allProductHistory.filter(item => {
        if (item.syntheticInitial) return false;
        const itemDate = item.bon_date_iso || item.bon_date;
        if (!itemDate) return false;
        return itemDate < dateFrom;
      });
      if (beforePeriod.length > 0) {
        const lastBeforePeriod = beforePeriod[beforePeriod.length - 1];
        soldeDebutPeriode = lastBeforePeriod.soldeCumulatif || initialSolde;
      }
    }

    const initRow = {
      id: 'initial-solde-produit',
      bon_numero: '—',
      bon_type: 'Solde initial',
      bon_date: '',
      bon_statut: '-',
      product_reference: '—',
      product_designation: showSoldeInitial ? 'Solde initial' : 'Solde au début de période',
      quantite: 0,
      prix_unitaire: 0,
      total: 0,
      type: 'solde',
      created_at: '',
      soldeCumulatif: showSoldeInitial ? initialSolde : soldeDebutPeriode,
      syntheticInitial: true,
    } as any;

    // Pour l'affichage : montrer ou cacher le solde initial selon le filtre
    if (showSoldeInitial) {
      return [initRow, ...filteredTransactions];
    } else {
      // Cacher le solde initial mais ajuster le premier élément pour montrer le bon solde de début
      if (filteredTransactions.length > 0) {
        const adjustedTransactions = [...filteredTransactions];
        // Le premier élément affiché doit montrer le solde de début de période
        adjustedTransactions[0] = {
          ...adjustedTransactions[0],
          // Garder le vrai solde cumulé calculé depuis le début
        };
        return adjustedTransactions;
      }
      return filteredTransactions;
    }
  }, [searchedProductHistory, selectedContact, dateFrom, allProductHistory]);

  // Version complète pour les calculs (toujours avec solde initial pour les calculs corrects)
  const displayedProductHistoryWithInitial = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const initialSolde = Number(selectedContact?.solde ?? 0);

    // Créer un map des soldes cumulés à partir de l'historique complet
    const soldesMap = new Map<string, number>();
    allProductHistory.forEach((item) => {
      soldesMap.set(item.id, item.soldeCumulatif);
    });

    // Filtrer les transactions par date mais garder les soldes calculés sur l'historique complet
    const filteredTransactions = searchedProductHistory.map(item => ({
      ...item,
      soldeCumulatif: soldesMap.get(item.id) || item.soldeCumulatif
    }));

    const initRow = {
      id: 'initial-solde-produit-calc',
      bon_numero: '—',
      bon_type: 'Solde initial',
      bon_date: '',
      bon_statut: '-',
      product_reference: '—',
      product_designation: 'Solde initial',
      quantite: 0,
      prix_unitaire: 0,
      total: 0,
      type: 'solde',
      created_at: '',
      soldeCumulatif: initialSolde,
      syntheticInitial: true,
    } as any;

    // Toujours inclure le solde initial pour les calculs corrects
    return [initRow, ...filteredTransactions];
  }, [searchedProductHistory, selectedContact, allProductHistory]);

  // Bons visibles dans le tableau (IDs uniques) — utile pour la sélection de bons
  const displayedBonIds = useMemo(() => {
    const s = new Set<number>();
    (displayedProductHistory || []).forEach((i: any) => {
      if (!i.syntheticInitial && i.bon_id) s.add(Number(i.bon_id));
    });
    return s;
  }, [displayedProductHistory]);

  const clearBonSelection = React.useCallback(() => {
    if (selectedBonIds.size === 0) return;
    const bonsToClear = new Set(selectedBonIds);
    setSelectedBonIds(new Set());
    setSelectedProductIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      displayedProductHistory.forEach((item: any) => {
        if (!item.syntheticInitial && item.bon_id && bonsToClear.has(Number(item.bon_id))) {
          next.delete(String(item.id));
        }
      });
      return next;
    });
  }, [selectedBonIds, displayedProductHistory]);

  const toggleBonSelection = (bonId: number) => {
    setSelectedBonIds(prev => {
      const next = new Set(prev);
      const isSelecting = !next.has(bonId);

      if (isSelecting) {
        next.add(bonId);
        // Sélectionner automatiquement tous les produits de ce bon
        const productsOfBon = displayedProductHistory
          .filter((item: any) => !item.syntheticInitial && Number(item.bon_id) === bonId)
          .map((item: any) => String(item.id));

        setSelectedProductIds(prevProducts => {
          const nextProducts = new Set(prevProducts);
          productsOfBon.forEach(id => nextProducts.add(id));
          return nextProducts;
        });
      } else {
        next.delete(bonId);
        // Désélectionner tous les produits de ce bon
        const productsOfBon = displayedProductHistory
          .filter((item: any) => !item.syntheticInitial && Number(item.bon_id) === bonId)
          .map((item: any) => String(item.id));

        setSelectedProductIds(prevProducts => {
          const nextProducts = new Set(prevProducts);
          productsOfBon.forEach(id => nextProducts.delete(id));
          return nextProducts;
        });
      }

      return next;
    });
  };

  const toggleSelectAllBons = (checked: boolean) => {
    if (checked) {
      setSelectedBonIds(new Set(Array.from(displayedBonIds)));
    } else {
      setSelectedBonIds(new Set());
    }
  };

  // Small helper to produce the CompanyHeader HTML used in bons prints
  const getCompanyHeaderHTML = (companyType: 'DIAMOND' | 'MPC' = 'DIAMOND') => {
    const companyInfo: Record<string, { name: string; subtitle: string; description: string }> = {
      DIAMOND: { name: 'BOUKIR DIAMOND', subtitle: 'CONSTRUCTION STORE', description: 'Vente de Matériaux de Construction et de Marbre' },
      MPC: { name: 'BOUKIR MPC', subtitle: 'CONSTRUCTION STORE', description: 'Vente de Matériaux de Construction et de Marbre' },
    };
    const c = companyInfo[companyType];
    return `
      <div style="text-align:center;margin-bottom:16px;border-bottom:2px solid #f97316;padding-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:center;margin-bottom:8px;gap:12px;">
          <div style="display:flex;align-items:center;justify-content:center;">
            <img 
              src="${logo}" 
              alt="${c.name}"
              className=" object-contain"
              style="width:110px"
            />
          </div>
          <div style="text-align:left;">
            <h1 style="margin:0;font-size:20px;font-weight:700;color:#1f2937">${c.name}</h1>
            <h2 style="margin:0;font-size:16px;font-weight:600;color:#374151">${c.subtitle}</h2>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280;font-style:italic">${c.description}</p>
          </div>
        </div>
      </div>
    `;
  };

  // Helper: two-row contact info table (row1: telephone + email, row2: ICE + solde initial)
  const getTwoRowContactTable = (contact: Contact | null) => {
    if (!contact) return '';
    const tel = contact.telephone || 'N/A';
    const email = contact.email || 'N/A';
    const ice = contact.ice || 'N/A';
    const solde = Number(contact.solde || 0).toFixed(2) + ' DH';
    return `
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr>
          <td style="border:1px solid #ccc;padding:4px;font-size:10px;width:50%;"><strong>Téléphone:</strong> ${tel}</td>
          <td style="border:1px solid #ccc;padding:4px;font-size:10px;width:50%;word-wrap:break-word;"><strong>Email:</strong> ${email}</td>
        </tr>
        <tr>
          <td style="border:1px solid #ccc;padding:4px;font-size:10px;"><strong>ICE:</strong> ${ice}</td>
          <td style="border:1px solid #ccc;padding:4px;font-size:10px;"><strong>Solde initial:</strong> ${solde}</td>
        </tr>
      </table>
    `;
  };

  // Ouvrir détails
  const handleViewDetails = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailsModalOpen(true);
    setDateFrom('');
    setDateTo('');
    // Réinitialiser le mode remise
    setShowRemiseMode(false);
    setRemisePrices({});
    setSelectedItemsForRemise(new Set());
  };

  // Hook lazy pour vérifier le client_abonné existant seulement quand nécessaire
  const [getClientAbonneByContact] = useLazyGetClientAbonneByContactQuery();

  // État pour stocker les remises du contact sélectionné
  const [contactRemises, setContactRemises] = useState<any[]>([]);
  // Token auth pour appels directs fetch
  const authToken = useSelector((s: RootState) => (s as any)?.auth?.token);

  const handleSendWhatsAppContactProducts = async () => {
    if (!selectedContact) return;

    const toPhone = (selectedContact as any)?.telephone || (selectedContact as any)?.phone || null;
    if (!toPhone) {
      showError('Numéro de téléphone introuvable pour ce contact.');
      return;
    }

    try {
      setSendingWhatsApp(true);

      const Swal = (await import('sweetalert2')).default;
      const choice = await Swal.fire({
        title: 'Envoyer WhatsApp',
        text: 'Envoyer le rapport Détail Produits avec filtres ou sans filtres ?',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Avec filtres',
        denyButtonText: 'Sans filtres',
        cancelButtonText: 'Annuler',
        heightAuto: false,
        customClass: { popup: 'swal2-show' },
      });

      if (choice.isDismissed) return;
      const useFilters = choice.isConfirmed;

      // Build report rows
      let reportRows: any[] = [];
      let skipInitialRow = false;
      let hideCumulative = false;
      let reportTotals: { totalQty?: number; totalAmount?: number; finalSolde?: number } = {};

      const computeTotalsFromRows = (rows: any[]) => {
        let totalQty = 0;
        let totalAmount = 0;
        let finalSolde = Number((selectedContact as any)?.solde ?? 0) || 0;

        for (const r of rows) {
          if (r?.syntheticInitial) continue;
          const amount = Number(r.total) || 0;
          if (String(r.type || '').toLowerCase() === 'produit') {
            totalQty += Number(r.quantite) || 0;
            totalAmount += amount;
          } else if (String(r.type || '').toLowerCase() === 'paiement' || String(r.type || '').toLowerCase().includes('avoir')) {
            totalAmount -= amount;
          }
          if (r?.soldeCumulatif != null) finalSolde = Number(r.soldeCumulatif) || finalSolde;
        }
        // If soldeCumulatif exists on the last row, prefer it
        const last = rows && rows.length ? rows[rows.length - 1] : null;
        if (last?.soldeCumulatif != null) finalSolde = Number(last.soldeCumulatif) || finalSolde;

        return { totalQty, totalAmount, finalSolde };
      };

      const buildProductHistoryNoFilters = () => {
        if (!selectedContact) return [] as any[];
        const isClient = selectedContact.type === 'Client';
        const id = selectedContact.id;

        const list: any[] = [];
        if (isClient) {
          for (const b of sorties) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Sortie' });
          for (const b of comptants) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Comptant' });
          for (const b of avoirsClient) if (b.client_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Avoir' });
        } else {
          for (const b of commandes) if (b.fournisseur_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'Commande' });
          for (const b of avoirsFournisseur) if (b.fournisseur_id === id && isAllowedStatut(b.statut)) list.push({ ...b, type: 'AvoirFournisseur' });
        }

        list.sort((a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime());

        const resolveCost = (it: any) => {
          if (it == null) return 0;
          if (it.cout_revient !== undefined && it.cout_revient !== null) return Number(it.cout_revient) || 0;
          if (it.prix_achat !== undefined && it.prix_achat !== null) return Number(it.prix_achat) || 0;
          const pid = it.product_id || it.produit_id;
          if (pid) {
            const prod = (products as any[]).find(p => String(p.id) === String(pid));
            if (prod) {
              if (prod.cout_revient !== undefined && prod.cout_revient !== null) return Number(prod.cout_revient) || 0;
              if (prod.prix_achat !== undefined && prod.prix_achat !== null) return Number(prod.prix_achat) || 0;
            }
          }
          return 0;
        };

        const items: any[] = [];
        for (const b of list) {
          const bDate = formatDateDMY(b.date_creation);
          const bonItems = Array.isArray(b.items) ? b.items : [];
          for (const it of bonItems) {
            const prod = products.find((p) => p.id === it.product_id);
            const ref = prod ? String(prod.reference ?? prod.id) : String(it.product_id);
            const des = prod ? prod.designation : (it.designation || '');
            const prixUnit = Number(it.prix_unitaire ?? it.prix ?? 0) || 0;

            const remise_pourcentage = parseFloat(String(it.remise_pourcentage ?? it.remise_pct ?? 0)) || 0;
            const remise_montant = parseFloat(String(it.remise_montant ?? it.remise_valeur ?? 0)) || 0;
            let total = Number((it as any).total ?? (it as any).montant_ligne);
            if (!Number.isFinite(total) || total === 0) {
              total = (Number(it.quantite) || 0) * prixUnit;
              if (remise_pourcentage > 0) total = total * (1 - remise_pourcentage / 100);
              if (remise_montant > 0) total = total - remise_montant;
            }

            const q = Number(it.quantite) || 0;
            const cost = resolveCost(it);
            const mouvement = (prixUnit - cost) * q;
            const remiseUnitaire = Number(it.remise_montant || it.remise_valeur || 0) || 0;
            const remiseTotale = remiseUnitaire * q;
            const applyRemise = ['Sortie', 'Comptant', 'Avoir', 'AvoirComptant'].includes(b.type);
            const benefice = mouvement - (applyRemise ? remiseTotale : 0);

            const itemType = (b.type === 'Avoir' || b.type === 'AvoirFournisseur') ? 'avoir' : 'produit';
            items.push({
              id: `${b.id}-${it.product_id}-${it.id ?? `${items.length}`}`,
              bon_id: b.id,
              bon_numero: b.numero,
              code_reglement: b.code_reglement,
              bon_type: b.type,
              bon_date: bDate,
              bon_date_iso: b.date_creation,
              bon_statut: b.statut,
              product_id: it.product_id,
              product_reference: ref,
              product_designation: des,
              quantite: q,
              prix_unitaire: prixUnit,
              total,
              mouvement,
              remise_unitaire: remiseUnitaire,
              remise_totale: remiseTotale,
              benefice,
              type: itemType,
              created_at: b.created_at,
              remise_pourcentage,
              remise_montant,
              adresse_livraison: b.adresse_livraison || '',
            });
          }
        }

        const paymentsForContact = payments.filter(
          (p: any) => String(p.contact_id) === String(selectedContact.id) && isAllowedStatut(p.statut)
        );
        for (const p of paymentsForContact) {
          items.push({
            id: `payment-${p.id}`,
            bon_numero: getDisplayNumeroPayment(p),
            bon_type: 'Paiement',
            bon_date: formatDateDMY(p.date_paiement || new Date().toISOString()),
            bon_date_iso: p.date_paiement,
            bon_statut: p.statut ? String(p.statut) : 'Paiement',
            product_reference: 'PAIEMENT',
            product_designation: `Paiement ${p.mode_paiement || 'Espèces'}`,
            quantite: 1,
            prix_unitaire: Number(p.montant ?? p.montant_total ?? 0) || 0,
            total: Number(p.montant ?? p.montant_total ?? 0) || 0,
            type: 'paiement',
            created_at: p.created_at,
          });
        }

        // Tri + solde cumulatif (sans filtre)
        items.sort((a, b) => new Date(a.bon_date_iso || a.bon_date).getTime() - new Date(b.bon_date_iso || b.bon_date).getTime());
        let soldeCumulatif = Number((selectedContact as any)?.solde ?? 0) || 0;
        return items.map((item) => {
          const montant = Number(item.total) || 0;
          if (item.type === 'produit') soldeCumulatif += montant;
          else if (item.type === 'paiement' || String(item.type || '').toLowerCase().includes('avoir')) soldeCumulatif -= montant;
          return { ...item, soldeCumulatif };
        });
      };

      if (useFilters) {
        if (selectedProductIds && selectedProductIds.size > 0) {
          reportRows = displayedProductHistoryWithInitial.filter((it: any) =>
            selectedProductIds.has(String(it.id)) && !it.syntheticInitial
          );
        } else {
          reportRows = displayedProductHistory;
        }

        skipInitialRow = (selectedProductIds && selectedProductIds.size > 0) || !!(dateFrom || dateTo);
        hideCumulative = (selectedProductIds && selectedProductIds.size > 0) || (selectedBonIds && selectedBonIds.size > 0);
        reportTotals = {
          totalQty: displayedTotals.totalQty,
          totalAmount: displayedTotals.totalAmount,
          finalSolde: finalSoldeNet,
        };
      } else {
        reportRows = buildProductHistoryNoFilters();
        skipInitialRow = false;
        hideCumulative = false;
        reportTotals = computeTotalsFromRows(reportRows);
      }

      const pdfElement = (
        <ContactPrintTemplate
          contact={selectedContact}
          mode="products"
          transactions={[]}
          productHistory={reportRows}
          dateFrom={useFilters ? dateFrom : undefined}
          dateTo={useFilters ? dateTo : undefined}
          companyType="DIAMOND"
          priceMode="WITH_PRICES"
          size="A4"
          skipInitialRow={skipInitialRow}
          hideCumulative={hideCumulative}
          totalQty={reportTotals.totalQty}
          totalAmount={reportTotals.totalAmount}
          finalSolde={reportTotals.finalSolde}
        />
      );

      const pdfBlob = await generatePDFBlobFromElement(pdfElement);
      const safeName = String(selectedContact.nom_complet || selectedContact.id || 'contact').replace(/[^a-zA-Z0-9_-]/g, '_');
      const suffix = useFilters ? 'produits_filtres' : 'produits_complet';
      const fileName = `Rapport_${safeName}_${suffix}_${new Date().toISOString().slice(0, 10)}.pdf`;

      const uploadResult = await uploadBonPdf(pdfBlob, fileName, {
        token: authToken || undefined,
        bonId: selectedContact.id,
        bonType: 'CONTACT_PRODUCTS',
      });

      const baseForUrl = window.location.origin;
      const mediaUrl = uploadResult.absoluteUrl || `${baseForUrl.replace(/\/$/, '')}${uploadResult.url.startsWith('/') ? '' : '/'}${uploadResult.url}`;

      const periodLine = useFilters && (dateFrom || dateTo)
        ? `Période: ${dateFrom || '...'} → ${dateTo || '...'}`
        : null;
      const caption = [
        'Bonjour,',
        'Veuillez trouver ci-joint le rapport détaillé des produits.',
        periodLine,
        'Merci.'
      ].filter(Boolean).join('\n');

      const resp = await fetch('/api/notifications/whatsapp/bon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          to: String(toPhone),
          pdfUrl: mediaUrl,
          message: caption,
          numero: 'Rapport Produits',
          total: (reportTotals.totalAmount != null ? Number(reportTotals.totalAmount).toFixed(2) : ''),
          devise: 'DH',
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.ok) {
        showSuccess('Rapport envoyé sur WhatsApp.');
      } else {
        const msg = data?.message || data?.error || `Échec WhatsApp (${resp.status})`;
        showError(msg);
      }
    } catch (e: any) {
      showError(e?.message || 'Erreur lors de l\'envoi WhatsApp');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const loadContactRemises = async () => {
    if (!selectedContact?.id) {
      setContactRemises([]);
      return;
    }

    try {
      // Récupérer toutes les remises liées à ce contact (protégé -> besoin Authorization)
      const response = await fetch(`/api/remises/clients`, {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
      });
      if (response.ok) {
        const allRemises = await response.json();

        const normalize = (s: any) => (s || '').toString().trim().toLowerCase();
        const contactNameVariants = new Set([
          normalize(selectedContact.nom_complet),
          normalize(selectedContact.societe),
        ]);

        // Filtrer les remises pour ce contact (nouveau schéma) OU legacy (contact_id null mais type abonné avec nom identique)
        const contactRemisesData: any[] = [];
        for (const remise of allRemises) {
          const isDirectLink = remise.contact_id === selectedContact.id;
          const isLegacyAbonne = !remise.contact_id && remise.type === 'client_abonne' && contactNameVariants.has(normalize(remise.nom));
          if (isDirectLink || isLegacyAbonne) {
            const itemsResponse = await fetch(`/api/remises/clients/${remise.id}/items`, {
              headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
            });
            if (itemsResponse.ok) {
              const items = await itemsResponse.json();
              contactRemisesData.push({
                ...remise,
                _isLegacy: isLegacyAbonne,
                items
              });
            }
          }
        }

        // Log diagnostique
        const countAbonne = contactRemisesData.filter(r => r.type === 'client_abonne').length;
        const countClient = contactRemisesData.filter(r => r.type === 'client-remise').length;
        console.log(`Chargement remises: abonné=${countAbonne} client-remise=${countClient}`, contactRemisesData);

        setContactRemises(contactRemisesData);
      } else {
        if (response.status === 401) {
          console.warn('Non autorisé (401) pour /api/remises/clients — token manquant ou expiré');
        } else {
          console.error('Erreur lors du chargement des remises:', response.status);
        }
      }
    } catch (error) {
      console.error('Erreur chargement remises:', error);
      setContactRemises([]);
    }
  };

  // Charger les remises du contact lorsqu'il change
  React.useEffect(() => {
    loadContactRemises();
  }, [selectedContact?.id]);

  // Fonction pour obtenir les remises d'un item spécifique
  const getItemRemises = (item: any) => {
    const remises = {
      abonne: 0,
      client: 0
    };

    // Debug: vérifier les données disponibles
    if (contactRemises.length > 0) {
      console.log('Debug getItemRemises:', {
        item: { bon_id: item.bon_id, product_id: item.product_id, product_reference: item.product_reference },
        contactRemises: contactRemises.map((r: any) => ({
          id: r.id,
          type: r.type,
          itemsCount: r.items?.length || 0,
          items: r.items?.map((i: any) => ({ bon_id: i.bon_id, product_id: i.product_id, qte: i.qte, prix_remise: i.prix_remise }))
        }))
      });
    }

    // Parcourir toutes les remises du contact
    for (const remise of contactRemises) {
      for (const remiseItem of remise.items || []) {
        // Normaliser types (Number) pour comparaison robuste
        const bonIdItem = Number(item.bon_id);
        const bonIdRemise = Number(remiseItem.bon_id);
        const prodIdItem = item.product_id != null ? Number(item.product_id) : null;
        const prodIdRemise = remiseItem.product_id != null ? Number(remiseItem.product_id) : null;

        // Correspondance principale sur bon_id + product_id
        let match = bonIdItem === bonIdRemise && prodIdItem != null && prodIdRemise != null && prodIdItem === prodIdRemise;

        // Fallback: si pas de product_id côté remise (ou mismatch) mais même bon et même référence produit si disponible
        if (!match && bonIdItem === bonIdRemise) {
          const refItem = (item.product_reference || '').toString().trim();
          // Dans items de remise la colonne est 'reference' (jointure SELECT p.id AS reference) selon route
          const refRemise = (remiseItem.reference || '').toString().trim();
          if (refItem && refRemise && refItem === refRemise) {
            match = true;
          }
        }

        if (match) {
          const totalRemise = (Number(remiseItem.qte) || 0) * (Number(remiseItem.prix_remise) || 0);

          console.log('Match trouvé:', {
            remiseType: remise.type,
            bon_id: bonIdItem,
            product_id: prodIdItem,
            referenceItem: item.product_reference,
            referenceRemise: remiseItem.reference,
            totalRemise
          });

          if (remise.type === 'client_abonne') {
            remises.abonne += totalRemise;
          } else if (remise.type === 'client-remise') {
            remises.client += totalRemise;
          }
        }
      }
    }

    return remises;
  };

  // Fonction pour valider et créer les remises
  const handleValidateRemises = async () => {
    if (!selectedContact || selectedItemsForRemise.size === 0) {
      showError('Aucune remise sélectionnée');
      return;
    }

    console.log('=== DÉBUT VALIDATION REMISES ===');
    console.log('Contact sélectionné:', selectedContact);
    console.log('Items pour remise:', Array.from(selectedItemsForRemise));
    console.log('Prix remises:', remisePrices);

    try {
      let clientAbonneId: number;

      // 1. Vérifier si un client_abonné existe déjà pour ce contact
      console.log(`🔍 Recherche d'un client_abonné existant pour contact_id: ${selectedContact.id}`);

      try {
        const result = await getClientAbonneByContact(selectedContact.id).unwrap();
        // Client abonné existant trouvé
        console.log('✅ Client abonné existant trouvé:', result);
        clientAbonneId = result.id;
        console.log(`🔄 Réutilisation du client_abonné ID: ${clientAbonneId}`);
      } catch (error: any) {
        // Aucun client_abonné existant (404) ou autre erreur
        if (error?.status === 404) {
          console.log('❌ Aucun client abonné existant trouvé, création d\'un nouveau...');
        } else {
          console.log('⚠️ Erreur lors de la recherche:', error);
          console.log('❌ Création d\'un nouveau client abonné...');
        }

        const clientAbonneData = {
          nom: selectedContact.nom_complet,
          phone: selectedContact.telephone || undefined,
          cin: selectedContact.rib || undefined,
          contact_id: selectedContact.id,
          type: 'client_abonne',
        };

        console.log('📝 Données client abonné à créer:', clientAbonneData);

        const createdClientAbonne: any = await createClientRemise(clientAbonneData).unwrap();

        console.log('✅ Nouveau client abonné créé:', createdClientAbonne);

        if (!createdClientAbonne?.id) {
          throw new Error('Erreur lors de la création du client abonné');
        }

        clientAbonneId = createdClientAbonne.id;
        console.log(`➕ Nouveau client_abonné créé avec ID: ${clientAbonneId}`);
      }

      console.log(`Utilisation du client_abonné ID: ${clientAbonneId}`);

      // 2. Créer les items de remise
      const remisePromises = Array.from(selectedItemsForRemise).map(async (itemId) => {
        const item = filteredProductHistory.find(p => p.id === itemId);
        const prixRemise = remisePrices[itemId] || 0;

        if (!item || prixRemise <= 0) return null;

        const remiseItemData = {
          product_id: item.product_id,
          qte: item.quantite, // Backend attend 'qte' pas 'quantite'
          prix_remise: prixRemise,
          bon_id: item.bon_id, // Backend attend 'bon_id' pas 'bon_source_id'
          bon_type: item.bon_type, // Backend attend 'bon_type' pas 'bon_source_type'
        };

        console.log(`Création remise item pour produit ${item.product_id}:`, remiseItemData);
        console.log('Item complet:', item);

        return createRemiseItem({
          clientRemiseId: clientAbonneId,
          data: remiseItemData,
        }).unwrap();
      });

      console.log('Promesses de création des items:', remisePromises.length);

      // Attendre que toutes les remises soient créées
      const results = await Promise.all(remisePromises.filter(Boolean));

      console.log('Résultats création items:', results);

      showSuccess(`${results.length} remise(s) créée(s) avec succès`);

      // Réinitialiser l'interface après validation
      setShowRemiseMode(false);
      setRemisePrices({});
      setSelectedItemsForRemise(new Set());

      console.log('=== FIN VALIDATION REMISES (SUCCÈS) ===');

    } catch (error: any) {
      console.error('=== ERREUR VALIDATION REMISES ===', error);
      showError(error?.data?.message || 'Erreur lors de la création des remises');
    }
  };

  // Impression avec détails des produits et transactions
  const handlePrint = () => {
    if (!selectedContact) return;

    const filteredBons = bonsForContact; // déjà filtré par statuts autorisés
    // Pour l'impression, utiliser la même logique que displayedProductHistory
    // avec le calcul correct des soldes cumulatifs tenant compte de la période
    const filteredProductsForDisplay = displayedProductHistory.filter((item: any) => !item.syntheticInitial);

    // Calcul des statistiques par produit (SEULEMENT pour la période affichée)
    const productStats = filteredProductsForDisplay.reduce((acc: any, item: any) => {
      const key = `${item.product_reference}-${item.product_designation}`;
      if (!acc[key]) {
        acc[key] = {
          reference: item.product_reference,
          designation: item.product_designation,
          quantite_totale: 0,
          montant_total: 0,
          nombre_commandes: 0,
          prix_moyen: 0
        };
      }
      acc[key].quantite_totale += item.quantite;
      acc[key].montant_total += item.total;
      acc[key].nombre_commandes++;
      acc[key].prix_moyen = acc[key].montant_total / acc[key].quantite_totale;
      return acc;
    }, {});

    // Utiliser le solde final de la liste complète (non filtrée par dates)
    // qui tient compte de TOUTES les transactions 
    const finalCalculatedSolde = finalSoldeNet; // Utiliser le solde calculé correctement

    const productStatsArray = Object.values(productStats).sort((a: any, b: any) => b.montant_total - a.montant_total);

    const printBons = filteredBons;
    const filteredProductsForDisplay2 = filteredProductsForDisplay;
    const printHasSelection = selectedProductIds.size > 0;

    const printContent = `
      <html>
        <head>
          <title>Rapport Détaillé - ${selectedContact.nom_complet}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 10px; font-size: 9px; }
            h1, h2, h3 { color: #333; margin-bottom: 6px; }
            h1 { font-size: 16px; }
            h2 { font-size: 12px; }
            h3 { font-size: 11px; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 8px 0; 
              table-layout: fixed;
              max-width: 100%;
              overflow: hidden;
            }
            th, td { 
              border: 1px solid #ccc; 
              padding: 1px 2px; 
              text-align: left; 
              font-size: 7px; 
              word-wrap: break-word;
              overflow-wrap: break-word;
              line-height: 1.0;
              max-width: 100%;
              box-sizing: border-box;
            }
            th { background-color: #f0f0f0; font-weight: bold; font-size: 8px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .section { margin-bottom: 15px; page-break-inside: avoid; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 10px 0; }
            .info-box { border: 1px solid #ddd; padding: 4px; background: #f9f9f9; }
            .numeric { 
              text-align: right; 
              font-family: 'Courier New', monospace; 
              font-size: 6px; 
              white-space: nowrap; 
              padding: 1px 1px;
            }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
            .text-wrap { 
              white-space: normal; 
              word-break: break-word;
              hyphens: auto;
              line-height: 1.0;
            }
            .designation-col { 
              width: 20%; 
              white-space: normal;
              word-wrap: break-word;
              font-size: 6px;
              line-height: 1.0;
              hyphens: auto;
            }
            .address-col { 
              width: 12%; 
              white-space: normal;
              word-wrap: break-word;
              font-size: 6px;
              line-height: 1.0;
            }
            .numeric-col { 
              width: 8%; 
              min-width: 35px;
              text-align: right;
              font-family: 'Courier New', monospace;
              font-size: 6px;
              padding: 1px 1px;
              white-space: nowrap;
            }
            .date-col { width: 8%; font-size: 6px; }
            .ref-col { width: 8%; font-size: 6px; }
            .type-col { width: 6%; font-size: 6px; }
            .status-col { width: 6%; font-size: 6px; }
            @media print {
              @page { 
                margin: 2mm; 
                size: A4 landscape; 
              }
              body { 
                margin: 1mm; 
                font-size: 6px;
                transform: scale(0.95);
                transform-origin: top left;
              }
              .section { page-break-inside: avoid; }
              table { 
                page-break-inside: auto; 
                font-size: 5px;
                width: 100%;
                table-layout: fixed;
              }
              tr { page-break-inside: avoid; page-break-after: auto; }
              th, td { 
                font-size: 5px; 
                padding: 0.5px 1px; 
                line-height: 0.9;
                border: 0.5px solid #999;
              }
              .numeric, .numeric-col { 
                font-size: 5px; 
                font-family: 'Courier New', monospace;
                white-space: nowrap;
              }
              .designation-col, .address-col { 
                font-size: 5px;
                line-height: 0.9;
                word-break: break-all;
              }
              h1 { font-size: 12px; margin: 2px 0; }
              h2 { font-size: 10px; margin: 2px 0; }
              h3 { font-size: 9px; margin: 2px 0; }
              .info-grid { gap: 5px; margin: 5px 0; }
              .info-box { padding: 2px; font-size: 6px; }
            }
          </style>
        </head>
        <body>
          ${getCompanyHeaderHTML('DIAMOND')}
          <div style="text-align:center;margin-bottom:12px;">
            <h1 style="margin:0;font-size:18px;font-weight:700;color:#111">RAPPORT DÉTAILLÉ</h1>
            <h2 style="margin:4px 0;font-size:14px;font-weight:600;color:#333">${selectedContact.type.toUpperCase()}: ${selectedContact.nom_complet}</h2>
            <p style="margin:2px 0;font-size:12px"><strong>Période:</strong> ${dateFrom ? formatDateDMY(dateFrom) : 'Début'} → ${dateTo ? formatDateDMY(dateTo) : 'Fin'}</p>
            <p style="margin:2px 0;font-size:12px"><strong>Date d'impression:</strong> ${formatDateTimeWithHour(new Date().toISOString())}</p>
          </div>

          ${getTwoRowContactTable(selectedContact)}

          <div class="section">
            <h3>📊 STATISTIQUES PAR PRODUIT (${productStatsArray.length} produits)</h3>
            ${(dateFrom || dateTo) ? `<p style="margin:5px 0;font-size:11px;color:#666;font-style:italic;">⚠️ Statistiques filtrées par période sélectionnée</p>` : ''}
            <table style="table-layout: fixed; width: 100%;">
              <tr>
                <th style="width: 15%;">Référence</th>
                <th style="width: 30%;">Désignation</th>
                <th style="width: 12%;">Qté Totale</th>
                <th style="width: 15%;">Montant Total</th>
                <th style="width: 12%;">Prix Moyen</th>
                <th style="width: 10%;">Nb Commandes</th>
              </tr>
              ${productStatsArray.map((stat: any) =>
      `<tr>
                  <td style="font-size: 6px; word-break: break-all;">${stat.reference}</td>
                  <td style="font-size: 6px; line-height: 0.9; word-break: break-word; hyphens: auto;">${stat.designation}</td>
                  <td class="numeric-col">${stat.quantite_totale}</td>
                  <td class="numeric-col">${stat.montant_total.toFixed(2)} DH</td>
                  <td class="numeric-col">${stat.prix_moyen.toFixed(2)} DH</td>
                  <td class="numeric-col">${stat.nombre_commandes}</td>
                </tr>`
    ).join('')}
              <tr class="total-row">
                <td colspan="2" class="text-wrap"><strong>TOTAL</strong></td>
                <td class="numeric-col"><strong>${productStatsArray.reduce((s: number, p: any) => s + p.quantite_totale, 0)}</strong></td>
                <td class="numeric-col"><strong>${productStatsArray.reduce((s: number, p: any) => s + p.montant_total, 0).toFixed(2)} DH</strong></td>
                <td colspan="2"></td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h3>📋 DÉTAIL DES TRANSACTIONS (${printBons.length} documents)</h3>
            <table style="table-layout: fixed; width: 100%;">
              <tr>
                <th style="width: 15%;">N° Bon</th>
                <th style="width: 12%;">Type</th>
                <th style="width: 18%;">Date</th>
                <th style="width: 15%;">Montant</th>
                <th style="width: 12%;">Statut</th>
                <th style="width: 10%;">Articles</th>
              </tr>
              ${printBons.map(bon => {
      const bonItems = Array.isArray(bon.items) ? bon.items : [];
      return `<tr>
                  <td style="font-size: 6px; word-break: break-all;">${bon.numero}</td>
                  <td style="font-size: 6px;">${bon.type}</td>
                  <td style="font-size: 6px;">${formatDateTimeWithHour(bon.date_creation)}</td>
                  <td class="numeric-col">${Number(bon.montant_total || 0).toFixed(2)} DH</td>
                  <td style="font-size: 6px;">${bon.statut}</td>
                  <td class="numeric-col">${bonItems.length}</td>
                </tr>`;
    }).join('')}
              <tr class="total-row">
                <td colspan="3" class="text-wrap"><strong>TOTAL</strong></td>
                <td class="numeric-col"><strong>${printBons.reduce((s, b) => s + Number(b.montant_total || 0), 0).toFixed(2)} DH</strong></td>
                <td colspan="2"></td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h3>🛍️ DÉTAIL DES ACHATS PAR PRODUIT (${filteredProductsForDisplay2.length} lignes)</h3>
            ${(dateFrom || dateTo) ? `<p style="margin:5px 0;font-size:11px;color:#666;font-style:italic;">⚠️ Données filtrées par période - Soldes cumulatifs calculés correctement en tenant compte des transactions antérieures</p>` : ''}
            <table style="table-layout: fixed; width: 100%;">
              <tr>
                <th style="width: 7%;">Date</th>
                <th style="width: 7%;">N° Bon</th>
                <th style="width: 6%;">Type</th>
                <th style="width: 8%;">Référence</th>
                <th style="width: 25%;">Produit</th>
                <th style="width: 6%;">Qté</th>
                <th style="width: 8%;">Pr U</th>
                <th style="width: 10%;">Total</th>
                ${printHasSelection ? '' : '<th style="width: 12%">Solde Cumulé</th>'}
              </tr>
              ${filteredProductsForDisplay2.map(item =>
      `<tr>
                  <td style="font-size: 6px;">${item.bon_date}</td>
                  <td style="font-size: 6px;">${item.bon_numero}</td>
                  <td style="font-size: 6px;">${item.bon_type}</td>
                  <td style="font-size: 6px; word-break: break-all;">${item.product_reference}</td>
                  <td style="font-size: 6px; line-height: 0.9; word-break: break-word; hyphens: auto;">${item.product_designation}</td>
                  <td class="numeric-col">${item.quantite || 0}</td>
                  <td class="numeric-col">${(item.prix_unitaire || 0).toFixed(2)} DH</td>
                  <td class="numeric-col">${(item.total || 0).toFixed(2)} DH</td>
                  ${printHasSelection ? '' : `<td class="numeric-col"><strong>${(item.soldeCumulatif || 0).toFixed(2)} DH</strong></td>`}
                </tr>`
    ).join('')}
              <tr class="total-row">
                <td colspan="5" class="text-wrap"><strong>TOTAL (période affichée)</strong></td>
                <td class="numeric-col"><strong>${filteredProductsForDisplay2.reduce((s, p) => s + (p.quantite || 0), 0)}</strong></td>
                <td></td>
                <td class="numeric-col"><strong>${filteredProductsForDisplay2.reduce((s, p) => s + (p.total || 0), 0).toFixed(2)} DH</strong></td>
                ${printHasSelection ? '' : `<td class="numeric-col"><strong>${filteredProductsForDisplay2.length > 0 ? (filteredProductsForDisplay2[filteredProductsForDisplay2.length - 1].soldeCumulatif || 0).toFixed(2) : '0.00'} DH</strong></td>`}
              </tr>
            </table>
          </div>

          <div class="section">
            <h3>📈 RÉSUMÉ EXÉCUTIF</h3>
            <div class="info-grid">
              <div class="info-box">
                <h4>Volumes</h4>
                <p><strong>Nombre de documents:</strong> ${filteredBons.length}</p>
                <p><strong>Nombre de produits différents:</strong> ${productStatsArray.length}</p>
                <p><strong>Quantité totale achetée (période):</strong> ${filteredProductsForDisplay.reduce((s: number, p: any) => s + p.quantite, 0)}</p>
              </div>
              <div class="info-box">
                <h4>Montants</h4>
                <p><strong>Chiffre d'affaires total:</strong> ${filteredBons.filter((b: any) => {
      const type = String(b.type || '').toLowerCase();
      return type !== 'avoir' && type !== 'avoirfournisseur';
    }).reduce((s, b) => s + Number(b.montant_total || 0), 0).toFixed(2)} DH</p>
                <p><strong>Panier moyen:</strong> ${(() => {
        const realBons = filteredBons.filter((b: any) => {
          const type = String(b.type || '').toLowerCase();
          return type !== 'avoir' && type !== 'avoirfournisseur';
        });
        return realBons.length > 0 ? (realBons.reduce((s, b) => s + Number(b.montant_total || 0), 0) / realBons.length).toFixed(2) : '0.00';
      })()} DH</p>
                <p><strong>Solde actuel (calculé sur toutes les transactions):</strong> ${finalCalculatedSolde.toFixed(2)} DH</p>
              </div>
            </div>
          </div>

          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px;">
            <p>Rapport généré le ${formatDateDMY(new Date().toISOString())} à ${new Date().toLocaleTimeString('fr-FR')}</p>
            <p>Application de Gestion Commerciale - ${selectedContact.type} ${selectedContact.nom_complet}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      // Add a small script that waits for images to load before printing to avoid blank images
      const wrapped = printContent.replace('</body>', `
        <script>
          (function(){
            function whenImagesLoaded(win){
              const imgs = Array.from(win.document.images || []);
              if (imgs.length === 0) return Promise.resolve();
              return Promise.all(imgs.map(i => new Promise(r => {
                if (i.complete) return r();
                i.addEventListener('load', r);
                i.addEventListener('error', r);
              })));
            }
            whenImagesLoaded(window.frames[0] || window).then(()=>{
              try{ window.print(); }catch(e){}
            });
          })();
        </script>
      </body>`);
      printWindow.document.write(wrapped);
      printWindow.document.close();
    }
  };

  // Impression rapide d'un contact depuis la liste
  const handleQuickPrint = (contact: Contact) => {
    // Calculer les bons pour ce contact
    const isClient = contact.type === 'Client';
    const id = contact.id;
    const list: any[] = [];

    if (isClient) {
      for (const b of sorties) if (b.client_id === id) list.push({ ...b, type: 'Sortie' });
      for (const b of devis) if (b.client_id === id) list.push({ ...b, type: 'Devis' });
      for (const b of comptants) if (b.client_id === id) list.push({ ...b, type: 'Comptant' });
      for (const b of avoirsClient) if (b.client_id === id) list.push({ ...b, type: 'Avoir' });
    } else {
      for (const b of commandes) if (b.fournisseur_id === id) list.push({ ...b, type: 'Commande' });
      for (const b of avoirsFournisseur) if (b.fournisseur_id === id) list.push({ ...b, type: 'AvoirFournisseur' });
    }

    // Solde actuel calculé ailleurs dans les sections imprimées si nécessaire

    const printContent = `
      <html>
        <head>
          <title>Fiche ${contact.nom_complet}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 15px; font-size: 9px; }
            h1, h2, h3 { color: #333; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 2px; text-align: left; font-size: 8px; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.1; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 10px 0; }
            .info-box { border: 1px solid #ddd; padding: 6px; background: #f9f9f9; }
            .numeric { text-align: right; }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
          </style>
        </head>
        <body>
          ${getCompanyHeaderHTML('DIAMOND')}
          <div style="text-align:center;margin-bottom:12px;">
            <h1 style="margin:0;font-size:18px;font-weight:700;color:#111">FICHE ${contact.type.toUpperCase()}</h1>
            <h2 style="margin:4px 0;font-size:14px;font-weight:600;color:#333">${contact.nom_complet}</h2>
            <p style="margin:2px 0;font-size:12px"><strong>Date d'impression:</strong> ${formatDateDMY(new Date().toISOString())}</p>
          </div>

          ${getTwoRowContactTable(contact)}

          <div class="section">
            <h3>📋 TRANSACTIONS (${list.length} documents)</h3>
            <table>
              <tr>
                <th>N° Bon</th>
                <th>Type</th>
                <th>Date</th>
                <th class="numeric">Montant</th>
                <th>Statut</th>
              </tr>
              ${list.map(bon =>
      `<tr>
                  <td>${bon.numero}</td>
                  <td>${bon.type}</td>
                  <td>${formatDateTimeWithHour(bon.date_creation)}</td>
                  <td class="numeric">${Number(bon.montant_total || 0).toFixed(2)} DH</td>
                  <td>${bon.statut}</td>
                </tr>`
    ).join('')}
              <tr class="total-row">
                <td colspan="3"><strong>TOTAL</strong></td>
                <td class="numeric"><strong>${list.reduce((s, b) => s + Number(b.montant_total || 0), 0).toFixed(2)} DH</strong></td>
                <td></td>
              </tr>
            </table>
          </div>

          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px;">
            <p>Fiche générée le ${formatDateTimeWithHour(new Date().toISOString())}</p>
            <p>Application de Gestion Commerciale - ${contact.type} ${contact.nom_complet}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const wrapped = printContent.replace('</body>', `
        <script>
          (function(){
            const imgs = Array.from(document.images || []);
            if (imgs.length === 0) return window.print();
            Promise.all(imgs.map(i => new Promise(r => {
              if (i.complete) return r();
              i.addEventListener('load', r);
              i.addEventListener('error', r);
            }))).then(()=>{ try{ window.print(); }catch(e){} });
          })();
        </script>
      </body>`);
      printWindow.document.write(wrapped);
      printWindow.document.close();
    }
  };

  // Impression globale de tous les contacts
  const handleGlobalPrint = () => {
    const contactsList = sortedContacts; // Utilise les filtres appliqués
    const typeLabel = activeTab === 'clients' ? 'CLIENTS' : 'FOURNISSEURS';

    // Calcul des statistiques globales
    const totalContacts = contactsList.length;
    const totalSoldes = contactsList.reduce((sum, contact) => {
      const base = Number(contact.solde) || 0;
      const isClient = contact.type === 'Client';
      const sales = isClient ? (salesByClient.get(contact.id) || 0) : 0;
      const purchases = !isClient ? (purchasesByFournisseur.get(contact.id) || 0) : 0;
      const paid = paymentsByContact.get(contact.id) || 0;
      const soldeActuel = isClient ? (base + sales - paid) : (base + purchases - paid);
      return sum + soldeActuel;
    }, 0);

    const printContent = `
      <html>
        <head>
          <title>Rapport Global - ${typeLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1, h2, h3 { color: #333; margin-bottom: 6px; }
            h1 { font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 2px; text-align: left; font-size: 8px; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.1; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .numeric { text-align: right; }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
            .info-box { border: 1px solid #ddd; padding: 8px; background: #f9f9f9; margin: 10px 0; }
            .positive { color: green; }
            .negative { color: red; }
            @media print {
              body { margin: 3mm; font-size: 8px; }
              .page-break { page-break-before: always; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
              th, td { font-size: 7px; padding: 1px; }
              .numeric { font-size: 6px; }
              h1 { font-size: 14px; }
              h2 { font-size: 11px; }
              h3 { font-size: 10px; }
            }
          </style>
        </head>
        <body>
          ${getCompanyHeaderHTML('DIAMOND')}
          <div style="text-align:center;margin-bottom:12px;">
            <h1 style="margin:0;font-size:18px;font-weight:700;color:#111">RAPPORT GLOBAL ${typeLabel}</h1>
            <p style="margin:4px 0;font-size:12px"><strong>Recherche appliquée:</strong> "${searchTerm || 'Aucune'}"</p>
            <p style="margin:2px 0;font-size:12px"><strong>Date d'impression:</strong> ${formatDateDMY(new Date().toISOString())}</p>
          </div>

          <div class="info-box">
            <h3>📊 RÉSUMÉ EXÉCUTIF</h3>
            <p><strong>Nombre total de ${typeLabel.toLowerCase()}:</strong> ${totalContacts}</p>
            <p><strong>Solde total cumulé:</strong> <span class="${totalSoldes >= 0 ? 'positive' : 'negative'}">${totalSoldes.toFixed(2)} DH</span></p>
            <p><strong>Solde moyen par contact:</strong> ${totalContacts > 0 ? (totalSoldes / totalContacts).toFixed(2) : '0.00'} DH</p>
          </div>

      <h3>📋 LISTE DES ${typeLabel} (${totalContacts})</h3>
          <table>
            <tr>
        <th>Nom Complet</th>
        <th>Société</th>
              <th>Téléphone</th>
              <th>Email</th>
              <th>ICE</th>
              ${activeTab === 'clients' ? '<th class="numeric">Plafond</th>' : ''}
              <th class="numeric">Solde Initial</th>
              <th class="numeric">Solde Actuel</th>
              <th class="numeric">Nb Transactions</th>
            </tr>
            ${contactsList.map(contact => {
      const base = Number(contact.solde) || 0;
      const isClient = contact.type === 'Client';
      const id = contact.id;
      const sales = isClient ? (salesByClient.get(id) || 0) : 0;
      const purchases = !isClient ? (purchasesByFournisseur.get(id) || 0) : 0;
      const paid = paymentsByContact.get(id) || 0;
      const soldeActuel = isClient ? (base + sales - paid) : (base + purchases - paid);

      // Compter les transactions
      let transactionCount = 0;
      if (isClient) {
        transactionCount += sorties.filter((b: any) => b.client_id === id).length;
        transactionCount += devis.filter((b: any) => b.client_id === id).length;
        transactionCount += comptants.filter((b: any) => b.client_id === id).length;
        transactionCount += avoirsClient.filter((b: any) => b.client_id === id).length;
      } else {
        transactionCount += commandes.filter((b: any) => b.fournisseur_id === id).length;
        transactionCount += avoirsFournisseur.filter((b: any) => b.fournisseur_id === id).length;
      }

      const displayName = (contact.societe && contact.societe.trim()) ? contact.societe : (contact.nom_complet || 'N/A');
      return `<tr>
                <td><strong>${displayName}</strong></td>
                <td>${contact.societe ? contact.societe : '-'}</td>
                <td>${contact.telephone || 'N/A'}</td>
                <td>${contact.email || 'N/A'}</td>
                <td>${contact.ice || 'N/A'}</td>
                ${activeTab === 'clients' ? `<td class="numeric">${Number(contact.plafond || 0).toFixed(2)} DH</td>` : ''}
                <td class="numeric">${base.toFixed(2)} DH</td>
                <td class="numeric ${soldeActuel >= 0 ? 'positive' : 'negative'}"><strong>${soldeActuel.toFixed(2)} DH</strong></td>
                <td class="numeric">${transactionCount}</td>
              </tr>`;
    }).join('')}
            <tr class="total-row">
              <td colspan="${activeTab === 'clients' ? '6' : '5'}"><strong>TOTAUX</strong></td>
              <td class="numeric"><strong>${contactsList.reduce((s, c) => s + Number(c.solde || 0), 0).toFixed(2)} DH</strong></td>
              <td class="numeric"><strong>${totalSoldes.toFixed(2)} DH</strong></td>
              <td class="numeric"><strong>${contactsList.reduce((sum, contact) => {
      const isClient = contact.type === 'Client';
      const id = contact.id;
      let count = 0;
      if (isClient) {
        count += sorties.filter((b: any) => b.client_id === id).length;
        count += devis.filter((b: any) => b.client_id === id).length;
        count += comptants.filter((b: any) => b.client_id === id).length;
        count += avoirsClient.filter((b: any) => b.client_id === id).length;
      } else {
        count += commandes.filter((b: any) => b.fournisseur_id === id).length;
        count += avoirsFournisseur.filter((b: any) => b.fournisseur_id === id).length;
      }
      return sum + count;
    }, 0)}</strong></td>
            </tr>
          </table>

          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px;">
            <p>Rapport généré le ${formatDateDMY(new Date().toISOString())} à ${new Date().toLocaleTimeString('fr-FR')}</p>
            <p>Application de Gestion Commerciale - Rapport Global ${typeLabel}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const wrapped = printContent.replace('</body>', `
        <script>
          (function(){
            const imgs = Array.from(document.images || []);
            if (imgs.length === 0) return window.print();
            Promise.all(imgs.map(i => new Promise(r => {
              if (i.complete) return r();
              i.addEventListener('load', r);
              i.addEventListener('error', r);
            }))).then(()=>{ try{ window.print(); }catch(e){} });
          })();
        </script>
      </body>`);
      printWindow.document.write(wrapped);
      printWindow.document.close();
    }
  };


  // Open print modal for products
  const openPrintProducts = () => {
    // Utiliser la même logique que l'affichage du tableau
    if (selectedProductIds && selectedProductIds.size > 0) {
      // Mode sélection : utiliser seulement les produits sélectionnés avec leurs vrais soldes
      const selectedRows = displayedProductHistoryWithInitial.filter((it: any) =>
        selectedProductIds.has(String(it.id)) && !it.syntheticInitial
      );
      setPrintProducts(selectedRows);
    } else {
      // Mode complet : utiliser exactement ce qui est affiché dans le tableau
      setPrintProducts(displayedProductHistory);
    }
    setPrintModal({ open: true, mode: 'products' });
  };

  const handleClosePrintModal = React.useCallback(() => {
    setPrintModal({ open: false, mode: null });
  }, []);

  // Formik (utilisé par ContactFormModal via props.initialValues si besoin)
  const formik = useFormik({
    initialValues: {
      nom_complet: '',
      telephone: '',
      email: '',
      adresse: '',
      rib: '',
      ice: '',
      solde: 0,
      plafond: undefined as number | undefined,
    },
    validationSchema: contactValidationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        if (editingContact) {
          await updateContactMutation({
            id: editingContact.id,
            ...values,
            updated_by: 1,
          }).unwrap();
          showSuccess('Contact mis à jour avec succès');
        } else {
          await createContact({
            ...values,
            type: activeTab === 'clients' ? 'Client' : 'Fournisseur',
            created_by: 1,
          }).unwrap();
          showSuccess('Contact ajouté avec succès');
        }
        setIsModalOpen(false);
        setEditingContact(null);
        resetForm();
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        showError('Erreur lors de la sauvegarde du contact');
      }
    },
  });

  // Édition
  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    formik.setValues({
      nom_complet: contact.nom_complet,
      telephone: contact.telephone || '',
      email: contact.email || '',
      adresse: contact.adresse || '',
      rib: contact.rib || '',
      ice: contact.ice || '',
      solde: Number(contact.solde) || 0,
      plafond: typeof contact.plafond === 'number' ? contact.plafond : undefined,
    });
    setIsModalOpen(true);
  };

  // Suppression
  const handleDelete = async (id: number) => {
    // Employees are not allowed to delete contacts
    if (isEmployee) {
      showError("Vous n'avez pas la permission de supprimer ce contact.");
      return;
    }
    const result = await showConfirmation(
      'Cette action est irréversible.',
      `Êtes-vous sûr de vouloir supprimer ce ${activeTab === 'clients' ? 'client' : 'fournisseur'} ?`,
      'Oui, supprimer',
      'Annuler'
    );
    if (result.isConfirmed) {
      try {
        await deleteContactMutation({ id, updated_by: currentUser?.id || 1 }).unwrap();
        showSuccess(`${activeTab === 'clients' ? 'Client' : 'Fournisseur'} supprimé avec succès`);
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression');
      }
    }
  };

  // Filtrage par source (clients) puis recherche
  const baseContacts = (activeTab === 'clients' ? clients : fournisseurs);
  const filteredBySource = activeTab === 'clients'
    ? baseContacts.filter(c => (
        clientSubTab === 'backoffice' ? c.source === 'backoffice' :
        clientSubTab === 'ecommerce' ? (c.source === 'ecommerce' && (!c.demande_artisan || !!c.artisan_approuve)) :
        true
      ))
    : baseContacts;
  const filteredContacts = filteredBySource.filter((contact) =>
    (contact.nom_complet?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (contact.societe?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (contact.telephone?.includes(searchTerm))
  );

  // Fonction de tri
  const sortedContacts = useMemo(() => {
    const sorted = [...filteredContacts].sort((a, b) => {
      // 🔥 PRIORITÉ ABSOLUE : Contacts en retard de paiement toujours en premier
      const aOverdue = isOverdueContact(a);
      const bOverdue = isOverdueContact(b);

      // Si l'un est en retard et pas l'autre, le contact en retard vient en premier
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // Si les deux ont le même statut de retard, appliquer le tri normal
      if (!sortField) {
        // Tri par défaut par nom si aucun champ de tri n'est sélectionné
        const aName = a.nom_complet?.toLowerCase() || '';
        const bName = b.nom_complet?.toLowerCase() || '';
        return aName.localeCompare(bName);
      }

      let aValue: any = '';
      let bValue: any = '';

      if (sortField === 'nom') {
        aValue = a.nom_complet?.toLowerCase() || '';
        bValue = b.nom_complet?.toLowerCase() || '';
      } else if (sortField === 'societe') {
        aValue = a.societe?.toLowerCase() || '';
        bValue = b.societe?.toLowerCase() || '';
      } else if (sortField === 'solde') {
        // Utiliser la valeur backend (solde_cumule) si disponible, sinon fallback calcul local.
        const baseA = Number(a.solde) || 0;
        const salesA = activeTab === 'clients' ? (salesByClient.get(a.id) || 0) : 0;
        const purchasesA = activeTab === 'fournisseurs' ? (purchasesByFournisseur.get(a.id) || 0) : 0;
        const paidA = paymentsByContact.get(a.id) || 0;
        const computedA = activeTab === 'clients' ? (baseA + salesA - paidA) : (baseA + purchasesA - paidA);
        aValue = (a as any).solde_cumule != null ? Number((a as any).solde_cumule) : computedA;

        const baseB = Number(b.solde) || 0;
        const salesB = activeTab === 'clients' ? (salesByClient.get(b.id) || 0) : 0;
        const purchasesB = activeTab === 'fournisseurs' ? (purchasesByFournisseur.get(b.id) || 0) : 0;
        const paidB = paymentsByContact.get(b.id) || 0;
        const computedB = activeTab === 'clients' ? (baseB + salesB - paidB) : (baseB + purchasesB - paidB);
        bValue = (b as any).solde_cumule != null ? Number((b as any).solde_cumule) : computedB;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredContacts, sortField, sortDirection, activeTab, salesByClient, purchasesByFournisseur, paymentsByContact, isOverdueContact, overdueValue, overdueUnit]);

  // Fonction pour gérer le tri
  const handleSort = (field: 'nom' | 'societe' | 'solde') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Pagination
  const totalItems = sortedContacts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = sortedContacts.slice(startIndex, endIndex);

  // Réinitialiser la page quand on change d'onglet ou de recherche
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, clientSubTab, searchTerm, sortField, sortDirection]);

  // Load payments from Redux (RTK Query) to enrich payment rows
  const { data: paymentsList } = useGetPaymentsQuery();
  const paymentsMap = useMemo(() => {
    const m = new Map<string, any>();
    (paymentsList || []).forEach((p: any) => {
      m.set(String(p.id), p);
      m.set(`payment-${p.id}`, p);
      if (p.bon_id) m.set(String(p.bon_id), p);
      if (p.reference) m.set(String(p.reference), p);
      if (p.bon_numero) m.set(String(p.bon_numero), p);
      const displayNum = getDisplayNumeroPayment(p);
      if (displayNum) m.set(displayNum, p);
    });
    return m;
  }, [paymentsList]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des Contacts</h1>
          <div className="flex mt-4 border-b">
            <button
              className={`px-6 py-2 font-medium ${activeTab === 'clients' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('clients')}
            >
              <div className="flex items-center gap-2">
                <Users size={18} />
                Clients
              </div>
            </button >
            {!isEmployee && (
              <button
                className={`px-6 py-2 font-medium ${activeTab === 'fournisseurs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('fournisseurs')}
              >
                <div className="flex items-center gap-2">
                  <Truck size={18} />
                  Fournisseurs
                </div>
              </button>
            )}
          </div >
          {activeTab === 'clients' && (
            <div className="flex mt-2 gap-2">
              <button
                className={`px-3 py-1 text-sm rounded ${clientSubTab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setClientSubTab('all')}
              >
                Tous
              </button>
              <button
                className={`px-3 py-1 text-sm rounded ${clientSubTab === 'backoffice' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setClientSubTab('backoffice')}
              >
                Backoffice
              </button>
              <button
                className={`px-3 py-1 text-sm rounded ${clientSubTab === 'ecommerce' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setClientSubTab('ecommerce')}
              >
                Ecommerce
              </button>
              {currentUser?.role === 'PDG' && (
                <button
                  className={`px-3 py-1 text-sm rounded ${clientSubTab === 'artisan-requests' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  onClick={() => setClientSubTab('artisan-requests')}
                >
                  Demandes Artisan
                </button>
              )}
            </div>
          )}
        </div >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${showSettings
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            title="Paramètres de retard de paiement"
          >
            <Settings size={16} />
            Paramètres
          </button>
          <button
            onClick={handleGlobalPrint}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            title={`Imprimer rapport global de tous les ${activeTab === 'clients' ? 'clients' : 'fournisseurs'} (selon filtres appliqués)`}
          >
            <FileText size={16} />
            Rapport Global ({sortedContacts.length})
          </button>
          <button
            onClick={() => {
              setEditingContact(null);
              formik.resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Plus size={20} />
            Nouveau {activeTab === 'clients' ? 'Client' : 'Fournisseur'}
          </button>
        </div>
      </div >

      {/* Section Paramètres */}
      {
        showSettings && (
          <div className="mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                  <Settings className="w-5 h-5 mr-2 text-blue-600" />
                  Paramètres de Retard de Paiement
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PeriodConfig
                  title="Période de Retard de Paiement"
                  description={`Contacts avec solde ${'>'}  0 non modifiés depuis cette période seront affichés en rouge`}
                  value={overdueValue}
                  unit={overdueUnit}
                  onValueChange={setOverdueValue}
                  onUnitChange={setOverdueUnit}
                  icon={AlertTriangle}
                  colorClass="red"
                />

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-800 mb-2">Contacts en Retard Détectés</h3>
                  <p className="text-2xl font-bold text-red-600">
                    {activeTab === 'clients'
                      ? clients.filter(c => isOverdueContact(c)).length
                      : fournisseurs.filter(c => isOverdueContact(c)).length
                    }
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Contacts avec retard de paiement selon les paramètres actuels
                  </p>

                  {/* Debug section */}
                  <div className="mt-3 p-2 bg-white border rounded text-xs">
                    <div className="font-medium mb-1">🔬 Exemple (premiers 2 contacts avec solde {'>'}  0):</div>
                    {(() => {
                      const contactsWithPositiveBalance = (activeTab === 'clients' ? clients : fournisseurs)
                        .filter(c => {
                          const backend = (c as any).solde_cumule;
                          const solde = backend != null ? Number(backend) : Number(c.solde || 0);
                          return solde > 0;
                        })
                        .slice(0, 2);

                      return contactsWithPositiveBalance.map((contact) => {
                        const backend = (contact as any).solde_cumule;
                        const solde = backend != null ? Number(backend) : Number(contact.solde || 0);
                        const isOverdue = isOverdueContact(contact);
                        const lastUpdate = contact.updated_at ? new Date(contact.updated_at) : null;
                        const daysSinceUpdate = lastUpdate ? Math.floor((new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)) : null;

                        return (
                          <div key={contact.id} className="mb-1">
                            <strong>{contact.nom_complet || 'Sans nom'}</strong> -
                            Solde: {solde.toFixed(2)} -
                            MAJ: {contact.updated_at || 'Jamais'} -
                            Il y a: {daysSinceUpdate || 'N/A'} jours -
                            En retard: {isOverdue ? '✅' : '❌'}
                          </div>
                        );
                      });
                    })()}
                    <p className="text-xs text-gray-500 mt-1">
                      Seuil: {overdueValue} {overdueUnit === 'days' ? 'jour(s)' : 'mois'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={`Rechercher (Nom, Société ou Téléphone) ${activeTab === 'clients' ? 'client' : 'fournisseur'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Users className={`${activeTab === 'clients' ? 'text-blue-600' : 'text-gray-600'}`} size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total {activeTab === 'clients' ? 'Clients' : 'Fournisseurs'}</p>
              <p className="text-3xl font-bold text-gray-900">{sortedContacts.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <DollarSign className="text-green-600" size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Solde cumulé</p>
              <p className="text-3xl font-bold text-gray-900">
                {sortedContacts.reduce((sum: number, c: any) => {
                  if (c.solde_cumule != null) return sum + Number(c.solde_cumule || 0);
                  const base = Number(c.solde) || 0;
                  const sales = activeTab === 'clients' ? (salesByClient.get(c.id) || 0) : 0;
                  const purchases = activeTab === 'fournisseurs' ? (purchasesByFournisseur.get(c.id) || 0) : 0;
                  const paid = paymentsByContact.get(c.id) || 0;
                  const balance = activeTab === 'clients' ? (base + sales - paid) : (base + purchases - paid);
                  return sum + balance;
                }, 0).toFixed(2)} DH
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Building2 className="text-purple-600" size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Avec ICE</p>
              <p className="text-3xl font-bold text-gray-900">
                {sortedContacts.filter((c) => c.ice && c.ice.trim() !== '').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contrôles de pagination */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} éléments
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Éléments par page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
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

      {/* Informations sur le tri */}
      {
        (activeTab === 'clients' ? clients : fournisseurs).some(c => isOverdueContact(c)) && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
              <div className="text-sm">
                <p className="text-red-800">
                  <strong>Priorité d'affichage :</strong> Les contacts en retard de paiement (solde {'>'}  0 depuis {overdueValue} {overdueUnit === 'days' ? 'jour(s)' : 'mois'}) sont affichés en rouge et en priorité dans la liste.
                </p>
              </div>
            </div>
          </div>
        )
      }

      {/* Liste */}
      {activeTab === 'clients' && clientSubTab === 'artisan-requests' ? (
        <ArtisanRequestsSection onView={handleViewDetails} />
      ) : (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Desktop/tablet: table view */}
        <div className="overflow-x-auto hidden sm:block">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* Solde en premier */}
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('solde')}
                >
                  <div className="flex items-center gap-2">
                    {activeTab === 'clients' ? 'Solde à recevoir' : 'Solde à payer'}
                    {sortField === 'solde' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('nom')}
                >
                  <div className="flex items-center gap-2">
                    Nom complet
                    {sortField === 'nom' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('societe')}
                >
                  <div className="flex items-center gap-2">
                    Société
                    {sortField === 'societe' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type Compte</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adresse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ICE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RIB</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date création</th>
                {activeTab === 'clients' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plafond</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedContacts.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'clients' ? 11 : 10} className="px-6 py-4 text-center text-sm text-gray-500">
                    Aucun {activeTab === 'clients' ? 'client' : 'fournisseur'} trouvé
                  </td>
                </tr>
              ) : (
                paginatedContacts.map((contact) => {
                  const isOverdue = isOverdueContact(contact);
                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-gray-50 cursor-pointer ${isOverdue ? 'bg-red-50 border-l-4 border-red-500' : ''}`}
                      onClick={() => handleViewDetails(contact)}
                    >
                      {/* Solde en premier */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const backend = (contact as any).solde_cumule;
                          let display: number;
                          if (backend != null) {
                            display = Number(backend) || 0;
                          } else {
                            const base = Number(contact.solde) || 0;
                            const sales = activeTab === 'clients' ? (salesByClient.get(contact.id) || 0) : 0;
                            const purchases = activeTab === 'fournisseurs' ? (purchasesByFournisseur.get(contact.id) || 0) : 0;
                            const paid = paymentsByContact.get(contact.id) || 0;
                            display = activeTab === 'clients' ? (base + sales - paid) : (base + purchases - paid);
                          }
                          const overPlafond = activeTab === 'clients' && typeof contact.plafond === 'number' && contact.plafond > 0 && display > contact.plafond;
                          return (
                            <div className={`flex items-center gap-2 text-sm font-semibold ${display > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                              {display.toFixed(2)} DH
                              {overPlafond && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Dépasse plafond</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{contact.nom_complet}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{(contact.societe && contact.societe.trim()) ? contact.societe : '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {contact.type_compte || '-'}
                          {contact.demande_artisan && !contact.artisan_approuve && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              Demande
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Phone size={16} className="text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{contact.telephone || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Mail size={16} className="text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{contact.email || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <MapPin size={16} className="text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{contact.adresse || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{contact.ice || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <CreditCard size={16} className="text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">
                            {contact.rib ? `${contact.rib.substring(0, 4)}...` : '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700">{formatDateTimeWithHour((contact.date_creation || contact.created_at) as string)}</div>
                      </td>
                      {activeTab === 'clients' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {contact.plafond ? `${contact.plafond} DH` : '-'}
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewDetails(contact); }}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Voir détails"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleQuickPrint(contact); }}
                            className="text-green-600 hover:text-green-900"
                            title="Imprimer fiche"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(contact); }}
                            className="text-blue-600 hover:text-blue-900"
                            title="Modifier"
                          >
                            <Edit size={16} />
                          </button>
                          {currentUser?.role === 'PDG' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(contact.id); }}
                              className="text-red-600 hover:text-red-900"
                              title="Supprimer"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: Sort selector */}
        <div className="sm:hidden bg-gray-50 border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="mobile-sort" className="text-sm font-medium text-gray-700">
              Trier par:
            </label>
            <div className="flex items-center gap-2">
              <select
                id="mobile-sort"
                value={sortField || ''}
                onChange={(e) => {
                  const field = e.target.value as 'nom' | 'societe' | 'solde' | '';
                  if (field) {
                    handleSort(field);
                  } else {
                    setSortField(null);
                    setSortDirection('asc');
                  }
                }}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Par défaut</option>
                <option value="nom">Nom</option>
                <option value="societe">Société</option>
                <option value="solde">Solde</option>
              </select>
              {sortField && (
                <button
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title={`Ordre ${sortDirection === 'asc' ? 'croissant' : 'décroissant'}`}
                >
                  {sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: card view */}
        <div className="sm:hidden divide-y divide-gray-100">
          {paginatedContacts.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              Aucun {activeTab === 'clients' ? 'client' : 'fournisseur'} trouvé
            </div>
          ) : (
            paginatedContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => handleViewDetails(contact)}
              >
                {/* Top row: Name + Solde */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{contact.nom_complet}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {(contact.societe && contact.societe.trim()) ? contact.societe : '-'}
                    </div>
                  </div>
                  <div className="text-right">
                    {(() => {
                      const backend = (contact as any).solde_cumule;
                      let display: number;
                      if (backend != null) {
                        display = Number(backend) || 0;
                      } else {
                        const base = Number(contact.solde) || 0;
                        const sales = activeTab === 'clients' ? (salesByClient.get(contact.id) || 0) : 0;
                        const purchases = activeTab === 'fournisseurs' ? (purchasesByFournisseur.get(contact.id) || 0) : 0;
                        const paid = paymentsByContact.get(contact.id) || 0;
                        display = activeTab === 'clients' ? (base + sales - paid) : (base + purchases - paid);
                      }
                      const overPlafond = activeTab === 'clients' && typeof contact.plafond === 'number' && contact.plafond > 0 && display > contact.plafond;
                      return (
                        <div className={`text-sm font-semibold ${display > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                          {display.toFixed(2)} DH
                          {overPlafond && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">Dépasse</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Body grid */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div><span className="text-gray-500">Téléphone:</span> {contact.telephone || '-'}</div>
                  <div><span className="text-gray-500">Email:</span> {contact.email || '-'}</div>
                  <div className="col-span-2"><span className="text-gray-500">Adresse:</span> {contact.adresse || '-'}</div>
                  <div><span className="text-gray-500">ICE:</span> {contact.ice || '-'}</div>
                  <div><span className="text-gray-500">RIB:</span> {contact.rib || '-'}</div>
                  <div className="col-span-2"><span className="text-gray-500">Créé le:</span> {contact.created_at ? String(contact.created_at).slice(0, 10) : '-'}</div>
                  {activeTab === 'clients' && (
                    <div className="col-span-2"><span className="text-gray-500">Plafond:</span> {typeof contact.plafond === 'number' ? `${contact.plafond.toFixed(2)} DH` : '-'}</div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200"
                    onClick={(e) => { e.stopPropagation(); handleQuickPrint(contact); }}
                    title="Imprimer"
                  >
                    Imprimer
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200"
                    onClick={(e) => { e.stopPropagation(); handleEdit(contact); }}
                    title="Modifier"
                  >
                    Modifier
                  </button>
                  <button
                    className="ml-auto px-2 py-1 text-xs rounded bg-red-50 text-red-700 border border-red-200"
                    onClick={(e) => { e.stopPropagation(); handleDelete(contact.id); }}
                    title="Supprimer"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      )}

      {/* Navigation de pagination */}
      {
        totalPages > 1 && (
          <div className="mt-4 flex justify-center items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Précédent
            </button>

            {/* Affichage des numéros de page */}
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
                    className={`px-3 py-2 border rounded-md ${currentPage === pageNum
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
        )
      }

      {/* Modal: ajouter / modifier */}
      <ContactFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingContact(null);
        }}
        contactType={activeTab === 'clients' ? 'Client' : 'Fournisseur'}
        initialValues={editingContact || undefined}
        onContactAdded={(newContact) => {
          showSuccess(`${newContact.type} ajouté avec succès!`);
        }}
      />

      {/* Modal de détails */}
      {
        isDetailsModalOpen && selectedContact && (
          <div className="fixed inset-0 z-50 bg-white">
            <div className="bg-white w-full h-full overflow-y-auto">
              <div className={`${selectedContact.type === 'Client' ? 'bg-blue-600' : 'bg-green-600'} px-6 py-4 sticky top-0 z-10 shadow-md`}>
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">Détails - {selectedContact.nom_complet}</h2>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handlePrint}
                      className="flex items-center gap-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-4 py-2 rounded-md transition-colors font-medium border border-white border-opacity-30"
                      title="Imprimer rapport détaillé avec produits et transactions (selon filtres appliqués)"
                    >
                      <FileText size={16} />
                      Rapport Détaillé
                    </button>
                    {SHOW_WHATSAPP_BUTTON && (
                      <button
                        onClick={handleSendWhatsAppContactProducts}
                        disabled={sendingWhatsApp}
                        className="flex items-center gap-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-4 py-2 rounded-md transition-colors font-medium border border-white border-opacity-30 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Envoyer le rapport Détail Produits par WhatsApp (avec filtres ou sans filtres)"
                      >
                        <Send size={16} />
                        {sendingWhatsApp ? 'Envoi...' : 'WhatsApp Produits'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsDetailsModalOpen(false);
                        setSelectedContact(null);
                        setSelectedProductIds(new Set());
                        setSelectedBonIds(new Set());
                        setPrintProducts([]);
                      }}
                      className="text-white hover:text-gray-200 text-2xl font-bold"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-[calc(100vh-80px)] overflow-y-auto p-6">
                {/* Infos contact */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-bold text-lg mb-3">Informations du {selectedContact.type}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <p className="font-semibold text-gray-600">Société:</p>
                      <p>{(selectedContact.societe && selectedContact.societe.trim()) ? selectedContact.societe : '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-600">Type Compte:</p>
                      <p>
                        {selectedContact.type_compte || '-'}
                        {selectedContact.demande_artisan && !selectedContact.artisan_approuve && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Demande
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-600">Téléphone:</p>
                      <p>{selectedContact.telephone || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-600">Email:</p>
                      <p>{selectedContact.email || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-600">ICE:</p>
                      <p>{selectedContact.ice || '-'}</p>
                    </div>
                  </div>

                  {/* Section Soldes */}
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <DollarSign size={16} />
                      Situation Financière
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="font-semibold text-gray-600 text-sm">Solde Initial:</p>
                        <p className={`font-bold text-lg ${(Number(selectedContact.solde) || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {(Number(selectedContact.solde) || 0).toFixed(2)} DH
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="font-semibold text-gray-600 text-sm">Total des remises</p>
                        {(() => {
                          const list = (allProductHistory || []).filter((i: any) => i.type === 'produit' && !i.syntheticInitial);
                          const sum = list.reduce((s: number, it: any) => {
                            let r = 0;
                            if (typeof it.remise_totale === 'number') r = Number(it.remise_totale || 0);
                            else if (typeof it.remise_montant === 'number') r = Number(it.remise_montant || 0) * (Number(it.quantite) || 0);
                            else {
                              try {
                                const rems = getItemRemises(it);
                                r = (Number(rems.abonne || 0) + Number(rems.client || 0));
                              } catch (e) {
                                r = 0;
                              }
                            }
                            return s + r;
                          }, 0);
                          return (
                            <div className="space-y-1">
                              <p className={`font-bold text-lg ${sum >= 0 ? 'text-green-600' : 'text-red-600'}`}>{contactRemises.reduce((sum: number, r: any) => sum + (r.items || []).reduce((s: number, i: any) => s + (Number(i.qte) || 0) * (Number(i.prix_remise) || 0), 0), 0).toFixed(2)} DH</p>
                              <p className="text-xs text-gray-500">Somme des remises applicables aux produits affichés</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex gap-4 items-stretch">
                      <div className="bg-white rounded-lg p-3 border flex-1">
                        <p className="font-semibold text-gray-600 text-sm">Solde Cumulé:</p>
                        {(() => {
                          const backend = (selectedContact as any).solde_cumule;
                          const soldeInitial = Number(selectedContact.solde) || 0;
                          const isClient = selectedContact.type === 'Client';
                          const id = selectedContact.id;
                          const sales = isClient ? (salesByClient.get(id) || 0) : 0;
                          const purchases = !isClient ? (purchasesByFournisseur.get(id) || 0) : 0;
                          const paid = paymentsByContact.get(id) || 0;
                          const localComputed = isClient ? (soldeInitial + sales - paid) : (soldeInitial + purchases - paid);
                          const value = backend != null ? Number(backend) : localComputed;
                          const diff = backend != null ? (Number(backend) - localComputed) : 0;
                          return (
                            <div className="space-y-1">
                              <p className={`font-bold text-lg ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>{value.toFixed(2)} DH</p>
                              {backend != null && Math.abs(diff) > 0.01 && (
                                <p className="text-xs text-orange-600 font-medium">
                                  Attention: différence entre calcul local ({localComputed.toFixed(2)} DH) et base ({Number(backend).toFixed(2)} DH) = {diff > 0 ? '+' : ''}{diff.toFixed(2)} DH
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="bg-white rounded-lg p-3 border flex-1">
                        <p className="font-semibold text-gray-600 text-sm">Bénéfice total</p>
                        <p className={`font-bold text-lg ${(() => {
                          const sum = (allProductHistory || []).filter((i: any) => i.type === 'produit' && !i.syntheticInitial).reduce((s: number, i: any) => s + Number(i.benefice || 0), 0);
                          return sum >= 0 ? 'text-green-600' : 'text-red-600';
                        })()}`}>
                          {(() => {
                            const sum = (allProductHistory || []).filter((i: any) => i.type === 'produit' && !i.syntheticInitial).reduce((s: number, i: any) => s + Number(i.benefice || 0), 0);
                            return `${sum.toFixed(2)} DH`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Carte Bénéfice des Produits Sélectionnés */}
                {selectedProductIds.size > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-green-800">
                      <DollarSign size={20} className="text-green-600" />
                      Bénéfice des Produits Sélectionnés
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                        {selectedProductIds.size} produit{selectedProductIds.size > 1 ? 's' : ''}
                      </span>
                    </h3>
                    <div className="flex justify-center">
                      <div className="bg-white rounded-lg p-4 border border-green-200 text-center">
                        <p className="font-semibold text-gray-600 text-sm mb-2">Bénéfice Total des Produits Sélectionnés:</p>
                        {(() => {
                          const selectedBenefit = allProductHistory
                            .filter((item: any) => selectedProductIds.has(String(item.id)) && !item.syntheticInitial)
                            .reduce((sum: number, item: any) => sum + (Number(item.benefice) || 0), 0);
                          return (
                            <p className={`font-bold text-2xl ${selectedBenefit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {selectedBenefit.toFixed(2)} DH
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => setSelectedProductIds(new Set())}
                        className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                      >
                        Effacer la sélection
                      </button>
                    </div>
                  </div>
                )}

                {/* Filtres de date */}
                <div className="bg-white border rounded-lg p-4 mb-6">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    <Calendar size={20} />
                    Filtrer par période
                    {(dateFrom || dateTo) ? (
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Filtre actif</span>
                    ) : (
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Toutes les transactions</span>
                    )}
                  </h3>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 items-stretch sm:items-end">
                    <div className="w-full sm:w-auto">
                      <label htmlFor="contact-date-from" className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        id="contact-date-from"
                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="w-full sm:w-auto">
                      <label htmlFor="contact-date-to" className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        id="contact-date-to"
                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const today = new Date();
                        const thirtyDaysAgo = new Date(today);
                        thirtyDaysAgo.setDate(today.getDate() - 30);
                        setDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
                        setDateTo(today.toISOString().split('T')[0]);
                      }}
                      className="w-full sm:w-auto px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors"
                    >
                      30 derniers jours
                    </button>
                    <button
                      onClick={() => {
                        setDateFrom('2024-01-01');
                        setDateTo('2024-12-31');
                      }}
                      className="w-full sm:w-auto px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors"
                    >
                      2024
                    </button>
                    <button
                      onClick={() => {
                        setDateFrom('2025-01-01');
                        setDateTo('2025-12-31');
                      }}
                      className="w-full sm:w-auto px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md transition-colors"
                    >
                      2025
                    </button>
                    <button
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                      className="w-full sm:w-auto px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                    >
                      Toutes les dates
                    </button>
                  </div>
                </div>

                {/* Onglet unique : Détail des Produits */}
                <div className="border-b border-gray-200 mb-4">
                  <nav className="flex space-x-8">
                    <div className="py-2 px-1 font-medium border-b-2 border-blue-600 text-blue-600">
                      Détail Produits
                    </div>
                    <button
                      type="button"
                      className="ml-4 px-3 py-1 bg-red-100 text-red-700 rounded text-xs border border-red-300 hover:bg-red-200"
                      onClick={() => {
                        const payments = (displayedProductHistory || []).filter((item: any) => item.type === 'paiement');
                        console.log('Paiements pour le contact:', selectedContact, payments);
                        alert('Paiements loggés dans la console.');
                      }}
                    >
                      Debug Paiements
                    </button>
                  </nav>
                </div>


                <div className="mb-8">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <FileText size={20} />
                      Historique Détaillé des Produits
                      {(dateFrom || dateTo) && (
                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                          Filtré du {dateFrom || '...'} au {dateTo || '...'}
                        </span>
                      )}
                    </h3>
                    {/* Résumé remises (debug + info) */}
                    {selectedContact?.type === 'Client' && contactRemises.length > 0 && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-800">
                        <div className="font-semibold">Résumé Remises</div>
                        <div className="flex gap-3 flex-wrap">
                          <span>
                            Abonné: {contactRemises.filter(r => r.type === 'client_abonne').reduce((sum: number, r: any) => sum + (r.items || []).reduce((s: number, i: any) => s + (Number(i.qte) || 0) * (Number(i.prix_remise) || 0), 0), 0).toFixed(2)} DH
                          </span>
                          <span>
                            Client: {contactRemises.filter(r => r.type === 'client-remise').reduce((sum: number, r: any) => sum + (r.items || []).reduce((s: number, i: any) => s + (Number(i.qte) || 0) * (Number(i.prix_remise) || 0), 0), 0).toFixed(2)} DH
                          </span>
                          <span>
                            Total: {contactRemises.reduce((sum: number, r: any) => sum + (r.items || []).reduce((s: number, i: any) => s + (Number(i.qte) || 0) * (Number(i.prix_remise) || 0), 0), 0).toFixed(2)} DH
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                          type="text"
                          placeholder="Rechercher produit (Référence, Désignation, Numéro bon)"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="w-full sm:w-72 pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                        />
                      </div>
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm">
                        {displayedProductHistory.length} éléments
                      </span>
                      <span className="text-xs text-gray-500">
                        {selectedProductIds.size > 0 ? `${selectedProductIds.size} produit(s) sélectionné(s)` : 'Aucun produit sélectionné'}
                      </span>
                      {selectedProductIds.size > 0 && (
                        <button
                          onClick={() => setSelectedProductIds(new Set())}
                          className="w-full sm:w-auto text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                        >
                          Désélectionner produits
                        </button>
                      )}
                      {selectedBonIds.size > 0 && (
                        <span className="text-xs text-blue-600">
                          {selectedBonIds.size} bon(s) sélectionné(s)
                        </span>
                      )}
                      {selectedBonIds.size > 0 && (
                        <button
                          onClick={clearBonSelection}
                          className="w-full sm:w-auto text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          Désélectionner bons
                        </button>
                      )}
                      {selectedContact?.type === 'Client' && (
                        <button
                          onClick={() => setShowRemiseMode(!showRemiseMode)}
                          className={`w-full sm:w-auto flex items-center gap-2 px-3 py-1 rounded-md transition-colors text-sm ${showRemiseMode
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-orange-600 text-white hover:bg-orange-700'
                            }`}
                        >
                          <Receipt size={14} />
                          {showRemiseMode ? 'Annuler Remises' : 'Appliquer Remise'}
                        </button>
                      )}
                      <button
                        onClick={openPrintProducts}
                        className="w-full sm:w-auto flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm"
                        title="Imprimer uniquement le détail des produits"
                      >
                        <Printer size={14} />
                        Imprimer
                      </button>
                      {/* Contact Print Modal (unified for transactions/products) */}
                      {printModal.open && selectedContact && (
                        <ContactPrintModal
                          isOpen={printModal.open}
                          onClose={handleClosePrintModal}
                          contact={selectedContact}
                          mode="products"
                          transactions={[]}
                          productHistory={printProducts.length > 0 ? printProducts : displayedProductHistory}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          skipInitialRow={
                            // Skip initial row if:
                            // 1. Selected products mode (specific selection)
                            // 2. OR date filtering is active (period filtering)
                            (printProducts.length > 0 && selectedProductIds.size > 0) ||
                            !!(dateFrom || dateTo)
                          }
                          hideCumulative={
                            // Hide cumulative column ONLY when:
                            // 1. User selected specific products (selectedProductIds has items)
                            // 2. OR user selected specific bons (selectedBonIds has items)
                            // Do NOT hide when only date filtering is active
                            (printProducts.length > 0 && selectedProductIds.size > 0) ||
                            (selectedBonIds && selectedBonIds.size > 0)
                          }
                          totalQty={displayedTotals.totalQty}
                          totalAmount={displayedTotals.totalAmount}
                          finalSolde={finalSoldeNet}
                        />
                      )}
                    </div>
                  </div>
                  {/* Bouton Valider Remises */}
                  {showRemiseMode && selectedContact?.type === 'Client' && selectedItemsForRemise.size > 0 && (
                    <div className="mb-4 bg-orange-50 rounded-lg p-4 border border-orange-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-orange-800 mb-2">Remises à valider</h4>
                          <p className="text-sm text-orange-700">
                            {selectedItemsForRemise.size} article{selectedItemsForRemise.size > 1 ? 's' : ''} sélectionné{selectedItemsForRemise.size > 1 ? 's' : ''} •
                            Total remises: {Object.entries(remisePrices)
                              .filter(([id]) => selectedItemsForRemise.has(id))
                              .reduce((sum, [id, price]) => {
                                const item = allProductHistory.find(i => i.id === id);
                                return sum + (price * (item?.quantite || 0));
                              }, 0)
                              .toFixed(2)} DH
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setRemisePrices({});
                              setSelectedItemsForRemise(new Set());
                            }}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                          >
                            Effacer
                          </button>
                          <button
                            onClick={handleValidateRemises}
                            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                          >
                            Valider Remises
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="w-full border border-gray-200 rounded-lg relative">
                    <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 0px)', minHeight: '400px' }}>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-20">
                          <tr>
                            <th className="px-1 ">
                              <input
                                type="checkbox"
                                aria-label="Sélectionner tout"
                                checked={displayedProductHistory.filter((i: any) => !i.syntheticInitial).every((i: any) => selectedProductIds.has(String(i.id))) && displayedProductHistory.filter((i: any) => !i.syntheticInitial).length > 0}
                                onChange={(e) => {
                                  const all = new Set<string>(selectedProductIds);
                                  const nonInitial = displayedProductHistory.filter((i: any) => !i.syntheticInitial);
                                  if (e.target.checked) {
                                    nonInitial.forEach((i: any) => all.add(String(i.id)));
                                  } else {
                                    nonInitial.forEach((i: any) => all.delete(String(i.id)));
                                  }
                                  setSelectedProductIds(all);
                                }}
                              />
                            </th>
                            <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                            <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  aria-label="Sélectionner les bons visibles"
                                  checked={(() => {
                                    const nonInitial = Array.from(new Set((displayedProductHistory || []).filter((i: any) => !i.syntheticInitial && i.bon_id).map((i: any) => Number(i.bon_id))));
                                    return nonInitial.length > 0 && nonInitial.every((id) => selectedBonIds.has(id));
                                  })()}
                                  onChange={(e) => {
                                    const nonInitial = Array.from(new Set((displayedProductHistory || []).filter((i: any) => !i.syntheticInitial && i.bon_id).map((i: any) => Number(i.bon_id))));
                                    if (e.target.checked) setSelectedBonIds(new Set(nonInitial)); else setSelectedBonIds(new Set());
                                  }}
                                />
                                <span>Bon N°</span>
                              </div>
                            </th>
                            <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Type</th>
                            <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Référence</th>
                            <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Désignation</th>
                            <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adresse Livraison</th>
                            {selectedContact?.type === 'Fournisseur' && (
                              <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Règlement</th>
                            )}
                            {/* Remises séparées par type */}
                            <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Remise Abonné</th>
                            <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Remise Client</th>
                            {showRemiseMode && selectedContact?.type === 'Client' && (
                              <>
                                <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Prix Remise</th>
                                <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Total Remise</th>
                              </>
                            )}
                            <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Quantité</th>
                            <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{selectedContact?.type === 'Fournisseur' ? 'Prix Achat' : 'Pr U'}</th>
                            <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                            <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Bénéfice</th>
                            <th className="px-1  text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Statut</th>
                            {/* Solde Cumulé déplacé à la fin */}
                            <th className="px-1  text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Solde Cumulé</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {displayedProductHistory.length === 0 ? (
                            <tr>
                              <td colSpan={20} className="px-6  text-center text-sm text-gray-500">
                                Aucun produit trouvé pour cette période
                              </td>
                            </tr>
                          ) : (
                            displayedProductHistory.map((item) => (
                              <tr key={item.id} className={`hover:bg-gray-50 ${(item.type || '').toLowerCase() === 'paiement' ? 'bg-green-100' : (item.type || '').toLowerCase() === 'avoir' ? 'bg-orange-100' : ''}`}>
                                <td className="px-2  whitespace-nowrap">
                                  {item.syntheticInitial ? (
                                    <span className="text-xs text-gray-400">—</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={selectedProductIds.has(String(item.id))}
                                      onChange={(e) => {
                                        const next = new Set<string>(selectedProductIds);
                                        const id = String(item.id);
                                        const bonId = Number(item.bon_id);

                                        if (e.target.checked) {
                                          next.add(id);
                                        } else {
                                          next.delete(id);
                                        }

                                        setSelectedProductIds(next);

                                        // Vérifier si tous les produits de ce bon sont maintenant sélectionnés
                                        if (bonId) {
                                          const allProductsOfBon = displayedProductHistory
                                            .filter((p: any) => !p.syntheticInitial && Number(p.bon_id) === bonId)
                                            .map((p: any) => String(p.id));

                                          const allSelected = allProductsOfBon.every(pId =>
                                            pId === id ? e.target.checked : next.has(pId)
                                          );

                                          setSelectedBonIds(prevBons => {
                                            const nextBons = new Set(prevBons);
                                            if (allSelected) {
                                              nextBons.add(bonId);
                                            } else {
                                              nextBons.delete(bonId);
                                            }
                                            return nextBons;
                                          });
                                        }
                                      }}
                                    />
                                  )}
                                </td>
                                <td className="px-6  whitespace-nowrap">
                                  <div className="text-sm text-gray-700">
                                    {item.syntheticInitial ? '-' : (
                                      item.bon_date_iso
                                        ? formatDateTimeWithHour(item.bon_date_iso)
                                        : item.bon_date
                                    )}
                                  </div>
                                </td>
                                <td className="px-6  whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    {item.syntheticInitial ? (
                                      <span className="w-4 text-xs text-gray-400">—</span>
                                    ) : (
                                      <input
                                        type="checkbox"
                                        checked={selectedBonIds.has(Number(item.bon_id))}
                                        onChange={() => item.bon_id && toggleBonSelection(Number(item.bon_id))}
                                      />
                                    )}
                                    <div className="text-sm font-medium text-gray-900">{item.bon_numero}</div>
                                  </div>
                                </td>
                                <td className="px-6  whitespace-nowrap">
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${item.bon_type === 'Solde initial' ? 'bg-gray-200 text-gray-700' : item.bon_type === 'Paiement'
                                      ? 'bg-green-200 text-green-700'
                                      : item.bon_type === 'Commande'
                                        ? 'bg-blue-200 text-blue-700'
                                        : item.bon_type === 'Sortie'
                                          ? 'bg-purple-200 text-purple-700'
                                          : item.bon_type === 'Devis'
                                            ? 'bg-yellow-200 text-yellow-700'
                                            : 'bg-red-200 text-red-700'
                                      }`}
                                  >
                                    {item.bon_type}
                                  </span>
                                </td>
                                <td className="px-1  whitespace-nowrap">
                                  <div className="text-sm text-gray-900">{item.syntheticInitial ? '—' : item.product_reference}</div>
                                </td>
                                <td className="px-1 py-3 max-w-xs">
                                  <div className="text-sm text-gray-900 truncate" title={item.syntheticInitial ? 'Solde initial' : item.product_designation}>
                                    {item.syntheticInitial ? 'Solde initial' : item.product_designation}
                                    {item.type === 'paiement' && item.mode && (
                                      <span className="ml-2 text-xs text-gray-500">({item.mode})</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-1 py-3 max-w-xs">
                                  <div className="text-sm text-gray-900 truncate" title={item.syntheticInitial || item.type === 'paiement' ? '-' : (item.adresse_livraison || '-')}>
                                    {item.syntheticInitial || item.type === 'paiement' ? '-' : (item.adresse_livraison || '-')}
                                  </div>
                                </td>
                                {selectedContact?.type === 'Fournisseur' && (
                                  <td className="px-1 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">
                                      {(() => {
                                        if (item.syntheticInitial) return '-';

                                        // Payment rows: prefer explicit fields, then try to infer from designation
                                        if (item.type === 'paiement') {
                                          // First try any explicit code_reglement on the item
                                          if (item.code_reglement) return item.code_reglement;

                                          // Try to find a matching payment from Redux by several keys and prefer code_reglement
                                          const lookupKeys = [item.id, item.bon_id, item.bon_numero, item.reference].map((k: any) => k != null ? String(k) : '');
                                          for (const k of lookupKeys) {
                                            if (!k) continue;
                                            const p = paymentsMap.get(k);
                                            if (p) {
                                              if (p.code_reglement) return p.code_reglement;
                                              if (p.mode_paiement) return p.mode_paiement;
                                              if (p.mode) return p.mode;
                                              const pdp = p.product_designation || p.product?.designation || '';
                                              if (pdp) {
                                                const m2 = String(pdp).match(/^Paiement[:\s-]*(.+)$/i);
                                                if (m2 && m2[1]) return m2[1].trim();
                                                return String(pdp).trim();
                                              }
                                            }
                                          }

                                          // Then try fields that may exist directly on the item
                                          if (item.mode_paiement) return item.mode_paiement;
                                          if (item.mode) return item.mode;

                                          // Fallback to item designation if present
                                          const pd = (item.product_designation || item.product?.designation || '') + '';
                                          if (pd) {
                                            const m = pd.match(/^Paiement[:\s-]*(.+)$/i);
                                            if (m && m[1]) return m[1].trim();
                                            return pd.trim();
                                          }

                                          // Nothing available -> log for debugging and show visible warning
                                          console.debug('Payment item missing reglement/mode/code_reglement:', item);
                                          return <span style={{ color: 'red', fontWeight: 'bold' }}>pas trouver non cheque</span>;
                                        }

                                        // Non-payment rows: try all possible sources for reglement value
                                        const val = item.code_reglement
                                          || item.bon_code_reglement
                                          || item.reglement
                                          || (item.bon && item.bon.code_reglement)
                                          || (item.product && item.product.code_reglement)
                                          || (item.product && item.product.reglement)
                                          || '-';
                                        return val;
                                      })()}
                                    </div>
                                  </td>
                                )}
                                {/* Remises séparées par type */}
                                <td className="px-1  whitespace-nowrap text-sm text-right text-gray-900">
                                  {(() => {
                                    if (item.syntheticInitial || item.type === 'paiement') return '-';
                                    const remises = getItemRemises(item);
                                    if (remises.abonne > 0) return `${remises.abonne.toFixed(2)} DH`;
                                    // Montrer 0 si un match a eu lieu mais totalRemise = 0 (rare) -> on ne sait pas ici. Donc on laisse '-'
                                    return '-';
                                  })()}
                                </td>
                                <td className="px-1  whitespace-nowrap text-sm text-right text-gray-900">
                                  {(() => {
                                    if (item.syntheticInitial || item.type === 'paiement') return '-';
                                    const remises = getItemRemises(item);
                                    const remiseFromBon = typeof item.remise_montant === 'number' && item.remise_montant > 0 ? item.remise_montant : 0;
                                    // Addition des remises client-remise (items) + remise du bon
                                    const totalClientRemise = remises.client + remiseFromBon;
                                    return totalClientRemise > 0 ? `${totalClientRemise.toFixed(2)} DH` : '-';
                                  })()}
                                </td>
                                {showRemiseMode && selectedContact?.type === 'Client' && (
                                  <>
                                    {/* Prix remise input */}
                                    <td className="px-1  whitespace-nowrap text-sm text-right">
                                      {item.syntheticInitial || item.type === 'paiement' || item.type === 'avoir' ? (
                                        <span className="text-gray-400">-</span>
                                      ) : (
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          placeholder="0.00"
                                          value={remisePrices[item.id] || ''}
                                          onChange={(e) => {
                                            const value = parseFloat(e.target.value) || 0;
                                            setRemisePrices(prev => ({
                                              ...prev,
                                              [item.id]: value
                                            }));
                                            if (value > 0) {
                                              setSelectedItemsForRemise(prev => new Set(prev).add(item.id));
                                            } else {
                                              setSelectedItemsForRemise(prev => {
                                                const newSet = new Set(prev);
                                                newSet.delete(item.id);
                                                return newSet;
                                              });
                                            }
                                          }}
                                          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-right"
                                        />
                                      )}
                                    </td>
                                    {/* Total remise calculé */}
                                    <td className="px-1  whitespace-nowrap text-sm text-right">
                                      {item.syntheticInitial || item.type === 'paiement' || item.type === 'avoir' ? (
                                        <span className="text-gray-400">-</span>
                                      ) : (
                                        <span className="font-medium text-green-600">
                                          {remisePrices[item.id] ?
                                            `${(remisePrices[item.id] * item.quantite).toFixed(2)} DH` :
                                            '0.00 DH'
                                          }
                                        </span>
                                      )}
                                    </td>
                                  </>
                                )}
                                <td className="px-6  whitespace-nowrap text-sm text-gray-900 text-right">
                                  {item.syntheticInitial ? '-' : item.type === 'paiement' ? '-' : item.quantite}
                                </td>
                                <td className="px-6  whitespace-nowrap text-sm text-gray-900 text-right">
                                  {item.syntheticInitial ? '-' : (() => {
                                    const v = selectedContact?.type === 'Fournisseur'
                                      ? (item as any).prix_achat ?? item.prix_unitaire
                                      : item.prix_unitaire;
                                    return `${(typeof v === 'number' ? v : parseFloat(v) || 0).toFixed(2)} DH`;
                                  })()}
                                </td>
                                <td className="px-6  whitespace-nowrap text-sm text-right">
                                  <div className={`font-semibold ${item.syntheticInitial ? 'text-gray-500' : item.type === 'paiement' ? 'text-green-600' : 'text-blue-600'}`}>
                                    {item.syntheticInitial ? '—' : item.type === 'paiement' ? '-' : '+'}
                                    {item.syntheticInitial ? '' : `${item.total.toFixed(2)} DH`}
                                  </div>
                                </td>
                                <td className="px-6  whitespace-nowrap text-sm text-right">
                                  {item.syntheticInitial || item.type === 'paiement' ? (
                                    <span className="text-gray-400">-</span>
                                  ) : (
                                    <div className={`font-semibold ${Number(item.benefice) > 0 ? 'text-green-600' : Number(item.benefice) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                      {Number(item.benefice ?? 0).toFixed(2)} DH
                                    </div>
                                  )}
                                </td>
                                <td className="px-6  whitespace-nowrap">
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${item.syntheticInitial ? 'bg-gray-200 text-gray-700' : item.bon_statut === 'Validé' || item.bon_statut === 'Payé'
                                      ? 'bg-green-200 text-green-700'
                                      : item.bon_statut === 'En cours'
                                        ? 'bg-yellow-200 text-yellow-700'
                                        : item.bon_statut === 'Livré'
                                          ? 'bg-blue-200 text-blue-700'
                                          : 'bg-gray-200 text-gray-700'
                                      }`}
                                  >
                                    {item.syntheticInitial ? '-' : item.bon_statut}
                                  </span>
                                </td>
                                {/* Solde Cumulé colonne finale */}
                                <td className="px-6  whitespace-nowrap text-right">
                                  <div
                                    className={`text-sm font-bold ${item.soldeCumulatif > 0
                                      ? 'text-green-600'
                                      : item.soldeCumulatif < 0
                                        ? 'text-red-600'
                                        : 'text-gray-600'
                                      }`}
                                  >
                                    {Number(item.soldeCumulatif ?? 0).toFixed(2)} DH
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Résumés */}
                  {searchedProductHistory.length > 0 && (
                    <>
                      <div className="mt-6 bg-purple-50 rounded-lg p-4">
                        <h4 className="font-bold text-lg mb-3">Résumé par Produit</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Object.entries(
                            searchedProductHistory
                              .filter((i: any) => i.type === 'produit')
                              .reduce((acc: any, i: any) => {
                                if (!acc[i.product_reference]) {
                                  acc[i.product_reference] = { designation: i.product_designation, totalQuantite: 0, totalMontant: 0, nombreBons: 0 };
                                }
                                acc[i.product_reference].totalQuantite += i.quantite;
                                acc[i.product_reference].totalMontant += i.total;
                                acc[i.product_reference].nombreBons += 1;
                                return acc;
                              }, {})
                          ).map(([reference, data]: [string, any]) => (
                            <div key={reference} className="bg-white rounded-lg p-3 border">
                              <h5 className="font-semibold text-gray-800">{reference}</h5>
                              <p className="text-sm text-gray-600 mb-2">{data.designation}</p>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span>Quantité totale:</span>
                                  <span className="font-semibold">{data.totalQuantite}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Montant total:</span>
                                  <span className="font-semibold text-blue-600">{data.totalMontant.toFixed(2)} DH</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Nombre de bons:</span>
                                  <span className="font-semibold">{data.nombreBons}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="font-semibold text-gray-600">Total Produits:</p>
                            <p className="text-lg font-bold text-blue-600">
                              {searchedProductHistory
                                .filter((i: any) => i.type === 'produit')
                                .reduce((s: number, i: any) => s + i.total, 0)
                                .toFixed(2)} DH
                            </p>
                            <p className="text-xs text-blue-500">
                              ({searchedProductHistory.filter((i: any) => i.type === 'produit').length} produit{searchedProductHistory.filter((i: any) => i.type === 'produit').length > 1 ? 's' : ''})
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600">Total Paiements:</p>
                            <p className="text-lg font-bold text-green-600">
                              {searchedProductHistory
                                .filter((i: any) => i.type === 'paiement')
                                .reduce((s: number, i: any) => s + i.total, 0)
                                .toFixed(2)} DH
                            </p>
                            <p className="text-xs text-green-500">
                              ({searchedProductHistory.filter((i: any) => i.type === 'paiement').length} paiement{searchedProductHistory.filter((i: any) => i.type === 'paiement').length > 1 ? 's' : ''})
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600">Total Avoirs:</p>
                            <p className="text-lg font-bold text-orange-600">
                              {searchedProductHistory
                                .filter((i: any) => i.type === 'avoir')
                                .reduce((s: number, i: any) => s + i.total, 0)
                                .toFixed(2)} DH
                            </p>
                            <p className="text-xs text-orange-500">
                              ({searchedProductHistory.filter((i: any) => i.type === 'avoir').length} avoir{searchedProductHistory.filter((i: any) => i.type === 'avoir').length > 1 ? 's' : ''})
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600">Solde Net (Cumulé):</p>
                            <p className={`text-lg font-bold ${finalSoldeNet > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {finalSoldeNet.toFixed(2)} DH
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}


                </div>


              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default ContactsPage;

// Section Demandes Artisan
const ArtisanRequestsSection: React.FC<{ onView: (c: Contact) => void }> = ({ onView }) => {
  const { data: requests = [], refetch } = useGetArtisanRequestsQuery({ limit: 50 });
  const [approve] = useApproveArtisanRequestMutation();
  const [reject] = useRejectArtisanRequestMutation();

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Demandes Artisan/Promoteur en attente</h2>
        <button className="text-sm text-blue-600 hover:underline" onClick={() => refetch()}>Rafraîchir</button>
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune demande en attente.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{r.nom_complet || '-'}</td>
                  <td className="px-4 py-2">{r.email || '-'}</td>
                  <td className="px-4 py-2">{r.telephone || '-'}</td>
                  <td className="px-4 py-2">{r.created_at?.slice(0, 10) || '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 flex items-center gap-1"
                        onClick={() => onView(r)}
                        title="Voir détails"
                      >
                        <Eye size={16} />
                        Voir
                      </button>
                      <button
                        className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700"
                        onClick={async () => { await approve({ id: r.id }).unwrap(); refetch(); }}
                      >
                        Approuver
                      </button>
                      <button
                        className="px-3 py-1 rounded bg-red-600 text-white text-sm hover:bg-red-700"
                        onClick={async () => { await reject({ id: r.id }).unwrap(); refetch(); }}
                      >
                        Rejeter
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};