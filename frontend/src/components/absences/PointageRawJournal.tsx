import { useState } from 'react';
import { useGetPointageEventsQuery } from '../../store/api/pointageApi';
import PointagePhoto from './PointagePhoto';

const directionLabels = { entree: 'Entrée', sortie: 'Sortie', inconnu: 'Sens à confirmer' };
const methods: Record<string, string> = { face: 'Visage', finger: 'Empreinte', faceAndFinger: 'Visage + empreinte', card: 'Carte' };

export default function PointageRawJournal({ month, onSelectPerson }: { month: string; onSelectPerson?: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const { currentData: data, isFetching, isError, refetch } = useGetPointageEventsQuery({ month, page }, { pollingInterval: 30000 });
  const rows = (data?.data || []).filter(event => !onlyUnassigned || !event.employe_id);
  return <section aria-label="Passages détaillés" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
      <div><h3 className="font-semibold">Passages détaillés</h3><p className="mt-1 text-xs text-slate-500">Chaque reconnaissance reçue de la pointeuse, avec sa photo lorsqu’elle est disponible.</p></div>
      <button type="button" disabled={isFetching} onClick={() => refetch()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Actualiser les passages</button>
    </div>
    <label className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600"><input type="checkbox" checked={onlyUnassigned} onChange={event => setOnlyUnassigned(event.target.checked)} />Afficher uniquement les identifiants à associer sur cette page</label>
    {isError ? <p role="alert" className="p-4 text-sm text-red-700">Impossible de charger les passages. <button type="button" onClick={() => refetch()} className="underline">Réessayer</button></p> : !data && isFetching ? <p role="status" className="p-4 text-sm text-slate-600">Chargement des passages…</p> : <>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>{['Photo', 'Employé / identifiant', 'Jour', 'Heure', 'Passage', 'Identification'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {rows.map(event => <tr key={event.id}><td className="px-4 py-3"><PointagePhoto eventId={event.id} available={Boolean(event.has_photo)} /></td><td className="px-4 py-3">{event.nom_complet || (event.employe_id ? `Employé #${event.employe_id}` : onSelectPerson ? <button type="button" onClick={() => onSelectPerson(event.person_id)} className="text-amber-800 underline">À associer : {event.person_id}</button> : <span className="text-amber-800">À associer : {event.person_id}</span>)}</td><td className="whitespace-nowrap px-4 py-3">{event.date_pointage}</td><td className="px-4 py-3 font-semibold tabular-nums">{event.heure_pointage}</td><td className="px-4 py-3">{directionLabels[event.direction]}</td><td className="px-4 py-3">{methods[event.method] || event.method}</td></tr>)}
        {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Aucun passage pour cette sélection.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm"><span>{data?.pagination.total || 0} passages · Page {page}</span><div className="flex gap-3"><button type="button" disabled={page === 1 || isFetching} onClick={() => setPage(value => value - 1)} className="disabled:opacity-40">Précédent</button><button type="button" disabled={isFetching || page * 100 >= (data?.pagination.total || 0)} onClick={() => setPage(value => value + 1)} className="disabled:opacity-40">Suivant</button></div></div>
    </>}
  </section>;
}
