import { api } from './apiSlice';

export type PhotoShootStatus = 'pending' | 'processing' | 'processed' | 'attached' | 'error';
export type AiImageModel = 'gpt-image-2' | 'gpt-image-1.5' | 'gpt-image-1-mini';
export type AiImageQuality = 'low' | 'medium' | 'high';

export interface ProcessPhotoShootsRequest {
  shootIds: number[];
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
  product_designation: string;
  product_image_url: string | null;
  variant_name: string | null;
  variant_reference: string | null;
  originals: PhotoShootImage[];
  processed: PhotoShootImage[];
}

const productPhotosApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPhotoShoots: builder.query<PhotoShoot[], { status?: string; q?: string } | void>({
      query: (params) => ({
        url: '/product-photos/shoots',
        params: params || undefined,
      }),
      providesTags: ['PhotoShoot'],
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
  }),
  overrideExisting: false,
});

export const {
  useGetPhotoShootsQuery,
  useCreatePhotoShootMutation,
  useAddPhotoShootImagesMutation,
  useDeletePhotoShootMutation,
  useDeletePhotoImageMutation,
  useProcessPhotoShootsMutation,
  useReorderPhotoImagesMutation,
  useAttachPhotoShootMutation,
} = productPhotosApi;

export default productPhotosApi;
