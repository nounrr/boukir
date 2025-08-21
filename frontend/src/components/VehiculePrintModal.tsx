import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Printer } from 'lucide-react';
import type { Vehicule } from '../types';
import VehiculePrintTemplate from './VehiculePrintTemplate';
import type { CompanyType, PriceMode } from './ContactPrintTemplate';

interface VehiculePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicule: Vehicule;
  bons: any[];
  dateFrom?: string;
  dateTo?: string;
}

const getInlineCss = (): string => {
  const base = `body { margin: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n@page { size: A4; margin: 0.5cm; }\n@media print { body { margin: 0; } }`;
  try {
    const sheetCss = Array.from(document.styleSheets)
      .map((ss: any) => {
        try {
          return Array.from(ss.cssRules).map((r: any) => r.cssText).join('');
        } catch {
          return '';
        }
      })
      .join('');
    return base + sheetCss;
  } catch {
    return base;
  }
};

const VehiculePrintModal: React.FC<VehiculePrintModalProps> = ({ isOpen, onClose, vehicule, bons, dateFrom, dateTo }) => {
  const [size, setSize] = useState<'A4' | 'A5'>('A4');
  const [company, setCompany] = useState<CompanyType>('DIAMOND');
  const [priceMode, setPriceMode] = useState<PriceMode>('WITH_PRICES');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const generatePDF = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: true });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: size.toLowerCase() as 'a4' | 'a5' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
      const imgW = canvas.width * ratio; const imgH = canvas.height * ratio;
      const x = (pdfW - imgW) / 2; const y = (pdfH - imgH) / 2;
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);
      const fileName = `Vehicule_${vehicule?.nom || vehicule?.id}_situation_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const attachAndPrint = () => {
      try {
        // Clear and set document title
        w.document.title = `Impression ${vehicule?.nom || ''}`;
        w.document.body.innerHTML = '';
        // Build style tag including current page styles
  const styleEl = w.document.createElement('style');
  const css = getInlineCss();
  styleEl.appendChild(w.document.createTextNode(css));
        w.document.head.appendChild(styleEl);

        // Wrap the printable content
        const wrapper = w.document.createElement('div');
        wrapper.innerHTML = printRef.current!.innerHTML;
        w.document.body.appendChild(wrapper);

        w.focus();
        w.print();
        // Close after a short delay
        setTimeout(() => { try { w.close(); } catch {} }, 300);
      } catch {
        // no-op
      }
    };
    if (w.document.readyState === 'complete') attachAndPrint();
    else w.addEventListener('load', attachAndPrint);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Aperçu - {vehicule?.nom} (Situation Véhicule)</h2>
            <div className="flex items-center gap-2">
              <label htmlFor="vehicule-size-select" className="text-sm">Taille:</label>
              <select id="vehicule-size-select" value={size} onChange={(e) => setSize(e.target.value as any)} className="px-2 py-1 border rounded text-sm">
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="vehicule-company-select" className="text-sm">Société:</label>
              <select id="vehicule-company-select" value={company} onChange={(e) => setCompany(e.target.value as CompanyType)} className="px-2 py-1 border rounded text-sm">
                <option value="DIAMOND">BOUKIR DIAMOND</option>
                <option value="MPC">BOUKIR MPC</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="vehicule-price-select" className="text-sm">Prix:</label>
              <select id="vehicule-price-select" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)} className="px-2 py-1 border rounded text-sm">
                <option value="WITH_PRICES">Avec prix</option>
                <option value="WITHOUT_PRICES">Sans prix</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} disabled={isGenerating} className="flex items-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              <Printer size={16} className="mr-1" /> Imprimer
            </button>
            <button onClick={generatePDF} disabled={isGenerating} className="flex items-center px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              <Download size={16} className="mr-1" /> {isGenerating ? 'Génération...' : 'PDF'}
            </button>
            <button onClick={onClose} className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">Fermer</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex justify-center">
            <div ref={printRef} className="bg-white shadow-lg" style={{ width: size === 'A5' ? '148mm' : '210mm', minHeight: size === 'A5' ? '210mm' : '297mm' }}>
              <VehiculePrintTemplate
                vehicule={vehicule}
                bons={bons}
                dateFrom={dateFrom}
                dateTo={dateTo}
                companyType={company}
                priceMode={priceMode}
                size={size}
              />
            </div>
          </div>
        </div>
        <div className="p-2 border-t bg-gray-50 text-xs text-gray-600 text-center">Aperçu d'impression</div>
      </div>
    </div>
  );
};

export default VehiculePrintModal;
