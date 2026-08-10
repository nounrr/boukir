import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCorrectionFilters } from './productNameCorrections.js';

const compact = (sql) => sql.replace(/\s+/g, ' ').trim();

test('matched filter uses an allowlisted parameter', () => {
  const result = buildCorrectionFilters({ status: 'matched' });

  assert.equal(compact(result.whereSql), 'WHERE pnc.match_status = ?');
  assert.deepEqual(result.params, ['matched']);
});

test('unmatched filter includes every status other than matched', () => {
  const result = buildCorrectionFilters({ status: 'unmatched' });

  assert.equal(compact(result.whereSql), 'WHERE pnc.match_status <> ?');
  assert.deepEqual(result.params, ['matched']);
});

test('with-image filter follows the images rendered by ProductCorrectionImages', () => {
  const result = buildCorrectionFilters({ image: 'with' });
  const sql = compact(result.whereSql);

  assert.match(sql, /NULLIF\(TRIM\(pnc\.image\), ''\) IS NOT NULL/);
  assert.match(sql, /p_image\.id = pnc\.matched_product_id/);
  assert.match(sql, /NULLIF\(TRIM\(p_image\.image_url\), ''\) IS NOT NULL/);
  assert.match(sql, /pv_image\.id = pnc\.matched_variant_id/);
  assert.match(sql, /NULLIF\(TRIM\(pv_image\.image_url\), ''\) IS NOT NULL/);
  assert.match(sql, /pnc\.matched_variant_id IS NOT NULL/);
  assert.deepEqual(result.params, []);
});

test('without-image filter negates the same blank-safe visible-image expression', () => {
  const withImage = compact(buildCorrectionFilters({ image: 'with' }).whereSql)
    .replace(/^WHERE /, '');
  const withoutImage = compact(buildCorrectionFilters({ image: 'without' }).whereSql);

  assert.equal(withoutImage, `WHERE NOT ${withImage}`);
  assert.equal((withoutImage.match(/NULLIF\(TRIM/g) || []).length >= 8, true);
});

test('image filters ignore text placeholders such as "non" from imports', () => {
  const sql = compact(buildCorrectionFilters({ image: 'with' }).whereSql);

  assert.match(sql, /LOWER\(TRIM\(pnc\.image\)\) NOT IN/);
  assert.match(sql, /'non'/);
});

test('new filters compose with review and all text searches using AND semantics', () => {
  const result = buildCorrectionFilters({
    status: 'unmatched',
    image: 'without',
    review_status: 'false',
    q_ancienne: 'ancien',
    q_fr: 'français',
    q_ar: 'عربي',
  });
  const sql = compact(result.whereSql);

  assert.equal((sql.match(/ AND /g) || []).length >= 5, true);
  assert.match(sql, /pnc\.match_status <> \?/);
  assert.match(sql, /NOT \( \( NULLIF\(TRIM\(pnc\.image\)/);
  assert.match(sql, /pnc\.review_status = \?/);
  assert.match(sql, /p_anc\.designation LIKE \?/);
  assert.match(sql, /pnc\.designation_fr_pro LIKE \?/);
  assert.match(sql, /pnc\.designation_ar_pro LIKE \?/);
  assert.deepEqual(result.params, [
    'matched',
    'false',
    '%ancien%',
    '%français%',
    '%عربي%',
  ]);
});

test('unknown optional match and image values fall back to no filter', () => {
  assert.deepEqual(
    buildCorrectionFilters({ status: 'matched OR 1=1', image: 'sometimes' }),
    { whereSql: '', params: [] }
  );
});
