import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface ArtisanRequest {
  id: number;
  nom_complet: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  avatar_url?: string;
  created_at: string;
}

interface NotificationsState {
  count: number;
  requests: ArtisanRequest[];
  loading: boolean;
  error: string | null;
  lastFetch: number | null;
}

const initialState: NotificationsState = {
  count: 0,
  requests: [],
  loading: false,
  error: null,
  lastFetch: null,
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setCount: (state, action: PayloadAction<number>) => {
      state.count = action.payload;
      state.lastFetch = Date.now();
    },
    setRequests: (state, action: PayloadAction<ArtisanRequest[]>) => {
      state.requests = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    decrementCount: (state) => {
      if (state.count > 0) state.count--;
    },
    removeRequest: (state, action: PayloadAction<number>) => {
      state.requests = state.requests.filter(req => req.id !== action.payload);
      if (state.count > 0) state.count--;
    },
    reset: () => initialState,
  },
});

export const {
  setCount,
  setRequests,
  setLoading,
  setError,
  decrementCount,
  removeRequest,
  reset,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;