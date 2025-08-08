import { api } from './apiSlice';
import type { LoginCredentials, User } from '../../types';
import { mockEmployees, mockPasswords } from '../../data/mockData';

// Simulation d'une API d'authentification
const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<
      { user: User; token: string },
      LoginCredentials
    >({
      queryFn: async ({ cin, password }) => {
        // Simulation d'un délai réseau
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Recherche de l'employé par CIN
        const employee = mockEmployees.find((emp) => emp.cin === cin);
        
        if (!employee) {
          return {
            error: {
              status: 401,
              data: { message: 'CIN introuvable' },
            },
          };
        }

        // Vérification du mot de passe
        const correctPassword = mockPasswords[cin];
        if (password !== correctPassword) {
          return {
            error: {
              status: 401,
              data: { message: 'Mot de passe incorrect' },
            },
          };
        }

        // Génération d'un token JWT simulé
        const token = `fake-jwt-token-${employee.id}-${Date.now()}`;

        // Conversion de Employee vers User
        const user: User = {
          id: employee.id,
          nom_complet: employee.nom_complet,
          cin: employee.cin,
          date_embauche: employee.date_embauche,
          role: employee.role,
        };

        return {
          data: {
            user,
            token,
          },
        };
      },
    }),

    validateToken: builder.query<User, string>({
      queryFn: async (token) => {
        // Simulation d'un délai réseau
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Extraction de l'ID utilisateur du token simulé
        const tokenParts = token.split('-');
        if (tokenParts.length < 4 || tokenParts[0] !== 'fake') {
          return {
            error: {
              status: 401,
              data: { message: 'Token invalide' },
            },
          };
        }

        const userId = parseInt(tokenParts[3]);
        const employee = mockEmployees.find((emp) => emp.id === userId);

        if (!employee) {
          return {
            error: {
              status: 401,
              data: { message: 'Utilisateur introuvable' },
            },
          };
        }

        const user: User = {
          id: employee.id,
          nom_complet: employee.nom_complet,
          cin: employee.cin,
          date_embauche: employee.date_embauche,
          role: employee.role,
        };

        return { data: user };
      },
    }),
  }),
});

export const { useLoginMutation, useValidateTokenQuery } = authApi;
