import { useEffect, useState } from 'react';
import { CheckCircle2, HardHat, RotateCcw, Save, Wallet } from 'lucide-react';
import {
  type ClientPaymentMethod,
  type MaalemEarning,
  type ServiceBilling,
  useMarkServicePaidMutation,
  useMarkServiceUnpaidMutation,
  useSetServiceClientAmountMutation,
  useSetServiceMaalemAmountMutation,
} from '../../store/api/serviceRequestsApi';

import { EARNING_STATE_LABELS, PAYMENT_METHOD_LABELS, money } from './servicePaymentLabels';

const input = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500';

function dateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function errorMessage(error: unknown) {
  const value = error as { data?: { message?: string; errors?: Record<string, string> } };
  return [value.data?.message, ...(value.data?.errors ? Object.values(value.data.errors) : [])].filter(Boolean).join(' · ') || 'Une erreur est survenue';
}

function statusPill(billing: ServiceBilling | null) {
  if (!billing) return { label: 'Montant à saisir', cls: 'bg-amber-100 text-amber-800' };
  if (billing.status === 'paid') return { label: 'Payé', cls: 'bg-emerald-100 text-emerald-700' };
  if (billing.status === 'declared') return { label: 'Paiement annoncé par le client', cls: 'bg-blue-100 text-blue-700' };
  return { label: 'Non payé', cls: 'bg-slate-100 text-slate-700' };
}

/** The client amount: entered before confirming, then paid by the client (card online, or recorded here). */
export function ClientAmountCard({ requestId, billing, cancelled, onChanged }: {
  requestId: number;
  billing: ServiceBilling | null;
  cancelled: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ClientPaymentMethod>('especes');
  const [reference, setReference] = useState('');
  const [feedback, setFeedback] = useState('');
  const [setClientAmount, setState] = useSetServiceClientAmountMutation();
  const [markPaid, paidState] = useMarkServicePaidMutation();
  const [markUnpaid, unpaidState] = useMarkServiceUnpaidMutation();
  useEffect(() => {
    setAmount(billing ? String(billing.amount) : '');
    if (billing?.method && billing.method !== 'cmi') setMethod(billing.method);
  }, [billing]);
  const paid = billing?.status === 'paid';
  const pill = statusPill(billing);

  async function run(task: () => Promise<unknown>, success: string) {
    setFeedback('');
    try { await task(); await onChanged(); setFeedback(success); }
    catch (error) { setFeedback(errorMessage(error)); }
  }

  return <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
      <h2 className="flex items-center gap-2 font-bold text-gray-900"><Wallet className="h-5 w-5 text-blue-600" />Montant client</h2>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}>{pill.label}</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Montant à recevoir du client (DH) *</span>
        <input inputMode="decimal" disabled={paid || cancelled} className={input} placeholder="Ex. 1 500" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <button type="button" disabled={paid || cancelled || !amount.trim() || setState.isLoading || (billing != null && Number(amount.replace(/\s/g, '').replace(',', '.')) === billing.amount)}
        onClick={() => void run(() => setClientAmount({ id: requestId, client_amount: amount }).unwrap(), 'Montant enregistré.')}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"><Save className="h-4 w-4" />{billing ? 'Modifier' : 'Enregistrer'}</button>
    </div>
    {!billing && !cancelled && <p className="mt-2 text-xs text-amber-800">Obligatoire avant de confirmer la demande. Le client le verra sur sa demande avec les modes de paiement.</p>}
    {billing && <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
      <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Mode</dt><dd className="mt-1 text-slate-800">{billing.method ? PAYMENT_METHOD_LABELS[billing.method] : 'Pas encore choisi'}</dd></div>
      <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{paid ? 'Payé le' : 'Annoncé le'}</dt><dd className="mt-1 text-slate-800">{dateTime(paid ? billing.paid_at : billing.declared_at)}</dd></div>
      <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Référence</dt><dd className="mt-1 break-words text-slate-800">{billing.reference || '—'}</dd></div>
    </dl>}
    {billing && !paid && !cancelled && <div className="mt-4 space-y-3 border-t pt-4">
      <p className="text-sm font-semibold text-slate-700">Enregistrer la réception du paiement</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={input} value={method} onChange={(e) => setMethod(e.target.value as ClientPaymentMethod)}>
          {(['especes', 'virement', 'cheque', 'cmi'] as const).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
        </select>
        <input className={input} placeholder="Référence (n° chèque, virement…)" value={reference} onChange={(e) => setReference(e.target.value)} />
        <button type="button" disabled={paidState.isLoading} onClick={() => { if (!window.confirm(`Confirmer la réception de ${money(billing.amount)} par ${PAYMENT_METHOD_LABELS[method].toLowerCase()} ?`)) return; void run(() => markPaid({ id: requestId, method, reference: reference.trim() || undefined }).unwrap(), 'Paiement enregistré : le client est prévenu.'); }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Marquer payé</button>
      </div>
      <p className="text-xs text-slate-500">Par carte, le client paie lui-même depuis sa demande : elle passe « Payé » automatiquement.</p>
    </div>}
    {paid && billing?.method !== 'cmi' && <button type="button" disabled={unpaidState.isLoading} onClick={() => { if (!window.confirm('Annuler ce paiement enregistré par erreur ?')) return; void run(() => markUnpaid(requestId).unwrap(), 'Paiement annulé.'); }}
      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-red-700 underline underline-offset-2 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Annuler ce paiement</button>}
    {feedback && <p role="status" className="mt-3 text-sm text-slate-700">{feedback}</p>}
  </section>;
}

/** What the Maalem receives: the current assignment's amount (editable until paid out) and earlier ones. */
export function MaalemAmountCard({ requestId, earnings, currentAssignmentId, currentMaalemName, onChanged }: {
  requestId: number;
  earnings: MaalemEarning[];
  currentAssignmentId: number | null;
  currentMaalemName: string | null;
  onChanged: () => Promise<unknown>;
}) {
  const hasCurrentAssignment = currentAssignmentId != null;
  // The current Maalem's amount; once the assignment is over (mission closed), the one who did the work.
  const current = earnings.find((e) => e.assignment_id === currentAssignmentId) ?? earnings.find((e) => e.state !== 'void');
  const [amount, setAmount] = useState('');
  const [feedback, setFeedback] = useState('');
  const [setMaalemAmount, state] = useSetServiceMaalemAmountMutation();
  useEffect(() => { setAmount(current ? String(current.amount) : ''); }, [current?.id, current?.amount]); // eslint-disable-line react-hooks/exhaustive-deps
  const settled = current?.state === 'paid_cash' || current?.state === 'to_shop';
  if (!hasCurrentAssignment && earnings.length === 0) return null;
  return <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
      <h2 className="flex items-center gap-2 font-bold text-gray-900"><HardHat className="h-5 w-5 text-blue-600" />Montant Maalem</h2>
      {current && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${current.state === 'available' ? 'bg-amber-100 text-amber-800' : settled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{EARNING_STATE_LABELS[current.state]}</span>}
    </div>
    {hasCurrentAssignment && <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Ce que reçoit {currentMaalemName || 'le Maalem'} (DH)</span>
        <input inputMode="decimal" disabled={settled} className={input} placeholder="Ex. 800" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <button type="button" disabled={settled || !amount.trim() || state.isLoading || (current != null && Number(amount.replace(/\s/g, '').replace(',', '.')) === current.amount)}
        onClick={() => { setFeedback(''); void setMaalemAmount({ id: requestId, amount }).unwrap().then(() => onChanged()).then(() => setFeedback('Montant Maalem enregistré.')).catch((error) => setFeedback(errorMessage(error))); }}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"><Save className="h-4 w-4" />{current ? 'Modifier' : 'Enregistrer'}</button>
    </div>}
    <p className="mt-2 text-xs text-slate-500">Disponible pour le Maalem une fois la mission clôturée : il le retire en espèces (page « Paiements Maalems ») ou l’utilise pour ses achats depuis l’application.</p>
    {earnings.length > 1 && <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-slate-600">{earnings.map((e) => <li key={e.id} className="flex justify-between gap-2"><span>{e.maalem_name}</span><span>{money(e.amount)} · {EARNING_STATE_LABELS[e.state]}</span></li>)}</ul>}
    {feedback && <p role="status" className="mt-3 text-sm text-slate-700">{feedback}</p>}
  </section>;
}
