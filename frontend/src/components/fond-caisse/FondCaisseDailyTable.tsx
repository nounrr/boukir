import { CalendarDays, Eye, Trash2 } from 'lucide-react';
import { formatDateSimple, formatDateTimeWithHour } from '../../utils/dateUtils';
import type { DailyCaisseRow, FondCaisseEntry } from './types';

type Props = {
  rows: DailyCaisseRow[];
  isLoading: boolean;
  hasError: boolean;
  onOpenDetail: (jour: string) => void;
  onDeleteEntry: (entry: FondCaisseEntry) => void;
};

const FondCaisseDailyTable = ({ rows, isLoading, hasError, onOpenDetail, onDeleteEntry }: Props) => (
  <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-gray-900">Calcul journalier</h2>
      <p className="text-sm text-gray-500">
        Sans saisie, le debut reprend automatiquement le total de la veille.
      </p>
    </div>

    {hasError && (
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Impossible de charger les donnees du fond de caisse.
      </div>
    )}

    {isLoading && (
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Chargement du fond de caisse...
      </div>
    )}

    {rows.length === 0 ? (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
        <p className="text-lg font-medium text-gray-700">Aucun mouvement trouve</p>
        <p className="mt-1 text-sm text-gray-500">
          Enregistrez un montant ou changez la periode.
        </p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Debut</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Jour</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Entrees</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sorties</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Total caisse</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((row) => (
              <tr key={row.jour} className="hover:bg-gray-50">
                <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                  {row.debut.toFixed(2)} DH
                  {!row.entry && <div className="text-xs font-normal text-gray-500">Auto depuis hier</div>}
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-gray-400" />
                    {formatDateSimple(row.jour)}
                  </span>
                  {row.entry && (
                    <div className="mt-1 text-xs text-gray-500">
                      Saisi par {row.entry.createdByName} a {formatDateTimeWithHour(row.entry.openedAt)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">
                  <div className="font-semibold text-emerald-700">+{row.entrees.toFixed(2)} DH</div>
                  <div className="mt-1 text-xs text-gray-500">Comptant paye: {row.bonComptantPaye.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">Paiem. comptant: {row.paiementBonComptantNonPaye.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">Paiem. client caisse: {row.paiementClientCaisse.toFixed(2)}</div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">
                  <div className="font-semibold text-red-700">-{row.sorties.toFixed(2)} DH</div>
                  <div className="mt-1 text-xs text-gray-500">Charges caisse: {row.bonChargeInclusCaisse.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">Vehicule: {row.bonVehicule.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">Avoir client: {row.avoirClient.toFixed(2)}</div>
                </td>
                <td className="px-4 py-4 text-sm font-bold text-gray-900">{row.total.toFixed(2)} DH</td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(row.jour)}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
                    >
                      <Eye className="h-4 w-4" />
                      Detail
                    </button>
                  {row.entry ? (
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(row.entry!)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400">Auto</span>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default FondCaisseDailyTable;
