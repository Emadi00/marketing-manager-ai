import {
  readPerformance,
  readPipeline,
  computePipelineFunnel,
  computeMonthlyProduction,
} from "@/lib/data";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function AnalyticsPage() {
  const perf = readPerformance();
  const { cards } = readPipeline();
  const funnel = computePipelineFunnel();
  const monthly = computeMonthlyProduction();

  // Pick first client with real data, or null
  const perfClient = perf.clients.find((c) => c.platforms) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-white/40 text-xs mt-0.5">
            Performance social + produttività pipeline
          </p>
        </div>
      </div>

      <AnalyticsDashboard
        perfClient={perfClient}
        funnel={funnel}
        monthly={monthly}
        totalCards={cards.length}
        lastSync={perf.lastUpdate}
        showSyncButton
      />
    </div>
  );
}
