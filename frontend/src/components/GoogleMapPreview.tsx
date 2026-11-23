import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

/* Minimal typing of the Maps JavaScript API pieces used here. */
type LatLng = { lat: number; lng: number };
type GoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => { setCenter: (p: LatLng) => void };
    Marker: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
    Geocoder: new () => {
      geocode: (req: { address: string; region?: string }) => Promise<{ results: { geometry: { location: { lat: () => number; lng: () => number } } }[] }>;
    };
  };
};

const KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
let loading: Promise<GoogleMaps> | null = null;

/** Loads the Maps JavaScript API once for the whole back office. */
function loadGoogleMaps(): Promise<GoogleMaps> {
  const w = window as unknown as { google?: GoogleMaps; __boukirMapsReady?: () => void };
  if (w.google?.maps?.Map) return Promise.resolve(w.google);
  if (loading) return loading;
  loading = new Promise<GoogleMaps>((resolve, reject) => {
    w.__boukirMapsReady = () => (w.google ? resolve(w.google) : reject(new Error('Google Maps indisponible')));
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&language=fr&region=MA&loading=async&callback=__boukirMapsReady`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Google Maps indisponible'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Small Google map with a marker on the delivery / mission point (or the address found by Google),
 * plus the « open in Google Maps » link. Without VITE_GOOGLE_MAPS_API_KEY only the link is shown.
 */
export function GoogleMapPreview({ lat, lng, address, label, height = 220 }: { lat?: number | null; lng?: number | null; address?: string; label: string; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const hasPoint = lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const query = String(address || '').trim();
  const href = hasPoint
    ? `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`
    : query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  const showMap = Boolean(KEY) && !failed && (hasPoint || Boolean(query));

  useEffect(() => {
    if (!showMap || !box.current) return;
    let alive = true;
    const el = box.current;
    loadGoogleMaps()
      .then(async (google) => {
        let center: LatLng | null = hasPoint ? { lat: Number(lat), lng: Number(lng) } : null;
        if (!center && query) {
          const found = await new google.maps.Geocoder().geocode({ address: query, region: 'MA' });
          const loc = found.results[0]?.geometry.location;
          if (loc) center = { lat: loc.lat(), lng: loc.lng() };
        }
        if (!alive) return;
        if (!center) return setFailed(true);
        const map = new google.maps.Map(el, { center, zoom: hasPoint ? 16 : 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: 'cooperative' });
        new google.maps.Marker({ position: center, map, title: label });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [showMap, hasPoint, lat, lng, query, label]);

  if (!href) return null;
  return (
    <div className="space-y-2">
      {showMap && <div ref={box} className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ height }} role="img" aria-label={label} />}
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
        <MapPin className="h-4 w-4" />
        {label}
      </a>
    </div>
  );
}
