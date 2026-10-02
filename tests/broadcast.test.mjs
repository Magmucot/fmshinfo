import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  broadcastPayload,
} from '../src/lib/server/payloads.ts';
import {
  executeBroadcast,
  getTargetRecipients,
  getBroadcastHistory,
  saveBroadcastHistoryEntry,
  getBroadcastAudienceStats,
} from '../src/lib/server/broadcast.ts';
import { handleApiRoute } from '../src/lib/server/dispatcher.ts';

// Устанавливаем тестовый ключ администратора
process.env.ADMIN_KEY = 'test-broadcast-key-12345';

test('getTargetRecipients filters recipients by target type correctly', async () => {
  // 1. Target: user
  const userRecipients = await getTargetRecipients('user', null, '1573047506');
  assert.equal(userRecipients.length, 1);
  assert.equal(userRecipients[0].id, '1573047506');

  // 2. Target: class
  const classRecipients = await getTargetRecipients('class', '10-4', null);
  for (const r of classRecipients) {
    assert.equal(r.className, '10-4');
  }

  // 3. Target: all
  const allRecipients = await getTargetRecipients('all');
  assert.ok(Array.isArray(allRecipients));
  assert.ok(allRecipients.length >= 1);
});

test('executeBroadcast sends in batches and gracefully handles blocked users', async () => {
  const sentMessages = [];
  const pinnedMessages = [];

  const mockSender = async (chatId, text, parseMode, pin) => {
    // Симулируем, что пользователь 6057442319 заблокировал бота
    if (chatId === '6057442319') {
      return { ok: false, blocked: true, error: 'Forbidden: bot was blocked by the user' };
    }
    sentMessages.push({ chatId, text, parseMode });
    if (pin) {
      pinnedMessages.push(chatId);
    }
    return { ok: true, messageId: 1001 };
  };

  const payload = {
    target: 'all',
    text: '📢 <b>Тестовое оповещение</b> для всех учащихся!',
    parseMode: 'HTML',
    pinMessage: true,
  };

  const result = await executeBroadcast(payload, {
    senderFn: mockSender,
    delayMs: 1, // быстрый тест
  });

  assert.equal(result.ok, true);
  assert.ok(result.broadcastId);
  assert.ok(result.total >= 1);
  assert.equal(result.sent, sentMessages.length);
  assert.ok(result.timestamp);

  // Проверяем, что блокировка бота была учтена в статистике без сбоя
  if (result.total > 1) {
    assert.ok(result.blocked >= 1);
    assert.ok(result.failed >= 1);
  }
});

test('executeBroadcast handles single user targeting and pinning', async () => {
  const sent = [];
  const mockSender = async (chatId, text, parseMode, pin) => {
    sent.push({ chatId, text, pin });
    return { ok: true, messageId: 2002 };
  };

  const result = await executeBroadcast(
    {
      target: 'user',
      targetUserId: '1573047506',
      text: 'Личное сообщение ученику',
      pinMessage: true,
    },
    { senderFn: mockSender, delayMs: 1 }
  );

  assert.equal(result.ok, true);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.status, 'completed');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, '1573047506');
  assert.equal(sent[0].pin, true);
});

test('broadcast history records and retrieves entries', async () => {
  const uniqueId = `test-bcast-${Date.now()}`;
  saveBroadcastHistoryEntry({
    id: uniqueId,
    timestamp: new Date().toISOString(),
    timestampNsk: '2026-10-02 14:00:00 NSK',
    target: 'class',
    targetClass: '10-4',
    text: 'Тест истории рассылок',
    pinMessage: false,
    parseMode: 'HTML',
    sent: 10,
    failed: 0,
    blocked: 0,
    total: 10,
    status: 'completed',
  });

  const history = getBroadcastHistory(10);
  assert.ok(Array.isArray(history));
  const found = history.find((h) => h.id === uniqueId);
  assert.ok(found);
  assert.equal(found.targetClass, '10-4');
  assert.equal(found.sent, 10);
});

test('getBroadcastAudienceStats aggregates user audience properly', async () => {
  const stats = await getBroadcastAudienceStats();
  assert.ok(stats);
  assert.ok(typeof stats.totalUsers === 'number');
  assert.ok(stats.byClass);
  assert.ok(stats.byGrade);
});

test('dispatcher rejects unauthorized /api/admin/broadcast requests', async () => {
  const getRes = await handleApiRoute('/api/admin/broadcast');
  assert.equal(getRes.status, 403);

  const postRes = await handleApiRoute('/api/admin/broadcast', {
    method: 'POST',
    body: { target: 'all', text: 'Hello' },
  });
  assert.equal(postRes.status, 403);
});

test('dispatcher executes GET /api/admin/broadcast with admin key', async () => {
  const res = await handleApiRoute('/api/admin/broadcast', {
    headers: { 'X-Admin-Key': process.env.ADMIN_KEY },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.ok(res.data.audience);
  assert.ok(Array.isArray(res.data.history));
});

test('dispatcher validates and rejects invalid POST payloads', async () => {
  const res = await handleApiRoute('/api/admin/broadcast', {
    method: 'POST',
    headers: { 'X-Admin-Key': process.env.ADMIN_KEY },
    body: {
      target: 'class',
      // missing targetClass
      text: 'Внимание',
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.ok, false);
});
