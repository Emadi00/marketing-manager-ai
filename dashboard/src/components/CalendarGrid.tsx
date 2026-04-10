"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/data";

// ── Platform chips ─────────────────────────────────────────────────────────

const PLATFORM_COLOR: Record<string, string> = {
  instagram: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  tiktok:    "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  youtube:   "bg-red-500/20 text-red-400 border-red-500/30",
  linkedin:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  facebook:  "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  threads:   "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "IG",
  tiktok:    "TK",
  youtube:   "YT",
  linkedin:  "LI",
  facebook:  "FB",
  threads:   "TH",
};

function PlatformChip({ platform }: { platform: string }) {
  const style = PLATFORM_COLOR[platform] ?? "bg-white/10 text-white/40 border-white/10";
  return (
    <span className={cn("text-[9px] px-1 py-0.5 rounded border font-bold", style)}>
      {PLATFORM_LABEL[platform] ?? platform.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ── Status dot ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  "In Lavorazione":   "bg-blue-400",
  "In Approvazione":  "bg-amber-400",
  Approvato:          "bg-[#39FF14]",
  Pubblicato:         "bg-[#39FF14]",
  pubblicato_log:     "bg-[#39FF14]",
  Idea:               "bg-white/30",
};

// ── Day detail panel ───────────────────────────────────────────────────────

function DayPanel({
  date,
  events,
  onClose,
}: {
  date: string;
  events: CalendarEvent[];
  onClose: () => void;
}) {
  const d = new Date(date + "T12:00:00");
  const label = d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="w-80 shrink-0 border-l border-white/[0.08] bg-[#111111] flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-white font-semibold capitalize">{label}</p>
          <p className="text-white/30 text-xs mt-0.5">
            {events.length} contenut{events.length === 1 ? "o" : "i"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] p-3"
          >
            <div className="flex items-start gap-2 mb-2">
              <span
                className={cn(
                  "mt-1.5 w-2 h-2 rounded-full shrink-0",
                  STATUS_DOT[ev.status] ?? "bg-white/20"
                )}
              />
              <p className="text-white/80 text-xs leading-snug line-clamp-3">
                {ev.title}
              </p>
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
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-white/20 text-sm text-center py-8">Nessun contenuto</p>
        )}
      </div>
    </div>
  );
}

// ── Main calendar grid ─────────────────────────────────────────────────────

const DAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface Props {
  month: string; // "YYYY-MM"
  events: CalendarEvent[];
  clients: string[];
}

export function CalendarGrid({ month, events, clients }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const activeClient = searchParams.get("client") ?? "tutti";

  // Filter events by client
  const filtered =
    activeClient === "tutti"
      ? events
      : events.filter((e) => e.client === activeClient);

  // Group by date
  const byDate: Record<string, CalendarEvent[]> = {};
  for (const ev of filtered) {
    (byDate[ev.date] ??= []).push(ev);
  }

  // Build calendar grid
  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  // Monday-first: 0=Mon … 6=Sun
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, mon, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const monthLabel = firstDay.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  function navigate(delta: number) {
    const d = new Date(year, mon - 1 + delta, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", newMonth);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function selectClient(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (val === "tutti") params.delete("client");
    else params.set("client", val);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const selectedEvents = selectedDate ? (byDate[selectedDate] ?? []) : [];

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Calendar main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold text-white capitalize w-52 text-center">
              {monthLabel}
            </h1>
            <button
              onClick={() => navigate(1)}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {/* Client filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {["tutti", ...clients].map((c) => (
              <button
                key={c}
                onClick={() => selectClient(c)}
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

        {/* Day names row */}
        <div className="grid grid-cols-7 border-b border-white/[0.06] px-8">
          {DAYS_IT.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-[11px] font-medium text-white/30"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="grid grid-cols-7 gap-px bg-white/[0.04] border border-white/[0.04] rounded-b-xl overflow-hidden">
            {Array.from({ length: totalCells }).map((_, i) => {
              const dayNum = i - startOffset + 1;
              const isValid = dayNum >= 1 && dayNum <= daysInMonth;
              const dateStr = isValid
                ? `${month}-${String(dayNum).padStart(2, "0")}`
                : null;
              const dayEvents = dateStr ? (byDate[dateStr] ?? []) : [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;

              return (
                <div
                  key={i}
                  onClick={() => {
                    if (!isValid) return;
                    setSelectedDate(isSelected ? null : dateStr);
                  }}
                  className={cn(
                    "min-h-[100px] p-2 flex flex-col gap-1 transition-colors",
                    isValid
                      ? "bg-[#0a0a0a] cursor-pointer hover:bg-[#111111]"
                      : "bg-[#070707] cursor-default",
                    isSelected && "bg-[#39FF14]/5 ring-1 ring-inset ring-[#39FF14]/20"
                  )}
                >
                  {isValid && (
                    <>
                      {/* Day number */}
                      <span
                        className={cn(
                          "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                          isToday
                            ? "bg-[#39FF14] text-[#0a0a0a] font-bold"
                            : "text-white/50"
                        )}
                      >
                        {dayNum}
                      </span>

                      {/* Events (max 3 visible) */}
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center gap-1 rounded px-1 py-0.5 bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              STATUS_DOT[ev.status] ?? "bg-white/20"
                            )}
                          />
                          <span className="text-[10px] text-white/60 truncate leading-tight">
                            {ev.client}
                          </span>
                          <div className="flex gap-0.5 ml-auto shrink-0">
                            {ev.platforms.slice(0, 2).map((p) => (
                              <span
                                key={p}
                                className={cn(
                                  "text-[8px] px-0.5 rounded border font-bold",
                                  PLATFORM_COLOR[p] ??
                                    "bg-white/10 text-white/40 border-white/10"
                                )}
                              >
                                {PLATFORM_LABEL[p] ??
                                  p.slice(0, 2).toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* +N overflow */}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-white/30 px-1">
                          +{dayEvents.length - 3} altri
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDate && (
        <DayPanel
          date={selectedDate}
          events={selectedEvents}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
