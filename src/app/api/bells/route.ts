import { NextResponse } from "next/server";
import { cached, TTL } from "@/lib/server/cache";
import { getBells } from "@/lib/server/tableSesc";

export const dynamic = "force-dynamic";

/** GET /api/bells — расписание звонков (API + статический список) */
export async function GET() {
  try {
    const { data, stale } = await cached("bells", TTL.schedule, getBells);
    return NextResponse.json({ ok: true, ...data, stale });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
