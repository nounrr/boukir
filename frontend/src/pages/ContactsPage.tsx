import React, { useMemo, useState } from 'react';
import {
  Plus, Edit, Trash2, Search, Users, Truck, Phone, Mail, MapPin,
  CreditCard, Building2, DollarSign, Eye, Printer, Calendar, FileText,
  ChevronUp, ChevronDown, Receipt
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
import ContactPrintModal from '../components/ContactPrintModal';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { formatDateDMY, formatDateTimeWithHour } from '../utils/dateUtils';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import logo from '../components/logo.png';
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
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const [createContact] = useCreateContactMutation();
  const [updateContactMutation] = useUpdateContactMutation();
  const [deleteContactMutation] = useDeleteContactMutation();
  const [createClientRemise] = useCreateClientRemiseMutation();
  const [createRemiseItem] = useCreateRemiseItemMutation();
  // Backend products for enriching product details (remove fake data)
  const { data: products = [] } = useGetProductsQuery();

  const [activeTab, setActiveTab] = useState<'clients' | 'fournisseurs'>('clients');
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
        // Déterminer le type d'item basé sur le type de bon
        const itemType = (b.type === 'Avoir' || b.type === 'AvoirFournisseur') ? 'avoir' : 'produit';
        items.push({
          id: `${b.id}-${it.product_id}-${it.id ?? Math.random()}`,
          bon_id: b.id,
          bon_numero: b.numero,
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
          type: itemType,
          created_at: b.created_at,
          remise_pourcentage,
          remise_montant,
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

    let soldeCumulatif = Number(selectedContact?.solde ?? 0);
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

  // Solde net final (solde cumulé après la dernière ligne) pour le bloc récapitulatif
  const finalSoldeNet = useMemo(() => {
    if (!selectedContact) return 0;
    const arr = searchedProductHistory;
    if (!arr || arr.length === 0) return Number(selectedContact.solde ?? 0);
    const last = arr[arr.length - 1];
    return Number(last.soldeCumulatif ?? selectedContact.solde ?? 0);
  }, [searchedProductHistory, selectedContact]);

 
  const displayedProductHistory = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const initialSolde = Number(selectedContact?.solde ?? 0);
    const initRow = {
      id: 'initial-solde-produit',
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
    return [initRow, ...searchedProductHistory];
  }, [searchedProductHistory, selectedContact]);

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
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">
        <tr>
          <td style="border:1px solid #ddd;padding:8px;"><strong>Téléphone:</strong> ${tel}</td>
          <td style="border:1px solid #ddd;padding:8px;"><strong>Email:</strong> ${email}</td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd;padding:8px;"><strong>ICE:</strong> ${ice}</td>
          <td style="border:1px solid #ddd;padding:8px;"><strong>Solde initial:</strong> ${solde}</td>
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

          const normalize = (s:any) => (s||'').toString().trim().toLowerCase();
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
          const countAbonne = contactRemisesData.filter(r=>r.type==='client_abonne').length;
          const countClient = contactRemisesData.filter(r=>r.type==='client-remise').length;
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
        contactRemises: contactRemises.map((r:any) => ({ 
          id: r.id, 
          type: r.type, 
          itemsCount: r.items?.length || 0,
          items: r.items?.map((i:any) => ({ bon_id: i.bon_id, product_id: i.product_id, qte: i.qte, prix_remise: i.prix_remise }))
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
    const filteredProducts = filteredProductHistory.filter(item => 
      isWithinDateRange(new Date(`${item.bon_date.split('-').reverse().join('-')}`).toISOString())
    );

    // Calcul des statistiques par produit
    const productStats = filteredProducts.reduce((acc: any, item: any) => {
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

    const productStatsArray = Object.values(productStats).sort((a: any, b: any) => b.montant_total - a.montant_total);

    const printContent = `
      <html>
        <head>
          <title>Rapport Détaillé - ${selectedContact.nom_complet}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1, h2, h3 { color: #333; margin-bottom: 10px; }
            h1 { font-size: 20px; }
            h2 { font-size: 16px; }
            h3 { font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .section { margin-bottom: 25px; page-break-inside: avoid; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 15px 0; }
            .info-box { border: 1px solid #ddd; padding: 2px; background: #f9f9f9; }
            .numeric { text-align: right; }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
            @media print {
              body { margin: 10mm; }
              .section { page-break-inside: avoid; }
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
            <table>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th class="numeric">Qté Totale</th>
                <th class="numeric">Montant Total</th>
                <th class="numeric">Prix Moyen</th>
                <th class="numeric">Nb Commandes</th>
              </tr>
              ${productStatsArray.map((stat: any) =>
                `<tr>
                  <td>${stat.reference}</td>
                  <td>${stat.designation}</td>
                  <td class="numeric">${stat.quantite_totale}</td>
                  <td class="numeric">${stat.montant_total.toFixed(2)} DH</td>
                  <td class="numeric">${stat.prix_moyen.toFixed(2)} DH</td>
                  <td class="numeric">${stat.nombre_commandes}</td>
                </tr>`
              ).join('')}
              <tr class="total-row">
                <td colspan="2"><strong>TOTAL</strong></td>
                <td class="numeric"><strong>${productStatsArray.reduce((s: number, p: any) => s + p.quantite_totale, 0)}</strong></td>
                <td class="numeric"><strong>${productStatsArray.reduce((s: number, p: any) => s + p.montant_total, 0).toFixed(2)} DH</strong></td>
                <td colspan="2"></td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h3>📋 DÉTAIL DES TRANSACTIONS (${filteredBons.length} documents)</h3>
            <table>
              <tr>
                <th>N° Bon</th>
                <th>Type</th>
                <th>Date</th>
                <th class="numeric">Montant</th>
                <th>Statut</th>
                <th class="numeric">Articles</th>
              </tr>
              ${filteredBons.map(bon => {
                const bonItems = Array.isArray(bon.items) ? bon.items : [];
                return `<tr>
                  <td>${bon.numero}</td>
                  <td>${bon.type}</td>
                  <td>${formatDateTimeWithHour(bon.date_creation)}</td>
                  <td class="numeric">${Number(bon.montant_total||0).toFixed(2)} DH</td>
                  <td>${bon.statut}</td>
                  <td class="numeric">${bonItems.length}</td>
                </tr>`;
              }).join('')}
              <tr class="total-row">
                <td colspan="3"><strong>TOTAL</strong></td>
                <td class="numeric"><strong>${filteredBons.reduce((s, b) => s + Number(b.montant_total||0), 0).toFixed(2)} DH</strong></td>
                <td colspan="2"></td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h3>🛍️ DÉTAIL DES ACHATS PAR PRODUIT (${filteredProducts.length} lignes)</h3>
            <table>
              <tr>
                <th>Date</th>
                <th>N° Bon</th>
                <th>Type</th>
                <th>Référence</th>
                <th>Produit</th>
                <th class="numeric">Qté</th>
                <th class="numeric">Prix Unit.</th>
                <th class="numeric">Total</th>
              </tr>
              ${filteredProducts.map(item =>
                `<tr>
                  <td>${item.bon_date}</td>
                  <td>${item.bon_numero}</td>
                  <td>${item.bon_type}</td>
                  <td>${item.product_reference}</td>
                  <td>${item.product_designation}</td>
                  <td class="numeric">${item.quantite}</td>
                  <td class="numeric">${item.prix_unitaire.toFixed(2)} DH</td>
                  <td class="numeric">${item.total.toFixed(2)} DH</td>
                </tr>`
              ).join('')}
              <tr class="total-row">
                <td colspan="5"><strong>TOTAL</strong></td>
                <td class="numeric"><strong>${filteredProducts.reduce((s, p) => s + p.quantite, 0)}</strong></td>
                <td></td>
                <td class="numeric"><strong>${filteredProducts.reduce((s, p) => s + p.total, 0).toFixed(2)} DH</strong></td>
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
                <p><strong>Quantité totale achetée:</strong> ${filteredProducts.reduce((s, p) => s + p.quantite, 0)}</p>
              </div>
              <div class="info-box">
                <h4>Montants</h4>
                <p><strong>Chiffre d'affaires total:</strong> ${filteredBons.filter((b: any) => {
                  const type = String(b.type || '').toLowerCase();
                  return type !== 'avoir' && type !== 'avoirfournisseur';
                }).reduce((s, b) => s + Number(b.montant_total||0), 0).toFixed(2)} DH</p>
                <p><strong>Panier moyen:</strong> ${(() => {
                  const realBons = filteredBons.filter((b: any) => {
                    const type = String(b.type || '').toLowerCase();
                    return type !== 'avoir' && type !== 'avoirfournisseur';
                  });
                  return realBons.length > 0 ? (realBons.reduce((s, b) => s + Number(b.montant_total||0), 0) / realBons.length).toFixed(2) : '0.00';
                })()} DH</p>
                <p><strong>Solde actuel:</strong> ${Number(selectedContact.solde || 0).toFixed(2)} DH</p>
              </div>

                        // Recharger les remises pour voir immédiatement la colonne "Remise Abonné"
                        await loadContactRemises();
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
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1, h2, h3 { color: #333; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 15px 0; }
            .info-box { border: 1px solid #ddd; padding: 10px; background: #f9f9f9; }
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
                  <td class="numeric">${Number(bon.montant_total||0).toFixed(2)} DH</td>
                  <td>${bon.statut}</td>
                </tr>`
              ).join('')}
              <tr class="total-row">
                <td colspan="3"><strong>TOTAL</strong></td>
                <td class="numeric"><strong>${list.reduce((s, b) => s + Number(b.montant_total||0), 0).toFixed(2)} DH</strong></td>
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
            h1, h2, h3 { color: #333; margin-bottom: 10px; }
            h1 { font-size: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .numeric { text-align: right; }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
            .info-box { border: 1px solid #ddd; padding: 15px; background: #f9f9f9; margin: 15px 0; }
            .positive { color: green; }
            .negative { color: red; }
            @media print {
              body { margin: 10mm; }
              .page-break { page-break-before: always; }
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
  // detailsTab usage removed
    const baseRows = displayedProductHistory.filter((it: any) => !it.syntheticInitial);
    const rows = (selectedProductIds && selectedProductIds.size > 0)
      ? baseRows.filter((it: any) => selectedProductIds.has(String(it.id)))
      : baseRows;

    const hasSelection = selectedProductIds && selectedProductIds.size > 0;
    const startingSolde = hasSelection ? 0 : Number(selectedContact?.solde ?? 0);
    let soldeCumulatif = startingSolde;
    const recomputed = rows.map((it: any) => {
      const total = Number(it.total) || 0;
      const type = String(it.type || '').toLowerCase();
      const reduce = (type === 'paiement' || type === 'avoir');
      const delta = reduce ? -total : +total;
      soldeCumulatif += delta;
      return { ...it, soldeCumulatif };
    });
    if (hasSelection) {
      setPrintProducts(recomputed);
    } else {
      const initialSolde = Number(selectedContact?.solde ?? 0);
      const initRow: any = {
        id: 'initial-solde-produit', bon_numero: '—', bon_type: 'Solde initial', bon_date: '', bon_statut: '-', product_reference: '—', product_designation: 'Solde initial', quantite: 0, prix_unitaire: 0, total: 0, type: 'solde', created_at: '', syntheticInitial: true, soldeCumulatif: initialSolde,
      };
      setPrintProducts([initRow, ...recomputed]);
    }
    setPrintModal({ open: true, mode: 'products' });
  };

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

  // Filtrage par recherche et tri
  const filteredContacts = (activeTab === 'clients' ? clients : fournisseurs).filter((contact) =>
    (contact.nom_complet?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (contact.societe?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (contact.telephone?.includes(searchTerm))
  );

  // Fonction de tri
  const sortedContacts = useMemo(() => {
    if (!sortField) return filteredContacts;
    
    const sorted = [...filteredContacts].sort((a, b) => {
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
  }, [filteredContacts, sortField, sortDirection, activeTab, salesByClient, purchasesByFournisseur, paymentsByContact]);

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
  }, [activeTab, searchTerm, sortField, sortDirection]);

  return (
    <div className="p-6">
      {/* Header + onglets */}
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
            </button>
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
          </div>
        </div>
        <div className="flex items-center gap-3">
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
      </div>

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

      {/* Liste */}
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
                paginatedContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="hover:bg-gray-50 cursor-pointer"
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
                ))
              )}
            </tbody>
          </table>
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
      {isDetailsModalOpen && selectedContact && (
        <div className="fixed inset-0 z-50 bg-white md:bg-black md:bg-opacity-50 md:flex md:items-center md:justify-center p-0 md:p-4">
          <div className="bg-white w-full h-full overflow-y-auto rounded-none md:rounded-lg md:h-auto md:max-h-[95vh] md:max-w-[95vw]">
            <div className={`${selectedContact.type === 'Client' ? 'bg-blue-600' : 'bg-green-600'} px-6 py-4 md:rounded-t-lg sticky top-0 z-10`}>
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
                  <button
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      setSelectedContact(null);
                      setSelectedProductIds(new Set());
                      setPrintProducts([]);
                    }}
                    className="text-white hover:text-gray-200"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Infos contact */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-lg mb-3">Informations du {selectedContact.type}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                  <div>
                    <p className="font-semibold text-gray-600">Société:</p>
                    <p>{(selectedContact.societe && selectedContact.societe.trim()) ? selectedContact.societe : '-'}</p>
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
                  </div>
                </div>
              </div>

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
                            Abonné: {contactRemises.filter(r=>r.type==='client_abonne').reduce((sum:number,r:any)=> sum + (r.items||[]).reduce((s:number,i:any)=> s + (Number(i.qte)||0)*(Number(i.prix_remise)||0),0),0).toFixed(2)} DH
                          </span>
                          <span>
                            Client: {contactRemises.filter(r=>r.type==='client-remise').reduce((sum:number,r:any)=> sum + (r.items||[]).reduce((s:number,i:any)=> s + (Number(i.qte)||0)*(Number(i.prix_remise)||0),0),0).toFixed(2)} DH
                          </span>
                          <span>
                            Total: {contactRemises.reduce((sum:number,r:any)=> sum + (r.items||[]).reduce((s:number,i:any)=> s + (Number(i.qte)||0)*(Number(i.prix_remise)||0),0),0).toFixed(2)} DH
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
                        {Array.from(selectedProductIds).length > 0 ? `${Array.from(selectedProductIds).length} sélectionné(s)` : 'Aucune sélection'}
                      </span>
                      {Array.from(selectedProductIds).length > 0 && (
                        <button onClick={() => setSelectedProductIds(new Set())} className="w-full sm:w-auto text-xs px-2 py-1 bg-gray-100 rounded">Effacer sélection</button>
                      )}
                      {selectedContact?.type === 'Client' && (
                        <button
                          onClick={() => setShowRemiseMode(!showRemiseMode)}
                          className={`w-full sm:w-auto flex items-center gap-2 px-3 py-1 rounded-md transition-colors text-sm ${
                            showRemiseMode 
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
          onClose={() => setPrintModal({ open: false, mode: null })}
          contact={selectedContact}
          mode="products"
          transactions={[]}
          productHistory={printProducts.length > 0 ? printProducts : displayedProductHistory}
          dateFrom={dateFrom}
          dateTo={dateTo}
          skipInitialRow={printProducts.length > 0 && selectedProductIds.size > 0}
        />
      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-3">
                            <input
                              type="checkbox"
                              aria-label="Sélectionner tout"
                              checked={displayedProductHistory.filter((i:any)=>!i.syntheticInitial).every((i:any)=>selectedProductIds.has(String(i.id))) && displayedProductHistory.filter((i:any)=>!i.syntheticInitial).length>0}
                              onChange={(e)=>{
                                const all = new Set<string>(selectedProductIds);
                                const nonInitial = displayedProductHistory.filter((i:any)=>!i.syntheticInitial);
                                if(e.target.checked){
                                  nonInitial.forEach((i:any)=>all.add(String(i.id)));
                                }else{
                                  nonInitial.forEach((i:any)=>all.delete(String(i.id)));
                                }
                                setSelectedProductIds(all);
                              }}
                            />
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bon N°</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Référence</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Désignation</th>
                          {/* Remises séparées par type */}
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Remise Abonné</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Remise Client</th>
                          {showRemiseMode && selectedContact?.type === 'Client' && (
                            <>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Remise</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Remise</th>
                            </>
                          )}
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{selectedContact?.type === 'Fournisseur' ? 'Prix Achat' : 'Prix Unit.'}</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                          {/* Solde Cumulé déplacé à la fin */}
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Solde Cumulé</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {displayedProductHistory.length === 0 ? (
                          <tr>
                            <td colSpan={12} className="px-6 py-4 text-center text-sm text-gray-500">
                              Aucun produit trouvé pour cette période
                            </td>
                          </tr>
                        ) : (
                          displayedProductHistory.map((item) => (
                            <tr key={item.id} className={`hover:bg-gray-50 ${item.type === 'paiement' ? 'bg-green-50' : ''}`}>
                              <td className="px-2 py-4 whitespace-nowrap">
                                {item.syntheticInitial ? (
                                  <span className="text-xs text-gray-400">—</span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={selectedProductIds.has(String(item.id))}
                                    onChange={(e)=>{
                                      const next = new Set<string>(selectedProductIds);
                                      const id = String(item.id);
                                      if(e.target.checked) next.add(id); else next.delete(id);
                                      setSelectedProductIds(next);
                                    }}
                                  />
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-700">
                                  {item.syntheticInitial ? '-' : (
                                    item.bon_date_iso
                                      ? formatDateTimeWithHour(item.bon_date_iso)
                                      : item.bon_date
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{item.bon_numero}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    item.bon_type === 'Solde initial' ? 'bg-gray-200 text-gray-700' : item.bon_type === 'Paiement'
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
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{item.syntheticInitial ? '—' : item.product_reference}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-900">
                                  {item.syntheticInitial ? 'Solde initial' : item.product_designation}
                                  {item.type === 'paiement' && item.mode && (
                                    <span className="ml-2 text-xs text-gray-500">({item.mode})</span>
                                  )}
                                </div>
                              </td>
                              {/* Remises séparées par type */}
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                                {(() => {
                                  if (item.syntheticInitial || item.type === 'paiement') return '-';
                                  const remises = getItemRemises(item);
                                  if (remises.abonne > 0) return `${remises.abonne.toFixed(2)} DH`;
                                  // Montrer 0 si un match a eu lieu mais totalRemise = 0 (rare) -> on ne sait pas ici. Donc on laisse '-'
                                  return '-';
                                })()}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900">
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
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                                    {item.syntheticInitial || item.type === 'paiement' ? (
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
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                                    {item.syntheticInitial || item.type === 'paiement' ? (
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
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                {item.syntheticInitial ? '-' : item.type === 'paiement' ? '-' : item.quantite}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                {item.syntheticInitial ? '-' : (() => {
                                  const v = selectedContact?.type === 'Fournisseur'
                                    ? (item as any).prix_achat ?? item.prix_unitaire
                                    : item.prix_unitaire;
                                  return `${(typeof v === 'number' ? v : parseFloat(v) || 0).toFixed(2)} DH`;
                                })()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                <div className={`font-semibold ${item.syntheticInitial ? 'text-gray-500' : item.type === 'paiement' ? 'text-green-600' : 'text-blue-600'}`}>
                                  {item.syntheticInitial ? '—' : item.type === 'paiement' ? '-' : '+'}
                                  {item.syntheticInitial ? '' : `${item.total.toFixed(2)} DH`}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    item.syntheticInitial ? 'bg-gray-200 text-gray-700' : item.bon_statut === 'Validé' || item.bon_statut === 'Payé'
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
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div
                                  className={`text-sm font-bold ${
                                    item.soldeCumulatif > 0
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

                  {/* Bouton Valider Remises */}
                  {showRemiseMode && selectedContact?.type === 'Client' && selectedItemsForRemise.size > 0 && (
                    <div className="mt-6 bg-orange-50 rounded-lg p-4 border border-orange-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-orange-800 mb-2">Remises à valider</h4>
                          <p className="text-sm text-orange-700">
                            {selectedItemsForRemise.size} article{selectedItemsForRemise.size > 1 ? 's' : ''} sélectionné{selectedItemsForRemise.size > 1 ? 's' : ''} • 
                            Total remises: {Object.entries(remisePrices)
                              .filter(([id]) => selectedItemsForRemise.has(id))
                              .reduce((sum, [id, price]) => {
                                const item = displayedProductHistory.find(i => i.id === id);
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
                </div>
              

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsPage;