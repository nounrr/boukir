import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import BonFormModal from '../components/BonFormModal';
import { showSuccess } from '../utils/notifications';
import { getBonNumeroDisplay } from '../utils/numero';

// Types acceptés par BonFormModal (création uniquement). Aligné sur la prop currentTab du modal.
type CreateTab =
  | 'Commande'
  | 'Sortie'
  | 'Comptant'
  | 'Charge'
  | 'AvoirCharge'
  | 'Avoir'
  | 'AvoirComptant'
  | 'AvoirFournisseur'
  | 'AvoirEcommerce'
  | 'Devis'
  | 'Vehicule'
  | 'Ecommerce';

// Onglets "virtuels" de la liste -> type réel utilisé par le formulaire (même mapping que BonsPage.normalizeBonTab)
const normalizeTab = (tab: string): CreateTab => {
  if (tab === 'ComptantNonPaye') return 'Comptant';
  if (tab === 'VendreFournisseur') return 'Sortie';
  if (tab === 'AvoirVendreFournisseur') return 'Avoir';
  return tab as CreateTab;
};

/**
 * Page dédiée à la CRÉATION d'un bon / avoir.
 * Extraite de BonsPage pour éviter que le formulaire (lourd) soit monté
 * par-dessus le tableau des bons (lag / crash). La logique du formulaire
 * reste 100% celle de BonFormModal, qui s'affiche ici en plein écran.
 */
const BonCreatePage = () => {
  const navigate = useNavigate();
  const { type } = useParams<{ type: string }>();
  const location = useLocation();

  const currentTab = useMemo(() => normalizeTab(type || 'Commande'), [type]);

  // Pour les onglets "non payé" / "vendre fournisseur", on reproduit le comportement de BonsPage.
  const isUnpaidComptantTab = type === 'ComptantNonPaye';
  const defaultVendreAuFournisseur =
    type === 'VendreFournisseur' || type === 'AvoirVendreFournisseur';

  // Valeurs initiales optionnelles (ex: avoir e-commerce pré-rempli depuis une commande).
  const initialValues = (location.state as any)?.initialValues || undefined;

  // Force un montage propre du formulaire (état vierge).
  const [bonFormKey] = useState(() => Date.now());

  const goBackToList = useCallback(() => {
    navigate('/bons', { replace: true });
  }, [navigate]);

  const handleBonAdded = useCallback(
    (newBon: any) => {
      const labelTab = String(newBon?.type || currentTab);
      showSuccess(`${labelTab} ${getBonNumeroDisplay(newBon)} créé avec succès!`);
      // La mutation createBon (dans BonFormModal) invalide déjà le cache RTK Query 'Bon',
      // la liste se rafraîchira automatiquement au retour.
      goBackToList();
    },
    [currentTab, goBackToList]
  );

  return (
    <BonFormModal
      key={bonFormKey}
      isOpen={true}
      onClose={goBackToList}
      currentTab={currentTab as any}
      comptantPartialPaymentMode={isUnpaidComptantTab ? 'required' : 'hidden'}
      defaultVendreAuFournisseur={defaultVendreAuFournisseur}
      initialValues={initialValues}
      onBonAdded={handleBonAdded}
    />
  );
};

export default BonCreatePage;
