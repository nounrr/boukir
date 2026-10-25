import React, { useMemo, useRef, useState } from 'react';
import { scopeProjetSituation } from '../../utils/projetSituation';
import { Calendar, ChevronDown, ChevronUp, History, Printer, Search, X } from 'lucide-react';
import type { ProjetBon, ProjetBonType, ProjetSituationRow, ProjetStats } from '../../store/api/projetsApi';
import { MODE_LABELS, formatDay, formatMoney, formatQty } from './shared';
import TablePrintButton from './TablePrintButton';

type Filter = 'all' | ProjetSituationRow['kind'];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Complet' },
  { key: 'avance', label: 'Avances' },
  { key: 'products', label: 'Produits' },
  { key: 'charge', label: 'Charges produit' },
  { key: 'charge_materiel', label: 'Charges matériel' },
];
const KIND: Record<ProjetSituationRow['kind'], { label: string; tone: string; rowClass: string }> = {
  avance: { label: 'Avance', tone: 'bg-emerald-100 text-emerald-800', rowClass: 'bg-green-100 hover:bg-green-200/70' },
  products: { label: 'Bon produits', tone: 'bg-blue-100 text-blue-700', rowClass: 'bg-blue-100 hover:bg-blue-200/70' },
  charge_materiel: { label: 'Charge matériel', tone: 'bg-violet-100 text-violet-800', rowClass: 'bg-violet-100 hover:bg-violet-200/70' },
  charge: { label: 'Charge produit', tone: 'bg-orange-100 text-orange-800', rowClass: 'bg-orange-100 hover:bg-orange-200/70' },
};

const balanceClass = (value: number) => value < 0 ? 'text-red-600' : value > 0 ? 'text-green-700' : 'text-gray-500';
const printButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:opacity-50';
const compactInputClass = 'min-w-0 rounded border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 md:py-1.5';

const SummaryCard: React.FC<{ label: string; value: number; tone?: string; hint?: string; balance?: boolean }> = ({ label, value, tone = 'text-gray-800', hint, balance = false }) => (
  <div className={`min-w-0 rounded-lg px-3 py-2 ${balance ? 'border border-yellow-200 bg-yellow-50' : 'border border-gray-100 bg-white'}`}>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`mt-0.5 break-words text-base font-bold tabular-nums ${tone}`}>{formatMoney(value)}</p>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
  </div>
);

const SituationTab: React.FC<{ projetNom: string; situation: ProjetSituationRow[]; stats?: ProjetStats; bons: ProjetBon[]; scope?: ProjetBonType; onPrint?: (bon: ProjetBon) => void }> = ({ projetNom, situation: allSituation, stats, bons, scope, onPrint }) => {
  const situation = useMemo(() => scopeProjetSituation(allSituation, scope), [allSituation, scope]);
  const totalEntree = situation.reduce((sum, row) => sum + row.entree, 0);
  const totalSortie = situation.reduce((sum, row) => sum + row.sortie, 0);
  const finalBalance = situation.at(-1)?.solde ?? 0;
  const [filter, setFilter] = useState<Filter>('all');
  const [detail, setDetail] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bonMap = useMemo(() => new Map(bons.map((bon) => [bon.id, bon])), [bons]);
  // Les soldes sont établis avant les filtres, comme dans le détail client.
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    return situation.flatMap((row) => {
      const bon = row.kind === 'avance' ? undefined : bonMap.get(row.id);
      const items = bon?.items ?? [];
      let balance = Math.round((row.solde - row.entree + row.sortie) * 100) / 100;
      const lines = detail && items.length ? items.map((item, index) => {
        const amount = item.total ?? Math.round(item.quantite * item.prix_unitaire * 100) / 100;
        balance = Math.round((balance - amount) * 100) / 100;
        return { ...row, key: `${row.kind}-${row.id}-${index}`, item, sortie: amount, solde: index === items.length - 1 ? row.solde : balance };
      }) : [{ ...row, key: `${row.kind}-${row.id}`, item: undefined }];
      return lines.filter((line) => (
        (filter === 'all' || row.kind === filter)
        && (!from || row.date.slice(0, 10) >= from)
        && (!to || row.date.slice(0, 10) <= to)
        && (!query || [row.reference, row.libelle, KIND[row.kind].label, row.mode_paiement && MODE_LABELS[row.mode_paiement], ...(line.item ? [line.item.designation] : items.map((item) => item.designation))].filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(query))
      ));
    });
  }, [situation, bonMap, detail, filter, from, to, search]);
  const visibleTotals = rows.reduce((total, row) => ({ entree: total.entree + row.entree, sortie: total.sortie + row.sortie }), { entree: 0, sortie: 0 });
  const filtered = filter !== 'all' || Boolean(search.trim() || from || to);
  const counts = useMemo(() => situation.reduce((result, row) => {
    result[row.kind]++;
    return result;
  }, { avance: 0, products: 0, charge: 0, charge_materiel: 0 }), [situation]);
  const mobileGroups = useMemo(() => {
    const groups = new Map<string, { key: string; rows: typeof rows }>();
    rows.forEach(row => {
      const key = `${row.kind}-${row.id}`;
      const group = groups.get(key);
      if (group) group.rows.push(row);
      else groups.set(key, { key, rows: [row] });
    });
    return [...groups.values()];
  }, [rows]);
  const scrollToEdge = (bottom: boolean) => {
    const element = scrollRef.current;
    if (!element) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (window.matchMedia('(min-width: 768px)').matches) {
      element.scrollTo({ top: bottom ? element.scrollHeight : 0, behavior });
    } else {
      element.scrollIntoView({ block: bottom ? 'end' : 'start', behavior });
    }
  };
  const resetFilters = () => { setFilter('all'); setSearch(''); setFrom(''); setTo(''); };
  const printBonButton = (row: ProjetSituationRow) => row.kind !== 'avance' && onPrint && bonMap.has(row.id) ? (
    <button type="button" onClick={() => onPrint(bonMap.get(row.id)!)} aria-label={`Imprimer PDF ${row.reference}`} title="Imprimer / Télécharger PDF" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-purple-700 transition-colors hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 md:h-7 md:w-7">
      <Printer className="h-4 w-4" />
    </button>
  ) : null;

  return (
    <section className="min-w-0 space-y-4" aria-label={scope ? `Situation — ${KIND[scope].label}` : 'Situation complète du projet'}>
      <div className={`grid grid-cols-2 gap-2 ${stats && !scope ? 'xl:grid-cols-6' : 'sm:grid-cols-3'}`}>
        {stats && !scope ? <>
          <SummaryCard label="Devis" value={stats.total_devis} />
          <SummaryCard label="Avances" value={stats.total_avances} tone="text-green-700" hint={`${stats.taux_encaissement}% du devis`} />
          <SummaryCard label="Bons produits" value={stats.total_products} tone="text-blue-700" />
          <SummaryCard label="Charges produit" value={stats.total_charges_products} tone="text-orange-700" />
          <SummaryCard label="Charges matériel" value={stats.total_charges_materiel} tone="text-violet-700" />
        </> : <>
          <SummaryCard label={scope ? 'Total des bons' : 'Avances'} value={scope ? totalSortie : totalEntree} tone={scope ? 'text-red-600' : 'text-green-700'} />
          <SummaryCard label={scope ? 'Mouvements' : 'Dépenses'} value={scope ? totalEntree - totalSortie : totalSortie} tone="text-gray-800" hint={`${situation.length} opération(s)`} />
        </>}
        <SummaryCard label="Solde cumulé" value={finalBalance} tone={balanceClass(finalBalance)} hint={scope ? 'Solde de ce type' : 'Avances − dépenses'} balance />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-900">{scope ? `Situation — ${KIND[scope].label}` : 'Situation du projet'}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => scrollToEdge(false)} disabled={!rows.length} title="Aller en haut" aria-label="Aller en haut de la situation" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => scrollToEdge(true)} disabled={!rows.length} title="Aller en bas" aria-label="Aller en bas de la situation" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40"><ChevronDown className="h-4 w-4" /></button>
          <TablePrintButton className={printButtonClass} disabled={!rows.length} report={{
          projectName: projetNom,
          title: scope ? `Situation — ${KIND[scope].label}` : 'Situation complète',
          landscape: true,
          notes: [
            `${rows.length} ligne(s) · ${detail ? 'Vue détaillée' : 'Vue par bon'}`,
            filter !== 'all' ? `Type : ${KIND[filter].label}` : '',
            search.trim() ? `Recherche : ${search.trim()}` : '',
            from || to ? `Période : ${from ? formatDay(from) : 'début'} → ${to ? formatDay(to) : 'sans limite'}` : '',
            'Les soldes cumulés conservent l’historique avant les filtres.',
          ],
          tables: [{
            columns: [
              { label: 'Date' }, { label: 'Type' }, { label: 'Référence' }, { label: detail ? 'Désignation / Libellé' : 'Libellé' },
              ...(detail ? [{ label: 'Unité' }, { label: 'Qté', numeric: true }, { label: 'Prix unitaire', numeric: true }] : []),
              { label: 'Mode' }, { label: 'Entrée', numeric: true }, { label: 'Sortie', numeric: true }, { label: 'Solde cumulé', numeric: true },
            ],
            rows: rows.map(row => [
              formatDay(row.date), KIND[row.kind].label, row.reference,
              row.item ? `${row.item.designation}${row.libelle !== KIND[row.kind].label ? `\n${row.libelle}` : ''}` : row.libelle,
              ...(detail ? [row.item?.unite || '—', row.item ? formatQty(row.item.quantite) : '—', row.item ? formatMoney(row.item.prix_unitaire) : '—'] : []),
              row.mode_paiement ? MODE_LABELS[row.mode_paiement] : '—', row.entree ? formatMoney(row.entree) : '', row.sortie ? formatMoney(row.sortie) : '', formatMoney(row.solde),
            ]),
            totals: [
              ...(filtered ? [['Totaux affichés', ...Array(detail ? 7 : 4).fill(''), formatMoney(visibleTotals.entree), formatMoney(visibleTotals.sortie), '—']] : []),
              [scope ? 'Totaux de ce type / Solde final' : 'Totaux du projet / Solde final', ...Array(detail ? 7 : 4).fill(''), formatMoney(totalEntree), formatMoney(totalSortie), formatMoney(finalBalance)],
            ],
          }],
        }} />
        </div>
      </div>

      <div className="relative min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-white">
          {!scope && <div className="flex overflow-x-auto" role="tablist" aria-label="Filtrer l’historique">
            {FILTERS.map(({ key, label }) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${filter === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>
                {label}<span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${filter === key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{key === 'all' ? situation.length : counts[key]}</span>
              </button>
            ))}
          </div>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 py-1">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
              <input type="date" aria-label="Date de début" className={`${compactInputClass} w-[124px]`} value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
              <span className="text-xs text-gray-400" aria-hidden="true">—</span>
              <input type="date" aria-label="Date de fin" className={`${compactInputClass} w-[124px]`} value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </div>
            <div className="flex min-w-0 flex-1 basis-full items-center gap-2 py-1 md:basis-52 md:border-l md:border-gray-100 md:pl-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
              <input type="search" aria-label="Rechercher un bon ou une désignation" className={`${compactInputClass} w-full flex-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Référence, produit, matériel…" />
            </div>
            <label className="flex min-h-10 cursor-pointer select-none items-center gap-2 px-2">
              <input type="checkbox" checked={detail} onChange={event => setDetail(event.target.checked)} className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-gray-600">Détail</span>
            </label>
            {filtered && <button type="button" onClick={resetFilters} className="inline-flex min-h-10 items-center gap-1.5 rounded px-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><X className="h-3.5 w-3.5" /> Réinitialiser</button>}
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-2">
          <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">{rows.length} ligne(s)</span> · Ordre chronologique · {scope ? 'Solde de ce type à partir de zéro.' : 'Solde cumulé = avances − dépenses.'} Les filtres conservent le solde historique.</p>
        </div>

        <div ref={scrollRef} className="relative scroll-mt-16 md:max-h-[calc(100vh-220px)] md:overflow-auto">
          {!rows.length ? <div className="flex flex-col items-center px-5 py-12 text-center text-gray-400">
            <History className="mb-3 h-9 w-9" />
            <p className="text-sm font-medium text-gray-600">{!situation.length ? 'Aucun mouvement' : 'Aucun mouvement ne correspond aux filtres.'}</p>
            <p className="mt-1 max-w-sm text-xs text-gray-500">{!situation.length ? 'Les avances et les bons du projet apparaîtront ici avec leur solde cumulé.' : 'Modifiez les dates, le type ou la recherche pour retrouver vos opérations.'}</p>
            {filtered && <button type="button" onClick={resetFilters} className="mt-3 min-h-10 rounded px-3 text-sm font-medium text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Effacer les filtres</button>}
          </div> : <>
            <div className="hidden md:block">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-600">Type</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-600">N°</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600">{detail ? 'Désignation / Libellé' : 'Libellé'}</th>
                    {detail && <><th className="px-3 py-3 text-left font-semibold text-gray-600">Unité</th><th className="px-3 py-3 text-center font-semibold text-gray-600">Qté</th><th className="whitespace-nowrap px-3 py-3 text-right font-semibold text-gray-600">Prix unit.</th></>}
                    <th className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-600">Entrée</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-600">Sortie</th>
                    <th className="whitespace-nowrap border-l border-yellow-200 bg-yellow-50 px-4 py-3 text-right font-semibold text-gray-600">Solde cumulé</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-600">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.key} className={`colored-row transition-colors ${KIND[row.kind].rowClass}`}>
                      <td className="px-4 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${KIND[row.kind].tone}`}>{KIND[row.kind].label}</span></td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-gray-900"><div className="flex items-center gap-1">{row.reference}{printBonButton(row)}</div></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-700">{formatDay(row.date)}</td>
                      <td className="min-w-44 px-3 py-2.5 text-sm text-gray-900">{row.item?.designation ?? row.libelle}{row.item && row.libelle !== KIND[row.kind].label && <p className="mt-0.5 text-xs text-gray-600">{row.libelle}</p>}</td>
                      {detail && <><td className="px-3 py-2.5 text-gray-700">{row.item?.unite || '—'}</td><td className="px-3 py-2.5 text-center tabular-nums">{row.item ? formatQty(row.item.quantite) : '—'}</td><td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{row.item ? formatMoney(row.item.prix_unitaire) : '—'}</td></>}
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{row.entree ? formatMoney(row.entree) : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{row.sortie ? formatMoney(row.sortie) : '—'}</td>
                      <td className="solde-cumule-cell whitespace-nowrap border-l border-yellow-200 bg-yellow-50 px-4 py-2.5 text-right tabular-nums"><span className={`text-xs font-bold ${balanceClass(row.solde)}`}>{formatMoney(row.solde)}</span></td>
                      <td className="px-4 py-2.5 text-xs text-gray-700">{row.mode_paiement ? MODE_LABELS[row.mode_paiement] : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200">
                  {filtered && <tr className="bg-white text-xs font-medium">
                    <td colSpan={detail ? 7 : 4} className="px-4 py-3 text-right text-gray-600">Totaux affichés</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-green-700">{formatMoney(visibleTotals.entree)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-red-600">{formatMoney(visibleTotals.sortie)}</td>
                    <td className="border-l border-yellow-200 bg-yellow-50 px-4 py-3 text-right text-gray-500">—</td><td />
                  </tr>}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={detail ? 7 : 4} className="px-4 py-3 text-right text-gray-600">{scope ? 'Totaux de ce type / Solde final' : 'Totaux du projet / Solde final'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-green-700">{formatMoney(totalEntree)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-red-600">{formatMoney(totalSortie)}</td>
                    <td className={`whitespace-nowrap border-l border-yellow-200 bg-yellow-50 px-4 py-3 text-right tabular-nums ${balanceClass(finalBalance)}`}>{formatMoney(finalBalance)}</td><td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {mobileGroups.map(group => {
                const first = group.rows[0];
                const last = group.rows[group.rows.length - 1];
                const payment = first.kind === 'avance';
                const amount = group.rows.reduce((sum, row) => sum + row.entree + row.sortie, 0);
                return <article key={group.key} className={`min-w-0 rounded-xl border p-4 shadow-sm ${payment ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${KIND[first.kind].tone}`}>{KIND[first.kind].label}</span>
                      <p className="mt-2 break-words font-mono text-sm font-bold text-gray-900">{first.reference}</p>
                      <p className="mt-1 text-xs text-gray-500">{formatDay(first.date)}</p>
                    </div>
                    {printBonButton(first)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-200 pt-3">
                    <div className="min-w-0 py-2"><p className="text-xs text-gray-500">{payment ? 'Entrée' : 'Sortie'}{search.trim() && detail ? ' affichée' : ''}</p><p className={`mt-0.5 break-words text-sm font-bold tabular-nums ${payment ? 'text-green-700' : 'text-gray-900'}`}>{formatMoney(amount)}</p></div>
                    <div className="min-w-0 rounded-lg border border-yellow-200 bg-yellow-50 px-2 py-2 text-right"><p className="text-xs text-gray-500">Solde cumulé</p><p className={`mt-0.5 break-words text-sm font-bold tabular-nums ${balanceClass(last.solde)}`}>{formatMoney(last.solde)}</p></div>
                  </div>
                  {first.libelle && <p className="mt-3 break-words text-xs text-gray-600">{first.libelle}</p>}
                  {payment && <p className="mt-2 text-xs text-gray-600">Mode : <span className="font-medium text-gray-800">{first.mode_paiement ? MODE_LABELS[first.mode_paiement] : '—'}</span></p>}
                  {detail && !payment && <div className="mt-3 space-y-2">
                    {group.rows.map(row => row.item && <div key={row.key} className="min-w-0 rounded-lg bg-gray-50 p-3 text-xs">
                      <p className="break-words font-semibold text-gray-900">{row.item.designation}</p>
                      <p className="mt-1 text-gray-500">{row.item.unite || '—'}</p>
                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1"><span className="text-gray-600">Qté {formatQty(row.item.quantite)} × {formatMoney(row.item.prix_unitaire)}</span><strong className="tabular-nums text-gray-900">{formatMoney(row.sortie)}</strong></div>
                      {group.rows.length > 1 && <div className="mt-2 flex flex-wrap justify-between gap-x-2 border-t border-gray-200 pt-2"><span className="text-gray-500">Solde après cette ligne</span><span className={`font-semibold tabular-nums ${balanceClass(row.solde)}`}>{formatMoney(row.solde)}</span></div>}
                    </div>)}
                  </div>}
                </article>;
              })}
            </div>
          </>}
        </div>
        {situation.length > 0 && <div className="space-y-3 border-t border-gray-200 bg-gray-50 p-4 md:hidden">
          {filtered && <div><p className="mb-2 text-xs font-semibold text-gray-600">Totaux affichés</p><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-gray-500">Entrées</p><strong className="break-words tabular-nums text-green-700">{formatMoney(visibleTotals.entree)}</strong></div><div><p className="text-gray-500">Sorties</p><strong className="break-words tabular-nums text-red-600">{formatMoney(visibleTotals.sortie)}</strong></div></div></div>}
          <div className={filtered ? 'border-t border-gray-200 pt-3' : ''}><p className="mb-2 text-xs font-semibold text-gray-600">{scope ? 'Totaux de ce type' : 'Totaux du projet'}</p><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-gray-500">Entrées</p><strong className="break-words tabular-nums text-green-700">{formatMoney(totalEntree)}</strong></div><div><p className="text-gray-500">Sorties</p><strong className="break-words tabular-nums text-red-600">{formatMoney(totalSortie)}</strong></div></div></div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2"><span className="text-xs font-medium text-gray-600">Solde final</span><strong className={`break-words tabular-nums ${balanceClass(finalBalance)}`}>{formatMoney(finalBalance)}</strong></div>
        </div>}
      </div>
    </section>
  );
};

export default SituationTab;
