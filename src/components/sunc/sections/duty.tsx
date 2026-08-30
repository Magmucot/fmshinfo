"use client";

/** Раздел «Дежурства» + админ-панель (график вводится вручную — см. анализ 3.4) */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BrushCleaning, Info, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDuty, adminRequest } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, EmptyState, humanDate } from "../shared";
import { fmtRu, nowNsk } from "../types";

const DUTY_TYPES = ["столовая", "корпус", "общежитие", "медпункт", "прочее"];

function DutyAdminDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: fmtRu(nowNsk()),
    dutyType: "столовая",
    className: "",
    responsible: "",
    timeInterval: "",
    notes: "",
  });

  const save = async () => {
    if (!adminKey.trim()) {
      toast({ title: "Введите ключ администратора", variant: "destructive" });
      return;
    }
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(form.date)) {
      toast({ title: "Дата должна быть в формате ДД.ММ.ГГГГ", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await adminRequest("/api/duty", "POST", adminKey, {
        date: form.date,
        dutyType: form.dutyType,
        className: form.className || null,
        responsible: form.responsible || null,
        timeInterval: form.timeInterval || null,
        notes: form.notes || null,
      });
      toast({ title: "Дежурство сохранено" });
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
            Новое дежурство
          </DialogTitle>
          <DialogDescription>
            График дежурств не публикуется онлайн — его вносит администратор.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="duty-date">Дата (ДД.ММ.ГГГГ)</Label>
              <Input
                id="duty-date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                placeholder="01.09.2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Тип дежурства</Label>
              <Select value={form.dutyType} onValueChange={(v) => setForm({ ...form, dutyType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DUTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="duty-class">Класс</Label>
              <Input
                id="duty-class"
                value={form.className}
                onChange={(e) => setForm({ ...form, className: e.target.value })}
                placeholder="10-2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="duty-time">Время</Label>
              <Input
                id="duty-time"
                value={form.timeInterval}
                onChange={(e) => setForm({ ...form, timeInterval: e.target.value })}
                placeholder="после 3 урока"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duty-resp">Ответственный</Label>
            <Input
              id="duty-resp"
              value={form.responsible}
              onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              placeholder="ФИО воспитателя"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duty-notes">Заметка</Label>
            <Textarea
              id="duty-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duty-key">Ключ администратора</Label>
            <Input
              id="duty-key"
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

export function DutySection() {
  const [date, setDate] = useState<string | null>(fmtRu(nowNsk()));
  const duty = useDuty(date ?? undefined);
  const queryClient = useQueryClient();
  const [adminKey, setAdminKey] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  // варианты дат: неделя вперёд
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nowNsk().getTime() + i * 86400000);
    return fmtRu(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["duty"] });
  };

  const remove = async (id: number) => {
    if (!adminKey.trim()) {
      toast({ title: "Введите ключ администратора в поле ниже", variant: "destructive" });
      return;
    }
    setDeleting(id);
    try {
      await adminRequest(`/api/duty?id=${id}`, "DELETE", adminKey);
      toast({ title: "Запись удалена" });
      refresh();
    } catch (error) {
      toast({ title: "Ошибка", description: (error as Error).message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const items = duty.data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="График дежурств"
        icon={<BrushCleaning className="h-4 w-4" />}
        action={<DutyAdminDialog onSaved={refresh} />}
      >
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={date === null ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setDate(null)}
          >
            Все
          </Button>
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
            Дежурства классов публикуются на стендах школы; здесь график ведёт администратор портала
            (демо-данные заполнены автоматически).
          </span>
        </div>
      </SectionCard>

      {duty.isLoading ? (
        <SectionCard>
          <LoadingBlock lines={4} />
        </SectionCard>
      ) : duty.isError ? (
        <SectionCard>
          <ErrorCard message="Не удалось загрузить дежурства" onRetry={() => duty.refetch()} />
        </SectionCard>
      ) : items.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="group rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/90 text-primary-foreground">{item.className ?? "—"}</Badge>
                  <Badge variant="outline">{item.dutyType}</Badge>
                </div>
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
              <p className="mt-2.5 text-sm">
                <span className="text-muted-foreground">Когда: </span>
                <span className="font-medium">{item.timeInterval ?? "—"}</span>
              </p>
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">Ответственный: </span>
                <span className="font-medium">{item.responsible ?? "—"}</span>
              </p>
              {item.notes ? <p className="mt-1.5 text-xs text-muted-foreground">{item.notes}</p> : null}
              <p className="mt-2 text-[11px] text-muted-foreground/70">{humanDate(item.date)}</p>
            </div>
          ))}
        </div>
      ) : (
        <SectionCard>
          <EmptyState
            text={`Дежурств ${date ? `на ${date} ` : ""}не внесено. Администратор может добавить их через кнопку «Добавить».`}
            icon={<BrushCleaning className="h-8 w-8" />}
          />
        </SectionCard>
      )}

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
            Ключ используется для добавления и удаления записей. По умолчанию: <code className="rounded bg-muted px-1 py-0.5">sunc-admin</code>
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
