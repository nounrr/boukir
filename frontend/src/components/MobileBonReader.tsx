import React from 'react';
import type { Contact } from '../types';
import { getBonNumeroDisplay } from '../utils/numero';
import { pickDesignationForLang, type DesignationLang } from '../utils/designationLang';
import { toBackendUrl } from '../utils/url';
import { useCanViewInternalPrices } from '../hooks/useCanViewInternalPrices';

interface Props {
  bon: any;
  client?: Contact;
  fournisseur?: Contact;
  products: any[];
  designationLang: DesignationLang;
  includeProductImages: boolean;
  title?: string;
  reference?: string;
}

const money = (value: any) => `${new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} DH`;
const number = (value: any) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 }).format(Number(value) || 0);

const MobileBonReader: React.FC<Props> = ({ bon, client, fournisseur, products, designationLang, includeProductImages, title, reference }) => {
  const canViewInternalPrices = useCanViewInternalPrices();
  const showPrices = canViewInternalPrices || !['Commande', 'AvoirFournisseur', 'Charge', 'AvoirCharge'].includes(bon?.type);
  let items: any[] = [];
  try { items = Array.isArray(bon?.items) ? bon.items : JSON.parse(bon?.items || '[]'); } catch { items = []; }
  if (!Array.isArray(items)) items = [];
  const total = Number(bon?.montant_total) || items.reduce((sum, item) => sum + (Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0), 0);
  const contact = client || fournisseur;
  return <section className="space-y-3" aria-label="Lecture du bon sur téléphone">
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{title || bon?.type || 'Bon'}</p>
      <h3 className="mt-1 break-words text-xl font-bold text-slate-900">{reference || getBonNumeroDisplay(bon)}</h3>
      {bon?.date && <p className="mt-1 text-sm text-slate-600">{new Date(bon.date).toLocaleDateString('fr-FR')}</p>}
      {contact && <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">{fournisseur ? 'Fournisseur' : 'Client'}</p><p className="font-semibold text-slate-900">{contact.societe || contact.nom_complet}</p></div>}
    </div>
    <div className="flex items-center justify-between px-1"><h3 className="font-semibold text-slate-900">Produits</h3><span className="text-sm text-slate-500">{items.length} ligne{items.length !== 1 ? 's' : ''}</span></div>
    {items.map((item, index) => {
      const product = products.find(p => String(p?.id) === String(item.product_id ?? item.produit_id));
      const fallback = item.designation_custom || item.designation || item.product_name || product?.designation || 'Produit';
      const designation = pickDesignationForLang(designationLang, fallback, item, product);
      const image = toBackendUrl(item.product_image_url || item.image_url || item.product?.image_url || product?.image_url);
      return <article key={item.id ?? index} className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          {includeProductImages && image && <img src={image} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-100 object-contain" />}
          <div className="min-w-0"><p className="break-words font-semibold text-slate-900">{designation}</p>{(item.reference || product?.reference) && <p className="mt-1 text-xs text-slate-500">Réf. {item.reference || product?.reference}</p>}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm"><div><p className="text-xs text-slate-500">Quantité</p><p className="font-semibold">{number(item.quantite)}</p></div>{showPrices && <><div><p className="text-xs text-slate-500">Prix unitaire</p><p className="font-semibold">{money(item.prix_unitaire)}</p></div><div><p className="text-xs text-slate-500">Total</p><p className="font-bold text-blue-700">{money((Number(item.quantite) || 0) * (Number(item.prix_unitaire) || 0))}</p></div></>}</div>
      </article>;
    })}
    {showPrices && <div className="flex items-center justify-between rounded-2xl bg-blue-700 p-4 text-white"><span className="font-semibold">Total du bon</span><strong className="text-lg">{money(total)}</strong></div>}
  </section>;
};

export default MobileBonReader;
