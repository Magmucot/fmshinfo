import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeSavedClass, isSavedClass } from '../mini-services/tg-bot/preferences.ts';

test('changing class resets both filters without changing other users', () => {
  const classes = new Map([[1, '10-4'], [2, '11-1']]);
  const subgroups = new Map([[1, 1], [2, 2]]);
  const english = new Map([[1, 'Teacher A'], [2, 'Teacher B']]);
  changeSavedClass(1, '11-2', classes, subgroups, english);
  assert.equal(classes.get(1), '11-2');
  assert.equal(subgroups.has(1), false);
  assert.equal(english.has(1), false);
  assert.equal(subgroups.get(2), 2);
  assert.equal(english.get(2), 'Teacher B');
  assert.equal(isSavedClass(1, '10-4', classes), false);
  assert.equal(isSavedClass(1, '11-2', classes), true);
});
test('selecting the same class preserves preferences; changing away and back clears them', () => {
  const classes = new Map([[1, '10-4']]);
  const subgroups = new Map([[1, 2]]);
  const english = new Map([[1, 'Teacher A']]);
  changeSavedClass(1, '10-4', classes, subgroups, english);
  assert.equal(subgroups.get(1), 2);
  assert.equal(english.get(1), 'Teacher A');
  changeSavedClass(1, '11-2', classes, subgroups, english);
  changeSavedClass(1, '10-4', classes, subgroups, english);
  assert.equal(subgroups.has(1), false);
  assert.equal(english.has(1), false);
});
test('unsaved users cannot apply class-specific settings', () => {
  const classes = new Map();
  assert.equal(isSavedClass(undefined, '10-4', classes), false);
  assert.equal(isSavedClass(1, '10-4', classes), false);
});

import { scheduleButtonDay } from '../mini-services/tg-bot/schedule-day.ts';
test('today changes at Novosibirsk midnight and preserves Sunday', () => {
  assert.equal(scheduleButtonDay('today', new Date('2026-09-12T16:59:59Z')), 6);
  assert.equal(scheduleButtonDay('today', new Date('2026-09-12T17:00:00Z')), 0);
  assert.equal(scheduleButtonDay('today', new Date('2026-09-13T17:00:00Z')), 1);
  assert.equal(scheduleButtonDay('0'), 0);
  assert.equal(scheduleButtonDay('6'), 6);
  for (const value of ['7', '-1', 'NaN', '', '1.5']) assert.equal(scheduleButtonDay(value), null);
});
