import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGetEmployeeDocsQuery, useCreateEmployeeDocMutation, useDeleteEmployeeDocMutation, useGetDocumentTypesQuery, useCreateDocumentTypeMutation } from '../store/api/employeeDocsApi';
import { toBackendUrl } from '../utils/url';
import { ArrowLeft, FileText, Plus, Upload, Trash2, File, FolderOpen, FileType } from 'lucide-react';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

const EmployeeDocumentsPage: React.FC = () => {
  const params = useParams();
  const employeId = Number(params.id);
  const { data: docs = [], isLoading } = useGetEmployeeDocsQuery(employeId, { skip: !employeId });
  const { data: types = [] } = useGetDocumentTypesQuery();
  const [createDoc] = useCreateEmployeeDocMutation();
  const [deleteDoc] = useDeleteEmployeeDocMutation();
  const [typeDocId, setTypeDocId] = useState<number | ''>('');
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [createType] = useCreateDocumentTypeMutation();
  const [uploadedFile, setUploadedFile] = useState<{name: string, path: string} | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fonction pour déterminer le type de fichier et l'icône
  const getFileIcon = (filename: string) => {
    const extension = filename.toLowerCase().split('.').pop();
    if (extension === 'pdf') {
      return <FileType size={16} className="text-red-600" />;
    }
    return <File size={16} className="text-blue-600" />;
  };

  const getFileIconColor = (filename: string) => {
    const extension = filename.toLowerCase().split('.').pop();
    if (extension === 'pdf') {
      return 'bg-red-100';
    }
    return 'bg-blue-100';
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/api/upload/employee-doc', { method: 'POST', body: formData });
      if (!resp.ok) {
        showError('Erreur lors du téléchargement du fichier');
        return;
      }
      const json = await resp.json();
      const uploadedPath: string = json.fileUrl;
      setUploadedFile({ name: file.name, path: uploadedPath });
      showSuccess('Fichier téléchargé avec succès');
      // Reset file input
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading document:', error);
      showError('Erreur lors du téléchargement du fichier');
    } finally {
      setIsUploading(false);
    }
  };

  const addDocument = async () => {
    if (!uploadedFile || !typeDocId) {
      showError('Veuillez sélectionner un fichier et un type');
      return;
    }

    try {
      await createDoc({
        employe_id: employeId,
        path: uploadedFile.path,
        type_doc_id: typeof typeDocId === 'number' ? typeDocId : null
      }).unwrap();
      showSuccess('Document ajouté avec succès');
      setUploadedFile(null);
      setTypeDocId('');
    } catch (error) {
      console.error('Error creating document:', error);
      showError('Erreur lors de l\'ajout du document');
    }
  };

  const onCreateType = async () => {
    if (!newTypeName.trim()) return;
    try {
      await createType({ nom: newTypeName.trim() }).unwrap();
      setNewTypeName('');
      setCreatingType(false);
      showSuccess('Type de document créé avec succès');
    } catch (error) {
      console.error('Error creating document type:', error);
      showError('Erreur lors de la création du type de document');
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce document ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deleteDoc({ employe_id: employeId, id: docId }).unwrap();
        showSuccess('Document supprimé avec succès');
      } catch (error) {
        console.error('Error deleting document:', error);
        showError('Erreur lors de la suppression du document');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header avec breadcrumb */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/employees" className="hover:text-gray-700">Employés</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Employé #{employeId}</span>
            <span>/</span>
            <span className="text-gray-900 font-medium">Documents</span>
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
                <h1 className="text-3xl font-bold text-gray-900">Gestion des Documents</h1>
                <p className="text-gray-600 mt-1">
                  Employé #{employeId}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Formulaire d'ajout de document */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Upload size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Ajouter un document</h3>
              <p className="text-sm text-gray-600">Téléchargez un nouveau document pour cet employé</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {/* Section 1: Upload de fichier */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="docFile" className="block text-sm font-medium text-gray-700 mb-2">
                  Sélectionner un fichier
                </label>
                <input 
                  id="docFile" 
                  type="file" 
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={onUpload}
                  disabled={isUploading}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formats acceptés : PDF, JPG, PNG (max 10MB)
                </p>
                {isUploading && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    Téléchargement en cours...
                  </p>
                )}
              </div>

              <div>
                <div className="block text-sm font-medium text-gray-700 mb-2">
                  Gestion des types
                </div>
                {!creatingType ? (
                  <div className="flex gap-2">
                    <button 
                      className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 font-medium transition-colors" 
                      onClick={() => setCreatingType(true)}
                    >
                      <Plus size={16} className="inline mr-2" />
                      Nouveau type
                    </button>
                    <Link
                      to="/document-types"
                      className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 font-medium transition-colors"
                    >
                      Gérer les types
                    </Link>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      value={newTypeName} 
                      onChange={(e) => setNewTypeName(e.target.value)} 
                      placeholder="Nom du type" 
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <button 
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium" 
                      onClick={onCreateType}
                    >
                      Ajouter
                    </button>
                    <button 
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm" 
                      onClick={() => { setCreatingType(false); setNewTypeName(''); }}
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Fichier uploadé et ajout final */}
            {uploadedFile && (
              <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <File size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-900">Fichier prêt à être ajouté</p>
                      <p className="text-sm text-green-700">{uploadedFile.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="text-green-600 hover:text-green-800"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="typeDocFinal" className="block text-sm font-medium text-gray-700 mb-2">
                      Type de document *
                    </label>
                    <select 
                      id="typeDocFinal" 
                      value={typeDocId} 
                      onChange={(e) => setTypeDocId(e.target.value ? Number(e.target.value) : '')} 
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">— Sélectionner un type —</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>{t.nom}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      onClick={addDocument}
                      disabled={!typeDocId}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      <Plus size={16} className="inline mr-2" />
                      Ajouter le document
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Liste des documents */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Documents de l'employé</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {docs.length > 0 ? `${docs.length} document(s) enregistré(s)` : 'Aucun document'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <FolderOpen size={20} className="text-gray-400" />
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
          
          {!isLoading && docs.length === 0 && (
            <div className="p-8 text-center">
              <FileText size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-lg font-medium">Aucun document</p>
              <p className="text-gray-400 text-sm mt-1">Utilisez le formulaire ci-dessus pour ajouter des documents</p>
            </div>
          )}
          
          {!isLoading && docs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-700">Document</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-700">Type</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-700">Ajouté le</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {docs.map((doc, index) => (
                    <tr 
                      key={doc.id} 
                      className={`hover:bg-gray-50 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 ${getFileIconColor(doc.path)} rounded-lg`}>
                            {getFileIcon(doc.path)}
                          </div>
                          <div>
                            <a 
                              href={toBackendUrl(doc.path)} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
                            >
                              {doc.path.split('/').pop()}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {doc.type_nom || 'Sans type'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {doc.created_at ? new Date(doc.created_at).toLocaleDateString('fr-FR') : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                          >
                            <Trash2 size={14} />
                            Supprimer
                          </button>
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

export default EmployeeDocumentsPage;
