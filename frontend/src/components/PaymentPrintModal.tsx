import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Printer, Download } from 'lucide-react';
import PaymentPrintTemplate from './PaymentPrintTemplate';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';

interface PaymentPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  client?: any;
  fournisseur?: any;
  allPayments?: any[]; // Tous les paiements pour le calcul du solde
}

const PaymentPrintModal: React.FC<PaymentPrintModalProps> = ({
  isOpen,
  onClose,
  payment,
  client,
  fournisseur,
  allPayments = [],
}) => {
  const [size, setSize] = useState<'A4' | 'A5'>('A4');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Récupérer les bons nécessaires pour le calcul du solde cumulé (comme ContactsPage)
  const { data: sorties = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: comptants = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: commandes = [] } = useGetBonsByTypeQuery('Commande');
  const { data: avoirsClient = [] } = useGetBonsByTypeQuery('Avoir');
  const { data: avoirsFournisseur = [] } = useGetBonsByTypeQuery('AvoirFournisseur');

  if (!isOpen) return null;

  // Fonction pour générer le PDF
  const generatePDF = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);
    let hiddenEls: Element[] = [];
    let previousDisplay: string[] = [];
    try {
      hiddenEls = Array.from(printRef.current.querySelectorAll('.print-hidden'));
      previousDisplay = hiddenEls.map(el => (el as HTMLElement).style.display);
      hiddenEls.forEach(el => { (el as HTMLElement).style.display = 'none'; });
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: size.toLowerCase() as 'a4' | 'a5',
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const ratio = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
      const imgWidth = canvasWidth * ratio;
      const imgHeight = canvasHeight * ratio;
      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfHeight - imgHeight) / 2;
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      const fileName = `Paiement_${payment.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      if (printRef.current) {
        const els = Array.from(printRef.current.querySelectorAll('.print-hidden'));
        els.forEach((el, i) => { (el as HTMLElement).style.display = previousDisplay[i] || ''; });
      }
      setIsGenerating(false);
    }
  };

  // Fonction pour imprimer directement
  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const doc = printWindow.document;
    doc.title = `Impression Paiement ${payment.id}`;
    // Styles de la page et @page size
    const styleEl = doc.createElement('style');
    let collectedCss = '';
    for (const styleSheet of Array.from(document.styleSheets)) {
      try {
        collectedCss += Array.from((styleSheet as CSSStyleSheet).cssRules).map(r => r.cssText).join('');
      } catch {
        // Ignorer les CORS errors
      }
    }
    styleEl.textContent = `body { margin: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: ${size}; margin: 0.5cm; }
@media print { body { margin: 0; } .print-hidden { display: none !important; } }
${collectedCss}`;
    doc.head.appendChild(styleEl);
    // Contenu
    const container = doc.createElement('div');
    container.innerHTML = printRef.current?.innerHTML || '';
    doc.body.appendChild(container);
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white shadow-xl w-screen h-screen sm:w-full sm:h-auto sm:max-w-4xl sm:max-h-[95vh] overflow-hidden flex flex-col rounded-none sm:rounded-lg">
        {/* En-tête modal */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-b bg-gray-50 sticky top-0 z-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
            <h2 className="text-base sm:text-lg font-semibold truncate max-w-[80vw] sm:max-w-none">Aperçu impression Paiement N° {payment.id}</h2>
            <div className="flex items-center flex-wrap gap-2">
              <label htmlFor="size-selector" className="text-sm font-medium hidden sm:block">Taille:</label>
              <select
                id="size-selector"
                value={size}
                onChange={(e) => setSize(e.target.value as 'A4' | 'A5')}
                className="px-2 py-1 sm:px-3 sm:py-1.5 border border-gray-300 rounded-md text-sm"
              >
                <option value="A4">A4 (210x297mm)</option>
                <option value="A5">A5 (148x210mm)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              onClick={handlePrint}
              disabled={isGenerating}
              title="Imprimer"
              aria-label="Imprimer"
              className="flex items-center px-2 py-1 text-sm sm:px-3 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Printer size={16} className="mr-1" />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
            <button
              onClick={generatePDF}
              disabled={isGenerating}
              title="Télécharger PDF"
              aria-label="Télécharger PDF"
              className="flex items-center px-2 py-1 text-sm sm:px-3 sm:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <Download size={16} className="mr-1" />
              <span className="hidden sm:inline">{isGenerating ? 'Génération...' : 'PDF'}</span>
            </button>
            <button
              onClick={onClose}
              title="Fermer"
              aria-label="Fermer"
              className="px-2 py-1 text-sm sm:px-3 sm:py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              <span className="">Fermer</span>
            </button>
          </div>
        </div>
        {/* Zone d'aperçu */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex justify-center">
            <div
              ref={printRef}
              className={`bg-white shadow-lg w-full ${size === 'A5' ? 'print:w-[148mm] print:min-h-[210mm]' : 'print:w-[210mm] print:min-h-[297mm]'}`}
            >
              <PaymentPrintTemplate 
                payment={payment} 
                client={client} 
                fournisseur={fournisseur} 
                size={size} 
                allPayments={allPayments}
                bonsSorties={sorties}
                bonsComptants={comptants}
                bonsCommandes={commandes}
                bonsAvoirsClient={avoirsClient}
                bonsAvoirsFournisseur={avoirsFournisseur}
              />
            </div>
          </div>
        </div>
        <div className="p-2 border-t bg-gray-50 text-xs text-gray-600 text-center">
          Aperçu impression - Les couleurs peuvent différer de l'impression finale
        </div>
      </div>
    </div>
  );
};

export default PaymentPrintModal;
