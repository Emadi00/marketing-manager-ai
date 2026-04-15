import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const AGENTI_BASE = "C:\\Users\\super\\Desktop\\MARKETING MANAGER\\AGENTI";

// First-match wins — ordered by most likely location
const AGENT_PATHS: Record<string, string[]> = {
  "marketing-manager": [
    path.join(AGENTI_BASE, "marketing-manager"),
  ],
  strategist: [
    path.join(AGENTI_BASE, "strategist"),
  ],
  copywriter: [
    path.join(AGENTI_BASE, "copywriter"),
  ],
  "cover-designer": [
    path.join(AGENTI_BASE, "cover-designer"),
  ],
  "video-editor": [
    path.join(AGENTI_BASE, "video-editor"),
  ],
  "smm-publisher": [
    path.join(AGENTI_BASE, "smm-publisher"),
  ],
  "smm-researcher": [
    path.join(AGENTI_BASE, "smm-researcher"),
  ],
  "smm-analyst": [
    path.join(AGENTI_BASE, "smm-analyst"),
    path.join(AGENTI_BASE, "smm-researcher"),
  ],
};

function readFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("id") ?? "";

  const folders = AGENT_PATHS[agentId] ?? [];

  for (const folder of folders) {
    const claudePath = path.join(folder, "CLAUDE.md");
    const kbPath     = path.join(folder, "KNOWLEDGE_BASE.md");

    const claude = readFile(claudePath);
    if (claude !== null) {
      return NextResponse.json({
        found:        true,
        claude:       claude,
        knowledgeBase: readFile(kbPath),
        path:         claudePath,
      });
    }
  }

  return NextResponse.json({
    found:        false,
    claude:       null,
    knowledgeBase: null,
    searched:     folders.map((f) => path.join(f, "CLAUDE.md")).join(", "),
  });
}
