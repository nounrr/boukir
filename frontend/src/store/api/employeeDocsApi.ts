import { api } from './apiSlice';

export interface DocumentType { id: number; nom: string; description?: string | null }
export interface EmployeeDoc { id: number; employe_id: number; type_doc_id: number | null; type_nom?: string | null; path: string; created_at?: string }

export const employeeDocsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDocumentTypes: builder.query<DocumentType[], void>({
      query: () => ({ url: '/documents/types', method: 'GET' }),
      providesTags: ['DocumentType'],
    }),
    createDocumentType: builder.mutation<DocumentType, { nom: string; description?: string | null }>({
      query: (body) => ({ url: '/documents/types', method: 'POST', body }),
      invalidatesTags: ['DocumentType'],
    }),
    updateDocumentType: builder.mutation<DocumentType, { id: number; nom?: string; description?: string | null }>({
      query: ({ id, ...body }) => ({ url: `/documents/types/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'DocumentType', id }, 'DocumentType'],
    }),
    deleteDocumentType: builder.mutation<void, number>({
      query: (id) => ({ url: `/documents/types/${id}`, method: 'DELETE' }),
      invalidatesTags: ['DocumentType'],
    }),

    getEmployeeDocs: builder.query<EmployeeDoc[], number>({
      query: (employe_id) => ({ url: `/documents/employees/${employe_id}`, method: 'GET' }),
      providesTags: (_r, _e, employe_id) => [{ type: 'EmployeeDoc', id: employe_id }],
    }),
    createEmployeeDoc: builder.mutation<EmployeeDoc, { employe_id: number; path: string; type_doc_id?: number | null }>({
      query: ({ employe_id, ...body }) => ({ url: `/documents/employees/${employe_id}`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { employe_id }) => [{ type: 'EmployeeDoc', id: employe_id }],
    }),
    deleteEmployeeDoc: builder.mutation<void, { employe_id: number; id: number }>({
      query: ({ employe_id, id }) => ({ url: `/documents/employees/${employe_id}/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { employe_id }) => [{ type: 'EmployeeDoc', id: employe_id }],
    }),
  }),
});

export const {
  useGetDocumentTypesQuery,
  useCreateDocumentTypeMutation,
  useUpdateDocumentTypeMutation,
  useDeleteDocumentTypeMutation,
  useGetEmployeeDocsQuery,
  useCreateEmployeeDocMutation,
  useDeleteEmployeeDocMutation,
} = employeeDocsApi;
