import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Search, Users, Phone, Mail, MapPin, Building2,
  ChevronLeft, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown,
  FileText, CreditCard, RotateCcw, Calendar, Hash, ArrowLeft,
  Package, Printer, ShoppingCart,
} from 'lucide-react';
import { useGetFournisseursQuery, useGetContactHistoryQuery, useGetContactQuery } from '../store/api/contactsApi';
import type { ContactsSortBy, SortDirection } from '../store/api/contactsApi';
import type { Contact } from '../types';
import ContactPrintModal from '../components/ContactPrintModal';

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(isNaN(v) ? 0 : v) + ' MAD';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const STATUT_COLORS: Record<string, string> = {
  Validé: 'bg-green-100 text-green-700',
  Livré: 'bg-blue-100 text-blue-700',
  Payé: 'bg-emerald-100 text-emerald-700',
  Annulé: 'bg-red-100 text-red-700',
  Avoir: 'bg-orange-100 text-orange-700',
  Appliqué: 'bg-purple-100 text-purple-700',
  'En attente': 'bg-yellow-100 text-yellow-700',
};
const statutColor = (s: string) => STATUT_COLORS[s] ?? 'bg-gray-100 text-gray-600';

const MODE_COLORS: Record<string, string> = {
  Espèces: 'bg-green-100 text-green-700',
  Chèque: 'bg-blue-100 text-blue-700',
  Traite: 'bg-purple-100 text-purple-700',
  Virement: 'bg-indigo-100 text-indigo-700',
  Remise: 'bg-orange-100 text-orange-700',
};
const modeColor = (m: string) => MODE_COLORS[m] ?? 'bg-gray-100 text-gray-600';

const EXCLUDED = new Set(['Annulé', 'Annule', 'Supprimé', 'Supprime', 'Brouillon', 'Refusé', 'Refuse', 'Expiré', 'Expire']);

// ─── Empty state ─────────────────────────────────────────────────────────────

const Empty: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
      {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6 text-gray-300' })}
    </div>
    <p className="text-sm">{label}</p>
  </div>
);

// ─── BonTable ────────────────────────────────────────────────────────────────

interface BonTableProps {
  bons: any[];
  detail: boolean;
  prefix: string;
  accentClass: string;
  hoverClass: string;
  itemBorderClass?: string;
}

const BonTable: React.FC<BonTableProps> = ({ bons, detail, prefix, accentClass, hoverClass, itemBorderClass = 'border-violet-200' }) => {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
        <tr>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">N°</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
          {detail && <th className="text-left px-4 py-3 font-semibold text-gray-600">Désignation</th>}
          {detail && <th className="text-center px-3 py-3 font-semibold text-gray-600">Qté</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600">Prix unit.</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600">Remise</th>}
          <th className="text-right px-4 py-3 font-semibold text-gray-600">{detail ? 'Total ligne' : 'Montant'}</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {bons.map(b => {
          const items: any[] = Array.isArray(b.items) ? b.items.filter((i: any) => i && i.id) : [];
          const bonNum = b.numero ?? `${prefix}${String(b.id).padStart(2, '0')}`;

          if (!detail) {
            return (
              <tr key={b.id} className={`${hoverClass} transition-colors`}>
                <td className={`px-4 py-3 font-mono font-medium ${accentClass}`}>{bonNum}</td>
                <td className="px-4 py-3 text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />{fmtDate(b.date_creation)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(b.montant_total ?? 0)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
            );
          }

          if (items.length === 0) {
            return (
              <tr key={b.id} className={`${hoverClass} transition-colors`}>
                <td className={`px-4 py-2.5 font-mono font-medium ${accentClass}`}>{bonNum}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" />{fmtDate(b.date_creation)}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-400 text-xs italic" colSpan={4}>—</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(b.montant_total ?? 0)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
            );
          }

          return (
            <React.Fragment key={b.id}>
              {items.map((item: any, iIdx: number) => {
                const qte = Number(item.quantite ?? 0);
                const pu = Number(item.prix_unitaire ?? item.prix_achat ?? 0);
                const remisePct = Number(item.remise_pourcentage ?? 0);
                const remiseMnt = Number(item.remise_montant ?? 0);
                const total = Number(item.total ?? (qte * pu));
                const hasRemise = remisePct > 0 || remiseMnt > 0;
                return (
                  <tr key={`${b.id}-item-${iIdx}`} className={`bg-gray-50/60 border-l-4 ${itemBorderClass} ${hoverClass}/40 transition-colors`}>
                    <td className={`px-4 py-2 font-mono text-xs font-semibold ${accentClass}`}>{bonNum}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-800 font-medium">
                          {item.designation ?? item.product_designation ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-semibold text-gray-700">{qte}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600">{fmt(pu)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {hasRemise
                        ? <span className="text-orange-500 font-medium">{remisePct > 0 ? `${remisePct}%` : fmt(remiseMnt)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">{fmt(total)}</td>
                    <td className="px-4 py-2">
                      {iIdx === 0
                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                        : null}
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
      </tbody>
      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
        <tr>
          <td colSpan={detail ? 6 : 2} className="px-4 py-2.5 text-sm font-semibold text-gray-600">Total</td>
          <td className="px-4 py-2.5 text-right font-bold text-gray-900">
            {fmt(bons.reduce((s: number, b: any) => s + (b.montant_total ?? 0), 0))}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
};

// ─── Solde cumulé fournisseur ─────────────────────────────────────────────────
// Convention Fournisseur :
//   commande      → débit  (+)  on doit plus au fournisseur
//   avoirFournisseur → crédit (-)  le fournisseur nous restitue
//   paiement      → crédit (-)  on règle notre dette

type CompletRow =
  | { kind: 'commande' | 'avoirFournisseur'; date: number; data: any }
  | { kind: 'paiement'; date: number; data: any };

function buildCompletRows(history: any): CompletRow[] {
  const rows: CompletRow[] = [
    ...(history?.commandes ?? [])
      .filter((b: any) => !EXCLUDED.has(b.statut ?? ''))
      .map((d: any) => ({ kind: 'commande' as const, date: new Date(d.date_creation).getTime(), data: d })),
    ...(history?.avoirsFournisseur ?? [])
      .filter((b: any) => !EXCLUDED.has(b.statut ?? ''))
      .map((d: any) => ({ kind: 'avoirFournisseur' as const, date: new Date(d.date_creation).getTime(), data: d })),
    ...(history?.payments ?? [])
      .filter((p: any) => !EXCLUDED.has(p.statut ?? ''))
      .map((p: any) => ({ kind: 'paiement' as const, date: new Date(p.date_paiement || p.created_at).getTime(), data: p })),
  ];
  return rows.sort((a, b) => a.date - b.date);
}

function safeNum(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function buildSoldeCumule(rows: CompletRow[], soldeInitial: number): Map<string, number> {
  const result = new Map<string, number>();
  let running = isNaN(soldeInitial) ? 0 : soldeInitial;
  for (const row of rows) {
    const montant = safeNum(row.data.montant_total ?? row.data.montant ?? 0);
    if (row.kind === 'commande') {
      running += montant;
    } else {
      running -= montant;
    }
    result.set(`${row.kind}-${row.data.id}`, running);
  }
  return result;
}

function buildSoldeCumuleDetail(rows: CompletRow[], soldeInitial: number): Map<string, number> {
  const result = new Map<string, number>();
  let running = isNaN(soldeInitial) ? 0 : soldeInitial;
  for (const row of rows) {
    if (row.kind === 'paiement') {
      const montant = safeNum(row.data.montant_total ?? row.data.montant ?? 0);
      running -= montant;
      result.set(`paiement-${row.data.id}`, running);
    } else {
      const items: any[] = Array.isArray(row.data.items) ? row.data.items.filter((i: any) => i && i.id) : [];
      if (items.length === 0) {
        const montant = safeNum(row.data.montant_total ?? row.data.montant ?? 0);
        if (row.kind === 'commande') running += montant;
        else running -= montant;
        result.set(`${row.kind}-${row.data.id}-item-0`, running);
      } else {
        const bonMontant = safeNum(row.data.montant_total ?? row.data.montant ?? 0);
        const itemsSum = items.reduce((s: number, i: any) => {
          return s + safeNum(i.total ?? (safeNum(i.quantite) * safeNum(i.prix_unitaire ?? i.prix_achat ?? 0)));
        }, 0);
        items.forEach((item: any, iIdx: number) => {
          const rawTotal = safeNum(item.total ?? (safeNum(item.quantite) * safeNum(item.prix_unitaire ?? item.prix_achat ?? 0)));
          const total = itemsSum === 0
            ? (iIdx === items.length - 1 ? bonMontant : 0)
            : rawTotal;
          if (row.kind === 'commande') running += total;
          else running -= total;
          result.set(`${row.kind}-${row.data.id}-item-${iIdx}`, running);
        });
      }
    }
  }
  return result;
}

function computeFinalSoldeCumule(history: any, soldeInitial: number): number {
  const rows = buildCompletRows(history);
  if (rows.length === 0) return soldeInitial;
  const map = buildSoldeCumuleDetail(rows, soldeInitial);
  const last = rows[rows.length - 1];
  if (last.kind === 'paiement') {
    return map.get(`paiement-${last.data.id}`) ?? soldeInitial;
  }
  const items: any[] = Array.isArray(last.data.items) ? last.data.items.filter((i: any) => i && i.id) : [];
  const lastIdx = items.length > 0 ? items.length - 1 : 0;
  return map.get(`${last.kind}-${last.data.id}-item-${lastIdx}`) ?? soldeInitial;
}

// ─── CompletTable ─────────────────────────────────────────────────────────────

interface CompletTableProps {
  rows: CompletRow[];
  detail: boolean;
  soldeInitial: number;
  visibleIds?: Set<string>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
}

const BON_META: Record<string, { label: string; badgeClass: string; accentClass: string; hoverClass: string; itemBorderClass: string; prefix: string }> = {
  commande:         { label: 'Commande',        badgeClass: 'bg-violet-100 text-violet-700', accentClass: 'text-violet-700', hoverClass: 'hover:bg-violet-50', itemBorderClass: 'border-violet-200', prefix: 'CMD' },
  avoirFournisseur: { label: 'Avoir Fourn.',    badgeClass: 'bg-orange-100 text-orange-700', accentClass: 'text-orange-700', hoverClass: 'hover:bg-orange-50', itemBorderClass: 'border-orange-200', prefix: 'AVF' },
};

const CompletTable: React.FC<CompletTableProps> = ({ rows, detail, soldeInitial, visibleIds, selectedIds, onToggleSelect, onToggleAll }) => {
  const selectionMode = !!onToggleSelect;
  const soldeCumuleMap = useMemo(
    () => detail ? buildSoldeCumuleDetail(rows, soldeInitial) : buildSoldeCumule(rows, soldeInitial),
    [rows, soldeInitial, detail]
  );

  const visibleRowIds = useMemo(() => {
    return rows
      .filter(r => !visibleIds || visibleIds.has(`${r.kind}-${r.data.id}`))
      .map(r => `${r.kind}-${r.data.id}`);
  }, [rows, visibleIds]);

  const allVisibleSelected = selectionMode && visibleRowIds.length > 0 && visibleRowIds.every(id => selectedIds?.has(id));

  const fmtSolde = (v: number) => {
    const color = v < 0 ? 'text-green-600' : v > 0 ? 'text-red-600' : 'text-gray-500';
    return <span className={`font-bold text-xs ${color}`}>{fmt(v)}</span>;
  };

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
        <tr>
          {selectionMode && (
            <th className="px-3 py-3 w-8">
              <input type="checkbox" checked={allVisibleSelected} onChange={() => onToggleAll?.(visibleRowIds)}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 cursor-pointer" />
            </th>
          )}
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">N°</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600">Désignation</th>}
          {detail && <th className="text-center px-3 py-3 font-semibold text-gray-600">Qté</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600">Prix unit.</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600">Remise</th>}
          <th className="text-left px-4 py-3 font-semibold text-gray-600">RIB / Réf</th>
          <th className="text-right px-4 py-3 font-semibold text-gray-600">{detail ? 'Total ligne' : 'Montant'}</th>
          <th className="text-right px-4 py-3 font-semibold text-gray-600 bg-yellow-50 border-l border-yellow-200">Solde cumulé</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut / Mode</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        <tr className="bg-yellow-50 border-l-4 border-yellow-400">
          {selectionMode && <td />}
          <td className="px-4 py-2.5">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-yellow-100 text-yellow-700">Solde initial</span>
          </td>
          <td className="px-4 py-2.5 text-yellow-700 font-mono text-xs font-medium">—</td>
          <td className="px-4 py-2.5 text-gray-400 text-xs">—</td>
          {detail && <><td /><td /><td /><td /></>}
          <td className="px-4 py-2.5 text-gray-300 text-xs">—</td>
          <td className="px-4 py-2.5 text-right font-bold text-yellow-700">{fmt(soldeInitial)}</td>
          <td className="px-4 py-2.5 text-right bg-yellow-100 border-l border-yellow-200">{fmtSolde(soldeInitial)}</td>
          <td className="px-4 py-2.5 text-xs text-gray-400">Solde de départ</td>
        </tr>

        {rows.map((row, idx) => {
          const rowId = `${row.kind}-${row.data.id}`;
          if (visibleIds && !visibleIds.has(rowId)) return null;
          const isSelected = selectedIds?.has(rowId) ?? false;
          const rowBg = isSelected ? 'bg-violet-50' : '';

          if (row.kind === 'paiement') {
            const p = row.data;
            const rib = p.code_reglement || p.reference_virement || p.reference || null;
            return (
              <tr key={`pay-${p.id}-${idx}`} className={`hover:bg-green-50 transition-colors ${rowBg}`}>
                {selectionMode && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 cursor-pointer" />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">Paiement</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-green-700 font-medium text-xs">
                  {p.numero ?? `PAY${String(p.id).padStart(3, '0')}`}
                </td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(p.date_paiement)}</span>
                  {p.date_echeance && <span className="text-gray-400 ml-4 block">Éch: {fmtDate(p.date_echeance)}</span>}
                </td>
                {detail && <td colSpan={4} />}
                <td className="px-4 py-2.5 text-xs">
                  {rib ? <span className="flex items-center gap-1 font-mono text-gray-700"><Hash className="w-3 h-3 text-gray-400" />{rib}</span>
                       : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-green-700">
                  {fmt(Number(p.montant_total ?? p.montant ?? 0))}
                </td>
                <td className="px-4 py-2.5 text-right bg-yellow-50 border-l border-yellow-200">
                  {fmtSolde(soldeCumuleMap.get(`paiement-${p.id}`) ?? 0)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeColor(p.mode_paiement ?? '')}`}>{p.mode_paiement ?? '—'}</span>
                </td>
              </tr>
            );
          }

          const b = row.data;
          const meta = BON_META[row.kind];
          const bonKey = `${row.kind}-${b.id}`;
          const items: any[] = Array.isArray(b.items) ? b.items.filter((i: any) => i && i.id) : [];
          const bonNum = b.numero ?? `${meta.prefix}${String(b.id).padStart(2, '0')}`;

          if (!detail) {
            return (
              <tr key={`${bonKey}-${idx}`} className={`${meta.hoverClass} transition-colors ${rowBg}`}>
                {selectionMode && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 cursor-pointer" />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`}>{meta.label}</span>
                </td>
                <td className={`px-4 py-2.5 font-mono font-medium text-xs ${meta.accentClass}`}>{bonNum}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-300 text-xs">—</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(b.montant_total ?? 0)}</td>
                <td className="px-4 py-2.5 text-right bg-yellow-50 border-l border-yellow-200">
                  {fmtSolde(soldeCumuleMap.get(bonKey) ?? 0)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
            );
          }

          if (items.length === 0) {
            return (
              <tr key={`${bonKey}-${idx}`} className={`${meta.hoverClass} transition-colors ${rowBg}`}>
                {selectionMode && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 cursor-pointer" />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`}>{meta.label}</span>
                </td>
                <td className={`px-4 py-2.5 font-mono font-medium text-xs ${meta.accentClass}`}>{bonNum}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-400 text-xs italic" colSpan={4}>—</td>
                <td className="px-4 py-2.5 text-gray-300 text-xs">—</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(b.montant_total ?? 0)}</td>
                <td className="px-4 py-2.5 text-right bg-yellow-50 border-l border-yellow-200">
                  {fmtSolde(soldeCumuleMap.get(`${bonKey}-item-0`) ?? 0)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
            );
          }

          return (
            <React.Fragment key={`${bonKey}-${idx}`}>
              {items.map((item: any, iIdx: number) => {
                const qte = Number(item.quantite ?? 0);
                const pu = Number(item.prix_unitaire ?? item.prix_achat ?? 0);
                const remisePct = Number(item.remise_pourcentage ?? 0);
                const remiseMnt = Number(item.remise_montant ?? 0);
                const total = Number(item.total ?? (qte * pu));
                const hasRemise = remisePct > 0 || remiseMnt > 0;
                const itemSoldeKey = `${bonKey}-item-${iIdx}`;
                return (
                  <tr key={`${bonKey}-item-${iIdx}`} className={`bg-gray-50/60 border-l-4 ${meta.itemBorderClass} transition-colors ${meta.hoverClass}/40 ${isSelected ? '!bg-violet-50/60' : ''}`}>
                    {selectionMode && (
                      <td className="px-3 py-2">
                        {iIdx === 0 && (
                          <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                            className="w-4 h-4 rounded border-gray-300 text-violet-600 cursor-pointer" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`}>{meta.label}</span>
                    </td>
                    <td className={`px-4 py-2 font-mono text-xs font-semibold ${meta.accentClass}`}>{bonNum}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-800 font-medium">
                          {item.designation ?? item.product_designation ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-semibold text-gray-700">{qte}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600">{fmt(pu)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {hasRemise
                        ? <span className="text-orange-500 font-medium">{remisePct > 0 ? `${remisePct}%` : fmt(remiseMnt)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-300 text-xs">—</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">{fmt(total)}</td>
                    <td className="px-4 py-2 text-right bg-yellow-50/70 border-l border-yellow-100">
                      {fmtSolde(soldeCumuleMap.get(itemSoldeKey) ?? 0)}
                    </td>
                    <td className="px-4 py-2">
                      {iIdx === 0
                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                        : null}
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

// ─── Fournisseur detail page ──────────────────────────────────────────────────

type PageTab = 'complet' | 'commandes' | 'avoirs' | 'paiements';

const FournisseurDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fournisseurId = Number(id);

  const [tab, setTab] = useState<PageTab>('complet');
  const [detail, setDetail] = useState(true);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const { data: contact, isLoading: loadingContact } = useGetContactQuery(fournisseurId);
  const { data: history, isLoading: loadingHistory } = useGetContactHistoryQuery({ id: fournisseurId, limit: 30000 });
  const isLoading = loadingContact || loadingHistory;

  const inDateRange = (dateStr: string | undefined | null): boolean => {
    if (!filterFrom && !filterTo) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr).getTime();
    if (isNaN(d)) return false;
    if (filterFrom && d < new Date(filterFrom).getTime()) return false;
    if (filterTo && d > new Date(filterTo + 'T23:59:59').getTime()) return false;
    return true;
  };

  const [paySort, setPaySort] = useState<{ col: 'date' | 'montant' | 'rib'; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'asc' });
  const togglePaySort = (col: typeof paySort.col) =>
    setPaySort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const commandes = useMemo(() =>
    (history?.commandes ?? [])
      .filter((b: any) => !EXCLUDED.has(b.statut ?? '') && inDateRange(b.date_creation))
      .sort((a: any, b: any) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime()),
    [history, filterFrom, filterTo]);

  const avoirs = useMemo(() =>
    (history?.avoirsFournisseur ?? [])
      .filter((b: any) => !EXCLUDED.has(b.statut ?? '') && inDateRange(b.date_creation))
      .sort((a: any, b: any) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime()),
    [history, filterFrom, filterTo]);

  const paiements = useMemo(() => {
    const raw = (history?.payments ?? []).filter((p: any) => !EXCLUDED.has(p.statut ?? '') && inDateRange(p.date_paiement || p.created_at));
    return raw.sort((a: any, b: any) => {
      let va: any, vb: any;
      if (paySort.col === 'date') {
        va = new Date(a.date_paiement || a.created_at).getTime();
        vb = new Date(b.date_paiement || b.created_at).getTime();
      } else if (paySort.col === 'montant') {
        va = Number(a.montant_total ?? a.montant ?? 0);
        vb = Number(b.montant_total ?? b.montant ?? 0);
      } else {
        va = (a.code_reglement || a.reference_virement || '').toLowerCase();
        vb = (b.code_reglement || b.reference_virement || '').toLowerCase();
      }
      return paySort.dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [history, paySort, filterFrom, filterTo]);

  const completRows = useMemo(() => buildCompletRows(history), [history]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: string[]) => {
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const visibleIds = useMemo<Set<string> | undefined>(() => {
    if (!filterFrom && !filterTo) return undefined;
    const s = new Set<string>();
    for (const row of completRows) {
      const dateStr = row.kind === 'paiement'
        ? (row.data.date_paiement || row.data.created_at)
        : row.data.date_creation;
      if (inDateRange(dateStr)) s.add(`${row.kind}-${row.data.id}`);
    }
    return s;
  }, [completRows, filterFrom, filterTo]);

  const PaySortIcon = ({ col }: { col: typeof paySort.col }) =>
    paySort.col !== col
      ? <ChevronsUpDown className="w-3.5 h-3.5 inline ml-1 text-gray-400" />
      : paySort.dir === 'asc'
        ? <ArrowUp className="w-3.5 h-3.5 inline ml-1 text-violet-600" />
        : <ArrowDown className="w-3.5 h-3.5 inline ml-1 text-violet-600" />;

  const nomDisplay = contact?.nom_complet || contact?.societe || `Fournisseur #${fournisseurId}`;
  const initial = nomDisplay.charAt(0).toUpperCase();
  const solde: number = contact?.solde ?? 0;

  const showDetail = tab !== 'paiements';

  const tabs: { id: PageTab; label: string; count: number }[] = [
    { id: 'complet',   label: 'Complet',            count: visibleIds ? visibleIds.size : completRows.length },
    { id: 'commandes', label: 'Bons Commande',       count: commandes.length },
    { id: 'avoirs',    label: 'Avoirs Fournisseur',  count: avoirs.length },
    { id: 'paiements', label: 'Paiements',           count: paiements.length },
  ];

  const [printOpen, setPrintOpen] = useState(false);

  const printProductHistory = useMemo(() => {
    if (!history || !contact) return [];
    const allRows = buildCompletRows(history);
    const soldeCumuleMap = buildSoldeCumuleDetail(allRows, contact.solde ?? 0);
    const rows = allRows.filter(row => {
      const dateStr = row.kind === 'paiement'
        ? (row.data.date_paiement || row.data.created_at)
        : row.data.date_creation;
      if (filterFrom || filterTo) {
        if (!inDateRange(dateStr)) return false;
      }
      if (selectedIds.size > 0) {
        if (!selectedIds.has(`${row.kind}-${row.data.id}`)) return false;
      }
      return true;
    });
    const result: any[] = [];

    rows.forEach((row: CompletRow) => {
      const { kind, data } = row;
      const bonKey = `${kind}-${data.id}`;
      const typeLabel = kind === 'commande' ? 'produit' : kind === 'avoirFournisseur' ? 'avoir' : 'paiement';
      const bonNum = data.numero ?? `${kind === 'commande' ? 'CMD' : kind === 'avoirFournisseur' ? 'AVF' : 'PAY'}${String(data.id).padStart(2, '0')}`;
      const dateIso = data.date_creation ?? data.date_paiement ?? '';

      if (kind === 'paiement') {
        result.push({
          id: `${bonKey}-item-0`,
          bon_numero: bonNum,
          bon_date: dateIso,
          bon_date_iso: dateIso,
          product_reference: '',
          product_designation: data.mode_paiement ?? 'Paiement',
          code_reglement: data.code_reglement || data.reference_virement || data.reference || null,
          quantite: 0,
          prix_unitaire: 0,
          total: Number(data.montant_total ?? data.montant ?? 0),
          bon_statut: data.statut ?? '',
          soldeCumulatif: soldeCumuleMap.get(`paiement-${data.id}`) ?? 0,
          type: 'paiement',
        });
        return;
      }

      const items: any[] = Array.isArray(data.items) ? data.items.filter((i: any) => i?.id) : [];
      if (items.length === 0) {
        result.push({
          id: `${bonKey}-item-0`,
          bon_numero: bonNum,
          bon_date: dateIso,
          bon_date_iso: dateIso,
          product_reference: '',
          product_designation: '—',
          quantite: 0,
          prix_unitaire: 0,
          total: Number(data.montant_total ?? 0),
          bon_statut: data.statut ?? '',
          soldeCumulatif: soldeCumuleMap.get(`${kind}-${data.id}-item-0`) ?? 0,
          type: typeLabel,
        });
        return;
      }

      items.forEach((item: any, iIdx: number) => {
        const qte = Number(item.quantite ?? 0);
        const pu = Number(item.prix_unitaire ?? item.prix_achat ?? 0);
        const total = Number(item.total ?? (qte * pu));
        result.push({
          id: `${bonKey}-item-${iIdx}`,
          bon_numero: bonNum,
          bon_date: dateIso,
          bon_date_iso: dateIso,
          product_reference: item.reference ?? item.product_reference ?? '',
          product_designation: item.designation ?? item.product_designation ?? '—',
          quantite: qte,
          prix_unitaire: pu,
          total,
          bon_statut: data.statut ?? '',
          soldeCumulatif: soldeCumuleMap.get(`${kind}-${data.id}-item-${iIdx}`) ?? 0,
          type: typeLabel,
        });
      });
    });

    return result;
  }, [history, contact, filterFrom, filterTo, selectedIds]);

  const printTotals = useMemo(() => {
    if (!history || !contact) return { totalQty: 0, totalAmount: 0, finalSolde: 0, totalDebit: 0, totalCredit: 0 };
    const allCommandes = (history.commandes ?? []).filter((b: any) => !EXCLUDED.has(b.statut ?? ''));
    const allAvoirs = (history.avoirsFournisseur ?? []).filter((b: any) => !EXCLUDED.has(b.statut ?? ''));
    const allPaiements = (history.payments ?? []).filter((p: any) => !EXCLUDED.has(p.statut ?? ''));
    const totalAchats = allCommandes.reduce((s: number, b: any) => s + Number(b.montant_total ?? 0), 0);
    const totalPaiements = allPaiements.reduce((s: number, p: any) => s + Number(p.montant_total ?? p.montant ?? 0), 0);
    const totalAvoirs = allAvoirs.reduce((s: number, b: any) => s + Number(b.montant_total ?? 0), 0);
    const totalQty = printProductHistory
      .filter((r: any) => r.type === 'produit' && Number(r.quantite) > 0)
      .reduce((s: number, r: any) => s + Number(r.quantite ?? 0), 0);
    return {
      totalQty,
      totalAmount: totalAchats,
      finalSolde: computeFinalSoldeCumule(history, contact.solde ?? 0),
      totalDebit: totalAchats + Math.abs(contact.solde ?? 0),
      totalCredit: totalPaiements + totalAvoirs,
    };
  }, [history, contact, printProductHistory]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/fournisseurs')}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-violet-600">{initial}</span>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{nomDisplay}</h1>
          {contact?.societe && contact?.nom_complet && (
            <p className="text-sm text-gray-500">{contact.societe}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Solde</p>
          <p className={`font-bold text-base ${solde < 0 ? 'text-red-600' : solde > 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {fmt(solde)}
          </p>
        </div>
        <button
          onClick={() => setPrintOpen(true)}
          disabled={isLoading || !history}
          className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          {selectedIds.size > 0 ? `Imprimer sélection (${selectedIds.size})` : 'Imprimer'}
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1"
            title="Effacer la sélection"
          >✕</button>
        )}
      </div>

      {/* Tabs + filtre date + checkbox détail */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center border-b border-gray-200 overflow-x-auto">
          <div className="flex flex-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-violet-600 text-violet-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === t.id ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filtre date */}
          <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-l border-gray-100">
            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 w-[120px]"
            />
            <span className="text-gray-400 text-xs">—</span>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 w-[120px]"
            />
            {(filterFrom || filterTo) && (
              <button
                onClick={() => { setFilterFrom(''); setFilterTo(''); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors px-0.5"
              >✕</button>
            )}
          </div>

          {showDetail && (
            <label className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none flex-shrink-0 border-l border-gray-100">
              <input
                type="checkbox"
                checked={detail}
                onChange={e => setDetail(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-600">Détail</span>
            </label>
          )}
        </div>

        <div className="overflow-x-auto">

          {/* ── Complet ── */}
          {tab === 'complet' && (
            completRows.length === 0
              ? <Empty icon={<FileText />} label="Aucune opération" />
              : <CompletTable
                  rows={completRows}
                  detail={detail}
                  soldeInitial={contact?.solde ?? 0}
                  visibleIds={visibleIds}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onToggleAll={toggleAll}
                />
          )}

          {/* ── Bons Commande ── */}
          {tab === 'commandes' && (
            commandes.length === 0
              ? <Empty icon={<ShoppingCart />} label="Aucun bon commande" />
              : <BonTable bons={commandes} detail={detail} prefix="CMD" accentClass="text-violet-700" hoverClass="hover:bg-violet-50" itemBorderClass="border-violet-200" />
          )}

          {/* ── Avoirs Fournisseur ── */}
          {tab === 'avoirs' && (
            avoirs.length === 0
              ? <Empty icon={<RotateCcw />} label="Aucun avoir fournisseur" />
              : <BonTable bons={avoirs} detail={detail} prefix="AVF" accentClass="text-orange-700" hoverClass="hover:bg-orange-50" itemBorderClass="border-orange-200" />
          )}

          {/* ── Paiements ── */}
          {tab === 'paiements' && (
            paiements.length === 0
              ? <Empty icon={<CreditCard />} label="Aucun paiement" />
              : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">N°</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-violet-600" onClick={() => togglePaySort('date')}>
                        Date <PaySortIcon col="date" />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Mode</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-violet-600" onClick={() => togglePaySort('rib')}>
                        RIB / Réf <PaySortIcon col="rib" />
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-violet-600" onClick={() => togglePaySort('montant')}>
                        Montant <PaySortIcon col="montant" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paiements.map((p: any) => {
                      const rib = p.code_reglement || p.reference_virement || p.reference || null;
                      return (
                        <tr key={p.id} className="hover:bg-green-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-green-700 font-medium text-xs">{p.numero ?? `PAY${String(p.id).padStart(3, '0')}`}</td>
                          <td className="px-4 py-3 text-gray-600">
                            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />{fmtDate(p.date_paiement)}</span>
                            {p.date_echeance && <span className="text-xs text-gray-400 ml-5 block">Échéance: {fmtDate(p.date_echeance)}</span>}
                          </td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeColor(p.mode_paiement ?? '')}`}>{p.mode_paiement ?? '—'}</span></td>
                          <td className="px-4 py-3">
                            {rib ? <span className="flex items-center gap-1.5 text-gray-700 font-mono text-xs"><Hash className="w-3 h-3 text-gray-400" />{rib}</span>
                                 : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(Number(p.montant_total ?? p.montant ?? 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-gray-600">Total</td>
                      <td className="px-4 py-2 text-right font-bold text-green-700">
                        {fmt(paiements.reduce((s: number, p: any) => s + Number(p.montant_total ?? p.montant ?? 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )
          )}

        </div>
      </div>

      {printOpen && contact && (
        <ContactPrintModal
          isOpen={printOpen}
          onClose={() => setPrintOpen(false)}
          contact={contact}
          mode="products"
          transactions={[]}
          productHistory={printProductHistory}
          dateFrom={filterFrom || undefined}
          dateTo={filterTo || undefined}
          skipInitialRow={!!filterFrom || selectedIds.size > 0}
          hideCumulative={false}
          totalQty={printTotals.totalQty}
          totalAmount={printTotals.totalAmount}
          finalSolde={printTotals.finalSolde}
          totalDebit={printTotals.totalDebit}
          totalCredit={printTotals.totalCredit}
        />
      )}

    </div>
  );
};

// ─── Cellule solde cumulé fournisseur ────────────────────────────────────────

const FournisseurSoldeCumuleCell: React.FC<{ fournisseurId: number; soldeInitial: number }> = ({ fournisseurId, soldeInitial }) => {
  const { data: history, isLoading } = useGetContactHistoryQuery({ id: fournisseurId, limit: 30000 });

  const soldeFinal = useMemo(() => {
    if (!history) return null;
    return computeFinalSoldeCumule(history, isNaN(soldeInitial) ? 0 : soldeInitial);
  }, [history, soldeInitial]);

  if (isLoading) return <span className="inline-block w-20 h-4 bg-gray-200 rounded animate-pulse" />;
  if (soldeFinal === null) return <span className="text-gray-300 text-xs">—</span>;

  const color = soldeFinal > 0 ? 'text-red-600' : soldeFinal < 0 ? 'text-green-600' : 'text-gray-500';
  return <span className={`font-bold text-sm ${color}`}>{fmt(soldeFinal)}</span>;
};

// ─── Liste fournisseurs ───────────────────────────────────────────────────────

const FournisseursListPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<ContactsSortBy>('nom');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { setDebouncedSearch(val); setCurrentPage(1); }, 400);
  };

  const { data, isLoading, isFetching } = useGetFournisseursQuery({
    page: currentPage, limit: itemsPerPage,
    search: debouncedSearch || undefined,
    sortBy, sortDir,
  });

  const fournisseurs = data?.data ?? [];
  const totalPages = data?.pagination?.totalPages ?? 0;
  const total = data?.pagination?.total ?? 0;

  const handleSort = (col: ContactsSortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: ContactsSortBy }) =>
    sortBy !== col
      ? <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 inline ml-1" />
      : sortDir === 'asc'
        ? <ArrowUp className="w-3.5 h-3.5 text-violet-600 inline ml-1" />
        : <ArrowDown className="w-3.5 h-3.5 text-violet-600 inline ml-1" />;

  const pageNumbers = () => {
    const pages: number[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else if (currentPage <= 4) pages.push(1, 2, 3, 4, 5, -1, totalPages);
    else if (currentPage >= totalPages - 3) pages.push(1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    else pages.push(1, -1, currentPage - 1, currentPage, currentPage + 1, -2, totalPages);
    return pages;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-100 rounded-lg"><Users className="w-6 h-6 text-violet-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-sm text-gray-500">{total} fournisseur{total !== 1 ? 's' : ''} au total</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => handleSearchChange(e.target.value)}
            placeholder="Rechercher par nom, société, tél..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Par page :</span>
          <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            {ITEMS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-12">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-16">ID</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-violet-600" onClick={() => handleSort('nom')}>
                  Nom complet <SortIcon col="nom" />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-violet-600" onClick={() => handleSort('societe')}>
                  Société <SortIcon col="societe" />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-violet-600" onClick={() => handleSort('solde')}>
                  Solde <SortIcon col="solde" />
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 bg-yellow-50 border-l border-yellow-200">
                  Total cumulé
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading || isFetching
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                : fournisseurs.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-14 text-center text-gray-400">
                      <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" /><p>Aucun fournisseur trouvé</p>
                    </td></tr>
                  : fournisseurs.map((f: Contact, idx: number) => (
                      <tr key={f.id} className="hover:bg-violet-50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/fournisseurs/${f.id}`)}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{f.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-violet-600">
                                {(f.nom_complet || f.societe || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 leading-tight">{f.nom_complet}</p>
                              {f.reference && <p className="text-xs text-gray-400">Réf: {f.reference}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {f.societe
                            ? <div className="flex items-center gap-1.5 text-gray-700"><Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />{f.societe}</div>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {f.telephone && <div className="flex items-center gap-1.5 text-gray-600 text-xs"><Phone className="w-3 h-3 text-gray-400" />{f.telephone}</div>}
                            {f.email && <div className="flex items-center gap-1.5 text-gray-600 text-xs"><Mail className="w-3 h-3 text-gray-400" /><span className="truncate max-w-[160px]">{f.email}</span></div>}
                            {!f.telephone && !f.email && <span className="text-gray-300 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {f.adresse
                            ? <div className="flex items-center gap-1.5 text-gray-600 text-xs"><MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" /><span className="truncate max-w-[180px]">{f.adresse}</span></div>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold text-sm ${f.solde < 0 ? 'text-red-600' : f.solde > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                            {fmt(f.solde)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right bg-yellow-50/60 border-l border-yellow-100">
                          {(f as any).total_cumule !== null && (f as any).total_cumule !== undefined
                            ? <span className={`font-bold text-sm ${(f as any).total_cumule > 0 ? 'text-red-600' : (f as any).total_cumule < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                {fmt((f as any).total_cumule)}
                              </span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-gray-500">
            Affichage {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, total)} sur {total}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {pageNumbers().map((p, i) =>
              p < 0
                ? <span key={`e${i}`} className="px-2 text-gray-400">…</span>
                : <button key={p} onClick={() => setCurrentPage(p)}
                    className={`min-w-[36px] h-9 px-2 rounded-md border text-sm font-medium transition-colors ${currentPage === p ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    {p}
                  </button>
            )}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export { FournisseurDetailPage };
export default FournisseursListPage;
