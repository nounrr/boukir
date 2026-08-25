import test from 'node:test';
import assert from 'node:assert/strict';

import {
  anonymizePublicReviewAuthor,
  getPublishedMaalemReviews,
  getPublishedMaalemReviewStatistics,
  sanitizeMaalemReviewComment,
  validateMaalemReviewInput,
} from './maalemReview.js';

test('anonymizePublicReviewAuthor ne publie que le prénom sûr ou une initiale', () => {
  assert.equal(anonymizePublicReviewAuthor('  Salma Zahra ', 'Salma El Idrissi'), 'Salma');
  assert.equal(anonymizePublicReviewAuthor('', 'karim benali'), 'K.');
  assert.equal(anonymizePublicReviewAuthor('<script>', ' Nadia Privée'), 'N.');
  assert.equal(anonymizePublicReviewAuthor('', ''), null);
});

test('getPublishedMaalemReviews pagine et ne retourne aucun identifiant ni champ privé', async () => {
  const queries = [];
  const db = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 7 }]];
    return [[{
      rating: 5,
      comment: 'Excellent travail.',
      submitted_at: '2026-08-20 09:00:00',
      author_first_name: 'Amina Zahra',
      author_full_name: 'Amina El Mansouri',
      telephone: 'INTERDIT',
      email: 'INTERDIT',
    }]];
  } };

  const result = await getPublishedMaalemReviews(db, 12, { page: 2, perPage: 3 });
  assert.deepEqual(queries[0].params, [12]);
  assert.deepEqual(queries[1].params, [12, 3, 3]);
  for (const { sql } of queries) {
    assert.match(sql, /mr\.status = 'published'/);
    assert.match(sql, /mr\.hidden_at IS NULL/);
    assert.match(sql, /mr\.deleted_at IS NULL/);
    assert.match(sql, /sr\.status = 'closed'/);
    assert.match(sql, /sr\.cancelled_at IS NULL/);
    assert.match(sql, /si\.status = 'closed'/);
    assert.match(sql, /si\.completed_by_contact_id = mp\.contact_id/);
    assert.match(sql, /sra\.id = si\.executing_assignment_id/);
  }
  assert.deepEqual(result.reviews, [{
    rating: 5,
    comment: 'Excellent travail.',
    submitted_at: '2026-08-20 09:00:00',
    author_name: 'Amina',
    verified_intervention: true,
  }]);
  assert.deepEqual(Object.keys(result.reviews[0]).sort(), ['author_name', 'comment', 'rating', 'submitted_at', 'verified_intervention']);
  assert.deepEqual(result.pagination, {
    current_page: 2, per_page: 3, total_items: 7, total_pages: 3,
    has_previous: true, has_next: true, from: 4, to: 4,
  });
  assert.equal(JSON.stringify(result).includes('INTERDIT'), false);
});

test('sanitizeMaalemReviewComment conserve du texte sûr et retire HTML et contrôles', () => {
  assert.equal(
    sanitizeMaalemReviewComment('  Très bon <script>alert(1)</script>\r\n\ttravail\u0000  '),
    'Très bon alert(1)\ntravail'
  );
  assert.equal(sanitizeMaalemReviewComment('  '), null);
});

test('validateMaalemReviewInput exige une note entière de 1 à 5 et encadre le commentaire facultatif', () => {
  assert.equal(validateMaalemReviewInput({ rating: 5 }).valid, true);
  assert.equal(validateMaalemReviewInput({ rating: 0 }).errors.rating.length > 0, true);
  assert.equal(validateMaalemReviewInput({ rating: 4.5 }).errors.rating.length > 0, true);
  assert.equal(validateMaalemReviewInput({ rating: 4, comment: 'trop cour' }).errors.comment.length > 0, true);
  assert.equal(validateMaalemReviewInput({ rating: 4, comment: 'x'.repeat(1501) }).errors.comment.length > 0, true);
});

test('getPublishedMaalemReviewStatistics ne compte que les avis publiés encore rattachés à une clôture valide', async () => {
  const db = {
    async query(sql, params) {
      assert.deepEqual(params, [12]);
      assert.match(sql, /mr\.status = 'published'/);
      assert.match(sql, /mr\.hidden_at IS NULL/);
      assert.match(sql, /mr\.deleted_at IS NULL/);
      assert.match(sql, /sr\.status = 'closed'/);
      assert.match(sql, /si\.status = 'closed'/);
      assert.match(sql, /si\.completed_by_contact_id = mp\.contact_id/);
      assert.match(sql, /sra\.maalem_profile_id = mr\.maalem_profile_id/);
      return [[{
        review_count: 4,
        average_rating: '4.25',
        rating_1: 0,
        rating_2: 0,
        rating_3: 1,
        rating_4: 1,
        rating_5: 2,
      }]];
    },
  };

  assert.deepEqual(await getPublishedMaalemReviewStatistics(db, 12), {
    average_rating: 4.25,
    review_count: 4,
    rating_distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 },
  });
});

test('getPublishedMaalemReviewStatistics renvoie une moyenne nulle sans avis publié', async () => {
  const db = { query: async () => [[{ review_count: 0, average_rating: null }]] };
  assert.deepEqual(await getPublishedMaalemReviewStatistics(db, 3), {
    average_rating: null,
    review_count: 0,
    rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
});
