import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Payment } from '../../types';
import { mockPayments } from '../../data/mockData';
import type { RootState } from '../index';

interface PaymentsState {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  selectedPayment: Payment | null;
  filters: {
    search: string;
    dateFrom: string;
    dateTo: string;
    mode_paiement: 'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Carte';
  };
}

// Chargement initial depuis localStorage ou mock data
const getInitialState = (): PaymentsState => {
  try {
    const storedPayments = localStorage.getItem('bpukir_payments');
    return {
      payments: storedPayments ? JSON.parse(storedPayments) : mockPayments,
      loading: false,
      error: null,
      selectedPayment: null,
      filters: {
        search: '',
        dateFrom: '',
        dateTo: '',
        mode_paiement: 'all',
      }
    };
  } catch (e) {
    console.error('Erreur lors du chargement des paiements', e);
    return {
      payments: mockPayments,
      loading: false,
      error: null,
      selectedPayment: null,
      filters: {
        search: '',
        dateFrom: '',
        dateTo: '',
        mode_paiement: 'all',
      }
    };
  }
};

const paymentsSlice = createSlice({
  name: 'payments',
  initialState: getInitialState(),
  reducers: {
    // Définir les paiements
    setPayments: (state, action: PayloadAction<Payment[]>) => {
      state.payments = action.payload;
      localStorage.setItem('bpukir_payments', JSON.stringify(state.payments));
    },
    
    // Ajouter un nouveau paiement
    addPayment: (state, action: PayloadAction<Payment>) => {
      state.payments.push(action.payload);
      localStorage.setItem('bpukir_payments', JSON.stringify(state.payments));
    },
    
    // Mettre à jour un paiement existant
    updatePayment: (state, action: PayloadAction<Payment>) => {
      const index = state.payments.findIndex(p => p.id === action.payload.id);
      if (index !== -1) {
        state.payments[index] = action.payload;
        localStorage.setItem('bpukir_payments', JSON.stringify(state.payments));
      }
    },
    
    // Supprimer un paiement
    deletePayment: (state, action: PayloadAction<number>) => {
      state.payments = state.payments.filter(p => p.id !== action.payload);
      localStorage.setItem('bpukir_payments', JSON.stringify(state.payments));
    },
    
    // Définir le paiement sélectionné
    setSelectedPayment: (state, action: PayloadAction<Payment | null>) => {
      state.selectedPayment = action.payload;
    },
    
    // États de chargement et d'erreur
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    // Filtres
    setFilters: (state, action: PayloadAction<Partial<PaymentsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    resetFilters: (state) => {
      state.filters = getInitialState().filters;
    },
    
    // Réinitialiser les paiements avec les données de test
    seedPayments: (state) => {
      state.payments = mockPayments;
      localStorage.setItem('bpukir_payments', JSON.stringify(state.payments));
    },
  },
});

export const {
  setPayments,
  addPayment,
  updatePayment,
  deletePayment,
  setSelectedPayment,
  setLoading,
  setError,
  setFilters,
  resetFilters,
  seedPayments,
} = paymentsSlice.actions;

export const selectPayments = (state: RootState) => state.payments?.payments || [];
export const selectPaymentFilters = (state: RootState) => state.payments?.filters;

export default paymentsSlice.reducer;
