import { apiSlice } from './apiSlice';

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
    listSnapshots: builder.query<{ ok: boolean; date: string; snapshots: Array<{ id: number; created_at: string; totals?: any; files: Array<{ type: 'json'|'csv'; url: string }> }> }, { date?: string }>({
      query: ({ date } = {}) => ({ url: `/inventory/snapshots${date ? `?date=${encodeURIComponent(date)}` : ''}` }),
    }),
    getSnapshot: builder.query<{ ok: boolean; snapshot: any }, { id: string; date?: string }>({
      query: ({ id, date }) => ({ url: `/inventory/snapshots/${encodeURIComponent(id)}${date ? `?date=${encodeURIComponent(date)}` : ''}` }),
    }),
  }),
});

export const { useCreateSnapshotMutation, useImportSnapshotExcelMutation, useListSnapshotsQuery, useGetSnapshotQuery } = inventoryApi;
