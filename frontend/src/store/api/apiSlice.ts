import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { AuthState } from '../../types';
import { logout } from '../slices/authSlice';

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

const fetchApi = fetchBaseQuery({
  baseUrl: '/api',
  responseHandler: safeResponseHandler,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as { auth?: AuthState }).auth?.token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

export const api = createApi({
  reducerPath: 'api',
  baseQuery: async (args, context, extraOptions) => {
    const auth = (context.getState() as { auth?: AuthState }).auth;
    const result = await fetchApi(args, context, extraOptions);
    const error = result.error?.data;
    const needsReauthentication = error && typeof error === 'object' &&
      'error_type' in error && error.error_type === 'PASSWORD_REAUTH_REQUIRED';
    const expiredReset = context.endpoint === 'changePassword' &&
      auth?.passwordChangeRequired && result.error?.status === 401;
    const currentToken = (context.getState() as { auth?: AuthState }).auth?.token;
    if (auth?.token && auth.token === currentToken && (needsReauthentication || expiredReset)) {
      context.dispatch(logout('password-reauth'));
    }
    return result;
  },
  tagTypes: ['Auth', 'Employee', 'ClientCollaborationPermissions', 'MaalemReviewPermissions', 'MaalemReview', 'Product', 'Contact', 'ContactDirectory', 'ContactGroup', 'ContactComment', 'Dashboard', 'Bon', 'Payment', 'Category', 'MaalemCategory', 'MaalemProfile', 'Service', 'Vehicule', 'Commande', 'Sortie', 'Comptant', 'Charge', 'AvoirCharge', 'ComptantPayment', 'Devis', 'AvoirClient', 'AvoirFournisseur', 'AvoirComptant', 'AvoirEcommerce', 'Ecommerce', 'Remise', 'RemiseItem', 'Talon', 'DocumentType', 'EmployeeDoc', 'OldTalonCaisse', 'FondCaisse', 'FondCaissePermissions', 'StatsDetailsPermissions', 'PagePermissions', 'SalePriceCorrectionAccess', 'SalePriceCorrectionRequest', 'ImageEnhancement', 'AccessSchedule', 'UiSettings', 'PricePurchaseSolver', 'DepotStock', 'PhotoShoot', 'ProductNameCorrection', 'SlowMovingStock', 'Absence', 'AbsencePermissions', 'Delivery', 'DeliveryAccess', 'PdgBoard', 'Projet', 'FixedCharge'],
  endpoints: () => ({}),
});

export { api as apiSlice };
