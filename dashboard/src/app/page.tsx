import { Suspense } from "react";
import { readPipeline, readClients } from "@/lib/data";
import { PipelineCard, PipelineRow } from "@/components/PipelineCard";
import { ClientFilter } from "@/components/ClientFilter";
import { RefreshTicker } from "@/components/RefreshTicker";

interface Props {
  searchParams: Promise<{ client?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const { client: clientFilter } = await searchParams;
  const data = readPipeline();
  const allClients = readClients();

  const cards = clientFilter
    ? data.cards.filter((c) => c.client === clientFilter)
    : data.cards;

  const active = cards.filter(
    (c) => c.status === "In Lavorazione" || c.status === "In Approvazione"
  );
  const pending = cards.filter((c) => c.status === "Idea");
  const done = cards.filter(
    (c) => c.status === "Approvato" || c.status === "Pubblicato"
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] sticky top-0 bg-background/80 backdrop-blur z-10">
        <div>
          <h1 className="text-xl font-bold text-white">Pipeline</h1>
          <p className="text-white/40 text-xs mt-0.5">
            {data.cards.length} contenuti totali · aggiornato{" "}
            {data.lastUpdate
              ? new Date(data.lastUpdate).toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Suspense>
            <ClientFilter clients={allClients} />
          </Suspense>
          <RefreshTicker />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {/* ── Active pipelines ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-white/70">
              In Lavorazione
            </h2>
            <span className="text-xs text-white/30 ml-1">
              ({active.filter((c) => c.status === "In Lavorazione").length})
            </span>
          </div>

          {active.filter((c) => c.status === "In Lavorazione").length === 0 ? (
            <p className="text-sm text-white/25 italic">
              Nessuna pipeline attiva.
            </p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {active
                .filter((c) => c.status === "In Lavorazione")
                .map((card) => (
                  <PipelineCard key={card.id} card={card} />
                ))}
            </div>
          )}
        </section>

        {/* ── In Approvazione ── */}
        {active.filter((c) => c.status === "In Approvazione").length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <h2 className="text-sm font-semibold text-white/70">
                In Approvazione
              </h2>
              <span className="text-xs text-white/30 ml-1">
                ({active.filter((c) => c.status === "In Approvazione").length})
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {active
                .filter((c) => c.status === "In Approvazione")
                .map((card) => (
                  <PipelineCard key={card.id} card={card} />
                ))}
            </div>
          </section>
        )}

        {/* ── Idee ── */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-white/20" />
              <h2 className="text-sm font-semibold text-white/40">Idee</h2>
              <span className="text-xs text-white/20 ml-1">
                ({pending.length})
              </span>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#111111] overflow-hidden">
              {pending.map((card) => (
                <PipelineRow key={card.id} card={card} />
              ))}
            </div>
          </section>
        )}

        {/* ── Completati ── */}
        {done.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#39FF14]" />
              <h2 className="text-sm font-semibold text-white/50">
                Completati
              </h2>
              <span className="text-xs text-white/30 ml-1">({done.length})</span>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#111111] overflow-hidden">
              {done.map((card) => (
                <PipelineRow key={card.id} card={card} />
              ))}
            </div>
          </section>
        )}

        {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-white/20 text-4xl mb-3">📭</p>
            <p className="text-white/30 text-sm">
              {clientFilter
                ? `Nessun contenuto per "${clientFilter}"`
                : "Nessuna pipeline. Manda un brief su Telegram per iniziare."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
