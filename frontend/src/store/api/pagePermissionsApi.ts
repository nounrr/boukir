import { api } from './apiSlice';

/**
 * Console d'autorisations du PDG : une seule page pour tous les droits.
 *
 * Les mutations invalident aussi les tags des anciens ecrans d'autorisation,
 * qui lisent les memes colonnes et doivent donc se rafraichir ensemble.
 */
export interface PagePermissionDefinition {
  key: string;
  label: string;
  description: string;
  requires: string | null;
}

export interface PagePermissionGroup {
  key: string;
  label: string;
  page: string;
  href: string;
  description: string;
  legacyPage: string | null;
  allowedRoles: string[] | null;
  permissions: PagePermissionDefinition[];
}

export type PagePermissionState = Record<string, Record<string, boolean>>;

export interface PagePermissionEmployee {
  id: number;
  nom_complet: string | null;
  cin: string | null;
  role: string | null;
  verrouille: boolean;
  permissions: PagePermissionState;
}

export interface PagePermissionMatrix {
  groups: PagePermissionGroup[];
  employees: PagePermissionEmployee[];
}

export const pagePermissionsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPagePermissionMatrix: builder.query<PagePermissionMatrix, void>({
      query: () => '/page-permissions',
      providesTags: ['PagePermissions'],
    }),
    updatePagePermissions: builder.mutation<
      PagePermissionEmployee,
      { id: number; permissions: Record<string, boolean> }
    >({
      query: ({ id, permissions }) => ({
        url: `/page-permissions/${id}`,
        method: 'PUT',
        body: { permissions },
      }),
      invalidatesTags: [
        'PagePermissions',
        'ClientCollaborationPermissions',
        'MaalemReviewPermissions',
        'AbsencePermissions',
        'FondCaissePermissions',
        'StatsDetailsPermissions',
        'SalePriceCorrectionAccess',
      ],
    }),
  }),
});

export const { useGetPagePermissionMatrixQuery, useUpdatePagePermissionsMutation } =
  pagePermissionsApi;
