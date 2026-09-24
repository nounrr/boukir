import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProjetStats } from '../../store/api/projetsApi';
import { MODE_LABELS, formatMoney } from './shared';

const COLORS = { avances: '#047857', products: '#d97706', charges: '#be123c' };

const Kpi: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({ label, value, hint, tone = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
  </div>
);

const Progress: React.FC<{ label: string; value: number; color: string; detail: string }> = ({ label, value, color, detail }) => (
  <div>
    <div className="mb-1 flex items-baseline justify-between text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="tabular-nums text-slate-500">{value}% · {detail}</span>
    </div>
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
    </div>
  </div>
);

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-MA', { month: 'short', year: '2-digit' }).format(new Date(y, (m || 1) - 1, 1));
};
const compact = (v: number) => new Intl.NumberFormat('fr-MA', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

const StatsTab: React.FC<{ stats: ProjetStats }> = ({ stats }) => {
  const modes = Object.entries(stats.par_mode) as [keyof typeof MODE_LABELS, number][];
  const maxMode = Math.max(1, ...modes.map(([, v]) => v));
  const monthly = stats.par_mois.map((m) => ({ ...m, label: monthLabel(m.mois) }));

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Montant du devis" value={formatMoney(stats.total_devis)} />
        <Kpi label="Reste à encaisser" value={formatMoney(stats.reste_a_encaisser)} tone={stats.reste_a_encaisser > 0 ? 'text-amber-700' : 'text-emerald-700'} hint="Devis − avances" />
        <Kpi label="Total dépensé" value={formatMoney(stats.total_depenses)} tone="text-rose-700" hint={`${stats.nb_bons_products} bon(s) produits · ${stats.nb_bons_charge} bon(s) charge`} />
        <Kpi label="Résultat prévisionnel" value={formatMoney(stats.resultat_previsionnel)} tone={stats.resultat_previsionnel < 0 ? 'text-rose-700' : 'text-sky-800'} hint="Devis − dépenses" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Avancement</h3>
          <Progress label="Encaissement" value={stats.taux_encaissement} color={COLORS.avances} detail={`${formatMoney(stats.total_avances)} reçus`} />
          <Progress label="Consommation du devis" value={stats.taux_consommation} color={COLORS.charges} detail={`${formatMoney(stats.total_depenses)} dépensés`} />
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
            <div><p className="text-xs text-slate-500">Bons produits</p><p className="font-semibold tabular-nums" style={{ color: COLORS.products }}>{formatMoney(stats.total_products)}</p></div>
            <div><p className="text-xs text-slate-500">Bons charge</p><p className="font-semibold tabular-nums" style={{ color: COLORS.charges }}>{formatMoney(stats.total_charges)}</p></div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Avances par mode de paiement</h3>
          <div className="space-y-3">
            {modes.map(([mode, value]) => (
              <div key={mode}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-slate-700">{MODE_LABELS[mode]}</span><span className="font-medium tabular-nums text-slate-900">{formatMoney(value)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${(value / maxMode) * 100}%` }} /></div>
              </div>
            ))}
            <p className="pt-1 text-xs text-slate-500">{stats.nb_avances} avance(s) au total.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Évolution mensuelle</h3>
        {monthly.length ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="avances" name="Avances" fill={COLORS.avances} radius={[4, 4, 0, 0]} />
                <Bar dataKey="products" name="Bons produits" fill={COLORS.products} radius={[4, 4, 0, 0]} />
                <Bar dataKey="charges" name="Bons charge" fill={COLORS.charges} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Pas encore de mouvements à afficher.</p>
        )}
      </div>
    </section>
  );
};

export default StatsTab;
