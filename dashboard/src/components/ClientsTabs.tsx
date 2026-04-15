"use client";

import { useState } from "react";
import { Users, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientsView } from "@/components/ClientsView";
import type {
  ClienteSocial,
  ContabilitaConfigClient,
  PipelineCard,
  SmmLogEntry,
  ContabilitaMese,
  ContabilitaClientRow,
} from "@/lib/data";

const STATO_STYLE: Record<string, string> = {
  "Pagato":        "bg-[#39FF14]/15 text-[#39FF14]",
  "Da fatturare":  "bg-amber-400/15 text-amber-400",
  "In attesa":     "bg-white/[0.06] text-white/40",
  "Fatturato":     "bg-[#00d4ff]/15 text-[#00d4ff]",
};

interface ContabilitaMonth { year: string; month: string; data: ContabilitaMese }

function ContabilitaContent({ contabilita }: { contabilita: Record<string, Record<string, ContabilitaMese>> }) {
  const MONTH_ORDER = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

  const allMonths: ContabilitaMonth[] = [];
  for (const [year, months] of Object.entries(contabilita)) {
    for (const [month, data] of Object.entries(months)) {
      allMonths.push({ year, month, data });
    }
  }
  allMonths.sort((a, b) => {
    const ya = parseInt(a.year), yb = parseInt(b.year);
    if (ya !== yb) return yb - ya;
    return MONTH_ORDER.indexOf(b.month) - MONTH_ORDER.indexOf(a.month);
  });

  if (allMonths.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24">
      <p className="text-4xl mb-3">💰</p>
      <p className="text-white/30 text-sm">Nessun dato contabile registrato</p>
    </div>
  );

  return (
    <div className="space-y-8">
      {allMonths.map(({ year, month, data }) => {
        const clienti = data.clienti ?? [];
        const costi   = data.costi ?? [];
        const totFatture = clienti.reduce((s, c) => s + (c.fattura ?? 0), 0);
        const totCosti   = costi.reduce((s, c) => s + (c.costoMensile ?? 0), 0) +
                           clienti.reduce((s, c) => s + (c.costoEditor ?? 0) + (c.costoAI ?? 0), 0);
        const margine = totFatture - totCosti;

        return (
          <section key={`${year}-${month}`}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/[0.06]">
              <h2 className="text-base font-bold text-white">{month} {year}</h2>
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span className="text-white/30">Fatturato </span>
                  <span className="text-white font-semibold">€{totFatture.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-white/30">Costi </span>
                  <span className="text-white/70">€{totCosti.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-white/30">Margine </span>
                  <span className={cn("font-bold", margine >= 0 ? "text-[#39FF14]" : "text-red-400")}>
                    €{margine.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>

            {clienti.length > 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-[#111111] overflow-hidden mb-4">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-0 text-[11px] text-white/30 px-4 py-2 border-b border-white/[0.06] uppercase tracking-wider">
                  <span>Cliente</span>
                  <span className="text-right pr-4">Short</span>
                  <span className="text-right pr-4">Long</span>
                  <span className="text-right pr-4">Fattura</span>
                  <span className="text-right pr-4">Costi</span>
                  <span className="text-right">Stato</span>
                </div>
                {clienti.map((row: ContabilitaClientRow, i: number) => {
                  const costiRow = (row.costoEditor ?? 0) + (row.costoAI ?? 0);
                  return (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-0 px-4 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <div>
                        <p className="text-sm text-white/80">{row.cliente}</p>
                        {row.editor && row.editor !== "Nessuno" && (
                          <p className="text-[11px] text-white/30">Editor: {row.editor}</p>
                        )}
                      </div>
                      <span className="text-xs text-white/50 text-right pr-4 self-center">{row.videoShorts ?? 0}</span>
                      <span className="text-xs text-white/50 text-right pr-4 self-center">{row.videoLong ?? 0}</span>
                      <span className="text-xs text-white font-medium text-right pr-4 self-center">€{(row.fattura ?? 0).toFixed(0)}</span>
                      <span className="text-xs text-white/40 text-right pr-4 self-center">€{costiRow.toFixed(0)}</span>
                      <div className="self-center text-right">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full", STATO_STYLE[row.statoPagamento] ?? STATO_STYLE["In attesa"])}>
                          {row.statoPagamento}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {costi.length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-[#0d0d0d] p-4">
                <p className="text-xs text-white/30 mb-2 uppercase tracking-wider">Costi fissi</p>
                <div className="space-y-1.5">
                  {costi.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-white/50">{c.nome}</span>
                        <span className="text-white/20">{c.tipo}</span>
                      </div>
                      <span className="text-white/60">€{(c.costoMensile ?? 0).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  CLIENTS TABS WRAPPER
// ══════════════════════════════════════════════════════
interface Props {
  clients: ClienteSocial[];
  pricing: Record<string, ContabilitaConfigClient>;
  cards: PipelineCard[];
  smmLog: SmmLogEntry[];
  contabilita: Record<string, Record<string, ContabilitaMese>>;
}

type Tab = "clienti" | "contabilita";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "clienti",     label: "Clienti",     icon: Users   },
  { id: "contabilita", label: "Contabilità", icon: Receipt },
];

export function ClientsTabs({ clients, pricing, cards, smmLog, contabilita }: Props) {
  const [tab, setTab] = useState<Tab>("clienti");

  return (
    <div className="flex flex-col h-full">
      {/* Tab header */}
      <div className="flex items-center gap-1 px-8 pt-4 pb-0 border-b border-white/[0.06] shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === id
                ? "text-white border-[#39FF14]"
                : "text-white/40 border-transparent hover:text-white/70"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "clienti" ? (
        <ClientsView clients={clients} pricing={pricing} cards={cards} smmLog={smmLog} />
      ) : (
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <ContabilitaContent contabilita={contabilita} />
        </div>
      )}
    </div>
  );
}
