"use client";

import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Eye, Heart, Users, Video, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PerformanceClient,
  PipelineFunnelStep,
} from "@/lib/data";

// ── Palette ────────────────────────────────────────────────────────────────

const NEON    = "#39FF14";
const CYAN    = "#00d4ff";
const AMBER   = "#f59e0b";
const RED     = "#f87171";
const PURPLE  = "#a855f7";
const MUTED   = "rgba(255,255,255,0.06)";
const TOOLTIP_STYLE = {
  backgroundColor: "#1a1a1a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#fff",
  fontSize: 12,
};

// ── KPI card ───────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color = NEON, mock = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  mock?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs font-medium">{label}</span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "15" }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
      </div>
      {mock && (
        <span className="text-[10px] text-white/20 italic">dati mock</span>
      )}
    </div>
  );
}

// ── Section title ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-white/50 mb-4">{children}</h2>
  );
}

// ── Engagement Pie ────────────────────────────────────────────────────────

const PIE_COLORS = [NEON, CYAN, AMBER, PURPLE];

function EngagementPie({
  likes, comments, saves, platform,
}: {
  likes: number; comments: number; saves: number; platform: string;
}) {
  const data = [
    { name: "Like", value: likes },
    { name: "Commenti", value: comments },
    { name: "Salvataggi", value: saves },
  ].filter((d) => d.value > 0);

  const total = likes + comments + saves;
  const engRate = total > 0 ? ((total / Math.max(likes, 1)) * 100).toFixed(1) : "0";

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Engagement — {platform}</SectionTitle>
        <span className="text-xs text-white/30">
          {total.toLocaleString("it-IT")} interazioni
        </span>
      </div>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={65}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2 flex-1">
          {data.map((item, i) => (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="text-white/50">{item.name}</span>
              </div>
              <span className="text-white/80 font-medium tabular-nums">
                {item.value.toLocaleString("it-IT")}
              </span>
            </div>
          ))}
          <div className="border-t border-white/[0.06] pt-2 mt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/30">Eng. rate</span>
              <span className="text-[#39FF14] font-bold">{engRate}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Funnel ────────────────────────────────────────────────────────

function PipelineFunnelChart({ steps }: { steps: PipelineFunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5">
      <SectionTitle>Pipeline Funnel — step completati</SectionTitle>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const pct = Math.round((step.count / max) * 100);
          const opacity = 1 - i * 0.12;
          return (
            <div key={step.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-white/50">{step.label}</span>
                <span className="text-white/70 font-medium tabular-nums">
                  {step.count}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: NEON,
                    opacity,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Monthly production bar ─────────────────────────────────────────────────

function MonthlyProductionChart({
  data,
}: {
  data: Array<{ month: string; prodotti: number; pubblicati: number }>;
}) {
  // Pad with mock months if only 1 month of real data
  let chartData = data;
  if (chartData.length < 3) {
    // TODO: sostituire con dati reali quando disponibili
    const mockPrev = [
      { month: "2026-01", prodotti: 2, pubblicati: 1 },
      { month: "2026-02", prodotti: 3, pubblicati: 2 },
      { month: "2026-03", prodotti: 5, pubblicati: 4 },
    ];
    const existing = new Set(data.map((d) => d.month));
    chartData = [...mockPrev.filter((d) => !existing.has(d.month)), ...data];
  }

  const formatted = chartData.map((d) => ({
    ...d,
    label: d.month.slice(0, 7),
  }));

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Produzione mensile</SectionTitle>
        <span className="text-[10px] text-white/20 italic">
          Dati precedenti ad aprile: mock
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={formatted} barGap={4} barCategoryGap="30%">
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={24}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: MUTED }} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}
          />
          <Bar dataKey="prodotti" name="Prodotti" fill={CYAN} radius={[4, 4, 0, 0]} />
          <Bar dataKey="pubblicati" name="Pubblicati" fill={NEON} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Views trend (mock con dati reali come baseline) ───────────────────────

function ViewsTrendChart({ totalViews }: { totalViews: number }) {
  // TODO: sostituire con dailyData reale da Meta API quando disponibile
  const mock = [
    { week: "W1 Feb", views: Math.round(totalViews * 0.04) },
    { week: "W2 Feb", views: Math.round(totalViews * 0.07) },
    { week: "W3 Feb", views: Math.round(totalViews * 0.11) },
    { week: "W4 Feb", views: Math.round(totalViews * 0.09) },
    { week: "W1 Mar", views: Math.round(totalViews * 0.14) },
    { week: "W2 Mar", views: Math.round(totalViews * 0.18) },
    { week: "W3 Mar", views: Math.round(totalViews * 0.16) },
    { week: "W4 Mar", views: Math.round(totalViews * 0.12) },
    { week: "W1 Apr", views: Math.round(totalViews * 0.09) },
  ];

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Trend Views Instagram</SectionTitle>
        <span className="text-[10px] text-white/20 italic">
          Distribuzione mock — totale reale: {totalViews.toLocaleString("it-IT")}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={mock}>
          <defs>
            <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={NEON} stopOpacity={0.3} />
              <stop offset="95%" stopColor={NEON} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="week"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={42}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [(Number(v)).toLocaleString("it-IT"), "Views"]}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke={NEON}
            strokeWidth={2}
            fill="url(#viewsGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Platform overview bar ─────────────────────────────────────────────────

function PlatformOverviewChart({
  client,
}: {
  client: PerformanceClient;
}) {
  const platforms = Object.entries(client.platforms);
  const data = platforms.map(([name, stats]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    Views: stats.views ?? 0,
    Follower: stats.followers ?? 0,
    Like: stats.likes ?? 0,
  }));

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5">
      <SectionTitle>Confronto piattaforme</SectionTitle>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barGap={4} barCategoryGap="40%">
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: MUTED }} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}
          />
          <Bar dataKey="Views" fill={NEON} radius={[4, 4, 0, 0]} />
          <Bar dataKey="Follower" fill={CYAN} radius={[4, 4, 0, 0]} />
          <Bar dataKey="Like" fill={PURPLE} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  perfClient: PerformanceClient | null;
  funnel: PipelineFunnelStep[];
  monthly: Array<{ month: string; prodotti: number; pubblicati: number }>;
  totalCards: number;
  lastSync: string;
}

export function AnalyticsDashboard({
  perfClient,
  funnel,
  monthly,
  totalCards,
  lastSync,
}: Props) {
  const ig = perfClient?.platforms["instagram"];
  const totalViews = ig?.views ?? 0;
  const totalLikes = ig?.likes ?? 0;
  const totalComments = ig?.comments ?? 0;
  const totalSaves = ig?.saves ?? 0;
  const followers = ig?.followers ?? 0;
  const engRate =
    totalViews > 0
      ? (((totalLikes + totalComments + totalSaves) / totalViews) * 100).toFixed(2)
      : "—";

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Views Instagram"
          value={totalViews.toLocaleString("it-IT")}
          sub="totali account"
          icon={Eye}
          color={NEON}
        />
        <KpiCard
          label="Followers"
          value={followers.toLocaleString("it-IT")}
          sub="Instagram"
          icon={Users}
          color={CYAN}
        />
        <KpiCard
          label="Engagement Rate"
          value={`${engRate}%`}
          sub="likes + commenti + salvataggi / views"
          icon={Heart}
          color={AMBER}
        />
        <KpiCard
          label="Contenuti in Pipeline"
          value={String(totalCards)}
          sub="questo mese"
          icon={Video}
          color={PURPLE}
        />
      </div>

      {/* Row 2: views trend + platform comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ViewsTrendChart totalViews={totalViews} />
        {perfClient ? (
          <PlatformOverviewChart client={perfClient} />
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5 flex items-center justify-center">
            <p className="text-white/20 text-sm">Nessun dato piattaforma</p>
          </div>
        )}
      </div>

      {/* Row 3: engagement pie + pipeline funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ig ? (
          <EngagementPie
            likes={totalLikes}
            comments={totalComments}
            saves={totalSaves}
            platform="Instagram"
          />
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-5 flex items-center justify-center">
            <p className="text-white/20 text-sm">Nessun dato engagement</p>
          </div>
        )}
        <PipelineFunnelChart steps={funnel} />
      </div>

      {/* Row 4: monthly production */}
      <MonthlyProductionChart data={monthly} />

      {/* Footer sync info */}
      <p className="text-[11px] text-white/20 text-right pb-2">
        Ultimo sync:{" "}
        {lastSync
          ? new Date(lastSync).toLocaleString("it-IT", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"}
        {" · "}
        <span className="italic">
          Dati views/follower reali da Meta Business API
        </span>
      </p>
    </div>
  );
}
