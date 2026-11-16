import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { bonBarcodeValue } from '../utils/bonBarcode';

/**
 * QR code d'un bon (même contenu que le code-barres, ex. SOR-1042), en SVG vectoriel.
 * Une webcam lit un QR code bien plus facilement qu'un code-barres à barres fines,
 * même de près ou avec une mise au point moyenne.
 */
export default function BonQrCode({ type, id, size = 76 }: { type?: string; id?: number | string; size?: number }) {
  const value = bonBarcodeValue(type, id);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let alive = true;
    if (!value) { setSvg(''); return undefined; }
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((markup) => { if (alive) setSvg(markup); })
      .catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [value]);

  if (!value || !svg) return null;
  return (
    <div
      role="img"
      aria-label={`QR code ${value}`}
      style={{ width: size, height: size, margin: '0 auto' }}
      // SVG produit localement par la bibliothèque qrcode à partir d'un code contrôlé (lettres, tiret, chiffres).
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', `<svg width="${size}" height="${size}" `) }}
    />
  );
}
