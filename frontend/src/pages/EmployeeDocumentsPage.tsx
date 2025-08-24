import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGetEmployeeDocsQuery, useCreateEmployeeDocMutation, useDeleteEmployeeDocMutation, useGetDocumentTypesQuery, useCreateDocumentTypeMutation } from '../store/api/employeeDocsApi';
import { toBackendUrl } from '../utils/url';

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

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reuse upload API by hitting /upload/employee-doc (field name: file)
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch('/api/upload/employee-doc', { method: 'POST', body: formData });
    if (!resp.ok) return;
    const json = await resp.json();
    const uploadedPath: string = json.fileUrl;
    await createDoc({ employe_id: employeId, path: uploadedPath, type_doc_id: typeDocId === '' ? null : Number(typeDocId) }).unwrap();
    setTypeDocId('');
    (e.target as any).value = '';
  };

  const onCreateType = async () => {
    if (!newTypeName.trim()) return;
    await createType({ nom: newTypeName.trim() }).unwrap();
    setNewTypeName('');
    setCreatingType(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Documents de l'employé #{employeId}</h1>
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Type de document</label>
            <select value={typeDocId} onChange={(e) => setTypeDocId(e.target.value ? Number(e.target.value) : '')} className="w-full border rounded px-3 py-2">
              <option value="">— Aucun —</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Fichier</label>
            <input type="file" onChange={onUpload} className="w-full" />
          </div>
          <div className="flex items-center gap-2">
            {!creatingType ? (
              <button className="px-3 py-2 bg-gray-100 rounded" onClick={() => setCreatingType(true)}>+ Nouveau type</button>
            ) : (
              <div className="flex gap-2">
                <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Nom du type" className="border rounded px-2 py-1" />
                <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={onCreateType}>Ajouter</button>
                <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => { setCreatingType(false); setNewTypeName(''); }}>Annuler</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6">Chargement…</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fichier</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{d.type_nom || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-700">
                    <a href={toBackendUrl(d.path)} target="_blank" rel="noreferrer" className="underline">{d.path.split('/').pop()}</a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button className="text-red-600 hover:text-red-800" onClick={() => deleteDoc({ employe_id: employeId, id: d.id })}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default EmployeeDocumentsPage;
