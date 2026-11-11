import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { useCorrectClientBonLinesMutation } from '../store/api/contactsApi';
import { useCorrectClientPaymentAmountMutation } from '../store/api/paymentsApi';
import { showSuccess } from '../utils/notifications';
import BonModificationNote from './BonModificationNote';

export type HistoryCorrectionItem = {
  id: number;
  designation?: string;
  product_id: number;
  variant_id?: number | null;
  product_snapshot_id?: number | null;
  quantite: number | string;
  prix_unitaire: number | string;
};

export type HistoryCorrectionDocument = {
  id: number;
  numero?: string;
  statut?: string;
  montant_total?: number | string;
  montant?: number | string;
  montant_ignorer?: number | string;
  items?: HistoryCorrectionItem[];
};

const decimalInput = (value: string) => /^\d+(?:[.,]\d+)?$/.test(value.trim())
  ? Number(value.trim().replace(',', '.'))
  : NaN;

export default function ClientHistoryCorrectionDialog({ document, kind, clientId, onClose }: {
  document: HistoryCorrectionDocument;
  kind: 'sortie' | 'avoir' | 'paiement';
  clientId: number;
  onClose: () => void;
}) {
  const [correctBon, { isLoading: savingBon }] = useCorrectClientBonLinesMutation();
  const [correctPayment, { isLoading: savingPayment }] = useCorrectClientPaymentAmountMutation();
  const [error, setError] = useState('');
  const initialAmount = Number(document.montant_total ?? document.montant ?? 0);
  const [amount, setAmount] = useState(String(initialAmount));
  const [lines, setLines] = useState(() => (document.items ?? []).map(item => ({
    ...item,
    quantity: String(item.quantite),
    unitPrice: String(item.prix_unitaire),
  })));
  const saving = savingBon || savingPayment;
  const payment = kind === 'paiement';
  const title = payment ? 'Corriger le paiement' : kind === 'avoir' ? 'Corriger l’avoir validé' : 'Corriger le bon de sortie validé';

  function editLine(id: number, field: 'quantity' | 'unitPrice', value: string) {
    setLines(previous => previous.map(line => line.id === id ? { ...line, [field]: value } : line));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    try {
      if (payment) {
        const nextAmount = decimalInput(amount);
        if (!Number.isFinite(nextAmount) || nextAmount <= 0 || Number(nextAmount.toFixed(2)) !== nextAmount) {
          setError('Saisissez un montant positif avec au maximum deux décimales.');
          return;
        }
        if (nextAmount === initialAmount) { onClose(); return; }
        await correctPayment({
          id: document.id, clientId, amount: nextAmount, expectedAmount: initialAmount,
          expectedStatus: document.statut === 'Validé' ? 'Validé' : 'En attente',
        }).unwrap();
      } else {
        const edits = lines.map(line => ({
          id: line.id,
          expectedQuantity: Number(line.quantite),
          expectedUnitPrice: Number(line.prix_unitaire),
          quantity: decimalInput(line.quantity),
          unitPrice: decimalInput(line.unitPrice),
        })).filter(line => line.quantity !== line.expectedQuantity || line.unitPrice !== line.expectedUnitPrice);
        if (edits.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0
          || Number(line.quantity.toFixed(2)) !== line.quantity
          || !Number.isFinite(line.unitPrice) || line.unitPrice < 0
          || Number(line.unitPrice.toFixed(6)) !== line.unitPrice)) {
          setError('Saisissez une quantité positive et un prix unitaire valide pour chaque ligne modifiée.');
          return;
        }
        if (!edits.length) { onClose(); return; }
        await correctBon({ id: document.id, clientId, kind, edits }).unwrap();
      }
      onClose();
      showSuccess(payment ? 'Montant corrigé. Le solde client est actualisé.' : 'Bon corrigé. Le solde client est actualisé.');
    } catch (cause) {
      const data = (cause as { data?: { message?: string } })?.data;
      setError(data?.message || 'Enregistrement impossible. Réessayez.');
    }
  }

  const inputClass = 'mt-1 block w-full rounded-md border-gray-300 text-right text-sm tabular-nums focus:border-blue-500 focus:ring-blue-500';
  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>{title} {document.numero || '#' + document.id}</DialogTitle>
          <DialogDescription>
            {payment ? 'Saisissez le montant du paiement. Son statut est conservé.'
              : 'Modifiez la quantité ou le prix unitaire des lignes. Le statut Validé est conservé.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" onClick={event => event.stopPropagation()}>
          {!payment && <BonModificationNote id={document.id} type={kind === 'sortie' ? 'Sortie' : 'Avoir'} />}
          {payment ? (
            <label className="block max-w-xs text-sm font-medium text-gray-700">
              Montant du paiement (DH)
              <input className={inputClass} inputMode="decimal" value={amount} disabled={saving}
                onChange={event => setAmount(event.target.value)} />
              {Number(document.montant_ignorer) > 0 && (
                <span className="mt-1 block text-xs font-normal text-gray-600">Montant ignoré conservé · {document.montant_ignorer} DH</span>
              )}
            </label>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {lines.map(line => (
                <div key={line.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_6rem_8rem] sm:items-center">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{line.designation || 'Produit #' + line.product_id}</div>
                    <div className="text-xs text-gray-600">
                      Ligne #{line.id}{line.variant_id ? ' · Variante #' + line.variant_id : ''}
                      {line.product_snapshot_id ? ' · Lot #' + line.product_snapshot_id : ''}
                    </div>
                  </div>
                  <label className="text-xs font-medium text-gray-700">
                    Quantité
                    <input className={inputClass} aria-label={'Quantité ligne ' + line.id} inputMode="decimal" value={line.quantity}
                      disabled={saving} onChange={event => editLine(line.id, 'quantity', event.target.value)} />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Prix unitaire (DH)
                    <input className={inputClass} aria-label={'Prix unitaire ligne ' + line.id} inputMode="decimal" value={line.unitPrice}
                      disabled={saving} onChange={event => editLine(line.id, 'unitPrice', event.target.value)} />
                  </label>
                </div>
              ))}
            </div>
          )}
          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer la correction'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
