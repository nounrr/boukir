import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createChatRouter } from './chat.js';

const DRILL = { id: 7, name: 'Perceuse SDS', price: 499, promo_price: null, promo_percent: null, brand: 'Bosch', category: 'Outillage', in_stock: true, image_url: '/p/7.jpg' };

const call = (id, args) => ({ type: 'function_call', name: 'search_products', call_id: id, arguments: JSON.stringify(args) });

/**
 * A fake OpenAI client: `turns` lists, for each call, what the model answers. A turn is either
 * { calls: [...] } (tool calls) or { text: '...' } (final answer). Streaming answers come as events.
 */
function fakeAi(turns) {
  const seen = [];
  let i = 0;
  return {
    seen,
    responses: {
      create: async (params) => {
        seen.push({ model: params.model, stream: !!params.stream, system: params.input[0].content });
        const turn = turns[i++] ?? { text: '' };
        const output = turn.calls ?? [{ type: 'message', content: [{ type: 'output_text', text: turn.text }] }];
        if (!params.stream) return { output, output_text: turn.text ?? '' };
        return (async function* events() {
          for (const piece of (turn.text ?? '').match(/.{1,6}/gs) ?? []) yield { type: 'response.output_text.delta', delta: piece };
          yield { type: 'response.completed', response: { output } };
        })();
      },
    },
  };
}

async function serve(ai, search) {
  const app = express();
  app.use(express.json());
  app.use('/chat', createChatRouter({ getAi: () => ai, search, pickups: async () => [], limiter: (req, res, next) => next() }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/chat` }));
  });
}

const ask = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const lines = (text) => text.trim().split('\n').map((l) => JSON.parse(l));

test('the website still gets one JSON answer with the product cards', async () => {
  const ai = fakeAi([{ calls: [call('c1', { query: 'perceuse', max_price: null })] }, { text: 'Voici une perceuse SDS.' }]);
  const { server, url } = await serve(ai, async () => [DRILL]);
  try {
    const res = await ask(url, { locale: 'fr', messages: [{ role: 'user', content: 'perceuse béton' }] });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reply, 'Voici une perceuse SDS.');
    assert.equal(body.products[0].id, 7);
    assert.ok(ai.seen.every((s) => !s.stream));
  } finally {
    server.close();
  }
});

test('the app streams: product cards first, then the text as it is written, then done', async () => {
  const ai = fakeAi([{ calls: [call('c1', { query: 'perceuse', max_price: null })] }, { text: 'Voici une perceuse SDS pour le béton.' }]);
  const { server, url } = await serve(ai, async () => [DRILL]);
  try {
    const res = await ask(url, { locale: 'fr', stream: true, messages: [{ role: 'user', content: 'perceuse béton' }] });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/x-ndjson/);
    assert.equal(res.headers.get('x-accel-buffering'), 'no');
    const events = lines(await res.text());
    assert.equal(events[0].type, 'products');
    assert.equal(events[0].products[0].id, 7);
    const deltas = events.filter((e) => e.type === 'delta');
    assert.ok(deltas.length > 1, 'the reply arrives in pieces');
    assert.equal(deltas.map((d) => d.text).join(''), 'Voici une perceuse SDS pour le béton.');
    const done = events.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.reply, 'Voici une perceuse SDS pour le béton.');
    assert.equal(done.products[0].id, 7);
  } finally {
    server.close();
  }
});

test('streaming: a fruitless search on the fast model switches to the strong one before writing anything', async () => {
  const ai = fakeAi([
    { calls: [call('c1', { query: 'zzz', max_price: null })] }, // fast model: nothing found
    { calls: [call('c2', { query: 'perceuse', max_price: null })] }, // strong model
    { text: 'Essayez cette perceuse.' },
  ]);
  let n = 0;
  const { server, url } = await serve(ai, async () => (n++ === 0 ? [] : [DRILL]));
  try {
    const events = lines(await (await ask(url, { locale: 'fr', stream: true, messages: [{ role: 'user', content: 'Bonjour' }] })).text());
    assert.notEqual(ai.seen[0].model, ai.seen[1].model, 'the second try uses the strong model');
    assert.equal(events.filter((e) => e.type === 'delta').map((d) => d.text).join(''), 'Essayez cette perceuse.');
    assert.equal(events.at(-1).type, 'done');
  } finally {
    server.close();
  }
});

test('streaming: a model failure ends with an error line, Spanish is understood', async () => {
  const ai = { responses: { create: async (params) => { ai.system = params.input[0].content; throw new Error('boom'); } } };
  const { server, url } = await serve(ai, async () => []);
  try {
    const res = await ask(url, { locale: 'es', stream: true, messages: [{ role: 'user', content: 'Hola' }] });
    const events = lines(await res.text());
    assert.deepEqual(events.at(-1), { type: 'error', message: "L'assistant ne peut pas répondre pour le moment." });
    assert.match(ai.system, /espagnol/);
  } finally {
    server.close();
  }
});

test('an empty or invalid conversation is refused before any model call', async () => {
  const ai = fakeAi([]);
  const { server, url } = await serve(ai, async () => []);
  try {
    assert.equal((await ask(url, { stream: true, messages: [] })).status, 400);
    assert.equal((await ask(url, { messages: [{ role: 'assistant', content: 'x' }] })).status, 400);
    assert.equal(ai.seen.length, 0);
  } finally {
    server.close();
  }
});
