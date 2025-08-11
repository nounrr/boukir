import { api } from './apiSlice';
import type { Payment, CreatePaymentData } from '../../types';
import { mockPayments, getNextId } from '../../data/mockData';

// Store local simulé pour les paiements
let payments = [...mockPayments];

const paymentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPayments: builder.query<Payment[], void>({
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { data: payments };
      },
      providesTags: ['Payment'],
    }),

    getPayment: builder.query<Payment, number>({
      queryFn: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const payment = payments.find((pay) => pay.id === id);
        
        if (!payment) {
          return {
            error: {
              status: 404,
              data: { message: 'Paiement introuvable' },
            },
          };
        }

        return { data: payment };
      },
      providesTags: (_result, _error, id) => [{ type: 'Payment', id }],
    }),

    createPayment: builder.mutation<Payment, CreatePaymentData & { created_by: number }>({
      queryFn: async (paymentData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const newPayment: Payment = {
          id: getNextId(payments),
          numero: paymentData.numero,
          bon_id: paymentData.bon_id,
          montant: paymentData.montant,
          mode_paiement: paymentData.mode_paiement,
          date_paiement: paymentData.date_paiement,
          reference: paymentData.reference,
          notes: paymentData.notes,
          created_by: paymentData.created_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        payments.push(newPayment);
        return { data: newPayment };
      },
      invalidatesTags: ['Payment'],
    }),

    updatePayment: builder.mutation<Payment, Partial<Payment> & { id: number; updated_by: number }>({
      queryFn: async (paymentData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        const index = payments.findIndex((pay) => pay.id === paymentData.id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Paiement introuvable' },
            },
          };
        }

        const updatedPayment: Payment = {
          ...payments[index],
          ...paymentData,
          updated_by: paymentData.updated_by,
          updated_at: new Date().toISOString(),
        };

        payments[index] = updatedPayment;
        return { data: updatedPayment };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Payment', id }],
    }),

    deletePayment: builder.mutation<{ success: boolean; id: number }, { id: number; updated_by: number }>({
      queryFn: async ({ id }) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const index = payments.findIndex((pay) => pay.id === id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Paiement introuvable' },
            },
          };
        }

        payments.splice(index, 1);

        return { data: { success: true, id } };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Payment', id }],
    }),

    getPaymentsByBon: builder.query<Payment[], number>({
      queryFn: async (bonId) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const bonPayments = payments.filter((pay) => pay.bon_id === bonId);
        return { data: bonPayments };
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Payment' as const, id })), { type: 'Payment', id: 'LIST' }]
          : [{ type: 'Payment', id: 'LIST' }],
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
} = paymentsApi;
