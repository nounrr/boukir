import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { bonBarcodeValue } from '../utils/bonBarcode';

/**
 * Code-barres Code 128 d'un bon, en SVG (vectoriel : net à l'impression thermique,
 * et recopié tel quel dans la fenêtre d'impression).
 */
export default function BonBarcode({ type, id, height = 38, width = 1.3 }: { type?: string; id?: number | string; height?: number; width?: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const value = bonBarcodeValue(type, id);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width,
        height,
        margin: 4,
        displayValue: true,
        fontSize: 11,
        textMargin: 1,
        font: 'monospace',
        background: '#ffffff',
        lineColor: '#000000',
      });
      // viewBox : le code se réduit proportionnellement s'il dépasse la largeur du ticket.
      const svg = ref.current;
      const w = parseFloat(svg.getAttribute('width') || '0');
      const h = parseFloat(svg.getAttribute('height') || '0');
      if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    } catch {
      /* valeur non encodable : rien n'est affiché */
    }
  }, [value, height, width]);

  if (!value) return null;
  return <svg ref={ref} role="img" aria-label={`Code-barres ${value}`} style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }} />;
}
