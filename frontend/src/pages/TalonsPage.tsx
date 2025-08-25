import React, { useState, useMemo } from 'react';
import { 
  Plus, Edit, Trash2, Search, FileText, User, Phone, Eye
} from 'lucide-react';
import { useGetTalonsQuery, useDeleteTalonMutation } from '../store/api/talonsApi';
import { useGetPaymentsQuery } from '../store/api/paymentsApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';
import TalonFormModal from '../components/TalonFormModal';
import { formatDateTimeWithHour } from '../utils/dateUtils';
import type { Talon } from '../types';

const TalonsPage = () => {
  // États de base
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTalon, setSelectedTalon] = useState<Talon | null>(null);
  const [isPaymentsModalOpen, setIsPaymentsModalOpen] = useState(false);
  const [selectedTalonForPayments, setSelectedTalonForPayments] = useState<Talon | null>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // RTK Query hooks
  const { data: talons = [], isLoading } = useGetTalonsQuery(undefined);
  const { data: payments = [] } = useGetPaymentsQuery();
  const [deleteTalonMutation] = useDeleteTalonMutation();

  // Filtrage des talons
  const filteredTalons = useMemo(() => {
    if (!searchTerm.trim()) return talons;
    
    const term = searchTerm.toLowerCase();
    return talons.filter((talon: Talon) =>
      talon.nom.toLowerCase().includes(term) ||
      (talon.phone && talon.phone.toLowerCase().includes(term))
    );
  }, [talons, searchTerm]);

  // Pagination
  const totalItems = filteredTalons.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTalons = filteredTalons.slice(startIndex, endIndex);

  // Réinitialiser la page lors des changements de filtres
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Fonctions de gestion
  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce talon ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deleteTalonMutation({ id }).unwrap();
        showSuccess('Talon supprimé avec succès');
      } catch (error: any) {
        console.error('Erreur lors de la suppression:', error);
        showError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
      }
    }
  };

  const handleEdit = (talon: Talon) => {
    setSelectedTalon(talon);
    setIsCreateModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedTalon(null);
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setSelectedTalon(null);
  };

  const handleViewPayments = (talon: Talon) => {
    setSelectedTalonForPayments(talon);
    setIsPaymentsModalOpen(true);
  };

  const handleClosePaymentsModal = () => {
    setIsPaymentsModalOpen(false);
    setSelectedTalonForPayments(null);
  };

  // Filtrer les paiements pour le talon sélectionné
  const talonPayments = useMemo(() => {
    if (!selectedTalonForPayments) return [];
    return payments.filter((payment: any) => payment.talon_id === selectedTalonForPayments.id);
  }, [payments, selectedTalonForPayments]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <span className="ml-3 text-gray-600">Chargement des talons...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header moderne */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Talons</h1>
            <p className="text-gray-600 mt-1">Gérez vos talons et leurs informations de contact</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const printContent = `
                  <html>
                    <head>
                      <title>Rapport Global - Talons</title>
                      <style>
                        body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
                        h1, h2, h3 { color: #333; margin-bottom: 10px; }
                        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
                        th { background-color: #f5f5f5; font-weight: bold; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f97316; padding-bottom: 15px; }
                        .numeric { text-align: right; }
                        .total-row { font-weight: bold; background-color: #fef3c7; }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        <h1>📋 RAPPORT GLOBAL TALONS</h1>
                        <p>Date: ${new Date().toLocaleDateString('fr-FR')}</p>
                      </div>
                      <table>
                        <tr><th>Nom</th><th>Téléphone</th><th>Date de création</th></tr>
                        ${filteredTalons.map((t: Talon) => 
                          `<tr><td>${t.nom}</td><td>${t.phone || 'N/A'}</td><td>${new Date(t.created_at).toLocaleDateString('fr-FR')}</td></tr>`
                        ).join('')}
                      </table>
                    </body>
                  </html>
                `;
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                  printWindow.document.body.innerHTML = printContent;
                  printWindow.print();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
              title="Imprimer rapport global des talons"
            >
              <FileText size={16} />
              Rapport Global ({filteredTalons.length})
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Nouveau Talon
            </button>
          </div>
        </div>
      </div>

      {/* Carte de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Talons</p>
              <p className="text-3xl font-bold text-gray-900">{talons.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Phone className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Avec Téléphone</p>
              <p className="text-3xl font-bold text-gray-900">
                {talons.filter((t: Talon) => t.phone?.trim()).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <FileText className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Paiements Liés</p>
              <p className="text-3xl font-bold text-gray-900">
                {payments.filter((p: any) => p.talon_id).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou téléphone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <button
            onClick={() => setSearchTerm('')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Contrôles de pagination */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} talons
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Par page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tableau moderne */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Nom
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Téléphone
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date création
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Modifié le
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Paiements
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedTalons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <FileText className="w-12 h-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun talon trouvé</h3>
                      <p className="text-gray-500 max-w-sm">
                        {talons.length === 0 
                          ? "Commencez par ajouter votre premier talon." 
                          : "Aucun talon ne correspond à vos critères de recherche."}
                      </p>
                      {talons.length === 0 && (
                        <button
                          onClick={handleCreate}
                          className="mt-4 flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                        >
                          <Plus size={16} />
                          Ajouter un talon
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTalons.map((talon: Talon) => (
                  <tr key={talon.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-12 w-12">
                          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center border border-orange-200">
                            <User className="w-6 h-6 text-orange-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900">
                            {talon.nom}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {talon.phone ? (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-mono text-gray-900">{talon.phone}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Non renseigné</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">
                        {formatDateTimeWithHour(talon.date_creation)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">
                        {formatDateTimeWithHour(talon.updated_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          {payments.filter((p: any) => p.talon_id === talon.id).length}
                        </div>
                        <span className="text-xs text-gray-500">paiement(s)</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleViewPayments(talon)}
                          className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Voir les paiements liés"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(talon)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Modifier talon"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(talon.id)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer talon"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation de pagination moderne */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Précédent
          </button>
          
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 border rounded-lg transition-colors ${
                    currentPage === pageNum
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Modals */}
      <TalonFormModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseModal}
        initialValues={selectedTalon || undefined}
        onTalonAdded={() => {
          // Le cache sera automatiquement invalidé par RTK Query
        }}
      />

      {/* Modal des paiements liés au talon */}
      {isPaymentsModalOpen && selectedTalonForPayments && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Paiements liés au talon: {selectedTalonForPayments.nom}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedTalonForPayments.phone && `Téléphone: ${selectedTalonForPayments.phone}`}
                </p>
              </div>
              <button
                onClick={handleClosePaymentsModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {talonPayments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Aucun paiement trouvé
                  </h3>
                  <p className="text-gray-500">
                    Ce talon n'a pas encore de paiements associés.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Numéro
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Montant
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Mode
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Statut
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {talonPayments.map((payment: any) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            PAY{String(payment.id).padStart(2, '0')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {payment.type_paiement}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {Number(payment.montant_total || 0).toFixed(2)} DH
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {payment.mode_paiement}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDateTimeWithHour(payment.date_paiement)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              payment.statut === 'Validé' ? 'bg-green-100 text-green-800' :
                              payment.statut === 'En attente' ? 'bg-yellow-100 text-yellow-800' :
                              payment.statut === 'Refusé' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {payment.statut || 'En attente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    Total: {talonPayments.length} paiement(s)
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    Montant total: {talonPayments.reduce((sum: number, p: any) => sum + Number(p.montant_total || 0), 0).toFixed(2)} DH
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TalonsPage;
