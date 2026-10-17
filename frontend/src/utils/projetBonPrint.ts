import type { ProjetBon } from '../store/api/projetsApi';

export interface ProjetPrintContext {
  title: string;
  reference: string;
  projectName: string;
}

export function prepareProjetBonPrint(bon: ProjetBon, projectName: string) {
  const labels = {
    products: { title: 'BON PRODUITS', prefix: 'BP' },
    charge: { title: 'BON CHARGE PRODUIT', prefix: 'BC' },
    charge_materiel: { title: 'BON CHARGE MATÉRIEL', prefix: 'BCM' },
  };
  const label = labels[bon.type];
  return {
    projectContext: { title: label.title, reference: `${label.prefix}-${String(bon.id).padStart(4, '0')}`, projectName },
    bon: {
      ...bon,
      type: bon.type === 'products' ? 'Sortie' : 'Charge',
      date_creation: `${bon.date_bon}T00:00:00`,
      notes: bon.observations || '',
      items: bon.items.map((item) => ({ ...item })),
    },
  };
}
