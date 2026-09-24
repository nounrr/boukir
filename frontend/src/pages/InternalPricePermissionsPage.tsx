import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2, Search, ShieldCheck, Users } from 'lucide-react';

import {
  useGetPagePermissionMatrixQuery,
  useUpdatePagePermissionsMutation,
  type PagePermissionEmployee,
} from '../store/api/pagePermissionsApi';

const employeeName = (employee: PagePermissionEmployee) =>
  employee.nom_complet?.trim() || employee.cin || `Employé #${employee.id}`;

const hasAccess = (employee: PagePermissionEmployee) =>
  employee.role === 'PDG' || employee.verrouille ||
  employee.permissions?.internal_prices?.view === true;

const InternalPricePermissionsPage: React.FC = () => {
  const { data, isLoading, isError, refetch } = useGetPagePermissionMatrixQuery();
  const [updatePermissions] = useUpdatePagePermissionsMutation();
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const employees = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr');
    return [...(data?.employees ?? [])]
      .filter((employee) =>
        `${employeeName(employee)} ${employee.cin ?? ''} ${employee.role ?? ''}`
          .toLocaleLowerCase('fr')
          .includes(needle),
      )
      .sort((a, b) =>
        Number(b.role === 'PDG') - Number(a.role === 'PDG') ||
        employeeName(a).localeCompare(employeeName(b), 'fr'),
      );
  }, [data?.employees, search]);

  const authorizedCount = (data?.employees ?? []).filter(hasAccess).length;

  const toggle = async (employee: PagePermissionEmployee) => {
    if (savingId !== null || employee.verrouille || employee.role === 'PDG') return;
    const nextValue = !hasAccess(employee);
    setSavingId(employee.id);
    setMessage(null);
    try {
      await updatePermissions({
        id: employee.id,
        permissions: { 'internal_prices.view': nextValue },
      }).unwrap();
      setMessage({
        kind: 'success',
        text: `${employeeName(employee)} ${nextValue ? 'peut désormais consulter' : 'ne peut plus consulter'} les prix internes.`,
      });
    } catch (error) {
      const detail = (error as { data?: { message?: string } })?.data?.message;
      setMessage({ kind: 'error', text: detail || "Impossible d'enregistrer la modification." });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 border-b border-gray-200 pb-6 sm:mb-8">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-indigo-700">Confidentialité · employés</p>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Accès aux prix internes</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              Autorisez chaque employé à voir les prix d’achat, les coûts de revient et les marges calculées
              dans les pages, les bons, les exports et les PDF.
            </p>
          </div>
        </div>
      </header>

      {message && (
        <div
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mb-5 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {message.kind === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <section aria-labelledby="employees-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 id="employees-heading" className="text-base font-bold text-gray-900">Employés</h2>
            {!isLoading && !isError && (
              <p className="mt-0.5 text-xs text-gray-600">
                {authorizedCount} autorisé{authorizedCount > 1 ? 's' : ''} sur {data?.employees.length ?? 0}
              </p>
            )}
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Rechercher par nom, CIN ou rôle</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, CIN ou rôle"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        </div>

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 px-4 text-sm text-gray-600" role="status">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Chargement des employés…
          </div>
        ) : isError ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-gray-700" role="alert">
            <AlertCircle aria-hidden="true" className="h-6 w-6 text-red-600" />
            <p>Impossible de charger les autorisations.</p>
            <button type="button" onClick={() => refetch()} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              Réessayer
            </button>
          </div>
        ) : employees.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-600">
            <Users aria-hidden="true" className="h-6 w-6 text-gray-400" />
            {search ? 'Aucun employé ne correspond à cette recherche.' : 'Aucun employé actif à afficher.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {employees.map((employee) => {
              const locked = employee.role === 'PDG' || employee.verrouille;
              const allowed = hasAccess(employee);
              const saving = savingId === employee.id;
              return (
                <li key={employee.id} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{employeeName(employee)}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-600">
                      {employee.role || 'Rôle non défini'}{employee.cin ? ` · ${employee.cin}` : ''}
                    </p>
                  </div>
                  {locked ? (
                    <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800">
                      Toujours autorisé
                    </span>
                  ) : (
                    <label className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-2 ${savingId !== null ? 'cursor-wait' : 'cursor-pointer'} focus-within:ring-2 focus-within:ring-indigo-400`}>
                      <span className={`hidden text-xs font-semibold sm:inline ${allowed ? 'text-indigo-700' : 'text-gray-600'}`}>
                        {saving ? 'Enregistrement…' : allowed ? 'Autorisé' : 'Non autorisé'}
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`Voir les prix internes pour ${employeeName(employee)}`}
                        checked={allowed}
                        disabled={savingId !== null}
                        onChange={() => toggle(employee)}
                        className="peer sr-only"
                      />
                      <span aria-hidden="true" className={`relative block h-7 w-12 rounded-full transition-colors peer-disabled:opacity-60 ${allowed ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${allowed ? 'translate-x-6' : 'translate-x-1'}`} />
                      </span>
                      {saving && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-indigo-600" />}
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="mt-4 text-xs leading-5 text-gray-600">Le PDG conserve toujours cet accès. Les changements sont enregistrés individuellement.</p>
    </main>
  );
};

export default InternalPricePermissionsPage;
