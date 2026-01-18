import type { Contact, Bon, Payment } from '../types';

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

  // Statuts autorisés (même logique que le backend)
  const allowedStatuts = ['Validé', 'En attente'];
  const isAllowedStatut = (statut: string | undefined) => {
    if (!statut) return true; // Si pas de statut, on inclut
    return allowedStatuts.includes(statut);
  };

  // Filtrer les bons du contact (incluant avoirs) avec statuts autorisés
  const contactBons = bons.filter((bon: Bon) => {
    // Vérifier le statut
    if (!isAllowedStatut(bon.statut)) return false;
    
    if (typePaiement === 'Fournisseur') {
      return String(bon.fournisseur_id) === String(contact.id) && 
             (bon.type === 'Commande' || bon.type === 'AvoirFournisseur');
    } else {
      return String(bon.client_id) === String(contact.id) && 
             (bon.type === 'Sortie' || bon.type === 'Comptant' || bon.type === 'Avoir');
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
      const isAvoir = bon.type === 'Avoir' || bon.type === 'AvoirFournisseur';
      const montant = Number(bon.montant_total ?? 0);
      return {
        type: 'bon' as const,
        date: bon.date_bon || bon.created_at,
        numero: `${bon.type.substring(0, 2).toUpperCase()}-${bon.numero || bon.id}`,
        typeLabel: bon.type,
        // Avoirs en crédit (réduisent le solde), autres en débit
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
