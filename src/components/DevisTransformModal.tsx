import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateBon } from '../store/slices/bonsSlice';
import type { Contact } from '../types';
import { showSuccess } from '../utils/notifications';
import { generateBonReference } from '../utils/referenceUtils';
import type { RootState } from '../store';

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
  const dispatch = useDispatch();
  const clients = useSelector((state: RootState) => 
    state.contacts?.contacts?.filter((c: Contact) => c.type === 'Client') || []
  );

  const [transformationType, setTransformationType] = useState<'choice' | 'sortie'>('choice'); // 'choice' pour le choix initial, 'sortie' pour le select client
  const [selectedClientForSortie, setSelectedClientForSortie] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  if (!isOpen || !devis) return null;

  // Filtrer les clients selon la recherche
  const filteredClients = clients.filter((client: Contact) => {
    const searchTermLower = clientSearchTerm.toLowerCase();
    return (
      client.nom_complet?.toLowerCase().includes(searchTermLower) ||
      client.reference?.toLowerCase().includes(searchTermLower) ||
      client.telephone?.toLowerCase().includes(searchTermLower)
    );
  });

  // Transformer le devis en bon comptant
  const handleTransformToComptant = () => {
    const transformedBon = {
      ...devis,
      type: 'Comptant',
      statut: 'Validé',
      is_transformed: true,
      date_validation: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      numero: generateBonReference('Comptant')
    };

    dispatch(updateBon(transformedBon));
    showSuccess('Devis transformé en bon comptant avec succès!');
    
    if (onTransformComplete) {
      onTransformComplete();
    }
    
    onClose();
  };

  // Transformer le devis en bon de sortie
  const handleTransformToSortie = () => {
    if (!selectedClientForSortie) {
      alert('Veuillez sélectionner un client');
      return;
    }

    const client = clients.find((c: Contact) => c.id.toString() === selectedClientForSortie);
    
    const transformedBon = {
      ...devis,
      type: 'Sortie',
      statut: 'Validé',
      is_transformed: true,
      client_id: Number(selectedClientForSortie),
      client_nom: client?.nom_complet || 'Client inconnu',
      date_validation: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      numero: generateBonReference('Sortie')
    };

    dispatch(updateBon(transformedBon));
    showSuccess('Devis transformé en bon de sortie avec succès!');
    
    if (onTransformComplete) {
      onTransformComplete();
    }
    
    onClose();
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
              <p><strong>Montant :</strong> {devis.montant_total?.toFixed(2)} DH</p>
            </div>
          </div>

          {/* Étape 1: Choix du type de transformation */}
          {transformationType === 'choice' && (
            <div className="space-y-3">
              <p className="text-gray-600 mb-4">Choisissez le type de transformation :</p>
              
              <button
                onClick={handleTransformToComptant}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Transformer en Bon Comptant
              </button>

              <button
                onClick={() => setTransformationType('sortie')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Transformer en Bon de Sortie
              </button>
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
                    setClientSearchTerm('');
                    setShowClientDropdown(false);
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ← Retour
                </button>
                <span className="text-gray-600">Sélectionner un client</span>
              </div>

              {/* Select avec recherche */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher et sélectionner un client..."
                  value={clientSearchTerm}
                  onChange={(e) => {
                    setClientSearchTerm(e.target.value);
                    if (selectedClientForSortie) {
                      setSelectedClientForSortie(''); // Reset selection when typing
                    }
                    setShowClientDropdown(true);
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                {/* Bouton clear */}
                {clientSearchTerm && (
                  <button
                    onClick={() => {
                      setClientSearchTerm('');
                      setSelectedClientForSortie('');
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                )}
                
                {/* Dropdown */}
                {showClientDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client: Contact) => (
                        <button
                          key={client.id}
                          type="button"
                          className={`w-full text-left px-4 py-2 cursor-pointer hover:bg-gray-100 ${
                            selectedClientForSortie === client.id.toString() ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => {
                            setSelectedClientForSortie(client.id.toString());
                            setClientSearchTerm(client.nom_complet || '');
                            setShowClientDropdown(false);
                          }}
                        >
                          <div className="font-medium">{client.nom_complet}</div>
                          <div className="text-sm text-gray-600">{client.reference} • {client.telephone}</div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500">Aucun client trouvé</div>
                    )}
                  </div>
                )}
              </div>
              
              <button
                onClick={handleTransformToSortie}
                disabled={!selectedClientForSortie}
                className={`w-full px-4 py-2 rounded-md text-white transition-colors ${
                  selectedClientForSortie 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                Transformer en Bon de Sortie
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
