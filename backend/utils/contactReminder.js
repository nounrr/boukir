export const REMINDER_MIN_DAYS = 0;
export const REMINDER_MAX_DAYS = 3650;

export function parseReminderDays(value) {
  if (value === null) return { valid: true, days: null };
  if (!Number.isInteger(value) || value < REMINDER_MIN_DAYS || value > REMINDER_MAX_DAYS) {
    return {
      valid: false,
      error: `days doit être un entier compris entre ${REMINDER_MIN_DAYS} et ${REMINDER_MAX_DAYS}, ou null`,
    };
  }
  return { valid: true, days: value };
}

export function getReminderStatus(daysRemaining) {
  if (!Number.isInteger(daysRemaining)) return { key: 'none', label: 'Aucun rappel' };
  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return { key: 'overdue', label: `En retard de ${overdueDays} j` };
  }
  if (daysRemaining === 0) return { key: 'today', label: 'Aujourd’hui' };
  if (daysRemaining <= 3) return { key: 'soon', label: `${daysRemaining} j restant${daysRemaining === 1 ? '' : 's'}` };
  return { key: 'later', label: `${daysRemaining} j restants` };
}
