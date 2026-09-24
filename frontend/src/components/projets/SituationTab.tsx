import React, { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { ProjetSituationRow, ProjetStats } from '../../store/api/projetsApi';
import { EmptyState, MODE_LABELS, formatDay, formatMoney } from './shared';

type Filter = 'all' | ProjetSituationRow['kind'];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'avance', label: 'Avances' },
  { key: 'products', label: 'Produits' },
  { key: 'charge', label: 'Charges' },
];
const KIND: Record<ProjetSituationRow['kind'], { label: string; tone: string }> = {
  avance: { label: 'Avance', tone: 'bg-emerald-50 text-emerald-800' },
  products: { label: 'Bon produits', tone: 'bg-amber-50 text-amber-800' },
  charge: { label: 'Bon charge', tone: 'bg-rose-50 text-rose-800' },
};

const SummaryCard: React.FC<{ label: string; value: number; tone?: string; hint?: string }> = ({ label, value, tone = 'text-slate-900', hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{formatMoney(value)}</p>
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
);

const SituationTab: React.FC<{ situation: ProjetSituationRow[]; stats: ProjetStats }> = ({ situation, stats }) => {
  const [filter, setFilter] = useState<Filter>('all');
  // Le solde reste celui de l'historique complet, même filtré.
  const rows = useMemo(() => situation.filter((r) => filter === 'all' || r.kind === filter), [situation, filter]);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard label="Devis" value={stats.total_devis} />
        <SummaryCard label="Avances" value={stats.total_avances} tone="text-emerald-700" hint={`${stats.taux_encaissement}% du devis`} />
        <SummaryCard label="Bons produits" value={stats.total_products} tone="text-amber-700" />
        <SummaryCard label="Bons charge" value={stats.total_charges} tone="text-rose-700" />
        <SummaryCard label="Solde" value={stats.solde} tone={stats.solde < 0 ? 'text-rose-700' : 'text-sky-800'} hint="Avances − dépenses" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Historique complet</h2>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist" aria-label="Filtrer l’historique">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${filter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!situation.length ? (
        <EmptyState icon={History} title="Aucun mouvement" hint="Les avances, bons produits et bons charge apparaîtront ici avec le solde cumulé." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Référence</th>
                <th className="px-4 py-2">Libellé</th>
                <th className="px-4 py-2 text-right">Entrée</th>
                <th className="px-4 py-2 text-right">Sortie</th>
                <th className="px-4 py-2 text-right">Solde cumulé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{formatDay(row.date)}</td>
                  <td className="px-4 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${KIND[row.kind].tone}`}>{KIND[row.kind].label}</span></td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600">{row.reference}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.libelle}{row.mode_paiement && <span className="ml-1 text-xs text-slate-400">· {MODE_LABELS[row.mode_paiement]}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-emerald-700">{row.entree ? formatMoney(row.entree) : ''}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-rose-700">{row.sortie ? formatMoney(row.sortie) : ''}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums ${row.solde < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{formatMoney(row.solde)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={4} className="px-4 py-3 text-right text-slate-600">Totaux</td>
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
