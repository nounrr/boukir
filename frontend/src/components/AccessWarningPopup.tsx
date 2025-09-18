import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, LogOut } from 'lucide-react';

interface AccessWarningPopupProps {
  isOpen: boolean;
  message: string;
  timeRemaining: number; // en secondes
  onConfirm: () => void;
  onExtend?: () => void; // Optionnel pour prolonger la session
}

export const AccessWarningPopup: React.FC<AccessWarningPopupProps> = ({
  isOpen,
  message,
  timeRemaining,
  onConfirm,
  onExtend
}) => {
  const [countdown, setCountdown] = useState(timeRemaining);

  useEffect(() => {
    setCountdown(timeRemaining);
  }, [timeRemaining]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          onConfirm(); // Auto-fermeture quand le compte à rebours atteint 0
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onConfirm]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Fin d'accès programmée
            </h3>
            <p className="text-sm text-gray-500">
              Votre session va se terminer bientôt
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-gray-700 mb-4">{message}</p>
          
          <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded">
            <div className="flex items-center">
              <Clock className="w-5 h-5 text-orange-600 mr-2" />
              <span className="text-orange-800 font-medium">
                Temps restant: {formatTime(countdown)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex space-x-3">
          {onExtend && (
            <button
              onClick={onExtend}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              <Clock className="w-4 h-4 mr-2" />
              Prolonger
            </button>
          )}
          
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center justify-center"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Fermer maintenant
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            L'application se fermera automatiquement dans {formatTime(countdown)}
          </p>
        </div>
      </div>
    </div>
  );
};