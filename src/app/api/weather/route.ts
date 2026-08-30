import { NextResponse } from "next/server";
import { cached, TTL } from "@/lib/server/cache";
import { getWeather } from "@/lib/server/weather";

export const dynamic = "force-dynamic";

/** GET /api/weather — погода в Академгородке (Open-Meteo → wttr.in) */
export async function GET() {
  try {
    const { data, stale } = await cached("weather", TTL.weather, getWeather);
    return NextResponse.json({ ok: true, ...data, stale });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
