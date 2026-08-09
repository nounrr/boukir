import { api } from './apiSlice';

export type ContactCommentColor = 'default' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

export interface ContactComment {
  id: number;
  contact_id: number;
  contenu: string;
  couleur: ContactCommentColor;
  epingle: boolean;
  created_by: number | null;
  updated_by: number | null;
  created_by_nom: string | null;
  updated_by_nom: string | null;
  /** false uniquement si le compte auteur n'existe plus en base */
  created_by_exists: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactCommentSummary {
  total: number;
  epingles: number;
  dernier_at: string | null;
  dernier_contenu: string | null;
}

export type ContactCommentCounts = Record<number, ContactCommentSummary>;

const contactCommentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getContactComments: builder.query<ContactComment[], number>({
      query: (contactId) => ({ url: `/contact-comments/contact/${contactId}` }),
      providesTags: (_result, _error, contactId) => [{ type: 'ContactComment' as const, id: contactId }],
    }),

    getContactCommentCounts: builder.query<ContactCommentCounts, number[]>({
      query: (contactIds) => ({
        url: '/contact-comments/counts',
        params: { contactIds: contactIds.join(',') },
      }),
      providesTags: [{ type: 'ContactComment' as const, id: 'COUNTS' }],
    }),

    createContactComment: builder.mutation<
      ContactComment,
      { contact_id: number; contenu: string; couleur?: ContactCommentColor; epingle?: boolean }
    >({
      query: (body) => ({ url: '/contact-comments', method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ContactComment' as const, id: arg.contact_id },
        { type: 'ContactComment' as const, id: 'COUNTS' },
      ],
    }),

    updateContactComment: builder.mutation<
      ContactComment,
      { id: number; contact_id: number; contenu?: string; couleur?: ContactCommentColor; epingle?: boolean }
    >({
      query: ({ id, contact_id: _contactId, ...body }) => ({
        url: `/contact-comments/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ContactComment' as const, id: arg.contact_id },
        { type: 'ContactComment' as const, id: 'COUNTS' },
      ],
    }),

    deleteContactComment: builder.mutation<{ success: boolean; id: number }, { id: number; contact_id: number }>({
      query: ({ id }) => ({ url: `/contact-comments/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ContactComment' as const, id: arg.contact_id },
        { type: 'ContactComment' as const, id: 'COUNTS' },
      ],
    }),
  }),
});

export const {
  useGetContactCommentsQuery,
  useGetContactCommentCountsQuery,
  useCreateContactCommentMutation,
  useUpdateContactCommentMutation,
  useDeleteContactCommentMutation,
} = contactCommentsApi;

export default contactCommentsApi;
