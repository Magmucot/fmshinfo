import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalLogger } from "@/lib/server/logger";
import { webPayload } from "@/lib/server/payloads";

export const dynamic = "force-dynamic";

/** Record a visit without returning the visitor's stored profile to a public caller. */
export async function POST(request: NextRequest) {
  try {
    const parsed = webPayload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Некорректные данные посетителя" }, { status: 400 });
    }
    const { clientId, path, ...profile } = parsed.data;
    const data = {
      ...profile,
      userAgent: profile.userAgent === undefined
        ? request.headers.get("user-agent")?.slice(0, 500)
        : profile.userAgent,
      lastPath: path,
    };
    const visitor = await db.webVisitor.upsert({
      where: { id: clientId },
      create: { id: clientId, ...data, visitsCount: 1 },
      update: { ...data, visitsCount: { increment: 1 }, lastActiveAt: new Date() },
      select: { visitsCount: true },
    });
    return NextResponse.json({ ok: true, isNew: visitor.visitsCount === 1 });
  } catch (error) {
    portalLogger.error("WEB_API", "POST /api/users/web error", error);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить посещение" }, { status: 500 });
  }
}
