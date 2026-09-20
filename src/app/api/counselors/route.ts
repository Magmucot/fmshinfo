import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminRequest, getClientIp } from "@/lib/server/auth";
import { ensureSeedData } from "@/lib/server/seed";
import { portalLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

/** GET /api/counselors?date=ДД.ММ.ГГГГ — ночные вожатые по общежитиям */
export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const date = request.nextUrl.searchParams.get("date");
    const items = await db.nightCounselor.findMany({
      where: date ? { date } : undefined,
      orderBy: [{ date: "asc" }, { dormitory: "asc" }],
    });
    return NextResponse.json({ ok: true, items, count: items.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/counselors — добавить/обновить ночного вожатого (X-Admin-Key) */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!isAdminRequest(request)) {
    portalLogger.warn("SECURITY", `Unauthorized POST /api/counselors attempt from IP: ${ip}`);
    return NextResponse.json({ ok: false, error: "Неверный X-Admin-Key" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: number;
      date?: string;
      dormitory?: string;
      counselorName?: string;
      phone?: string | null;
      floor?: string | null;
      notes?: string | null;
    };

    if (!body.date || !/^\d{2}\.\d{2}\.\d{4}$/.test(body.date)) {
      return NextResponse.json(
        { ok: false, error: "Поле date обязательно в формате ДД.ММ.ГГГГ" },
        { status: 400 }
      );
    }
    if (!body.dormitory || !body.counselorName) {
      return NextResponse.json(
        { ok: false, error: "Поля dormitory и counselorName обязательны" },
        { status: 400 }
      );
    }

    const data = {
      date: body.date,
      dormitory: body.dormitory,
      counselorName: body.counselorName,
      phone: body.phone ?? null,
      floor: body.floor ?? null,
      notes: body.notes ?? null,
    };

    const entry = body.id
      ? await db.nightCounselor.update({ where: { id: body.id }, data })
      : await db.nightCounselor.create({ data });

    portalLogger.audit(
      "ADMIN_ACTION",
      `Admin (IP: ${ip}) ${body.id ? "updated" : "created"} counselor: date=${entry.date}, dorm=${entry.dormitory}, name=${entry.counselorName}`
    );

    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}

/** DELETE /api/counselors?id=… — удалить запись (X-Admin-Key) */
export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request);
  if (!isAdminRequest(request)) {
    portalLogger.warn("SECURITY", `Unauthorized DELETE /api/counselors attempt from IP: ${ip}`);
    return NextResponse.json({ ok: false, error: "Неверный X-Admin-Key" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ ok: false, error: "Некорректный id" }, { status: 400 });
  }
  try {
    await db.nightCounselor.delete({ where: { id } });
    portalLogger.audit("ADMIN_ACTION", `Admin (IP: ${ip}) deleted counselor id=${id}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}
