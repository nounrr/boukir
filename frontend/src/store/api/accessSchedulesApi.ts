import { api } from './apiSlice';

interface AccessSchedule {
  id?: number;
  user_id: number;
  user_name: string;
  user_role: 'employee' | 'manager' | 'admin';
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
  detailed_schedules?: {[key: number]: {start_time: string, end_time: string, active: boolean}};
  created_at?: string;
  updated_at?: string;
}

interface AccessScheduleConfig {
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
  detailed_schedules?: {[key: number]: {start_time: string, end_time: string, active: boolean}};
}

interface BatchScheduleRequest {
  users: Array<{
    user_id: number;
    user_name: string;
    user_role: string;
  }>;
  schedule_config: AccessScheduleConfig;
}

interface AccessCheckResponse {
  hasAccess: boolean;
  reason: string;
}

export const accessSchedulesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer tous les horaires
    getAccessSchedules: builder.query<AccessSchedule[], void>({
      query: () => '/access-schedules',
      providesTags: ['AccessSchedule'],
    }),

    // Récupérer l'horaire d'un utilisateur
    getUserSchedule: builder.query<AccessSchedule, number>({
      query: (userId) => `/access-schedules/user/${userId}`,
      providesTags: ['AccessSchedule'],
    }),

    // Créer ou mettre à jour un horaire
    saveAccessSchedule: builder.mutation<AccessSchedule, Omit<AccessSchedule, 'id' | 'created_at' | 'updated_at'>>({
      query: (schedule) => ({
        url: '/access-schedules',
        method: 'POST',
        body: schedule,
      }),
      invalidatesTags: ['AccessSchedule'],
    }),

    // Mettre à jour un horaire spécifique
    updateAccessSchedule: builder.mutation<AccessSchedule, { id: number } & Partial<AccessSchedule>>({
      query: ({ id, ...patch }) => ({
        url: `/access-schedules/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: ['AccessSchedule'],
    }),

    // Supprimer un horaire
    deleteAccessSchedule: builder.mutation<{ message: string }, number>({
      query: (id) => ({
        url: `/access-schedules/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AccessSchedule'],
    }),

    // Traitement en lot
    batchUpdateSchedules: builder.mutation<any, BatchScheduleRequest>({
      query: (batchData) => ({
        url: '/access-schedules/batch',
        method: 'POST',
        body: batchData,
      }),
      invalidatesTags: ['AccessSchedule'],
    }),

    // Vérifier l'accès d'un utilisateur
    checkUserAccess: builder.query<AccessCheckResponse, number>({
      query: (userId) => `/access-schedules/check/${userId}`,
    }),
  }),
});

export const {
  useGetAccessSchedulesQuery,
  useGetUserScheduleQuery,
  useSaveAccessScheduleMutation,
  useUpdateAccessScheduleMutation,
  useDeleteAccessScheduleMutation,
  useBatchUpdateSchedulesMutation,
  useCheckUserAccessQuery,
} = accessSchedulesApi;