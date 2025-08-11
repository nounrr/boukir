// Types pour l'authentification
export type Role = 'PDG' | 'Employé';
export interface User {
  id: number;
  nom_complet?: string | null;
  cin: string;
  date_embauche?: string | null;
  role?: Role | null;
  created_at?: string;
  updated_at?: string;
}

export interface LoginCredentials {
  cin: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

// Types pour les employés
export interface Employee {
  id: number;
  nom_complet?: string | null;
  cin: string;
  date_embauche?: string | null;
  role?: Role | null;
  password?: string;
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateEmployeeData {
  cin: string;
  nom_complet?: string | null;
  date_embauche?: string | null;
  role?: Role | null;
  password: string;
}

// Types pour les catégories
export interface Category {
  id: number;
  nom: string;
  description?: string;
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryData {
  nom: string;
  description?: string;
}

// Types pour les produits (stock)
export interface Product {
  id: number;
  // reference is now id as string (derived from backend); keep optional for compatibility
  reference?: string;
  designation: string;
  categorie_id: number;
  categorie?: Category;
  quantite: number;
  prix_achat: number;
  cout_revient_pourcentage: number;
  cout_revient: number;
  prix_gros_pourcentage: number;
  prix_gros: number;
  prix_vente_pourcentage: number;
  prix_vente: number;
  est_service: boolean;
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProductData {
  designation?: string;
  categorie_id?: number;
  quantite?: number;
  prix_achat?: number;
  cout_revient_pourcentage?: number;
  prix_gros_pourcentage?: number;
  prix_vente_pourcentage?: number;
  est_service?: boolean;
}

// Types pour les contacts
export interface Contact {
  id: number;
  reference?: string; // Référence auto-générée
  nom_complet: string;
  type: 'Client' | 'Fournisseur';
  telephone?: string;
  email?: string;
  adresse?: string;
  rib?: string;
  ice?: string;
  solde: number;
  plafond?: number; // Plafond de crédit (clients)
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateContactData {
  reference?: string;
  nom_complet: string;
  type: 'Client' | 'Fournisseur';
  telephone?: string;
  email?: string;
  adresse?: string;
  rib?: string;
  ice?: string;
  solde?: number;
  plafond?: number;
}

// Types pour les véhicules
export interface Vehicule {
  id: number;
  nom: string;
  marque?: string;
  modele?: string;
  immatriculation: string;
  annee?: number;
  type_vehicule: 'Camion' | 'Camionnette' | 'Voiture' | 'Moto' | 'Autre';
  capacite_charge?: number;
  statut: 'Disponible' | 'En service' | 'En maintenance' | 'Hors service';
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateVehiculeData {
  nom: string;
  marque?: string;
  modele?: string;
  immatriculation: string;
  annee?: number;
  type_vehicule?: 'Camion' | 'Camionnette' | 'Voiture' | 'Moto' | 'Autre';
  capacite_charge?: number;
  statut?: 'Disponible' | 'En service' | 'En maintenance' | 'Hors service';
}

// Types pour les bons
export interface Bon {
  id: number;
  numero: string;
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'Devis';
  date_creation: string;
  date_echeance?: string;
  client_id?: number;
  fournisseur_id?: number;
  montant_total: number;
  statut: 'Brouillon' | 'Validé' | 'Annulé' | 'Livré' | 'Payé' | 'Avoir' | 'En attente';
  vehicule?: string;
  lieu_chargement?: string;
  bon_origine_id?: number; // Pour les avoirs, lien vers le bon d'origine
  items: BonItem[];
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface BonItem {
  id: number;
  bon_id: number;
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  montant_ligne: number;
  designation_custom?: string; // Désignation personnalisée modifiable
  produit?: Product;
}

export interface CreateBonData {
  numero: string;
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'Devis';
  date_creation: string;
  date_echeance?: string;
  client_id?: number;
  fournisseur_id?: number;
  vehicule?: string;
  lieu_chargement?: string;
  bon_origine_id?: number; // Pour les avoirs, lien vers le bon d'origine
  items: Omit<BonItem, 'id' | 'bon_id'>[];
}

// Types pour les paiements
export interface Payment {
  id: number;
  numero: string;
  type_paiement: 'Client' | 'Fournisseur';
  contact_id: number; // ID du client ou fournisseur
  bon_id?: number;
  montant_total: number;
  mode_paiement: 'Espèces' | 'Chèque' | 'Traite' | 'Virement';
  date_paiement: string;
  designation: string;
  // Champs spécifiques pour Chèque et Traite
  date_echeance?: string;
  banque?: string;
  personnel?: string; // Nom de la personne
  // Champ spécifique pour Virement
  reference_virement?: string;
  // Nouveaux champs pour compatibilité CaissePage
  montant?: number; // Alias pour montant_total
  reference?: string; // Alias pour reference_virement
  notes?: string; // Alias pour designation
  // Champ pour les images des chèques et traites
  image_url?: string;
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentData {
  numero: string;
  type_paiement: 'Client' | 'Fournisseur';
  contact_id: number;
  bon_id?: number;
  montant_total: number;
  mode_paiement: 'Espèces' | 'Chèque' | 'Traite' | 'Virement';
  date_paiement: string;
  designation: string;
  date_echeance?: string;
  banque?: string;
  personnel?: string;
  reference_virement?: string;
}

// Types pour les réponses API
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Types pour les erreurs
export interface ApiError {
  message: string;
  status?: number;
  field?: string;
}

// Types pour les véhicules
export interface Vehicle {
  id: number;
  immatriculation: string;
  marque: string;
  modele?: string;
  chauffeur?: string;
  telephone_chauffeur?: string;
  capacite?: string;
  notes?: string;
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateVehicleData {
  immatriculation: string;
  marque: string;
  modele?: string;
  chauffeur?: string;
  telephone_chauffeur?: string;
  capacite?: string;
  notes?: string;
}

// Types pour les filtres et recherche
export interface FilterState {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}
