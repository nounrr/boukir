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

export interface StatsDetailsQuery {
  mode: 'produits' | 'clients';
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  includeVentes: boolean;
  includeCommandes: boolean;
  includeAvoirs: boolean;
  useClientCondition: boolean;
  selectedProductId?: string;
  selectedClientId?: string;
}

export interface StatsDetailsResponse {
  rows: any[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  totals: { totalVentes: number; totalQuantite: number; totalMontant: number; totalProfit: number };
  options: {
    products: Array<{ value: string; label: string }>;
    clients: Array<{ value: string; label: string }>;
  };
  counts: {
    ventes: { total: number; filtered: number };
    commandes: { total: number; filtered: number };
    avoirs: { total: number; filtered: number };
  };
}

export interface DashboardSummaryResponse {
  stats: {
    employees: number;
    products: number;
    orders: number;
    lowStock: number;
    pendingOrders: number;
    talonDueSoon: number;
  };
  recentActivity: Array<{
    type: string;
    message: string;
    time: string;
    color: string;
    priority: 'critical' | 'high' | 'medium' | string;
  }>;
}

export const statsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardSummary: builder.query<DashboardSummaryResponse, void>({
      query: () => '/stats/dashboard-summary',
      providesTags: ['Bon', 'Product'],
    }),

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

    getStatsDetails: builder.query<StatsDetailsResponse, StatsDetailsQuery>({
      query: (args) => {
        const params = new URLSearchParams();
        params.set('mode', args.mode);
        params.set('page', String(args.page));
        params.set('pageSize', String(args.pageSize));
        if (args.dateFrom) params.set('dateFrom', args.dateFrom);
        if (args.dateTo) params.set('dateTo', args.dateTo);
        params.set('includeVentes', String(args.includeVentes));
        params.set('includeCommandes', String(args.includeCommandes));
        params.set('includeAvoirs', String(args.includeAvoirs));
        params.set('useClientCondition', String(args.useClientCondition));
        if (args.selectedProductId) params.set('selectedProductId', args.selectedProductId);
        if (args.selectedClientId) params.set('selectedClientId', args.selectedClientId);
        return `/stats/details?${params.toString()}`;
      },
      providesTags: ['Bon', 'Product', 'Contact'],
    }),
  }),
});

export const {
  useGetDashboardSummaryQuery,
  useGetChiffreAffairesStatsQuery,
  useGetChiffreAffairesDetailQuery,
  useGetStatsDetailsQuery,
} = statsApi;
