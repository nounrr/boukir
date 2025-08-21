import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Bon } from '../../types';

interface BonsState {
  bons: Bon[];
  loading: boolean;
  error: string | null;
  selectedBon: Bon | null;
  filters: {
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Avoir' | 'AvoirFournisseur' | 'Devis' | 'Vehicule' | 'all';
    search: string;
    dateFrom: string;
    dateTo: string;
    status: 'all' | 'Brouillon' | 'Validé' | 'Annulé' | 'Livré' | 'Payé';
  };
}

const initialState: BonsState = {
  bons: [],
  loading: false,
  error: null,
  selectedBon: null,
  filters: {
    type: 'all',
    search: '',
    dateFrom: '',
    dateTo: '',
    status: 'all'
  }
};

const bonsSlice = createSlice({
  name: 'bons',
  initialState,
  reducers: {
    setBons: (state, action: PayloadAction<Bon[]>) => {
      state.bons = action.payload;
    },
    addBon: (state, action: PayloadAction<Bon>) => {
      state.bons.push(action.payload);
    },
    updateBon: (state, action: PayloadAction<Bon>) => {
      const index = state.bons.findIndex(bon => bon.id === action.payload.id);
      if (index !== -1) {
        state.bons[index] = action.payload;
      }
    },
    deleteBon: (state, action: PayloadAction<number>) => {
      state.bons = state.bons.filter(bon => bon.id !== action.payload);
    },
    setSelectedBon: (state, action: PayloadAction<Bon | null>) => {
      state.selectedBon = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<BonsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    resetFilters: (state) => {
      state.filters = initialState.filters;
    }
  }
});

export const {
  setBons,
  addBon,
  updateBon,
  deleteBon,
  setSelectedBon,
  setLoading,
  setError,
  setFilters,
  resetFilters
} = bonsSlice.actions;

export default bonsSlice.reducer;
