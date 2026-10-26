import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ChevronDown, Download, X } from 'lucide-react';
import type { Contact } from '../types';
import ContactPrintTemplate, { type CompanyType, type ContactPrintMode, type PriceMode } from './ContactPrintTemplate';
import { useGetProductsQuery } from '../store/api/productsApi';
import { DESIGNATION_LANG_OPTIONS, type DesignationLang } from '../utils/designationLang';
import { waitForPrintImages } from '../utils/waitForPrintImages';
import { contactHistoryTotals, contactHistoryTransactions, filterContactHistory, historyDocumentKey, historyOperation, historyOperationLabels, selectedContactHistory, type ContactHistoryKind, type HistoryFilters } from '../utils/mobileContactHistory';

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
  historyKind?: ContactHistoryKind;
}

const ContactPrintModal: React.FC<ContactPrintModalProps> = ({ isOpen, onClose, closeLabel = "Fermer l'aperçu", contact, mode, transactions = [], productHistory, dateFrom, dateTo, skipInitialRow = false, hideCumulative = false, totalQty, totalAmount, finalSolde, totalDebit, totalCredit, totalDebitSubtitle, historyKind }) => {
  const size = 'A4'; // Taille fixe A4
  const [company, setCompany] = useState<CompanyType>('DIAMOND');
  const [priceMode, setPriceMode] = useState<PriceMode>('WITH_PRICES');
  const [designationLang, setDesignationLang] = useState<DesignationLang>('fr');
  const [includeProductImages, setIncludeProductImages] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [filters, setFilters] = useState<HistoryFilters>({ from: dateFrom || '', to: dateTo || '', search: '', operation: '' });
  const [selectedRows, setSelectedRows] = useState<Set<string> | null>(null);
  const [openPanel, setOpenPanel] = useState<'filters' | 'selection' | 'options' | null>(null);
  const [showDetail, setShowDetail] = useState(true);
  const [showCumulative, setShowCumulative] = useState(!hideCumulative);
  const [selectionLimit, setSelectionLimit] = useState(30);
  useEffect(() => {
    setFilters({ from: dateFrom || '', to: dateTo || '', search: '', operation: '' });
    setSelectedRows(null);
    setSelectionLimit(30);
    setOpenPanel(null);
  }, [contact.id, isOpen, dateFrom, dateTo]);
  const kind = historyKind ?? (contact.type === 'Fournisseur' ? 'supplier' : 'client');
  const filterable = mode === 'products';
  const hasFilters = filterable && Boolean(filters.from || filters.to || filters.search.trim() || filters.operation);
  const isScoped = hasFilters || selectedRows !== null;
  const filteredRows = useMemo(() => filterContactHistory(productHistory, filters), [productHistory, filters]);
  const previewRows = useMemo(() => selectedContactHistory(filteredRows, selectedRows, kind), [filteredRows, selectedRows, kind]);
  const filteredTotals = useMemo(() => contactHistoryTotals(previewRows, kind), [previewRows, kind]);
  const previewTotals = isScoped ? filteredTotals : { totalQty, totalAmount, finalSolde, totalDebit, totalCredit };
  const summaryTransactions = useMemo(() => contactHistoryTransactions(previewRows), [previewRows]);
  const operations = useMemo(() => [...new Set(productHistory.map(historyOperation))], [productHistory]);
  const documents = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const row of filteredRows) {
      const key = historyDocumentKey(row);
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    return [...groups.entries()];
  }, [filteredRows]);
  const updateFilters = (patch: Partial<HistoryFilters>) => {
    setFilters(previous => ({ ...previous, ...patch }));
    setSelectedRows(null);
    setSelectionLimit(30);
  };
  const toggleRows = (rows: any[]) => setSelectedRows(previous => {
    const next = new Set(previous ?? []);
    const remove = rows.every(row => next.has(String(row.id)));
    rows.forEach(row => remove ? next.delete(String(row.id)) : next.add(String(row.id)));
    return next;
  });
  const panelButton = (panel: 'filters' | 'selection' | 'options', label: string) => (
    <button type="button" aria-expanded={openPanel === panel} aria-controls={`contact-panel-${panel}`} onClick={() => setOpenPanel(openPanel === panel ? null : panel)}
      className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-700">
      {label}<ChevronDown size={16} className={openPanel === panel ? 'rotate-180' : ''} aria-hidden="true" />
    </button>
  );
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
    <div role="dialog" aria-modal="true" aria-label={`Détail de ${contact?.nom_complet}`} className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60">
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
          <fieldset disabled={isGenerating} className="mt-3 max-h-[42dvh] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-200">
            {filterable && <div>
              {panelButton('filters', `Filtres${hasFilters ? ' · actifs' : ''}`)}
              {openPanel === 'filters' && <div id="contact-panel-filters" className="grid grid-cols-2 gap-3 px-3 pb-3">
                <label className="col-span-2 text-xs font-medium text-slate-600">Rechercher
                  <input type="search" value={filters.search} onChange={event => updateFilters({ search: event.target.value })} placeholder="Produit, variante, référence, bon…" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
                </label>
                <label className="text-xs font-medium text-slate-600">Du
                  <input type="date" value={filters.from} max={filters.to || undefined} onChange={event => updateFilters({ from: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-slate-600">Au
                  <input type="date" value={filters.to} min={filters.from || undefined} onChange={event => updateFilters({ to: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-2 text-sm" />
                </label>
                <label className="col-span-2 text-xs font-medium text-slate-600">Type d’opération
                  <select value={filters.operation} onChange={event => updateFilters({ operation: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm">
                    <option value="">Complet — toutes les opérations</option>
                    {operations.map(operation => <option key={operation} value={operation}>{historyOperationLabels[operation] || operation}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => updateFilters({ from: dateFrom || '', to: dateTo || '', search: '', operation: '' })} className="col-span-2 min-h-10 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">Réinitialiser les filtres</button>
              </div>}
            </div>}
            {filterable && <div>
              {panelButton('selection', `Sélection des bons / lignes${selectedRows !== null ? ` · ${selectedRows.size}` : ''}`)}
              {openPanel === 'selection' && <div id="contact-panel-selection" className="px-3 pb-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSelectedRows(new Set(filteredRows.map(row => String(row.id))))} className="min-h-10 rounded-lg bg-blue-50 px-3 text-xs font-medium text-blue-700">Tout sélectionner</button>
                  <button type="button" onClick={() => setSelectedRows(null)} className="min-h-10 rounded-lg bg-slate-100 px-3 text-xs font-medium text-slate-700">Annuler la sélection</button>
                </div>
                {documents.slice(0, selectionLimit).map(([key, rows]) => <div key={key} className="border-t border-slate-100 py-1">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={rows.every(row => selectedRows?.has(String(row.id)))} onChange={() => toggleRows(rows)} className="h-5 w-5 shrink-0" />
                    {rows[0].bon_numero} <span className="font-normal text-slate-500">({rows.length})</span>
                  </label>
                  {rows.map(row => <label key={row.id} className="flex min-h-10 items-center gap-2 pl-5 text-xs text-slate-600">
                    <input type="checkbox" checked={selectedRows?.has(String(row.id)) ?? false} onChange={() => toggleRows([row])} className="h-4 w-4 shrink-0" />
                    <span>{row.product_reference ? `${row.product_reference} · ` : ''}{row.product_designation}{row.variant_name && row.variant_name !== '—' ? ` · ${row.variant_name}` : ''}</span>
                  </label>)}
                </div>)}
                {documents.length > selectionLimit && <button type="button" onClick={() => setSelectionLimit(value => value + 30)} className="min-h-11 text-sm text-blue-700">Afficher plus de bons</button>}
                {documents.length === 0 && <p className="py-3 text-sm text-slate-500">Aucune ligne à sélectionner.</p>}
              </div>}
            </div>}
            <div>
            {panelButton('options', 'Options PDF · prix, images, langue')}
            {openPanel === 'options' && <div id="contact-panel-options" className="grid grid-cols-2 gap-3 px-3 pb-3">
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
            {filterable && <label className="col-span-2 flex min-h-10 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showDetail} onChange={event => setShowDetail(event.target.checked)} className="h-5 w-5" />Détail des produits</label>}
            <label className="col-span-2 flex min-h-10 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showCumulative} onChange={event => setShowCumulative(event.target.checked)} className="h-5 w-5" />Afficher le solde cumulé</label>
            </div>}
            </div>
          </fieldset>
          {filterable && <p role="status" className="mt-2 text-xs text-slate-600">{previewRows.length === 0 ? 'Aucun résultat pour ces filtres.' : `${previewRows.length} ligne(s) · Quantité totale : ${(previewTotals.totalQty ?? filteredTotals.totalQty).toLocaleString('fr-FR')}`}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div ref={previewContainerRef} className="flex w-full justify-center">
            <div style={{ width: `${previewWidth * previewScale}px`, height: `${previewHeight * previewScale}px` }}>
            <div ref={printRef} data-contact-pdf-page className="origin-top-left bg-white shadow-lg" style={{ width: '210mm', minHeight: '297mm', transform: `scale(${previewScale})` }}>
              <ContactPrintTemplate
                contact={contact}
                mode={filterable && !showDetail ? 'transactions' : mode}
                transactions={filterable ? summaryTransactions : transactions}
                productHistory={previewRows}
                dateFrom={filters.from || undefined}
                dateTo={filters.to || undefined}
                companyType={company}
                priceMode={priceMode}
                size={size}
                skipInitialRow={skipInitialRow || isScoped}
                hideCumulative={!showCumulative}
                totalQty={previewTotals.totalQty}
                totalAmount={previewTotals.totalAmount}
                finalSolde={previewTotals.finalSolde}
                totalDebit={previewTotals.totalDebit}
                totalCredit={previewTotals.totalCredit}
                totalDebitSubtitle={isScoped && kind !== 'supplier' ? '(Opérations affichées)' : totalDebitSubtitle}
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
