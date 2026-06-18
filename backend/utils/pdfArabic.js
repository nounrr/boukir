// Arabic text shaping + bidi for server-side PDF generation (pdfmake).
//
// pdfmake/PDFKit lays glyphs out left-to-right and does no Arabic shaping, so
// Arabic strings render as disconnected, reversed letters. This mirrors the
// frontend helper (frontend/src/utils/pdfArabic.ts): shape the letters into their
// contextual forms, then apply a lightweight RTL reordering good enough for short
// labels such as product designations (not a full UAX #9 implementation).

import pkg from 'arabic-reshaper';

const ArabicReshaper = pkg.default || pkg;

// Arabic script, including the Arabic Presentation Forms produced by the reshaper.
const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
// Left-to-right content that must keep its natural order inside an RTL line
// (Latin letters, Western & Arabic-Indic digits).
const LTR_CHAR = /[A-Za-z0-9٠-٩۰-۹]/;

/** True if the string contains any Arabic-script character. */
export function hasArabic(text) {
  return ARABIC_CHAR.test(String(text || ''));
}

// Token kinds for the lightweight bidi pass.
const KIND_ARABIC = 'ar';
const KIND_LTR = 'ltr';
const KIND_SPACE = 'sp';

function classify(ch) {
  if (/\s/.test(ch)) return KIND_SPACE;
  if (ARABIC_CHAR.test(ch)) return KIND_ARABIC;
  if (LTR_CHAR.test(ch)) return KIND_LTR;
  return KIND_LTR; // punctuation/symbols ride with LTR runs
}

/**
 * Reorders a shaped string for an RTL line in a left-to-right PDF engine.
 *
 * Strategy (a pragmatic subset of UAX #9 with an RTL base direction):
 *   1. Split into runs of Arabic / LTR / whitespace.
 *   2. Reverse the run order (so the visually right-most run comes first when
 *      PDFKit paints left-to-right).
 *   3. Reverse the characters inside Arabic runs only; LTR runs (numbers, Latin)
 *      keep their natural order. Whitespace runs are emitted as-is.
 *
 * Good enough for short labels such as product designations; not a full bidi.
 */
function reorderRtl(shaped) {
  const chars = Array.from(shaped);
  const runs = [];
  let i = 0;
  while (i < chars.length) {
    const kind = classify(chars[i]);
    let j = i + 1;
    while (j < chars.length && classify(chars[j]) === kind) j++;
    runs.push({ kind, text: chars.slice(i, j) });
    i = j;
  }

  let out = '';
  for (let k = runs.length - 1; k >= 0; k--) {
    const run = runs[k];
    out += run.kind === KIND_ARABIC ? run.text.slice().reverse().join('') : run.text.join('');
  }
  return out;
}

/**
 * Prepares a value for placement in a pdfmake/PDFKit text node. Non-Arabic
 * strings are returned unchanged; Arabic strings are shaped and bidi-reordered.
 */
export function prepareArabicText(value) {
  const text = value == null ? '' : String(value);
  if (!text || !hasArabic(text)) return text;
  const shaped = ArabicReshaper.convertArabic(text);
  return reorderRtl(shaped);
}
