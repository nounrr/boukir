import React, { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { ProjetBon, ProjetSituationRow, ProjetStats } from '../../store/api/projetsApi';
import { EmptyState, MODE_LABELS, formatDay, formatMoney, formatQty, inputClass, secondaryButton } from './shared';

type Filter = 'all' | ProjetSituationRow['kind'];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'avance', label: 'Avances' },
  { key: 'products', label: 'Produits' },
  { key: 'charge', label: 'Charges produit' },
  { key: 'charge_materiel', label: 'Charges matériel' },
];
const KIND: Record<ProjetSituationRow['kind'], { label: string; tone: string }> = {
  avance: { label: 'Avance', tone: 'bg-emerald-50 text-emerald-800' },
  products: { label: 'Bon produits', tone: 'bg-amber-50 text-amber-800' },
  charge_materiel: { label: 'Charge matériel', tone: 'bg-violet-50 text-violet-800' },
  charge: { label: 'Charge produit', tone: 'bg-rose-50 text-rose-800' },
};

const SummaryCard: React.FC<{ label: string; value: number; tone?: string; hint?: string }> = ({ label, value, tone = 'text-slate-900', hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{formatMoney(value)}</p>
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
);

const SituationTab: React.FC<{ situation: ProjetSituationRow[]; stats: ProjetStats; bons: ProjetBon[] }> = ({ situation, stats, bons }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [detail, setDetail] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <SummaryCard label="Devis" value={stats.total_devis} />
        <SummaryCard label="Avances" value={stats.total_avances} tone="text-emerald-700" hint={`${stats.taux_encaissement}% du devis`} />
        <SummaryCard label="Bons produits" value={stats.total_products} tone="text-amber-700" />
        <SummaryCard label="Charges produit" value={stats.total_charges_products} tone="text-rose-700" />
        <SummaryCard label="Charges matériel" value={stats.total_charges_materiel} tone="text-violet-700" />
        <SummaryCard label="Solde" value={stats.solde} tone={stats.solde < 0 ? 'text-rose-700' : 'text-sky-800'} hint="Avances − dépenses" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Situation du projet</h2>
        <div className="inline-flex max-w-full flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist" aria-label="Filtrer l’historique">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${filter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="min-w-48 flex-1 text-xs font-medium text-slate-600">Rechercher un bon ou une désignation
          <input type="search" className={`${inputClass} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Référence, produit, matériel…" />
        </label>
        <label className="text-xs font-medium text-slate-600">Du
          <input type="date" className={`${inputClass} mt-1`} value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-600">Au
          <input type="date" className={`${inputClass} mt-1`} value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="button" className={secondaryButton} aria-pressed={detail} onClick={() => setDetail(!detail)}>{detail ? 'Vue par bon' : 'Vue détaillée'}</button>
        {filtered && <button type="button" className={secondaryButton} onClick={() => { setFilter('all'); setSearch(''); setFrom(''); setTo(''); }}>Réinitialiser</button>}
      </div>
      <p className="text-xs text-slate-500">{rows.length} ligne(s) · Ordre chronologique · Solde cumulé = avances − bons produits − charges produit − charges matériel. Les filtres ne recalculent pas le solde.</p>

      {!situation.length ? (
        <EmptyState icon={History} title="Aucun mouvement" hint="Les avances, bons produits et bons charge apparaîtront ici avec le solde cumulé." />
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Référence</th>
                <th className="px-4 py-2">{detail ? 'Désignation / Libellé' : 'Libellé'}</th>
                {detail && <><th className="px-4 py-2">Unité</th><th className="px-4 py-2 text-right">Qté</th><th className="px-4 py-2 text-right">Prix unitaire</th></>}
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2 text-right">Entrée</th>
                <th className="px-4 py-2 text-right">Sortie</th>
                <th className="border-l border-amber-200 bg-amber-50 px-4 py-2 text-right">Solde cumulé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{formatDay(row.date)}</td>
                  <td className="px-4 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${KIND[row.kind].tone}`}>{KIND[row.kind].label}</span></td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600">{row.reference}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.item?.designation ?? row.libelle}{row.item && row.libelle !== KIND[row.kind].label && <p className="mt-1 text-xs text-slate-400">{row.libelle}</p>}</td>
                  {detail && <><td className="px-4 py-2.5">{row.item?.unite || '—'}</td><td className="px-4 py-2.5 text-right tabular-nums">{row.item ? formatQty(row.item.quantite) : '—'}</td><td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{row.item ? formatMoney(row.item.prix_unitaire) : '—'}</td></>}
                  <td className="px-4 py-2.5">{row.mode_paiement ? MODE_LABELS[row.mode_paiement] : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-emerald-700">{row.entree ? formatMoney(row.entree) : ''}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-rose-700">{row.sortie ? formatMoney(row.sortie) : ''}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums border-l border-amber-200 bg-amber-50 ${row.solde < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{formatMoney(row.solde)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={detail ? 11 : 8} className="px-4 py-8 text-center text-slate-500">Aucun mouvement ne correspond aux filtres.</td></tr>}
            </tbody>
            <tfoot>
              {filtered && <tr className="bg-white font-medium">
                <td colSpan={detail ? 8 : 5} className="px-4 py-3 text-right">Totaux affichés</td>
                <td className="px-4 py-3 text-right text-emerald-700">{formatMoney(visibleTotals.entree)}</td>
                <td className="px-4 py-3 text-right text-rose-700">{formatMoney(visibleTotals.sortie)}</td>
                <td className="px-4 py-3 text-right">—</td>
              </tr>}
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={detail ? 8 : 5} className="px-4 py-3 text-right text-slate-600">Totaux du projet / Solde final</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatMoney(stats.total_avances)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-rose-700">{formatMoney(stats.total_depenses)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${stats.solde < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{formatMoney(stats.solde)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
};

export default SituationTab;
