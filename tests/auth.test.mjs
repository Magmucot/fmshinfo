import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminRequest } from '../src/lib/server/auth.ts';

const original = process.env.ADMIN_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = original;
});
const request = (key, query = '') => new Request(`http://localhost/api/users/telegram${query}`, {
  headers: key === undefined ? {} : { 'X-Admin-Key': key },
});

test('missing configuration never authorizes a request', () => {
  delete process.env.ADMIN_KEY;
  for (const key of [undefined, '', 'sunc-admin']) assert.equal(isAdminRequest(request(key)), false);
  process.env.ADMIN_KEY = '';
  assert.equal(isAdminRequest(request('')), false);
});
test('only the configured header key authorizes a request', () => {
  process.env.ADMIN_KEY = 'test-secret';
  assert.equal(isAdminRequest(request('test-secret')), true);
  for (const key of [undefined, '', 'sunc-admin', 'wrong']) assert.equal(isAdminRequest(request(key)), false);
});
test('query parameters cannot grant admin access', () => {
  process.env.ADMIN_KEY = 'test-secret';
  assert.equal(isAdminRequest(request(undefined, '?adminKey=test-secret')), false);
  assert.equal(isAdminRequest(request('wrong', '?adminKey=test-secret')), false);
});
