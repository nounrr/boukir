import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_IMAGE_TARGETS,
  isMissingImageFilterEnabled,
  parseProductImageTarget,
} from './productImageTarget.js';

test('parseProductImageTarget accepts only the two supported destinations', () => {
  assert.equal(parseProductImageTarget('main_and_gallery'), PRODUCT_IMAGE_TARGETS.MAIN_AND_GALLERY);
  assert.equal(parseProductImageTarget('gallery'), PRODUCT_IMAGE_TARGETS.GALLERY);
  assert.equal(parseProductImageTarget('main'), null);
  assert.equal(parseProductImageTarget(' gallery '), null);
  assert.equal(parseProductImageTarget(undefined), null);
});

test('isMissingImageFilterEnabled recognizes explicit true query values', () => {
  assert.equal(isMissingImageFilterEnabled(true), true);
  assert.equal(isMissingImageFilterEnabled(1), true);
  assert.equal(isMissingImageFilterEnabled('true'), true);
  assert.equal(isMissingImageFilterEnabled('1'), true);
  assert.equal(isMissingImageFilterEnabled('false'), false);
  assert.equal(isMissingImageFilterEnabled(undefined), false);
});
