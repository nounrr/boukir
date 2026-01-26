// Types pour l'authentification
export type Role = 'PDG' | 'Manager' | 'ManagerPlus' | 'Chauffeur' | 'Employé';
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
  salaire?: number | null;
  password?: string;
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null; // Champ pour soft delete
}

export interface CreateEmployeeData {
  cin: string;
  nom_complet?: string | null;
  date_embauche?: string | null;
  role?: Role | null;
  salaire?: number | null;
  password: string;
}

// Types for employee salary entries
export interface EmployeeSalaireEntry {
  id: number;
  employe_id: number;
  montant: number;
  note?: string | null;
  statut?: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeSalaireSummaryRow {
  employe_id: number;
  total: number;
}

// Types pour les catégories
export interface Category {
  id: number;
  nom: string;
  description?: string;
  parent_id?: number | null;
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryData {
  nom: string;
  description?: string;
  parent_id?: number | null;
}

export interface ProductVariant {
  id?: number;
  product_id?: number;
  variant_name: string;
  variant_type?: string;
  reference?: string;
  prix_achat: number;
  cout_revient?: number;
  cout_revient_pourcentage?: number;
  prix_gros?: number;
  prix_gros_pourcentage?: number;
  prix_vente_pourcentage?: number;
  prix_vente: number;
  stock_quantity: number;
  image_url?: string | null;
  gallery?: Array<{
    id: number;
    image_url: string;
    position: number;
  }>;
  remise_client?: number;
  remise_artisan?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductUnit {
  id?: number;
  product_id?: number;
  unit_name: string;
  conversion_factor: number;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Brand {
  id: number;
  nom: string;
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBrandData {
  nom: string;
  description?: string;
  image?: File;
}

// Types pour les produits (stock)
export interface Product {
  id: number;
  // reference is now id as string (derived from backend); keep optional for compatibility
  reference?: string;
  designation: string;
  categorie_id: number;
  categorie?: Category;
  categories?: Category[];
  brand_id?: number | null;
  brand?: Brand;
  quantite: number;
  kg?: number | null;
  prix_achat: number;
  cout_revient_pourcentage: number;
  cout_revient: number;
  prix_gros_pourcentage: number;
  prix_gros: number;
  prix_vente_pourcentage: number;
  prix_vente: number;
  est_service: boolean;
  image_url?: string | null;
  remise_client?: number;
  remise_artisan?: number;
  
  // Gallery images
  gallery?: Array<{
    id: number;
    image_url: string;
    position: number;
  }>;
  
  // Multi-language fields
  
  // Multi-language fields
  fiche_technique?: string | null;
  fiche_technique_ar?: string | null;
  fiche_technique_en?: string | null;
  fiche_technique_zh?: string | null;

  description?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  description_zh?: string | null;

  designation_ar?: string | null;
  designation_en?: string | null;
  designation_zh?: string | null;

  pourcentage_promo?: number;
  ecom_published?: boolean;
  stock_partage_ecom?: boolean;
  stock_partage_ecom_qty?: number;
  has_variants?: boolean;
  base_unit?: string;
  categorie_base?: 'Professionel' | 'Maison' | null;
  variants?: ProductVariant[];
  units?: ProductUnit[];
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProductData {
  designation?: string;
  categorie_id?: number;
  quantite?: number;
  kg?: number | null;
  prix_achat?: number;
  cout_revient_pourcentage?: number;
  prix_gros_pourcentage?: number;
  prix_vente_pourcentage?: number;
  est_service?: boolean;
  remise_client?: number;
  remise_artisan?: number;
  description?: string;
  pourcentage_promo?: number;
  ecom_published?: boolean;
  stock_partage_ecom?: boolean;
  stock_partage_ecom_qty?: number;
  has_variants?: boolean;
  base_unit?: string;
  variants?: ProductVariant[];
  units?: ProductUnit[];
}

// Types pour les contacts
export interface Contact {
  id: number;
  reference?: string; // Référence auto-générée
  societe?: string | null;
  nom_complet: string;
  prenom?: string | null;
  nom?: string | null;
  type: 'Client' | 'Fournisseur';
  type_compte?: 'Client' | 'Artisan/Promoteur' | 'Fournisseur' | null;
  telephone?: string;
  email?: string;
  password?: string;
  adresse?: string;
  rib?: string;
  ice?: string;
  solde: number;
  solde_cumule?: number; // Solde cumulé calculé côté backend
  plafond?: number; // Plafond de crédit (clients)
  demande_artisan?: boolean;
  artisan_approuve?: boolean;
  artisan_approuve_par?: number | null;
  artisan_approuve_le?: string | null;
  artisan_note_admin?: string | null;
  auth_provider?: 'local' | 'google' | 'facebook' | 'none';
  google_id?: string | null;
  facebook_id?: string | null;
  provider_access_token?: string | null;
  provider_refresh_token?: string | null;
  provider_token_expires_at?: string | null;
  avatar_url?: string | null;
  email_verified?: boolean;
  source?: 'backoffice' | 'ecommerce';
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
  date_creation?: string; // alias pour created_at côté affichage
}

export interface CreateContactData {
  reference?: string;
  societe?: string | null;
  nom_complet: string;
  prenom?: string | null;
  nom?: string | null;
  type: 'Client' | 'Fournisseur';
  type_compte?: 'Client' | 'Artisan/Promoteur' | 'Fournisseur' | null;
  telephone?: string;
  email?: string;
  password?: string;
  adresse?: string;
  rib?: string;
  ice?: string;
  solde?: number;
  plafond?: number;
  demande_artisan?: boolean;
  artisan_approuve?: boolean;
  artisan_approuve_par?: number | null;
  artisan_approuve_le?: string | null;
  artisan_note_admin?: string | null;
  auth_provider?: 'local' | 'google' | 'facebook' | 'none';
  google_id?: string | null;
  facebook_id?: string | null;
  provider_access_token?: string | null;
  provider_refresh_token?: string | null;
  provider_token_expires_at?: string | null;
  avatar_url?: string | null;
  email_verified?: boolean;
  source?: 'backoffice' | 'ecommerce';
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

// Types pour les talons
export interface Talon {
  id: number;
  nom: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTalonData {
  nom: string;
  phone?: string;
}

export interface UpdateTalonData {
  nom?: string;
  phone?: string;
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
  numero?: string;
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'AvoirComptant' | 'Devis' | 'Vehicule' | 'Ecommerce';
  date_creation: string;
  date_echeance?: string;
  client_id?: number;
  fournisseur_id?: number;
  // Free-text names (some endpoints don't use client_id/fournisseur_id)
  client_nom?: string;
  phone?: string | null;
  adresse_livraison?: string;
  montant_total: number;
  statut: 'Brouillon' | 'Validé' | 'Annulé' | 'Livré' | 'Payé' | 'Avoir' | 'En attente' | 'Envoyé' | 'Accepté' | 'Refusé' | 'Expiré' | 'Facturé';
  // Ecommerce (optional)
  customer_email?: string;
  payment_method?: string;
  payment_status?: string;
  delivery_method?: string;
  pickup_location_id?: number;
  pickup_location?: { id: number; name?: string; address?: string } | null;
  // Champs spécifiques véhicule (bons_vehicule)
  vehicule_id?: number;
  vehicule_nom?: string;
  vehicule?: string; // compatibilité ancienne si utilisée ailleurs
  lieu_chargement?: string;
  bon_origine_id?: number; // Pour les avoirs, lien vers le bon d'origine
  items: BonItem[];
  // Multi-vehicule livraison links (optional)
  livraisons?: Livraison[];
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
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'AvoirComptant' | 'Devis' | 'Vehicule' | 'Ecommerce';
  date_creation: string;
  date_echeance?: string;
  client_id?: number;
  fournisseur_id?: number;
  vehicule_id?: number;
  lieu_chargement?: string;
  phone?: string | null;
  adresse_livraison?: string;
  bon_origine_id?: number; // Pour les avoirs, lien vers le bon d'origine
  items: Omit<BonItem, 'id' | 'bon_id'>[];
  // New: allow attaching multiple vehicules with optional chauffeur
  livraisons?: Array<{
    vehicule_id: number;
    user_id?: number | null;
  }>;
}

export interface Livraison {
  id?: number;
  bon_type?: string;
  bon_id?: number;
  vehicule_id: number;
  user_id?: number | null;
  vehicule_nom?: string;
  chauffeur_nom?: string;
}

// Types pour les paiements
export interface Payment {
  id: number;
  numero: string;
  type_paiement: 'Client' | 'Fournisseur';
  contact_id: number; // ID du client ou fournisseur
  bon_id?: number;
  bon_type?: string | null; // Type du bon (pour éviter collisions d'IDs entre tables)
  talon_id?: number; // ID du talon associé
  montant_total: number;
  mode_paiement: 'Espèces' | 'Chèque' | 'Traite' | 'Virement';
  date_paiement: string | null;
  designation: string;
  // Champs spécifiques pour Chèque et Traite
  date_echeance?: string;
  banque?: string;
  personnel?: string; // Nom de la personne
  code_reglement?: string; // Code/référence libre (chèque/virement/traite)
  // Champ spécifique pour Virement
  reference_virement?: string;
  // Nouveaux champs pour compatibilité CaissePage
  montant?: number; // Alias pour montant_total
  reference?: string; // Alias pour reference_virement
  notes?: string; // Alias pour designation
  statut?: 'En attente' | 'Validé' | 'Refusé' | 'Annulé';
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
  bon_type?: string | null;
  montant_total: number;
  mode_paiement: 'Espèces' | 'Chèque' | 'Traite' | 'Virement';
  date_paiement: string | null;
  designation: string;
  date_echeance?: string;
  banque?: string;
  personnel?: string;
  reference_virement?: string;
  statut?: 'En attente' | 'Validé' | 'Refusé' | 'Annulé';
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

// Types pour les anciens talons caisse (saisie manuelle)
export interface OldTalonCaisse {
  id: number;
  date_paiement: string | null; // Date du paiement
  fournisseur: string; // Nom du fournisseur
  montant_cheque: number; // Montant du chèque
  date_cheque: string; // Date du chèque
  numero_cheque?: string | null; // Numéro du chèque (optionnel)
  validation: 'Validé' | 'En attente' | 'Refusé' | 'Annulé'; // Statut de validation
  banque?: string; // Nom de la banque
  personne?: string; // Nom de la personne
  factures?: string; // Informations sur les factures
  disponible?: string; // Statut de disponibilité
  id_talon: number; // ID du talon associé
  created_at: string;
  updated_at: string;
}

export interface CreateOldTalonCaisseData {
  date_paiement: string | null;
  fournisseur: string;
  montant_cheque: number;
  date_cheque: string;
  numero_cheque?: string | null; // Optionnel et peut être null
  validation?: 'Validé' | 'En attente' | 'Refusé' | 'Annulé';
  banque?: string;
  personne?: string; // Nom de la personne
  factures?: string; // Informations sur les factures
  disponible?: string; // Statut de disponibilité
  id_talon: number;
}
