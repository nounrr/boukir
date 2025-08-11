To switch frontend from mock employees API to real server:

1) Replace imports in components/pages from:
   import { useGetEmployeesQuery, useCreateEmployeeMutation, useUpdateEmployeeMutation, useDeleteEmployeeMutation } from './employeesApi'

   to:
   import { 
     useGetEmployeesQuery as useGetEmployeesQueryServer,
     useGetEmployeeQuery as useGetEmployeeQueryServer,
     useCreateEmployeeMutation as useCreateEmployeeMutationServer,
     useUpdateEmployeeMutation as useUpdateEmployeeMutationServer,
     useDeleteEmployeeMutation as useDeleteEmployeeMutationServer,
   } from './employeesApi.server'

2) Update usage accordingly or alias the imports to existing names.

Keep both during migration to validate backend without breaking UI.
