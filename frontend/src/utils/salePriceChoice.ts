// Le mode de saisie reste explicite même lorsque le montant rejoint une suggestion.
export type SalePriceChoice = { kind: 'keep' } | { kind: 'price'; value: number; custom?: true };

export function salePriceCorrectionAction(
  decision: { pv1?: SalePriceChoice; pv2?: SalePriceChoice },
  applyToAllVariants = false,
): 'apply' | 'confirm' {
  // Une valeur affichée peut venir du produit parent alors que la variante et
  // ses snapshots sont à zéro. Tout choix de prix explicite doit être écrit.
  return !applyToAllVariants && decision.pv1?.kind === 'keep' && decision.pv2?.kind === 'keep'
    ? 'confirm'
    : 'apply';
}

export function isCustomPriceChoice(
  choice: SalePriceChoice | undefined,
  candidates: readonly { price: number }[],
): boolean {
  return choice?.kind === 'price' && (choice.custom === true
    || !candidates.some((candidate) => Math.abs(choice.value - candidate.price) < 0.005));
}
