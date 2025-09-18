import React from 'react';
import { Settings } from 'lucide-react';

interface PeriodConfigProps {
  title: string;
  description: string;
  value: number;
  unit: 'days' | 'months';
  onValueChange: (value: number) => void;
  onUnitChange: (unit: 'days' | 'months') => void;
  icon?: React.ComponentType<{ className?: string }>;
  colorClass?: string;
}

const PeriodConfig: React.FC<PeriodConfigProps> = ({
  title,
  description,
  value,
  unit,
  onValueChange,
  onUnitChange,
  icon: Icon = Settings,
  colorClass = 'blue'
}) => {
  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: 'text-blue-600'
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: 'text-red-600'
    },
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      icon: 'text-yellow-600'
    }
  };

  const colors = colorClasses[colorClass as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg p-4`}>
      <div className="flex items-center mb-3">
        <Icon className={`w-5 h-5 ${colors.icon} mr-2`} />
        <h3 className={`text-sm font-medium ${colors.text}`}>{title}</h3>
      </div>
      
      <p className={`text-xs ${colors.text} mb-3 opacity-80`}>
        {description}
      </p>
      
      <div className="flex items-center space-x-2">
        <div className="flex items-center">
          <input
            type="number"
            min="1"
            max="365"
            value={value}
            onChange={(e) => onValueChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as 'days' | 'months')}
          className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="days">Jours</option>
          <option value="months">Mois</option>
        </select>
      </div>
      
      <div className={`mt-2 text-xs ${colors.text} opacity-70`}>
        Période actuelle : {value} {unit === 'days' ? 'jour(s)' : 'mois'}
      </div>
    </div>
  );
};

export default PeriodConfig;