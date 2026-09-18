import { api } from './apiSlice';

export type FondCaisseMouvement = {
  jour: string;
  bonComptantPaye: number;
  paiementBonComptantNonPaye: number;
  paiementClientCaisse: number;
  montantLibreCaisse: number;
  transfertVersCoffre: number;
  transfertVersPoche: number;
  transfertCoffreVersPoche: number;
  bonChargeInclusCaisse: number;
  bonCommandeInclusCaisse: number;
  bonVehicule: number;
  avoirComptant: number;
  entrees: number;
  sorties: number;
  coffreEntrees: number;
  coffreSorties: number;
  mouvementNetCoffre: number;
  mouvementNet: number;
};

type FondCaisseMouvementsResponse = {
  dateFrom: string;
  dateTo: string;
  data: FondCaisseMouvement[];
};

/**
 * Droits sur le fond de caisse :
 *  - ouverture : saisir uniquement le fond initial de la caisse (sans voir les données)
 *  - gestion   : accès complet (PDG uniquement)
 */
export interface FondCaissePermissions {
  ouverture: boolean;
  gestion: boolean;
}

export interface FondCaissePermissionEmployee extends FondCaissePermissions {
  id: number;
  nom_complet: string | null;
  cin: string | null;
  role: string | null;
  verrouille: boolean;
}

export const fondCaisseApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getFondCaisseMouvements: builder.query<
      FondCaisseMouvementsResponse,
      { dateFrom: string; dateTo: string }
    >({
      query: (params) => ({ url: '/fond-caisse/mouvements', params }),
      providesTags: ['FondCaisse'],
    }),
    getMyFondCaissePermissions: builder.query<FondCaissePermissions, void>({
      query: () => '/fond-caisse/permissions/me',
      providesTags: ['FondCaissePermissions'],
    }),
    getFondCaissePermissions: builder.query<FondCaissePermissionEmployee[], void>({
      query: () => '/fond-caisse/permissions',
      providesTags: ['FondCaissePermissions'],
    }),
    updateFondCaissePermissions: builder.mutation<
      FondCaissePermissionEmployee,
      { id: number; permissions: Pick<FondCaissePermissions, 'ouverture'> }
    >({
      query: ({ id, permissions }) => ({
        url: `/fond-caisse/permissions/${id}`,
        method: 'PUT',
        body: permissions,
      }),
      invalidatesTags: ['FondCaissePermissions'],
    }),
  }),
});

export const {
  useGetFondCaisseMouvementsQuery,
  useGetMyFondCaissePermissionsQuery,
  useGetFondCaissePermissionsQuery,
  useUpdateFondCaissePermissionsMutation,
} = fondCaisseApi;
