export async function queueEnhancementImages(db, urls, availableUrls, state, userId) {
  let queued = 0;
  for (const url of new Set(urls)) {
    if (!availableUrls.has(url) || state.treatedByUrl.has(url) || state.pendingBySource.get(url)?.status === 'processing') continue;
    const [result] = await db.query(
      'INSERT IGNORE INTO product_image_enhancement_queue (source_url, created_by) VALUES (?, ?)',
      [url, userId || null]
    );
    queued += result.affectedRows;
  }
  return { queued, skipped: new Set(urls).size - queued };
}

export function enhancementImageTab(treated, queued) {
  return treated ? 'treated' : queued ? 'queued' : 'untreated';
}
