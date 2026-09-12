import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AbsenceLoadError from '../components/absences/AbsenceLoadError';
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2, Clock, Loader2, Pencil,
  Plus, Search, ShieldCheck, Trash2, TrendingDown, UserRound, Users, X,
} from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import {
  useCreateAbsencesMutation,
  useDeleteAbsenceMutation,
  useGetAbsenceConfigQuery,
  useGetAbsenceEmployeesQuery,
  useGetAbsencePermissionsQuery,
  useGetAbsencesQuery,
  useGetMyAbsencePermissionsQuery,
  useUpdateAbsenceMutation,
  useUpdateAbsencePermissionsMutation,
  type Absence,
  type AbsencePermissionEmployee,
  type AbsencePermissions,
  type AbsenceType,
} from '../store/api/absencesApi';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const currentMonthKey = () => todayKey().slice(0, 7);

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });

const fmtMAD = (n: number) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`;

const displayName = (employee: { nom_complet?: string | null; cin?: string | null; id?: number }) =>
  employee.nom_complet || employee.cin || `#${employee.id ?? '—'}`;

const AccessDenied: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-6">
    <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
      <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
      <h2 className="mt-3 text-xl font-bold text-red-700">Accès refusé</h2>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
    </div>
  </div>
);

// ==================== MODALE D'AJOUT / MODIFICATION ====================
type FormState = {
  employe_ids: number[];
  date_absence: string;
  type_absence: AbsenceType;
  heure_entree: string;
  motif: string;
};

const AbsenceFormModal: React.FC<{
  editing: Absence | null;
  penaliteJour: number;
  heureReference: string;
  heuresParJour: number;
  onClose: () => void;
}> = ({ editing, penaliteJour, heureReference, heuresParJour, onClose }) => {
  const { data: employees = [], isLoading: employeesLoading, isError: employeesError, refetch: retryEmployees } = useGetAbsenceEmployeesQuery();
  const [createAbsences, { isLoading: creating }] = useCreateAbsencesMutation();
  const [updateAbsence, { isLoading: updating }] = useUpdateAbsenceMutation();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState>({
    employe_ids: editing ? [editing.employe_id] : [],
    date_absence: editing?.date_absence || todayKey(),
    type_absence: editing?.type_absence || 'totale',
    heure_entree: editing?.heure_entree || '09:00',
    motif: editing?.motif || '',
  });

  const saving = creating || updating;
  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const filtered = useMemo(
    () => employees.filter((e) => `${e.nom_complet || ''} ${e.cin || ''} ${e.role || ''}`.toLocaleLowerCase('fr').includes(normalizedSearch)),
    [employees, normalizedSearch],
  );

  // Aperçu de la retenue appliquée : 100 DH pour une journée, prorata horaire sinon.
  const retenue = useMemo(() => {
    if (form.type_absence === 'totale') return penaliteJour;
    const toMinutes = (t: string) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const start = toMinutes(heureReference.slice(0, 5));
    const arrival = toMinutes(form.heure_entree);
    if (start === null || arrival === null) return 0;
    const dayMinutes = heuresParJour * 60;
    const late = Math.max(0, Math.min(arrival - start, dayMinutes));
    return Math.round((penaliteJour * late) / dayMinutes * 100) / 100;
  }, [form.type_absence, form.heure_entree, penaliteJour, heureReference, heuresParJour]);

  const toggleEmployee = (id: number) => {
    if (editing) return;
    setForm((f) => ({
      ...f,
      employe_ids: f.employe_ids.includes(id) ? f.employe_ids.filter((x) => x !== id) : [...f.employe_ids, id],
    }));
  };

  const toggleAllFiltered = () => {
    if (editing) return;
    const ids = filtered.map((e) => e.id);
    const allSelected = ids.length > 0 && ids.every((id) => form.employe_ids.includes(id));
    setForm((f) => ({
      ...f,
      employe_ids: allSelected
        ? f.employe_ids.filter((id) => !ids.includes(id))
        : Array.from(new Set([...f.employe_ids, ...ids])),
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing && form.employe_ids.length === 0) {
      showError('Sélectionnez au moins un employé.');
      return;
    }
    try {
      if (editing) {
        await updateAbsence({
          id: editing.id,
          date_absence: form.date_absence,
          type_absence: form.type_absence,
          heure_entree: form.type_absence === 'partielle' ? form.heure_entree : null,
          motif: form.motif || null,
        }).unwrap();
        showSuccess('Absence mise à jour.');
      } else {
        const result = await createAbsences({
          employe_ids: form.employe_ids,
          date_absence: form.date_absence,
          type_absence: form.type_absence,
          heure_entree: form.type_absence === 'partielle' ? form.heure_entree : null,
          motif: form.motif || null,
        }).unwrap();
        showSuccess(
          `${result.enregistres} absence(s) enregistrée(s) — retenue de ${fmtMAD(result.montant_retenue_unitaire)} par employé.`,
        );
      }
      onClose();
    } catch (error) {
      showError((error as { data?: { message?: string } })?.data?.message || 'Enregistrement impossible.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="absence-form-title"
        onSubmit={submit}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="absence-form-title" className="text-lg font-bold text-gray-900">
              {editing ? 'Modifier l’absence' : 'Marquer une absence'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {editing ? displayName(editing) : 'Sélection multiple : une même absence pour plusieurs employés.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {!editing && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-bold text-gray-800">
                  Employés concernés
                  <span className="ml-2 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                    {form.employe_ids.length} sélectionné{form.employe_ids.length > 1 ? 's' : ''}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={toggleAllFiltered}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  Tout sélectionner / désélectionner
                </button>
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, CIN ou rôle…"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                {employeesError ? <AbsenceLoadError message="Impossible de charger les employés." onRetry={retryEmployees} /> : employeesLoading ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement des employés…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">Aucun employé trouvé.</div>
                ) : (
                  filtered.map((employee) => {
                    const checked = form.employe_ids.includes(employee.id);
                    return (
                      <label
                        key={employee.id}
                        className={`flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0 ${
                          checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmployee(employee.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                          <UserRound className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">{displayName(employee)}</span>
                          <span className="block truncate text-xs text-gray-500">{employee.cin} · {employee.role || '—'}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">Date</label>
              <input
                type="date"
                required
                value={form.date_absence}
                onChange={(e) => setForm((f) => ({ ...f, date_absence: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">Type d’absence</label>
              <div className="grid grid-cols-2 gap-2">
                {(['totale', 'partielle'] as AbsenceType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={form.type_absence === type}
                    onClick={() => setForm((f) => ({ ...f, type_absence: type }))}
                    className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                      form.type_absence === type
                        ? type === 'totale'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {type === 'totale' ? 'Journée entière' : 'Partielle (retard)'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {form.type_absence === 'partielle' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-800">Heure d’entrée réelle</label>
                <input
                  type="time"
                  required
                  value={form.heure_entree}
                  onChange={(e) => setForm((f) => ({ ...f, heure_entree: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Heure de référence : {heureReference.slice(0, 5)}</p>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">Motif (facultatif)</label>
            <input
              value={form.motif}
              onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
              maxLength={255}
              placeholder="Maladie, retard transport, congé non justifié…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <TrendingDown className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
            <div className="text-sm text-rose-900">
              <p className="font-bold">Retenue sur salaire : {fmtMAD(retenue)} par employé</p>
              <p className="mt-0.5 text-xs text-rose-700">
                {form.type_absence === 'totale'
                  ? `${fmtMAD(penaliteJour)} par journée d’absence complète.`
                  : `Prorata du retard sur une journée de ${heuresParJour} h (${fmtMAD(penaliteJour)} maximum).`}
                {!editing && form.employe_ids.length > 0 && ` Total : ${fmtMAD(retenue * form.employe_ids.length)}.`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving || (!editing && (employeesLoading || employeesError || form.employe_ids.length === 0))}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Enregistrer' : 'Marquer l’absence'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==================== PANNEAU D'ACCÈS (PDG) ====================
const AccessPanel: React.FC = () => {
  const { data = [], isLoading, isError, refetch } = useGetAbsencePermissionsQuery();
  const [updatePermissions] = useUpdateAbsencePermissionsMutation();
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const employees = useMemo(
    () => data.filter((e) => `${e.nom_complet || ''} ${e.cin || ''} ${e.role || ''}`.toLocaleLowerCase('fr').includes(normalizedSearch)),
    [data, normalizedSearch],
  );

  const toggle = async (employee: AbsencePermissionEmployee, key: keyof AbsencePermissions) => {
    if (employee.verrouille || savingId === employee.id) return;
    const permissions: AbsencePermissions = { gestion: employee.gestion, statistiques: employee.statistiques };
    permissions[key] = !permissions[key];
    setSavingId(employee.id);
    try {
      await updatePermissions({ id: employee.id, permissions }).unwrap();
      showSuccess('Accès mis à jour.');
    } catch (error) {
      showError((error as { data?: { message?: string } })?.data?.message || 'Échec de l’enregistrement.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-black text-gray-900">Accès à la gestion des absences</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Accordez le droit de marquer/modifier les absences ou de consulter les statistiques. Le PDG est toujours autorisé.
            </p>
          </div>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un employé…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>

      {isError ? <AbsenceLoadError message="Impossible de charger les autorisations." onRetry={refetch} /> : isLoading ? (
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
                <th className="px-4 py-3">Marquer / modifier</th>
                <th className="px-4 py-3">Statistiques</th>
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
                    <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700">{employee.role}</span>
                  </td>
                  {(['gestion', 'statistiques'] as Array<keyof AbsencePermissions>).map((key) => (
                    <td key={key} className="px-4 py-3">
                      <button
                        type="button"
                        disabled={employee.verrouille || savingId === employee.id}
                        onClick={() => toggle(employee, key)}
                        aria-pressed={employee[key]}
                        aria-label={`${key} pour ${displayName(employee)}`}
                        className="disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className={`relative block h-6 w-11 rounded-full transition-colors ${employee[key] ? 'bg-blue-600' : 'bg-gray-300'}`}>
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${employee[key] ? 'translate-x-6' : 'translate-x-1'}`} />
                        </span>
                      </button>
                      {employee.verrouille && <p className="mt-1 text-[11px] font-semibold text-emerald-700">Toujours autorisé</p>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

// ==================== PAGE ====================
const AbsencesPage: React.FC = () => {
  const { user } = useAuth();
  const isPDG = user?.role === 'PDG';
  const { data: permissions, isLoading: permissionsLoading, isError: permissionsError, refetch: retryPermissions } = useGetMyAbsencePermissionsQuery();
  const canManage = Boolean(permissions?.gestion);
  const canSee = canManage || Boolean(permissions?.statistiques);

  const [month, setMonth] = useState(currentMonthKey());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);
  const [showAccess, setShowAccess] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AbsenceType | ''>('');

  const { data: config } = useGetAbsenceConfigQuery(undefined, { skip: !canSee });
  const { data: absences = [], isLoading, isFetching, isError, refetch } = useGetAbsencesQuery({ month }, { skip: !canSee });
  const [deleteAbsence] = useDeleteAbsenceMutation();

  useEffect(() => {
    if (!showModal) setEditing(null);
  }, [showModal]);

  const totals = useMemo(() => {
    const employes = new Set(absences.map((a) => a.employe_id));
    return {
      total: absences.length,
      completes: absences.filter((a) => a.type_absence === 'totale').length,
      partielles: absences.filter((a) => a.type_absence === 'partielle').length,
      retenue: absences.reduce((sum, a) => sum + Number(a.montant_retenue || 0), 0),
      employes: employes.size,
    };
  }, [absences]);
  const visibleAbsences = useMemo(() => absences.filter((absence) =>
    (!typeFilter || absence.type_absence === typeFilter) &&
    `${displayName(absence)} ${absence.motif || ''} ${absence.role || ''}`.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')),
  ), [absences, search, typeFilter]);

  const handleDelete = async (absence: Absence) => {
    const result = await showConfirmation(
      `Supprimer l’absence du ${dayLabel(absence.date_absence)} pour ${displayName(absence)} ? La retenue de ${fmtMAD(absence.montant_retenue)} sera annulée.`,
      'Supprimer l’absence',
      'Supprimer',
    );
    if (!result.isConfirmed) return;
    try {
      await deleteAbsence(absence.id).unwrap();
      showSuccess('Absence supprimée.');
    } catch (error) {
      showError((error as { data?: { message?: string } })?.data?.message || 'Suppression impossible.');
    }
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Vérification des accès…
      </div>
    );
  }

  if (permissionsError) return <AbsenceLoadError message="Impossible de vérifier vos accès." onRetry={retryPermissions} />;

  if (!canSee) {
    return <AccessDenied message="La gestion des absences est réservée au PDG et aux employés explicitement autorisés." />;
  }

  const penaliteJour = config?.penalite_jour ?? 100;

  return (
    <div className="min-h-full space-y-5 bg-slate-50/70 p-4 text-slate-900 sm:p-6 [&_button]:transition-colors [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-blue-600">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-700"><CalendarDays className="h-4 w-4" /> Ressources humaines</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pointage & absences</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Retrouvez les journées d’absence, les retards et les retenues de votre équipe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Boolean(permissions?.statistiques) && (
            <Link
              to="/absences/statistiques"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <BarChart3 className="h-4 w-4" /> Statistiques
            </Link>
          )}
          {isPDG && (
            <button
              type="button"
              onClick={() => setShowAccess((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
            >
              <ShieldCheck className="h-4 w-4" /> {showAccess ? 'Masquer les accès' : 'Gérer les accès'}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Marquer une absence
            </button>
          )}
        </div>
      </header>

      {isPDG && showAccess && <AccessPanel />}

      {isError ? <AbsenceLoadError message="Les absences n’ont pas pu être chargées. Réessayez pour consulter les données du mois." onRetry={refetch} /> : isLoading ? <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Chargement du récapitulatif…</div> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CalendarDays} label="Absences du mois" value={String(totals.total)} accent="blue" />
        <StatCard icon={AlertTriangle} label="Journées entières" value={String(totals.completes)} accent="red" />
        <StatCard icon={Clock} label="Retards / partielles" value={String(totals.partielles)} accent="amber" />
        <StatCard icon={TrendingDown} label="Retenue totale" value={fmtMAD(totals.retenue)} accent="rose" />
      </div>}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <label className="block text-xs font-semibold text-slate-600">Mois
          <input aria-label="Mois des absences" type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonthKey())} className="mt-1.5 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" />
        </label>
        <label className="block flex-1 text-xs font-semibold text-slate-600">Recherche
          <span className="relative mt-1.5 block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employé, rôle ou motif…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm font-normal text-slate-900" /></span>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Type d’absence
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AbsenceType | '')} className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"><option value="">Tous les types</option><option value="totale">Journée entière</option><option value="partielle">Partielle / retard</option></select>
        </label>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black capitalize text-gray-900">{monthLabel(month)}</h2>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">
              <Users className="h-3.5 w-3.5" /> {totals.employes} employé{totals.employes > 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs text-slate-500">{isError ? 'Données indisponibles' : `${visibleAbsences.length} enregistrement(s)`}</span>
        </div>

        {isError ? <p className="p-10 text-center text-sm text-slate-500">Le registre sera disponible après le chargement des données.</p> : isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des absences…
          </div>
        ) : visibleAbsences.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-3 font-bold text-gray-900">{absences.length ? 'Aucun résultat pour ces filtres' : 'Aucune absence enregistrée sur ce mois'}</p>
            <p className="mt-1 text-sm text-gray-500">{absences.length ? 'Essayez un autre nom ou un autre type d’absence.' : 'Les absences apparaîtront ici une fois enregistrées.'}</p>
            {(search || typeFilter) && <button type="button" onClick={() => { setSearch(''); setTypeFilter(''); }} className="mt-4 text-sm font-semibold text-blue-700">Effacer les filtres</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-4 py-3">Employé</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Heure d’entrée</th>
                  <th className="px-4 py-3 text-right">Retenue</th>
                  <th className="px-4 py-3">Motif</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleAbsences.map((absence) => (
                  <tr key={absence.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-5 py-3 font-semibold capitalize text-gray-900">{dayLabel(absence.date_absence)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{displayName(absence)}</p>
                      <p className="text-xs text-gray-500">{absence.role || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${
                          absence.type_absence === 'totale'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {absence.type_absence === 'totale' ? 'Journée entière' : 'Partielle'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{absence.heure_entree || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-700">{fmtMAD(absence.montant_retenue)}</td>
                    <td title={absence.motif || undefined} className="max-w-[220px] truncate px-4 py-3 text-gray-600">{absence.motif || '—'}</td>
                    {canManage && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => { setEditing(absence); setShowModal(true); }}
                          className="mr-1 rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(absence)}
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Retenue : {fmtMAD(penaliteJour)} par journée entière, au prorata pour une absence partielle. Les montants sont reportés sur les salaires, les charges et le chiffre d’affaires.</p>

      {showModal && canManage && (
        <AbsenceFormModal
          editing={editing}
          penaliteJour={penaliteJour}
          heureReference={config?.heure_entree_reference || '08:00'}
          heuresParJour={config?.heures_par_jour || 8}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

const StatCard: React.FC<{
  icon: typeof CalendarDays;
  label: string;
  value: string;
  accent: 'blue' | 'red' | 'amber' | 'rose';
}> = ({ icon: Icon, label, value, accent }) => {
  const styles = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }[accent];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        <span className={`rounded-lg p-2 ${styles}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-2 text-[11px] text-slate-500">Sur le mois sélectionné</p>
    </div>
  );
};

export default AbsencesPage;
