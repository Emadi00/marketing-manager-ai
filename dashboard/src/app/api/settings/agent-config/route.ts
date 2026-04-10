import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(
  "C:\\Users\\super\\Desktop\\ai-command-center\\data",
  "agent-dashboard-config.json"
);

interface AgentConfig {
  enabled: boolean;
  model: "claude-sonnet-4-6" | "claude-haiku-4-5-20251001";
}

function readConfig(): Record<string, AgentConfig> {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json(readConfig());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { agentId: string; config: Partial<AgentConfig> };
    const current = readConfig();
    const defaults: AgentConfig = { enabled: true, model: "claude-sonnet-4-6" };
    current[body.agentId] = {
      ...defaults,
      ...current[body.agentId],
      ...body.config,
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
