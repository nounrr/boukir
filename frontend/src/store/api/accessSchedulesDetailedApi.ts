import { api } from './apiSlice';

// Types pour les horaires détaillés
export interface DaySchedule {
  user_id: number;
  day_of_week: number; // 1=Lundi, 2=Mardi, ..., 7=Dimanche
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface EmployeeScheduleConfig {
  user_id: number;
  user_name: string;
  user_role: string;
  schedules: DaySchedule[];
}

export interface DetailedScheduleRequest {
  user_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

export interface BatchScheduleRequest {
  user_id: number;
  schedules: DaySchedule[];
}

const accessSchedulesDetailedApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer tous les horaires détaillés
    getDetailedSchedules: builder.query<EmployeeScheduleConfig[], void>({
      query: () => '/access-schedules/detailed',
      providesTags: ['AccessSchedule'],
    }),

    // Récupérer les horaires d'un utilisateur spécifique
    getUserDetailedSchedules: builder.query<EmployeeScheduleConfig, number>({
      query: (userId) => `/access-schedules/detailed/${userId}`,
      providesTags: (_, __, userId) => [
        { type: 'AccessSchedule', id: userId }
      ],
    }),

    // Ajouter/modifier un horaire pour un jour
    saveDetailedSchedule: builder.mutation<any, DetailedScheduleRequest>({
      query: (scheduleData) => ({
        url: '/access-schedules/detailed',
        method: 'POST',
        body: scheduleData,
      }),
      invalidatesTags: ['AccessSchedule'],
    }),

    // Supprimer un horaire pour un jour
    deleteDetailedSchedule: builder.mutation<any, { userId: number; dayOfWeek: number }>({
      query: ({ userId, dayOfWeek }) => ({
        url: `/access-schedules/detailed/${userId}/${dayOfWeek}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AccessSchedule'],
    }),

    // Mise à jour en lot pour un utilisateur
    batchUpdateDetailedSchedules: builder.mutation<any, BatchScheduleRequest>({
      query: (batchData) => ({
        url: '/access-schedules/detailed/batch',
        method: 'POST',
        body: batchData,
      }),
      invalidatesTags: ['AccessSchedule'],
    }),
  }),
});

export const {
  useGetDetailedSchedulesQuery,
  useGetUserDetailedSchedulesQuery,
  useSaveDetailedScheduleMutation,
  useDeleteDetailedScheduleMutation,
  useBatchUpdateDetailedSchedulesMutation,
} = accessSchedulesDetailedApi;