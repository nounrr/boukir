import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, DollarSign, Eye, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';

type FondCaisseEntry = {
  id: number;
  montant: number;
  entryType: 'caisse_initial' | 'coffre_initial' | 'transfer_to_coffre';
  note?: string;
  openedAt: string;
  jour: string;
  createdByName?: string;
};

type FondCaisseMouvement = {
  jour: string;
  bonComptantPaye?: number;
  paiementBonComptantNonPaye?: number;
  paiementClientCaisse?: number;
  avoirChargeInclusCaisse?: number;
  transfertVersCoffre?: number;
  bonChargeInclusCaisse?: number;
  bonVehicule?: number;
  avoirComptant?: number;
  entrees?: number;
  sorties?: number;
  coffreEntrees?: number;
  coffreSorties?: number;
};

type Row = {
  jour: string;
  caisseEntry: FondCaisseEntry | null;
  coffreEntry: FondCaisseEntry | null;
  transferEntries: FondCaisseEntry[];
  debut: number;
  entrees: number;
  sorties: number;
  total: number;
  debutCoffre: number;
  entreesCoffre: number;
  sortiesCoffre: number;
  totalCoffre: number;
  bonComptantPaye: number;
  paiementBonComptantNonPaye: number;
  paiementClientCaisse: number;
  avoirChargeInclusCaisse: number;
  transfertVersCoffre: number;
  bonChargeInclusCaisse: number;
  bonVehicule: number;
  avoirComptant: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const nowLocalInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const FondCaissePage = () => {
  const navigate = useNavigate();
  const auth = useAuth() as any;
  const token: string | undefined = auth?.token;

  const [dateFrom, setDateFrom] = useState<string>(todayISO);
  const [dateTo, setDateTo] = useState<string>(todayISO);
  const [entries, setEntries] = useState<FondCaisseEntry[]>([]);
  const [mouvements, setMouvements] = useState<FondCaisseMouvement[]>([]);
  const [montantCaisse, setMontantCaisse] = useState('');
  const [openedAtCaisse, setOpenedAtCaisse] = useState<string>(nowLocalInput);
  const [montantCoffre, setMontantCoffre] = useState('');
  const [openedAtCoffre, setOpenedAtCoffre] = useState<string>(nowLocalInput);
  const [montantTransfert, setMontantTransfert] = useState('');
  const [openedAtTransfert, setOpenedAtTransfert] = useState<string>(nowLocalInput);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const qs = `dateFrom=${dateFrom}&dateTo=${dateTo}`;
    setIsLoading(true);
    setErrorMsg('');

    const safeFetch = async (url: string) => {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
        return data;
      } catch (err) {
        console.error('[FondCaisse] fetch', url, err);
        throw err;
      }
    };

    Promise.all([
      safeFetch(`/api/fond-caisse/entries?${qs}`),
      safeFetch(`/api/fond-caisse/mouvements?${qs}`),
    ])
      .then(([entriesRes, mouvRes]) => {
        if (cancelled) return;
        setEntries(Array.isArray(entriesRes?.data) ? entriesRes.data : []);
        setMouvements(Array.isArray(mouvRes?.data) ? mouvRes.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setMouvements([]);
        setErrorMsg('Impossible de charger les donnees.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, dateFrom, dateTo, tick]);

  const rows = useMemo<Row[]>(() => {
    try {
      const caisseEntryByDay = new Map<string, FondCaisseEntry>();
      const coffreEntryByDay = new Map<string, FondCaisseEntry>();
      const transferEntriesByDay = new Map<string, FondCaisseEntry[]>();
      const sortedEntries = [...(entries || [])].filter((e) => e && e.jour);
      sortedEntries.sort((a, b) => String(b?.openedAt || '').localeCompare(String(a?.openedAt || '')));
      for (const e of sortedEntries) {
        if (e.entryType === 'caisse_initial' && !caisseEntryByDay.has(e.jour)) caisseEntryByDay.set(e.jour, e);
        if (e.entryType === 'coffre_initial' && !coffreEntryByDay.has(e.jour)) coffreEntryByDay.set(e.jour, e);
        if (e.entryType === 'transfer_to_coffre') {
          const list = transferEntriesByDay.get(e.jour) || [];
          list.push(e);
          transferEntriesByDay.set(e.jour, list);
        }
      }

      const movByDay = new Map<string, FondCaisseMouvement>();
      for (const m of mouvements || []) {
        if (m && m.jour) movByDay.set(m.jour, m);
      }

      const allDays = new Set<string>();
      if (dateFrom && dateTo) {
        const a = new Date(`${dateFrom}T00:00:00`);
        const b = new Date(`${dateTo}T00:00:00`);
        if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
          const lo = a <= b ? a : b;
          const hi = a <= b ? b : a;
          for (let d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) {
            allDays.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
          }
        }
      }
      caisseEntryByDay.forEach((_v, k) => allDays.add(k));
      coffreEntryByDay.forEach((_v, k) => allDays.add(k));
      transferEntriesByDay.forEach((_v, k) => allDays.add(k));
      movByDay.forEach((_v, k) => allDays.add(k));

      const sorted = Array.from(allDays).sort();
      let prev = 0;
      let prevCoffre = 0;
      const out: Row[] = sorted.map((jour) => {
        const caisseEntry = caisseEntryByDay.get(jour) || null;
        const coffreEntry = coffreEntryByDay.get(jour) || null;
        const transferEntries = transferEntriesByDay.get(jour) || [];
        const mv = movByDay.get(jour) || ({} as FondCaisseMouvement);
        const debut = caisseEntry ? num(caisseEntry.montant) : prev;
        const entrees = num(mv.entrees);
        const sorties = num(mv.sorties);
        const total = debut + entrees - sorties;
        const debutCoffre = coffreEntry ? num(coffreEntry.montant) : prevCoffre;
        const entreesCoffre = num(mv.coffreEntrees);
        const sortiesCoffre = num(mv.coffreSorties);
        const totalCoffre = debutCoffre + entreesCoffre - sortiesCoffre;
        prev = total;
        prevCoffre = totalCoffre;
        return {
          jour,
          caisseEntry,
          coffreEntry,
          transferEntries,
          debut,
          entrees,
          sorties,
          total,
          debutCoffre,
          entreesCoffre,
          sortiesCoffre,
          totalCoffre,
          bonComptantPaye: num(mv.bonComptantPaye),
          paiementBonComptantNonPaye: num(mv.paiementBonComptantNonPaye),
          paiementClientCaisse: num(mv.paiementClientCaisse),
          avoirChargeInclusCaisse: num(mv.avoirChargeInclusCaisse),
          transfertVersCoffre: num(mv.transfertVersCoffre),
          bonChargeInclusCaisse: num(mv.bonChargeInclusCaisse),
          bonVehicule: num(mv.bonVehicule),
          avoirComptant: num(mv.avoirComptant),
        };
      });
      return out;
    } catch (err) {
      console.error('[FondCaisse] rows compute error', err);
      return [];
    }
  }, [entries, mouvements, dateFrom, dateTo]);

  const today = todayISO();
  const todayTotal = rows.find((r) => r.jour === today)?.total || 0;
  const todayCoffreTotal = rows.find((r) => r.jour === today)?.totalCoffre || 0;
  const periodTotal = rows.reduce((s, r) => s + r.total, 0);
  const periodCoffreTotal = rows.reduce((s, r) => s + r.totalCoffre, 0);

  const submitEntry = async ({
    montant,
    openedAt,
    entryType,
    successMessage,
  }: {
    montant: string;
    openedAt: string;
    entryType: FondCaisseEntry['entryType'];
    successMessage: string;
  }) => {
    if (!token) return;
    const m = Number(montant);
    if (!Number.isFinite(m) || m < 0) {
      showError('Montant invalide.');
      return;
    }
    if (!openedAt) {
      showError("Date d'ouverture requise.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/fond-caisse/entries', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant: m, openedAt, entryType }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Erreur sauvegarde');
      setTick((t) => t + 1);
      showSuccess(successMessage);
    } catch (err: any) {
      showError(err?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitCaisse = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitEntry({
      montant: montantCaisse,
      openedAt: openedAtCaisse,
      entryType: 'caisse_initial',
      successMessage: 'Fond de caisse enregistre.',
    });
    setMontantCaisse('');
    setOpenedAtCaisse(nowLocalInput());
  };

  const handleSubmitCoffre = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitEntry({
      montant: montantCoffre,
      openedAt: openedAtCoffre,
      entryType: 'coffre_initial',
      successMessage: 'Fond de coffre enregistre.',
    });
    setMontantCoffre('');
    setOpenedAtCoffre(nowLocalInput());
  };

  const handleSubmitTransfert = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitEntry({
      montant: montantTransfert,
      openedAt: openedAtTransfert,
      entryType: 'transfer_to_coffre',
      successMessage: 'Transfert vers coffre enregistre.',
    });
    setMontantTransfert('');
    setOpenedAtTransfert(nowLocalInput());
  };

  const handleDelete = async (entry: FondCaisseEntry) => {
    if (!token || !entry) return;
    const result = await showConfirmation(
      'Cette ligne sera supprimee.',
      `Supprimer le fond du ${entry.jour} ?`,
      'Supprimer',
      'Annuler'
    );
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`/api/fond-caisse/entries/${entry.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.message) || 'Erreur suppression');
      }
      setTick((t) => t + 1);
      showSuccess('Fond de caisse supprime.');
    } catch (err: any) {
      showError(err?.message || 'Erreur lors de la suppression.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fond de caisse</h1>
          <p className="mt-1 text-gray-600">Calcul journalier: debut + entrees - sorties.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-1">
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2">
              <Wallet className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Debut caisse</h2>
              <p className="text-sm text-gray-500">Fond initial de la caisse</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleSubmitCaisse}>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Montant</label>
              <div className="relative">
                <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montantCaisse}
                  onChange={(e) => setMontantCaisse(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date et heure</label>
              <input
                type="datetime-local"
                value={openedAtCaisse}
                onChange={(e) => setOpenedAtCaisse(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Debut coffre</h2>
            <p className="text-sm text-gray-500">Montant initial du coffre</p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmitCoffre}>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Montant</label>
              <div className="relative">
                <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montantCoffre}
                  onChange={(e) => setMontantCoffre(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date et heure</label>
              <input
                type="datetime-local"
                value={openedAtCoffre}
                onChange={(e) => setOpenedAtCoffre(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Transferer vers coffre</h2>
            <p className="text-sm text-gray-500">Montant retire de la caisse et ajoute au coffre</p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmitTransfert}>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Montant</label>
              <div className="relative">
                <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montantTransfert}
                  onChange={(e) => setMontantTransfert(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date et heure</label>
              <input
                type="datetime-local"
                value={openedAtTransfert}
                onChange={(e) => setOpenedAtTransfert(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-lg bg-slate-700 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSaving ? 'Enregistrement...' : 'Transferer'}
            </button>
          </form>
        </section>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Total caisse du jour</p>
              <p className="text-2xl font-bold text-gray-900">{todayTotal.toFixed(2)} DH</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Total coffre du jour</p>
              <p className="text-2xl font-bold text-gray-900">{todayCoffreTotal.toFixed(2)} DH</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Jours periode</p>
              <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Somme caisse / coffre</p>
              <p className="text-2xl font-bold text-gray-900">{periodTotal.toFixed(2)} / {periodCoffreTotal.toFixed(2)} DH</p>
            </div>
          </div>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Calcul journalier</h2>
            {isLoading && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Chargement...
              </div>
            )}
            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                <p className="text-lg font-medium text-gray-700">Aucun mouvement</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Jour</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Debut caisse</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Entrees caisse</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Sorties caisse</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Total caisse</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Debut coffre</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Entrees coffre</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Total coffre</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {rows.map((row) => (
                      <tr key={row.jour} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-gray-400" />
                            {row.jour}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {row.debut.toFixed(2)} DH
                          {!row.caisseEntry && <div className="text-xs font-normal text-gray-500">Auto depuis hier</div>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-700">+{row.entrees.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-700">-{row.sorties.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">{row.total.toFixed(2)} DH</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {row.debutCoffre.toFixed(2)} DH
                          {!row.coffreEntry && <div className="text-xs font-normal text-gray-500">Auto depuis hier</div>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-amber-700">+{row.entreesCoffre.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">{row.totalCoffre.toFixed(2)} DH</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/fond-caisse/${row.jour}`)}
                              title="Voir le detail"
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {row.caisseEntry && (
                              <button
                                type="button"
                                onClick={() => handleDelete(row.caisseEntry as FondCaisseEntry)}
                                title="Supprimer debut caisse"
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            {row.coffreEntry && (
                              <button
                                type="button"
                                onClick={() => handleDelete(row.coffreEntry as FondCaisseEntry)}
                                title="Supprimer debut coffre"
                                className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            {row.transferEntries.map((entry) => (
                              <button
                                type="button"
                                key={entry.id}
                                onClick={() => handleDelete(entry)}
                                title="Supprimer transfert"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

    </div>
  );
};

export default FondCaissePage;
