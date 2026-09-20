import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoodRatingBook, foodRatingKey, formatFoodRating } from '../mini-services/tg-bot/food-ratings.ts';

const target = { date: '01.09.2026', mealType: 'Обед', dishName: 'Суп «Куриный»' };

test('one user has one current score per dish and may change it', () => {
  const ratings = new FoodRatingBook();
  assert.deepEqual(ratings.vote(target, 101, 5, new Date('2026-09-01T10:00:00Z')), { average: 5, votes: 1 });
  assert.deepEqual(ratings.vote(target, 202, 3, new Date('2026-09-01T10:01:00Z')), { average: 4, votes: 2 });
  assert.deepEqual(ratings.vote(target, 101, 1, new Date('2026-09-01T10:02:00Z')), { average: 2, votes: 2 });
});

test('ratings persist through JSON and normalize harmless name differences', () => {
  const ratings = new FoodRatingBook();
  ratings.vote(target, 101, 4);
  const restored = new FoodRatingBook(ratings.toJSON());
  assert.deepEqual(
    restored.summary({ date: '01.09.2026', mealType: ' обед ', dishName: 'суп  «куриный»' }),
    { average: 4, votes: 1 }
  );
  assert.equal(
    foodRatingKey(target),
    foodRatingKey({ date: '01.09.2026', mealType: 'ОБЕД', dishName: 'Суп «Куриный»' })
  );
});

test('invalid scores and malformed persisted entries are ignored', () => {
  const ratings = new FoodRatingBook({
    entries: {
      broken: { dishName: 'X', scores: { '1': 0, bad: 5 }, updatedAt: 'now' },
      [foodRatingKey(target)]: { dishName: target.dishName, scores: { '2': 5, '3': 8 }, updatedAt: 'now' },
    },
  });
  assert.deepEqual(ratings.summary(target), { average: 5, votes: 1 });
  assert.throws(() => ratings.vote(target, 101, 6), /от 1 до 5/);
});

test('formatFoodRating correctly pluralizes Russian vote counts', () => {
  assert.equal(formatFoodRating(null), '');
  assert.equal(formatFoodRating({ average: 5, votes: 1 }), '⭐ 5.0 (1 оценка)');
  assert.equal(formatFoodRating({ average: 4.5, votes: 2 }), '⭐ 4.5 (2 оценки)');
  assert.equal(formatFoodRating({ average: 4, votes: 5 }), '⭐ 4.0 (5 оценок)');
  assert.equal(formatFoodRating({ average: 4.2, votes: 11 }), '⭐ 4.2 (11 оценок)');
  assert.equal(formatFoodRating({ average: 4.8, votes: 21 }), '⭐ 4.8 (21 оценка)');
  assert.equal(formatFoodRating({ average: 4.6, votes: 24 }), '⭐ 4.6 (24 оценки)');
});
