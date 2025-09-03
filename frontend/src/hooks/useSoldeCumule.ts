import { useMemo } from 'react';
import { useGetClientsQuery, useGetFournisseursQuery } from '../store/api/contactsApi';
import { useGetBonsQuery } from '../store/api/bonsApi';
import { useGetPaymentsQuery } from '../store/api/paymentsApi';

/**
 * Hook personnalisé pour obtenir le solde cumulé d'un contact
 * Les listes utilisent le solde initial, les détails individuels peuvent récupérer solde_cumule via useGetContactQuery
 */
export const useSoldeCumule = () => {
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const { data: bons = [] } = useGetBonsQuery();
  const { data: payments = [] } = useGetPaymentsQuery();

  // Calcul frontend (pour compatibilité et fallback)
  const getContactSoldeFrontend = useMemo(() => {
    return (contactId: number): number => {
      const allContacts = [...clients, ...fournisseurs];
      const contact = allContacts.find(c => c.id === contactId);
      
      if (!contact) return 0;

      const soldeInitial = Number(contact.solde) || 0;

      if (contact.type === 'Client') {
        // Ventes (Sortie + Comptant)
        const ventes = bons
          .filter(bon => bon.client_id === contactId && ['Sortie', 'Comptant'].includes(bon.type) && ['Validé', 'En attente'].includes(bon.statut))
          .reduce((sum, bon) => sum + (Number(bon.montant_total) || 0), 0);

        // Paiements clients
        const paiementsClient = payments
          .filter(payment => payment.contact_id === contactId && payment.type_paiement === 'Client' && payment.statut && ['Validé', 'En attente'].includes(payment.statut))
          .reduce((sum, payment) => sum + (Number(payment.montant) || 0), 0);

        // Avoirs clients
        const avoirsClient = bons
          .filter(bon => bon.client_id === contactId && ['Avoir', 'AvoirComptant'].includes(bon.type) && ['Validé', 'En attente'].includes(bon.statut))
          .reduce((sum, bon) => sum + (Number(bon.montant_total) || 0), 0);

        return soldeInitial + ventes - paiementsClient - avoirsClient;
      } else if (contact.type === 'Fournisseur') {
        // Achats (Commande)
        const achats = bons
          .filter(bon => bon.fournisseur_id === contactId && bon.type === 'Commande' && ['Validé', 'En attente'].includes(bon.statut))
          .reduce((sum, bon) => sum + (Number(bon.montant_total) || 0), 0);

        // Paiements fournisseurs
        const paiementsFournisseur = payments
          .filter(payment => payment.contact_id === contactId && payment.type_paiement === 'Fournisseur' && payment.statut && ['Validé', 'En attente'].includes(payment.statut))
          .reduce((sum, payment) => sum + (Number(payment.montant) || 0), 0);

        // Avoirs fournisseurs
        const avoirsFournisseur = bons
          .filter(bon => bon.fournisseur_id === contactId && bon.type === 'AvoirFournisseur' && ['Validé', 'En attente'].includes(bon.statut))
          .reduce((sum, bon) => sum + (Number(bon.montant_total) || 0), 0);

        return soldeInitial + achats - paiementsFournisseur - avoirsFournisseur;
      }

      return soldeInitial;
    };
  }, [clients, fournisseurs, bons, payments]);

  const getSoldeCumule = useMemo(() => {
    return (contactId: string | number): number => {
      if (!contactId) return 0;
      
      // Utiliser le calcul frontend (les listes n'ont que le solde initial)
      return getContactSoldeFrontend(Number(contactId));
    };
  }, [getContactSoldeFrontend]);

  const getContactSoldeCumule = useMemo(() => {
    return (contact: any): number => {
      if (!contact) return 0;
      
      // Si on a déjà l'objet contact avec solde_cumule (venant de useGetContactQuery)
      if (contact.solde_cumule !== undefined) {
        return Number(contact.solde_cumule);
      }
      
      // Sinon utiliser le calcul frontend
      return getContactSoldeFrontend(contact.id);
    };
  }, [getContactSoldeFrontend]);

  return {
    getSoldeCumule,
    getContactSoldeCumule,
    // Pour compatibilité avec les composants existants
    getContactSolde: getSoldeCumule,
    // Calcul frontend direct
    getContactSoldeFrontend
  };
};

export default useSoldeCumule;
