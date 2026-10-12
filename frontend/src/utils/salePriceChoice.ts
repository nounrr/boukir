// Le mode de saisie reste explicite même lorsque le montant rejoint une suggestion.
export type SalePriceChoice = { kind: 'keep' } | { kind: 'price'; value: number; custom?: true };

export function isCustomPriceChoice(
  choice: SalePriceChoice | undefined,
  candidates: readonly { price: number }[],
): boolean {
  return choice?.kind === 'price' && (choice.custom === true
    || !candidates.some((candidate) => Math.abs(choice.value - candidate.price) < 0.005));
}
