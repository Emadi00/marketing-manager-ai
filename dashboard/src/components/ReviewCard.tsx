"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineCard } from "@/lib/data";

const PRIORITY_STYLE: Record<string, string> = {
  alta:  "bg-red-400/15 text-red-400",
  media: "bg-amber-400/15 text-amber-400",
  bassa: "bg-white/[0.06] text-white/40",
};

const STEP_STATUS_DOT: Record<string, string> = {
  done:        "bg-[#39FF14]",
  in_progress: "bg-[#00d4ff] animate-pulse",
  error:       "bg-red-400",
  pending:     "bg-white/20",
};

interface Props {
  card: PipelineCard;
  compact?: boolean;
}

export function ReviewCard({ card, compact = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState(false);

  const completedSteps = card.steps.filter((s) => s.status === "done").length;
  const totalSteps = card.steps.length;

  async function updateStatus(status: string) {
    const action = status === "Approvato" ? "approve" : "reject";
    setLoading(action);
    try {
      await fetch("/api/pipeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, status }),
      });
      setDone(true);
      setTimeout(() => router.refresh(), 600);
    } finally {
      setLoading(null);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#111111] p-4 flex items-center gap-3 opacity-50">
        <CheckCircle2 className="w-4 h-4 text-[#39FF14]" />
        <span className="text-sm text-white/50 italic">Aggiornato…</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-[#111111] p-4",
        card.status === "In Approvazione"
          ? "border-amber-400/20"
          : "border-white/[0.08]"
      )}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white leading-snug">
            {card.hook || card.title}
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            {card.client} · {card.type}
          </p>
          {card.deadline && (
            <p className="text-[11px] text-white/30 mt-0.5">
              Scadenza:{" "}
              <span className={cn(
                "font-medium",
                new Date(card.deadline) < new Date() ? "text-red-400" : "text-white/50"
              )}>
                {new Date(card.deadline).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
              </span>
            </p>
          )}
        </div>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full shrink-0",
            PRIORITY_STYLE[card.priority] ?? PRIORITY_STYLE.media
          )}
        >
          {card.priority}
        </span>
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] text-white/30 mb-1">
            <span>Step {completedSteps}/{totalSteps}</span>
            <span>{Math.round((completedSteps / totalSteps) * 100)}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#39FF14] transition-all"
              style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Steps checklist */}
      {!compact && (
        <div className="space-y-1.5 mb-4">
          {card.steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  STEP_STATUS_DOT[step.status] ?? "bg-white/20"
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  step.status === "done"        ? "text-white/50 line-through" :
                  step.status === "in_progress" ? "text-[#00d4ff]" :
                  step.status === "error"       ? "text-red-400" :
                  "text-white/30"
                )}
              >
                {step.name}
              </span>
              {step.agent && (
                <span className="text-[10px] text-white/20 ml-auto">{step.agent}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons — solo per "In Approvazione" */}
      {card.status === "In Approvazione" && (
        <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
          <button
            onClick={() => updateStatus("Approvato")}
            disabled={loading !== null}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-1 justify-center",
              loading === "approve"
                ? "bg-[#39FF14]/10 text-[#39FF14]/60 cursor-not-allowed"
                : "bg-[#39FF14]/15 text-[#39FF14] hover:bg-[#39FF14]/25 border border-[#39FF14]/30"
            )}
          >
            {loading === "approve"
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle2 className="w-3.5 h-3.5" />
            }
            Approva
          </button>
          <button
            onClick={() => updateStatus("In Lavorazione")}
            disabled={loading !== null}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-1 justify-center",
              loading === "reject"
                ? "bg-amber-400/10 text-amber-400/60 cursor-not-allowed"
                : "bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 border border-amber-400/20"
            )}
          >
            {loading === "reject"
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5" />
            }
            Rimanda
          </button>
        </div>
      )}
    </div>
  );
}
