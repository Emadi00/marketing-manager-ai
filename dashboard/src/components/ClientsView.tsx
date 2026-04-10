"use client";

import { useState, useMemo } from "react";
import {
  Search, ChevronRight, Video, Send,
  Euro, StickyNote, Pencil, Check, X, Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PipelineRow } from "@/components/PipelineCard";
import type {
  ClienteSocial, ContabilitaConfigClient, PipelineCard, SmmLogEntry,
} from "@/lib/data";

// Il solo cliente che pubblica sui social
const SOCIAL_CLIENT = "VideoCraft Studio";

// ── Platform chips ─────────────────────────────────────────────────────────

const PLATFORM_ABBR: Record<string, string> = {
  instagram: "IG", tiktok: "TK", youtube: "YT",
  linkedin: "LI",  facebook: "FB", threads: "TH",
  x: "X",          pinterest: "PI", bluesky: "BS",
};
const PLATFORM_COLOR: Record<string, string> = {
  instagram: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  tiktok:    "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  youtube:   "text-red-400 bg-red-400/10 border-red-400/20",
  linkedin:  "text-blue-400 bg-blue-400/10 border-blue-400/20",
  facebook:  "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
};
const PLATFORM_DOT: Record<string, string> = {
  instagram: "bg-pink-400", tiktok: "bg-cyan-400", youtube: "bg-red-400",
  linkedin:  "bg-blue-400", facebook: "bg-indigo-400",
};

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase",
      PLATFORM_COLOR[platform] ?? "text-white/40 bg-white/5 border-white/10")}>
      {PLATFORM_ABBR[platform] ?? platform.slice(0, 2).toUpperCase()}
    </span>
  );
}
function PlatformDot({ platform }: { platform: string }) {
  return <span className={cn("w-2 h-2 rounded-full", PLATFORM_DOT[platform] ?? "bg-white/25")} title={platform} />;
}

// ── Client list row ────────────────────────────────────────────────────────

function ClientListRow({
  client, pipelineCount, active, onClick,
}: {
  client: ClienteSocial; pipelineCount: number; active: boolean; onClick: () => void;
}) {
  const showSocial = client.name === SOCIAL_CLIENT;
  return (
    <button onClick={onClick} className={cn(
      "w-full text-left px-4 py-3 border-b border-white/[0.05] flex items-center gap-3 transition-colors hover:bg-white/[0.03]",
      active && "bg-[#39FF14]/5 border-l-2 border-l-[#39FF14]"
    )}>
      <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 text-sm font-bold text-white/40">
        {client.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white/90 text-sm font-medium truncate">{client.name}</p>
        {showSocial && (
          <div className="flex items-center gap-1 mt-0.5">
            {client.platforms.slice(0, 4).map((p) => <PlatformDot key={p} platform={p} />)}
            {client.platforms.length > 4 && <span className="text-[10px] text-white/25">+{client.platforms.length - 4}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {pipelineCount > 0 && (
          <span className="text-[11px] text-white/30 bg-white/[0.06] rounded-full px-2 py-0.5">{pipelineCount}</span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-white/20" />
      </div>
    </button>
  );
}

// ── SMM log row ────────────────────────────────────────────────────────────

function SmmRow({ entry }: { entry: SmmLogEntry }) {
  const d = new Date(entry.timestamp);
  const dateStr = d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <span className={cn("w-2 h-2 rounded-full shrink-0", entry.status === "ok" ? "bg-[#39FF14]" : "bg-red-400")} />
      <div className="flex-1 min-w-0">
        <p className="text-white/60 text-xs truncate">{entry.video ?? "video.mp4"}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {entry.platforms.map((p) => <PlatformDot key={p} platform={p} />)}
        </div>
      </div>
      <span className="text-[10px] text-white/30 shrink-0">{dateStr}</span>
    </div>
  );
}

// ── Editable field ─────────────────────────────────────────────────────────

function EditableField({
  label, value, type = "text", onSave,
}: {
  label: string; value: string | number; type?: "text" | "number"; onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try { await onSave(draft); setEditing(false); }
    finally { setSaving(false); }
  }
  function cancel() { setDraft(String(value)); setEditing(false); }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          autoFocus
          className="flex-1 bg-white/[0.06] border border-[#39FF14]/40 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none min-w-0"
        />
        <button onClick={save} disabled={saving} className="text-[#39FF14] hover:text-[#39FF14]/80 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button onClick={cancel} className="text-white/30 hover:text-white/60">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group/field">
      <span className="text-white/70 text-sm flex-1">{value === "" ? <em className="text-white/25">vuoto</em> : String(value)}</span>
      <button
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="opacity-0 group-hover/field:opacity-100 transition-opacity text-white/25 hover:text-white/60"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Status pagamento toggle ────────────────────────────────────────────────

function PagamentoToggle({
  clientName, value, onSave,
}: {
  clientName: string; value: string; onSave: (v: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const isPagato = value === "Fatturato" || value === "Pagato";

  async function toggle() {
    setSaving(true);
    try { await onSave(isPagato ? "Da fatturare" : "Fatturato"); }
    finally { setSaving(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title="Clicca per cambiare stato"
      className={cn(
        "text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5",
        isPagato ? "text-[#39FF14]" : "text-amber-400 hover:text-[#39FF14]"
      )}
    >
      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (isPagato ? <Check className="w-3.5 h-3.5" /> : null)}
      {value}
    </button>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────

function ClientDetail({
  client, pricing, cards, smmLog,
}: {
  client: ClienteSocial; pricing: ContabilitaConfigClient | null;
  cards: PipelineCard[]; smmLog: SmmLogEntry[];
}) {
  const router = useRouter();
  const showSocial = client.name === SOCIAL_CLIENT;
  const clientCards = cards.filter((c) => c.client.toLowerCase() === client.name.toLowerCase());
  const clientLog   = smmLog.filter((e) => e.client_id.toLowerCase() === client.name.toLowerCase());

  async function saveField(field: string, value: string) {
    const body: Record<string, string | number> = { name: client.name };
    if (field === "notes") {
      body.notes = value;
    } else if (field === "costoXShort") {
      body.costoXShort = parseFloat(value) || 0;
    } else if (field === "costoXLong") {
      body.costoXLong = parseFloat(value) || 0;
    } else if (field === "statoPagamento") {
      body.statoPagamento = value;
    }
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/[0.06] flex items-center justify-center text-2xl font-bold text-white/40 shrink-0">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white">{client.name}</h2>
            {client.user && <p className="text-white/30 text-xs mt-0.5">@{client.user}</p>}
            {showSocial && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {client.platforms.map((p) => <PlatformBadge key={p} platform={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Pricing */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Euro className="w-3.5 h-3.5 text-white/30" />
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Pricing</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] p-3">
              <p className="text-white/30 text-[11px] mb-1">€ / Short</p>
              <EditableField
                label="€/short"
                value={pricing?.costoXShort ?? 0}
                type="number"
                onSave={(v) => saveField("costoXShort", v)}
              />
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] p-3">
              <p className="text-white/30 text-[11px] mb-1">€ / Long</p>
              <EditableField
                label="€/long"
                value={pricing?.costoXLong ?? 0}
                type="number"
                onSave={(v) => saveField("costoXLong", v)}
              />
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] p-3">
              <p className="text-white/30 text-[11px] mb-1">Stato</p>
              <PagamentoToggle
                clientName={client.name}
                value={pricing?.statoPagamento ?? "Da fatturare"}
                onSave={(v) => saveField("statoPagamento", v)}
              />
            </div>
          </div>
        </section>

        {/* Notes */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <StickyNote className="w-3.5 h-3.5 text-white/30" />
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Note</h3>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] px-3 py-2">
            <EditableField
              label="Note"
              value={client.notes}
              onSave={(v) => saveField("notes", v)}
            />
          </div>
        </section>

        {/* Pipeline */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Video className="w-3.5 h-3.5 text-white/30" />
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Pipeline</h3>
            <span className="text-[11px] text-white/25 ml-auto">{clientCards.length} contenut{clientCards.length === 1 ? "o" : "i"}</span>
          </div>
          {clientCards.length > 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
              {clientCards.map((card) => <PipelineRow key={card.id} card={card} />)}
            </div>
          ) : (
            <p className="text-white/20 text-sm text-center py-6 rounded-xl border border-white/[0.05]">Nessun contenuto in pipeline</p>
          )}
        </section>

        {/* SMM Log — solo per VideoCraft Studio */}
        {showSocial && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Send className="w-3.5 h-3.5 text-white/30" />
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Pubblicazioni recenti</h3>
              <span className="text-[11px] text-white/25 ml-auto">{clientLog.length}</span>
            </div>
            {clientLog.length > 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0a] px-3">
                {clientLog.map((entry, i) => <SmmRow key={i} entry={entry} />)}
              </div>
            ) : (
              <p className="text-white/20 text-sm text-center py-6 rounded-xl border border-white/[0.05]">Nessuna pubblicazione registrata</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

interface Props {
  clients: ClienteSocial[];
  pricing: Record<string, ContabilitaConfigClient>;
  cards: PipelineCard[];
  smmLog: SmmLogEntry[];
}

export function ClientsView({ clients, pricing, cards, smmLog }: Props) {
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(clients[0]?.name ?? null);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.platforms.some((p) => p.includes(q)));
  }, [clients, search]);

  const pipelineCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const card of cards) map[card.client] = (map[card.client] ?? 0) + 1;
    return map;
  }, [cards]);

  const selected = clients.find((c) => c.name === selectedName) ?? null;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left list */}
      <div className="w-72 shrink-0 border-r border-white/[0.08] flex flex-col bg-[#0d0d0d]">
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <h1 className="text-lg font-bold text-white mb-3">Clienti</h1>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca cliente…"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-sm text-white/70 placeholder-white/20 outline-none focus:border-[#39FF14]/40 transition-colors"
            />
          </div>
          <p className="text-[11px] text-white/25 mt-2">{filtered.length} di {clients.length} clienti</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <ClientListRow
              key={c.name}
              client={c}
              pipelineCount={pipelineCount[c.name] ?? 0}
              active={c.name === selectedName}
              onClick={() => setSelectedName(c.name)}
            />
          ))}
          {filtered.length === 0 && <p className="text-white/20 text-sm text-center py-8 px-4">Nessun cliente trovato</p>}
        </div>
      </div>

      {/* Right detail */}
      {selected ? (
        <ClientDetail client={selected} pricing={pricing[selected.name] ?? null} cards={cards} smmLog={smmLog} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/20 text-sm">Seleziona un cliente</p>
        </div>
      )}
    </div>
  );
}
