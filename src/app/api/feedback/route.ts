import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/feedback — обратная связь { name, contact, message } */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string; contact?: string; message?: string };
    const name = (body.name ?? "").trim();
    const contact = (body.contact ?? "").trim();
    const message = (body.message ?? "").trim();

    if (!name || !contact || !message) {
      return NextResponse.json(
        { ok: false, error: "Заполните имя, контакт и сообщение" },
        { status: 400 }
      );
    }
    if (name.length > 200 || contact.length > 200 || message.length > 4000) {
      return NextResponse.json({ ok: false, error: "Слишком длинное сообщение" }, { status: 400 });
    }

    const entry = await db.feedback.create({ data: { name, contact, message } });
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}
