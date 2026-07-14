import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Calculator,
  CalendarDays,
  ListChecks,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import BonFormModal from '../components/BonFormModal';
import ChargeEditFormModal from '../components/ChargeEditFormModal';

type Action = {
  id: string;
  sourceTable: string;
  sourceId: number;
  date: string;
  type: string;
  direction: 'ENTREE' | 'SORTIE';
  amount: number;
  signedAmount: number;
  cumulative: number;
  reference: string;
  actor: string;
  statut: string;
  modePaiement?: string;
  description: string;
};

type EditableBonType = 'Commande' | 'Comptant' | 'Charge' | 'AvoirCharge' | 'Vehicule' | 'AvoirComptant';

const bonActionConfig: Record<string, { type: EditableBonType; endpoint: (id: number) => string }> = {
  bons_comptant: { type: 'Comptant', endpoint: (id) => `/api/comptant/${id}?includeCalc=1` },
  paiement_boncomptant_nonpaye: { type: 'Comptant', endpoint: (id) => `/api/comptant/${id}?includeCalc=1` },
  remise_bon_comptant: { type: 'Comptant', endpoint: (id) => `/api/comptant/${id}?includeCalc=1` },
  bons_charge: { type: 'Charge', endpoint: (id) => `/api/charges/${id}` },
  avoirs_charge: { type: 'AvoirCharge', endpoint: (id) => `/api/charges/${id}?type=avoir` },
  bons_commande: { type: 'Commande', endpoint: (id) => `/api/commandes/${id}` },
  bons_vehicule: { type: 'Vehicule', endpoint: (id) => `/api/bons_vehicule/${id}` },
  avoirs_comptant: { type: 'AvoirComptant', endpoint: (id) => `/api/avoirs_comptant/${id}?includeCalc=1` },
};

type Summary = {
  totalEntrees: number;
  totalSorties: number;
  totalCumule: number;
  actionsCount: number;
};

const emptySummary: Summary = {
  totalEntrees: 0,
  totalSorties: 0,
  totalCumule: 0,
  actionsCount: 0,
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: number) => `${num(v).toFixed(2)} DH`;

const pad = (n: number) => String(n).padStart(2, '0');

const isInitialCaisseAction = (action: Action) =>
  action.sourceTable === 'fond_caisse_entries'
  && (action.type === 'Fond initial caisse' || String(action.reference || '').startsWith('FC-'));

const isInitialCoffreAction = (action: Action) =>
  action.sourceTable === 'coffre'
  && (action.type === 'Fond initial coffre' || String(action.reference || '').startsWith('COF-'));

const getActionRowClass = (action: Action) => {
  if (isInitialCaisseAction(action)) return 'bg-emerald-50 hover:bg-emerald-100/70';
  if (isInitialCoffreAction(action)) return 'bg-orange-50 hover:bg-orange-100/70';
  return 'hover:bg-gray-50';
};

const canDeleteAction = (action: Action) =>
  action.sourceTable === 'fond_caisse_entries' || action.sourceTable === 'coffre';

const canOpenBonAction = (action: Action) => Boolean(bonActionConfig[action.sourceTable]);

const isValidatedStatus = (statut?: string) =>
  String(statut || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valid');

const parseItems = (items: any) => {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const formatDateLong = (iso: string) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatDateTime = (value: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const FondCaisseDetailPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const date = params.date || '';
  const auth = useAuth() as any;
  const token: string | undefined = auth?.token;

  const [actions, setActions] = useState<Action[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ENTREE' | 'SORTIE'>('ALL');
  const [tick, setTick] = useState(0);
  const [selectedBon, setSelectedBon] = useState<any>(null);
  const [selectedBonType, setSelectedBonType] = useState<EditableBonType | null>(null);
  const [isBonLoading, setIsBonLoading] = useState(false);
  const [isViewBonOpen, setIsViewBonOpen] = useState(false);
  const [isEditBonOpen, setIsEditBonOpen] = useState(false);

  useEffect(() => {
    if (!token || !date) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMsg('');

    fetch(`/api/fond-caisse/days/${encodeURIComponent(date)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error((data && data.message) || `HTTP ${r.status}`);
        return data;
      })
      .then((payload) => {
        if (cancelled) return;
        setActions(Array.isArray(payload?.data) ? payload.data : []);
        setSummary({ ...emptySummary, ...(payload?.summary || {}) });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[FondCaisseDetail] load error', err);
        setActions([]);
        setSummary(emptySummary);
        setErrorMsg(err?.message || 'Impossible de charger le detail.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, date, tick]);

  const handleDeleteAction = async (action: Action) => {
    if (!token || !canDeleteAction(action)) return;
    const result = await showConfirmation(
      'Cette ligne sera supprimee.',
      `Supprimer ${action.reference || action.type} ?`,
      'Supprimer',
      'Annuler'
    );
    if (!result.isConfirmed) return;

    const deleteId = action.sourceTable === 'coffre' ? -Math.abs(action.sourceId) : action.sourceId;
    try {
      const res = await fetch(`/api/fond-caisse/entries/${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.message) || 'Erreur suppression');
      }
      showSuccess('Ligne supprimee.');
      setTick((t) => t + 1);
    } catch (err: any) {
      showError(err?.message || 'Erreur lors de la suppression.');
    }
  };

  const handleOpenBon = async (action: Action) => {
    const config = bonActionConfig[action.sourceTable];
    if (!token || !config) return;
    setIsBonLoading(true);
    try {
      const res = await fetch(config.endpoint(action.sourceId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Erreur chargement bon');
      const bon = {
        ...(data || {}),
        id: data?.id ?? action.sourceId,
        type: config.type,
        numero: data?.numero || action.reference,
        statut: data?.statut || action.statut,
      };
      setSelectedBon(bon);
      setSelectedBonType(config.type);
      if (isValidatedStatus(bon.statut)) {
        setIsViewBonOpen(true);
      } else {
        setIsEditBonOpen(true);
      }
    } catch (err: any) {
      showError(err?.message || 'Impossible de charger ce bon.');
    } finally {
      setIsBonLoading(false);
    }
  };

  const closeBonPopups = () => {
    setIsViewBonOpen(false);
    setIsEditBonOpen(false);
    setSelectedBon(null);
    setSelectedBonType(null);
  };

  const filteredActions = useMemo(() => {
    const scoped = filter === 'ALL' ? actions : actions.filter((a) => a.direction === filter);
    return [...scoped].sort((a, b) => {
      const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (byDate !== 0) return byDate;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [actions, filter]);

  const cards = [
    {
      label: 'Entrees',
      value: fmt(summary.totalEntrees),
      icon: ArrowUpCircle,
      color: 'bg-emerald-100 text-emerald-700',
    },
    {
      label: 'Sorties',
      value: fmt(summary.totalSorties),
      icon: ArrowDownCircle,
      color: 'bg-red-100 text-red-700',
    },
    {
      label: 'Total cumule',
      value: fmt(summary.totalCumule),
      icon: Calculator,
      color: 'bg-yellow-100 text-yellow-700',
    },
    {
      label: 'Nombre d actions',
      value: String(summary.actionsCount),
      icon: ListChecks,
      color: 'bg-blue-100 text-blue-700',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/fond-caisse')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            title="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Detail fond de caisse</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <CalendarDays className="h-4 w-4" />
              {date ? formatDateLong(date) : 'Date inconnue'}
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {(['ALL', 'ENTREE', 'SORTIE'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === opt ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {opt === 'ALL' ? 'Tous' : opt === 'ENTREE' ? 'Entrees' : 'Sorties'}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <section
              key={card.label}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
                  <p className="text-lg font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Actions du jour</h2>
          <p className="text-sm text-gray-500">
            Liste chronologique avec total cumule de la caisse.
          </p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-blue-700">Chargement du detail...</div>
        ) : filteredActions.length === 0 ? (
          <div className="px-6 py-14 text-center text-gray-500">
            Aucune action pour ce jour.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Heure</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Reference</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Client / Source</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Mode</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Statut</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Montant</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Total cumule</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredActions.map((action) => {
                  const isEntry = action.direction === 'ENTREE';
                  return (
                    <tr
                      key={action.id}
                      className={getActionRowClass(action)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatDateTime(action.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isEntry ? (
                            <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-red-600" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{action.type}</p>
                            {action.description && (
                              <p className="text-xs text-gray-500">{action.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {canOpenBonAction(action) ? (
                          <button
                            type="button"
                            onClick={() => handleOpenBon(action)}
                            disabled={isBonLoading}
                            className="font-mono text-xs font-semibold text-blue-700 underline-offset-2 hover:underline disabled:opacity-60"
                            title="Ouvrir le bon"
                          >
                            {action.reference || '-'}
                          </button>
                        ) : (
                          action.reference || '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{action.actor || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{action.modePaiement || '-'}</td>
                      <td className="px-4 py-3">
                        {action.statut ? (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            {action.statut}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          isEntry ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {isEntry ? '+' : '-'}
                        {fmt(action.amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {fmt(action.cumulative)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canDeleteAction(action) ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteAction(action)}
                            title="Supprimer cette ligne"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    Total cumule final
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    {fmt(summary.totalCumule)}
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold text-gray-900">
                    {filteredActions.length > 0
                      ? fmt(filteredActions[filteredActions.length - 1].cumulative)
                      : fmt(0)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {isEditBonOpen && selectedBon && selectedBonType && (
        selectedBonType === 'Charge' ? (
          <ChargeEditFormModal
            isOpen={isEditBonOpen}
            onClose={closeBonPopups}
            initialValues={selectedBon}
            onBonAdded={() => {
              showSuccess('Bon mis a jour.');
              closeBonPopups();
              setTick((t) => t + 1);
            }}
          />
        ) : (
          <BonFormModal
            isOpen={isEditBonOpen}
            onClose={closeBonPopups}
            currentTab={selectedBonType as any}
            initialValues={selectedBon}
            onBonAdded={() => {
              showSuccess('Bon mis a jour.');
              closeBonPopups();
              setTick((t) => t + 1);
            }}
          />
        )
      )}

      {isViewBonOpen && selectedBon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedBon.type} {selectedBon.numero || selectedBon.id}
                </h2>
                <p className="text-sm text-gray-500">
                  Bon valide - consultation seulement
                </p>
              </div>
              <button
                type="button"
                onClick={closeBonPopups}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div>
                  <div className="text-xs text-gray-500">Date</div>
                  <div className="font-medium text-gray-900">{formatDateTime(selectedBon.date_creation || selectedBon.created_at || '')}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Client / Fournisseur</div>
                  <div className="font-medium text-gray-900">{selectedBon.client_nom || selectedBon.fournisseur_nom || selectedBon.vehicule_nom || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Statut</div>
                  <div className="font-medium text-gray-900">{selectedBon.statut || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Total</div>
                  <div className="font-medium text-gray-900">{fmt(Number(selectedBon.montant_total || 0))}</div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Produit</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">Qte</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">Prix</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parseItems(selectedBon.items).map((item: any, index: number) => (
                      <tr key={item.id || index}>
                        <td className="px-4 py-2">{item.designation || item.designation_custom || item.product_designation || '-'}</td>
                        <td className="px-4 py-2 text-right">{Number(item.quantite || 0).toFixed(3)}</td>
                        <td className="px-4 py-2 text-right">{fmt(Number(item.prix_unitaire || 0))}</td>
                        <td className="px-4 py-2 text-right font-medium">{fmt(Number(item.total || item.montant_ligne || 0))}</td>
                      </tr>
                    ))}
                    {!parseItems(selectedBon.items).length && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Aucune ligne</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeBonPopups}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FondCaisseDetailPage;
