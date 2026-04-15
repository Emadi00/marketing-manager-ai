"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Loader2, CalendarDays, Film } from "lucide-react";
import { cn } from "@/lib/utils";

const VIDEO_TYPES = [
  "Reel",
  "Reel + Carosello",
  "Carosello",
  "YouTube",
  "LinkedIn",
  "Facebook",
  "TikTok",
  "Story",
];

const PRIORITY_OPTIONS = [
  { value: "alta",  label: "Alta",  color: "text-red-400 border-red-400/30 bg-red-400/10" },
  { value: "media", label: "Media", color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  { value: "bassa", label: "Bassa", color: "text-white/40 border-white/10 bg-white/[0.05]" },
];

interface Props {
  clients: string[];
  onClose: () => void;
}

export function CreatePipelineModal({ clients, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [client,   setClient]   = useState(clients[0] ?? "");
  const [type,     setType]     = useState("Reel");
  const [hook,     setHook]     = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "bassa">("media");
  const [deadline, setDeadline] = useState("");

  // Close on Escape
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hook.trim()) { setError("Inserisci l'hook del contenuto."); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: client.trim(),
          type,
          hook: hook.trim(),
          priority,
          deadline: deadline || undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "Errore nella creazione"); return; }

      setSuccess(true);
      setTimeout(() => {
        router.refresh();
        onClose();
      }, 800);
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#111111] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#39FF14]/10 flex items-center justify-center">
              <Film className="w-4 h-4 text-[#39FF14]" />
            </div>
            <h2 className="text-base font-bold text-white">Nuova Pipeline</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
              Cliente *
            </label>
            {clients.length > 0 ? (
              <select
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50 transition-colors appearance-none cursor-pointer"
              >
                {clients.map((c) => (
                  <option key={c} value={c} className="bg-[#1a1a1a]">{c}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Nome cliente"
                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-[#39FF14]/50 transition-colors"
              />
            )}
          </div>

          {/* Hook */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
              Hook / Titolo *
            </label>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="Es: Perché il 90% delle persone sbaglia questa cosa ogni giorno…"
              rows={2}
              className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-[#39FF14]/50 transition-colors resize-none"
            />
          </div>

          {/* Tipo + Priorità */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Tipo contenuto
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50 transition-colors appearance-none cursor-pointer"
              >
                {VIDEO_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-[#1a1a1a]">{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Priorità
              </label>
              <div className="flex gap-1.5">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value as "alta" | "media" | "bassa")}
                    className={cn(
                      "flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors",
                      priority === opt.value
                        ? opt.color
                        : "border-white/[0.06] text-white/25 hover:text-white/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                Deadline (opzionale)
              </span>
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50 transition-colors [color-scheme:dark]"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-white/40 hover:text-white/60 hover:border-white/20 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                success
                  ? "bg-[#39FF14]/20 text-[#39FF14] border border-[#39FF14]/30"
                  : loading
                  ? "bg-[#39FF14]/10 text-[#39FF14]/50 cursor-not-allowed"
                  : "bg-[#39FF14]/15 text-[#39FF14] hover:bg-[#39FF14]/25 border border-[#39FF14]/30"
              )}
            >
              {success ? (
                "Creata!"
              ) : loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creando…</>
              ) : (
                <><Plus className="w-4 h-4" /> Crea Pipeline</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
