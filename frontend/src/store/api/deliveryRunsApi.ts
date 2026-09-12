import { api } from './apiSlice';

export type DeliveryBon = { bon_type: string; bon_id: number; numero: string; contact_nom?: string };
export type DeliveryQueue = DeliveryBon & { id: number; status: string; queued_at: string; run_id: number | null };
export type DeliveryItem = DeliveryBon & { queue_id: number; outcome: string | null; failure_reason: string | null };
export type DeliveryRun = { id: number; chauffeur_id: number; vehicule_id: number; chauffeur_nom: string; vehicule_nom: string; status: string; started_at: string; ended_at: string | null; duration_minutes: number; notes?: string; items: DeliveryItem[] };
export type DeliveryFilters = { from?: string; to?: string; chauffeur_id?: string; vehicule_id?: string };
type Metrics = { runs: number; completed: number; active: number; avg_minutes: number | null; bons: number; delivered: number; failed: number };
const deliveryApi = api.injectEndpoints({
  endpoints: b => ({
    deliveryAccess: b.query<{ allowed: boolean; pdg: boolean }, void>({ query: () => '/delivery-runs/access', providesTags: ['DeliveryAccess'] }),
    deliveryPermissions: b.query<{ id: number; nom_complet: string; role: string; allowed: number }[], void>({ query: () => '/delivery-runs/permissions', providesTags: ['DeliveryAccess'] }),
    setDeliveryPermission: b.mutation<unknown, { id: number; allowed: boolean }>({ query: ({ id, allowed }) => ({ url: `/delivery-runs/permissions/${id}`, method: 'PUT', body: { allowed } }), invalidatesTags: ['DeliveryAccess'] }),
    deliveryResources: b.query<{ drivers: { id: number; nom_complet: string; busy: number }[]; vehicles: { id: number; nom: string; busy: number }[] }, void>({ query: () => '/delivery-runs/resources', providesTags: ['Delivery'] }),
    deliveryBons: b.query<{ types: string[]; items: DeliveryBon[] }, { q: string; type: string }>({ query: params => ({ url: '/delivery-runs/bons', params }), providesTags: ['Delivery', 'Bon'] }),
    deliveryQueue: b.query<DeliveryQueue[], void>({ query: () => '/delivery-runs/queue', providesTags: ['Delivery'] }),
    addDeliveryQueue: b.mutation<unknown, { bons: Pick<DeliveryBon, 'bon_type' | 'bon_id'>[] }>({ query: body => ({ url: '/delivery-runs/queue', method: 'POST', body }), invalidatesTags: ['Delivery'] }),
    removeDeliveryQueue: b.mutation<unknown, number>({ query: id => ({ url: `/delivery-runs/queue/${id}`, method: 'DELETE' }), invalidatesTags: ['Delivery'] }),
    deliveryRuns: b.query<{ total: number; items: DeliveryRun[] }, DeliveryFilters & { page: number }>({ query: params => ({ url: '/delivery-runs/runs', params }), providesTags: ['Delivery'] }),
    startDelivery: b.mutation<{ id: number }, { chauffeur_id: number; vehicule_id: number; bons: Pick<DeliveryBon, 'bon_type' | 'bon_id'>[]; notes: string }>({ query: body => ({ url: '/delivery-runs/runs', method: 'POST', body }), invalidatesTags: ['Delivery', 'Bon'] }),
    finishDelivery: b.mutation<unknown, { id: number; results: { queue_id: number; outcome: string; failure_reason: string }[] }>({ query: ({ id, ...body }) => ({ url: `/delivery-runs/runs/${id}/finish`, method: 'POST', body }), invalidatesTags: ['Delivery', 'Bon', 'Sortie', 'Comptant', 'Commande', 'Devis'] }),
    deliveryStats: b.query<{ summary: Metrics; drivers: (Metrics & { id: number; name: string })[]; vehicles: (Metrics & { id: number; name: string })[]; daily: (Metrics & { day: string })[]; reasons: { reason: string; total: number }[]; waiting: number }, DeliveryFilters>({ query: params => ({ url: '/delivery-runs/stats', params }), providesTags: ['Delivery'] }),
  }),
});
export const { useDeliveryAccessQuery, useDeliveryPermissionsQuery, useSetDeliveryPermissionMutation, useDeliveryResourcesQuery, useDeliveryBonsQuery, useDeliveryQueueQuery, useAddDeliveryQueueMutation, useRemoveDeliveryQueueMutation, useDeliveryRunsQuery, useStartDeliveryMutation, useFinishDeliveryMutation, useDeliveryStatsQuery } = deliveryApi;
