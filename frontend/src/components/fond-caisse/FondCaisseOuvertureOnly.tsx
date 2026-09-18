import { useState } from 'react';
import { CheckCircle2, DollarSign, Lock, Wallet } from 'lucide-react';

import { useAuth } from '../../hooks/redux';
import { showError, showSuccess } from '../../utils/notifications';

type PaymentMode = 'Espece' | 'Virement' | 'Cheque';
const paymentModes: PaymentMode[] = ['Espece', 'Virement', 'Cheque'];

const pad = (n: number) => String(n).padStart(2, '0');
const nowLocalInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Vue réservée à un employé autorisé par le PDG : il peut uniquement saisir
 * le fond initial de la caisse. Aucune donnée, calcul ni détail n'est chargé
 * ni affiché ; le serveur refuse d'ailleurs toute autre requête fond-caisse.
 */
const FondCaisseOuvertureOnly = () => {
  const auth = useAuth() as any;
  const token: string | undefined = auth?.token;

  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState<PaymentMode>('Espece');
  const [openedAt, setOpenedAt] = useState<string>(nowLocalInput);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ montant: number; openedAt: string } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const m = Number(montant);
    if (!Number.isFinite(m) || m < 0) {
      showError('Montant invalide.');
      return;
    }
    if (!openedAt) {
      showError("Date et heure d'ouverture requises.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/fond-caisse/entries', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant: m, openedAt, entryType: 'caisse_initial', modePaiement: mode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Erreur sauvegarde');
      showSuccess('Fond de caisse initial enregistré.');
      setLastSaved({ montant: m, openedAt });
      setMontant('');
      setOpenedAt(nowLocalInput());
    } catch (err: any) {
      showError(err?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Fond de caisse</h1>
          <p className="mt-1 text-gray-600">Saisie du fond initial de la caisse.</p>
        </div>

        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 flex-none" />
          <p>
            Vous êtes autorisé uniquement à enregistrer le fond initial. Les données, calculs et détails du
            fond de caisse sont gérés par le PDG.
          </p>
        </div>

        {lastSaved && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 flex-none" />
            <p>
              Dernière saisie : <strong>{lastSaved.montant.toFixed(2)} DH</strong> le{' '}
              {lastSaved.openedAt.replace('T', ' à ')}.
            </p>
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2">
              <Wallet className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Début caisse</h2>
              <p className="text-sm text-gray-500">Fond initial de la caisse</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Montant du fond de caisse</label>
              <div className="relative">
                <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montant}
                  onChange={(event) => setMontant(event.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mode de paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {paymentModes.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      mode === option
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date et heure d'ouverture</label>
              <input
                type="datetime-local"
                value={openedAt}
                onChange={(event) => setOpenedAt(event.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer le fond de caisse'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default FondCaisseOuvertureOnly;
