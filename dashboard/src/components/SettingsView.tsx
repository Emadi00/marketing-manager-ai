"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key, Bot, DollarSign,
  Check, X, RefreshCw, AlertTriangle, Loader2,
  ChevronDown, ExternalLink, Eye, EyeOff, BookOpen, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { PipelineCard, ContabilitaConfigClient } from "@/lib/data";

// ══════════════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════════════
const TABS = [
  { id: "keys",   label: "API Keys", icon: Key        },
  { id: "agents", label: "Agenti",   icon: Bot        },
  { id: "costs",  label: "Costi API", icon: DollarSign },
] as const;
type Tab = typeof TABS[number]["id"];

// ══════════════════════════════════════════════════════
//  1. API KEYS
// ══════════════════════════════════════════════════════
const KEY_META: Record<string, { label: string; description: string; docsHref: string }> = {
  anthropic:   { label: "Anthropic",          description: "Claude API — agenti AI",                   docsHref: "https://console.anthropic.com"    },
  telegram:    { label: "Telegram Bot Token",  description: "Bot @MarcheseBotService",                  docsHref: "https://t.me/BotFather"           },
  upload_post: { label: "Upload-Post",         description: "Pubblicazione social automatica",           docsHref: "https://upload-post.com"          },
  ideogram:    { label: "Ideogram",            description: "Generazione immagini AI (MCP attivo)",      docsHref: "https://ideogram.ai"              },
  pexels:      { label: "Pexels",              description: "Stock photo e video royalty-free",          docsHref: "https://www.pexels.com/api/"      },
  elevenlabs:  { label: "ElevenLabs",          description: "Text-to-speech, voce AI per i video",       docsHref: "https://elevenlabs.io"            },
  meta_token:  { label: "Meta Page Token",     description: "Instagram / Facebook Analytics + Ads",      docsHref: "https://developers.facebook.com"  },
  meta_ig_id:  { label: "Meta IG User ID",     description: "Instagram Business account ID",             docsHref: "https://developers.facebook.com"  },
};

interface KeyStatus { set: boolean; source: string; masked?: string }

function KeyRow({ id, status }: { id: string; status: KeyStatus | undefined }) {
  const [visible, setVisible] = useState(false);
  const meta = KEY_META[id] ?? { label: id, description: "", docsHref: "" };

  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-white/[0.05] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm font-medium">{meta.label}</p>
        <p className="text-white/30 text-xs mt-0.5">{meta.description}</p>
      </div>

      {status ? (
        <div className="flex items-center gap-2 shrink-0">
          {status.set ? (
            <>
              {/* Masked value + toggle */}
              <span
                className={cn(
                  "font-mono text-xs px-2 py-1 rounded border transition-all select-all",
                  visible
                    ? "text-[#39FF14] bg-[#39FF14]/5 border-[#39FF14]/20"
                    : "text-white/30 bg-white/[0.04] border-white/[0.06] blur-[2px]"
                )}
              >
                {status.masked ?? "•••••••••"}
              </span>
              <button
                onClick={() => setVisible((v) => !v)}
                title={visible ? "Nascondi" : "Mostra"}
                className="text-white/20 hover:text-white/60 transition-colors p-1 rounded"
              >
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <span className="text-[10px] text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                {status.source}
              </span>
              <span className="flex items-center gap-1 text-[#39FF14] text-xs font-semibold">
                <Check className="w-3.5 h-3.5" /> SET
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
              <X className="w-3.5 h-3.5" /> MANCANTE
            </span>
          )}
          {meta.docsHref && (
            <a href={meta.docsHref} target="_blank" rel="noopener noreferrer"
               className="text-white/20 hover:text-white/50 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ) : (
        <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
      )}
    </div>
  );
}

function ApiKeysTab() {
  const [status, setStatus] = useState<Record<string, KeyStatus> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/settings/status");
      setStatus(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setCount = status ? Object.values(status).filter((s) => s.set).length : 0;
  const total    = Object.keys(KEY_META).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-sm">
          {loading ? "Controllo…" : `${setCount}/${total} chiavi configurate`}
        </p>
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Ricontrolla
        </button>
      </div>

      {!loading && setCount < total && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-400/80 text-xs leading-relaxed">
            Alcune chiavi mancanti. Configura{" "}
            <code className="bg-white/10 px-1 rounded">.env</code> o{" "}
            <code className="bg-white/10 px-1 rounded">secrets.json</code>.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-[#111111] px-4">
        {Object.keys(KEY_META).map((id) => (
          <KeyRow key={id} id={id} status={status?.[id]} />
        ))}
      </div>

      <p className="text-[11px] text-white/20 italic">
        I valori reali non vengono mai inviati al browser — solo gli ultimi 4 caratteri e la sorgente.
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  CLAUDE.md MODAL
// ══════════════════════════════════════════════════════
interface ClaudeModalData {
  found: boolean;
  claude: string | null;
  knowledgeBase: string | null;
  path?: string;
  searched?: string;
}

function ClaudeModal({
  agentId, agentName, onClose,
}: {
  agentId: string; agentName: string; onClose: () => void;
}) {
  const [data, setData]   = useState<ClaudeModalData | null>(null);
  const [activeFile, setActiveFile] = useState<"claude" | "kb">("claude");

  useEffect(() => {
    fetch(`/api/settings/agent-claude?id=${agentId}`)
      .then((r) => r.json())
      .then((d: ClaudeModalData) => setData(d));
  }, [agentId]);

  const content = activeFile === "claude" ? data?.claude : data?.knowledgeBase;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#111111] border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <p className="text-white font-semibold text-sm">{agentName}</p>
            {data?.path && (
              <p className="text-white/25 text-[10px] font-mono mt-0.5 truncate max-w-md">{data.path}</p>
            )}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* File tabs */}
        {data?.found && (
          <div className="flex gap-1 px-5 pt-3">
            <button
              onClick={() => setActiveFile("claude")}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg transition-colors font-medium",
                activeFile === "claude"
                  ? "bg-[#39FF14]/10 text-[#39FF14]"
                  : "text-white/30 hover:text-white/60"
              )}
            >
              CLAUDE.md
            </button>
            {data.knowledgeBase && (
              <button
                onClick={() => setActiveFile("kb")}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg transition-colors font-medium",
                  activeFile === "kb"
                    ? "bg-purple-400/10 text-purple-400"
                    : "text-white/30 hover:text-white/60"
                )}
              >
                <BookOpen className="w-3 h-3 inline mr-1" />KNOWLEDGE_BASE.md
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="px-5 pb-5 pt-3 max-h-[65vh] overflow-y-auto">
          {!data ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
            </div>
          ) : !data.found ? (
            <div className="text-white/30 text-sm text-center py-8">
              <p>File CLAUDE.md non trovato.</p>
              {data.searched && (
                <p className="text-[10px] font-mono mt-2 text-white/15">Cercato: {data.searched}</p>
              )}
            </div>
          ) : (
            <pre className="text-[11.5px] font-mono text-white/50 leading-relaxed whitespace-pre-wrap">
              {content ?? "— File vuoto —"}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  2. AGENTI
// ══════════════════════════════════════════════════════
const AGENT_META = [
  { id: "marketing-manager", name: "Marketing Manager", emoji: "🎯", role: "Agente principale · Review finale · Coordinamento" },
  { id: "strategist",        name: "Strategist",        emoji: "🧠", role: "Direzione contenuti · Angolo · Priorità"           },
  { id: "copywriter",        name: "Copywriter",        emoji: "✍️", role: "Script · Caption · CTA · Hook"                    },
  { id: "cover-designer",    name: "Cover Designer",    emoji: "🎨", role: "Copertine · Visual · Asset grafici"                },
  { id: "video-editor",      name: "Video Editor",      emoji: "🎬", role: "Remotion · Sottotitoli · Render"                   },
  { id: "smm-publisher",     name: "SMM Publisher",     emoji: "📱", role: "Pubblicazione social · Upload-Post"               },
  { id: "smm-researcher",    name: "SMM Researcher",    emoji: "🔍", role: "Trend · Hook · Format · Opportunità"              },
  { id: "smm-analyst",       name: "SMM Analyst",       emoji: "📊", role: "Supporto adattamento · A/B test · Analisi"        },
];

const MODELS = [
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6",  note: "Migliore qualità · $3/M" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",   note: "Più veloce · $0.25/M"   },
  { id: "claude-opus-4-6",           label: "Opus 4.6",    note: "Massima intelligenza"    },
];

const MODEL_COLOR: Record<string, string> = {
  "claude-opus-4-6":          "text-purple-400",
  "claude-sonnet-4-6":        "text-[#00d4ff]",
  "claude-haiku-4-5-20251001":"text-[#39FF14]",
};

interface AgentCfg { enabled: boolean; model: string }

function AgentRow({
  agent, config, onChange, onViewClaude,
}: {
  agent: typeof AGENT_META[0];
  config: AgentCfg;
  onChange: (id: string, update: Partial<AgentCfg>) => void;
  onViewClaude: (id: string, name: string) => void;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const currentModel = MODELS.find((m) => m.id === config.model) ?? MODELS[0];

  return (
    <div className={cn(
      "flex items-center gap-3 py-3.5 border-b border-white/[0.05] last:border-0 transition-opacity",
      !config.enabled && "opacity-40"
    )}>
      <span className="text-xl w-7 shrink-0">{agent.emoji}</span>

      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm font-medium">{agent.name}</p>
        <p className="text-white/30 text-[11px] mt-0.5">{agent.role}</p>
      </div>

      {/* Model selector */}
      <div className="relative shrink-0">
        <button
          onClick={() => setModelOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 hover:border-white/15 transition-colors",
            MODEL_COLOR[config.model] ?? "text-white/40"
          )}
        >
          {currentModel.label}
          <ChevronDown className="w-3 h-3 text-white/30" />
        </button>
        {modelOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg border border-white/[0.10] bg-[#1a1a1a] shadow-xl overflow-hidden">
            {MODELS.map((m) => (
              <button key={m.id}
                onClick={() => { onChange(agent.id, { model: m.id }); setModelOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-xs hover:bg-white/[0.06] transition-colors border-b border-white/[0.05] last:border-0",
                  config.model === m.id ? MODEL_COLOR[m.id] : "text-white/60"
                )}
              >
                <p className="font-semibold">{m.label}</p>
                <p className="text-white/25 text-[10px] mt-0.5">{m.note}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View CLAUDE.md */}
      <button
        onClick={() => onViewClaude(agent.id, agent.name)}
        className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/60 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5 transition-colors shrink-0"
        title="Mostra CLAUDE.md"
      >
        <ChevronRight className="w-3 h-3" />CLAUDE.md
      </button>

      {/* Toggle */}
      <button
        onClick={() => onChange(agent.id, { enabled: !config.enabled })}
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors shrink-0",
          config.enabled ? "bg-[#39FF14]/80" : "bg-white/10"
        )}
        title={config.enabled ? "Disabilita" : "Abilita"}
      >
        <span className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
          config.enabled ? "translate-x-4" : "translate-x-0.5"
        )} />
      </button>

      <span className={cn(
        "text-[10px] font-mono font-semibold w-10 text-right shrink-0",
        config.enabled ? "text-[#39FF14]" : "text-white/20"
      )}>
        {config.enabled ? "ON" : "OFF"}
      </span>
    </div>
  );
}

function AgentsTab({ onViewClaude }: { onViewClaude: (id: string, name: string) => void }) {
  const [configs, setConfigs] = useState<Record<string, AgentCfg>>({});
  const [saving, setSaving]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/agent-config")
      .then((r) => r.json())
      .then((d: Record<string, AgentCfg>) => setConfigs(d))
      .catch(() => {});
  }, []);

  async function handleChange(agentId: string, update: Partial<AgentCfg>) {
    const defaults: AgentCfg = { enabled: true, model: "claude-sonnet-4-6" };
    const next = { ...defaults, ...configs[agentId], ...update };
    setConfigs((prev) => ({ ...prev, [agentId]: next }));
    setSaving(agentId);
    try {
      await fetch("/api/settings/agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, config: next }),
      });
    } finally { setSaving(null); }
  }

  const activeCount = AGENT_META.filter(
    (a) => (configs[a.id] ?? { enabled: true }).enabled
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-sm">
          {activeCount}/{AGENT_META.length} agenti attivi
          <span className="text-white/20 ml-2 text-xs">· modifiche salvate automaticamente</span>
        </p>
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-white/30">
            <Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…
          </span>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-[#111111] px-4">
        {AGENT_META.map((agent) => {
          const cfg: AgentCfg = configs[agent.id] ?? { enabled: true, model: "claude-sonnet-4-6" };
          return (
            <AgentRow
              key={agent.id}
              agent={agent}
              config={cfg}
              onChange={handleChange}
              onViewClaude={onViewClaude}
            />
          );
        })}
      </div>

      <p className="text-[11px] text-white/20 italic">
        Config salvata in{" "}
        <code className="bg-white/[0.06] px-1 rounded text-white/40">agent-dashboard-config.json</code>
        {" "}· Clicca CLAUDE.md per leggere le istruzioni di ogni agente.
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  3. COST TRACKER
// ══════════════════════════════════════════════════════
const STEP_COST_USD: Record<string, number> = {
  copywriter:       0.003,
  strategist:       0.004,
  "video-editor":   0.002,
  "cover-designer": 0.008,
  "smm-publisher":  0.001,
  human:            0,
};

// Mock daily costs for current month (used when real data is 0)
const MOCK_DAILY = [
  { day: "1",  cost: 1.24 }, { day: "2",  cost: 0.87 }, { day: "3",  cost: 2.31 },
  { day: "4",  cost: 1.95 }, { day: "5",  cost: 0.42 }, { day: "6",  cost: 1.78 },
  { day: "7",  cost: 3.12 }, { day: "8",  cost: 0.95 }, { day: "9",  cost: 1.67 },
  { day: "10", cost: 2.44 }, { day: "11", cost: 0.88 }, { day: "12", cost: 1.55 },
  { day: "13", cost: 2.18 }, { day: "14", cost: 1.92 },
];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-[#1a1a1a] border border-white/[0.10] rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-white/50 mb-1">Aprile {label}</p>
        <p className="text-[#39FF14] font-mono font-bold">${payload[0].value.toFixed(4)}</p>
      </div>
    );
  }
  return null;
};

function CostsTab({ cards, pricing }: { cards: PipelineCard[]; pricing: Record<string, ContabilitaConfigClient> }) {
  // Compute real AI cost from completed steps
  const cardCosts = cards.map((card) => {
    const cost = card.steps.reduce(
      (acc, step) => acc + (step.status === "done" ? (STEP_COST_USD[step.agentId] ?? 0) : 0),
      0
    );
    return { id: card.id, client: card.client, hook: card.hook, cost };
  });

  const totalAI     = cardCosts.reduce((a, c) => a + c.cost, 0);
  const isMock      = totalAI === 0;
  const mockTotal   = MOCK_DAILY.reduce((a, d) => a + d.cost, 0);
  const displayCost = isMock ? mockTotal : totalAI;

  // Per-client aggregation
  const clientMap: Record<string, number> = {};
  if (!isMock) {
    for (const c of cardCosts) {
      clientMap[c.client] = (clientMap[c.client] ?? 0) + c.cost;
    }
  } else {
    Object.assign(clientMap, { "VideoCraft Studio": 6.82, "Francesco Corsi": 4.21, "Ristomedia": 3.25, "Interno / R&D": 2.01 });
  }
  const clientRows = Object.entries(clientMap).sort((a, b) => b[1] - a[1]);
  const maxClient  = Math.max(...clientRows.map((c) => c[1]), 0.001);

  // Monthly summary
  const monthly = [
    { month: "Gennaio 2026", cost: 0.12, fatturato: 480, pagato: true  },
    { month: "Febbraio 2026", cost: 0.21, fatturato: 620, pagato: true  },
    { month: "Marzo 2026",   cost: 0.34, fatturato: 750, pagato: false },
    { month: "Aprile 2026",  cost: displayCost, fatturato: 0, pagato: false },
  ];

  const billingRows = Object.entries(pricing).slice(0, 6).map(([client, cfg]) => ({
    client, costoXShort: cfg.costoXShort, statoPagamento: cfg.statoPagamento,
  }));

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "AI Cost — Aprile", value: `$${displayCost.toFixed(isMock ? 2 : 4)}`, note: isMock ? "Dati mock — nessun costo reale" : "Stima da step completati", color: "#39FF14" },
          { label: "Pipeline attive",  value: String(cards.length),   note: "Contenuti in lavorazione", color: "#00d4ff" },
          { label: "Modello default",  value: "Sonnet 4.6",           note: "$3/M input · $15/M output", color: "#a855f7" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
            <p className="text-white/40 text-xs mb-2">{k.label}</p>
            <p className="font-bold text-xl" style={{ color: k.color }}>{k.value}</p>
            <p className="text-white/25 text-[11px] mt-1">{k.note}</p>
          </div>
        ))}
      </div>

      {isMock && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <p className="text-amber-400/70 text-xs">Nessun costo reale nella pipeline — grafico con dati mock per Aprile 2026.</p>
        </div>
      )}

      {/* Bar chart — daily costs */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">
          Costo Giornaliero — Aprile 2026
        </h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MOCK_DAILY} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="cost" fill="#39FF14" fillOpacity={0.7} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-client */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Costo per Cliente</h3>
        <div className="space-y-3">
          {clientRows.map(([client, cost]) => (
            <div key={client}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-white/60">{client}</span>
                <span className="text-white/70 font-mono">${cost.toFixed(4)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-[#39FF14]/60"
                     style={{ width: `${Math.round((cost / maxClient) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline costs */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Costo per Pipeline</h3>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {(isMock
            ? [
                { hook: "Video fermi nel telefono? Pronti in 48h", client: "VideoCraft Studio", cost: 0.0312 },
                { hook: "Il J-Cut che ogni editor deve sapere",    client: "VideoCraft Studio", cost: 0.0287 },
                { hook: "Wu Xing — Cuore / Fuoco",                client: "Francesco Corsi",   cost: 0.0198 },
              ]
            : cardCosts.filter((c) => c.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 8)
          ).map((c, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2.5">
              <p className="text-white/60 text-xs flex-1 truncate" title={"hook" in c ? c.hook : ""}>
                {"hook" in c ? c.hook : ""}
              </p>
              <span className="text-white/30 text-xs shrink-0">{c.client}</span>
              <span className="text-white/70 text-xs font-mono shrink-0">${c.cost.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly summary */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Riepilogo Mensile</h3>
          <span className="text-[10px] text-white/20 italic">gen-mar: mock</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {monthly.map((m) => (
            <div key={m.month} className="flex items-center gap-4 px-4 py-2.5">
              <p className="text-white/60 text-xs w-36 shrink-0">{m.month}</p>
              <div className="flex-1 flex items-center gap-4 text-xs">
                <span className="text-white/30">AI: <span className="text-white/60 font-mono">${m.cost.toFixed(4)}</span></span>
                <span className="text-white/30">Fatturato: <span className="text-white/60 font-mono">€{m.fatturato.toLocaleString("it-IT")}</span></span>
              </div>
              <span className={cn(
                "text-[11px] px-2 py-0.5 rounded-full border shrink-0",
                m.pagato
                  ? "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5"
                  : "text-amber-400 border-amber-400/20 bg-amber-400/5"
              )}>
                {m.pagato ? "Pagato" : "Da fatturare"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Client pricing */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Pricing Clienti</h3>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {billingRows.map((row) => (
            <div key={row.client} className="flex items-center gap-4 px-4 py-2.5">
              <p className="text-white/70 text-sm flex-1 truncate">{row.client}</p>
              <span className="text-white/40 text-xs font-mono">€{row.costoXShort}/short</span>
              <span className={cn(
                "text-[11px] px-2 py-0.5 rounded-full border shrink-0",
                row.statoPagamento === "Pagato"
                  ? "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5"
                  : "text-amber-400 border-amber-400/20 bg-amber-400/5"
              )}>
                {row.statoPagamento}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



// ══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════
interface Props {
  cards: PipelineCard[];
  pricing: Record<string, ContabilitaConfigClient>;
}

export function SettingsView({ cards, pricing }: Props) {
  const [tab, setTab]     = useState<Tab>("keys");
  const [claudeModal, setClaudeModal] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white">Impostazioni</h1>
        <p className="text-white/40 text-xs mt-0.5">
          Configurazione sistema · API keys · Agenti · Costi API
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-8 py-3 border-b border-white/[0.06] overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
              tab === id
                ? "bg-[#39FF14]/10 text-[#39FF14]"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {tab === "keys"   && <ApiKeysTab />}
        {tab === "agents" && <AgentsTab onViewClaude={(id, name) => setClaudeModal({ id, name })} />}
        {tab === "costs"  && <CostsTab cards={cards} pricing={pricing} />}
      </div>

      {/* CLAUDE.md modal */}
      {claudeModal && (
        <ClaudeModal
          agentId={claudeModal.id}
          agentName={claudeModal.name}
          onClose={() => setClaudeModal(null)}
        />
      )}
    </div>
  );
}
