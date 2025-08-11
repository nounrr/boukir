import type { Employee, Product, Contact, Bon, Payment, Category } from '../types';

// Données de catégories de test
export const mockCategories: Category[] = [
  {
    id: 1,
    nom: 'Électronique',
    description: 'Produits électroniques et informatiques',
    created_by: 1,
    created_at: '2024-01-01T09:00:00Z',
    updated_at: '2024-01-01T09:00:00Z',
  },
  {
    id: 2,
    nom: 'Mobilier',
    description: 'Meubles et accessoires de bureau',
    created_by: 1,
    created_at: '2024-01-01T09:00:00Z',
    updated_at: '2024-01-01T09:00:00Z',
  },
  {
    id: 3,
    nom: 'Services',
    description: 'Services et prestations diverses',
    created_by: 1,
    created_at: '2024-01-01T09:00:00Z',
    updated_at: '2024-01-01T09:00:00Z',
  },
];

// Données d'employés de test
export const mockEmployees: Employee[] = [
  {
    id: 1,
    nom_complet: 'Ahmed Benali',
    cin: 'BK123456',
    date_embauche: '15-01-20',
    role: 'PDG',
    created_by: 1,
    created_at: '2020-01-15T09:00:00Z',
    updated_at: '2020-01-15T09:00:00Z',
  },
  {
    id: 2,
    nom_complet: 'Fatima Zahra',
    cin: 'BK789012',
    date_embauche: '10-03-21',
    role: 'Employé',
    created_by: 1,
    created_at: '2021-03-10T10:00:00Z',
    updated_at: '2021-03-10T10:00:00Z',
  },
  {
    id: 3,
    nom_complet: 'Mohammed Alami',
    cin: 'BK345678',
    date_embauche: '20-06-21',
    role: 'Employé',
    created_by: 1,
    created_at: '2021-06-20T11:00:00Z',
    updated_at: '2021-06-20T11:00:00Z',
  },
  {
    id: 4,
    nom_complet: 'Khadija Tazi',
    cin: 'BK901234',
    date_embauche: '14-02-22',
    role: 'Employé',
    created_by: 1,
    created_at: '2022-02-14T12:00:00Z',
    updated_at: '2022-02-14T12:00:00Z',
  },
];

// Mots de passe de test (en réalité, ils seraient cryptés)
export const mockPasswords: Record<string, string> = {
  'BK123456': 'pdg123',
  'BK789012': 'emp123',
  'BK345678': 'emp123',
  'BK901234': 'emp123',
};

// Données de produits de test  
export const mockProducts: Product[] = [
  {
    id: 1,
    reference: 'PROD001',
    designation: 'Ordinateur Portable HP',
    categorie_id: 1,
    categorie: mockCategories[0],
    quantite: 25,
    prix_achat: 6800.00,
    cout_revient_pourcentage: 2,
    cout_revient: 6936.00,
    prix_gros_pourcentage: 10,
    prix_gros: 7480.00,
    prix_vente_pourcentage: 25,
    prix_vente: 8500.00,
    est_service: false,
    created_by: 1,
    created_at: '2023-01-10T09:00:00Z',
    updated_at: '2024-01-15T10:30:00Z',
  },
  {
    id: 2,
    reference: 'PROD002',
    designation: 'Imprimante Canon PIXMA',
    categorie_id: 1,
    categorie: mockCategories[0],
    quantite: 15,
    prix_achat: 520.00,
    cout_revient_pourcentage: 2,
    cout_revient: 530.40,
    prix_gros_pourcentage: 10,
    prix_gros: 572.00,
    prix_vente_pourcentage: 25,
    prix_vente: 650.00,
    est_service: false,
    created_by: 1,
    created_at: '2023-01-12T11:00:00Z',
    updated_at: '2024-01-20T14:20:00Z',
  },
  {
    id: 3,
    reference: 'PROD003',
    designation: 'Bureau en bois massif',
    categorie_id: 2,
    categorie: mockCategories[1],
    quantite: 8,
    prix_achat: 1600.00,
    cout_revient_pourcentage: 2,
    cout_revient: 1632.00,
    prix_gros_pourcentage: 15,
    prix_gros: 1840.00,
    prix_vente_pourcentage: 30,
    prix_vente: 2080.00,
    est_service: false,
    created_by: 2,
    created_at: '2023-02-05T14:00:00Z',
    updated_at: '2024-02-10T09:45:00Z',
  },
  {
    id: 4,
    reference: 'SERV001',
    designation: 'Consultation informatique',
    categorie_id: 3,
    categorie: mockCategories[2],
    quantite: 0,
    prix_achat: 400.00,
    cout_revient_pourcentage: 2,
    cout_revient: 408.00,
    prix_gros_pourcentage: 15,
    prix_gros: 460.00,
    prix_vente_pourcentage: 40,
    prix_vente: 560.00,
    est_service: true,
    created_by: 2,
    created_at: '2023-03-15T16:00:00Z',
    updated_at: '2024-03-05T11:15:00Z',
  },
  {
    id: 5,
    reference: 'SERV002',
    designation: 'Installation réseau',
    categorie_id: 3,
    categorie: mockCategories[2],
    quantite: 0,
    prix_achat: 800.00,
    cout_revient_pourcentage: 2,
    cout_revient: 816.00,
    prix_gros_pourcentage: 15,
    prix_gros: 920.00,
    prix_vente_pourcentage: 50,
    prix_vente: 1200.00,
    est_service: true,
    created_by: 3,
    created_at: '2023-04-10T12:00:00Z',
    updated_at: '2024-04-01T15:30:00Z',
  },
];

// Données de contacts de test
export const mockContacts: Contact[] = [
  {
    id: 1,
    nom_complet: 'TechnoPlus SARL',
    type: 'Fournisseur',
    telephone: '+212 522 123456',
    email: 'contact@technoplus.ma',
    adresse: 'Zone Industrielle, Casablanca',
    ice: 'ICE123456789',
    rib: 'RIB181810181818101818181',
    solde: 25000.00, // montant que nous devons payer
    created_by: 1,
    created_at: '2023-01-05T09:00:00Z',
    updated_at: '2023-01-05T09:00:00Z',
  },
  {
    id: 2,
    nom_complet: 'Bureau Services',
    type: 'Fournisseur',
    telephone: '+212 537 654321',
    email: 'info@bureauservices.ma',
    adresse: 'Avenue Mohammed V, Rabat',
    ice: 'ICE987654321',
    rib: 'RIB292920292929202929292',
    solde: 15600.00, // montant que nous devons payer
    created_by: 1,
    created_at: '2023-01-08T10:00:00Z',
    updated_at: '2023-01-08T10:00:00Z',
  },
  {
    id: 3,
    nom_complet: 'Mobile World',
    type: 'Fournisseur',
    telephone: '+212 524 789012',
    email: 'sales@mobileworld.ma',
    adresse: 'Gueliz, Marrakech',
    ice: 'ICE456789012',
    rib: 'RIB303930393039303930393',
    solde: 8750.00, // montant que nous devons payer
    created_by: 1,
    created_at: '2023-01-12T11:00:00Z',
    updated_at: '2023-01-12T11:00:00Z',
  },
  {
    id: 4,
    nom_complet: 'Audio Expert',
    type: 'Fournisseur',
    telephone: '+212 539 345678',
    email: 'contact@audioexpert.ma',
    adresse: 'Centre Ville, Fès',
    ice: 'ICE789012345',
    rib: 'RIB404940494049404940494',
    solde: 32500.00, // montant que nous devons payer
    created_by: 1,
    created_at: '2023-01-15T12:00:00Z',
    updated_at: '2023-01-15T12:00:00Z',
  },
  {
    id: 5,
    nom_complet: 'Entreprise Alami',
    type: 'Client',
    telephone: '+212 522 987654',
    email: 'direction@alami.ma',
    adresse: 'Boulevard Zerktouni, Casablanca',
    ice: 'ICE234567890',
    rib: 'RIB505950595059505950595',
    solde: 12400.00, // montant que le client doit payer
    created_by: 2,
    created_at: '2023-02-01T09:00:00Z',
    updated_at: '2023-02-01T09:00:00Z',
  },
  {
    id: 6,
    nom_complet: 'Société Bennis',
    type: 'Client',
    telephone: '+212 537 246810',
    email: 'contact@bennis.ma',
    adresse: 'Hay Riad, Rabat',
    ice: 'ICE567890123',
    rib: 'RIB606960696069606960696',
    solde: 8920.00, // montant que le client doit payer
    created_by: 2,
    created_at: '2023-02-10T10:00:00Z',
    updated_at: '2023-02-10T10:00:00Z',
  },
  {
    id: 7,
    nom_complet: 'Cabinet Tazi',
    type: 'Client',
    telephone: '+212 524 135792',
    email: 'admin@tazi.ma',
    adresse: 'Hivernage, Marrakech',
    ice: 'ICE890123456',
    rib: 'RIB707970797079707970797',
    solde: 5300.00, // montant que le client doit payer
    created_by: 3,
    created_at: '2023-03-05T11:00:00Z',
    updated_at: '2023-03-05T11:00:00Z',
  },
];

// Données de bons de test
export const mockBons: Bon[] = [
  {
    id: 1,
    numero: 'CMD-2024-001',
    type: 'Commande',
    date_creation: '15-01-24',
    date_echeance: '15-02-24',
    client_id: 5,
    montant_total: 17650.00,
    statut: 'Validé',
    items: [
      {
        id: 1,
        bon_id: 1,
        produit_id: 1,
        quantite: 2,
        prix_unitaire: 8500.00,
        montant_ligne: 17000.00,
      },
      {
        id: 2,
        bon_id: 1,
        produit_id: 2,
        quantite: 1,
        prix_unitaire: 650.00,
        montant_ligne: 650.00,
      },
    ],
    created_by: 2,
    created_at: '2024-01-15T09:00:00Z',
    updated_at: '2024-01-15T09:30:00Z',
  },
  {
    id: 2,
    numero: 'SOR-2024-001',
    type: 'Sortie',
    date_creation: '20-01-24',
    client_id: 6,
    montant_total: 9600.00,
    statut: 'Livré',
    items: [
      {
        id: 3,
        bon_id: 2,
        produit_id: 3,
        quantite: 3,
        prix_unitaire: 3200.00,
        montant_ligne: 9600.00,
      },
    ],
    created_by: 3,
    created_at: '2024-01-20T10:00:00Z',
    updated_at: '2024-01-20T15:30:00Z',
  },
  {
    id: 3,
    numero: 'CPT-2024-001',
    type: 'Comptant',
    date_creation: '25-01-24',
    client_id: 7,
    montant_total: 4000.00,
    statut: 'Payé',
    items: [
      {
        id: 4,
        bon_id: 3,
        produit_id: 4,
        quantite: 1,
        prix_unitaire: 2800.00,
        montant_ligne: 2800.00,
      },
      {
        id: 5,
        bon_id: 3,
        produit_id: 5,
        quantite: 1,
        prix_unitaire: 1200.00,
        montant_ligne: 1200.00,
      },
    ],
    created_by: 2,
    created_at: '2024-01-25T11:00:00Z',
    updated_at: '2024-01-25T11:15:00Z',
  },
  {
    id: 4,
    numero: 'DEV-2024-001',
    type: 'Devis',
    date_creation: '2024-02-01',
    date_echeance: '2024-02-29',
    client_id: 5,
    montant_total: 6400.00,
    statut: 'Brouillon',
    items: [
      {
        id: 6,
        bon_id: 4,
        produit_id: 3,
        quantite: 2,
        prix_unitaire: 3200.00,
        montant_ligne: 6400.00,
      },
    ],
    created_by: 4,
    created_at: '2024-02-01T14:00:00Z',
    updated_at: '2024-02-01T14:00:00Z',
  },
];

// Données de paiements de test
export const mockPayments: Payment[] = [
  {
    id: 1,
    numero: 'PAY-2024-001',
    bon_id: 1,
    montant: 17650.00,
    mode_paiement: 'Virement',
    date_paiement: '2024-01-20',
    reference: 'VIR20240120001',
    notes: 'Paiement commande CMD-2024-001',
    created_by: 2,
    created_at: '2024-01-20T16:00:00Z',
    updated_at: '2024-01-20T16:00:00Z',
  },
  {
    id: 2,
    numero: 'PAY-2024-002',
    bon_id: 2,
    montant: 9600.00,
    mode_paiement: 'Chèque',
    date_paiement: '2024-01-22',
    reference: 'CHQ1234567',
    notes: 'Paiement bon de sortie SOR-2024-001',
    created_by: 3,
    created_at: '2024-01-22T09:00:00Z',
    updated_at: '2024-01-22T09:00:00Z',
  },
  {
    id: 3,
    numero: 'PAY-2024-003',
    bon_id: 3,
    montant: 4000.00,
    mode_paiement: 'Espèces',
    date_paiement: '2024-01-25',
    notes: 'Paiement comptant CPT-2024-001',
    created_by: 2,
    created_at: '2024-01-25T11:30:00Z',
    updated_at: '2024-01-25T11:30:00Z',
  },
  {
    id: 4,
    numero: 'PAY-2024-004',
    montant: 1500.00,
    mode_paiement: 'Carte',
    date_paiement: '2024-02-05',
    reference: 'CARD20240205001',
    notes: 'Paiement divers - achat fournitures',
    created_by: 4,
    created_at: '2024-02-05T13:00:00Z',
    updated_at: '2024-02-05T13:00:00Z',
  },
];

// Fonctions utilitaires pour générer des IDs
export const getNextId = (items: any[]): number => {
  return items.length > 0 ? Math.max(...items.map(item => item.id)) + 1 : 1;
};

export const generateBonNumber = (type: string): string => {
  const prefixes: Record<string, string> = {
    'Commande': 'CMD',
    'Sortie': 'SOR',
    'Comptant': 'CPT',
    'Avoir': 'AVO',
    'Devis': 'DEV',
  };
  
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  return `${prefixes[type] || 'BON'}-${year}-${randomNum}`;
};

export const generatePaymentNumber = (): string => {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  return `PAY-${year}-${randomNum}`;
};
