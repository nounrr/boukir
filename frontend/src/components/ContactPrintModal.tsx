import React from 'react';
import DesktopContactPrintModal from './DesktopContactPrintModal';
import MobileContactPrintModal from './MobileContactPrintModal';
import { useMobilePrintModal } from '../hooks/useMobilePrintModal';

type Props = React.ComponentProps<typeof DesktopContactPrintModal>;

const ContactPrintModal: React.FC<Props> = (props) => {
  const isMobile = useMobilePrintModal();
  return isMobile ? <MobileContactPrintModal {...props} /> : <DesktopContactPrintModal {...props} />;
};

export default ContactPrintModal;
