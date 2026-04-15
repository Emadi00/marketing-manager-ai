import { readAgents } from "@/lib/data";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-[#39FF14] animate-pulse",
  idle:    "bg-white/20",
  error:   "bg-red-400",
  waiting: "bg-amber-400 animate-pulse",
};

const STATUS_LABEL: Record<string, string> = {
  running: "In esecuzione",
  idle:    "Inattivo",
  error:   "Errore",
  waiting: "In attesa",
};

const CATEGORY_LABEL: Record<string, string> = {
  core:      "Core",
  publisher: "Publisher",
  adv:       "ADV",
  analyst:   "Analyst",
};

export default function AgentsPage() {
  const { agents, lastUpdate } = readAgents();

  const active  = agents.filter((a) => a.status === "running" || a.status === "waiting");
  const byCategory = agents.reduce<Record<string, typeof agents>>((acc, a) => {
    const cat = a.category ?? "core";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] sticky top-0 bg-background/80 backdrop-blur z-10">
        <div>
          <h1 className="text-xl font-bold text-white">Agenti AI</h1>
          <p className="text-white/40 text-xs mt-0.5">
            {agents.length} agenti · {active.length} attivi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", active.length > 0 ? "bg-[#39FF14] animate-pulse" : "bg-white/20")} />
          <span className="text-xs text-white/40">
            {active.length > 0 ? `${active.length} in esecuzione` : "Tutti inattivi"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Agenti totali",   value: agents.length },
            { label: "Attivi ora",      value: active.length },
            { label: "Task oggi",       value: agents.reduce((s, a) => s + (a.tasksToday ?? 0), 0) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
              <p className="text-white/40 text-xs mb-2">{label}</p>
              <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* Agents by category */}
        {Object.entries(byCategory).map(([cat, list]) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
              {CATEGORY_LABEL[cat] ?? cat}
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {list.map((agent) => (
                <div
                  key={agent.id}
                  className="rounded-xl border border-white/[0.08] bg-[#111111] p-4 flex gap-4"
                >
                  {/* Emoji + status dot */}
                  <div className="relative shrink-0">
                    <span className="text-2xl">{agent.emoji}</span>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#111111]",
                        STATUS_COLORS[agent.status] ?? "bg-white/20"
                      )}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full shrink-0",
                        agent.status === "running" ? "bg-[#39FF14]/15 text-[#39FF14]" :
                        agent.status === "error"   ? "bg-red-400/15 text-red-400" :
                        agent.status === "waiting" ? "bg-amber-400/15 text-amber-400" :
                        "bg-white/[0.06] text-white/30"
                      )}>
                        {STATUS_LABEL[agent.status] ?? agent.status}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5 truncate">{agent.role}</p>

                    {agent.currentTask && (
                      <p className="text-xs text-[#00d4ff] mt-1.5 truncate">
                        ↳ {agent.currentTask}
                      </p>
                    )}

                    {agent.progress > 0 && (
                      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#39FF14] transition-all"
                          style={{ width: `${agent.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Metrics */}
                    <div className="flex gap-4 mt-2">
                      <span className="text-[11px] text-white/30">
                        Task oggi: <span className="text-white/60">{agent.tasksToday ?? 0}</span>
                      </span>
                      {agent.lastUpdate && (
                        <span className="text-[11px] text-white/30">
                          Ultimo: <span className="text-white/60">
                            {new Date(agent.lastUpdate).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {agents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-4xl mb-3">🤖</p>
            <p className="text-white/30 text-sm">Nessun agente configurato</p>
          </div>
        )}

        {lastUpdate && (
          <p className="text-[11px] text-white/20 text-right pb-2">
            Aggiornato: {new Date(lastUpdate).toLocaleString("it-IT")}
          </p>
        )}
      </div>
    </div>
  );
}
