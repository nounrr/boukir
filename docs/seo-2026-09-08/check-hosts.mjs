import { writeFile } from 'node:fs/promises';
const results = [];
for (const host of ['boukirdiamond.com', 'www.boukirdiamond.com']) {
  for (const path of ['/fr', '/ar/shop?categories=1&seo_check=02']) {
    const url = `https://${host}${path}`;
    const r = await fetch(url, { redirect: 'manual' });
    results.push({ url, status: r.status, headers: Object.fromEntries(r.headers) });
    await r.body?.cancel();
  }
}
for (const origin of ['https://boukirdiamond.com', 'https://www.boukirdiamond.com', 'https://untrusted.example']) {
  const r = await fetch('https://boukirdiamond.com/api/categories', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,content-type,platform' },
  });
  results.push({ origin, method: 'OPTIONS', status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
}
await writeFile(new URL('./correction-02-http.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log(results.map(r => ({ url: r.url || r.origin, status: r.status, location: r.headers.location })));
