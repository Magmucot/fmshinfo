/**
 * Расписание работы столовой и график смен питания СУНЦ НГУ (ФМШ).
 * Источник: официальный документ «График работы столовой со 2 сентября» (rasp.jpg).
 *
 * Смены:
 *   1-я смена: 8-1, 11-1, 11-2, 11-3, 11-4, 11-5, 11-6, 11-7, 11-8, 11-9 (и 11-11, 11-12)
 *   2-я смена: 10-1, 10-2, 10-3, 10-4, 10-5, 10-6, 10-7, 10-8, 10-9
 *   3-я смена: 9-1, 9-2, 9-3, 11-10
 */

export interface ShiftInfo {
  shift: number;
  name: string;
  classes: string[];
  description: string;
}

export interface MealInterval {
  meal: string;
  order: number;
  duty: string; // Дежурные по столовой
  shift1: string; // 1-я смена
  shift2: string; // 2-я смена
  shift3: string; // 3-я смена
  late: string; // Опоздавшие
  note?: string;
}

export interface WeekendMealInterval {
  meal: string;
  duty: string;
  time: string;
  available: boolean;
  note?: string;
}

export const CANTEEN_SHIFTS: Record<number, ShiftInfo> = {
  1: {
    shift: 1,
    name: "1-я смена",
    classes: ["8-1", "11-1", "11-2", "11-3", "11-4", "11-5", "11-6", "11-7", "11-8", "11-9", "11-11", "11-12"],
    description: "8-1 и 11 классы (кроме 11-10)",
  },
  2: {
    shift: 2,
    name: "2-я смена",
    classes: ["10-1", "10-2", "10-3", "10-4", "10-5", "10-6", "10-7", "10-8", "10-9"],
    description: "10 классы (все)",
  },
  3: {
    shift: 3,
    name: "3-я смена",
    classes: ["9-1", "9-2", "9-3", "11-10"],
    description: "9 классы и 11-10",
  },
};

/** Будние дни (понедельник – суббота) */
export const WEEKDAY_MEALS: MealInterval[] = [
  {
    meal: "Завтрак",
    order: 1,
    duty: "07:20 – 07:35",
    shift1: "07:35 – 08:10",
    shift2: "07:35 – 08:10",
    shift3: "07:35 – 08:10",
    late: "07:35 – 08:10",
    note: "Все смены питаются одновременно",
  },
  {
    meal: "2-й завтрак",
    order: 2,
    duty: "11:50 – 12:00",
    shift1: "12:00 – 12:25",
    shift2: "12:00 – 12:25",
    shift3: "12:00 – 12:25",
    late: "12:00 – 12:25",
    note: "Перерыв между 2-й и 3-й парами",
  },
  {
    meal: "Обед",
    order: 3,
    duty: "14:00 – 14:15",
    shift1: "14:15 – 14:30",
    shift2: "14:30 – 14:45",
    shift3: "14:45 – 15:00",
    late: "15:00 – 15:10",
    note: "Посменный приём пищи",
  },
  {
    meal: "Полдник",
    order: 4,
    duty: "17:20 – 17:30",
    shift1: "17:30 – 17:55",
    shift2: "17:30 – 17:55",
    shift3: "17:30 – 17:55",
    late: "17:30 – 17:55",
    note: "Все смены питаются одновременно",
  },
  {
    meal: "Ужин",
    order: 5,
    duty: "19:15 – 19:30",
    shift1: "19:30 – 19:40",
    shift2: "19:40 – 19:50",
    shift3: "19:50 – 20:00",
    late: "20:00 – 20:10",
    note: "Посменный приём пищи",
  },
  {
    meal: "2-й ужин",
    order: 6,
    duty: "21:50 – 22:00",
    shift1: "22:00 – 22:10",
    shift2: "22:00 – 22:10",
    shift3: "22:00 – 22:10",
    late: "22:00 – 22:10",
    note: "Перед вечерней поверкой",
  },
];

/** Выходные и праздничные дни */
export const WEEKEND_MEALS: WeekendMealInterval[] = [
  {
    meal: "Завтрак",
    duty: "08:20 – 08:35",
    time: "08:35 – 09:10",
    available: true,
  },
  {
    meal: "2-й завтрак",
    duty: "—",
    time: "—",
    available: false,
    note: "2-го завтрака НЕТ",
  },
  {
    meal: "Обед",
    duty: "13:45 – 14:00",
    time: "14:00 – 14:45",
    available: true,
  },
  {
    meal: "Полдник",
    duty: "17:20 – 17:30",
    time: "17:30 – 17:55",
    available: true,
  },
  {
    meal: "Ужин",
    duty: "19:15 – 19:30",
    time: "19:30 – 20:00",
    available: true,
  },
  {
    meal: "2-й ужин",
    duty: "—",
    time: "—",
    available: false,
    note: "2-го ужина НЕТ",
  },
];

export const CANTEEN_FOOTNOTE = "Самые точные часы у ДЕЖУРНОГО АДМИНИСТРАТОРА";

/** Определение смены по номеру класса (например '10-1' → 2) */
export function getShiftForClass(className: string): number {
  const norm = className.trim();
  for (const shift of Object.values(CANTEEN_SHIFTS)) {
    if (shift.classes.includes(norm)) {
      return shift.shift;
    }
  }
  // Правило по умолчанию по параллели
  if (norm.startsWith("8-") || norm.startsWith("11-")) return 1;
  if (norm.startsWith("10-")) return 2;
  if (norm.startsWith("9-")) return 3;
  return 1;
}

/** Получить персональное расписание питания для конкретного класса или смены */
export function getMealsForClass(className: string, isWeekend = false) {
  const shift = getShiftForClass(className);
  if (isWeekend) {
    return {
      shift,
      className,
      isWeekend: true,
      meals: WEEKEND_MEALS.map((m) => ({
        meal: m.meal,
        time: m.available ? m.time : "НЕТ",
        duty: m.duty,
        available: m.available,
        note: m.note,
      })),
      footnote: CANTEEN_FOOTNOTE,
    };
  }

  const shiftKey = `shift${shift}` as "shift1" | "shift2" | "shift3";
  return {
    shift,
    className,
    isWeekend: false,
    meals: WEEKDAY_MEALS.map((m) => ({
      meal: m.meal,
      time: m[shiftKey],
      duty: m.duty,
      late: m.late,
      note: m.note,
      order: m.order,
    })),
    footnote: CANTEEN_FOOTNOTE,
  };
}

/** Парсинг времени 'HH:MM' в минуты от полуночи */
function parseMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export interface CurrentMealState {
  isWeekend: boolean;
  status: "active" | "duty" | "upcoming" | "closed";
  currentMealName: string | null;
  currentShift: string | null;
  timeRange: string | null;
  nextMealName: string | null;
  nextMealTime: string | null;
  minutesUntilNext: number | null;
  description: string;
  userShift?: number;
  userClassName?: string;
}

/**
 * Получение текущего состояния столовой по новосибирскому времени (UTC+7)
 * с поддержкой конкретного класса (1-я, 2-я или 3-я смена)
 */
export function getCurrentMealState(customDate?: Date, className?: string): CurrentMealState {
  const now = customDate ?? new Date(Date.now() + 7 * 3600 * 1000);
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const currentTotal = hours * 60 + minutes;
  const isWeekend = now.getUTCDay() === 0; // Воскресенье

  const userShift = className ? getShiftForClass(className) : undefined;
  const shiftKey = userShift ? (`shift${userShift}` as "shift1" | "shift2" | "shift3") : "shift1";

  if (isWeekend) {
    for (const m of WEEKEND_MEALS) {
      if (!m.available) continue;
      const [dutyStart, dutyEnd] = m.duty.split("–").map((s) => s.trim());
      const [mealStart, mealEnd] = m.time.split("–").map((s) => s.trim());
      const ds = parseMinutes(dutyStart);
      const de = parseMinutes(dutyEnd);
      const ms = parseMinutes(mealStart);
      const me = parseMinutes(mealEnd);

      if (currentTotal >= ds && currentTotal < de) {
        return {
          isWeekend: true,
          status: "duty",
          currentMealName: m.meal,
          currentShift: "Дежурные по столовой",
          timeRange: m.duty,
          nextMealName: m.meal,
          nextMealTime: mealStart,
          minutesUntilNext: ms - currentTotal,
          description: `Дежурные готовят столовую: ${m.meal} (${m.duty})`,
          userShift,
          userClassName: className,
        };
      }
      if (currentTotal >= ms && currentTotal < me) {
        return {
          isWeekend: true,
          status: "active",
          currentMealName: m.meal,
          currentShift: "Все классы",
          timeRange: m.time,
          nextMealName: null,
          nextMealTime: null,
          minutesUntilNext: null,
          description: `Сейчас в столовой: ${m.meal} (${m.time})`,
          userShift,
          userClassName: className,
        };
      }
    }

    // Поиск следующего приёма пищи на выходных
    for (const m of WEEKEND_MEALS) {
      if (!m.available) continue;
      const [mealStart] = m.time.split("–").map((s) => s.trim());
      const ms = parseMinutes(mealStart);
      if (ms > currentTotal) {
        return {
          isWeekend: true,
          status: "upcoming",
          currentMealName: null,
          currentShift: null,
          timeRange: null,
          nextMealName: m.meal,
          nextMealTime: mealStart,
          minutesUntilNext: ms - currentTotal,
          description: `Следующий приём: ${m.meal} в ${mealStart} (через ${ms - currentTotal} мин)`,
          userShift,
          userClassName: className,
        };
      }
    }

    return {
      isWeekend: true,
      status: "closed",
      currentMealName: null,
      currentShift: null,
      timeRange: null,
      nextMealName: "Завтрак",
      nextMealTime: "08:35 (завтра)",
      minutesUntilNext: null,
      description: "Столовая закрыта до утра (завтрак в 08:35)",
      userShift,
      userClassName: className,
    };
  }

  // Будний день
  for (const m of WEEKDAY_MEALS) {
    const [dutyStart, dutyEnd] = m.duty.split("–").map((s) => s.trim());
    const ds = parseMinutes(dutyStart);
    const de = parseMinutes(dutyEnd);

    // 1. Время дежурных по столовой
    if (currentTotal >= ds && currentTotal < de) {
      const userMealStart = m[shiftKey].split("–")[0].trim();
      const userMealRange = m[shiftKey];
      const waitMin = parseMinutes(userMealStart) - currentTotal;
      return {
        isWeekend: false,
        status: "duty",
        currentMealName: m.meal,
        currentShift: "Дежурные по столовой",
        timeRange: userShift ? userMealRange : m.duty,
        nextMealName: m.meal,
        nextMealTime: userMealStart,
        minutesUntilNext: waitMin,
        description: userShift && className
          ? `Дежурные накрывают: ${m.meal} · Твой класс (${className}, ${userShift}-я смена) в ${userMealStart}`
          : `Дежурные накрывают столы: ${m.meal} (${m.duty})`,
        userShift,
        userClassName: className,
      };
    }

    // 2. Время приёма пищи (по сменам)
    const shifts = [
      { shiftNum: 1, shiftName: "1-я смена (8-1, 11 кл)", range: m.shift1 },
      { shiftNum: 2, shiftName: "2-я смена (10 кл)", range: m.shift2 },
      { shiftNum: 3, shiftName: "3-я смена (9 кл, 11-10)", range: m.shift3 },
      { shiftNum: 0, shiftName: "Опоздавшие", range: m.late },
    ];

    const mealStartMin = parseMinutes(m.shift1.split("–")[0].trim());
    const mealEndMin = parseMinutes((m.late || m.shift3).split("–")[1].trim());

    if (currentTotal >= mealStartMin && currentTotal < mealEndMin) {
      const activeShift = shifts.find((sh) => {
        const [s, e] = sh.range.split("–").map((t) => parseMinutes(t.trim()));
        return currentTotal >= s && currentTotal < e;
      });

      if (userShift && className) {
        const userRange = m[shiftKey];
        const [uStart, uEnd] = userRange.split("–").map((s) => s.trim());
        const uStartMin = parseMinutes(uStart);
        const uEndMin = parseMinutes(uEnd);

        // Пользователь сейчас ест
        if (currentTotal >= uStartMin && currentTotal < uEndMin) {
          return {
            isWeekend: false,
            status: "active",
            currentMealName: m.meal,
            currentShift: `Твоя ${userShift}-я смена (${className})`,
            timeRange: userRange,
            nextMealName: null,
            nextMealTime: null,
            minutesUntilNext: null,
            description: `Сейчас в столовой: ${m.meal} — Твоя ${userShift}-я смена (${userRange})`,
            userShift,
            userClassName: className,
          };
        }

        // Приём уже начался, но смена пользователя ещё впереди
        if (currentTotal < uStartMin) {
          const waitMin = uStartMin - currentTotal;
          return {
            isWeekend: false,
            status: "active",
            currentMealName: m.meal,
            currentShift: activeShift?.shiftName ?? "Другая смена",
            timeRange: userRange,
            nextMealName: m.meal,
            nextMealTime: uStart,
            minutesUntilNext: waitMin,
            description: `В столовой: ${m.meal} (${activeShift?.shiftName ?? "смена"}) · Твой класс (${className}, ${userShift}-я см) в ${uStart} (через ${waitMin} мин)`,
            userShift,
            userClassName: className,
          };
        }

        // Смена пользователя уже прошла
        if (currentTotal >= uEndMin) {
          const nextM = WEEKDAY_MEALS.find((nm) => nm.order > m.order);
          const nextStart = nextM ? nextM[shiftKey].split("–")[0].trim() : null;
          const nextWait = nextStart ? parseMinutes(nextStart) - currentTotal : null;

          return {
            isWeekend: false,
            status: "active",
            currentMealName: m.meal,
            currentShift: activeShift?.shiftName ?? "Завершение",
            timeRange: userRange,
            nextMealName: nextM?.meal ?? null,
            nextMealTime: nextStart,
            minutesUntilNext: nextWait,
            description: nextM
              ? `В столовой: ${m.meal} (${activeShift?.shiftName ?? ""}) · Твоя смена пообедала. Следующий: ${nextM.meal} в ${nextStart}`
              : `В столовой: ${m.meal} (${activeShift?.shiftName ?? ""}) · Твоя смена завершена`,
            userShift,
            userClassName: className,
          };
        }
      }

      // Без указания класса
      return {
        isWeekend: false,
        status: "active",
        currentMealName: m.meal,
        currentShift: activeShift?.shiftName ?? "Все классы",
        timeRange: activeShift?.range ?? m.shift1,
        nextMealName: null,
        nextMealTime: null,
        minutesUntilNext: null,
        description: `Сейчас в столовой: ${m.meal} — ${activeShift?.shiftName ?? ""} (${activeShift?.range ?? ""})`,
      };
    }
  }

  // 3. Ближайший будущий приём пищи
  for (const m of WEEKDAY_MEALS) {
    const sStart = m[shiftKey].split("–")[0].trim();
    const ms = parseMinutes(sStart);
    if (ms > currentTotal) {
      const waitMin = ms - currentTotal;
      return {
        isWeekend: false,
        status: "upcoming",
        currentMealName: null,
        currentShift: null,
        timeRange: m[shiftKey],
        nextMealName: m.meal,
        nextMealTime: sStart,
        minutesUntilNext: waitMin,
        description: userShift && className
          ? `Следующий приём: ${m.meal} для ${userShift}-й смены (${className}) в ${sStart} (через ${waitMin} мин)`
          : `Следующий приём: ${m.meal} в ${sStart} (через ${waitMin} мин)`,
        userShift,
        userClassName: className,
      };
    }
  }

  // 4. Столовая закрыта на ночь
  const morningStart = WEEKDAY_MEALS[0][shiftKey].split("–")[0].trim();
  return {
    isWeekend: false,
    status: "closed",
    currentMealName: null,
    currentShift: null,
    timeRange: null,
    nextMealName: "Завтрак",
    nextMealTime: `${morningStart} (завтра)`,
    minutesUntilNext: null,
    description: `Столовая закрыта на ночь до 07:20 (завтрак ${morningStart})`,
    userShift,
    userClassName: className,
  };
}
