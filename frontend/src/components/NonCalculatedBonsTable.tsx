import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatDateDMY } from '../utils/dateUtils';

interface NonCalculatedBonsTableProps {
  bons: any[];
  contactType: 'client' | 'fournisseur';
}

const NonCalculatedBonsTable: React.FC<NonCalculatedBonsTableProps> = ({
  bons,
  contactType
}) => {
  if (bons.length === 0) {
    return null;
  }

  const formatCurrency = (amount: number | string) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'MAD',
    }).format(num);
  };

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="text-orange-500" size={18} />
        <h4 className="font-medium text-orange-800">
          Bons Non Calculés - {contactType === 'client' ? 'Client' : 'Fournisseur'} ({bons.length})
        </h4>
      </div>
      
      <p className="text-sm text-orange-700 mb-3">
        Ces bons sont exclus des calculs de solde et de mouvement.
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-orange-200 rounded">
          <thead className="bg-orange-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider border-b">
                N° Bon
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider border-b">
                Type
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider border-b">
                Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider border-b">
                Statut
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-orange-700 uppercase tracking-wider border-b">
                Montant Total
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider border-b">
                Remarque
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-orange-100">
            {bons.map((bon) => (
              <tr key={bon.id} className="hover:bg-orange-50">
                <td className="px-3 py-2 text-sm font-medium text-gray-900">
                  {bon.numero || bon.id}
                </td>
                <td className="px-3 py-2 text-sm text-gray-700">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    bon.type === 'Sortie' ? 'bg-blue-100 text-blue-700' :
                    bon.type === 'Comptant' ? 'bg-green-100 text-green-700' :
                    bon.type === 'Commande' ? 'bg-purple-100 text-purple-700' :
                    bon.type === 'Avoir' ? 'bg-orange-100 text-orange-700' :
                    bon.type === 'AvoirFournisseur' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {bon.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm text-gray-700">
                  {formatDateDMY(bon.date_creation || bon.created_at)}
                </td>
                <td className="px-3 py-2 text-sm">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    bon.statut === 'Validé' ? 'bg-green-100 text-green-700' :
                    bon.statut === 'En attente' ? 'bg-yellow-100 text-yellow-700' :
                    bon.statut === 'Annulé' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {bon.statut || 'Non défini'}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm text-right font-medium text-gray-900">
                  {formatCurrency(bon.montant_total || 0)}
                </td>
                <td className="px-3 py-2 text-sm text-gray-600">
                  Bon marqué comme non calculé
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default NonCalculatedBonsTable;