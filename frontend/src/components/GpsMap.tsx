import { useEffect, useRef, useState } from 'react';

export type GpsMapPoint = { id: string | number; label: string; lat: number; lng: number; color: string; info: string; small?: boolean; clickable?: boolean };

/**
 * Carte OpenStreetMap (Leaflet, sans clé) dans un cadre : chargée une fois, puis les points et le trajet sont envoyés
 * par message, sans recharger la carte que l'utilisateur regarde. Le cadrage se fait au premier affichage et quand
 * `frameKey` change (autre véhicule, autre jour). Un clic sur un point « clickable » appelle onPick(id).
 */
const MAP_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}.tag{background:#111827;color:#fff;border:0;border-radius:8px;padding:2px 6px;font:600 11px system-ui,sans-serif;box-shadow:none}.tag:before{display:none}</style>
</head><body><div id="map"></div><script>
var map = L.map('map').setView([35.7595, -5.834], 12), layer = L.layerGroup().addTo(map), route = L.layerGroup().addTo(map), framedFor = null;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
window.addEventListener('message', function (e) {
  var d = e.data; if (!d || !d.gpsMap) return;
  layer.clearLayers(); route.clearLayers();
  var bounds = [];
  if (d.trail && d.trail.length > 1) {
    L.polyline(d.trail, { color: '#D4A017', weight: 4, opacity: 0.9 }).addTo(route);
    L.circleMarker(d.trail[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(route).bindTooltip('Départ');
    bounds = bounds.concat(d.trail);
  }
  d.points.forEach(function (p) {
    var el = document.createElement('div'); el.textContent = p.info;
    var m = L.circleMarker([p.lat, p.lng], { radius: p.small ? 6 : 9, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 1 }).addTo(layer).bindPopup(el);
    if (!p.small) m.bindTooltip(document.createTextNode(p.label), { permanent: true, direction: 'top', className: 'tag', offset: [0, -8] });
    if (p.clickable) m.on('click', function () { parent.postMessage({ gpsMapPick: p.id }, '*'); });
    bounds.push([p.lat, p.lng]);
  });
  if (framedFor !== d.frameKey && bounds.length) { framedFor = d.frameKey; map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 }); }
});
parent.postMessage({ gpsMapReady: true }, '*');
</script></body></html>`;

export default function GpsMap({
  points,
  trail = [],
  frameKey = 'all',
  height = 420,
  onPick,
}: {
  points: GpsMapPoint[];
  trail?: [number, number][];
  frameKey?: string;
  height?: number;
  onPick?: (id: string | number) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const payload = JSON.stringify({ points, trail, frameKey });
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const data = e.data as { gpsMapReady?: boolean; gpsMapPick?: string | number };
      if (data?.gpsMapReady) setReady(true);
      if (data?.gpsMapPick != null) pick.current?.(data.gpsMapPick);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ gpsMap: true, ...JSON.parse(payload) }, '*');
  }, [ready, payload]);

  return <iframe ref={frame} title="Carte GPS" srcDoc={MAP_PAGE} className="w-full rounded-xl border border-slate-200" style={{ height }} />;
}
