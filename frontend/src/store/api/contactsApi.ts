import { api } from './apiSlice';
import type { Contact, CreateContactData } from '../../types';

const contactsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getContacts: builder.query<Contact[], { type?: 'Client' | 'Fournisseur' }>({
      query: ({ type }) => ({ 
        url: '/contacts', 
        params: type ? { type } : undefined 
      }),
      providesTags: ['Contact'],
    }),

    getContact: builder.query<Contact, number>({
      query: (id) => ({ url: `/contacts/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Contact', id }],
    }),

    createContact: builder.mutation<Contact, CreateContactData & { created_by: number }>({
      query: (body) => ({
        url: '/contacts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Contact'],
    }),

    updateContact: builder.mutation<Contact, Partial<Contact> & { id: number; updated_by: number }>({
      query: ({ id, ...patch }) => ({
        url: `/contacts/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Contact', id }, 'Contact'],
    }),

    deleteContact: builder.mutation<void, { id: number; updated_by: number }>({
      query: ({ id }) => ({
        url: `/contacts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Contact'],
    }),

    getClients: builder.query<Contact[], void>({
      query: () => ({ url: '/contacts', params: { type: 'Client' } }),
      providesTags: ['Contact'],
    }),

    getFournisseurs: builder.query<Contact[], void>({
      query: () => ({ url: '/contacts', params: { type: 'Fournisseur' } }),
      providesTags: ['Contact'],
    }),
  }),
});

export const {
  useGetContactsQuery,
  useGetContactQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation,
  useGetClientsQuery,
  useGetFournisseursQuery,
} = contactsApi;
