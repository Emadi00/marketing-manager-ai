import { readTrading } from "@/lib/data";
import { cn } from "@/lib/utils";

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

export default function TradingPage() {
  const data = readTrading();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-white/30 text-sm">trading.json non trovato</p>
      </div>
    );
  }

  const { account, allocation, regime } = data;
  const totalReturn      = account.totalReturn ?? 0;
  const totalReturnPct   = account.totalReturnPct ?? 0;
  const dailyPnL         = account.dailyPnL ?? 0;
  const dailyPnLPct      = account.dailyPnLPct ?? 0;
  const isPositive       = totalReturn >= 0;
  const isDailyPositive  = dailyPnL >= 0;

  const allocationEntries = Object.entries(allocation ?? {})
    .sort(([, a], [, b]) => (b.pct ?? 0) - (a.pct ?? 0));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] sticky top-0 bg-background/80 backdrop-blur z-10">
        <div>
          <h1 className="text-xl font-bold text-white">Trading</h1>
          <p className="text-white/40 text-xs mt-0.5">
            {account.broker} · Paper Trading
            {account.circuitBreaker && (
              <span className="ml-2 text-red-400">⚠ Circuit Breaker attivo</span>
            )}
          </p>
        </div>
        {data.lastUpdate && (
          <p className="text-xs text-white/30">
            {new Date(data.lastUpdate).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
            <p className="text-white/40 text-xs mb-2">Valore attuale</p>
            <p className="text-2xl font-bold text-white tabular-nums">{eur(account.currentValue)}</p>
            <p className="text-xs text-white/30 mt-0.5">Iniziale: {eur(account.initialValue)}</p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
            <p className="text-white/40 text-xs mb-2">Rendimento totale</p>
            <p className={cn("text-2xl font-bold tabular-nums", isPositive ? "text-[#39FF14]" : "text-red-400")}>
              {pct(totalReturnPct)}
            </p>
            <p className={cn("text-xs mt-0.5", isPositive ? "text-[#39FF14]/60" : "text-red-400/60")}>
              {isPositive ? "+" : ""}{eur(totalReturn)}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
            <p className="text-white/40 text-xs mb-2">P&L oggi</p>
            <p className={cn("text-2xl font-bold tabular-nums", isDailyPositive ? "text-[#39FF14]" : "text-red-400")}>
              {pct(dailyPnLPct)}
            </p>
            <p className={cn("text-xs mt-0.5", isDailyPositive ? "text-[#39FF14]/60" : "text-red-400/60")}>
              {isDailyPositive ? "+" : ""}{eur(dailyPnL)}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
            <p className="text-white/40 text-xs mb-2">Max Drawdown</p>
            <p className={cn("text-2xl font-bold tabular-nums", (account.maxDrawdown ?? 0) > 5 ? "text-red-400" : "text-white")}>
              {pct(-(account.maxDrawdown ?? 0))}
            </p>
            <p className="text-xs text-white/30 mt-0.5">Peak: {eur(account.peakValue)}</p>
          </div>
        </div>

        {/* Regime */}
        {regime?.current != null && (
          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4">
            <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Regime di mercato</p>
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold text-[#00d4ff]">{String(regime.current ?? "")}</span>
              {regime.confidence != null && (
                <span className="text-xs text-white/40">Confidenza: {String(regime.confidence ?? "")}%</span>
              )}
              {regime.dalioQuadrant != null && (
                <span className="text-xs text-white/40">Quadrante: {String(regime.dalioQuadrant ?? "")}</span>
              )}
            </div>
            {regime.description != null && (
              <p className="text-xs text-white/30 mt-1 italic">{String(regime.description ?? "")}</p>
            )}
          </div>
        )}

        {/* Allocation */}
        {allocationEntries.length > 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5">
            <p className="text-xs text-white/40 mb-4 uppercase tracking-wider">Allocazione portafoglio</p>
            <div className="space-y-3">
              {allocationEntries.map(([ticker, entry]) => {
                const ret = entry.return ?? 0;
                return (
                  <div key={ticker}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-mono font-bold w-10">{ticker}</span>
                        <span className="text-white/40">{eur(entry.value)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn("font-medium", ret >= 0 ? "text-[#39FF14]" : "text-red-400")}>
                          {pct(ret)}
                        </span>
                        <span className="text-white/40 w-10 text-right">{(entry.pct ?? 0).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", ret >= 0 ? "bg-[#39FF14]" : "bg-red-400")}
                        style={{ width: `${Math.min(entry.pct ?? 0, 100)}%`, opacity: 0.7 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
