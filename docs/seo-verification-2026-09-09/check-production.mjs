import fs from 'node:fs/promises';
const base = 'https://boukirdiamond.com';
const languages = ['fr', 'ar', 'en', 'zh'];
const results = [];
const decode = s => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
for (const locale of languages) {
  for (const path of ['', '/shop', '/contact', '/product/6376', '/product/6696', '/categories/73-ciment', '/categories/75-etancheite-bitume', '/marques/37-danosa', '/shop?category_id=75&brand_id=37']) {
    const route = `/${locale}${path}`;
    try {
      const r = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      const html = await r.text();
      const tags = [...html.matchAll(/<(?:link|meta)\b[^>]*>/gi)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k.toLowerCase(), decode(v)])));
      const canonical = tags.find(t => t.rel === 'canonical')?.href;
      const alternates = Object.fromEntries(tags.filter(t => t.rel === 'alternate' && t.hreflang).map(t => [t.hreflang, t.href]));
      const social = tags.filter(t => ['og:url','og:image','twitter:image'].includes(t.property || t.name));
      const schemas = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
      const localSignals = [...tags.filter(t => t.rel === 'canonical' || t.hreflang || ['og:url','og:image','twitter:image'].includes(t.property || t.name)).map(t => JSON.stringify(t)), ...schemas].filter(s => /localhost|127\.0\.0\.1/.test(s));
      const productLinks = [...new Set([...html.matchAll(/<a\b[^>]*href="([^"]*\/product\/\d+)"/g)].map(m => m[1]))];
      results.push({ route, status: r.status, location: r.headers.get('location'), canonical, alternates, robots: tags.filter(t => t.name === 'robots').map(t => t.content), localSignals, social, h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m => m[1].replace(/<[^>]*>/g, '')), productLinks });
    } catch (error) { results.push({ route, error: error.message }); }
  }
}
for (const route of ['/fr/categories/unknown-seo-test', '/zh/marques/unknown-seo-test', '/fr/categories/75-etancheite-bitume?page=2', '/robots.txt', '/sitemap.xml', '/api/ecommerce/products/sitemap', '/api/ecommerce/products/catalog-pages', '/api/services/sitemap', '/api/maalems/sitemap']) {
  const r = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const body = await r.text();
  results.push({ route, status: r.status, location: r.headers.get('location'), body: route.startsWith('/api') || route === '/robots.txt' ? body.slice(0, 6000) : undefined, sitemapUrls: route === '/sitemap.xml' ? (body.match(/<loc>/g) || []).length : undefined });
}
for (const protocol of ['http','https']) for (const host of ['boukirdiamond.com','www.boukirdiamond.com']) {
  const url = `${protocol}://${host}/ar/categories/75-etancheite-bitume?utm_source=seo-test`;
  const r = await fetch(url, { redirect: 'manual' });
  results.push({ url, status: r.status, location: r.headers.get('location') });
  await r.body?.cancel();
}
for (const origin of [base, 'https://www.boukirdiamond.com', 'https://untrusted.example']) {
  const r = await fetch(base + '/api/categories', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,content-type,platform' } });
  results.push({ origin, method: 'OPTIONS', status: r.status, allowOrigin: r.headers.get('access-control-allow-origin'), credentials: r.headers.get('access-control-allow-credentials') });
  await r.body?.cancel();
}
await fs.writeFile(new URL('./production.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log(results.map(({ route, url, origin, status, location, canonical, localSignals }) => ({ route: route || url || origin, status, location, canonical, localSignals: localSignals?.length })));
