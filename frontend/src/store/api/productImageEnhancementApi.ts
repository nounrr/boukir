import { api } from './apiSlice';
import type { AiImageModel, AiImageQuality } from './productPhotosApi';

export type ImageEnhancementTab = 'untreated' | 'treated';
export type ImageEnhancementStatus = 'untreated' | 'processing' | 'error' | 'treated';
export type ImageUsageKind = 'product' | 'product_gallery' | 'variant' | 'variant_gallery';

export interface ImageUsage {
  kind: ImageUsageKind;
  row_id: number;
  product_id: number;
  variant_id: number | null;
  designation: string;
  variant_name: string | null;
}

export interface EnhancementImage {
  url: string;
  usages: ImageUsage[];
  product_id: number;
  status: ImageEnhancementStatus;
  error_message: string | null;
  method: 'manual' | 'ai' | null;
  original_url: string | null;
  ai_model: string | null;
  ai_quality: string | null;
  ai_cost_usd: number | null;
  treated_at: string | null;
}

export interface EnhancementImagesResponse {
  data: EnhancementImage[];
  counts: { untreated: number; treated: number; processing: number };
  meta: { page: number; limit: number; total: number; totalPages: number };
  defaults: { model: AiImageModel; quality: AiImageQuality };
}

export const productImageEnhancementApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getEnhancementImages: builder.query<
      EnhancementImagesResponse,
      { tab: ImageEnhancementTab; page: number; limit: number; q?: string; category_id?: number }
    >({
      query: (params) => ({ url: '/product-image-enhancement/images', params }),
      providesTags: ['ImageEnhancement'],
    }),
    markImagesTreated: builder.mutation<{ success: boolean; marked: number }, { urls: string[] }>({
      query: (body) => ({ url: '/product-image-enhancement/mark', method: 'POST', body }),
      invalidatesTags: ['ImageEnhancement'],
    }),
    unmarkImagesTreated: builder.mutation<
      { success: boolean; unmarked: number; restored: number; failed: Array<{ url: string; message: string }> },
      { urls: string[] }
    >({
      query: (body) => ({ url: '/product-image-enhancement/unmark', method: 'POST', body }),
      invalidatesTags: ['ImageEnhancement', 'Product'],
    }),
    enhanceImages: builder.mutation<
      { success: boolean; queued: number; skipped: number },
      { urls: string[]; model: AiImageModel; quality: AiImageQuality }
    >({
      query: (body) => ({ url: '/product-image-enhancement/enhance', method: 'POST', body }),
      invalidatesTags: ['ImageEnhancement'],
    }),
  }),
});

export const {
  useGetEnhancementImagesQuery,
  useMarkImagesTreatedMutation,
  useUnmarkImagesTreatedMutation,
  useEnhanceImagesMutation,
} = productImageEnhancementApi;
