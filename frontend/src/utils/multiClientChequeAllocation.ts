/** Distribute a cheque in cents in proportion to each selected client's amount due. */
export function distributeCheque(totalCents: number, dueCents: number[]): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 ||
      dueCents.some((due) => !Number.isSafeInteger(due) || due < 0)) {
    return dueCents.map(() => 0);
  }
  const totalDue = dueCents.reduce((sum, due) => sum + due, 0);
  if (totalDue <= 0) return dueCents.map(() => 0);
  if (totalCents >= totalDue) return [...dueCents];

  const raw = dueCents.map((due) => totalCents * due / totalDue);
  const amounts = raw.map((part) => Math.floor(part));
  let remainder = totalCents - amounts.reduce((sum, part) => sum + part, 0);
  const largestFractions = raw.map((part, index) => ({ index, fraction: part - amounts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of largestFractions) {
    if (remainder === 0) break;
    if (amounts[index] < dueCents[index]) {
      amounts[index] += 1;
      remainder -= 1;
    }
  }
  return amounts;
}
