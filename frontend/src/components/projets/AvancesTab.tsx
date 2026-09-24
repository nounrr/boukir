import React, { useState } from 'react';
import { Banknote, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { type AvanceInput, type AvanceMode, type ProjetAvance, useDeleteProjetAvanceMutation, useSaveProjetAvanceMutation } from '../../store/api/projetsApi';
import { EmptyState, ErrorBanner, MODE_LABELS, Modal, errorMessage, formatDay, formatMoney, iconButton, inputClass, labelClass, primaryButton, secondaryButton, todayInput } from './shared';

const MODES: AvanceMode[] = ['Espece', 'Virement', 'Cheque'];
const modeTone: Record<AvanceMode, string> = {
  Espece: 'bg-emerald-50 text-emerald-800',
  Virement: 'bg-sky-50 text-sky-800',
  Cheque: 'bg-violet-50 text-violet-800',
};

const AvancesTab: React.FC<{ projetId: number; avances: ProjetAvance[] }> = ({ projetId, avances }) => {
  const [save, { isLoading: saving }] = useSaveProjetAvanceMutation();
  const [remove, { isLoading: deleting }] = useDeleteProjetAvanceMutation();
  const [editing, setEditing] = useState<ProjetAvance | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ date_avance: string; montant: string; mode_paiement: AvanceMode; description: string }>({ date_avance: todayInput(), montant: '', mode_paiement: 'Espece', description: '' });
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const total = avances.reduce((sum, a) => sum + a.montant, 0);

  const openForm = (avance: ProjetAvance | null) => {
    setEditing(avance);
    setForm(avance
      ? { date_avance: avance.date_avance, montant: String(avance.montant), mode_paiement: avance.mode_paiement, description: avance.description ?? '' }
      : { date_avance: todayInput(), montant: '', mode_paiement: 'Espece', description: '' });
    setError('');
    setOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const data: AvanceInput = {
      date_avance: form.date_avance,
      montant: Number(form.montant.replace(',', '.')),
      mode_paiement: form.mode_paiement,
      description: form.description.trim() || null,
    };
    if (!(data.montant > 0)) { setError('Le montant doit être supérieur à 0.'); return; }
    try {
      await save({ projetId, id: editing?.id, data }).unwrap();
      setOpen(false);
    } catch (err) { setError(errorMessage(err)); }
  };

  const onDelete = async (avance: ProjetAvance) => {
    if (!window.confirm(`Supprimer l’avance de ${formatMoney(avance.montant)} du ${formatDay(avance.date_avance)} ?`)) return;
    setActionError('');
    try { await remove({ projetId, id: avance.id }).unwrap(); } catch (err) { setActionError(errorMessage(err)); }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Avances reçues</h2>
          <p className="text-sm text-slate-500">{avances.length} avance(s) · total <span className="font-semibold text-slate-800">{formatMoney(total)}</span></p>
        </div>
        <button type="button" className={primaryButton} onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nouvelle avance</button>
      </div>
      <ErrorBanner message={actionError} />

      {!avances.length ? (
        <EmptyState icon={Banknote} title="Aucune avance" hint="Enregistrez les montants reçus en espèce, virement ou chèque." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Montant</th>
                <th className="w-20 px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {avances.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{formatDay(a.date_avance)}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modeTone[a.mode_paiement]}`}>{MODE_LABELS[a.mode_paiement]}</span></td>
                  <td className="px-4 py-2.5 text-slate-600">{a.description || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-700">{formatMoney(a.montant)}</td>
                  <td className="px-2 py-2 text-right">
                    <button type="button" className={iconButton} onClick={() => openForm(a)} aria-label="Modifier"><Pencil className="h-4 w-4" /></button>
                    <button type="button" className={iconButton} onClick={() => onDelete(a)} disabled={deleting} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal
          title={editing ? 'Modifier l’avance' : 'Nouvelle avance'}
          onClose={() => setOpen(false)}
          busy={saving}
          footer={(
            <>
              <button type="button" className={secondaryButton} onClick={() => setOpen(false)} disabled={saving}>Annuler</button>
              <button type="submit" form="avance-form" className={primaryButton} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</button>
            </>
          )}
        >
          <form id="avance-form" onSubmit={submit} className="space-y-3">
            <ErrorBanner message={error} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="av-date" className={labelClass}>Date</label>
                <input id="av-date" type="date" className={inputClass} value={form.date_avance} onChange={(e) => setForm({ ...form, date_avance: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="av-montant" className={labelClass}>Montant (DH)</label>
                <input id="av-montant" inputMode="decimal" className={`${inputClass} text-right tabular-nums`} value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} placeholder="0,00" required autoFocus />
              </div>
            </div>
            <div>
              <span className={labelClass}>Mode de paiement</span>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mode de paiement">
                {MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={form.mode_paiement === mode}
                    onClick={() => setForm({ ...form, mode_paiement: mode })}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${form.mode_paiement === mode ? 'border-sky-700 bg-sky-50 text-sky-900' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="av-desc" className={labelClass}>Description</label>
              <textarea id="av-desc" rows={3} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="N° de chèque, référence du virement…" />
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
};

export default AvancesTab;
