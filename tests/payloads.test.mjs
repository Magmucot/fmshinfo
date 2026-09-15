import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramPayload, webPayload, feedbackPayload } from '../src/lib/server/payloads.ts';

test('partial Telegram updates preserve omitted fields and explicit clears', () => {
  const partial = telegramPayload.parse({ id: 123, action: 'sync' });
  assert.equal(partial.id, '123');
  assert.equal(partial.isPremium, undefined);
  assert.equal(partial.className, undefined);
  const clear = telegramPayload.parse({ id: '123', username: null, className: null, subgroup: null, isPremium: false });
  assert.equal(clear.username, null);
  assert.equal(clear.className, null);
  assert.equal(clear.subgroup, null);
  assert.equal(clear.isPremium, false);
});
test('malformed profiles are rejected instead of coerced or passed to Prisma', () => {
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, {}, 'abc', '0001', '9007199254740992']) {
    assert.equal(telegramPayload.safeParse({ id }).success, false);
  }
  for (const patch of [{ subgroup: 3 }, { subgroup: '1' }, { firstName: 12 }, { isPremium: 'false' }, { className: 'anything' }]) {
    assert.equal(telegramPayload.safeParse({ id: 123, ...patch }).success, false);
  }
});
test('website visits accept existing client identifiers and validate optional fields', () => {
  assert.equal(webPayload.safeParse({ clientId: 'web_abc_123', subgroup: 2 }).success, true);
  for (const body of [null, [], { clientId: 12 }, { clientId: '' }, { clientId: 'x', path: {} }, { clientId: 'x', subgroup: 0 }]) {
    assert.equal(webPayload.safeParse(body).success, false);
  }
});
test('feedback requires bounded nonempty strings', () => {
  const valid = { name: ' Student ', contact: ' @student ', message: ' Question ' };
  assert.deepEqual(feedbackPayload.parse(valid), { name: 'Student', contact: '@student', message: 'Question' });
  for (const patch of [{ name: null }, { contact: [] }, { message: '   ' }, { message: 'x'.repeat(4001) }]) {
    assert.equal(feedbackPayload.safeParse({ ...valid, ...patch }).success, false);
  }
});
