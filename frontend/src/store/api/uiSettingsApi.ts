import { api } from './apiSlice';

export type UiLineStyleConfig = {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  badgeBgColor: string;
  badgeTextColor: string;
};

export type UiSettings = {
  lineStyles: Record<string, UiLineStyleConfig>;
  toggles: {
    showEcommerceBons: boolean;
  };
};

export const uiSettingsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getUiSettings: builder.query<UiSettings, void>({
      query: () => ({ url: '/ui-settings' }),
      providesTags: ['UiSettings'],
    }),
    updateUiSettings: builder.mutation<UiSettings, UiSettings>({
      query: (body) => ({
        url: '/ui-settings',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['UiSettings'],
    }),
  }),
});

export const {
  useGetUiSettingsQuery,
  useUpdateUiSettingsMutation,
} = uiSettingsApi;
