import { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Eye, FileClock, KeyRound, Loader2,
  LockKeyhole, RotateCcw, Search, ShieldCheck, UserRound, UsersRound,
} from 'lucide-react';
import {
  useGetMaalemReviewPermissionsQuery,
  useUpdateMaalemReviewPermissionsMutation,
  type MaalemReviewPermissionEmployee,
  type MaalemReviewPermissions,
} from '../store/api/maalemReviewPermissionsApi';

const CAPABILITIES: Array<{
  key: keyof MaalemReviewPermissions;
  label: string;
  shortDescription: string;
  icon: typeof Eye;
}> = [
  { key: 'view', label: 'Consulter', shortDescription: 'Accéder aux avis', icon: Eye },
  { key: 'moderate', label: 'Modérer', shortDescription: 'Publier, masquer ou rejeter', icon: ShieldCheck },
  { key: 'restore', label: 'Restaurer', shortDescription: 'Restaurer un avis masqué', icon: RotateCcw },
  { key: 'view_private_details', label: 'Détails privés', shortDescription: 'Voir les identités et l’historique', icon: LockKeyhole },
];

type RowFeedback = { kind: 'success' | 'error'; message: string };

export default function MaalemReviewPermissionsPage() {
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, RowFeedback | undefined>>({});
  const { data = [], isLoading, isFetching, isError, refetch } = useGetMaalemReviewPermissionsQuery();
  const [updatePermissions] = useUpdateMaalemReviewPermissionsMutation();
  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const employees = useMemo(
    () => data.filter((employee) => `${employee.nom_complet || ''} ${employee.cin} ${employee.role}`.toLocaleLowerCase('fr').includes(normalizedSearch)),
    [data, normalizedSearch],
  );
  const accessSummary = useMemo(() => ({
    canModerate: data.filter((employee) => employee.moderate).length,
    canRestore: data.filter((employee) => employee.restore).length,
    privateAccess: data.filter((employee) => employee.view_private_details).length,
    locked: data.filter((employee) => employee.verrouille).length,
  }), [data]);

  const toggle = async (employee: MaalemReviewPermissionEmployee, key: keyof MaalemReviewPermissions) => {
    if (employee.verrouille || savingId === employee.id) return;
    const permissions: MaalemReviewPermissions = {
      view: employee.view,
      moderate: employee.moderate,
      restore: employee.restore,
      view_private_details: employee.view_private_details,
    };
    permissions[key] = !permissions[key];
    if (key === 'view' && !permissions.view) {
      permissions.moderate = false;
      permissions.restore = false;
      permissions.view_private_details = false;
    } else if (key !== 'view' && permissions[key]) {
      permissions.view = true;
    }

    setSavingId(employee.id);
    setFeedback((current) => ({ ...current, [employee.id]: undefined }));
    try {
      await updatePermissions({ id: employee.id, permissions }).unwrap();
      setFeedback((current) => ({ ...current, [employee.id]: { kind: 'success', message: 'Permissions enregistrées' } }));
    } catch (error) {
      const message = (error as { data?: { message?: string } })?.data?.message || 'Échec de l’enregistrement';
      setFeedback((current) => ({ ...current, [employee.id]: { kind: 'error', message } }));
    } finally {
      setSavingId(null);
    }
  };

  return <div className="space-y-6 pb-12">
    <header className="border-b border-slate-200 pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Sécurité</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Permissions des avis Maalem</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Accordez uniquement les capacités nécessaires à chaque collaborateur du back-office.</p>
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm" aria-live="polite">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600 motion-reduce:animate-none" /> : <UsersRound className="h-4 w-4 text-indigo-600" />}
          <span className="font-bold tabular-nums text-slate-900">{data.length}</span>
          <span className="text-slate-500">collaborateur{data.length > 1 ? 's' : ''}{isFetching ? ' · actualisation…' : ''}</span>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-sm leading-5 text-indigo-950">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <p><strong>Règle de dépendance :</strong> « Consulter » est le droit de base. Activer une autre capacité l’active automatiquement ; le désactiver retire aussi Modérer, Restaurer et Détails privés.</p>
      </div>
    </header>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-white shadow-sm" aria-labelledby="access-summary-title">
      <div className="xl:grid xl:grid-cols-[190px_1fr]">
        <div className="flex items-center border-b border-slate-700 px-4 py-3.5 xl:border-b-0 xl:border-r"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Posture d’accès</p><h2 id="access-summary-title" className="mt-1 text-sm font-black">Matrice actuelle</h2></div></div>
        <dl className="grid grid-cols-2 gap-px bg-slate-700 xl:grid-cols-4">
          <AccessMetric label="Modération" value={accessSummary.canModerate} hint="autorisés" accent="indigo" />
          <AccessMetric label="Restauration" value={accessSummary.canRestore} hint="autorisés" accent="indigo" />
          <AccessMetric label="Données privées" value={accessSummary.privateAccess} hint="accès sensibles" accent="amber" />
          <AccessMetric label="Comptes protégés" value={accessSummary.locked} hint="non modifiables" accent="emerald" />
        </dl>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="permissions-list-title" aria-busy={isFetching}>
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="permissions-list-title" className="text-sm font-black text-slate-900">Accès par collaborateur</h2>
          <p className="mt-0.5 text-xs text-slate-500">Chaque changement est enregistré immédiatement.</p>
        </div>
        <div className="w-full sm:max-w-sm">
          <label htmlFor="permissions-search" className="mb-1.5 block text-xs font-bold text-slate-600">Rechercher un collaborateur</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input id="permissions-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, CIN ou rôle…" className="h-11 w-full rounded-xl border-slate-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
          </div>
        </div>
      </div>

      {isLoading ? <div className="space-y-3 p-4" role="status" aria-label="Chargement des permissions">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />)}</div>
      : isError ? <div className="px-5 py-14 text-center" role="alert"><AlertTriangle className="mx-auto h-9 w-9 text-red-500" /><p className="mt-3 font-bold text-red-800">Impossible de charger les permissions.</p><p className="mt-1 text-sm text-slate-600">Les droits n’ont pas été modifiés.</p><button onClick={() => refetch()} className="mt-4 min-h-11 rounded-xl border border-indigo-200 px-4 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Réessayer</button></div>
      : employees.length === 0 ? <div className="px-5 py-14 text-center"><UsersRound className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-900">{search ? 'Aucun collaborateur trouvé' : 'Aucun collaborateur disponible'}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{search ? 'Essayez un autre nom, CIN ou rôle.' : 'Les collaborateurs autorisables apparaîtront ici.'}</p>{search && <button onClick={() => setSearch('')} className="mt-4 min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Effacer la recherche</button>}</div>
      : <>
        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="no-mobile-scroll w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
              <tr><th scope="col" className="w-[260px] px-5 py-3">Collaborateur</th><th scope="col" className="w-[150px] px-4 py-3">Rôle</th>{CAPABILITIES.map(({ key, label, shortDescription }) => <th key={key} scope="col" className="w-[135px] px-4 py-3"><span className="block text-slate-600">{label}</span><span className="mt-0.5 block normal-case tracking-normal text-slate-400">{shortDescription}</span></th>)}<th scope="col" className="w-[190px] px-4 py-3">État</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">{employees.map((employee) => <PermissionRow key={employee.id} employee={employee} saving={savingId === employee.id} feedback={feedback[employee.id]} onToggle={toggle} />)}</tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 lg:hidden">{employees.map((employee) => <PermissionCard key={employee.id} employee={employee} saving={savingId === employee.id} feedback={feedback[employee.id]} onToggle={toggle} />)}</div>
      </>}
    </section>
  </div>;
}

function AccessMetric({ label, value, hint, accent }: { label: string; value: number; hint: string; accent: 'indigo' | 'amber' | 'emerald' }) {
  const accentClass = { indigo: 'bg-indigo-400', amber: 'bg-amber-400', emerald: 'bg-emerald-400' }[accent];
  return <div className="relative min-w-0 bg-slate-950 px-4 py-3.5"><span className={`absolute left-0 top-0 h-1 w-full ${accentClass}`} aria-hidden="true" /><dt className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</dt><dd className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2"><strong className="text-xl font-black tabular-nums text-white">{value}</strong><span className="truncate text-xs text-slate-400">{hint}</span></dd></div>;
}

function PermissionRow({ employee, saving, feedback, onToggle }: {
  employee: MaalemReviewPermissionEmployee;
  saving: boolean;
  feedback?: RowFeedback;
  onToggle: (employee: MaalemReviewPermissionEmployee, key: keyof MaalemReviewPermissions) => void;
}) {
  return <tr className="transition-colors hover:bg-slate-50/80">
    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate font-bold text-slate-950">{employee.nom_complet || 'Nom non renseigné'}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{employee.cin}</p></div></div></td>
    <td className="px-4 py-4"><span className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{employee.role}</span></td>
    {CAPABILITIES.map(({ key, label }) => <td key={key} className="px-4 py-4"><PermissionToggle employee={employee} permissionKey={key} label={label} saving={saving} onToggle={onToggle} /></td>)}
    <td className="px-4 py-4"><RowState employee={employee} saving={saving} feedback={feedback} /></td>
  </tr>;
}

function PermissionCard({ employee, saving, feedback, onToggle }: {
  employee: MaalemReviewPermissionEmployee;
  saving: boolean;
  feedback?: RowFeedback;
  onToggle: (employee: MaalemReviewPermissionEmployee, key: keyof MaalemReviewPermissions) => void;
}) {
  return <article className="p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><h3 className="truncate font-black text-slate-950">{employee.nom_complet || 'Nom non renseigné'}</h3><p className="mt-0.5 font-mono text-xs text-slate-500">{employee.cin}</p></div></div>
      <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">{employee.role}</span>
    </div>
    {employee.verrouille && <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4 shrink-0" /> Compte dirigeant toujours autorisé</p>}
    <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{CAPABILITIES.map(({ key, label, shortDescription, icon: Icon }) => <div key={key} className="flex min-h-[64px] items-center justify-between gap-3 px-3.5 py-2.5"><div className="flex min-w-0 items-center gap-2.5"><Icon className="h-4 w-4 shrink-0 text-slate-500" /><div><p className="text-sm font-bold text-slate-800">{label}</p><p className="text-xs text-slate-500">{shortDescription}</p></div></div><PermissionToggle employee={employee} permissionKey={key} label={label} saving={saving} onToggle={onToggle} /></div>)}</div>
    <div className="mt-3 min-h-6"><RowState employee={employee} saving={saving} feedback={feedback} hideLocked /></div>
  </article>;
}

function PermissionToggle({ employee, permissionKey, label, saving, onToggle }: {
  employee: MaalemReviewPermissionEmployee;
  permissionKey: keyof MaalemReviewPermissions;
  label: string;
  saving: boolean;
  onToggle: (employee: MaalemReviewPermissionEmployee, key: keyof MaalemReviewPermissions) => void;
}) {
  const checked = employee[permissionKey];
  return <button type="button" disabled={employee.verrouille || saving} onClick={() => onToggle(employee, permissionKey)} aria-label={`${label} pour ${employee.nom_complet || employee.cin} : ${checked ? 'activé' : 'désactivé'}`} aria-pressed={checked} className="group inline-flex h-11 w-[3.25rem] shrink-0 items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">
    <span aria-hidden="true" className={`relative h-7 w-12 rounded-full transition-colors motion-reduce:transition-none ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></span>
  </button>;
}

function RowState({ employee, saving, feedback, hideLocked = false }: { employee: MaalemReviewPermissionEmployee; saving: boolean; feedback?: RowFeedback; hideLocked?: boolean }) {
  return <div className="text-xs font-semibold" aria-live="polite">
    {saving ? <span className="inline-flex items-center gap-1.5 text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-indigo-600 motion-reduce:animate-none" /> Enregistrement…</span>
    : employee.verrouille && !hideLocked ? <span className="inline-flex items-center gap-1.5 text-emerald-700"><ShieldCheck className="h-4 w-4" /> Toujours autorisé</span>
    : feedback ? <span className={`inline-flex items-start gap-1.5 ${feedback.kind === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{feedback.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}{feedback.message}</span>
    : !employee.verrouille ? <span className="inline-flex items-center gap-1.5 text-slate-500"><FileClock className="h-4 w-4" /> À jour</span>
    : null}
  </div>;
}
