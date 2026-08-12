import { api } from './apiSlice';

export interface SolverCategory {
  id: number;
  nom: string;
  parent_id: number | null;
  parent_nom: string | null;
  product_count: number;
  /** "Parent > Enfant" — permet de distinguer les catégories homonymes. */
  chemin: string;
}

export interface SolverProductMatch {
  id: number;
  designation: string;
  reference: string | null;
  categorie_id: number | null;
  categorie_nom: string | null;
  categorie_chemin: string | null;
}

export interface SolverResolveRow {
  designation: string;
  status: 'ok' | 'ambiguous' | 'not_found';
  matches: SolverProductMatch[];
}

export interface SolverAssignResponse {
  message: string;
  categorie_id: number;
  updated: number;
  product_ids: number[];
}

export const categorySolverApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSolverCategories: builder.query<SolverCategory[], void>({
      query: () => ({ url: '/category-solver/categories' }),
      providesTags: ['Category'],
    }),
    resolveDesignations: builder.mutation<{ results: SolverResolveRow[] }, { designations: string[] }>({
      query: (body) => ({ url: '/category-solver/resolve', method: 'POST', body }),
    }),
    assignCategory: builder.mutation<SolverAssignResponse, { categorie_id: number; product_ids: number[] }>({
      query: (body) => ({ url: '/category-solver/assign', method: 'POST', body }),
      invalidatesTags: ['Product', 'Category'],
    }),
  }),
});

export const {
  useGetSolverCategoriesQuery,
  useResolveDesignationsMutation,
  useAssignCategoryMutation,
} = categorySolverApi;
