import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Printer } from 'lucide-react';
import type { Contact } from '../types';
import ContactPrintTemplate, { type CompanyType, type ContactPrintMode, type PriceMode } from './ContactPrintTemplate';

interface ContactPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
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
}

const ContactPrintModal: React.FC<ContactPrintModalProps> = ({ isOpen, onClose, contact, mode, transactions = [], productHistory, dateFrom, dateTo, skipInitialRow = false, hideCumulative = false, totalQty, totalAmount, finalSolde }) => {
  const size = 'A4'; // Taille fixe A4
  const [company, setCompany] = useState<CompanyType>('DIAMOND');
  const [priceMode, setPriceMode] = useState<PriceMode>('WITH_PRICES');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const generatePDF = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, allowTaint: true });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: size.toLowerCase() as 'a4' | 'a5', compress: true });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
      const imgW = canvas.width * ratio;
      const imgH = canvas.height * ratio;
      const x = (pdfW - imgW) / 2; const y = (pdfH - imgH) / 2;
      const imgData = canvas.toDataURL('image/jpeg', 0.75);
      pdf.addImage(imgData, 'JPEG', x, y, imgW, imgH, undefined, 'MEDIUM');
      const fileName = `Contact_${contact?.nom_complet || contact?.id}_${mode}_${new Date().toISOString().split('T')[0]}.pdf`;
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
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impression ${contact?.nom_complet || ''}</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @page { size: ${size}; margin: 0.5cm; }
            @media print { body { margin: 0; } }
            ${Array.from(document.styleSheets).map(ss => { try { return Array.from(ss.cssRules).map(r => r.cssText).join(''); } catch { return ''; } }).join('')}
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 700);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Aperçu - {contact?.nom_complet} ({mode === 'transactions' ? 'Transactions' : 'Produits'})</h2>
            <div className="flex items-center gap-2">
          <label htmlFor="contact-company-select" className="text-sm">Société:</label>
          <select id="contact-company-select" value={company} onChange={(e) => setCompany(e.target.value as CompanyType)} className="px-2 py-1 border rounded text-sm">
                <option value="DIAMOND">BOUKIR DIAMOND</option>
                <option value="MPC">BOUKIR MPC</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
          <label htmlFor="contact-price-select" className="text-base md:text-lg font-medium">Prix:</label>
          <select id="contact-price-select" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)} className="px-3 py-2 border rounded text-base md:text-lg">
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
            <div ref={printRef} className="bg-white shadow-lg" style={{ width: '210mm', minHeight: '297mm' }}>
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
              />
            </div>
          </div>
        </div>
        <div className="p-2 border-t bg-gray-50 text-xs text-gray-600 text-center">Aperçu d'impression</div>
      </div>
    </div>
  );
};

export default ContactPrintModal;
