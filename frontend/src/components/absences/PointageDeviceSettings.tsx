import { useEffect, useState } from 'react';
import { useGetPointageConfigQuery, useSavePointageConfigMutation } from '../../store/api/pointageApi';
import { showError, showSuccess } from '../../utils/notifications';

export default function PointageDeviceSettings() {
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
    <div><h3 className="font-semibold">Connexion Wdlink WDU505PROFP</h3><p className="mt-1 text-sm text-slate-600">Modifiez ces paramètres au magasin. L’appareil enverra ses passages à boukirdiamond.com. L’enregistrement des paramètres ne confirme pas encore la connexion physique.</p></div>
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

