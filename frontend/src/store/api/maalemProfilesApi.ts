import { apiSlice } from './apiSlice';

export type MaalemProfileStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'suspended';
export type MaalemProfileOrigin = 'NEW_REGISTRATION' | 'ARTISAN_CONVERSION' | 'TEAM_CREATED' | 'SELF_SERVICE';

export interface MaalemProfessionalData {
  skills: string[];
  contact_phone: string | null;
  city: string | null;
  intervention_areas: string[];
  experience_years: number | null;
  professional_summary: string | null;
  experiences: string | null;
  availability: 'immediate' | 'weekdays' | 'weekends' | 'evenings' | 'on_request' | null;
  other_information: string | null;
}

export interface AdminMaalemProfile {
  id: number;
  contact_id: number;
  category_id: number | null;
  status: MaalemProfileStatus;
  status_label: string;
  origin: MaalemProfileOrigin;
  created_by_employee_id: number | null;
  professional_data: MaalemProfessionalData | null;
  status_reason?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
  user?: {
    id: number;
    nom_complet: string;
    email: string | null;
    telephone: string | null;
    type_compte: string | null;
    avatar_url?: string | null;
  };
  category?: { id: number; nom: string; nom_ar: string; is_active: boolean } | null;
  created_at: string;
  updated_at: string;
}

export type MaalemStatusCounts = Record<MaalemProfileStatus, number>;

export interface AdminMaalemFilters {
  q?: string;
  status?: MaalemProfileStatus;
  origin?: MaalemProfileOrigin;
  category_id?: number;
  city?: string;
}

export interface AdminMaalemListResponse {
  profiles: AdminMaalemProfile[];
  counts: MaalemStatusCounts;
}

export interface MaalemProfileDocument {
  id: number;
  kind: 'cv' | 'realization' | string;
  original_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

export interface MaalemDecisionHistory {
  id: number;
  event_type: 'STATUS_CHANGED' | 'CATEGORY_CHANGED' | 'INTERNAL_NOTE' | string;
  old_status: MaalemProfileStatus | null;
  new_status: MaalemProfileStatus | null;
  old_category_id?: number | null;
  new_category_id?: number | null;
  old_category_name?: string | null;
  new_category_name?: string | null;
  note: string | null;
  created_at: string;
  actor?: { id: number; nom_complet: string } | null;
  actor_name?: string | null;
}

export type MaalemInternalNote = MaalemDecisionHistory;

export interface AdminMaalemDetailsResponse {
  profile: AdminMaalemProfile;
  documents: MaalemProfileDocument[];
  history: MaalemDecisionHistory[];
  notes: MaalemInternalNote[];
}

export type MaalemLookupState =
  | 'not_found'
  | 'existing_artisan'
  | 'existing_maalem_profile'
  | 'inactive_account'
  | 'backoffice_contact'
  | 'non_artisan_account';

export interface MaalemLookupResponse {
  state: MaalemLookupState;
  contact: null | {
    id: number;
    prenom: string | null;
    nom: string | null;
    nom_complet: string | null;
    email: string | null;
    telephone: string | null;
    type_compte: string | null;
    maalem_profile_id: number | null;
    maalem_profile_status: MaalemProfileStatus | null;
  };
}

export interface TeamCreateMaalemInput {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  reference?: string;
  category_id: number;
  locale: 'fr';
  professional_data: MaalemProfessionalData;
}

export interface TeamCreateMaalemResponse {
  profile: AdminMaalemProfile;
  created_user: boolean;
  created_profile: boolean;
  invitation: null | {
    activation_url: string;
    expires_in_hours: number;
    delivery_status: 'manual' | 'sent_whatsapp' | 'failed_whatsapp';
  };
}

const emptyCounts = (): MaalemStatusCounts => ({
  draft: 0,
  submitted: 0,
  under_review: 0,
  approved: 0,
  rejected: 0,
  suspended: 0,
});

export const maalemProfilesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminMaalemProfiles: builder.query<AdminMaalemListResponse, AdminMaalemFilters | void>({
      query: (filters) => ({ url: '/admin/maalem-profiles', params: filters || undefined }),
      transformResponse: (response: Partial<AdminMaalemListResponse>) => ({
        profiles: Array.isArray(response.profiles) ? response.profiles : [],
        counts: { ...emptyCounts(), ...(response.counts || {}) },
      }),
      providesTags: (result) => result
        ? [
            ...result.profiles.map(({ id }) => ({ type: 'MaalemProfile' as const, id })),
            { type: 'MaalemProfile' as const, id: 'LIST' },
          ]
        : [{ type: 'MaalemProfile', id: 'LIST' }],
    }),
    getAdminMaalemProfileDetails: builder.query<AdminMaalemDetailsResponse, number>({
      query: (id) => ({ url: `/admin/maalem-profiles/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'MaalemProfile', id }],
    }),
    lookupMaalemIdentity: builder.mutation<MaalemLookupResponse, { email?: string; telephone?: string; reference?: string }>({
      query: (body) => ({ url: '/admin/maalem-profiles/lookup', method: 'POST', body }),
    }),
    teamCreateMaalem: builder.mutation<TeamCreateMaalemResponse, TeamCreateMaalemInput>({
      query: (body) => ({ url: '/admin/maalem-profiles/team-create', method: 'POST', body }),
      invalidatesTags: [{ type: 'MaalemProfile', id: 'LIST' }],
    }),
    submitAdminMaalemProfile: builder.mutation<AdminMaalemProfile, { id: number }>({
      query: ({ id }) => ({ url: `/admin/maalem-profiles/${id}/submit`, method: 'POST' }),
      transformResponse: (response: { profile: AdminMaalemProfile }) => response.profile,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'MaalemProfile', id },
        { type: 'MaalemProfile', id: 'LIST' },
      ],
    }),
    updateAdminMaalemStatus: builder.mutation<AdminMaalemProfile, { id: number; status: MaalemProfileStatus; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/maalem-profiles/${id}/status`, method: 'PATCH', body }),
      transformResponse: (response: { profile: AdminMaalemProfile }) => response.profile,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'MaalemProfile', id },
        { type: 'MaalemProfile', id: 'LIST' },
      ],
    }),
    updateAdminMaalemProfessionalData: builder.mutation<AdminMaalemProfile, { id: number; professional_data: MaalemProfessionalData }>({
      query: ({ id, ...body }) => ({ url: `/admin/maalem-profiles/${id}/professional-data`, method: 'PATCH', body }),
      transformResponse: (response: { profile: AdminMaalemProfile }) => response.profile,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'MaalemProfile', id },
        { type: 'MaalemProfile', id: 'LIST' },
      ],
    }),
    updateAdminMaalemCategory: builder.mutation<AdminMaalemProfile, { id: number; category_id: number; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/maalem-profiles/${id}/category`, method: 'PATCH', body }),
      transformResponse: (response: { profile: AdminMaalemProfile }) => response.profile,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'MaalemProfile', id },
        { type: 'MaalemProfile', id: 'LIST' },
      ],
    }),
    addAdminMaalemNote: builder.mutation<MaalemInternalNote, { id: number; note: string }>({
      query: ({ id, note }) => ({ url: `/admin/maalem-profiles/${id}/notes`, method: 'POST', body: { note } }),
      transformResponse: (response: { note: MaalemInternalNote }) => response.note,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'MaalemProfile', id }],
    }),
    downloadAdminMaalemDocument: builder.mutation<Blob, { profileId: number; documentId: number }>({
      query: ({ profileId, documentId }) => ({
        url: `/admin/maalem-profiles/${profileId}/documents/${documentId}/download`,
        method: 'GET',
        responseHandler: (response) => response.blob(),
        cache: 'no-store',
      }),
    }),
    uploadAdminMaalemAvatar: builder.mutation<{ avatar_url: string }, { profileId: number; file: File }>({
      query: ({ profileId, file }) => {
        const body = new FormData();
        body.append('file', file);
        return { url: `/admin/maalem-profiles/${profileId}/avatar`, method: 'POST', body };
      },
      invalidatesTags: (_result, _error, { profileId }) => [
        { type: 'MaalemProfile', id: profileId },
        { type: 'MaalemProfile', id: 'LIST' },
      ],
    }),
    uploadAdminMaalemCv: builder.mutation<unknown, { profileId: number; file: File }>({
      query: ({ profileId, file }) => {
        const body = new FormData();
        body.append('file', file);
        return { url: `/admin/maalem-profiles/${profileId}/cv`, method: 'POST', body };
      },
      invalidatesTags: (_result, _error, { profileId }) => [
        { type: 'MaalemProfile', id: profileId },
        { type: 'MaalemProfile', id: 'LIST' },
      ],
    }),
    uploadAdminMaalemRealizations: builder.mutation<unknown, { profileId: number; files: File[] }>({
      query: ({ profileId, files }) => {
        const body = new FormData();
        files.forEach((file) => body.append('files', file));
        return { url: `/admin/maalem-profiles/${profileId}/realizations`, method: 'POST', body };
      },
      invalidatesTags: (_result, _error, { profileId }) => [
        { type: 'MaalemProfile', id: profileId },
        { type: 'MaalemProfile', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetAdminMaalemProfilesQuery,
  useGetAdminMaalemProfileDetailsQuery,
  useLookupMaalemIdentityMutation,
  useTeamCreateMaalemMutation,
  useSubmitAdminMaalemProfileMutation,
  useUpdateAdminMaalemProfessionalDataMutation,
  useUpdateAdminMaalemStatusMutation,
  useUpdateAdminMaalemCategoryMutation,
  useAddAdminMaalemNoteMutation,
  useDownloadAdminMaalemDocumentMutation,
  useUploadAdminMaalemAvatarMutation,
  useUploadAdminMaalemCvMutation,
  useUploadAdminMaalemRealizationsMutation,
} = maalemProfilesApi;
