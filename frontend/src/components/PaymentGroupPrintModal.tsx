import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Printer, Download } from 'lucide-react';
import CompanyHeader from './CompanyHeader';
import { useGetPaymentPrintBalanceQuery } from '../store/api/paymentsApi';

interface PaymentGroupPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  payments: any[];
  getContactName: (payment: any) => string;
  getSociete?: (payment: any) => string;
  client?: any;
  fournisseur?: any;
}

const companyInfo = {
  DIAMOND: {
    address: 'IKAMAT REDOUAN 1 AZIB HAJ KADDOUR LOCAL 1 ET N2 - TANGER',
    phones: 'GSM: 0650812894 - Tél: 0666216657',
    email: 'EMAIL: boukir.diamond23@gmail.com',
  },
  MPC: {
    address: 'ALot Awatif N°179 - TANGER',
    phones: 'GSM: 0650812894 - Tél: 0666216657',
    email: 'EMAIL: boukir.diamond23@gmail.com',
  },
} as const;

const grossAmountOf = (p: any) => {
  const raw = p?.montant ?? p?.montant_total ?? 0;
  if (raw == null || raw === '') return 0;
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '.'));
  return isNaN(num) ? 0 : num;
};

const ignoredAmountOf = (p: any) => {
  const raw = p?.montant_ignorer ?? 0;
  if (raw == null || raw === '') return 0;
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '.'));
  return isNaN(num) ? 0 : num;
};

const amountOf = (p: any) => Math.max(grossAmountOf(p), 0);
const paidDisplayAmountOf = (p: any) => Math.max(amountOf(p) - ignoredAmountOf(p), 0);
const balanceAmountOf = (p: any) => amountOf(p);

const paymentDateMs = (payment: any): number => {
  const raw = payment?.date_paiement || payment?.created_at;
  if (!raw) return 0;
  const parsed = new Date(String(raw).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

// Le tableau de caisse peut être trié du plus récent au plus ancien.
// Pour un reçu groupé, le solde initial doit toujours être celui qui précède
// le tout premier paiement du groupe dans l'ordre du grand livre.
const getFirstLedgerPayment = (payments: any[]): any => {
  return payments.reduce((first, candidate) => {
    if (!first) return candidate;
    const dateDifference = paymentDateMs(candidate) - paymentDateMs(first);
    if (dateDifference < 0) return candidate;
    if (dateDifference > 0) return first;
    return Number(candidate?.id || 0) < Number(first?.id || 0) ? candidate : first;
  }, null as any);
};

const formatDateTime = (val: any): string => {
  if (!val) return '';
  let s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T');
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + ':00';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const CompanyFooter: React.FC<{
  data: { address: string; phones: string; email: string };
  compact?: boolean;
}> = ({ data, compact = false }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: compact ? '4mm' : '12mm',
      padding: compact ? '0 8px' : '0 16px',
    }}
    className={`${compact ? 'mt-4 pt-2' : 'mt-8 pt-4'} space-y-1`}
    data-payment-footer="true"
  >
    <div className={compact ? 'w-full mb-2' : 'w-full mb-4'} style={{ textAlign: 'center' }}>
      <div
        className="text-center"
        style={{
          border: '2px solid #000',
          width: compact ? '38mm' : '40mm',
          height: compact ? '18mm' : '20mm',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-bold`}>CACHET CLIENT</span>
      </div>
    </div>
    <div className={`border-t border-gray-300 text-center ${compact ? 'text-[8.5px]' : 'text-xs'} text-gray-600 ${compact ? 'space-y-0' : 'space-y-1'}`}>
      <p>{data.address}</p>
      <p>{data.phones} | {data.email}</p>
    </div>
  </div>
);

const PaymentGroupPrintModal: React.FC<PaymentGroupPrintModalProps> = ({
  isOpen,
  onClose,
  payments,
  getContactName,
  getSociete,
  client,
  fournisseur,
}) => {
  const [size, setSize] = useState<'A4' | 'A5'>('A5');
  const [selectedCompany, setSelectedCompany] = useState<'DIAMOND' | 'MPC'>('DIAMOND');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const firstPayment = getFirstLedgerPayment(payments) || {};
  const { data: printBalance } = useGetPaymentPrintBalanceQuery(Number(firstPayment?.id), {
    skip: !isOpen || !firstPayment?.id,
  });

  if (!isOpen) return null;

  const footer = companyInfo[selectedCompany];
  const groupId = firstPayment?.payment_group_id || '';
  const totalPaid = payments.reduce((s, p) => s + paidDisplayAmountOf(p), 0);
  const totalIgnored = payments.reduce((s, p) => s + ignoredAmountOf(p), 0);
  const totalGross = payments.reduce((s, p) => s + amountOf(p), 0);
  const isClient = firstPayment.type_paiement === 'Client' || printBalance?.contactType === 'Client' || (!!client && !fournisseur);
  const contact = client || fournisseur;
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || (payments.length ? getContactName(firstPayment) : '-'))
  );
  const societe = getSociete && payments.length ? getSociete(firstPayment) : '';
  const contactRef = (() => {
    const directRef = contact?.reference ?? firstPayment?.contact_reference;
    if (directRef != null && String(directRef).trim()) return String(directRef).trim();
    const rawId = firstPayment?.contact_id ?? firstPayment?.client_id ?? firstPayment?.fournisseur_id;
    if (rawId != null && Number(rawId) > 0) return String(rawId);
    return '';
  })();
  const datePremier = payments.length ? formatDateTime(firstPayment.date_paiement) : '';
  const soldeAvant = Number(printBalance?.soldeAvant ?? 0) || 0;
  const soldeApres = soldeAvant - payments.reduce((s, p) => s + balanceAmountOf(p), 0);
  const soldoAvantLabel = isClient ? 'Solde à recevoir avant paiement' : 'Solde à payer avant paiement';
  const soldoApresLabel = isClient ? 'Solde à recevoir après paiement' : 'Solde à payer après paiement';
  const nouveauSoldeLabel = isClient ? 'NOUVEAU SOLDE À RECEVOIR' : 'NOUVEAU SOLDE À PAYER';
  const contactRefLabel = isClient ? 'Ref client' : 'Ref fournisseur';
  const isA5 = size === 'A5';
  const showIgnored = totalIgnored > 0;

  const generatePDF = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);
    let hiddenEls: HTMLElement[] = [];
    let previousDisplay: string[] = [];
    try {
      hiddenEls = Array.from(printRef.current.querySelectorAll('.print-hidden')) as HTMLElement[];
      previousDisplay = hiddenEls.map(el => el.style.display);
      hiddenEls.forEach(el => { el.style.display = 'none'; });
      const canvas = await html2canvas(printRef.current, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: size.toLowerCase() as 'a4' | 'a5', compress: true });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfHeight - imgHeight) / 2;
      const imgData = canvas.toDataURL('image/jpeg', 0.75);
      pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight, undefined, 'MEDIUM');
      pdf.save(`Groupe_paiements_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      if (printRef.current) {
        const els = Array.from(printRef.current.querySelectorAll('.print-hidden')) as HTMLElement[];
        els.forEach((el, i) => { el.style.display = previousDisplay[i] || ''; });
      }
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Impression Groupe de paiements</title>
          <style>
            html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { width: ${size === 'A5' ? '148mm' : '210mm'}; min-height: ${size === 'A5' ? '210mm' : '297mm'}; }
            @page { size: ${size}; margin: 0; }
            @media print {
              html, body { margin: 0; padding: 0; }
              .print-hidden { display: none !important; }
              .payment-print-page {
                width: ${size === 'A5' ? '148mm' : '210mm'} !important;
                height: ${size === 'A5' ? '198mm' : '297mm'} !important;
                min-height: ${size === 'A5' ? '198mm' : '297mm'} !important;
                max-height: ${size === 'A5' ? '198mm' : '297mm'} !important;
                overflow: hidden !important;
                box-shadow: none !important;
                margin: 0 auto !important;
                page-break-after: avoid !important;
                break-after: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              [data-payment-footer="true"] {
                position: absolute !important;
                left: 8px !important;
                right: 8px !important;
                bottom: 4mm !important;
              }
            }
            ${Array.from(document.styleSheets).map(styleSheet => {
              try {
                return Array.from(styleSheet.cssRules).map(rule => rule.cssText).join('');
              } catch (error) {
                return '';
              }
            }).join('')}
          </style>
        </head>
        <body>${printRef.current?.innerHTML || ''}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">Aperçu impression - Groupe de paiements ({payments.length})</h2>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Société:</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value as 'DIAMOND' | 'MPC')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="DIAMOND">DIAMOND</option>
                <option value="MPC">MPC</option>
              </select>
              <label className="text-sm font-medium">Taille:</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as 'A4' | 'A5')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </select>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={handlePrint} disabled={isGenerating} className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              <Printer size={16} className="mr-1" /> Imprimer
            </button>
            <button onClick={generatePDF} disabled={isGenerating} className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
              <Download size={16} className="mr-1" /> {isGenerating ? 'Génération...' : 'PDF'}
            </button>
            <button onClick={onClose} className="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">Fermer</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex justify-center">
            <div
              ref={printRef}
              className="bg-white shadow-lg"
              style={{ width: size === 'A5' ? '148mm' : '210mm', minHeight: size === 'A5' ? '210mm' : '297mm' }}
            >
              <div
                className={`payment-print-page bg-white ${isA5 ? 'w-[148mm] h-[198mm] p-2 text-[10.5px] overflow-hidden' : 'w-[210mm] min-h-[297mm] p-4 text-sm'} mx-auto font-sans print:shadow-none`}
                style={{ fontFamily: 'sans-serif', position: 'relative' }}
              >
                {isA5 && (
                  <style>{`
                    .payment-print-page th,
                    .payment-print-page td { padding: 4px 6px !important; line-height: 1.2; }
                    .payment-print-page .logo-large { max-height: 42px !important; }
                    .payment-print-page .titles h1 { font-size: 15px !important; margin-bottom: 1px !important; }
                    .payment-print-page .titles h2 { font-size: 12px !important; margin-bottom: 1px !important; }
                    .payment-print-page .titles p { font-size: 10px !important; line-height: 1.15 !important; }
                    .payment-print-page > .flex.justify-center.items-center { margin-bottom: 6px !important; padding-bottom: 6px !important; }
                    .payment-print-page [data-payment-footer="true"] {
                      position: absolute !important;
                      left: 8px !important;
                      right: 8px !important;
                      bottom: 4mm !important;
                    }
                  `}</style>
                )}

                <CompanyHeader companyType={selectedCompany} />

                <div className={`flex justify-between items-start ${isA5 ? 'mb-2 mt-2 gap-2' : 'mb-6 mt-6'}`}>
                  <div className="flex-1">
                    <h3 className={`${isA5 ? 'text-sm mb-1' : 'text-lg mb-3'} font-semibold text-gray-800`}>Contact :</h3>
                    <div className={`bg-gray-50 ${isA5 ? 'p-2' : 'p-3'} rounded border-l-4 border-orange-500`}>
                      <div className={`grid grid-cols-2 ${isA5 ? 'gap-1 text-[10px]' : 'gap-2 text-sm'}`}>
                        <div><span className="font-medium">Nom:</span> {contactDisplayName}</div>
                        {contactRef && <div><span className="font-medium">{contactRefLabel}:</span> {contactRef}</div>}
                        {societe && <div><span className="font-medium">Société:</span> {societe}</div>}
                        <div><span className="font-medium">Service de charge:</span> <strong>06.66.21.66.57</strong></div>
                      </div>
                    </div>
                  </div>

                  <div className={`${isA5 ? 'ml-2' : 'ml-6'} text-right`}>
                    <div className={`${isA5 ? 'p-2' : 'p-4'} rounded border border-orange-200`}>
                      <h2 className={`${isA5 ? 'text-sm mb-1' : 'text-lg mb-3'} font-bold text-orange-700`}>
                        REÇU DE PAIEMENT GROUPE
                      </h2>
                      <div className={`${isA5 ? 'space-y-1 text-[10px]' : 'space-y-2 text-sm'}`}>
                        <div><span className="font-medium">Date:</span> {datePremier}</div>
                        <div><span className="font-medium">Nombre:</span> {payments.length}</div>
                        {groupId && <div><span className="font-medium">Réf. groupe:</span> {groupId}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={isA5 ? 'mb-3' : 'mb-6'}>
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-orange-500 text-white">
                        <th className={`${isA5 ? 'px-1.5 py-1' : 'px-3 py-2'} border border-gray-300 text-left font-semibold`}>Description</th>
                        <th className={`${isA5 ? 'px-1.5 py-1 w-24' : 'px-3 py-2 w-40'} border border-gray-300 text-center font-semibold`}>Date / Heure</th>
                        <th className={`${isA5 ? 'px-1.5 py-1 w-20' : 'px-3 py-2 w-28'} border border-gray-300 text-right font-semibold`}>Payé (DH)</th>
                        {showIgnored && <th className={`${isA5 ? 'px-1.5 py-1 w-20' : 'px-3 py-2 w-28'} border border-gray-300 text-right font-semibold`}>Ignoré (DH)</th>}
                        <th className={`${isA5 ? 'px-1.5 py-1 w-20' : 'px-3 py-2 w-28'} border border-gray-300 text-right font-semibold`}>Total (DH)</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold w-28">{isClient ? 'Solde à recevoir (DH)' : 'Solde à payer (DH)'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-gray-50">
                        <td className="border border-gray-300 px-3 py-2">
                          <div className="font-medium text-gray-600">{soldoAvantLabel}</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-center text-gray-600">{datePremier}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right">-</td>
                        {showIgnored && <td className="border border-gray-300 px-3 py-2 text-right">-</td>}
                        <td className="border border-gray-300 px-3 py-2 text-right">-</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-medium text-gray-700">{soldeAvant.toFixed(2)}</td>
                      </tr>

                      {payments.map((p, i) => (
                        <tr key={p.id ?? i} className="bg-white">
                          <td className="border border-gray-300 px-3 py-2">
                            <div className="font-medium">
                              Paiement {p.mode_paiement || ''} {p.numero || `PAY${String(p.id ?? '').padStart(2, '0')}`}
                            </div>
                            <div className="text-xs text-gray-600">
                              {[p.code_reglement, p.banque, p.personnel].filter(Boolean).join(' | ')}
                            </div>
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-center">{formatDateTime(p.date_paiement)}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right font-medium text-green-700">+{paidDisplayAmountOf(p).toFixed(2)}</td>
                          {showIgnored && <td className="border border-gray-300 px-3 py-2 text-right font-medium text-orange-700">{ignoredAmountOf(p).toFixed(2)}</td>}
                          <td className="border border-gray-300 px-3 py-2 text-right font-medium text-gray-700">{amountOf(p).toFixed(2)}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right">-</td>
                        </tr>
                      ))}

                      <tr className="bg-orange-50">
                        <td className="border border-gray-300 px-3 py-2">
                          <div className="font-medium text-orange-700">{soldoApresLabel}</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-center text-orange-700">{datePremier}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right">-</td>
                        {showIgnored && <td className="border border-gray-300 px-3 py-2 text-right">-</td>}
                        <td className="border border-gray-300 px-3 py-2 text-right">-</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-bold text-orange-700">{soldeApres.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className={`flex justify-end ${isA5 ? 'mb-3' : 'mb-6'}`}>
                  <div className={isA5 ? 'w-64' : 'w-80'}>
                    <div className={`${isA5 ? 'p-2' : 'p-4'} rounded`}>
                      <div className={`flex justify-between items-center ${isA5 ? 'text-sm' : 'text-lg'} font-bold`}>
                        <span>MONTANT PAYÉ:</span>
                        <span>{totalPaid.toFixed(2)} DH</span>
                      </div>
                      {showIgnored && <div className={`flex justify-between items-center ${isA5 ? 'text-xs pt-1 mt-1' : 'text-base pt-2 mt-2'} font-semibold text-orange-700 border-t`}>
                        <span>MONTANT IGNORÉ:</span>
                        <span>{totalIgnored.toFixed(2)} DH</span>
                      </div>}
                      <div className={`flex justify-between items-center ${isA5 ? 'text-xs pt-1 mt-1' : 'text-base pt-2 mt-2'} font-semibold text-gray-700 border-t`}>
                        <span>TOTAL:</span>
                        <span>{totalGross.toFixed(2)} DH</span>
                      </div>
                      <div className={`flex justify-between items-center ${isA5 ? 'text-sm pt-1 mt-1' : 'text-lg pt-2 mt-2'} font-bold text-orange-700 border-t`}>
                        <span>{nouveauSoldeLabel}:</span>
                        <span>{soldeApres.toFixed(2)} DH</span>
                      </div>
                    </div>
                  </div>
                </div>

                <CompanyFooter data={footer} compact={isA5} />
              </div>
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

export default PaymentGroupPrintModal;
