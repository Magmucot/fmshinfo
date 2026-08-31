"use client";

/** Раздел «Гайд»: как пользоваться порталом.
 *  Семь глав: начало работы, разделы, установка на телефон (PWA),
 *  Telegram-бот, горячие клавиши и ссылки, администраторам, FAQ. */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Bot,
  BrushCleaning,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CloudSun,
  Compass,
  FileText,
  Flame,
  GitBranch,
  HelpCircle,
  Info,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  MoonStar,
  Newspaper,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Utensils,
  Wifi,
  Zap,
} from "lucide-react";
import { SectionCard } from "../shared";

/** Клавиша в тексте (Alt+1, ⋮ и т.п.) */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-secondary px-1.5 font-mono text-[11px] font-semibold text-foreground shadow-[inset_0_-1px_0_var(--border)]">
      {children}
    </kbd>
  );
}

/** Плавная прокрутка к главе по якорю */
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Глава гайда: номер, иконка, заголовок, подзаголовок */
function Chapter({
  id,
  num,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  num: number;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-36 space-y-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
            Глава {num}
          </p>
          <h2 className="text-lg font-extrabold leading-tight tracking-tight sm:text-xl">{title}</h2>
        </div>
      </div>
      {subtitle ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      ) : null}
      {children}
    </section>
  );
}

/** Нумерованный шаг инструкции */
function Step({ n, title, text }: { n: number; title: string; text: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground shadow-sm">
        {n}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

/** Мелкая строка-фича с иконкой */
function FeatureRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-relaxed">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/** Оглавление гайда */
const TOC: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "guide-start", label: "Начало", icon: Compass },
  { id: "guide-sections", label: "Разделы", icon: LayoutGrid },
  { id: "guide-install", label: "На телефон", icon: Smartphone },
  { id: "guide-bot", label: "Telegram-бот", icon: Bot },
  { id: "guide-hotkeys", label: "Клавиши и ссылки", icon: Keyboard },
  { id: "guide-admin", label: "Админам", icon: ShieldCheck },
  { id: "guide-faq", label: "FAQ", icon: HelpCircle },
];

/** Описания разделов портала (глава 2) */
const SECTION_DOCS: Array<{
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  points: string[];
}> = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Главная",
    text: "Сводка всего дня на одном экране — откройте портал, и вы сразу в курсе.",
    points: [
      "Погода сейчас и «Сейчас в школе»: какая пара идёт и сколько до звонка",
      "Калории и превью меню на сегодня, дежурства, ночные вожатые",
      "Последние новости школы и быстрые кнопки перехода",
    ],
  },
  {
    id: "canteen",
    icon: Utensils,
    title: "Столовая",
    text: "Полное меню с КБЖУ. Переключатель сверху открывает режим «Аналитика».",
    points: [
      "Выбор даты стрелками ‹ › и кнопка «Сегодня»; поиск по названию и составу",
      "7 фильтров: вегетарианское, высокобелковые, без молока / глютена / яиц / рыбы / орехов",
      "Значки аллергенов на каждом блюде; кнопка «Поделиться» копирует меню дня",
      "Аналитика: график калорий за 10 дней, распределение по приёмам пищи, калькулятор «Мой выбор»",
    ],
  },
  {
    id: "schedule",
    icon: CalendarDays,
    title: "Расписание",
    text: "Занятия и звонки для любого из 25 классов, Пн–Сб, с учётом деления на группы.",
    points: [
      "Выберите класс (например, 10-1) — сетка дней с уроками и номером пары",
      "Уроки в одно и то же время = класс разделён на группы: показаны карточками с номерами",
      "Бейдж «N×группы» в заголовке дня; звонки — списком по парам",
    ],
  },
  {
    id: "events",
    icon: CalendarClock,
    title: "Мероприятия",
    text: "Календарь школы из Google-таблицы: линейки, пробные ЕГЭ/ОГЭ, пересдачи, спецкурсы.",
    points: [
      "Общие события (ЕГЭ/ОГЭ и др.) — всем; события классов — с чипом 8-1 … 11-12",
      "Фильтр по классу, поиск и переключатель «Прошедшие»; карточка «Ближайшее» сверху",
      "На Главной — 3 ближайших события; в боте — /events",
    ],
  },
  {
    id: "duty",
    icon: BrushCleaning,
    title: "Дежурства",
    text: "График дежурств на неделю вперёд. Записи вносит администратор.",
    points: [
      "Кто дежит сегодня и на 7 дней вперёд: класс, ответственный, интервал",
      "Админ-панель добавления и удаления записей (по ключу, глава 6)",
    ],
  },
  {
    id: "counselors",
    icon: MoonStar,
    title: "Вожатые",
    text: "Ночные вожатые по общежитиям на сегодня + экстренные контакты.",
    points: [
      "Карточки общежитий: имя вожатого, телефон, этаж",
      "Экстренные контакты школы всегда под рукой",
    ],
  },
  {
    id: "weather",
    icon: CloudSun,
    title: "Погода",
    text: "Академгородок: текущая погода и прогноз на 3 дня.",
    points: [
      "Температура, ветер, влажность — сейчас",
      "Почасовой прогноз на ближайшие часы и по дням",
    ],
  },
  {
    id: "news",
    icon: Newspaper,
    title: "Новости",
    text: "Последние новости СУНЦ НГУ — прямо с сайта школы.",
    points: ["Заголовок, дата и анонс каждой новости", "Ссылка на полную версию на sesc.nsu.ru"],
  },
  {
    id: "info",
    icon: Info,
    title: "Инфо",
    text: "Справочник: контакты школы, полезные ссылки, обратная связь.",
    points: [
      "Телефоны и e-mail в один тап (ссылки tel: и mailto:)",
      "Форма обратной связи: предложения и найденные ошибки пишутся в базу",
    ],
  },
  {
    id: "document",
    icon: FileText,
    title: "Документ",
    text: "Аналитический документ проекта: источники данных и архитектура.",
    points: ["Где школа публикует каждое данное и как оно попадает в портал", "Технические детали для любопытных"],
  },
];

/** Команды Telegram-бота (глава 4) */
const BOT_COMMANDS: Array<{ cmd: string; args?: string; desc: string }> = [
  { cmd: "/start, /help", desc: "приветствие и список команд" },
  { cmd: "/menu", args: "[дата]", desc: "меню столовой с КБЖУ и итогом дня" },
  { cmd: "/bells", desc: "расписание звонков по парам" },
  { cmd: "/schedule", args: "[класс]", desc: "расписание класса (по умолчанию 10-1)" },
  { cmd: "/tomorrow", desc: "расписание на завтра" },
  { cmd: "/events", args: "[класс]", desc: "ближайшие мероприятия из Google-таблицы" },
  { cmd: "/weather", desc: "погода сейчас + прогноз на 3 дня" },
  { cmd: "/news", desc: "6 последних новостей школы" },
  { cmd: "/duty", desc: "дежурства на сегодня" },
  { cmd: "/counselors", desc: "ночные вожатые на сегодня" },
  { cmd: "/info", desc: "адрес, e-mail и телефоны школы" },
];

/** Прямые ссылки ?tab=… (глава 5) */
const DEEPLINKS: Array<{ tab: string; desc: string }> = [
  { tab: "dashboard", desc: "Главная" },
  { tab: "canteen", desc: "Столовая · Меню" },
  { tab: "analytics", desc: "Столовая · Аналитика" },
  { tab: "schedule", desc: "Расписание" },
  { tab: "events", desc: "Мероприятия" },
  { tab: "duty", desc: "Дежурства" },
  { tab: "counselors", desc: "Вожатые" },
  { tab: "weather", desc: "Погода" },
  { tab: "news", desc: "Новости" },
  { tab: "info", desc: "Инфо" },
  { tab: "document", desc: "Документ" },
  { tab: "guide", desc: "Гайд (эта страница)" },
];

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "Данные не загрузились или показали бейдж «из кэша» — что это значит?",
    a: "Портал берёт данные с сайтов школы в момент запроса. Если источник временно недоступен, вы увидите последнюю сохранённую версию с бейджем «из кэша». Нажмите «Повторить» — данные обновятся, когда источник ответит.",
  },
  {
    q: "Почему статистика калорий при первом открытии грузится ~30 секунд?",
    a: "Аналитика за 10 дней — это 10 разных PDF-меню, которые скачиваются и разбираются впервые. После первого прохода всё берётся из кэша почти мгновенно. Прогрев запускается автоматически с Главной.",
  },
  {
    q: "Где хранится мой выбор блюд в калькуляторе «Мой выбор»?",
    a: "Только на вашем устройстве (localStorage браузера). Ничего не отправляется на сервер: отметили блюда — увидели БЖУ и калории, закрыли вкладку — на следующем устройстве отметок не будет.",
  },
  {
    q: "Как посмотреть меню или расписание на завтра?",
    a: "В столовой — стрелка › рядом с датой (и кнопка «Сегодня» для возврата). В Telegram-боте — команда /tomorrow. В расписании дни Пн–Сб уже показаны все сразу.",
  },
  {
    q: "Почему в расписании на одно время несколько уроков?",
    a: "Так класс делится на группы: одна часть идёт на один предмет, другая — на другой. Портал собирает такие уроки в блок «класс делится на N группы» и нумерует варианты. Уточнить, в какой вы группе, можно у классного руководителя.",
  },
  {
    q: "Расписание не совпадает с журналом. Что делать?",
    a: "Данные приходят с table-sesc.nsu.ru — того же сервиса, на котором строится официальная сетка. Если школа обновила расписание, изменения появятся после обновления источника. Сообщите об ошибке через форму в разделе «Инфо».",
  },
  {
    q: "Как предложить идею или сообщить о баге?",
    a: "Раздел «Инфо» → карточка «Обратная связь»: имя, контакт и сообщение попадут в базу портала. Ещё можно написать через Telegram-бот — команда /info покажет контакты школы.",
  },
];

export function GuideSection({ onNavigate }: { onNavigate: (tab: string) => void }) {
  /** Активная глава — подсвечивается при прокрутке (scroll-spy) */
  const [activeChapter, setActiveChapter] = useState(TOC[0].id);
  /** Прогресс чтения страницы (0…1) для полоски в липкой панели */
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveChapter(visible[0].target.id);
      },
      // Активная зона: ниже шапки и липкой панели (≈130px) и выше середины экрана
      { rootMargin: "-130px 0px -55% 0px", threshold: 0 }
    );
    TOC.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="space-y-8">
      {/* Шапка гайда */}
      <SectionCard contentClassName="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/25">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              Гайд по порталу «СУНЦ Инфо»
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Всё, что нужно ученику ФМШ: меню, расписание с группами, мероприятия, дежурства,
              вожатые, погода и новости. Ниже — как пользоваться сайтом, установить приложение на
              телефон и подключить Telegram-бота. Время чтения — 5 минут.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Липкая навигация по главам: подсветка активной + прогресс чтения */}
      <div className="sticky top-[110px] z-30 sm:top-[120px]">
        <div className="-mx-3 border-y border-border/60 bg-background/90 px-3 py-2 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:border-border/70 sm:shadow-sm">
          <div
            className="flex gap-1.5 overflow-x-auto no-scrollbar"
            role="navigation"
            aria-label="Главы гайда"
          >
            {TOC.map(({ id, label, icon: Icon }) => {
              const active = activeChapter === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setActiveChapter(id);
                    scrollToId(id);
                  }}
                  aria-current={active ? "true" : undefined}
                  className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border/70 bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
          {/* Прогресс чтения */}
          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-border/60 sm:mt-1">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Глава 1. Начало работы */}
      <Chapter
        id="guide-start"
        num={1}
        icon={<Compass className="h-5 w-5" />}
        title="Начало работы"
        subtitle="Портал — неофициальный агрегатор данных СУНЦ НГУ. Ничего вводить не нужно: откройте страницу — данные уже на месте."
      >
        <SectionCard>
          <ul className="space-y-3">
            <FeatureRow icon={<Zap className="h-4 w-4" />}>
              <span>
                <span className="font-semibold">Данные живые.</span> Меню столовой — из PDF на{" "}
                <span className="text-primary">sesc.nsu.ru</span>, расписание и звонки — с{" "}
                <span className="text-primary">table-sesc.nsu.ru</span>, мероприятия — из{" "}
                <span className="text-primary">Google-таблицы школы</span>, новости — со школьного
                сайта, погода — <span className="text-primary">Open-Meteo</span> для
                Академгородка. Кэш обновляется автоматически.
              </span>
            </FeatureRow>
            <FeatureRow icon={<Wifi className="h-4 w-4" />}>
              <span>
                <span className="font-semibold">Первое открытие раздела</span> может занять до 30
                секунд (скачиваются PDF и страницы источника) — дальше всё летает из кэша. Бейдж{" "}
                <Badge variant="outline" className="mx-0.5 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
                  из кэша
                </Badge>{" "}
                означает: источник молчит, показана последняя сохранённая версия.
              </span>
            </FeatureRow>
            <FeatureRow icon={<LayoutGrid className="h-4 w-4" />}>
              <span>
                <span className="font-semibold">Навигация.</span> Разделы — вкладки под шапкой; на
                телефоне список прокручивается пальцем влево-вправо. Тема переключается кнопкой
                солнца/луны в шапке и запоминается.
              </span>
            </FeatureRow>
            <FeatureRow icon={<BrushCleaning className="h-4 w-4" />}>
              <span>
                <span className="font-semibold">Дежурства и вожатые</span> школа онлайн не
                публикует — их вносят администраторы портала вручную (глава 6). Остальные данные
                обновляются сами.
              </span>
            </FeatureRow>
          </ul>
        </SectionCard>
      </Chapter>

      {/* Глава 2. Разделы портала */}
      <Chapter
        id="guide-sections"
        num={2}
        icon={<LayoutGrid className="h-5 w-5" />}
        title="Разделы портала"
        subtitle="Десять вкладок. Нажмите «Открыть», чтобы перейти в раздел прямо из гайда."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {SECTION_DOCS.map((doc) => {
            const Icon = doc.icon;
            return (
              <SectionCard
                key={doc.id}
                title={doc.title}
                icon={<Icon className="h-4 w-4" />}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigate(doc.id)}
                    className="h-9 gap-1 rounded-xl px-3 text-xs font-semibold transition-all duration-200 hover:border-primary/40 hover:text-primary"
                  >
                    Открыть
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                }
                className="h-full"
              >
                <p className="text-sm leading-relaxed text-muted-foreground">{doc.text}</p>
                <ul className="mt-3 space-y-2">
                  {doc.points.map((p, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      <span className="min-w-0 break-words">{p}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}
        </div>
      </Chapter>

      {/* Глава 3. Установка на телефон */}
      <Chapter
        id="guide-install"
        num={3}
        icon={<Smartphone className="h-5 w-5" />}
        title="Установка на телефон"
        subtitle="Портал — полноценное приложение (PWA): ставится за минуту, работает без адресной строки и части данных — даже офлайн."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Android · Chrome" icon={<Smartphone className="h-4 w-4" />}>
            <ol className="space-y-3.5">
              <Step
                n={1}
                title="Откройте портал в Chrome"
                text={<>Или нажмите баннер «Установить приложение» на Главной, если он показан.</>}
              />
              <Step
                n={2}
                title="Меню браузера"
                text={
                  <>
                    Нажмите <Kbd>⋮</Kbd> в правом верхнем углу и выберите пункт{" "}
                    <span className="font-semibold text-primary">«Установить приложение»</span>.
                  </>
                }
              />
              <Step
                n={3}
                title="Подтвердите"
                text="Иконка «СУНЦ Инфо» появится на рабочем столе — запуск в один тап."
              />
            </ol>
          </SectionCard>

          <SectionCard title="iPhone / iPad · Safari" icon={<Share2 className="h-4 w-4" />}>
            <ol className="space-y-3.5">
              <Step n={1} title="Откройте портал в Safari" text="Важно: именно Safari — Chrome на iOS не умеет ставить PWA." />
              <Step
                n={2}
                title="Кнопка «Поделиться»"
                text={
                  <>
                    Нажмите <Share2 className="inline h-3.5 w-3.5 text-primary" /> внизу экрана и
                    пролистайте действия.
                  </>
                }
              />
              <Step
                n={3}
                title="«На экран „Домой“»"
                text="Выберите «На экран „Домой“», задайте имя — приложение готово."
              />
            </ol>
          </SectionCard>
        </div>

        <SectionCard title="Что даёт установка" icon={<Sparkles className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[
              { icon: <Smartphone className="h-4 w-4" />, text: "Полноэкранный режим без адресной строки и вкладок браузера" },
              { icon: <Zap className="h-4 w-4" />, text: "Быстрый запуск с рабочего стола — как обычное приложение" },
              { icon: <Wifi className="h-4 w-4" />, text: "Кэш и офлайн-страница: интерфейс открывается даже без сети" },
              { icon: <ChevronRight className="h-4 w-4" />, text: "Шорткаты: долгое нажатие на иконку — быстрый переход к Меню, Расписанию или Погоде" },
            ].map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/30 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
              >
                <span className="mt-0.5 shrink-0 text-primary">{f.icon}</span>
                <p className="text-sm leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground">
            Уже установили? Кнопка установки и баннер на Главной исчезнут автоматически — приложение
            открывается сразу в полноэкранном режиме.
          </p>
        </SectionCard>
      </Chapter>

      {/* Глава 4. Telegram-бот */}
      <Chapter
        id="guide-bot"
        num={4}
        icon={<Bot className="h-5 w-5" />}
        title="Telegram-бот"
        subtitle="Те же данные, что на сайте — прямо в Telegram. Бот синхронен с порталом: берёт данные из его API."
      >
        <SectionCard>
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-secondary/50 p-3 text-sm leading-relaxed text-muted-foreground">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Бот тоже понимает группы: если несколько уроков идут в одно время, он пометит слот
              «класс делится на N группы» и перечислит каждый вариант — предмет, кабинет, учителя.
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">Команда</TableHead>
                  <TableHead>Что делает</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BOT_COMMANDS.map((c) => (
                  <TableRow key={c.cmd}>
                    <TableCell className="whitespace-nowrap font-mono text-[13px] font-semibold text-primary">
                      {c.cmd}
                      {c.args ? <span className="font-normal text-muted-foreground"> {c.args}</span> : null}
                    </TableCell>
                    <TableCell className="text-[13px]">{c.desc}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Separator className="my-4" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Примеры: <Kbd>/menu 01.09.2026</Kbd> — меню на дату, <Kbd>/schedule 10-2</Kbd> —
            расписание класса 10-2, <Kbd>/tomorrow</Kbd> — расписание на завтра.
          </p>
        </SectionCard>

        <SectionCard title="Как подключить бота (для администратора)" icon={<ShieldCheck className="h-4 w-4" />}>
          <ol className="space-y-3.5">
            <Step n={1} title="Создайте бота у @BotFather" text={<>В Telegram напишите @BotFather команду <Kbd>/newbot</Kbd>, следуйте инструкциям и скопируйте токен.</>} />
            <Step
              n={2}
              title="Запустите сервис с токеном"
              text={
                <code className="block break-words rounded-lg bg-muted p-2.5 font-mono text-[11px] leading-relaxed">
{`cd mini-services/tg-bot
TELEGRAM_BOT_TOKEN=ваш_токен bun run dev`}
                </code>
              }
            />
            <Step n={3} title="Готово" text="Бот ответит на /start. Подробности — в mini-services/tg-bot/README.md." />
          </ol>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Пример для мероприятий: <Kbd>/events</Kbd> — ближайшие для всех, <Kbd>/events 10-1</Kbd> —
            только ваш класс плюс общие (линейки, пробные ЕГЭ).
          </p>
        </SectionCard>
      </Chapter>

      {/* Глава 5. Горячие клавиши и ссылки */}
      <Chapter
        id="guide-hotkeys"
        num={5}
        icon={<Keyboard className="h-5 w-5" />}
        title="Горячие клавиши и ссылки"
        subtitle="Для тех, кто за компьютером: разделы переключаются одной комбинацией, а на любой раздел есть прямая ссылка."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Клавиатура" icon={<Keyboard className="h-4 w-4" />}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Нажмите <Kbd>Alt</Kbd> + номер вкладки — раздел откроется мгновенно. Не работает, если
              фокус в поле ввода (чтобы не мешать печати).
            </p>
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {DEEPLINKS.filter((d) => d.tab !== "document" && d.tab !== "guide").map((d, i) => (
                <div
                  key={d.tab}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate font-medium">{d.desc}</span>
                  <Kbd>Alt+{i + 1}</Kbd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate font-medium">Гайд</span>
                <Kbd>Alt+0</Kbd>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Клавиши соответствуют вкладкам 1–9; Alt+0 — последняя вкладка «Гайд». Раздел
              «Документ» открывается мышкой или ссылкой ?tab=document.
            </p>
          </SectionCard>

          <SectionCard title="Прямые ссылки" icon={<Share2 className="h-4 w-4" />}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Добавьте <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">?tab=…</code>{" "}
              к адресу портала — откроется нужный раздел. Удобно для закладок и «Поделиться».
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DEEPLINKS.map((d) => (
                <button
                  key={d.tab}
                  onClick={() => onNavigate(d.tab)}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-secondary/40 px-3 font-mono text-[11px] font-semibold text-muted-foreground outline-none transition-all duration-200 hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  title={`Открыть: ${d.desc}`}
                >
                  {d.tab}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Нажмите на чип — раздел откроется. Ссылку на раздел видно в адресной строке после
              перехода: скопируйте и отправьте однокласснику.
            </p>
          </SectionCard>
        </div>
      </Chapter>

      {/* Глава 6. Администраторам */}
      <Chapter
        id="guide-admin"
        num={6}
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Администраторам"
        subtitle="Разделы «Дежурства» и «Вожатые» наполняются вручную: кто дежит и кто дежурит ночью знает только школа."
      >
        <SectionCard>
          <ul className="space-y-3">
            <FeatureRow icon={<ShieldCheck className="h-4 w-4" />}>
              <span>
                <span className="font-semibold">Панель администратора.</span> В разделах «Дежурства»
                и «Вожатые» нажмите «Админ» — появится форма добавления записи и список на удаление.
              </span>
            </FeatureRow>
            <FeatureRow icon={<Keyboard className="h-4 w-4" />}>
              <span>
                <span className="font-semibold">Ключ.</span> Панель запросит ключ администратора —
                он передаётся серверу в заголовке <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">X-Admin-Key</code>{" "}
                (по умолчанию <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">sunc-admin</code>, меняется
                переменной окружения <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">ADMIN_KEY</code>).
              </span>
            </FeatureRow>
            <FeatureRow icon={<Bot className="h-4 w-4" />}>
              <span>
                <span className="font-semibold">API.</span> Записи можно вносить и скриптом:
              </span>
            </FeatureRow>
          </ul>
          <code className="mt-3 block break-words rounded-lg bg-muted p-2.5 font-mono text-[11px] leading-relaxed">
{`curl -X POST http://localhost:3000/api/duty \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Key: sunc-admin" \\
  -d '{"date":"01.09.2026","dutyType":"Столовая","className":"10-1","responsible":"Иванов И.","timeInterval":"12:00–13:00"}'`}
          </code>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Форма обратной связи в разделе «Инфо» пишет в базу портала без ключа — её может
            использовать любой ученик.
          </p>
        </SectionCard>
      </Chapter>

      {/* Глава 7. FAQ */}
      <Chapter
        id="guide-faq"
        num={7}
        icon={<HelpCircle className="h-5 w-5" />}
        title="Частые вопросы"
        subtitle="Коротко о том, что чаще всего спрашивают."
      >
        <SectionCard contentClassName="pb-3">
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm font-semibold hover:text-primary hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SectionCard>
      </Chapter>

      {/* Финальная карточка */}
      <SectionCard>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="max-w-md space-y-1.5">
            <p className="text-base font-extrabold tracking-tight">Готово — вы всё знаете!</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Загляните в «Столовую» на обед, проверьте «Сейчас в школе» на Главной и поставьте
              портал на телефон, чтобы он всегда был под рукой. Удачной учёбы!
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button
              onClick={() => onNavigate("dashboard")}
              className="h-10 gap-1.5 rounded-xl font-semibold"
            >
              <LayoutDashboard className="h-4 w-4" />
              На главную
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate("canteen")}
              className="h-10 gap-1.5 rounded-xl font-semibold hover:border-primary/40 hover:text-primary"
            >
              <Utensils className="h-4 w-4" />
              Что на обед?
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate("schedule")}
              className="h-10 gap-1.5 rounded-xl font-semibold hover:border-primary/40 hover:text-primary"
            >
              <CalendarDays className="h-4 w-4" />
              Расписание
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
