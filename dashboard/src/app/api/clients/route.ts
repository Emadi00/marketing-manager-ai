import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CLIENTI_SOCIAL = path.join(
  "C:\\Users\\super\\Desktop\\MARKETING MANAGER",
  "clienti_social.json"
);
const CONTABILITA_CONFIG = path.join(
  "C:\\Users\\super\\Desktop\\ai-command-center\\data",
  "contabilita_config.json"
);

interface ClientUpdate {
  name: string;                  // chiave di ricerca (non modificabile)
  notes?: string;
  costoXShort?: number;
  costoXLong?: number;
  statoPagamento?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ClientUpdate;

    // 1. Aggiorna clienti_social.json (notes)
    if (body.notes !== undefined) {
      const social = JSON.parse(fs.readFileSync(CLIENTI_SOCIAL, "utf-8"));
      if (social[body.name]) {
        social[body.name].notes = body.notes;
        fs.writeFileSync(CLIENTI_SOCIAL, JSON.stringify(social, null, 2));
      }
    }

    // 2. Aggiorna contabilita_config.json (pricing + stato pagamento)
    const hasPricing =
      body.costoXShort !== undefined ||
      body.costoXLong !== undefined ||
      body.statoPagamento !== undefined;

    if (hasPricing) {
      const cfg = JSON.parse(fs.readFileSync(CONTABILITA_CONFIG, "utf-8"));
      if (!cfg.clienti[body.name]) {
        cfg.clienti[body.name] = { costoXShort: 0, costoXLong: 0, statoPagamento: "Da fatturare" };
      }
      if (body.costoXShort !== undefined) cfg.clienti[body.name].costoXShort = body.costoXShort;
      if (body.costoXLong  !== undefined) cfg.clienti[body.name].costoXLong  = body.costoXLong;
      if (body.statoPagamento !== undefined) cfg.clienti[body.name].statoPagamento = body.statoPagamento;
      fs.writeFileSync(CONTABILITA_CONFIG, JSON.stringify(cfg, null, 2));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
