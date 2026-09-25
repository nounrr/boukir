import { apiSlice } from './apiSlice';

// Jeton de déverrouillage de l'espace Projets. Gardé uniquement en mémoire :
// quitter la page (ou recharger) redemande le mot de passe.
let unlockToken: string | null = null;
export const setProjetsUnlockToken = (token: string | null) => { unlockToken = token; };
export const hasProjetsUnlockToken = () => Boolean(unlockToken);
const unlockHeaders = () => (unlockToken ? { 'X-Projets-Token': unlockToken } : undefined);

export type AvanceMode = 'Espece' | 'Virement' | 'Cheque';
export type ProjetBonType = 'products' | 'charge';

export interface Projet {
  id: number;
  nom: string;
  description: string | null;
  date_debut: string | null;
  date_fin: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjetListItem extends Projet {
  total_devis: number;
  total_avances: number;
  total_products: number;
  total_charges: number;
}

export interface ProjetLine {
  id?: number;
  designation: string;
  unite: string | null;
  quantite: number;
  prix_unitaire: number;
  total?: number;
}

export interface ProjetBonItem extends ProjetLine {
  product_id: number | null;
  variant_id: number | null;
  unit_id: number | null;
  product_snapshot_id?: number | null;
  prix_achat?: number;
  cout_revient?: number;
  prix_vente?: number;
  prix_vente_2?: number;
}

export interface ProjetAvance {
  id: number;
  date_avance: string;
  montant: number;
  mode_paiement: AvanceMode;
  description: string | null;
}

export interface ProjetBon {
  id: number;
  type: ProjetBonType;
  date_bon: string;
  observations: string | null;
  montant_total: number;
  items: ProjetBonItem[];
}

export interface ProjetSituationRow {
  kind: 'avance' | 'products' | 'charge';
  id: number;
  date: string;
  reference: string;
  libelle: string;
  mode_paiement: AvanceMode | null;
  entree: number;
  sortie: number;
  solde: number;
}

export interface ProjetStats {
  total_devis: number;
  total_avances: number;
  total_products: number;
  total_charges: number;
  total_depenses: number;
  solde: number;
  reste_a_encaisser: number;
  resultat_previsionnel: number;
  taux_encaissement: number;
  taux_consommation: number;
  nb_avances: number;
  nb_bons_products: number;
  nb_bons_charge: number;
  par_mode: Record<AvanceMode, number>;
  par_mois: { mois: string; avances: number; products: number; charges: number }[];
}

export interface ProjetDetail {
  projet: Projet;
  devis: ProjetLine[];
  avances: ProjetAvance[];
  bons: ProjetBon[];
  situation: ProjetSituationRow[];
  stats: ProjetStats;
}

export type ProjetInput = Pick<Projet, 'nom' | 'description' | 'date_debut' | 'date_fin'>;
export type AvanceInput = Omit<ProjetAvance, 'id'>;
export interface BonInput {
  type: ProjetBonType;
  date_bon: string;
  observations: string | null;
  items: ProjetBonItem[];
}

export const projetsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getProjetsAccess: builder.query<{ configured: boolean }, void>({
      query: () => '/projets/access',
    }),
    setupProjetsPassword: builder.mutation<{ token: string }, { password: string }>({
      query: (body) => ({ url: '/projets/access/setup', method: 'POST', body }),
    }),
    unlockProjets: builder.mutation<{ token: string }, { password: string }>({
      query: (body) => ({ url: '/projets/access/unlock', method: 'POST', body }),
    }),
    changeProjetsPassword: builder.mutation<{ ok: true }, { current_password: string; new_password: string }>({
      query: (body) => ({ url: '/projets/access/change-password', method: 'POST', body, headers: unlockHeaders() }),
    }),
    getProjets: builder.query<{ projets: ProjetListItem[] }, void>({
      query: () => ({ url: '/projets', headers: unlockHeaders() }),
      providesTags: ['Projet'],
    }),
    getProjet: builder.query<ProjetDetail, number>({
      query: (id) => ({ url: `/projets/${id}`, headers: unlockHeaders() }),
      providesTags: (_r, _e, id) => [{ type: 'Projet', id }],
    }),
    createProjet: builder.mutation<{ projet: Projet }, ProjetInput>({
      query: (body) => ({ url: '/projets', method: 'POST', body, headers: unlockHeaders() }),
      invalidatesTags: ['Projet'],
    }),
    updateProjet: builder.mutation<{ projet: Projet }, { id: number; changes: ProjetInput }>({
      query: ({ id, changes }) => ({ url: `/projets/${id}`, method: 'PATCH', body: changes, headers: unlockHeaders() }),
      invalidatesTags: ['Projet'],
    }),
    deleteProjet: builder.mutation<{ ok: true }, number>({
      query: (id) => ({ url: `/projets/${id}`, method: 'DELETE', headers: unlockHeaders() }),
      invalidatesTags: ['Projet'],
    }),
    saveProjetDevis: builder.mutation<{ ok: true; total: number }, { id: number; lignes: ProjetLine[] }>({
      query: ({ id, lignes }) => ({ url: `/projets/${id}/devis`, method: 'PUT', body: { lignes }, headers: unlockHeaders() }),
      invalidatesTags: ['Projet'],
    }),
    saveProjetAvance: builder.mutation<unknown, { projetId: number; id?: number; data: AvanceInput }>({
      query: ({ projetId, id, data }) => ({
        url: id ? `/projets/${projetId}/avances/${id}` : `/projets/${projetId}/avances`,
        method: id ? 'PUT' : 'POST',
        body: data,
        headers: unlockHeaders(),
      }),
      invalidatesTags: ['Projet'],
    }),
    deleteProjetAvance: builder.mutation<unknown, { projetId: number; id: number }>({
      query: ({ projetId, id }) => ({ url: `/projets/${projetId}/avances/${id}`, method: 'DELETE', headers: unlockHeaders() }),
      invalidatesTags: ['Projet'],
    }),
    saveProjetBon: builder.mutation<unknown, { projetId: number; id?: number; data: BonInput }>({
      query: ({ projetId, id, data }) => ({
        url: id ? `/projets/${projetId}/bons/${id}` : `/projets/${projetId}/bons`,
        method: id ? 'PUT' : 'POST',
        body: data,
        headers: unlockHeaders(),
      }),
      invalidatesTags: ['Projet'],
    }),
    deleteProjetBon: builder.mutation<unknown, { projetId: number; id: number }>({
      query: ({ projetId, id }) => ({ url: `/projets/${projetId}/bons/${id}`, method: 'DELETE', headers: unlockHeaders() }),
      invalidatesTags: ['Projet'],
    }),
  }),
});

export const {
  useGetProjetsAccessQuery,
  useSetupProjetsPasswordMutation,
  useUnlockProjetsMutation,
  useChangeProjetsPasswordMutation,
  useGetProjetsQuery,
  useGetProjetQuery,
  useCreateProjetMutation,
  useUpdateProjetMutation,
  useDeleteProjetMutation,
  useSaveProjetDevisMutation,
  useSaveProjetAvanceMutation,
  useDeleteProjetAvanceMutation,
  useSaveProjetBonMutation,
  useDeleteProjetBonMutation,
} = projetsApi;
