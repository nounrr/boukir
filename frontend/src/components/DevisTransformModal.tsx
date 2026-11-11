import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { showSuccess, showError } from '../utils/notifications';
import { confirmBonExceptionAuthorization } from '../utils/confirmBonExceptionAuthorization';
import type { RootState } from '../store';
import { useBonContactDirectory } from '../hooks/useBonContactDirectory';
import { bonContactSearchLabel } from '../utils/bonContactSearch';
import SearchableSelect from './SearchableSelect';
import ContactSoldeCumuleHint from './ContactSoldeCumuleHint';
import { useTransformDevisMutation } from '../store/api/bonsApi';

interface DevisTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
  devis: any; // Le devis à transformer
  onTransformComplete?: () => void;
}

const DevisTransformModal: React.FC<DevisTransformModalProps> = ({
  isOpen,
  onClose,
  devis,
  onTransformComplete,
}) => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [transformDevis, { isLoading: isTransforming } ] = useTransformDevisMutation();

  const [transformationType, setTransformationType] = useState<'choice' | 'sortie'>('choice'); // 'choice' pour le choix initial, 'sortie' pour le select client
  const [selectedClientForSortie, setSelectedClientForSortie] = useState('');
  const { clients, isLoading, isError, refetch } = useBonContactDirectory(!isOpen || transformationType !== 'sortie');
  const options = useMemo(() => clients.map(client => ({
    value: String(client.id),
    label: bonContactSearchLabel(client),
  })), [clients]);

  if (!isOpen || !devis) return null;

  // Transformer le devis en bon comptant (sans client spécifique)
  const handleTransformToComptant = async () => {
    try {
      const payload: any = {
        id: devis.id,
        target_type: 'Comptant',
        created_by: user?.id || 1,
      };
      const transformation = await confirmBonExceptionAuthorization(confirmed => transformDevis({
        ...payload, use_exception_authorization: confirmed,
      }).unwrap());
      if (!transformation.saved) return;
      const result = transformation.result;
      
      showSuccess(`Devis transformé en bon comptant avec succès! (${result.numero})`);
      
      if (onTransformComplete) {
        onTransformComplete();
      }
      
      onClose();
    } catch (error: any) {
      showError(error?.data?.message || error?.message || 'Erreur lors de la transformation');
    }
  };

  // Transformer le devis en bon de sortie avec le client du devis
  const handleTransformToSortieWithDevisClient = async () => {
    try {
      const payload: any = {
        id: devis.id,
        target_type: 'Sortie',
        client_id: devis.client_id,
        created_by: user?.id || 1,
      };
      const transformation = await confirmBonExceptionAuthorization(confirmed => transformDevis({
        ...payload, use_exception_authorization: confirmed,
      }).unwrap());
      if (!transformation.saved) return;
      const result = transformation.result;
      
      showSuccess(`Devis transformé en bon de sortie avec succès! (${result.numero})`);
      
      if (onTransformComplete) {
        onTransformComplete();
      }
      
      onClose();
    } catch (error: any) {
      showError(error?.data?.message || error?.message || 'Erreur lors de la transformation');
    }
  };

  // Transformer le devis en bon de sortie
  const handleTransformToSortie = async () => {
    if (!selectedClientForSortie) {
      alert('Veuillez sélectionner un client');
      return;
    }

    try {
      const payload: any = {
        id: devis.id,
        target_type: 'Sortie',
        client_id: parseInt(selectedClientForSortie),
        created_by: user?.id || 1,
      };
      const transformation = await confirmBonExceptionAuthorization(confirmed => transformDevis({
        ...payload, use_exception_authorization: confirmed,
      }).unwrap());
      if (!transformation.saved) return;
      const result = transformation.result;
      
      showSuccess(`Devis transformé en bon de sortie avec succès! (${result.numero})`);
      
      if (onTransformComplete) {
        onTransformComplete();
      }
      
      onClose();
    } catch (error: any) {
      const message = error?.data?.message || error?.message || 'Erreur lors de la transformation';
      showError(`Erreur lors de la transformation: ${message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Transformer le devis
          </h3>
        </div>
        
        <div className="p-6">
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <h5 className="font-medium text-blue-900 mb-2">Devis à transformer :</h5>
            <div className="text-sm text-blue-700">
              <p><strong>Numéro :</strong> {devis.numero}</p>
              <p><strong>Date :</strong> {devis.date_creation}</p>
              <p><strong>Montant :</strong> {Number(devis.montant_total ?? 0).toFixed(2)} DH</p>
            </div>
          </div>

          {/* Étape 1: Choix du type de transformation */}
          {transformationType === 'choice' && (
            <div className="space-y-3">
              <p className="text-gray-600 mb-4">Choisissez le type de transformation :</p>
              
              {/* Si le devis a un client, proposer transformation directe en sortie */}
              {devis.client_id ? (
                <>
                  <button
                    onClick={handleTransformToSortieWithDevisClient}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Transformer en Bon de Sortie (Client actuel)
                  </button>

                  <button
                    onClick={() => setTransformationType('sortie')}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Transformer en Bon de Sortie (Autre client)
                  </button>
                </>
              ) : (
                /* Si le devis n'a pas de client, proposer comptant ou sortie avec choix client */
                <>
                  <button
                    onClick={handleTransformToComptant}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Transformer en Bon Comptant (sans client)
                  </button>

                  <button
                    onClick={() => setTransformationType('sortie')}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Transformer en Bon de Sortie (avec client)
                  </button>
                </>
              )}
            </div>
          )}

          {/* Étape 2: Sélection du client pour bon de sortie */}
          {transformationType === 'sortie' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <button
                  onClick={() => {
                    setTransformationType('choice');
                    setSelectedClientForSortie('');
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ← Retour
                </button>
                <span className="text-gray-600">Sélectionner un client</span>
              </div>

              <SearchableSelect
                options={options}
                value={selectedClientForSortie}
                onChange={setSelectedClientForSortie}
                placeholder={isLoading ? 'Chargement des clients…' : 'Rechercher et sélectionner un client…'}
                autoOpenOnFocus
              />
              {isError && (
                <p className="text-xs text-red-700" role="status">
                  Annuaire indisponible. <button type="button" className="underline" onClick={() => refetch()}>Réessayer</button>
                </p>
              )}
              <ContactSoldeCumuleHint contactId={selectedClientForSortie} contactType="Client" />

              <button
                onClick={handleTransformToSortie}
                disabled={!selectedClientForSortie || isTransforming}
                className={`w-full px-4 py-2 rounded-md text-white transition-colors ${
                  selectedClientForSortie 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {isTransforming ? 'Transformation...' : 'Transformer en Bon de Sortie'}
              </button>
            </div>
          )}

          {/* Bouton Annuler toujours visible */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevisTransformModal;
