"use client";

/**
 * Раздел аналитики и учёта пользователей «СУНЦ Инфо»
 * - Публичная сводка: распределение по параллелям (8..11) и популярность классов
 * - Защищённая панель администратора: реестр учеников с детальным просмотром профиля
 * - Интерактивная консоль системных журналов и аудита с временем (NSK), поиском и экспортом
 */

import { useState, useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Users, ShieldCheck, Search, RefreshCw, Key, ExternalLink,
  Award, Clock, Activity, MessageSquare, CheckCircle2, Lock,
  Terminal, FileText, Copy, Check, Eye, User, Sparkles,
  Download, Pause, Play, AlertCircle, AlertTriangle, Info,
  Bug, ChevronRight, X, ArrowUpDown, Filter, Cpu, Server, HardDrive,
  Trash2, Inbox
} from "lucide-react";
import {
  useUsersStats,
  useAdminLogs,
  useSystemMetrics,
  useFeedbackList,
  deleteFeedback,
  clearAllFeedback,
  FeedbackItem,
  TelegramUserProfile,
  ParsedLogEntry,
} from "../api";
import { SectionCard, LoadingBlock, ErrorCard } from "../shared";

/** Форматирование времени по Новосибирску и относительного времени */
function formatDateTimeNsk(dateStr?: string | Date | null): {
  date: string;
  time: string;
  full: string;
  relative: string;
} {
  if (!dateStr) return { date: "—", time: "—", full: "—", relative: "—" };
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return { date: "—", time: "—", full: "—", relative: "—" };

  const dateFormatted = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFormatted = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const full = `${dateFormatted} ${timeFormatted}`;

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  let relative = "только что";
  if (diffDays > 0) {
    relative = `${diffDays} дн. назад`;
  } else if (diffHrs > 0) {
    relative = `${diffHrs} ч. назад`;
  } else if (diffMin > 0) {
    relative = `${diffMin} мин. назад`;
  } else if (diffSec > 10) {
    relative = `${diffSec} сек. назад`;
  }

  return { date: dateFormatted, time: timeFormatted, full, relative };
}

export function UsersStatsSection() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [submittedKey, setSubmittedKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("sunc_admin_key") || "";
    }
    return "";
  });

  const [search, setSearch] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedSubgroup, setSelectedSubgroup] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"active" | "actions" | "class" | "name">("active");

  const [adminSubTab, setAdminSubTab] = useState<"users" | "logs" | "reports">("users");
  const [selectedUser, setSelectedUser] = useState<TelegramUserProfile | null>(null);
  const [logInitialSearch, setLogInitialSearch] = useState<string>("");

  const { data, isLoading, isError, refetch, isFetching } = useUsersStats(submittedKey);

  const bot = data?.bot;
  const web = data?.web;
  const isAdmin = data?.isAdmin ?? false;

  const {
    data: feedbackData,
    refetch: refetchReports,
    isFetching: isFetchingReports,
  } = useFeedbackList(submittedKey, isAdmin);
  const reports = feedbackData?.items ?? [];

  const totalUsers = bot?.totalUsers ?? 0;
  const activeToday = bot?.activeToday ?? 0;
  const withClassCount = bot?.withClassCount ?? 0;
  const totalVisitors = web?.totalVisitors ?? 0;

  const recentUsers = bot?.recentUsers;

  // Сохранение ключа в sessionStorage при успешной авторизации
  useEffect(() => {
    if (isAdmin && submittedKey && typeof window !== "undefined") {
      sessionStorage.setItem("sunc_admin_key", submittedKey);
    }
  }, [isAdmin, submittedKey]);

  // Фильтрация и сортировка пользователей
  const filteredUsers = useMemo(() => {
    if (!recentUsers) return [];
    let list = [...recentUsers];

    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/^@/, "");
      list = list.filter((u) => {
        const uname = (u.username ?? "").toLowerCase();
        const fname = (u.firstName ?? "").toLowerCase();
        const lname = (u.lastName ?? "").toLowerCase();
        const idStr = String(u.id);
        const cls = (u.className ?? "").toLowerCase();
        const eng = (u.englishGroup ?? "").toLowerCase();
        const act = (u.lastAction ?? "").toLowerCase();
        return (
          uname.includes(q) ||
          fname.includes(q) ||
          lname.includes(q) ||
          idStr.includes(q) ||
          cls.includes(q) ||
          eng.includes(q) ||
          act.includes(q)
        );
      });
    }

    if (selectedGrade !== "all") {
      list = list.filter((u) => u.className?.startsWith(`${selectedGrade}-`));
    }

    if (selectedSubgroup === "1") {
      list = list.filter((u) => u.subgroup === 1);
    } else if (selectedSubgroup === "2") {
      list = list.filter((u) => u.subgroup === 2);
    } else if (selectedSubgroup === "none") {
      list = list.filter((u) => !u.subgroup);
    }

    // Сортировка
    list.sort((a, b) => {
      if (sortBy === "active") {
        return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
      }
      if (sortBy === "actions") {
        return b.actionsCount - a.actionsCount;
      }
      if (sortBy === "class") {
        return (a.className ?? "").localeCompare(b.className ?? "");
      }
      if (sortBy === "name") {
        const nameA = a.firstName || a.username || a.id;
        const nameB = b.firstName || b.username || b.id;
        return nameA.localeCompare(nameB);
      }
      return 0;
    });

    return list;
  }, [recentUsers, search, selectedGrade, selectedSubgroup, sortBy]);

  const handleAdminKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = adminKey.trim();
    if (!clean) return;
    setSubmittedKey(clean);
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("sunc_admin_key");
    }
    setSubmittedKey("");
    setAdminKey("");
    setSelectedUser(null);
  };

  const handleViewUserLogs = (user: TelegramUserProfile) => {
    setSelectedUser(null);
    setAdminSubTab("logs");
    setLogInitialSearch(user.username ? `@${user.username}` : user.id);
  };

  if (isLoading && !data) {
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
  const isAuthFailed = Boolean(submittedKey && !isAdmin && !isLoading);

  return (
    <div className="space-y-6">
      {/* Шапка раздела */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Аудитория и панель управления</h2>
          <p className="text-sm text-muted-foreground">
            Статистика Telegram-бота (@fmshinfobot), активность классов и защищённый аудит
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data?.requestedAt && (
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground border border-border/50">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>Время запроса:</span>
              <span className="font-mono font-medium text-foreground">{data.requestedAt}</span>
            </div>
          )}
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
            {bot.bySubgroup && (bot.bySubgroup["1"] > 0 || bot.bySubgroup["2"] > 0)
              ? `1-я подгр: ${bot.bySubgroup["1"]} · 2-я: ${bot.bySubgroup["2"]}`
              : totalUsers > 0
              ? `${Math.round((withClassCount / totalUsers) * 100)}% от пользователей`
              : "—"}
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

      {/* Защищённая панель администратора */}
      <SectionCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-bold">Панель администратора</h3>
              {isAdmin ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Сессия активна
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground border-dashed">
                  Требуется авторизация
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdmin
                ? "Управление аудиторией бота, детальный просмотр профилей учеников и системный журнал событий"
                : "В целях конфиденциальности студентов Telegram ID, имена, контакты и журналы логов защищены ключом ADMIN_KEY"}
            </p>
          </div>

          {!isAdmin ? (
            <form onSubmit={handleAdminKeySubmit} className="flex items-center gap-2">
              <div className="relative">
                <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Ключ админа (ADMIN_KEY)..."
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  className="w-56 pl-8 h-9 text-xs rounded-xl"
                />
              </div>
              <Button type="submit" size="sm" className="h-9 rounded-xl gap-1">
                Войти
              </Button>
            </form>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-8 text-xs rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" />
              Выйти из режима админа
            </Button>
          )}
        </div>

        {/* Сообщение об ошибке авторизации */}
        {isAuthFailed && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
              <span>
                Неверный ключ администратора или доступ заблокирован системой защиты от подбора.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSubmittedKey("");
                setAdminKey("");
              }}
              className="h-6 px-2 text-[11px] text-rose-600 hover:bg-rose-500/20"
            >
              Попробовать снова
            </Button>
          </div>
        )}

        {isAdmin ? (
          <div className="mt-5 space-y-4">
            {/* Виджет нагрузки на сервер (ОЗУ, CPU, Uptime) */}
            <ServerHealthMonitor adminKey={submittedKey} />

            {/* Переключатель вкладок админ-панели */}
            <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
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
                  onClick={() => {
                    setAdminSubTab("logs");
                    setLogInitialSearch("");
                  }}
                  className="gap-1.5 h-8 text-xs rounded-xl"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Консоль логов с временем
                </Button>
                <Button
                  size="sm"
                  variant={adminSubTab === "reports" ? "default" : "outline"}
                  onClick={() => setAdminSubTab("reports")}
                  className="gap-1.5 h-8 text-xs rounded-xl"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                  Репорты и обращения
                  {reports.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-mono bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      {reports.length}
                    </Badge>
                  )}
                </Button>
              </div>

              <div className="text-[11px] text-muted-foreground hidden sm:block">
                Записей в базе: <strong className="text-foreground">{recentUsers?.length ?? 0}</strong>
              </div>
            </div>

            {adminSubTab === "logs" ? (
              <AdminLogsConsole
                adminKey={submittedKey}
                initialSearch={logInitialSearch}
              />
            ) : adminSubTab === "reports" ? (
              <AdminReportsPanel
                adminKey={submittedKey}
                reports={reports}
                refetchReports={refetchReports}
                isFetching={isFetchingReports}
              />
            ) : (
              <div className="space-y-4">
                {/* Панель фильтров реестра */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Поиск по имени, @юзернейму, классу, группе английского, действию или ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9 text-xs rounded-xl"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Параллели */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={selectedGrade === "all" ? "default" : "outline"}
                        onClick={() => setSelectedGrade("all")}
                        className="h-8 text-xs rounded-xl"
                      >
                        Все
                      </Button>
                      {["11", "10", "9", "8"].map((gr) => (
                        <Button
                          key={gr}
                          size="sm"
                          variant={selectedGrade === gr ? "default" : "outline"}
                          onClick={() => setSelectedGrade(gr)}
                          className="h-8 text-xs rounded-xl"
                        >
                          {gr} кл.
                        </Button>
                      ))}
                    </div>

                    {/* Подгруппы */}
                    <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-1">
                      <Button
                        size="sm"
                        variant={selectedSubgroup === "all" ? "secondary" : "ghost"}
                        onClick={() => setSelectedSubgroup("all")}
                        className="h-6 px-2 text-[11px] rounded-lg"
                      >
                        Все подгр.
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedSubgroup === "1" ? "secondary" : "ghost"}
                        onClick={() => setSelectedSubgroup("1")}
                        className="h-6 px-2 text-[11px] rounded-lg"
                      >
                        1-я
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedSubgroup === "2" ? "secondary" : "ghost"}
                        onClick={() => setSelectedSubgroup("2")}
                        className="h-6 px-2 text-[11px] rounded-lg"
                      >
                        2-я
                      </Button>
                    </div>

                    {/* Сортировка */}
                    <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-1">
                      <Button
                        size="sm"
                        variant={sortBy === "active" ? "secondary" : "ghost"}
                        onClick={() => setSortBy("active")}
                        className="h-6 px-2 text-[11px] rounded-lg"
                        title="Сначала недавние"
                      >
                        По времени
                      </Button>
                      <Button
                        size="sm"
                        variant={sortBy === "actions" ? "secondary" : "ghost"}
                        onClick={() => setSortBy("actions")}
                        className="h-6 px-2 text-[11px] rounded-lg"
                        title="По числу действий"
                      >
                        По запросам
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Таблица пользователей */}
                <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/50 font-medium text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5">Ученик / Пользователь</th>
                        <th className="px-3 py-2.5">Telegram ID</th>
                        <th className="px-3 py-2.5">Класс / Подгруппа</th>
                        <th className="px-3 py-2.5">Английский</th>
                        <th className="px-3 py-2.5 text-center">Запросов</th>
                        <th className="px-3 py-2.5">Последняя команда</th>
                        <th className="px-3 py-2.5">Активность</th>
                        <th className="px-3 py-2.5 text-right">Инфо</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((u) => {
                          const uLink = u.username ? `https://t.me/${u.username}` : null;
                          const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
                          const timeInfo = formatDateTimeNsk(u.lastActiveAt);

                          return (
                            <tr
                              key={u.id}
                              onClick={() => setSelectedUser(u)}
                              className="hover:bg-accent/50 cursor-pointer transition-colors"
                            >
                              <td className="px-3 py-2.5 font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                                    {(u.firstName?.[0] || u.username?.[0] || "U").toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold truncate">
                                        {fullName || `@${u.username}` || `ID ${u.id}`}
                                      </span>
                                      {u.isPremium && (
                                        <span title="Telegram Premium" className="text-amber-500 text-[11px]">
                                          ⭐
                                        </span>
                                      )}
                                    </div>
                                    {u.username && (
                                      <div className="text-[11px] text-blue-600 dark:text-blue-400 truncate">
                                        @{u.username}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-2.5 font-mono text-muted-foreground">
                                {u.id}
                              </td>

                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {u.className ? (
                                    <Badge variant="outline" className="font-bold text-xs">
                                      {u.className}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground italic text-[11px]">не выбран</span>
                                  )}
                                  {u.subgroup && (
                                    <Badge
                                      variant="secondary"
                                      className={`text-[10px] px-1.5 py-0 ${
                                        u.subgroup === 1
                                          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                      }`}
                                    >
                                      {u.subgroup} подгр.
                                    </Badge>
                                  )}
                                </div>
                              </td>

                              <td className="px-3 py-2.5">
                                {u.englishGroup ? (
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[130px] block font-mono" title={u.englishGroup}>
                                    🇬🇧 {u.englishGroup}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-[11px]">—</span>
                                )}
                              </td>

                              <td className="px-3 py-2.5 text-center font-mono font-bold">
                                <Badge variant="secondary" className="font-mono text-xs">
                                  {u.actionsCount}
                                </Badge>
                              </td>

                              <td className="px-3 py-2.5 text-muted-foreground">
                                <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[140px] inline-block">
                                  {u.lastAction || "—"}
                                </code>
                              </td>

                              <td className="px-3 py-2.5 font-mono text-muted-foreground text-[11px]">
                                <div>{timeInfo.date} {timeInfo.time}</div>
                                <div className="text-[10px] text-muted-foreground/80">{timeInfo.relative}</div>
                              </td>

                              <td className="px-3 py-2.5 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedUser(u);
                                  }}
                                  className="h-7 w-7 p-0 rounded-lg"
                                  title="Посмотреть полную информацию"
                                >
                                  <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                            Пользователи по заданным критериям не найдены
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>Показано: {filteredUsers.length} из {recentUsers?.length ?? 0}</span>
                  <span>Нажмите на строку пользователя для подробной карточки и логов</span>
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
                В целях конфиденциальности студентов СУНЦ НГУ прямой доступ к Telegram ID, юзернеймам и системным журналам доступен только администраторам. Введите ключ администратора выше или воспользуйтесь бот-командами <code>/auth &lt;ключ&gt;</code> и <code>/logs</code>.
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Модальное окно детальной информации о человеке */}
      {selectedUser && (
        <UserInfoDialog
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onViewLogs={() => handleViewUserLogs(selectedUser)}
        />
      )}
    </div>
  );
}

/** Детальная карточка / модальное окно информации об ученике */
function UserInfoDialog({
  user,
  onClose,
  onViewLogs,
}: {
  user: TelegramUserProfile;
  onClose: () => void;
  onViewLogs: () => void;
}) {
  const [copiedId, setCopiedId] = useState(false);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const firstSeen = formatDateTimeNsk(user.firstSeenAt);
  const lastActive = formatDateTimeNsk(user.lastActiveAt);

  const copyId = () => {
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-2xl p-6">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-md">
                {(user.firstName?.[0] || user.username?.[0] || "U").toUpperCase()}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {fullName || `@${user.username}` || `Пользователь ${user.id}`}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  {user.username ? (
                    <a
                      href={`https://t.me/${user.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center gap-1 font-semibold"
                    >
                      @{user.username}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Юзернейм не задан</span>
                  )}
                  {user.isPremium && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0">
                      ⭐ Premium
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Сетка параметров человека */}
        <div className="mt-4 space-y-3">
          {/* Telegram ID блок */}
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Telegram ID:</span>
              <span className="font-mono font-bold">{user.id}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyId}
              className="h-7 px-2 text-[11px] gap-1 rounded-lg"
            >
              {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedId ? "Скопирован" : "Копия"}
            </Button>
          </div>

          {/* Класс и подгруппы */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border p-3 bg-card">
              <div className="text-[11px] text-muted-foreground font-medium">Класс ФМШ</div>
              <div className="mt-1 font-bold text-sm">
                {user.className ? (
                  <Badge variant="outline" className="text-xs font-bold">
                    {user.className}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground italic">Не выбран</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border p-3 bg-card">
              <div className="text-[11px] text-muted-foreground font-medium">Подгруппа</div>
              <div className="mt-1 font-bold text-sm">
                {user.subgroup ? (
                  <Badge variant="secondary" className="text-xs">
                    {user.subgroup}-я подгруппа
                  </Badge>
                ) : (
                  <span className="text-muted-foreground italic">Общая / не выбрана</span>
                )}
              </div>
            </div>
          </div>

          {/* Группа английского языка */}
          <div className="rounded-xl border p-3 bg-card text-xs">
            <div className="text-[11px] text-muted-foreground font-medium">Группа по английскому языку</div>
            <div className="mt-1 font-semibold flex items-center gap-1.5">
              <span>🇬🇧</span>
              <span>{user.englishGroup || "Не выбрана в /subgroup"}</span>
            </div>
          </div>

          {/* Временные метки: регистрация и активность */}
          <div className="rounded-xl border p-3 bg-card space-y-2 text-xs">
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                Первое обращение:
              </span>
              <div className="text-right">
                <span className="font-mono font-medium">{firstSeen.full}</span>
                <div className="text-[10px] text-muted-foreground">{firstSeen.relative}</div>
              </div>
            </div>

            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                Последняя активность:
              </span>
              <div className="text-right">
                <span className="font-mono font-medium">{lastActive.full}</span>
                <div className="text-[10px] text-muted-foreground">{lastActive.relative}</div>
              </div>
            </div>

            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Всего запросов к боту:</span>
              <span className="font-mono font-bold text-sm">{user.actionsCount}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Последнее действие:</span>
              <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
                {user.lastAction || "—"}
              </code>
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="pt-2 flex flex-col gap-2">
            <Button
              onClick={onViewLogs}
              className="w-full gap-2 rounded-xl h-9 text-xs"
            >
              <Terminal className="h-3.5 w-3.5" />
              Смотреть журнал действий (логи этого человека)
            </Button>

            {user.username && (
              <a
                href={`https://t.me/${user.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border h-9 text-xs font-semibold hover:bg-accent transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Открыть диалог в Telegram (@{user.username})
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Интерактивная консоль просмотра журналов логов с подробным временем */
function AdminLogsConsole({
  adminKey,
  initialSearch = "",
}: {
  adminKey: string;
  initialSearch?: string;
}) {
  const [file, setFile] = useState<"bot" | "portal" | "audit">("bot");
  const [level, setLevel] = useState<string>("ALL");
  const [search, setSearch] = useState<string>(initialSearch);
  const [limit, setLimit] = useState<number>(150);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"structured" | "raw">("structured");

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const { data, isLoading, isError, refetch, isFetching } = useAdminLogs(
    adminKey,
    file,
    level,
    search,
    limit,
    autoRefresh
  );

  const lines = data?.lines ?? [];
  const parsed = data?.parsed ?? [];

  const handleCopy = () => {
    if (!lines.length) return;
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!lines.length) return;
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileLabels: Record<string, { label: string; desc: string }> = {
    bot: { label: "logs/bot.log", desc: "Telegram-бот (команды, меню, расписание)" },
    portal: { label: "logs/portal.log", desc: "Next.js / API / Веб-трафик" },
    audit: { label: "logs/audit.log", desc: "Аудит безопасности, авторизации и синхронизаций" },
  };

  return (
    <div className="space-y-3 pt-1">
      {/* Селекторы файла логов и режимов */}
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
              {f === "bot" ? "Telegram-бот" : f === "portal" ? "Сервер/API" : "Аудит безопасности"}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Уровни логов */}
          <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-1">
            {["ALL", "AUDIT", "ERROR", "WARN", "INFO", "DEBUG"].map((lvl) => (
              <Button
                key={lvl}
                size="sm"
                variant={level === lvl ? "secondary" : "ghost"}
                onClick={() => setLevel(lvl)}
                className={`h-7 px-2 text-[11px] rounded-lg ${
                  lvl === "ERROR" && level === lvl
                    ? "text-rose-500 font-bold"
                    : lvl === "AUDIT" && level === lvl
                    ? "text-purple-500 font-bold"
                    : lvl === "WARN" && level === lvl
                    ? "text-amber-500 font-bold"
                    : ""
                }`}
              >
                {lvl === "ALL" ? "Все" : lvl}
              </Button>
            ))}
          </div>

          {/* Лимит строк */}
          <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-1">
            {[50, 150, 300, 500].map((l) => (
              <Button
                key={l}
                size="sm"
                variant={limit === l ? "secondary" : "ghost"}
                onClick={() => setLimit(l)}
                className="h-6 px-1.5 text-[10px] rounded-md"
              >
                {l}
              </Button>
            ))}
          </div>

          {/* Переключатель вида */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewMode(viewMode === "structured" ? "raw" : "structured")}
            className="h-7 px-2 text-[11px] rounded-lg"
          >
            {viewMode === "structured" ? "Вид: Детальный" : "Вид: Raw"}
          </Button>

          {/* Автообновление */}
          <Button
            size="sm"
            variant={autoRefresh ? "secondary" : "ghost"}
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-7 px-2 text-[11px] rounded-lg gap-1 ${
              autoRefresh ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"
            }`}
            title="Автообновление каждые 5 сек"
          >
            {autoRefresh ? <Play className="h-3 w-3 fill-current" /> : <Pause className="h-3 w-3" />}
            {autoRefresh ? "Авто: 5с" : "Пауза"}
          </Button>

          {/* Скачать */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={!lines.length}
            className="h-7 px-2 text-[11px] rounded-lg gap-1"
            title="Скачать файл логов"
          >
            <Download className="h-3.5 w-3.5" />
            .log
          </Button>

          {/* Копировать */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!lines.length}
            className="h-7 px-2 text-[11px] rounded-lg gap-1"
            title="Скопировать логи"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>

          {/* Обновить */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 w-7 p-0 rounded-lg"
            title="Обновить журнал"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Поле поиска по журналу логов */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Фильтр по журналу логов (Telegram ID, @юзернейм, IP, команда, ошибка)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-8 h-9 text-xs rounded-xl font-mono bg-background"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Терминальное окно логов с детальным временем */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-[12px] text-slate-200 shadow-xl overflow-hidden">
        {/* Шапка терминала */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span className="font-semibold text-slate-300">{fileLabels[file].label}</span>
            <span className="text-slate-500 hidden sm:inline">({fileLabels[file].desc})</span>
            <span>· {data?.count ?? 0} записей</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>Время: Новосибирск (UTC+7)</span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Загрузка журнала логов...</div>
        ) : isError ? (
          <div className="py-12 text-center text-rose-400">Ошибка чтения файла логов</div>
        ) : lines.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            {search
              ? `Записей по запросу «${search}» не найдено`
              : "Записей пока нет или они отфильтрованы"}
          </div>
        ) : viewMode === "structured" ? (
          /* Структурированный вид записей */
          <div className="max-h-[460px] overflow-y-auto space-y-1.5 pr-2 select-text">
            {parsed.map((item: ParsedLogEntry, i: number) => {
              const isAudit = item.level === "AUDIT";
              const isError = item.level === "ERROR";
              const isWarn = item.level === "WARN";
              const isDebug = item.level === "DEBUG";

              const badgeColor = isError
                ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                : isWarn
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : isAudit
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                : isDebug
                ? "bg-slate-800 text-slate-400 border-slate-700"
                : "bg-blue-500/20 text-blue-300 border-blue-500/40";

              return (
                <div
                  key={i}
                  className={`rounded-lg border border-slate-800/80 p-2 transition-colors hover:bg-slate-900/60 flex flex-col gap-1 ${
                    isError ? "bg-rose-950/20 border-rose-900/40" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-semibold">{item.timestamp}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                        {item.level}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                        {item.category}
                      </span>
                    </div>

                    {/* Быстрые фильтры пользователя */}
                    <div className="flex items-center gap-1.5">
                      {item.userId && (
                        <button
                          onClick={() => setSearch(item.userId!)}
                          className="text-[10px] text-blue-400 hover:underline bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20"
                          title="Фильтровать по этому ID"
                        >
                          ID: {item.userId}
                        </button>
                      )}
                      {item.username && (
                        <button
                          onClick={() => setSearch(`@${item.username!}`)}
                          className="text-[10px] text-indigo-400 hover:underline bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20"
                          title="Фильтровать по юзернейму"
                        >
                          @{item.username}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-[12px] text-slate-200 break-all leading-relaxed pl-1">
                    {item.message}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Сырой вид строк терминала */
          <div className="max-h-[460px] overflow-y-auto space-y-1 pr-2 select-text">
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

/** Виджет мониторинга нагрузки на сервер: ОЗУ (оперативная память), процессор (CPU), Load Average и аптайм */
function ServerHealthMonitor({ adminKey }: { adminKey: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useSystemMetrics(adminKey);

  const mem = data?.memory;
  const cpu = data?.cpu;
  const uptime = data?.uptime;
  const platform = data?.platform;

  const memPercent = mem?.percent ?? 0;
  const cpuPercent = cpu?.percent ?? 0;

  const memColor =
    memPercent > 85 ? "bg-rose-500" : memPercent > 70 ? "bg-amber-500" : "bg-emerald-500";
  const cpuColor =
    cpuPercent > 85 ? "bg-rose-500" : cpuPercent > 60 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="rounded-2xl border bg-card/60 p-4 space-y-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-blue-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Нагрузка на сервер (ОЗУ / Процессор / Аптайм)
          </h4>
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            live 3.5с
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {platform && (
            <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5">
              {platform.os} ({platform.arch}) · Node {platform.nodeVersion}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-6 w-6 p-0 rounded-md"
            title="Обновить метрики сервера"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          Опрос показателей оборудования...
        </div>
      ) : isError || !mem || !cpu ? (
        <div className="py-2 text-center text-xs text-rose-500">
          Не удалось получить метрики оборудования сервера
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Оперативная память */}
          <div className="rounded-xl border bg-background/80 p-3 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-[11px]">
                <HardDrive className="h-3.5 w-3.5 text-purple-500" />
                Оперативная память (ОЗУ)
              </span>
              <span className="font-mono font-bold text-sm">{memPercent}%</span>
            </div>
            <div className="mt-2.5">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${memColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, memPercent))}%` }}
                />
              </div>
            </div>
            <div className="mt-2.5 text-[11px] flex items-center justify-between text-muted-foreground">
              <span>Занято: <strong className="text-foreground font-mono">{mem.formatted.used}</strong></span>
              <span>Всего: <span className="font-mono">{mem.formatted.total}</span></span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/80 truncate">
              Свободно: {mem.formatted.free} · Node RSS: {mem.formatted.procRss}
            </div>
          </div>

          {/* Процессор */}
          <div className="rounded-xl border bg-background/80 p-3 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-[11px]">
                <Cpu className="h-3.5 w-3.5 text-blue-500" />
                Процессор (CPU)
              </span>
              <span className="font-mono font-bold text-sm">{cpuPercent}%</span>
            </div>
            <div className="mt-2.5">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${cpuColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
                />
              </div>
            </div>
            <div className="mt-2.5 text-[11px] flex items-center justify-between text-muted-foreground">
              <span>Ядер: <strong className="text-foreground font-mono">{cpu.cores}</strong></span>
              <span>Load: <span className="font-mono">{cpu.loadavg.join(" · ")}</span></span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/80 truncate" title={cpu.model}>
              {cpu.model}
            </div>
          </div>

          {/* Аптайм и система */}
          <div className="rounded-xl border bg-background/80 p-3 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-[11px]">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Время работы (Uptime)
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                online
              </Badge>
            </div>
            <div className="mt-1">
              <div className="text-base font-black tracking-tight">{uptime?.formattedSystem || "—"}</div>
            </div>
            <div className="mt-2 text-[11px] flex items-center justify-between text-muted-foreground">
              <span>Процесс Node.js:</span>
              <span className="font-mono font-medium text-foreground">{uptime?.formattedProcess || "—"}</span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/80 truncate">
              Heap памяти процесса: {mem.formatted.procHeap}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Панель просмотра и управления отчётами и обращениями пользователей */
function AdminReportsPanel({
  adminKey,
  reports,
  refetchReports,
  isFetching,
}: {
  adminKey: string;
  reports: FeedbackItem[];
  refetchReports: () => void;
  isFetching: boolean;
}) {
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.contact.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q) ||
        String(r.id).includes(q)
    );
  }, [reports, search]);

  const handleDelete = async (id: number) => {
    if (!confirm(`Удалить отчёт #${id}?`)) return;
    setDeletingId(id);
    try {
      await deleteFeedback(id, adminKey);
      refetchReports();
    } catch (err) {
      alert((err as Error).message || "Ошибка удаления");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        "Вы уверены, что хотите удалить ВСЕ обращения и отчёты? Это действие необратимо."
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await clearAllFeedback(adminKey);
      refetchReports();
    } catch (err) {
      alert((err as Error).message || "Ошибка очистки");
    } finally {
      setClearing(false);
    }
  };

  const copyText = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-card/60 p-4 backdrop-blur-xs">
      {/* Шапка управления */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold text-sm">Отчёты и обращения пользователей</h3>
          <Badge variant="outline" className="text-xs font-mono">
            {filtered.length} из {reports.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetchReports()}
            disabled={isFetching}
            className="h-8 text-xs gap-1.5 rounded-xl"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Обновить
          </Button>

          {reports.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleClearAll}
              disabled={clearing}
              className="h-8 text-xs gap-1.5 rounded-xl"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Очистить все
            </Button>
          )}
        </div>
      </div>

      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по отправителю, контакту, тексту репорта или #ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-xs rounded-xl"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Список отчётов */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed bg-muted/20">
          <Inbox className="h-10 w-10 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-semibold text-foreground">
            {search ? "Ничего не найдено по запросу" : "Нет активных отчётов и обращений"}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            {search
              ? "Попробуйте изменить поисковый запрос"
              : "Когда ученики отправят отчёт через Telegram-бота или форму на сайте, обращение сразу появится здесь."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const timeInfo = formatDateTimeNsk(item.createdAt);
            const tgUsername = item.contact.startsWith("@") ? item.contact.slice(1) : null;

            return (
              <div
                key={item.id}
                className="rounded-xl border bg-background/80 p-3.5 transition-colors hover:border-amber-500/40 shadow-2xs"
              >
                {/* Верхняя строка карточки */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2 mb-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] font-bold px-1.5 py-0 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    >
                      #{item.id}
                    </Badge>
                    <span className="font-semibold text-foreground">{item.name}</span>
                    <span className="text-muted-foreground text-[11px]">({item.contact})</span>
                    {tgUsername && (
                      <a
                        href={`https://t.me/${tgUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 text-[11px] font-medium"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Telegram
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="text-muted-foreground text-[11px] font-mono"
                      title={timeInfo.full}
                    >
                      {item.formattedTime || timeInfo.full} ({timeInfo.relative})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-500/10 rounded-lg text-xs gap-1"
                      title="Удалить / закрыть отчёт"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Закрыть
                    </Button>
                  </div>
                </div>

                {/* Содержимое отчёта */}
                <div className="text-xs leading-relaxed whitespace-pre-wrap bg-muted/30 p-2.5 rounded-lg border border-border/40 font-sans">
                  {item.message}
                </div>

                {/* Нижняя панель действий */}
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <button
                    onClick={() => copyText(item.id, item.message)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-500 font-medium">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Копировать текст</span>
                      </>
                    )}
                  </button>

                  <span>
                    Статус:{" "}
                    <strong className="text-amber-600 dark:text-amber-400 font-medium">
                      Новое обращение
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

