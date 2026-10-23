import { useState } from 'react';
import type { Contact } from '../types';
import type { MultiClientChequeData } from '../store/api/paymentsApi';
import { getCurrentDateTimeInput } from '../utils/dateUtils';
import SearchableSelect from './SearchableSelect';
import { distributeCheque } from '../utils/multiClientChequeAllocation';

type Allocation = { contactId: number; amount: string };

const cents = (value: unknown) => Math.round(Number(value) * 100);
const money = (value: number) => (value / 100).toFixed(2);

type Props = {
  clients: Contact[];
  onClose: () => void;
  onSave: (data: MultiClientChequeData) => Promise<void>;
};

export default function MultiClientChequeModal({ clients, onClose, onSave }: Props) {
  const [reference, setReference] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(getCurrentDateTimeInput);
  const [dueDate, setDueDate] = useState('');
  const [bank, setBank] = useState('');
  const [personnel, setPersonnel] = useState('');
  const [note, setNote] = useState('');
  const [nextClient, setNextClient] = useState('');
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const clientById = new Map(clients.map((client) => [Number(client.id), client]));
  const dueCents = (client: Contact) => Math.max(0, cents(client.total_cumule ?? 0));
  const selectedIds = new Set(allocations.map((line) => line.contactId));
  const choices = clients.filter((client) => dueCents(client) > 0 && !selectedIds.has(Number(client.id)));
  const allocatedCents = allocations.reduce((sum, line) => sum + (Number.isFinite(cents(line.amount)) ? cents(line.amount) : 0), 0);
  const totalCents = cents(total);
  const difference = Number.isFinite(totalCents) ? totalCents - allocatedCents : 0;

  const addClient = () => {
    const id = Number(nextClient);
    const client = clientById.get(id);
    if (!client || selectedIds.has(id) || dueCents(client) <= 0) return;
    const remaining = Number.isFinite(totalCents) && totalCents > 0 ? Math.max(0, totalCents - allocatedCents) : dueCents(client);
    setAllocations((prev) => [...prev, { contactId: id, amount: money(Math.min(dueCents(client), remaining)) }]);
    setNextClient('');
    setError('');
  };

  const distribute = () => {
    const parts = distributeCheque(totalCents, allocations.map((line) => {
      const client = clientById.get(line.contactId);
      return client ? dueCents(client) : 0;
    }));
    setAllocations((prev) => prev.map((line, index) => ({ ...line, amount: money(parts[index]) })));
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedReference = reference.trim();
    if (!normalizedReference || !date || !Number.isSafeInteger(totalCents) || totalCents <= 0) {
      setError('Saisissez la référence, la date et le montant du chèque.');
      return;
    }
    if (allocations.length < 2) {
      setError('Choisissez au moins deux clients.');
      return;
    }
    if (allocations.some((line) => {
      const client = clientById.get(line.contactId);
      const amount = cents(line.amount);
      return !client || !Number.isSafeInteger(amount) || amount <= 0 || amount > dueCents(client);
    })) {
      setError('Chaque part doit être positive et ne pas dépasser le solde à payer du client.');
      return;
    }
    if (difference !== 0) {
      setError('La somme des parts doit être égale au montant du chèque.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        montant_total: totalCents / 100,
        allocations: allocations.map((line) => ({ contact_id: line.contactId, montant: cents(line.amount) / 100 })),
        code_reglement: normalizedReference,
        date_paiement: date,
        date_echeance: dueDate || null,
        banque: bank.trim(),
        personnel: personnel.trim(),
        designation: note.trim(),
      });
    } catch (caught: any) {
      setError(caught?.data?.message || caught?.message || 'Le chèque n’a pas été enregistré.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2" role="dialog" aria-modal="true" aria-label="Chèque pour plusieurs clients">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Chèque pour plusieurs clients</h2>
            <p className="text-sm text-gray-600">Chaque client recevra un paiement avec la même référence de chèque.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="text-gray-500 hover:text-gray-800" aria-label="Fermer">✕</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Référence du chèque *
              <input value={reference} onChange={(event) => setReference(event.target.value)} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Montant du chèque (DH) *
              <input type="number" min="0.01" step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Date et heure du paiement *
              <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Date d’échéance
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Banque
              <input value={bank} onChange={(event) => setBank(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Personne
              <input value={personnel} onChange={(event) => setPersonnel(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
            <label className="mb-1 block text-sm font-medium text-gray-800">Ajouter un client</label>
            <div className="flex gap-2">
              <SearchableSelect
                options={choices.map((client) => ({
                  value: String(client.id),
                  label: `${client.reference || client.id} — ${client.nom_complet} — Solde à payer ${money(dueCents(client))} DH`,
                }))}
                value={nextClient}
                onChange={setNextClient}
                placeholder="Rechercher un client"
                className="min-w-0 flex-1"
                autoOpenOnFocus
              />
              <button type="button" onClick={addClient} disabled={!nextClient} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Ajouter</button>
            </div>
          </div>
          {allocations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">Répartition</h3>
                <button type="button" onClick={distribute} className="text-sm font-medium text-blue-700 hover:underline">Répartir selon les soldes</button>
              </div>
              {allocations.map((line) => {
                const client = clientById.get(line.contactId);
                if (!client) return null;
                return <div key={line.contactId} className="grid grid-cols-[minmax(0,1fr)_120px_34px] items-center gap-2 rounded-md border border-gray-200 p-2 text-sm">
                  <div className="min-w-0"><strong className="block truncate">{client.nom_complet}</strong><span className="text-gray-500">Solde à payer : {money(dueCents(client))} DH</span></div>
                  <input type="number" min="0.01" max={money(dueCents(client))} step="0.01" aria-label={`Montant pour ${client.nom_complet}`} value={line.amount} onChange={(event) => setAllocations((prev) => prev.map((item) => item.contactId === line.contactId ? { ...item, amount: event.target.value } : item))} className="w-full rounded-md border border-gray-300 px-2 py-2 text-right" />
                  <button type="button" aria-label={`Retirer ${client.nom_complet}`} onClick={() => setAllocations((prev) => prev.filter((item) => item.contactId !== line.contactId))} className="text-lg text-red-600">×</button>
                </div>;
              })}
              <div className="flex justify-between border-t pt-2 text-sm"><span>Réparti : <strong>{money(allocatedCents)} DH</strong></span><span className={difference === 0 ? 'text-green-700' : 'text-red-700'}>Écart : {money(difference)} DH</span></div>
            </div>
          )}
          <label className="block text-sm font-medium text-gray-700">Notes
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Annuler</button>
            <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer le chèque'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
