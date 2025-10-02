import { api } from './apiSlice';
import type { Employee } from '../../types';

export interface DeletedEmployee extends Employee {
  deleted_at: string;
  deleted_by_name?: string;
}

export const employeeArchiveApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDeletedEmployees: builder.query<DeletedEmployee[], void>({
      query: () => ({ url: '/employees/deleted/list', method: 'GET' }),
      providesTags: ['Employee'],
    }),
    restoreEmployee: builder.mutation<Employee, { id: number; updated_by: number }>({
      query: ({ id, updated_by }) => ({
        url: `/employees/${id}/restore`,
        method: 'POST',
        body: { updated_by },
      }),
      invalidatesTags: ['Employee'],
    }),
  }),
});

export const {
  useGetDeletedEmployeesQuery,
  useRestoreEmployeeMutation,
} = employeeArchiveApi;