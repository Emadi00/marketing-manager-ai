import { readPipeline } from "@/lib/data";
import { ReviewCard } from "@/components/ReviewCard";
import { cn } from "@/lib/utils";

export default function ReviewPage() {
  const { cards } = readPipeline();

  const inReview   = cards.filter((c) => c.status === "In Approvazione");
  const inProgress = cards.filter((c) => c.status === "In Lavorazione");
  const approved   = cards.filter((c) => c.status === "Approvato");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] sticky top-0 bg-background/80 backdrop-blur z-10">
        <div>
          <h1 className="text-xl font-bold text-white">Review</h1>
          <p className="text-white/40 text-xs mt-0.5">
            Contenuti in attesa di approvazione
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-white/50">{inReview.length} da approvare</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#39FF14]" />
            <span className="text-xs text-white/50">{approved.length} approvati</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">

        {/* In Approvazione */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-white/70">In Approvazione</h2>
            <span className="text-xs text-white/30">({inReview.length})</span>
          </div>

          {inReview.length === 0 ? (
            <p className="text-sm text-white/25 italic">Nessun contenuto in attesa.</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {inReview.map((card) => (
                <ReviewCard key={card.id} card={card} />
              ))}
            </div>
          )}
        </section>

        {/* In Lavorazione */}
        {inProgress.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <h2 className="text-sm font-semibold text-white/50">In Lavorazione</h2>
              <span className="text-xs text-white/30">({inProgress.length})</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {inProgress.map((card) => (
                <ReviewCard key={card.id} card={card} compact />
              ))}
            </div>
          </section>
        )}

        {/* Approvati */}
        {approved.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#39FF14]" />
              <h2 className="text-sm font-semibold text-white/40">Approvati</h2>
              <span className="text-xs text-white/20">({approved.length})</span>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#111111] divide-y divide-white/[0.04]">
              {approved.map((card) => (
                <div
                  key={card.id}
                  className={cn(
                    "px-4 py-3 flex items-center justify-between"
                  )}
                >
                  <div>
                    <p className="text-sm text-white/60 line-through">{card.hook || card.title}</p>
                    <p className="text-xs text-white/30 mt-0.5">{card.client} · {card.type}</p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#39FF14]/10 text-[#39FF14]">Approvato</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
