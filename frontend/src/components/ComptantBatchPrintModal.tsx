import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import BonPrintTemplate from './BonPrintTemplate';
import ThermalPrintModal, { getThermalPrintCss } from './ThermalPrintModal';
import { useGetComptantPaymentsQuery } from '../store/api/comptantApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import { DESIGNATION_LANG_OPTIONS, type DesignationLang } from '../utils/designationLang';
import { waitForPrintImages } from '../utils/waitForPrintImages';
import { showError } from '../utils/notifications';

type PrintOptions = {
  company: 'DIAMOND' | 'MPC';
  promo: boolean;
  images: boolean;
  lang: DesignationLang;
  withPrices: boolean;
};

function BatchDocument({ bon, thermal, products, options, onReady }: {
  bon: any; thermal: boolean; products: any[]; options: PrintOptions;
  onReady: (id: number, ready: boolean) => void;
}) {
  const { data: payments = [], isFetching, isError } = useGetComptantPaymentsQuery(bon.id, { skip: thermal });
  useEffect(() => {
    onReady(Number(bon.id), thermal || (!isFetching && !isError));
  }, [bon.id, thermal, isFetching, isError, onReady]);
  const client = { nom_complet: bon.client_nom || 'Client comptant', telephone: bon.phone || '', adresse: bon.adresse_livraison || '' };
  return (
    <section data-batch-document className={`batch-document ${thermal ? 'thermal-container' : ''} bg-white shadow mx-auto mb-6`} style={{ width: thermal ? '80mm' : '210mm' }}>
      {thermal ? (
        <ThermalPrintModal isOpen onClose={() => {}} embedded bon={bon} type="Comptant" contact={client}
          products={products} company={options.company} withPrices={options.withPrices} promo={options.promo} />
      ) : (
        <BonPrintTemplate key={`${bon.id}-${options.company}`} bon={bon} client={client as any} products={products} paymentHistory={payments as any[]}
          companyType={options.company} usePromo={options.promo} includeProductImages={options.images}
          designationLang={options.lang} showDesignationLangSelect={false} />
      )}
      {!thermal && isError && <p className="print-hidden text-red-600 p-3">Impossible de charger les paiements de ce bon. Fermez puis réessayez.</p>}
    </section>
  );
}

export default function ComptantBatchPrintModal({ bons, mode, onClose }: {
  bons: any[]; mode: 'thermal' | 'pdf'; onClose: () => void;
}) {
  const thermal = mode === 'thermal';
  const previewRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [readyIds, setReadyIds] = useState<Set<number>>(new Set());
  const [options, setOptions] = useState<PrintOptions>({ company: 'DIAMOND', promo: false, images: true, lang: 'fr', withPrices: true });
  const { data: products = [], isFetching: productsLoading, isError: productsError } = useGetProductsQuery();
  const onReady = useCallback((id: number, ready: boolean) => {
    setReadyIds(previous => {
      if (previous.has(id) === ready) return previous;
      const next = new Set(previous);
      if (ready) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const ready = !productsLoading && !productsError && bons.every(bon => readyIds.has(Number(bon.id)));

  const print = async () => {
    if (!previewRef.current || !ready || busy) return;
    const popup = window.open('', '_blank');
    if (!popup) { showError("Autorisez les fenêtres d’impression dans votre navigateur."); return; }
    setBusy(true);
    try {
      popup.document.title = `Bons comptant - ${bons.length} bons`;
      const style = popup.document.createElement('style');
      const appCss = Array.from(document.styleSheets).map(sheet => {
        try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'); } catch { return ''; }
      }).join('\n');
      style.textContent = `${appCss}\n${thermal ? getThermalPrintCss() : '@page { size: A4; margin: 0; }'}
        html, body { margin: 0; padding: 0; height: auto; }
        .print-hidden { display: none !important; }
        .batch-document { margin: 0 !important; box-shadow: none !important; break-after: page; }
        .batch-document:last-child { break-after: auto; }
        ${thermal ? '.batch-document > div { margin: 0 !important; padding: 0 !important; border: 0 !important; }' : ''}`;
      popup.document.head.appendChild(style);
      popup.document.body.innerHTML = previewRef.current.innerHTML;
      await waitForPrintImages(popup.document.body);
      await popup.document.fonts.ready;
      if (!popup.closed) { popup.focus(); popup.print(); }
    } catch (error) {
      popup.close();
      console.error(error);
      showError("Impossible de préparer l’impression groupée.");
    } finally { setBusy(false); }
  };

  const download = async () => {
    if (!previewRef.current || !ready || busy) return;
    setBusy(true);
    try {
      await waitForPrintImages(previewRef.current);
      await document.fonts.ready;
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      let firstPage = true;
      for (const element of previewRef.current.querySelectorAll<HTMLElement>('[data-batch-document]')) {
        const canvas = await html2canvas(element, {
          scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
          ignoreElements: el => el.classList.contains('print-hidden'),
        });
        const pageHeight = Math.floor(canvas.width * height / width);
        for (let top = 0; top < canvas.height; top += pageHeight) {
          if (!firstPage) pdf.addPage();
          firstPage = false;
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = Math.min(pageHeight, canvas.height - top);
          const context = slice.getContext('2d');
          if (!context) throw new Error('Canvas indisponible');
          context.drawImage(canvas, 0, top, slice.width, slice.height, 0, 0, slice.width, slice.height);
          pdf.addImage(slice.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, width, slice.height * width / slice.width);
        }
      }
      pdf.save(`Bons_comptant_${bons.length}.pdf`);
    } catch (error) {
      console.error(error);
      showError('Impossible de générer le PDF groupé.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Impression groupée des bons comptant">
      <style>{'.batch-document .print-hidden { display: none !important; }'}</style>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Impression {thermal ? 'thermique' : 'PDF A4'} — {bons.length} bon(s)</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={print} disabled={busy || !ready} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50"><Printer size={18} />Imprimer tout</button>
            {!thermal && <button type="button" onClick={download} disabled={busy || !ready} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50"><Download size={18} />Télécharger PDF</button>}
            <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" className="p-2 disabled:opacity-50"><X size={22} /></button>
          </div>
        </div>
        <fieldset disabled={busy} className="p-3 border-b flex flex-wrap items-center gap-4 text-sm">
          <label>Société <select value={options.company} onChange={e => setOptions({ ...options, company: e.target.value as PrintOptions['company'] })} className="border rounded p-1"><option value="DIAMOND">BOUKIR DIAMOND</option><option value="MPC">BOUKIR MPC</option></select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.promo} onChange={e => setOptions({ ...options, promo: e.target.checked })} />Utiliser promo</label>
          {thermal ? <label className="flex items-center gap-2"><input type="checkbox" checked={options.withPrices} onChange={e => setOptions({ ...options, withPrices: e.target.checked })} />Avec prix</label> : <>
            <label className="flex items-center gap-2"><input type="checkbox" checked={options.images} onChange={e => setOptions({ ...options, images: e.target.checked })} />Images produit</label>
            <label>Langue <select value={options.lang} onChange={e => setOptions({ ...options, lang: e.target.value as DesignationLang })} className="border rounded p-1">{DESIGNATION_LANG_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </>}
          <span role="status" className="text-gray-500">{busy ? 'Préparation…' : productsError ? 'Erreur de chargement des produits. Fermez puis réessayez.' : !ready ? 'Chargement des documents…' : 'Documents prêts'}</span>
        </fieldset>
        <div className="overflow-auto bg-gray-100 p-4"><div ref={previewRef}>
          {bons.map(bon => <BatchDocument key={bon.id} bon={bon} thermal={thermal} products={products as any[]} options={options} onReady={onReady} />)}
        </div></div>
      </div>
    </div>
  );
}
