import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Satellite } from 'lucide-react';
import GpsMap, { type GpsMapPoint } from '../components/GpsMap';
import { useGetVehicleDayQuery, useGetVehicleDaysQuery, type VehicleDay } from '../store/api/gpsApi';
import { clock, compass, dayKey, duration, shiftDay, signalOf } from '../utils/gpsFormat';

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
const longDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const POINTS_SHOWN = 50;

/**
 * Un véhicule, tout ce qui est connu : où il est maintenant (vitesse, cap, moteur et ce que dit le boîtier : adresse,
 * kilométrage, carburant…), et n'importe quel jour des 30 derniers : le trajet sur la carte, distance, vitesses, temps
 * de conduite et d'arrêt, les arrêts, chaque point, et toutes les valeurs brutes du boîtier. Aujourd'hui se met à jour
 * toutes les 20 s. Sans lien avec un bon ou une livraison.
 */
export default function VehicleGpsPage() {
  const params = useParams();
  const id = Number(params.id);
  const valid = Number.isSafeInteger(id) && id > 0;
  const today = dayKey();
  const [date, setDate] = useState(today);
  const isToday = date === today;
  const day = useGetVehicleDayQuery({ id, date }, { skip: !valid, pollingInterval: isToday ? 20000 : 0 });
  const days = useGetVehicleDaysQuery(id, { skip: !valid });
  const oldest = shiftDay(today, -30);
  const d = day.data;
  const status = (day.error as { status?: number } | undefined)?.status;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <Link to="/gps" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> GPS des véhicules
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{d ? [d.vehicule.nom, d.vehicule.immatriculation].filter(Boolean).join(' · ') : 'Véhicule'}</h1>
          {d && <p className="text-sm text-gray-600">{[d.vehicule.marque, d.vehicule.modele, d.vehicule.annee, d.vehicule.type].filter(Boolean).join(' · ') || ' '}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={date <= oldest} onClick={() => setDate(shiftDay(date, -1))} title="Jour précédent" className="rounded-lg border border-gray-300 bg-white p-2 hover:bg-gray-50 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={date} min={oldest} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          <button type="button" disabled={isToday} onClick={() => setDate(shiftDay(date, 1))} title="Jour suivant" className="rounded-lg border border-gray-300 bg-white p-2 hover:bg-gray-50 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button type="button" onClick={() => setDate(today)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              Aujourd’hui
            </button>
          )}
        </div>
      </div>

      {!!days.data?.length && (
        <div className="mb-4 flex flex-wrap gap-2">
          {days.data.map((x) => (
            <button
              key={x.date}
              type="button"
              onClick={() => setDate(x.date)}
              title={`${x.points} points${x.max_kmh != null ? ` · max ${Math.round(x.max_kmh)} km/h` : ''}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${x.date === date ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {x.date === today ? 'Aujourd’hui' : shortDay(x.date)}
            </button>
          ))}
        </div>
      )}

      {!valid || status === 404 ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">Véhicule introuvable.</p>
      ) : status === 403 ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Le GPS est réservé à la direction et au chef chauffeur.</p>
      ) : day.isLoading ? (
        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
      ) : day.isError || !d ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Le détail n’a pas pu être chargé.</p>
      ) : (
        <DayView d={d} isToday={isToday} />
      )}
    </div>
  );
}

function DayView({ d, isToday }: { d: VehicleDay; isToday: boolean }) {
  const [allPoints, setAllPoints] = useState(false);
  const s = d.stats;
  const p = d.position;
  const extra = d.boitier?.extra;
  const signal = signalOf(p?.recorded_at);

  const points: GpsMapPoint[] = [
    ...s.stops.map((x, i) => ({ id: `stop-${i}`, label: '', lat: x.latitude, lng: x.longitude, color: '#64748b', small: true, info: `Arrêt ${clock(x.from)} – ${clock(x.to)} · ${duration(x.minutes)}` })),
    ...(isToday && p ? [{ id: d.vehicule.id, label: d.vehicule.nom.slice(0, 20), lat: p.latitude, lng: p.longitude, color: signal.color, info: `${d.vehicule.nom} — ${signal.label}` }] : []),
  ];
  const trail = d.points.map((x) => [x.latitude, x.longitude] as [number, number]);
  const rows = [...d.points].reverse();
  const shown = allPoints ? rows : rows.slice(0, POINTS_SHOWN);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <GpsMap points={points} trail={trail} frameKey={`${d.vehicule.id}-${d.date}`} height={460} />

        <Card title={isToday ? 'Trajet d’aujourd’hui' : `Trajet du ${longDay(d.date)}`}>
          {s.points < 2 ? (
            <p className="text-sm text-gray-500">Aucun trajet enregistré ce jour-là.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile label="Distance" value={`${s.distance_km.toLocaleString('fr-FR')} km`} big />
              <Tile label="Vitesse max" value={s.max_kmh != null ? `${s.max_kmh} km/h` : '–'} big />
              <Tile label="Vitesse moyenne" value={s.avg_kmh != null ? `${Math.round(s.avg_kmh)} km/h` : '–'} big />
              <Tile label="Temps de conduite" value={duration(s.driving_minutes)} />
              <Tile label="Temps à l’arrêt" value={duration(s.stopped_minutes)} />
              <Tile label="Premier / dernier point" value={`${clock(s.first_at)} – ${clock(s.last_at)}`} />
            </div>
          )}
        </Card>

        {s.points >= 2 && (
          <Card title={`Arrêts de 5 min et plus · ${s.stops.length}`}>
            {s.stops.length ? (
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-1.5 pr-3">De</th>
                    <th className="py-1.5 pr-3">À</th>
                    <th className="py-1.5 pr-3">Durée</th>
                    <th className="py-1.5">Lieu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {s.stops.map((x) => (
                    <tr key={x.from}>
                      <td className="py-1.5 pr-3 font-medium">{clock(x.from)}</td>
                      <td className="py-1.5 pr-3">{clock(x.to)}</td>
                      <td className="py-1.5 pr-3">{duration(x.minutes)}</td>
                      <td className="py-1.5">
                        <a href={mapsUrl(x.latitude, x.longitude)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                          <MapPin className="h-3.5 w-3.5" /> Voir sur Maps
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">Aucun arrêt.</p>
            )}
          </Card>
        )}

        {d.points.length > 0 && (
          <Card title={`Points du trajet · ${d.points.length}`}>
            <div className="max-h-[480px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-1.5 pr-3">Heure</th>
                    <th className="py-1.5 pr-3">Vitesse</th>
                    <th className="py-1.5 pr-3">Cap</th>
                    <th className="py-1.5 pr-3">Moteur</th>
                    <th className="py-1.5">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shown.map((x) => (
                    <tr key={x.recorded_at}>
                      <td className="py-1.5 pr-3 font-medium">{clock(x.recorded_at)}</td>
                      <td className="py-1.5 pr-3">{x.vitesse_kmh != null ? `${Math.round(x.vitesse_kmh)} km/h` : '–'}</td>
                      <td className="py-1.5 pr-3">{compass(x.cap) ?? '–'}</td>
                      <td className="py-1.5 pr-3">{x.contact == null ? '–' : x.contact ? 'Allumé' : 'Éteint'}</td>
                      <td className="py-1.5">
                        <a href={mapsUrl(x.latitude, x.longitude)} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                          {x.latitude.toFixed(5)}, {x.longitude.toFixed(5)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!allPoints && rows.length > POINTS_SHOWN && (
              <button type="button" onClick={() => setAllPoints(true)} className="mt-2 text-sm font-semibold text-blue-700 hover:underline">
                Tout afficher ({rows.length})
              </button>
            )}
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card title="Maintenant">
          {p ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: signal.color }} />
                  {signal.label} · {clock(p.recorded_at)}
                </span>
                <a href={mapsUrl(p.latitude, p.longitude)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  <MapPin className="h-3.5 w-3.5" /> Maps
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Tile label="Vitesse" value={p.vitesse_kmh != null ? `${Math.round(p.vitesse_kmh)} km/h` : '–'} />
                <Tile label="Direction" value={p.cap != null ? `${compass(p.cap)} · ${Math.round(p.cap)}°` : '–'} />
                <Tile label="Moteur" value={p.contact == null ? '–' : p.contact ? 'Allumé' : 'Éteint'} />
                <Tile label="Source" value={p.source === 'boitier' ? 'Boîtier GPS' : 'Téléphone du chauffeur'} />
                {p.chauffeur && <Tile label="Chauffeur" value={p.chauffeur} />}
                {p.precision_m != null && <Tile label="Précision" value={`± ${Math.round(p.precision_m)} m`} />}
                {extra?.kilometrage_km != null && <Tile label="Kilométrage" value={`${extra.kilometrage_km.toLocaleString('fr-FR')} km`} />}
                {extra?.carburant != null && <Tile label="Carburant" value={String(extra.carburant)} />}
                {extra?.batterie_v != null && <Tile label="Batterie" value={`${extra.batterie_v} V`} />}
                {extra?.satellites != null && <Tile label="Satellites" value={String(extra.satellites)} />}
                {extra?.altitude_m != null && <Tile label="Altitude" value={`${Math.round(extra.altitude_m)} m`} />}
                {extra?.etat && <Tile label="État" value={extra.etat} />}
              </div>
              {extra?.adresse && <p className="mt-3 text-sm text-gray-800"><span className="text-gray-500">Adresse : </span>{extra.adresse}</p>}
              <p className="mt-2 text-xs text-gray-400">{p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Pas encore de position.</p>
          )}
        </Card>

        <Card title="Véhicule">
          <Lines
            rows={[
              ['Immatriculation', d.vehicule.immatriculation],
              ['Marque / modèle', [d.vehicule.marque, d.vehicule.modele, d.vehicule.annee].filter(Boolean).join(' ')],
              ['Type', d.vehicule.type],
              ['Statut', d.vehicule.statut],
              ['Boîtier AlloGPS', d.vehicule.boitier ? [d.vehicule.boitier.name, d.vehicule.boitier.plate, d.vehicule.boitier.agency].filter(Boolean).join(' · ') : d.vehicule.gps_key],
            ]}
          />
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><Satellite className="h-4 w-4 text-blue-600" /> Toutes les données du boîtier</span>}>
          {d.boitier ? (
            <>
              {d.boitier.read_at && <p className="mb-2 text-xs text-gray-500">Lu par le serveur à {clock(d.boitier.read_at)}</p>}
              {d.boitier.error && <p className="mb-2 text-xs text-red-700">Dernière lecture refusée : {d.boitier.error}</p>}
              <Lines rows={d.boitier.details.map((x) => [x.champ, x.valeur])} mono />
            </>
          ) : (
            <p className="text-sm text-gray-500">Ce véhicule n’a pas de boîtier AlloGPS associé : seule la position partagée par le téléphone du chauffeur est connue.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`${big ? 'text-xl' : 'text-sm'} font-bold text-gray-900`}>{value}</div>
    </div>
  );
}

function Lines({ rows, mono }: { rows: [string, string | number | null | undefined][]; mono?: boolean }) {
  const shown = rows.filter(([, v]) => v != null && v !== '');
  if (!shown.length) return <p className="text-sm text-gray-500">–</p>;
  return (
    <dl className="divide-y divide-gray-100 text-sm">
      {shown.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-1.5">
          <dt className="text-gray-500">{k}</dt>
          <dd className={`text-right font-medium text-gray-900 ${mono ? 'tabular-nums break-all' : ''}`}>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
