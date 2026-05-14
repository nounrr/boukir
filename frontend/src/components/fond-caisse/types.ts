export type FondCaisseEntry = {
  id: number;
  montant: number;
  openedAt: string;
  jour: string;
  createdByUserId?: number | null;
  createdByName: string;
  createdAt?: string;
};

export type FondCaisseMouvement = {
  jour: string;
  bonComptantPaye?: number;
  paiementBonComptantNonPaye?: number;
  paiementClientCaisse?: number;
  bonChargeInclusCaisse?: number;
  bonVehicule?: number;
  avoirClient?: number;
  entrees?: number;
  sorties?: number;
};

export type DailyCaisseRow = {
  jour: string;
  entry: FondCaisseEntry | null;
  debut: number;
  entrees: number;
  sorties: number;
  total: number;
  bonComptantPaye: number;
  paiementBonComptantNonPaye: number;
  paiementClientCaisse: number;
  bonChargeInclusCaisse: number;
  bonVehicule: number;
  avoirClient: number;
};

export type FondCaisseAction = {
  id: string;
  sourceTable: string;
  sourceId: number;
  date: string;
  type: string;
  direction: 'ENTREE' | 'SORTIE';
  amount: number;
  signedAmount: number;
  cumulative: number;
  reference: string;
  actor: string;
  statut: string;
  description: string;
};
