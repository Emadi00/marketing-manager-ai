#!/usr/bin/env python3
"""
SMM Auto Research — ogni 48 ore
Chiama Claude API per eseguire il ciclo di ricerca trend
e aggiornare il Marketing Manager.

Configurazione:
  1. Inserire ANTHROPIC_API_KEY qui sotto
  2. Pianificare questo script in Windows Task Scheduler ogni 48 ore

Windows Task Scheduler (setup rapido):
  - Apri Task Scheduler → Create Basic Task
  - Trigger: Daily, ripeti ogni 2 giorni
  - Action: Start a program → python.exe
  - Arguments: "C:/Users/super/Desktop/MARKETING MANAGER/smm-researcher/smm_auto_research.py"
"""

import json
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

# ── Configurazione ─────────────────────────────────────────────────────────────
def _load_anthropic_key() -> str:
    import os
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    try:
        secrets_path = r"C:\Users\super\Desktop\ai-command-center\data\secrets.json"
        with open(secrets_path, encoding="utf-8") as f:
            return json.load(f).get("anthropic", {}).get("apiKey", "")
    except Exception:
        return ""

ANTHROPIC_API_KEY = _load_anthropic_key()
REPORTS_DIR = Path("C:/Users/super/Desktop/MARKETING MANAGER/smm-researcher/reports")
SMM_CLAUDE_MD = Path("C:/Users/super/Desktop/MARKETING MANAGER/smm-researcher/CLAUDE.md")
MARKETING_MANAGER_MD = Path("C:/Users/super/Desktop/MARKETING MANAGER/Project instructions/CLAUDE.md")
REPORTS_DIR.mkdir(exist_ok=True)

# ── Prompt di ricerca ──────────────────────────────────────────────────────────
RESEARCH_PROMPT = """
Sei un Social Media Manager Researcher esperto. Fai una ricerca completa sui trend nei settori MARKETING e VIDEO EDITING.

Analizza e riporta:

## 1. TREND SOCIAL (ultime 48h)
- TikTok/Reels/Shorts: format virali emergenti nel marketing e video editing
- Audio trending: suoni/brani che stanno esplodendo
- Hook testuali che compaiono più volte

## 2. AGGIORNAMENTI ALGORITMI
- Cambiamenti recenti su Instagram, TikTok, YouTube
- Cosa favoriscono / cosa penalizzano adesso

## 3. TECNICHE VIDEO EDITING EMERGENTI
- Nuovi stili di montaggio che stanno performando
- Transizioni, effetti, stili grafici in crescita
- Durata ottimale per ogni piattaforma in questo momento

## 4. TOOL AI & AGGIORNAMENTI
- Nuovi tool AI per video/marketing
- Aggiornamenti significativi a tool esistenti (CapCut, DaVinci, Runway, ecc.)

## 5. TOP 3 OPPORTUNITÀ IMMEDIATE
Le 3 cose più urgenti e azionabili da fare adesso per chi produce contenuti di marketing/video editing.

## 6. COSA EVITARE
Trend saturi o in calo — da non usare.

Fornisci un report concreto e azionabile. Per ogni trend indica: meccanismo psicologico, finestra temporale (fresco/al picco/in calo), come applicarlo.
"""


def call_claude_api(prompt: str) -> str:
    """Chiama Claude API e restituisce la risposta."""
    payload = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
        return result["content"][0]["text"]


def save_report(content: str, date_str: str) -> Path:
    """Salva il report nella cartella reports/."""
    report_path = REPORTS_DIR / f"TREND_REPORT_{date_str}.md"
    report_path.write_text(
        f"# TREND REPORT — {date_str}\n**Settori:** Marketing & Video Editing\n\n{content}",
        encoding="utf-8"
    )
    return report_path


def update_smm_memory(summary: str, date_str: str):
    """Aggiunge un riepilogo alla sezione memoria del CLAUDE.md SMM."""
    current = SMM_CLAUDE_MD.read_text(encoding="utf-8")
    entry = f"\n### Sessione — {date_str}\n{summary}\n"
    # Inserisce dopo la riga *(nessuna sessione registrata ancora...)*
    if "*(nessuna sessione registrata ancora" in current:
        current = current.replace(
            "*(nessuna sessione registrata ancora per questo agente)*",
            entry
        )
    else:
        current += entry
    SMM_CLAUDE_MD.write_text(current, encoding="utf-8")


def update_marketing_manager(top3: str, report_path: Path, date_str: str):
    """Aggiunge riepilogo al CLAUDE.md del Marketing Manager."""
    current = MARKETING_MANAGER_MD.read_text(encoding="utf-8")
    entry = (
        f"\n### SMM Report — {date_str}\n"
        f"**Top 3 insight:** {top3}\n"
        f"**Report completo:** {report_path}\n"
    )
    current += entry
    MARKETING_MANAGER_MD.write_text(current, encoding="utf-8")


def main():
    date_str = datetime.now().strftime("%Y-%m-%d_%H%M")
    print(f"=== SMM Auto Research — {date_str} ===")

    if ANTHROPIC_API_KEY == "INSERISCI_QUI_LA_TUA_API_KEY":
        print("ERRORE: inserire ANTHROPIC_API_KEY nello script.")
        return

    try:
        print("Ricerca trend in corso...")
        report_content = call_claude_api(RESEARCH_PROMPT)

        report_path = save_report(report_content, date_str)
        print(f"Report salvato: {report_path}")

        # Estrai un riepilogo corto per la memoria
        summary_prompt = f"Da questo trend report, estrai in massimo 3 righe i punti più importanti:\n\n{report_content}"
        summary = call_claude_api(summary_prompt)

        update_smm_memory(summary, date_str)
        update_marketing_manager(summary[:200], report_path, date_str)

        print("Memoria agenti aggiornata.")
        print("=== Completato ===")

    except urllib.error.HTTPError as e:
        print(f"Errore API: {e.code} — {e.read().decode()}")
    except Exception as e:
        print(f"Errore: {e}")


if __name__ == "__main__":
    main()
