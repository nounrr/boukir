import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pool from '../db/pool.js';

test('profile photos survive fresh sessions; JSON and mobile multipart persist to the shared contact', async t => {
  process.env.JWT_SECRET = 'avatar-tests-only-secret-with-at-least-32-characters';
  let user = { id: 7, prenom: 'Client', nom: 'Test', is_active: 1, auth_provider: 'local', avatar_url: null, solde: 0, plafond: 6000, telephone: '0612345678' };
  let savedUser;
  let failWrite = false;
  let lastAttempt;
  const files = new Set();
  const query = async (sql, params = []) => {
    if (sql.includes('UPDATE contacts')) {
      lastAttempt = params[0];
      if (failWrite) throw new Error('Simulated database write failure');
      const fields = sql.match(/SET ([\s\S]*?), updated_at = NOW/)[1].split(',').map(f => f.trim().split(' ')[0]);
      fields.forEach((name, index) => { user[name] = params[index]; });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM maalem_profiles')) return [[]];
    if (sql.includes('COALESCE(SUM(t.debit)')) return [[{ debit: 1500, credit: 0 }]];
    if (sql.includes('FROM contacts')) return [[{ ...user }]];
    throw new Error('Unexpected query: ' + sql);
  };
  const connection = {
    async beginTransaction() { savedUser = { ...user }; },
    async commit() {}, async rollback() { if (savedUser) user = { ...savedUser }; }, release() {},
    async execute(sql) { assert.doesNotMatch(sql, /ALTER|CREATE/); return [[{ exists: 1, ok: 1 }]]; },
    query,
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', query);
  const { default: router } = await import('./users.js');
  const app = express(); app.use(express.json());
  app.use('/api/users/auth', router);
  app.use('/uploads', express.static(fileURLToPath(new URL('../uploads/', import.meta.url))));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); for (const file of files) await fs.unlink(file).catch(() => {}); await pool.end(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = () => ({ Authorization: 'Bearer ' + jwt.sign({id:7},process.env.JWT_SECRET,{expiresIn:'5m',jwtid:Math.random().toString()}) });
  const put = data => fetch(base+'/api/users/auth/me',{method:'PUT',headers:{...auth(),'Content-Type':'application/json'},body:JSON.stringify(data)});

  let response = await put({avatar_url:'https://images.example.test/custom.png'});
  assert.equal(response.status,200); assert.equal((await response.json()).user.avatar_url,user.avatar_url);
  response = await fetch(base+'/api/users/auth/me',{headers:auth()});
  let profile = (await response.json()).user;
  assert.equal(profile.avatar_url,'https://images.example.test/custom.png');
  assert.equal(profile.solde_available,4500,'avatar changes retain the corrected checkout credit');

  response = await put({avatar_url:'file:///phone/cache/image.png'});
  assert.equal(response.status,400); assert.equal(user.avatar_url,'https://images.example.test/custom.png');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFUcAAAAASUVORK5CYII=', 'base64');
  const upload = () => {const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'phone.png');return form;};
  response = await fetch(base+'/api/users/auth/me',{method:'PUT',headers:auth(),body:upload()});
  assert.equal(response.status,200);
  const avatar = (await response.json()).user.avatar_url;
  assert.match(avatar,/^\/uploads\/avatars\/7-[a-f0-9-]+\.png$/);
  files.add(fileURLToPath(new URL('..'+avatar,import.meta.url)));
  response = await fetch(base+'/api/users/auth/me',{headers:auth()});
  assert.equal((await response.json()).user.avatar_url,avatar);
  response = await fetch(base+avatar); assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);

  response = await fetch(base+'/api/users/auth/me',{method:'PUT',body:upload()});assert.equal(response.status,401);
  const invalid = new FormData();invalid.append('avatar',new Blob(['<script>bad</script>'],{type:'image/png'}),'fake.png');
  response = await fetch(base+'/api/users/auth/me',{method:'PUT',headers:auth(),body:invalid});assert.equal(response.status,400);assert.equal(user.avatar_url,avatar);

  failWrite = true;
  response = await fetch(base+'/api/users/auth/me',{method:'PUT',headers:auth(),body:upload()});assert.equal(response.status,500);
  assert.equal(user.avatar_url,avatar);
  const failedFile=fileURLToPath(new URL('..'+lastAttempt,import.meta.url));
  await assert.rejects(fs.access(failedFile),{code:'ENOENT'});
});
