import React, { useState } from 'react';
import type { Contact } from '../types';
import CompanyHeader from './CompanyHeader';
import { getBonNumeroDisplay } from '../utils/numero';
import boukirCachet from './boukir_cachet.webp';
import mpcCachet from './mpc_cachet.webp';

interface BonPrintTemplateProps {
  bon: any;
  client?: Contact;
  fournisseur?: Contact;
  products?: any[];
  size?: 'A4' | 'A5';
  companyType?: 'DIAMOND' | 'MPC';
  usePromo?: boolean; // afficher prix original et colonne promo si applicable
}

// Pied de page adaptatif selon le nombre d'articles et le format A4/A5
// Technique: on insère un "spacer" (réservé) dans le flux avant le footer absolu.
// Le spacer s'adapte dynamiquement selon le nombre d'articles pour éviter le chevauchement.
const CompanyFooter: React.FC<{ 
  data: { address: string; phones: string; email: string; extra?: string; cachetImage?: string };
  size: 'A4' | 'A5';
}>
 = ({ data, size }) => {
  // Ajuster la taille du cachet selon le format
  const isA5 = size === 'A5';
  const cachetWidth = isA5 ? '60mm' : '82mm';
  const cachetHeight = isA5 ? '24mm' : '32mm';
  const fontSize = isA5 ? 'text-[8px]' : 'text-xs';
  const bottomPosition = isA5 ? '8mm' : '10mm';
  const padding = isA5 ? '0 12px' : '0 16px';
  
  return (
    <div
      className="company-footer"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomPosition,
        padding: padding
      }}
    >
      <div className="w-full mb-3 flex justify-center">
        <div style={{ 
          border: '1px solid #000', 
          width: cachetWidth, 
          height: cachetHeight, 
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden'
        }}>
          {data.cachetImage ? (
            <img 
              src={data.cachetImage} 
              alt="Cachet" 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain' 
              }} 
            />
          ) : (
            <h6 className={`${fontSize} mt-1 font-bold text-center`}>
              CACHET / SIGNATURE CLIENT
            </h6>
          )}
        </div>
      </div>
      <div className={`border-t border-gray-300 text-center ${isA5 ? 'text-[8px]' : 'text-[10px]'} text-gray-600 pt-2 leading-snug`}>
        <p>{data.address}</p>
        <p><strong className="text-[12px]">{data.phones}</strong> | {data.email}</p>
        {data.extra && <p><strong className="text-[12px]">{data.extra}</strong></p>}
      </div>
    </div>
  );
};

const BonPrintTemplate: React.FC<BonPrintTemplateProps> = ({ 
  bon, 
  client, 
  fournisseur, 
  products = [],
  size = 'A4',
  companyType = 'DIAMOND',
  usePromo = false
}) => {
  const [selectedCompany, setSelectedCompany] = useState<'DIAMOND' | 'MPC'>(companyType);
  const [printMode, setPrintMode] = useState<'WITH_PRICES' | 'WITHOUT_PRICES' | 'PRODUCTS_ONLY'>('WITH_PRICES');

  // Date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR');
  };

  // Infos variables par société
  const companyFooters: Record<'DIAMOND' | 'MPC', {
    address: string;
    phones: string;
    email: string;
    extra?: string;
    cachetImage?: string;
  }> = {
    DIAMOND: {
      address: "IKAMAT REDOUAN 1 AZIB HAJ KADDOUR LOCAL 1 ET N2 - TANGER",
      phones: "GSM: 0650812894 - Tél: 0666216657",
      email: "EMAIL: boukir.diamond23@gmail.com",
      extra: "Service de charge: 06.66.21.66.57",
      cachetImage: boukirCachet,
    },
    MPC: {
      address: "ALot Awatif N°179 - TANGER",
      phones: "GSM: 0650812894 - Tél: 0666216657",
      email: "EMAIL: boukir.diamond23@gmail.com",
      extra: "Service de charge: 06.66.21.66.57",
      cachetImage: mpcCachet,
    }
  };
  
  // (Titre helper supprimé, non utilisé)
  const formatHeure = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString("fr-FR") +
      " " +
      date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  // Items & totaux
  const parseItemsArray = (rawItems: any): any[] => {
    if (Array.isArray(rawItems)) return rawItems;
    if (typeof rawItems === 'string') {
      try {
        const parsed = JSON.parse(rawItems || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const rawItems = parseItemsArray(bon.items);

  // Merge items with same product + variant + prix_unitaire into a single line
  const mergeItems = (src: any[]): any[] => {
    const map = new Map<string, any>();
    const result: any[] = [];
    for (const it of src) {
      const pu = parseFloat(it.prix_unitaire || 0);
      const key = `${it.product_id ?? it.produit_id ?? it.id ?? ''}:${it.variant_id ?? it.variantId ?? ''}:${pu}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantite = parseFloat(existing.quantite || 0) + parseFloat(it.quantite || 0);
      } else {
        const merged = { ...it };
        map.set(key, merged);
        result.push(merged);
      }
    }
    return result;
  };
  const items = mergeItems(rawItems);

  const sousTotal = items.reduce(
    (sum: number, item: any) => sum + (parseFloat(item.quantite || 0) * parseFloat(item.prix_unitaire || 0)),
    0
  );

  const findProductById = (id: any) => {
    if (!id) return undefined;
    const sid = String(id);
    return (products || []).find((p: any) => String(p?.id) === sid);
  };

  const parseMoney = (value: any): number => {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value).trim().replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  const toCents = (value: any): number => {
    const n = parseMoney(value);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  // Compute the baseline "original" sale price considering variant and unit factor
  const getOriginalSalePrice = (item: any) => {
    // Only relevant for sales-type documents; callers guard for Commande already
    const pid = item?.product_id ?? item?.produit_id ?? item?.id;
    const product = findProductById(pid);
    if (!product) return 0;

    // Prefer variant sale price if a variant is selected
    const variantId = item?.variant_id ?? item?.variantId;
    let baseSale = 0;
    if (variantId && Array.isArray(product.variants)) {
      const v = product.variants.find((vv: any) => String(vv.id) === String(variantId));
      baseSale = parseMoney(v?.prix_vente);
    }
    if (!Number.isFinite(baseSale) || baseSale <= 0) {
      // Fallback to product sale price
      const p = product?.prix_vente ?? product?.prixVente ?? product?.price ?? product?.prix;
      baseSale = parseMoney(p);
    }
    if (!Number.isFinite(baseSale) || baseSale <= 0) return 0;

    // Apply unit conversion factor if a unit is selected
    const unitId = item?.unit_id ?? item?.unite_id ?? item?.uniteId;
    if (unitId && Array.isArray(product.units)) {
      const u = product.units.find((uu: any) => String(uu.id) === String(unitId));
      const factor = Number(u?.conversion_factor || 1) || 1;
      return Number((baseSale * factor).toFixed(2));
    }
    return baseSale;
  };

  const formatPromoPct = (pct: number) => {
    const p = Number(pct);
    if (!Number.isFinite(p) || p <= 0) return '0%';
    // Règle demandée:
    // - si la partie décimale > 0.5 => +1
    // - si = 0.5 => supprimer la virgule (donc garder l'entier inférieur)
    const base = Math.floor(p);
    const frac = p - base;
    const value = frac > 0.500000001 ? base + 1 : base;
    return `${value}%`;
  };

  // Calculer la hauteur dynamique du spacer selon le nombre d'articles et le format
  // Base différente selon format: A5 (40mm) vs A4 (48mm) + ajustement par article
  // Maximum: 160mm pour A5, 180mm pour A4 pour éviter des spacers trop grands
  const itemsCount = items.length;
  const baseHeight = size === 'A5' ? 40 : 48;
  const increment = size === 'A5' ? 4 : 6; // Espacement plus serré en A5
  const maxHeight = size === 'A5' ? 160 : 180;
  const dynamicSpacerHeight = Math.min(maxHeight, Math.max(baseHeight, baseHeight + Math.max(0, itemsCount - 5) * increment));

  const contact = client || fournisseur || ((bon?.type === 'Comptant' && bon?.client_nom) ? { nom_complet: bon.client_nom } as any : undefined);
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || '-')
  );
  // — Toujours exposer téléphone / adresse livraison si présents, même sans contact —
  const tel = (bon?.phone ?? bon?.tel ?? bon?.telephone ?? (contact as any)?.telephone ?? (contact as any)?.tel ?? '') as string | undefined;
  const adrLiv = (bon?.adresse_livraison || bon?.adresseLivraison || '') as string | undefined;
  const hasContactOrInfo = Boolean(contact || (tel && String(tel).trim()) || (adrLiv && String(adrLiv).trim()));

  // Variables de taille adaptées au format
  const isA5 = size === 'A5';
  const textSizes = {
    header: isA5 ? 'text-base' : 'text-lg',
    subheader: isA5 ? 'text-sm' : 'text-base', 
    normal: isA5 ? 'text-xs' : 'text-sm',
    small: isA5 ? 'text-[10px]' : 'text-xs',
    tableHeader: isA5 ? 'text-[10px]' : 'text-xs',
    tableCell: isA5 ? 'text-[9px]' : 'text-xs'
  };
  const spacing = {
    padding: isA5 ? 'p-3' : 'p-3',
    margin: isA5 ? 'mb-2' : 'mb-3',
    gap: isA5 ? 'gap-1' : 'gap-2'
  };

  return (
    <div 
      className={`print-root box-border bg-white ${size === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'} mx-auto ${spacing.padding} font-sans ${textSizes.normal} print:shadow-none`}
      style={{ fontFamily: 'sans-serif', position: 'relative', boxSizing: 'border-box' }}
    >
    {/* Styles spécifiques impression pour assurer largeur totale du tableau */}
      <style>
        {`@media print {
      @page { size: ${size}; margin: 0; }
      html, body { width: 100%; margin: 0 !important; padding: 0 !important; }
      .print-root { position: relative; box-sizing: border-box; width: auto !important; max-width: 100% !important; overflow: visible !important; }
      .print-root *, .print-root *::before, .print-root *::after { box-sizing: inherit; }
      .print-footer-spacer { height: ${dynamicSpacerHeight}mm; }
      /* Le spacer adapte sa hauteur selon le nombre d'articles pour éviter le chevauchement avec le cachet */
      /* Pour les très gros bons, forcer une nouvelle page pour le cachet (seuil adapté au format) */
      ${itemsCount > (size === 'A5' ? 20 : 25) ? `.print-footer-spacer { page-break-before: always; height: ${size === 'A5' ? '50mm' : '60mm'}; }` : ''}
      .company-footer { page-break-inside: avoid; break-inside: avoid; }
      .print-table-full { width: 100% !important; border-collapse: collapse !important; table-layout: auto !important; }
      /* Réduire un peu les paddings en impression pour éviter la coupe du dernier col */
      .print-table-full th, .print-table-full td { padding-left: 4px !important; padding-right: 4px !important; }
      /* Allow product names to wrap; keep numbers/codes fully visible */
      .print-table-full th, .print-table-full td { word-break: break-word; }
      .print-table-full .product-cell { white-space: normal !important; word-break: break-word !important; }
      .print-table-full .num-cell { white-space: nowrap !important; word-break: normal !important; }
      .totals-section, .client-stamp { page-break-inside: avoid; break-inside: avoid; }
      /* Empêcher un saut de page juste avant le spacer si il reste assez d'espace */
      .print-footer-spacer { page-break-inside: avoid; break-inside: avoid; }
      body { margin:0; padding:0; }
      }
      /* Indicateur visuel à l'écran pour voir l'espace réservé */
      @media screen {
        .print-root { box-sizing: border-box; }
        .print-root *, .print-root *::before, .print-root *::after { box-sizing: inherit; }
        .print-footer-spacer { 
          height: ${Math.max(20, Math.min(dynamicSpacerHeight, 60))}px; 
          background: linear-gradient(to bottom, transparent 0%, rgba(59, 130, 246, 0.1) 50%, rgba(59, 130, 246, 0.2) 100%);
          border: 1px dashed #3b82f6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: #3b82f6;
        }
        .print-footer-spacer::after {
          content: "${itemsCount} articles - Format ${size} - Spacer: ${dynamicSpacerHeight}mm ${itemsCount > (size === 'A5' ? 20 : 25) ? '(Nouvelle page)' : ''}";
        }
      }`}
      </style>
      {/* Options */}
      <div className="flex justify-end items-center gap-4 mb-2 print-hidden">
        <div className="flex items-center">
          <label htmlFor="company-select" className="mr-2 text-sm font-medium">Société :</label>
          <select
            id="company-select"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value as 'DIAMOND' | 'MPC')}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="DIAMOND">BOUKIR DIAMOND</option>
            <option value="MPC">BOUKIR MPC</option>
          </select>
        </div>

        <div className="flex items-center">
          <label htmlFor="print-mode" className="mr-2 text-sm font-medium">Mode impression :</label>
          <select
            id="print-mode"
            value={printMode}
            onChange={(e) => setPrintMode(e.target.value as 'WITH_PRICES' | 'WITHOUT_PRICES' | 'PRODUCTS_ONLY')}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="WITH_PRICES">Avec prix</option>
            <option value="WITHOUT_PRICES">Sans prix</option>
            <option value="PRODUCTS_ONLY">Produits seulement</option>
          </select>
        </div>
      </div>

      {/* En-tête */}
      <CompanyHeader companyType={selectedCompany} />

      {/* Infos document */}
      <div className="flex justify-between items-start mb-6 mt-6">
        {/* Contact / Infos (affiche aussi si seulement numéro ou adresse livraison) */}
        <div className="flex-1">
          {hasContactOrInfo && (
            <>
              <h3 className={`${textSizes.header} font-semibold text-gray-800 ${spacing.margin}`}>
                {contact ? 'Contact :' : 'Informations :'}
              </h3>
              <div className={`bg-gray-50 ${spacing.padding} rounded border-l-4 border-orange-500`}>
                <div className={`grid grid-cols-2 ${spacing.gap} ${textSizes.normal}`}>
                  {contactDisplayName && contactDisplayName !== '-' && (
                    <div><span className="font-medium">Nom:</span> {contactDisplayName}</div>
                  )}
                  <div><span className="font-medium">Service de charge:</span> <strong>06.66.21.66.57</strong></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Cartouche */}
        <div className={`ml-6 text-right ${isA5 ? 'ml-3' : 'ml-6'}`}>
          <div className={`${spacing.padding} rounded border border-orange-200`}>
            <h2 className={`${textSizes.header} font-bold text-orange-700 ${spacing.margin}`}>
              BON DEVIS {getBonNumeroDisplay(bon)}
            </h2>
            <div className={`space-y-2 ${textSizes.normal}`}>
              <div><span className="font-medium">Date:</span> {formatHeure(bon.date_creation)}</div>
              {(adrLiv && String(adrLiv).trim()) && (
                <div><span className="font-medium">Livraison:</span> {String(adrLiv).trim()}</div>
              )}
              {bon.date_echeance && (
                <div><span className="font-medium">Échéance:</span> {formatDate(bon.date_echeance)}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table articles */}
      <div className={spacing.margin}>
        <table style={{width:'100%'}} className="no-mobile-scroll print-table-full w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-orange-500 text-white">
              <th className={`num-cell border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} text-left font-semibold ${textSizes.tableHeader} whitespace-nowrap w-[1%]`}>CODE</th>
              <th className={`product-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-left font-semibold ${textSizes.tableHeader}`}>Article</th>
              <th className={`num-cell border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} text-center font-semibold ${textSizes.tableHeader} whitespace-nowrap w-[1%]`}>Unité</th>
              {printMode !== 'PRODUCTS_ONLY' && (
                <th className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-center font-semibold ${textSizes.tableHeader}`}>Qté</th>
              )}
              {printMode === 'WITH_PRICES' && (
                <>
                  {bon?.type === 'Commande' ? (
                    <>
                      <th className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-semibold ${textSizes.tableHeader}`}>P.A (DH)</th>
                      <th className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-semibold ${textSizes.tableHeader}`}>Total (DH)</th>
                    </>
                  ) : (
                    <>
                      <th className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-semibold ${textSizes.tableHeader}`}>Prix (DH)</th>
                      {usePromo && (
                        <th className={`num-cell border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} text-center font-semibold ${textSizes.tableHeader} whitespace-nowrap w-[1%]`}>Promo</th>
                      )}
                      <th className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-semibold ${textSizes.tableHeader}`}>Total (DH)</th>
                    </>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, index: number) => {
              const quantite = parseMoney(item.quantite || 0);
              const prixUnitaire = parseMoney(item.prix_unitaire || 0);
              const total = quantite * prixUnitaire;

              const original = bon?.type === 'Commande' ? 0 : getOriginalSalePrice(item);

              // Compare using cents (rounded to 2 decimals) to avoid false promos from floating/format artifacts.
              const originalCents = toCents(original);
              const puCents = toCents(prixUnitaire);
              const hasPromo = usePromo && bon?.type !== 'Commande' && originalCents > 0 && puCents > 0 && originalCents > puCents;
              const promoPct = hasPromo ? ((originalCents - puCents) / originalCents) * 100 : 0;
              const priceToShowCents = hasPromo ? originalCents : puCents;

              const productId = item.product_id ?? item.produit_id ?? item.id ?? '';
              const rowKey = productId || `${item.designation}-${index}`;
              // Build designation with variant name if available
              let variantName: string | undefined = (item.variant_name || item.variant || item.variantLabel) as string | undefined;
              const vIdRaw = item.variant_id ?? item.variantId;
              if (!variantName && vIdRaw && products && products.length) {
                const product = findProductById(productId);
                const variants = product?.variants || [];
                const vFound = variants.find((v: any) => String(v.id) === String(vIdRaw));
                if (vFound && vFound.variant_name) variantName = String(vFound.variant_name);
              }
              const designationText = variantName ? `${item.designation || ''} - ${variantName}` : (item.designation || '');
              // Resolve unit name
              const itemUnitId = item?.unit_id ?? item?.unite_id ?? item?.uniteId;
              const itemProduct = findProductById(productId);
              let unitLabel = itemProduct?.base_unit || '';
              if (itemUnitId && Array.isArray(itemProduct?.units)) {
                const matchedUnit = itemProduct.units.find((uu: any) => String(uu.id) === String(itemUnitId));
                if (matchedUnit?.unit_name) unitLabel = matchedUnit.unit_name;
              }
              return (
                <tr key={rowKey} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className={`num-cell border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} ${textSizes.tableCell} text-gray-700`}>{productId}</td>
                  <td className={`product-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'}`}>
                    <div className={`font-medium ${textSizes.tableCell}`}>{designationText}</div>
                    {item.description && (
                      <div className={`${textSizes.small} text-gray-600 italic`}>{item.description}</div>
                    )}
                  </td>
                  <td className={`num-cell border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} text-center ${textSizes.tableCell} text-gray-700`}>{unitLabel}</td>
                  {printMode !== 'PRODUCTS_ONLY' && (
                    <td className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-center ${textSizes.tableCell}`}>{quantite}</td>
                  )}
                  {printMode === 'WITH_PRICES' && (
                    <>
                      {bon?.type === 'Commande' ? (
                        <>
                          <td className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right ${textSizes.tableCell}`}>{prixUnitaire.toFixed(2)}</td>
                          <td className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-medium ${textSizes.tableCell}`}>{total.toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right ${textSizes.tableCell}`}>{(priceToShowCents / 100).toFixed(2)}</td>
                          {usePromo && (
                            <td className={`num-cell border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} text-center ${textSizes.tableCell} whitespace-nowrap w-[1%]`}>{hasPromo ? formatPromoPct(promoPct) : ''}</td>
                          )}
                          <td className={`num-cell border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-medium ${textSizes.tableCell}`}>{total.toFixed(2)}</td>
                        </>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totaux */}
      {printMode === 'WITH_PRICES' && (
        <div className={`flex justify-end ${spacing.margin} totals-section`}>
          <div className={isA5 ? 'w-60' : 'w-80'}>
            <div className={`${spacing.padding} rounded`}>
              <div className={`flex justify-between items-center ${textSizes.subheader} font-bold`}>
                <span>TOTAL GÉNÉRAL:</span>
                <span>{sousTotal.toFixed(2)} DH</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Observations */}
      {bon.notes && (
        <div className={spacing.margin}>
          <h4 className="font-semibold text-gray-800 mb-2">Observations:</h4>
          <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-500">
            <p className="text-sm text-gray-700">{bon.notes}</p>
          </div>
        </div>
      )}

      {/* Vehicle info section */}
      {(
        bon?.vehicule_nom || bon?.vehicule?.nom || bon?.vehicule_designation || bon?.vehicule_label ||
        bon?.vehicule_immatriculation || bon?.vehicule?.immatriculation || bon?.immatriculation
      ) && (
        <div className="mb-4">
          <div className="flex justify-end">
            <div className="text-right text-sm">
              {(
                bon?.vehicule_nom || bon?.vehicule?.nom || bon?.vehicule_designation || bon?.vehicule_label
              ) && (
                <div className="mb-1">
                  <div className="font-medium">Véhicule: {bon?.vehicule_nom}</div>
                </div>
              )}
              {(
                bon?.vehicule_immatriculation || bon?.vehicule?.immatriculation || bon?.immatriculation
              ) && (
                <div>
                  <div className="font-medium">Immatriculation:</div>
                  <div>{bon?.vehicule_immatriculation || bon?.vehicule?.immatriculation || bon?.immatriculation}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

  {/* Spacer qui réserve la place du footer (impression) */}
  <div className="print-footer-spacer" />
  {/* Pied de page (toujours essaie de rester dans la dernière page si place) */}
  <CompanyFooter data={companyFooters[selectedCompany]} size={size} />
    </div>
  );
};

export default BonPrintTemplate;
