import React, { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Printer, Download } from 'lucide-react';
import BonPrintTemplate from './BonPrintTemplate';
import { getBonNumeroDisplay } from '../utils/numero';
import type { ProjetPrintContext } from '../utils/projetBonPrint';
import type { Contact } from '../types';
import { useGetComptantPaymentsQuery } from '../store/api/comptantApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import type { DesignationLang } from '../utils/designationLang';
import { waitForPrintImages } from '../utils/waitForPrintImages';

interface BonPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  bon: any;
  client?: Contact;
  fournisseur?: Contact;
  products?: any[];
  projectContext?: ProjetPrintContext;
}

const BonPrintModal: React.FC<BonPrintModalProps> = ({
  isOpen,
  onClose,
  bon,
  client,
  fournisseur,
  products,
  projectContext
}) => {
  // Taille fixée à A4 par défaut
  const size = 'A4' as const;
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [usePromo, setUsePromo] = useState(false);
  const [includeProductImages, setIncludeProductImages] = useState(true);
  const [designationLang, setDesignationLang] = useState<DesignationLang>('fr');
  // Les traductions viennent du catalogue produits: on le charge si l'appelant ne l'a pas fourni
  // (RTK Query réutilise le cache s'il est déjà chargé ailleurs).
  const { data: fetchedProducts = [] } = useGetProductsQuery(undefined, {
    skip: !isOpen || Boolean(projectContext) || (Array.isArray(products) && products.length > 0),
  });
  const effectiveProducts = projectContext ? [] : (Array.isArray(products) && products.length > 0)
    ? products
    : (fetchedProducts as any[]);
  const isUnpaidComptant = bon?.type === 'Comptant'
    && (Number(bon?.reste || 0) > 0 || bon?.non_paye === true || Number(bon?.non_paye ?? 0) === 1);
  const { data: comptantPayments = [] } = useGetComptantPaymentsQuery(bon?.id, {
    skip: !isOpen || !bon?.id || !isUnpaidComptant,
  });

  const displayNumero = projectContext?.reference ?? getBonNumeroDisplay(bon);
  const documentTitle = projectContext?.title ?? bon?.type;
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

      await waitForPrintImages(printRef.current);

      // Capture avec moins de scale pour fichiers plus légers
      const canvas = await html2canvas(printRef.current, {
        scale: 1.5, // Réduit de 2 à 1.5
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff'
      });

      // Créer le PDF avec compression
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: size.toLowerCase() as 'a4' | 'a5',
        compress: true // Active la compression
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

      // Ajouter l'image au PDF en JPEG compressé au lieu de PNG
      const imgData = canvas.toDataURL('image/jpeg', 0.75); // JPEG qualité 75%
      pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight, undefined, 'MEDIUM');

      // Télécharger le PDF
  const fileName = `${documentTitle}_${displayNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
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
  const handlePrint = async () => {
    if (!printRef.current) return;

    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impression ${documentTitle} ${displayNumero}</title>
          <style>
            body { 
              margin: 0; 
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page { 
              size: ${size}; 
              /* IMPORTANT: keep 0 margin to avoid forcing extra pages.
                 Some browsers ignore @page rules placed inside the body (e.g. inside BonPrintTemplate).
                 Defining it here ensures the printed area matches the template dimensions. */
              margin: 0;
            }
            @media print {
              html, body { margin: 0 !important; padding: 0 !important; }
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
    
    // Attendre les photos avant d'ouvrir le dialogue d'impression.
    await waitForPrintImages(printWindow.document.body);
    if (!printWindow.closed) {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* En-tête modal */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">
              Aperçu d'impression - {documentTitle} {displayNumero}
            </h2>
            
            {/* Format fixé à A4 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Format: A4 (210x297mm)</span>
              {!projectContext && <label className="ml-4 flex items-center space-x-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={usePromo}
                  onChange={(e) => setUsePromo(e.target.checked)}
                />
                <span>Utiliser promo</span>
              </label>}
              <label htmlFor="bon-images-select" className="ml-4 flex items-center gap-2 text-sm text-gray-700">
                Images produit :
                <select
                  id="bon-images-select"
                  value={includeProductImages ? 'with' : 'without'}
                  disabled={isGenerating}
                  onChange={event => setIncludeProductImages(event.target.value === 'with')}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="without">Sans images</option>
                  <option value="with">Avec images</option>
                </select>
              </label>
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
                width: '210mm',
                minHeight: '297mm'
              }}
            >
              <BonPrintTemplate
                bon={bon}
                projectContext={projectContext}
                client={client}
                fournisseur={fournisseur}
                products={effectiveProducts}
                size={size}
                usePromo={usePromo}
                paymentHistory={comptantPayments as any[]}
                designationLang={designationLang}
                onDesignationLangChange={setDesignationLang}
                includeProductImages={includeProductImages}
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
