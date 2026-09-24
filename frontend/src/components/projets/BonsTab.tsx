import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Receipt, Trash2, Truck } from 'lucide-react';
import { type ProjetBon, type ProjetBonType, useDeleteProjetBonMutation, useSaveProjetBonMutation } from '../../store/api/projetsApi';
import LinesEditor, { type EditableLine, linesTotal, newLine, toNumber } from './LinesEditor';
import { EmptyState, ErrorBanner, Modal, errorMessage, formatDay, formatMoney, formatQty, iconButton, inputClass, labelClass, primaryButton, secondaryButton, todayInput } from './shared';

const COPY: Record<ProjetBonType, { title: string; hint: string; single: string; prefix: string; icon: React.ElementType; empty: string }> = {
  products: {
    title: 'Bons produits',
    hint: 'Produits sortis pour ce projet. Aucun impact sur le stock ni les statistiques.',
    single: 'bon produits',
    prefix: 'BP',
    icon: Truck,
    empty: 'Créez un bon pour tracer les produits utilisés sur le chantier.',
  },
  charge: {
    title: 'Bons charge',
    hint: 'Charges du projet (main d’œuvre, transport, achats…). Séparées de la caisse et des statistiques.',
    single: 'bon charge',
    prefix: 'BC',
    icon: Receipt,
    empty: 'Créez un bon pour suivre les dépenses du projet.',
  },
};

const reference = (bon: ProjetBon) => `${COPY[bon.type].prefix}-${String(bon.id).padStart(4, '0')}`;

const BonsTab: React.FC<{ projetId: number; type: ProjetBonType; bons: ProjetBon[] }> = ({ projetId, type, bons }) => {
  const copy = COPY[type];
  const list = bons.filter((b) => b.type === type);
  const total = list.reduce((sum, b) => sum + b.montant_total, 0);
  const [save, { isLoading: saving }] = useSaveProjetBonMutation();
  const [remove, { isLoading: deleting }] = useDeleteProjetBonMutation();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<ProjetBon | null>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayInput());
  const [observations, setObservations] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const openForm = (bon: ProjetBon | null) => {
    setEditing(bon);
    setDate(bon?.date_bon ?? todayInput());
    setObservations(bon?.observations ?? '');
    setLines(bon
      ? bon.items.map((i) => newLine({
        designation: i.designation,
        unite: i.unite ?? '',
        quantite: String(i.quantite),
        prix_unitaire: String(i.prix_unitaire),
        product_id: i.product_id,
        variant_id: i.variant_id,
        unit_id: i.unit_id,
      }))
      : [newLine()]);
    setError('');
    setOpen(true);
  };

  const submit = async () => {
    const items = lines
      .filter((l) => l.designation.trim())
      .map((l) => ({
        designation: l.designation.trim(),
        unite: l.unite.trim() || null,
        quantite: toNumber(l.quantite),
        prix_unitaire: toNumber(l.prix_unitaire),
        product_id: l.product_id,
        variant_id: l.variant_id,
        unit_id: l.unit_id,
      }));
    if (!items.length) { setError('Ajoutez au moins une ligne avec une désignation.'); return; }
    try {
      await save({ projetId, id: editing?.id, data: { type, date_bon: date, observations: observations.trim() || null, items } }).unwrap();
      setOpen(false);
    } catch (err) { setError(errorMessage(err)); }
  };

  const onDelete = async (bon: ProjetBon) => {
    if (!window.confirm(`Supprimer le ${copy.single} ${reference(bon)} (${formatMoney(bon.montant_total)}) ?`)) return;
    setActionError('');
    try { await remove({ projetId, id: bon.id }).unwrap(); } catch (err) { setActionError(errorMessage(err)); }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{copy.title}</h2>
          <p className="text-sm text-slate-500">{copy.hint}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{list.length} bon(s) · <span className="font-semibold text-slate-800">{formatMoney(total)}</span></span>
          <button type="button" className={primaryButton} onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nouveau {copy.single}</button>
        </div>
      </div>
      <ErrorBanner message={actionError} />

      {!list.length ? (
        <EmptyState icon={copy.icon} title={`Aucun ${copy.single}`} hint={copy.empty} />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {list.map((bon) => {
            const isOpen = expanded === bon.id;
            return (
              <div key={bon.id}>
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpanded(isOpen ? null : bon.id)} aria-expanded={isOpen}>
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                    <span className="font-mono text-sm font-semibold text-slate-800">{reference(bon)}</span>
                    <span className="whitespace-nowrap text-sm text-slate-500">{formatDay(bon.date_bon)}</span>
                    <span className="hidden min-w-0 truncate text-sm text-slate-500 sm:inline">{bon.observations || `${bon.items.length} ligne(s)`}</span>
                  </button>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-rose-700">{formatMoney(bon.montant_total)}</span>
                  <div className="flex shrink-0">
                    <button type="button" className={iconButton} onClick={() => openForm(bon)} aria-label="Modifier"><Pencil className="h-4 w-4" /></button>
                    <button type="button" className={iconButton} onClick={() => onDelete(bon)} disabled={deleting} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {isOpen && (
                  <div className="overflow-x-auto bg-slate-50/70 px-4 pb-4 pt-1">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr><th className="py-2">Désignation</th><th className="py-2">Unité</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">P.U.</th><th className="py-2 text-right">Total</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70">
                        {bon.items.map((item) => (
                          <tr key={item.id}>
                            <td className="py-2 pr-3 text-slate-800">{item.designation}{item.product_id && <span className="ml-1 text-xs text-slate-400">#{item.product_id}</span>}</td>
                            <td className="py-2 pr-3 text-slate-600">{item.unite || '—'}</td>
                            <td className="py-2 text-right tabular-nums">{formatQty(item.quantite)}</td>
                            <td className="py-2 text-right tabular-nums">{formatMoney(item.prix_unitaire)}</td>
                            <td className="py-2 text-right font-medium tabular-nums">{formatMoney(item.total ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <Modal
          wide
          title={editing ? `Modifier ${reference(editing)}` : `Nouveau ${copy.single}`}
          onClose={() => setOpen(false)}
          busy={saving}
          footer={(
            <>
              <span className="mr-auto self-center text-sm text-slate-500">Total : <span className="font-bold text-slate-900">{formatMoney(linesTotal(lines))}</span></span>
              <button type="button" className={secondaryButton} onClick={() => setOpen(false)} disabled={saving}>Annuler</button>
              <button type="button" className={primaryButton} onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</button>
            </>
          )}
        >
          <div className="space-y-4">
            <ErrorBanner message={error} />
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <div>
                <label htmlFor="bon-date" className={labelClass}>Date</label>
                <input id="bon-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="bon-obs" className={labelClass}>Observations</label>
                <input id="bon-obs" className={inputClass} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Chantier, fournisseur, remarque…" />
              </div>
            </div>
            <LinesEditor lines={lines} onChange={setLines} withProducts disabled={saving} />
          </div>
        </Modal>
      )}
    </section>
  );
};

export default BonsTab;
