import { api } from './apiSlice';

export interface PointageStatus {
  configured: boolean;
  device_key: string | null;
  timezone: string;
  direction: 'entree' | 'sortie' | 'inconnu';
  attendance_map: Record<string, string>;
  last_received_at: string | null;
}
export interface PointageEvent {
  id: number;
  device_key: string;
  person_id: string;
  employe_id: number | null;
  nom_complet: string | null;
  date_pointage: string;
  heure_pointage: string;
  method: string;
  direction: 'entree' | 'sortie' | 'inconnu';
}
export interface PointageDeviceConfig {
  device_key: string;
  timezone: string;
  direction: 'entree' | 'sortie' | 'inconnu';
  attendance_map: Record<string, string>;
  local_ip: string;
  firmware: string;
  configured?: boolean;
  public_origin?: string;
}
export const pointageApi = api.injectEndpoints({
  endpoints: builder => ({
    getPointageConfig: builder.query<PointageDeviceConfig, void>({
      query: () => ({ url: '/pointage/config', timeout: 15000 }), providesTags: ['Pointage'],
    }),
    savePointageConfig: builder.mutation<{ saved: boolean; callback_url: string | null }, PointageDeviceConfig & { rotate_token?: boolean }>({
      query: body => ({ url: '/pointage/config', method: 'PUT', body, timeout: 15000 }), invalidatesTags: ['Pointage'],
    }),
    getPointageStatus: builder.query<PointageStatus, void>({
      query: () => ({ url: '/pointage/status', timeout: 15000 }), providesTags: ['Pointage'],
    }),
    getPointageEvents: builder.query<{ data: PointageEvent[]; pagination: { page: number; limit: number; total: number } }, { month: string; page: number }>({
      query: params => ({ url: '/pointage/events', params, timeout: 15000 }), providesTags: ['Pointage'],
    }),
    linkPointageIdentity: builder.mutation<unknown, { device_key: string; person_id: string; employe_id: number }>({
      query: body => ({ url: '/pointage/identities', method: 'PUT', body }), invalidatesTags: ['Pointage'],
    }),
  }),
});
export const { useGetPointageConfigQuery, useSavePointageConfigMutation, useGetPointageStatusQuery, useGetPointageEventsQuery, useLinkPointageIdentityMutation } = pointageApi;
