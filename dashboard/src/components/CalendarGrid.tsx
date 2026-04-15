"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CalendarEvent, PipelineCard } from "@/lib/data";

// ══════════════════════════════════════════════════════
//  PLATFORM CHIPS
// ══════════════════════════════════════════════════════
const PLATFORM_COLOR: Record<string, string> = {
  instagram: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  tiktok:    "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  youtube:   "bg-red-500/20 text-red-400 border-red-500/30",
  linkedin:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  facebook:  "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  threads:   "bg-purple-500/20 text-purple-400 border-purple-500/30",
};
const PLATFORM_LABEL: Record<string, string> = {
  instagram: "IG", tiktok: "TK", youtube: "YT",
  linkedin: "LI",  facebook: "FB", threads: "TH",
};

function PlatformChip({ platform }: { platform: string }) {
  return (
    <span className={cn(
      "text-[9px] px-1 py-0.5 rounded border font-bold",
      PLATFORM_COLOR[platform] ?? "bg-white/10 text-white/40 border-white/10"
    )}>
      {PLATFORM_LABEL[platform] ?? platform.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ══════════════════════════════════════════════════════
//  STATUS
// ══════════════════════════════════════════════════════
const STATUS_DOT: Record<string, string> = {
  "In Lavorazione":  "bg-blue-400",
  "In Approvazione": "bg-amber-400",
  Approvato:         "bg-[#39FF14]",
  Pubblicato:        "bg-[#39FF14]",
  pubblicato_log:    "bg-[#39FF14]",
  Idea:              "bg-white/30",
};
const STATUS_LABEL: Record<string, string> = {
  "In Lavorazione":  "In Lavorazione",
  "In Approvazione": "In Approvazione",
  Approvato:         "Approvato",
  Pubblicato:        "Pubblicato",
  pubblicato_log:    "Pubblicato",
  Idea:              "Idea",
};
const STATUS_BADGE: Record<string, string> = {
  "In Lavorazione":  "text-blue-400 border-blue-400/20 bg-blue-400/5",
  "In Approvazione": "text-amber-400 border-amber-400/20 bg-amber-400/5",
  Approvato:         "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5",
  Pubblicato:        "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5",
  pubblicato_log:    "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5",
  Idea:              "text-white/30 border-white/10 bg-white/5",
};
const STEP_STATUS_COLOR: Record<string, string> = {
  done:        "text-[#39FF14]",
  in_progress: "text-amber-400",
  error:       "text-red-400",
  pending:     "text-white/20",
};
const STEP_STATUS_DOT: Record<string, string> = {
  done:        "bg-[#39FF14]",
  in_progress: "bg-amber-400 animate-pulse",
  error:       "bg-red-400",
  pending:     "bg-white/15",
};

// ══════════════════════════════════════════════════════
//  CARD DETAIL MODAL
// ══════════════════════════════════════════════════════
function CardDetailModal({
  card,
  onClose,
}: {
  card: PipelineCard;
  onClose: () => void;
}) {
  const completedSteps = card.steps.filter((s) => s.status === "done").length;
  const progress = card.steps.length > 0
    ? Math.round((completedSteps / card.steps.length) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#111111] border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border font-medium shrink-0",
                  STATUS_BADGE[card.status] ?? "text-white/40 border-white/10 bg-white/5"
                )}>
                  {STATUS_LABEL[card.status] ?? card.status}
                </span>
                <span className="text-[11px] text-white/25 border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 rounded-full shrink-0">
                  {card.type}
                </span>
                <span className="text-[11px] text-white/25 shrink-0">{card.client}</span>
              </div>
              <p className="text-white font-semibold text-sm leading-snug">{card.hook || card.title}</p>
              {card.angle && (
                <p className="text-white/30 text-xs mt-1">Angolo: {card.angle}</p>
              )}
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors shrink-0 mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-white/30">{completedSteps}/{card.steps.length} step completati</span>
              <span className="text-white/40 font-mono">{progress}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[#39FF14]/60 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 max-h-[55vh] overflow-y-auto space-y-1.5">
          <p className="text-[9px] font-mono text-white/20 uppercase tracking-widest mb-3">Workflow</p>
          {card.steps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-colors",
                step.status === "done"
                  ? "border-[#39FF14]/10 bg-[#39FF14]/[0.03]"
                  : step.status === "in_progress"
                  ? "border-amber-400/20 bg-amber-400/[0.04]"
                  : step.status === "error"
                  ? "border-red-400/20 bg-red-400/[0.03]"
                  : "border-white/[0.04] bg-white/[0.01]"
              )}
            >
              {/* Step number / dot */}
              <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  STEP_STATUS_DOT[step.status] ?? "bg-white/15"
                )} />
                {i < card.steps.length - 1 && (
                  <div className="w-px h-3 bg-white/[0.06]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn(
                    "text-xs font-medium",
                    STEP_STATUS_COLOR[step.status] ?? "text-white/40"
                  )}>
                    {step.name}
                  </p>
                  {step.completedAt && (
                    <span className="text-[10px] text-white/20 shrink-0">{step.completedAt}</span>
                  )}
                </div>
                <p className="text-[10px] text-white/25 mt-0.5">{step.agent}</p>

                {/* Output preview */}
                {step.output && step.status === "done" && (
                  <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed line-clamp-3 border-l-2 border-[#39FF14]/20 pl-2">
                    {step.output}
                  </p>
                )}
                {step.outputPath && (
                  <p className="text-[10px] text-white/20 font-mono mt-1 truncate">
                    {step.outputPath}
                  </p>
                )}
              </div>
            </div>
          ))}

          {card.steps.length === 0 && (
            <p className="text-white/20 text-sm text-center py-4">Nessuno step definito</p>
          )}

          {/* Recent log */}
          {card.log && card.log.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <p className="text-[9px] font-mono text-white/20 uppercase tracking-widest mb-2">Log recente</p>
              {card.log.slice(-3).reverse().map((entry, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                  <span className="text-[10px] font-mono text-white/20 shrink-0 mt-0.5">{entry.time}</span>
                  <p className="text-[11px] text-white/40 leading-snug">{entry.msg}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] font-mono text-white/20">ID: {card.id}</span>
          <span className="text-[10px] text-white/20">Creato: {card.createdAt}</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  DAY PANEL (sidebar dettaglio giorno)
// ══════════════════════════════════════════════════════
function DayPanel({
  date,
  events,
  cards,
  onClose,
  onSelectCard,
}: {
  date: string;
  events: CalendarEvent[];
  cards: PipelineCard[];
  onClose: () => void;
  onSelectCard: (card: PipelineCard) => void;
}) {
  const d = new Date(date + "T12:00:00");
  const label = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  function handleEventClick(ev: CalendarEvent) {
    if (ev.source !== "pipeline") return;
    const card = cards.find((c) => c.id === ev.id);
    if (card) onSelectCard(card);
  }

  return (
    <div className="w-80 shrink-0 border-l border-white/[0.08] bg-[#111111] flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-white font-semibold capitalize">{label}</p>
          <p className="text-white/30 text-xs mt-0.5">
            {events.length} contenut{events.length === 1 ? "o" : "i"}
          </p>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {events.map((ev) => {
          const isPipeline  = ev.source === "pipeline";
          const matchedCard = isPipeline ? cards.find((c) => c.id === ev.id) : null;

          return (
            <div
              key={ev.id}
              onClick={() => handleEventClick(ev)}
              className={cn(
                "rounded-lg border border-white/[0.08] bg-[#0a0a0a] p-3 transition-colors",
                isPipeline && matchedCard
                  ? "cursor-pointer hover:border-white/20 hover:bg-[#141414]"
                  : "cursor-default"
              )}
            >
              <div className="flex items-start gap-2 mb-2">
                <span className={cn(
                  "mt-1.5 w-2 h-2 rounded-full shrink-0",
                  STATUS_DOT[ev.status] ?? "bg-white/20"
                )} />
                <p className="text-white/80 text-xs leading-snug line-clamp-3 flex-1">
                  {ev.title}
                </p>
                {isPipeline && matchedCard && (
                  <ChevronRight className="w-3.5 h-3.5 text-white/20 shrink-0 mt-0.5" />
                )}
              </div>
              <p className="text-white/30 text-[11px] mb-2">{ev.client}</p>
              <div className="flex items-center gap-1 flex-wrap">
                {ev.platforms.map((p) => (
                  <PlatformChip key={p} platform={p} />
                ))}
                <span className="text-[10px] text-white/20 ml-auto border border-white/[0.06] rounded px-1.5 py-0.5">
                  {ev.type}
                </span>
              </div>
              {/* Step progress for pipeline cards */}
              {matchedCard && (
                <div className="mt-2.5 pt-2 border-t border-white/[0.05]">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-white/20">
                      {matchedCard.steps.filter((s) => s.status === "done").length}/{matchedCard.steps.length} step
                    </span>
                    <span className={cn(
                      "font-medium",
                      STATUS_BADGE[matchedCard.status]?.split(" ")[0] ?? "text-white/30"
                    )}>
                      {STATUS_LABEL[matchedCard.status] ?? matchedCard.status}
                    </span>
                  </div>
                  <div className="h-0.5 rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[#39FF14]/50"
                      style={{
                        width: matchedCard.steps.length > 0
                          ? `${Math.round(matchedCard.steps.filter((s) => s.status === "done").length / matchedCard.steps.length * 100)}%`
                          : "0%"
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-white/20 mt-1.5 italic">Clicca per i dettagli →</p>
                </div>
              )}
            </div>
          );
        })}
        {events.length === 0 && (
          <p className="text-white/20 text-sm text-center py-8">Nessun contenuto</p>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  MAIN CALENDAR GRID
// ══════════════════════════════════════════════════════
const DAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface Props {
  month: string;
  events: CalendarEvent[];
  clients: string[];
  cards: PipelineCard[];
}

export function CalendarGrid({ month, events, clients, cards }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailCard,   setDetailCard]   = useState<PipelineCard | null>(null);

  const activeClient = searchParams.get("client") ?? "tutti";

  const filtered = activeClient === "tutti" ? events : events.filter((e) => e.client === activeClient);

  const byDate: Record<string, CalendarEvent[]> = {};
  for (const ev of filtered) { (byDate[ev.date] ??= []).push(ev); }

  const [year, mon]  = month.split("-").map(Number);
  const firstDay     = new Date(year, mon - 1, 1);
  const startOffset  = (firstDay.getDay() + 6) % 7;
  const daysInMonth  = new Date(year, mon, 0).getDate();
  const totalCells   = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const monthLabel   = firstDay.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  function navMonth(delta: number) {
    const d = new Date(year, mon - 1 + delta, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", newMonth);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function selectClient(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (val === "tutti") params.delete("client"); else params.set("client", val);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const todayStr      = new Date().toISOString().slice(0, 10);
  const selectedEvents = selectedDate ? (byDate[selectedDate] ?? []) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navMonth(-1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-white capitalize w-52 text-center">{monthLabel}</h1>
          <button onClick={() => navMonth(1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Client filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {["tutti", ...clients].map((c) => (
            <button key={c} onClick={() => selectClient(c)}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition-colors capitalize",
                activeClient === c
                  ? "bg-[#39FF14]/15 text-[#39FF14] border-[#39FF14]/30"
                  : "text-white/40 border-white/10 hover:text-white/70 hover:border-white/20"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            {/* Day names */}
            <div className="grid grid-cols-7 border-b border-white/[0.06] px-8 shrink-0">
              {DAYS_IT.map((d) => (
                <div key={d} className="py-2 text-center text-[11px] font-medium text-white/30">{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <div className="grid grid-cols-7 gap-px bg-white/[0.04] border border-white/[0.04] rounded-b-xl overflow-hidden">
                {Array.from({ length: totalCells }).map((_, i) => {
                  const dayNum   = i - startOffset + 1;
                  const isValid  = dayNum >= 1 && dayNum <= daysInMonth;
                  const dateStr  = isValid ? `${month}-${String(dayNum).padStart(2, "0")}` : null;
                  const dayEvts  = dateStr ? (byDate[dateStr] ?? []) : [];
                  const isToday  = dateStr === todayStr;
                  const isSel    = dateStr === selectedDate;

                  return (
                    <div key={i}
                      onClick={() => { if (!isValid || !dateStr) return; setSelectedDate(isSel ? null : dateStr); }}
                      className={cn(
                        "min-h-[100px] p-2 flex flex-col gap-1 transition-colors",
                        isValid ? "bg-[#0a0a0a] cursor-pointer hover:bg-[#111111]" : "bg-[#070707] cursor-default",
                        isSel && "bg-[#39FF14]/5 ring-1 ring-inset ring-[#39FF14]/20"
                      )}
                    >
                      {isValid && (
                        <>
                          <span className={cn(
                            "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                            isToday ? "bg-[#39FF14] text-[#0a0a0a] font-bold" : "text-white/50"
                          )}>
                            {dayNum}
                          </span>
                          {dayEvts.slice(0, 3).map((ev) => (
                            <div key={ev.id}
                              className="flex items-center gap-1 rounded px-1 py-0.5 bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[ev.status] ?? "bg-white/20")} />
                              <span className="text-[10px] text-white/60 truncate leading-tight">{ev.client}</span>
                              <div className="flex gap-0.5 ml-auto shrink-0">
                                {ev.platforms.slice(0, 2).map((p) => (
                                  <span key={p} className={cn(
                                    "text-[8px] px-0.5 rounded border font-bold",
                                    PLATFORM_COLOR[p] ?? "bg-white/10 text-white/40 border-white/10"
                                  )}>
                                    {PLATFORM_LABEL[p] ?? p.slice(0, 2).toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                          {dayEvts.length > 3 && (
                            <span className="text-[10px] text-white/30 px-1">+{dayEvts.length - 3} altri</span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Day detail sidebar */}
          {selectedDate && (
            <DayPanel
              date={selectedDate}
              events={selectedEvents}
              cards={cards}
              onClose={() => setSelectedDate(null)}
              onSelectCard={(card) => setDetailCard(card)}
            />
          )}
        </div>

      {/* Card detail modal */}
      {detailCard && (
        <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />
      )}
    </div>
  );
}
