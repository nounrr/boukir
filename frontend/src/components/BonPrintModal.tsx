import React, { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Printer, Download } from 'lucide-react';
import BonPrintTemplate from './BonPrintTemplate';
import type { Contact } from '../types';

interface BonPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  bon: any;
  client?: Contact;
  fournisseur?: Contact;
}

const BonPrintModal: React.FC<BonPrintModalProps> = ({
  isOpen,
  onClose,
  bon,
  client,
  fournisseur
}) => {
  const [size, setSize] = useState<'A4' | 'A5'>('A4');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Fonction pour générer le PDF
  const generatePDF = async () => {
    if (!printRef.current) return;

    setIsGenerating(true);
    let hiddenEls: HTMLElement[] = [];
    let previousDisplay: string[] = [];
    try {
      // hide controls inside the print area that should not appear in PDF (elements with .print-hidden)
      hiddenEls = Array.from(printRef.current.querySelectorAll('.print-hidden')) as HTMLElement[];
      previousDisplay = hiddenEls.map(el => el.style.display);
      hiddenEls.forEach(el => { el.style.display = 'none'; });

      // Capture
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      // Créer le PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: size.toLowerCase() as 'a4' | 'a5'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      // Calculer le ratio pour ajuster l'image
      const ratio = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
      const imgWidth = canvasWidth * ratio;
      const imgHeight = canvasHeight * ratio;

      // Centrer l'image
      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfHeight - imgHeight) / 2;

      // Ajouter l'image au PDF
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);

      // Télécharger le PDF
      const fileName = `${bon.type}_${bon.numero}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      // restore hidden elements
      if (printRef.current) {
        const els = Array.from(printRef.current.querySelectorAll('.print-hidden')) as HTMLElement[];
        els.forEach((el, i) => { el.style.display = previousDisplay[i] || ''; });
      }
      setIsGenerating(false);
    }
  };

  // Fonction pour imprimer directement
  const handlePrint = () => {
    if (!printRef.current) return;

    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impression ${bon.type} ${bon.numero}</title>
          <style>
            body { 
              margin: 0; 
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page { 
              size: ${size}; 
              margin: 0.5cm;
            }
            @media print {
              body { margin: 0; }
              .print-hidden { display: none !important; }
            }
            ${Array.from(document.styleSheets).map(styleSheet => {
              try {
                return Array.from(styleSheet.cssRules).map(rule => rule.cssText).join('');
              } catch (error) {
                console.error('Error loading CSS:', error);
                return '';
              }
            }).join('')}
          </style>
        </head>
        <body>
          ${printRef.current?.innerHTML || ''}
        </body>
      </html>
    `);

    printWindow.document.close();
    
    // Attendre que le contenu se charge puis imprimer
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* En-tête modal */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">
              Aperçu d'impression - {bon.type} {bon.numero}
            </h2>
            
            {/* Sélecteur de taille */}
            <div className="flex items-center space-x-2">
              <label htmlFor="size-selector" className="text-sm font-medium">Taille:</label>
              <select
                id="size-selector"
                value={size}
                onChange={(e) => setSize(e.target.value as 'A4' | 'A5')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="A4">A4 (210x297mm)</option>
                <option value="A5">A5 (148x210mm)</option>
              </select>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              disabled={isGenerating}
              className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Printer size={16} className="mr-1" />
              Imprimer
            </button>
            
            <button
              onClick={generatePDF}
              disabled={isGenerating}
              className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <Download size={16} className="mr-1" />
              {isGenerating ? 'Génération...' : 'PDF'}
            </button>
            
            <button
              onClick={onClose}
              className="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Fermer
            </button>
          </div>
        </div>

        {/* Zone d'aperçu */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex justify-center">
            <div 
              ref={printRef}
              className="bg-white shadow-lg"
              style={{
                width: size === 'A5' ? '148mm' : '210mm',
                minHeight: size === 'A5' ? '210mm' : '297mm'
              }}
            >
              <BonPrintTemplate
                bon={bon}
                client={client}
                fournisseur={fournisseur}
                size={size}
              />
            </div>
          </div>
        </div>

        {/* Informations en bas */}
        <div className="p-2 border-t bg-gray-50 text-xs text-gray-600 text-center">
          Aperçu d'impression - Les couleurs peuvent différer de l'impression finale
        </div>
      </div>
    </div>
  );
};

export default BonPrintModal;
