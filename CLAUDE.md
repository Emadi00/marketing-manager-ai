# Videocraft Studio — Marketing Manager AI

Sistema multi-agente per la produzione automatizzata di contenuti social video e caroselli Instagram, gestito tramite bot Telegram.

## Come avviare il sistema

```powershell
# 1. Dashboard (Next.js) — porta 3001
cd "C:\Users\super\Desktop\ai-command-center"
node server.py   # oppure usa start.bat

# 2. Bot Telegram
cd "C:\Users\super\Desktop\MARKETING MANAGER"
python bot_telegram.py

# Oppure tutto insieme con PM2
pm2 start ecosystem.config.js
```

## Stack tecnico

| Layer | Tecnologia |
|---|---|
| Bot Telegram | python-telegram-bot 20.x async |
| LLM | Claude Sonnet 4.6 + Haiku 4.5 (Anthropic API con prompt caching) |
| Trascrizione | Whisper base (CPU) |
| Video rendering | Remotion v4 (React/TypeScript) |
| Immagini AI | Flux Schnell via fal.ai → Ideogram V2 Turbo (fallback) |
| TTS | ElevenLabs (eleven_multilingual_v2) |
| B-roll | Pexels API → Pixabay API (fallback) |
| Overlay testo | Pillow (Python) |
| Dashboard | Next.js 14 + Tailwind, server Python porta 3001 |
| Pubblicazione | Upload Post API |
| Analytics | Upload Post Analytics API |

## Agenti e pipeline

```
Input (audio/video/testo)
    │
    ▼
Marketing Manager Brain   — analisi brief, strategia completa
    │
    ├─► Copywriter         — script voiceover + captions social
    │       │
    │   Strategist         — retention curve + direttive visual
    │       │
    │   Cover Designer     — palette, font, prompt visual per Flux
    │       │
    │   Video Editor       — codice Remotion TSX → render MP4
    │
    └─► Carousel Designer  — struttura slide JSON → carousel_generator.py
            │
        Flux Schnell       — sfondo AI per ogni slide
            │
        Pillow overlay     — testo + brand colors sovrapposti
```

## File principali

```
bot_telegram.py          — entry point, gestisce tutti i messaggi Telegram
carousel_generator.py    — generazione PNG slide carosello
broll_finder.py          — ricerca/download B-roll da Pexels + Pixabay
tts_engine.py            — sintesi vocale ElevenLabs
smm_publisher.py         — pubblicazione social via Upload Post
analytics_fetcher.py     — fetch dati engagement post-pubblicazione
style_library.py         — gestione Style DNA per cliente
video_analyzer.py        — analisi video da Google Drive
agents/                  — CLAUDE.md di ogni agente AI
styles/                  — Style DNA per cliente (JSON + frame di riferimento)
CODICE/video-editor/     — progetto Remotion per render video
dashboard/               — Next.js dashboard Content OS
```

## Comandi Telegram principali

| Comando | Funzione |
|---|---|
| `AVVIA` / `GO` | Lancia la pipeline con il buffer corrente |
| `ANNULLA` / `RESET` | Svuota il buffer |
| `VOCI` | Lista voci ElevenLabs disponibili |
| `VOCE DEFAULT: <id>` | Imposta voce TTS per questa chat |
| `BROLL: <keyword>` | Preview B-roll da Pexels/Pixabay |
| `PIANO` | Piano editoriale della settimana |
| `REVIEW` | Lancia review mensile manuale |
| `STATO PUBBLICAZIONI` | Log ultime pubblicazioni |
| `/topic <nome>` | Registra il thread corrente come topic named |
| `/status` | Stato bot + topics registrati |

## Trigger automatici

- **Pipeline carosello**: parole chiave "carosello", "carousel", "gear & tools", "ai news" nelle direttive
- **Pipeline TTS**: "genera voce", "voce ai", "usa tts" nelle direttive
- **B-roll opt-in**: "usa broll", "b-roll", "video di sfondo" nelle direttive
- **Review mensile**: automatica il primo del mese (job schedulato)

## API Keys richieste

Configurare in `secrets.json` (mai nel codice):
- `anthropic.apiKey` — Claude API
- `telegram.token` — Bot token
- `fal.apiKey` — Flux image generation (primario caroselli)
- `ideogram.apiKey` — Fallback image generation
- `elevenlabs.apiKey` — Text to speech
- `pexels.apiKey` — B-roll video/foto
- `pixabay.apiKey` — B-roll fallback
- `upload_post.apiKey` — Pubblicazione social
- `meta.pageAccessToken` — Instagram/Facebook direct

## Topics Telegram (registrati con /topic)

Ogni thread del gruppo Telegram corrisponde a un agente:
`smm researcher` · `smm publisher` · `copywriter` · `strategist` · `cover designer` · `video editor` · `marketing manager` · `output finale` · `smm analyst` · `carousel designer`
