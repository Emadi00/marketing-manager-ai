"""
Runner per analisi video da Google Drive.
Eseguire da: C:\Users\super\Desktop\MARKETING MANAGER\
"""

import asyncio
import sys
import os

# Aggiungi la directory al path
sys.path.insert(0, r"C:\Users\super\Desktop\MARKETING MANAGER")

import json

import video_analyzer

# Config — legge da secrets.json o env (mai hardcodare la chiave)
def _load_key():
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    try:
        secrets_path = r"C:\Users\super\Desktop\ai-command-center\data\secrets.json"
        with open(secrets_path, encoding="utf-8") as f:
            return json.load(f).get("anthropic", {}).get("apiKey", "")
    except Exception:
        return ""

video_analyzer.API_KEY   = _load_key()
video_analyzer.BASE_PATH = r"C:\Users\super\Desktop\MARKETING MANAGER\agents\marketing-manager\workspace"
video_analyzer.MAX_CLIPS = 8

VIDEO_URL = "https://drive.google.com/file/d/1L5ZXddmCsyUkDsTqtR1enDkwy7-Mptt3/view"


async def progress(msg: str):
    print(msg, flush=True)


async def main():
    print("=" * 60)
    print("VIDEO CLIP ANALYSIS PIPELINE")
    print("=" * 60)

    try:
        pdf_path = await video_analyzer.analizza_video_gdrive(VIDEO_URL, progress_cb=progress)
        print(f"\n✅ PDF generato con successo!")
        print(f"📄 Percorso: {pdf_path}")
        return pdf_path
    except Exception as e:
        print(f"\n❌ Errore: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    asyncio.run(main())
