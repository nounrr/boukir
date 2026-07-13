import { apiSlice } from './apiSlice';

export interface InventorySnapshotSummary {
  id: number;
  date: string;
  created_at: string;
  totals?: any;
  files: Array<{ type: 'json' | 'csv'; url: string }>;
}

export interface InventorySnapshotListResponse {
  ok: boolean;
  date: string | null;
  snapshots: InventorySnapshotSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const inventoryApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createSnapshot: builder.mutation<{ ok: boolean; id: number; date: string; jsonUrl: string; csvUrl: string; totals: any }, { date?: string } | void>({
      query: (arg) => {
        const date = (arg as any)?.date;
        return { url: '/inventory/snapshots', method: 'POST', body: date ? { date } : undefined };
      },
      invalidatesTags: ['Product'],
    }),
    importSnapshotExcel: builder.mutation<{ ok: boolean; id: number; date: string; jsonUrl: string; csvUrl: string; totals: any; missingIds?: number[] }, { date: string; file: File }>({
      query: ({ date, file }) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('date', date);
        return { url: '/inventory/snapshots/import-excel', method: 'POST', body: fd };
      },
      invalidatesTags: ['Product'],
    }),
    listSnapshots: builder.query<InventorySnapshotListResponse, { date?: string; page?: number; limit?: number }>({
      query: ({ date, page = 1, limit = 100 } = {}) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (date) params.set('date', date);
        return { url: `/inventory/snapshots?${params.toString()}` };
      },
    }),
    getSnapshot: builder.query<{ ok: boolean; snapshot: any }, { id: string; date?: string }>({
      query: ({ id, date }) => ({ url: `/inventory/snapshots/${encodeURIComponent(id)}${date ? `?date=${encodeURIComponent(date)}` : ''}` }),
    }),
  }),
});

export const { useCreateSnapshotMutation, useImportSnapshotExcelMutation, useListSnapshotsQuery, useGetSnapshotQuery } = inventoryApi;
