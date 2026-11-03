import { useState } from 'react';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { useGetFixedChargesQuery, useCreateFixedChargeMutation, useUpdateFixedChargeMutation, useDeleteFixedChargeMutation } from '../store/api/fixedChargesApi';
import type { FixedCharge } from '../store/api/fixedChargesApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';

const emptyForm = { libelle: '', montant: '', debut: '', fin: '' };
const amount = (value: number | string) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 3 }).format(Number(value)) + ' DH';
const dateLabel = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : 'Sans limite';

export default function FixedChargesSection() {
  const { user } = useAuth();
  const canManage = ['PDG', 'ManagerPlus', 'Manager'].includes(user?.role || '');
  const { data: charges = [], isLoading, isError, refetch } = useGetFixedChargesQuery();
  const [create, createState] = useCreateFixedChargeMutation();
  const [update, updateState] = useUpdateFixedChargeMutation();
  const [remove, removeState] = useDeleteFixedChargeMutation();
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const saving = createState.isLoading || updateState.isLoading;
  const reset = () => { setForm(emptyForm); setEditingId(null); setFormOpen(false); };
  const edit = (charge: FixedCharge) => {
    setEditingId(charge.id);
    setForm({ libelle: charge.libelle, montant: String(charge.montant_mensuel), debut: charge.date_debut || '', fin: charge.date_fin || '' });
    setFormOpen(true);
  };
  const inputClass = 'mt-1 min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500';

  return <section aria-labelledby="fixed-charges-title" className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="fixed-charges-title" className="text-lg font-bold text-gray-900">Charges fixes mensuelles</h2>
        <p className="mt-1 text-xs text-gray-500">Incluses dans les charges, le chiffre net et le bénéfice. Le montant mensuel est réparti sur les jours du mois.</p>
      </div>
      {canManage && <button type="button" disabled={saving} onClick={() => { setEditingId(null); setForm(emptyForm); setFormOpen(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"><Plus className="h-4 w-4" />Ajouter une charge fixe</button>}
    </div>
    {formOpen && canManage && <form className="mt-4 rounded-lg border border-violet-100 bg-violet-50/50 p-3" onSubmit={async event => {
      event.preventDefault();
      if (form.debut && form.fin && form.debut > form.fin) { showError('La date de fin doit suivre la date de début.'); return; }
      const body = { libelle: form.libelle, montant_mensuel: Number(form.montant.replace(',', '.')), date_debut: form.debut || null, date_fin: form.fin || null };
      try {
        if (editingId != null) await update({ id: editingId, ...body }).unwrap();
        else await create(body).unwrap();
        reset(); showSuccess('Charge fixe enregistrée. Les calculs sont actualisés.');
      } catch (error: any) { showError(error?.data?.message || 'Impossible d’enregistrer la charge fixe.'); }
    }}>
      <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-gray-700">Libellé<input required maxLength={190} value={form.libelle} onChange={event => setForm(previous => ({ ...previous, libelle: event.target.value }))} placeholder="Ex. Loyer" className={inputClass} /></label>
        <label className="text-xs font-semibold text-gray-700">Montant mensuel (DH)<input required type="number" min="0.001" max="999999999.999" step="0.001" value={form.montant} onChange={event => setForm(previous => ({ ...previous, montant: event.target.value }))} className={inputClass} /></label>
        <label className="text-xs font-semibold text-gray-700">Date de début (facultative)<input type="date" value={form.debut} onChange={event => setForm(previous => ({ ...previous, debut: event.target.value }))} className={inputClass} /></label>
        <label className="text-xs font-semibold text-gray-700">Date de fin (facultative)<input type="date" min={form.debut || undefined} value={form.fin} onChange={event => setForm(previous => ({ ...previous, fin: event.target.value }))} className={inputClass} /></label>
      </fieldset>
      <p className="mt-2 text-xs text-gray-500">Une date vide signifie aucune limite de ce côté. Les mois partiels sont calculés au prorata des jours concernés.</p>
      <div className="mt-3 flex gap-2"><button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Enregistrement…' : editingId != null ? 'Enregistrer les modifications' : 'Enregistrer'}</button><button type="button" disabled={saving} onClick={reset} className="min-h-10 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm">Annuler</button></div>
    </form>}
    {isLoading ? <p role="status" className="mt-4 text-sm text-gray-500">Chargement des charges fixes…</p>
      : isError ? <p role="alert" className="mt-4 text-sm text-red-700">Impossible de charger les charges fixes. <button type="button" onClick={() => void refetch()} className="underline">Réessayer</button></p>
      : charges.length === 0 ? <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Aucune charge fixe configurée.</p>
      : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-violet-50 text-xs text-gray-600"><tr><th className="px-3 py-2">Libellé</th><th className="px-3 py-2 text-right">Montant / mois</th><th className="px-3 py-2">Début</th><th className="px-3 py-2">Fin</th>{canManage && <th className="px-3 py-2 text-right">Actions</th>}</tr></thead>
        <tbody>{charges.map(charge => <tr key={charge.id} className="border-t border-gray-100"><td className="px-3 py-3 font-medium text-gray-800">{charge.libelle}</td><td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-violet-700">{amount(charge.montant_mensuel)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-gray-600">{dateLabel(charge.date_debut)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-gray-600">{dateLabel(charge.date_fin)}</td>{canManage && <td className="px-3 py-3"><div className="flex justify-end gap-2">
          <button type="button" disabled={saving || removeState.isLoading} onClick={() => edit(charge)} aria-label={`Modifier ${charge.libelle}`} className="rounded-lg border border-violet-200 p-2 text-violet-700 disabled:opacity-50"><Edit className="h-4 w-4" /></button>
          <button type="button" disabled={saving || removeState.isLoading} aria-label={`Supprimer ${charge.libelle}`} className="rounded-lg border border-red-200 p-2 text-red-600 disabled:opacity-50" onClick={async () => {
            const confirmation = await showConfirmation('Cette charge sera retirée des calculs, y compris pour les périodes passées.', `Supprimer « ${charge.libelle} » ?`, 'Supprimer', 'Annuler');
            if (!confirmation.isConfirmed) return;
            try { await remove(charge.id).unwrap(); if (editingId === charge.id) reset(); showSuccess('Charge fixe supprimée.'); }
            catch { showError('Impossible de supprimer la charge fixe.'); }
          }}><Trash2 className="h-4 w-4" /></button>
        </div></td>}</tr>)}</tbody>
      </table></div>}
  </section>;
}
