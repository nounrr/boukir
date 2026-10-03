// RTK Query replaces result arrays when data changes. WeakMap lets old indexes
// be collected with their result, without retaining the full catalogue.
const indexes = new WeakMap<any[], Map<string, Map<string, any[]>>>();

export const snapshotsForProductVariant = (snapshots: any[], productId: any, variantId: any): any[] => {
  let index = indexes.get(snapshots);
  if (!index) {
    index = new Map();
    for (const snapshot of snapshots) {
      if (!snapshot?.snapshot_id) continue;
      const productKey = String(snapshot.id);
      const variantKey = String(snapshot.variant_id || '');
      let variants = index.get(productKey);
      if (!variants) index.set(productKey, variants = new Map());
      let entries = variants.get(variantKey);
      if (!entries) variants.set(variantKey, entries = []);
      entries.push(snapshot);
    }
    indexes.set(snapshots, index);
  }
  return index.get(String(productId))?.get(String(variantId || '')) || [];
};
