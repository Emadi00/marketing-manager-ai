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

interface TipologiaVideo {
  nome: string;
  prezzo: number;
  videiFatti: number;
  videoInclusi: number;
}

interface ClientCfg {
  tipologie: TipologiaVideo[];
  statoPagamento: string;
  tipoContratto: string;
  costoXShort?: number;
  costoXLong?: number;
  videiFatti?: number;
}

interface CfgFile {
  clienti: Record<string, ClientCfg>;
}

function defaultCfg(): ClientCfg {
  return {
    tipologie: [],
    statoPagamento: "Da fatturare",
    tipoContratto: "a-video",
  };
}

function readCfg(): CfgFile {
  if (!fs.existsSync(CONTABILITA_CONFIG)) return { clienti: {} };
  return JSON.parse(fs.readFileSync(CONTABILITA_CONFIG, "utf-8")) as CfgFile;
}

function writeCfg(cfg: CfgFile) {
  fs.writeFileSync(CONTABILITA_CONFIG, JSON.stringify(cfg, null, 2));
}

interface ClientUpdate {
  name: string;
  // notes
  notes?: string;
  // scalar fields
  statoPagamento?: string;
  tipoContratto?: "pacchetto" | "a-video";
  // tipologie operations
  tipologie?: TipologiaVideo[]; // replace entire array
  tipologiaAdd?: TipologiaVideo; // append one
  tipologiaUpdate?: { index: number } & Partial<TipologiaVideo>; // update one by index
  tipologiaDelete?: number; // delete by index
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ClientUpdate;

    // 1. Update clienti_social.json (notes)
    if (body.notes !== undefined) {
      const social = JSON.parse(fs.readFileSync(CLIENTI_SOCIAL, "utf-8"));
      if (social[body.name]) {
        social[body.name].notes = body.notes;
        fs.writeFileSync(CLIENTI_SOCIAL, JSON.stringify(social, null, 2));
      }
    }

    // 2. Update contabilita_config.json
    const hasCfg =
      body.statoPagamento !== undefined ||
      body.tipoContratto !== undefined ||
      body.tipologie !== undefined ||
      body.tipologiaAdd !== undefined ||
      body.tipologiaUpdate !== undefined ||
      body.tipologiaDelete !== undefined;

    if (hasCfg) {
      const cfg = readCfg();
      if (!cfg.clienti[body.name]) cfg.clienti[body.name] = defaultCfg();
      const c = cfg.clienti[body.name];

      // Ensure tipologie array exists (migrate legacy data)
      if (!Array.isArray(c.tipologie)) c.tipologie = [];

      if (body.statoPagamento !== undefined) c.statoPagamento = body.statoPagamento;
      if (body.tipoContratto !== undefined) c.tipoContratto = body.tipoContratto;

      if (body.tipologie !== undefined) {
        c.tipologie = body.tipologie;
      } else if (body.tipologiaAdd !== undefined) {
        c.tipologie.push(body.tipologiaAdd);
      } else if (body.tipologiaUpdate !== undefined) {
        const { index, ...fields } = body.tipologiaUpdate;
        if (c.tipologie[index]) Object.assign(c.tipologie[index], fields);
      } else if (body.tipologiaDelete !== undefined) {
        c.tipologie.splice(body.tipologiaDelete, 1);
      }

      writeCfg(cfg);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
