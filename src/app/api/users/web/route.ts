import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

interface WebVisitorPayload {
  clientId?: string;
  className?: string | null;
  userAgent?: string | null;
  path?: string | null;
}

/**
 * POST /api/users/web
 * Регистрирует или обновляет сессию посетителя веб-портала.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WebVisitorPayload;
    const clientId = (body.clientId ?? "").trim();
    if (!clientId) {
      portalLogger.warn("WEB_API", "POST /api/users/web rejected: missing clientId");
      return NextResponse.json({ ok: false, error: "Отсутствует clientId" }, { status: 400 });
    }

    const className = body.className ? body.className.trim() : null;
    const userAgent = body.userAgent ? body.userAgent.slice(0, 500) : request.headers.get("user-agent")?.slice(0, 500) ?? null;
    const path = body.path ? body.path.slice(0, 200) : null;

    const existing = await db.webVisitor.findUnique({
      where: { id: clientId },
    });

    const now = new Date();

    if (existing) {
      const updated = await db.webVisitor.update({
        where: { id: clientId },
        data: {
          className: className ?? existing.className,
          userAgent: userAgent ?? existing.userAgent,
          lastPath: path ?? existing.lastPath,
          visitsCount: { increment: 1 },
          lastActiveAt: now,
        },
      });
      portalLogger.info("WEB_VISITOR", `Visitor ${clientId} active on ${path ?? "/"} | class=${className ?? existing.className ?? "none"} (visits: ${updated.visitsCount})`);
      return NextResponse.json({ ok: true, visitor: updated, isNew: false });
    } else {
      const created = await db.webVisitor.create({
        data: {
          id: clientId,
          className,
          userAgent,
          lastPath: path,
          visitsCount: 1,
          firstSeenAt: now,
          lastActiveAt: now,
        },
      });
      portalLogger.info("WEB_VISITOR", `New web visitor ${clientId} on ${path ?? "/"} | class=${className ?? "none"}`);
      return NextResponse.json({ ok: true, visitor: created, isNew: true });
    }
  } catch (error) {
    portalLogger.error("WEB_API", "POST /api/users/web error", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
