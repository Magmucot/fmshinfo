"use client";

/** Раздел «Ночные вожатые» + админ-панель (график вводится вручную — см. анализ 3.5) */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Info, KeyRound, MoonStar, Phone, Plus, Trash2, Building2, Layers } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useCounselors, adminRequest } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, EmptyState, humanDate } from "../shared";
import { fmtRu, nowNsk } from "../types";

const DORMITORIES = ["Общежитие №1", "Общежитие №2"];

function CounselorAdminDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: fmtRu(nowNsk()),
    dormitory: DORMITORIES[0],
    counselorName: "",
    phone: "",
    floor: "",
    notes: "",
  });

  const save = async () => {
    if (!adminKey.trim()) {
      toast({ title: "Введите ключ администратора", variant: "destructive" });
      return;
    }
    if (!form.counselorName.trim()) {
      toast({ title: "Укажите ФИО вожатого", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await adminRequest("/api/counselors", "POST", adminKey, {
        date: form.date,
        dormitory: form.dormitory,
        counselorName: form.counselorName,
        phone: form.phone || null,
        floor: form.floor || null,
        notes: form.notes || null,
      });
      toast({ title: "Вожатый добавлен" });
      setOpen(false);
      onSaved();
    } catch (error) {
      toast({ title: "Ошибка", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Добавить
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Ночной вожатый на дату
          </DialogTitle>
          <DialogDescription>
            График ночных дежурств воспитателей вносится администратором.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-date">Дата (ДД.ММ.ГГГГ)</Label>
              <Input
                id="nc-date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                placeholder="01.09.2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Общежитие</Label>
              <Select value={form.dormitory} onValueChange={(v) => setForm({ ...form, dormitory: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DORMITORIES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-name">ФИО вожатого</Label>
            <Input
              id="nc-name"
              value={form.counselorName}
              onChange={(e) => setForm({ ...form, counselorName: e.target.value })}
              placeholder="Смирнова Ольга Викторовна"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-phone">Телефон</Label>
              <Input
                id="nc-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 (383) …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-floor">Этажи</Label>
              <Input
                id="nc-floor"
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
                placeholder="2–3 этажи"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-key">Ключ администратора</Label>
            <Input
              id="nc-key"
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="X-Admin-Key"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CounselorsSection() {
  const [date, setDate] = useState<string>(fmtRu(nowNsk()));
  const counselors = useCounselors(date);
  const queryClient = useQueryClient();
  const [adminKey, setAdminKey] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nowNsk().getTime() + i * 86400000);
    return fmtRu(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["counselors"] });
  };

  const remove = async (id: number) => {
    if (!adminKey.trim()) {
      toast({ title: "Введите ключ администратора в поле ниже", variant: "destructive" });
      return;
    }
    setDeleting(id);
    try {
      await adminRequest(`/api/counselors?id=${id}`, "DELETE", adminKey);
      toast({ title: "Запись удалена" });
      refresh();
    } catch (error) {
      toast({ title: "Ошибка", description: (error as Error).message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const items = counselors.data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Ночные вожатые"
        icon={<MoonStar className="h-4 w-4" />}
        action={<CounselorAdminDialog onSaved={refresh} />}
      >
        <div className="flex flex-wrap gap-1.5">
          {dates.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={date === d ? "default" : "outline"}
              className="h-8 text-xs tabular-nums"
              onClick={() => setDate(d)}
            >
              {d.slice(0, 5)}
            </Button>
          ))}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-accent/50 px-3 py-2 text-xs text-accent-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            В общежитиях организовано круглосуточное дежурство воспитателей с обходами. С 20:00 до 8:00 вход
            в оба общежития — через 1-е общежитие.
          </span>
        </div>
      </SectionCard>

      {counselors.isLoading ? (
        <SectionCard>
          <LoadingBlock lines={3} />
        </SectionCard>
      ) : counselors.isError ? (
        <SectionCard>
          <ErrorCard message="Не удалось загрузить график вожатых" onRetry={() => counselors.refetch()} />
        </SectionCard>
      ) : items.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 text-7xl opacity-5 select-none" aria-hidden>
                🌙
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge className="gap-1 bg-primary/90 text-primary-foreground">
                  <Building2 className="h-3 w-3" />
                  {item.dormitory}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => remove(item.id)}
                  disabled={deleting === item.id}
                  aria-label="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <p className="mt-2.5 text-base font-bold leading-snug">{item.counselorName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {item.phone ? (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    <a href={`tel:${item.phone.replace(/[^+\d]/g, "")}`} className="hover:text-primary">
                      {item.phone}
                    </a>
                  </span>
                ) : null}
                {item.floor ? (
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> {item.floor}
                  </span>
                ) : null}
              </div>
              {item.notes ? <p className="mt-1.5 text-xs text-muted-foreground/80">{item.notes}</p> : null}
              <p className="mt-2.5 text-[11px] text-muted-foreground/70">{humanDate(item.date)}</p>
            </div>
          ))}
        </div>
      ) : (
        <SectionCard>
          <EmptyState
            text={`На ${date} график ночных вожатых не внесён. Добавьте записи через кнопку «Добавить».`}
            icon={<MoonStar className="h-8 w-8" />}
          />
        </SectionCard>
      )}

      <SectionCard title="Экстренные контакты" icon={<Phone className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">Дежурный воспитатель / охрана</p>
            <p className="mt-1 text-sm font-semibold">+7 (383) 373-96-41</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">Общий телефон (приёмная)</p>
            <p className="mt-1 text-sm font-semibold">+7 (383) 373-96-41</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">Психолого-педагогическая служба</p>
            <p className="mt-1 text-sm font-semibold">+7 (383) 363-41-52</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Режим администратора" icon={<KeyRound className="h-4 w-4" />}>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Ключ администратора (X-Admin-Key)"
            className="w-full sm:w-72"
          />
          <p className="text-xs text-muted-foreground">
            Ключ используется для добавления и удаления записей.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
