import { NextResponse } from "next/server";
import fs from "fs";

const PIANO_PATH =
  "C:\\Users\\super\\Desktop\\MARKETING MANAGER\\piano_editoriale.json";

export async function GET() {
  if (!fs.existsSync(PIANO_PATH)) {
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }
  try {
    const raw = fs.readFileSync(PIANO_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
