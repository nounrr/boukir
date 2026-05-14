import { api } from './apiSlice';

export type FondCaisseMouvement = {
  jour: string;
  bonComptantPaye: number;
  paiementBonComptantNonPaye: number;
  paiementClientCaisse: number;
  bonChargeInclusCaisse: number;
  bonVehicule: number;
  avoirClient: number;
  entrees: number;
  sorties: number;
  mouvementNet: number;
};

type FondCaisseMouvementsResponse = {
  dateFrom: string;
  dateTo: string;
  data: FondCaisseMouvement[];
};

export const fondCaisseApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getFondCaisseMouvements: builder.query<
      FondCaisseMouvementsResponse,
      { dateFrom: string; dateTo: string }
    >({
      query: (params) => ({ url: '/fond-caisse/mouvements', params }),
      providesTags: ['FondCaisse'],
    }),
  }),
});

export const { useGetFondCaisseMouvementsQuery } = fondCaisseApi;
