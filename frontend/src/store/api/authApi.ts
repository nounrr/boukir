import { api } from './apiSlice';
import type { LoginCredentials, User } from '../../types';

type MeResponse = User & { password_change_required?: boolean };
type ChangePasswordBody = { old_password: string; new_password: string; confirm_password?: string };

// Backend-powered auth
const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<{ user: User; token: string; password_change_required?: boolean }, LoginCredentials>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    me: builder.query<MeResponse, void>({
      query: () => ({ url: '/auth/me', method: 'GET' }),
    }),
    changePassword: builder.mutation<{ ok: boolean; message?: string }, ChangePasswordBody>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),
    checkAccess: builder.query<{ hasAccess: boolean; reason: string }, void>({
      query: () => ({ url: '/auth/check-access', method: 'GET' }),
    }),
  }),
});

export const { 
  useLoginMutation, 
  useMeQuery: useValidateTokenQuery,
  useChangePasswordMutation,
  useCheckAccessQuery 
} = authApi;
