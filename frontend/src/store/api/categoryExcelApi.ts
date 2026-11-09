import { api } from './apiSlice';

export interface CategoryExcelRow {
  sheet: string;
  row: number;
  product: string;
  variant: string;
  productId?: number;
  current: string | null;
  target: string;
  changed?: boolean;
  reason?: string;
}

export interface CategoryExcelPreview {
  totalRows: number;
  recognized: CategoryExcelRow[];
  unknownProducts: CategoryExcelRow[];
  unknownCategories: CategoryExcelRow[];
  updates: number;
  token: string;
}

function upload(file: File, token?: string) {
  const body = new FormData();
  body.append('file', file);
  if (token) body.append('token', token);
  return body;
}

const categoryExcelApi = api.injectEndpoints({
  endpoints: builder => ({
    previewCategoryExcel: builder.mutation<CategoryExcelPreview, File>({
      query: file => ({ url: '/category-excel/preview', method: 'POST', body: upload(file) }),
    }),
    applyCategoryExcel: builder.mutation<{ updated: number }, { file: File; token: string }>({
      query: ({ file, token }) => ({ url: '/category-excel/apply', method: 'POST', body: upload(file, token) }),
      invalidatesTags: result => result?.updated ? ['Product', 'Category'] : [],
    }),
  }),
});

export const { usePreviewCategoryExcelMutation, useApplyCategoryExcelMutation } = categoryExcelApi;
