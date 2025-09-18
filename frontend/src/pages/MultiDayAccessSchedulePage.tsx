import React, { useState } from 'react';
import {
  Clock, Users, Save, Edit, Trash2, Plus, CalendarClock
} from 'lucide-react';
import { useGetEmployeesQuery } from '../store/api/employeesApi';
import {
  useGetDetailedSchedulesQuery,
  useSaveDetailedScheduleMutation,
  useDeleteDetailedScheduleMutation
} from '../store/api/accessSchedulesDetailedApi';

// Type pour un horaire détaillé par jour (local)
interface DaySchedule {
  user_id: number;
  day_of_week: number; // 1=Lundi, 2=Mardi, ..., 7=Dimanche
  start_time: string;
  end_time: string;
  is_active: boolean;
}

// Type pour la configuration complète d'un employé (local)
interface EmployeeScheduleConfig {
  user_id: number;
  user_name: string;
  user_role: string;
  schedules: DaySchedule[];
}

const DAYS_OF_WEEK = [
  { id: 1, name: 'Lundi', short: 'LUN' },
  { id: 2, name: 'Mardi', short: 'MAR' },
  { id: 3, name: 'Mercredi', short: 'MER' },
  { id: 4, name: 'Jeudi', short: 'JEU' },
  { id: 5, name: 'Vendredi', short: 'VEN' },
  { id: 6, name: 'Samedi', short: 'SAM' },
  { id: 7, name: 'Dimanche', short: 'DIM' }
];

const MultiDayAccessSchedulePage: React.FC = () => {
  const { data: employees = [] } = useGetEmployeesQuery();
  const { data: employeeSchedules = [], isLoading } = useGetDetailedSchedulesQuery();
  const [saveSchedule] = useSaveDetailedScheduleMutation();
  const [deleteSchedule] = useDeleteDetailedScheduleMutation();
  
  // États locaux
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);

  // Obtenir la configuration d'un employé
  const getEmployeeConfig = (userId: number): EmployeeScheduleConfig | null => {
    return employeeSchedules.find(config => config.user_id === userId) || null;
  };

  // Ajouter/modifier un horaire pour un jour
  const updateDaySchedule = async (userId: number, dayOfWeek: number, schedule: Partial<DaySchedule>) => {
    try {
      await saveSchedule({
        user_id: userId,
        day_of_week: dayOfWeek,
        start_time: schedule.start_time!,
        end_time: schedule.end_time!,
        is_active: schedule.is_active ?? true
      }).unwrap();
      
      console.log('Horaire sauvegardé avec succès');
    } catch (error) {
      console.error('Erreur mise à jour horaire:', error);
      alert('Erreur lors de la sauvegarde de l\'horaire');
    }
  };

  // Supprimer un horaire pour un jour
  const removeDaySchedule = async (userId: number, dayOfWeek: number) => {
    try {
      await deleteSchedule({ userId, dayOfWeek }).unwrap();
      console.log('Horaire supprimé avec succès');
    } catch (error) {
      console.error('Erreur suppression horaire:', error);
      alert('Erreur lors de la suppression de l\'horaire');
    }
  };

  // Composant pour éditer l'horaire d'un jour
  const DayScheduleEditor: React.FC<{
    userId: number;
    day: typeof DAYS_OF_WEEK[0];
    existingSchedule?: DaySchedule;
  }> = ({ userId, day, existingSchedule }) => {
    const [startTime, setStartTime] = useState(existingSchedule?.start_time || '08:00');
    const [endTime, setEndTime] = useState(existingSchedule?.end_time || '18:00');
    const [isActive, setIsActive] = useState(existingSchedule?.is_active ?? true);
    const [isEditing, setIsEditing] = useState(false);

    const handleSave = async () => {
      await updateDaySchedule(userId, day.id, {
        start_time: startTime,
        end_time: endTime,
        is_active: isActive
      });
      setIsEditing(false);
    };

    const handleRemove = async () => {
      if (confirm(`Supprimer l'horaire du ${day.name} ?`)) {
        await removeDaySchedule(userId, day.id);
      }
    };

    if (!existingSchedule && !isEditing) {
      return (
        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
          <span className="text-gray-500">{day.name}: Non configuré</span>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-blue-600 hover:bg-blue-100 rounded"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      );
    }

    if (isEditing) {
      return (
        <div className="p-3 border border-blue-200 rounded-lg bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{day.name}</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="text-sm">Actif</span>
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Début</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full p-1 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              <Save className="w-3 h-3" />
              Sauver
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
            >
              Annuler
            </button>
            {existingSchedule && (
              <button
                onClick={handleRemove}
                className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                <Trash2 className="w-3 h-3" />
                Supprimer
              </button>
            )}
          </div>
        </div>
      );
    }

    // À ce point, existingSchedule existe forcément
    if (!existingSchedule) return null;

    return (
      <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-3">
          <span className="font-medium">{day.name}</span>
          <span className="text-sm text-gray-600">
            {existingSchedule.start_time} - {existingSchedule.end_time}
          </span>
          <span className={`px-2 py-1 rounded-full text-xs ${
            existingSchedule.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {existingSchedule.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 text-blue-600 hover:bg-blue-100 rounded"
        >
          <Edit className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* En-tête */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <CalendarClock className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            Configuration Horaires Multi-Jours
          </h1>
        </div>
        <p className="text-gray-600">
          Configurez des horaires d'accès différents pour chaque jour de la semaine par employé
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Liste des employés */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Employés
            </h2>
          </div>
          
          <div className="p-4">
            {employees.map((employee) => {
              const config = getEmployeeConfig(employee.id);
              const activeSchedules = config?.schedules.filter(s => s.is_active).length || 0;
              
              return (
                <div
                  key={employee.id}
                  className={`p-3 rounded-lg border cursor-pointer mb-2 transition-all ${
                    selectedEmployee === employee.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedEmployee(
                    selectedEmployee === employee.id ? null : employee.id
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{employee.nom_complet}</h3>
                      <p className="text-sm text-gray-600">{employee.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {activeSchedules} jour{activeSchedules !== 1 ? 's' : ''} configuré{activeSchedules !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {config ? 'Configuré' : 'Non configuré'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Configuration de l'employé sélectionné */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Configuration Horaires
            </h2>
          </div>

          <div className="p-4">
            {selectedEmployee ? (
              <>
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Chargement...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {DAYS_OF_WEEK.map((day) => {
                      const config = getEmployeeConfig(selectedEmployee);
                      const daySchedule = config?.schedules.find(s => s.day_of_week === day.id);
                      
                      return (
                        <DayScheduleEditor
                          key={day.id}
                          userId={selectedEmployee}
                          day={day}
                          existingSchedule={daySchedule}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CalendarClock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Sélectionnez un employé pour configurer ses horaires</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiDayAccessSchedulePage;