import React, { useEffect, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, X } from 'lucide-react';
import type { Contact } from '../types';
import ContactPrintTemplate, { type CompanyType, type ContactPrintMode, type PriceMode } from './ContactPrintTemplate';
import { useGetProductsQuery } from '../store/api/productsApi';
import { DESIGNATION_LANG_OPTIONS, type DesignationLang } from '../utils/designationLang';
import { waitForPrintImages } from '../utils/waitForPrintImages';

interface ContactPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel?: string;
  contact: Contact;
  mode: ContactPrintMode; // 'transactions' | 'products'
  transactions?: any[]; // Rendu optionnel car onglet transactions supprimé
  productHistory: any[];
  dateFrom?: string;
  dateTo?: string;
  // When true, do not inject the synthetic initial balance row in the template
  skipInitialRow?: boolean;
  // When true, hide the Solde Cumulé column (compact/selection mode)
  hideCumulative?: boolean;
  // Pre-calculated totals from the page (to avoid recalculation mismatch)
  totalQty?: number;
  totalAmount?: number;
  finalSolde?: number;
  // Débit / Crédit totals
  totalDebit?: number;
  totalCredit?: number;
  totalDebitSubtitle?: string;
}

const ContactPrintModal: React.FC<ContactPrintModalProps> = ({ isOpen, onClose, closeLabel = "Fermer l'aperçu", contact, mode, transactions = [], productHistory, dateFrom, dateTo, skipInitialRow = false, hideCumulative = false, totalQty, totalAmount, finalSolde, totalDebit, totalCredit, totalDebitSubtitle }) => {
  const size = 'A4'; // Taille fixe A4
  const [company, setCompany] = useState<CompanyType>('DIAMOND');
  const [priceMode, setPriceMode] = useState<PriceMode>('WITH_PRICES');
  const [designationLang, setDesignationLang] = useState<DesignationLang>('fr');
  const [includeProductImages, setIncludeProductImages] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(794);
  const [previewHeight, setPreviewHeight] = useState(1123);
  useEffect(() => {
    if (!isOpen) return;
    const updatePreview = () => {
      const page = printRef.current;
      const container = previewContainerRef.current;
      if (!page || !container) return;
      const contentWidth = Math.max(page.scrollWidth, page.offsetWidth);
      setPreviewWidth(contentWidth);
      setPreviewScale(Math.min(1, container.clientWidth / contentWidth));
      setPreviewHeight(Math.max(page.scrollHeight, page.offsetHeight));
    };
    updatePreview();
    const observer = new ResizeObserver(updatePreview);
    if (printRef.current) observer.observe(printRef.current);
    if (previewContainerRef.current) observer.observe(previewContainerRef.current);
    window.addEventListener('resize', updatePreview);
    return () => { observer.disconnect(); window.removeEventListener('resize', updatePreview); };
  }, [isOpen]);
  // Catalogue produits pour les désignations traduites (cache RTK Query partagé)
  const { data: products = [] } = useGetProductsQuery(undefined, {
    skip: !isOpen || (designationLang === 'fr' && (mode !== 'products' || !includeProductImages)),
  });

  if (!isOpen) return null;

  const generatePDF = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);
    try {
      // html2canvas can truncate very tall content when the canvas exceeds browser limits.
      // We dynamically reduce scale for tall pages and generate a multi-page PDF.
      const el = printRef.current;
      await waitForPrintImages(el);
      const baseScale = 1.5;
      const MAX_CANVAS_PX = 16384; // conservative (varies by browser/GPU)
      const elHeight = Math.max(el.scrollHeight, el.offsetHeight);
      const safeScale = Math.min(baseScale, MAX_CANVAS_PX / Math.max(1, elHeight));
      const canvas = await html2canvas(el, {
          scale: safeScale,
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: false,
          logging: false,
          onclone: clonedDocument => {
            const clonedPage = clonedDocument.querySelector<HTMLElement>('[data-contact-pdf-page]');
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

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: size.toLowerCase() as 'a4' | 'a5', compress: true });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      // Fit to page width; paginate vertically if needed
      const imgData = canvas.toDataURL('image/jpeg', 0.80);
      const imgW = pdfW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let y = 0;
      pdf.addImage(imgData, 'JPEG', 0, y, imgW, imgH, undefined, 'MEDIUM');

      // Add pages while there is still content below the current page
      let heightLeft = imgH - pdfH;
      while (heightLeft > 1) {
        y -= pdfH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, y, imgW, imgH, undefined, 'MEDIUM');
        heightLeft -= pdfH;
      }

      const fileName = `Contact_${contact?.nom_complet || contact?.id}_${mode}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-xl">
        <div className="shrink-0 border-b border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Aperçu PDF A4</p>
              <h2 className="truncate text-lg font-semibold text-slate-900">{contact?.nom_complet}</h2>
              <p className="text-sm text-slate-500">{mode === 'transactions' ? 'Détail des transactions' : 'Détail des produits'}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600"><X size={20} /></button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Société
              <select id="contact-company-select" value={company} onChange={(e) => setCompany(e.target.value as CompanyType)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"><option value="DIAMOND">BOUKIR DIAMOND</option><option value="MPC">BOUKIR MPC</option></select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Prix
              <select id="contact-price-select" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"><option value="WITH_PRICES">Avec prix</option><option value="WITHOUT_PRICES">Sans prix</option></select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Langue désignation
              <select id="contact-designation-lang" value={designationLang} onChange={(e) => setDesignationLang(e.target.value as DesignationLang)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900">{DESIGNATION_LANG_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
            </label>
            {mode === 'products' && <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Images produit
              <select id="contact-images-select" value={includeProductImages ? 'with' : 'without'} disabled={isGenerating} onChange={event => setIncludeProductImages(event.target.value === 'with')} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"><option value="with">Avec images</option><option value="without">Sans images</option></select>
            </label>}
          </div>
          {mode === 'products' && totalQty !== undefined && (
            <p className="mt-3 text-sm font-medium text-slate-700">
              Quantité totale : <strong className="text-slate-900">{totalQty.toLocaleString('fr-FR')}</strong>
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div ref={previewContainerRef} className="flex w-full justify-center">
            <div style={{ width: `${previewWidth * previewScale}px`, height: `${previewHeight * previewScale}px` }}>
            <div ref={printRef} data-contact-pdf-page className="origin-top-left bg-white shadow-lg" style={{ width: '210mm', minHeight: '297mm', transform: `scale(${previewScale})` }}>
              <ContactPrintTemplate
                contact={contact}
                mode={mode}
                transactions={transactions}
                productHistory={productHistory}
                dateFrom={dateFrom}
                dateTo={dateTo}
                companyType={company}
                priceMode={priceMode}
                size={size}
                skipInitialRow={skipInitialRow}
                hideCumulative={hideCumulative}
                totalQty={totalQty}
                totalAmount={totalAmount}
                finalSolde={finalSolde}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                totalDebitSubtitle={totalDebitSubtitle}
                designationLang={designationLang}
                products={products as any[]}
                includeProductImages={includeProductImages}
              />
            </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={generatePDF} disabled={isGenerating} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white shadow-sm active:bg-blue-700 disabled:opacity-50"><Download size={18} />{isGenerating ? 'Génération du PDF...' : 'Télécharger PDF'}</button>
        </div>
      </div>
    </div>
  );
};

export default ContactPrintModal;
