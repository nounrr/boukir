import assert from 'node:assert/strict';
import test from 'node:test';

import {
  customerReviewEligibility,
  parseRating,
  publishPendingReviewsOnClosure,
  reviewCommentFrom,
  saveCustomerReview,
} from './clientReview.js';

const context = (over = {}) => ({
  service_request_id: 7, request_status: 'completed', request_source: 'quick_request', cancelled_at: null,
  requester_contact_id: 50, intervention_id: 70, intervention_status: 'completed',
  maalem_profile_id: 3, maalem_contact_id: 90, ...over,
});

/** A database double answering the few statements the review helpers run, and recording them. */
function reviewDb({ ctx = context(), existing = null, pendingOnClosure = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(rawSql, params) {
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      calls.push({ sql, params });
      if (sql.includes('FROM service_requests sr INNER JOIN service_interventions')) return [[ctx].filter(Boolean)];
      if (sql.includes('FROM maalem_reviews WHERE service_request_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE')) return [[existing].filter(Boolean)];
      if (sql.startsWith('SELECT mr.id, mr.maalem_profile_id')) return [pendingOnClosure];
      if (sql.startsWith('INSERT INTO maalem_reviews ')) return [{ insertId: 41 }];
      return [{ affectedRows: 1 }];
    },
  };
}

test('stars: whole numbers from 1 to 5, or none', () => {
  assert.deepEqual(parseRating(undefined), { valid: true, rating: null });
  assert.deepEqual(parseRating('4'), { valid: true, rating: 4 });
  for (const value of [0, 6, 2.5, 'x']) assert.equal(parseRating(value).valid, false, String(value));
});

test('the review keeps the comment only when it is long enough to be public', () => {
  assert.equal(reviewCommentFrom('Top'), null);
  assert.equal(reviewCommentFrom('  Travail propre et rapide  '), 'Travail propre et rapide');
  assert.equal(reviewCommentFrom('<b>Très bien</b> merci beaucoup'), 'Très bien merci beaucoup');
  assert.equal(reviewCommentFrom('x'.repeat(2000)).length, 1500);
});

test('quick requests can be rated; before the closure the stars wait, after it they are public', () => {
  assert.deepEqual(customerReviewEligibility(context(), 50), { eligible: true, reason: null, status: 'pending' });
  assert.equal(customerReviewEligibility(context({ request_status: 'closed', intervention_status: 'closed' }), 50).status, 'published');
  assert.equal(customerReviewEligibility(context({ request_source: 'selected_service' }), 50).eligible, true);
});

test('no stars before the Maalem finishes, on a cancelled request, for oneself or without a Maalem', () => {
  assert.equal(customerReviewEligibility(context({ request_status: 'work_in_progress' }), 50).reason, 'WORK_NOT_FINISHED');
  assert.equal(customerReviewEligibility(context({ cancelled_at: '2026-11-01' }), 50).reason, 'REQUEST_CANCELLED');
  assert.equal(customerReviewEligibility(context({ maalem_contact_id: 50 }), 50).reason, 'SELF_REVIEW_FORBIDDEN');
  assert.equal(customerReviewEligibility(null, 50).reason, 'NO_MAALEM');
  assert.equal(customerReviewEligibility(context({ request_source: 'other' }), 50).reason, 'UNSUPPORTED_REQUEST_TYPE');
});

test('stars given with the verdict are saved pending for the assigned Maalem, and stop the invitation', async () => {
  const db = reviewDb();
  const result = await saveCustomerReview(db, { requestId: 7, contactId: 50, actorName: 'Karim', rating: 4, comment: null });
  assert.deepEqual(result, { saved: true, reviewId: 41, status: 'pending' });
  const insert = db.calls.find((c) => c.sql.startsWith('INSERT INTO maalem_reviews'));
  assert.deepEqual(insert.params, [7, 70, 50, 3, 4, null, 'pending', insert.params[7]]);
  assert.ok(db.calls.some((c) => c.sql.startsWith('INSERT INTO maalem_review_history') && c.params.includes('pending')));
  assert.ok(db.calls.some((c) => c.sql.startsWith('UPDATE maalem_review_invitations')), 'invitation marked as answered');
  assert.ok(!db.calls.some((c) => c.sql.startsWith('UPDATE maalem_profiles')), 'not public yet');
});

test('a pending review can be changed by its author; a published one cannot', async () => {
  const pending = reviewDb({ existing: { id: 41, rating: 2, comment: null, status: 'pending', customer_contact_id: 50, moderated_at: null } });
  assert.deepEqual(await saveCustomerReview(pending, { requestId: 7, contactId: 50, rating: 5, comment: 'Finalement très bien' }), { saved: true, reviewId: 41, status: 'pending' });
  assert.ok(pending.calls.some((c) => c.sql.startsWith('UPDATE maalem_reviews SET rating')));

  const published = reviewDb({ existing: { id: 41, rating: 4, comment: null, status: 'published', customer_contact_id: 50, moderated_at: null } });
  const result = await saveCustomerReview(published, { requestId: 7, contactId: 50, rating: 1, comment: null });
  assert.equal(result.saved, false);
  assert.equal(result.reason, 'ALREADY_REVIEWED');
  assert.ok(!published.calls.some((c) => c.sql.startsWith('UPDATE maalem_reviews')));
});

test('after the closure the stars are public at once', async () => {
  const db = reviewDb({ ctx: context({ request_status: 'closed', intervention_status: 'closed' }) });
  assert.equal((await saveCustomerReview(db, { requestId: 7, contactId: 50, rating: 5, comment: null })).status, 'published');
  assert.ok(db.calls.some((c) => c.sql.startsWith('UPDATE maalem_profiles SET updated_at')));
});

test('the closure publishes the pending stars of the Maalem who did the work', async () => {
  const db = reviewDb({ pendingOnClosure: [{ id: 41, maalem_profile_id: 3 }] });
  assert.equal(await publishPendingReviewsOnClosure(db, { requestId: 7, assignmentId: 12 }), 1);
  const select = db.calls[0];
  assert.deepEqual(select.params, [12, 7]);
  assert.match(select.sql, /status = 'pending' AND mr\.moderated_at IS NULL/);
  assert.ok(db.calls.some((c) => c.sql === "UPDATE maalem_reviews SET status = 'published' WHERE id = ?" && c.params[0] === 41));
  assert.ok(db.calls.some((c) => c.sql.includes("'PUBLISHED_ON_CLOSURE'")));
  assert.equal(await publishPendingReviewsOnClosure(reviewDb(), { requestId: 7, assignmentId: 12 }), 0);
});
