import { apiSlice } from './apiSlice';

export type StatsFilterType = 'all' | 'day' | 'period' | 'month';

export interface ChiffreAffairesDayRow {
  date: string;
  chiffreAffaires: number;
  chiffreAffairesAchat: number;
  chiffreAffairesAchatBrut: number;
  chiffreAchats: number;
  totalRemises: number;
}

export interface ChiffreAffairesStatsResponse {
  totalChiffreAffaires: number;
  totalChiffreAffairesAchat: number;
  totalChiffreAchats: number;
  totalBons: number;
  dailyData: ChiffreAffairesDayRow[];
  totalRemisesNet: number;
  totalRemisesVente: number;
  totalRemisesAvoirClient: number;
  totalRemisesAvoirComptant: number;
  totalRemisesAvoirEcommerce?: number;
}

export interface ChiffreDetailCalculItem {
  product_id?: number;
  variant_id?: number | null;
  unit_id?: number | null;
  variant_name?: string | null;
  unit_name?: string | null;
  conversion_factor?: number;
  designation: string;
  quantite: number;
  prix_unitaire: number;
  cout_revient?: number;
  prix_achat?: number;
  montant_ligne: number;
  profit?: number;
  remise_unitaire?: number;
  remise_total?: number;
  profitBrut?: number;
}

export interface ChiffreDetailCalcul {
  bonId: number;
  bonNumero: string;
  bonType: string;
  items: ChiffreDetailCalculItem[];
  totalBon: number;
  profitBon?: number;
  totalRemiseBon?: number;
  netTotalBon?: number;
}

export interface ChiffreDetailSection {
  type: 'CA_NET' | 'BENEFICIAIRE' | 'ACHATS';
  title: string;
  total: number;
  bons: Array<{ id: number }>;
  calculs: ChiffreDetailCalcul[];
}

export const statsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getChiffreAffairesStats: builder.query<
      ChiffreAffairesStatsResponse,
      { filterType: StatsFilterType; date?: string; startDate?: string; endDate?: string; month?: string }
    >({
      query: (args) => {
        const params = new URLSearchParams();
        params.set('filterType', args.filterType);
        if (args.date) params.set('date', args.date);
        if (args.startDate) params.set('startDate', args.startDate);
        if (args.endDate) params.set('endDate', args.endDate);
        if (args.month) params.set('month', args.month);
        return `/stats/chiffre-affaires?${params.toString()}`;
      },
    }),

    getChiffreAffairesDetail: builder.query<ChiffreDetailSection[], { date: string }>({
      query: ({ date }) => `/stats/chiffre-affaires/detail/${encodeURIComponent(date)}`,
    }),
  }),
});

export const { useGetChiffreAffairesStatsQuery, useGetChiffreAffairesDetailQuery } = statsApi;
