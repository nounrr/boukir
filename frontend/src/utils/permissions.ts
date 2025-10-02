import type { User } from '../types';

// Utilitaires pour les permissions basées sur les rôles

export const canManageEmployees = (user: User | null): boolean => {
  return user?.role === 'PDG' || user?.role === 'ManagerPlus';
};

export const canManageStock = (user: User | null): boolean => {
  return user !== null; // Tous les employés connectés peuvent gérer le stock
};

export const canManageContacts = (user: User | null): boolean => {
  return user !== null; // Tous les employés connectés peuvent gérer les contacts
};

export const canManageBons = (user: User | null): boolean => {
  return user !== null; // Tous les employés connectés peuvent gérer les bons
};

export const canManagePayments = (user: User | null): boolean => {
  return user !== null; // Tous les employés connectés peuvent gérer les paiements
};

export const canViewReports = (user: User | null): boolean => {
  return user?.role === 'PDG'; // Seuls les PDG peuvent voir les rapports avancés
};

export const canDeleteItems = (user: User | null): boolean => {
  return user?.role === 'PDG'; // Seuls les PDG peuvent supprimer des éléments
};

export const canModifyBons = (user: User | null): boolean => {
  const result = user?.role === 'PDG' || user?.role === 'Manager' || user?.role === 'ManagerPlus';
  console.log('canModifyBons:', { userRole: user?.role, result });
  return result; // PDG, Manager et ManagerPlus peuvent modifier les bons
};

export const canModifyPayments = (user: User | null): boolean => {
  const result = user?.role === 'PDG' || user?.role === 'Manager' || user?.role === 'ManagerPlus';
  console.log('canModifyPayments:', { userRole: user?.role, result });
  return result; // PDG, Manager et ManagerPlus peuvent modifier les paiements
};

export const canDeletePayments = (user: User | null): boolean => {
  return user?.role === 'PDG'; // Seuls les PDG peuvent supprimer les paiements
};

export const canAccessAdvancedFeatures = (user: User | null): boolean => {
  return user?.role === 'PDG' || user?.role === 'ManagerPlus'; // PDG et ManagerPlus ont accès aux fonctionnalités avancées
};

// Middleware pour injecter automatiquement created_by/updated_by
export const withCreatedBy = <T extends object>(
  data: T,
  userId: number
): T & { created_by: number } => {
  return {
    ...data,
    created_by: userId,
  };
};

export const withUpdatedBy = <T extends object>(
  data: T,
  userId: number
): T & { updated_by: number } => {
  return {
    ...data,
    updated_by: userId,
  };
};

// Utilitaires pour la validation des données
export const validateCIN = (cin: string): boolean => {
  // Format CIN marocain : 2 lettres + 6 chiffres
  const cinRegex = /^[A-Z]{2}\d{6}$/;
  return cinRegex.test(cin);
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  // Format téléphone marocain
  const phoneRegex = /^(\+212|0)[5-7]\d{8}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ''));
};

// Utilitaires pour le formatage
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
  }).format(amount);
};

export const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat('fr-MA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
};

export const formatDateTime = (date: string): string => {
  return new Intl.DateTimeFormat('fr-MA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

// Utilitaires pour la génération de rapports
export const generatePDFReport = (data: any, title: string): void => {
  // Placeholder pour la génération de PDF
  console.log(`Génération du rapport PDF: ${title}`, data);
  alert('Fonctionnalité de génération PDF à implémenter');
};

export const exportToExcel = (data: any[], filename: string): void => {
  // Placeholder pour l'export Excel
  console.log(`Export Excel: ${filename}`, data);
  alert('Fonctionnalité d\'export Excel à implémenter');
};

// Utilitaires pour la recherche et filtrage
export const filterItems = <T extends object>(
  items: T[],
  searchTerm: string,
  searchFields: (keyof T)[]
): T[] => {
  if (!searchTerm.trim()) return items;
  
  const term = searchTerm.toLowerCase();
  
  return items.filter((item) =>
    searchFields.some((field) => {
      const value = item[field];
      if (typeof value === 'string') {
        return value.toLowerCase().includes(term);
      }
      if (typeof value === 'number') {
        return value.toString().includes(term);
      }
      return false;
    })
  );
};

export const sortItems = <T extends object>(
  items: T[],
  sortField: keyof T,
  sortDirection: 'asc' | 'desc' = 'asc'
): T[] => {
  return [...items].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
};
