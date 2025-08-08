import { api } from './apiSlice';
import type { Employee, CreateEmployeeData } from '../../types';
import { mockEmployees, getNextId } from '../../data/mockData';

// Store local simulé pour les employés
let employees = [...mockEmployees];

const employeesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getEmployees: builder.query<Employee[], void>({
      queryFn: async () => {
        // Simulation d'un délai réseau
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        return {
          data: employees.map(emp => ({
            ...emp,
            password: undefined, // On ne retourne jamais le mot de passe
          })),
        };
      },
      providesTags: ['Employee'],
    }),

    getEmployee: builder.query<Employee, number>({
      queryFn: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const employee = employees.find((emp) => emp.id === id);
        
        if (!employee) {
          return {
            error: {
              status: 404,
              data: { message: 'Employé introuvable' },
            },
          };
        }

        return {
          data: {
            ...employee,
            password: undefined,
          },
        };
      },
      providesTags: (_result, _error, id) => [{ type: 'Employee', id }],
    }),

    createEmployee: builder.mutation<Employee, CreateEmployeeData & { created_by: number }>({
      queryFn: async (employeeData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        // Vérification de l'unicité du CIN
        if (employees.some((emp) => emp.cin === employeeData.cin)) {
          return {
            error: {
              status: 400,
              data: { message: 'Ce CIN existe déjà' },
            },
          };
        }

        const newEmployee: Employee = {
          id: getNextId(employees),
          nom_complet: employeeData.nom_complet,
          cin: employeeData.cin,
          date_embauche: employeeData.date_embauche,
          role: employeeData.role,
          created_by: employeeData.created_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        employees.push(newEmployee);

        return {
          data: {
            ...newEmployee,
            password: undefined,
          },
        };
      },
      invalidatesTags: ['Employee'],
    }),

    updateEmployee: builder.mutation<Employee, Partial<Employee> & { id: number; updated_by: number }>({
      queryFn: async (employeeData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        const index = employees.findIndex((emp) => emp.id === employeeData.id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Employé introuvable' },
            },
          };
        }

        // Vérification de l'unicité du CIN si modifié
        if (employeeData.cin && 
            employees.some((emp) => emp.cin === employeeData.cin && emp.id !== employeeData.id)) {
          return {
            error: {
              status: 400,
              data: { message: 'Ce CIN existe déjà' },
            },
          };
        }

        const updatedEmployee: Employee = {
          ...employees[index],
          ...employeeData,
          updated_by: employeeData.updated_by,
          updated_at: new Date().toISOString(),
        };

        employees[index] = updatedEmployee;

        return {
          data: {
            ...updatedEmployee,
            password: undefined,
          },
        };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Employee', id }, 'Employee'],
    }),

    deleteEmployee: builder.mutation<void, { id: number; updated_by: number }>({
      queryFn: async ({ id }) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const index = employees.findIndex((emp) => emp.id === id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Employé introuvable' },
            },
          };
        }

        // Vérification : ne pas supprimer le dernier PDG
        const employee = employees[index];
        if (employee.role === 'PDG') {
          const pdgCount = employees.filter((emp) => emp.role === 'PDG').length;
          if (pdgCount === 1) {
            return {
              error: {
                status: 400,
                data: { message: 'Impossible de supprimer le dernier PDG' },
              },
            };
          }
        }

        employees.splice(index, 1);

        return { data: undefined };
      },
      invalidatesTags: ['Employee'],
    }),
  }),
});

export const {
  useGetEmployeesQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
} = employeesApi;
