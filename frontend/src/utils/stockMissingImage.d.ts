/** Types of stockMissingImage.js (plain JavaScript so that node --test can run it directly). */
export function isStockRowMissingImage(row: { isVariantRow?: boolean; image_url?: string | null; variant_image_url?: string | null } | null | undefined): boolean;
export function filterStockRowsByMissingImage<T>(rows: T[], enabled: boolean): T[];
