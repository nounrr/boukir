import { api } from './apiSlice';
import type { Employee, CreateEmployeeData } from '../../types';
import type { EmployeeSalaireEntry, EmployeeSalaireSummaryRow } from '../../types';

export const employeesServerApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getEmployees: builder.query<Employee[], void>({
      query: () => ({ url: '/employees', method: 'GET' }),
      providesTags: ['Employee'],
    }),
    getEmployee: builder.query<Employee, number>({
      query: (id) => ({ url: `/employees/${id}`, method: 'GET' }),
      providesTags: (_r, _e, id) => [{ type: 'Employee', id }],
    }),
    createEmployee: builder.mutation<Employee, CreateEmployeeData & { created_by: number }>({
      query: (body) => ({ url: '/employees', method: 'POST', body }),
      invalidatesTags: ['Employee'],
    }),
    updateEmployee: builder.mutation<Employee, Partial<Employee> & { id: number; updated_by: number }>({
      query: ({ id, ...body }) => ({ url: `/employees/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Employee', id }, 'Employee'],
    }),
    deleteEmployee: builder.mutation<void, { id: number; updated_by: number }>({
      query: ({ id }) => ({ url: `/employees/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Employee'],
    }),
    // Salary: list entries for an employee (optional month param YYYY-MM)
    getEmployeeSalaireEntries: builder.query<EmployeeSalaireEntry[], { id: number; month?: string }>({
      query: ({ id, month }) => ({ url: `/employees/${id}/salaires${month ? `?month=${month}` : ''}`, method: 'GET' }),
      providesTags: (_r, _e, { id }) => [{ type: 'Employee', id }],
    }),
    // Salary: add entry for an employee
    addEmployeeSalaireEntry: builder.mutation<EmployeeSalaireEntry, { id: number; montant: number; note?: string; created_by: number }>({
      query: ({ id, ...body }) => ({ url: `/employees/${id}/salaires`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Employee', id }],
    }),
    // Salary: update entry for an employee
    updateEmployeeSalaireEntry: builder.mutation<EmployeeSalaireEntry, { id: number; salaireId: number; montant?: number; note?: string; updated_by: number }>({
      query: ({ id, salaireId, ...body }) => ({ url: `/employees/${id}/salaires/${salaireId}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Employee', id }],
    }),
    // Salary: delete entry for an employee
    deleteEmployeeSalaireEntry: builder.mutation<void, { id: number; salaireId: number }>({
      query: ({ id, salaireId }) => ({ url: `/employees/${id}/salaires/${salaireId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Employee', id }],
    }),
    // Salary: monthly summary for all employees
    getSalaireMonthlySummary: builder.query<EmployeeSalaireSummaryRow[], { month: string }>({
      query: ({ month }) => ({ url: `/salaires/summary?month=${month}`, method: 'GET' }),
      providesTags: ['Employee'],
    }),
  }),
});

export const {
  useGetEmployeesQuery: useGetEmployeesQueryServer,
  useGetEmployeeQuery: useGetEmployeeQueryServer,
  useCreateEmployeeMutation: useCreateEmployeeMutationServer,
  useUpdateEmployeeMutation: useUpdateEmployeeMutationServer,
  useDeleteEmployeeMutation: useDeleteEmployeeMutationServer,
  useGetEmployeeSalaireEntriesQuery: useGetEmployeeSalaireEntriesQueryServer,
  useAddEmployeeSalaireEntryMutation: useAddEmployeeSalaireEntryMutationServer,
  useUpdateEmployeeSalaireEntryMutation: useUpdateEmployeeSalaireEntryMutationServer,
  useDeleteEmployeeSalaireEntryMutation: useDeleteEmployeeSalaireEntryMutationServer,
  useGetSalaireMonthlySummaryQuery: useGetSalaireMonthlySummaryQueryServer,
} = employeesServerApi;
