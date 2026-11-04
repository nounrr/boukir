// Amounts and cumulative balances are computed before filtering or pagination.
// The document order is stable across pages, including equal timestamps.
const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Number(value.toFixed(3));
const flag = value => value === true || value === 1 || value === '1' || value === 'true';
const definitions = {
  client: [['sorties', 'sortie', 1], ['avoirsClient', 'avoir', -1]],
  fournisseur: [['commandes', 'commande', 1], ['sortiesVendreFournisseur', 'sortieVendreFournisseur', -1], ['avoirsFournisseur', 'avoirFournisseur', -1], ['avoirsClientVendreFournisseur', 'avoirClientVendreFournisseur', 1]],
  charge: [['charges', 'charge', 1], ['avoirsCharge', 'avoirCharge', -1], ['sorties', 'sortie', 1], ['comptants', 'comptant', 1], ['avoirsClient', 'avoirClient', -1]],
};
const excluded = value => /^(annul|supprim|brouillon$|refus|expir)/.test(String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const dateKey = value => {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = value => value && !Number.isNaN(new Date(value).getTime()) ? dayFormatter.format(new Date(value)) : '';

function trackedRemise(item, entries) {
  let abonne = 0;
  let client = 0;
  for (const { type, entry } of entries) {
    const ref = String(item.product_reference ?? item.reference ?? '').trim();
    const entryRef = String(entry.reference ?? entry.product_reference ?? '').trim();
    if ((item.product_id != null && entry.product_id != null && Number(item.product_id) === Number(entry.product_id))
      || (ref && ref === entryRef) || (item.product_id != null && String(item.product_id) === String(entry.reference ?? entry.product_id ?? ''))) {
      if (type === 'client_abonne') abonne += n(entry.qte) * n(entry.prix_remise);
      else client += n(entry.qte) * n(entry.prix_remise);
    }
  }
  return round(round(abonne) + round(client));
}

export function buildContactLedger(contact, documents, remises, options = {}) {
  const view = options.ledger;
  if (!definitions[view]) throw new Error('Invalid ledger view');
  // Index once rather than scanning every contact remise for every product line.
  const remiseByBon = new Map();
  for (const remise of remises) {
    if (!['client_abonne', 'client-remise'].includes(remise.type)) continue;
    for (const entry of remise.items ?? []) {
      if (/^annul/i.test(String(entry.statut ?? '').trim())) continue;
      const key = Number(entry.bon_id);
      if (!remiseByBon.has(key)) remiseByBon.set(key, []);
      remiseByBon.get(key).push({ type: remise.type, entry });
    }
  }
  const rows = [];
  for (const [collection, kind, sign] of definitions[view]) {
    for (const data of documents[collection] ?? []) {
      if (!excluded(data.statut)) rows.push({ collection, kind, sign, date: data.date_creation, data: { ...data, items: (data.items ?? []).filter(item => item?.id).map(item => ({ ...item })) } });
    }
  }
  for (const data of documents.payments ?? []) {
    if (!excluded(data.statut)) rows.push({ collection: 'payments', kind: 'paiement', sign: view === 'fournisseur' && n(data.payment) === 1 ? 1 : -1, date: data.date_paiement || data.created_at, data: { ...data } });
  }
  // Stable sort preserves collection ordering for ties, as on the original pages.
  rows.sort((a, b) => dateKey(a.date) - dateKey(b.date));
  let running = n(contact.solde);
  let remiseRunning = 0;
  let totalBenefice = 0;
  for (const row of rows) {
    const { data, sign } = row;
    data.ledgerOpeningBalance = round(running);
    const items = data.items ?? [];
    const bonTotal = n(data.montant_total ?? data.montant);
    const itemTotal = item => n(item.total ?? n(item.quantite) * n(item.prix_unitaire ?? item.prix_achat));
    const itemsSum = items.reduce((sum, item) => sum + itemTotal(item), 0);
    if (!items.length) running += sign * bonTotal;
    items.forEach((item, index) => {
      // Preserve the detailed ledger's established amount rule, including zeroed lines.
      const amount = itemsSum === 0 ? (index === items.length - 1 ? bonTotal : 0) : itemTotal(item);
      running += sign * amount;
      const qty = n(item.quantite);
      const price = n(item.prix_unitaire ?? item.prix_achat ?? item.prix);
      const discount = n(item.remise_montant) || price * n(item.remise_pourcentage) / 100;
      const legacyId = item.legacy_remise_client_id ?? item.legacyRemiseClientId;
      const direct = legacyId != null && legacyId !== '' ? 0 : round(qty * discount);
      const tracked = view === 'client' ? trackedRemise(item, remiseByBon.get(Number(data.id)) ?? []) : 0;
      const remise = view === 'client'
        ? Math.max(0, row.kind === 'sortie' ? direct - tracked : 0) + tracked
        : n(item.remise_abonne) + n(item.remise_client) + (n(item.remise_montant) > 0 ? round(n(item.remise_montant) * (qty > 0 ? qty : 1)) : 0);
      if (remise > 0) remiseRunning += remise;
      item.ledgerBalance = round(running);
      item.ledgerRemiseBalance = round(remiseRunning);
      item.ledgerBenefice = (flag(item.rappel_non_calcule) && row.kind !== 'commande') || flag(item.est_service) ? 0
        : round((price - n(item.cout_revient ?? item.prix_achat) - (n(item.remise_montant) > 0 ? n(item.remise_montant) : price * Math.max(0, n(item.remise_pourcentage)) / 100)) * qty);
      totalBenefice += item.ledgerBenefice;
    });
    data.ledgerBalance = round(running);
    data.ledgerRemiseBalance = round(remiseRunning);
  }
  const search = String(options.search ?? '').trim().toLowerCase();
  const matchesItem = item => [item.reference, item.product_reference, item.designation, item.product_designation, item.variant_name, item.unit_name, item.product_id]
    .some(value => String(value ?? '').toLowerCase().includes(search));
  const tabCollections = {
    sorties: ['sorties'], avoirs: view === 'charge' ? ['avoirsCharge', 'avoirsClient'] : view === 'fournisseur' ? ['avoirsFournisseur'] : ['avoirsClient'],
    paiements: ['payments'], commandes: ['commandes'], charges: ['charges'], comptants: ['comptants'],
    sortiesVendreFournisseur: ['sortiesVendreFournisseur'], avoirsFournisseur: ['avoirsFournisseur'], avoirsClientVendreFournisseur: ['avoirsClientVendreFournisseur'],
    vendreFournisseur: ['sortiesVendreFournisseur'], avoirsVendreFournisseur: ['avoirsClientVendreFournisseur'],
  };
  const filtered = rows.filter(row => {
    const day = dayKey(row.date);
    return (!options.dateFrom || day >= options.dateFrom) && (!options.dateTo || day <= options.dateTo)
      && (!search || (row.data.items ?? []).some(matchesItem));
  });
  const totalMontantIgnorer = rows.filter(row => row.kind === 'paiement'
    && (!options.dateFrom || dayKey(row.date) >= options.dateFrom)
    && (!options.dateTo || dayKey(row.date) <= options.dateTo))
    .reduce((sum, row) => sum + n(row.data.montant_ignorer), 0);
  const counts = { complet: filtered.length };
  for (const [tab, collections] of Object.entries(tabCollections)) counts[tab] = filtered.filter(row => collections.includes(row.collection)).length;
  const collections = tabCollections[options.tab];
  const visible = collections ? filtered.filter(row => collections.includes(row.collection)) : filtered;
  if (options.tab === 'paiements') {
    const paymentValue = row => options.sortBy === 'montant' ? Math.max(0, n(row.data.montant_total ?? row.data.montant) - (view === 'charge' ? 0 : n(row.data.montant_ignorer)))
      : options.sortBy === 'montant_ignorer' ? n(row.data.montant_ignorer)
      : options.sortBy === 'rib' ? String(row.data.code_reglement || row.data.reference_virement || '').toLowerCase()
      : dateKey(row.date);
    visible.sort((a, b) => {
      const av = paymentValue(a), bv = paymentValue(b);
      return (av > bv ? 1 : av < bv ? -1 : 0) * (options.sortDir === 'desc' ? -1 : 1);
    });
  } else if (collections) visible.sort((a, b) => dateKey(b.date) - dateKey(a.date));
  const all = options.all === 'true' || options.all === true;
  const limit = Math.max(1, Math.min(100, Math.trunc(n(options.limit) || 50)));
  const totalPages = Math.max(1, Math.ceil(visible.length / limit));
  const page = options.page === 'last' ? totalPages : Math.min(totalPages, Math.max(1, Math.trunc(n(options.page) || 1)));
  const selected = all ? visible : visible.slice((page - 1) * limit, page * limit);
  const result = Object.fromEntries([...new Set(Object.values(definitions).flat().map(([key]) => key)), 'payments'].map(key => [key, []]));
  for (const row of selected) result[row.collection].push(search && row.data.items ? { ...row.data, items: row.data.items.filter(matchesItem) } : row.data);
  const selectedIds = new Set(selected.filter(row => row.kind !== 'paiement').map(row => Number(row.data.id)));
  return {
    contactId: contact.id, ...result,
    remises: remises.map(remise => ({ ...remise, items: (remise.items ?? []).filter(item => selectedIds.has(Number(item.bon_id))) })).filter(remise => remise.items.length),
    ledgerTotals: { initialSolde: n(contact.solde), finalSolde: round(running), totalBenefice: round(totalBenefice), totalMontantIgnorer: round(totalMontantIgnorer), totalDocuments: rows.length },
    ledgerCounts: counts,
    historyPagination: { page: all ? 1 : page, limit, totalRows: visible.length, totalPages: all ? 1 : totalPages, pageRows: selected.length, openingBalance: selected[0]?.data.ledgerOpeningBalance ?? round(running) },
  };
}
