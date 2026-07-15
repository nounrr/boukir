import { api } from './apiSlice';

export type ProductNameCorrectionStatus =
  | 'matched'
  | 'variant_no_match'
  | 'product_no_match'
  | 'ambiguous'
  | 'not_checked';

export interface ProductNameCorrectionRow {
  id: number;
  row_index: number;
  reference: string | null;
  ref_variant: string | null;
  variante_originale: string | null;
  variante_fr_pro: string | null;
  variante_ar_pro: string | null;
  ancienne_designation: string | null;
  designation_fr_pro: string | null;
  designation_ar_pro: string | null;
  statut_controle: string | null;
  note_controle: string | null;
  image: string | null;
  matched_product_id: number | null;
  matched_variant_id: number | null;
  product_categorie_id: number | null;
  is_variant_row: boolean;
  match_status: ProductNameCorrectionStatus;
  match_message: string | null;
  is_checked: boolean;
  review_status: 'initial' | 'correct' | 'false';
  applied_at: string | null;
  can_apply: boolean;
}

export interface ProductNameCorrectionSummary {
  total: number;
  matched: number;
  issues: number;
  checked: number;
  initial: number;
  correct: number;
  false_count: number;
  ready_apply: number;
  applied: number;
}

export interface ProductNameCorrectionMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const productNameCorrectionsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProductNameCorrections: builder.query<
      { rows: ProductNameCorrectionRow[]; summary: ProductNameCorrectionSummary; meta: ProductNameCorrectionMeta },
      { status?: string; review_status?: string; q?: string; page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/product-name-corrections',
        params: params || undefined,
      }),
      providesTags: ['ProductNameCorrection'],
    }),

    uploadProductNameCorrections: builder.mutation<{ ok: boolean; imported: number }, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);
        return {
          url: '/product-name-corrections/upload',
          method: 'POST',
          body,
        };
      },
      invalidatesTags: ['ProductNameCorrection'],
    }),

    rematchProductNameCorrections: builder.mutation<{ ok: boolean; checked: number }, void>({
      query: () => ({
        url: '/product-name-corrections/rematch',
        method: 'POST',
      }),
      invalidatesTags: ['ProductNameCorrection'],
    }),

    setProductNameCorrectionChecked: builder.mutation<
      { ok: boolean; id: number; checked: boolean },
      { id: number; checked: boolean }
    >({
      query: ({ id, checked }) => ({
        url: `/product-name-corrections/${id}/check`,
        method: 'PATCH',
        body: { checked },
      }),
      invalidatesTags: ['ProductNameCorrection'],
    }),

    bulkSetProductNameCorrectionsChecked: builder.mutation<
      { ok: boolean; checked: boolean; updated: number },
      { ids: number[]; checked: boolean }
    >({
      query: (body) => ({
        url: '/product-name-corrections/bulk/check',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['ProductNameCorrection'],
    }),

    applyProductNameCorrections: builder.mutation<
      { ok: boolean; rows: number; productsUpdated: number; variantsUpdated: number },
      { ids?: number[] } | void
    >({
      query: (body) => ({
        url: '/product-name-corrections/apply',
        method: 'POST',
        body: body || {},
      }),
      invalidatesTags: ['ProductNameCorrection', 'Product'],
    }),

    updateProductCorrectionCategory: builder.mutation<
      { ok: boolean; productId: number; categoryId: number | null },
      { productId: number; categoryId: number | null }
    >({
      query: ({ productId, categoryId }) => ({
        url: `/product-name-corrections/products/${productId}/category`,
        method: 'PATCH',
        body: { category_id: categoryId },
      }),
      invalidatesTags: ['Product'],
    }),
  }),
});

export const {
  useGetProductNameCorrectionsQuery,
  useUploadProductNameCorrectionsMutation,
  useRematchProductNameCorrectionsMutation,
  useSetProductNameCorrectionCheckedMutation,
  useBulkSetProductNameCorrectionsCheckedMutation,
  useApplyProductNameCorrectionsMutation,
  useUpdateProductCorrectionCategoryMutation,
} = productNameCorrectionsApi;
