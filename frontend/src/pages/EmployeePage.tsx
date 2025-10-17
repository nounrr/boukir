import React, { useState } from 'react';
import {
  useGetEmployeesQueryServer as useGetEmployeesQuery,
  useCreateEmployeeMutationServer as useCreateEmployeeMutation,
  useUpdateEmployeeMutationServer as useUpdateEmployeeMutation,
  useDeleteEmployeeMutationServer as useDeleteEmployeeMutation,
  useAddEmployeeSalaireEntryMutationServer,
  useGetSalaireMonthlySummaryQueryServer,
  useGetEmployeeSalaireEntriesQueryServer,
  useUpdateEmployeeSalaireEntryMutationServer,
} from '../store/api/employeesApi.server';
import { useGetEmployeeDocsQuery, useGetDocumentTypesQuery } from '../store/api/employeeDocsApi';
import type { Employee } from '../types';
import { useAuth } from '../hooks/redux';
import { Plus, Edit, Trash2, Search, Eye, EyeOff, FileText, Banknote, Wallet, ChevronDown, ChevronRight, Check, X, Clock, Users } from 'lucide-react';
// merged imports above
// imports merged above
import { Link } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

// Composant pour afficher les statistiques de documents d'un employé
const EmployeeDocsStats: React.FC<{ employeeId: number }> = ({ employeeId }) => {
  const { data: docs = [] } = useGetEmployeeDocsQuery(employeeId);
  const { data: types = [] } = useGetDocumentTypesQuery();
  
  const docsCount = docs.length;
  const typesCount = types.length;
  
  return (
    <div className="text-center">
      <div className="text-sm font-medium text-gray-900">
        {docsCount} / {typesCount}
      </div>
      <div className="text-xs text-gray-500">
        docs / types
      </div>
    </div>
  );
};

// Composant pour afficher les montants en attente dans l'accordéon
const PendingSalaryEntries: React.FC<{ employeeId: number; selectedMonth: string }> = ({ employeeId, selectedMonth }) => {
  const { user } = useAuth();
  const { data: entries = [] } = useGetEmployeeSalaireEntriesQueryServer({ id: employeeId, month: selectedMonth });
  const [updateEntry] = useUpdateEmployeeSalaireEntryMutationServer();

  const pendingEntries = entries.filter((entry: any) => entry.statut === 'En attente');

  const handleUpdateStatus = async (entryId: number, newStatut: 'Validé' | 'Annulé') => {
    try {
      await updateEntry({
        id: employeeId,
        salaireId: entryId,
        statut: newStatut,
        updated_by: user?.id || 1
      }).unwrap();
      showSuccess(`Montant ${newStatut.toLowerCase()}`);
    } catch (err) {
      console.error(err);
      showError(`Erreur lors de la mise à jour du statut`);
    }
  };

  if (pendingEntries.length === 0) {
    return (
      <div className="text-center py-3 text-gray-500 text-sm">
        Aucun montant en attente pour ce mois
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700 mb-2">
        Montants en attente ({pendingEntries.length})
      </h4>
      {pendingEntries.map((entry: any) => (
        <div key={entry.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-yellow-600" />
              <span className="font-semibold text-gray-900">
                {Number(entry.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleUpdateStatus(entry.id, 'Validé')}
                className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                title="Valider"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => handleUpdateStatus(entry.id, 'Annulé')}
                className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                title="Annuler"
              >
                <X size={16} />
              </button>
            </div>
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
  );
};

// Composant pour afficher les montants en attente directement dans le tableau
const PendingSalaryCell: React.FC<{ employeeId: number; selectedMonth: string }> = ({ employeeId, selectedMonth }) => {
  const { user } = useAuth();
  const { data: entries = [] } = useGetEmployeeSalaireEntriesQueryServer({ id: employeeId, month: selectedMonth });
  const [updateEntry] = useUpdateEmployeeSalaireEntryMutationServer();

  const pendingEntries = entries.filter((entry: any) => entry.statut === 'En attente');

  const handleUpdateStatus = async (entryId: number, newStatut: 'Validé' | 'Annulé') => {
    try {
      await updateEntry({
        id: employeeId,
        salaireId: entryId,
        statut: newStatut,
        updated_by: user?.id || 1
      }).unwrap();
      showSuccess(`Montant ${newStatut.toLowerCase()}`);
    } catch (err) {
      console.error(err);
      showError(`Erreur lors de la mise à jour du statut`);
    }
  };

  if (pendingEntries.length === 0) {
    return (
      <div className="text-gray-400 text-sm">
        Aucun
      </div>
    );
  }

  const totalPending = pendingEntries.reduce((sum: number, entry: any) => sum + Number(entry.montant), 0);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 mb-2">
        <Clock size={12} className="text-yellow-600" />
        <span className="text-sm font-medium text-yellow-700">
          {pendingEntries.length} entrée{pendingEntries.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="text-sm font-semibold text-gray-900 mb-2">
        Total: {totalPending.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
      </div>
      {pendingEntries.slice(0, 2).map((entry: any) => (
        <div key={entry.id} className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-gray-900">
              {Number(entry.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
            </span>
            {user?.role === 'PDG' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleUpdateStatus(entry.id, 'Validé')}
                  className="p-0.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                  title="Valider"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={() => handleUpdateStatus(entry.id, 'Annulé')}
                  className="p-0.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                  title="Annuler"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
          {entry.note && (
            <p className="text-xs text-gray-600 truncate" title={entry.note}>
              {entry.note}
            </p>
          )}
        </div>
      ))}
      {pendingEntries.length > 2 && (
        <div className="text-xs text-gray-500 text-center">
          ... et {pendingEntries.length - 2} autre{pendingEntries.length - 2 > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

// Composant pour le contenu de l'accordéon - version simplifiée
const EmployeeAccordionContent: React.FC<{ employee: Employee; selectedMonth: string; salaryMap: Map<number, number> }> = ({ 
  employee, 
  selectedMonth,
  salaryMap
}) => {
  const { data: docs = [] } = useGetEmployeeDocsQuery(employee.id);
  const { data: types = [] } = useGetDocumentTypesQuery();
  
  const currentMonthTotal = React.useMemo(() => {
    // Utiliser les vraies données du salaryMap
    return salaryMap.get(employee.id) || 0;
  }, [salaryMap, employee.id]);

  // Calculer les statistiques des documents
  const docsStats = React.useMemo(() => {
    const totalDocs = docs.length;
    const totalTypes = types.length;
    const typesWithDocs = new Set(docs.map(doc => doc.type_doc_id).filter(Boolean)).size;
    
    return { totalDocs, totalTypes, typesWithDocs };
  }, [docs, types]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Statistiques de salaire */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wallet size={18} className="text-emerald-600" />
            Salaires - {selectedMonth}
          </h3>
          <Link 
            to={`/employees/${employee.id}/salaries`}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Voir tout →
          </Link>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-emerald-50 rounded-lg p-3">
            <div className="text-xs text-emerald-600 font-medium">Total ce mois</div>
            <div className="text-lg font-bold text-emerald-800">
              {currentMonthTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium">Salaire prévu</div>
            <div className="text-lg font-bold text-blue-800">
              {employee.salaire != null 
                ? employee.salaire.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })
                : 'Non défini'
              }
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link 
            to={`/employees/${employee.id}/salaries`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
          >
            <Wallet size={16} />
            Gérer les salaires
          </Link>
        </div>
      </div>

      {/* Montants en attente */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock size={18} className="text-yellow-600" />
            Montants en attente
          </h3>
        </div>
        
        <PendingSalaryEntries employeeId={employee.id} selectedMonth={selectedMonth} />
      </div>

      {/* Documents */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            Documents
          </h3>
          <Link 
            to={`/employees/${employee.id}/documents`}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Gérer →
          </Link>
        </div>

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

        {docs.length > 0 ? (
          <div className="space-y-2 mb-4">
            <div className="text-sm font-medium text-gray-700">Derniers documents :</div>
            {docs.slice(0, 3).map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 text-sm text-gray-600">
                <FileText size={14} className="text-blue-500" />
                <span className="truncate">{doc.path.split('/').pop()}</span>
                <span className="text-xs text-gray-400">({doc.type_nom || 'Sans type'})</span>
              </div>
            ))}
            {docs.length > 3 && (
              <div className="text-xs text-gray-500">
                ... et {docs.length - 3} autres documents
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <FileText size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500 text-sm">
              Aucun document uploadé
            </p>
          </div>
        )}

        <div className="text-center">
          <Link 
            to={`/employees/${employee.id}/documents`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
          >
            <FileText size={16} />
            Voir les documents
          </Link>
        </div>
      </div>

      {/* Informations supplémentaires */}
      <div className="lg:col-span-3 bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">Informations de l'employé</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">CIN:</span>
            <span className="ml-2 font-medium">{employee.cin}</span>
          </div>
          <div>
            <span className="text-gray-500">Nom:</span>
            <span className="ml-2 font-medium">{employee.nom_complet || '-'}</span>
          </div>
          <div>
            <span className="text-gray-500">Date embauche:</span>
            <span className="ml-2 font-medium">
              {employee.date_embauche 
                ? new Date(employee.date_embauche).toLocaleDateString('fr-FR')
                : '-'
              }
            </span>
          </div>
          <div>
            <span className="text-gray-500">Rôle:</span>
            <span className="ml-2 font-medium">{employee.role || '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const validationSchemaCreate = Yup.object({
  cin: Yup.string().required('CIN requis'),
  nom_complet: Yup.string().optional(),
  date_embauche: Yup.string().optional(),
  role: Yup.string().oneOf(['PDG', 'Manager', 'ManagerPlus', 'Chauffeur', 'Employé']).optional(),
  salaire: Yup.number().typeError('Salaire invalide').nullable().optional(),
  password: Yup.string().min(6, 'Mot de passe minimum 6 caractères').required('Mot de passe requis'),
});

const validationSchemaEdit = Yup.object({
  cin: Yup.string().required('CIN requis'),
  nom_complet: Yup.string().optional(),
  date_embauche: Yup.string().optional(),
  role: Yup.string().oneOf(['PDG', 'Manager', 'ManagerPlus', 'Chauffeur', 'Employé']).optional(),
  salaire: Yup.number().typeError('Salaire invalide').nullable().optional(),
  password: Yup.string().min(6, 'Mot de passe minimum 6 caractères').optional(),
});

// eslint-disable-next-line sonarjs/cognitive-complexity
const EmployeePage: React.FC = () => { // NOSONAR
  const { user } = useAuth();
  
  // Rediriger les employés vers leur page personnelle
  if (user?.role === 'Employé') {
    window.location.href = '/employee/self';
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500">Redirection vers votre page personnelle...</p>
      </div>
    );
  }
  
  const { data: employees = [], isLoading } = useGetEmployeesQuery();
  const [createEmployee] = useCreateEmployeeMutation();
  const [updateEmployee] = useUpdateEmployeeMutation();
  const [deleteEmployee] = useDeleteEmployeeMutation();
  const [addSalaireEntry] = useAddEmployeeSalaireEntryMutationServer();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false); // only used when editing
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);
  // Salaire modal state
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [salaryModalEmployee, setSalaryModalEmployee] = useState<Employee | null>(null);
  const [salaryMontant, setSalaryMontant] = useState('');
  const [salaryNote, setSalaryNote] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`; // YYYY-MM
  });
  const { data: salarySummary = [] } = useGetSalaireMonthlySummaryQueryServer({ month: selectedMonth });

  const salaryMap = React.useMemo(() => {
    const m = new Map<number, number>();
    for (const row of salarySummary as any[]) {
      m.set(Number(row.employe_id), Number(row.total || 0));
    }
    return m;
  }, [salarySummary]);

  const isOverSalary = (emp: Employee) => {
    if (emp.salaire == null) return false;
    const total = salaryMap.get(emp.id) || 0;
    return total > (emp.salaire || 0);
  };
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  const formik = useFormik({
    initialValues: {
      cin: '',
      nom_complet: '',
      date_embauche: '',
      role: 'Employé', // default to Employé to avoid unintended null
  salaire: '' as any,
      password: '',
    },
    validationSchema: editingEmployee ? validationSchemaEdit : validationSchemaCreate,
    onSubmit: async (values, { resetForm }) => {
      try {
        // Normalize optional fields: empty string -> null
        const payload: {
          cin: string;
          nom_complet: string | null;
          date_embauche: string | null;
          role: 'PDG' | 'Manager' | 'ManagerPlus' | 'Chauffeur' | 'Employé' | null;
          salaire: number | null;
          password: string;
        } = {
          cin: values.cin.trim(),
          nom_complet: values.nom_complet?.trim() || null,
          date_embauche: values.date_embauche?.trim() ? values.date_embauche : null,
          role: values.role ? (values.role as 'PDG' | 'Manager' | 'ManagerPlus' | 'Chauffeur' | 'Employé') : null,
          salaire: values.salaire !== undefined && values.salaire !== null && String(values.salaire).trim() !== ''
            ? Number(values.salaire)
            : null,
          password: values.password?.trim() || '',
        };
        if (editingEmployee) {
          await updateEmployee({
            id: editingEmployee.id,
            ...payload,
            updated_by: user?.id || 1,
          }).unwrap();
        } else {
          await createEmployee({
            ...payload,
            created_by: user?.id || 1,
          }).unwrap();
        }
        setIsModalOpen(false);
        setEditingEmployee(null);
        setShowPassword(false);
        setChangePassword(false);
        resetForm();
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
      }
    },
  });

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    formik.setValues({
      cin: employee.cin,
  nom_complet: employee.nom_complet || '',
  date_embauche: employee.date_embauche ? String(employee.date_embauche).slice(0, 10) : '',
  role: (employee.role as any) || 'Employé',
  salaire: employee.salaire != null ? String(employee.salaire) : '',
  password: '', // Ne pas pré-remplir le mot de passe (optionnel en modification)
    });
  setChangePassword(false);
  setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'L\'employé sera désactivé mais ses données seront conservées.',
      'Êtes-vous sûr de vouloir supprimer cet employé ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deleteEmployee({ id, updated_by: user?.id || 1 }).unwrap();
        showSuccess('Employé supprimé avec succès');
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression de l\'employé');
      }
    }
  };

  const filteredEmployees = employees.filter((employee: Employee) => {
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

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Chargement...</div>;
  }

  // Access is now controlled by the routing and sidebar permissions

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {user?.role === 'PDG' ? 'Gestion des Employés' : 'Employés - Ajout de montants'}
        </h1>
        {user?.role === 'PDG' && (
          <div className="flex items-center gap-3">
            <Link 
              to="/employees/archive"
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              <Users size={20} />
              Employés Archivés
            </Link>
            <button
              onClick={() => {
                setEditingEmployee(null);
                formik.resetForm();
                setChangePassword(true); // creating: password required, show field
                setShowPassword(false);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              <Plus size={20} />
              Nouvel Employé
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un employé..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Salaire summary and month selector */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="month" className="text-sm text-gray-700">Mois</label>
          <input
            id="month"
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white border rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500">Dépassement salaire</div>
            <div className="text-lg font-semibold text-red-600">
              {employees.filter((emp: Employee) => isOverSalary(emp)).length}
            </div>
          </div>
        </div>
      </div>

      {/* Contrôles de pagination */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} employés
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
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CIN</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom Complet</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date d'embauche</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salaire</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montants en attente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documents</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedEmployees.map((employee: Employee) => (
              <React.Fragment key={employee.id}>
                <tr className={`hover:bg-gray-50 ${isOverSalary(employee) ? 'bg-red-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {user?.role === 'PDG' && (
                        <button
                          onClick={() => setExpandedEmployee(
                            expandedEmployee === employee.id ? null : employee.id
                          )}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          {expandedEmployee === employee.id ? 
                            <ChevronDown size={16} /> : 
                            <ChevronRight size={16} />
                          }
                        </button>
                      )}
                      {employee.cin}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.nom_complet}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.date_embauche ? new Date(employee.date_embauche).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {employee.role ? (
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        employee.role === 'PDG' 
                          ? 'bg-purple-100 text-purple-800' 
                          : employee.role === 'ManagerPlus'
                          ? 'bg-blue-100 text-blue-800'
                          : employee.role === 'Manager'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {employee.role}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.salaire != null ? employee.salaire.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' }) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900" style={{ minWidth: '200px' }}>
                    <PendingSalaryCell employeeId={employee.id} selectedMonth={selectedMonth} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <EmployeeDocsStats employeeId={employee.id} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2 items-center">
                      {user?.role === 'PDG' && (
                        <>
                          <button
                            onClick={() => handleEdit(employee)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Modifier"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(employee.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setSalaryModalEmployee(employee);
                          setSalaryMontant('');
                          setSalaryNote('');
                          setIsSalaryModalOpen(true);
                        }}
                        className="text-emerald-600 hover:text-emerald-800"
                        title="Ajouter montant"
                      >
                        <Banknote size={16} />
                      </button>
                      {user?.role === 'PDG' && (
                        <>
                          <Link to={`/employees/${employee.id}/documents`} className="text-gray-600 hover:text-gray-900" title="Documents">
                            <FileText size={16} />
                          </Link>
                          <Link to={`/employees/${employee.id}/salaries`} className="text-gray-600 hover:text-gray-900" title="Salaires">
                            <Wallet size={16} />
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Accordéon avec statistiques et aperçu des documents - PDG seulement */}
                {user?.role === 'PDG' && expandedEmployee === employee.id && (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 bg-gray-50 border-t">
                      <EmployeeAccordionContent employee={employee} selectedMonth={selectedMonth} salaryMap={salaryMap} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

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
                      ? 'bg-blue-600 text-white border-blue-600'
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingEmployee ? 'Modifier l\'employé' : 'Nouvel employé'}
            </h2>
            <form onSubmit={formik.handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="cin" className="block text-sm font-medium text-gray-700 mb-1">CIN</label>
                  <input
                    id="cin"
                    type="text"
                    name="cin"
                    value={formik.values.cin}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: BK123456"
                  />
                  {formik.touched.cin && formik.errors.cin && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.cin}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="salaire" className="block text-sm font-medium text-gray-700 mb-1">Salaire mensuel (MAD)</label>
                  <input
                    id="salaire"
                    type="number"
                    step="0.01"
                    name="salaire"
                    value={(formik.values as any).salaire ?? ''}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {formik.touched.salaire && (formik.errors as any).salaire && (
                    <p className="text-red-500 text-sm mt-1">{String((formik.errors as any).salaire)}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="nom_complet" className="block text-sm font-medium text-gray-700 mb-1">Nom Complet</label>
                  <input
                    id="nom_complet"
                    type="text"
                    name="nom_complet"
                    value={formik.values.nom_complet}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {formik.touched.nom_complet && formik.errors.nom_complet && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.nom_complet}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="date_embauche" className="block text-sm font-medium text-gray-700 mb-1">Date d'embauche</label>
                  <input
                    id="date_embauche"
                    type="date"
                    name="date_embauche"
                    value={formik.values.date_embauche}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {formik.touched.date_embauche && formik.errors.date_embauche && (
                    <p className="text-red-500 text-sm mt-1">{formik.errors.date_embauche}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                  <select
                    id="role"
                    name="role"
                    value={formik.values.role}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Employé">Employé</option>
                    <option value="Manager">Manager</option>
                    <option value="ManagerPlus">ManagerPlus</option>
                    <option value="Chauffeur">Chauffeur</option>
                    <option value="PDG">PDG</option>
                  </select>
                  {formik.touched.role && formik.errors.role && (
                    <p className="text-red-500 text-sm mt-1">{String(formik.errors.role)}</p>
                  )}
                </div>

                {/* Password section */}
                {editingEmployee ? (
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <input
                        type="checkbox"
                        checked={changePassword}
                        onChange={(e) => {
                          setChangePassword(e.target.checked);
                          if (!e.target.checked) {
                            formik.setFieldValue('password', '');
                            setShowPassword(false);
                          }
                        }}
                      />
                      {' '}
                      <span>Changer le mot de passe</span>
                    </label>
                    {changePassword ? (
                      <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                          Nouveau mot de passe
                        </label>
                        <div className="relative">
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formik.values.password}
                            onChange={formik.handleChange}
                            onBlur={formik.handleBlur}
                            className="w-full pr-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          {/* eslint-disable-next-line */}
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        {formik.touched.password && formik.errors.password && (
                          <p className="text-red-500 text-sm mt-1">{formik.errors.password}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Le mot de passe restera inchangé.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={formik.values.password}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        className="w-full pr-10 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      {/* eslint-disable-next-line */}
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {formik.touched.password && formik.errors.password && (
                      <p className="text-red-500 text-sm mt-1">{formik.errors.password}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingEmployee(null);
                    setShowPassword(false);
                    setChangePassword(false);
                    formik.resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  {editingEmployee ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ajouter montant salaire */}
      {isSalaryModalOpen && salaryModalEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">Ajouter montant - {salaryModalEmployee.nom_complet || salaryModalEmployee.cin}</h2>
            
            {/* Informations sur le statut automatique */}
            <div className="bg-blue-50 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-medium text-blue-800">
                  Statut automatique :
                </div>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  user?.role === 'PDG' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {user?.role === 'PDG' ? 'Validé' : 'En attente'}
                </span>
              </div>
              <div className="text-xs text-blue-600">
                {user?.role === 'PDG' 
                  ? 'En tant que PDG, vos montants sont automatiquement validés' 
                  : 'En tant que ManagerPlus, vos montants nécessitent validation du PDG'
                }
              </div>
            </div>
            
            {/* Informations sur le salaire actuel */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Total actuel</div>
                  <div className="font-semibold text-gray-900">
                    {(salaryMap.get(salaryModalEmployee.id) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Salaire prévu</div>
                  <div className="font-semibold text-gray-900">
                    {salaryModalEmployee.salaire 
                      ? salaryModalEmployee.salaire.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })
                      : 'Non défini'
                    }
                  </div>
                </div>
              </div>
              {salaryModalEmployee.salaire && (salaryMap.get(salaryModalEmployee.id) || 0) >= salaryModalEmployee.salaire && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                  ⚠️ Le salaire prévu est déjà atteint ou dépassé
                </div>
              )}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!salaryMontant || isNaN(Number(salaryMontant))) {
                  showError('Montant invalide');
                  return;
                }
                
                // Déterminer le statut automatiquement selon le rôle
                const autoStatut = user?.role === 'PDG' ? 'Validé' : 'En attente';
                
                // Vérification de dépassement de salaire
                const currentTotal = salaryMap.get(salaryModalEmployee.id) || 0;
                const newTotal = currentTotal + Number(salaryMontant);
                
                if (salaryModalEmployee.salaire && newTotal > salaryModalEmployee.salaire) {
                  const confirmed = await showConfirmation(
                    'Dépassement de salaire détecté',
                    `Le total après ajout (${newTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}) dépassera le salaire prévu (${salaryModalEmployee.salaire.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' })}). Voulez-vous continuer ?`
                  );
                  
                  if (!confirmed.isConfirmed) {
                    return;
                  }
                }
                
                try {
                  await addSalaireEntry({ 
                    id: salaryModalEmployee.id, 
                    montant: Number(salaryMontant), 
                    note: salaryNote || undefined, 
                    statut: autoStatut,
                    created_by: user?.id || 1 
                  }).unwrap();
                  showSuccess(`Montant ajouté avec statut "${autoStatut}"`);
                  setIsSalaryModalOpen(false);
                  setSalaryModalEmployee(null);
                  setSalaryMontant('');
                  setSalaryNote('');
                } catch (err) {
                  console.error(err);
                  showError("Erreur lors de l'ajout du montant");
                }
              }}
            >
              <div className="space-y-3">
                <div>
                  <label htmlFor="montant" className="block text-sm font-medium text-gray-700 mb-1">Montant (MAD)</label>
                  <input
                    id="montant"
                    type="number"
                    step="0.01"
                    value={salaryMontant}
                    onChange={(e) => setSalaryMontant(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">Note (optionnel)</label>
                  <input
                    id="note"
                    type="text"
                    value={salaryNote}
                    onChange={(e) => setSalaryNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => { 
                    setIsSalaryModalOpen(false); 
                    setSalaryModalEmployee(null); 
                    setSalaryMontant('');
                    setSalaryNote('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md"
                >
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeePage;
