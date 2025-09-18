import React, { useState, useMemo } from 'react';
import {
  Clock, Users, Shield, Search, Save, Edit, Trash2,
  CheckSquare, Square, CalendarClock, AlertTriangle,
  UserCheck, UserX, Settings
} from 'lucide-react';
import { useGetEmployeesQuery } from '../store/api/employeesApi';
import {
  useGetAccessSchedulesQuery,
  useSaveAccessScheduleMutation,
  useUpdateAccessScheduleMutation,
  useDeleteAccessScheduleMutation,
  useBatchUpdateSchedulesMutation,
} from '../store/api/accessSchedulesApi';

interface AccessSchedule {
  id?: number;
  user_id: number;
  user_name: string;
  user_role: 'employee' | 'manager' | 'admin';
  start_time: string; // Format "HH:mm"
  end_time: string;   // Format "HH:mm"
  days_of_week: number[]; // 1=Lundi, 2=Mardi, ..., 7=Dimanche
  is_active: boolean;
  detailed_schedules?: {[key: number]: {start_time: string, end_time: string, active: boolean}}; // Horaires par jour
  created_at?: string;
  updated_at?: string;
}

const AccessSchedulePage: React.FC = () => {
  const { data: employees = [] } = useGetEmployeesQuery();
  const { data: schedules = [], refetch: refetchSchedules } = useGetAccessSchedulesQuery();
  const [saveSchedule] = useSaveAccessScheduleMutation();
  const [updateSchedule] = useUpdateAccessScheduleMutation();
  const [deleteSchedule] = useDeleteAccessScheduleMutation();
  const [batchUpdateSchedules] = useBatchUpdateSchedulesMutation();
  
  // États locaux
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<AccessSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRulesFor, setShowRulesFor] = useState<number | null>(null);

  // États du formulaire
  const [formData, setFormData] = useState({
    start_time: '08:00',
    end_time: '19:00',
    days_of_week: [1, 2, 3, 4, 5], // Lundi à Vendredi par défaut
    is_active: true
  });

  const daysOfWeek = [
    { value: 1, label: 'Lundi', short: 'L' },
    { value: 2, label: 'Mardi', short: 'M' },
    { value: 3, label: 'Mercredi', short: 'M' },
    { value: 4, label: 'Jeudi', short: 'J' },
    { value: 5, label: 'Vendredi', short: 'V' },
    { value: 6, label: 'Samedi', short: 'S' },
    { value: 7, label: 'Dimanche', short: 'D' }
  ];

  // Filtrage des employés
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => 
      !searchTerm || 
      emp.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.cin?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [employees, searchTerm]);

  // Employés avec leurs horaires (regroupés par utilisateur)
  const employeesWithSchedules = useMemo(() => {
    return filteredEmployees.map(emp => {
      const userSchedules = schedules.filter(s => s.user_id === emp.id);
      return {
        ...emp,
        schedules: userSchedules,
        hasAccess: userSchedules.some(s => s.is_active) || false
      };
    });
  }, [filteredEmployees, schedules]);

  // Gestion de la sélection multiple
  const handleSelectUser = (userId: number) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === filteredEmployees.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredEmployees.map(emp => emp.id)));
    }
  };

  // Gestion du formulaire
  const handleDayToggle = (day: number) => {
    const newDays = formData.days_of_week.includes(day)
      ? formData.days_of_week.filter(d => d !== day)
      : [...formData.days_of_week, day].sort();
    setFormData(prev => ({ ...prev, days_of_week: newDays }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const scheduleData = {
        start_time: formData.start_time,
        end_time: formData.end_time,
        days_of_week: formData.days_of_week,
        is_active: formData.is_active
      };

      if (editingSchedule) {
        // Modification d'un horaire existant
        await updateSchedule({
          id: editingSchedule.id!,
          ...scheduleData
        }).unwrap();
      } else {
        const usersToUpdate = Array.from(selectedUsers);
        
        if (usersToUpdate.length === 1) {
          // Ajout d'une nouvelle règle pour un seul utilisateur
          const userId = usersToUpdate[0];
          const employee = employees.find(emp => emp.id === userId);
          
          await saveSchedule({
            user_id: userId,
            user_name: employee?.nom_complet || `Employé ${employee?.cin}`,
            user_role: employee?.role === 'PDG' ? 'admin' : employee?.role === 'Manager' ? 'manager' : 'employee',
            ...scheduleData
          }).unwrap();
        } else {
          // Modification en lot pour plusieurs utilisateurs
          const users = usersToUpdate.map(userId => {
            const employee = employees.find(emp => emp.id === userId);
            return {
              user_id: userId,
              user_name: employee?.nom_complet || `Employé ${employee?.cin}`,
              user_role: employee?.role === 'PDG' ? 'admin' : employee?.role === 'Manager' ? 'manager' : 'employee'
            };
          }).filter(user => user.user_name);

          await batchUpdateSchedules({
            users,
            schedule_config: scheduleData
          }).unwrap();
        }
      }

      // Réinitialiser le formulaire
      setShowForm(false);
      setEditingSchedule(null);
      setSelectedUsers(new Set());
      setFormData({
        start_time: '08:00',
        end_time: '19:00',
        days_of_week: [1, 2, 3, 4, 5],
        is_active: true
      });
      
      console.log('Horaires sauvegardés avec succès');
    } catch (error) {
      console.error('Erreur sauvegarde horaires:', error);
      alert('Erreur lors de la sauvegarde des horaires');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule: AccessSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      days_of_week: schedule.days_of_week,
      is_active: schedule.is_active
    });
    setShowForm(true);
  };

  // Nouvelle fonction pour ajouter une règle supplémentaire
  const handleAddRule = (userId: number) => {
    const employee = employees.find(emp => emp.id === userId);
    if (employee) {
      setSelectedUsers(new Set([userId]));
      setEditingSchedule(null);
      setFormData({
        start_time: '08:00',
        end_time: '19:00',
        days_of_week: [1, 2, 3, 4, 5],
        is_active: true
      });
      setShowForm(true);
    }
  };

  const handleDelete = async (scheduleId: number) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet horaire d\'accès ?')) {
      try {
        await deleteSchedule(scheduleId).unwrap();
        console.log('Horaire supprimé avec succès');
      } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erreur lors de la suppression');
      }
    }
  };

  const formatTimeRange = (start: string, end: string) => {
    return `${start} - ${end}`;
  };

  const formatDays = (days: number[]) => {
    return days.map(d => daysOfWeek.find(day => day.value === d)?.short).join('');
  };

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarClock className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Horaires d'Accès</h1>
            <p className="text-gray-600">
              Gérer les plages horaires d'accès à l'application pour les employés
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">          
          <button
            onClick={() => {
              setEditingSchedule(null);
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            disabled={!showForm && selectedUsers.size === 0}
          >
            <Settings size={16} />
            {showForm ? 'Annuler' : 'Configurer Horaires'}
          </button>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Users className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-blue-800">Total Employés</p>
              <p className="text-2xl font-bold text-blue-900">{employees.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <UserCheck className="w-8 h-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-green-800">Accès Configuré</p>
              <p className="text-2xl font-bold text-green-900">
                {schedules.filter(s => s.is_active).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-yellow-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Horaires Restreints</p>
              <p className="text-2xl font-bold text-yellow-900">
                {schedules.filter(s => s.is_active && (s.start_time !== '00:00' || s.end_time !== '23:59')).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <UserX className="w-8 h-8 text-red-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-red-800">Accès Désactivé</p>
              <p className="text-2xl font-bold text-red-900">
                {schedules.filter(s => !s.is_active).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Formulaire de configuration */}
      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-blue-600" />
            {editingSchedule ? 'Modifier l\'Horaire' : 'Configurer les Horaires d\'Accès'}
            {!editingSchedule && (
              <span className="ml-2 text-sm text-gray-500">
                ({selectedUsers.size} utilisateur(s) sélectionné(s))
              </span>
            )}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Plage horaire */}
              <div className="space-y-4">
                <h3 className="text-md font-medium text-gray-700 flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Plage Horaire
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Heure de début
                    </label>
                    <input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Heure de fin
                    </label>
                    <input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Jours de la semaine */}
              <div className="space-y-4">
                <h3 className="text-md font-medium text-gray-700">
                  Jours Autorisés
                </h3>
                
                <div className="grid grid-cols-7 gap-2">
                  {daysOfWeek.map(day => {
                    const isSelected = formData.days_of_week.includes(day.value);
                    
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => handleDayToggle(day.value)}
                        className={`p-2 text-xs font-medium rounded-md transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title={day.label}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
                
                <p className="text-xs text-gray-500">
                  Jours sélectionnés: {formData.days_of_week.length === 0 ? 'Aucun' : 
                    formData.days_of_week.map(d => daysOfWeek.find(day => day.value === d)?.label).join(', ')
                  }
                </p>
              </div>
            </div>

            {/* État actif */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                Horaire actif (si décoché, l'accès sera bloqué)
              </label>
            </div>

            {/* Boutons */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingSchedule(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || formData.days_of_week.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save size={16} />
                {loading ? 'Sauvegarde...' : (editingSchedule ? 'Modifier' : 'Configurer')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des employés */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="border-b border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {selectedUsers.size === filteredEmployees.length ? (
                  <CheckSquare size={16} />
                ) : (
                  <Square size={16} />
                )}
                Tout sélectionner
              </button>
              
              {selectedUsers.size > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedUsers.size} utilisateur(s) sélectionné(s)
                </span>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Rechercher un employé..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === filteredEmployees.length && filteredEmployees.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employé
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rôle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Horaires Configurés
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employeesWithSchedules.map((employee) => {
                const schedules = employee.schedules || [];
                
                return (
                  <tr 
                    key={employee.id} 
                    className={`hover:bg-gray-50 ${selectedUsers.has(employee.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(employee.id)}
                        onChange={() => handleSelectUser(employee.id)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {employee.nom_complet || `Employé ${employee.cin}` || 'Sans nom'}
                          </div>
                          <div className="text-sm text-gray-500">{employee.cin}</div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.role === 'PDG' ? 'bg-purple-100 text-purple-800' :
                        employee.role === 'Manager' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {employee.role === 'PDG' ? (
                          <Shield className="w-3 h-3 mr-1" />
                        ) : employee.role === 'Manager' ? (
                          <Users className="w-3 h-3 mr-1" />
                        ) : (
                          <UserCheck className="w-3 h-3 mr-1" />
                        )}
                        {employee.role === 'PDG' ? 'PDG' : 
                         employee.role === 'Manager' ? 'Manager' : 'Employé'}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {schedules.length > 0 ? (
                        <div className="space-y-2">
                          {schedules.map((schedule) => (
                            <div key={schedule.id} className="border rounded p-2 bg-gray-50">
                              <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center">
                                    <Clock className="w-3 h-3 mr-1 text-gray-400" />
                                    {formatTimeRange(schedule.start_time, schedule.end_time)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {formatDays(schedule.days_of_week)}
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => handleEdit(schedule)}
                                    className="text-blue-600 hover:text-blue-800"
                                    title="Modifier cette règle"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(schedule.id!)}
                                    className="text-red-600 hover:text-red-800"
                                    title="Supprimer cette règle"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => handleAddRule(employee.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                            title="Ajouter une règle"
                          >
                            <Settings className="w-3 h-3 mr-1" />
                            Ajouter règle
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-400 italic">Aucun horaire</span>
                          <button
                            onClick={() => handleAddRule(employee.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                            title="Ajouter une règle"
                          >
                            <Settings className="w-3 h-3 mr-1" />
                            Ajouter
                          </button>
                        </div>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {schedules.length > 0 ? (
                        schedules.some(s => s.is_active) ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <UserCheck className="w-3 h-3 mr-1" />
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <UserX className="w-3 h-3 mr-1" />
                            Bloqué
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Non configuré
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {employeesWithSchedules.length === 0 && (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun employé trouvé</h3>
              <p className="mt-1 text-sm text-gray-500">
                Aucun employé ne correspond aux critères de recherche.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccessSchedulePage;