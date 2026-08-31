"use client";

/** Раздел «Инфо»: контакты, ссылки, обратная связь */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, ExternalLink, Info, Mail, Phone, Send, Sparkles, Keyboard, Download, Utensils, Flame, Share2, GitBranch, Bot } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useInfo, sendFeedback } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, EmptyState } from "../shared";

function FeedbackForm() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!name.trim() || !contact.trim() || !message.trim()) {
      toast({ title: "Заполните все поля", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await sendFeedback(name, contact, message);
      toast({ title: "Сообщение отправлено", description: "Спасибо! Мы прочитаем его в ближайшее время." });
      setName("");
      setContact("");
      setMessage("");
    } catch (error) {
      toast({ title: "Ошибка отправки", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-3.5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fb-name">Имя</Label>
          <Input id="fb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Мария" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fb-contact">Контакт (e-mail или @telegram)</Label>
          <Input id="fb-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="maria@example.com" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fb-message">Сообщение</Label>
        <Textarea
          id="fb-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Предложение по работе портала, найденная ошибка в данных…"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={sending} className="gap-1.5">
          <Send className="h-4 w-4" />
          {sending ? "Отправка…" : "Отправить"}
        </Button>
      </div>
    </div>
  );
}

export function InfoSection() {
  const info = useInfo();

  if (info.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard>
          <LoadingBlock lines={5} />
        </SectionCard>
        <SectionCard>
          <LoadingBlock lines={5} />
        </SectionCard>
      </div>
    );
  }

  if (info.isError || !info.data) {
    return (
      <SectionCard>
        <ErrorCard message="Справочник временно недоступен" onRetry={() => info.refetch()} />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="О школе" icon={<Building2 className="h-4 w-4" />}>
          <p className="text-sm font-bold leading-snug">{info.data.school.name}</p>
          <p className="mt-2 text-sm text-muted-foreground">{info.data.school.address}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a
              href={`mailto:${info.data.school.email}`}
              className="flex items-center gap-1 rounded-full border px-3 py-1 hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Mail className="h-3.5 w-3.5" /> {info.data.school.email}
            </a>
            <a
              href={info.data.school.site}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full border px-3 py-1 hover:border-primary/50 hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> sesc.nsu.ru
            </a>
          </div>
          <div className="mt-4 rounded-xl bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
            {info.data.adminSchedule}
          </div>
        </SectionCard>

        <SectionCard title="Возможности портала" icon={<Sparkles className="h-4 w-4" />}>
          <ul className="space-y-2.5">
            <li className="flex gap-2.5 text-sm leading-relaxed">
              <Keyboard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Горячие клавиши:</span> Alt+1…0 — быстрое
                переключение разделов. Полная инструкция — во вкладке «Гайд»
              </span>
            </li>
            <li className="flex gap-2.5 text-sm leading-relaxed">
              <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Установка как приложение:</span> в браузере выберите «Установить
                приложение» / «На экран “Домой”» — портал работает как PWA
              </span>
            </li>
            <li className="flex gap-2.5 text-sm leading-relaxed">
              <Utensils className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Фильтры меню:</span> поиск по блюдам и составам, вегетарианские и
                безаллергенные фильтры, значки аллергенов на каждом блюде
              </span>
            </li>
            <li className="flex gap-2.5 text-sm leading-relaxed">
              <Flame className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Калькулятор калорий:</span> в разделе «Столовая» → «Аналитика»
                отмечайте блюда — итоги сохранятся на устройстве
              </span>
            </li>
            <li className="flex gap-2.5 text-sm leading-relaxed">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Telegram-бот:</span> те же данные — меню, звонки, погода, новости —
                в боте (модуль mini-services/tg-bot)
              </span>
            </li>
            <li className="flex gap-2.5 text-sm leading-relaxed">
              <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Группы в расписании:</span> параллельные уроки (одно время)
                автоматически показываются как группы класса
              </span>
            </li>
            <li className="flex gap-2.5 text-sm leading-relaxed">
              <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Поделиться меню:</span> кнопка «Поделиться» в столовой копирует
                текстовое меню дня
              </span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Контакты" icon={<Phone className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {info.data.contacts.map((contact, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-secondary/30 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
                <p className="text-xs font-semibold">{contact.title}</p>
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
                    className="mt-1 block text-sm font-bold tabular-nums hover:text-primary"
                  >
                    {contact.phone}
                  </a>
                ) : null}
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="mt-0.5 block text-xs text-primary hover:underline">
                    {contact.email}
                  </a>
                ) : null}
                {contact.note ? <p className="mt-1 text-[11px] text-muted-foreground">{contact.note}</p> : null}
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Важно знать" icon={<Info className="h-4 w-4" />}>
            <ul className="space-y-2.5">
              {info.data.notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {note}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Обратная связь" icon={<Send className="h-4 w-4" />}>
            <FeedbackForm />
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Полезные ссылки" icon={<ExternalLink className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {info.data.links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/30 px-3.5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium group-hover:text-primary transition-colors">{link.title}</p>
                {link.note ? <p className="text-xs text-muted-foreground">{link.note}</p> : null}
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            </a>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
