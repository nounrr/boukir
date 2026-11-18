import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { audioFileName, createChatRouter, pickModel, replyLanguage, sanitizeImage } from './chat.js';

const PHOTO = `data:image/jpeg;base64,${Buffer.from('fake jpeg bytes').toString('base64')}`;

/** A fake OpenAI client that records every request. */
function fakeAi({ text = 'Voici.', json = null, transcript = 'je cherche une perceuse' } = {}) {
  const seen = [];
  return {
    seen,
    responses: {
      create: async (params) => {
        seen.push(params);
        const out = json ? JSON.stringify(json) : text;
        return { output: [{ type: 'message', content: [{ type: 'output_text', text: out }] }], output_text: out };
      },
    },
    audio: {
      transcriptions: {
        create: async (params) => {
          seen.push({ transcription: true, name: params.file.name, model: params.model });
          return { text: `  ${transcript}  ` };
        },
      },
    },
  };
}

async function serve(ai) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/chat', createChatRouter({ getAi: () => ai, search: async () => [], pickups: async () => [], limiter: (req, res, next) => next() }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/chat` }));
  });
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('answers in the language the customer just wrote in, whatever the app language', () => {
  assert.equal(replyLanguage('i want product of ingco', 'fr'), 'en');
  assert.equal(replyLanguage('je veux une perceuse pour le béton', 'en'), 'fr');
  assert.equal(replyLanguage('quiero un taladro para la pared', 'fr'), 'es');
  assert.equal(replyLanguage('bghit chi perceuse mzyana', 'fr'), 'darija');
  assert.equal(replyLanguage('بغيت شي بيرسوز', 'fr'), 'ar');
  assert.equal(replyLanguage('我要电钻', 'fr'), 'zh');
  // Too short to tell: the app language.
  assert.equal(replyLanguage('INGCO', 'en'), 'en');
  assert.equal(replyLanguage('perceuse', 'ar'), 'ar');
  assert.equal(replyLanguage('', 'xx'), 'fr');
});

test('the reply-language reminder comes last, in that language', async () => {
  const ai = fakeAi();
  const { server, url } = await serve(ai);
  try {
    const res = await post(url, { locale: 'fr', messages: [{ role: 'user', content: 'i want product of ingco' }] });
    assert.equal(res.status, 200);
    const input = ai.seen[0].input;
    assert.equal(input.at(-1).role, 'developer');
    assert.match(input.at(-1).content, /Reply only in English/);
  } finally {
    server.close();
  }
});

test('a photo goes with the question, to the strong model', async () => {
  const ai = fakeAi();
  const { server, url } = await serve(ai);
  try {
    const res = await post(url, { locale: 'en', image: PHOTO, messages: [{ role: 'user', content: 'What is this? Do you have it?' }] });
    assert.equal(res.status, 200);
    const user = ai.seen[0].input.find((m) => m.role === 'user');
    assert.deepEqual(user.content[1], { type: 'input_image', image_url: PHOTO, detail: 'low' });
    assert.equal(ai.seen[0].model, pickModel([], { image: PHOTO }).model);
    assert.equal((await post(url, { image: 'https://evil.example/x.png', messages: [{ role: 'user', content: 'x' }] })).status, 400);
  } finally {
    server.close();
  }
});

test('only small images in base64 are accepted', () => {
  assert.equal(sanitizeImage(PHOTO), PHOTO);
  assert.equal(sanitizeImage('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(sanitizeImage(`data:image/jpeg;base64,${'A'.repeat(1_000_000)}`), null);
  assert.equal(sanitizeImage(42), null);
});

test('a voice question comes back as text', async () => {
  const ai = fakeAi({ transcript: 'bghit disque diamant' });
  const { server, url } = await serve(ai);
  try {
    const form = new FormData();
    form.append('audio', new Blob([Buffer.from('fake m4a')], { type: 'audio/mp4' }), 'question.m4a');
    const res = await fetch(`${url}/transcribe`, { method: 'POST', body: form });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'bghit disque diamant' });
    assert.equal(ai.seen[0].name, 'vocal.mp4');
    assert.equal((await fetch(`${url}/transcribe`, { method: 'POST', body: new FormData() })).status, 400);
  } finally {
    server.close();
  }
});

test('the recording keeps an extension the transcription service knows', () => {
  assert.equal(audioFileName({ originalname: 'rec.m4a', mimetype: 'audio/x-m4a' }), 'vocal.m4a');
  assert.equal(audioFileName({ originalname: 'blob', mimetype: 'audio/webm;codecs=opus' }), 'vocal.webm');
  assert.equal(audioFileName({ originalname: 'x.aac', mimetype: '' }), 'vocal.m4a');
  // Not a recording: refused.
  assert.equal(audioFileName({ originalname: 'x.pdf', mimetype: 'application/pdf' }), null);
  assert.equal(audioFileName({}), null);
});

test('a product photo gives the words to search for', async () => {
  const ai = fakeAi({ json: { query: '  pince   coupante INGCO ', label: 'INGCO cutting pliers' } });
  const { server, url } = await serve(ai);
  try {
    const res = await post(`${url}/identify`, { locale: 'en', image: PHOTO });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { query: 'pince coupante INGCO', label: 'INGCO cutting pliers' });
    assert.equal(ai.seen[0].text.format.type, 'json_schema');
    assert.match(ai.seen[0].input[0].content, /anglais/);
    assert.equal((await post(`${url}/identify`, { image: 'nope' })).status, 400);
  } finally {
    server.close();
  }
});

test('a silent recording that echoes the vocabulary hint counts as nothing heard', async () => {
  const { isHintEcho } = await import('./chat.js');
  assert.equal(isHintEcho('Boutique de bricolage au Maroc : perceuse, visseuse, ciment colle, carrelage, robinet, siphon, silicone, peinture, enduit, disque diamant, Bosch, Sika, Ingco.'), true);
  assert.equal(isHintEcho('perceuse, visseuse, ciment colle, carrelage, robinet'), true);
  assert.equal(isHintEcho(''), true);
  // What customers really say.
  assert.equal(isHintEcho('je cherche une perceuse Bosch pour le béton'), false);
  assert.equal(isHintEcho('ciment colle'), false);
  assert.equal(isHintEcho('bghit disque diamant'), false);
  assert.equal(isHintEcho('I want a drill for concrete'), false);

  const ai = fakeAi({ transcript: 'Boutique de bricolage au Maroc (Boukir Diamond) : perceuse, visseuse, ciment colle.' });
  const { server, url } = await serve(ai);
  try {
    const form = new FormData();
    form.append('audio', new Blob([Buffer.from('silence')], { type: 'audio/webm' }), 'voice.webm');
    assert.deepEqual(await (await fetch(`${url}/transcribe`, { method: 'POST', body: form })).json(), { text: '' });
  } finally {
    server.close();
  }
});
