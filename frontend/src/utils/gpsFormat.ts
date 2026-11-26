/** Petits formats du suivi GPS : heures, durées, cap, âge d'une position, jours. */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Un jour AAAA-MM-JJ, au calendrier de cet ordinateur. */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Le jour `n` jours après (ou avant si n < 0) un jour AAAA-MM-JJ. */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

/** « 08:05 ». */
export function clock(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** « 45 min », « 2 h 05 ». */
export function duration(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad2(m % 60)}`;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
/** Un cap en degrés en point cardinal : 0 → N, 90 → E. */
export function compass(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** L'âge d'une position, et sa couleur : en direct (< 2 min), récente (< 30 min), ancienne, aucune. */
export function signalOf(iso: string | null | undefined, now = Date.now()): { label: string; color: string; live: boolean } {
  if (!iso) return { label: 'Aucune position', color: '#94a3b8', live: false };
  const minutes = (now - new Date(iso).getTime()) / 60000;
  if (minutes < 2) return { label: 'En direct', color: '#16a34a', live: true };
  if (minutes < 30) return { label: `Il y a ${Math.max(1, Math.round(minutes))} min`, color: '#f59e0b', live: false };
  const hours = minutes / 60;
  return { label: hours < 24 ? `Il y a ${Math.round(hours)} h` : `Il y a ${Math.round(hours / 24)} j`, color: '#64748b', live: false };
}
