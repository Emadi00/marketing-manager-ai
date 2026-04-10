"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key, Bot, Euro, Check, X, ChevronDown,
  RefreshCw, ExternalLink, AlertTriangle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineCard, ContabilitaConfigClient } from "@/lib/data";

// ── Tab system ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "keys",   label: "API Keys",   icon: Key  },
  { id: "agents", label: "Agenti",     icon: Bot  },
  { id: "costs",  label: "Costi",      icon: Euro },
] as const;
type Tab = typeof TABS[number]["id"];

// ── API KEY STATUS ─────────────────────────────────────────────────────────

const KEY_META: Record<string, { label: string; description: string; docsHref: string }> = {
  anthropic:   { label: "Anthropic",          description: "Claude API — agenti AI",           docsHref: "https://console.anthropic.com" },
  telegram:    { label: "Telegram Bot Token",  description: "Bot @MarcheseBotService",          docsHref: "https://t.me/BotFather" },
  upload_post: { label: "Upload-Post",         description: "Pubblicazione social automatica",   docsHref: "https://upload-post.com" },
  ideogram:    { label: "Ideogram",            description: "Generazione immagini AI",           docsHref: "https://ideogram.ai" },
  meta_token:  { label: "Meta Page Token",     description: "Instagram / Facebook Ads + Analytics", docsHref: "https://developers.facebook.com" },
  meta_ig_id:  { label: "Meta IG User ID",     description: "Instagram Business account ID",    docsHref: "https://developers.facebook.com" },
};

interface KeyStatus { set: boolean; source: string; masked?: string }

function KeyRow({ id, status }: { id: string; status: KeyStatus | undefined }) {
  const meta = KEY_META[id] ?? { label: id, description: "", docsHref: "" };
  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/[0.05] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm font-medium">{meta.label}</p>
        <p className="text-white/30 text-xs mt-0.5">{meta.description}</p>
      </div>
      {status ? (
        <div className="flex items-center gap-3 shrink-0">
          {status.set ? (
            <>
              <span className="font-mono text-xs text-white/30 bg-white/[0.04] px-2 py-1 rounded border border-white/[0.06]">
                {status.masked ?? "•••••••••"}
              </span>
              <span className="text-[11px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                {status.source}
              </span>
              <span className="flex items-center gap-1 text-[#39FF14] text-xs font-medium">
                <Check className="w-3.5 h-3.5" /> SET
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
              <X className="w-3.5 h-3.5" /> MANCANTE
            </span>
          )}
          {meta.docsHref && (
            <a
              href={meta.docsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/20 hover:text-white/50 transition-colors"
            >
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setCount = status ? Object.values(status).filter((s) => s.set).length : 0;
  const total = Object.keys(KEY_META).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-sm">
          {loading ? "Controllo…" : `${setCount}/${total} chiavi configurate`}
        </p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Ricontrolla
        </button>
      </div>

      {!loading && setCount < total && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-400/80 text-xs leading-relaxed">
            Alcune chiavi mancanti. Configura il file{" "}
            <code className="bg-white/10 px-1 rounded">.env</code> nella root del
            progetto oppure aggiungi i valori in{" "}
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
        I valori reali non vengono mai inviati al browser — solo lo stato (SET/MANCANTE)
        e gli ultimi 4 caratteri.
      </p>
    </div>
  );
}

// ── AGENT CONFIG ──────────────────────────────────────────────────────────

const AGENT_META = [
  { id: "marketing-manager", name: "Marketing Manager", emoji: "🎯", role: "Agente principale · Review finale · Coordinamento" },
  { id: "strategist",        name: "Strategist",        emoji: "🧠", role: "Direzione contenuti · Angolo · Priorità" },
  { id: "copywriter",        name: "Copywriter",        emoji: "✍️", role: "Script · Caption · CTA · Hook" },
  { id: "cover-designer",    name: "Cover Designer",    emoji: "🎨", role: "Copertine · Visual · Asset grafici" },
  { id: "video-editor",      name: "Video Editor",      emoji: "🎬", role: "Remotion · Sottotitoli · Render" },
  { id: "smm-publisher",     name: "SMM Publisher",     emoji: "📱", role: "Pubblicazione social · Upload-Post" },
];

const MODELS = [
  { id: "claude-sonnet-4-6",        label: "Sonnet 4.6",  note: "Migliore qualità · $3/M" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",  note: "Più veloce · $0.25/M" },
];

interface AgentCfg { enabled: boolean; model: string }

function AgentRow({
  agent,
  config,
  onChange,
}: {
  agent: typeof AGENT_META[0];
  config: AgentCfg;
  onChange: (id: string, update: Partial<AgentCfg>) => void;
}) {
  const [open, setOpen] = useState(false);
  const claudeMdPath = `C:\\Users\\super\\Desktop\\MARKETING MANAGER\\agents\\${agent.id}\\CLAUDE.md`;

  return (
    <div className={cn(
      "border-b border-white/[0.05] last:border-0 transition-colors",
      !config.enabled && "opacity-50"
    )}>
      <div className="flex items-center gap-3 py-3">
        <span className="text-lg w-7">{agent.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white/80 text-sm font-medium">{agent.name}</p>
          <p className="text-white/30 text-[11px] mt-0.5">{agent.role}</p>
        </div>

        {/* Model selector */}
        <div className="relative shrink-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-white/40 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 hover:border-white/15 transition-colors"
          >
            {MODELS.find((m) => m.id === config.model)?.label ?? "Sonnet 4.6"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-white/[0.10] bg-[#1a1a1a] shadow-xl overflow-hidden">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onChange(agent.id, { model: m.id }); setOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-white/[0.06] transition-colors",
                    config.model === m.id && "text-[#39FF14]"
                  )}
                >
                  <p className="font-medium">{m.label}</p>
                  <p className="text-white/30 text-[10px]">{m.note}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Enable/disable toggle */}
        <button
          onClick={() => onChange(agent.id, { enabled: !config.enabled })}
          className={cn(
            "relative w-9 h-5 rounded-full transition-colors shrink-0",
            config.enabled ? "bg-[#39FF14]/80" : "bg-white/10"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
              config.enabled ? "translate-x-4" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      {/* CLAUDE.md path hint */}
      <p className="text-[10px] text-white/15 pb-2.5 pl-10 font-mono truncate">
        {claudeMdPath}
      </p>
    </div>
  );
}

function AgentsTab() {
  const [configs, setConfigs] = useState<Record<string, AgentCfg>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Load saved config
  useEffect(() => {
    fetch("/api/settings/agent-config")
      .then((r) => r.json())
      .then((data: Record<string, AgentCfg>) => setConfigs(data))
      .catch(() => {});
  }, []);

  async function handleChange(agentId: string, update: Partial<AgentCfg>) {
    const current = configs[agentId] ?? { enabled: true, model: "claude-sonnet-4-6" };
    const next = { ...current, ...update };
    setConfigs((prev) => ({ ...prev, [agentId]: next }));
    setSaving(agentId);
    try {
      await fetch("/api/settings/agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, config: next }),
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-white/40 text-sm">
        Attiva/disattiva agenti e scegli il modello. Le modifiche vengono salvate
        immediatamente in{" "}
        <code className="bg-white/[0.06] px-1 rounded text-white/50">
          agent-dashboard-config.json
        </code>
        .
      </p>
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] px-4">
        {AGENT_META.map((agent) => {
          const cfg: AgentCfg = configs[agent.id] ?? {
            enabled: true,
            model: "claude-sonnet-4-6",
          };
          return (
            <div key={agent.id} className="relative">
              {saving === agent.id && (
                <div className="absolute right-0 top-3">
                  <Loader2 className="w-3 h-3 text-white/20 animate-spin" />
                </div>
              )}
              <AgentRow agent={agent} config={cfg} onChange={handleChange} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── COST TRACKER ─────────────────────────────────────────────────────────

interface CostProps {
  cards: PipelineCard[];
  pricing: Record<string, ContabilitaConfigClient>;
}

// Estimated token cost per step (rough average from real usage)
const STEP_COST_USD: Record<string, number> = {
  copywriter:    0.003,
  strategist:    0.004,
  "video-editor": 0.002,
  "cover-designer": 0.008,
  "smm-publisher": 0.001,
  human: 0,
};

function CostBar({ label, value, max, color = "#39FF14" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 font-mono">${value.toFixed(4)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function CostsTab({ cards, pricing }: CostProps) {
  // Compute estimated AI cost per card
  const cardCosts = cards.map((card) => {
    const cost = card.steps.reduce((acc, step) => {
      if (step.status === "done") {
        return acc + (STEP_COST_USD[step.agentId] ?? 0);
      }
      return acc;
    }, 0);
    return { id: card.id, client: card.client, hook: card.hook, cost };
  });

  const totalAI = cardCosts.reduce((a, c) => a + c.cost, 0);
  const maxCardCost = Math.max(...cardCosts.map((c) => c.cost), 0.001);

  // Billing from contabilita_config
  const billingRows = Object.entries(pricing).slice(0, 8).map(([client, cfg]) => ({
    client,
    costoXShort: cfg.costoXShort,
    statoPagamento: cfg.statoPagamento,
  }));

  // Monthly totals (mock for now — TODO when contabilita.json has real data)
  const mockMonthly = [
    { month: "Gennaio 2026", aiCost: 0.12, fatturato: 480, pagato: true },
    { month: "Febbraio 2026", aiCost: 0.21, fatturato: 620, pagato: true },
    { month: "Marzo 2026",   aiCost: 0.34, fatturato: 750, pagato: false },
    { month: "Aprile 2026",  aiCost: totalAI, fatturato: 0, pagato: false },
  ];

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "AI Cost — Aprile", value: `$${totalAI.toFixed(4)}`, note: "Stima da step completati", color: "#39FF14" },
          { label: "Pipeline attive",  value: String(cards.length),       note: "Contenuti in lavorazione", color: "#00d4ff" },
          { label: "Modello default",  value: "Sonnet 4.6",               note: "$3/M input · $15/M output", color: "#a855f7" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
            <p className="text-white/40 text-xs mb-2">{k.label}</p>
            <p className="text-white font-bold text-xl" style={{ color: k.color }}>{k.value}</p>
            <p className="text-white/25 text-[11px] mt-1">{k.note}</p>
          </div>
        ))}
      </div>

      {/* Per-pipeline costs */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          Costo AI per Pipeline
        </h3>
        <div className="space-y-3">
          {cardCosts.map((c) => (
            <CostBar
              key={c.id}
              label={c.hook.slice(0, 50) + (c.hook.length > 50 ? "…" : "")}
              value={c.cost}
              max={maxCardCost}
            />
          ))}
        </div>
        <p className="text-[10px] text-white/20 italic mt-3">
          Stima basata su token medi per step — valori reali disponibili dopo integrazione
          contabilita.json
        </p>
      </div>

      {/* Monthly summary */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Riepilogo Mensile
          </h3>
          <span className="text-[10px] text-white/20 italic">gen-mar: mock</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {mockMonthly.map((m) => (
            <div key={m.month} className="flex items-center gap-4 px-4 py-2.5">
              <p className="text-white/60 text-xs w-36 shrink-0">{m.month}</p>
              <div className="flex-1 flex items-center gap-4 text-xs">
                <span className="text-white/30">
                  AI: <span className="text-white/60 font-mono">${m.aiCost.toFixed(4)}</span>
                </span>
                <span className="text-white/30">
                  Fatturato:{" "}
                  <span className="text-white/60 font-mono">
                    €{m.fatturato.toLocaleString("it-IT")}
                  </span>
                </span>
              </div>
              <span
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border shrink-0",
                  m.pagato
                    ? "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5"
                    : "text-amber-400 border-amber-400/20 bg-amber-400/5"
                )}
              >
                {m.pagato ? "Pagato" : "Da fatturare"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Client pricing */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Pricing Clienti
          </h3>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {billingRows.map((row) => (
            <div key={row.client} className="flex items-center gap-4 px-4 py-2.5">
              <p className="text-white/70 text-sm flex-1 truncate">{row.client}</p>
              <span className="text-white/40 text-xs font-mono">
                €{row.costoXShort}/short
              </span>
              <span
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border shrink-0",
                  row.statoPagamento === "Pagato"
                    ? "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5"
                    : "text-amber-400 border-amber-400/20 bg-amber-400/5"
                )}
              >
                {row.statoPagamento}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

interface Props {
  cards: PipelineCard[];
  pricing: Record<string, ContabilitaConfigClient>;
}

export function SettingsView({ cards, pricing }: Props) {
  const [tab, setTab] = useState<Tab>("keys");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white">Impostazioni</h1>
        <p className="text-white/40 text-xs mt-0.5">
          Configurazione sistema · API keys · Agenti · Costi
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-8 py-3 border-b border-white/[0.06]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
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
        {tab === "agents" && <AgentsTab />}
        {tab === "costs"  && <CostsTab cards={cards} pricing={pricing} />}
      </div>
    </div>
  );
}
