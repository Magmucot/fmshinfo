import { NextRequest, NextResponse } from "next/server";
import { feedbackPayload } from "@/lib/server/payloads";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/feedback — обратная связь { name, contact, message } */
export async function POST(request: NextRequest) {
  try {
    const parsed = feedbackPayload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Заполните имя и контакт (до 200 символов), сообщение (до 4000 символов)" }, { status: 400 });
    }
    const { name, contact, message } = parsed.data;

    const entry = await db.feedback.create({ data: { name, contact, message } });
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Не удалось сохранить сообщение" }, { status: 500 });
  }
}
