import fs from "fs";
import path from "path";

export const DATA_DIR = "C:\\Users\\super\\Desktop\\ai-command-center\\data";

// ── Types ──────────────────────────────────────────────────────────────────

export type StepStatus = "done" | "error" | "in_progress" | "pending";

export interface PipelineStep {
  id: string;
  name: string;
  agent: string;
  agentId: string;
  description: string;
  status: StepStatus;
  output?: string;
  outputPath?: string;
  completedAt?: string | null;
}

export interface LogEntry {
  time: string;
  ts: string;
  msg: string;
  output?: string;
  type: "done" | "error" | "info" | "start";
}

export type CardStatus =
  | "Idea"
  | "In Lavorazione"
  | "In Approvazione"
  | "Approvato"
  | "Pubblicato";

export interface PipelineCard {
  id: string;
  title: string;
  client: string;
  type: string;
  priority: "alta" | "media" | "bassa";
  hook: string;
  angle?: string;
  status: CardStatus;
  createdAt: string;
  currentStep: number;
  steps: PipelineStep[];
  log?: LogEntry[];
}

export interface PipelineData {
  lastUpdate: string;
  cards: PipelineCard[];
}

// ── Readers ────────────────────────────────────────────────────────────────

export function readPipeline(): PipelineData {
  const fp = path.join(DATA_DIR, "pipeline.json");
  if (!fs.existsSync(fp)) return { lastUpdate: "", cards: [] };
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as PipelineData;
}

export function readClients(): string[] {
  const data = readPipeline();
  const set = new Set(data.cards.map((c) => c.client).filter(Boolean));
  return Array.from(set).sort();
}

// ── SMM Log ───────────────────────────────────────────────────────────────

export interface SmmLogEntry {
  timestamp: string;
  client_id: string;
  user: string;
  platforms: string[];
  scheduled: string | null;
  video: string;
  status: "ok" | "error" | "pending";
  request_id: string | null;
  job_id: string | null;
  error?: string;
}

export function readSmmLog(): SmmLogEntry[] {
  const fp = path.join(
    "C:\\Users\\super\\Desktop\\MARKETING MANAGER",
    "smm_log.json"
  );
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as SmmLogEntry[];
  } catch {
    return [];
  }
}

// ── Calendar ───────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  client: string;
  type: string;
  status: CardStatus | "pubblicato_log";
  platforms: string[];
  date: string; // YYYY-MM-DD
  source: "pipeline" | "smm_log";
}

const PLATFORM_FROM_TYPE: Record<string, string[]> = {
  "Reel + Carosello": ["instagram", "tiktok"],
  Reel: ["instagram", "tiktok"],
  Carosello: ["instagram"],
  YouTube: ["youtube"],
  LinkedIn: ["linkedin"],
  Facebook: ["facebook"],
};

function isoToDate(iso: string): string {
  return iso.slice(0, 10);
}

export function readCalendarEvents(month: string): CalendarEvent[] {
  // month = "YYYY-MM"
  const events: CalendarEvent[] = [];

  // 1. From pipeline cards
  const { cards } = readPipeline();
  for (const card of cards) {
    // Use publication date if available, else creation date
    const smmStep = card.steps.find((s) => s.agentId === "smm-publisher");
    const pubDate =
      smmStep?.completedAt && smmStep.status === "done"
        ? isoToDate(smmStep.completedAt)
        : null;
    const date = pubDate ?? card.createdAt;

    if (!date.startsWith(month)) continue;

    events.push({
      id: card.id,
      title: card.hook || card.title,
      client: card.client,
      type: card.type,
      status: card.status,
      platforms: PLATFORM_FROM_TYPE[card.type] ?? [],
      date,
      source: "pipeline",
    });
  }

  // 2. From smm_log (successful publications)
  const log = readSmmLog();
  for (const entry of log) {
    const date = isoToDate(entry.timestamp);
    if (!date.startsWith(month)) continue;
    if (entry.status !== "ok") continue;

    events.push({
      id: `smm-${entry.timestamp}-${entry.client_id}`,
      title: entry.video ?? "Video pubblicato",
      client: entry.client_id,
      type: "Pubblicazione",
      status: "pubblicato_log",
      platforms: entry.platforms,
      date,
      source: "smm_log",
    });
  }

  return events;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function cardCost(card: PipelineCard): string {
  // No per-card cost in this version — placeholder
  return "—";
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}
