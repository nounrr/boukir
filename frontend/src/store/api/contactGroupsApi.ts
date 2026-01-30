import { api } from './apiSlice';
import type { ContactGroup } from '../../types';

export interface AssignContactsPayload {
  groupId: number;
  contactIds: number[];
}

export interface UnassignContactsPayload {
  contactIds: number[];
}

const contactGroupsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getContactGroups: builder.query<ContactGroup[], void>({
      query: () => ({ url: '/contact-groups' }),
      providesTags: ['ContactGroup'],
    }),

    createContactGroup: builder.mutation<ContactGroup, { name: string; contact_type?: 'Client' | 'Fournisseur' }>({
      query: (body) => ({
        url: '/contact-groups',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ContactGroup', 'Contact'],
    }),

    updateContactGroup: builder.mutation<ContactGroup, { id: number; name: string }>({
      query: ({ id, ...body }) => ({
        url: `/contact-groups/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['ContactGroup', 'Contact'],
    }),

    deleteContactGroup: builder.mutation<void, { id: number }>({
      query: ({ id }) => ({
        url: `/contact-groups/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ContactGroup', 'Contact'],
    }),

    assignContactsToGroup: builder.mutation<{ ok: boolean; affectedRows: number }, AssignContactsPayload>({
      query: ({ groupId, contactIds }) => ({
        url: `/contact-groups/${groupId}/contacts`,
        method: 'PUT',
        body: { contactIds },
      }),
      invalidatesTags: ['Contact'],
    }),

    unassignContactsFromGroup: builder.mutation<{ ok: boolean; affectedRows: number }, UnassignContactsPayload>({
      query: ({ contactIds }) => ({
        url: '/contact-groups/unassign/contacts',
        method: 'PUT',
        body: { contactIds },
      }),
      invalidatesTags: ['Contact'],
    }),
  }),
});

export const {
  useGetContactGroupsQuery,
  useCreateContactGroupMutation,
  useUpdateContactGroupMutation,
  useDeleteContactGroupMutation,
  useAssignContactsToGroupMutation,
  useUnassignContactsFromGroupMutation,
} = contactGroupsApi;
