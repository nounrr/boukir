import React, { useMemo, useRef, useState } from 'react';
import { X, Printer } from 'lucide-react';
import logo from"./logo.png"
import logo1 from"./logo1.png"
interface ThermalPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  bon: any;
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Devis' | 'AvoirClient' | 'AvoirFournisseur' | 'Avoir';
  contact?: any;
  items?: any[];
}

const formatDate = (date: string) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR');
};

const getTypeLabel = (t: string) => {
  const map: Record<string, string> = {
    Commande: 'COMMANDE',
    Sortie: 'SORTIE',
    Comptant: 'COMPTANT',
    Devis: 'DEVIS',
    AvoirClient: 'AVOIR CLIENT',
    Avoir: 'AVOIR CLIENT',
    AvoirFournisseur: 'AVOIR FOURNISSEUR',
  };
  return map[t] ?? 'BON';
};

const parseBonItems = (bon: any, items: any[]): any[] => {
  if (Array.isArray(items) && items.length) return items;
  const raw = bon && (bon.items ?? bon.lignes);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Format number with up to 2 decimals, no trailing zeros, FR locale (comma decimal)
const formatNumber = (n: number) => new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number.isFinite(n) ? n : 0);

const getPrintCss = () => `
  /* Base styles for the print window (screen + print) */
  html, body { height: 100%; }
  body { font-family: 'Courier New', monospace; font-size: 10px; line-height: 1.35; margin: 0; padding: 0; color: black; background: white; text-align: center; }
  .thermal-container { width: 80mm; max-width: 100%; padding: 0; margin: 0 auto; text-align: center; }
  img { display: block; margin: 0 auto 4px; max-width: 60%; height: auto; }
  .thermal-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 2mm; margin-bottom: 2mm; }
  .thermal-title { font-weight: bold; font-size: 12px; margin-bottom: 1mm; }
  .thermal-info { font-size: 12px; margin-bottom: 1mm; }
  .thermal-section { margin-top: 2mm; padding-top: 1mm; border-top: 1px dashed #000; }
  .thermal-row { display: flex; justify-content: center; gap: 8px; margin-bottom: 0.5mm; font-size: 12px; }
  .thermal-footer { text-align: center; font-size: 8px; margin-top: 3mm; border-top: 1px dashed #000; padding-top: 2mm; }
  .thermal-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: center; table-layout: fixed; }
  .thermal-table th, .thermal-table td { padding: 1mm 0; text-align: center; }
  .thermal-table thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .thermal-table tbody tr { border-bottom: 1px dotted #000; }
  .col-code { width: 10%; white-space: nowrap; }
  .col-designation { width: 45%; white-space: normal; word-break: break-word; text-align: left; }
  .col-qte { width: 10%; white-space: nowrap; text-align: right; overflow: visible; font-size: 11px; }
  .col-unit { width: 17.5%; white-space: nowrap; text-align: right; overflow: visible; border-left: 1px dotted #000; font-size: 11px; }
  .col-total { width: 17.5%; white-space: nowrap; text-align: right; overflow: visible; border-left: 1px dotted #000; font-size: 11px; }
  /* When prices are hidden, rebalance widths */
  .thermal-table.no-prices .col-code { width: 15%; }
  .thermal-table.no-prices .col-designation { width: 70%; white-space: normal; word-break: break-word; text-align: left; }
  .thermal-table.no-prices .col-qte { width: 15%; }

  @media print {
    @page { size: 80mm auto; margin: 2mm; }
    body { width: 80mm; }
  }
`;

const ThermalPrintModal: React.FC<ThermalPrintModalProps> = ({
  isOpen,
  onClose,
  bon,
  type,
  contact,
  items = [],
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [companyType, setCompanyType] = useState<'DIAMOND' | 'MPC'>('DIAMOND');
  const [priceMode, setPriceMode] = useState<'WITH_PRICES' | 'WITHOUT_PRICES'>('WITH_PRICES');

  // Note: Don't early-return before hooks; gate rendering below to keep hooks order stable
  const logoCurrent = companyType === 'MPC' ? logo1 : logo;

  // Use provided items or parse from bon.items/bon.lignes (array or JSON string)
  const parsedItems: any[] = useMemo(() => parseBonItems(bon, items), [bon, items]);

  const totals = useMemo(() => {
    let total = 0;
    for (const it of parsedItems) {
      const q = parseFloat(it.quantite ?? it.qty ?? 0) || 0;
      const pu = parseFloat(it.prix_unitaire ?? it.prix ?? it.price ?? 0) || 0;
      total += q * pu;
    }
    return { total };
  }, [parsedItems]);

  // Ensure at least 5 rows are displayed (pad with empty rows if needed)
  const MIN_ROWS = 5;
  const padCount = Math.max(0, MIN_ROWS - parsedItems.length);
  const padKeys = useMemo(() => Array.from({ length: padCount }, () => `pad-${Math.random().toString(36).slice(2)}`), [padCount]);
  const getItemKey = (it: any) => {
    return String(
      it.id ?? it.code ?? it.sku ?? it.ref ?? it.designation ?? it.libelle ?? it.name ?? `${it.prix_unitaire ?? it.prix ?? it.price ?? ''}-${it.quantite ?? it.qty ?? ''}`
    );
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printCss = getPrintCss();
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.title = 'Print';

  const attachAndPrint = () => {
      try {
    // Embed CSS directly in the HTML via a <style> tag
    const wrapper = w.document.createElement('div');
    wrapper.innerHTML = `<style type="text/css">${printCss}</style><div class="thermal-container">${printContent}</div>`;
    // Clear any default body content, then append our wrapper
    w.document.body.innerHTML = '';
    w.document.body.appendChild(wrapper);

  const imgs = Array.from(wrapper.querySelectorAll('img'));
        if (imgs.length === 0) {
          w.focus();
          w.print();
          return;
        }

        let loaded = 0;
        const tryPrint = () => {
          loaded += 1;
          if (loaded >= imgs.length) {
            w.focus();
            w.print();
          }
        };
        imgs.forEach(img => {
          if (img.complete) {
            tryPrint();
          } else {
            img.addEventListener('load', tryPrint, { once: true });
            img.addEventListener('error', tryPrint, { once: true });
          }
        });
      } catch {
        // no-op
      }
    };

    if (w.document.readyState === 'complete') {
      attachAndPrint();
    } else {
      w.addEventListener('load', attachAndPrint);
    }
  };

  return (!isOpen ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Impression Thermique</h2>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
            <div className="bg-gray-50 p-3 rounded mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="companyTypeSelect" className="text-sm text-gray-700">Société</label>
              <select
                id="companyTypeSelect"
                value={companyType}
                onChange={(e) => setCompanyType(e.target.value as 'DIAMOND' | 'MPC')}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="DIAMOND">BOUKIR DIAMOND</option>
                <option value="MPC">BOUKIR MPC</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="priceModeSelect" className="text-sm text-gray-700">Prix</label>
              <select
                id="priceModeSelect"
                value={priceMode}
                onChange={(e) => setPriceMode(e.target.value as 'WITH_PRICES' | 'WITHOUT_PRICES')}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="WITH_PRICES">Avec prix</option>
                <option value="WITHOUT_PRICES">Sans prix</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 ml-auto">Aperçu (largeur 80mm)</p>
          </div>

          {/* Aperçu thermique */}
          <div ref={printRef} className="mt-6 mb-6 p-3 border border-gray-300 mx-auto bg-white" style={{ width: '80mm', fontSize: '10px', fontFamily: 'Courier New, monospace' }}>
            <div className="thermal-header flex items-center justify-center gap-10">
              <img 
            src={logoCurrent}
              alt={`Logo ${companyType}`} 
              className="object-contain mb-4"
              width="25%"
            />
            <div className='text-center'><div className="thermal-info">{getTypeLabel(type)}</div>
              <div className="thermal-info"></div></div>
              
              {contact ? (
                <div className="thermal-info" style={{ marginTop: '2mm' }}>
                  Client: {(
                    (typeof contact.societe === 'string' && contact.societe.trim()) ? contact.societe :
                    contact.nom_complet || contact.nom || contact.name || '-'
                  )}
                </div>
              ) : null}
            </div>
              <div className="thermal-title text-center"><span>{companyType === 'DIAMOND' ? 'BOUKIR DIAMOND' : 'BOUKIR MPC'}</span><br />
              <span>Vente de Matériaux de Construction céramique, et de Marbre</span>
              <br />
              <span>GSM: 0650812894 - Tél: 0666216657</span>
            <br />
              <span> {bon?.numero ? `#${bon.numero}` : ''}  {formatDate(bon?.date_creation || bon?.created_at || new Date().toISOString())}</span>
              </div>


            <table className={`thermal-table w-full ${priceMode === 'WITHOUT_PRICES' ? 'no-prices' : ''}`}>

              <thead>
                <tr className="border-t border-b">
                  <th className="col-code">Code</th>
                  <th className="col-designation">Désignation</th>
                  <th className="col-qte">Qté</th>
                  {priceMode === 'WITH_PRICES' ? (
                    <>
                      <th className="col-unit">P.U</th>
                      <th className="col-total">Total</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody className=''>
                {parsedItems.map((it: any) => {
                  const q = parseFloat(it.quantite ?? it.qty ?? 0) || 0;
                  const pu = parseFloat(it.prix_unitaire ?? it.prix ?? it.price ?? 0) || 0;
                  const lineTotal = q * pu;
                  return (
                    <tr className="border-t border-b" key={getItemKey(it)}>
                      <td className="col-code">{it.code || it.id}</td>
                      <td className="col-designation">{it.designation || it.libelle || it.name || '-'}</td>
                      <td className="col-qte">{q}</td>
                      {priceMode === 'WITH_PRICES' ? (
                        <>
                          <td className="col-unit">{formatNumber(pu)}</td>
                          <td className="col-total">{formatNumber(lineTotal)}</td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
                {padCount > 0 && padKeys.map((key) => (
                  <tr className="border-t border-b" key={key}>
                    <td className="col-code">&nbsp;</td>
                    <td className="col-designation">&nbsp;</td>
                    <td className="col-qte">&nbsp;</td>
                    {priceMode === 'WITH_PRICES' ? (
                      <>
                        <td className="col-unit">&nbsp;</td>
                        <td className="col-total">&nbsp;</td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>

            {priceMode === 'WITH_PRICES' ? (
              <div className="thermal-section">
                <div className="thermal-row text-center"><span>Total </span><span>{formatNumber(totals.total)} DH</span></div>
              </div>
            ) : null}

            <div className="thermal-footer text-center">Merci pour votre confiance.</div>
          </div>
        </div>
      </div>
    </div>
  ));
};

export default ThermalPrintModal;
