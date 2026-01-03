// Variant types and suggested values for frontend selects
// Language: French labels and values

export type VariantTypeKey =
  | 'couleur'
  | 'epaisseur'
  | 'volume'
  | 'poids'
  | 'longueur'
  | 'largeur'
  | 'hauteur'
  | 'materiau'
  | 'capacite'
  | 'puissance'
  | 'tension'
  | 'diametre'
  | 'autre';

export interface VariantTypeDefinition {
  label: string;
  values: string[];
}

export const variantTypes: Record<VariantTypeKey, VariantTypeDefinition> = {
  couleur: {
    label: 'Couleur',
    values: [
      'Blanc',
      'Noir',
      'Gris',
      'Rouge',
      'Bleu',
      'Vert',
      'Jaune',
      'Orange',
      'Violet',
      'Marron'
    ],
  },
  epaisseur: {
    label: 'Épaisseur',
    values: ['6mm', '8mm', '10mm', '12mm', '15mm', '18mm', '22mm', '25mm'],
  },
  volume: {
    label: 'Volume',
    values: ['0.75L', '1L', '2.5L', '5L', '10L', '15L', '20L'],
  },
  poids: {
    label: 'Poids',
    values: ['20kg', '25kg', '30kg', '35kg', '40kg'],
  },
  longueur: {
    label: 'Longueur',
    values: ['1m', '2m', '2.5m', '3m', '4m'],
  },
  largeur: {
    label: 'Largeur',
    values: ['10cm', '20cm', '30cm', '60cm', '120cm'],
  },
  hauteur: {
    label: 'Hauteur',
    values: ['5cm', '10cm', '20cm', '30cm'],
  },
  materiau: {
    label: 'Matériau',
    values: ['Acier', 'Bois', 'Aluminium', 'PVC', 'Verre', 'Béton'],
  },
  capacite: {
    label: 'Capacité',
    values: ['1L', '2.5L', '5L', '10L', '15L', '20L'],
  },
  puissance: {
    label: 'Puissance',
    values: ['500W', '1000W', '1500W', '2000W'],
  },
  tension: {
    label: 'Tension',
    values: ['110V', '220V', '380V'],
  },
  diametre: {
    label: 'Diamètre',
    values: ['6mm', '8mm', '10mm', '12mm', '16mm', '20mm'],
  },
  autre: {
    label: 'Autre',
    values: [],
  },
};

export const VARIANT_TYPE_OPTIONS = Object.entries(variantTypes).map(([key, def]) => ({
  key: key as VariantTypeKey,
  label: def.label,
}));

export function getVariantValues(type: VariantTypeKey): string[] {
  return variantTypes[type]?.values ?? [];
}

export function hasPredefinedValues(type: VariantTypeKey): boolean {
  return (variantTypes[type]?.values?.length ?? 0) > 0;
}
