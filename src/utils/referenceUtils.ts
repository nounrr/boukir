// Système de génération automatique de références par auto-incrément

// Compteurs pour chaque type d'entité
const counters = {
  BON_CMD: 1,
  BON_SOR: 1,
  BON_COM: 1,
  BON_DEV: 1,
  AVOIR_F: 1,
  AVOIR_C: 1,
  PROD: 1,
  CLIENT: 1,
  FOURNISSEUR: 1,
  PAYMENT: 1,
};

// Fonction pour obtenir le prochain ID
export const getNextId = (entityType: string): number => {
  return Date.now() + Math.random();
};

// Fonction pour générer une référence avec auto-incrément
export const generateReference = (prefix: string): string => {
  const key = prefix as keyof typeof counters;
  
  if (counters[key] !== undefined) {
    const currentCount = counters[key];
    counters[key] += 1;
    
    // Format: PREFIX + numéro sur 4 chiffres (ex: CMD0001, PROD0001)
    return `${prefix}${currentCount.toString().padStart(4, '0')}`;
  }
  
  // Fallback si le prefix n'est pas défini
  return `${prefix}${Date.now().toString().slice(-4)}`;
};

// Fonction spécialisée pour les bons selon leur type
export const generateBonReference = (type: string): string => {
  switch (type) {
    case 'Commande':
      return generateReference('CMD');
    case 'Sortie':
      return generateReference('SOR');
    case 'Comptant':
      return generateReference('COM');
    case 'Devis':
      return generateReference('DEV');
    case 'AvoirFournisseur':
      return generateReference('AVF');
    case 'Avoir':
      return generateReference('AVC');
    default:
      return generateReference('BON');
  }
};

// Fonction pour les produits
export const generateProductReference = (): string => {
  return generateReference('PROD');
};

// Fonction pour les clients
export const generateClientReference = (): string => {
  return generateReference('CLI');
};

// Fonction pour les fournisseurs
export const generateSupplierReference = (): string => {
  return generateReference('FOU');
};

// Fonction pour les paiements
export const generatePaymentReference = (): string => {
  return generateReference('PAY');
};

// Fonction pour réinitialiser les compteurs (utile pour les tests)
export const resetCounters = (): void => {
  Object.keys(counters).forEach(key => {
    counters[key as keyof typeof counters] = 1;
  });
};