import React, { useState } from 'react';
import {
  useGetEmployeesQueryServer as useGetEmployeesQuery,
  useCreateEmployeeMutationServer as useCreateEmployeeMutation,
  useUpdateEmployeeMutationServer as useUpdateEmployeeMutation,
  useDeleteEmployeeMutationServer as useDeleteEmployeeMutation,
} from '../store/api/employeesApi.server';
import type { Employee } from '../types';
import { useAuth } from '../hooks/redux';
import { Plus, Edit, Trash2, Search, Eye, EyeOff } from 'lucide-react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { showError, showSuccess, showConfirmation } from '../utils/notifications';

const validationSchemaCreate = Yup.object({
  cin: Yup.string().required('CIN requis'),
  nom_complet: Yup.string().optional(),
  date_embauche: Yup.string().optional(),
  role: Yup.string().oneOf(['PDG', 'Employé']).optional(),
  password: Yup.string().min(6, 'Mot de passe minimum 6 caractères').required('Mot de passe requis'),
});

const validationSchemaEdit = Yup.object({
  cin: Yup.string().required('CIN requis'),
  nom_complet: Yup.string().optional(),
  date_embauche: Yup.string().optional(),
  role: Yup.string().oneOf(['PDG', 'Employé']).optional(),
  password: Yup.string().min(6, 'Mot de passe minimum 6 caractères').optional(),
});

const EmployeePage: React.FC = () => {
  const { user } = useAuth();
  const { data: employees = [], isLoading } = useGetEmployeesQuery();
  const [createEmployee] = useCreateEmployeeMutation();
  const [updateEmployee] = useUpdateEmployeeMutation();
  const [deleteEmployee] = useDeleteEmployeeMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false); // only used when editing

  const formik = useFormik({
    initialValues: {
      cin: '',
      nom_complet: '',
      date_embauche: '',
      role: 'Employé', // default to Employé to avoid unintended null
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
          role: 'PDG' | 'Employé' | null;
          password: string;
        } = {
          cin: values.cin.trim(),
          nom_complet: values.nom_complet?.trim() || null,
          date_embauche: values.date_embauche?.trim() ? values.date_embauche : null,
          role: values.role ? (values.role as 'PDG' | 'Employé') : null,
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

  // Vérification des droits d'accès
  if (user?.role !== 'PDG') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Accès refusé</h2>
          <p className="text-gray-600">Seul le PDG peut accéder à la gestion des employés.</p>
        </div>
      </div>
    );
  }

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    formik.setValues({
      cin: employee.cin,
  nom_complet: employee.nom_complet || '',
  date_embauche: employee.date_embauche ? String(employee.date_embauche).slice(0, 10) : '',
  role: (employee.role as any) || 'Employé',
  password: '', // Ne pas pré-remplir le mot de passe (optionnel en modification)
    });
  setChangePassword(false);
  setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
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

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Chargement...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des Employés</h1>
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

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CIN</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom Complet</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date d'embauche</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEmployees.map((employee: Employee) => (
              <tr key={employee.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {employee.cin}
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
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {employee.role}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(employee)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(employee.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                      Changer le mot de passe
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
    </div>
  );
};

export default EmployeePage;
