import { api } from './apiSlice';

export interface FixedCharge {
  id: number;
  libelle: string;
  montant_mensuel: number | string;
  date_debut: string | null;
  date_fin: string | null;
}
type FixedChargeInput = Omit<FixedCharge, 'id'>;
const fixedChargesApi = api.injectEndpoints({
  endpoints: builder => ({
    getFixedCharges: builder.query<FixedCharge[], void>({
      query: () => '/charges-fixes', providesTags: ['FixedCharge'],
    }),
    createFixedCharge: builder.mutation<FixedCharge, FixedChargeInput>({
      query: body => ({ url: '/charges-fixes', method: 'POST', body }),
      invalidatesTags: ['FixedCharge', 'Dashboard'],
    }),
    updateFixedCharge: builder.mutation<FixedCharge, FixedCharge>({
      query: ({ id, ...body }) => ({ url: `/charges-fixes/${id}`, method: 'PUT', body }),
      invalidatesTags: ['FixedCharge', 'Dashboard'],
    }),
    deleteFixedCharge: builder.mutation<{ success: boolean }, number>({
      query: id => ({ url: `/charges-fixes/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FixedCharge', 'Dashboard'],
    }),
  }),
});
export const { useGetFixedChargesQuery, useCreateFixedChargeMutation, useUpdateFixedChargeMutation, useDeleteFixedChargeMutation } = fixedChargesApi;
