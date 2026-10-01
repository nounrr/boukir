import type { Category } from '../types';

export const CATEGORY_IMAGE_ESTIMATE_USD = 0.053;

export function categoryImageCostLabel(category: Category): string | null {
  if (!category.ai_image_model || category.ai_image_cost_usd == null) return null;
  const cost = Number(category.ai_image_cost_usd);
  if (!Number.isFinite(cost)) return null;
  const amount = `${cost.toFixed(4)} USD`;
  return Number(category.ai_image_cost_estimated) === 1 ? `Coût IA estimé : ${amount}` : `Coût IA : ${amount}`;
}
