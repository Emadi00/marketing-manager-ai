import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SECRETS_PATH = path.join(
  "C:\\Users\\super\\Desktop\\ai-command-center\\data",
  "secrets.json"
);

interface KeyStatus {
  set: boolean;
  source: "env" | "secrets.json" | "none";
  masked?: string; // last 4 chars of real value
}

function checkKey(
  envVar: string,
  ...jsonPath: string[]
): KeyStatus {
  // Check env var first
  const envVal = process.env[envVar];
  if (envVal && envVal.length > 4) {
    return {
      set: true,
      source: "env",
      masked: "..." + envVal.slice(-4),
    };
  }

  // Check secrets.json
  try {
    const secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, "utf-8"));
    let node: Record<string, unknown> = secrets;
    for (const k of jsonPath) {
      node = (node[k] ?? {}) as Record<string, unknown>;
    }
    const val = node as unknown as string;
    if (typeof val === "string" && val.length > 4) {
      return {
        set: true,
        source: "secrets.json",
        masked: "..." + val.slice(-4),
      };
    }
  } catch {
    // ignore
  }

  return { set: false, source: "none" };
}

export async function GET() {
  const status = {
    anthropic:   checkKey("ANTHROPIC_API_KEY",        "anthropic",   "apiKey"),
    telegram:    checkKey("TELEGRAM_TOKEN",            "telegram",    "botToken"),
    upload_post: checkKey("UPLOAD_POST_API_KEY",       "upload_post", "apiKey"),
    ideogram:    checkKey("IDEOGRAM_API_KEY",          "ideogram",    "apiKey"),
    pexels:      checkKey("PEXELS_API_KEY",            "pexels",      "apiKey"),
    elevenlabs:  checkKey("ELEVENLABS_API_KEY",        "elevenlabs",  "apiKey"),
    meta_token:  checkKey("META_PAGE_ACCESS_TOKEN",    "meta",        "pageAccessToken"),
    meta_ig_id:  checkKey("META_IG_USER_ID",           "meta",        "igUserId"),
  };

  return NextResponse.json(status);
}
