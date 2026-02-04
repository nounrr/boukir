import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AuthState, User } from '../../types';

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  passwordChangeRequired: localStorage.getItem('password_change_required') === 'true',
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (state, action: PayloadAction<{ user: User; token: string; password_change_required?: boolean }>) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.passwordChangeRequired = Boolean(action.payload.password_change_required);
      state.error = null;
      localStorage.setItem('token', action.payload.token);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
      localStorage.setItem('password_change_required', String(Boolean(action.payload.password_change_required)));
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.passwordChangeRequired = false;
      state.error = action.payload;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('password_change_required');
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.passwordChangeRequired = false;
      state.error = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('password_change_required');
    },
    setPasswordChangeRequired: (state, action: PayloadAction<boolean>) => {
      state.passwordChangeRequired = Boolean(action.payload);
      localStorage.setItem('password_change_required', String(Boolean(action.payload)));
    },
    clearError: (state) => {
      state.error = null;
    },
    initializeAuth: (state) => {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      const pw = localStorage.getItem('password_change_required');
      
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          state.token = token;
          state.user = user;
          state.isAuthenticated = true;
          state.passwordChangeRequired = pw === 'true';
        } catch {
          // Si erreur de parsing, on nettoie le localStorage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('password_change_required');
        }
      }
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  clearError,
  initializeAuth,
  setPasswordChangeRequired,
} = authSlice.actions;

export default authSlice.reducer;
