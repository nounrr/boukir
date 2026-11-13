import { pointageLocalDay } from './pointageRequirements.js';

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function utcTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return NaN;
  return Date.parse(value.endsWith('Z') ? value : value.replace(' ', 'T').slice(0, 23) + 'Z');
}
const flag = value => value === true || Number(value) === 1;

export function summarizePresenceDay(events, day, today, now = new Date()) {
  const sorted = events.map(event => ({ ...event, timestamp: utcTime(event.occurred_at_utc) }))
    .filter(event => Number.isFinite(event.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp || Number(a.id) - Number(b.id));
  let firstEntry = null, lastExit = null, open = null, seconds = 0, lastDirection = null;
  const anomalies = new Set();
  for (const event of sorted) {
    if (event.direction === 'entree') {
      if (!firstEntry) firstEntry = event;
      if (!open) open = event; // Repeated scans never reset the clock.
      lastDirection = 'entree';
    } else if (event.direction === 'sortie') {
      if (open) { seconds += Math.max(0, (event.timestamp - open.timestamp) / 1000); open = null; lastExit = event; }
      else if (lastDirection !== 'sortie') anomalies.add('sortie_sans_entree');
      lastDirection = 'sortie';
    } else anomalies.add('sens_inconnu');
  }
  const ongoing = Boolean(open && day === today && now.getTime() >= open.timestamp);
  if (ongoing) seconds += Math.max(0, (now.getTime() - open.timestamp) / 1000);
  if (open && day < today) anomalies.add('sortie_manquante');
  const finalExit = open ? null : lastExit;
  return {
    statut: !firstEntry ? 'absent' : open ? 'present' : 'termine',
    entree: firstEntry?.local_time || null, sortie: finalExit?.local_time || null,
    temps_travail_minutes: Math.floor(seconds / 60), temps_en_cours: ongoing,
    entree_event_id: firstEntry ? Number(firstEntry.id) : null, sortie_event_id: finalExit ? Number(finalExit.id) : null,
    entree_has_photo: flag(firstEntry?.has_photo), sortie_has_photo: flag(finalExit?.has_photo),
    anomalies: [...anomalies], passages_count: events.length,
  };
}

export function buildDailyPresence({ month, employees, periods, events, absences = [], now = new Date(), timezone = 'Africa/Casablanca' }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mois invalide');
  const today = pointageLocalDay(now, timezone);
  const employeeById = new Map(employees.map(employee => [Number(employee.id), employee]));
  const periodByEmployee = new Map();
  for (const period of periods) {
    const id = Number(period.employe_id);
    if (!periodByEmployee.has(id)) periodByEmployee.set(id, []);
    periodByEmployee.get(id).push(period);
  }
  const groupedEvents = new Map(), manualByKey = new Map(), rowKeys = new Set();
  let unassigned = 0;
  for (const event of events) {
    if (!event.local_date?.startsWith(month + '-') || event.local_date > today) continue;
    const id = Number(event.employe_id);
    if (!employeeById.has(id)) { unassigned++; continue; }
    const key = `${id}:${event.local_date}`;
    if (!groupedEvents.has(key)) groupedEvents.set(key, []);
    groupedEvents.get(key).push(event); rowKeys.add(key);
  }
  for (const absence of absences) {
    const id = Number(absence.employe_id), day = absence.date_absence;
    if (employeeById.has(id) && day?.startsWith(month + '-') && day <= today) {
      const key = `${id}:${day}`; manualByKey.set(key, absence); rowKeys.add(key);
    }
  }
  const requiredOn = (employee, day) => {
    if (employee.date_embauche && day < employee.date_embauche) return false;
    if (employee.deleted_at && day >= employee.deleted_at.slice(0, 10)) return false;
    const ranges = periodByEmployee.get(Number(employee.id)) || [];
    return ranges.some(period => day >= period.start_date && (!period.end_date || day < period.end_date))
      || (!ranges.length && flag(employee.pointage_obligatoire) && day === today);
  };
  const start = new Date(`${month}-01T00:00:00Z`);
  for (let date = start; date.toISOString().startsWith(month); date = new Date(date.getTime() + 86400000)) {
    const day = date.toISOString().slice(0, 10);
    if (day > today) break;
    for (const employee of employees) if (requiredOn(employee, day)) rowKeys.add(`${employee.id}:${day}`);
  }
  const rows = [...rowKeys].map(key => {
    const [id, day] = key.split(':'), employee = employeeById.get(Number(id));
    const manual = manualByKey.get(key);
    return {
      key, employe_id: Number(id), nom_complet: employee.nom_complet || null, cin: employee.cin || '', role: employee.role || null,
      date_pointage: day, obligatoire: requiredOn(employee, day),
      ...summarizePresenceDay(groupedEvents.get(key) || [], day, today, now),
      absence_saisie: manual ? { id: Number(manual.id), type_absence: manual.type_absence, motif: manual.motif || null } : null,
    };
  });
  rows.sort((a, b) => b.date_pointage.localeCompare(a.date_pointage)
    || (a.nom_complet || a.cin).localeCompare(b.nom_complet || b.cin, 'fr') || a.employe_id - b.employe_id);
  return { data: rows, today, timezone, unassigned_count: unassigned };
}
