import { useMemo, useState } from 'react';
import { Loader2, Search, ShieldCheck } from 'lucide-react';

import {
  useGetStatsDetailsPermissionsQuery,
  useUpdateStatsDetailsPermissionsMutation,
  type StatsDetailsPermissionEmployee,
} from '../../store/api/statsApi';
import { showError, showSuccess } from '../../utils/notifications';

const displayName = (employee: { nom_complet?: string | null; cin?: string | null; id?: number }) =>
  employee.nom_complet?.trim() || employee.cin || `Employé #${employee.id ?? ''}`;

/**
 * Panneau PDG : désigner les employés autorisés à ouvrir la page
 * « Statistiques détaillées ». L'employé autorisé consulte les matrices
 * produits / clients ; seul le PDG peut accorder ou retirer cet accès.
 */
const StatsDetailsAccessPanel = () => {
  const [collapsed, setCollapsed] = useState(true);
  const { data = [], isLoading, isError, refetch } = useGetStatsDetailsPermissionsQuery();
  const [updatePermissions] = useUpdateStatsDetailsPermissionsMutation();
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const employees = useMemo(
    () =>
      data.filter((e) =>
        `${e.nom_complet || ''} ${e.cin || ''} ${e.role || ''}`
          .toLocaleLowerCase('fr')
          .includes(normalizedSearch),
      ),
    [data, normalizedSearch],
  );
  const authorizedCount = data.filter((e) => e.consultation && !e.verrouille).length;

  const toggle = async (employee: StatsDetailsPermissionEmployee) => {
    if (employee.verrouille || savingId === employee.id) return;
    setSavingId(employee.id);
    try {
      await updatePermissions({
        id: employee.id,
        permissions: { consultation: !employee.consultation },
      }).unwrap();
      showSuccess(
        employee.consultation
          ? `${displayName(employee)} n'a plus accès aux statistiques détaillées.`
          : `${displayName(employee)} peut désormais consulter les statistiques détaillées.`,
      );
    } catch (error) {
      showError(
        (error as { data?: { message?: string } })?.data?.message || "Échec de l'enregistrement.",
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-indigo-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-indigo-50/40 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-black text-gray-900">
              Autorisation d'accès aux statistiques détaillées
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              L'employé autorisé peut ouvrir cette page et consulter les matrices produits / clients
              (quantités, montants, remises, profits). Seul le PDG accorde ou retire cet accès.
            </p>
            <p className="mt-1 text-xs font-semibold text-indigo-700">
              {authorizedCount === 0
                ? 'Aucun employé autorisé pour le moment.'
                : `${authorizedCount} employé${authorizedCount > 1 ? 's' : ''} autorisé${authorizedCount > 1 ? 's' : ''}.`}
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un employé…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex-none rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {collapsed ? 'Gérer' : 'Masquer'}
          </button>
        </div>
      </div>

      {collapsed ? null : isError ? (
        <div className="flex flex-col items-center gap-3 p-8 text-sm text-gray-600">
          <p>Impossible de charger les autorisations.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Réessayer
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des accès…
        </div>
      ) : employees.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">Aucun employé trouvé.</div>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">Employé</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Accès à la page</th>
                <th className="px-4 py-3">Gestion des accès</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-bold text-gray-900">{displayName(employee)}</p>
                    <p className="font-mono text-xs text-gray-500">{employee.cin}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700">
                      {employee.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={employee.verrouille || savingId === employee.id}
                      onClick={() => toggle(employee)}
                      aria-pressed={employee.consultation}
                      aria-label={`Accès aux statistiques détaillées pour ${displayName(employee)}`}
                      className="disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={`relative block h-6 w-11 rounded-full transition-colors ${
                          employee.consultation ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            employee.consultation ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </span>
                    </button>
                    {employee.verrouille && (
                      <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                        Toujours autorisé
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {employee.gestion ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                        PDG · accès complet
                      </span>
                    ) : (
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-500">
                        Réservée au PDG
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default StatsDetailsAccessPanel;
