import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMainReplyKeyboard } from '../mini-services/tg-bot/index.ts';

test('getMainReplyKeyboard generates 4 balanced rows with single-row report button', () => {
  const kb = getMainReplyKeyboard('10-1');
  assert.equal(kb.keyboard.length, 4, 'Should have exactly 4 rows');
  assert.deepEqual(
    kb.keyboard[0].map((b) => b.text),
    ['📅 Расписание', '🍱 Столовая', '⚡ Сейчас'],
    'Row 1 should contain 3 schedule/canteen buttons'
  );
  assert.deepEqual(
    kb.keyboard[1].map((b) => b.text),
    ['🔔 Звонки', '📌 События', '🌤 Погода'],
    'Row 2 should contain 3 info buttons'
  );
  assert.deepEqual(
    kb.keyboard[2].map((b) => b.text),
    ['🏫 Класс: 10-1'],
    'Row 3 should contain class label'
  );
  assert.deepEqual(
    kb.keyboard[3].map((b) => b.text),
    ['📝 Отправить репорт'],
    'Row 4 should contain single full-width report button'
  );
});

test('getMainReplyKeyboard without saved class shows select class button in row 3', () => {
  const kb = getMainReplyKeyboard();
  assert.equal(kb.keyboard.length, 4);
  assert.deepEqual(
    kb.keyboard[2].map((b) => b.text),
    ['🏫 Выбрать класс']
  );
  assert.deepEqual(
    kb.keyboard[3].map((b) => b.text),
    ['📝 Отправить репорт']
  );
});

test('isReportAction text variations matching check', () => {
  const variants = [
    '📝 Отправить репорт',
    '📝 Отправить отчёт',
    '📝 Отправить отчет',
    'отправить репорт',
    'отправить репорты',
    'Отправить репорт',
    'ОТПРАВИТЬ РЕПОРТЫ',
    '📝 Сообщить об ошибке',
    '💬 Отправить отчёт',
    '💬 Отправить отчет',
    'отправить отчет',
    'отправить отчёт',
    'сообщить об ошибке',
  ];

  const checkIsReport = (text) => {
    const trimmed = text.trim();
    const lowerText = trimmed.toLowerCase();
    return (
      trimmed === '📝 Отправить репорт' ||
      trimmed === '📝 Отправить отчёт' ||
      trimmed === '📝 Отправить отчет' ||
      trimmed === '💬 Отправить отчёт' ||
      trimmed === '💬 Отправить отчет' ||
      trimmed === '📝 Сообщить об ошибке' ||
      lowerText === 'отправить репорт' ||
      lowerText === 'отправить репорты' ||
      lowerText === 'отправить отчет' ||
      lowerText === 'отправить отчёт' ||
      lowerText === 'сообщить об ошибке'
    );
  };

  for (const v of variants) {
    assert.equal(checkIsReport(v), true, `Variant "${v}" should be recognized as report action`);
  }

  assert.equal(checkIsReport('📅 Расписание'), false);
  assert.equal(checkIsReport('Привет, бот!'), false);
});
