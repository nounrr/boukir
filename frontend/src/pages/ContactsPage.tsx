import React, { useMemo, useState } from 'react';
import {
  Plus, Edit, Trash2, Search, Users, Truck, Phone, Mail, MapPin,
  CreditCard, Building2, DollarSign, Eye, Printer, Calendar, FileText
} from 'lucide-react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import type { Contact } from '../types';
import { 
  useGetClientsQuery, 
  useGetFournisseursQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation
} from '../store/api/contactsApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import { useGetProductsQuery } from '../store/api/productsApi';
import { useGetPaymentsQuery } from '../store/api/paymentsApi';
import ContactFormModal from '../components/ContactFormModal';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { formatDateDMY } from '../utils/dateUtils';

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
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const [createContact] = useCreateContactMutation();
  const [updateContactMutation] = useUpdateContactMutation();
  const [deleteContactMutation] = useDeleteContactMutation();
  // Backend products for enriching product details (remove fake data)
  const { data: products = [] } = useGetProductsQuery();

  // Onglets & états
  const [detailsTab, setDetailsTab] = useState<'transactions' | 'produits'>('transactions');
  const [activeTab, setActiveTab] = useState<'clients' | 'fournisseurs'>('clients');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
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

  // Agrégats pour calculer les soldes des clients
  const salesByClient = useMemo(() => {
    const map = new Map<number, number>();
    const add = (clientId?: number, amount?: any) => {
      if (!clientId) return;
      const val = Number(amount || 0);
      map.set(clientId, (map.get(clientId) || 0) + val);
    };
    sorties.forEach((b: any) => add(b.client_id, b.montant_total));
    comptants.forEach((b: any) => add(b.client_id, b.montant_total));
    return map;
  }, [sorties, comptants]);

  const paymentsByContact = useMemo(() => {
    const map = new Map<number, number>();
    payments.forEach((p: any) => {
      const cid = p.contact_id; // peut être undefined dans les mocks => 0 par défaut
      if (!cid) return;
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
    commandes.forEach((b: any) => add(b.fournisseur_id, b.montant_total));
    return map;
  }, [commandes]);

  // Util
  const isWithinDateRange = (isoDate?: string | null) => {
    if (!isoDate) return !(dateFrom || dateTo);
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return true; // si date invalide, ne filtre pas
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // Bons du contact sélectionné
  const bonsForContact = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const isClient = selectedContact.type === 'Client';
    const id = selectedContact.id;
    const list: any[] = [];

    // Pour un client: sorties, devis, comptants, avoirs client
    if (isClient) {
      for (const b of sorties) if (b.client_id === id) list.push({ ...b, type: 'Sortie' });
      for (const b of devis) if (b.client_id === id) list.push({ ...b, type: 'Devis' });
      for (const b of comptants) if (b.client_id === id) list.push({ ...b, type: 'Comptant' });
      for (const b of avoirsClient) if (b.client_id === id) list.push({ ...b, type: 'Avoir' });
    } else {
      // Fournisseur: commandes, avoirs fournisseur
      for (const b of commandes) if (b.fournisseur_id === id) list.push({ ...b, type: 'Commande' });
      for (const b of avoirsFournisseur) if (b.fournisseur_id === id) list.push({ ...b, type: 'AvoirFournisseur' });
    }

    // Filtre période + tri
    const filtered = list.filter((b) => isWithinDateRange(b.date_creation));
    filtered.sort((a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime());
    return filtered;
  }, [selectedContact, sorties, devis, comptants, avoirsClient, commandes, avoirsFournisseur, dateFrom, dateTo]);

  // Historique combiné (à partir des bons réels). Les paiements ne sont pas utilisés ici tant que l'API n'est pas prête.
  const combinedTransactions = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const combined = bonsForContact.map((b) => ({
      id: `bon-${b.id}`,
      numero: b.numero,
      type: b.type,
      dateISO: b.date_creation,
      date: formatDateDMY(b.date_creation),
      montant: Number(b.montant_total) || 0,
      statut: b.statut,
      isPayment: false,
      mode: null,
    }));

    combined.sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());

    let soldeCumulatif = Number(selectedContact?.solde ?? 0);
    return combined.map((t) => {
      const montant = Number(t.montant) || 0;
      soldeCumulatif += montant; // ajuster le signe si besoin par type
      return { ...t, soldeCumulatif };
    });
  }, [selectedContact, bonsForContact]);

  const productHistory = useMemo(() => {
    if (!selectedContact) return [] as any[];
    const items: any[] = [];
    for (const b of bonsForContact) {
      const bDate = formatDateDMY(b.date_creation);
      const bonItems = Array.isArray(b.items) ? b.items : [];
      for (const it of bonItems) {
        const prod = products.find((p) => p.id === it.product_id);
        const ref = prod ? String(prod.reference ?? prod.id) : String(it.product_id);
        const des = prod ? prod.designation : (it.designation || '');
        const prixUnit = Number(it.prix_unitaire) || 0;
        const total = Number((it as any).total ?? (it as any).montant_ligne ?? 0) || 0;
        items.push({
          id: `${b.id}-${it.product_id}-${it.id ?? Math.random()}`,
          bon_numero: b.numero,
          bon_type: b.type,
          bon_date: bDate,
          bon_statut: b.statut,
          product_reference: ref,
          product_designation: des,
          quantite: Number(it.quantite) || 0,
          prix_unitaire: prixUnit,
          total,
          type: 'produit',
        });
      }
    }

    // Tri par date
    items.sort((a, b) => {
      const [da, ma, ya] = a.bon_date.split('-');
      const [db, mb, yb] = b.bon_date.split('-');
      const YA = ya.length === 2 ? `20${ya}` : ya;
      const YB = yb.length === 2 ? `20${yb}` : yb;
      return new Date(`${YA}-${ma}-${da}`).getTime() - new Date(`${YB}-${mb}-${db}`).getTime();
    });

    let soldeCumulatif = Number(selectedContact?.solde ?? 0);
    return items.map((item) => {
      const total = Number(item.total) || 0;
      soldeCumulatif += total;
      return { ...item, soldeCumulatif };
    });
  }, [selectedContact, bonsForContact, products]);

  // Ouvrir détails
  const handleViewDetails = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailsModalOpen(true);
    setDateFrom('');
    setDateTo('');
    setDetailsTab('transactions');
  };

  // Impression avec détails des produits et transactions
  const handlePrint = () => {
    if (!selectedContact) return;

    const filteredBons = bonsForContact;
    const filteredPayments: any[] = [];
    const filteredProducts = productHistory.filter(item => 
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
            .info-box { border: 1px solid #ddd; padding: 10px; background: #f9f9f9; }
            .numeric { text-align: right; }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
            @media print {
              body { margin: 10mm; }
              .section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>RAPPORT DÉTAILLÉ</h1>
            <h2>${selectedContact.type.toUpperCase()}: ${selectedContact.nom_complet}</h2>
            <p><strong>Période:</strong> ${dateFrom ? formatDateDMY(dateFrom) : 'Début'} → ${dateTo ? formatDateDMY(dateTo) : 'Fin'}</p>
            <p><strong>Date d'impression:</strong> ${formatDateDMY(new Date().toISOString())}</p>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <h3>Informations Contact</h3>
              <p><strong>Nom:</strong> ${selectedContact.nom_complet || 'N/A'}</p>
              <p><strong>Téléphone:</strong> ${selectedContact.telephone || 'N/A'}</p>
              <p><strong>Email:</strong> ${selectedContact.email || 'N/A'}</p>
              <p><strong>Adresse:</strong> ${selectedContact.adresse || 'N/A'}</p>
            </div>
            <div class="info-box">
              <h3>Informations Financières</h3>
              <p><strong>Solde Initial:</strong> ${Number(selectedContact.solde || 0).toFixed(2)} DH</p>
              <p><strong>Plafond:</strong> ${Number(selectedContact.plafond || 0).toFixed(2)} DH</p>
              <p><strong>RIB:</strong> ${selectedContact.rib || 'N/A'}</p>
              <p><strong>ICE:</strong> ${selectedContact.ice || 'N/A'}</p>
            </div>
          </div>

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
                  <td>${formatDateDMY(bon.date_creation)}</td>
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
                <p><strong>Chiffre d'affaires total:</strong> ${filteredBons.reduce((s, b) => s + Number(b.montant_total||0), 0).toFixed(2)} DH</p>
                <p><strong>Panier moyen:</strong> ${filteredBons.length > 0 ? (filteredBons.reduce((s, b) => s + Number(b.montant_total||0), 0) / filteredBons.length).toFixed(2) : '0.00'} DH</p>
                <p><strong>Solde actuel:</strong> ${combinedTransactions.length > 0 ? combinedTransactions[combinedTransactions.length - 1].soldeCumulatif.toFixed(2) : Number(selectedContact.solde || 0).toFixed(2)} DH</p>
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
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
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

    // Calculer solde
    const base = Number(contact.solde) || 0;
    const sales = isClient ? (salesByClient.get(id) || 0) : 0;
    const purchases = !isClient ? (purchasesByFournisseur.get(id) || 0) : 0;
    const paid = paymentsByContact.get(id) || 0;
    const soldeActuel = isClient ? (base + sales - paid) : (base + purchases - paid);

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
          <div class="header">
            <h1>FICHE ${contact.type.toUpperCase()}</h1>
            <h2>${contact.nom_complet}</h2>
            <p><strong>Date d'impression:</strong> ${formatDateDMY(new Date().toISOString())}</p>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <h3>Informations Contact</h3>
              <p><strong>Nom:</strong> ${contact.nom_complet || 'N/A'}</p>
              <p><strong>Téléphone:</strong> ${contact.telephone || 'N/A'}</p>
              <p><strong>Email:</strong> ${contact.email || 'N/A'}</p>
              <p><strong>Adresse:</strong> ${contact.adresse || 'N/A'}</p>
            </div>
            <div class="info-box">
              <h3>Informations Financières</h3>
              <p><strong>Solde Initial:</strong> ${base.toFixed(2)} DH</p>
              <p><strong>Solde Actuel:</strong> <strong>${soldeActuel.toFixed(2)} DH</strong></p>
              <p><strong>Plafond:</strong> ${Number(contact.plafond || 0).toFixed(2)} DH</p>
              <p><strong>ICE:</strong> ${contact.ice || 'N/A'}</p>
            </div>
          </div>

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
                  <td>${formatDateDMY(bon.date_creation)}</td>
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
            <p>Fiche générée le ${formatDateDMY(new Date().toISOString())} à ${new Date().toLocaleTimeString('fr-FR')}</p>
            <p>Application de Gestion Commerciale - ${contact.type} ${contact.nom_complet}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Impression globale de tous les contacts
  const handleGlobalPrint = () => {
    const contactsList = filteredContacts; // Utilise les filtres appliqués
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
          <div class="header">
            <h1>RAPPORT GLOBAL ${typeLabel}</h1>
            <p><strong>Recherche appliquée:</strong> "${searchTerm || 'Aucune'}"</p>
            <p><strong>Date d'impression:</strong> ${formatDateDMY(new Date().toISOString())}</p>
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

              return `<tr>
                <td><strong>${contact.nom_complet || 'N/A'}</strong></td>
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
              <td colspan="${activeTab === 'clients' ? '5' : '4'}"><strong>TOTAUX</strong></td>
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
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Impression spécifique des transactions
  const handlePrintTransactions = () => {
    if (!selectedContact) return;

    const printContent = `
      <html>
        <head>
          <title>Transactions - ${selectedContact.nom_complet}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1, h2, h3 { color: #333; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .numeric { text-align: right; }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
            .info-box { border: 1px solid #ddd; padding: 15px; background: #f9f9f9; margin: 15px 0; }
            .positive { color: green; }
            .negative { color: red; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>HISTORIQUE DES TRANSACTIONS</h1>
            <h2>${selectedContact.type}: ${selectedContact.nom_complet}</h2>
            <p><strong>Période:</strong> ${dateFrom ? formatDateDMY(dateFrom) : 'Début'} → ${dateTo ? formatDateDMY(dateTo) : 'Fin'}</p>
            <p><strong>Date d'impression:</strong> ${formatDateDMY(new Date().toISOString())}</p>
          </div>

          <div class="info-box">
            <h3>Informations Contact</h3>
            <p><strong>Téléphone:</strong> ${selectedContact.telephone || 'N/A'}</p>
            <p><strong>Email:</strong> ${selectedContact.email || 'N/A'}</p>
            <p><strong>ICE:</strong> ${selectedContact.ice || 'N/A'}</p>
            <p><strong>Solde initial:</strong> ${Number(selectedContact.solde || 0).toFixed(2)} DH</p>
          </div>

          <h3>📋 TRANSACTIONS (${combinedTransactions.length})</h3>
          <table>
            <tr>
              <th>Date</th>
              <th>Numéro</th>
              <th>Type</th>
              <th class="numeric">Montant</th>
              <th>Statut/Mode</th>
              <th class="numeric">Solde Cumulé</th>
            </tr>
            ${combinedTransactions.map(t => `
              <tr>
                <td>${t.date}</td>
                <td>${t.numero}</td>
                <td>${t.type}</td>
                <td class="numeric">${(t.isPayment ? '-' : '+') + t.montant.toFixed(2)} DH</td>
                <td>${t.isPayment ? t.mode : t.statut}</td>
                <td class="numeric ${t.soldeCumulatif >= 0 ? 'positive' : 'negative'}">${t.soldeCumulatif.toFixed(2)} DH</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3"><strong>TOTAUX</strong></td>
              <td class="numeric"><strong>Bons: ${combinedTransactions.filter(t => !t.isPayment).reduce((s, t) => s + t.montant, 0).toFixed(2)} DH</strong></td>
              <td class="numeric"><strong>Paiements: ${combinedTransactions.filter(t => t.isPayment).reduce((s, t) => s + t.montant, 0).toFixed(2)} DH</strong></td>
              <td class="numeric"><strong>Solde Final: ${combinedTransactions.length > 0 ? combinedTransactions[combinedTransactions.length - 1].soldeCumulatif.toFixed(2) : '0.00'} DH</strong></td>
            </tr>
          </table>

          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px;">
            <p>Rapport généré le ${formatDateDMY(new Date().toISOString())} à ${new Date().toLocaleTimeString('fr-FR')}</p>
            <p>Application de Gestion Commerciale - Transactions ${selectedContact.nom_complet}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Impression spécifique des produits
  const handlePrintProducts = () => {
    if (!selectedContact) return;

    const filteredProducts = productHistory.filter(item => 
      isWithinDateRange(new Date(`${item.bon_date.split('-').reverse().join('-')}`).toISOString())
    );

    const printContent = `
      <html>
        <head>
          <title>Détail Produits - ${selectedContact.nom_complet}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1, h2, h3 { color: #333; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .numeric { text-align: right; }
            .total-row { font-weight: bold; background-color: #e8f4f8; }
            .info-box { border: 1px solid #ddd; padding: 15px; background: #f9f9f9; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>DÉTAIL DES PRODUITS</h1>
            <h2>${selectedContact.type}: ${selectedContact.nom_complet}</h2>
            <p><strong>Période:</strong> ${dateFrom ? formatDateDMY(dateFrom) : 'Début'} → ${dateTo ? formatDateDMY(dateTo) : 'Fin'}</p>
            <p><strong>Date d'impression:</strong> ${formatDateDMY(new Date().toISOString())}</p>
          </div>

          <div class="info-box">
            <h3>Informations Contact</h3>
            <p><strong>Téléphone:</strong> ${selectedContact.telephone || 'N/A'}</p>
            <p><strong>Email:</strong> ${selectedContact.email || 'N/A'}</p>
            <p><strong>ICE:</strong> ${selectedContact.ice || 'N/A'}</p>
            <p><strong>Solde initial:</strong> ${Number(selectedContact.solde || 0).toFixed(2)} DH</p>
          </div>

          <h3>🛍️ DÉTAIL DES ACHATS (${filteredProducts.length} lignes)</h3>
          <table>
            <tr>
              <th>Date</th>
              <th>Bon N°</th>
              <th>Type</th>
              <th>Référence</th>
              <th>Désignation</th>
              <th class="numeric">Quantité</th>
              <th class="numeric">Prix Unit.</th>
              <th class="numeric">Total</th>
              <th>Statut</th>
            </tr>
            ${filteredProducts.map(item => `
              <tr>
                <td>${item.bon_date}</td>
                <td>${item.bon_numero}</td>
                <td>${item.bon_type}</td>
                <td>${item.product_reference}</td>
                <td>${item.product_designation}</td>
                <td class="numeric">${item.quantite}</td>
                <td class="numeric">${item.prix_unitaire.toFixed(2)} DH</td>
                <td class="numeric">${item.total.toFixed(2)} DH</td>
                <td>${item.bon_statut}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="5"><strong>TOTAL</strong></td>
              <td class="numeric"><strong>${filteredProducts.reduce((s, p) => s + p.quantite, 0)}</strong></td>
              <td></td>
              <td class="numeric"><strong>${filteredProducts.reduce((s, p) => s + p.total, 0).toFixed(2)} DH</strong></td>
              <td></td>
            </tr>
          </table>

          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px;">
            <p>Rapport généré le ${formatDateDMY(new Date().toISOString())} à ${new Date().toLocaleTimeString('fr-FR')}</p>
            <p>Application de Gestion Commerciale - Produits ${selectedContact.nom_complet}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
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
    const result = await showConfirmation(
      'Cette action est irréversible.',
      `Êtes-vous sûr de vouloir supprimer ce ${activeTab === 'clients' ? 'client' : 'fournisseur'} ?`,
      'Oui, supprimer',
      'Annuler'
    );
    if (result.isConfirmed) {
      try {
        await deleteContactMutation({ id, updated_by: 1 }).unwrap();
        showSuccess(`${activeTab === 'clients' ? 'Client' : 'Fournisseur'} supprimé avec succès`);
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression');
      }
    }
  };

  // Filtrage par recherche
  const filteredContacts = (activeTab === 'clients' ? clients : fournisseurs).filter((contact) =>
    (contact.nom_complet?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (contact.telephone?.includes(searchTerm)) ||
    (contact.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination
  const totalItems = filteredContacts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = filteredContacts.slice(startIndex, endIndex);

  // Réinitialiser la page quand on change d'onglet ou de recherche
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

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
            <button
              className={`px-6 py-2 font-medium ${activeTab === 'fournisseurs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('fournisseurs')}
            >
              <div className="flex items-center gap-2">
                <Truck size={18} />
                Fournisseurs
              </div>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGlobalPrint}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            title={`Imprimer rapport global de tous les ${activeTab === 'clients' ? 'clients' : 'fournisseurs'} (selon filtres appliqués)`}
          >
            <FileText size={16} />
            Rapport Global ({filteredContacts.length})
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
            placeholder={`Rechercher un ${activeTab === 'clients' ? 'client' : 'fournisseur'}...`}
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
              <p className="text-3xl font-bold text-gray-900">{filteredContacts.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <DollarSign className="text-green-600" size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                {activeTab === 'clients' ? 'Solde à recevoir' : 'Solde à payer'}
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {filteredContacts.reduce((sum, c) => sum + (Number(c.solde) || 0), 0).toFixed(2)} DH
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
                {filteredContacts.filter((c) => c.ice && c.ice.trim() !== '').length}
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
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom complet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adresse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ICE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RIB</th>
                {activeTab === 'clients' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plafond</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {activeTab === 'clients' ? 'Solde à recevoir' : 'Solde à payer'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedContacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                    Aucun {activeTab === 'clients' ? 'client' : 'fournisseur'} trouvé
                  </td>
                </tr>
              ) : (
                paginatedContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{contact.nom_complet}</div>
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
                    {activeTab === 'clients' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {typeof contact.plafond === 'number' ? `${contact.plafond.toFixed(2)} DH` : '-'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const base = Number(contact.solde) || 0;
                        const sales = activeTab === 'clients' ? (salesByClient.get(contact.id) || 0) : 0;
                        const purchases = activeTab === 'fournisseurs' ? (purchasesByFournisseur.get(contact.id) || 0) : 0;
                        const paid = paymentsByContact.get(contact.id) || 0;
                        const display = activeTab === 'clients' ? (base + sales - paid) : (base + purchases - paid);
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetails(contact)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Voir détails"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleQuickPrint(contact)}
                          className="text-green-600 hover:text-green-900"
                          title="Imprimer fiche"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={() => handleEdit(contact)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Modifier"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(contact.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[95vw] max-h-[95vh] overflow-y-auto">
            <div className={`${selectedContact.type === 'Client' ? 'bg-blue-600' : 'bg-green-600'} px-6 py-4 rounded-t-lg`}>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                  <div>
                    <p className="font-semibold text-gray-600">Solde:</p>
                    <p className={`font-bold ${(Number(selectedContact.solde) || 0) > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {(Number(selectedContact.solde) || 0).toFixed(2)} DH
                    </p>
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
                <div className="flex gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors"
                  >
                    30 derniers jours
                  </button>
                  <button
                    onClick={() => {
                      setDateFrom('2024-01-01');
                      setDateTo('2024-12-31');
                    }}
                    className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors"
                  >
                    2024
                  </button>
                  <button
                    onClick={() => {
                      setDateFrom('2025-01-01');
                      setDateTo('2025-12-31');
                    }}
                    className="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md transition-colors"
                  >
                    2025
                  </button>
                  <button
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                  >
                    Toutes les dates
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-4">
                <nav className="flex space-x-8">
                  <button
                    className={`py-2 px-1 font-medium ${detailsTab === 'transactions' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setDetailsTab('transactions')}
                  >
                    Transactions
                  </button>
                  <button
                    className={`py-2 px-1 font-medium ${detailsTab === 'produits' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setDetailsTab('produits')}
                  >
                    Détail Produits
                  </button>
                </nav>
              </div>

              {/* Contenu */}
              {detailsTab === 'transactions' ? (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <FileText size={20} />
                      Historique des Transactions
                      {(dateFrom || dateTo) && (
                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                          Filtré du {dateFrom || '...'} au {dateTo || '...'}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                        {combinedTransactions.length} éléments
                      </span>
                      <button
                        onClick={handlePrintTransactions}
                        className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                        title="Imprimer uniquement les transactions"
                      >
                        <Printer size={14} />
                        Imprimer
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Numéro</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut/Mode</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Solde Cumulé</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {combinedTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                              Aucune transaction trouvée pour cette période
                            </td>
                          </tr>
                        ) : (
                          combinedTransactions.map((t) => (
                            <tr key={t.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{t.date}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{t.numero}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    t.type === 'Paiement'
                                      ? 'bg-green-200 text-green-700'
                                      : t.type === 'Commande'
                                      ? 'bg-blue-200 text-blue-700'
                                      : t.type === 'Sortie'
                                      ? 'bg-purple-200 text-purple-700'
                                      : t.type === 'Devis'
                                      ? 'bg-yellow-200 text-yellow-700'
                                      : 'bg-red-200 text-red-700'
                                  }`}
                                >
                                  {t.type}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className={`text-sm font-semibold ${t.isPayment ? 'text-green-600' : 'text-blue-600'}`}>
                                  {t.isPayment ? '-' : '+'}
                                  {t.montant.toFixed(2)} DH
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {t.isPayment ? (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-700">
                                    {t.mode}
                                  </span>
                                ) : (
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                      t.statut === 'Validé'
                                        ? 'bg-green-200 text-green-700'
                                        : t.statut === 'En cours'
                                        ? 'bg-yellow-200 text-yellow-700'
                                        : 'bg-gray-200 text-gray-700'
                                    }`}
                                  >
                                    {t.statut}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div
                                  className={`text-sm font-bold ${
                                    t.soldeCumulatif > 0
                                      ? 'text-green-600'
                                      : t.soldeCumulatif < 0
                                      ? 'text-red-600'
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {Number(t.soldeCumulatif ?? 0).toFixed(2)} DH
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {combinedTransactions.length > 0 && (
                    <div className="mt-4 bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="font-semibold text-gray-600">Total Bons:</p>
                          <p className="text-lg font-bold text-blue-600">
                            {combinedTransactions.filter((t) => !t.isPayment).reduce((s, t) => s + t.montant, 0).toFixed(2)} DH
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-600">Total Paiements:</p>
                          <p className="text-lg font-bold text-green-600">
                            {combinedTransactions.filter((t) => t.isPayment).reduce((s, t) => s + t.montant, 0).toFixed(2)} DH
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-600">Solde Final:</p>
                          <p
                            className={`text-lg font-bold ${
                              combinedTransactions[combinedTransactions.length - 1].soldeCumulatif > 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {Number(combinedTransactions[combinedTransactions.length - 1].soldeCumulatif ?? 0).toFixed(2)} DH
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Résumé badges */}
                  <div className="mt-8 bg-blue-50 rounded-lg p-4">
                    <h3 className="font-bold text-lg mb-3">Résumé de la période</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{bonsForContact.length}</p>
                        <p className="text-sm text-gray-600">Bons</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">0</p>
                        <p className="text-sm text-gray-600">Paiements</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-purple-600">
                          {bonsForContact.reduce((s: number, b: any) => s + Number(b.montant_total || 0), 0).toFixed(2)} DH
                        </p>
                        <p className="text-sm text-gray-600">Total Bons</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <FileText size={20} />
                      Historique Détaillé des Produits
                      {(dateFrom || dateTo) && (
                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                          Filtré du {dateFrom || '...'} au {dateTo || '...'}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm">
                        {productHistory.length} éléments
                      </span>
                      <button
                        onClick={handlePrintProducts}
                        className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm"
                        title="Imprimer uniquement le détail des produits"
                      >
                        <Printer size={14} />
                        Imprimer
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bon N°</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Référence</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Désignation</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Unit.</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Solde Cumulé</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {productHistory.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-6 py-4 text-center text-sm text-gray-500">
                              Aucun produit trouvé pour cette période
                            </td>
                          </tr>
                        ) : (
                          productHistory.map((item) => (
                            <tr key={item.id} className={`hover:bg-gray-50 ${item.type === 'paiement' ? 'bg-green-50' : ''}`}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{item.bon_date}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{item.bon_numero}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    item.bon_type === 'Paiement'
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
                                <div className="text-sm text-gray-900">{item.product_reference}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-900">
                                  {item.product_designation}
                                  {item.type === 'paiement' && item.mode && (
                                    <span className="ml-2 text-xs text-gray-500">({item.mode})</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                {item.type === 'paiement' ? '-' : item.quantite}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                {item.prix_unitaire.toFixed(2)} DH
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                <div className={`font-semibold ${item.type === 'paiement' ? 'text-green-600' : 'text-blue-600'}`}>
                                  {item.type === 'paiement' ? '-' : '+'}
                                  {item.total.toFixed(2)} DH
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    item.bon_statut === 'Validé' || item.bon_statut === 'Payé'
                                      ? 'bg-green-200 text-green-700'
                                      : item.bon_statut === 'En cours'
                                      ? 'bg-yellow-200 text-yellow-700'
                                      : item.bon_statut === 'Livré'
                                      ? 'bg-blue-200 text-blue-700'
                                      : 'bg-gray-200 text-gray-700'
                                  }`}
                                >
                                  {item.bon_statut}
                                </span>
                              </td>
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
                  {productHistory.length > 0 && (
                    <>
                      <div className="mt-6 bg-purple-50 rounded-lg p-4">
                        <h4 className="font-bold text-lg mb-3">Résumé par Produit</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Object.entries(
                            productHistory
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
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="font-semibold text-gray-600">Total Produits:</p>
                            <p className="text-lg font-bold text-blue-600">
                              {productHistory
                                .filter((i: any) => i.type === 'produit')
                                .reduce((s: number, i: any) => s + i.total, 0)
                                .toFixed(2)} DH
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600">Total Paiements:</p>
                            <p className="text-lg font-bold text-green-600">
                              {productHistory
                                .filter((i: any) => i.type === 'paiement')
                                .reduce((s: number, i: any) => s + i.total, 0)
                                .toFixed(2)} DH
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600">Solde Net:</p>
                            <p
                              className={`text-lg font-bold ${
                                (productHistory.filter((i: any) => i.type === 'produit').reduce((s: number, i: any) => s + i.total, 0) -
                                  productHistory.filter((i: any) => i.type === 'paiement').reduce((s: number, i: any) => s + i.total, 0)) > 0
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }`}
                            >
                              {(
                                productHistory.filter((i: any) => i.type === 'produit').reduce((s: number, i: any) => s + i.total, 0) -
                                productHistory.filter((i: any) => i.type === 'paiement').reduce((s: number, i: any) => s + i.total, 0)
                              ).toFixed(2)} DH
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsPage;
