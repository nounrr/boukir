import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (note?: string) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'approve' | 'reject';
  userName?: string;
  showNoteInput?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  type = 'approve',
  userName,
  showNoteInput = false,
}) => {
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(showNoteInput ? note : undefined);
    setNote('');
  };

  const handleClose = () => {
    setNote('');
    onClose();
  };

  const privileges = [
    { icon: '✓', text: 'Accès aux tarifs professionnels', color: 'text-green-600' },
    { icon: '✓', text: 'Remises et conditions spéciales', color: 'text-green-600' },
    { icon: '✓', text: 'Accès aux catalogues artisans', color: 'text-green-600' },
    { icon: '✓', text: 'Gestion de projets/chantiers', color: 'text-green-600' },
    { icon: '✓', text: 'Commandes en gros volumes', color: 'text-green-600' },
  ];

  const rejectConsequences = [
    { icon: '✗', text: 'Annuler la demande Artisan/Promoteur', color: 'text-red-600' },
    { icon: '✗', text: 'Le compte restera de type "Client"', color: 'text-red-600' },
    { icon: '✗', text: 'L\'utilisateur ne pourra plus refaire de demande', color: 'text-red-600' },
    { icon: '✗', text: 'Privilèges client standard uniquement', color: 'text-red-600' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${type === 'approve' ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {type === 'approve' ? (
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              ) : (
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              )}
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {/* User Name */}
          {userName && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <span className="font-semibold">Utilisateur:</span> {userName}
              </p>
            </div>
          )}

          {/* Message */}
          <p className="text-gray-700 mb-4">{message}</p>

          {/* Privileges/Consequences List */}
          {type === 'approve' ? (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Privilèges accordés:
              </p>
              {privileges.map((privilege, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className={`${privilege.color} font-bold text-lg`}>
                    {privilege.icon}
                  </span>
                  <span className="text-sm text-gray-700">{privilege.text}</span>
                </div>
              ))}
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-900">
                  <span className="font-semibold">Type de compte:</span> Client → 
                  <span className="font-bold text-green-700"> Artisan/Promoteur</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Conséquences du rejet:
              </p>
              {rejectConsequences.map((consequence, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className={`${consequence.color} font-bold text-lg`}>
                    {consequence.icon}
                  </span>
                  <span className="text-sm text-gray-700">{consequence.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Note Input for Reject */}
          {showNoteInput && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Raison du rejet (optionnel):
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Cette note sera visible pour l'utilisateur..."
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${
              type === 'approve'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
