export const calculateProfitPercentage = (profit?: number | null, base?: number | null): number | null => {
  const numericProfit = Number(profit ?? 0);
  const numericBase = Math.abs(Number(base ?? 0));

  if (!Number.isFinite(numericProfit) || !Number.isFinite(numericBase) || numericBase <= 0.000001) {
    return null;
  }

  return (numericProfit / numericBase) * 100;
};

export const formatProfitPercentage = (value?: number | null): string => {
  if (value == null || !Number.isFinite(value)) return '-';

  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}%`;
};