import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { formatDateTimeWithHour } from '../../utils/dateUtils';
import type { FondCaisseAction } from './types';

type Props = {
  actions: FondCaisseAction[];
  isLoading: boolean;
  hasError: boolean;
};

const fmt = (value: number) => `${Number(value || 0).toFixed(2)} DH`;

const FondCaisseActionsTable = ({ actions, isLoading, hasError }: Props) => (
  <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-gray-200 px-5 py-4">
      <h2 className="text-lg font-semibold text-gray-900">Actions du jour</h2>
      <p className="text-sm text-gray-500">Historique complet lie au fond de caisse.</p>
    </div>

    {hasError && (
      <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Impossible de charger le detail du jour.
      </div>
    )}

    {isLoading ? (
      <div className="p-5 text-sm text-blue-700">Chargement du detail...</div>
    ) : actions.length === 0 ? (
      <div className="px-6 py-14 text-center text-gray-500">Aucune action pour ce jour.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Heure</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Reference</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Client / Source</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Statut</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Montant</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Total cumule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {actions.map((action) => {
              const isEntry = action.direction === 'ENTREE';
              return (
                <tr key={action.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatDateTimeWithHour(action.date)}
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
                        <p className="text-xs text-gray-500">{action.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{action.reference || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{action.actor || '-'}</td>
                  <td className="px-4 py-3">
                    {action.statut ? (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {action.statut}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${isEntry ? 'text-emerald-700' : 'text-red-700'}`}>
                    {isEntry ? '+' : '-'}{fmt(action.amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(action.cumulative)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default FondCaisseActionsTable;
