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
 * Formate une date au format jj-mm-aaaa (4 chiffres)
 */
export const formatDateDMY = (date: string | Date | number): string => {
  if (!date) return '';
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear().toString();
  return `${day}-${month}-${year}`;
};

/**
 * Formate une date pour affichage simple (jour, mois, année uniquement)
 * @param date - Date à formater
 * @returns Date formatée au format jj/mm/aaaa
 */
export const formatDateSimple = (date: string | Date | number): string => {
  if (!date) return '';
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear().toString();
  return `${day}/${month}/${year}`;
};

/**
 * Formate une date avec format spécial (jour, année, mois)
 * @param date - Date à formater
 * @returns Date formatée au format jj/aaaa/mm
 */
export const formatDateSpecial = (date: string | Date | number): string => {
  if (!date) return '';
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear().toString();
  return `${day}/${year}/${month}`;
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
 * Formate une date au format jj-mm-aaaa (jour-mois-année, année complète)
 */
// (unique definition above)

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

/**
 * Formate une date avec l'heure au format jj-mm-aaaa hh:mm
 * @param date - Date à formater (string ISO, Date object, ou timestamp)
 * @returns Date formatée au format jj-mm-aaaa hh:mm
 */
export const formatDateTimeWithHour = (date: string | Date | number): string => {
  if (!date) return '';
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear().toString();
  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  
  return `${day}-${month}-${year} ${hours}:${minutes}`;
};

/**
 * Convertit une date d'input HTML (YYYY-MM-DD) vers le format DATETIME MySQL
 * @param dateInput - Date au format YYYY-MM-DD (ou vide)
 * @param withCurrentTime - Si true, utilise l'heure actuelle, sinon 00:00:00
 * @returns Date au format YYYY-MM-DD HH:MM:SS pour MySQL ou null si vide
 */
export const formatDateInputToMySQL = (dateInput: string, withCurrentTime: boolean = false): string | null => {
  if (!dateInput || dateInput.trim() === '') return null;
  
  // Si c'est un datetime-local (YYYY-MM-DDTHH:MM)
  if (dateInput.includes('T')) {
    const [datePart, timePart] = dateInput.split('T');
    const [hours, minutes] = timePart.split(':');
    return `${datePart} ${hours}:${minutes}:00`;
  }
  
  // Si c'est déjà au format YYYY-MM-DD
  if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    if (withCurrentTime) {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');
      return `${dateInput} ${hours}:${minutes}:${seconds}`;
    } else {
      return `${dateInput} 00:00:00`;
    }
  }
  
  return null;
};

/**
 * Convertit une valeur de date/datetime vers le format d'input HTML (YYYY-MM-DD)
 * @param dateValue - Date MySQL (DATETIME/DATE) ou ISO string
 * @returns Date au format YYYY-MM-DD pour les inputs HTML
 */
export const formatMySQLToDateInput = (dateValue: string | null): string => {
  if (!dateValue) return '';
  
  // Si c'est un DATETIME (YYYY-MM-DD HH:MM:SS), prendre seulement la partie date
  if (dateValue.includes(' ')) {
    return dateValue.split(' ')[0];
  }
  
  // Si c'est déjà au format YYYY-MM-DD
  if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateValue;
  }
  
  // Essayer de parser comme Date
  const dateObj = new Date(dateValue);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().split('T')[0];
  }
  
  return '';
};

/**
 * Obtient la date et heure actuelles au format DATETIME MySQL
 * @returns Date actuelle au format YYYY-MM-DD HH:MM:SS
 */
export const getCurrentDateTimeMySQL = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Convertit une datetime MySQL vers le format datetime-local (YYYY-MM-DDTHH:MM)
 * @param dateTimeValue - DateTime MySQL (YYYY-MM-DD HH:MM:SS) ou Date JavaScript
 * @returns DateTime au format YYYY-MM-DDTHH:MM pour les inputs datetime-local
 */
export const formatMySQLToDateTimeInput = (dateTimeValue: string | null): string => {
  if (!dateTimeValue) return '';
  
  console.log('formatMySQLToDateTimeInput input:', dateTimeValue);
  console.log('typeof input:', typeof dateTimeValue);
  
  // Si c'est déjà un objet Date JavaScript
  if (dateTimeValue instanceof Date) {
    const year = dateTimeValue.getFullYear();
    const month = String(dateTimeValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateTimeValue.getDate()).padStart(2, '0');
    const hours = String(dateTimeValue.getHours()).padStart(2, '0');
    const minutes = String(dateTimeValue.getMinutes()).padStart(2, '0');
    const result = `${year}-${month}-${day}T${hours}:${minutes}`;
    console.log('Date object detected, result:', result);
    return result;
  }
  
  // Si c'est un DATETIME (YYYY-MM-DD HH:MM:SS)
  if (typeof dateTimeValue === 'string' && dateTimeValue.includes(' ')) {
    // Vérifier si c'est le format standard MySQL DATETIME
    if (dateTimeValue.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      const [datePart, timePart] = dateTimeValue.split(' ');
      const [hours, minutes] = timePart.split(':');
      const result = `${datePart}T${hours}:${minutes}`;
      console.log('MySQL DATETIME format detected, result:', result);
      return result;
    }
    
    // Vérifier si c'est le format JavaScript Date string (Wed Aug 27 2025 22:01:00 GMT+0100)
    if (dateTimeValue.match(/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{4} \d{2}:\d{2}:\d{2}/)) {
      try {
        const dateObj = new Date(dateTimeValue);
        if (!isNaN(dateObj.getTime())) {
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const hours = String(dateObj.getHours()).padStart(2, '0');
          const minutes = String(dateObj.getMinutes()).padStart(2, '0');
          const result = `${year}-${month}-${day}T${hours}:${minutes}`;
          console.log('JavaScript Date string format detected, result:', result);
          return result;
        }
      } catch (e) {
        console.log('Failed to parse JavaScript Date string:', e);
      }
    }
  }
  
  // Si c'est seulement une DATE (YYYY-MM-DD), ajouter l'heure par défaut
  if (typeof dateTimeValue === 'string' && dateTimeValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const result = `${dateTimeValue}T08:00`;
    console.log('DATE format detected, result:', result);
    return result;
  }
  
  // Essayer de parser comme Date JavaScript (fallback)
  try {
    const dateObj = new Date(dateTimeValue);
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      const result = `${year}-${month}-${day}T${hours}:${minutes}`;
      console.log('Date object parsed from string, result:', result);
      return result;
    }
  } catch (e) {
    console.log('Failed to parse as Date object:', e);
  }
  
  console.log('No format matched, returning empty string');
  return '';
};

/**
 * Obtient la date et heure actuelles au format datetime-local (YYYY-MM-DDTHH:MM)
 * @returns DateTime actuelle au format YYYY-MM-DDTHH:MM
 */
export const getCurrentDateTimeInput = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};
