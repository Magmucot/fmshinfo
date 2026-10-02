import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramPayload, webPayload, feedbackPayload, broadcastPayload } from '../src/lib/server/payloads.ts';

test('broadcastPayload validates targeting and message bounds', () => {
  const allValid = { target: 'all', text: '<b>Внимание!</b> Изменение расписания.' };
  assert.equal(broadcastPayload.safeParse(allValid).success, true);

  const classValid = { target: 'class', targetClass: '10-4', text: 'Урок физики в ауд. 201', pinMessage: true };
  assert.equal(broadcastPayload.safeParse(classValid).success, true);

  const userValid = { target: 'user', targetUserId: 1573047506, text: 'Личное уведомление' };
  const parsedUser = broadcastPayload.parse(userValid);
  assert.equal(parsedUser.targetUserId, '1573047506');

  // Class target requires valid targetClass
  assert.equal(broadcastPayload.safeParse({ target: 'class', text: 'Hello' }).success, false);
  assert.equal(broadcastPayload.safeParse({ target: 'class', targetClass: 'invalid-class', text: 'Hello' }).success, false);

  // User target requires valid targetUserId
  assert.equal(broadcastPayload.safeParse({ target: 'user', text: 'Hello' }).success, false);

  // Empty or overly long text rejected
  assert.equal(broadcastPayload.safeParse({ target: 'all', text: '   ' }).success, false);
  assert.equal(broadcastPayload.safeParse({ target: 'all', text: 'a'.repeat(4097) }).success, false);
});


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
