// Utilitaires pour la gestion des dates

/**
 * Formate une date au format jj-mm-aa
 * @param date - Date à formater (string ISO, Date object, ou timestamp)
 * @returns Date formatée au format jj-mm-aa
 */
export const formatDateToDisplay = (date: string | Date | number): string => {
  if (!date) return '';
  
  const dateObj = new Date(date);
  
  // Vérifier si la date est valide
  if (isNaN(dateObj.getTime())) return '';
  
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear().toString().slice(-2); // Prendre les 2 derniers chiffres
  
  return `${day}-${month}-${year}`;
};

/**
 * Convertit une date du format jj-mm-aa vers le format ISO (YYYY-MM-DD)
 * @param dateStr - Date au format jj-mm-aa
 * @returns Date au format YYYY-MM-DD pour les inputs HTML
 */
export const formatDateToInput = (dateStr: string): string => {
  if (!dateStr) return '';
  
  // Si c'est déjà au format ISO, le retourner tel quel
  if (dateStr.includes('-') && dateStr.length === 10 && dateStr.charAt(4) === '-') {
    return dateStr;
  }
  
  // Si c'est au format jj-mm-aa
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateStr;
};

/**
 * Convertit une date ISO vers le format jj-mm-aa
 * @param isoDate - Date au format YYYY-MM-DD
 * @returns Date au format jj-mm-aa
 */
export const formatISOToDisplay = (isoDate: string): string => {
  if (!isoDate) return '';
  
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const shortYear = year.slice(-2);
    return `${day}-${month}-${shortYear}`;
  }
  
  return isoDate;
};

/**
 * Obtient la date actuelle au format jj-mm-aa
 * @returns Date actuelle au format jj-mm-aa
 */
export const getCurrentDateFormatted = (): string => {
  return formatDateToDisplay(new Date());
};

/**
 * Obtient la date actuelle au format ISO pour les inputs
 * @returns Date actuelle au format YYYY-MM-DD
 */
export const getCurrentDateISO = (): string => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

/**
 * Calcule une date relative (ex: il y a 30 jours) au format ISO
 * @param days - Nombre de jours à soustraire (positif pour le passé)
 * @returns Date calculée au format YYYY-MM-DD
 */
export const getDateDaysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
};
