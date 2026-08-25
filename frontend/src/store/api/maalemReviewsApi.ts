import { apiSlice } from './apiSlice';
import type { MaalemReviewPermissions } from './maalemReviewPermissionsApi';

export type MaalemReviewStatus = 'pending' | 'published' | 'hidden' | 'rejected';
export type MaalemReviewAction = 'publish' | 'hide' | 'reject' | 'restore';

export interface AdminMaalemReview {
  id: number;
  reference: string;
  service_request_id: number;
  request_number: string;
  customer_contact_id: number | null;
  customer_name: string | null;
  maalem_profile_id: number;
  maalem_name: string;
  rating: number;
  comment: string | null;
  has_comment: boolean;
  private_details_masked: boolean;
  status: MaalemReviewStatus;
  city: string | null;
  submitted_at: string;
  moderated_at: string | null;
  moderator_name: string | null;
  moderation_reason_code: string | null;
  moderation_reason: string | null;
  moderation_version: number;
  report_count: number;
  created_at: string;
  updated_at: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  moderation_internal_note?: string | null;
}

export interface MaalemReviewFilters {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  rating?: number;
  maalem_id?: number;
  client_id?: number;
  request_number?: string;
  city?: string;
  date_from?: string;
  date_to?: string;
  has_comment?: boolean;
  reported?: boolean;
}

export interface MaalemReviewHistoryEntry {
  id: number;
  event_type: string;
  old_rating: number | null;
  new_rating: number | null;
  old_comment: string | null;
  new_comment: string | null;
  old_status: MaalemReviewStatus | null;
  new_status: MaalemReviewStatus | null;
  reason: string | null;
  reason_code: string | null;
  internal_note: string | null;
  technical_metadata: unknown;
  actor_type: string;
  actor_employee_id: number | null;
  actor_name: string;
  created_at: string;
}

export const maalemReviewsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminMaalemReviews: builder.query<{ reviews: AdminMaalemReview[]; page: number; limit: number; total: number }, MaalemReviewFilters>({
      query: (params) => ({ url: '/admin/maalem-reviews', params }),
      providesTags: (result) => result
        ? [{ type: 'MaalemReview' as const, id: 'LIST' }, ...result.reviews.map((review) => ({ type: 'MaalemReview' as const, id: review.id }))]
        : [{ type: 'MaalemReview' as const, id: 'LIST' }],
    }),
    getAdminMaalemReviewFilters: builder.query<{
      statuses: MaalemReviewStatus[];
      ratings: number[];
      maalems: Array<{ id: number; name: string }>;
      clients: Array<{ id: number; name: string }>;
      cities: string[];
    }, void>({ query: () => '/admin/maalem-reviews/filters' }),
    getAdminMaalemReview: builder.query<{ review: AdminMaalemReview; permissions: MaalemReviewPermissions }, number>({
      query: (id) => `/admin/maalem-reviews/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'MaalemReview', id }],
    }),
    getAdminMaalemReviewHistory: builder.query<{ history: MaalemReviewHistoryEntry[] }, number>({
      query: (id) => `/admin/maalem-reviews/${id}/history`,
      providesTags: (_result, _error, id) => [{ type: 'MaalemReview', id }],
    }),
    moderateMaalemReview: builder.mutation<{
      review: { id: number; status: MaalemReviewStatus; moderation_version: number };
      cache_invalidated: boolean;
    }, {
      id: number;
      action: MaalemReviewAction;
      expected_status: MaalemReviewStatus;
      expected_version: number;
      reason_code?: string;
      explanation?: string;
      internal_note?: string;
    }>({
      query: ({ id, action, ...body }) => ({ url: `/admin/maalem-reviews/${id}/${action}`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'MaalemReview', id }, { type: 'MaalemReview', id: 'LIST' }, 'MaalemProfile'],
    }),
  }),
});

export const {
  useGetAdminMaalemReviewsQuery,
  useGetAdminMaalemReviewFiltersQuery,
  useGetAdminMaalemReviewQuery,
  useGetAdminMaalemReviewHistoryQuery,
  useModerateMaalemReviewMutation,
} = maalemReviewsApi;
