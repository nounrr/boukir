import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Package, Plus, Trash2 } from 'lucide-react';
import { useSearchBonProductsQuery } from '../../store/api/productsApi';
import type { Product, ProductUnit, ProductVariant } from '../../types';
import { formatMoney, iconButton, inputClass } from './shared';

export interface EditableLine {
  key: string;
  designation: string;
  unite: string;
  quantite: string;
  prix_unitaire: string;
  product_id: number | null;
  variant_id: number | null;
  unit_id: number | null;
  // Produit sélectionné (seulement en mémoire, pour proposer variantes et unités).
  product?: Product | null;
}

let lineSeq = 0;
export const newLine = (partial: Partial<EditableLine> = {}): EditableLine => ({
  key: `l${(lineSeq += 1)}`,
  designation: '',
  unite: '',
  quantite: '1',
  prix_unitaire: '',
  product_id: null,
  variant_id: null,
  unit_id: null,
  product: null,
  ...partial,
});

export const toNumber = (value: string) => {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
export const lineTotal = (line: EditableLine) => Math.round(toNumber(line.quantite) * toNumber(line.prix_unitaire) * 100) / 100;
export const linesTotal = (lines: EditableLine[]) => Math.round(lines.reduce((sum, l) => sum + lineTotal(l), 0) * 100) / 100;

const parseList = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value.filter(Boolean) as T[];
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(Boolean) : []; } catch { return []; }
  }
  return [];
};
const variantsOf = (p?: Product | null) => parseList<ProductVariant>(p?.variants);
const unitsOf = (p?: Product | null) => parseList<ProductUnit>(p?.units);

function priceFor(product: Product, variant: ProductVariant | null, unit: ProductUnit | null) {
  const base = Number(variant?.prix_vente || product.prix_vente || 0);
  if (!unit) return base;
  if (unit.prix_vente != null && Number(unit.prix_vente) > 0 && !variant) return Number(unit.prix_vente);
  return base * Number(unit.conversion_factor || 1);
}

const ProductSuggestions: React.FC<{ query: string; onPick: (product: Product) => void }> = ({ query, onPick }) => {
  const { data, isFetching } = useSearchBonProductsQuery({ q: query, limit: 12 }, { skip: query.trim().length < 2 });
  const products = data?.data ?? [];
  if (query.trim().length < 2) return null;
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
      {isFetching && <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Recherche…</div>}
      {!isFetching && !products.length && <div className="px-3 py-2 text-xs text-slate-500">Aucun produit — la ligne restera libre.</div>}
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onPick(p); }}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sky-50"
        >
          <span className="min-w-0 truncate"><span className="mr-1 text-xs text-slate-400">#{p.id}</span>{p.designation}</span>
          <span className="shrink-0 text-xs tabular-nums text-slate-500">{formatMoney(p.prix_vente)}</span>
        </button>
      ))}
    </div>
  );
};

const DesignationCell: React.FC<{
  line: EditableLine;
  withProducts: boolean;
  onChange: (patch: Partial<EditableLine>) => void;
}> = ({ line, withProducts, onChange }) => {
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(line.designation);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDebounced(line.designation), 250);
    return () => window.clearTimeout(timer.current);
  }, [line.designation]);

  const pick = (product: Product) => {
    const units = unitsOf(product);
    const unit = units.find((u) => u.is_default) ?? null;
    onChange({
      product,
      product_id: product.id,
      variant_id: null,
      unit_id: unit?.id ?? null,
      designation: product.designation,
      unite: unit?.unit_name ?? product.base_unit ?? '',
      prix_unitaire: String(Math.round(priceFor(product, null, unit) * 100) / 100),
    });
    setOpen(false);
  };

  const variants = variantsOf(line.product);
  return (
    <div className="relative min-w-[14rem]">
      <div className="relative">
        {withProducts && line.product_id && <Package className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-700" />}
        <input
          className={`${inputClass} ${withProducts && line.product_id ? 'pl-8' : ''}`}
          value={line.designation}
          placeholder={withProducts ? 'Rechercher un produit ou saisir…' : 'Désignation'}
          onChange={(e) => {
            onChange(withProducts
              ? { designation: e.target.value, product_id: null, variant_id: null, unit_id: null, product: null }
              : { designation: e.target.value });
            if (withProducts) setOpen(true);
          }}
          onFocus={() => withProducts && !line.product_id && setOpen(true)}
          onBlur={() => setOpen(false)}
          aria-label="Désignation"
        />
        {withProducts && open && !line.product_id && <ProductSuggestions query={debounced} onPick={pick} />}
      </div>
      {withProducts && line.product && variants.length > 0 && (
        <select
          className={`${inputClass} mt-1 py-1.5 text-xs`}
          value={line.variant_id ?? ''}
          aria-label="Variante"
          onChange={(e) => {
            const variant = variants.find((v) => String(v.id) === e.target.value) ?? null;
            const unit = unitsOf(line.product).find((u) => u.id === line.unit_id) ?? null;
            onChange({
              variant_id: variant?.id ?? null,
              designation: variant ? `${line.product!.designation} - ${variant.variant_name}` : line.product!.designation,
              prix_unitaire: String(Math.round(priceFor(line.product!, variant, unit) * 100) / 100),
            });
          }}
        >
          <option value="">Sans variante</option>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.variant_name}</option>)}
        </select>
      )}
    </div>
  );
};

const UnitCell: React.FC<{ line: EditableLine; onChange: (patch: Partial<EditableLine>) => void }> = ({ line, onChange }) => {
  const units = unitsOf(line.product);
  if (!line.product || !units.length) {
    return <input className={`${inputClass} w-24`} value={line.unite} placeholder="u, m², kg…" onChange={(e) => onChange({ unite: e.target.value })} aria-label="Unité" />;
  }
  const baseLabel = line.product.base_unit || 'Unité de base';
  return (
    <select
      className={`${inputClass} w-28`}
      value={line.unit_id ?? ''}
      aria-label="Unité"
      onChange={(e) => {
        const unit = units.find((u) => String(u.id) === e.target.value) ?? null;
        const variant = variantsOf(line.product).find((v) => v.id === line.variant_id) ?? null;
        onChange({
          unit_id: unit?.id ?? null,
          unite: unit?.unit_name ?? line.product!.base_unit ?? '',
          prix_unitaire: String(Math.round(priceFor(line.product!, variant, unit) * 100) / 100),
        });
      }}
    >
      <option value="">{baseLabel}</option>
      {units.map((u) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
    </select>
  );
};

const LinesEditor: React.FC<{
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  withProducts?: boolean;
  disabled?: boolean;
}> = ({ lines, onChange, withProducts = false, disabled = false }) => {
  const total = useMemo(() => linesTotal(lines), [lines]);
  const patch = (key: string, changes: Partial<EditableLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...changes } : l)));

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2">#</th>
              <th className="px-3 py-2">Désignation</th>
              <th className="px-3 py-2">Unité</th>
              <th className="w-28 px-3 py-2 text-right">Quantité</th>
              <th className="w-32 px-3 py-2 text-right">Prix unitaire</th>
              <th className="w-32 px-3 py-2 text-right">Total</th>
              <th className="w-10 px-2 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, index) => (
              <tr key={line.key} className="align-top">
                <td className="px-3 py-2.5 text-xs text-slate-400">{index + 1}</td>
                <td className="px-3 py-2"><DesignationCell line={line} withProducts={withProducts} onChange={(c) => patch(line.key, c)} /></td>
                <td className="px-3 py-2"><UnitCell line={line} onChange={(c) => patch(line.key, c)} /></td>
                <td className="px-3 py-2"><input className={`${inputClass} text-right tabular-nums`} inputMode="decimal" value={line.quantite} onChange={(e) => patch(line.key, { quantite: e.target.value })} aria-label="Quantité" /></td>
                <td className="px-3 py-2"><input className={`${inputClass} text-right tabular-nums`} inputMode="decimal" value={line.prix_unitaire} placeholder="0,00" onChange={(e) => patch(line.key, { prix_unitaire: e.target.value })} aria-label="Prix unitaire" /></td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">{formatMoney(lineTotal(line))}</td>
                <td className="px-2 py-2">
                  <button type="button" className={iconButton} onClick={() => onChange(lines.filter((l) => l.key !== line.key))} aria-label={`Supprimer la ligne ${index + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">Aucune ligne. Ajoutez-en une ci-dessous.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td colSpan={5} className="px-3 py-3 text-right text-sm font-semibold text-slate-600">Total</td>
              <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-slate-900">{formatMoney(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" onClick={() => onChange([...lines, newLine()])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-sky-800 hover:bg-sky-50">
        <Plus className="h-4 w-4" /> Ajouter une ligne
      </button>
    </fieldset>
  );
};

export default LinesEditor;
