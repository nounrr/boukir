export type SubTab = { key: string; label: string; tables: string[] };

// Human-friendly labels per table
export const TABLE_LABELS: Record<string, string> = {
  bons_commande: 'Bon de commande',
  bons_comptant: 'Bon comptant',
  bons_sortie: 'Bon de sortie',
  bons_vehicule: 'Bon véhicule',
  products: 'Produit',
  categories: 'Catégorie',
  item_remises: "Remise d'article",
  client_remises: 'Remise client',
  contacts: 'Contact',
  avoirs_client: 'Avoir client',
  avoirs_comptant: 'Avoir comptant',
  avoirs_fournisseur: 'Avoir fournisseur',
  avoir_client_items: "Ligne d'avoir client",
  avoir_comptant_items: "Ligne d'avoir comptant",
  avoir_fournisseur_items: "Ligne d'avoir fournisseur",
  talons: 'Talon',
  old_talons_caisse: 'Ancien talon (caisse)',
  vehicules: 'Véhicule',
  vehicule_items: 'Ligne véhicule',
  document_types: 'Type de document',
  employe_doc: "Document d'employé",
  employees: 'Employé',
  employe_salaire: 'Salaire employé',
  payments: 'Paiement',
  devis: 'Devis',
  devis_items: 'Ligne de devis',
};

// Turn table name into a readable label using map fallback
export const humanizeTable = (table: string): string => TABLE_LABELS[table] || table;

// Reference prefixes for quick identification
export const REF_PREFIX: Record<string, string> = {
  bons_commande: 'CMD',
  bons_sortie: 'SOR',
  bons_comptant: 'COM',
  bons_vehicule: 'VEH',
  devis: 'DEV',
};

// Top-level groups and their sub-tabs
export const MAIN_GROUPS: { key: string; label: string; tables: string[]; subTabs?: SubTab[] }[] = [
  {
    key: 'bons',
    label: 'Bons',
    tables: ['bons_commande', 'bons_comptant', 'bons_sortie', 'bons_vehicule'],
    subTabs: [
      { key: 'commande', label: 'Commande', tables: ['bons_commande'] },
      { key: 'comptant', label: 'Comptant', tables: ['bons_comptant'] },
      { key: 'sortie', label: 'Sortie', tables: ['bons_sortie'] },
      { key: 'vehicule', label: 'Véhicule', tables: ['bons_vehicule'] },
      { key: 'devis', label: 'Devis', tables: ['devis', 'devis_items'] },
      { key: 'avoirs', label: 'Avoirs', tables: ['avoirs_client', 'avoirs_comptant', 'avoirs_fournisseur', 'avoir_client_items', 'avoir_comptant_items', 'avoir_fournisseur_items'] },
    ],
  },
  { key: 'produits', label: 'Produits', tables: ['products', 'categories', 'item_remises', 'client_remises'] },
  { key: 'contacts', label: 'Contacts', tables: ['contacts'] },
  { key: 'talons', label: 'Talons', tables: ['talons', 'old_talons_caisse'] },
  { key: 'vehicules', label: 'Véhicules', tables: ['vehicules', 'vehicule_items'] },
  { key: 'documents', label: 'Documents', tables: ['document_types', 'employe_doc'] },
  { key: 'employes', label: 'Employés', tables: ['employees', 'employe_salaire'] },
  { key: 'paiements', label: 'Paiements', tables: ['payments'] },
];
