import { useEffect, useRef, useState } from 'react';
import { MapPin, Radio, Satellite, Smartphone } from 'lucide-react';
import { useGetFleetPositionsQuery, useGetGpsStatusQuery, useGetVehicleTrailQuery, useLinkGpsMutation, type FleetVehicle } from '../store/api/gpsApi';
import { useAuth } from '../hooks/redux';
import { showError, showSuccess } from '../utils/notifications';

const LINKERS = ['PDG', 'ManagerPlus', 'Manager'];

/** Un véhicule « en route » : position en direct et plus vite qu'un piéton. */
const moving = (v: FleetVehicle) => !!v.position && Date.now() - new Date(v.position.recorded_at).getTime() < 120000 && Number(v.position.vitesse_kmh ?? 0) >= 5;
/** Sans signal depuis plus de 30 minutes (ou jamais). */
const silent = (v: FleetVehicle) => !v.position || Date.now() - new Date(v.position.recorded_at).getTime() > 30 * 60000;

/** Âge d'une position : en direct (< 2 min), récente (< 30 min), ancienne, ou aucune. */
function signal(v: FleetVehicle): { label: string; color: string } {
  if (!v.position) return { label: 'Aucune position', color: '#94a3b8' };
  const minutes = (Date.now() - new Date(v.position.recorded_at).getTime()) / 60000;
  if (minutes < 2) return { label: 'En direct', color: '#16a34a' };
  if (minutes < 30) return { label: `Il y a ${Math.max(1, Math.round(minutes))} min`, color: '#f59e0b' };
  const hours = minutes / 60;
  return { label: hours < 24 ? `Il y a ${Math.round(hours)} h` : `Il y a ${Math.round(hours / 24)} j`, color: '#64748b' };
}

type MapPoint = { id: number; label: string; lat: number; lng: number; color: string; info: string };

/**
 * La carte (OpenStreetMap via Leaflet, sans clé) dans un cadre : chargée une fois, puis les points sont mis à jour par
 * message, sans recadrer ni recharger la carte que l'utilisateur est en train de regarder.
 */
const MAP_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}.tag{background:#111827;color:#fff;border:0;border-radius:8px;padding:2px 6px;font:600 11px system-ui,sans-serif;box-shadow:none}.tag:before{display:none}</style>
</head><body><div id="map"></div><script>
var map = L.map('map').setView([35.7595, -5.834], 12), layer = L.layerGroup().addTo(map), route = L.layerGroup().addTo(map), framed = false;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
window.addEventListener('message', function (e) {
  if (e.data && e.data.fleetTrail) {
    route.clearLayers();
    var line = e.data.fleetTrail;
    if (line.length > 1) { var pl = L.polyline(line, { color: '#D4A017', weight: 4, opacity: 0.9 }).addTo(route); map.fitBounds(pl.getBounds(), { padding: [40, 40], maxZoom: 16 }); }
    return;
  }
  var points = (e.data && e.data.fleetPoints) || null; if (!points) return;
  layer.clearLayers();
  var marks = points.map(function (p) {
    var el = document.createElement('div'); el.textContent = p.info;
    return L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 1 }).addTo(layer)
      .bindTooltip(document.createTextNode(p.label), { permanent: true, direction: 'top', className: 'tag', offset: [0, -8] }).bindPopup(el);
  });
  if (!framed && marks.length) { framed = true; map.fitBounds(L.featureGroup(marks).getBounds(), { padding: [40, 40], maxZoom: 15 }); }
});
parent.postMessage({ fleetMapReady: true }, '*');
</script></body></html>`;

/** La carte de tous les véhicules qui ont une position ; un clic sur un camion affiche son nom, son signal et sa vitesse. */
function FleetMap({ vehicles, trail }: { vehicles: FleetVehicle[]; trail: [number, number][] }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const points: MapPoint[] = vehicles.flatMap((v) => {
    if (!v.position) return [];
    const s = signal(v);
    const speed = v.position.vitesse_kmh != null ? ` · ${Math.round(v.position.vitesse_kmh)} km/h` : '';
    const engine = v.position.contact == null ? '' : v.position.contact ? ' · moteur allumé' : ' · moteur éteint';
    return [{ id: v.id, label: v.nom.slice(0, 18), lat: v.position.latitude, lng: v.position.longitude, color: s.color, info: `${v.nom}${v.immatriculation ? ` · ${v.immatriculation}` : ''} — ${s.label}${speed}${engine}` }];
  });
  const key = JSON.stringify(points);
  const trailKey = JSON.stringify(trail);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && (e.data as { fleetMapReady?: boolean })?.fleetMapReady) setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ fleetPoints: JSON.parse(key) }, '*');
  }, [ready, key]);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ fleetTrail: JSON.parse(trailKey) }, '*');
  }, [ready, trailKey]);

  if (!points.length) return <p className="text-sm text-gray-500">Aucun véhicule n'a encore envoyé de position.</p>;
  return <iframe ref={frame} title="Carte des véhicules" srcDoc={MAP_PAGE} className="w-full rounded-xl border border-slate-200" style={{ height: 380 }} />;
}

/**
 * Suivi GPS de la flotte : carte en direct, dernière position de chaque véhicule, et le lien entre nos véhicules et les
 * boîtiers AlloGPS (trouvé automatiquement par l'immatriculation, modifiable ici).
 */
export default function FleetGpsPanel() {
  const { user } = useAuth();
  const canLink = LINKERS.includes(String(user?.role ?? ''));
  const fleet = useGetFleetPositionsQuery(undefined, { pollingInterval: 20000 });
  const gps = useGetGpsStatusQuery(undefined, { pollingInterval: 60000 });
  const [link, linking] = useLinkGpsMutation();
  const [selected, setSelected] = useState<number | null>(null);
  const trail = useGetVehicleTrailQuery({ id: selected ?? 0 }, { skip: selected == null, pollingInterval: 60000 });
  const vehicles = fleet.data ?? [];
  const boxes = gps.data?.vehicles ?? [];
  const status = (fleet.error as { status?: number } | undefined)?.status;
  if (status === 403 || status === 404) return null;

  const setLink = async (vehiculeId: number, key: string) => {
    try {
      await link({ vehicule_id: vehiculeId, gps_key: key || null }).unwrap();
      showSuccess(key ? 'Boîtier GPS relié' : 'Boîtier GPS retiré');
      void fleet.refetch();
      void gps.refetch();
    } catch (e) {
      showError((e as { data?: { message?: string } })?.data?.message || 'Le boîtier n’a pas pu être relié');
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Satellite className="h-5 w-5 text-blue-600" /> Suivi GPS en direct
          </h2>
          <p className="text-sm text-gray-600">Position des véhicules (boîtiers AlloGPS et téléphones des chauffeurs), mise à jour toutes les 20 secondes.</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {gps.data?.configured ? (
            gps.data.last_error ? (
              // Une phrase pour la direction ; le détail technique reste au survol pour le support.
              <span className="font-semibold text-amber-700" title={gps.data.last_error}>
                {/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH/.test(gps.data.last_error)
                  ? 'Boîtiers GPS injoignables pour le moment : seules les positions des téléphones des chauffeurs s’affichent.'
                  : /401|403/.test(gps.data.last_error)
                    ? 'Connexion AlloGPS refusée : vérifiez l’identifiant et le mot de passe AlloGPS du serveur.'
                    : 'Lecture des boîtiers GPS interrompue : nouvel essai automatique dans quelques minutes.'}
              </span>
            ) : gps.data.last_sync_at ? (
              <span>AlloGPS : {boxes.length} boîtier(s), dernière lecture {new Date(gps.data.last_sync_at).toLocaleTimeString('fr-FR')}</span>
            ) : (
              <span>AlloGPS : première lecture en cours…</span>
            )
          ) : (
            <span>AlloGPS n’est pas configuré sur le serveur.</span>
          )}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Véhicules', value: vehicles.length, tone: 'text-gray-900' },
          { label: 'En route', value: vehicles.filter(moving).length, tone: 'text-green-700' },
          { label: 'À l’arrêt', value: vehicles.filter((v) => !moving(v) && !silent(v)).length, tone: 'text-amber-700' },
          { label: 'Sans signal', value: vehicles.filter(silent).length, tone: 'text-gray-500' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 px-3 py-2">
            <div className={`text-xl font-bold ${k.tone}`}>{k.value}</div>
            <div className="text-xs text-gray-500">{k.label}</div>
          </div>
        ))}
      </div>

      <FleetMap vehicles={vehicles} trail={selected != null ? (trail.data ?? []).map((p) => [p.latitude, p.longitude] as [number, number]) : []} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Légende de la carte">
        {[
          ['#16a34a', 'En direct (moins de 2 min)'],
          ['#f59e0b', 'Récent (moins de 30 min)'],
          ['#64748b', 'Ancienne position'],
        ].map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span>Cliquez sur un véhicule pour voir son trajet.</span>
      </div>
      {selected != null && (
        <p className="mt-2 text-xs text-gray-600">
          Trajet des dernières 24 h de <b>{vehicles.find((v) => v.id === selected)?.nom}</b> ({trail.data?.length ?? 0} points).{' '}
          <button type="button" className="font-semibold text-blue-700" onClick={() => setSelected(null)}>
            Masquer le trajet
          </button>
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2">Véhicule</th>
              <th className="px-3 py-2">Signal</th>
              <th className="px-3 py-2">Vitesse</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Boîtier AlloGPS</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vehicles.map((v) => {
              const s = signal(v);
              const linked = boxes.find((b) => b.vehicule?.id === v.id);
              return (
                <tr key={v.id} className={selected === v.id ? 'bg-amber-50' : ''}>
                  <td className="px-3 py-2 font-semibold text-gray-900">
                    <button type="button" className="text-left hover:underline" title="Voir le trajet des dernières 24 h" onClick={() => setSelected(selected === v.id ? null : v.id)}>
                      {v.nom}
                    </button>
                    {v.immatriculation && <span className="ml-1 font-normal text-gray-500">· {v.immatriculation}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">{v.position?.vitesse_kmh != null ? `${Math.round(v.position.vitesse_kmh)} km/h` : '—'}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {v.position ? (
                      v.position.source === 'boitier' ? (
                        <span className="inline-flex items-center gap-1">
                          <Radio className="h-3.5 w-3.5" /> Boîtier GPS
                          {v.position.contact != null && <span className={v.position.contact ? 'text-green-700' : 'text-gray-500'}>· {v.position.contact ? 'moteur allumé' : 'moteur éteint'}</span>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> {v.position.chauffeur || 'Téléphone'}</span>
                      )
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {canLink && boxes.length ? (
                      <select
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        value={linked?.key ?? ''}
                        disabled={linking.isLoading}
                        onChange={(e) => void setLink(v.id, e.target.value)}
                        aria-label={`Boîtier AlloGPS de ${v.nom}`}>
                        <option value="">— Aucun —</option>
                        {boxes.map((b) => (
                          <option key={b.key} value={b.key} disabled={!!b.vehicule && b.vehicule.id !== v.id}>
                            {[b.name, b.plate].filter(Boolean).join(' · ') || b.key}
                            {b.vehicule && b.vehicule.id !== v.id ? ` (${b.vehicule.nom})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-600">{linked ? [linked.name, linked.plate].filter(Boolean).join(' · ') : v.gps ? 'Relié' : '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {v.position && (
                      <a className="inline-flex items-center gap-1 font-semibold text-blue-700" href={`https://www.google.com/maps?q=${v.position.latitude},${v.position.longitude}`} target="_blank" rel="noreferrer">
                        <MapPin className="h-4 w-4" /> Voir sur Maps
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
