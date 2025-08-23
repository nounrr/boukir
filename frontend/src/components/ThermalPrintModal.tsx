/* ThermalPrintModal.tsx — conserve ton design, logo net en base64 */
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import logo from './logo2.png';
import logo1 from './logo1WB.png';

interface ThermalPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  bon: any;
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Devis' | 'AvoirClient' | 'AvoirFournisseur' | 'Avoir' | 'Vehicule';
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
    Sortie: 'DEVIS',
    Comptant: 'DEVIS',
    Devis: 'DEVIS',
    AvoirClient: 'AVOIR CLIENT',
    Avoir: 'AVOIR CLIENT',
    AvoirFournisseur: 'AVOIR FOURNISSEUR',
    Vehicule: 'BON VÉHICULE',
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

// Format FR
const formatNumber = (n: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);

// --- AJOUT: helpers pour convertir images en base64 et injecter dans la fenêtre d'impression ---
async function toDataUrl(src: string): Promise<string> {
  // Fonction robuste pour bundles (vite/webpack)
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function injectBase64IntoHtml(containerHtml: string, originalUrl: string, base64Url: string): string {
  // Remplace src="${originalUrl}" par src="${base64Url}" dans le HTML imprimé
  // Couvre src="..." et src='...'
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`src=["']${escape(originalUrl)}["']`, 'g');
  return containerHtml.replace(re1, `src="${base64Url}"`);
}

const getPrintCss = () => `
  /* --- Ton CSS initial, conservé --- */
  html, body { height: 100%; }
  body { 
    font-family: 'Courier New', monospace; 
    font-size: 10px; 
    line-height: 1.35; 
    margin: 0; padding: 0; 
    color: black; background: white; 
    text-align: center; 
    font-weight: bold;

    /* AJOUT pour netteté */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
  }
  .thermal-container { width: 80mm; max-width: 100%; padding: 0; margin: 0 auto; text-align: center; }
  img { display: block; margin: 0 auto 4px; width: 40%; height: auto; image-rendering: pixelated; }
  .thermal-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 2mm; margin-bottom: 4mm; }
  .thermal-title { font-weight: bold; font-size: 13px; margin-bottom: 4mm; }
  .thermal-info {font-weight: bold; font-size: 13px; margin-bottom: 4mm; }
  .thermal-section { font-weight: bold; margin-top: 2mm; padding-top: 1mm; border-top: 1px dashed #000; }
  .thermal-row { font-weight: bold; display: flex; justify-content: center; gap: 8px; margin-bottom: 4mm; }
  .thermal-footer { font-weight: bold; text-align: center; font-size: 8px; margin-top: 3mm; border-top: 1px dashed #000; padding-top: 2mm; }
  .thermal-table { font-weight: bold; width: 100%; border-collapse: collapse;  text-align: center; table-layout: fixed; }
  .thermal-table th, .thermal-table td { font-weight: bold; padding: 1mm 0; text-align: center; }
  .thermal-table thead tr { font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .thermal-table tbody tr {font-size:14px; font-weight: bold; border-bottom: 1px dotted #000;left;height:8mm }
  .col-code { font-weight: bold; width: 10%; white-space: nowrap; }
  .col-designation { font-weight: bold; width: 45%; white-space: normal; word-break: break-word; text-align: left; }
  .col-qte { font-weight: bold; width: 10%; white-space: nowrap; text-align: right; overflow: visible; font-size: 11px; }
  .col-unit { font-weight: bold; width: 17.5%; white-space: nowrap; text-align: right; overflow: visible; border-left: 1px dotted #000; font-size: 13px; }
  .col-total { font-weight: bold;width: 17.5%; white-space: nowrap; text-align: right; overflow: visible; border-left: 1px dotted #000; font-size: 13px; }
  .thermal-table.no-prices .col-code { font-weight: bold; width: 15%; }
  .thermal-table.no-prices .col-designation { font-weight: bold; width: 70%; white-space: normal; word-break: break-word; text-align: left; }
  .thermal-table.no-prices .col-qte { font-weight: bold; width: 15%; }
  .span-total{font-weight: bold; font-size: 15px; margin-top:4mm }

  @media print {
    @page { size: 80mm auto; margin: 0; } /* AJOUT: marge 0 pour éviter le rescaling */
    body { width: 80mm; margin: 0 !important; }
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

  const logoCurrent = companyType === 'MPC' ? logo1 : logo;

  // --- AJOUT: pré-conversion du logo courant en base64 pour fiabiliser l'impression ---
  const [logoBase64, setLogoBase64] = useState<string>('');
  useEffect(() => {
    let alive = true;
    toDataUrl(logoCurrent)
      .then((b64) => alive && setLogoBase64(b64))
      .catch(() => alive && setLogoBase64(''));
    return () => { alive = false; };
  }, [logoCurrent]);

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

  const MIN_ROWS = 5;
  const padCount = Math.max(0, MIN_ROWS - parsedItems.length);
  const padKeys = useMemo(
    () => Array.from({ length: padCount }, () => `pad-${Math.random().toString(36).slice(2)}`),
    [padCount]
  );
  const getItemKey = (it: any) =>
    String(
      it.id ??
      it.code ??
      it.sku ??
      it.ref ??
      it.designation ??
      it.libelle ??
      it.name ??
      `${it.prix_unitaire ?? it.prix ?? it.price ?? ''}-${it.quantite ?? it.qty ?? ''}`
    );

  const handlePrint = async () => {
    if (!printRef.current) return;

    const printCss = getPrintCss();
    const printContent = printRef.current.innerHTML;

    // --- AJOUT: injecter la version base64 du logo dans le HTML imprimé ---
    const contentWithLogo =
      logoBase64 ? injectBase64IntoHtml(printContent, logoCurrent, logoBase64) : printContent;

    const w = window.open('', '_blank');
    if (!w) return;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <title>Print</title>
          <style>${printCss}</style>
        </head>
        <body>
          <div class="thermal-container">${contentWithLogo}</div>
        </body>
      </html>
    `;

    w.document.open();
    w.document.write(html);
    w.document.close();

    const onReady = () => {
      const imgs = Array.from(w.document.images);
      if (imgs.length === 0) { w.focus(); w.print(); return; }
      let loaded = 0;
      const done = () => { loaded += 1; if (loaded >= imgs.length) { w.focus(); w.print(); } };
      imgs.forEach((im: HTMLImageElement) => {
        if (im.complete) done();
        else {
          im.addEventListener('load', done, { once: true });
          im.addEventListener('error', done, { once: true });
        }
      });
    };

    if (w.document.readyState === 'complete') onReady();
    else w.addEventListener('load', onReady);
  };

  if (!isOpen) return null;

  return (
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

          {/* Aperçu thermique — Ton design conservé */}
          <div
            ref={printRef}
            className="mt-6 mb-6 p-3 border border-gray-300 mx-auto bg-white"
            style={{ width: '80mm', fontSize: '10px', fontFamily: 'Courier New, monospace', fontWeight: 'bold' }}
          >
            <div className="thermal-header flex items-center justify-center gap-10">
              <img 
                src={logoBase64 || logoCurrent}
                alt={`Logo ${companyType}`} 
                className="object-contain mb-4"
                width="25%"
              />
              <div className='text-center'>
                <div className="thermal-info">{getTypeLabel(type)}</div>
                <div className="thermal-info"></div>
              </div>
              {contact ? (
                <div className="thermal-info" style={{ marginTop: '2mm' }}>
                  Client: {(
                    (typeof contact.societe === 'string' && contact.societe.trim()) ? contact.societe :
                    contact.nom_complet || contact.nom || contact.name || '-'
                  )}
                </div>
              ) : null}
            </div>

            <div className="thermal-title text-center">
              <span>
                {companyType === 'DIAMOND' ? (
                  <>
                    BOUKIR DIAMOND <br /> CONSTRUCTION STORE
                  </>
                ) : (
                  'MPC BOUKIR'
                )}
              </span>
              <br />
              <span>Vente de Matériaux de Construction céramique, et de Marbre</span>
              <br />
              <span>GSM: 0650812894 - Tél: 0666216657</span>
              <br />
              <span>{bon?.numero ? `#${bon.numero}` : ''} {formatDate(bon?.date_creation || bon?.created_at || new Date().toISOString())}</span>
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
              <tbody>
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
                <div className="thermal-row text-center"><span className='span-total'>Total {formatNumber(totals.total)} DH</span></div>
              </div>
            ) : null}

            <div className="thermal-footer text-center">Merci pour votre confiance.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThermalPrintModal;
