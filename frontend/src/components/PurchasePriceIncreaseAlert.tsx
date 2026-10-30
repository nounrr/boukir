import { useEffect, useState } from 'react';
import { usePreviewPurchaseIncreaseMutation } from '../store/api/commandesApi';

export default function PurchasePriceIncreaseAlert({ productId, variantId, unitId, price }: {
  productId: any; variantId: any; unitId: any; price: number;
}) {
  const [preview] = usePreviewPurchaseIncreaseMutation();
  const [result, setResult] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setResult(null);
    setFailed(false);
    if (!productId || !(price > 0)) return;
    const timer = setTimeout(() => {
      preview({ product_id: productId, variant_id: variantId || null, unit_id: unitId || null, prix_unitaire: price })
        .unwrap().then(value => { if (active) setResult(value); })
        .catch(() => { if (active) setFailed(true); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [productId, variantId, unitId, price, preview]);
  const fmt = (value: number) => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 4 });
  if (failed) return <div role="alert" className="mt-2 text-xs text-red-700">Comparaison du prix d’achat indisponible.</div>;
  if (!result) return null;
  return <div role="alert" className="mt-2 min-w-[210px] rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
    <strong>Prix d’achat supérieur de {fmt(result.percentage)} %.</strong>
    <div>À l’enregistrement, les prix de vente par unité de base seront :</div>
    <div>Prix vente : {fmt(result.previous_sale_price)} → {fmt(result.sale_price)} DH</div>
    <div>Prix vente 2 : {fmt(result.previous_sale_price_2)} → {fmt(result.sale_price_2)} DH</div>
  </div>;
}
