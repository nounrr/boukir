import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/redux';

export default function PointagePhoto({ eventId, available }: { eventId: number; available: boolean }) {
  const { token } = useAuth();
  const [photo, setPhoto] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setPhoto(null); setFailed(false); setExpanded(false);
    if (available && token) {
      void (async () => {
        try {
          const response = await fetch(`/api/pointage/events/${eventId}/photo`, {
            headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
          });
          if (!response.ok) throw new Error('Photo indisponible');
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          if (!['image/jpeg', 'image/png'].includes(blob.type)) throw new Error('Photo invalide');
          objectUrl = URL.createObjectURL(blob);
          setPhoto(objectUrl);
        } catch { if (!controller.signal.aborted) setFailed(true); }
      })();
    }
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [eventId, available, token, attempt]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [expanded]);
  if (!available || !token) return <span className="text-xs text-slate-400">Sans photo</span>;
  if (failed) return <button type="button" onClick={() => setAttempt(value => value + 1)} className="text-xs text-slate-500 underline">Réessayer la photo</button>;
  if (!photo) return <span role="status" className="text-xs text-slate-400">Chargement de la photo…</span>;
  return <>
    <button type="button" onClick={() => setExpanded(true)} aria-label="Agrandir la photo du pointage" aria-haspopup="dialog" className="block overflow-hidden rounded-lg border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
      <img src={photo} alt="Photo capturée lors du pointage" className="h-14 w-14 object-cover" />
    </button>
    {expanded && <div role="dialog" aria-modal="true" aria-label="Photo du pointage" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setExpanded(false)}>
      <div className="relative max-w-2xl rounded-xl bg-white p-3 shadow-xl" onClick={event => event.stopPropagation()}>
        <button autoFocus type="button" onClick={() => setExpanded(false)} className="mb-3 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Fermer la photo</button>
        <img src={photo} alt="Photo capturée lors du pointage, agrandie" className="max-h-[75vh] max-w-full rounded-lg object-contain" />
      </div>
    </div>}
  </>;
}
