// Server-side stock PDF generation (pdfmake), with snapshot-aware values and
// Arabic text support. Mirrors the display logic of the frontend StockPage so the
// downloaded PDF matches what users see on screen.

import PdfPrinterMod from 'pdfmake/src/printer.js';
import { amiriVfs } from './fonts/amiriVfs.js';
import { prepareArabicText } from './pdfArabic.js';

const PdfPrinter = PdfPrinterMod.default || PdfPrinterMod;

// pdfmake needs Buffers for embedded fonts. Amiri (OFL) supports Arabic + Latin,
// so we use it as the single document font for both normal and bold.
const fontDescriptors = {
  Amiri: {
    normal: Buffer.from(amiriVfs['Amiri-Regular.ttf'], 'base64'),
    bold: Buffer.from(amiriVfs['Amiri-Bold.ttf'], 'base64'),
  },
};

const printer = new PdfPrinter(fontDescriptors);

const formatNum = (n) => String(parseFloat(Number(n || 0).toFixed(2)));
const T = (v) => prepareArabicText(v == null ? '' : String(v));

// ── Snapshot helpers (kept in sync with frontend/src/pages/StockPage.tsx) ──

function getOldestPositiveSnapshotRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.reduce((oldest, row) => {
    if (!oldest) return row;
    const oldestTime = new Date(oldest?.created_at || 0).getTime();
    const rowTime = new Date(row?.created_at || 0).getTime();
    if (rowTime < oldestTime) return row;
    if (rowTime === oldestTime && Number(row?.id || 0) < Number(oldest?.id || 0)) return row;
    return oldest;
  }, null);
}

function getSnapshotDisplayPrices(p) {
  const sd = p.snapshot_display;
  if (!sd || sd.mode === 'product') {
    return {
      prix_achat: Number(p.prix_achat || 0),
      cout_revient: Number(p.cout_revient || 0),
      prix_gros: Number(p.prix_gros || 0),
      prix_vente: Number(p.prix_vente || 0),
    };
  }
  if (sd.mode === 'last_snapshot' || sd.mode === 'single_positive' || sd.mode === 'uniform_positive') {
    const d = sd.data;
    return {
      prix_achat: d?.prix_achat != null ? Number(d.prix_achat) : Number(p.prix_achat || 0),
      cout_revient: d?.cout_revient != null ? Number(d.cout_revient) : Number(p.cout_revient || 0),
      prix_gros: d?.prix_gros != null ? Number(d.prix_gros) : Number(p.prix_gros || 0),
      prix_vente: d?.prix_vente != null ? Number(d.prix_vente) : Number(p.prix_vente || 0),
    };
  }
  if (sd.mode === 'multi_different') {
    const oldestRow = getOldestPositiveSnapshotRow(sd.rows);
    return {
      prix_achat: oldestRow?.prix_achat != null
        ? Number(oldestRow.prix_achat)
        : (p?.snapshot_prix_achat_old != null ? Number(p.snapshot_prix_achat_old) : Number(p.prix_achat || 0)),
      cout_revient: oldestRow?.cout_revient != null ? Number(oldestRow.cout_revient) : Number(p.cout_revient || 0),
      prix_gros: oldestRow?.prix_gros != null ? Number(oldestRow.prix_gros) : Number(p.prix_gros || 0),
      prix_vente: oldestRow?.prix_vente != null
        ? Number(oldestRow.prix_vente)
        : (p?.snapshot_prix_vente_old != null ? Number(p.snapshot_prix_vente_old) : Number(p.prix_vente || 0)),
    };
  }
  return {
    prix_achat: Number(p.prix_achat || 0),
    cout_revient: Number(p.cout_revient || 0),
    prix_gros: Number(p.prix_gros || 0),
    prix_vente: Number(p.prix_vente || 0),
  };
}

function getSnapshotAwareQuantite(p) {
  const hasRequiredVariants =
    !p?.isVariantRow &&
    (p?.has_variants === true || p?.has_variants === 1) &&
    (p?.isObligatoireVariant === true || p?.is_obligatoire_variant === true || p?.is_obligatoire_variant === 1);

  if (hasRequiredVariants && Array.isArray(p?.variants) && p.variants.length > 0) {
    return p.variants.reduce((sum, variant) => {
      const snapshotQty = variant?.snapshot_quantite_total;
      const qty = snapshotQty == null ? Number(variant?.stock_quantity || 0) : Number(snapshotQty);
      return sum + (Number.isFinite(qty) ? qty : Number(variant?.stock_quantity || 0));
    }, 0);
  }
  const v = p?.snapshot_quantite_total;
  if (v == null) return Number(p?.quantite || 0);
  const n = Number(v);
  return Number.isFinite(n) ? n : Number(p?.quantite || 0);
}

function getSnapshotPdfLabel(product) {
  const sd = product?.snapshot_display;
  if (!sd || sd.mode === 'product') return 'Produit';
  if (sd.mode === 'last_snapshot') return 'Dernier snapshot';
  if (sd.mode === 'single_positive') return 'Snapshot actif';
  if (sd.mode === 'uniform_positive') return 'Snapshots uniformes';
  if (sd.mode === 'multi_different') return `Snapshots multiples (${sd.rows?.length || 0})`;
  return String(sd.mode || 'Produit');
}

// Flatten products + variants into display rows, like the frontend table.
function flattenProducts(products) {
  const rows = [];
  for (const product of products || []) {
    if (product.is_deleted === 1) continue;
    rows.push(product);
    if (Array.isArray(product.variants)) {
      for (const variant of product.variants) {
        const variantReference = String(variant.reference ?? variant.ref ?? '').trim();
        const parentReference = String(product.reference ?? product.id ?? '').trim();
        rows.push({
          ...product,
          id: `var-${variant.id}`,
          originalId: product.id,
          designation: `${product.designation} - ${variant.variant_name}`,
          reference: variantReference || parentReference,
          prix_achat: variant.prix_achat,
          prix_vente: variant.prix_vente,
          prix_vente_2: variant.prix_vente_2 ?? product.prix_vente_2,
          quantite: variant.stock_quantity,
          snapshot_quantite_total: variant.snapshot_quantite_total ?? null,
          snapshot_prix_achat_old: variant.snapshot_prix_achat_old ?? null,
          snapshot_prix_vente_old: variant.snapshot_prix_vente_old ?? null,
          snapshot_display: variant.snapshot_display ?? null,
          isVariantRow: true,
        });
      }
    }
  }
  return rows;
}

/**
 * Builds the pdfmake document definition for the stock listing.
 * @param {Array} products  products (with variants + snapshot_display) from the search query
 * @param {object} opts     { tabLabel, filtersText }
 */
function buildDocDefinition(products, opts = {}) {
  const tabLabel = opts.tabLabel || 'Produits';
  const date = new Date().toLocaleDateString('fr-FR');
  const rows = flattenProducts(products);

  const header = [
    'Ref', 'Designation', 'Cat.', 'Qte', 'Unite',
    'PA', 'CR', 'Gros', 'PV', 'PV2', 'Type', 'Snapshot',
  ].map((h) => ({ text: h, style: 'th' }));

  const body = [header];

  for (const product of rows) {
    const dp = getSnapshotDisplayPrices(product);
    const isService = product.est_service === true || product.est_service === 1;
    const isNonStock = product.non_stockable === true || product.non_stockable === 1;
    const qte = (isService || isNonStock) ? '-' : formatNum(getSnapshotAwareQuantite(product));
    const type = isService ? 'Service' : isNonStock ? 'Non stock' : (product.isVariantRow ? 'Variante' : 'Produit');
    const unit = product.base_unit || 'u';
    const cellStyle = product.isVariantRow ? 'tdNormal' : 'td';

    body.push([
      { text: T(String(product.reference ?? product.id ?? '')), style: cellStyle },
      { text: T(String(product.designation ?? '')), style: cellStyle },
      { text: T(String(product.categorie_base || product.categorie?.nom || 'N/A')), style: 'tdNormal' },
      { text: qte, style: 'tdNum' },
      { text: T(unit), style: 'tdNormal' },
      { text: formatNum(dp.prix_achat), style: 'tdNum' },
      { text: formatNum(dp.cout_revient), style: 'tdNum' },
      { text: formatNum(dp.prix_gros), style: 'tdNum' },
      { text: formatNum(dp.prix_vente), style: 'tdNum' },
      { text: formatNum(Number(product.prix_vente_2 || 0)), style: 'tdNum' },
      { text: type, style: 'tdNormal' },
      { text: getSnapshotPdfLabel(product), style: 'tdNormal' },
    ]);
  }

  return {
    pageOrientation: 'landscape',
    pageSize: 'A4',
    pageMargins: [16, 56, 16, 28],
    defaultStyle: { font: 'Amiri', fontSize: 7.2 },
    header: () => ({
      margin: [16, 12, 16, 0],
      columns: [
        { text: `Stock - ${tabLabel}`, bold: true, fontSize: 13 },
        { text: `Date: ${date}`, alignment: 'right', fontSize: 8, color: '#475569' },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [16, 0, 16, 8],
      columns: [
        { text: T(opts.filtersText || `Elements: ${rows.length}`), fontSize: 7, color: '#64748b' },
        { text: `Page ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7, color: '#64748b' },
      ],
    }),
    content: [
      {
        table: {
          headerRows: 1,
          widths: [42, 178, 70, 34, 32, 40, 40, 40, 40, 36, 50, 70],
          body,
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? '#f1f5f9' : (rowIndex % 2 === 0 ? '#f8fafc' : null)),
          hLineWidth: () => 0.4,
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8f0',
          paddingTop: () => 2,
          paddingBottom: () => 2,
        },
      },
    ],
    styles: {
      th: { bold: true, fontSize: 7.5, color: '#1e293b' },
      td: { bold: true, fontSize: 7.2, color: '#0f172a' },
      tdNormal: { fontSize: 7.2, color: '#0f172a' },
      tdNum: { fontSize: 7.2, alignment: 'right', color: '#0f172a' },
    },
  };
}

/** Returns a readable PDFKit stream of the stock listing. */
export function createStockPdfStream(products, opts) {
  const docDefinition = buildDocDefinition(products, opts);
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  return pdfDoc;
}
