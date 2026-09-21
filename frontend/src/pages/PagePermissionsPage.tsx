import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Search, ShieldCheck, Users } from 'lucide-react';

import {
  useGetPagePermissionMatrixQuery,
  useUpdatePagePermissionsMutation,
  type PagePermissionEmployee,
  type PagePermissionGroup,
} from '../store/api/pagePermissionsApi';
import { showError, showSuccess } from '../utils/notifications';

const displayName = (employee: { nom_complet?: string | null; cin?: string | null; id?: number }) =>
  employee.nom_complet?.trim() || employee.cin || `Employé #${employee.id ?? ''}`;

const roleRank = (role: string | null) => {
  if (role === 'PDG') return 0;
  if (role === 'ManagerPlus') return 1;
  if (role === 'Manager') return 2;
  return 3;
};

const canGroupApplyToRole = (group: PagePermissionGroup, role: string | null) => {
  if (!role) return false;
  if (role === 'PDG') return true;
  if (!group.allowedRoles) return true;
  return group.allowedRoles.includes(role);
};

/**
 * Console d'autorisations (PDG).
 *
 * Une seule page pour accorder ou retirer l'accès à chaque page protégée.
 * Les écrans d'autorisation historiques restent disponibles et écrivent les
 * mêmes données : les deux méthodes cohabitent sans conflit.
 */
const PagePermissionsPage: React.FC = () => {
  const { data, isLoading, isError, refetch } = useGetPagePermissionMatrixQuery();
  const [updatePermissions] = useUpdatePagePermissionsMutation();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [onlyAuthorized, setOnlyAuthorized] = useState(false);

  const groups = useMemo(() => data?.groups ?? [], [data?.groups]);
  const activeGroup = useMemo(
    () => groups.find((g) => g.key === activeGroupKey) ?? groups[0] ?? null,
    [groups, activeGroupKey],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase('fr');

  const employees = useMemo(() => {
    const list = data?.employees ?? [];
    return [...list]
      .filter((e) =>
        `${e.nom_complet || ''} ${e.cin || ''} ${e.role || ''}`
          .toLocaleLowerCase('fr')
          .includes(normalizedSearch),
      )
      .filter((e) => {
        if (!onlyAuthorized || !activeGroup) return true;
        if (e.verrouille) return true;
        return Object.values(e.permissions?.[activeGroup.key] ?? {}).some(Boolean);
      })
      .sort((a, b) => roleRank(a.role) - roleRank(b.role) || displayName(a).localeCompare(displayName(b), 'fr'));
  }, [data?.employees, normalizedSearch, onlyAuthorized, activeGroup]);

  const countForGroup = (group: PagePermissionGroup) =>
    (data?.employees ?? []).filter(
      (e) => !e.verrouille && Object.values(e.permissions?.[group.key] ?? {}).some(Boolean),
    ).length;

  const toggle = async (
    employee: PagePermissionEmployee,
    group: PagePermissionGroup,
    permissionKey: string,
    nextValue: boolean,
  ) => {
    const cellKey = `${employee.id}:${group.key}.${permissionKey}`;
    if (employee.verrouille || savingKey) return;

    // Retirer un droit parent retire aussi ses droits dépendants, sinon le
    // serveur refuserait la mise à jour pour dépendance non satisfaite.
    const payload: Record<string, boolean> = { [`${group.key}.${permissionKey}`]: nextValue };
    if (!nextValue) {
      group.permissions
        .filter((p) => p.requires === permissionKey)
        .forEach((child) => {
          payload[`${group.key}.${child.key}`] = false;
        });
    }
    // Accorder un droit dépendant accorde aussi son prérequis.
    const definition = group.permissions.find((p) => p.key === permissionKey);
    if (nextValue && definition?.requires) {
      payload[`${group.key}.${definition.requires}`] = true;
    }

    setSavingKey(cellKey);
    try {
      await updatePermissions({ id: employee.id, permissions: payload }).unwrap();
      showSuccess(
        nextValue
          ? `${displayName(employee)} a reçu « ${definition?.label || permissionKey} ».`
          : `« ${definition?.label || permissionKey} » retiré à ${displayName(employee)}.`,
      );
    } catch (error) {
      showError(
        (error as { data?: { message?: string } })?.data?.message || "Échec de l'enregistrement.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des autorisations…
      </div>
    );
  }

  if (isError || !activeGroup) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-sm text-gray-600">
        <p>Impossible de charger les autorisations.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Autorisations par page</h1>
          <p className="mt-1 text-sm text-gray-600">
            Choisissez une page, puis accordez ou retirez l'accès employé par employé. Le PDG garde
            toujours l'accès complet et ne peut pas être modifié ici.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {groups.map((group) => {
          const isActive = group.key === activeGroup.key;
          const count = countForGroup(group);
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => setActiveGroupKey(group.key)}
              className={`rounded-lg border px-4 py-2 text-left transition-colors ${
                isActive
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="block text-sm font-bold">{group.page}</span>
              <span className={`block text-xs ${isActive ? 'text-indigo-700' : 'text-gray-500'}`}>
                {count === 0 ? 'Aucun employé autorisé' : `${count} autorisé${count > 1 ? 's' : ''}`}
              </span>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-black text-gray-900">{activeGroup.label}</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-gray-500">{activeGroup.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <Link
                to={activeGroup.href}
                className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
              >
                Ouvrir la page <ExternalLink className="h-3 w-3" />
              </Link>
              {activeGroup.allowedRoles && (
                <span className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800">
                  Rôles éligibles : {activeGroup.allowedRoles.join(', ')}
                </span>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un employé…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <label className="inline-flex flex-none items-center gap-2 text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={onlyAuthorized}
                onChange={(e) => setOnlyAuthorized(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Autorisés seulement
            </label>
          </div>
        </div>

        {employees.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-sm text-gray-500">
            <Users className="h-6 w-6 text-gray-400" />
            Aucun employé ne correspond à cette recherche.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Employé</th>
                  <th className="px-4 py-3">Rôle</th>
                  {activeGroup.permissions.map((permission) => (
                    <th key={permission.key} className="px-4 py-3" title={permission.description}>
                      {permission.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((employee) => {
                  const applicable = canGroupApplyToRole(activeGroup, employee.role);
                  return (
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
                      {activeGroup.permissions.map((permission) => {
                        const value = Boolean(
                          employee.permissions?.[activeGroup.key]?.[permission.key],
                        );
                        const cellKey = `${employee.id}:${activeGroup.key}.${permission.key}`;
                        const disabled =
                          employee.verrouille || !applicable || savingKey === cellKey;
                        return (
                          <td key={permission.key} className="px-4 py-3">
                            {employee.verrouille ? (
                              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                                Toujours autorisé
                              </span>
                            ) : !applicable ? (
                              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-500">
                                Non applicable
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => toggle(employee, activeGroup, permission.key, !value)}
                                aria-pressed={value}
                                aria-label={`${permission.label} pour ${displayName(employee)}`}
                                className="disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <span
                                  className={`relative block h-6 w-11 rounded-full transition-colors ${
                                    value ? 'bg-blue-600' : 'bg-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                      value ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-gray-500">
        Les pages d'autorisation existantes restent disponibles et modifient les mêmes données.
        Une modification faite ici apparaît immédiatement sur ces pages, et l'inverse est vrai.
      </p>
    </div>
  );
};

export default PagePermissionsPage;
