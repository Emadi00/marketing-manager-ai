"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ══════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════
interface Rubrica {
  id: string; pillar: string; nome: string; descrizione: string;
  formato: string; tipo: string; frequenza: string;
  orario_default: string; giorni_preferiti: string[];
  cta: string; tono: string;
  idee_contenuto?: string[];
  hashtag_suggeriti?: string[];
  slide?: string; durata_sec?: string;
}
interface PianoMeta {
  versione?: string; cadenza?: string; piattaforme?: string[];
  orizzonte?: string; prossima_revisione?: string;
}
interface PianoData {
  meta?: PianoMeta;
  rubriche?: Rubrica[];
  error?: string;
}

const PILLAR_COLOR: Record<string, string> = {
  VE: "text-[#00d4ff] border-[#00d4ff]/30 bg-[#00d4ff]/5",
  AI: "text-purple-400 border-purple-400/30 bg-purple-400/5",
};

// ══════════════════════════════════════════════════════
//  RUBRICA CARD
// ══════════════════════════════════════════════════════
function RubricaCard({ r }: { r: Rubrica }) {
  const [open, setOpen] = useState(false);
  const pc      = PILLAR_COLOR[r.pillar] ?? "text-white/40 border-white/10 bg-white/5";
  const tipoIco = r.tipo === "video" ? "🎬" : "📑";

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden hover:border-white/[0.14] transition-colors">
      <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="text-lg">{tipoIco}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white/80 text-sm font-semibold">{r.nome}</p>
          <p className="text-white/30 text-[11px] mt-0.5 truncate">{r.descrizione.slice(0, 65)}…</p>
        </div>
        <span className={cn("text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0", pc)}>{r.pillar}</span>
        <ChevronDown className={cn("w-4 h-4 text-white/20 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-px bg-white/[0.04] border-t border-white/[0.05]">
        {[
          { label: "Formato",   value: r.formato + (r.durata_sec ? ` · ${r.durata_sec}s` : r.slide ? ` · ${r.slide} slide` : "") },
          { label: "Frequenza", value: r.frequenza },
          { label: "Orario",    value: `${r.orario_default} · ${r.giorni_preferiti?.[0] ?? "—"}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#111111] px-3 py-2">
            <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider">{label}</p>
            <p className="text-white/50 text-xs mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.05] space-y-3">
          <p className="text-white/40 text-xs leading-relaxed">{r.descrizione}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider mb-1">TONO</p>
              <p className="text-white/40 italic">{r.tono}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider mb-1">CTA</p>
              <p className="text-amber-400/70">&quot;{r.cta}&quot;</p>
            </div>
          </div>
          {r.idee_contenuto?.length ? (
            <div>
              <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider mb-2">IDEE CONTENUTO</p>
              {r.idee_contenuto.slice(0, 3).map((idea, i) => (
                <div key={i} className={cn(
                  "text-xs text-white/40 pl-3 py-1 border-l-2 mb-1.5",
                  r.pillar === "VE" ? "border-[#00d4ff]/30" : "border-purple-400/30"
                )}>{idea}</div>
              ))}
            </div>
          ) : null}
          {r.hashtag_suggeriti?.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {r.hashtag_suggeriti.slice(0, 5).map((h) => (
                <span key={h} className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full border opacity-60", pc)}>{h}</span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  PAGE
// ══════════════════════════════════════════════════════
export default function PianoPage() {
  const [data,    setData]    = useState<PianoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all");

  useEffect(() => {
    fetch("/api/settings/piano-editoriale")
      .then((r) => r.json())
      .then((d: PianoData) => { setData(d); setLoading(false); })
      .catch(() => { setData({ error: "Errore caricamento" }); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
    </div>
  );

  if (!data || data.error || !data.rubriche) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-white/30">{data?.error ?? "Piano non disponibile"}</p>
    </div>
  );

  const { meta = {}, rubriche } = data;
  const pillars  = [...new Set(rubriche.map((r) => r.pillar))];
  const filtered = filter === "all" ? rubriche : rubriche.filter((r) => r.pillar === filter);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/[0.06] shrink-0 sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Piano Editoriale</h1>
            <p className="text-white/30 text-xs mt-0.5">{rubriche.length} rubriche · {meta.cadenza ?? ""}</p>
          </div>

          {/* Pillar filter */}
          <div className="flex items-center gap-2">
            {["all", ...pillars].map((p) => (
              <button key={p} onClick={() => setFilter(p)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border",
                  filter === p
                    ? p === "all"
                      ? "bg-white/10 text-white border-white/20"
                      : (PILLAR_COLOR[p] ?? "bg-white/10 text-white border-white/20")
                    : "text-white/30 border-white/[0.06] hover:text-white/60"
                )}
              >
                {p === "all"
                  ? `Tutte (${rubriche.length})`
                  : `${p} (${rubriche.filter((r) => r.pillar === p).length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Meta strip */}
      <div className="px-8 pt-5 shrink-0">
        <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
            {[
              { label: "Versione",  value: meta.versione ?? "—" },
              { label: "Cadenza",   value: meta.cadenza  ?? "—" },
              { label: "Orizzonte", value: meta.orizzonte ?? "—" },
              { label: "Revisione", value: meta.prossima_revisione ?? "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[9px] font-mono text-white/20 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-white/60 text-sm">{value}</p>
              </div>
            ))}
          </div>
          {meta.piattaforme && (
            <div className="flex gap-2 pt-3 border-t border-white/[0.05]">
              {meta.piattaforme.map((p) => (
                <span key={p} className="text-[10px] text-white/40 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">{p}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rubriche grid */}
      <div className="flex-1 overflow-y-auto px-8 py-5 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((r) => <RubricaCard key={r.id} r={r} />)}
        </div>
      </div>
    </div>
  );
}
