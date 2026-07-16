import { api } from './apiSlice';

export type PhotoShootStatus = 'pending' | 'processing' | 'processed' | 'attached' | 'error';
export type AiImageModel = 'gpt-image-2' | 'gpt-image-1.5' | 'gpt-image-1-mini';
export type AiImageQuality = 'low' | 'medium' | 'high';

export interface ProcessPhotoShootsRequest {
  shootIds: number[];
  replaceShootIds?: number[];
  model: AiImageModel;
  quality: AiImageQuality;
}

export interface PhotoShootImage {
  id: number;
  shoot_id: number;
  kind: 'original' | 'processed';
  source_image_id: number | null;
  image_url: string;
  position: number;
  ai_provider: string | null;
  ai_model: string | null;
  ai_quality: string | null;
  ai_size: string | null;
  ai_input_tokens: number | null;
  ai_input_text_tokens: number | null;
  ai_input_image_tokens: number | null;
  ai_output_tokens: number | null;
  ai_cost_usd: number | string | null;
  ai_pricing_version: string | null;
  created_at: string;
}

export interface PhotoShoot {
  id: number;
  product_id: number;
  variant_id: number | null;
  status: PhotoShootStatus;
  error_message: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  ai_processed_at: string | null;
  product_designation: string;
  product_image_url: string | null;
  variant_name: string | null;
  variant_reference: string | null;
  originals: PhotoShootImage[];
  processed: PhotoShootImage[];
}

export interface PhotoShootStatusCounts {
  history_total: number;
  pending: number;
  processing: number;
  processed: number;
  error: number;
  attached: number;
}

export type ManualProductImageStatus = 'missing' | 'present';

export interface ManualProductPhoto {
  id: number;
  product_id: number;
  image_url: string;
  position: number;
  status: 'uploaded' | 'attached';
  created_at: string;
  attached_at: string | null;
}

export interface ManualPhotoProduct {
  id: number;
  reference: string;
  designation: string;
  image_url: string | null;
  gallery_count: number;
  manual_photos: ManualProductPhoto[];
}

export interface ManualPhotoProductsResponse {
  data: ManualPhotoProduct[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ManualPhotoBatchUnmatchedFile {
  filename: string;
  reference: string;
  reason: string;
}

export interface ManualPhotoBatchProduct {
  product_id: number;
  reference: string;
  photos: ManualProductPhoto[];
}

export interface ManualPhotoBatchResponse {
  ok: boolean;
  total: number;
  uploaded: number;
  products: ManualPhotoBatchProduct[];
  unmatched: ManualPhotoBatchUnmatchedFile[];
}

const productPhotosApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPhotoShoots: builder.query<
      PhotoShoot[],
      { status?: string; q?: string; sortBy?: 'capture' | 'ai'; sortOrder?: 'asc' | 'desc' } | void
    >({
      query: (params) => ({
        url: '/product-photos/shoots',
        params: params || undefined,
      }),
      providesTags: ['PhotoShoot'],
    }),

    getPhotoShootStatusCounts: builder.query<PhotoShootStatusCounts, { q?: string } | void>({
      query: (params) => ({
        url: '/product-photos/shoots/status-counts',
        params: params || undefined,
      }),
      providesTags: ['PhotoShoot'],
    }),

    getManualPhotoProducts: builder.query<
      ManualPhotoProductsResponse,
      { q?: string; imageStatus: ManualProductImageStatus; page: number; limit: number }
    >({
      query: (params) => ({
        url: '/product-photos/manual-products',
        params,
      }),
      providesTags: ['Product'],
    }),

    createPhotoShoot: builder.mutation<PhotoShoot, FormData>({
      query: (body) => ({
        url: '/product-photos/shoots',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PhotoShoot'],
    }),

    addPhotoShootImages: builder.mutation<PhotoShoot, { shootId: number; body: FormData }>({
      query: ({ shootId, body }) => ({
        url: `/product-photos/shoots/${shootId}/images`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PhotoShoot'],
    }),

    deletePhotoShoot: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/product-photos/shoots/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['PhotoShoot'],
    }),

    deletePhotoImage: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/product-photos/images/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['PhotoShoot'],
    }),

    processPhotoShoots: builder.mutation<{ ok: boolean; processing: number[] }, ProcessPhotoShootsRequest>({
      query: (body) => ({
        url: '/product-photos/process',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PhotoShoot'],
    }),

    reprocessPhotoImage: builder.mutation<
      { ok: boolean; processing: number[]; imageId: number },
      { shootId: number; imageId: number; model: AiImageModel; quality: AiImageQuality }
    >({
      query: ({ shootId, imageId, model, quality }) => ({
        url: `/product-photos/shoots/${shootId}/images/${imageId}/reprocess`,
        method: 'POST',
        body: { model, quality },
      }),
      invalidatesTags: ['PhotoShoot'],
    }),

    reorderPhotoImages: builder.mutation<PhotoShoot, { shootId: number; imageIds: number[] }>({
      query: ({ shootId, imageIds }) => ({
        url: `/product-photos/shoots/${shootId}/order`,
        method: 'PUT',
        body: { imageIds },
      }),
      invalidatesTags: ['PhotoShoot'],
    }),

    attachPhotoShoot: builder.mutation<
      { ok: boolean; attached: number; main_image_url: string; shoot: PhotoShoot },
      { shootId: number; imageIds?: number[] }
    >({
      query: ({ shootId, imageIds }) => ({
        url: `/product-photos/shoots/${shootId}/attach`,
        method: 'POST',
        body: imageIds?.length ? { imageIds } : {},
      }),
      invalidatesTags: ['PhotoShoot', 'Product'],
    }),

    attachManualProductPhotos: builder.mutation<
      { ok: boolean; attached: number; product: ManualPhotoProduct },
      { productId: number; imageIds: number[] }
    >({
      query: ({ productId, imageIds }) => ({
        url: `/product-photos/manual-products/${productId}/attach`,
        method: 'POST',
        body: { imageIds },
      }),
      invalidatesTags: ['Product', 'PhotoShoot'],
    }),

    uploadManualProductPhotos: builder.mutation<
      { ok: boolean; uploaded: number; photos: ManualProductPhoto[] },
      { productId: number; body: FormData }
    >({
      query: ({ productId, body }) => ({
        url: `/product-photos/manual-products/${productId}/images`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),

    uploadManualProductPhotosBatch: builder.mutation<ManualPhotoBatchResponse, FormData>({
      query: (body) => ({
        url: '/product-photos/manual-products/images/batch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),

    deleteManualProductPhoto: builder.mutation<{ ok: boolean }, number>({
      query: (imageId) => ({
        url: `/product-photos/manual-images/${imageId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Product'],
    }),

    rejectManualProductPhoto: builder.mutation<
      { ok: boolean; product_id: number; image_id: number },
      number
    >({
      query: (imageId) => ({
        url: `/product-photos/manual-images/${imageId}/reject`,
        method: 'POST',
      }),
      invalidatesTags: ['Product', 'PhotoShoot'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetPhotoShootsQuery,
  useGetPhotoShootStatusCountsQuery,
  useGetManualPhotoProductsQuery,
  useCreatePhotoShootMutation,
  useAddPhotoShootImagesMutation,
  useDeletePhotoShootMutation,
  useDeletePhotoImageMutation,
  useProcessPhotoShootsMutation,
  useReprocessPhotoImageMutation,
  useReorderPhotoImagesMutation,
  useAttachPhotoShootMutation,
  useAttachManualProductPhotosMutation,
  useUploadManualProductPhotosMutation,
  useUploadManualProductPhotosBatchMutation,
  useDeleteManualProductPhotoMutation,
  useRejectManualProductPhotoMutation,
} = productPhotosApi;

export default productPhotosApi;
