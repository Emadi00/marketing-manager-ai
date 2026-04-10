"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PenLine, TrendingUp, Film, UserCheck, Share2, Brain, Palette,
  CheckCircle2, XCircle, Circle, Loader2, ChevronDown, ChevronUp,
  Clock, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineCard as PipelineCardType, StepStatus } from "@/lib/data";

// ── Agent icon map ─────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  copywriter:          PenLine,
  strategist:          TrendingUp,
  "video-editor":      Film,
  "cover-designer":    Palette,
  "smm-publisher":     Share2,
  "marketing-manager": Brain,
  human:               UserCheck,
};

// ── Status helpers ─────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done")        return <CheckCircle2 className="w-4 h-4 text-[#39FF14]" />;
  if (status === "error")       return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === "in_progress") return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
  return <Circle className="w-4 h-4 text-white/20" />;
}

function stepRing(status: StepStatus) {
  if (status === "done")        return "border-[#39FF14]/60 bg-[#39FF14]/10";
  if (status === "error")       return "border-red-400/60 bg-red-400/10";
  if (status === "in_progress") return "border-blue-400/60 bg-blue-400/10";
  return "border-white/10 bg-white/5";
}

const PRIORITY_STYLE: Record<string, string> = {
  alta:  "bg-red-400/10 text-red-400 border-red-400/20",
  media: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  bassa: "bg-white/5 text-white/40 border-white/10",
};

const STATUS_STYLE: Record<string, string> = {
  "In Lavorazione":  "bg-blue-400/10 text-blue-400 border-blue-400/20",
  "In Approvazione": "bg-amber-400/10 text-amber-400 border-amber-400/20",
  Approvato:  "bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/20",
  Pubblicato: "bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/30",
  Idea:       "bg-white/5 text-white/40 border-white/10",
};

// ── Delete button ─────────────────────────────────────────────────────────

function DeleteButton({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await fetch("/api/pipeline", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cardId }),
      });
      router.refresh();
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-red-400">Eliminare?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-[11px] px-2 py-0.5 rounded bg-red-400/20 text-red-400 border border-red-400/30 hover:bg-red-400/30 transition-colors disabled:opacity-50"
        >
          {loading ? "…" : "Sì"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-[11px] px-2 py-0.5 rounded bg-white/[0.05] text-white/40 border border-white/10 hover:bg-white/[0.08] transition-colors"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      title="Elimina pipeline"
      className="text-white/15 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-400/10"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Log entry ─────────────────────────────────────────────────────────────

function LogLine({ type, msg, time }: { type: string; msg: string; time: string }) {
  const dot =
    type === "done" ? "bg-[#39FF14]" : type === "error" ? "bg-red-400" : "bg-white/30";
  return (
    <div className="flex items-start gap-2 text-xs py-0.5">
      <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      <span className="text-white/60 shrink-0">{time}</span>
      <span className="text-white/70 leading-5 truncate">{msg}</span>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────

export function PipelineCard({ card }: { card: PipelineCardType }) {
  const [expanded, setExpanded] = useState(false);
  const recentLog = (card.log ?? []).slice(0, 4);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white/40 text-[11px] font-medium mb-0.5">{card.client}</p>
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">
            {card.hook || card.title}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", STATUS_STYLE[card.status] ?? "bg-white/5 text-white/40")}>
              {card.status}
            </span>
            <DeleteButton cardId={card.id} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", PRIORITY_STYLE[card.priority] ?? "bg-white/5 text-white/40")}>
              {card.priority}
            </span>
            <span className="text-[11px] text-white/30 border border-white/10 rounded-full px-2 py-0.5">
              {card.type}
            </span>
          </div>
        </div>
      </div>

      {/* Pipeline flow */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-0">
          {card.steps.map((step, i) => {
            const Icon = AGENT_ICONS[step.agentId] ?? Circle;
            return (
              <div key={step.id} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center gap-1 relative group cursor-default">
                  <div className={cn("flex items-center justify-center w-8 h-8 rounded-full border transition-all", stepRing(step.status))}>
                    <Icon className={cn("w-3.5 h-3.5",
                      step.status === "done"        ? "text-[#39FF14]"  :
                      step.status === "error"       ? "text-red-400"    :
                      step.status === "in_progress" ? "text-blue-400"   : "text-white/25"
                    )} />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <StepIcon status={step.status} />
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 hidden group-hover:block w-40">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-xs">
                      <p className="text-white font-medium mb-0.5">{step.name}</p>
                      {step.output && <p className="text-white/50 line-clamp-2">{step.output}</p>}
                    </div>
                  </div>
                </div>
                {i < card.steps.length - 1 && (
                  <div className={cn("h-px flex-1 mx-1",
                    card.steps[i].status === "done" ? "bg-[#39FF14]/30" : "bg-white/[0.06]"
                  )} />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-start mt-1 gap-0">
          {card.steps.map((step, i) => (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <p className="text-[10px] text-white/30 text-center w-8 leading-tight truncate">
                {step.name.split(" ")[0]}
              </p>
              {i < card.steps.length - 1 && <div className="flex-1" />}
            </div>
          ))}
        </div>
      </div>

      {/* Log toggle */}
      {recentLog.length > 0 && (
        <>
          <div className="border-t border-white/[0.06]">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 w-full text-left hover:bg-white/[0.03] transition-colors"
            >
              <Clock className="w-3 h-3 text-white/30" />
              <span className="text-[11px] text-white/30 flex-1">Log attività</span>
              {expanded ? <ChevronUp className="w-3 h-3 text-white/20" /> : <ChevronDown className="w-3 h-3 text-white/20" />}
            </button>
          </div>
          {expanded && (
            <div className="px-4 pb-3 border-t border-white/[0.04]">
              {recentLog.map((entry, i) => (
                <LogLine key={i} type={entry.type} msg={entry.msg} time={entry.time} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <span className="text-[11px] text-white/20 font-mono">{card.id}</span>
        <span className="text-[11px] text-white/30 flex items-center gap-1">
          <Clock className="w-3 h-3" />{card.createdAt}
        </span>
      </div>
    </div>
  );
}

// ── Compact row ───────────────────────────────────────────────────────────

export function PipelineRow({ card }: { card: PipelineCardType }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const done = card.steps.filter((s) => s.status === "done").length;
  const pct = Math.round((done / card.steps.length) * 100);

  async function handleDelete() {
    setLoading(true);
    try {
      await fetch("/api/pipeline", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id }),
      });
      router.refresh();
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors group">
      <div className="min-w-0 flex-1">
        <p className="text-white/40 text-[10px] mb-0.5">{card.client}</p>
        <p className="text-white/80 text-xs truncate">{card.hook || card.title}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-16 h-1 rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-[#39FF14]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-white/30 w-8 text-right">{pct}%</span>
        <span className={cn("text-[11px] px-2 py-0.5 rounded-full border", STATUS_STYLE[card.status] ?? "bg-white/5 text-white/40")}>
          {card.status}
        </span>
        {/* Delete inline */}
        {confirm ? (
          <div className="flex items-center gap-1">
            <button onClick={handleDelete} disabled={loading} className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/20 text-red-400 border border-red-400/30 hover:bg-red-400/30 disabled:opacity-50">
              {loading ? "…" : "Sì"}
            </button>
            <button onClick={() => setConfirm(false)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/40 border border-white/10">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-white/20 hover:text-red-400 p-0.5 rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
