import { api } from './apiSlice';
import type { Contact, CreateContactData } from '../../types';
import { mockContacts, getNextId } from '../../data/mockData';

// Store local simulé pour les contacts
let contacts = [...mockContacts];

const contactsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getContacts: builder.query<Contact[], { type?: 'Client' | 'Fournisseur' }>({
      queryFn: async ({ type }) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        let filteredContacts = contacts;
        if (type) {
          filteredContacts = contacts.filter((contact) => contact.type === type);
        }
        
        return { data: filteredContacts };
      },
      providesTags: ['Contact'],
    }),

    getContact: builder.query<Contact, number>({
      queryFn: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const contact = contacts.find((cont) => cont.id === id);
        
        if (!contact) {
          return {
            error: {
              status: 404,
              data: { message: 'Contact introuvable' },
            },
          };
        }

        return { data: contact };
      },
      providesTags: (_result, _error, id) => [{ type: 'Contact', id }],
    }),

    createContact: builder.mutation<Contact, CreateContactData & { created_by: number }>({
      queryFn: async (contactData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const newContact: Contact = {
          id: getNextId(contacts),
          nom: contactData.nom,
          type: contactData.type,
          telephone: contactData.telephone,
          email: contactData.email,
          adresse: contactData.adresse,
          cin_ice: contactData.cin_ice,
          created_by: contactData.created_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        contacts.push(newContact);
        return { data: newContact };
      },
      invalidatesTags: ['Contact'],
    }),

    updateContact: builder.mutation<Contact, Partial<Contact> & { id: number; updated_by: number }>({
      queryFn: async (contactData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        const index = contacts.findIndex((cont) => cont.id === contactData.id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Contact introuvable' },
            },
          };
        }

        const updatedContact: Contact = {
          ...contacts[index],
          ...contactData,
          updated_by: contactData.updated_by,
          updated_at: new Date().toISOString(),
        };

        contacts[index] = updatedContact;
        return { data: updatedContact };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Contact', id }, 'Contact'],
    }),

    deleteContact: builder.mutation<void, { id: number; updated_by: number }>({
      queryFn: async ({ id }) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const index = contacts.findIndex((cont) => cont.id === id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Contact introuvable' },
            },
          };
        }

        contacts.splice(index, 1);
        return { data: undefined };
      },
      invalidatesTags: ['Contact'],
    }),

    getClients: builder.query<Contact[], void>({
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const clients = contacts.filter((contact) => contact.type === 'Client');
        return { data: clients };
      },
      providesTags: ['Contact'],
    }),

    getFournisseurs: builder.query<Contact[], void>({
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const fournisseurs = contacts.filter((contact) => contact.type === 'Fournisseur');
        return { data: fournisseurs };
      },
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
