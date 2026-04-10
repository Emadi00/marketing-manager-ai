import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PIPELINE_FILE = path.join(
  "C:\\Users\\super\\Desktop\\ai-command-center\\data",
  "pipeline.json"
);

// DELETE: rimuove una card per ID
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ ok: false, error: "id mancante" }, { status: 400 });

    const data = JSON.parse(fs.readFileSync(PIPELINE_FILE, "utf-8"));
    const before = (data.cards ?? []).length;
    data.cards = (data.cards ?? []).filter((c: { id: string }) => c.id !== id);

    if (data.cards.length === before) {
      return NextResponse.json({ ok: false, error: "card non trovata" }, { status: 404 });
    }

    data.lastUpdate = new Date().toISOString();
    fs.writeFileSync(PIPELINE_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
