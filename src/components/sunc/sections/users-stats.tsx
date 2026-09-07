"use client";

/**
 * Раздел аналитики и учёта пользователей «СУНЦ Инфо»
 * - Сопоставление ID, Telegram username (@юзу), имени, выбранного класса и действий
 * - Метрики популярности по параллелям (8..11) и классам
 * - Динамическая панель администратора с поиском и фильтрацией
 */

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Users, ShieldCheck, Search, RefreshCw, Key, ExternalLink,
  Award, Clock, Activity, MessageSquare, CheckCircle2, Lock,
  Terminal, FileText, Copy, Check,
} from "lucide-react";
import { useUsersStats, useAdminLogs } from "../api";
import { SectionCard, LoadingBlock, ErrorCard } from "../shared";

export function UsersStatsSection() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [submittedKey, setSubmittedKey] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [adminSubTab, setAdminSubTab] = useState<"users" | "logs">("users");

  const { data, isLoading, isError, refetch, isFetching } = useUsersStats(submittedKey);

  const bot = data?.bot;
  const web = data?.web;
  const isAdmin = data?.isAdmin ?? false;

  const totalUsers = bot?.totalUsers ?? 0;
  const activeToday = bot?.activeToday ?? 0;
  const withClassCount = bot?.withClassCount ?? 0;
  const totalVisitors = web?.totalVisitors ?? 0;

  const recentUsers = bot?.recentUsers;

  // Фильтрация пользователей для администратора
  const filteredUsers = useMemo(() => {
    if (!recentUsers) return [];
    let list = [...recentUsers];

    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/^@/, "");
      list = list.filter((u) => {
        const uname = (u.username ?? "").toLowerCase();
        const fname = (u.firstName ?? "").toLowerCase();
        const idStr = String(u.id);
        const cls = (u.className ?? "").toLowerCase();
        return uname.includes(q) || fname.includes(q) || idStr.includes(q) || cls.includes(q);
      });
    }

    if (selectedGrade !== "all") {
      list = list.filter((u) => u.className?.startsWith(`${selectedGrade}-`));
    }

    if (selectedClass !== "all") {
      list = list.filter((u) => u.className === selectedClass);
    }

    return list;
  }, [recentUsers, search, selectedGrade, selectedClass]);

  const handleAdminKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedKey(adminKey.trim());
  };

  if (isLoading) {
    return <LoadingBlock lines={6} />;
  }

  if (isError || !bot) {
    return (
      <ErrorCard
        message="Не удалось загрузить аналитику пользователей"
        onRetry={() => refetch()}
      />
    );
  }

  const grades = [
    { grade: "11", label: "11-е классы", count: bot.byGrade["11"] ?? 0, color: "bg-blue-500" },
    { grade: "10", label: "10-е классы", count: bot.byGrade["10"] ?? 0, color: "bg-emerald-500" },
    { grade: "9", label: "9-е классы", count: bot.byGrade["9"] ?? 0, color: "bg-amber-500" },
    { grade: "8", label: "8-е классы", count: bot.byGrade["8"] ?? 0, color: "bg-purple-500" },
  ];

  const maxGradeCount = Math.max(...grades.map((g) => g.count), 1);

  return (
    <div className="space-y-6">
      {/* Шапка раздела */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Аудитория и учёт пользователей</h2>
          <p className="text-sm text-muted-foreground">
            Статистика Telegram-бота СУНЦ Инфо (@fmshinfobot) и популярность классов
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 rounded-xl"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      {/* Ключевые метрики в Bento Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SectionCard className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Users className="h-4 w-4 text-blue-500" />
            Всего в боте
          </div>
          <div className="mt-2 text-3xl font-black">{totalUsers}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">студентов и преподавателей</div>
        </SectionCard>

        <SectionCard className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Activity className="h-4 w-4 text-emerald-500" />
            Активны за 24 ч
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {activeToday}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            заходили сегодня в бот
          </div>
        </SectionCard>

        <SectionCard className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Award className="h-4 w-4 text-amber-500" />
            Выбрали класс
          </div>
          <div className="mt-2 text-3xl font-black text-amber-600 dark:text-amber-400">
            {withClassCount}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {totalUsers > 0 ? `${Math.round((withClassCount / totalUsers) * 100)}% от всех пользователей` : "—"}
          </div>
        </SectionCard>

        <SectionCard className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            На веб-портале
          </div>
          <div className="mt-2 text-3xl font-black">{totalVisitors}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">устройств с сайта</div>
        </SectionCard>
      </div>

      {/* Популярность по параллелям */}
      <SectionCard className="p-5">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Award className="h-5 w-5 text-amber-500" />
          Распределение учеников по параллелям
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Сколько учащихся из каждой параллели используют персональное расписание
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {grades.map((g) => {
            const pct = maxGradeCount > 0 ? Math.round((g.count / maxGradeCount) * 100) : 0;
            return (
              <div
                key={g.grade}
                className="flex flex-col justify-between rounded-xl border bg-card/60 p-3 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{g.label}</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {g.count} чел.
                  </Badge>
                </div>
                <div className="mt-3">
                  <Progress value={pct} className="h-2" />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Топ классов по числу пользователей */}
      <SectionCard className="p-5">
        <h3 className="flex items-center gap-2 text-base font-bold">
          🏆 Популярность по классам
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Классы с наибольшим количеством подключенных учеников
        </p>

        {bot.topClasses && bot.topClasses.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {bot.topClasses.map((item, idx) => {
              const isFirst = idx === 0;
              return (
                <div
                  key={item.className}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-all ${
                    isFirst
                      ? "border-amber-500/40 bg-amber-500/10 font-bold text-amber-700 dark:text-amber-300"
                      : "bg-card hover:bg-accent/50"
                  }`}
                >
                  <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                  <span>{item.className}</span>
                  <Badge variant="outline" className="ml-1 h-5 px-1.5 font-mono text-[11px]">
                    {item.count} уч.
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Данные по классам ещё накапливаются
          </div>
        )}
      </SectionCard>

      {/* Панель администратора / Таблица пользователей */}
      <SectionCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Реестр пользователей бота
              {isAdmin && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                  Режим администратора
                </Badge>
              )}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isAdmin
                ? "Полный список пользователей со сопоставлением ID, юзернейма (@юзу), класса и активности"
                : "Для просмотра персональных данных (Telegram ID, @username) требуется ключ администратора"}
            </p>
          </div>

          {!isAdmin && (
            <form onSubmit={handleAdminKeySubmit} className="flex items-center gap-2">
              <div className="relative">
                <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Ключ админа (ADMIN_KEY)..."
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  className="w-52 pl-8 h-9 text-xs rounded-xl"
                />
              </div>
              <Button type="submit" size="sm" className="h-9 rounded-xl gap-1">
                Войти
              </Button>
            </form>
          )}
        </div>

        {isAdmin ? (
          <div className="mt-5 space-y-4">
            {/* Переключатель разделов админа */}
            <div className="flex items-center gap-2 border-b pb-3">
              <Button
                size="sm"
                variant={adminSubTab === "users" ? "default" : "outline"}
                onClick={() => setAdminSubTab("users")}
                className="gap-1.5 h-8 text-xs rounded-xl"
              >
                <Users className="h-3.5 w-3.5" />
                Реестр учеников ({filteredUsers.length})
              </Button>
              <Button
                size="sm"
                variant={adminSubTab === "logs" ? "default" : "outline"}
                onClick={() => setAdminSubTab("logs")}
                className="gap-1.5 h-8 text-xs rounded-xl"
              >
                <Terminal className="h-3.5 w-3.5" />
                Консоль логов (logs/*.log)
              </Button>
            </div>

            {adminSubTab === "logs" ? (
              <AdminLogsConsole adminKey={submittedKey} />
            ) : (
              <div className="space-y-4">
                {/* Поиск и фильтры */}
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Поиск по @юзернейму, имени, классу или ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={selectedGrade === "all" ? "default" : "outline"}
                      onClick={() => setSelectedGrade("all")}
                      className="h-9 text-xs rounded-xl"
                    >
                      Все классы
                    </Button>
                    {["10", "11", "9", "8"].map((gr) => (
                      <Button
                        key={gr}
                        size="sm"
                        variant={selectedGrade === gr ? "default" : "outline"}
                        onClick={() => setSelectedGrade(gr)}
                        className="h-9 text-xs rounded-xl"
                      >
                        {gr} кл.
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Таблица пользователей */}
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/50 font-medium text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5">Пользователь</th>
                        <th className="px-3 py-2.5">Telegram ID</th>
                        <th className="px-3 py-2.5">Класс</th>
                        <th className="px-3 py-2.5 text-center">Запросов</th>
                        <th className="px-3 py-2.5">Последнее действие</th>
                        <th className="px-3 py-2.5 text-right">Последний визит</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((u) => {
                          const uLink = u.username ? `https://t.me/${u.username}` : null;
                          const dateObj = new Date(u.lastActiveAt);
                          const timeStr = dateObj.toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          const dateStr = dateObj.toLocaleDateString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                          });

                          return (
                            <tr key={u.id} className="hover:bg-accent/40 transition-colors">
                              <td className="px-3 py-2.5 font-medium">
                                <div className="flex items-center gap-1.5">
                                  {uLink ? (
                                    <a
                                      href={uLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                                    >
                                      @{u.username}
                                      <ExternalLink className="h-3 w-3 opacity-60" />
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      {u.firstName || "—"}
                                    </span>
                                  )}
                                  {u.firstName && u.username && (
                                    <span className="text-muted-foreground text-[11px]">
                                      ({u.firstName})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-muted-foreground">
                                {u.id}
                              </td>
                              <td className="px-3 py-2.5">
                                {u.className ? (
                                  <Badge variant="outline" className="font-semibold text-xs">
                                    {u.className}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground italic">не выбран</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono">
                                {u.actionsCount}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground">
                                <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">
                                  {u.lastAction || "—"}
                                </code>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                                {dateStr} {timeStr}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                            Пользователи по заданным критериям не найдены
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>Показано: {filteredUsers.length} из {bot.recentUsers?.length ?? 0}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSubmittedKey("");
                      setAdminKey("");
                    }}
                    className="text-xs h-7"
                  >
                    <Lock className="h-3 w-3 mr-1" />
                    Выйти из режима админа
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed p-6 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Список пользователей и логи защищены</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                В целях конфиденциальности студентов СУНЦ НГУ прямой доступ к Telegram ID, юзернеймам и системным журналам доступен только администраторам. Введите ключ администратора выше или воспользуйтесь бот-командами <code>/stats</code> и <code>/logs</code>.
              </p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/** Интерактивная консоль просмотра журналов логов */
function AdminLogsConsole({ adminKey }: { adminKey: string }) {
  const [file, setFile] = useState<"bot" | "portal" | "audit">("bot");
  const [level, setLevel] = useState<string>("ALL");
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useAdminLogs(adminKey, file, level);

  const lines = data?.lines ?? [];

  const handleCopy = () => {
    if (!lines.length) return;
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileLabels: Record<string, string> = {
    bot: "logs/bot.log (Telegram-бот)",
    portal: "logs/portal.log (Сервер Next.js / API)",
    audit: "logs/audit.log (Аудит действий)",
  };

  return (
    <div className="space-y-3 pt-1">
      {/* Селекторы файла логов и уровней */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 rounded-xl border bg-muted/30 p-1">
          {(["bot", "portal", "audit"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={file === f ? "default" : "ghost"}
              onClick={() => setFile(f)}
              className="h-7 px-2.5 text-xs rounded-lg"
            >
              {f === "bot" ? "Telegram-бот" : f === "portal" ? "Сервер/API" : "Аудит"}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-1">
            {["ALL", "AUDIT", "ERROR", "WARN", "INFO"].map((lvl) => (
              <Button
                key={lvl}
                size="sm"
                variant={level === lvl ? "secondary" : "ghost"}
                onClick={() => setLevel(lvl)}
                className={`h-7 px-2 text-[11px] rounded-lg ${
                  lvl === "ERROR" && level === lvl
                    ? "text-red-500 font-bold"
                    : lvl === "AUDIT" && level === lvl
                    ? "text-purple-500 font-bold"
                    : ""
                }`}
              >
                {lvl === "ALL" ? "Все" : lvl}
              </Button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!lines.length}
            className="h-8 gap-1 text-xs rounded-xl"
            title="Скопировать логи"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Скопировано" : "Копия"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 w-8 p-0 rounded-xl"
            title="Обновить журнал"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Терминальное окно логов */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-[12px] text-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-300">{fileLabels[file]}</span>
            <span>· {data?.count ?? 0} строк</span>
          </div>
          <span className="text-[10px] text-slate-500">Автообновление каждые 6 сек</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Загрузка журнала логов...</div>
        ) : isError ? (
          <div className="py-12 text-center text-rose-400">Ошибка чтения файла логов</div>
        ) : lines.length === 0 ? (
          <div className="py-12 text-center text-slate-500">Записей пока нет или они отфильтрованы</div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto space-y-1 pr-2 select-text">
            {lines.map((l, i) => {
              const isError = l.includes("[ERROR]");
              const isWarn = l.includes("[WARN]");
              const isAudit = l.includes("[AUDIT]");
              const isDebug = l.includes("[DEBUG]");

              const lineClass = isError
                ? "text-rose-400 font-semibold bg-rose-500/10 px-1.5 py-0.5 rounded"
                : isWarn
                ? "text-amber-300"
                : isAudit
                ? "text-purple-300"
                : isDebug
                ? "text-slate-500"
                : "text-slate-300";

              return (
                <div key={i} className={`leading-relaxed break-all ${lineClass}`}>
                  {l}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
