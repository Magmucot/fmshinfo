"use client";

/**
 * Панель массовых и точечных рассылок Telegram-сообщений «СУНЦ Инфо»
 * - Выбор аудитории: все пользователи, параллель и класс, конкретный ученик
 * - Расчёт количества адресатов в реальном времени
 * - Интерактивный редактор с разметкой Telegram и живой предпросмотр в стиле мессенджера
 * - Защита от случайной отправки с модальным окном подтверждения
 * - Пакетная безопасная отправка с отображением статуса и отчётом
 * - История предыдущих рассылок с подробностями доставки
 */

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Send,
  Users,
  User,
  GraduationCap,
  Pin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  Clock,
  Sparkles,
  MessageSquare,
  Check,
  Search,
  ExternalLink,
  ChevronDown,
  Info,
  ShieldAlert,
} from "lucide-react";
import {
  sendBroadcast,
  useBroadcastHistory,
  useClasses,
  BroadcastPayload,
  BroadcastResult,
  TelegramUserProfile,
  BroadcastHistoryItem,
} from "../api";

interface AdminBroadcastPanelProps {
  adminKey: string;
  recentUsers?: TelegramUserProfile[];
}

/** Простое безопасное форматирование HTML для превью в стиле Telegram */
function renderTelegramHtml(rawText: string) {
  if (!rawText.trim()) {
    return <span className="text-muted-foreground italic">Введите текст для предпросмотра...</span>;
  }

  // Заменяем переносы строк на <br/>
  let formatted = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Восстанавливаем поддерживаемые теги Telegram
  formatted = formatted
    .replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/gi, "<strong>$1</strong>")
    .replace(/&lt;strong&gt;([\s\S]*?)&lt;\/strong&gt;/gi, "<strong>$1</strong>")
    .replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, "<em>$1</em>")
    .replace(/&lt;em&gt;([\s\S]*?)&lt;\/em&gt;/gi, "<em>$1</em>")
    .replace(/&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/gi, "<code class='bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded font-mono text-[11px]'>$1</code>")
    .replace(/&lt;pre&gt;([\s\S]*?)&lt;\/pre&gt;/gi, "<pre class='bg-black/10 dark:bg-white/10 p-2 rounded font-mono text-[11px] overflow-x-auto my-1'>$1</pre>")
    .replace(/&lt;blockquote&gt;([\s\S]*?)&lt;\/blockquote&gt;/gi, "<blockquote class='border-l-2 border-blue-500 pl-2.5 my-1 text-slate-700 dark:text-slate-300 italic'>$1</blockquote>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, "<u>$1</u>")
    .replace(/&lt;s&gt;([\s\S]*?)&lt;\/s&gt;/gi, "<s>$1</s>")
    .replace(/&lt;a href=['"]([\s\S]*?)['"]&gt;([\s\S]*?)&lt;\/a&gt;/gi, (_, href, content) => {
      const trimmed = String(href).trim();
      const safeUrl = /^(?:https?:\/\/|tg:\/\/)/i.test(trimmed) ? trimmed : "#";
      return `<a href='${safeUrl}' target='_blank' rel='noopener noreferrer' class='text-blue-500 hover:underline'>${content}</a>`;
    })
    .replace(/\n/g, "<br/>");

  return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
}

export function AdminBroadcastPanel({ adminKey, recentUsers }: AdminBroadcastPanelProps) {
  const { data: historyData, isLoading: isHistoryLoading, refetch: refetchHistory, isFetching } =
    useBroadcastHistory(adminKey);
  const { data: classesData } = useClasses();

  const [target, setTarget] = useState<"all" | "class" | "user">("all");
  const [selectedParallel, setSelectedParallel] = useState<string>("10");
  const [selectedClass, setSelectedClass] = useState<string>("10-1");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userSearch, setUserSearch] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [pinMessage, setPinMessage] = useState<boolean>(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<BroadcastResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Список классов с группировкой по параллелям
  const allClasses = useMemo(() => {
    if (classesData?.classes && classesData.classes.length > 0) {
      return classesData.classes;
    }
    return [
      "8-1", "8-2", "8-3",
      "9-1", "9-2", "9-3", "9-4", "9-5",
      "10-1", "10-2", "10-3", "10-4", "10-5", "10-6", "10-7", "10-8", "10-9",
      "11-1", "11-2", "11-3", "11-4", "11-5", "11-6", "11-7", "11-8", "11-9", "11-10", "11-11", "11-12",
    ];
  }, [classesData]);

  const classesByParallel = useMemo(() => {
    const map: Record<string, string[]> = { "8": [], "9": [], "10": [], "11": [] };
    for (const c of allClasses) {
      const p = c.split("-")[0];
      if (map[p]) map[p].push(c);
      else {
        map[p] = [c];
      }
    }
    return map;
  }, [allClasses]);

  // Статистика аудитории
  const audience = historyData?.audience;
  const history = historyData?.history ?? [];

  // Подсчёт количества адресатов в реальном времени
  const recipientCount = useMemo(() => {
    if (target === "all") {
      return audience?.totalUsers ?? recentUsers?.length ?? 0;
    }
    if (target === "class") {
      if (!selectedClass) return 0;
      return audience?.byClass?.[selectedClass] ?? 0;
    }
    if (target === "user") {
      return selectedUserId.trim() && /^\d+$/.test(selectedUserId.trim()) ? 1 : 0;
    }
    return 0;
  }, [target, selectedClass, selectedUserId, audience, recentUsers]);

  // Фильтрация пользователей для выбора таргета "Конкретный пользователь"
  const filteredCandidateUsers = useMemo(() => {
    if (!recentUsers) return [];
    if (!userSearch.trim()) return recentUsers.slice(0, 8);
    const q = userSearch.toLowerCase().trim().replace(/^@/, "");
    return recentUsers
      .filter((u) => {
        const uId = String(u.id);
        const uName = (u.username ?? "").toLowerCase();
        const fName = (u.firstName ?? "").toLowerCase();
        const cName = (u.className ?? "").toLowerCase();
        return uId.includes(q) || uName.includes(q) || fName.includes(q) || cName.includes(q);
      })
      .slice(0, 10);
  }, [recentUsers, userSearch]);

  // Вставка форматирующих тегов в текстовое поле
  const insertTag = (openTag: string, closeTag: string) => {
    setText((prev) => `${prev}${openTag}текст${closeTag}`);
  };

  // Шаблоны сообщений
  const applyTemplate = (tpl: string) => {
    switch (tpl) {
      case "schedule":
        setText(
          "📅 <b>Изменение в расписании занятий</b>\n\n" +
            "Уважаемые ученики! Обратите внимание на актуальные изменения в сетке уроков на сегодня:\n" +
            "• Вместо 2-й пары — физика (ауд. 204)\n" +
            "• Спецкурсы проводятся по штатному расписанию.\n\n" +
            "Подробное расписание доступно по кнопке <b>«Расписание»</b>."
        );
        break;
      case "canteen":
        setText(
          "🍽 <b>Объявление столовой СУНЦ</b>\n\n" +
            "Сегодня обед для 1-й смены начинается в <b>13:20</b>, для 2-й смены — в <b>14:15</b>.\n" +
            "Не забудьте ознакомиться со свежим меню на сегодня в боте!"
        );
        break;
      case "general":
        setText(
          "📢 <b>Общешкольное объявление</b>\n\n" +
            "Вниманию всех учащихся и воспитателей!\n" +
            "Сегодня в 17:00 в актовом зале состоится общее собрание.\n\n" +
            "Явка старост классов строго обязательна."
        );
        break;
      case "urgent":
        setText(
          "⚠️ <b>СРОЧНОЕ УВЕДОМЛЕНИЕ</b>\n\n" +
            "Внимание! Просим всех оставаться в учебных корпусах до особого распоряжения дежурного администратора."
        );
        setPinMessage(true);
        break;
    }
  };

  // Отправка рассылки
  const handleExecuteSend = async () => {
    setIsConfirmOpen(false);
    setIsSending(true);
    setSendResult(null);
    setSendError(null);

    const payload: BroadcastPayload = {
      target,
      targetClass: target === "class" ? selectedClass : undefined,
      targetUserId: target === "user" ? selectedUserId.trim() : undefined,
      text: text.trim(),
      pinMessage,
      parseMode: "HTML",
    };

    try {
      const res = await sendBroadcast(payload, adminKey);
      setSendResult(res);
      refetchHistory();
    } catch (err) {
      setSendError((err as Error).message || "Ошибка отправки рассылки");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Верхний баннер раздела */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/20">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-500" />
            Рассылка сообщений от имени Telegram-бота
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Отправляйте объявления, изменения расписания или срочные оповещения всей школе, выбранному классу или отдельному ученику.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-background/80 text-xs px-3 py-1 font-mono">
            👥 В базе бота: <strong className="ml-1 text-foreground">{audience?.totalUsers ?? 0}</strong>
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetchHistory()}
            disabled={isFetching}
            className="h-8 w-8 p-0 rounded-xl"
            title="Обновить историю и статистику"
          >
            <RotateCw className={`h-4 w-4 ${isFetching ? "animate-spin text-blue-500" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Результат предыдущей отправки */}
      {sendResult && (
        <div
          className={`p-4 rounded-2xl border ${
            sendResult.status === "completed"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100"
              : sendResult.status === "partial"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100"
              : "bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-100"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {sendResult.status === "completed" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : sendResult.status === "partial" ? (
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              )}
              <div>
                <h4 className="font-semibold text-sm">
                  {sendResult.status === "completed"
                    ? "Рассылка успешно завершена!"
                    : sendResult.status === "partial"
                    ? "Рассылка завершена с частичными ошибками"
                    : "Не удалось доставить сообщения"}
                </h4>
                <div className="text-xs mt-1 flex flex-wrap gap-x-4 gap-y-1 opacity-90">
                  <span>
                    Доставлено: <strong>{sendResult.sent}</strong> из {sendResult.total}
                  </span>
                  {sendResult.blocked > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      Заблокировали бота: <strong>{sendResult.blocked}</strong>
                    </span>
                  )}
                  {sendResult.failed - sendResult.blocked > 0 && (
                    <span>
                      Другие ошибки: <strong>{sendResult.failed - sendResult.blocked}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 rounded-lg"
              onClick={() => setSendResult(null)}
            >
              Скрыть
            </Button>
          </div>
        </div>
      )}

      {sendError && (
        <div className="p-4 rounded-2xl border bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="text-xs">
              <strong className="font-semibold">Ошибка отправки:</strong> {sendError}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 rounded-lg"
            onClick={() => setSendError(null)}
          >
            Закрыть
          </Button>
        </div>
      )}

      {/* Основная рабочая область: Форма + Живой предпросмотр */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Левая колонка: Настройка аудитории и ввод текста */}
        <div className="lg:col-span-7 space-y-5">
          {/* Блок 1: Выбор целевой аудитории */}
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                1. Целевая аудитория
              </label>
              <Badge
                variant="secondary"
                className="font-mono text-xs px-2.5 py-0.5 bg-blue-500/15 text-blue-700 dark:text-blue-300"
              >
                Адресатов: <strong>{recipientCount}</strong>
              </Badge>
            </div>

            {/* Тип таргетинга */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTarget("all")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                  target === "all"
                    ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold shadow-xs"
                    : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <Users className="h-4 w-4 mb-1" />
                <span>Все пользователи</span>
                <span className="text-[10px] opacity-75 font-mono">({audience?.totalUsers ?? 0})</span>
              </button>

              <button
                type="button"
                onClick={() => setTarget("class")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                  target === "class"
                    ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold shadow-xs"
                    : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <GraduationCap className="h-4 w-4 mb-1" />
                <span>Класс школы</span>
                <span className="text-[10px] opacity-75 font-mono">({selectedClass})</span>
              </button>

              <button
                type="button"
                onClick={() => setTarget("user")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                  target === "user"
                    ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold shadow-xs"
                    : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <User className="h-4 w-4 mb-1" />
                <span>Конкретный ученик</span>
                <span className="text-[10px] opacity-75 font-mono">по ID</span>
              </button>
            </div>

            {/* Селектор класса при target === 'class' */}
            {target === "class" && (
              <div className="space-y-2.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Выберите параллель и класс:</span>
                  <span className="font-mono font-medium text-foreground">
                    В классе {selectedClass}: <strong>{audience?.byClass?.[selectedClass] ?? 0} чел.</strong>
                  </span>
                </div>

                {/* Табы параллелей 8, 9, 10, 11 */}
                <div className="flex gap-1.5 border-b pb-2">
                  {["8", "9", "10", "11"].map((grade) => (
                    <Button
                      key={grade}
                      type="button"
                      size="sm"
                      variant={selectedParallel === grade ? "default" : "outline"}
                      onClick={() => {
                        setSelectedParallel(grade);
                        const firstInGrade = classesByParallel[grade]?.[0];
                        if (firstInGrade) setSelectedClass(firstInGrade);
                      }}
                      className="h-7 text-xs px-3 rounded-lg"
                    >
                      {grade} класс
                      <span className="ml-1 text-[10px] opacity-70">
                        ({audience?.byGrade?.[grade] ?? 0})
                      </span>
                    </Button>
                  ))}
                </div>

                {/* Сетка классов выбранной параллели */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(classesByParallel[selectedParallel] || []).map((cls) => {
                    const countInCls = audience?.byClass?.[cls] ?? 0;
                    const isSelected = selectedClass === cls;
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => setSelectedClass(cls)}
                        className={`px-2.5 py-1 text-xs rounded-lg border font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                            : "bg-background text-foreground border-border hover:bg-muted/50"
                        }`}
                      >
                        <span>{cls}</span>
                        <span
                          className={`text-[10px] px-1 rounded ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : countInCls > 0
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {countInCls}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Выбор пользователя при target === 'user' */}
            {target === "user" && (
              <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">
                    Telegram User ID получателя:
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Например: 1573047506"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value.replace(/\D/g, ""))}
                      className="h-8 text-xs font-mono rounded-lg"
                    />
                    {selectedUserId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedUserId("")}
                        className="h-8 px-2 text-xs"
                      >
                        Очистить
                      </Button>
                    )}
                  </div>
                </div>

                {/* Быстрый выбор из реестра учеников */}
                {recentUsers && recentUsers.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Или выберите из активных учеников:</span>
                      <Input
                        type="text"
                        placeholder="Фильтр по имени / @юзернейму..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="h-6 w-44 text-[10px] px-2 rounded-md"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {filteredCandidateUsers.map((u) => {
                        const isChosen = selectedUserId === String(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => setSelectedUserId(String(u.id))}
                            className={`p-1.5 px-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                              isChosen
                                ? "bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300 font-semibold"
                                : "hover:bg-muted/60 border-border/40"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="truncate">
                                {u.firstName || u.username || "Без имени"}
                              </span>
                              {u.username && (
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  @{u.username}
                                </span>
                              )}
                              {u.className && (
                                <Badge variant="secondary" className="text-[9px] px-1 h-4">
                                  {u.className}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground ml-2">
                              ID: {u.id}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Блок 2: Текст сообщения и опции */}
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                2. Текст сообщения (Telegram HTML)
              </label>
              <span
                className={`text-[11px] font-mono ${
                  text.length > 4000 ? "text-red-500 font-bold" : "text-muted-foreground"
                }`}
              >
                {text.length} / 4096 симв.
              </span>
            </div>

            {/* Шаблоны сообщений */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Шаблоны:
              </span>
              <button
                type="button"
                onClick={() => applyTemplate("general")}
                className="text-[11px] px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-foreground cursor-pointer transition-colors"
              >
                📢 Объявление
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("schedule")}
                className="text-[11px] px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-foreground cursor-pointer transition-colors"
              >
                📅 Расписание
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("canteen")}
                className="text-[11px] px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-foreground cursor-pointer transition-colors"
              >
                🍽 Столовая
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("urgent")}
                className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 cursor-pointer transition-colors"
              >
                ⚠️ Срочно
              </button>
            </div>

            {/* Панель быстрых тегов HTML */}
            <div className="flex items-center gap-1 border-b pb-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground mr-1">Формат:</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] font-bold rounded"
                onClick={() => insertTag("<b>", "</b>")}
                title="Жирный шрифт"
              >
                <b>B</b>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] italic rounded"
                onClick={() => insertTag("<i>", "</i>")}
                title="Курсив"
              >
                <i>I</i>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] font-mono rounded"
                onClick={() => insertTag("<code>", "</code>")}
                title="Моноширинный код"
              >
                {"</>"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] rounded"
                onClick={() => insertTag("<blockquote>", "</blockquote>")}
                title="Цитата"
              >
                &ldquo;Цитата&rdquo;
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] rounded"
                onClick={() => insertTag('<a href="https://...">', "</a>")}
                title="Ссылка"
              >
                Ссылка
              </Button>
            </div>

            {/* Текстовое поле ввода */}
            <Textarea
              rows={8}
              placeholder="Введите текст сообщения... Поддерживается HTML-разметка Telegram (<b>жирный</b>, <i>курсив</i>, <code>код</code>, <blockquote>цитата</blockquote>, <a href='...'>ссылки</a>)."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="text-xs font-sans leading-relaxed resize-y rounded-xl"
            />

            {/* Опция закрепления сообщения */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/40">
              <div className="flex items-center gap-2">
                <Pin className={`h-4 w-4 ${pinMessage ? "text-blue-500 fill-blue-500/20" : "text-muted-foreground"}`} />
                <div>
                  <div className="text-xs font-medium text-foreground">Закрепить сообщение в чате</div>
                  <div className="text-[11px] text-muted-foreground">
                    Бот закрепит отправленное сообщение вверху переписки ученика
                  </div>
                </div>
              </div>
              <Switch checked={pinMessage} onCheckedChange={setPinMessage} />
            </div>

            {/* Кнопка запуска с диалогом подтверждения */}
            <div className="pt-2 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText("");
                  setSendResult(null);
                  setSendError(null);
                }}
                disabled={!text && !sendResult}
                className="text-xs h-9 rounded-xl text-muted-foreground"
              >
                Очистить форму
              </Button>

              <Button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                disabled={!text.trim() || recipientCount === 0 || isSending}
                className="h-9 px-5 rounded-xl text-xs gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md"
              >
                <Send className="h-4 w-4" />
                {isSending ? "Отправка..." : `Отправить рассылку (${recipientCount})`}
              </Button>
            </div>
          </div>
        </div>

        {/* Правая колонка: Интерактивный Telegram-превью */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5 text-blue-500" />
                Живой предпросмотр в Telegram
              </label>
              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                Как увидят ученики
              </Badge>
            </div>

            {/* Имитация окна Telegram */}
            <div className="rounded-2xl border border-border/80 bg-slate-100 dark:bg-zinc-950 p-3 sm:p-4 overflow-hidden relative">
              {/* Шапка чата */}
              <div className="flex items-center gap-2.5 pb-3 border-b border-border/40">
                <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  🎓
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-1">
                    СУНЦ Инфо Бот
                    <span className="text-blue-500 text-[11px]" title="Верифицирован">
                      ✓
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">бот • онлайн</div>
                </div>
              </div>

              {/* Полоса закреплённого сообщения */}
              {pinMessage && (
                <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border-l-2 border-blue-500 flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300">
                  <div className="flex items-center gap-1.5 truncate">
                    <Pin className="h-3 w-3 shrink-0" />
                    <span className="font-semibold truncate">Закреплённое сообщение</span>
                  </div>
                  <span className="text-[9px] opacity-70">Сверху чата</span>
                </div>
              )}

              {/* Пузырь сообщения */}
              <div className="mt-3 max-w-[94%] ml-auto sm:ml-0 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 p-3.5 rounded-2xl rounded-tr-xs shadow-sm border border-border/40 space-y-2">
                <div className="text-xs leading-relaxed break-words font-sans">
                  {renderTelegramHtml(text)}
                </div>

                {/* Время и статус доставки */}
                <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-muted-foreground select-none">
                  <span>
                    {new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-blue-500 font-bold tracking-tighter">✓✓</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground p-2 rounded-xl bg-muted/20 border border-border/30 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
              <span>
                Отправка производится со скоростью ~25 сообщений/сек с автоматической паузой 40 мс между адресатами для предотвращения блокировок Telegram API.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно подтверждения рассылки */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Подтверждение отправки рассылки
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Проверьте параметры перед отправкой. Сообщения будут доставлены реальным пользователям от имени Telegram-бота.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Аудитория:</span>
                <strong className="text-foreground">
                  {target === "all"
                    ? "Все пользователи бота"
                    : target === "class"
                    ? `Класс ${selectedClass}`
                    : `Пользователь ID ${selectedUserId}`}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Количество адресатов:</span>
                <strong className="text-blue-600 dark:text-blue-400 font-mono">
                  {recipientCount} человек
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Закрепление в чате:</span>
                <span>{pinMessage ? "📌 Да (будет закреплено)" : "Нет"}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Фрагмент сообщения:</span>
              <div className="p-2.5 rounded-lg bg-background border text-xs max-h-24 overflow-y-auto font-sans line-clamp-3">
                {text}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmOpen(false)}
              className="text-xs rounded-xl"
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleExecuteSend}
              className="text-xs rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Да, отправить {recipientCount} пользователям
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Блок 3: История предыдущих рассылок */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-500" />
            История предыдущих рассылок
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Всего в архиве: <strong className="text-foreground">{history.length}</strong>
          </span>
        </div>

        {isHistoryLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Загрузка журнала рассылок...
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground border rounded-xl border-dashed">
            Рассылки пока не производились. Создайте первое объявление выше.
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-mono px-1.5 h-5 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    >
                      {item.target === "all"
                        ? "📢 Всем"
                        : item.target === "class"
                        ? `🏫 Класс ${item.targetClass}`
                        : `👤 ID ${item.targetUserId}`}
                    </Badge>

                    {item.pinMessage && (
                      <Badge variant="outline" className="text-[10px] px-1 h-5 text-blue-600 gap-0.5">
                        <Pin className="h-2.5 w-2.5" />
                        Закреп
                      </Badge>
                    )}

                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 h-5 font-mono ${
                        item.status === "completed"
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                          : item.status === "partial"
                          ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                          : "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5"
                      }`}
                    >
                      {item.sent} / {item.total} доставлено
                      {item.blocked > 0 && ` (${item.blocked} блк)`}
                    </Badge>
                  </div>

                  <span className="text-[11px] font-mono text-muted-foreground">
                    {item.timestampNsk || item.timestamp}
                  </span>
                </div>

                {/* Превью текста рассылки */}
                <div className="text-xs text-muted-foreground line-clamp-2 font-sans bg-background/50 p-2 rounded-lg border border-border/30">
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
