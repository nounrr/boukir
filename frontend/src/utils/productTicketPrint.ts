import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type ProductTicketInput = {
  name: string;
  reference: string | number;
  variantName?: string | null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeFilename = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'produit';

export const printProductTicket = async ({ name, reference, variantName }: ProductTicketInput) => {
  const ref = String(reference ?? '').trim();
  const productName = String(name ?? '').trim();
  const variant = String(variantName ?? '').trim();
  if (!ref && !productName) return;

  const fullName = variant ? `${productName} - ${variant}` : productName;
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '189px';
  container.style.height = '113px';
  container.style.background = '#fff';
  container.innerHTML = `
    <style>
      .product-ticket-pdf,
      .product-ticket-pdf * {
        box-sizing: border-box;
      }

      .product-ticket-pdf {
        width: 189px;
        height: 113px;
        position: relative;
        overflow: hidden;
        border: 1px solid #000;
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
        background: #fff;
      }

      .product-ticket-pdf__name {
        position: absolute;
        top: 0;
        left: 4px;
        right: 4px;
        height: 57px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 11px 2px 0;
        text-align: center;
        font-size: 13px;
        font-weight: 900;
        line-height: 1.05;
        overflow: hidden;
      }

      .product-ticket-pdf__ref {
        position: absolute;
        left: 4px;
        right: 4px;
        bottom: 8px;
        height: 45px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 0;
        text-align: center;
        font-weight: 900;
        line-height: 0.95;
        overflow-wrap: anywhere;
      }

      .product-ticket-pdf__ref-label {
        font-size: 19px;
        font-weight: 900;
        white-space: nowrap;
      }

      .product-ticket-pdf__ref-value {
        font-size: 37px;
        font-weight: 900;
        overflow-wrap: anywhere;
      }
    </style>
    <div class="product-ticket-pdf">
      <div class="product-ticket-pdf__name">${escapeHtml(fullName)}</div>
      <div class="product-ticket-pdf__ref">
        <span class="product-ticket-pdf__ref-label">REF</span>
        <span class="product-ticket-pdf__ref-value">${escapeHtml(ref)}</span>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    await document.fonts?.ready;

    const canvas = await html2canvas(container.querySelector('.product-ticket-pdf') as HTMLElement, {
      scale: 4,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'cm',
      format: [5, 3],
      compress: true,
    });

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 5, 3);
    pdf.save(`ticket-produit-${sanitizeFilename(ref || productName)}.pdf`);
  } catch (error) {
    console.error('Erreur lors du téléchargement du ticket produit PDF:', error);
  } finally {
    document.body.removeChild(container);
  }
};
