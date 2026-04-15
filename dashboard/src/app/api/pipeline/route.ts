import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PIPELINE_FILE = path.join(
  "C:\\Users\\super\\Desktop\\ai-command-center\\data",
  "pipeline.json"
);

// ── Default steps per nuove pipeline ──────────────────────────────────────

function buildDefaultSteps(type: string) {
  const isYoutube  = type === "YouTube";
  const isLinkedin = type === "LinkedIn";

  const steps = [
    { id: "step_1", name: "Brief Creativo",  agent: "Human",        agentId: "human",               description: "Brief approvato dalla dashboard", status: "done",    completedAt: new Date().toISOString() },
    { id: "step_2", name: "Strategia",        agent: "Strategist",   agentId: "strategist",           description: "Strategia e ricerca contenuti",    status: "pending", completedAt: null },
    { id: "step_3", name: isYoutube ? "Video Editing" : isLinkedin ? "Copywriting" : "Video Remotion", agent: isLinkedin ? "Copywriter" : "Video Editor", agentId: isLinkedin ? "copywriter" : "video-editor", description: "Produzione contenuto", status: "pending", completedAt: null },
    { id: "step_4", name: "Approvazione",     agent: "Human",        agentId: "human",               description: "Review e approvazione finale",     status: "pending", completedAt: null },
    { id: "step_5", name: "Pubblicazione",    agent: "SMM Publisher", agentId: "smm-publisher",      description: "Pubblicazione sui social",         status: "pending", completedAt: null },
  ];

  return steps;
}

async function applyStatusUpdate(id: string, status: string): Promise<{ ok: boolean; error?: string; code?: number }> {
  const data = JSON.parse(fs.readFileSync(PIPELINE_FILE, "utf-8"));
  const card = (data.cards ?? []).find((c: { id: string }) => c.id === id);
  if (!card) return { ok: false, error: "card non trovata", code: 404 };

  card.status = status;
  // Se si conclude, marca tutti gli step non-done come done
  if (status === "Approvato" || status === "Pubblicato") {
    for (const step of card.steps ?? []) {
      if (step.status !== "done" && step.status !== "error") {
        step.status = "done";
        step.completedAt = new Date().toISOString();
      }
    }
  }

  data.lastUpdate = new Date().toISOString();
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(data, null, 2));
  return { ok: true };
}

// PATCH: aggiorna lo status di una card (da UI dashboard)
export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json() as { id: string; status: string };
    if (!id || !status) return NextResponse.json({ ok: false, error: "id/status mancante" }, { status: 400 });
    const result = await applyStatusUpdate(id, status);
    if (!result.ok) return NextResponse.json(result, { status: result.code ?? 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST: aggiorna lo status di una card (da bot Telegram via _dashboard_post)
export async function POST(req: NextRequest) {
  try {
    const { id, status } = await req.json() as { id: string; status: string };
    if (!id || !status) return NextResponse.json({ ok: false, error: "id/status mancante" }, { status: 400 });
    const result = await applyStatusUpdate(id, status);
    if (!result.ok) return NextResponse.json(result, { status: result.code ?? 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// PUT: crea una nuova pipeline card dalla dashboard
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      client: string;
      type: string;
      hook: string;
      priority: "alta" | "media" | "bassa";
      deadline?: string;
    };

    const { client, type, hook, priority, deadline } = body;
    if (!client || !type || !hook) {
      return NextResponse.json({ ok: false, error: "client, type e hook sono obbligatori" }, { status: 400 });
    }

    const data = fs.existsSync(PIPELINE_FILE)
      ? JSON.parse(fs.readFileSync(PIPELINE_FILE, "utf-8")) as { cards: unknown[]; lastUpdate: string }
      : { cards: [], lastUpdate: "" };

    const id = `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const today = new Date().toISOString().slice(0, 10);

    const newCard = {
      id,
      title: hook,
      client,
      type,
      priority,
      hook,
      angle: "",
      status: "In Lavorazione",
      createdAt: today,
      deadline: deadline ?? null,
      currentStep: 1,
      steps: buildDefaultSteps(type),
      log: [{ time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }), ts: new Date().toISOString(), msg: "Pipeline creata dalla dashboard", type: "start" }],
    };

    (data.cards as unknown[]).push(newCard);
    data.lastUpdate = new Date().toISOString();
    fs.writeFileSync(PIPELINE_FILE, JSON.stringify(data, null, 2));

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

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
