import React from 'react';
import DesktopBonPrintModal from './DesktopBonPrintModal';
import MobileBonPrintModal from './MobileBonPrintModal';
import { useMobilePrintModal } from '../hooks/useMobilePrintModal';

type Props = React.ComponentProps<typeof DesktopBonPrintModal>;

const BonPrintModal: React.FC<Props> = (props) => {
  const isMobile = useMobilePrintModal();
  return isMobile ? <MobileBonPrintModal {...props} /> : <DesktopBonPrintModal {...props} />;
};

export default BonPrintModal;
