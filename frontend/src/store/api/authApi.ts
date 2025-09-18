import { api } from './apiSlice';
import type { LoginCredentials, User } from '../../types';

// Backend-powered auth
const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<{ user: User; token: string }, LoginCredentials>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    me: builder.query<User, void>({
      query: () => ({ url: '/auth/me', method: 'GET' }),
    }),
    checkAccess: builder.query<{ hasAccess: boolean; reason: string }, void>({
      query: () => ({ url: '/auth/check-access', method: 'GET' }),
    }),
  }),
});

export const { 
  useLoginMutation, 
  useMeQuery: useValidateTokenQuery,
  useCheckAccessQuery 
} = authApi;
