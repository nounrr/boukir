import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import type { ProjetTablePrintOptions } from '../../utils/projetTablePrint';
import { prepareProjetReportPrint } from '../../utils/projetBonPrint';
import BonPrintModal from '../BonPrintModal';
import { secondaryButton } from './shared';

const TablePrintButton: React.FC<{
  report: ProjetTablePrintOptions;
  disabled?: boolean;
  label?: string;
  className?: string;
}> = ({ report, disabled, label = 'Imprimer le tableau', className = secondaryButton }) => {
  const [printing, setPrinting] = useState<ReturnType<typeof prepareProjetReportPrint> | null>(null);
  return <>
    <button type="button" className={className} disabled={disabled} onClick={() => setPrinting(prepareProjetReportPrint(report))}>
      <Printer className="h-4 w-4" /> {label}
    </button>
    {printing && <BonPrintModal isOpen onClose={() => setPrinting(null)} {...printing} />}
  </>;
};

export default TablePrintButton;
