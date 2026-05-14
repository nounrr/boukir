import { DollarSign, Wallet } from 'lucide-react';

type Props = {
  montant: string;
  openedAt: string;
  isSaving: boolean;
  onMontantChange: (value: string) => void;
  onOpenedAtChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

const FondCaisseOpeningForm = ({
  montant,
  openedAt,
  isSaving,
  onMontantChange,
  onOpenedAtChange,
  onSubmit,
}: Props) => (
  <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-center gap-3">
      <div className="rounded-lg bg-emerald-100 p-2">
        <Wallet className="h-5 w-5 text-emerald-700" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Debut de traitement</h2>
        <p className="text-sm text-gray-500">Fond initial sauvegarde en base</p>
      </div>
    </div>

    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Montant du fond de caisse
        </label>
        <div className="relative">
          <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="number"
            min="0"
            step="0.01"
            value={montant}
            onChange={(event) => onMontantChange(event.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Date et heure d'ouverture
        </label>
        <input
          type="datetime-local"
          value={openedAt}
          onChange={(event) => onOpenedAtChange(event.target.value)}
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
);

export default FondCaisseOpeningForm;
