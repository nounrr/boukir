import { apiSlice } from './apiSlice';

export type PdgBoardKind = 'note' | 'task';
export type PdgBoardStatus = 'todo' | 'doing' | 'done';

export interface PdgBoardMember {
  id: number;
  nom_complet: string;
}

export interface PdgBoardCard {
  id: number;
  kind: PdgBoardKind;
  title: string;
  description: string | null;
  status: PdgBoardStatus;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export type PdgBoardCardInput = Pick<PdgBoardCard, 'kind' | 'title' | 'description' | 'status' | 'assigned_to'>;

export const pdgBoardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPdgBoard: builder.query<{ members: PdgBoardMember[]; cards: PdgBoardCard[] }, void>({
      query: () => '/pdg-board',
      providesTags: ['PdgBoard'],
    }),
    createPdgBoardCard: builder.mutation<{ card: PdgBoardCard }, PdgBoardCardInput>({
      query: (body) => ({ url: '/pdg-board', method: 'POST', body }),
      invalidatesTags: ['PdgBoard'],
    }),
    updatePdgBoardCard: builder.mutation<{ card: PdgBoardCard }, { id: number; changes: Partial<PdgBoardCardInput> }>({
      query: ({ id, changes }) => ({ url: `/pdg-board/${id}`, method: 'PATCH', body: changes }),
      invalidatesTags: ['PdgBoard'],
    }),
    deletePdgBoardCard: builder.mutation<{ ok: true }, number>({
      query: (id) => ({ url: `/pdg-board/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PdgBoard'],
    }),
  }),
});

export const {
  useGetPdgBoardQuery,
  useCreatePdgBoardCardMutation,
  useUpdatePdgBoardCardMutation,
  useDeletePdgBoardCardMutation,
} = pdgBoardApi;
