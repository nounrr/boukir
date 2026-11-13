import { api } from './apiSlice';
export interface CountSession { id: number; title: string; is_closed: boolean; created_at: string; entry_count: number; item_count: number; participant_count: number; total_quantity: number; }
export interface CountParticipant { name: string; quantity: number; entry_count: number; }
export interface CountSummaryItem { entity_key: string; product_id: number; variant_id: number | null; designation: string; variant_name: string | null; reference: string; quantity: number; entry_count: number; participants: CountParticipant[]; }
export interface CountEntry { id: number; entity_key: string; product_id: number; variant_id: number | null; designation: string; variant_name: string | null; reference: string; name: string; quantity: number; created_at: string; }
export interface CountPagination { page: number; limit: number; total: number; }
export const inventoryCountingApi = api.injectEndpoints({ endpoints: builder => ({
 listInventoryCountSessions: builder.query<{ sessions: CountSession[] }, void>({ query: () => ({ url: '/inventory-count/sessions', timeout: 15000 }), providesTags: [{ type: 'Product', id: 'COUNT_SESSIONS' }] }),
 createInventoryCountSession: builder.mutation<{ session: CountSession; url: string }, { title: string }>({ query: body => ({ url: '/inventory-count/sessions', method: 'POST', body }), invalidatesTags: [{ type: 'Product', id: 'COUNT_SESSIONS' }] }),
 rotateInventoryCountLink: builder.mutation<{ url: string }, number>({ query: id => ({ url: `/inventory-count/sessions/${id}/link`, method: 'POST' }) }),
 closeInventoryCountSession: builder.mutation<{ session: CountSession }, { id: number; is_closed: boolean }>({ query: ({ id, ...body }) => ({ url: `/inventory-count/sessions/${id}`, method: 'PATCH', body }), invalidatesTags: [{ type: 'Product', id: 'COUNT_SESSIONS' }] }),
 getInventoryCountSummary: builder.query<{ items: CountSummaryItem[]; pagination: CountPagination }, { id: number; q?: string; page?: number }>({ query: ({ id, ...params }) => ({ url: `/inventory-count/sessions/${id}/summary`, params, timeout: 15000 }), providesTags: [{ type: 'Product', id: 'COUNT_SESSIONS' }] }),
 getInventoryCountEntries: builder.query<{ entries: CountEntry[]; pagination: CountPagination }, { id: number; entity_key?: string; page?: number }>({ query: ({ id, ...params }) => ({ url: `/inventory-count/sessions/${id}/entries`, params, timeout: 15000 }), providesTags: [{ type: 'Product', id: 'COUNT_SESSIONS' }] }),
}) });
export const { useListInventoryCountSessionsQuery, useCreateInventoryCountSessionMutation, useRotateInventoryCountLinkMutation, useCloseInventoryCountSessionMutation, useGetInventoryCountSummaryQuery, useGetInventoryCountEntriesQuery } = inventoryCountingApi;
