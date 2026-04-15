import { readIdeas } from "@/lib/data";
import type { ContentIdea } from "@/lib/data";

const FORMAT_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  reels:     { label: "Reels",     color: "text-[#39FF14]",  emoji: "🎬" },
  posts:     { label: "Post",      color: "text-[#00d4ff]",  emoji: "🖼" },
  carousels: { label: "Caroselli", color: "text-[#a855f7]",  emoji: "📑" },
};

function IdeaCard({ idea }: { idea: ContentIdea }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0f0f0f] p-3">
      <p className="text-sm text-white/80 leading-snug">{idea.hook}</p>
      {idea.angle && (
        <p className="text-xs text-white/40 mt-1.5 italic">↳ {idea.angle}</p>
      )}
      {idea.format && (
        <p className="text-[11px] text-white/30 mt-1">{idea.format}</p>
      )}
    </div>
  );
}

function FormatSection({
  label,
  color,
  emoji,
  ideas,
}: {
  label: string;
  color: string;
  emoji: string;
  ideas: ContentIdea[];
}) {
  if (ideas.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span>{emoji}</span>
        <h3 className={`text-sm font-semibold ${color}`}>{label}</h3>
        <span className="text-xs text-white/30">({ideas.length})</span>
      </div>
      <div className="space-y-2">
        {ideas.map((idea, i) => (
          <IdeaCard key={idea.id ?? i} idea={idea} />
        ))}
      </div>
    </div>
  );
}

export default function IdeasPage() {
  const { clients, lastUpdate } = readIdeas();

  const totalIdeas = clients.reduce(
    (s, c) => s + c.reels.length + c.posts.length + c.carousels.length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] sticky top-0 bg-background/80 backdrop-blur z-10">
        <div>
          <h1 className="text-xl font-bold text-white">Idee Contenuti</h1>
          <p className="text-white/40 text-xs mt-0.5">
            {totalIdeas} idee · {clients.length} clienti
          </p>
        </div>
        {lastUpdate && (
          <p className="text-xs text-white/30">
            Generato: {new Date(lastUpdate).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10">
        {clients.map((client) => {
          const count = client.reels.length + client.posts.length + client.carousels.length;
          return (
            <section key={client.id}>
              {/* Client header */}
              <div className="flex items-center gap-3 mb-5 pb-3 border-b border-white/[0.06]">
                <span className="text-2xl">{client.emoji}</span>
                <div>
                  <h2 className="text-base font-bold text-white">{client.name}</h2>
                  <p className="text-xs text-white/40">{client.niche} · {count} idee</p>
                </div>
              </div>

              {count === 0 ? (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <p className="text-white/20 text-sm italic">
                    Nessuna idea — chiedi al Strategist di generarne.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  {(["reels", "posts", "carousels"] as const).map((fmt) => {
                    const cfg = FORMAT_CONFIG[fmt];
                    return (
                      <FormatSection
                        key={fmt}
                        label={cfg.label}
                        color={cfg.color}
                        emoji={cfg.emoji}
                        ideas={client[fmt]}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {clients.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-4xl mb-3">💡</p>
            <p className="text-white/30 text-sm">Nessuna idea generata</p>
            <p className="text-white/20 text-xs mt-1">Chiedi al Strategist o all&apos;SMM Researcher</p>
          </div>
        )}
      </div>
    </div>
  );
}
