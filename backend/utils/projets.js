// Logique pure du module Projets (validation + calculs), testable sans base.

export const AVANCE_MODES = Object.freeze(['Espece', 'Virement', 'Cheque']);
export const BON_TYPES = Object.freeze(['products', 'charge']);
const MAX_LINES = 500;
const MAX_AMOUNT = 999_999_999;

export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const round3 = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

export function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function optionalId(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const id = parseId(value);
  return id ? { ok: true, value: id } : { ok: false };
}

export function parseDate(value, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    return required ? { error: 'Date obligatoire.' } : { value: null };
  }
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: 'Date invalide.' };
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return { error: 'Date invalide.' };
  }
  return { value: text };
}

function parseNumber(value, { label, min = 0, allowZero = true }) {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(number) || number < min || number > MAX_AMOUNT || (!allowZero && number === 0)) {
    return { error: `${label} invalide.` };
  }
  return { value: number };
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function validateProjet(input) {
  const nom = text(input?.nom, 180);
  if (!nom) return { error: 'Le nom du projet est obligatoire.' };
  const debut = parseDate(input?.date_debut);
  if (debut.error) return { error: `Date de début : ${debut.error}` };
  const fin = parseDate(input?.date_fin);
  if (fin.error) return { error: `Date de fin : ${fin.error}` };
  if (debut.value && fin.value && fin.value < debut.value) {
    return { error: 'La date de fin doit être après la date de début.' };
  }
  return {
    value: {
      nom,
      description: text(input?.description, 10000) || null,
      date_debut: debut.value,
      date_fin: fin.value,
    },
  };
}

/**
 * Normalise les lignes du devis ou d'un bon. Le total de chaque ligne est
 * toujours recalculé côté serveur (quantité × prix unitaire).
 */
export function validateLines(lines, { withProducts = false } = {}) {
  if (!Array.isArray(lines)) return { error: 'Lignes invalides.' };
  if (lines.length > MAX_LINES) return { error: `Maximum ${MAX_LINES} lignes.` };
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || {};
    const label = `Ligne ${index + 1}`;
    const designation = text(line.designation, 255);
    if (!designation) return { error: `${label} : désignation obligatoire.` };
    const quantite = parseNumber(line.quantite ?? 1, { label: `${label} : quantité`, allowZero: false });
    if (quantite.error) return quantite;
    const prix = parseNumber(line.prix_unitaire ?? 0, { label: `${label} : prix unitaire` });
    if (prix.error) return prix;
    const value = {
      position: index,
      designation,
      unite: text(line.unite, 50) || null,
      quantite: round3(quantite.value),
      prix_unitaire: round2(prix.value),
    };
    value.total = round2(value.quantite * value.prix_unitaire);
    if (withProducts) {
      const product = optionalId(line.product_id);
      const variant = optionalId(line.variant_id);
      const unit = optionalId(line.unit_id);
      if (!product.ok || !variant.ok || !unit.ok) return { error: `${label} : produit invalide.` };
      value.product_id = product.value;
      value.variant_id = product.value ? variant.value : null;
      value.unit_id = product.value ? unit.value : null;
    }
    out.push(value);
  }
  return { value: out, total: round2(out.reduce((sum, line) => sum + line.total, 0)) };
}

export function validateAvance(input) {
  const date = parseDate(input?.date_avance, { required: true });
  if (date.error) return { error: date.error };
  const montant = parseNumber(input?.montant, { label: 'Montant', allowZero: false });
  if (montant.error) return montant;
  const mode = AVANCE_MODES.includes(input?.mode_paiement) ? input.mode_paiement : null;
  if (!mode) return { error: 'Mode de paiement invalide (Espèce, Virement ou Chèque).' };
  return {
    value: {
      date_avance: date.value,
      montant: round2(montant.value),
      mode_paiement: mode,
      description: text(input?.description, 5000) || null,
    },
  };
}

export function validateBon(input) {
  if (!BON_TYPES.includes(input?.type)) return { error: 'Type de bon invalide.' };
  const date = parseDate(input?.date_bon, { required: true });
  if (date.error) return { error: date.error };
  const lines = validateLines(input?.items, { withProducts: true });
  if (lines.error) return lines;
  if (!lines.value.length) return { error: 'Le bon doit contenir au moins une ligne.' };
  return {
    value: {
      type: input.type,
      date_bon: date.value,
      observations: text(input?.observations, 5000) || null,
      items: lines.value,
      montant_total: lines.total,
    },
  };
}

export const bonReference = (bon) => `${bon.type === 'charge' ? 'BC' : 'BP'}-${String(bon.id).padStart(4, '0')}`;

/**
 * Historique unifié : avances (entrées) et bons produits / charge (sorties),
 * triés par date avec un solde cumulé = avances − dépenses.
 */
export function buildSituation(avances, bons) {
  const rows = [
    ...avances.map((a) => ({
      kind: 'avance',
      id: a.id,
      date: a.date_avance,
      reference: `AV-${String(a.id).padStart(4, '0')}`,
      libelle: a.description || `Avance (${a.mode_paiement})`,
      mode_paiement: a.mode_paiement,
      entree: round2(a.montant),
      sortie: 0,
      created_at: a.created_at,
    })),
    ...bons.map((b) => ({
      kind: b.type === 'charge' ? 'charge' : 'products',
      id: b.id,
      date: b.date_bon,
      reference: bonReference(b),
      libelle: b.observations || (b.type === 'charge' ? 'Bon charge' : 'Bon produits'),
      mode_paiement: null,
      entree: 0,
      sortie: round2(b.montant_total),
      created_at: b.created_at,
    })),
  ];
  const time = (value) => (value ? new Date(value).getTime() || 0 : 0);
  rows.sort((x, y) => (
    String(x.date).localeCompare(String(y.date))
    || time(x.created_at) - time(y.created_at)
    || x.id - y.id
  ));
  let solde = 0;
  return rows.map((row) => {
    solde = round2(solde + row.entree - row.sortie);
    return { ...row, solde };
  });
}

export function buildStats({ devisTotal, avances, bons }) {
  const sum = (items, pick) => round2(items.reduce((acc, item) => acc + Number(pick(item) || 0), 0));
  const totalAvances = sum(avances, (a) => a.montant);
  const totalProducts = sum(bons.filter((b) => b.type === 'products'), (b) => b.montant_total);
  const totalCharges = sum(bons.filter((b) => b.type === 'charge'), (b) => b.montant_total);
  const totalDepenses = round2(totalProducts + totalCharges);
  const devis = round2(devisTotal);

  const parMode = Object.fromEntries(AVANCE_MODES.map((mode) => [
    mode, sum(avances.filter((a) => a.mode_paiement === mode), (a) => a.montant),
  ]));

  const months = new Map();
  const bucket = (date) => {
    const key = String(date).slice(0, 7);
    if (!months.has(key)) months.set(key, { mois: key, avances: 0, products: 0, charges: 0 });
    return months.get(key);
  };
  for (const a of avances) bucket(a.date_avance).avances += Number(a.montant);
  for (const b of bons) bucket(b.date_bon)[b.type === 'charge' ? 'charges' : 'products'] += Number(b.montant_total);
  const parMois = [...months.values()]
    .sort((a, b) => a.mois.localeCompare(b.mois))
    .map((m) => ({ ...m, avances: round2(m.avances), products: round2(m.products), charges: round2(m.charges) }));

  const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : 0);
  return {
    total_devis: devis,
    total_avances: totalAvances,
    total_products: totalProducts,
    total_charges: totalCharges,
    total_depenses: totalDepenses,
    solde: round2(totalAvances - totalDepenses),
    reste_a_encaisser: round2(devis - totalAvances),
    resultat_previsionnel: round2(devis - totalDepenses),
    taux_encaissement: pct(totalAvances, devis),
    taux_consommation: pct(totalDepenses, devis),
    nb_avances: avances.length,
    nb_bons_products: bons.filter((b) => b.type === 'products').length,
    nb_bons_charge: bons.filter((b) => b.type === 'charge').length,
    par_mode: parMode,
    par_mois: parMois,
  };
}
