import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGetDocumentTypesQuery, useCreateDocumentTypeMutation, useUpdateDocumentTypeMutation, useDeleteDocumentTypeMutation } from '../store/api/employeeDocsApi';
import { ArrowLeft, Plus, Edit2, Trash2, FileText, Save, X } from 'lucide-react';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

const DocumentTypesPage: React.FC = () => {
  const { data: types = [], isLoading } = useGetDocumentTypesQuery();
  const [createType] = useCreateDocumentTypeMutation();
  const [updateType] = useUpdateDocumentTypeMutation();
  const [deleteType] = useDeleteDocumentTypeMutation();
  
  const [newTypeName, setNewTypeName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = async () => {
    if (!newTypeName.trim()) {
      showError('Veuillez saisir un nom de type');
      return;
    }

    try {
      await createType({ nom: newTypeName.trim() }).unwrap();
      showSuccess('Type de document créé avec succès');
      setNewTypeName('');
    } catch (error) {
      console.error('Error creating type:', error);
      showError('Erreur lors de la création du type');
    }
  };

  const handleEdit = (type: { id: number; nom: string }) => {
    setEditingId(type.id);
    setEditingName(type.nom);
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      showError('Veuillez saisir un nom de type');
      return;
    }

    try {
      await updateType({ id: editingId!, nom: editingName.trim() }).unwrap();
      showSuccess('Type de document modifié avec succès');
      setEditingId(null);
      setEditingName('');
    } catch (error) {
      console.error('Error updating type:', error);
      showError('Erreur lors de la modification du type');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = async (id: number, nom: string) => {
    const confirmed = await showConfirmation(
      'Supprimer le type de document',
      `Êtes-vous sûr de vouloir supprimer le type "${nom}" ? Cette action est irréversible.`
    );

    if (confirmed) {
      try {
        await deleteType(id).unwrap();
        showSuccess('Type de document supprimé avec succès');
      } catch (error) {
        console.error('Error deleting type:', error);
        showError('Erreur lors de la suppression du type');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header avec breadcrumb */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/employees" className="hover:text-gray-700">Employés</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Types de documents</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                to="/employees" 
                className="inline-flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg border border-gray-200 transition-colors"
              >
                <ArrowLeft size={18} />
                Retour aux employés
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Types de Documents</h1>
                <p className="text-gray-600 mt-1">
                  Gérer les types de documents pour les employés
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Formulaire d'ajout */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-100 rounded-lg">
              <Plus size={20} className="text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Ajouter un nouveau type</h3>
              <p className="text-sm text-gray-600">Créer un nouveau type de document</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="newTypeName" className="block text-sm font-medium text-gray-700 mb-2">
                Nom du type
              </label>
              <input
                id="newTypeName"
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Ex: Contrat de travail, CV, Diplôme..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleCreate}
                disabled={!newTypeName.trim()}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                <Plus size={16} className="inline mr-2" />
                Ajouter
              </button>
            </div>
          </div>
        </div>

        {/* Liste des types */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Types de documents</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {types.length > 0 ? `${types.length} type(s) enregistré(s)` : 'Aucun type'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-gray-400" />
              </div>
            </div>
          </div>
          
          {isLoading && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                Chargement...
              </div>
            </div>
          )}
          
          {!isLoading && types.length === 0 && (
            <div className="p-8 text-center">
              <FileText size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-lg font-medium">Aucun type de document</p>
              <p className="text-gray-400 text-sm mt-1">Utilisez le formulaire ci-dessus pour ajouter des types</p>
            </div>
          )}
          
          {!isLoading && types.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-700">ID</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-700">Nom du type</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {types.map((type, index) => (
                    <tr 
                      key={type.id} 
                      className={`hover:bg-gray-50 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                      }`}
                    >
                      <td className="px-6 py-4 text-sm text-gray-500">
                        #{type.id}
                      </td>
                      <td className="px-6 py-4">
                        {editingId === type.id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <FileText size={16} className="text-blue-600" />
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {type.nom}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === type.id ? (
                            <>
                              <button
                                onClick={handleSaveEdit}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                              >
                                <Save size={14} />
                                Sauvegarder
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                              >
                                <X size={14} />
                                Annuler
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEdit(type)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                              >
                                <Edit2 size={14} />
                                Modifier
                              </button>
                              <button
                                onClick={() => handleDelete(type.id, type.nom)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                              >
                                <Trash2 size={14} />
                                Supprimer
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentTypesPage;
