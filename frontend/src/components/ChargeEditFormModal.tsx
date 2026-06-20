import React, { useMemo } from 'react';
import BonFormModal from './BonFormModal';
import { useGetProductsWithSnapshotsQuery } from '../store/api/productsApi';

type ChargeEditFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialValues: any;
  onBonAdded: (bon: any) => void;
};

const parseItems = (items: any) => {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const itemProductId = (item: any) =>
  item?.product_id ?? item?.produit_id ?? item?.productId ?? item?.product?.id ?? item?.produit?.id ?? '';

const itemVariantId = (item: any) =>
  item?.variant_id ?? item?.variantId ?? item?.variant?.id ?? '';

const buildProductMaps = (snapshotProducts: any[]) => {
  const byProduct = new Map<string, any>();
  const bySnapshot = new Map<string, any>();
  const byProductVariant = new Map<string, any>();

  for (const row of snapshotProducts || []) {
    const productId = String(row?.id ?? row?.product_id ?? '');
    if (!productId) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, row);
    if (row?.snapshot_id != null) bySnapshot.set(String(row.snapshot_id), row);
    const variantId = String(row?.variant_id ?? '');
    if (variantId && !byProductVariant.has(`${productId}:${variantId}`)) {
      byProductVariant.set(`${productId}:${variantId}`, row);
    }
  }

  return { byProduct, bySnapshot, byProductVariant };
};

const normalizeChargeItem = (item: any, maps: ReturnType<typeof buildProductMaps>) => {
  const productId = itemProductId(item);
  const variantId = itemVariantId(item);
  const isFreeDesignationLine = !productId;
  const snapshotId = item?.product_snapshot_id ?? item?.snapshot_id ?? null;
  const snapshot = snapshotId != null ? maps.bySnapshot.get(String(snapshotId)) : null;
  const product = (productId ? maps.byProduct.get(String(productId)) : null) || snapshot || null;
  const variantSnapshot = productId && variantId ? maps.byProductVariant.get(`${String(productId)}:${String(variantId)}`) : null;
  const variant = product?.variants?.find?.((v: any) => String(v?.id) === String(variantId)) || null;

  const reference =
    item?.product_reference ??
    item?.variant_reference ??
    item?.reference ??
    item?.product?.reference ??
    item?.produit?.reference ??
    variant?.reference ??
    variantSnapshot?.reference ??
    snapshot?.reference ??
    product?.reference ??
    productId;

  const designation =
    item?.designation ??
    item?.designation_custom ??
    item?.product_designation ??
    item?.product?.designation ??
    item?.produit?.designation ??
    snapshot?.designation ??
    variantSnapshot?.designation ??
    product?.designation ??
    '';
  const customDesignation = String(
    item?.designation_custom ?? (isFreeDesignationLine ? designation : '') ?? ''
  ).trim();

  const variantName =
    item?.variant_name ??
    item?.variant?.variant_name ??
    variant?.variant_name ??
    variantSnapshot?.variant_name ??
    snapshot?.variant_name ??
    '';

  const qty = Number(item?.quantite ?? item?.qty ?? 0) || 0;
  const prixUnitaire = Number(item?.prix_unitaire ?? item?.prix ?? 0) || 0;
  const prixAchat = Number(item?.prix_achat ?? item?.pa ?? snapshot?.prix_achat ?? variant?.prix_achat ?? product?.prix_achat ?? 0) || 0;
  const coutRevient = Number(item?.cout_revient ?? item?.cout_rev ?? item?.cout ?? snapshot?.cout_revient ?? variant?.cout_revient ?? product?.cout_revient ?? prixAchat) || 0;

  return {
    ...item,
    line_mode: isFreeDesignationLine ? 'detail' : (item?.line_mode || 'normal'),
    product_id: productId ? String(productId) : '',
    variant_id: variantId ? String(variantId) : '',
    unit_id: item?.unit_id ?? item?.unitId ?? item?.unit?.id ?? '',
    product_snapshot_id: snapshotId,
    product_reference: reference ? String(reference) : '',
    variant_reference: item?.variant_reference ?? variant?.reference ?? '',
    designation: designation ? String(designation) : '',
    designation_custom: customDesignation,
    variant_name: variantName ? String(variantName) : '',
    quantite: qty,
    prix_achat: prixAchat,
    cout_revient: coutRevient,
    prix_unitaire: prixUnitaire,
    total: Number(item?.total ?? item?.montant_ligne ?? qty * prixUnitaire) || 0,
  };
};

const ChargeEditFormModal: React.FC<ChargeEditFormModalProps> = ({
  isOpen,
  onClose,
  initialValues,
  onBonAdded,
}) => {
  const { data: snapshotProducts = [] } = useGetProductsWithSnapshotsQuery(undefined, { skip: !isOpen });

  const normalizedInitialValues = useMemo(() => {
    const maps = buildProductMaps(snapshotProducts as any[]);
    const items = parseItems(initialValues?.items).map((item: any) => normalizeChargeItem(item, maps));

    return {
      ...initialValues,
      type: 'Charge',
      items,
    };
  }, [initialValues, snapshotProducts]);

  return (
    <BonFormModal
      key={`charge-edit-${initialValues?.id || 'new'}-${snapshotProducts.length}`}
      isOpen={isOpen}
      onClose={onClose}
      currentTab="Charge"
      initialValues={normalizedInitialValues}
      onBonAdded={onBonAdded}
    />
  );
};

export default ChargeEditFormModal;
