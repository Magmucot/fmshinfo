import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApiRoute, dispatchApi } from '../src/lib/server/dispatcher.ts';

test('in-process dispatcher handles /api/bells correctly', { timeout: 15000 }, async () => {
  const res = await handleApiRoute('/api/bells');
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.ok(Array.isArray(res.data.bells));
  assert.ok(res.data.bells.length > 0);
});

test('in-process dispatcher handles /api/info correctly', async () => {
  const data = await dispatchApi('/api/info');
  assert.ok(data);
  assert.equal(data.ok, true);
  assert.ok(data.school);
  assert.ok(Array.isArray(data.contacts));
});

test('in-process dispatcher handles /api/canteen/schedule without network', async () => {
  const data = await dispatchApi('/api/canteen/schedule?class=10-1');
  assert.ok(data);
  assert.equal(data.ok, true);
  assert.equal(data.selectedClass, '10-1');
  assert.ok(data.classSchedule);
});

test('in-process dispatcher rejects unauthorized admin requests', async () => {
  const res = await handleApiRoute('/api/admin/system');
  assert.equal(res.status, 403);
});
