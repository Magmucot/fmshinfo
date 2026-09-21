// Comprehensive Integration & Security Verification for Admin Panel & APIs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const temp = await mkdtemp(join(tmpdir(), 'sunc-verify-'));
const port = process.env.TEST_PORT || '3299';
const ADMIN_KEY = 'test-super-secret-admin-key-2026';
const env = {
  ...process.env,
  DATABASE_URL: `file:${join(temp, 'test.db')}`,
  ADMIN_KEY,
  PORT: port,
  HOSTNAME: '127.0.0.1',
};

let server;
let output = '';

try {
  console.log('🚀 Инициализация временной базы данных и запуск standalone сервера...');
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'],
    { env, stdio: 'pipe' }
  );

  server = spawn(process.execPath, [resolve('.next/standalone/server.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited unexpectedly: ${output}`);
    if (output.includes('Ready in')) {
      ready = true;
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, 'Standalone server failed to start within timeout');
  console.log(`✅ Сервер успешно запущен на порту ${port}`);

  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper function for making requests
  async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    let body = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  }

  // ==========================================
  // 1. Тестирование /api/admin/system (ОЗУ, CPU, Аптайм)
  // ==========================================
  console.log('\n1️⃣  Проверка мониторинга сервера (/api/admin/system)...');
  {
    // Без ключа -> 403
    const unauth = await api('/api/admin/system');
    assert.equal(unauth.status, 403, 'Должен возвращать 403 без ключа');

    // С неверным ключом -> 403
    const wrong = await api('/api/admin/system', { headers: { 'X-Admin-Key': 'fake-key' } });
    assert.equal(wrong.status, 403, 'Должен возвращать 403 с неверным ключом');

    // Через query parameter -> 403 (параметры URL запрещены)
    const viaQuery = await api(`/api/admin/system?adminKey=${ADMIN_KEY}`);
    assert.equal(viaQuery.status, 403, 'Ключ в query parameter должен отклоняться');

    // С верным ключом в заголовке -> 200 OK
    const auth = await api('/api/admin/system', { headers: { 'X-Admin-Key': ADMIN_KEY } });
    assert.equal(auth.status, 200, 'Должен возвращать 200 с верным X-Admin-Key');
    assert.equal(auth.body.ok, true);
    assert.equal(typeof auth.body.memory.percent, 'number');
    assert.equal(typeof auth.body.memory.formatted.used, 'string');
    assert.equal(typeof auth.body.memory.formatted.total, 'string');
    assert.equal(typeof auth.body.cpu.percent, 'number');
    assert.equal(typeof auth.body.cpu.cores, 'number');
    assert.ok(Array.isArray(auth.body.cpu.loadavg));
    assert.equal(typeof auth.body.uptime.formattedSystem, 'string');
    assert.equal(typeof auth.body.uptime.formattedProcess, 'string');

    // Bearer token тоже поддерживается
    const bearer = await api('/api/admin/system', { headers: { Authorization: `Bearer ${ADMIN_KEY}` } });
    assert.equal(bearer.status, 200, 'Должен возвращать 200 с верным Bearer token');

    console.log(`   ✅ ОЗУ: ${auth.body.memory.formatted.used} / ${auth.body.memory.formatted.total} (${auth.body.memory.percent}%)`);
    console.log(`   ✅ ЦПУ: ${auth.body.cpu.model.slice(0, 35)} (${auth.body.cpu.cores} ядер) — ${auth.body.cpu.percent}%`);
    console.log(`   ✅ Load Average: ${auth.body.cpu.loadavg.join(', ')}`);
    console.log(`   ✅ Аптайм системы: ${auth.body.uptime.formattedSystem} (процесс: ${auth.body.uptime.formattedProcess})`);
  }

  // ==========================================
  // 2. Тестирование /api/admin/logs (Журнал с точным временем NSK)
  // ==========================================
  console.log('\n2️⃣  Проверка журнала логов (/api/admin/logs)...');
  {
    // Без ключа -> 403
    const unauth = await api('/api/admin/logs');
    assert.equal(unauth.status, 403, 'Логи без ключа должны возвращать 403');

    // С верным ключом -> 200
    const logs = await api('/api/admin/logs?limit=10', { headers: { 'X-Admin-Key': ADMIN_KEY } });
    assert.equal(logs.status, 200);
    assert.equal(logs.body.ok, true);
    assert.ok(Array.isArray(logs.body.lines));
    assert.ok(Array.isArray(logs.body.parsed));

    if (logs.body.parsed.length > 0) {
      const sample = logs.body.parsed[0];
      assert.ok('timestamp' in sample);
      assert.ok('level' in sample);
      assert.ok('category' in sample);
      assert.ok('message' in sample);
      console.log(`   ✅ Формат записи лога: [${sample.timestamp}] [${sample.level}] [${sample.category}] ${sample.message.slice(0, 40)}`);
    } else {
      console.log('   ✅ Эндпоинт логов возвращает корректную структуру (пустой лог)');
    }
  }

  // ==========================================
  // 3. Тестирование /api/users/stats (Защита приватности)
  // ==========================================
  console.log('\n3️⃣  Проверка изоляции данных в /api/users/stats...');
  {
    // Публичный запрос
    const pub = await api('/api/users/stats');
    assert.equal(pub.status, 200);
    assert.equal(pub.body.isAdmin, false);
    assert.equal(pub.body.bot.recentUsers.length, 0, 'Для не-админа recentUsers должен быть пустым массивом');
    assert.equal(typeof pub.body.requestedAt, 'string', 'Должно присутствовать время запроса requestedAt');
    assert.equal(typeof pub.body.timestamp, 'string', 'Должен присутствовать timestamp');
    assert.ok(pub.body.requestedAt.includes('NSK'), 'Время запроса должно быть в новосибирском часовом поясе NSK');
    console.log(`   ✅ Время запроса в stats: ${pub.body.requestedAt}`);
    console.log('   ✅ Публичный доступ: приватные данные пользователей скрыты');

    // Админский запрос
    const adm = await api('/api/users/stats', { headers: { 'X-Admin-Key': ADMIN_KEY } });
    assert.equal(adm.status, 200);
    assert.equal(adm.body.isAdmin, true);
    console.log('   ✅ Административный доступ: флаг isAdmin = true, доступен реестр пользователей');
  }

  // ==========================================
  // 4. Тестирование /api/users/telegram (Реестр и профили)
  // ==========================================
  console.log('\n4️⃣  Проверка работы профилей пользователей (/api/users/telegram)...');
  {
    // Публичный GET -> без списка пользователей
    const pubGet = await api('/api/users/telegram');
    assert.equal(pubGet.status, 200);
    assert.equal(pubGet.body.isAdmin, false);
    assert.equal(pubGet.body.users, undefined, 'Публичный GET не должен возвращать поле users');

    // Публичный POST -> 401
    const pubPost = await api('/api/users/telegram', {
      method: 'POST',
      body: JSON.stringify({ id: 987654321, firstName: 'Hacker' }),
    });
    assert.equal(pubPost.status, 401, 'POST профиля без ключа должен отклоняться 401');

    // Админский POST: регистрация пользователя со всеми полями
    const regRes = await api('/api/users/telegram', {
      method: 'POST',
      headers: { 'X-Admin-Key': ADMIN_KEY },
      body: JSON.stringify({
        id: 123456789,
        firstName: 'Иван',
        lastName: 'Иванов',
        username: 'ivan_nsk',
        className: '11-1',
        subgroup: 1,
        englishGroup: 'B2',
        isPremium: true,
        action: '/schedule',
      }),
    });
    assert.equal(regRes.status, 200);
    assert.equal(regRes.body.isNew, true);
    assert.equal(regRes.body.user.firstName, 'Иван');
    assert.equal(regRes.body.user.username, 'ivan_nsk');
    assert.equal(regRes.body.user.className, '11-1');
    assert.equal(regRes.body.user.isPremium, true);
    assert.equal(regRes.body.user.actionsCount, 1);
    console.log('   ✅ Пользователь успешно зарегистрирован через защищённый POST');

    // Админский GET -> проверяем детали пользователя в списке
    const admGet = await api('/api/users/telegram', { headers: { 'X-Admin-Key': ADMIN_KEY } });
    assert.equal(admGet.status, 200);
    assert.equal(admGet.body.isAdmin, true);
    assert.ok(Array.isArray(admGet.body.users));
    const createdUser = admGet.body.users.find(u => u.id === '123456789');
    assert.ok(createdUser, 'Созданный пользователь должен присутствовать в выдаче для админа');
    assert.equal(createdUser.username, 'ivan_nsk');
    assert.equal(createdUser.subgroup, 1);
    assert.equal(createdUser.englishGroup, 'B2');
    assert.equal(createdUser.isPremium, true);
    assert.ok(createdUser.firstSeenAt, 'Должна присутствовать дата первой активности');
    assert.ok(createdUser.lastActiveAt, 'Должна присутствовать дата последней активности');
    console.log(`   ✅ Детальная инфа пользователя подтверждена: ID ${createdUser.id}, @${createdUser.username}, класс ${createdUser.className}, группа ${createdUser.subgroup}`);
  }

  // ==========================================
  // 5. Тестирование защиты эндпоинтов дежурств и воспитателей
  // ==========================================
  console.log('\n5️⃣  Проверка защиты /api/duty и /api/counselors...');
  {
    const dutyPost = await api('/api/duty', {
      method: 'POST',
      body: JSON.stringify({ dutyType: 'kitchen' }),
    });
    assert.equal(dutyPost.status, 401, 'POST /api/duty без ключа должен возвращать 401');

    const dutyDel = await api('/api/duty', { method: 'DELETE' });
    assert.equal(dutyDel.status, 401, 'DELETE /api/duty без ключа должен возвращать 401');

    const counsPost = await api('/api/counselors', {
      method: 'POST',
      body: JSON.stringify({ counselorName: 'Иванов' }),
    });
    assert.equal(counsPost.status, 401, 'POST /api/counselors без ключа должен возвращать 401');
    console.log('   ✅ /api/duty и /api/counselors надёжно защищены от несанкционированного изменения');
  }

  // ==========================================
  // 6. Тестирование защиты от брутфорса (Rate Limiting)
  // ==========================================
  console.log('\n6️⃣  Проверка защиты от перебора паролей (Brute-Force Rate Limiting)...');
  {
    const attackerIp = '203.0.113.199';
    let blockedWith429 = false;

    for (let attempt = 1; attempt <= 8; attempt++) {
      const res = await api('/api/admin/system', {
        headers: {
          'X-Admin-Key': `wrong-password-attempt-${attempt}`,
          'X-Forwarded-For': attackerIp,
        },
      });

      if (res.status === 429) {
        blockedWith429 = true;
        console.log(`   ✅ На попытке #${attempt} сработала блокировка: HTTP 429 Too Many Requests`);
        break;
      }
    }

    assert.ok(blockedWith429, 'После серии неудачных попыток IP должен быть заблокирован кодом 429');
  }

  console.log('\n🎉 ВСЕ ТЕСТЫ И ПРОВЕРКИ ПРОЙДЕНЫ НА 100%! Система полностью функциональна и защищена.\n');
} catch (err) {
  console.error('\n❌ Ошибка во время верификации:');
  if (output) console.error('Логи сервера:\n', output);
  throw err;
} finally {
  if (server) {
    server.kill();
  }
  await rm(temp, { recursive: true, force: true }).catch(() => {});
}
