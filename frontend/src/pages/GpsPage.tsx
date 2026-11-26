import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Link2, MapPin, Satellite, Search } from 'lucide-react';
import GpsMap, { type GpsMapPoint } from '../components/GpsMap';
import { useGetGpsStatusQuery, useLinkGpsMutation, type GpsVehicle } from '../store/api/gpsApi';
import { useAuth } from '../hooks/redux';
import { showError, showSuccess } from '../utils/notifications';
import { clock, compass, signalOf } from '../utils/gpsFormat';

/** Seule la direction change une association (le chef chauffeur la voit). */
const LINKERS = ['PDG', 'ManagerPlus', 'Manager'];
type Filter = 'all' | 'linked' | 'unlinked';

const seenAt = (b: GpsVehicle) => b.position?.recorded_at ?? b.read_at ?? null;
const boxName = (b: GpsVehicle) => [b.name, b.plate].filter(Boolean).join(' · ') || b.key;
const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/**
 * GPS AlloGPS : tous les véhicules des boîtiers, associés ou non à un véhicule de la société. Position, vitesse, cap,
 * moteur et adresse en direct (mise à jour toutes les 20 s), et l'association choisie ici (ou trouvée par
 * l'immatriculation). Un véhicule associé ouvre son détail : position, trajet de chaque jour, arrêts, données du boîtier.
 */
export default function GpsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canLink = LINKERS.includes(String(user?.role ?? ''));
  const gps = useGetGpsStatusQuery(undefined, { pollingInterval: 20000 });
  const [link, linking] = useLinkGpsMutation();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [picking, setPicking] = useState<string | null>(null);

  const data = gps.data;
  const boxes = data?.vehicles ?? [];
  const ours = data?.ours ?? [];
  const wanted = q.trim().toLowerCase();
  const list = boxes.filter(
    (b) =>
      (filter === 'all' || (filter === 'linked' ? !!b.vehicule : !b.vehicule)) &&
      (!wanted || `${b.name ?? ''} ${b.plate ?? ''} ${b.agency ?? ''} ${b.vehicule?.nom ?? ''} ${b.vehicule?.immatriculation ?? ''}`.toLowerCase().includes(wanted)),
  );
  const linkedCount = boxes.filter((b) => b.vehicule).length;
  const movingCount = boxes.filter((b) => signalOf(seenAt(b)).live && Number(b.position?.vitesse_kmh ?? 0) >= 5).length;

  const points: GpsMapPoint[] = list.flatMap((b) => {
    if (!b.position) return [];
    const s = signalOf(seenAt(b));
    const speed = b.position.vitesse_kmh != null ? ` · ${Math.round(b.position.vitesse_kmh)} km/h` : '';
    return [{
      id: b.vehicule?.id ?? b.key,
      label: (b.vehicule?.nom ?? b.name ?? b.plate ?? b.key).slice(0, 20),
      lat: b.position.latitude,
      lng: b.position.longitude,
      color: s.color,
      info: `${boxName(b)}${b.vehicule ? ` → ${b.vehicule.nom}` : ''} — ${s.label}${speed}`,
      clickable: !!b.vehicule,
    }];
  });

  const setLink = async (vehiculeId: number, key: string | null, label: string) => {
    try {
      await link({ vehicule_id: vehiculeId, gps_key: key }).unwrap();
      showSuccess(label);
      setPicking(null);
      void gps.refetch();
    } catch (e) {
      showError((e as { data?: { message?: string } })?.data?.message || 'L’association n’a pas pu être enregistrée');
    }
  };

  const status = (gps.error as { status?: number } | undefined)?.status;
  const bad = !data?.configured || !!data?.last_error;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Satellite className="h-6 w-6 text-blue-600" /> GPS des véhicules
          </h1>
          <p className="text-sm text-gray-600">Tous les véhicules des boîtiers AlloGPS, mis à jour toutes les 20 secondes.</p>
        </div>
        {data && (
          <div className="flex gap-2 text-sm">
            <Stat label="Boîtiers" value={boxes.length} />
            <Stat label="Associés" value={linkedCount} />
            <Stat label="En route" value={movingCount} />
          </div>
        )}
      </div>

      {gps.isLoading ? (
        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
      ) : gps.isError ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {status === 403 ? 'Le GPS est réservé à la direction et au chef chauffeur.' : status === 404 ? 'Le serveur doit être mis à jour pour le GPS.' : 'Le GPS n’a pas pu être chargé.'}
        </p>
      ) : (
        <>
          <div className={`mb-4 flex items-center gap-2 rounded-lg border-l-4 p-3 text-sm ${bad ? 'border-red-500 bg-red-50 text-red-800' : 'border-green-500 bg-green-50 text-green-800'}`}>
            <Satellite className="h-4 w-4 shrink-0" />
            <span title={data?.last_error ?? undefined}>
              {!data?.configured
                ? 'AlloGPS n’est pas configuré sur le serveur : ajoutez ALLOGPS_ACCOUNT_ID, ALLOGPS_EMAIL et ALLOGPS_PASSWORD dans le .env.'
                : data.last_error
                  ? /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH/.test(data.last_error)
                    ? 'AlloGPS refuse la connexion du serveur : demandez-leur d’autoriser l’adresse IP du serveur.'
                    : `AlloGPS a répondu par une erreur : ${data.last_error}`
                  : data.last_sync_at
                    ? `AlloGPS : ${boxes.length} véhicule(s), dernière lecture à ${clock(data.last_sync_at)}.`
                    : 'Première lecture AlloGPS en cours…'}
            </span>
          </div>

          <GpsMap points={points} onPick={(id) => typeof id === 'number' && navigate(`/gps/vehicule/${id}`)} />

          <div className="my-4 flex flex-wrap items-center gap-3">
            <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, immatriculation, agence…" className="w-full border-0 p-0 text-sm outline-none focus:ring-0" />
            </label>
            <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm">
              {([['all', 'Tous'], ['linked', 'Associés'], ['unlinked', 'Non associés']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`px-3 py-2 ${filter === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Véhicule AlloGPS</th>
                  <th className="px-3 py-2">Signal</th>
                  <th className="px-3 py-2">Vitesse</th>
                  <th className="px-3 py-2">Moteur</th>
                  <th className="px-3 py-2">Adresse</th>
                  <th className="px-3 py-2">Véhicule de la société</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((b) => {
                  const s = signalOf(seenAt(b));
                  const p = b.position;
                  return (
                    <tr key={b.key} className="align-top hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900">{boxName(b)}</div>
                        <div className="text-xs text-gray-500">{[b.agency ? `Agence ${b.agency}` : null, `clé ${b.key}`].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="px-3 py-3">
                        {p ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                            {s.label}
                          </span>
                        ) : (
                          <span className="text-gray-500">{b.error ? `Lecture refusée : ${b.error}` : 'Pas encore de position'}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{p?.vitesse_kmh != null ? `${Math.round(p.vitesse_kmh)} km/h${compass(p.cap) ? ` · ${compass(p.cap)}` : ''}` : '–'}</td>
                      <td className="whitespace-nowrap px-3 py-3">{p?.contact == null ? '–' : p.contact ? <span className="font-medium text-green-700">Allumé</span> : 'Éteint'}</td>
                      <td className="max-w-[220px] px-3 py-3 text-gray-700">{p?.extra?.adresse ?? '–'}</td>
                      <td className="px-3 py-3">
                        {picking === b.key ? (
                          <select
                            autoFocus
                            defaultValue={b.vehicule?.id ?? ''}
                            disabled={linking.isLoading}
                            onChange={(e) => {
                              const id = Number(e.target.value);
                              const ourName = ours.find((o) => o.id === id)?.nom ?? '';
                              if (id) void setLink(id, b.key, `${boxName(b)} est associé à ${ourName}`);
                            }}
                            onBlur={() => setPicking(null)}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                          >
                            <option value="">Choisir le véhicule…</option>
                            {ours.map((o) => (
                              <option key={o.id} value={o.id}>
                                {[o.nom, o.immatriculation, o.gps_key && o.gps_key !== b.key ? '(a déjà un boîtier)' : null].filter(Boolean).join(' · ')}
                              </option>
                            ))}
                          </select>
                        ) : b.vehicule ? (
                          <span className="font-medium text-green-700">{[b.vehicule.nom, b.vehicule.immatriculation].filter(Boolean).join(' · ')}</span>
                        ) : (
                          <span className="text-gray-500">Non associé</span>
                        )}
                        {canLink && picking !== b.key && (
                          <div className="mt-1 flex gap-3 text-xs">
                            <button type="button" onClick={() => setPicking(b.key)} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                              <Link2 className="h-3.5 w-3.5" /> {b.vehicule ? 'Changer' : 'Associer'}
                            </button>
                            {b.vehicule && (
                              <button
                                type="button"
                                onClick={() => window.confirm(`Retirer l’association de ${b.vehicule!.nom} ?`) && void setLink(b.vehicule!.id, null, 'Association retirée')}
                                className="font-semibold text-red-700 hover:underline"
                              >
                                Retirer
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {p && (
                            <a href={mapsUrl(p.latitude, p.longitude)} target="_blank" rel="noreferrer" title="Ouvrir dans Google Maps" className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100">
                              <MapPin className="h-4 w-4" />
                            </a>
                          )}
                          {b.vehicule && (
                            <button type="button" onClick={() => navigate(`/gps/vehicule/${b.vehicule!.id}`)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                              Détail <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                      {boxes.length ? 'Aucun résultat.' : 'AlloGPS n’a encore renvoyé aucun véhicule.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {ours.some((o) => !o.gps_key) && (
            <p className="mt-3 text-xs text-gray-500">
              Sans boîtier (suivis seulement par le téléphone du chauffeur) :{' '}
              {ours
                .filter((o) => !o.gps_key)
                .map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ', '}
                    <button type="button" onClick={() => navigate(`/gps/vehicule/${o.id}`)} className="text-blue-700 hover:underline">
                      {o.nom}
                    </button>
                  </span>
                ))}
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
