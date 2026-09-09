import fs from 'node:fs/promises';
const base = 'https://boukirdiamond.com';
const results = [];
for (const path of ['/robots.txt', '/sitemap.xml', '/api/ecommerce/products/sitemap', '/api/services/sitemap', '/api/maalems/sitemap', '/api/ecommerce/products?per_page=1&page=1']) {
  const r = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
  const body = await r.text();
  const result = { path, status: r.status };
  if (path === '/sitemap.xml') {
    result.urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map(x => x[1]);
    result.products = result.urls.filter(x => x.includes('/product/')).length;
  } else if (path === '/robots.txt') result.body = body;
  else {
    try {
      const data = JSON.parse(body);
      result.pagination = data.pagination;
      result.keys = Object.keys(data);
      if (r.status !== 200) result.message = data.message;
    } catch { result.bodyType = 'not JSON'; }
  }
  results.push(result);
}
for (const locale of ['fr', 'ar']) for (const id of [6376, 6696]) {
  const path = `/${locale}/product/${id}`;
  const r = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const body = await r.text();
  const canonical = [...body.matchAll(/<link\b[^>]*>/g)].map(x => x[0]).find(x => /rel="canonical"/.test(x))?.match(/href="([^"]+)"/)?.[1];
  results.push({ path, status: r.status, canonical, canonicalMatches: canonical === base + path });
}
await fs.writeFile(new URL('./correction-03-public.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results.map(x => ({ ...x, urls: x.urls?.length, body: undefined })), null, 2));
