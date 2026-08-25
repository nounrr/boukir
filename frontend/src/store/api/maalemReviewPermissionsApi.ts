import { apiSlice } from './apiSlice';

export interface MaalemReviewPermissions {
  view: boolean;
  moderate: boolean;
  restore: boolean;
  view_private_details: boolean;
}

export interface MaalemReviewPermissionEmployee extends MaalemReviewPermissions {
  id: number;
  nom_complet: string | null;
  cin: string;
  role: string;
  verrouille: boolean;
}

export const maalemReviewPermissionsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMyMaalemReviewPermissions: builder.query<MaalemReviewPermissions, void>({
      query: () => '/employees/me/maalem-review-permissions',
      providesTags: ['MaalemReviewPermissions'],
    }),
    getMaalemReviewPermissions: builder.query<MaalemReviewPermissionEmployee[], void>({
      query: () => '/employees/maalem-review-permissions',
      providesTags: ['MaalemReviewPermissions'],
    }),
    updateMaalemReviewPermissions: builder.mutation<MaalemReviewPermissionEmployee, { id: number; permissions: MaalemReviewPermissions }>({
      query: ({ id, permissions }) => ({
        url: `/employees/maalem-review-permissions/${id}`,
        method: 'PUT',
        body: permissions,
      }),
      invalidatesTags: ['MaalemReviewPermissions'],
    }),
  }),
});

export const {
  useGetMyMaalemReviewPermissionsQuery,
  useGetMaalemReviewPermissionsQuery,
  useUpdateMaalemReviewPermissionsMutation,
} = maalemReviewPermissionsApi;
