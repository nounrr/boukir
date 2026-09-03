export function meetsEmployeeSalePrice(price: number, cost: number): boolean {
  const minimum = Math.ceil((cost * 1.03 - 1e-9) * 100) / 100;
  return Number.isFinite(price) && Number.isFinite(cost) && price > 0 && cost >= 0
    && price + 1e-9 >= minimum;
}
