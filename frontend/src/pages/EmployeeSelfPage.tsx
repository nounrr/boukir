import React, { useState } from 'react';
import {
  useGetSalaireMonthlySummaryQueryServer,
  useGetEmployeeSalaireEntriesQueryServer,
  useGetEmployeeQueryServer,
} from '../store/api/employeesApi.server';
import { useGetEmployeeDocsQuery, useGetDocumentTypesQuery } from '../store/api/employeeDocsApi';
import { useAuth } from '../hooks/redux';
import { FileText, Wallet, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

// Composant pour afficher les montants avec leurs statuts
const SalaryEntriesList: React.FC<{ employeeId: number; selectedMonth: string }> = ({ employeeId, selectedMonth }) => {
  const { data: entries = [] } = useGetEmployeeSalaireEntriesQueryServer({ id: employeeId, month: selectedMonth });

  const validatedEntries = entries.filter((entry: any) => entry.statut === 'Validé');
  const pendingEntries = entries.filter((entry: any) => entry.statut === 'En attente');
  const cancelledEntries = entries.filter((entry: any) => entry.statut === 'Annulé');

  return (
    <div className="space-y-4">
      {/* Montants validés */}
      {validatedEntries.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-green-700 mb-2">
            Montants validés ({validatedEntries.length})
          </h4>
          <div className="space-y-2">
            {validatedEntries.map((entry: any) => (
              <div key={entry.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">
                    {Number(entry.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                  </span>
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    Validé
                  </span>
                </div>
                {entry.note && (
                  <p className="text-xs text-gray-600 mb-1">
                    Note: {entry.note}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Ajouté le {new Date(entry.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Montants en attente */}
      {pendingEntries.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-yellow-700 mb-2">
            Montants en attente de validation ({pendingEntries.length})
          </h4>
          <div className="space-y-2">
            {pendingEntries.map((entry: any) => (
              <div key={entry.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-yellow-600" />
                    <span className="font-semibold text-gray-900">
                      {Number(entry.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                    </span>
                  </div>
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                    En attente
                  </span>
                </div>
                {entry.note && (
                  <p className="text-xs text-gray-600 mb-1">
                    Note: {entry.note}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Ajouté le {new Date(entry.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Montants annulés */}
      {cancelledEntries.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-700 mb-2">
            Montants annulés ({cancelledEntries.length})
          </h4>
          <div className="space-y-2">
            {cancelledEntries.map((entry: any) => (
              <div key={entry.id} className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">
                    {Number(entry.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                  </span>
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                    Annulé
                  </span>
                </div>
                {entry.note && (
                  <p className="text-xs text-gray-600 mb-1">
                    Note: {entry.note}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Ajouté le {new Date(entry.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-center py-6 text-gray-500">
          Aucun montant pour ce mois
        </div>
      )}
    </div>
  );
};

const EmployeeSelfPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  });

  // Récupérer les informations de l'employé connecté
  const employeeId = user?.id;
  
  // Charger les données complètes de l'employé avec le salaire
  const { data: employee } = useGetEmployeeQueryServer(employeeId || 0, { skip: !employeeId });

  const { data: salarySummary = [] } = useGetSalaireMonthlySummaryQueryServer({ month: selectedMonth });
  const { data: docs = [] } = useGetEmployeeDocsQuery(employeeId || 0);
  const { data: types = [] } = useGetDocumentTypesQuery();

  // Calculer le total du mois
  const currentMonthTotal = React.useMemo(() => {
    const summary = (salarySummary as any[]).find((s: any) => Number(s.employe_id) === employeeId);
    return summary ? Number(summary.total || 0) : 0;
  }, [salarySummary, employeeId]);

  // Statistiques des documents
  const docsStats = React.useMemo(() => {
    const totalDocs = docs.length;
    const totalTypes = types.length;
    const typesWithDocs = new Set(docs.map(doc => doc.type_doc_id).filter(Boolean)).size;
    
    return { totalDocs, totalTypes, typesWithDocs };
  }, [docs, types]);

  if (!user || !employeeId) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500">Vous devez être connecté pour voir cette page.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Mes Informations
        </h1>
        <p className="text-gray-600 mt-1">
          Consultez vos documents et informations salariales
        </p>
      </div>

      {/* Informations personnelles */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations personnelles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-gray-500">CIN:</span>
            <span className="ml-2 font-medium">{user.cin}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Nom:</span>
            <span className="ml-2 font-medium">{user.nom_complet || '-'}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Rôle:</span>
            <span className="ml-2">
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                {user.role || 'Employé'}
              </span>
            </span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Date d'embauche:</span>
            <span className="ml-2 font-medium">
              {user.date_embauche 
                ? new Date(user.date_embauche).toLocaleDateString('fr-FR')
                : '-'
              }
            </span>
          </div>
          {employee?.salaire != null && (
            <div>
              <span className="text-sm text-gray-500">Salaire mensuel:</span>
              <span className="ml-2 font-medium">
                {employee.salaire.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section Salaires */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Wallet size={18} className="text-emerald-600" />
              Mes Salaires
            </h2>
            <div className="flex items-center gap-2">
              <label htmlFor="month" className="text-sm text-gray-700">Mois:</label>
              <input
                id="month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          {/* Total du mois */}
          <div className="bg-emerald-50 rounded-lg p-4 mb-4">
            <div className="text-sm text-emerald-600 font-medium mb-1">
              Total reçu - {selectedMonth}
            </div>
            <div className="text-2xl font-bold text-emerald-800">
              {currentMonthTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
            </div>
            {employee?.salaire != null && (
              <div className="text-xs text-gray-600 mt-2">
                sur {employee.salaire.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })} prévu
              </div>
            )}
          </div>

          {/* Liste des montants */}
          <SalaryEntriesList employeeId={employeeId} selectedMonth={selectedMonth} />

          {/* Lien vers historique complet */}
          <div className="mt-4 text-center">
            <Link 
              to={`/employees/${employeeId}/salaries`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
            >
              <Wallet size={16} />
              Voir l'historique complet
            </Link>
          </div>
        </div>

        {/* Section Documents */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              Mes Documents
            </h2>
          </div>

          {/* Statistiques */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs text-blue-600 font-medium">Documents uploadés</div>
              <div className="text-lg font-bold text-blue-800">
                {docsStats.totalDocs}
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-xs text-purple-600 font-medium">Types complétés</div>
              <div className="text-lg font-bold text-purple-800">
                {docsStats.typesWithDocs} / {docsStats.totalTypes}
              </div>
            </div>
          </div>

          {/* Liste des documents */}
          {docs.length > 0 ? (
            <div className="space-y-2 mb-4">
              <div className="text-sm font-medium text-gray-700">Mes documents :</div>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm text-gray-600">
                    <FileText size={14} className="text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{doc.path.split('/').pop()}</div>
                      <div className="text-xs text-gray-400">
                        {doc.type_nom || 'Sans type'} • {doc.created_at ? new Date(doc.created_at).toLocaleDateString('fr-FR') : 'N/A'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">
                Aucun document uploadé
              </p>
            </div>
          )}

          {/* Lien vers page documents */}
          <div className="text-center">
            <Link 
              to={`/employees/${employeeId}/documents`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
            >
              <FileText size={16} />
              Voir tous mes documents
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSelfPage;
