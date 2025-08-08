import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Plus, Edit, Trash2, Search, Users, Truck, Phone, Mail, MapPin, CreditCard, Building2, DollarSign, Eye, Printer, Calendar, FileText } from 'lucide-react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import type { Contact } from '../types';
import { selectClients, selectFournisseurs, addContact, updateContact, deleteContact, seedContacts } from '../store/slices/contactsSlice';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import { mockProducts } from '../data/mockData';

// Validation du formulaire de contact
const contactValidationSchema = Yup.object({
  nom_complet: Yup.string().nullable(),
  telephone: Yup.string().nullable(),
  email: Yup.string().email('Email invalide').nullable(),
  adresse: Yup.string().nullable(),
  rib: Yup.string().nullable(),
  ice: Yup.string().nullable(),
  solde: Yup.number().nullable(),
});

const ContactsPage: React.FC = () => {
  const dispatch = useDispatch();
  const clients = useSelector(selectClients);
  const fournisseurs = useSelector(selectFournisseurs);
  
  // Details view tab: 'transactions' or 'produits'
  const [detailsTab, setDetailsTab] = useState<'transactions' | 'produits'>('transactions');
  const [activeTab, setActiveTab] = useState<'clients' | 'fournisseurs'>('clients');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Données mock pour les bons, commandes et paiements
  const mockTransactions = {
    bons: [
      { id: 1, numero: 'BON-001', type: 'Commande', contact_id: 5, date: '15-01-24', montant: 15000, statut: 'Validé' },
      { id: 2, numero: 'BON-002', type: 'Sortie', contact_id: 5, date: '20-01-24', montant: 8500, statut: 'En cours' },
      { id: 3, numero: 'BON-003', type: 'Devis', contact_id: 6, date: '25-01-24', montant: 12000, statut: 'Validé' },
      { id: 4, numero: 'BON-004', type: 'Avoir', contact_id: 7, date: '01-02-24', montant: 3500, statut: 'Validé' },
      { id: 5, numero: 'BON-005', type: 'Commande', contact_id: 1, date: '10-02-24', montant: 25000, statut: 'Validé' },
      { id: 6, numero: 'BON-006', type: 'Sortie', contact_id: 2, date: '15-02-24', montant: 15600, statut: 'Livré' },
      { id: 7, numero: 'BON-007', type: 'Commande', contact_id: 5, date: '15-07-25', montant: 9000, statut: 'Validé' },
      { id: 8, numero: 'BON-008', type: 'Sortie', contact_id: 6, date: '20-07-25', montant: 6500, statut: 'En cours' },
    ],
    payments: [
      { id: 1, numero: 'PAY-CLT-001', contact_id: 5, date: '20-01-24', montant: 5000, mode: 'Espèces', type: 'Client' },
      { id: 2, numero: 'PAY-CLT-002', contact_id: 6, date: '22-01-24', montant: 8500, mode: 'Chèque', type: 'Client' },
      { id: 3, numero: 'PAY-CLT-003', contact_id: 7, date: '25-01-24', montant: 2000, mode: 'Virement', type: 'Client' },
      { id: 4, numero: 'PAY-FRS-001', contact_id: 1, date: '15-02-24', montant: 12000, mode: 'Virement', type: 'Fournisseur' },
      { id: 5, numero: 'PAY-FRS-002', contact_id: 2, date: '20-02-24', montant: 7800, mode: 'Chèque', type: 'Fournisseur' },
      { id: 6, numero: 'PAY-CLT-004', contact_id: 5, date: '25-07-25', montant: 4000, mode: 'Virement', type: 'Client' },
      { id: 7, numero: 'PAY-CLT-005', contact_id: 6, date: '30-07-25', montant: 3200, mode: 'Espèces', type: 'Client' },
    ]
  };

  // Données mock pour les détails des produits dans chaque bon
  const mockBonDetails = [
    // BON-001 (contact_id: 5)
    { bon_id: 1, product_id: 1, quantite: 5, prix_unitaire: 1200, total: 6000 },
    { bon_id: 1, product_id: 2, quantite: 3, prix_unitaire: 800, total: 2400 },
    { bon_id: 1, product_id: 3, quantite: 2, prix_unitaire: 3300, total: 6600 },
    
    // BON-002 (contact_id: 5)  
    { bon_id: 2, product_id: 1, quantite: 2, prix_unitaire: 1200, total: 2400 },
    { bon_id: 2, product_id: 4, quantite: 4, prix_unitaire: 1525, total: 6100 },
    
    // BON-003 (contact_id: 6)
    { bon_id: 3, product_id: 2, quantite: 8, prix_unitaire: 800, total: 6400 },
    { bon_id: 3, product_id: 5, quantite: 3, prix_unitaire: 1867, total: 5600 },
    
    // BON-007 (contact_id: 5)
    { bon_id: 7, product_id: 1, quantite: 3, prix_unitaire: 1200, total: 3600 },
    { bon_id: 7, product_id: 3, quantite: 1, prix_unitaire: 3300, total: 3300 },
    { bon_id: 7, product_id: 6, quantite: 2, prix_unitaire: 1050, total: 2100 },
    
    // BON-008 (contact_id: 6)
    { bon_id: 8, product_id: 2, quantite: 4, prix_unitaire: 800, total: 3200 },
    { bon_id: 8, product_id: 4, quantite: 2, prix_unitaire: 1525, total: 3050 },
  ];

  // Fonction pour obtenir l'historique détaillé des produits pour un contact
  const getProductHistory = (contactId: number) => {
    // Obtenir les bons filtrés pour ce contact
    const contactBons = getFilteredTransactions(mockTransactions.bons, contactId);
    
    // Obtenir les détails des produits pour ces bons
    const productHistory: any[] = [];
    
    contactBons.forEach(bon => {
      const bonDetails = mockBonDetails.filter(detail => detail.bon_id === bon.id);
      
      bonDetails.forEach(detail => {
        const product = mockProducts.find(p => p.id === detail.product_id);
        if (product) {
          productHistory.push({
            id: `${bon.id}-${detail.product_id}`,
            bon_numero: bon.numero,
            bon_type: bon.type,
            bon_date: bon.date,
            bon_statut: bon.statut,
            product_reference: product.reference,
            product_designation: product.designation,
            quantite: detail.quantite,
            prix_unitaire: detail.prix_unitaire,
            total: detail.total
          });
        }
      });
    });
    
    // Obtenir les paiements filtrés
    const contactPayments = getFilteredTransactions(mockTransactions.payments, contactId);
    
    // Trier par date
    const allItems = [
      ...productHistory.map(item => ({ ...item, type: 'produit' })),
      ...contactPayments.map(payment => ({
        id: `payment-${payment.id}`,
        bon_numero: payment.numero,
        bon_type: 'Paiement',
        bon_date: payment.date,
        bon_statut: 'Payé',
        product_reference: '-',
        product_designation: 'Paiement',
        quantite: 1,
        prix_unitaire: payment.montant,
        total: payment.montant,
        mode: payment.mode,
        type: 'paiement'
      }))
    ].sort((a, b) => {
      const [dayA, monthA, yearA] = a.bon_date.split('-');
      const [dayB, monthB, yearB] = b.bon_date.split('-');
      const fullYearA = yearA.length === 2 ? `20${yearA}` : yearA;
      const fullYearB = yearB.length === 2 ? `20${yearB}` : yearB;
      const dateA = new Date(`${fullYearA}-${monthA}-${dayA}`);
      const dateB = new Date(`${fullYearB}-${monthB}-${dayB}`);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Calculer le solde cumulatif pour chaque élément
    let soldeCumulatif = selectedContact?.solde || 0;
    return allItems.map(item => {
      if (item.type === 'paiement') {
        soldeCumulatif -= item.total; // Les paiements diminuent le solde
      } else {
        soldeCumulatif += item.total; // Les produits augmentent le solde
      }
      
      return {
        ...item,
        soldeCumulatif: soldeCumulatif
      };
    });
  };

  // Fonction pour ouvrir les détails d'un contact
  const handleViewDetails = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailsModalOpen(true);
    // Initialiser sans filtre de date pour afficher toutes les transactions
    setDateFrom('');
    setDateTo('');
    setDetailsTab('transactions');
  };

  // Fonction pour convertir une date du format jj-mm-aa vers ISO (YYYY-MM-DD)
  const convertDisplayToISO = (displayDate: string) => {
    if (!displayDate) return '';
    const [day, month, year] = displayDate.split('-');
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };

  // Fonction pour filtrer les transactions par date
  const getFilteredTransactions = (transactions: any[], contactId: number) => {
    const filtered = transactions.filter(transaction => {
      const matchesContact = transaction.contact_id === contactId;
      
      // Si aucune date n'est spécifiée, retourner toutes les transactions du contact
      if (!dateFrom && !dateTo) {
        return matchesContact;
      }
      
      // Convertir la date de transaction en format ISO pour comparaison
      const transactionISO = convertDisplayToISO(transaction.date);
      if (!transactionISO) return matchesContact;
      
      const transactionDate = new Date(transactionISO);
      const fromDate = dateFrom ? new Date(dateFrom) : null;
      const toDate = dateTo ? new Date(dateTo) : null;
      
      // Appliquer les filtres de date
      let dateMatches = true;
      if (fromDate && transactionDate < fromDate) {
        dateMatches = false;
      }
      if (toDate && transactionDate > toDate) {
        dateMatches = false;
      }
      
      // Debug: afficher les informations de filtrage pour la première transaction
      if (transaction.id === 1 && (dateFrom || dateTo)) {
        console.log('Debug filtrage:', {
          originalDate: transaction.date,
          convertedISO: transactionISO,
          transactionDate: transactionDate,
          fromDate: fromDate,
          toDate: toDate,
          dateMatches: dateMatches,
          matchesContact: matchesContact
        });
      }
      
      return matchesContact && dateMatches;
    });
    
    return filtered;
  };

  // Fonction pour combiner et trier les transactions
  const getCombinedTransactions = (contactId: number) => {
    const filteredBons = getFilteredTransactions(mockTransactions.bons, contactId);
    const filteredPayments = getFilteredTransactions(mockTransactions.payments, contactId);
    
    // Combiner les bons et paiements
    const combined = [
      ...filteredBons.map((bon: any) => ({
        id: `bon-${bon.id}`,
        numero: bon.numero,
        type: bon.type,
        date: bon.date,
        montant: bon.montant,
        statut: bon.statut,
        isPayment: false,
        mode: null
      })),
      ...filteredPayments.map((payment: any) => ({
        id: `payment-${payment.id}`,
        numero: payment.numero,
        type: 'Paiement',
        date: payment.date,
        montant: payment.montant,
        statut: 'Payé',
        isPayment: true,
        mode: payment.mode
      }))
    ];
    
    // Trier par date (convertir jj-mm-aa vers timestamp pour le tri)
    combined.sort((a, b) => {
      const [dayA, monthA, yearA] = a.date.split('-');
      const [dayB, monthB, yearB] = b.date.split('-');
      const fullYearA = yearA.length === 2 ? `20${yearA}` : yearA;
      const fullYearB = yearB.length === 2 ? `20${yearB}` : yearB;
      const dateA = new Date(`${fullYearA}-${monthA}-${dayA}`);
      const dateB = new Date(`${fullYearB}-${monthB}-${dayB}`);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Calculer le solde cumulatif
    let soldeCumulatif = selectedContact?.solde || 0;
    return combined.map(transaction => {
      if (transaction.isPayment) {
        soldeCumulatif -= transaction.montant; // Les paiements diminuent le solde
      } else {
        soldeCumulatif += transaction.montant; // Les bons augmentent le solde
      }
      
      return {
        ...transaction,
        soldeCumulatif: soldeCumulatif
      };
    });
  };

  // Fonction d'impression
  const handlePrint = () => {
    if (!selectedContact) return;
    
    const filteredBons = getFilteredTransactions(mockTransactions.bons, selectedContact.id);
    const filteredPayments = getFilteredTransactions(mockTransactions.payments, selectedContact.id);
    
    const printContent = `
      <html>
        <head>
          <title>Détails ${selectedContact.nom_complet}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1, h2 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
            .header { text-align: center; margin-bottom: 30px; }
            .section { margin-bottom: 30px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Détails du ${selectedContact.type}</h1>
            <h2>${selectedContact.nom_complet}</h2>
            <p>Période: ${dateFrom} au ${dateTo}</p>
          </div>
          
          <div class="section">
            <h3>Bons et Commandes (${filteredBons.length})</h3>
            <table>
              <tr><th>Numéro</th><th>Type</th><th>Date</th><th>Montant</th><th>Statut</th></tr>
              ${filteredBons.map(bon => 
                `<tr><td>${bon.numero}</td><td>${bon.type}</td><td>${bon.date}</td><td>${bon.montant.toFixed(2)} DH</td><td>${bon.statut}</td></tr>`
              ).join('')}
            </table>
          </div>
          
          <div class="section">
            <h3>Paiements (${filteredPayments.length})</h3>
            <table>
              <tr><th>Numéro</th><th>Date</th><th>Montant</th><th>Mode</th></tr>
              ${filteredPayments.map(payment => 
                `<tr><td>${payment.numero}</td><td>${payment.date}</td><td>${payment.montant.toFixed(2)} DH</td><td>${payment.mode}</td></tr>`
              ).join('')}
            </table>
          </div>
          
          <div class="section">
            <h3>Résumé</h3>
            <p><strong>Total Bons:</strong> ${filteredBons.reduce((sum, bon) => sum + bon.montant, 0).toFixed(2)} DH</p>
            <p><strong>Total Paiements:</strong> ${filteredPayments.reduce((sum, payment) => sum + payment.montant, 0).toFixed(2)} DH</p>
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

  // Initialisation du formulaire
  const formik = useFormik({
    initialValues: {
      nom_complet: '',
      telephone: '',
      email: '',
      adresse: '',
      rib: '',
      ice: '',
      solde: 0,
    },
    validationSchema: contactValidationSchema,
    onSubmit: (values, { resetForm }) => {
      try {
        if (editingContact) {
          const updatedContact: Contact = {
            ...editingContact,
            ...values,
            updated_by: 1,
            updated_at: new Date().toISOString(),
          };
          dispatch(updateContact(updatedContact));
        } else {
          const newContact: Contact = {
            id: Date.now(),
            ...values,
            type: activeTab === 'clients' ? 'Client' : 'Fournisseur',
            created_by: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          dispatch(addContact(newContact));
        }
        
        setIsModalOpen(false);
        setEditingContact(null);
        resetForm();
        console.log(`${activeTab === 'clients' ? 'Client' : 'Fournisseur'} sauvegardé avec succès`);
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
      }
    },
  });

  // Gestion de la modification d'un contact
  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    formik.setValues({
      nom_complet: contact.nom_complet,
      telephone: contact.telephone || '',
      email: contact.email || '',
      adresse: contact.adresse || '',
      rib: contact.rib || '',
      ice: contact.ice || '',
      solde: contact.solde,
    });
    setIsModalOpen(true);
  };

  // Gestion de la suppression d'un contact
  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      `Êtes-vous sûr de vouloir supprimer ce ${activeTab === 'clients' ? 'client' : 'fournisseur'} ?`,
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        dispatch(deleteContact(id));
        showSuccess(`${activeTab === 'clients' ? 'Client' : 'Fournisseur'} supprimé avec succès`);
        console.log(`${activeTab === 'clients' ? 'Client' : 'Fournisseur'} supprimé avec succès`);
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression');
      }
    }
  };

  // Filtrage des contacts par la recherche
  const filteredContacts = (activeTab === 'clients' ? clients : fournisseurs).filter(contact =>
    (contact.nom_complet?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (contact.telephone?.includes(searchTerm)) ||
    (contact.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6">
      {/* Header avec le titre et les onglets */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des Contacts</h1>
          <div className="flex mt-4 border-b">
            <button
              className={`px-6 py-2 font-medium ${
                activeTab === 'clients'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('clients')}
            >
              <div className="flex items-center gap-2">
                <Users size={18} />
                Clients
              </div>
            </button>
            <button
              className={`px-6 py-2 font-medium ${
                activeTab === 'fournisseurs'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('fournisseurs')}
            >
              <div className="flex items-center gap-2">
                <Truck size={18} />
                Fournisseurs
              </div>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
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
          <button
            onClick={() => dispatch(seedContacts())}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Users size={20} />
            Données de test
          </button>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={`Rechercher un ${activeTab === 'clients' ? 'client' : 'fournisseur'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Statistiques */}
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
                {filteredContacts.reduce((sum, contact) => sum + (Number(contact.solde) || 0), 0).toFixed(2)} DH
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Building2 className="text-purple-600" size={32} />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Avec ICE
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {filteredContacts.filter(c => c.ice && c.ice.trim() !== '').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des contacts */}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {activeTab === 'clients' ? 'Solde à recevoir' : 'Solde à payer'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                    Aucun {activeTab === 'clients' ? 'client' : 'fournisseur'} trouvé
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-semibold ${(Number(contact.solde) || 0) > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                        {(Number(contact.solde) || 0).toFixed(2)} DH
                      </div>
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

      {/* Modal pour ajouter ou modifier un contact */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className={`${activeTab === 'clients' ? 'bg-blue-600' : 'bg-green-600'} px-6 py-4 rounded-t-lg`}>
              <h2 className="text-xl font-bold text-white">
                {editingContact ? 'Modifier le' : 'Nouveau'} {activeTab === 'clients' ? 'client' : 'fournisseur'}
              </h2>
            </div>
            
            <form onSubmit={formik.handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nom complet */}
                <div className="md:col-span-2">
                  <label htmlFor="nom_complet" className="block text-sm font-medium text-gray-700 mb-1">
                    Nom complet *
                  </label>
                  <input
                    id="nom_complet"
                    type="text"
                    name="nom_complet"
                    value={formik.values.nom_complet}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Entreprise XYZ"
                  />
                  {formik.touched.nom_complet && formik.errors.nom_complet && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.nom_complet}</p>
                  )}
                </div>

                {/* Téléphone */}
                <div>
                  <label htmlFor="telephone" className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      id="telephone"
                      type="text"
                      name="telephone"
                      value={formik.values.telephone}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: +212 522 123456"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: contact@entreprise.ma"
                    />
                  </div>
                  {formik.touched.email && formik.errors.email && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.email}</p>
                  )}
                </div>

                {/* Adresse */}
                <div className="md:col-span-2">
                  <label htmlFor="adresse" className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-gray-400" size={16} />
                    <textarea
                      id="adresse"
                      name="adresse"
                      rows={2}
                      value={formik.values.adresse}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: Avenue Mohammed V, Casablanca"
                    />
                  </div>
                </div>

                {/* RIB */}
                <div>
                  <label htmlFor="rib" className="block text-sm font-medium text-gray-700 mb-1">
                    RIB
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      id="rib"
                      type="text"
                      name="rib"
                      value={formik.values.rib}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: RIB123456789012345678901"
                    />
                  </div>
                </div>

                {/* ICE */}
                <div>
                  <label htmlFor="ice" className="block text-sm font-medium text-gray-700 mb-1">
                    ICE
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      id="ice"
                      type="text"
                      name="ice"
                      value={formik.values.ice}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: ICE123456789"
                    />
                  </div>
                </div>

                {/* Solde */}
                <div className="md:col-span-2">
                  <label htmlFor="solde" className="block text-sm font-medium text-gray-700 mb-1">
                    Solde ({activeTab === 'clients' ? 'à recevoir' : 'à payer'}) *
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      id="solde"
                      type="number"
                      step="0.01"
                      name="solde"
                      value={formik.values.solde}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  {formik.touched.solde && formik.errors.solde && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.solde}</p>
                  )}
                </div>
              </div>

              {/* Boutons */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingContact(null);
                    formik.resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 ${activeTab === 'clients' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} text-white rounded-md transition-colors`}
                >
                  {editingContact ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de détails du contact */}
      {isDetailsModalOpen && selectedContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[95vw] max-h-[95vh] overflow-y-auto">
            {/* Header de la modal */}
            <div className={`${selectedContact.type === 'Client' ? 'bg-blue-600' : 'bg-green-600'} px-6 py-4 rounded-t-lg`}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">
                  Détails - {selectedContact.nom_complet}
                </h2>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-3 py-1 rounded-md transition-colors"
                  >
                    <Printer size={16} />
                    Imprimer
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
              {/* Informations du contact */}
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
                  {(dateFrom || dateTo) && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                      Filtre actif
                    </span>
                  )}
                  {!dateFrom && !dateTo && (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                      Toutes les transactions
                    </span>
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

              {/* Tabs navigation */}
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

              {/* Content based on selected tab */}
              <div>
                {detailsTab === 'transactions' ? (
                  <div>
                    {/* Transaction section start */}
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
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                          {getCombinedTransactions(selectedContact.id).length} éléments
                        </span>
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
                            {getCombinedTransactions(selectedContact.id).length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                                  Aucune transaction trouvée pour cette période
                                </td>
                              </tr>
                            ) : (
                              getCombinedTransactions(selectedContact.id).map((transaction) => (
                                <tr key={transaction.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{transaction.date}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{transaction.numero}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                      transaction.type === 'Paiement' ? 'bg-green-200 text-green-700' :
                                      transaction.type === 'Commande' ? 'bg-blue-200 text-blue-700' :
                                      transaction.type === 'Sortie' ? 'bg-purple-200 text-purple-700' :
                                      transaction.type === 'Devis' ? 'bg-yellow-200 text-yellow-700' :
                                      'bg-red-200 text-red-700'
                                    }`}>
                                      {transaction.type}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className={`text-sm font-semibold ${
                                      transaction.isPayment ? 'text-green-600' : 'text-blue-600'
                                    }`}>
                                      {transaction.isPayment ? '-' : '+'}{transaction.montant.toFixed(2)} DH
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {transaction.isPayment ? (
                                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-700">
                                        {transaction.mode}
                                      </span>
                                    ) : (
                                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        transaction.statut === 'Validé' ? 'bg-green-200 text-green-700' :
                                        transaction.statut === 'En cours' ? 'bg-yellow-200 text-yellow-700' :
                                        'bg-gray-200 text-gray-700'
                                      }`}>
                                        {transaction.statut}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className={`text-sm font-bold ${
                                      transaction.soldeCumulatif > 0 ? 'text-green-600' : 
                                      transaction.soldeCumulatif < 0 ? 'text-red-600' : 'text-gray-600'
                                    }`}>
                                      {transaction.soldeCumulatif.toFixed(2)} DH
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {getCombinedTransactions(selectedContact.id).length > 0 && (
                        <div className="mt-4 bg-gray-50 rounded-lg p-4">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="font-semibold text-gray-600">Total Bons:</p>
                              <p className="text-lg font-bold text-blue-600">
                                {getCombinedTransactions(selectedContact.id)
                                  .filter(t => !t.isPayment)
                                  .reduce((sum, t) => sum + t.montant, 0)
                                  .toFixed(2)} DH
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-600">Total Paiements:</p>
                              <p className="text-lg font-bold text-green-600">
                                {getCombinedTransactions(selectedContact.id)
                                  .filter(t => t.isPayment)
                                  .reduce((sum, t) => sum + t.montant, 0)
                                  .toFixed(2)} DH
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-600">Solde Final:</p>
                              <p className={`text-lg font-bold ${
                                getCombinedTransactions(selectedContact.id).length > 0 && 
                                getCombinedTransactions(selectedContact.id)[getCombinedTransactions(selectedContact.id).length - 1].soldeCumulatif > 0 
                                  ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {getCombinedTransactions(selectedContact.id).length > 0 
                                  ? getCombinedTransactions(selectedContact.id)[getCombinedTransactions(selectedContact.id).length - 1].soldeCumulatif.toFixed(2)
                                  : (selectedContact?.solde || 0).toFixed(2)} DH
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Summary for transactions */}
                      <div className="mt-8 bg-blue-50 rounded-lg p-4">
                        <h3 className="font-bold text-lg mb-3">Résumé de la période</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">
                              {getFilteredTransactions(mockTransactions.bons, selectedContact.id).length}
                            </p>
                            <p className="text-sm text-gray-600">Bons & Commandes</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">
                              {getFilteredTransactions(mockTransactions.payments, selectedContact.id).length}
                            </p>
                            <p className="text-sm text-gray-600">Paiements</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">
                              {(
                                getFilteredTransactions(mockTransactions.bons, selectedContact.id).reduce((sum, bon) => sum + bon.montant, 0) +
                                getFilteredTransactions(mockTransactions.payments, selectedContact.id).reduce((sum, payment) => sum + payment.montant, 0)
                              ).toFixed(2)} DH
                            </p>
                            <p className="text-sm text-gray-600">Total</p>
                          </div>
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
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm">
                        {getProductHistory(selectedContact.id).length} éléments
                      </span>
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
                          {getProductHistory(selectedContact.id).length === 0 ? (
                            <tr>
                              <td colSpan={10} className="px-6 py-4 text-center text-sm text-gray-500">
                                Aucun produit trouvé pour cette période
                              </td>
                            </tr>
                          ) : (
                            getProductHistory(selectedContact.id).map((item) => (
                              <tr key={item.id} className={`hover:bg-gray-50 ${item.type === 'paiement' ? 'bg-green-50' : ''}`}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">{item.bon_date}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">{item.bon_numero}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    item.bon_type === 'Paiement' ? 'bg-green-200 text-green-700' :
                                    item.bon_type === 'Commande' ? 'bg-blue-200 text-blue-700' :
                                    item.bon_type === 'Sortie' ? 'bg-purple-200 text-purple-700' :
                                    item.bon_type === 'Devis' ? 'bg-yellow-200 text-yellow-700' :
                                    'bg-red-200 text-red-700'
                                  }`}>
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
                                  <div className={`font-semibold ${
                                    item.type === 'paiement' ? 'text-green-600' : 'text-blue-600'
                                  }`}>
                                    {item.type === 'paiement' ? '-' : '+'}{item.total.toFixed(2)} DH
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    item.bon_statut === 'Validé' || item.bon_statut === 'Payé' ? 'bg-green-200 text-green-700' :
                                    item.bon_statut === 'En cours' ? 'bg-yellow-200 text-yellow-700' :
                                    item.bon_statut === 'Livré' ? 'bg-blue-200 text-blue-700' :
                                    'bg-gray-200 text-gray-700'
                                  }`}>
                                    {item.bon_statut}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <div className={`text-sm font-bold ${
                                    item.soldeCumulatif > 0 ? 'text-green-600' : 
                                    item.soldeCumulatif < 0 ? 'text-red-600' : 'text-gray-600'
                                  }`}>
                                    {item.soldeCumulatif.toFixed(2)} DH
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Résumé par produit */}
                    {getProductHistory(selectedContact.id).length > 0 && (
                      <div className="mt-6 bg-purple-50 rounded-lg p-4">
                        <h4 className="font-bold text-lg mb-3">Résumé par Produit</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Object.entries(
                            getProductHistory(selectedContact.id)
                              .filter(item => item.type === 'produit')
                              .reduce((acc: any, item) => {
                                if (!acc[item.product_reference]) {
                                  acc[item.product_reference] = {
                                    designation: item.product_designation,
                                    totalQuantite: 0,
                                    totalMontant: 0,
                                    nombreBons: 0
                                  };
                                }
                                acc[item.product_reference].totalQuantite += item.quantite;
                                acc[item.product_reference].totalMontant += item.total;
                                acc[item.product_reference].nombreBons += 1;
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
                    )}

                    {/* Résumé général */}
                    {getProductHistory(selectedContact.id).length > 0 && (
                      <div className="mt-4 bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="font-semibold text-gray-600">Total Produits:</p>
                            <p className="text-lg font-bold text-blue-600">
                              {getProductHistory(selectedContact.id)
                                .filter(item => item.type === 'produit')
                                .reduce((sum, item) => sum + item.total, 0)
                                .toFixed(2)} DH
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600">Total Paiements:</p>
                            <p className="text-lg font-bold text-green-600">
                              {getProductHistory(selectedContact.id)
                                .filter(item => item.type === 'paiement')
                                .reduce((sum, item) => sum + item.total, 0)
                                .toFixed(2)} DH
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600">Solde Net:</p>
                            <p className={`text-lg font-bold ${
                              (getProductHistory(selectedContact.id)
                                .filter(item => item.type === 'produit')
                                .reduce((sum, item) => sum + item.total, 0) -
                              getProductHistory(selectedContact.id)
                                .filter(item => item.type === 'paiement')
                                .reduce((sum, item) => sum + item.total, 0)) > 0 
                                ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {(getProductHistory(selectedContact.id)
                                .filter(item => item.type === 'produit')
                                .reduce((sum, item) => sum + item.total, 0) -
                              getProductHistory(selectedContact.id)
                                .filter(item => item.type === 'paiement')
                                .reduce((sum, item) => sum + item.total, 0)
                              ).toFixed(2)} DH
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
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
