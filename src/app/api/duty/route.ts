import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminRequest } from "@/lib/server/auth";
import { ensureSeedData } from "@/lib/server/seed";

export const dynamic = "force-dynamic";

/** GET /api/duty?date=ДД.ММ.ГГГГ — график дежурств (ручное администрирование) */
export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const date = request.nextUrl.searchParams.get("date");
    const items = await db.dutyEntry.findMany({
      where: date ? { date } : undefined,
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ ok: true, items, count: items.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/duty — добавить/обновить дежурство (заголовок X-Admin-Key) */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "Неверный X-Admin-Key" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: number;
      date?: string;
      dutyType?: string;
      className?: string | null;
      responsible?: string | null;
      timeInterval?: string | null;
      notes?: string | null;
    };

    if (!body.date || !/^\d{2}\.\d{2}\.\d{4}$/.test(body.date)) {
      return NextResponse.json(
        { ok: false, error: "Поле date обязательно в формате ДД.ММ.ГГГГ" },
        { status: 400 }
      );
    }

    const data = {
      date: body.date,
      dutyType: body.dutyType ?? "столовая",
      className: body.className ?? null,
      responsible: body.responsible ?? null,
      timeInterval: body.timeInterval ?? null,
      notes: body.notes ?? null,
    };

    const entry = body.id
      ? await db.dutyEntry.update({ where: { id: body.id }, data })
      : await db.dutyEntry.create({ data });

    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}

/** DELETE /api/duty?id=… — удалить запись (заголовок X-Admin-Key) */
export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "Неверный X-Admin-Key" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ ok: false, error: "Некорректный id" }, { status: 400 });
  }
  try {
    await db.dutyEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}
