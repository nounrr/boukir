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
  has_photo?: boolean | number;
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
export type DailyPresenceStatus = 'absent' | 'present' | 'termine';
export interface DailyPresenceRow {
  key: string; employe_id: number; nom_complet: string | null; cin: string; role: string | null;
  date_pointage: string; obligatoire: boolean; statut: DailyPresenceStatus;
  entree: string | null; sortie: string | null; temps_travail_minutes: number; temps_en_cours: boolean;
  entree_event_id: number | null; sortie_event_id: number | null;
  entree_has_photo: boolean; sortie_has_photo: boolean;
  anomalies: string[]; passages_count: number;
  absence_saisie: { id: number; type_absence: string; motif: string | null } | null;
}
export interface DailyPresenceArgs {
  month: string; day?: string; employe_id?: number; status?: DailyPresenceStatus; search?: string; page?: number;
}
export interface DailyPresenceResponse {
  data: DailyPresenceRow[];
  today: string; timezone: string;
  pagination: { page: number; limit: number; total: number };
  summary: { absent: number; present: number; termine: number; temps_travail_minutes: number };
  employees: Array<{ id: number; nom_complet: string | null; cin: string }>;
  unassigned_count: number;
}
export const pointageApi = api.injectEndpoints({
  endpoints: builder => ({
    getDailyPresence: builder.query<DailyPresenceResponse, DailyPresenceArgs>({
      query: params => ({ url: '/pointage/daily', params, timeout: 15000 }),
      providesTags: ['Pointage', 'Employee', 'Absence'],
    }),
    setEmployeePointageRequirement: builder.mutation<{ employe_id: number; pointage_obligatoire: boolean; depuis: string }, { id: number; obligatoire: boolean }>({
      query: ({ id, obligatoire }) => ({ url: `/pointage/employees/${id}/requirement`, method: 'PATCH', body: { obligatoire } }),
      invalidatesTags: ['Pointage', 'Employee'],
    }),
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
export const { useGetDailyPresenceQuery, useSetEmployeePointageRequirementMutation, useGetPointageConfigQuery, useSavePointageConfigMutation, useGetPointageStatusQuery, useGetPointageEventsQuery, useLinkPointageIdentityMutation } = pointageApi;
