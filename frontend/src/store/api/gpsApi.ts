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
export type GpsVehicle = { key: string; name: string | null; plate: string | null; agency: string | null; vehicule: { id: number; nom: string; immatriculation: string | null } | null };
export type GpsStatus = { configured: boolean; last_sync_at: string | null; last_error: string | null; updated: number; vehicles: GpsVehicle[] };

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
    linkGps: builder.mutation<{ ok: true }, { vehicule_id: number; gps_key: string | null }>({
      query: (body) => ({ url: '/vehicule-positions/gps/link', method: 'PUT', body }),
    }),
  }),
});

export const { useGetFleetPositionsQuery, useGetGpsStatusQuery, useGetVehicleTrailQuery, useLinkGpsMutation } = gpsApi;
