import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { signToken, verifyToken } from '../middleware/auth.js';
import { employeePasswordVersion, enforceWeeklyPasswordChange } from '../middleware/passwordPolicy.js';
import authRouter from './auth.js';

test('the weekly password change requires a new CIN and password login before allowing a reset', async t => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'local-weekly-policy-test-secret-value';
  const employee = { id: 7, cin: 'TEST07', role: 'Employé', password: await bcrypt.hash('ancien-07', 4) };
  let weekStart = '2026-11-09';
  let requiresChange = true;
  let writes = 0;

  t.mock.method(pool, 'query', async (sql, params) => {
    const statement = sql.trim();
    if (statement.startsWith('SHOW COLUMNS')) return [[{ Field: 'present' }]];
    if (statement.startsWith('CREATE TABLE') || statement.startsWith('DELETE FROM employee_login_attempts') ||
      statement.startsWith('INSERT INTO employee_login_attempts') ||
      statement.startsWith('UPDATE employees SET last_login_at') ||
      statement.startsWith('UPDATE employees SET password_change_required_week_start')) return [[]];
    if (statement.includes('FROM employee_login_attempts')) return [[]];
    if (statement.startsWith('SELECT DATE_FORMAT')) {
      return [[{
        week_start: weekStart,
        needs_change: requiresChange ? 1 : 0,
        changed_at: Math.floor(Date.now() / 1000),
        password: employee.password,
      }]];
    }
    if (statement.startsWith('UPDATE employees SET password = ?')) {
      assert.equal(params[2], employee.password);
      employee.password = params[0];
      requiresChange = false;
      writes += 1;
      return [{ affectedRows: 1 }];
    }
    if (statement.includes('FROM employees WHERE')) return [[{ ...employee }]];
    assert.fail(statement);
  });
  t.mock.method(pool, 'execute', async sql => {
    assert.match(sql, /FROM access_schedules/);
    return [[]];
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.get('/api/private', verifyToken, enforceWeeklyPasswordChange, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  const request = (path, token, body) => fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const identity = { id: employee.id, cin: employee.cin, role: employee.role };
  const oldSession = signToken({ ...identity, employee_password_version: employeePasswordVersion(employee.password) });
  const newPassword = { new_password: 'nouveau-07', confirm_password: 'nouveau-07' };

  const oldMe = await request('auth/me', oldSession);
  assert.equal(oldMe.status, 403);
  assert.equal((await oldMe.json()).error_type, 'PASSWORD_REAUTH_REQUIRED');
  assert.equal((await request('auth/change-password', oldSession, { ...newPassword, old_password: 'ancien-07' })).status, 403);
  assert.equal(writes, 0);
  assert.equal((await request('auth/login', null, { cin: employee.cin, password: 'incorrect' })).status, 401);

  const loggedIn = await request('auth/login', null, { cin: employee.cin, password: 'ancien-07' });
  assert.equal(loggedIn.status, 200);
  const login = await loggedIn.json();
  assert.equal(login.password_change_required, true);
  const temporaryToken = jwt.decode(login.token);
  assert.equal(temporaryToken.exp - temporaryToken.iat, 15 * 60);
  assert.equal((await (await request('auth/me', login.token)).json()).password_change_required, true);
  assert.equal((await request('private', login.token)).status, 403);
  weekStart = '2026-11-16';
  assert.equal((await request('auth/change-password', login.token, newPassword)).status, 403);
  weekStart = '2026-11-09';
  assert.equal((await request('auth/change-password', login.token, { new_password: 'ancien-07' })).status, 400);

  const changed = await request('auth/change-password', login.token, newPassword);
  assert.equal(changed.status, 200);
  const { token } = await changed.json();
  assert.equal(writes, 1);
  assert.equal((await request('private', token)).status, 200);
  assert.equal((await request('private', oldSession)).status, 403);
  assert.equal((await request('private', login.token)).status, 403);
  assert.equal((await request('auth/change-password', token, newPassword)).status, 400, 'manual change still requires the old password');
});
