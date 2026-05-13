import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, DollarSign, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { formatDateSimple, formatDateTimeWithHour, getCurrentDateISO } from '../utils/dateUtils';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';

type FondCaisseEntry = {
  id: string;
  montant: number;
  openedAt: string;
  jour: string;
  createdByUserId?: number | null;
  createdByName: string;
};

const STORAGE_KEY = 'bpukir_fond_caisse_entries';

const readEntries = (): FondCaisseEntry[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any) => ({
        id: String(item.id || ''),
        montant: Number(item.montant || 0),
        openedAt: String(item.openedAt || ''),
        jour: String(item.jour || ''),
        createdByUserId: item.createdByUserId != null ? Number(item.createdByUserId) : null,
        createdByName: String(item.createdByName || 'Inconnu'),
      }))
      .filter((item) => item.id && item.openedAt && item.jour);
  } catch {
    return [];
  }
};

const writeEntries = (entries: FondCaisseEntry[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

const FondCaissePage = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FondCaisseEntry[]>([]);
  const [montant, setMontant] = useState('');
  const [openedAt, setOpenedAt] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [dateFrom, setDateFrom] = useState(() => getCurrentDateISO());
  const [dateTo, setDateTo] = useState(() => getCurrentDateISO());

  useEffect(() => {
    setEntries(readEntries());
  }, []);

  const sortedEntries = useMemo(() => {
    return [...entries].sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return sortedEntries.filter((entry) => {
      if (dateFrom && entry.jour < dateFrom) return false;
      if (dateTo && entry.jour > dateTo) return false;
      return true;
    });
  }, [dateFrom, dateTo, sortedEntries]);

  const todayEntry = useMemo(() => {
    const today = getCurrentDateISO();
    return sortedEntries.find((entry) => entry.jour === today) || null;
  }, [sortedEntries]);

  const periodTotal = filteredEntries.reduce((sum, entry) => sum + Number(entry.montant || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedMontant = Number(montant);
    if (!Number.isFinite(parsedMontant) || parsedMontant < 0) {
      showError('Veuillez saisir un montant valide.');
      return;
    }

    if (!openedAt) {
      showError("Veuillez saisir la date et l'heure d'ouverture.");
      return;
    }

    const openedDate = new Date(openedAt);
    if (Number.isNaN(openedDate.getTime())) {
      showError("La date ou l'heure d'ouverture est invalide.");
      return;
    }

    const jour = openedAt.slice(0, 10);
    const newEntry: FondCaisseEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      montant: parsedMontant,
      openedAt: openedDate.toISOString(),
      jour,
      createdByUserId: user?.id ?? null,
      createdByName: user?.nom_complet || user?.cin || 'Caissier',
    };

    const nextEntries = [newEntry, ...entries];
    writeEntries(nextEntries);
    setEntries(nextEntries);
    setMontant('');
    showSuccess('Fond de caisse enregistré.');
  };

  const handleDelete = async (entry: FondCaisseEntry) => {
    const result = await showConfirmation(
      'Cette ligne sera supprimée.',
      `Supprimer le fond de caisse du ${formatDateSimple(entry.jour)} ?`,
      'Supprimer',
      'Annuler'
    );

    if (!result.isConfirmed) return;

    const nextEntries = entries.filter((item) => item.id !== entry.id);
    writeEntries(nextEntries);
    setEntries(nextEntries);
    showSuccess('Fond de caisse supprimé.');
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fond de caisse</h1>
          <p className="mt-1 text-gray-600">
            Saisie du montant d&apos;ouverture du caissier avec date et heure.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2">
                <Wallet className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Début de traitement</h2>
                <p className="text-sm text-gray-500">Enregistrer le fond de caisse initial</p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
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
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Date et heure d&apos;entrée
                </label>
                <input
                  type="datetime-local"
                  value={openedAt}
                  onChange={(e) => setOpenedAt(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
              >
                Enregistrer le fond de caisse
              </button>
            </form>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <DollarSign className="h-5 w-5 text-blue-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fond du jour</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {todayEntry ? `${todayEntry.montant.toFixed(2)} DH` : 'Aucun'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <CalendarDays className="h-5 w-5 text-orange-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Enregistrements période</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredEntries.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2">
                  <Wallet className="h-5 w-5 text-emerald-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total période</p>
                  <p className="text-2xl font-bold text-gray-900">{periodTotal.toFixed(2)} DH</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Historique</h2>
                <p className="text-sm text-gray-500">Filtrer par jour ou par période</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Du
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Au
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                <p className="text-lg font-medium text-gray-700">Aucun fond de caisse trouvé</p>
                <p className="mt-1 text-sm text-gray-500">
                  Enregistrez un montant ou changez la période.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Montant
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Jour
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Heure d&apos;entrée
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Caissier
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                          {entry.montant.toFixed(2)} DH
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-gray-400" />
                            {formatDateSimple(entry.jour)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <span className="inline-flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-gray-400" />
                            {formatDateTimeWithHour(entry.openedAt)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">{entry.createdByName}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              handleDelete(entry).catch(() => {
                                showError('Erreur lors de la suppression.');
                              });
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FondCaissePage;
