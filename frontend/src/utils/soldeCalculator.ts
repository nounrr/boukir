import type { Contact, Bon, Payment } from '../types';
import { displayBonNumero } from './numero';

/**
 * Convention canonique du solde cumulé (calcul 100% côté front).
 *
 * - Client     : solde_cumule = solde - SUM(ventes) + SUM(paiements) + SUM(avoirs)
 *                 -> NEGATIF = le client nous doit, POSITIF = nous lui devons.
 * - Fournisseur: solde_cumule = solde + SUM(achats) - SUM(paiements) - SUM(avoirs)
 *                 -> POSITIF = nous lui devons, NEGATIF = il nous doit.
 *
 * Cohérent avec le calcul ligne-par-ligne du tableau d'historique
 * (voir ContactsPage.getHistorySoldeDelta).
 */
export interface SoldeTotals {
  type?: Contact['type'] | string | null;
  solde?: number | string | null;
  total_ventes?: number | string | null;
  total_paiements?: number | string | null;
  total_avoirs?: number | string | null;
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function computeContactSoldeCumule(contact: SoldeTotals | null | undefined): number {
  if (!contact) return 0;
  const solde = num(contact.solde);
  const ventes = Math.abs(num(contact.total_ventes));
  const paiements = Math.abs(num(contact.total_paiements));
  const avoirs = Math.abs(num(contact.total_avoirs));
  
  if (contact.type === 'Client') {
    return Number((solde - ventes + paiements + avoirs).toFixed(3));
  }

  return Number((solde + ventes - paiements - avoirs).toFixed(3));
}

/**
 * Variante pour les cartes globales (totaux agrégés sur tous les contacts).
 * Le `type` détermine la convention.
 */
export function computeAggregateSoldeCumule(
  totals: { total_solde?: number; total_ventes?: number; total_paiements?: number; total_avoirs?: number } | null | undefined,
  type: 'Client' | 'Fournisseur',
): number {
  if (!totals) return 0;
  return computeContactSoldeCumule({
    type,
    solde: totals.total_solde,
    total_ventes: totals.total_ventes,
    total_paiements: totals.total_paiements,
    total_avoirs: totals.total_avoirs,
  });
}

/**
 * Calcule l'historique détaillé du solde d'un contact avec tous les bons et paiements
 * Utilise la même logique que ContactsPage et le backend pour garantir la cohérence
 */
export function calculateContactSoldeHistory(
  contact: Contact | undefined,
  bons: Bon[],
  payments: Payment[],
  typePaiement: 'Client' | 'Fournisseur'
) {
  if (!contact) return [];

  const soldeInitial = Number((contact as any)?.solde ?? 0);
  const history: Array<{
    type: 'initial' | 'bon' | 'paiement';
    date: string;
    numero: string;
    typeLabel: string;
    debit: number;
    credit: number;
    soldeCumule: number;
    id: string | number;
    data: any;
  }> = [];

  const norm = (v: any) => String(v ?? '').trim().toLowerCase();

  // Statuts autorisés (même logique que le backend)
  // - Bons backoffice: Validé/En attente (inclure aussi variantes 'valide'/'pending')
  // - Ecommerce: statuts anglais (pending/confirmed/delivered/...) => on exclut seulement cancelled/refunded
  const allowedGeneral = new Set([
    'validé',
    'valide',
    'en attente',
    'attente',
    'pending',
    // Avoirs e-commerce / autres
    'appliqué',
    'applique',
    'payé',
    'paye',
    'livré',
    'livre',
    'envoyé',
    'envoye',
    'accepté',
    'accepte',
    'facturé',
    'facture',
  ]);

  const isAllowedStatut = (statut: string | undefined) => {
    const s = norm(statut);
    if (!s) return true;
    return allowedGeneral.has(s);
  };

  const isAllowedEcommerceStatut = (statut: string | undefined) => {
    const s = norm(statut);
    if (!s) return true;
    return !['cancelled', 'canceled', 'refunded', 'annulé', 'annule'].includes(s);
  };

  const normalizePhone = (p: any) => {
    if (!p) return '';
    const digits = String(p).replace(/\D+/g, '');
    if (!digits) return '';
    return digits.length > 9 ? digits.slice(-9) : digits;
  };

  const contactPhone = normalizePhone((contact as any)?.telephone);
  const contactEmail = String((contact as any)?.email || '').trim().toLowerCase();

  const bonMatchesClient = (bon: Bon) => {
    if (String(bon.client_id || '') === String(contact.id)) return true;

    // Ecommerce linkage: some orders store phone/email/name without client_id
    const bonPhone = normalizePhone((bon as any)?.phone);
    if (contactPhone && bonPhone && contactPhone === bonPhone) return true;

    const bonEmail = String((bon as any)?.customer_email || '').trim().toLowerCase();
    if (contactEmail && bonEmail && contactEmail === bonEmail) return true;

    return false;
  };

  // Filtrer les bons du contact (incluant avoirs) avec statuts autorisés
  const contactBons = bons.filter((bon: Bon) => {
    // Vérifier le statut
    if (bon.type === 'Ecommerce') {
      if (!isAllowedEcommerceStatut(bon.statut)) return false;
      // Align with backend solde logic: include only solde orders in balance history
      if (!((bon as any)?.is_solde)) return false;
    } else {
      if (!isAllowedStatut(bon.statut)) return false;
    }
    
    if (typePaiement === 'Fournisseur') {
      return String(bon.fournisseur_id) === String(contact.id) && 
             (bon.type === 'Commande' || bon.type === 'AvoirFournisseur');
    } else {
      return bonMatchesClient(bon) &&
             (bon.type === 'Sortie' || bon.type === 'Comptant' || bon.type === 'Avoir' || bon.type === 'Ecommerce' || bon.type === 'AvoirEcommerce');
    }
  });

  // Filtrer tous les paiements du contact avec statuts autorisés
  const contactPayments = payments.filter((p: Payment) => {
    // Vérifier le statut
    if (!isAllowedStatut(p.statut)) return false;
    
    return String(p.contact_id) === String(contact.id) &&
      p.type_paiement === typePaiement;
  });

  // Créer les entrées d'historique
  const transactions = [
    ...contactBons.map((bon: Bon) => {
      const isAvoir = bon.type === 'Avoir' || bon.type === 'AvoirFournisseur' || bon.type === 'AvoirComptant' || bon.type === 'AvoirEcommerce';
      const montant = Number(bon.montant_total ?? 0);
      return {
        type: 'bon' as const,
        date: bon.date_bon || bon.created_at,
        numero: displayBonNumero(bon),
        typeLabel: bon.type,
        // Avoirs/Paiements augmentent la dette (logique inverse pour l'affichage/historique ici)
        // Mais selon les consignes: "pour tous les bon doit etre - negative et pour tous les paiment et les avoir doit etre positive"
        // debit/credit sont utilisés dans : soldeCumule = soldeCumule + transaction.debit - transaction.credit;
        // Donc on veut: bons -> solde_cumule + montant. avoirs -> solde_cumule - montant.
        debit: isAvoir ? 0 : montant,
        credit: isAvoir ? montant : 0,
        soldeCumule: 0, // sera calculé après
        id: bon.id,
        data: bon
      };
    }),
    ...contactPayments.map((p: Payment) => ({
      type: 'paiement' as const,
      date: p.date_paiement || p.created_at,
      numero: `PAI-${p.numero || p.id}`,
      typeLabel: p.mode_paiement || 'Paiement',
      debit: 0,
      credit: Number(p.montant ?? p.montant_total ?? 0),
      soldeCumule: 0, // sera calculé après
      id: p.id,
      data: p
    }))
  ];

  // Trier par date chronologique
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Ligne initiale avec solde de départ
  history.push({
    type: 'initial',
    date: '',
    numero: '',
    typeLabel: 'Solde Initial',
    debit: 0,
    credit: 0,
    soldeCumule: soldeInitial,
    id: 'initial',
    data: null
  });

  // Calculer le solde cumulé pour chaque transaction
  let soldeCumule = soldeInitial;
  for (const transaction of transactions) {
    soldeCumule = soldeCumule + transaction.debit - transaction.credit;
    history.push({
      ...transaction,
      soldeCumule
    });
  }

  return history;
}
