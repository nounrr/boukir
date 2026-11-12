import React, { useEffect, useState } from 'react';
import { useGetPointageConfigQuery, useSavePointageConfigMutation, useGetPointageStatusQuery, useGetPointageEventsQuery, useLinkPointageIdentityMutation } from '../../store/api/pointageApi';
import { useGetAbsenceEmployeesQuery } from '../../store/api/absencesApi';
import { showError, showSuccess } from '../../utils/notifications';

const localMonth = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
};
const directionLabels = { entree: 'Entrée', sortie: 'Sortie', inconnu: 'Sens à confirmer' };
const methodLabels: Record<string, string> = { face: 'Visage', finger: 'Empreinte', faceAndFinger: 'Visage + empreinte', card: 'Carte' };
const methodLabel = (method: string) => methodLabels[method] || method;

function DeviceSettings() {
  const { data, isLoading, isError, refetch } = useGetPointageConfigQuery();
  const [save, { isLoading: saving }] = useSavePointageConfigMutation();
  const [form, setForm] = useState({ device_key: '', local_ip: '', firmware: '', timezone: 'Africa/Casablanca', direction: 'inconnu' as 'entree' | 'sortie' | 'inconnu' });
  const [entryCode, setEntryCode] = useState('');
  const [exitCode, setExitCode] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  useEffect(() => {
    if (!data) return;
    setForm({ device_key: data.device_key, local_ip: data.local_ip, firmware: data.firmware, timezone: data.timezone, direction: data.direction });
    setEntryCode(Object.entries(data.attendance_map).find(([, value]) => value === 'entree')?.[0] || '');
    setExitCode(Object.entries(data.attendance_map).find(([, value]) => value === 'sortie')?.[0] || '');
  }, [data]);
  const submit = async (rotate = false) => {
    if (entryCode.trim() && entryCode.trim() === exitCode.trim()) { showError('Utilisez deux codes différents pour l’entrée et la sortie.'); return; }
    try {
      const attendance_map: Record<string, string> = Object.create(null);
      if (entryCode.trim()) attendance_map[entryCode.trim()] = 'entree';
      if (exitCode.trim()) attendance_map[exitCode.trim()] = 'sortie';
      const result = await save({ ...form, attendance_map, rotate_token: rotate }).unwrap();
      if (result.callback_url) setCallbackUrl(result.callback_url);
      showSuccess('Paramètres de la pointeuse enregistrés.');
    } catch (error) { showError((error as { data?: { message?: string } })?.data?.message || 'Enregistrement impossible. Réessayez.'); }
  };
  if (isLoading) return <p role="status" className="p-4">Chargement des paramètres…</p>;
  if (isError) return <p role="alert" className="p-4 text-red-700">Paramètres indisponibles. <button type="button" onClick={refetch} className="underline">Réessayer</button></p>;
  return <div className="space-y-4 border-b border-slate-200 bg-slate-50 p-4">
    <div><h3 className="font-semibold">Connexion Wdlink WDU505PROFP</h3><p className="mt-1 text-sm text-slate-600">Modifiez ces paramètres au magasin. L’appareil enverra ses passages à backoffice.boukirdiamond.com. L’enregistrement des paramètres ne confirme pas encore la connexion physique.</p></div>
    <form onSubmit={event => { event.preventDefault(); submit(); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold">Numéro de série / deviceKey<input required pattern="[A-Za-z0-9_-]+" maxLength={64} value={form.device_key} onChange={e => setForm({ ...form, device_key: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
        <label className="text-xs font-semibold">IP locale au magasin (pour le réglage)<input maxLength={64} placeholder="192.168.1.…" value={form.local_ip} onChange={e => setForm({ ...form, local_ip: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
        <label className="text-xs font-semibold">Version du firmware<input maxLength={120} value={form.firmware} onChange={e => setForm({ ...form, firmware: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
        <label className="text-xs font-semibold">Fuseau horaire<input required value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
        <label className="text-xs font-semibold">Code de statut « Entrée »<input maxLength={32} placeholder="À vérifier sur l’appareil" value={entryCode} onChange={e => setEntryCode(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
        <label className="text-xs font-semibold">Code de statut « Sortie »<input maxLength={32} placeholder="À vérifier sur l’appareil" value={exitCode} onChange={e => setExitCode(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
        <label className="text-xs font-semibold">Si aucun code ne correspond<select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as typeof form.direction })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="inconnu">Laisser le sens à confirmer</option><option value="entree">Appareil dédié aux entrées</option><option value="sortie">Appareil dédié aux sorties</option></select></label>
      </div>
      <div className="flex flex-wrap gap-3"><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button>
        {data?.configured && <button type="button" disabled={saving || !form.device_key} onClick={() => submit(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Remplacer l’adresse de réception</button>}</div>
      <p className="text-xs text-slate-600">Une nouvelle adresse remplace immédiatement l’ancienne : il faudra la reporter dans la pointeuse. L’IP locale et le firmware servent de référence pour le réglage au magasin.</p>
    </form>
    {callbackUrl && <label className="block text-sm font-semibold">Adresse à copier dans le callback de l’appareil<textarea readOnly rows={3} value={callbackUrl} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs" /><span className="mt-1 block text-xs font-normal text-amber-800">Copiez cette adresse maintenant : son secret sera masqué à la prochaine ouverture.</span></label>}
  </div>;
}

export default function PointagePanel({ canConfigure = false }: { canConfigure?: boolean }) {
  const [month, setMonth] = useState(localMonth);
  const [page, setPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [personId, setPersonId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const { data: status, isError: statusError, refetch: retryStatus } = useGetPointageStatusQuery(undefined, { pollingInterval: 30000 });
  const { currentData: data, isFetching, isError, refetch } = useGetPointageEventsQuery({ month, page }, { pollingInterval: 30000 });
  const { data: employees = [], isError: employeesError } = useGetAbsenceEmployeesQuery();
  const [linkIdentity, { isLoading: linking }] = useLinkPointageIdentityMutation();
  const link = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!status?.device_key) return;
    try {
      await linkIdentity({ device_key: status.device_key, person_id: personId.trim(), employe_id: Number(employeeId) }).unwrap();
      setPersonId(''); setEmployeeId(''); showSuccess('Identifiant associé à l’employé.');
    } catch (error) {
      showError((error as { data?: { message?: string } })?.data?.message || 'Association impossible. Réessayez.');
    }
  };
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Pointages de la pointeuse">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
      <div><h2 className="font-bold text-slate-900">Passages de la pointeuse</h2><p className="mt-1 text-sm text-slate-600">Date et heure des entrées et sorties · {status?.timezone || 'Africa/Casablanca'}</p></div>
      <label className="text-sm font-semibold">Mois <input aria-label="Mois des pointages" type="month" value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setPage(1); } }} className="ml-2 rounded-lg border border-slate-300 px-3 py-2" /></label>
      {canConfigure && <button type="button" onClick={() => setSettingsOpen(value => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">{settingsOpen ? 'Fermer les paramètres' : 'Paramètres de la pointeuse'}</button>}
      <button type="button" disabled={isFetching} onClick={() => { refetch(); retryStatus(); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Actualiser</button>
    </div>
    {canConfigure && settingsOpen && <DeviceSettings />}
    {statusError && <p role="alert" className="p-4 text-sm text-red-700">Impossible de vérifier la connexion de la pointeuse. <button type="button" onClick={retryStatus} className="underline">Réessayer</button></p>}
    {status && !status.configured && <p className="bg-amber-50 p-4 text-sm text-amber-900">La connexion Wdlink reste à configurer. Les passages apparaîtront ici après la connexion de l’appareil.</p>}
    {status?.configured && <div className="space-y-3 border-b border-slate-200 p-4">
      <p className="text-sm text-slate-600">Appareil : {status.device_key} · Fuseau : {status.timezone}. Associez l’identifiant enregistré sur la pointeuse à son employé.</p>
      <form onSubmit={link} className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">Identifiant sur l’appareil<input required maxLength={64} pattern="[A-Za-z0-9_-]+" value={personId} onChange={e => setPersonId(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Employé<select required value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Sélectionner</option>{employees.map(e => <option key={e.id} value={e.id}>{e.nom_complet || e.cin || `Employé #${e.id}`}</option>)}</select></label>
        <button disabled={linking || employeesError} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{linking ? 'Association…' : 'Associer'}</button>
      </form>
      {employeesError && <p role="alert" className="text-sm text-red-700">Liste des employés indisponible. Actualisez la page pour réessayer.</p>}
    </div>}
    {isError ? <p role="alert" className="p-4 text-sm text-red-700">Impossible de charger les pointages. <button type="button" onClick={refetch} className="underline">Réessayer</button></p> : isFetching && !data ? <p role="status" className="p-4 text-sm text-slate-600">Chargement des pointages…</p> : <>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>{['Employé', 'Jour', 'Heure', 'Passage', 'Identification'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {(data?.data || []).map(event => <tr key={event.id}><td className="px-4 py-3">{event.nom_complet || (event.employe_id ? `Employé #${event.employe_id}` : <button type="button" onClick={() => setPersonId(event.person_id)} className="text-amber-800 underline">À associer : {event.person_id}</button>)}</td><td className="px-4 py-3">{event.date_pointage}</td><td className="px-4 py-3 font-semibold">{event.heure_pointage}</td><td className="px-4 py-3">{directionLabels[event.direction]}</td><td className="px-4 py-3">{methodLabel(event.method)}</td></tr>)}
        {!data?.data.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Aucun passage reçu pour ce mois.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm"><span>{data?.pagination.total || 0} passages · Page {page}</span><div className="flex gap-3"><button type="button" disabled={page === 1 || isFetching} onClick={() => setPage(p => p - 1)} className="disabled:opacity-40">Précédent</button><button type="button" disabled={isFetching || page * 100 >= (data?.pagination.total || 0)} onClick={() => setPage(p => p + 1)} className="disabled:opacity-40">Suivant</button></div></div>
    </>}
    <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">Les passages sont conservés sans modifier automatiquement les absences ni les retenues. Un sens non configuré reste à confirmer.</p>
  </section>;
}
