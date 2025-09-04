import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useGetEmployeeQueryServer as useGetEmployeeQuery,
  useGetEmployeeSalaireEntriesQueryServer as useGetEmployeeSalaireEntriesQuery,
  useAddEmployeeSalaireEntryMutationServer as useAddEmployeeSalaireEntryMutation,
  useUpdateEmployeeSalaireEntryMutationServer as useUpdateEmployeeSalaireEntryMutation,
  useDeleteEmployeeSalaireEntryMutationServer as useDeleteEmployeeSalaireEntryMutation,
} from '../store/api/employeesApi.server';
import type { EmployeeSalaireEntry } from '../types';
import { useAuth } from '../hooks/redux';
import { ArrowLeft, Plus, Calendar, DollarSign, Edit2, Trash2, Save, X } from 'lucide-react';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

const EmployeeSalariesPage: React.FC = () => {
  const params = useParams();
  const employeId = Number(params.id);
  const { user } = useAuth();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`; // YYYY-MM
  });

  const { data: employee, isLoading: empLoading } = useGetEmployeeQuery(employeId, { skip: !employeId });
  const { data: entries = [], isLoading } = useGetEmployeeSalaireEntriesQuery({ id: employeId, month }, { skip: !employeId });
  const [addEntry, { isLoading: adding }] = useAddEmployeeSalaireEntryMutation();
  const [updateEntry] = useUpdateEmployeeSalaireEntryMutation();
  const [deleteEntry] = useDeleteEmployeeSalaireEntryMutation();

  const [montant, setMontant] = useState('');
  const [note, setNote] = useState('');
  const [editingEntry, setEditingEntry] = useState<EmployeeSalaireEntry | null>(null);
  const [editMontant, setEditMontant] = useState('');
  const [editNote, setEditNote] = useState('');

  const totalMonth = useMemo(() => entries.reduce((sum: number, e: EmployeeSalaireEntry) => sum + Number(e.montant || 0), 0), [entries]);
  
  // Difference entre salaire prévu et total ce mois
  const salaireDiff = useMemo(() => {
    if (employee?.salaire == null) return null;
    const salaireNum = Number(employee.salaire) || 0;
    const diff = salaireNum - totalMonth; // positif => reste à payer, négatif => dépassement
    return { diff, salaire: salaireNum, total: totalMonth };
  }, [employee?.salaire, totalMonth]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!montant || isNaN(Number(montant))) {
      showError('Montant invalide');
      return;
    }
    try {
      await addEntry({ id: employeId, montant: Number(montant), note: note?.trim() || undefined, created_by: user?.id || 1 }).unwrap();
      setMontant('');
      setNote('');
      showSuccess('Montant ajouté');
    } catch (err) {
      console.error(err);
      showError("Erreur lors de l'ajout du montant");
    }
  };

  const handleEdit = (entry: EmployeeSalaireEntry) => {
    setEditingEntry(entry);
    setEditMontant(String(entry.montant));
    setEditNote(entry.note || '');
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setEditMontant('');
    setEditNote('');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !editMontant || isNaN(Number(editMontant))) {
      showError('Montant invalide');
      return;
    }

    try {
      await updateEntry({
        id: employeId,
        salaireId: editingEntry.id,
        montant: Number(editMontant),
        note: editNote?.trim() || undefined,
        updated_by: user?.id || 1
      }).unwrap();
      
      showSuccess('Entrée modifiée avec succès');
      handleCancelEdit();
    } catch (err) {
      console.error(err);
      showError('Erreur lors de la modification');
    }
  };

  const handleDelete = async (entry: EmployeeSalaireEntry) => {
    const confirmed = await showConfirmation(
      'Supprimer l\'entrée de salaire',
      `Êtes-vous sûr de vouloir supprimer cette entrée de ${Number(entry.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })} ?`
    );

    if (confirmed) {
      try {
        await deleteEntry({
          id: employeId,
          salaireId: entry.id
        }).unwrap();
        
        showSuccess('Entrée supprimée avec succès');
      } catch (err) {
        console.error(err);
        showError('Erreur lors de la suppression');
      }
    }
  };

  if (!employeId || isNaN(employeId)) {
    return <div className="p-6">Employé introuvable.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header avec breadcrumb */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/employees" className="hover:text-gray-700">Employés</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">
              {employee?.nom_complet || employee?.cin || `#${employeId}`}
            </span>
            <span>/</span>
            <span className="text-gray-900 font-medium">Salaires</span>
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
                <h1 className="text-3xl font-bold text-gray-900">Gestion des Salaires</h1>
                <p className="text-gray-600 mt-1">
                  Employé: {empLoading ? 'Chargement…' : (employee?.nom_complet || employee?.cin || `#${employeId}`)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistiques et formulaire */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Sélecteur de mois */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar size={20} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Période</h3>
            </div>
            <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-2">
              Sélectionner le mois
            </label>
            <input 
              id="month" 
              type="month" 
              value={month} 
              onChange={(e) => setMonth(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
          </div>

          {/* Statistiques */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <DollarSign size={20} className="text-emerald-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Statistiques</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Total ce mois</div>
                <div className="text-2xl font-bold text-emerald-600">
                  {totalMonth.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                </div>
              </div>
              {employee?.salaire != null && (
                <div>
                  <div className="text-sm text-gray-500">Salaire prévu</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {Number(employee.salaire).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                  </div>
                  <div className={`text-sm mt-1 ${
                    (() => {
                      if (totalMonth > employee.salaire) return 'text-red-600';
                      if (totalMonth === employee.salaire) return 'text-emerald-600';
                      return 'text-yellow-600';
                    })()
                  }`}>
                    {(() => {
                      if (totalMonth > employee.salaire) return 'Dépassement';
                      if (totalMonth === employee.salaire) return 'Complet';
                      return 'Partiel';
                    })()}
                  </div>
                  {salaireDiff && (
                    <div className="mt-2 text-sm">
                      {(() => {
                        if (salaireDiff.diff > 0) {
                          return (
                            <span className="font-medium text-blue-600">
                              Reste à payer: {salaireDiff.diff.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                            </span>
                          );
                        }
                        if (salaireDiff.diff < 0) {
                          return (
                            <span className="font-medium text-red-600">
                              Dépassement: {Math.abs(salaireDiff.diff).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                            </span>
                          );
                        }
                        return <span className="font-medium text-emerald-600">Aucun reste à payer</span>;
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Formulaire d'ajout */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Plus size={20} className="text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Ajouter un montant</h3>
            </div>
            <form onSubmit={onAdd} className="space-y-4">
              <div>
                <label htmlFor="montant" className="block text-sm font-medium text-gray-700 mb-1">Montant (MAD)</label>
                <input
                  id="montant"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">Note (optionnel)</label>
                <input
                  id="note"
                  type="text"
                  placeholder="Ajouter une note..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button 
                type="submit" 
                disabled={adding} 
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg font-medium transition-colors"
              >
                <Plus size={18} />
                {adding ? 'Ajout...' : 'Ajouter le montant'}
              </button>
            </form>
          </div>
        </div>

        {/* Table des entrées */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">Historique des paiements</h3>
            <p className="text-sm text-gray-600 mt-1">
              {entries.length > 0 ? `${entries.length} entrée(s) pour ${month}` : 'Aucune entrée pour ce mois'}
            </p>
          </div>
          
          {isLoading && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                Chargement...
              </div>
            </div>
          )}
          
          {!isLoading && entries.length === 0 && (
            <div className="p-8 text-center">
              <DollarSign size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-lg font-medium">Aucune entrée pour ce mois</p>
              <p className="text-gray-400 text-sm mt-1">Utilisez le formulaire ci-dessus pour ajouter un paiement</p>
            </div>
          )}
          
          {!isLoading && entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date & Heure
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Montant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Note
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((e, index) => (
                    <tr key={e.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {new Date(e.created_at).toLocaleDateString('fr-FR')}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(e.created_at).toLocaleTimeString('fr-FR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingEntry?.id === e.id ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editMontant}
                            onChange={(e) => setEditMontant(e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : (
                          <div className="text-sm font-semibold text-emerald-600">
                            {Number(e.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingEntry?.id === e.id ? (
                          <input
                            type="text"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="Note..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : (
                          <div className="text-sm text-gray-900">
                            {e.note || (
                              <span className="text-gray-400 italic">Aucune note</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingEntry?.id === e.id ? (
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
                                onClick={() => handleEdit(e)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                              >
                                <Edit2 size={14} />
                                Modifier
                              </button>
                              <button
                                onClick={() => handleDelete(e)}
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

export default EmployeeSalariesPage;
