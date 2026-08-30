import { NextResponse } from "next/server";
import { SCHOOL_INFO } from "@/lib/server/sources";

export const dynamic = "force-dynamic";

/** GET /api/info — справочник контактов, ссылок и режимов работы */
export async function GET() {
  return NextResponse.json({ ok: true, ...SCHOOL_INFO });
}
