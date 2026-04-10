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
