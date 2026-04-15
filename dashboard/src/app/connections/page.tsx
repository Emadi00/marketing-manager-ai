import { readConnections } from "@/lib/data";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  connected:    "bg-[#39FF14]/15 text-[#39FF14]",
  disconnected: "bg-white/[0.06] text-white/30",
  expired:      "bg-red-400/15 text-red-400",
};

const STATUS_DOT: Record<string, string> = {
  connected:    "bg-[#39FF14]",
  disconnected: "bg-white/20",
  expired:      "bg-red-400 animate-pulse",
};

const STATUS_LABEL: Record<string, string> = {
  connected:    "Connesso",
  disconnected: "Non configurato",
  expired:      "Scaduto",
};

export default function ConnectionsPage() {
  const { clients, lastUpdate } = readConnections();

  const allPlatforms = Object.values(clients).flatMap((c) => Object.values(c.platforms));
  const connected    = allPlatforms.filter((p) => p.status === "connected").length;
  const issues       = allPlatforms.filter((p) => p.status === "expired").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] sticky top-0 bg-background/80 backdrop-blur z-10">
        <div>
          <h1 className="text-xl font-bold text-white">Connessioni</h1>
          <p className="text-white/40 text-xs mt-0.5">
            {connected} connesse · {allPlatforms.length - connected} non configurate
            {issues > 0 && ` · ${issues} scadute`}
          </p>
        </div>
        {issues > 0 && (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            {issues} token scadut{issues > 1 ? "i" : "o"}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {Object.entries(clients).map(([clientId, client]) => {
          const platforms = Object.entries(client.platforms);
          const connectedCount = platforms.filter(([, p]) => p.status === "connected").length;

          return (
            <section key={clientId}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-semibold text-white">{client.name}</h2>
                <span className="text-xs text-white/30">
                  {connectedCount}/{platforms.length} piattaforme
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {platforms.map(([platKey, plat]) => (
                  <div
                    key={platKey}
                    className={cn(
                      "rounded-xl border bg-[#111111] p-4",
                      plat.status === "expired"
                        ? "border-red-400/30"
                        : plat.status === "connected"
                        ? "border-white/[0.08]"
                        : "border-white/[0.04]"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{plat.icon}</span>
                        <span className="text-sm font-medium text-white">{plat.name}</span>
                      </div>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_STYLE[plat.status] ?? STATUS_STYLE.disconnected)}>
                        {STATUS_LABEL[plat.status] ?? plat.status}
                      </span>
                    </div>

                    {plat.handle && (
                      <p className="text-xs text-white/50 mb-1">{plat.handle}</p>
                    )}
                    {plat.accountId && (
                      <p className="text-[11px] text-white/30 font-mono">{plat.accountId}</p>
                    )}
                    {plat.note && (
                      <p className="text-[11px] text-white/30 italic">{plat.note}</p>
                    )}
                    {plat.accessLevel && (
                      <p className="text-[11px] text-white/30 mt-1">
                        Accesso: <span className="text-white/50">{plat.accessLevel}</span>
                      </p>
                    )}
                    {plat.connectedAt && (
                      <p className="text-[11px] text-white/20 mt-1">
                        Dal {new Date(plat.connectedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    )}

                    {/* Assets */}
                    {plat.assets && plat.assets.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1">
                        {plat.assets.map((asset, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="text-white/30">{asset.type}</span>
                            <span className="text-white/50 truncate ml-2">{asset.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {Object.keys(clients).length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-4xl mb-3">🔌</p>
            <p className="text-white/30 text-sm">Nessuna connessione configurata</p>
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
