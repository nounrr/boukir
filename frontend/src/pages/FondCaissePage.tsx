import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  DollarSign,
  Eye,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { showError, showSuccess } from '../utils/notifications';

type FondCaisseEntry = {
  id: number;
  montant: number;
  entryType: 'caisse_initial' | 'coffre_initial' | 'transfer_to_coffre' | 'transfer_to_poche' | 'coffre_transfer_to_poche';
  modePaiement?: 'Espece' | 'Virement' | 'Cheque';
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
  transfertVersPoche?: number;
  transfertCoffreVersPoche?: number;
  bonChargeInclusCaisse?: number;
  bonCommandeInclusCaisse?: number;
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
  pocheTransferEntries: FondCaisseEntry[];
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
  transfertVersPoche: number;
  transfertCoffreVersPoche: number;
  bonChargeInclusCaisse: number;
  bonCommandeInclusCaisse: number;
  bonVehicule: number;
  avoirComptant: number;
};

type PaymentMode = 'Espece' | 'Virement' | 'Cheque';

type ModalKind = 'caisse' | 'coffre' | 'transfert' | 'poche';

type FondTab = 'caisse' | 'coffre';

const paymentModes: PaymentMode[] = ['Espece', 'Virement', 'Cheque'];

const ALL_DATES_FROM = '2000-01-01';

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

const modalConfig: Record<ModalKind, {
  title: string;
  subtitle: string;
  submitLabel: string;
  buttonClass: string;
  iconBg: string;
  icon: typeof Wallet;
}> = {
  caisse: {
    title: 'Debut caisse',
    subtitle: 'Fond initial de la caisse',
    submitLabel: 'Enregistrer',
    buttonClass: 'bg-blue-600 hover:bg-blue-700',
    iconBg: 'bg-emerald-100 text-emerald-700',
    icon: Wallet,
  },
  coffre: {
    title: 'Debut coffre',
    subtitle: 'Montant initial du coffre',
    submitLabel: 'Enregistrer',
    buttonClass: 'bg-amber-600 hover:bg-amber-700',
    iconBg: 'bg-amber-100 text-amber-700',
    icon: Archive,
  },
  transfert: {
    title: 'Transferer vers coffre',
    subtitle: 'Montant retire de la caisse et ajoute au coffre',
    submitLabel: 'Transferer',
    buttonClass: 'bg-slate-700 hover:bg-slate-800',
    iconBg: 'bg-slate-100 text-slate-700',
    icon: ArrowLeftRight,
  },
  poche: {
    title: 'Transferer vers poche',
    subtitle: 'Montant retire de la caisse ou du coffre',
    submitLabel: 'Transferer',
    buttonClass: 'bg-purple-700 hover:bg-purple-800',
    iconBg: 'bg-purple-100 text-purple-700',
    icon: Banknote,
  },
};

const FondCaissePage = () => {
  const navigate = useNavigate();
  const auth = useAuth() as any;
  const token: string | undefined = auth?.token;

  // Filtre date: vide = toutes les dates (par defaut)
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [entries, setEntries] = useState<FondCaisseEntry[]>([]);
  const [mouvements, setMouvements] = useState<FondCaisseMouvement[]>([]);
  const [activeModal, setActiveModal] = useState<ModalKind | null>(null);
  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState<PaymentMode>('Espece');
  const [openedAt, setOpenedAt] = useState<string>(nowLocalInput);
  const [sourcePoche, setSourcePoche] = useState<'caisse' | 'coffre'>('caisse');
  const [descriptionPoche, setDescriptionPoche] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [tick, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<FondTab>('caisse');

  const isAllDates = !dateFrom && !dateTo;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const effFrom = dateFrom || ALL_DATES_FROM;
    const effTo = dateTo || todayISO();
    const qs = `dateFrom=${effFrom}&dateTo=${effTo}`;
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
      const pocheTransferEntriesByDay = new Map<string, FondCaisseEntry[]>();
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
        if (e.entryType === 'transfer_to_poche' || e.entryType === 'coffre_transfer_to_poche') {
          const list = pocheTransferEntriesByDay.get(e.jour) || [];
          list.push(e);
          pocheTransferEntriesByDay.set(e.jour, list);
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
      pocheTransferEntriesByDay.forEach((_v, k) => allDays.add(k));
      movByDay.forEach((_v, k) => allDays.add(k));

      const sorted = Array.from(allDays).sort();
      let prev = 0;
      let prevCoffre = 0;
      const out: Row[] = sorted.map((jour) => {
        const caisseEntry = caisseEntryByDay.get(jour) || null;
        const coffreEntry = coffreEntryByDay.get(jour) || null;
        const transferEntries = transferEntriesByDay.get(jour) || [];
        const pocheTransferEntries = pocheTransferEntriesByDay.get(jour) || [];
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
          pocheTransferEntries,
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
          transfertVersPoche: num(mv.transfertVersPoche),
          transfertCoffreVersPoche: num(mv.transfertCoffreVersPoche),
          bonChargeInclusCaisse: num(mv.bonChargeInclusCaisse),
          bonCommandeInclusCaisse: num(mv.bonCommandeInclusCaisse),
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

  // Affichage liste des jours: aujourd'hui/recent vers ancien. `rows` reste chronologique pour le calcul cumule.
  const displayRows = useMemo(() => [...rows].reverse(), [rows]);

  const today = todayISO();
  const todayTotal = rows.find((r) => r.jour === today)?.total || 0;
  const todayCoffreTotal = rows.find((r) => r.jour === today)?.totalCoffre || 0;
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;

  const openModal = (kind: ModalKind) => {
    setMontant('');
    setMode('Espece');
    setOpenedAt(nowLocalInput());
    setSourcePoche('caisse');
    setDescriptionPoche('');
    setActiveModal(kind);
  };

  const closeModal = () => {
    if (!isSaving) setActiveModal(null);
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeModal) return;
    const m = Number(montant);
    if (!Number.isFinite(m) || m < 0) {
      showError('Montant invalide.');
      return;
    }
    if (!openedAt) {
      showError("Date d'ouverture requise.");
      return;
    }

    const entryType: FondCaisseEntry['entryType'] =
      activeModal === 'caisse'
        ? 'caisse_initial'
        : activeModal === 'coffre'
          ? 'coffre_initial'
          : activeModal === 'transfert'
            ? 'transfer_to_coffre'
            : sourcePoche === 'caisse'
              ? 'transfer_to_poche'
              : 'coffre_transfer_to_poche';
    const successMessage =
      activeModal === 'caisse'
        ? 'Fond de caisse enregistre.'
        : activeModal === 'coffre'
          ? 'Fond de coffre enregistre.'
          : activeModal === 'transfert'
            ? 'Transfert vers coffre enregistre.'
            : 'Transfert vers poche enregistre.';

    setIsSaving(true);
    try {
      const res = await fetch('/api/fond-caisse/entries', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montant: m,
          openedAt,
          entryType,
          modePaiement: mode,
          note: activeModal === 'poche' ? descriptionPoche : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Erreur sauvegarde');
      setTick((t) => t + 1);
      showSuccess(successMessage);
      setActiveModal(null);
    } catch (err: any) {
      showError(err?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeConfig = activeModal ? modalConfig[activeModal] : null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900">Fond de caisse</h1>
        <p className="mt-1 text-gray-600">Calcul journalier: debut + entrees - sorties.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(modalConfig) as ModalKind[]).map((kind) => {
            const cfg = modalConfig[kind];
            const Icon = cfg.icon;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => openModal(kind)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${cfg.buttonClass}`}
              >
                <Icon className="h-4 w-4" />
                {cfg.title}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            title="Du"
          />
          <span className="text-sm text-gray-500">au</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            title="Au"
          />
          {isAllDates ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Toutes les dates
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <X className="h-3.5 w-3.5" />
              Toutes les dates
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total caisse du jour</p>
          <p className="text-2xl font-bold text-gray-900">{todayTotal.toFixed(2)} DH</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total coffre du jour</p>
          <p className="text-2xl font-bold text-gray-900">{todayCoffreTotal.toFixed(2)} DH</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Jours affiches</p>
          <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Dernier solde caisse / coffre</p>
          <p className="text-2xl font-bold text-gray-900">
            {(lastRow?.total || 0).toFixed(2)} / {(lastRow?.totalCoffre || 0).toFixed(2)} DH
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {activeTab === 'caisse' ? 'Table fond caisse' : 'Table coffre'}
            </h2>
            <p className="text-sm text-gray-500">
              {activeTab === 'caisse'
                ? 'Calcul journalier de la caisse: debut + entrees - sorties.'
                : 'Calcul journalier du coffre: debut + entrees - sorties.'}
            </p>
          </div>
          <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1">
            {([
              { key: 'caisse', label: 'Fond caisse', icon: Wallet },
              { key: 'coffre', label: 'Coffre', icon: Archive },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        {isLoading && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Chargement...
          </div>
        )}
        {displayRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="text-lg font-medium text-gray-700">Aucun mouvement</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                {activeTab === 'caisse' ? (
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Jour</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Debut caisse</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Entrees caisse</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Sorties caisse</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Total caisse</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Detail</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Jour</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Debut coffre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Entrees coffre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Sorties coffre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Total coffre</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Detail</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {displayRows.map((row) => {
                  const isInitialCoffreRow = activeTab === 'coffre' && Boolean(row.coffreEntry);
                  return (
                  <tr
                    key={row.jour}
                    className={isInitialCoffreRow ? 'bg-orange-50 hover:bg-orange-100/70' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-gray-400" />
                        {row.jour}
                      </span>
                    </td>
                    {activeTab === 'caisse' ? (
                      <>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {row.debut.toFixed(2)} DH
                          {row.caisseEntry?.modePaiement && <div className="text-xs font-normal text-gray-500">{row.caisseEntry.modePaiement}</div>}
                          {!row.caisseEntry && <div className="text-xs font-normal text-gray-500">Auto depuis hier</div>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-700">
                          +{row.entrees.toFixed(2)} DH
                          <div className="mt-1 text-xs font-normal text-gray-500">Comptant: {row.bonComptantPaye.toFixed(2)}</div>
                          <div className="text-xs font-normal text-gray-500">Paiem. comptant: {row.paiementBonComptantNonPaye.toFixed(2)}</div>
                          <div className="text-xs font-normal text-gray-500">Paiem. client: {row.paiementClientCaisse.toFixed(2)}</div>
                          {row.avoirChargeInclusCaisse > 0 && (
                            <div className="text-xs font-normal text-gray-500">Avoir charge: {row.avoirChargeInclusCaisse.toFixed(2)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-700">
                          -{row.sorties.toFixed(2)} DH
                          <div className="mt-1 text-xs font-normal text-gray-500">Charges: {row.bonChargeInclusCaisse.toFixed(2)}</div>
                          <div className="text-xs font-normal text-gray-500">Commandes: {row.bonCommandeInclusCaisse.toFixed(2)}</div>
                          <div className="text-xs font-normal text-gray-500">Vehicule: {row.bonVehicule.toFixed(2)}</div>
                          <div className="text-xs font-normal text-gray-500">Avoir comptant: {row.avoirComptant.toFixed(2)}</div>
                          {row.transfertVersCoffre > 0 && (
                            <div className="text-xs font-normal text-gray-500">Vers coffre: {row.transfertVersCoffre.toFixed(2)}</div>
                          )}
                          {row.transfertVersPoche > 0 && (
                            <div className="text-xs font-normal text-gray-500">Vers poche: {row.transfertVersPoche.toFixed(2)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">{row.total.toFixed(2)} DH</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {row.debutCoffre.toFixed(2)} DH
                          {row.coffreEntry?.modePaiement && <div className="text-xs font-normal text-gray-500">{row.coffreEntry.modePaiement}</div>}
                          {!row.coffreEntry && <div className="text-xs font-normal text-gray-500">Auto depuis hier</div>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-amber-700">
                          +{row.entreesCoffre.toFixed(2)} DH
                          {row.transfertVersCoffre > 0 && (
                            <div className="mt-1 text-xs font-normal text-gray-500">Depuis caisse: {row.transfertVersCoffre.toFixed(2)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-700">
                          -{row.sortiesCoffre.toFixed(2)} DH
                          {row.transfertCoffreVersPoche > 0 && (
                            <div className="mt-1 text-xs font-normal text-gray-500">Vers poche: {row.transfertCoffreVersPoche.toFixed(2)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">{row.totalCoffre.toFixed(2)} DH</td>
                      </>
                    )}
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
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activeModal && activeConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${activeConfig.iconBg}`}>
                  <activeConfig.icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{activeConfig.title}</h2>
                  <p className="text-sm text-gray-500">{activeConfig.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form className="space-y-4 px-6 py-5" onSubmit={handleSubmitModal}>
              {activeModal === 'poche' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Transfer depuis</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['caisse', 'coffre'] as const).map((source) => (
                      <label
                        key={source}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                          sourcePoche === source
                            ? 'border-purple-300 bg-purple-50 text-purple-700'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={sourcePoche === source}
                          onChange={() => setSourcePoche(source)}
                          className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        {source === 'caisse' ? 'Caisse' : 'Coffre'}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Montant</label>
                <div className="relative">
                  <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date et heure</label>
                <input
                  type="datetime-local"
                  value={openedAt}
                  onChange={(e) => setOpenedAt(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PaymentMode)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  {paymentModes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              {activeModal === 'poche' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                  <input
                    type="text"
                    value={descriptionPoche}
                    onChange={(e) => setDescriptionPoche(e.target.value)}
                    placeholder="Description"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`flex-1 rounded-lg px-4 py-2 font-medium text-white disabled:opacity-60 ${activeConfig.buttonClass}`}
                >
                  {isSaving ? 'Enregistrement...' : activeConfig.submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FondCaissePage;
