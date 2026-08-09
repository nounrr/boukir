import React, { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  useGetClientCollaborationPermissionEmployeesQuery,
  useUpdateClientCollaborationPermissionsMutation,
  type ClientCollaborationEmployee,
} from '../store/api/clientCollaborationPermissionsApi';

const readError = (error: unknown) => {
  const candidate = error as { data?: { message?: string }; error?: string };
  return candidate?.data?.message || candidate?.error || 'Impossible d’enregistrer les permissions.';
};

const PermissionSwitch: React.FC<{
  checked: boolean;
  disabled: boolean;
  label: string;
  tone: 'indigo' | 'amber';
  onChange: () => void;
}> = ({ checked, disabled, label, tone, onChange }) => {
  const activeClass = tone === 'indigo' ? 'bg-indigo-600' : 'bg-amber-500';
  const focusClass = tone === 'indigo' ? 'focus:ring-indigo-500' : 'focus:ring-amber-500';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${focusClass} ${checked ? activeClass : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
};

const ClientCollaborationPermissionsPage: React.FC = () => {
  const { data: employees = [], isLoading, isFetching, isError, refetch } =
    useGetClientCollaborationPermissionEmployeesQuery();
  const [updatePermissions] = useUpdateClientCollaborationPermissionsMutation();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, { type: 'success' | 'error'; text: string }>>({});
  const [permissionOverrides, setPermissionOverrides] = useState<Record<number, {
    commentaires_clients: boolean;
    rappels_clients: boolean;
  }>>({});

  const displayedEmployees = useMemo(
    () => employees.map((employee) => ({ ...employee, ...(permissionOverrides[employee.id] || {}) })),
    [employees, permissionOverrides]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr');
    return displayedEmployees.filter((employee) => {
      if (role !== 'all' && employee.role !== role) return false;
      if (!needle) return true;
      return `${employee.nom_complet || ''} ${employee.cin || ''}`.toLocaleLowerCase('fr').includes(needle);
    });
  }, [displayedEmployees, search, role]);

  const commentsAuthorized = displayedEmployees.filter((employee) => employee.commentaires_clients).length;
  const remindersAuthorized = displayedEmployees.filter((employee) => employee.rappels_clients).length;

  React.useEffect(() => {
    setPermissionOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const employee of employees) {
        const override = current[employee.id];
        if (
          override
          && employee.commentaires_clients === override.commentaires_clients
          && employee.rappels_clients === override.rappels_clients
        ) {
          delete next[employee.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [employees]);

  const changePermission = async (
    employee: ClientCollaborationEmployee,
    field: 'commentaires_clients' | 'rappels_clients'
  ) => {
    if (employee.verrouille || savingId !== null) return;
    const previousOverride = permissionOverrides[employee.id];
    const nextPermissions = {
      commentaires_clients: field === 'commentaires_clients'
        ? !employee.commentaires_clients
        : employee.commentaires_clients,
      rappels_clients: field === 'rappels_clients'
        ? !employee.rappels_clients
        : employee.rappels_clients,
    };
    const capabilityName = field === 'commentaires_clients' ? 'Commentaires' : 'Rappels';
    const finalState = nextPermissions[field] ? 'autorisés' : 'désactivés';

    setSavingId(employee.id);
    setFeedback((current) => {
      const next = { ...current };
      delete next[employee.id];
      return next;
    });
    setPermissionOverrides((current) => ({
      ...current,
      [employee.id]: nextPermissions,
    }));
    try {
      await updatePermissions({
        id: employee.id,
        ...nextPermissions,
      }).unwrap();
      setFeedback((current) => ({
        ...current,
        [employee.id]: { type: 'success', text: `${capabilityName} ${finalState} — enregistré` },
      }));
    } catch (error) {
      setPermissionOverrides((current) => {
        const next = { ...current };
        if (previousOverride) next[employee.id] = previousOverride;
        else delete next[employee.id];
        return next;
      });
      setFeedback((current) => ({ ...current, [employee.id]: { type: 'error', text: readError(error) } }));
    } finally {
      setSavingId(null);
    }
  };

  const capability = (
    employee: ClientCollaborationEmployee,
    field: 'commentaires_clients' | 'rappels_clients',
    tone: 'indigo' | 'amber',
    label: string
  ) => {
    const checked = employee[field];
    const busy = savingId === employee.id;
    return (
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <PermissionSwitch
          checked={checked}
          disabled={employee.verrouille || savingId !== null}
          label={`${label} — ${employee.nom_complet || employee.cin}`}
          tone={tone}
          onChange={() => changePermission(employee, field)}
        />
        <span className={`text-xs font-semibold ${checked ? 'text-emerald-700' : 'text-slate-500'}`}>
          {busy ? 'En cours…' : employee.verrouille ? 'Toujours autorisé' : checked ? 'Autorisé' : 'Non autorisé'}
        </span>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Administration PDG</p>
            <h1 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">Accès commentaires & rappels</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Autorisez individuellement les responsables à consulter et gérer les échanges ou les rappels clients.
              Les autres données clients restent régies par leur rôle.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3"><MessageSquare className="h-5 w-5 text-indigo-600" /><span className="text-sm font-semibold text-slate-700">Commentaires autorisés</span></div>
          {isLoading ? <span className="h-8 w-10 animate-pulse rounded bg-indigo-100" aria-label="Chargement du total commentaires" />
            : isError ? <span className="text-2xl font-bold text-slate-400" title="Total indisponible" aria-label="Total commentaires indisponible">—</span>
            : <span className="text-2xl font-bold text-indigo-700">{commentsAuthorized}</span>}
        </div>
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3"><Bell className="h-5 w-5 text-amber-600" /><span className="text-sm font-semibold text-slate-700">Rappels autorisés</span></div>
          {isLoading ? <span className="h-8 w-10 animate-pulse rounded bg-amber-100" aria-label="Chargement du total rappels" />
            : isError ? <span className="text-2xl font-bold text-slate-400" title="Total indisponible" aria-label="Total rappels indisponible">—</span>
            : <span className="text-2xl font-bold text-amber-700">{remindersAuthorized}</span>}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher par nom ou CIN</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom ou CIN…" className="w-full rounded-lg border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
          </label>
          <label>
            <span className="sr-only">Filtrer par rôle</span>
            <select value={role} onChange={(event) => setRole(event.target.value)} className="w-full rounded-lg border-slate-300 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-44">
              <option value="all">Tous les rôles</option>
              <option value="PDG">PDG</option>
              <option value="ManagerPlus">ManagerPlus</option>
              <option value="Manager">Manager</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4" aria-label="Chargement des permissions">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : isError ? (
          <div className="px-5 py-14 text-center">
            <ShieldCheck className="mx-auto h-9 w-9 text-red-300" />
            <p className="mt-3 text-sm font-bold text-red-700">Impossible de charger les permissions.</p>
            <button type="button" onClick={() => refetch()} className="mt-3 text-sm font-semibold text-indigo-700 hover:underline">Réessayer</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <UserCheck className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">Aucun employé éligible trouvé.</p>
            <p className="mt-1 text-xs text-slate-500">Modifiez la recherche ou le filtre de rôle.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-5 py-3">Employé</th><th className="px-4 py-3">Rôle</th><th className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-indigo-700"><MessageSquare className="h-4 w-4" /> Commentaires</span></th><th className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-amber-700"><Bell className="h-4 w-4" /> Rappels</span></th><th className="px-5 py-3">État</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((employee) => (
                    <tr key={employee.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-5 py-4"><p className="font-bold text-slate-900">{employee.nom_complet || 'Nom non renseigné'}</p><p className="mt-0.5 font-mono text-xs text-slate-500">CIN {employee.cin}</p></td>
                      <td className="px-4 py-4"><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">{employee.role}</span></td>
                      <td className="px-4 py-4">{capability(employee, 'commentaires_clients', 'indigo', 'Accès aux commentaires')}</td>
                      <td className="px-4 py-4">{capability(employee, 'rappels_clients', 'amber', 'Accès aux rappels')}</td>
                      <td className="px-5 py-4 text-xs" aria-live="polite">
                        {savingId === employee.id ? <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement</span>
                          : feedback[employee.id]?.type === 'error' ? <span className="font-semibold text-red-700">{feedback[employee.id].text}</span>
                          : feedback[employee.id] ? <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {feedback[employee.id].text}</span>
                          : employee.verrouille ? <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Toujours autorisé</span> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {filtered.map((employee) => (
                <article key={employee.id} className="p-4">
                  <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{employee.nom_complet || 'Nom non renseigné'}</h2><p className="mt-0.5 font-mono text-xs text-slate-500">CIN {employee.cin}</p></div><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">{employee.role}</span></div>
                  <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div><p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-indigo-700"><MessageSquare className="h-3.5 w-3.5" /> Commentaires clients</p>{capability(employee, 'commentaires_clients', 'indigo', 'Accès aux commentaires')}</div>
                    <div className="border-t border-slate-200 pt-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-700"><Bell className="h-3.5 w-3.5" /> Rappels clients</p>{capability(employee, 'rappels_clients', 'amber', 'Accès aux rappels')}</div>
                  </div>
                  {(savingId === employee.id || feedback[employee.id] || employee.verrouille) && <p className={`mt-2 text-xs font-semibold ${feedback[employee.id]?.type === 'error' ? 'text-red-700' : 'text-emerald-700'}`} aria-live="polite">{savingId === employee.id ? 'Enregistrement…' : feedback[employee.id]?.text || 'Toujours autorisé'}</p>}
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ClientCollaborationPermissionsPage;
