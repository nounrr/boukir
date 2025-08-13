import { api } from './apiSlice';
import type { Payment, CreatePaymentData } from '../../types';

const paymentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPayments: builder.query<Payment[], void>({
      query: () => ({ url: '/payments' }),
      providesTags: ['Payment'],
    }),

    getPayment: builder.query<Payment, number>({
      query: (id) => ({ url: `/payments/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Payment', id }],
    }),

    createPayment: builder.mutation<Payment, CreatePaymentData & { created_by: number }>({
      query: (body) => ({ url: '/payments', method: 'POST', body }),
  invalidatesTags: (_result, _error, body) => [
        'Payment',
        'Contact',
        ...(body?.contact_id ? [{ type: 'Contact' as const, id: body.contact_id }] : []),
      ],
    }),

    updatePayment: builder.mutation<Payment, Partial<Payment> & { id: number; updated_by: number }>({
      query: ({ id, ...patch }) => ({ url: `/payments/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: (_res, _err, { id, contact_id }) => [
        { type: 'Payment', id },
        'Contact',
        ...(contact_id ? [{ type: 'Contact' as const, id: contact_id }] : []),
      ],
    }),

    deletePayment: builder.mutation<{ success: boolean; id: number }, { id: number; contact_id?: number }>({
      query: ({ id }) => ({ url: `/payments/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { id, contact_id }) => [
        { type: 'Payment', id },
        'Contact',
        ...(contact_id ? [{ type: 'Contact' as const, id: contact_id }] : []),
      ],
    }),

    getPaymentsByBon: builder.query<Payment[], number>({
      query: (bonId) => ({ url: `/payments?bon_id=${bonId}` }),
      providesTags: ['Payment'],
    }),

    getPersonnelNames: builder.query<string[], void>({
      query: () => ({ url: '/payments/personnel' }),
      providesTags: ['Payment'],
    }),
  }),
});

export const {
  useGetPaymentsQuery,
  useGetPaymentQuery,
  useCreatePaymentMutation,
  useUpdatePaymentMutation,
  useDeletePaymentMutation,
  useGetPaymentsByBonQuery,
  useGetPersonnelNamesQuery,
} = paymentsApi;
