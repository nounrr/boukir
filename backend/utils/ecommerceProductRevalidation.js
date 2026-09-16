function cleanOrigin(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    return parsed.origin
  } catch {
    return null
  }
}

export function ecommerceProductRevalidationConfig(env = process.env) {
  const secret = String(env.ECOM_REVALIDATE_SECRET || '').trim()
  const explicitUrl = String(env.ECOM_PRODUCT_REVALIDATE_URL || '').trim()
  const frontendOrigin = cleanOrigin(env.ECOMMERCE_FRONTEND_URL)
  const url = explicitUrl || (frontendOrigin ? `${frontendOrigin}/internal-seo-cache/revalidate-product` : '')
  return secret && url ? { secret, url } : null
}

export async function revalidateEcommerceProduct(productId, options = {}) {
  const id = Number(productId)
  const config = ecommerceProductRevalidationConfig(options.env)
  if (!Number.isInteger(id) || id <= 0 || !config) return { status: 'skipped' }

  const fetchImpl = options.fetchImpl || globalThis.fetch
  try {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidation-secret': config.secret,
      },
      body: JSON.stringify({ productId: id }),
      signal: AbortSignal.timeout(2500),
    })
    if (!response.ok) {
      console.warn(`[Ecom cache] Invalidation produit ${id}: HTTP ${response.status}`)
      return { status: 'failed', httpStatus: response.status }
    }
    return { status: 'revalidated' }
  } catch (error) {
    console.warn(`[Ecom cache] Invalidation produit ${id} impossible:`, error?.message || error)
    return { status: 'failed' }
  }
}
