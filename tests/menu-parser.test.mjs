import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMenuText } from '../src/lib/server/menu.ts';
import { menuText, canteenText } from '../mini-services/tg-bot/index.ts';

test('parseMenuText parses meals, KBJU, and preserves full Cyrillic dish names', () => {
  const sample = `
СУНЦ 03.10.2026
Меню школы (СУНЦ НГУ)
Обед
1 Зелень
003 Чеснок Ккал-1
100 Овощи отварные Ккал-20, Белки-2, Углеводы-5
Цветная капуста см, Соль йодированная
100 Перец сладкий Белки-2, Жиры-2, Углеводы-5
300 Солянка домашняя Ккал-161, Белки-11, Жиры-10, Углеводы-10
Говядина тз б/к, Лук репчатый, Огурцы соленые
120 Рыба тушеная с овощами Ккал-272, Белки-28, Жиры-13, Углеводы-11
230 Рис припущенный Ккал-66, Жиры-7
200 Напиток брусничный Ккал-37, Углеводы-9
38 Хлеб пшеничный Ккал-100, Белки-3, Углеводы-21
50 Хлеб ржаной (ржано-пшеничный) Ккал-34, Белки-1, Углеводы-7
Итого за Обед Ккал-692, Белки-47, Жиры-32, Углеводы-69
`;

  const parsed = parseMenuText(sample);
  const obed = parsed.meals.find((m) => m.type.toLowerCase().includes('обед'));
  assert.ok(obed, 'Обед meal section should be found');

  const dishNames = obed.dishes.map((d) => d.name);
  assert.ok(dishNames.includes('Овощи отварные'), 'Dish name must be "Овощи отварные", not cut off');
  assert.ok(dishNames.includes('Рыба тушеная с овощами'), 'Dish name must include "Рыба тушеная с овощами"');
  assert.ok(dishNames.includes('Солянка домашняя'), 'Dish name must include "Солянка домашняя"');
  assert.ok(dishNames.includes('Напиток брусничный'), 'Dish name must include "Напиток брусничный"');
  assert.equal(dishNames.includes('Овощи отварны'), false, 'Dish name must not be truncated to "Овощи отварны"');

  const ovoshi = obed.dishes.find((d) => d.name === 'Овощи отварные');
  assert.equal(ovoshi.weight, 100);
  assert.equal(ovoshi.kcal, 20);
  assert.equal(ovoshi.protein, 2);
  assert.equal(ovoshi.carbs, 5);
  assert.equal(ovoshi.ingredients, 'Цветная капуста см, Соль йодированная');
});

test('menuText and canteenText provide unified tab navigation', { timeout: 20000 }, async () => {
  const menuRes = await menuText();
  assert.ok(menuRes.text, 'Menu text must be generated');
  assert.ok(menuRes.keyboard, 'Menu inline keyboard must be provided');

  // Verify Tab bar in menu keyboard
  const firstRow = menuRes.keyboard.inline_keyboard[0];
  assert.equal(firstRow[0].text, '• 🍽 Меню •');
  assert.equal(firstRow[0].callback_data, 'canteen:tab:menu:noop');
  assert.equal(firstRow[1].text, '🍱 График смен');
  assert.ok(firstRow[1].callback_data.startsWith('canteen:tab:sched:'));

  const canteenRes = await canteenText('10-1');
  assert.ok(canteenRes.text, 'Canteen text must be generated');
  assert.ok(canteenRes.keyboard, 'Canteen inline keyboard must be provided');

  // Verify Tab bar in canteen schedule keyboard
  const canteenFirstRow = canteenRes.keyboard.inline_keyboard[0];
  assert.equal(canteenFirstRow[0].text, '🍽 Меню');
  assert.ok(canteenFirstRow[0].callback_data.startsWith('canteen:tab:menu:'));
  assert.equal(canteenFirstRow[1].text, '• 🍱 График смен •');
  assert.equal(canteenFirstRow[1].callback_data, 'canteen:tab:sched:noop');
});
