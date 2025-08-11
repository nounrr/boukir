import React, { useState } from 'react';
import type { Contact } from '../types';
import { showSuccess, showError } from '../utils/notifications';
import { useGetClientsQuery } from '../store/api/contactsApi';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { api } from '../store/api/apiSlice';

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
  const { user } = useSelector((state: RootState) => state.auth);
  const { data: clients = [] } = useGetClientsQuery();

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

  // Transformer le devis en bon comptant (créer directement un bon comptant depuis le devis)
  const handleTransformToComptant = async () => {
    try {
      // Le backend ne fournit pas de transformation directe vers Comptant depuis le devis.
      // On crée donc un bon comptant avec les infos du devis.
      const createRes = await fetch('/api/comptant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: `COM${Date.now()}`,
          date_creation: new Date().toISOString().split('T')[0],
          client_id: null, // pas de client
          vehicule_id: null,
          lieu_chargement: devis.lieu_chargement || null,
          montant_total: devis.montant_total,
          statut: 'En attente',
          created_by: user?.id || 1,
          items: (devis.items || []).map((it: any) => ({
            product_id: it.product_id,
            quantite: it.quantite,
            prix_unitaire: it.prix_unitaire,
            remise_pourcentage: it.remise_pourcentage || 0,
            remise_montant: it.remise_montant || 0,
            total: it.total,
          }))
        })
      });

      if (!createRes.ok) throw new Error('Création du bon comptant échouée');
      const comp = await createRes.json();
  showSuccess(`Devis transformé en bon comptant (${comp?.numero})`);
  dispatch(api.util.invalidateTags(['Devis', 'Comptant']));
      
      if (onTransformComplete) {
        onTransformComplete();
      }
      
      onClose();
    } catch (error: any) {
      showError(`Erreur lors de la transformation: ${error.message}`);
    }
  };

  // Transformer le devis en bon de sortie (avec sélection client)
  const handleTransformToSortie = async () => {
    if (!selectedClientForSortie) {
      alert('Veuillez sélectionner un client');
      return;
    }

    try {
      const response = await fetch(`/api/devis/${devis.id}/transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          created_by: user?.id || 1,
          target: 'sortie',
          client_id: Number(selectedClientForSortie)
        })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la transformation');
      }

      const result = await response.json();
      
  showSuccess(`Devis transformé en bon de sortie avec succès! (${result.sortie_numero || result.numero})`);
  dispatch(api.util.invalidateTags(['Devis', 'Sortie']));
      
      if (onTransformComplete) {
        onTransformComplete();
      }
      
      onClose();
    } catch (error: any) {
      showError(`Erreur lors de la transformation: ${error.message}`);
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
        Sélectionner un client et transformer en Bon de Sortie
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
