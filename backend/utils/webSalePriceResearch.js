export const WEB_PRICE_MODELS = ['gpt-5-mini', 'gpt-5', 'gpt-5.2'];

export function summarizeWebPrices(raw, sourceUrls = []) {
  const allowed = new Set(sourceUrls.filter((url) => /^https?:\/\//i.test(url)));
  const offers = [];
  for (const item of Array.isArray(raw?.offers) ? raw.offers : []) {
    const price = Number(item?.price);
    const url = String(item?.url || '').trim();
    if (!Number.isFinite(price) || price <= 0 || !allowed.has(url)) continue;
    if (String(item?.currency || '').toUpperCase() !== 'MAD') continue;
    if (offers.some((offer) => offer.url === url)) continue;
    let host;
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { continue; }
    offers.push({ price: Math.round(price * 100) / 100, url, site: host, title: String(item?.title || '').slice(0, 160), ingco: host === 'ingco.com' || host.endsWith('.ingco.com') || host === 'ingco.ma' || host.endsWith('.ingco.ma') });
  }
  const group = (items) => {
    const grouped = new Map();
    for (const offer of items) {
      const key = offer.price.toFixed(2);
      const entry = grouped.get(key) || { price: offer.price, count: 0, sources: [] };
      entry.count += 1;
      entry.sources.push({ site: offer.site, url: offer.url, title: offer.title });
      grouped.set(key, entry);
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count || a.price - b.price);
  };
  return { market: group(offers.filter((offer) => !offer.ingco)), ingco: group(offers.filter((offer) => offer.ingco)), offersCount: offers.length };
}
