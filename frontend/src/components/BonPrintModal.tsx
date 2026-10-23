import React, { useEffect, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Printer, Download, X } from 'lucide-react';
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
  const [previewScale, setPreviewScale] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(794);
  const [previewHeight, setPreviewHeight] = useState(1123);
  useEffect(() => {
    if (!isOpen) return;
    const updatePreview = () => {
      const page = printRef.current;
      if (!page) return;
      setPreviewWidth(page.offsetWidth);
      setPreviewScale(window.innerWidth < 640 ? Math.min(1, (window.innerWidth - 32) / page.offsetWidth) : 1);
      setPreviewHeight(Math.max(page.scrollHeight, page.offsetHeight));
    };
    updatePreview();
    const observer = new ResizeObserver(updatePreview);
    if (printRef.current) observer.observe(printRef.current);
    window.addEventListener('resize', updatePreview);
    return () => { observer.disconnect(); window.removeEventListener('resize', updatePreview); };
  }, [isOpen]);
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

      // Capturer la taille A4 réelle, indépendamment de l'aperçu réduit sur téléphone.
      const page = printRef.current;
      const safeScale = Math.min(1.5, 16000 / Math.max(page.scrollHeight, page.offsetHeight));
      const canvas = await html2canvas(page, {
          scale: safeScale,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: clonedDocument => {
            const clonedPage = clonedDocument.querySelector<HTMLElement>('[data-bon-pdf-page]');
            if (!clonedPage) return;
            clonedPage.style.transform = 'none';
            let ancestor = clonedPage.parentElement;
            while (ancestor) {
              ancestor.style.overflow = 'visible';
              ancestor.style.overflowX = 'visible';
              ancestor.style.overflowY = 'visible';
              ancestor.scrollTop = 0;
              ancestor = ancestor.parentElement;
            }
          },
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

      // Garder la largeur A4 et répartir les longs bons sur plusieurs pages.
      const imgWidth = pdfWidth;
      const imgHeight = canvasHeight * imgWidth / canvasWidth;
      const imgData = canvas.toDataURL('image/jpeg', 0.8);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'MEDIUM');
      for (let offset = pdfHeight; offset < imgHeight - 1; offset += pdfHeight) {
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -offset, imgWidth, imgHeight, undefined, 'MEDIUM');
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[95vh] sm:max-w-6xl sm:rounded-xl">
        {/* En-tête modal */}
        <div className="shrink-0 border-b border-slate-200 bg-white p-4 sm:bg-slate-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 sm:hidden">Document PDF · A4</p>
              <h2 className="truncate text-lg font-semibold text-slate-900 sm:whitespace-normal">
                <span className="sm:hidden">{documentTitle} {displayNumero}</span>
                <span className="hidden sm:inline">Aperçu d'impression - {documentTitle} {displayNumero}</span>
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer l'aperçu" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 sm:hidden"><X size={20} /></button>
            <div className="hidden items-center gap-2 sm:flex">
              <button onClick={handlePrint} disabled={isGenerating} className="flex items-center rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"><Printer size={16} className="mr-1" />Imprimer</button>
              <button onClick={generatePDF} disabled={isGenerating} className="flex items-center rounded-lg border border-blue-600 px-3 py-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Download size={16} className="mr-1" />{isGenerating ? 'Génération...' : 'PDF'}</button>
              <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-100">Fermer</button>
            </div>
          </div>
            
            {/* Format fixé à A4 */}
            <div className="mt-3 flex flex-wrap items-center gap-3 sm:mt-2">
              <span className="hidden text-sm text-gray-600 sm:inline">Format: A4 (210x297mm)</span>
              {!projectContext && <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={usePromo}
                  onChange={(e) => setUsePromo(e.target.checked)}
                />
                <span>Utiliser promo</span>
              </label>}
              <label htmlFor="bon-images-select" className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
                Images produit :
                <select
                  id="bon-images-select"
                  value={includeProductImages ? 'with' : 'without'}
                  disabled={isGenerating}
                  onChange={event => setIncludeProductImages(event.target.value === 'with')}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  <option value="without">Sans images</option>
                  <option value="with">Avec images</option>
                </select>
              </label>
            </div>
        </div>

        {/* Zone d'aperçu */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-4">
          <div className="flex justify-center">
            <div style={{ width: `${previewWidth * previewScale}px`, height: `${previewHeight * previewScale}px` }}>
            <div 
              ref={printRef}
              data-bon-pdf-page
              className="origin-top-left bg-white shadow-lg"
              style={{
                width: '210mm',
                minHeight: '297mm',
                transform: `scale(${previewScale})`,
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
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
          <button type="button" onClick={generatePDF} disabled={isGenerating} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white shadow-sm active:bg-blue-700 disabled:opacity-50"><Download size={18} />{isGenerating ? 'Génération du PDF...' : 'Télécharger PDF'}</button>
        </div>
        <div className="hidden border-t bg-gray-50 p-2 text-center text-xs text-gray-600 sm:block">
          Aperçu d'impression - Les couleurs peuvent différer de l'impression finale
        </div>
      </div>
    </div>
  );
};

export default BonPrintModal;
