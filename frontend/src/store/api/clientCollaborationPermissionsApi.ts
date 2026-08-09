import { api } from './apiSlice';

export interface ClientCollaborationPermissions {
  commentaires_clients: boolean;
  rappels_clients: boolean;
}

export interface ClientCollaborationEmployee extends ClientCollaborationPermissions {
  id: number;
  nom_complet: string | null;
  cin: string;
  role: string;
  verrouille: boolean;
}

export const clientCollaborationPermissionsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMyClientCollaborationPermissions: builder.query<ClientCollaborationPermissions, void>({
      query: () => '/employees/me/client-collaboration-permissions',
      providesTags: [{ type: 'ClientCollaborationPermissions', id: 'ME' }],
    }),
    getClientCollaborationPermissionEmployees: builder.query<ClientCollaborationEmployee[], void>({
      query: () => '/employees/client-collaboration-permissions',
      providesTags: [{ type: 'ClientCollaborationPermissions', id: 'LIST' }],
    }),
    updateClientCollaborationPermissions: builder.mutation<
      ClientCollaborationEmployee,
      { id: number } & ClientCollaborationPermissions
    >({
      query: ({ id, ...body }) => ({
        url: `/employees/client-collaboration-permissions/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: [
        { type: 'ClientCollaborationPermissions', id: 'LIST' },
        { type: 'ClientCollaborationPermissions', id: 'ME' },
        'Contact',
        'ContactComment',
        'Dashboard',
      ],
    }),
  }),
});

export const {
  useGetMyClientCollaborationPermissionsQuery,
  useGetClientCollaborationPermissionEmployeesQuery,
  useUpdateClientCollaborationPermissionsMutation,
} = clientCollaborationPermissionsApi;

