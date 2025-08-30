import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Configuration de base pour RTK Query avec simulation d'API
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: (headers, { getState }) => {
      // Type assertion pour le state, car il sera correctement typé
      const state = getState() as any;
      const token = state.auth?.token;
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Employee', 'Product', 'Contact', 'Bon', 'Payment', 'Category', 'Vehicule', 'Commande', 'Sortie', 'Comptant', 'Devis', 'AvoirClient', 'AvoirFournisseur', 'AvoirComptant', 'Remise', 'RemiseItem', 'Talon', 'DocumentType', 'EmployeeDoc', 'OldTalonCaisse'],
  endpoints: () => ({}),
});

export { api as apiSlice };
