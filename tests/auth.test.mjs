import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdminRequest,
  constantTimeCompare,
  getClientIp,
  recordFailedAdminAttempt,
  isIpRateLimited,
  resetFailedAdminAttempts,
} from '../src/lib/server/auth.ts';

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

test('bearer authorization header authorizes when matching', () => {
  process.env.ADMIN_KEY = 'test-secret';
  const bearerReq = new Request('http://localhost/api/users/telegram', {
    headers: { Authorization: 'Bearer test-secret' },
  });
  assert.equal(isAdminRequest(bearerReq), true);

  const wrongBearer = new Request('http://localhost/api/users/telegram', {
    headers: { Authorization: 'Bearer wrong-secret' },
  });
  assert.equal(isAdminRequest(wrongBearer), false);
});

test('query parameters cannot grant admin access', () => {
  process.env.ADMIN_KEY = 'test-secret';
  assert.equal(isAdminRequest(request(undefined, '?adminKey=test-secret')), false);
  assert.equal(isAdminRequest(request('wrong', '?adminKey=test-secret')), false);
});

test('constantTimeCompare securely validates strings', () => {
  assert.equal(constantTimeCompare('secret123', 'secret123'), true);
  assert.equal(constantTimeCompare('secret123', 'secret124'), false);
  assert.equal(constantTimeCompare('short', 'much-longer-string'), false);
  assert.equal(constantTimeCompare('', ''), true);
});

test('getClientIp parses proxy and direct headers', () => {
  const reqWithXff = new Request('http://localhost/api/test', {
    headers: { 'X-Forwarded-For': '198.51.100.1, 10.0.0.1' },
  });
  assert.equal(getClientIp(reqWithXff), '198.51.100.1');

  const reqWithRealIp = new Request('http://localhost/api/test', {
    headers: { 'X-Real-IP': '203.0.113.195' },
  });
  assert.equal(getClientIp(reqWithRealIp), '203.0.113.195');
});

test('rate-limiting blocks brute force after repeated failures', () => {
  const testIp = '192.0.2.99';
  resetFailedAdminAttempts(testIp);
  assert.equal(isIpRateLimited(testIp), false);

  for (let i = 0; i < 7; i++) {
    recordFailedAdminAttempt(testIp);
  }
  assert.equal(isIpRateLimited(testIp), false);

  recordFailedAdminAttempt(testIp); // 8th attempt
  assert.equal(isIpRateLimited(testIp), true);

  resetFailedAdminAttempts(testIp);
  assert.equal(isIpRateLimited(testIp), false);
});

test('admin system path checks key correctly via isAdminRequest', () => {
  process.env.ADMIN_KEY = 'test-secret';
  const req = new Request('http://localhost/api/admin/system', {
    headers: { 'X-Admin-Key': 'test-secret' },
  });
  assert.equal(isAdminRequest(req), true);

  const badReq = new Request('http://localhost/api/admin/system', {
    headers: { 'X-Admin-Key': 'wrong-secret' },
  });
  assert.equal(isAdminRequest(badReq), false);
});

