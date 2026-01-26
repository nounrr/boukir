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
      // invalidate specific payment AND the global Payment list so queries refetch
      invalidatesTags: (_res, _err, { id, contact_id }) => [
        'Payment',
        { type: 'Payment', id },
        'Contact',
        ...(contact_id ? [{ type: 'Contact' as const, id: contact_id }] : []),
      ],
    }),

    changePaymentStatus: builder.mutation<{ success: boolean; message?: string; data?: Payment }, { id: number; statut: string }>({
      query: ({ id, statut }) => ({ url: `/payments/${id}/statut`, method: 'PATCH', body: { statut } }),
  // invalidate both the specific payment and the global Payment list so queries refetch
  invalidatesTags: (_res, _err, { id }) => [ 'Payment', { type: 'Payment' as const, id }, 'Contact' ],
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

    reorderPayments: builder.mutation<
      { success: boolean; message?: string },
      { 
        contactId: number; 
        paymentOrders: Array<{ 
          id: number; 
          newDate: string;
        }> 
      }
    >({
      query: (body) => ({ 
        url: '/payments/reorder', 
        method: 'PATCH', 
        body 
      }),
      invalidatesTags: (_result, _error, { contactId }) => [
        'Payment',
        'Contact',
        { type: 'Contact' as const, id: contactId },
      ],
    }),
  }),
});

export const {
  useGetPaymentsQuery,
  useGetPaymentQuery,
  useCreatePaymentMutation,
  useUpdatePaymentMutation,
  useChangePaymentStatusMutation,
  useDeletePaymentMutation,
  useGetPaymentsByBonQuery,
  useGetPersonnelNamesQuery,
  useReorderPaymentsMutation,
} = paymentsApi;
