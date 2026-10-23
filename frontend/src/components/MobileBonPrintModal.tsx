import React, { useEffect, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, X } from 'lucide-react';
import BonPrintTemplate from './BonPrintTemplate';
import MobileBonReader from './MobileBonReader';
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
  const [activeTab, setActiveTab] = useState<'list' | 'pdf'>('list');
  const contentRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [usePromo, setUsePromo] = useState(false);
  const [includeProductImages, setIncludeProductImages] = useState(true);
  const [designationLang, setDesignationLang] = useState<DesignationLang>('fr');
  const [previewScale, setPreviewScale] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(794);
  const [previewHeight, setPreviewHeight] = useState(1123);
  useEffect(() => {
    if (!isOpen || activeTab !== 'pdf') return;
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
  }, [isOpen, activeTab]);
  useEffect(() => { if (isOpen) setActiveTab('list'); }, [isOpen]);
  useEffect(() => { contentRef.current?.scrollTo(0, 0); }, [activeTab]);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-xl">
        {/* En-tête modal */}
        <div className="shrink-0 border-b border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Lecture sur téléphone</p>
              <h2 className="truncate text-lg font-semibold text-slate-900">{documentTitle} {displayNumero}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer l'aperçu" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600"><X size={20} /></button>
          </div>
            
            {/* Format fixé à A4 */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
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
            <div role="tablist" aria-label="Mode d'aperçu" className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
              <button type="button" role="tab" aria-selected={activeTab === 'list'} disabled={isGenerating} onClick={() => setActiveTab('list')} className={`min-h-10 rounded-md text-sm font-semibold disabled:opacity-50 ${activeTab === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>Liste</button>
              <button type="button" role="tab" aria-selected={activeTab === 'pdf'} disabled={isGenerating} onClick={() => setActiveTab('pdf')} className={`min-h-10 rounded-md text-sm font-semibold disabled:opacity-50 ${activeTab === 'pdf' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>PDF A4</button>
            </div>
        </div>

        {/* Choix entre la lecture mobile et l'aperçu A4 utilisé pour le téléchargement. */}
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {activeTab === 'list' ? (
            <MobileBonReader bon={bon} client={client} fournisseur={fournisseur} products={effectiveProducts} designationLang={designationLang} includeProductImages={includeProductImages} title={documentTitle} reference={displayNumero} />
          ) : (
          <div ref={previewContainerRef} className="flex w-full justify-center">
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
          )}
        </div>

        {activeTab === 'pdf' && <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={generatePDF} disabled={isGenerating} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white shadow-sm active:bg-blue-700 disabled:opacity-50"><Download size={18} />{isGenerating ? 'Génération du PDF...' : 'Télécharger PDF'}</button>
        </div>}
      </div>
    </div>
  );
};

export default BonPrintModal;
