import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONTABILITA_FILE = path.join(
  "C:\\Users\\super\\Desktop\\ai-command-center\\data",
  "contabilita.json"
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body: { pipeline_id, client, agent, cost_usd, tokens_in, tokens_out, timestamp? }

    let data: Record<string, unknown[]> = { entries: [] };
    if (fs.existsSync(CONTABILITA_FILE)) {
      data = JSON.parse(fs.readFileSync(CONTABILITA_FILE, "utf-8"));
    }

    const entries = (data.entries ?? []) as Array<Record<string, unknown>>;
    entries.unshift({
      ...body,
      timestamp: body.timestamp ?? new Date().toISOString(),
    });
    // Keep last 1000 entries
    if (entries.length > 1000) entries.splice(1000);

    data.entries = entries;
    fs.writeFileSync(CONTABILITA_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("pipeline-cost error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
