import React, { useState } from 'react';
import {
  Users, Search, RotateCcw, Calendar, User, Shield,
  Clock, ArrowLeft, AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { 
  useGetDeletedEmployeesQuery, 
  useRestoreEmployeeMutation,
  type DeletedEmployee 
} from '../store/api/employeeArchiveApi';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

const EmployeeArchivePage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const { data: deletedEmployees = [], isLoading } = useGetDeletedEmployeesQuery();
  const [restoreEmployee] = useRestoreEmployeeMutation();
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const handleRestore = async (employee: DeletedEmployee) => {
    const result = await showConfirmation(
      `Restaurer l'employé "${employee.nom_complet || employee.cin}" ?`,
      'L\'employé sera réactivé et pourra de nouveau se connecter au système.',
      'Oui, restaurer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await restoreEmployee({ 
          id: employee.id, 
          updated_by: user?.id || 1 
        }).unwrap();
        showSuccess('Employé restauré avec succès');
      } catch (error) {
        console.error('Erreur lors de la restauration:', error);
        showError('Erreur lors de la restauration de l\'employé');
      }
    }
  };

  const filteredEmployees = deletedEmployees.filter((employee: DeletedEmployee) => {
    const name = (employee.nom_complet || '').toLowerCase();
    const cin = (employee.cin || '').toLowerCase();
    const q = searchTerm.toLowerCase();
    return name.includes(q) || cin.includes(q);
  });

  // Pagination
  const totalItems = filteredEmployees.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  // Réinitialiser la page quand on change de recherche
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null || amount === undefined) return 'Non défini';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'MAD',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span>Chargement des employés archivés...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/employees"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={20} />
            Retour aux employés
          </Link>
          <div className="w-px h-6 bg-gray-300"></div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="text-red-500" size={28} />
            Employés Archivés
          </h1>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-500 mt-0.5" size={20} />
          <div>
            <h3 className="font-medium text-amber-800 mb-1">
              À propos des employés archivés
            </h3>
            <p className="text-sm text-amber-700">
              Les employés archivés ne peuvent plus se connecter au système mais leurs données 
              sont conservées pour maintenir l'intégrité des enregistrements. 
              Vous pouvez les restaurer à tout moment.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un employé archivé..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Users className="text-red-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total archivés</p>
              <p className="text-xl font-bold text-gray-900">{deletedEmployees.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Search className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Résultats recherche</p>
              <p className="text-xl font-bold text-gray-900">{filteredEmployees.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <RotateCcw className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Peuvent être restaurés</p>
              <p className="text-xl font-bold text-gray-900">{filteredEmployees.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contrôles de pagination */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} employés archivés
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Employés par page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredEmployees.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? 'Aucun employé trouvé' : 'Aucun employé archivé'}
          </h3>
          <p className="text-gray-500">
            {searchTerm 
              ? 'Essayez de modifier votre recherche.' 
              : 'Aucun employé n\'a été archivé pour le moment.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employé
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rôle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Salaire
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date d'embauche
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date de suppression
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedEmployees.map((employee: DeletedEmployee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-100 rounded-lg">
                        <User className="text-red-600" size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {employee.nom_complet || 'Nom non défini'}
                        </div>
                        <div className="text-sm text-gray-500">
                          CIN: {employee.cin}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-gray-400" />
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        employee.role === 'PDG' ? 'bg-purple-100 text-purple-700' :
                        employee.role === 'Manager' ? 'bg-blue-100 text-blue-700' :
                        employee.role === 'ManagerPlus' ? 'bg-indigo-100 text-indigo-700' :
                        employee.role === 'Chauffeur' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {employee.role || 'Non défini'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(employee.salaire)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-gray-400" />
                      {employee.date_embauche 
                        ? new Date(employee.date_embauche).toLocaleDateString('fr-FR')
                        : 'Non définie'
                      }
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-red-400" />
                      {new Date(employee.deleted_at).toLocaleString('fr-FR')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleRestore(employee)}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm transition-colors"
                    >
                      <RotateCcw size={14} />
                      Restaurer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Navigation de pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className={`px-3 py-2 border rounded-md ${
                    currentPage === pageNum
                      ? 'bg-red-600 text-white border-red-600'
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
            className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
};

export default EmployeeArchivePage;