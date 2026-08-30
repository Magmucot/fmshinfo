import { NextResponse } from "next/server";
import { cached, TTL } from "@/lib/server/cache";
import { getClasses } from "@/lib/server/tableSesc";

export const dynamic = "force-dynamic";

/** GET /api/classes — список классов (8-1 … 11-7) */
export async function GET() {
  try {
    const { data, stale } = await cached("classes", TTL.schedule, getClasses);
    return NextResponse.json({ ok: true, ...data, stale });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
