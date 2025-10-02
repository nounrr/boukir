/**
 * Utilitaires pour la gestion du temps et des fuseaux horaires
 * 
 * Le système utilise l'heure locale du Maroc (GMT+1 en hiver, GMT+0 en été)
 * Ces fonctions s'assurent que les horaires d'accès sont correctement calculés
 */

/**
 * Obtient l'heure actuelle au Maroc
 * @returns {Date} - Date/heure actuelle au Maroc
 */
export const getCurrentMoroccoTime = () => {
  const now = new Date();
  
  // Convertir en heure du Maroc (GMT+1 en hiver, GMT+0 en été)
  // Le Maroc suit le fuseau horaire 'Africa/Casablanca'
  const moroccoTime = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Casablanca" }));
  
  return moroccoTime;
};

/**
 * Obtient l'heure actuelle formatée HH:MM au Maroc
 * @returns {string} - Heure actuelle au format HH:MM
 */
export const getCurrentMoroccoTimeString = () => {
  const moroccoTime = getCurrentMoroccoTime();
  return moroccoTime.toTimeString().slice(0, 5); // Format HH:MM
};

/**
 * Obtient le jour de la semaine actuel au Maroc
 * @returns {number} - Jour de la semaine (1=Lundi, 7=Dimanche)
 */
export const getCurrentMoroccoDayOfWeek = () => {
  const moroccoTime = getCurrentMoroccoTime();
  const day = moroccoTime.getDay();
  return day === 0 ? 7 : day; // Convertir dimanche (0) -> 7
};

/**
 * Vérifie les horaires d'accès avec l'heure du Maroc
 * @param {string} startTime - Heure de début (format HH:MM)
 * @param {string} endTime - Heure de fin (format HH:MM)
 * @param {number[]} allowedDays - Jours autorisés (1-7)
 * @returns {Object} - {hasAccess: boolean, reason: string, currentTime: string, currentDay: number}
 */
export const checkAccessWithMoroccoTime = (startTime, endTime, allowedDays = [1,2,3,4,5]) => {
  const currentTime = getCurrentMoroccoTimeString();
  const currentDay = getCurrentMoroccoDayOfWeek();
  
  // Vérifier le jour
  if (!allowedDays.includes(currentDay)) {
    return {
      hasAccess: false,
      reason: 'Accès non autorisé ce jour',
      currentTime,
      currentDay,
      allowedDays,
      debugInfo: {
        startTime,
        endTime,
        moroccoTime: getCurrentMoroccoTime().toISOString(),
        localTime: new Date().toISOString()
      }
    };
  }

  // Vérifier l'heure
  if (currentTime < startTime || currentTime > endTime) {
    return {
      hasAccess: false,
      reason: `Accès autorisé de ${startTime} à ${endTime}`,
      currentTime,
      currentDay,
      allowedDays,
      debugInfo: {
        startTime,
        endTime,
        moroccoTime: getCurrentMoroccoTime().toISOString(),
        localTime: new Date().toISOString()
      }
    };
  }

  return {
    hasAccess: true,
    reason: 'Accès autorisé',
    currentTime,
    currentDay,
    allowedDays,
    debugInfo: {
      startTime,
      endTime,
      moroccoTime: getCurrentMoroccoTime().toISOString(),
      localTime: new Date().toISOString()
    }
  };
};

/**
 * Obtient des informations de débogage sur le fuseau horaire
 * @returns {Object} - Informations détaillées sur les fuseaux horaires
 */
export const getTimezoneDebugInfo = () => {
  const now = new Date();
  const moroccoTime = getCurrentMoroccoTime();
  
  return {
    serverLocalTime: {
      iso: now.toISOString(),
      timeString: now.toTimeString(),
      timezoneOffset: now.getTimezoneOffset(),
      locale: now.toLocaleString()
    },
    moroccoTime: {
      iso: moroccoTime.toISOString(),
      timeString: moroccoTime.toTimeString(),
      dayOfWeek: getCurrentMoroccoDayOfWeek(),
      formatted: getCurrentMoroccoTimeString()
    },
    comparison: {
      timeDifferenceMinutes: (moroccoTime.getTime() - now.getTime()) / (1000 * 60),
      serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      moroccoTimezone: 'Africa/Casablanca'
    }
  };
};