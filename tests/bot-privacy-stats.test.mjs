import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  eventsText,
  replyStats,
  isAdmin,
  verifiedAdminIds,
} from '../mini-services/tg-bot/index.ts';

test('eventsText hides Google Sheets link from public view and shows only for admins', async () => {
  // Public request: showSource is omitted or false
  const publicText = await eventsText(undefined, false);
  assert.ok(publicText, 'eventsText should return text');
  assert.equal(
    publicText.includes('docs.google.com'),
    false,
    'Public eventsText must NOT contain docs.google.com link'
  );
  assert.equal(
    publicText.includes('Google-таблица'),
    false,
    'Public eventsText must NOT contain "Google-таблица"'
  );
  assert.equal(
    publicText.includes('Источник:'),
    false,
    'Public eventsText must NOT contain source link'
  );

  // Admin request: showSource is true
  const adminText = await eventsText(undefined, true);
  assert.ok(adminText, 'eventsText should return text for admin');
  assert.ok(
    adminText.includes('Google-таблица школы'),
    'Admin eventsText must contain link to Google-таблица школы'
  );
  assert.ok(
    adminText.includes('docs.google.com'),
    'Admin eventsText must contain docs.google.com link'
  );
});

test('replyStats blocks regular users and only allows authorized admins', async () => {
  const regularUserId = 987654321;
  assert.equal(isAdmin(regularUserId), false, 'regularUserId must not be an admin');

  let regularReply = '';
  const regularCtx = {
    from: { id: regularUserId, username: 'regular_student' },
    reply: async (msg) => {
      regularReply = msg;
    },
  };

  await replyStats(regularCtx);
  assert.ok(
    regularReply.includes('Доступ ограничен'),
    'Regular user must receive access denied message'
  );
  assert.ok(
    regularReply.includes('только для верифицированных администраторов'),
    'Message should explain that command is admin-only'
  );
  assert.equal(
    regularReply.includes('Всего пользователей'),
    false,
    'Regular user must not see statistics details'
  );

  // Authorized admin user
  const adminId = 777123456;
  verifiedAdminIds.add(adminId);
  assert.ok(isAdmin(adminId), 'adminId must be verified');

  let adminReply = '';
  const adminCtx = {
    from: { id: adminId, username: 'authorized_admin' },
    reply: async (msg) => {
      adminReply = msg;
    },
  };

  await replyStats(adminCtx);
  assert.ok(
    adminReply.includes('Статистика «СУНЦ Инфо»'),
    'Admin should receive bot statistics'
  );
  assert.ok(
    adminReply.includes('Всего пользователей'),
    'Admin should receive user counts'
  );
});

test('bot commands registration and public help do not expose /stats to public', () => {
  const indexPath = join(process.cwd(), 'mini-services/tg-bot/index.ts');
  const indexContent = readFileSync(indexPath, 'utf-8');

  // Ensure setMyCommands does NOT contain stats command
  const setMyCommandsMatch = indexContent.match(/bot\.api\.setMyCommands\(\[([\s\S]*?)\]\)/);
  assert.ok(setMyCommandsMatch, 'setMyCommands should be present in index.ts');
  const commandsList = setMyCommandsMatch[1];
  assert.equal(
    commandsList.includes('command: "stats"'),
    false,
    'Public setMyCommands list must NOT include "stats"'
  );

  // Ensure /start welcome block does NOT list /stats
  const startMatch = indexContent.match(/const welcome = \[([\s\S]*?)\]\.join/);
  assert.ok(startMatch, 'welcome text in /start should be found');
  assert.equal(
    startMatch[1].includes('/stats'),
    false,
    'Public /start welcome list must NOT include /stats'
  );

  // Ensure /help public block does NOT list /stats, but admin block DOES list /stats
  const helpMatch = indexContent.match(/bot\.command\("help"[\s\S]*?const lines = \[([\s\S]*?)\];[\s\S]*?if \(userIsAdmin\) \{([\s\S]*?)\}/);
  assert.ok(helpMatch, 'help command structure should be found');
  const publicHelp = helpMatch[1];
  const adminHelp = helpMatch[2];
  assert.equal(
    publicHelp.includes('/stats'),
    false,
    'Public /help commands list must NOT include /stats'
  );
  assert.ok(
    adminHelp.includes('/stats'),
    'Admin /help block must include /stats'
  );
});

test('eventsText with specific class filter also hides Google Sheets link from public view', async () => {
  const publicClassText = await eventsText('10-1', false);
  assert.ok(publicClassText);
  assert.equal(publicClassText.includes('docs.google.com'), false);
  assert.equal(publicClassText.includes('Google-таблица'), false);

  const adminClassText = await eventsText('10-1', true);
  assert.ok(adminClassText);
  assert.ok(adminClassText.includes('docs.google.com'));
  assert.ok(adminClassText.includes('Google-таблица'));
});

