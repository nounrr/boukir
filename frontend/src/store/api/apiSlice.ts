import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const safeResponseHandler = async (response: Response) => {
  // Avoid RTK Query PARSING_ERROR when the server returns HTML (502, 504, etc.)
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get('content-type') || '';
  const looksLikeJson =
    contentType.toLowerCase().includes('application/json') ||
    /^[\s\r\n]*[\[{]/.test(text);

  if (looksLikeJson) {
    try {
      return JSON.parse(text);
    } catch {
      // If it's not valid JSON, still return the raw text so callers can display it.
      return text;
    }
  }

  return text;
};

// Configuration de base pour RTK Query avec simulation d'API
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    responseHandler: safeResponseHandler,
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
  tagTypes: ['Employee', 'Product', 'Contact', 'ContactGroup', 'Bon', 'Payment', 'Category', 'Vehicule', 'Commande', 'Sortie', 'Comptant', 'Devis', 'AvoirClient', 'AvoirFournisseur', 'AvoirComptant', 'AvoirEcommerce', 'Ecommerce', 'Remise', 'RemiseItem', 'Talon', 'DocumentType', 'EmployeeDoc', 'OldTalonCaisse', 'AccessSchedule'],
  endpoints: () => ({}),
});

export { api as apiSlice };
