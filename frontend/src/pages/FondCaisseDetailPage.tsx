import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Calculator,
  CalendarDays,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '../hooks/redux';

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
  }, [token, date]);

  const filteredActions = useMemo(() => {
    if (filter === 'ALL') return actions;
    return actions.filter((a) => a.direction === filter);
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredActions.map((action) => {
                  const isEntry = action.direction === 'ENTREE';
                  return (
                    <tr key={action.id} className="hover:bg-gray-50">
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
                        {action.reference || '-'}
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
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default FondCaisseDetailPage;
