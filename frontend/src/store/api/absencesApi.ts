import { apiSlice } from './apiSlice';

export type AbsenceType = 'totale' | 'partielle';

export interface AbsencePermissions {
  gestion: boolean;
  statistiques: boolean;
}

export interface AbsencePermissionEmployee extends AbsencePermissions {
  id: number;
  nom_complet: string | null;
  cin: string | null;
  role: string | null;
  verrouille: boolean;
}

export interface AbsenceConfig {
  penalite_jour: number;
  heure_entree_reference: string;
  heures_par_jour: number;
}

export interface AbsenceEmployeeOption {
  id: number;
  nom_complet: string | null;
  cin: string | null;
  role: string | null;
}

export interface Absence {
  id: number;
  employe_id: number;
  date_absence: string; // YYYY-MM-DD
  type_absence: AbsenceType;
  heure_entree: string | null; // HH:mm
  montant_retenue: number;
  motif: string | null;
  created_at: string;
  updated_at: string;
  nom_complet: string | null;
  cin: string | null;
  role: string | null;
}

export interface AbsenceCreatePayload {
  employe_ids: number[];
  date_absence: string;
  type_absence: AbsenceType;
  heure_entree?: string | null;
  motif?: string | null;
}

export interface AbsenceCreateResult {
  enregistres: number;
  ignores: number;
  montant_retenue_unitaire: number;
  absences: Absence[];
}

export interface AbsenceStatsSummary {
  total_absences: number;
  total_completes: number;
  total_partielles: number;
  total_retenue: number;
  employes_concernes: number;
  jours_concernes: number;
  effectif: number;
  penalite_jour: number;
}

export interface AbsenceStatsEmployee {
  employe_id: number;
  nom_complet: string | null;
  cin: string | null;
  role: string | null;
  total_absences: number;
  total_completes: number;
  total_partielles: number;
  total_retenue: number;
  derniere_absence: string | null;
}

export interface AbsenceStatsMonth {
  month: string;
  total_absences: number;
  total_completes: number;
  total_partielles: number;
  total_retenue: number;
}

export interface AbsenceStatsResponse {
  summary: AbsenceStatsSummary;
  byEmployee: AbsenceStatsEmployee[];
  byMonth: AbsenceStatsMonth[];
  byWeekday: Array<{ weekday: string; total_absences: number }>;
  topDays: Array<{ date_absence: string; total_absences: number; total_retenue: number }>;
  recent: Absence[];
}

export const absencesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMyAbsencePermissions: builder.query<AbsencePermissions, void>({
      query: () => '/absences/permissions/me',
      providesTags: ['AbsencePermissions'],
    }),
    getAbsencePermissions: builder.query<AbsencePermissionEmployee[], void>({
      query: () => '/absences/permissions',
      providesTags: ['AbsencePermissions'],
    }),
    updateAbsencePermissions: builder.mutation<AbsencePermissionEmployee, { id: number; permissions: AbsencePermissions }>({
      query: ({ id, permissions }) => ({
        url: `/absences/permissions/${id}`,
        method: 'PUT',
        body: permissions,
      }),
      invalidatesTags: ['AbsencePermissions'],
    }),
    getAbsenceConfig: builder.query<AbsenceConfig, void>({
      query: () => '/absences/config',
    }),
    getAbsenceEmployees: builder.query<AbsenceEmployeeOption[], void>({
      query: () => '/absences/employees',
      providesTags: ['Employee'],
    }),
    getAbsences: builder.query<Absence[], { month?: string; employe_id?: number } | void>({
      query: (params) => {
        const search = new URLSearchParams();
        if (params && 'month' in params && params.month) search.set('month', params.month);
        if (params && 'employe_id' in params && params.employe_id) search.set('employe_id', String(params.employe_id));
        const qs = search.toString();
        return `/absences${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Absence'],
    }),
    createAbsences: builder.mutation<AbsenceCreateResult, AbsenceCreatePayload>({
      query: (body) => ({ url: '/absences', method: 'POST', body }),
      invalidatesTags: ['Absence', 'Dashboard'],
    }),
    updateAbsence: builder.mutation<Absence, { id: number } & Partial<Omit<AbsenceCreatePayload, 'employe_ids'>>>({
      query: ({ id, ...body }) => ({ url: `/absences/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Absence', 'Dashboard'],
    }),
    deleteAbsence: builder.mutation<void, number>({
      query: (id) => ({ url: `/absences/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Absence', 'Dashboard'],
    }),
    getAbsenceStats: builder.query<AbsenceStatsResponse, { from?: string; to?: string; employe_id?: number } | void>({
      query: (params) => {
        const search = new URLSearchParams();
        if (params && 'from' in params && params.from) search.set('from', params.from);
        if (params && 'to' in params && params.to) search.set('to', params.to);
        if (params && 'employe_id' in params && params.employe_id) search.set('employe_id', String(params.employe_id));
        const qs = search.toString();
        return `/absences/stats${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Absence'],
    }),
  }),
});

export const {
  useGetMyAbsencePermissionsQuery,
  useGetAbsencePermissionsQuery,
  useUpdateAbsencePermissionsMutation,
  useGetAbsenceConfigQuery,
  useGetAbsenceEmployeesQuery,
  useGetAbsencesQuery,
  useCreateAbsencesMutation,
  useUpdateAbsenceMutation,
  useDeleteAbsenceMutation,
  useGetAbsenceStatsQuery,
} = absencesApi;
