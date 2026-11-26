import { api } from './apiSlice';

export type FleetPosition = {
  latitude: number;
  longitude: number;
  vitesse_kmh: number | null;
  cap: number | null;
  /** Moteur allumé / éteint selon le boîtier (null pour un téléphone). */
  contact?: boolean | null;
  source: 'boitier' | 'telephone' | string;
  recorded_at: string;
  chauffeur: string | null;
};
export type FleetVehicle = { id: number; nom: string; immatriculation: string | null; gps: boolean; position: FleetPosition | null };
/** Ce que le boîtier envoie en plus de la position, quand il l'envoie. */
export type GpsExtra = { adresse: string | null; kilometrage_km: number | null; carburant: number | null; batterie_v: number | null; satellites: number | null; altitude_m: number | null; etat: string | null };
export type BoxPosition = { latitude: number; longitude: number; vitesse_kmh: number | null; cap: number | null; contact: boolean | null; recorded_at: string | null; extra?: GpsExtra | null };
export type GpsVehicle = {
  key: string;
  name: string | null;
  plate: string | null;
  agency: string | null;
  vehicule: { id: number; nom: string; immatriculation: string | null } | null;
  position?: BoxPosition | null;
  read_at?: string | null;
  error?: string | null;
};
export type OurVehicle = { id: number; nom: string; immatriculation: string | null; gps_key: string | null };
export type GpsStatus = { configured: boolean; last_sync_at: string | null; last_error: string | null; updated: number; vehicles: GpsVehicle[]; ours?: OurVehicle[] };

export type DayPoint = { latitude: number; longitude: number; vitesse_kmh: number | null; cap: number | null; contact: boolean | null; recorded_at: string };
export type DayStop = { latitude: number; longitude: number; from: string; to: string; minutes: number };
export type DayStats = { points: number; distance_km: number; max_kmh: number | null; avg_kmh: number | null; driving_minutes: number; stopped_minutes: number; first_at: string | null; last_at: string | null; stops: DayStop[] };
export type VehicleDay = {
  date: string;
  vehicule: {
    id: number;
    nom: string;
    immatriculation: string | null;
    marque: string | null;
    modele: string | null;
    annee: number | null;
    type: string | null;
    statut: string | null;
    gps_key: string | null;
    boitier: { name: string | null; plate: string | null; agency: string | null } | null;
  };
  position: (FleetPosition & { precision_m: number | null }) | null;
  boitier: { read_at: string | null; error: string | null; extra: GpsExtra | null; details: { champ: string; valeur: string }[] } | null;
  points: DayPoint[];
  stats: DayStats;
};

/** Suivi des véhicules : boîtiers AlloGPS (lus par le serveur) et téléphones des chauffeurs. */
const gpsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getFleetPositions: builder.query<FleetVehicle[], void>({
      query: () => '/vehicule-positions',
      keepUnusedDataFor: 0,
    }),
    getGpsStatus: builder.query<GpsStatus, void>({
      query: () => '/vehicule-positions/gps',
      keepUnusedDataFor: 0,
    }),
    getVehicleTrail: builder.query<{ latitude: number; longitude: number; vitesse_kmh: number | null; recorded_at: string }[], { id: number; heures?: number }>({
      query: ({ id, heures = 24 }) => ({ url: `/vehicule-positions/${id}/trajet`, params: { heures } }),
      keepUnusedDataFor: 0,
    }),
    getVehicleDay: builder.query<VehicleDay, { id: number; date: string }>({
      query: ({ id, date }) => ({ url: `/vehicule-positions/${id}/jour`, params: { date } }),
      keepUnusedDataFor: 0,
    }),
    getVehicleDays: builder.query<{ date: string; points: number; max_kmh: number | null }[], number>({
      query: (id) => `/vehicule-positions/${id}/jours`,
      keepUnusedDataFor: 60,
    }),
    linkGps: builder.mutation<{ ok: true }, { vehicule_id: number; gps_key: string | null }>({
      query: (body) => ({ url: '/vehicule-positions/gps/link', method: 'PUT', body }),
    }),
  }),
});

export const { useGetFleetPositionsQuery, useGetGpsStatusQuery, useGetVehicleTrailQuery, useGetVehicleDayQuery, useGetVehicleDaysQuery, useLinkGpsMutation } = gpsApi;
