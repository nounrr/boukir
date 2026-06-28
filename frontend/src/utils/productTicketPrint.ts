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

export const printProductTicket = ({ name, reference, variantName }: ProductTicketInput) => {
  const ref = String(reference ?? '').trim();
  const productName = String(name ?? '').trim();
  const variant = String(variantName ?? '').trim();
  if (!ref && !productName) return;

  const fullName = variant ? `${productName} - ${variant}` : productName;
  const printWindow = window.open('', '_blank', 'width=360,height=280');
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Ticket produit</title>
        <style>
          @page {
            size: 5cm 3cm;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: 5cm;
            height: 3cm;
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            background: #fff;
          }

          .ticket {
            width: 5cm;
            height: 3cm;
            position: relative;
            overflow: hidden;
            border: 1px solid #000;
          }

          .name {
            position: absolute;
            top: 0;
            left: 1mm;
            right: 1mm;
            height: 15mm;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 3mm 0.5mm 0;
            text-align: center;
            font-size: 9.5pt;
            font-weight: 900;
            line-height: 1.05;
            overflow: hidden;
          }

          .ref {
            position: absolute;
            left: 1mm;
            right: 1mm;
            bottom: 2mm;
            height: 12mm;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1.2mm;
            padding: 0;
            text-align: center;
            font-weight: 900;
            line-height: 0.95;
            overflow-wrap: anywhere;
          }

          .ref-label {
            font-size: 14pt;
            font-weight: 900;
            white-space: nowrap;
          }

          .ref-value {
            font-size: 28pt;
            font-weight: 900;
            overflow-wrap: anywhere;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="name">${escapeHtml(fullName)}</div>
          <div class="ref">
            <span class="ref-label">REF</span>
            <span class="ref-value">${escapeHtml(ref)}</span>
          </div>
        </div>
        <script>
          window.onload = function () {
            window.focus();
            window.print();
            window.close();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
