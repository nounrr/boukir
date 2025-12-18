import { api } from './apiSlice';
import type { Contact } from '../../types';

interface ApproveRejectResponse {
  message: string;
  contact_id: number;
}

export const notificationsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getArtisanRequests: builder.query<Contact[], { limit?: number } | void>({
      query: (args) => ({
        url: '/notifications/artisan-requests',
        params: args && args.limit ? { limit: args.limit } : undefined,
      }),
      providesTags: ['Notifications', 'Contact'],
    }),
    approveArtisanRequest: builder.mutation<ApproveRejectResponse, { id: number; note?: string }>({
      query: ({ id, note }) => ({
        url: `/notifications/artisan-requests/${id}/approve`,
        method: 'POST',
        body: { note },
      }),
      invalidatesTags: ['Notifications', 'Contact'],
    }),
    rejectArtisanRequest: builder.mutation<ApproveRejectResponse, { id: number; note?: string }>({
      query: ({ id, note }) => ({
        url: `/notifications/artisan-requests/${id}/reject`,
        method: 'POST',
        body: { note },
      }),
      invalidatesTags: ['Notifications', 'Contact'],
    }),
  }),
});

export const {
  useGetArtisanRequestsQuery,
  useApproveArtisanRequestMutation,
  useRejectArtisanRequestMutation,
} = notificationsApi;
