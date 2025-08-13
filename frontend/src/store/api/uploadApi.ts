import { apiSlice } from './apiSlice';

export const uploadApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    uploadPaymentImage: builder.mutation<
      { success: boolean; imageUrl: string; filename: string; message: string },
      File
    >({
      query: (imageFile) => {
        const formData = new FormData();
        formData.append('image', imageFile);
        
        return {
          url: '/upload/payment-image',
          method: 'POST',
          body: formData,
        };
      },
    }),
    
    deletePaymentImage: builder.mutation<
      { success: boolean; message: string },
      string
    >({
      query: (filename) => ({
        url: `/upload/payment-image/${filename}`,
        method: 'DELETE',
      }),
    }),
  }),
});

export const {
  useUploadPaymentImageMutation,
  useDeletePaymentImageMutation,
} = uploadApi;
