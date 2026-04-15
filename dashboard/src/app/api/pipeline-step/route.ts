import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PIPELINE_FILE = path.join(
  "C:\\Users\\super\\Desktop\\ai-command-center\\data",
  "pipeline.json"
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    // Expected: { card_id, step_id, status, agent, output?, timestamp? }

    let data: Record<string, unknown> = { cards: [] };
    if (fs.existsSync(PIPELINE_FILE)) {
      data = JSON.parse(fs.readFileSync(PIPELINE_FILE, "utf-8"));
    }

    const cards = (data.cards ?? []) as Array<Record<string, unknown>>;
    // Accept both camelCase (cardId/stepId) and snake_case (card_id/step_id)
    const cardId = (body.cardId ?? body.card_id) as string | undefined;
    const stepId = (body.stepId ?? body.step_id) as string | undefined;
    const card = cards.find((c) => c.id === cardId);

    if (card) {
      const steps = (card.steps ?? []) as Array<Record<string, unknown>>;
      const step = steps.find((s) => s.id === stepId);
      if (step) {
        Object.assign(step, {
          status: body.status,
          output: body.output ?? step.output,
          completedAt: body.status === "done" || body.status === "error"
            ? (body.timestamp ?? new Date().toISOString())
            : step.completedAt,
        });
      }
      card.steps = steps;
    }

    data.lastUpdate = new Date().toISOString();
    fs.writeFileSync(PIPELINE_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("pipeline-step error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
