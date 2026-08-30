import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/document — полный аналитический документ
 * (docs/sunc-info-analysis.md: источники, форматы, парсеры, архитектура).
 */
export async function GET() {
  try {
    const docPath = path.join(process.cwd(), "docs", "sunc-info-analysis.md");
    const markdown = await readFile(docPath, "utf-8");
    return NextResponse.json({ ok: true, markdown, size: markdown.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Документ не найден: " + (error as Error).message },
      { status: 404 }
    );
  }
}
