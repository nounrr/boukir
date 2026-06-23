import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BonFormModal from '../components/BonFormModal';
import ChargeEditFormModal from '../components/ChargeEditFormModal';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { showSuccess } from '../utils/notifications';
import { getBonNumeroDisplay } from '../utils/numero';

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

const normalizeTab = (tab: string): CreateTab => {
  if (tab === 'ComptantNonPaye') return 'Comptant';
  if (tab === 'VendreFournisseur') return 'Sortie';
  if (tab === 'AvoirVendreFournisseur') return 'Avoir';
  return tab as CreateTab;
};

const BonCreatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { type, id } = useParams<{ type: string; id?: string }>();

  const currentTab = useMemo(() => normalizeTab(type || 'Commande'), [type]);
  const isEditMode = Boolean(id);
  const isUnpaidComptantTab = type === 'ComptantNonPaye';
  const defaultVendreAuFournisseur =
    type === 'VendreFournisseur' || type === 'AvoirVendreFournisseur';

  const stateInitialValues = (location.state as any)?.initialValues || undefined;
  const returnTab = (location.state as any)?.returnTab || type || currentTab;
  const { data: fallbackBons = [], isLoading: isLoadingFallbackBon } = useGetBonsByTypeQuery(currentTab, {
    skip: !isEditMode || Boolean(stateInitialValues),
  });

  const fallbackInitialValues = useMemo(() => {
    if (!isEditMode || !id) return undefined;
    return (fallbackBons as any[]).find((bon: any) => String(bon?.id) === String(id));
  }, [fallbackBons, id, isEditMode]);

  const initialValues = stateInitialValues || fallbackInitialValues;
  const [bonFormKey] = useState(() => Date.now());

  const goBackToList = useCallback(() => {
    navigate(`/bons?tab=${encodeURIComponent(returnTab)}`, { replace: true });
  }, [navigate, returnTab]);

  const handleBonAdded = useCallback(
    (newBon: any) => {
      const labelTab = String(newBon?.type || currentTab);
      showSuccess(`${labelTab} ${getBonNumeroDisplay(newBon)} ${isEditMode ? 'mis a jour' : 'cree'} avec succes!`);
      goBackToList();
    },
    [currentTab, goBackToList, isEditMode]
  );

  if (isEditMode && !initialValues) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-lg font-semibold text-gray-900">Modification du bon</h1>
          <p className="text-sm text-gray-600">
            {isLoadingFallbackBon ? 'Chargement du bon...' : 'Bon introuvable.'}
          </p>
          {!isLoadingFallbackBon && (
            <button
              type="button"
              onClick={goBackToList}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Retour aux bons
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isEditMode && currentTab === 'Charge') {
    return (
      <ChargeEditFormModal
        key={`charge-edit-${bonFormKey}`}
        isOpen={true}
        onClose={goBackToList}
        initialValues={initialValues}
        onBonAdded={handleBonAdded}
      />
    );
  }

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
