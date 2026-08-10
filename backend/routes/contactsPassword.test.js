import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import contactsRouter from './contacts.js';

// Régression : un mot de passe saisi côté Back-office (page Contacts/Clients) doit
// pouvoir servir à se connecter côté e-commerce. La connexion (routes/users.js)
// compare avec bcrypt.compare(password, contact.password) — si le mot de passe est
// stocké en clair, la comparaison échoue toujours et la connexion est impossible.

function withContactsServer(database, callback) {
  const originalExecute = pool.execute;
  const originalQuery = pool.query;
  pool.execute = database.execute;
  pool.query = database.execute;
  const app = express();
  app.use(express.json());
  app.use('/api/contacts', contactsRouter);
  return callback(app).finally(() => {
    pool.execute = originalExecute;
    pool.query = originalQuery;
  });
}

test('POST /api/contacts hache le mot de passe et force auth_provider=local', async () => {
  let insertParams = null;
  const database = {
    async execute(sql, params = []) {
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[{ cnt: 0 }]];
      if (sql.includes('INSERT INTO contacts')) {
        insertParams = params;
        return [{ insertId: 501 }];
      }
      if (sql.startsWith('SELECT * FROM contacts WHERE id')) return [[{ id: 501 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await withContactsServer(database, async (app) => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'Client',
          nom_complet: 'Client Test',
          email: 'client@example.test',
          password: 'motdepasse123',
        }),
      });
      assert.equal(response.status, 201);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  assert.ok(insertParams, 'INSERT INTO contacts doit avoir été appelé');
  const storedPassword = insertParams[8];
  const storedAuthProvider = insertParams[21];

  assert.notEqual(storedPassword, 'motdepasse123', 'le mot de passe ne doit jamais être stocké en clair');
  assert.match(storedPassword, /^\$2[aby]\$/, 'le mot de passe doit être un hash bcrypt');
  assert.equal(await bcrypt.compare('motdepasse123', storedPassword), true, 'bcrypt.compare doit retrouver le mot de passe saisi (le même test que la connexion e-commerce)');
  assert.equal(storedAuthProvider, 'local', 'auth_provider doit passer à local pour permettre la connexion');
});

test('PUT /api/contacts/:id hache le nouveau mot de passe et force auth_provider=local', async () => {
  let updateSql = null;
  let updateParams = null;
  const database = {
    async execute(sql, params = []) {
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[{ cnt: 0 }]];
      if (sql.startsWith('SELECT id FROM contacts WHERE id')) return [[{ id: 501 }]];
      if (sql.startsWith('UPDATE contacts')) {
        updateSql = sql;
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM contacts')) return [[{ id: 501, solde_cumule: 0 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await withContactsServer(database, async (app) => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/contacts/501`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'nouveauMotDePasse456' }),
      });
      assert.equal(response.status, 200);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  assert.ok(updateSql, 'UPDATE contacts doit avoir été appelé');
  const passwordFieldIndex = updateSql
    .slice(updateSql.indexOf('SET') + 3, updateSql.indexOf('WHERE'))
    .split(',')
    .findIndex((field) => field.trim().startsWith('password'));
  const authProviderFieldIndex = updateSql
    .slice(updateSql.indexOf('SET') + 3, updateSql.indexOf('WHERE'))
    .split(',')
    .findIndex((field) => field.trim().startsWith('auth_provider'));

  const storedPassword = updateParams[passwordFieldIndex];
  const storedAuthProvider = updateParams[authProviderFieldIndex];

  assert.notEqual(storedPassword, 'nouveauMotDePasse456', 'le mot de passe ne doit jamais être stocké en clair');
  assert.match(storedPassword, /^\$2[aby]\$/, 'le mot de passe doit être un hash bcrypt');
  assert.equal(await bcrypt.compare('nouveauMotDePasse456', storedPassword), true);
  assert.equal(storedAuthProvider, 'local');
});

test('PUT /api/contacts/:id sans mot de passe ne touche ni au mot de passe ni à auth_provider', async () => {
  let updateSql = null;
  const database = {
    async execute(sql) {
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[{ cnt: 0 }]];
      if (sql.startsWith('SELECT id FROM contacts WHERE id')) return [[{ id: 501 }]];
      if (sql.startsWith('UPDATE contacts')) {
        updateSql = sql;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM contacts')) return [[{ id: 501, solde_cumule: 0 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await withContactsServer(database, async (app) => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/contacts/501`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: '0612345678' }),
      });
      assert.equal(response.status, 200);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  assert.ok(updateSql, 'UPDATE contacts doit avoir été appelé');
  assert.doesNotMatch(updateSql, /password/);
  assert.doesNotMatch(updateSql, /auth_provider/);
});
