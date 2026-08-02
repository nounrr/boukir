import { apiSlice } from './apiSlice';

export type PaymentPhoneCaptureSession = {
  success: boolean;
  id: number;
  token: string;
  status: 'pending';
  expires_at: string;
};

export type PaymentPhoneCaptureStatus = {
  success: boolean;
  id: number;
  status: 'pending' | 'uploaded' | 'cancelled' | 'expired';
  image_url: string | null;
  expires_at: string;
};

export const paymentPhoneCaptureApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createPaymentPhoneCapture: builder.mutation<PaymentPhoneCaptureSession, void>({
      query: () => ({ url: '/payment-phone-captures', method: 'POST' }),
    }),
    getPaymentPhoneCapture: builder.query<PaymentPhoneCaptureStatus, number>({
      query: (id) => `/payment-phone-captures/${id}`,
    }),
    cancelPaymentPhoneCapture: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({ url: `/payment-phone-captures/${id}`, method: 'DELETE' }),
    }),
  }),
});

export const {
  useCreatePaymentPhoneCaptureMutation,
  useLazyGetPaymentPhoneCaptureQuery,
  useCancelPaymentPhoneCaptureMutation,
} = paymentPhoneCaptureApi;
