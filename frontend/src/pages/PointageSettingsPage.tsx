import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { useGetPointageStatusQuery, useLinkPointageIdentityMutation } from '../store/api/pointageApi';
import { useGetAbsenceEmployeesQuery, useGetMyAbsencePermissionsQuery } from '../store/api/absencesApi';
import { showError, showSuccess } from '../utils/notifications';
import PointageDeviceSettings from '../components/absences/PointageDeviceSettings';
import PointageRawJournal from '../components/absences/PointageRawJournal';

const currentMonth = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
};

export default function PointageSettingsPage() {
  const { user } = useAuth();
  const isPDG = user?.role === 'PDG';
  const { data: permissions, isLoading: checkingPermissions, isError: permissionError, refetch: retryPermissions } = useGetMyAbsencePermissionsQuery(undefined, { skip: isPDG });
  const canAssociate = isPDG || Boolean(permissions?.gestion);
  const [personId, setPersonId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const { data: status, isError: statusError } = useGetPointageStatusQuery(undefined, { skip: !canAssociate });
  const { data: employees = [], isError: employeesError } = useGetAbsenceEmployeesQuery(undefined, { skip: !canAssociate });
  const [linkIdentity, { isLoading: linking }] = useLinkPointageIdentityMutation();
  if (!isPDG && checkingPermissions) return <p role="status" className="p-6 text-slate-600">Vérification des accès…</p>;
  if (!isPDG && permissionError) return <p role="alert" className="p-6 text-red-700">Impossible de vérifier les accès. <button type="button" onClick={() => retryPermissions()} className="underline">Réessayer</button></p>;
  if (!canAssociate) return <p role="alert" className="p-6 text-red-700">La gestion du pointage n’est pas autorisée pour ce compte.</p>;
  const link = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!status?.device_key) return;
    try {
      await linkIdentity({ device_key: status.device_key, person_id: personId.trim(), employe_id: Number(employeeId) }).unwrap();
      setPersonId(''); setEmployeeId(''); showSuccess('Identifiant associé à l’employé.');
    } catch (error) { showError((error as { data?: { message?: string } })?.data?.message || 'Association impossible. Réessayez.'); }
  };
  return <div className="space-y-5 bg-slate-50 p-4 text-slate-900 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Employés</p><h1 className="mt-2 text-2xl font-bold">Paramètres de la pointeuse</h1><p className="mt-2 text-sm text-slate-600">Connexion de l’appareil et correspondance des identifiants avec les employés.</p></div><Link to={isPDG ? "/employees" : "/absences"} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"><ArrowLeft size={16} /> {isPDG ? 'Employés' : 'Présences'}</Link></header>
    {isPDG && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><PointageDeviceSettings /></section>}
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div><h2 className="font-bold">Associer les identifiants de la pointeuse</h2><p className="mt-1 text-sm text-slate-600">Sélectionnez un passage à associer dans le journal ci-dessous, ou saisissez l’identifiant de l’appareil.</p></div>
      <form onSubmit={link} className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold text-slate-600">Identifiant sur l’appareil<input required maxLength={64} pattern="[A-Za-z0-9_-]+" value={personId} onChange={event => setPersonId(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Employé<select required value={employeeId} onChange={event => setEmployeeId(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Sélectionner</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.nom_complet || employee.cin || `Employé #${employee.id}`}</option>)}</select></label><button disabled={linking || employeesError || !status?.configured} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{linking ? 'Association…' : 'Associer'}</button></form>
      {(statusError || employeesError) && <p role="alert" className="text-sm text-red-700">Les informations nécessaires à l’association n’ont pas pu être chargées. Actualisez la page pour réessayer.</p>}
      {!statusError && status && !status.configured && <p className="text-sm text-amber-800">Enregistrez la connexion de la pointeuse avant d’associer un identifiant.</p>}
      <p className="text-xs text-slate-500">Le caractère obligatoire du pointage se choisit séparément dans la liste des employés.</p>
    </section>
    <div className="flex items-center gap-3"><label className="text-sm font-semibold">Mois du journal <input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2" /></label><Link to="/absences" className="text-sm font-semibold text-blue-700 underline">Présences du mois</Link></div>
    <PointageRawJournal key={month} month={month} onSelectPerson={setPersonId} />
  </div>;
}
