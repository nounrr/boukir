import React from 'react';
import { Printer } from 'lucide-react';
import { printProjetTable, type ProjetTablePrintOptions } from '../../utils/projetTablePrint';
import { showError } from '../../utils/notifications';
import { secondaryButton } from './shared';

const TablePrintButton: React.FC<{
  report: ProjetTablePrintOptions;
  disabled?: boolean;
  label?: string;
  className?: string;
}> = ({ report, disabled, label = 'Imprimer le tableau', className = secondaryButton }) => (
  <button type="button" className={className} disabled={disabled} onClick={() => {
    if (!printProjetTable(report)) showError('Autorisez les fenêtres contextuelles pour ouvrir l’impression.');
  }}><Printer className="h-4 w-4" /> {label}</button>
);

export default TablePrintButton;
