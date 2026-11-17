import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ExternalLink, FileText, MapPin } from 'lucide-react';
import { useAuth } from '../../hooks/redux';
import {
  type BackofficeServiceRequest,
  type ServiceRequestFilterOptions,
  useGetAdminServiceInterventionQuery,
  useScheduleServiceInterventionMutation,
  useTransitionAdminServiceInterventionMutation,
} from '../../store/api/serviceRequestsApi';

const input = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200';
const textarea = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200';

function dateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function errorMessage(error: unknown) {
  const value = error as { data?: { message?: string; errors?: Record<string, string> } };
  return [value.data?.message, ...(value.data?.errors ? Object.values(value.data.errors) : [])].filter(Boolean).join(' · ') || 'Une erreur est survenue';
}

export function ServiceInterventionPanel({ request, options, onChanged }: {
  request: BackofficeServiceRequest;
  options?: ServiceRequestFilterOptions;
  onChanged: () => Promise<unknown>;
}) {
  const { token } = useAuth();
  const query = useGetAdminServiceInterventionQuery(request.id, { refetchOnMountOrArgChange: true });
  const intervention = query.data?.intervention;
  const [schedule, scheduleState] = useScheduleServiceInterventionMutation();
  const [transition, transitionState] = useTransitionAdminServiceInterventionMutation();
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string | number>>({});
  useEffect(() => { setReleaseId(null); setFeedback(''); }, [request.id]);

  useEffect(() => {
    setForm({
      planned_date: intervention?.planned_date?.slice(0, 10) || request.desired_date?.slice(0, 10) || '',
      planned_time_slot: intervention?.planned_time_slot || request.desired_time_slot || '',
      mission_address: intervention?.mission_address || request.intervention_address || '',
      mission_city: intervention?.mission_city || request.city || '',
      latitude: intervention?.latitude ?? request.latitude ?? '', longitude: intervention?.longitude ?? request.longitude ?? '',
      planned_service_id: intervention?.planned_service_id || request.qualified_service_id || request.service_id || '',
      planned_category_id: intervention?.planned_category_id || request.qualified_category_id || '',
      mission_contact_name: intervention?.mission_contact_name || request.requester_name || request.contact_account_name || '',
      mission_contact_phone: intervention?.mission_contact_phone || request.requester_phone || request.contact_account_phone || '',
      shared_instructions: intervention?.shared_instructions || '', special_information: intervention?.special_information || '',
    });
  }, [intervention, request]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (submitting) return;
    setFeedback(''); setSubmitting(true);
    try { await action(); setFeedback(success); await Promise.all([query.refetch(), onChanged()]); }
    catch (error) { setFeedback(errorMessage(error)); }
    finally { setSubmitting(false); }
  }

  async function openPhoto(photoId: number, name: string) {
    if (!intervention) return;
    const response = await fetch(`/api/admin/service-interventions/${intervention.id}/photos/${photoId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return setFeedback('Impossible d’ouvrir la photo.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.download = name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function planAndSend() {
    if (submitting) return;
    setSubmitting(true); setFeedback('');
    let savedId: number | null = null;
    try {
      const saved = await schedule({ requestId: request.id, body: form }).unwrap();
      savedId = saved.intervention_id;
      setReleaseId(savedId);
      await transition({ id: savedId, status: 'to_do' }).unwrap();
      setReleaseId(null);
      setFeedback('Intervention planifiée et disponible dans le compte du Maalem.');
    } catch (error) {
      setFeedback(savedId ? `Le planning est enregistré, mais l’envoi au Maalem a échoué. Cliquez sur « Envoyer au Maalem » pour réessayer. ${errorMessage(error)}` : errorMessage(error));
    } finally {
      try { await Promise.all([query.refetch(), onChanged()]); }
      finally { setSubmitting(false); }
    }
  }
  async function releaseMission() {
    const missionId = releaseId || intervention?.id;
    if (!missionId) return;
    await run(async () => { await transition({ id: missionId, status: 'to_do' }).unwrap(); setReleaseId(null); }, 'Mission disponible dans le compte du Maalem.');
  }
  const pendingRelease = Boolean(releaseId || intervention?.status === 'scheduled');
  const canPlan = (request.status === 'assigned' || request.status === 'scheduled') && !releaseId;
  return <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-gray-900">Planifier et envoyer au Maalem</h2></div>{intervention && <span className="rounded-md bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{intervention.status}</span>}</div>
    {feedback && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{feedback}</p>}
    {query.isError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Impossible de charger le planning. <button type="button" onClick={() => void query.refetch()} className="underline">Réessayer</button></p>}
    {!request.current_assignment_id && <p className="rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-500">{['completed', 'closed', 'cancelled'].includes(request.status) ? 'Aucune planification n’est disponible pour ce dossier.' : 'Affectez un Maalem pour choisir le créneau. Les informations de la demande seront reprises automatiquement.'}</p>}
    {pendingRelease && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="mb-3 text-sm text-blue-800">Le planning est enregistré. Envoyez la mission pour permettre au Maalem de la démarrer.</p><button type="button" disabled={submitting} onClick={() => void releaseMission()} className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{submitting ? 'Envoi…' : 'Envoyer au Maalem'}</button></div>}
    {canPlan && !query.isError && !query.isFetching && <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Date d’intervention<input type="date" className={`${input} mt-1`} value={form.planned_date || ''} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} /></label>
      <label className="text-xs font-semibold text-slate-600">Créneau horaire<input className={`${input} mt-1`} placeholder="Ex. 09:00–11:00" value={form.planned_time_slot || ''} onChange={(e) => setForm({ ...form, planned_time_slot: e.target.value })} /></label>
      <details className="rounded-lg border border-slate-200 p-3 sm:col-span-2"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Vérifier l’adresse, le contact et les instructions</summary><p className="mt-2 text-xs text-slate-500">Informations reprises de la demande. Ajustez-les si nécessaire.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
      <input className={input} aria-label="Adresse d'intervention" placeholder="Adresse d'intervention" value={form.mission_address || ''} onChange={(e) => setForm({ ...form, mission_address: e.target.value })} />
      <input className={input} aria-label="Ville" placeholder="Ville" value={form.mission_city || ''} onChange={(e) => setForm({ ...form, mission_city: e.target.value })} />
      <select aria-label="Service planifié" className={input} value={form.planned_service_id || ''} onChange={(e) => setForm({ ...form, planned_service_id: Number(e.target.value) || '' })}><option value="">Service</option>{options?.services.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select>
      <select aria-label="Catégorie planifiée" className={input} value={form.planned_category_id || ''} onChange={(e) => setForm({ ...form, planned_category_id: Number(e.target.value) || '' })}><option value="">Catégorie (optionnelle si Service)</option>{options?.categories.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select>
      <input className={input} aria-label="Contact sur place" placeholder="Contact sur place" value={form.mission_contact_name || ''} onChange={(e) => setForm({ ...form, mission_contact_name: e.target.value })} />
      <input className={input} aria-label="Téléphone sur place" placeholder="Téléphone sur place" value={form.mission_contact_phone || ''} onChange={(e) => setForm({ ...form, mission_contact_phone: e.target.value })} />
      <textarea className={`${textarea} sm:col-span-2`} rows={2} aria-label="Instructions partagées avec le Maalem" placeholder="Instructions partagées avec le Maalem" value={form.shared_instructions || ''} onChange={(e) => setForm({ ...form, shared_instructions: e.target.value })} />
      <textarea className={`${textarea} sm:col-span-2`} rows={2} aria-label="Informations particulières utiles" placeholder="Informations particulières utiles" value={form.special_information || ''} onChange={(e) => setForm({ ...form, special_information: e.target.value })} />
      </div></details>
      <button type="button" disabled={submitting || scheduleState.isLoading || !String(form.planned_date || '').trim() || !String(form.planned_time_slot || '').trim()} onClick={() => void planAndSend()} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:col-span-2">{submitting ? 'Enregistrement et envoi…' : intervention ? 'Mettre à jour et envoyer au Maalem' : 'Planifier et envoyer au Maalem'}</button>

    </div>}
    {intervention && <div className="mt-5 space-y-4 border-t pt-4">
      <div className="grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-slate-500">Maalem courant</span><p className="font-semibold">{intervention.current_maalem_name}</p></div><div><span className="text-slate-500">Planifiée</span><p className="font-semibold">{intervention.planned_date?.slice(0, 10)} · {intervention.planned_time_slot}</p></div><div><span className="text-slate-500">Progression</span><p className="font-semibold">{intervention.progress_percent}%</p></div></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${intervention.progress_percent}%` }} /></div>
      {intervention.latitude != null && <a className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${intervention.latitude},${intervention.longitude}`}><MapPin className="h-4 w-4" />Localisation mission</a>}
      {intervention.status === 'completed' && <button disabled={submitting || transitionState.isLoading} onClick={() => { const note = window.prompt('Note interne de clôture (optionnelle)') || undefined; void run(() => transition({ id: intervention.id, status: 'closed', closure_internal_note: note }).unwrap(), 'Intervention clôturée par l’équipe.'); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4" />Clôturer après contrôle</button>}
      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><p>En route : {dateTime(intervention.en_route_at)}</p><p>Arrivée : {dateTime(intervention.arrived_at)}</p><p>Début : {dateTime(intervention.started_at)}</p><p>Terminée : {dateTime(intervention.completed_at)}</p></div>
      {intervention.work_summary && <div className="rounded-lg border bg-slate-50 p-4 text-sm"><h3 className="mb-2 flex items-center gap-2 font-bold"><FileText className="h-4 w-4" />Compte-rendu Maalem</h3><p className="whitespace-pre-wrap">{intervention.work_summary}</p>{intervention.maalem_observations && <p className="mt-2 whitespace-pre-wrap text-slate-600">{intervention.maalem_observations}</p>}<p className="mt-2 text-xs">Travail terminé : {intervention.work_finished ? 'Oui' : 'Non'} · Intervention supplémentaire : {intervention.additional_intervention_required ? 'Oui' : 'Non'}</p>{intervention.incomplete_reason && <p className="mt-2 text-amber-800">Motif : {intervention.incomplete_reason}</p>}</div>}
      <div><h3 className="mb-2 text-sm font-bold">Photos de mission</h3><div className="grid gap-2 sm:grid-cols-2">{query.data?.photos?.map((photo) => <button key={photo.id} onClick={() => void openPhoto(photo.id, photo.original_name)} className="flex items-center justify-between rounded-lg border p-3 text-left text-xs hover:bg-slate-50"><span><strong>{photo.phase}</strong> · {photo.original_name}</span><ExternalLink className="h-4 w-4" /></button>)}{!query.data?.photos?.length && <p className="text-sm text-slate-500">Aucune photo.</p>}</div></div>
      <div><h3 className="mb-2 text-sm font-bold">Chronologie opérationnelle</h3><div className="space-y-2">{query.data?.history?.map((event) => <div key={event.id} className="border-l-2 border-blue-200 pl-3 text-xs"><p className="font-semibold">{event.event_type}</p><p className="text-slate-500">{event.actor_name} · {dateTime(event.created_at)}</p></div>)}</div></div>
    </div>}
  </section>;
}
