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
  deadline?: string; // YYYY-MM-DD — scadenza consegna
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

// ── Performance ───────────────────────────────────────────────────────────

export interface PlatformStats {
  followers: number | null;
  growth: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  reach: number | null;
  reelsPlays: number | null;
  dailyData: Array<{ date: string; views?: number; likes?: number }>;
  _syncError?: string | null; // set when last sync failed for this platform
}

export interface PerformanceClient {
  name: string;
  emoji: string;
  niche: string;
  trend: string;
  lastSync: string;
  platforms: Record<string, PlatformStats>;
}

export interface PerformanceData {
  lastUpdate: string;
  clients: PerformanceClient[];
}

export function readPerformance(): PerformanceData {
  const fp = path.join(DATA_DIR, "performance.json");
  if (!fs.existsSync(fp)) return { lastUpdate: "", clients: [] };
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as PerformanceData;
}

// ── Contabilità ────────────────────────────────────────────────────────────

export interface ContabilitaClientRow {
  cliente: string;
  videoShorts: number;
  videoLong: number;
  costoXVideo: number;
  costoEditor: number;
  costoAI: number;
  fattura: number;
  editor: string;
  statoPagamento: string;
  note: string;
}

export interface ContabilitaMese {
  clienti: ContabilitaClientRow[];
  costi: Array<{ nome: string; tipo: string; costoMensile: number; note: string }>;
}

export function readContabilita(): Record<string, Record<string, ContabilitaMese>> {
  const fp = path.join(DATA_DIR, "contabilita.json");
  if (!fs.existsSync(fp)) return {};
  const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as Record<string, unknown>;
  // Remove internal _note key
  const { _note: _, ...years } = raw as Record<string, Record<string, ContabilitaMese>>;
  return years;
}

// ── Clienti Social ────────────────────────────────────────────────────────

export interface ClienteSocial {
  name: string;
  user: string;
  platforms: string[];
  notes: string;
}

export function readClientiSocial(): ClienteSocial[] {
  const SMM_PATH = "C:\\Users\\super\\Desktop\\MARKETING MANAGER";
  const fp = path.join(SMM_PATH, "clienti_social.json");
  if (!fs.existsSync(fp)) return [];
  const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as Record<string, unknown>;
  return Object.entries(raw)
    .filter(([k]) => k !== "_note")
    .map(([name, v]) => {
      const val = v as Record<string, unknown>;
      return {
        name,
        user: (val.user as string) ?? "",
        platforms: (val.platforms as string[]) ?? [],
        notes: (val.notes as string) ?? "",
      };
    });
}

export interface TipologiaVideo {
  nome: string;
  prezzo: number;
  videiFatti: number;
  videoInclusi: number; // 0 = illimitati / non applicabile
}

export interface ContabilitaConfigClient {
  tipologie: TipologiaVideo[];
  statoPagamento: string;
  tipoContratto: "pacchetto" | "a-video";
  // legacy fields (backward compat)
  costoXShort?: number;
  costoXLong?: number;
  videiFatti?: number;
}

export function readContabilitaConfig(): Record<string, ContabilitaConfigClient> {
  const fp = path.join(DATA_DIR, "contabilita_config.json");
  if (!fs.existsSync(fp)) return {};
  const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as Record<string, unknown>;
  return (raw.clienti as Record<string, ContabilitaConfigClient>) ?? {};
}

// ── Analytics helpers ──────────────────────────────────────────────────────

export interface PipelineFunnelStep {
  label: string;
  count: number;
}

export function computePipelineFunnel(): PipelineFunnelStep[] {
  const { cards } = readPipeline();
  const stepCounts: Record<string, number> = {};
  for (const card of cards) {
    for (const step of card.steps) {
      if (step.status === "done") {
        stepCounts[step.name] = (stepCounts[step.name] ?? 0) + 1;
      }
    }
  }
  const ORDER = ["Brief Creativo", "Strategia", "Video Remotion", "Approvazione", "Pubblicazione"];
  return ORDER.map((label) => ({ label, count: stepCounts[label] ?? 0 }));
}

export function computeMonthlyProduction(): Array<{ month: string; prodotti: number; pubblicati: number }> {
  const { cards } = readPipeline();
  const byMonth: Record<string, { prodotti: number; pubblicati: number }> = {};
  for (const card of cards) {
    const m = card.createdAt?.slice(0, 7) ?? "unknown";
    if (!byMonth[m]) byMonth[m] = { prodotti: 0, pubblicati: 0 };
    byMonth[m].prodotti += 1;
    if (card.status === "Pubblicato") byMonth[m].pubblicati += 1;
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
}

// ── Agents ────────────────────────────────────────────────────────────────

export interface AgentMetrics {
  tasksCompleted?: number;
  approvalRate?: number;
  avgReviewTime?: string;
  [key: string]: unknown;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  category: string;
  status: "idle" | "running" | "error" | "waiting";
  currentTask: string | null;
  progress: number;
  lastOutput: string | null;
  lastUpdate: string | null;
  tasksToday: number;
  recentTasks: string[];
  metrics: AgentMetrics;
}

export interface AgentsData {
  lastUpdate: string | null;
  agents: Agent[];
}

export function readAgents(): AgentsData {
  const fp = path.join(DATA_DIR, "agents.json");
  if (!fs.existsSync(fp)) return { lastUpdate: null, agents: [] };
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as AgentsData;
}

// ── Connections ───────────────────────────────────────────────────────────

export interface PlatformConnection {
  name: string;
  icon: string;
  status: "connected" | "disconnected" | "expired";
  handle?: string | null;
  accountId?: string;
  accessLevel?: string;
  connectedAt?: string;
  note?: string;
  assets?: Array<{ type: string; name: string; id: string }>;
  authorizedAgents?: string[];
}

export interface ClientConnections {
  name: string;
  platforms: Record<string, PlatformConnection>;
}

export interface ConnectionsData {
  lastUpdate: string;
  clients: Record<string, ClientConnections>;
}

export function readConnections(): ConnectionsData {
  const fp = path.join(DATA_DIR, "connections.json");
  if (!fs.existsSync(fp))
    return { lastUpdate: "", clients: {} };
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as ConnectionsData;
}

// ── Ideas ─────────────────────────────────────────────────────────────────

export interface ContentIdea {
  id?: string;
  hook: string;
  angle?: string;
  format?: string;
  priority?: string;
  status?: string;
}

export interface IdeasClient {
  id: string;
  name: string;
  emoji: string;
  niche: string;
  reels: ContentIdea[];
  posts: ContentIdea[];
  carousels: ContentIdea[];
}

export interface IdeasData {
  lastUpdate: string | null;
  clients: IdeasClient[];
}

export function readIdeas(): IdeasData {
  const fp = path.join(DATA_DIR, "ideas.json");
  if (!fs.existsSync(fp)) return { lastUpdate: null, clients: [] };
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as IdeasData;
}

// ── Trading ────────────────────────────────────────────────────────────────

export interface TradingAccount {
  broker: string;
  initialValue: number;
  currentValue: number;
  peakValue: number;
  monthlyStartValue: number;
  dailyPnL: number;
  dailyPnLPct: number;
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  circuitBreaker: boolean;
}

export interface AllocationEntry {
  pct: number;
  value: number;
  return: number;
}

export interface TradingData {
  lastUpdate: string;
  account: TradingAccount;
  regime: Record<string, unknown>;
  allocation: Record<string, AllocationEntry>;
  positions?: unknown[];
  recentTrades?: unknown[];
  weeklyPnL?: unknown[];
  signals?: unknown[];
  strategies?: unknown[];
}

export function readTrading(): TradingData | null {
  const fp = path.join(DATA_DIR, "trading.json");
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as TradingData;
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
