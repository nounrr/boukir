import React from 'react';
import { Receipt } from 'lucide-react';
import type { UseRemiseEditorResult } from '../hooks/useRemiseEditor';

interface RemiseEditorBarProps {
  editor: UseRemiseEditorResult;
  className?: string;
}

export const RemiseEditorBar: React.FC<RemiseEditorBarProps> = ({ editor, className = '' }) => {
  const {
    showRemiseMode,
    eligibleItems,
    selectedItemsForRemise,
    remisePrices,
    enterMode,
    cancelMode,
    clearSelection,
    handleValidate,
  } = editor;

  const totalRemise = Array.from(selectedItemsForRemise).reduce((sum, id) => {
    const item = eligibleItems.find((i) => String(i.id) === String(id));
    if (!item) return sum;
    const price = Number(remisePrices[id] ?? 0) || 0;
    return sum + price * Number(item.quantite || 0);
  }, 0);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (showRemiseMode ? cancelMode() : enterMode('abonne'))}
          disabled={!showRemiseMode && eligibleItems.length === 0}
          className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
            showRemiseMode
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <Receipt size={14} />
          {showRemiseMode ? 'Annuler' : `Modifier Remise Abonné (${eligibleItems.length})`}
        </button>
      </div>

      {showRemiseMode && selectedItemsForRemise.size > 0 && (
        <div className="mt-3 rounded-lg p-4 border bg-blue-50 border-blue-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h4 className="font-bold mb-1 text-blue-800">Remises Abonné à enregistrer</h4>
              <p className="text-sm text-blue-700">
                {selectedItemsForRemise.size} article{selectedItemsForRemise.size > 1 ? 's' : ''} • Total : {totalRemise.toFixed(3)} DH
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={handleValidate}
                className="px-4 py-2 text-white rounded-md transition-colors bg-blue-600 hover:bg-blue-700"
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemiseEditorBar;
