import { NextResponse } from "next/server";

/** GET /api — статус API «СУНЦ Инфо» */
export async function GET() {
  return NextResponse.json({
    ok: true,
    name: "СУНЦ Инфо API",
    endpoints: [
      "/api/menu?date=ДД.ММ.ГГГГ",
      "/api/bells",
      "/api/classes",
      "/api/schedule?group=10-1",
      "/api/weather",
      "/api/news?limit=12",
      "/api/duty?date=ДД.ММ.ГГГГ (GET/POST/DELETE)",
      "/api/counselors?date=ДД.ММ.ГГГГ (GET/POST/DELETE)",
      "/api/feedback (GET/POST/DELETE)",
      "/api/admin/system",
      "/api/admin/logs",
      "/api/info",
      "/api/document",
    ],
    docs: "docs/sunc-info-analysis.md",
  });
}
