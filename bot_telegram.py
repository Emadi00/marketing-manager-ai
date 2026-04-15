import subprocess
import os
import json
import tempfile
import re
import shutil
import urllib.request
import urllib.error
import asyncio
import time
import whisper
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ApplicationBuilder, MessageHandler, CommandHandler, CallbackQueryHandler, ContextTypes, filters
from datetime import datetime, timezone
import smm_publisher
import analytics_fetcher
import style_library
import tts_engine
import video_analyzer
import broll_finder

# ── Carica .env se presente ──────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=False)
except ImportError:
    pass  # python-dotenv non installato — usa solo variabili d'ambiente di sistema

BASE_PATH    = os.environ.get("BASE_PATH",    r"C:\Users\super\Desktop\MARKETING MANAGER")
SECRETS_PATH = os.environ.get("SECRETS_PATH", r"C:\Users\super\Desktop\ai-command-center\data\secrets.json")

def _load_secret(env_var: str, *json_path: str) -> str:
    """Legge una chiave: env var → secrets.json → stringa vuota."""
    val = os.environ.get(env_var, "")
    if val:
        return val
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        node = s
        for k in json_path:
            node = node.get(k, {})
        return node if isinstance(node, str) else ""
    except Exception:
        return ""

TOKEN = _load_secret("TELEGRAM_TOKEN", "telegram", "token")
if not TOKEN:
    raise RuntimeError("TELEGRAM_TOKEN non trovato — impostalo in .env o secrets.json > telegram > token")

# ── Carica API key Anthropic da secrets.json o env ───────────────────────────
def _load_anthropic_key():
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        return s.get("anthropic", {}).get("apiKey", "")
    except Exception:
        return ""

ANTHROPIC_API_KEY = _load_anthropic_key()
if ANTHROPIC_API_KEY:
    print("✅ Anthropic API key trovata — modalità API attiva (caching + modelli)", flush=True)
else:
    print("⚠️  Anthropic API key non trovata — fallback su Claude CLI", flush=True)

# Propaga la chiave e BASE_PATH alla Style Library e al Video Analyzer
style_library.API_KEY    = ANTHROPIC_API_KEY
style_library.BASE_PATH  = BASE_PATH
video_analyzer.API_KEY   = ANTHROPIC_API_KEY
video_analyzer.BASE_PATH = BASE_PATH

# Modelli
MODEL_SONNET = "claude-sonnet-4-6"
MODEL_HAIKU  = "claude-haiku-4-5-20251001"

# Pricing Anthropic (USD per 1M token)
PRICING = {
    MODEL_SONNET: {"input": 3.0,  "output": 15.0,  "cache_read": 0.30, "cache_write": 3.75},
    MODEL_HAIKU:  {"input": 0.25, "output": 1.25,  "cache_read": 0.03, "cache_write": 0.30},
}

def calcola_costo(model: str, usage: dict) -> float:
    """Calcola costo USD da usage dict Anthropic API."""
    p      = PRICING.get(model, PRICING[MODEL_SONNET])
    inp    = usage.get("input_tokens", 0)
    out    = usage.get("output_tokens", 0)
    c_read = usage.get("cache_read_input_tokens", 0)
    c_wrt  = usage.get("cache_creation_input_tokens", 0)
    # input_tokens già esclude cache_read e cache_creation nell'API v2
    return (inp   / 1_000_000) * p["input"]  \
         + (out   / 1_000_000) * p["output"] \
         + (c_read/ 1_000_000) * p["cache_read"] \
         + (c_wrt / 1_000_000) * p["cache_write"]

def dashboard_agent_cost(card_id: str, agent_id: str, agent_name: str, model: str, usage: dict):
    """Invia dati di costo di un agente alla dashboard in tempo reale."""
    if not card_id:
        return
    cost = calcola_costo(model, usage)
    # Accumula costo totale per card — usato da Notion push alla fine della pipeline
    _costi_pipeline[card_id] = _costi_pipeline.get(card_id, 0.0) + cost
    _dashboard_post("/api/pipeline-cost", {
        "cardId":       card_id,
        "agent":        agent_id,
        "agentName":    agent_name,
        "model":        model,
        "inputTokens":  usage.get("input_tokens", 0),
        "outputTokens": usage.get("output_tokens", 0),
        "cacheHit":     usage.get("cache_read_input_tokens", 0),
        "cacheWrite":   usage.get("cache_creation_input_tokens", 0),
        "costUsd":      round(cost, 6),
    })
    print(f"[Cost] {agent_name} ${cost:.4f} "
          f"(in:{usage.get('input_tokens',0)} out:{usage.get('output_tokens',0)} "
          f"cache_hit:{usage.get('cache_read_input_tokens',0)})", flush=True)

# Budget token per passaggio di consegne
MAX_BRIEF    = 8000   # era 400 — la trascrizione audio deve arrivare intera
MAX_SCRIPT   = 8000   # era 1200 — lo script JSON non deve essere troncato
MAX_STRATEGY = 4000   # era 800
MAX_VISUAL   = 2000   # era 600
MAX_OUTPUT   = 300    # solo per log dashboard — non tocca il pipeline

MIN_TSX_SIZE   = 2000   # bytes minimi per un file TSX considerato "completo"
CORE_TSX_FILES = ["Root.tsx", "MainVideo.tsx", "SceneHook.tsx"]

def verifica_qualita_tsx(src_dir: str) -> list[tuple[str, int]]:
    """
    Controlla che i file TSX core abbiano dimensioni minime.
    Ritorna lista di (nome_file, dimensione) per i file sotto soglia.
    """
    problemi = []
    for nome in CORE_TSX_FILES:
        path = os.path.join(src_dir, nome)
        if not os.path.exists(path):
            problemi.append((nome, 0))
        elif os.path.getsize(path) < MIN_TSX_SIZE:
            problemi.append((nome, os.path.getsize(path)))
    return problemi

# ── Dashboard integration ─────────────────────────────────────────────────────
DASHBOARD_URL  = os.environ.get("DASHBOARD_URL",  "http://localhost:3001")
DASHBOARD_DATA = os.environ.get("DASHBOARD_DATA", r"C:\Users\super\Desktop\ai-command-center\data")
OUTPUT_BASE    = os.environ.get("OUTPUT_BASE",    r"C:\Users\super\Desktop\OUTPUT")

# ── Notion integration ────────────────────────────────────────────────────────
NOTION_TOKEN         = _load_secret("NOTION_TOKEN",         "notion", "token")
NOTION_VERSION       = "2022-06-28"
NOTION_DB_PRODUZIONE = _load_secret("NOTION_DB_PRODUZIONE", "notion", "dbProduzione") or "0f72df6fb7db432b81e8e8e865c8736b"
NOTION_DB_COSTI      = _load_secret("NOTION_DB_COSTI",      "notion", "dbCosti")      or "e1bcc557be4a443bb60ff66b01f91c7a"
_MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
            "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"]

def notion_push_produzione(card_id: str, cliente: str, costo_ai_usd: float = 0.0, note: str = "") -> str | None:
    """
    Crea una riga in '💰 Contabilità Mensile' quando un video viene approvato.
    Ritorna l'URL della pagina Notion creata, o None se fallisce.
    IMPORTANTE: per funzionare, l'integrazione deve essere aggiunta al database
    in Notion → Share → Add connections → seleziona la tua integrazione.
    """
    now   = datetime.now()
    mese  = _MESI_IT[now.month - 1]
    anno  = str(now.year)

    payload = {
        "parent": {"database_id": NOTION_DB_PRODUZIONE},
        "properties": {
            "Cliente":            {"title":     [{"text": {"content": cliente[:100]}}]},
            "Mese":               {"select":    {"name": mese}},
            "Anno":               {"select":    {"name": anno}},
            "Costo AI (USD)":     {"number":    round(costo_ai_usd, 4)},
            "Stato Pagamento":    {"select":    {"name": "Da fatturare"}},
            "ID Pipeline":        {"rich_text": [{"text": {"content": card_id}}]},
            "Data Completamento": {"date":      {"start": now.strftime("%Y-%m-%d")}},
            "Note":               {"rich_text": [{"text": {"content": note[:2000]}}]},
        }
    }
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        "https://api.notion.com/v1/pages", data=data,
        headers={
            "Authorization":  f"Bearer {NOTION_TOKEN}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
        }, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            url = result.get("url", "")
            print(f"[Notion] ✅ Riga produzione creata: {url}", flush=True)
            return url
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[Notion] ❌ HTTP {e.code}: {body[:400]}", flush=True)
        return None
    except Exception as e:
        print(f"[Notion] ❌ {e}", flush=True)
        return None

# Stato approvazione in attesa di OK/modifiche dal topic Video Editor
# { chat_id: { salvati, agenti_eseguiti, testo, output_thread_id,
#              mm_thread_id, ve_thread_id, dashboard_card_id,
#              script_json, strategy_json, visual_json, mm_brief, brief_compresso } }
_pending_approval: dict = {}
_pending_modifica: dict = {}            # { chat_id: state } — in attesa di testo modifiche dall'utente
_pending_analyst:  dict = {}            # { chat_id: proposed_changes } — review mensile in attesa approvazione
_pending_carosello: dict = {}           # { chat_id: carosello_state } — carosello in attesa approvazione
_main_chat_id: int | None = None       # registrato al primo messaggio ricevuto — usato da job mensile
_ultimo_audio_path: str | None = None   # path del file audio corrente in video-editor/public/
_costi_pipeline: dict[str, float] = {}  # { card_id: costo_totale_usd } — accumulato dagli agenti

def _keyboard_post_pipeline() -> InlineKeyboardMarkup:
    """Keyboard con le azioni post-pipeline."""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Termina",        callback_data="pipeline_termina"),
         InlineKeyboardButton("📅 Schedula",       callback_data="pipeline_schedula"),
         InlineKeyboardButton("🚀 Pubblica ORA",   callback_data="pipeline_pubblica")],
        [InlineKeyboardButton("🎨 Crea Carosello", callback_data="pipeline_carosello"),
         InlineKeyboardButton("✏️ Modifica",       callback_data="pipeline_modifica")],
    ])

# ── Sistema buffer messaggi ───────────────────────────────────────────────────
# Chiave: (chat_id, thread_id) — supporta topic multipli
# Valore: dict con audios, texts, images, docs, topic_name, timeout_task
TRIGGER_WORDS       = {"AVVIA", "GO", "START", "VAI"}
CANCEL_WORDS        = {"ANNULLA", "CANCELLA", "CLEAR", "RESET", "SVUOTA"}
TTS_TRIGGER_PHRASES = {"genera voce", "voce ai", "usa tts", "genera audio", "voce elevenlabs"}
BUFFER_IDLE_TIMEOUT = 5 * 60   # secondi — auto-svuota se nessun messaggio
_buffer: dict[tuple[int, int | None], dict] = {}

def _buffer_key(update: Update) -> tuple[int, int | None]:
    msg = update.message
    thread_id = msg.message_thread_id if msg.is_topic_message else None
    return (msg.chat_id, thread_id)

def _buffer_new(topic_name: str) -> dict:
    return {
        "topic_name":   topic_name,
        "audios":       [],   # list of (file_id, file_type)  "voice"|"audio"
        "videos":       [],   # list of (file_id,)  — video MP4 da cui estrarre audio
        "texts":        [],   # list of str
        "images":       [],   # list of file_id (ultimo photo size)
        "docs":         [],   # list of (file_id, filename)
        "first_ack":    False,
        "timeout_task": None,
    }

async def _buffer_timeout_handler(key: tuple, bot) -> None:
    """Svuota automaticamente il buffer dopo BUFFER_IDLE_TIMEOUT senza nuovi messaggi."""
    await asyncio.sleep(BUFFER_IDLE_TIMEOUT)
    entry = _buffer.pop(key, None)
    if entry:
        chat_id, thread_id = key
        kwargs = {"chat_id": chat_id, "text": "⏰ Timeout — buffer svuotato. Rimanda i file quando sei pronto."}
        if thread_id:
            kwargs["message_thread_id"] = thread_id
        try:
            await bot.send_message(**kwargs)
        except Exception:
            pass

def _buffer_reset_timer(key: tuple, bot) -> None:
    """Cancella il timer precedente e ne avvia uno nuovo."""
    entry = _buffer.get(key)
    if not entry:
        return
    old_task = entry.get("timeout_task")
    if old_task and not old_task.done():
        old_task.cancel()
    entry["timeout_task"] = asyncio.create_task(_buffer_timeout_handler(key, bot))

async def _buffer_add_text(update: Update, bot) -> bool:
    """Aggiunge testo al buffer. Ritorna True se il testo è un trigger AVVIA."""
    testo = (update.message.text or "").strip()
    if testo.upper() in TRIGGER_WORDS:
        return True   # segnala: lancia pipeline
    key   = _buffer_key(update)
    topics     = carica_topics()
    topic_name = topics.get(str(update.message.message_thread_id), "") if update.message.is_topic_message else ""
    if key not in _buffer:
        _buffer[key] = _buffer_new(topic_name)
    _buffer[key]["texts"].append(testo)
    _buffer_reset_timer(key, bot)
    if not _buffer[key]["first_ack"]:
        _buffer[key]["first_ack"] = True
        await update.message.reply_text(
            "📥 Ricevuto! Manda altri file o istruzioni se ne hai, oppure scrivi AVVIA per far partire la pipeline."
        )
    return False

async def _buffer_add_audio(update: Update, bot) -> None:
    """Aggiunge audio al buffer."""
    key    = _buffer_key(update)
    topics = carica_topics()
    topic_name = topics.get(str(update.message.message_thread_id), "") if update.message.is_topic_message else ""
    if key not in _buffer:
        _buffer[key] = _buffer_new(topic_name)
    entry = _buffer[key]
    # Salva file_id e tipo
    if update.message.voice:
        entry["audios"].append((update.message.voice.file_id, "voice"))
    elif update.message.audio:
        entry["audios"].append((update.message.audio.file_id, "audio"))
    # Caption dell'audio = direttiva cliente
    caption = (update.message.caption or "").strip()
    if caption:
        entry["texts"].append(caption)
    _buffer_reset_timer(key, bot)
    if not entry["first_ack"]:
        entry["first_ack"] = True
        n_audio = len(entry["audios"])
        try:
            await update.message.reply_text(
                f"📥 Ricevuto! ({n_audio} audio in buffer) Manda altri file o istruzioni se ne hai, oppure scrivi AVVIA per far partire la pipeline."
            )
        except Exception:
            await bot.send_message(
                chat_id=update.effective_chat.id,
                message_thread_id=update.message.message_thread_id if update.message.is_topic_message else None,
                text=f"📥 Ricevuto! ({n_audio} audio in buffer) Manda altri file o istruzioni se ne hai, oppure scrivi AVVIA per far partire la pipeline."
            )

async def _buffer_add_photo(update: Update, bot) -> None:
    """Aggiunge immagine al buffer."""
    key    = _buffer_key(update)
    topics = carica_topics()
    topic_name = topics.get(str(update.message.message_thread_id), "") if update.message.is_topic_message else ""
    if key not in _buffer:
        _buffer[key] = _buffer_new(topic_name)
    entry = _buffer[key]
    # Prende la versione più grande della foto
    if update.message.photo:
        entry["images"].append(update.message.photo[-1].file_id)
    caption = (update.message.caption or "").strip()
    if caption:
        entry["texts"].append(caption)
    _buffer_reset_timer(key, bot)
    if not entry["first_ack"]:
        entry["first_ack"] = True
        await update.message.reply_text(
            "📥 Ricevuto! Manda altri file o istruzioni se ne hai, oppure scrivi AVVIA per far partire la pipeline."
        )

async def _buffer_add_document(update: Update, bot) -> None:
    """Aggiunge documento al buffer."""
    key    = _buffer_key(update)
    topics = carica_topics()
    topic_name = topics.get(str(update.message.message_thread_id), "") if update.message.is_topic_message else ""
    if key not in _buffer:
        _buffer[key] = _buffer_new(topic_name)
    entry = _buffer[key]
    if update.message.document:
        doc = update.message.document
        entry["docs"].append((doc.file_id, doc.file_name or "file"))
    caption = (update.message.caption or "").strip()
    if caption:
        entry["texts"].append(caption)
    _buffer_reset_timer(key, bot)
    if not entry["first_ack"]:
        entry["first_ack"] = True
        await update.message.reply_text(
            "📥 Ricevuto! Manda altri file o istruzioni se ne hai, oppure scrivi AVVIA per far partire la pipeline."
        )

async def _buffer_add_video(update: Update, bot) -> None:
    """Aggiunge video MP4 al buffer (audio verrà estratto con ffmpeg al momento di AVVIA)."""
    key    = _buffer_key(update)
    topics = carica_topics()
    topic_name = topics.get(str(update.message.message_thread_id), "") if update.message.is_topic_message else ""
    if key not in _buffer:
        _buffer[key] = _buffer_new(topic_name)
    entry = _buffer[key]
    if update.message.video:
        entry["videos"].append((update.message.video.file_id,))
    caption = (update.message.caption or "").strip()
    if caption:
        entry["texts"].append(caption)
    _buffer_reset_timer(key, bot)
    if not entry["first_ack"]:
        entry["first_ack"] = True
        n_vid = len(entry["videos"])
        await update.message.reply_text(
            f"📥 Ricevuto! ({n_vid} video in buffer — l'audio verrà estratto all'AVVIA) "
            "Manda altri file o istruzioni se ne hai, oppure scrivi AVVIA per far partire la pipeline."
        )

async def _lancia_pipeline_da_buffer(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Raccoglie tutto il buffer, trascrive gli audio, unisce i testi come
    direttive cliente (senza troncamento) e lancia processa_input.
    """
    global _ultimo_audio_path
    key = _buffer_key(update)
    entry = _buffer.pop(key, None)

    if not entry:
        await update.message.reply_text("⚠️ Nessun contenuto nel buffer. Invia prima un audio o del testo.")
        return

    # Cancella timer pendente
    old_task = entry.get("timeout_task")
    if old_task and not old_task.done():
        old_task.cancel()

    topic_name = entry["topic_name"]
    testi      = entry["texts"]      # list[str]
    audios     = entry["audios"]     # list[(file_id, type)]
    videos     = entry.get("videos", [])  # list[(file_id,)]
    images     = entry["images"]     # list[file_id]
    docs       = entry["docs"]       # list[(file_id, filename)]

    # PROBLEMA 1 FIX: il topic Marketing Manager avvia la pipeline video
    # SOLO se nel buffer ci sono audio o video. Altrimenti → task ad-hoc.
    has_media = bool(audios or videos)
    if "marketing manager" in topic_name.lower():
        if has_media:
            topic_name = "video editor"   # c'è audio/video → pipeline video
        else:
            direttive_testo = "\n".join(testi) if testi else ""
            if not direttive_testo:
                await update.message.reply_text("⚠️ Nessun contenuto nel buffer da elaborare.")
                return

            # Rileva se è un carosello
            testo_lower = direttive_testo.lower()
            _carosello_kw = ["carosello", "carousel", "caroselli", "slide", "carousels"]
            _carosello_rubriche = ["workflow pro", "gear & tools", "gear and tools",
                                   "ai news decoded", "ai news"]
            is_carousel = (
                any(kw in testo_lower for kw in _carosello_kw) or
                any(r in testo_lower for r in _carosello_rubriche)
            )

            if is_carousel:
                topic_name = "carousel designer"
                await update.message.reply_text(
                    "🎨 *Formato carosello rilevato* — avvio pipeline carosello.",
                    parse_mode="Markdown"
                )
                await processa_input(update, ctx, direttive_testo, topic_name,
                                     direttive=direttive_testo)
                return
            else:
                # Solo testo senza indicazioni → task ad-hoc per il MM
                await update.message.reply_text(
                    f"📋 Nessun audio/video nel buffer — elaboro come task ad-hoc per il Marketing Manager.\n"
                    f"_(per avviare la pipeline video, carica un audio/video e poi scrivi AVVIA)\n"
                    f"_(per avviare la pipeline carosello, scrivi l'argomento + \"carosello\" e poi AVVIA)_",
                    parse_mode="Markdown"
                )
                await processa_input(update, ctx, direttive_testo, topic_name)
                return

    await update.message.reply_text(
        f"🚀 *AVVIA* — elaboro il pacchetto:\n{_buffer_summary(entry)}",
        parse_mode="Markdown"
    )

    trascrizioni      = []
    audio_dur_secs    = []   # durate in secondi di ogni audio/video — per BUG FIX 1
    timeline_segments = []   # segmenti Whisper con timestamp word-level — per sync animazioni

    # ── Trascrivi audio diretti ────────────────────────────────────────────────
    for idx, (file_id, ftype) in enumerate(audios, 1):
        label = f"audio {idx}/{len(audios)+len(videos)}"
        try:
            if len(audios) + len(videos) > 1:
                await update.message.reply_text(f"🎙️ Trascrizione {label}...")
            file_obj = await ctx.bot.get_file(file_id)
            with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
                tmp_path = tmp.name
            chunk_dir = tmp_path + "_chunks"
            await file_obj.download_to_drive(tmp_path)

            # Cattura durata ESATTA (BUG FIX 1)
            dur = _audio_duration_sec(tmp_path)
            if dur:
                audio_dur_secs.append(dur)
                print(f"[Buffer] {label}: {dur:.2f}s", flush=True)

            # Salva come voiceover per Remotion
            public_dir = os.path.join(VIDEO_EDITOR_PATH, "public")
            os.makedirs(public_dir, exist_ok=True)
            voiceover_dest = os.path.join(public_dir, f"voiceover{'_'+str(idx) if len(audios)>1 else ''}.mp3")
            try:
                conv = subprocess.run(
                    ["ffmpeg", "-y", "-i", tmp_path, "-acodec", "libmp3lame", "-ab", "128k", voiceover_dest],
                    capture_output=True, timeout=60
                )
                if conv.returncode == 0:
                    _ultimo_audio_path = voiceover_dest
            except Exception:
                pass

            chunks = _split_audio_chunks(tmp_path, chunk_dir) or [tmp_path]
            parti_text = []
            chunk_time_offset = 0.0
            for chunk_path in chunks:
                chunk_text, chunk_segs = _transcribe_with_retry(chunk_path)
                parti_text.append(chunk_text)
                for seg in chunk_segs:
                    seg_fixed = {k: v for k, v in seg.items() if k != "words"}
                    seg_fixed["start"] = round(seg["start"] + chunk_time_offset, 3)
                    seg_fixed["end"]   = round(seg["end"]   + chunk_time_offset, 3)
                    if "words" in seg:
                        seg_fixed["words"] = [
                            {**w, "start": round(w["start"] + chunk_time_offset, 3),
                                  "end":   round(w["end"]   + chunk_time_offset, 3)}
                            for w in seg["words"]
                        ]
                    timeline_segments.append(seg_fixed)
                chunk_dur = _audio_duration_sec(chunk_path)
                chunk_time_offset += chunk_dur or 0.0
            trascrizioni.append(" ".join(parti_text).strip())

            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            if os.path.exists(chunk_dir):
                shutil.rmtree(chunk_dir, ignore_errors=True)
        except Exception as e:
            await update.message.reply_text(f"⚠️ Errore trascrizione {label}: {e}")

    # ── Elabora video: estrai audio con ffmpeg, poi trascrivi (BUG FIX 2) ─────
    for vidx, (file_id,) in enumerate(videos, 1):
        label = f"video {vidx}/{len(videos)} (estrazione audio)"
        try:
            await update.message.reply_text(f"🎬 {label}...")
            file_obj = await ctx.bot.get_file(file_id)
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_vid:
                vid_path = tmp_vid.name
            await file_obj.download_to_drive(vid_path)

            # Estrai audio dal video
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_aud:
                aud_path = tmp_aud.name
            extract = subprocess.run(
                ["ffmpeg", "-y", "-i", vid_path, "-vn", "-acodec", "libmp3lame",
                 "-ab", "128k", aud_path],
                capture_output=True, timeout=120
            )
            if extract.returncode != 0:
                await update.message.reply_text(f"⚠️ {label}: nessuna traccia audio nel video, ignoro.")
                os.unlink(vid_path)
                continue

            # Cattura durata ESATTA
            dur = _audio_duration_sec(aud_path)
            if dur:
                audio_dur_secs.append(dur)
                print(f"[Buffer] {label}: {dur:.2f}s audio estratto", flush=True)

            # Salva come voiceover
            public_dir = os.path.join(VIDEO_EDITOR_PATH, "public")
            os.makedirs(public_dir, exist_ok=True)
            voiceover_dest = os.path.join(public_dir, "voiceover.mp3")
            shutil.copy2(aud_path, voiceover_dest)
            _ultimo_audio_path = voiceover_dest

            chunk_dir = aud_path + "_chunks"
            chunks = _split_audio_chunks(aud_path, chunk_dir) or [aud_path]
            parti_text = []
            chunk_time_offset = 0.0
            for chunk_path in chunks:
                chunk_text, chunk_segs = _transcribe_with_retry(chunk_path)
                parti_text.append(chunk_text)
                for seg in chunk_segs:
                    seg_fixed = {k: v for k, v in seg.items() if k != "words"}
                    seg_fixed["start"] = round(seg["start"] + chunk_time_offset, 3)
                    seg_fixed["end"]   = round(seg["end"]   + chunk_time_offset, 3)
                    if "words" in seg:
                        seg_fixed["words"] = [
                            {**w, "start": round(w["start"] + chunk_time_offset, 3),
                                  "end":   round(w["end"]   + chunk_time_offset, 3)}
                            for w in seg["words"]
                        ]
                    timeline_segments.append(seg_fixed)
                chunk_dur = _audio_duration_sec(chunk_path)
                chunk_time_offset += chunk_dur or 0.0
            trascrizioni.append(" ".join(parti_text).strip())

            os.unlink(vid_path)
            if os.path.exists(aud_path):
                os.unlink(aud_path)
            if os.path.exists(chunk_dir):
                shutil.rmtree(chunk_dir, ignore_errors=True)
        except Exception as e:
            await update.message.reply_text(f"⚠️ Errore elaborazione {label}: {e}")

    # ── Durata audio totale (BUG FIX 1) ──────────────────────────────────────
    audio_dur_sec = sum(audio_dur_secs) if audio_dur_secs else None

    # ── Salva timeline Whisper in public/ per il Video Editor ─────────────────
    if timeline_segments:
        try:
            _tl_public = os.path.join(VIDEO_EDITOR_PATH, "public")
            os.makedirs(_tl_public, exist_ok=True)
            _tl_path = os.path.join(_tl_public, "timeline.json")
            with open(_tl_path, "w", encoding="utf-8") as _f:
                json.dump(timeline_segments, _f, ensure_ascii=False, indent=2)
            print(f"[Whisper] Timeline salvata: {len(timeline_segments)} segmenti → {_tl_path}", flush=True)
        except Exception as _e:
            print(f"[Whisper] ⚠️ Salvataggio timeline fallito: {_e}", flush=True)
    if audio_dur_sec:
        print(f"[Buffer] Durata audio totale: {audio_dur_sec:.2f}s → "
              f"{round(audio_dur_sec * 30)} frame @ 30fps", flush=True)

    # ── Costruisce il testo da passare alla pipeline ──────────────────────────
    direttive_cliente = "\n".join(testi) if testi else ""
    print(f"[BUFFER] Direttive raccolte: {len(direttive_cliente)} caratteri", flush=True)

    testo_audio_completo = " ".join(trascrizioni).strip()
    testo_compresso      = comprimi_trascrizione(testo_audio_completo, MAX_BRIEF) if testo_audio_completo else ""

    testo_principale = testo_compresso or direttive_cliente

    if not testo_principale:
        await update.message.reply_text("⚠️ Nessun contenuto da elaborare nel buffer.")
        return

    # Riepilogo
    if testo_audio_completo:
        dur_info = f" · ⏱️ {audio_dur_sec:.1f}s" if audio_dur_sec else ""
        await update.message.reply_text(
            f"📝 Trascrizione ({len(testo_audio_completo)} chars → {len(testo_compresso)}){dur_info}:\n"
            f"_{testo_audio_completo[:300]}{'...' if len(testo_audio_completo)>300 else ''}_",
            parse_mode="Markdown"
        )
    if direttive_cliente:
        await update.message.reply_text(
            f"📋 *Direttive cliente* ({len(direttive_cliente)} chars — intere):\n"
            f"_{direttive_cliente[:500]}{'...' if len(direttive_cliente)>500 else ''}_",
            parse_mode="Markdown"
        )
        # ── DEBUG LOG: direttive integrali su topic Marketing Manager ────────
        try:
            mm_tid_debug = None
            for tid, nome in carica_topics().items():
                if "marketing manager" in nome.lower():
                    mm_tid_debug = int(tid)
                    break
            debug_header = f"📋 DEBUG DIRETTIVE COMPLETE ({len(direttive_cliente)} chars):\n"
            full_debug   = debug_header + direttive_cliente
            # Invia in chunk da 4000 chars per rispettare il limite Telegram
            for i, chunk_start in enumerate(range(0, len(full_debug), 4000)):
                chunk = full_debug[chunk_start:chunk_start + 4000]
                try:
                    if mm_tid_debug and update.message.is_topic_message:
                        await ctx.bot.send_message(
                            chat_id=update.message.chat_id,
                            message_thread_id=mm_tid_debug,
                            text=chunk
                        )
                    else:
                        await update.message.reply_text(chunk)
                except Exception as _e:
                    print(f"[DEBUG] chunk {i} errore: {_e}", flush=True)
        except Exception as _e:
            print(f"[DEBUG] Errore log direttive: {_e}", flush=True)

    # ── B-roll opt-in: se richiesto nelle direttive e abbiamo timeline ────────
    if broll_finder.is_broll_request(direttive_cliente) and timeline_segments:
        await update.message.reply_text(
            "🎬 *B-roll richiesto* — ricerca keyword sui segmenti audio...",
            parse_mode="Markdown",
        )
        try:
            _broll_dir = os.path.join(VIDEO_EDITOR_PATH, "public", "broll")
            _suggerimenti = await asyncio.get_event_loop().run_in_executor(
                None, lambda: broll_finder.suggerisci_broll(timeline_segments)
            )
            await update.message.reply_text(
                f"🔍 Suggeriti {len(_suggerimenti)} clip B-roll — download in corso...",
            )
            _clips = await asyncio.get_event_loop().run_in_executor(
                None, lambda: broll_finder.scarica_broll_per_video(_suggerimenti, _broll_dir)
            )
            if _clips:
                _broll_brief = broll_finder.build_broll_brief(_clips)
                direttive_cliente = direttive_cliente + _broll_brief
                await update.message.reply_text(
                    f"✅ {len(_clips)} clip B-roll pronti — iniettati nel brief del Video Editor.",
                )
            else:
                await update.message.reply_text("⚠️ Nessun clip B-roll scaricato — continuo senza.")
        except Exception as _be:
            print(f"[Broll] Pipeline B-roll fallita: {_be}", flush=True)
            await update.message.reply_text(f"⚠️ B-roll non disponibile ({_be}) — continuo senza.")

    await processa_input(update, ctx, testo_principale, topic_name,
                         direttive=direttive_cliente, audio_dur_sec=audio_dur_sec)

def _dashboard_post(endpoint, payload):
    try:
        data = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            f"{DASHBOARD_URL}{endpoint}", data=data,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception as e:
        print(f"[Dashboard] {endpoint} non raggiunto: {e}", flush=True)

def dashboard_conclude_card(card_id: str, card_status: str = "Approvato"):
    """Chiude una card pipeline impostando lo status globale (es. 'Approvato')."""
    _dashboard_post("/api/pipeline", {"id": card_id, "status": card_status})
    print(f"[Dashboard] {card_id} → status={card_status}", flush=True)

def dashboard_step(card_id, step_id, status, output=None):
    _dashboard_post("/api/pipeline-step", {
        "cardId": card_id, "stepId": step_id,
        "status": status, "output": (output or "")[:MAX_OUTPUT]
    })
    print(f"[Dashboard] {card_id}/{step_id} → {status}", flush=True)

def dashboard_is_paused(card_id):
    try:
        with open(os.path.join(DASHBOARD_DATA, "pipeline.json"), encoding="utf-8") as f:
            data = json.load(f)
        for card in data.get("cards", []):
            if card["id"] == card_id:
                return bool(card.get("paused", False))
    except Exception:
        pass
    return False

def dashboard_new_card(title, hook, brief, pipeline_agenti, card_type="Reel + Carosello"):
    pipeline_path = os.path.join(DASHBOARD_DATA, "pipeline.json")
    try:
        with open(pipeline_path, encoding="utf-8") as f:
            data = json.load(f)
        month   = datetime.now().strftime("%Y-%m")
        card_id = "tg-" + str(int(datetime.now().timestamp()))

        STEP_DEFS = {
            "copywriter":    {"id": "brief-creativo", "name": "Brief Creativo",  "agent": "Copywriter",    "agentId": "copywriter",    "description": brief[:200]},
            "strategist":    {"id": "strategia",      "name": "Strategia",       "agent": "Strategist",    "agentId": "strategist",    "description": "Retention curve e direttive visual."},
            "carousel-designer":{"id": "slide-json",    "name": "Slide JSON",      "agent": "Carousel Designer","agentId": "carousel-designer","description": "Struttura slide carosello."},
            "cover-designer":{"id": "carosello",      "name": "Carosello",       "agent": "Cover Designer","agentId": "cover-designer","description": "Sistema visivo.",
                              "outputPath": f"{OUTPUT_BASE}\\VideoCraft Studio\\Caroselli\\{month}\\{card_id}\\"},
            "video-editor":  {"id": "video-remotion", "name": "Video Remotion",  "agent": "Video Editor",  "agentId": "video-editor",  "description": "Codice Remotion + render MP4.",
                              "outputPath": f"{OUTPUT_BASE}\\VideoCraft Studio\\Video\\{month}\\{card_id}.mp4"},
        }
        FIXED_END = [
            {"id": "review",        "name": "Approvazione", "agent": "Tu",           "agentId": "human",         "description": "Revisione dalla dashboard."},
            {"id": "pubblicazione", "name": "Pubblicazione","agent": "SMM Publisher","agentId": "smm-publisher", "description": "Pubblica su Instagram + Facebook."},
        ]

        steps = []
        for i, ag in enumerate(pipeline_agenti):
            defn = dict(STEP_DEFS.get(ag, {}))
            if not defn:
                continue
            defn.update({"status": "active" if i == 0 else "pending", "output": None, "completedAt": None})
            steps.append(defn)
        for s in FIXED_END:
            steps.append({**s, "status": "pending", "output": None, "completedAt": None})

        card = {
            "id": card_id, "title": title[:80], "client": "VideoCraft Studio",
            "type": card_type, "priority": "media", "hook": hook[:120],
            "angle": "Da definire", "status": "In Lavorazione",
            "createdAt": datetime.now().strftime("%Y-%m-%d"), "currentStep": 0,
            "steps": steps, "log": []
        }
        data["cards"].insert(0, card)
        data["lastUpdate"] = datetime.now().isoformat()
        with open(pipeline_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[Dashboard] Card: {card_id} — {[s['id'] for s in steps]}", flush=True)
        return card_id
    except Exception as e:
        print(f"[Dashboard] Errore card: {e}", flush=True)
        return None

def dashboard_save_video(src_path, card_id):
    month   = datetime.now().strftime("%Y-%m")
    out_dir = os.path.join(OUTPUT_BASE, "VideoCraft Studio", "Video", month)
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{card_id}.mp4")
    try:
        shutil.copy2(src_path, dest)
        print(f"[Dashboard] Video → {dest}", flush=True)
        return dest
    except Exception as e:
        print(f"[Dashboard] Errore copia: {e}", flush=True)
        return src_path

# ── Costanti pipeline ─────────────────────────────────────────────────────────
VIDEO_EDITOR_PATH = os.path.join(BASE_PATH, "CODICE", "video-editor")
VIDEO_OUTPUT_PATH = os.path.join(VIDEO_EDITOR_PATH, "out", "video.mp4")
TOPIC_FILE = os.path.join(BASE_PATH, "topics.json")
TIMEOUT    = 600
MAX_CATENA = 8

print("⏳ Caricamento modello Whisper (base — ottimizzato per CPU)...", flush=True)
whisper_model = whisper.load_model("base")
print("✅ Whisper pronto!", flush=True)

TOPIC_AGENTI = {
    "smm researcher":   "smm-researcher",
    "smm publisher":    "smm-publisher",
    "copywriter":       "copywriter",
    "strategist":       "strategist",
    "cover designer":   "cover-designer",
    "video editor":     "video-editor",
    "marketing manager":"marketing-manager",
    "carousel designer":"carousel-designer",
}
AGENTE_NOME = {
    "smm-researcher":   "SMM Researcher",
    "smm-publisher":    "SMM Publisher",
    "copywriter":       "Copywriter",
    "strategist":       "Strategist",
    "cover-designer":   "Cover Designer",
    "video-editor":     "Video Editor",
    "marketing-manager":"Marketing Manager",
    "carousel-designer":"Carousel Designer",
}
PIPELINE_SEMPLICE  = ["copywriter", "strategist", "video-editor"]
PIPELINE_COMPLETA  = ["copywriter", "strategist", "cover-designer", "video-editor"]
PIPELINE_CAROSELLO = ["carousel-designer", "copywriter"]

# ── Helpers topic ─────────────────────────────────────────────────────────────
def carica_topics():
    if os.path.exists(TOPIC_FILE):
        with open(TOPIC_FILE, "r") as f:
            return json.load(f)
    return {}

def salva_topics(topics):
    with open(TOPIC_FILE, "w") as f:
        json.dump(topics, f)

def get_thread_id_by_name(nome):
    topics = carica_topics()
    for tid, tname in topics.items():
        if nome.lower() in tname.lower():
            return int(tid)
    return None

# ══════════════════════════════════════════════════════════════════════════════
#  1. ANTHROPIC API DIRETTA con PROMPT CACHING
# ══════════════════════════════════════════════════════════════════════════════

# System prompts FISSI (parte cacheable) — definiti una sola volta a livello modulo
_SYS_COPYWRITER = """Sei il Copywriter della pipeline video. Il tuo ruolo è ESECUTIVO: trasformi in script le decisioni già prese dal Marketing Manager.

NON inventare angoli di marketing, hook o struttura narrativa — tutto questo è già stato deciso dal Marketing Manager e ti viene passato nelle istruzioni. Il tuo compito è tradurre quelle decisioni in voiceover preciso con timing al frame, E generare le caption ottimizzate per ogni piattaforma social.

REGOLE DI OUTPUT:
- Rispondi ESCLUSIVAMENTE con JSON valido. Zero testo fuori dal JSON, zero markdown, zero spiegazioni.
- Inizia direttamente con { — mai testo introduttivo
- Il JSON deve essere parseable da json.loads() senza modifiche

SCHEMA OBBLIGATORIO:
{
  "hook": "testo hook ESATTO come indicato dal Marketing Manager",
  "sections": [
    {"t": "00:00-00:03", "v": "testo voiceover esatto", "e": "shock|curiosity|desire|trust|urgency", "r": "fast|medium|slow"}
  ],
  "cta": "CTA finale — usa quella indicata dal Marketing Manager",
  "duration_sec": 45,
  "captions": {
    "instagram": "Caption 150-220 car con storytelling che amplifica il hook, 5-8 hashtag niche rilevanti, CTA finale diretta. Emoji con moderazione (max 3). Prima riga = gancio forte che appare in preview.",
    "tiktok": "Caption diretta max 80 car, tono urgente/intrigante. 3-5 hashtag trending del momento. Prima parola = parola chiave. Nessuna emoji ridondante.",
    "youtube_title": "Titolo SEO max 70 car. Keyword principale entro i primi 30 car. Formato che funziona: [Beneficio/Curiosità] + [Specificità]. Niente clickbait vuoto.",
    "youtube_description": "Descrizione 200-350 car con keyword naturali nel testo. Prima frase = riassunto del video con keyword. Ultima riga: 5 tag separati da virgola (niente #). Includi CTA per iscrizione.",
    "linkedin": "Tono professionale autorevole. Inizia con insight concreto o dato sorprendente. Max 200 car. Max 2 hashtag rilevanti al settore. Nessun hashtag generico (#motivation, #success). Termina con take-away professionale.",
    "facebook": "Tono conversazionale caldo. Racconta una micro-storia di 2 frasi che crea empatia. Max 180 car. Termina con domanda aperta che invita al commento. 0-2 emoji."
  }
}

REGOLE DI ESECUZIONE SCRIPT:
- hook: usa ESATTAMENTE il testo hook deciso dal Marketing Manager, non riscriverlo
- sections: rispecchia la struttura narrativa MM (hook→problema→agitazione→soluzione→prova→CTA)
- timing: rispetta i secondi indicati nella struttura narrativa
- voiceover: frasi brevi, ritmo parlato, naturale — non formale
- emozioni: segui la sequenza emotiva indicata dal MM, sezione per sezione
- duration_sec: usa la durata consigliata dal MM (default 45s se non specificato)

REGOLE DI ESECUZIONE CAPTIONS:
- Genera SEMPRE tutte e 6 le caption — anche se non conosci le piattaforme attive del cliente
- Ogni caption deve essere autonoma e ottimizzata per il formato specifico della piattaforma
- Il messaggio principale deve essere coerente con hook e CTA dello script
- Non copiare il voiceover — le caption hanno tono e struttura diversa dal video
- Non usare newline nelle stringhe JSON

ERRORI DA NON FARE:
- Non cambiare il hook stabilito dal Marketing Manager
- Non inventare una struttura narrativa diversa da quella ricevuta
- Non usare newline \\n nei valori stringa del JSON

SE I DATI DEL MARKETING MANAGER SONO MANCANTI O PARZIALI:
- NON rispondere mai con "IMPOSSIBILE PROCEDERE", "DATI MANCANTI" o messaggi di errore bloccanti
- Se hook_testo è vuoto → crea un hook efficace a partire dal brief originale
- Se cta_finale è vuota → crea una CTA appropriata per il contenuto ricevuto
- Se struttura_narrativa è vuota → usa la struttura standard HOOK→PROBLEMA→AGITAZIONE→SOLUZIONE→PROVA→CTA
- Se istruzioni_copywriter sono vuote → opera con il tuo giudizio creativo sul brief originale
- Rispondi SEMPRE con un JSON valido, anche se i dati sono parziali
- Se hai dovuto supplire dati mancanti, aggiungi un campo opzionale "note": "Hook generato autonomamente — struttura MM non fornita" nel JSON"""

_SYS_STRATEGIST = """Sei lo Strategist della pipeline video. Il tuo ruolo è ESECUTIVO: trasformi in retention curve e direttive tecniche le direttive già decise dal Marketing Manager.

NON inventare l'angolo di marketing, il ritmo narrativo o la struttura emotiva — questi arrivano dal Marketing Manager. Il tuo compito è tradurre quelle decisioni in direttive tecniche precise per il Video Editor.

Rispondi ESCLUSIVAMENTE con JSON valido (parseable da json.loads). Zero testo fuori dal JSON.

SCHEMA OBBLIGATORIO:
{
  "curve": [
    {"s": "00:00-00:03", "risk": "low|mid|high", "fix": "azione concreta per evitare dropout"}
  ],
  "reengagement": "timing esatto re-engagement (es. 00:28)",
  "directives": [
    "direttiva tecnica specifica con timing e valori numerici"
  ]
}

CRITERI:
- curve: una entry per sezione dello script, mai generica
- risk high = sezione >8s o statica → animazione forte obbligatoria
- fix: concreta (es. "whip pan a 90f", "testo scala 0.8x→1.3x in 12f su beat")
- reengagement: timing esatto del hook visivo secondario (di solito 60-70% del video)
- directives: max 5, solo istruzioni tecniche con valori numerici misurabili"""

# ── System prompts STANDALONE — agenti come assistenti diretti (task ad-hoc) ──
# Usati quando l'utente manda documenti/immagini/testo SENZA audio/video pipeline.
_SYS_STANDALONE = {
    "marketing-manager": (
        "Sei il Marketing Manager di Videocraft Studio. "
        "Il tuo compito principale è orchestrare la pipeline video. "
        "Ma puoi anche ricevere task diretti dall'utente: analisi di mercato, "
        "revisione di brief, valutazioni creative, strategie di contenuto, "
        "feedback su documenti. Analizza l'input ricevuto (testi, documenti, immagini) "
        "e rispondi nel modo più utile per il tuo ruolo. "
        "Rispondi in italiano in modo chiaro e strutturato."
    ),
    "copywriter": (
        "Sei il Copywriter di Videocraft Studio. "
        "Il tuo compito principale è scrivere script video. "
        "Ma puoi anche ricevere task diretti: scrivere testi, rielaborare copy, "
        "revisionare script, creare headline, caption social, email copy, "
        "analizzare documenti di testo. Produci il copy richiesto con qualità alta. "
        "Rispondi in italiano."
    ),
    "strategist": (
        "Sei lo Strategist di Videocraft Studio. "
        "Il tuo compito principale è creare retention curve per video. "
        "Ma puoi anche ricevere task diretti: analisi di contenuti, strategie di crescita, "
        "valutazione performance, analisi competitor, report, piani editoriali. "
        "Analizza l'input e fornisci raccomandazioni strategiche concrete con dati. "
        "Rispondi in italiano."
    ),
    "cover-designer": (
        "Sei il Cover Designer di Videocraft Studio. "
        "Il tuo compito principale è creare il design system per i video. "
        "Ma puoi anche ricevere task diretti: analisi di design, feedback su grafiche, "
        "suggerimenti di palette colori, valutazione composizione visiva, tipografia. "
        "Se ricevi immagini, analizzale dal punto di vista del design con dettaglio tecnico. "
        "Rispondi in italiano."
    ),
    "video-editor": (
        "Sei il Video Editor di Videocraft Studio, specializzato in Remotion/React. "
        "Il tuo compito principale è generare codice TSX per video animati. "
        "Ma puoi anche ricevere task diretti: analisi tecnica, feedback su codice, "
        "debug Remotion, suggerimenti di animazione, revisione di componenti. "
        "Rispondi in italiano con precisione tecnica."
    ),
    "smm-publisher": (
        "Sei l'SMM Publisher di Videocraft Studio. "
        "Il tuo compito principale è pubblicare contenuti sui social. "
        "Ma puoi anche ricevere task diretti: calendario editoriale, analisi post, "
        "ottimizzazione caption, hashtag strategy, timing di pubblicazione. "
        "Rispondi in italiano con consigli concreti e azionabili."
    ),
    "carousel-designer": (
        "Sei il Carousel Designer di Videocraft Studio. "
        "Il tuo compito è strutturare i caroselli Instagram: decidi slide-by-slide "
        "titoli, testi, layout e prompt visual per Ideogram. "
        "Produci SEMPRE JSON valido con array 'slides'. "
        "Rispondi in italiano."
    ),
}

# Tool concessi a ogni agente quando gira come Claude Code subprocess
_ALLOWED_TOOLS: dict[str, str] = {
    "marketing-manager": "Read,Write,Bash,WebSearch,WebFetch,Glob",
    "copywriter":        "Read,Write,Glob",
    "strategist":        "Read,Write,Bash,WebSearch,WebFetch,Glob",
    "cover-designer":    "Read,Write,Bash,Glob",
    "video-editor":      "Read,Write,Edit,Bash,Glob,Grep",
    "smm-publisher":     "Read,Write,Bash,Glob",
    "carousel-designer": "Read,Write,Glob",
}

# CWD effettivo per ogni agente in lancia_agente_cli.
# video-editor usa CODICE/video-editor (project root con src/, out/, public/).
# Gli altri agenti usano AGENTI/{nome}/ dove si trova il loro CLAUDE.md.
_AGENT_CWD: dict[str, str] = {
    "video-editor":      os.path.join(BASE_PATH, "CODICE", "video-editor"),
    "marketing-manager": os.path.join(BASE_PATH, "AGENTI", "marketing-manager"),
    "copywriter":        os.path.join(BASE_PATH, "AGENTI", "copywriter"),
    "strategist":        os.path.join(BASE_PATH, "AGENTI", "strategist"),
    "cover-designer":    os.path.join(BASE_PATH, "AGENTI", "cover-designer"),
    "smm-publisher":     os.path.join(BASE_PATH, "AGENTI", "smm-publisher"),
    "smm-researcher":    os.path.join(BASE_PATH, "AGENTI", "smm-researcher"),
    "carousel-designer": os.path.join(BASE_PATH, "AGENTI", "carousel-designer"),
}

# ── Keyword detection: quando usare Claude Code vs Claude API ─────────────────

_CC_KEYWORDS = {
    "crea", "genera", "produci", "costruisci", "scrivi il file",
    "crea un file", "genera un file", "crea un pdf", "genera pdf",
    "crea un'immagine", "genera immagine", "crea la thumbnail",
    "genera la thumbnail", "crea il thumbnail", "genera thumbnail",
    "crea la copertina", "genera la copertina", "fai la copertina",
    "crea uno script", "scrivi lo script", "genera lo script",
    "crea il calendario", "genera il calendario",
    "crea il piano editoriale", "genera il piano editoriale",
    "crea un report", "genera un report",
    "modifica il file", "modifica file", "aggiorna il file",
    "esegui", "fai girare", "renderizza", "render",
    "programma", "codice", "script python",
}

def _richiede_claude_code(testo: str) -> bool:
    """
    Determina se il task richiede Claude Code (genera file) vs Claude API (risponde solo).
    Regola: se il testo contiene keyword generative → Claude Code.
    """
    t = testo.lower()
    return any(kw in t for kw in _CC_KEYWORDS)


# ── Claude Code subprocess ────────────────────────────────────────────────────

def _parse_cc_json(stdout_text: str) -> str:
    """Estrae il testo risultato dall'output JSON di Claude Code."""
    try:
        data = json.loads(stdout_text)
        if isinstance(data, list):
            parts = [d.get("result", "") for d in data
                     if isinstance(d, dict) and d.get("type") == "result"]
            return "\n".join(p for p in parts if p) or stdout_text
        risposta = data.get("result", data.get("content", stdout_text))
        if isinstance(risposta, list):
            return " ".join(r.get("text", "") for r in risposta if isinstance(r, dict))
        return risposta or ""
    except Exception:
        return stdout_text


async def _esegui_con_claude_code(
    task_prompt: str,
    agente_id: str,
    file_paths: list[str] | None = None,
    timeout_sec: int = 600,
    progress_cb=None,
) -> tuple[str, list[str]]:
    """
    Lancia Claude Code come subprocess con il CLAUDE.md dell'agente come contesto.
    Il CLAUDE.md in AGENTI/{agente_id}/ viene letto automaticamente da Claude Code
    perché è nella directory padre del workspace (cwd).

    Ritorna (testo_risposta, lista_nuovi_file_generati).
    """
    workspace = os.path.join(BASE_PATH, "AGENTI", agente_id, "workspace")
    os.makedirs(workspace, exist_ok=True)

    # Costruisci prompt: task + contesto file allegati
    file_context = ""
    if file_paths:
        file_list = "\n".join(f"  - {p}" for p in file_paths)
        file_context = (
            f"\n\nFILE ALLEGATI (percorsi assoluti — puoi leggerli direttamente con Read):\n"
            f"{file_list}"
        )
    full_prompt = f"{task_prompt}{file_context}"

    # Snapshot timestamp per rilevare file nuovi dopo l'esecuzione
    t_start = datetime.now().timestamp()

    allowed = _ALLOWED_TOOLS.get(agente_id, "Read,Write,Glob")
    print(f"[CC/{agente_id}] Avvio — workspace: {workspace}", flush=True)

    try:
        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", "--output-format", "json",
            "--allowedTools", allowed,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=workspace,
        )

        # Avvia communicate come task separato per poter inviare progress ogni 60s
        communicate_task = asyncio.create_task(
            proc.communicate(input=full_prompt.encode("utf-8"))
        )
        elapsed   = 0
        interval  = 60
        min_total = max(1, timeout_sec // 60)
        stdout_b, stderr_b = b"", b""

        while True:
            try:
                await asyncio.wait_for(asyncio.shield(communicate_task), timeout=interval)
                stdout_b, stderr_b = communicate_task.result()
                break
            except asyncio.TimeoutError:
                elapsed += interval
                if elapsed >= timeout_sec:
                    # Timeout — killa il processo e cattura output parziale
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    try:
                        stdout_b, stderr_b = await asyncio.wait_for(
                            communicate_task, timeout=5.0
                        )
                    except Exception:
                        pass
                    partial_text     = stdout_b.decode("utf-8", errors="replace")
                    partial_risposta = _parse_cc_json(partial_text)
                    timeout_header   = f"⏱️ Timeout ({timeout_sec}s) — task troppo lungo."
                    if partial_risposta.strip():
                        return (
                            f"{timeout_header}\n\n"
                            f"📄 *Risultato parziale prodotto finora:*\n{partial_risposta}",
                            [],
                        )
                    return f"{timeout_header} Semplifica la richiesta.", []
                else:
                    # Ancora in tempo — invia messaggio di progresso
                    min_done = elapsed // 60
                    if progress_cb:
                        try:
                            await progress_cb(
                                f"⏳ Ancora in elaborazione... ({min_done}/{min_total} min)"
                            )
                        except Exception:
                            pass

        if stderr_b:
            snippet = stderr_b.decode("utf-8", errors="replace")[:300]
            print(f"[CC/{agente_id}] stderr: {snippet}", flush=True)

        stdout_text = stdout_b.decode("utf-8", errors="replace")
        risposta    = _parse_cc_json(stdout_text)

        # Trova file creati/modificati dopo t_start
        nuovi_file: list[str] = []
        for root_dir, dirs, files in os.walk(workspace):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in files:
                if fname.startswith("."):
                    continue
                fpath = os.path.join(root_dir, fname)
                try:
                    if os.path.getmtime(fpath) >= t_start - 1:   # -1s per tolleranza clock
                        nuovi_file.append(fpath)
                except Exception:
                    pass

        print(f"[CC/{agente_id}] Completato — {len(nuovi_file)} file generati", flush=True)
        return risposta, nuovi_file

    except FileNotFoundError:
        return (
            "❌ Claude Code non trovato nel PATH.\n"
            "Assicurati che il CLI `claude` sia installato e accessibile.",
            []
        )
    except Exception as e:
        return f"❌ Errore Claude Code: {e}", []


# ── Router intelligente: Claude Code vs API ───────────────────────────────────

async def _gestisci_task_agente(
    agente_id: str,
    user_text: str,
    doc_texts: list[str] | None = None,
    images_b64: list[str] | None = None,
    file_paths: list[str] | None = None,
    max_tokens: int = 2500,
    progress_cb=None,
) -> tuple[str, list[str]]:
    """
    Router intelligente per task ad-hoc degli agenti.

    • Claude Code  → task con generazione file (keyword: crea, genera, produci...)
    • Claude API   → analisi/risposta testuale  (keyword: analizza, spiega, dimmi...)

    Ritorna (testo_risposta, file_generati).
    """
    if _richiede_claude_code(user_text):
        print(f"[Router] {agente_id} → Claude Code (task generativo)", flush=True)
        return await _esegui_con_claude_code(user_text, agente_id, file_paths, progress_cb=progress_cb)
    else:
        print(f"[Router] {agente_id} → Claude API (task testuale)", flush=True)
        try:
            risposta, _ = _chiama_agente_adhoc_api(
                agente_id, user_text,
                doc_texts=doc_texts,
                images_b64=images_b64,
                max_tokens=max_tokens,
            )
        except Exception as e:
            risposta = f"❌ API error: {e}"
        return risposta, []


async def _invia_file_generati(
    update,
    ctx,
    file_paths: list[str],
    agente_id: str,
    pulisci: bool = True,
) -> None:
    """
    Invia i file generati da Claude Code nel topic Telegram dell'agente.
    Se pulisci=True, rimuove i file dalla workspace dopo l'invio.
    """
    if not file_paths:
        return

    thread_id = None
    if update.message and update.message.is_topic_message:
        thread_id = update.message.message_thread_id

    chat_id = update.message.chat_id if update.message else None
    if not chat_id:
        return

    inviati = 0
    for fpath in file_paths:
        if not os.path.exists(fpath) or os.path.getsize(fpath) == 0:
            continue
        fname = os.path.basename(fpath)
        try:
            with open(fpath, "rb") as f:
                if thread_id:
                    await ctx.bot.send_document(
                        chat_id=chat_id,
                        message_thread_id=thread_id,
                        document=f,
                        filename=fname,
                        caption=f"📄 {fname}",
                    )
                else:
                    await ctx.bot.send_document(
                        chat_id=chat_id,
                        document=f,
                        filename=fname,
                        caption=f"📄 {fname}",
                    )
            inviati += 1
        except Exception as e:
            print(f"[CC] Errore invio file {fname}: {e}", flush=True)

    if pulisci:
        for fpath in file_paths:
            try:
                os.unlink(fpath)
            except Exception:
                pass

    if inviati:
        print(f"[CC/{agente_id}] {inviati} file inviati su Telegram", flush=True)


def _estrai_testo_documento(file_path: str, filename: str = "") -> str:
    """
    Estrae testo leggibile da PDF, TXT, MD, CSV, JSON e altri file di testo.
    Ritorna il testo estratto (max 15000 chars) o un messaggio di errore.
    """
    ext = os.path.splitext(filename or file_path)[1].lower()
    try:
        if ext == ".pdf":
            import fitz  # pymupdf
            doc = fitz.open(file_path)
            testo = "\n\n".join(
                f"[Pagina {i+1}]\n{page.get_text()}" for i, page in enumerate(doc)
            )
            doc.close()
            return testo[:15000]
        elif ext in (".txt", ".md", ".csv", ".log", ".xml", ".html", ".htm"):
            with open(file_path, encoding="utf-8", errors="replace") as f:
                return f.read()[:15000]
        elif ext == ".json":
            with open(file_path, encoding="utf-8", errors="replace") as f:
                raw = f.read()[:15000]
            # Formatta il JSON per leggibilità
            try:
                return json.dumps(json.loads(raw), ensure_ascii=False, indent=2)[:15000]
            except Exception:
                return raw
        else:
            return f"[Tipo file '{ext}' non supportato per estrazione testo]"
    except Exception as e:
        return f"[Errore lettura '{filename}': {e}]"

def _chiama_agente_adhoc_api(
    agente_id: str,
    user_text: str,
    doc_texts: list[str] | None = None,
    images_b64: list[str] | None = None,
    max_tokens: int = 2000,
) -> tuple[str, dict]:
    """
    Chiama Claude API come agente standalone (senza pipeline).
    Supporta testo, documenti e immagini vision in un'unica chiamata.
    Ritorna (risposta_testo, usage_dict).
    """
    sys_prompt = _SYS_STANDALONE.get(
        agente_id,
        f"Sei l'agente {agente_id} di Videocraft Studio. Analizza l'input e rispondi in modo utile."
    )

    # Modalità standalone: inietta KNOWLEDGE_BASE.md se presente per l'agente
    kb_path = os.path.join(BASE_PATH, "AGENTI", agente_id, "KNOWLEDGE_BASE.md")
    if os.path.isfile(kb_path):
        try:
            with open(kb_path, encoding="utf-8") as _f:
                kb_text = _f.read().strip()
            if kb_text:
                sys_prompt = f"{sys_prompt}\n\n---\n\n{kb_text}"
                print(f"[Adhoc/{agente_id}] KNOWLEDGE_BASE.md iniettato ({len(kb_text)} chars)", flush=True)
        except Exception as _e:
            print(f"[Adhoc/{agente_id}] Warning: impossibile leggere KNOWLEDGE_BASE.md — {_e}", flush=True)

    # Costruisce il contenuto del messaggio utente
    content: list[dict] = []

    # Immagini prima (best practice per vision)
    for img_b64 in (images_b64 or [])[:5]:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": img_b64}
        })

    # Testo principale + contenuto documenti
    full_text = user_text or ""
    if doc_texts:
        docs_str = "\n\n".join(
            f"━━━ DOCUMENTO {i+1} ━━━\n{t}" for i, t in enumerate(doc_texts) if t
        )
        full_text = f"{full_text}\n\n{docs_str}" if full_text else docs_str
    content.append({"type": "text", "text": full_text or "(nessun testo)"})

    payload = {
        "model": MODEL_SONNET,
        "max_tokens": max_tokens,
        "system": sys_prompt,
        "messages": [{"role": "user", "content": content}],
    }
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=data,
        headers={
            "content-type":    "application/json",
            "x-api-key":       ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        }
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    usage = result.get("usage", {})
    cost  = calcola_costo(MODEL_SONNET, usage)
    print(f"[Adhoc/{agente_id}] in:{usage.get('input_tokens',0)} "
          f"out:{usage.get('output_tokens',0)} → ${cost:.4f}", flush=True)
    return result["content"][0]["text"], usage

def _buffer_ha_media(key: tuple) -> bool:
    """True se il buffer per questa chat ha audio o video — indica una pipeline attiva."""
    entry = _buffer.get(key)
    if not entry:
        return False
    return bool(entry.get("audios") or entry.get("videos"))

def _buffer_summary(entry: dict) -> str:
    """Testo di riepilogo degli elementi nel buffer — usato in STATO e in AVVIA."""
    n_audio  = len(entry.get("audios", []))
    n_video  = len(entry.get("videos", []))
    n_testi  = len(entry.get("texts", []))
    n_img    = len(entry.get("images", []))
    n_docs   = len(entry.get("docs", []))
    righe = []
    if n_audio:  righe.append(f"🎙️ {n_audio} audio")
    if n_video:  righe.append(f"🎬 {n_video} video")
    if n_testi:  righe.append(f"📝 {n_testi} blocchi testo")
    if n_img:    righe.append(f"🖼️ {n_img} immagini")
    if n_docs:   righe.append(f"📎 {n_docs} documenti")
    if not righe:
        return "Buffer vuoto."
    return "  " + "\n  ".join(righe)


def _topic_agente_id(update) -> str | None:
    """Ritorna l'agente_id del topic corrente, o None se non riconosciuto."""
    topics = carica_topics()
    msg = update.message
    topic_name = topics.get(str(msg.message_thread_id), "") if msg.is_topic_message else ""
    for chiave, cartella in TOPIC_AGENTI.items():
        if chiave in topic_name.lower():
            return cartella
    return None


def _topic_name_str(update) -> str:
    """Ritorna il nome del topic corrente come stringa."""
    topics = carica_topics()
    msg = update.message
    return topics.get(str(msg.message_thread_id), "") if msg.is_topic_message else ""


async def _invia_risposta_topic(update, ctx, testo: str, agente_id: str) -> None:
    """Invia la risposta adhoc nel topic dell'agente, spezzando se > 4000 chars."""
    topic_name   = _topic_name_str(update)
    thread_id    = get_thread_id_by_name(topic_name) if topic_name else None
    chat_id      = update.message.chat_id
    # Spezza in blocchi da 4000 chars
    blocchi = [testo[i:i+4000] for i in range(0, max(len(testo), 1), 4000)]
    for blocco in blocchi:
        kwargs = {"chat_id": chat_id, "text": blocco}
        if thread_id:
            kwargs["message_thread_id"] = thread_id
        try:
            await ctx.bot.send_message(**kwargs)
        except Exception as e:
            print(f"[Adhoc] Errore invio risposta: {e}", flush=True)


# Callback globale per notifiche rate limit su Telegram (impostato per ogni run di pipeline)
_rl_notify_cb = None   # async callable(str)

# FIFO queue: serializza le chiamate API per evitare rate limit su richieste concorrenti.
# Permette una sola chiamata _anthropic_call alla volta — le successive aspettano in coda.
_api_semaphore: asyncio.Semaphore | None = None

def _get_api_semaphore() -> asyncio.Semaphore:
    """Lazy init del semaforo — creato al primo uso nel loop asyncio corretto."""
    global _api_semaphore
    if _api_semaphore is None:
        _api_semaphore = asyncio.Semaphore(1)
    return _api_semaphore

async def _anthropic_call(system_text, user_content, model, max_tokens=1200):
    """
    Chiama l'API Anthropic con prompt caching sul system prompt.
    Il system_text viene cachato: alla 2ª+ chiamata non viene riconteggiato.
    Retry con exponential backoff su errore 429 (rate limit): 30s → 60s → 120s → 180s (5 tentativi totali).
    """
    global _rl_notify_cb
    async with _get_api_semaphore():
        return await _anthropic_call_inner(system_text, user_content, model, max_tokens)

async def _anthropic_call_inner(system_text, user_content, model, max_tokens=1200):
    """Implementazione interna — chiamata sempre attraverso _anthropic_call (con semaforo FIFO)."""
    global _rl_notify_cb
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": [
            {
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"}   # ← prompt caching attivo
            }
        ],
        "messages": [{"role": "user", "content": user_content}]
    }
    data    = json.dumps(payload).encode("utf-8")
    headers = {
        "content-type":    "application/json",
        "x-api-key":       ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":  "prompt-caching-2024-07-31"
    }

    # PROBLEMA 2 FIX: 5 tentativi — ultimo attende 3 minuti invece di crashare
    wait_times = [30, 60, 120, 180]   # backoff: 30s → 60s → 120s → 180s (3 min)
    last_error = None

    for attempt in range(len(wait_times) + 1):
        if attempt > 0:
            wait = wait_times[attempt - 1]
            msg  = f"⏳ Rate limit API — riprovo tra {wait}s (tentativo {attempt + 1}/{len(wait_times) + 1})"
            print(f"[API] {msg}", flush=True)
            if _rl_notify_cb:
                try:
                    await _rl_notify_cb(msg)
                except Exception:
                    pass
            await asyncio.sleep(wait)

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=data, headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            usage  = result.get("usage", {})
            cached = usage.get("cache_read_input_tokens", 0)
            c_wrt  = usage.get("cache_creation_input_tokens", 0)
            inp    = usage.get("input_tokens", 0)
            out    = usage.get("output_tokens", 0)
            cost   = calcola_costo(model, usage)
            print(f"[API/{model}] in:{inp} out:{out} cache_hit:{cached} cache_write:{c_wrt} → ${cost:.4f}", flush=True)
            return result["content"][0]["text"], usage
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 429 and attempt < len(wait_times):
                print(f"[API] 429 Rate limit — {body[:200]}", flush=True)
                last_error = body
                continue   # riprova con backoff
            raise RuntimeError(f"API {e.code}: {body}")

    raise RuntimeError(f"API 429 — max retry superati: {last_error}")

def parse_json_safe(text):
    """Estrae e parse JSON dalla risposta dell'agente."""
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r'\{[\s\S]+\}', text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return None

# ══════════════════════════════════════════════════════════════════════════════
#  2. CLI FALLBACK (Video Editor + agenti senza API key)
# ══════════════════════════════════════════════════════════════════════════════

async def lancia_agente_cli(cartella, prompt, model=None):
    """
    Claude CLI — async non-bloccante. Usato per Video Editor e fallback.
    Il prompt viene passato via STDIN (non come argomento) per evitare il limite
    Windows di 32KB sulla command line e garantire che i testi lunghi arrivino interi.
    """
    path       = _AGENT_CWD.get(cartella, os.path.join(BASE_PATH, cartella))
    claude_bin = os.environ.get("CLAUDE_BIN", r"C:\Users\super\.local\bin\claude.exe")
    cmd = [claude_bin, "--print", "--dangerously-skip-permissions"]
    if model:
        cmd.extend(["--model", model])
    # NON appendiamo il prompt a cmd: lo passiamo via stdin (nessun limite 32KB)
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=path,
            stdin=asyncio.subprocess.PIPE,   # ← stdin aperto
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_b, stderr_b = await asyncio.wait_for(
            proc.communicate(input=prompt.encode("utf-8")),   # ← prompt via stdin
            timeout=TIMEOUT
        )
        output = stdout_b.decode("utf-8", errors="replace") if stdout_b else ""
        stderr = stderr_b.decode("utf-8", errors="replace") if stderr_b else ""

        print(f"[CLI/{cartella}] exit={proc.returncode} stdout={len(output)}chars stderr={len(stderr)}chars", flush=True)
        if stderr.strip():
            print(f"[CLI/{cartella}] STDERR: {stderr[:500]}", flush=True)

        if not output.strip():
            print(f"[CLI/{cartella}] Output vuoto!", flush=True)
            return "Completato senza output"

        # Nessun troncamento: il JSON del MM Brain può essere > 6000 chars
        print(f"[CLI/{cartella}] Output completo: {len(output)} chars", flush=True)
        return output
    except asyncio.TimeoutError:
        return "Timeout agente."
    except Exception as e:
        return f"Errore: {e}"

# ══════════════════════════════════════════════════════════════════════════════
#  3. DISPATCHER: API se disponibile, altrimenti CLI
# ══════════════════════════════════════════════════════════════════════════════

async def chiama_copywriter(brief, mm_brief=None, card_id=None, audio_dur_sec: float | None = None):
    """Esegue le istruzioni del Marketing Manager per produrre lo script."""
    if mm_brief:
        istruzioni   = mm_brief.get("istruzioni_copywriter", "") or f"Crea uno script video efficace dal brief."
        hook_mm      = mm_brief.get("hook_testo", "")
        struttura    = json.dumps(mm_brief.get("struttura_narrativa", []), ensure_ascii=False)
        cta_mm       = mm_brief.get("cta_finale", "")
        # BUG FIX 1: se abbiamo la durata reale dell'audio, sovrascriviamo la stima del MM
        durata       = round(audio_dur_sec, 1) if audio_dur_sec else mm_brief.get("durata_consigliata_sec", 45)
        dir_cliente  = mm_brief.get("direttive_cliente", "")
        dir_block    = f"\n⚠️ DIRETTIVE CLIENTE [OBBLIGATORIE]:\n{dir_cliente}\n" if dir_cliente else ""
        dur_block    = (
            f"\n⚠️ DURATA AUDIO OBBLIGATORIA: {durata}s — usa ESATTAMENTE questo valore per "
            f"duration_sec. La somma dei timing di tutte le sections DEVE essere uguale a {durata}s. "
            f"Non stimare, non arrotondare liberamente.\n"
        ) if audio_dur_sec else ""
        # PROBLEMA 3 FIX: se campi chiave mancano (rate limit ha corrotto il passaggio dati),
        # segnalalo ma NON bloccare — il Copywriter deve procedere autonomamente
        _campi_mancanti = []
        if not hook_mm:      _campi_mancanti.append("hook_testo")
        if not cta_mm:       _campi_mancanti.append("cta_finale")
        if not mm_brief.get("struttura_narrativa"): _campi_mancanti.append("struttura_narrativa")
        fallback_block = (
            f"\n⚠️ NOTA: i seguenti campi MM non sono stati ricevuti: {', '.join(_campi_mancanti)}. "
            f"Generali autonomamente dal brief originale — NON bloccarti, NON rispondere con errori.\n"
        ) if _campi_mancanti else ""
        user_content = (
            f"{dur_block}{dir_block}{fallback_block}"
            f"ISTRUZIONI MARKETING MANAGER:\n{istruzioni}\n\n"
            f"HOOK OBBLIGATORIO: {hook_mm or '(genera tu dal brief)'}\n"
            f"CTA OBBLIGATORIA: {cta_mm or '(genera tu dal brief)'}\n"
            f"STRUTTURA NARRATIVA: {struttura}\n"
            f"DURATA: {durata}s\n\n"
            f"BRIEF ORIGINALE: {brief}"
        )
    else:
        dur_block    = (
            f"⚠️ DURATA AUDIO OBBLIGATORIA: {round(audio_dur_sec, 1)}s — "
            f"usa questo valore esatto per duration_sec.\n"
        ) if audio_dur_sec else ""
        user_content = f"{dur_block}BRIEF: {brief}"

    if ANTHROPIC_API_KEY:
        raw, usage = await _anthropic_call(_SYS_COPYWRITER, user_content, MODEL_HAIKU, max_tokens=3000)
        dashboard_agent_cost(card_id, "copywriter", "Copywriter", MODEL_HAIKU, usage)
        return parse_json_safe(raw), raw
    prompt = f"""Sei il Copywriter. Esegui le istruzioni ricevute e scrivi lo script + caption in JSON.
{user_content}
Schema: {{"hook":"...","sections":[{{"t":"00:00-00:03","v":"...","e":"...","r":"fast|medium|slow"}}],"cta":"...","duration_sec":45,"captions":{{"instagram":"...","tiktok":"...","youtube_title":"...","youtube_description":"...","linkedin":"...","facebook":"..."}}}}
Solo JSON."""
    raw = await lancia_agente_cli("copywriter", prompt, MODEL_HAIKU)
    return parse_json_safe(raw), raw

async def chiama_strategist(script_json, brief, mm_brief=None, card_id=None):
    """Esegue le istruzioni del Marketing Manager per retention e TSX skeleton."""
    script_compact = json.dumps(script_json, ensure_ascii=False)[:MAX_SCRIPT] if script_json else brief[:MAX_SCRIPT]
    duration = (script_json or {}).get("duration_sec", 45)

    mm_parte = ""
    if mm_brief:
        dir_cliente = mm_brief.get("direttive_cliente", "")
        dir_block   = f"\n⚠️ DIRETTIVE CLIENTE [OBBLIGATORIE]:\n{dir_cliente}\n" if dir_cliente else ""
        mm_parte = (
            f"{dir_block}"
            f"\nISTRUZIONI MARKETING MANAGER:\n{mm_brief.get('istruzioni_strategist','')}\n"
            f"ANGOLO: {mm_brief.get('angolo','')}\n"
            f"TARGET DOLORE: {mm_brief.get('target',{}).get('dolore','')}\n"
            f"RE-ENGAGEMENT CONSIGLIATO: alla sezione prova sociale (~60% del video)\n"
        )

    user_msg = f"SCRIPT: {script_compact}\nDURATION_SEC: {duration}{mm_parte}"

    if ANTHROPIC_API_KEY:
        raw, usage = await _anthropic_call(_SYS_STRATEGIST, user_msg, MODEL_SONNET, max_tokens=1200)
        dashboard_agent_cost(card_id, "strategist", "Strategist", MODEL_SONNET, usage)
    else:
        prompt = f"""Sei lo Strategist. Analizza lo script e le istruzioni MM. Rispondi SOLO con JSON valido.
{user_msg}
Schema: {{"curve":[{{"s":"timing","risk":"low|mid|high","fix":"azione"}}],"reengagement":"timing","directives":["direttiva"]}}"""
        raw = await lancia_agente_cli("strategist", prompt, MODEL_SONNET)
    strategy_json = parse_json_safe(raw)
    return strategy_json, [], raw

async def chiama_cover_designer(script_json, strategy_json, brief="", mm_brief=None):
    """Cover Designer usa SEMPRE il CLI per accedere a Ideogram MCP e WebSearch.
    Esegue le istruzioni del Marketing Manager per stile visivo e thumbnail.
    Ritorna (visual_json, image_paths, raw)."""
    hook      = (script_json or {}).get("hook", "")
    sections  = (script_json or {}).get("sections", [])
    cta       = (script_json or {}).get("cta", "")
    duration  = (script_json or {}).get("duration_sec", 45)
    script_txt = hook + "\n" + "\n".join(
        f"[{s.get('t','')}] {s.get('v','')} ({s.get('e','')})"
        for s in sections[:6]
    ) + f"\nCTA: {cta}"
    directives = "\n".join((strategy_json or {}).get("directives", []))

    month   = datetime.now().strftime("%Y-%m")
    img_dir = os.path.join(OUTPUT_BASE, "VideoCraft Studio", "Covers", month)
    os.makedirs(img_dir, exist_ok=True)

    mm_visual = ""
    if mm_brief:
        dir_cliente = mm_brief.get("direttive_cliente", "")
        dir_block   = f"\n⚠️ DIRETTIVE CLIENTE [OBBLIGATORIE — RISPETTA ALLA LETTERA]:\n{dir_cliente}\n" if dir_cliente else ""
        mm_visual = (
            f"{dir_block}"
            f"\nISTRUZIONI MARKETING MANAGER:\n{mm_brief.get('istruzioni_cover_designer','')}\n"
            f"ANGOLO: {mm_brief.get('angolo','')}\n"
            f"TARGET: {mm_brief.get('target',{}).get('profilo','')}\n"
            f"TREND NICCHIA: {mm_brief.get('trend_insights','')}\n"
        )

    prompt = f"""Esegui il lavoro COMPLETO di AI Graphic Designer per questo video social.
Segui le istruzioni del Marketing Manager per stile e thumbnail — non inventare nulla di non indicato.

BRIEF: {brief if brief else hook}
HOOK (headline principale): "{hook}"
CTA: "{cta}"
SCRIPT:
{script_txt}
{mm_visual}DIRETTIVE STRATEGIST: {directives}
CARTELLA OUTPUT: {img_dir}

━━━ FASE 1 — RICERCA COMPETITIVA (obbligatoria) ━━━
Usa WebSearch per trovare i top creator della nicchia in questo video.
Analizza le thumbnail dei canali con più view — estrai la formula visiva vincente.
Documenta: layout, colori dominanti, stile testo, pattern ricorrente.

━━━ FASE 2 — DESIGN SYSTEM COMPLETO ━━━
Definisci il sistema visivo completo che il Video Editor userà:
- Palette 8 colori (sfondo principale, sfondo secondario, testo primario, testo secondario, accento1, accento2, tensione, soluzione) — con codici hex reali
- Gerarchia tipografica (font hero, headline, body, CTA — con dimensioni px e peso)
- Elementi grafici (linee, bordi, icone, effetti speciali)
- Regole di coerenza visiva tra le scene

━━━ FASE 3 — GENERAZIONE COPERTINA CON IDEOGRAM ━━━
Genera la copertina 9:16 (1080x1920px) usando Ideogram MCP:
- Prompt Ideogram: visual PURO, NO TEXT, NO WORDS, NO LETTERS
   Zona superiore 30% VUOTA per il testo overlay
   Stile: dark/vivid, alta qualità, coerente con la nicchia
- Salva il file nella CARTELLA OUTPUT: {img_dir}
- Poi genera anche variante 16:9 per YouTube thumbnail

━━━ FASE 4 — BRIEF THUMBNAIL COMPLETO ━━━
Scrivi il brief dettagliato per la thumbnail ad alto CTR:
- Composizione (layout A/B/C del CLAUDE.md)
- Testo overlay (max 4 parole, font bold)
- Colori, espressione, attiratori di attenzione
- Formula estratta dalla ricerca competitiva

━━━ OUTPUT JSON ━━━
Concludi con un JSON valido in questo schema:
{{
  "colors": {{
    "hook": "#hex", "body": "#hex", "cta": "#hex",
    "text": "#hex", "accent": "#hex", "accent2": "#hex",
    "tension": "#hex", "solution": "#hex"
  }},
  "fonts": {{
    "main": "NomeFont", "accent": "NomeFont",
    "sizeHero": "96px", "sizeHeadline": "64px",
    "sizeBody": "40px", "weight": "900"
  }},
  "thumbnail": "descrizione thumbnail ad alto CTR secondo formula nicchia",
  "cover_image_path": "percorso assoluto file 9:16 generato con Ideogram (o null)",
  "thumbnail_path": "percorso assoluto thumbnail 16:9 (o null)",
  "design_notes": "istruzioni specifiche per il Video Editor sull'applicazione visiva"
}}"""

    raw = await lancia_agente_cli("cover-designer", prompt, MODEL_SONNET)
    visual_json = parse_json_safe(raw)

    # Raccogli percorsi immagini dall'output e dal JSON
    image_paths = re.findall(r'[A-Za-z]:\\[^\s"\'<>|*?\r\n]+\.(?:png|jpg|jpeg|webp)', raw)
    if visual_json:
        for key in ("cover_image_path", "thumbnail_path"):
            p = (visual_json or {}).get(key, "")
            if p and os.path.exists(p) and p not in image_paths:
                image_paths.append(p)

    print(f"[CoverDesigner] JSON: {bool(visual_json)} — Immagini: {image_paths}", flush=True)
    return visual_json, image_paths, raw

async def chiama_video_editor(script_json, strategy_json, visual_json, brief, tsx_pre_saved=None, mm_brief=None, audio_path=None, audio_dur_sec: float | None = None, pipeline_id: str | None = None, notify_fn=None):
    """
    Genera i file TSX Remotion uno per volta — una chiamata CLI separata per ogni file.
    Ogni file viene verificato (min 1500 bytes) e riprocessato individualmente se troppo piccolo.
    Ritorna (salvati: list[str], summary: str).
    """
    # PROBLEMA 4 FIX: verifica pipeline_id per evitare render di dati orfani
    if pipeline_id:
        _manifest_path_ve = os.path.join(VIDEO_EDITOR_PATH, "pipeline_current.json")
        try:
            with open(_manifest_path_ve, encoding="utf-8") as _mf_ve:
                _manifest_ve = json.load(_mf_ve)
            if _manifest_ve.get("id") != pipeline_id:
                _mismatch = (
                    f"❌ Mismatch pipeline ID — dati non corrispondenti, render annullato.\n"
                    f"ID atteso: {pipeline_id} | ID nel manifest: {_manifest_ve.get('id', 'N/A')}"
                )
                print(f"[VE] {_mismatch}", flush=True)
                return [], _mismatch
            print(f"[VE] ✅ Pipeline ID verificato: {pipeline_id}", flush=True)
        except FileNotFoundError:
            print(f"[VE] ⚠️ Manifest non trovato — prima pipeline, procedo.", flush=True)
        except Exception as _ve_err:
            print(f"[VE] ⚠️ Verifica pipeline_id fallita: {_ve_err} — procedo comunque", flush=True)

    hook       = (script_json or {}).get("hook", "")
    sections   = (script_json or {}).get("sections", [])
    duration   = (script_json or {}).get("duration_sec", 45)
    cta_text   = (script_json or {}).get("cta", "")

    # BUG FIX 1: se abbiamo la durata reale dell'audio, prevale su qualsiasi stima
    if audio_dur_sec:
        duration = audio_dur_sec
        print(f"[VE] Durata forzata dall'audio: {duration:.2f}s", flush=True)

    script_txt = hook + "\n" + "\n".join(
        f"[{s.get('t','')}] {s.get('v','')} ({s.get('e','')} {s.get('r','')})"
        for s in sections
    )
    directives  = "\n".join((strategy_json or {}).get("directives", []))
    reeng       = (strategy_json or {}).get("reengagement", "")
    curve_risks = "\n".join(
        f"  {c.get('s','')} risk={c.get('risk','')} → {c.get('fix','')}"
        for c in (strategy_json or {}).get("curve", [])
    )
    colors = json.dumps((visual_json or {}).get("colors", {}), ensure_ascii=False) if visual_json else '{"hook":"#000000","body":"#0D1B2A","cta":"#000000","text":"#ffffff","accent":"#39FF14","muted":"rgba(255,255,255,0.65)","accentSoft":"#ADFF2F"}'
    fonts  = json.dumps((visual_json or {}).get("fonts",  {}), ensure_ascii=False) if visual_json else '{"main":"Orbitron","accent":"AlfenaPixel","size":"72px"}'

    # Vincolo durata audio — blocco iniettato nei prompt (BUG FIX 1)
    dur_constraint = ""
    if audio_dur_sec:
        exact_frames = round(audio_dur_sec * 30)
        dur_constraint = (
            f"\n⚠️ DURATA AUDIO VINCOLANTE: {audio_dur_sec:.2f}s = {exact_frames} frame @ 30fps\n"
            f"Il video DEVE durare ESATTAMENTE {audio_dur_sec:.2f}s. "
            f"durationInFrames in Root.tsx DEVE essere {exact_frames}. "
            f"NON aggiungere secondi extra dopo la fine dell'audio.\n"
        )

    mm_ve_note = ""
    style_dna_tsx = {}   # regole TSX estratte dallo Style DNA
    if mm_brief:
        dir_cliente = mm_brief.get("direttive_cliente", "")
        print(f"[VE] Direttive nel brief: {len(dir_cliente)} caratteri", flush=True)
        dir_block   = f"⚠️ DIRETTIVE CLIENTE [OBBLIGATORIE]:\n{dir_cliente}\n\n" if dir_cliente else ""

        # Estrai regole TSX dallo Style DNA se presente
        stile_nome = mm_brief.get("stile_rilevato")
        if stile_nome:
            try:
                profilo_json = style_library.carica_profilo(stile_nome)
                if profilo_json and profilo_json.get("regole_tsx"):
                    style_dna_tsx = profilo_json["regole_tsx"]
                    print(f"[VE] Style DNA TSX caricato per '{stile_nome}': {list(style_dna_tsx.keys())}", flush=True)
            except Exception as _e:
                print(f"[VE] Errore caricamento Style DNA TSX: {_e}", flush=True)

        style_dna_block = ""
        if style_dna_tsx:
            anim_ok = ", ".join(style_dna_tsx.get("animazioni_permesse", []))
            anim_no = ", ".join(style_dna_tsx.get("animazioni_vietate",  []))
            style_dna_block = f"""
╔══════════════════════════════════════════════════════════════╗
║  STYLE DNA TSX — REGOLE OBBLIGATORIE                        ║
╚══════════════════════════════════════════════════════════════╝

⚠️ QUESTI VALORI SOVRASCRIVONO QUALSIASI DEFAULT.
Crea theme.ts con ESATTAMENTE questi valori. NON hardcodare colori o font nei componenti.

backgroundColor:  {style_dna_tsx.get('backgroundColor', '#0a0a0a')}
textPrimary:      {style_dna_tsx.get('textPrimary',    '#ffffff')}
textSecondary:    {style_dna_tsx.get('textSecondary',   '#aaaaaa')}
accent:           {style_dna_tsx.get('accent',          '#39FF14')}
accent2:          {style_dna_tsx.get('accent2',         '#ffffff')}
fontTitle:        {style_dna_tsx.get('fontTitle',       'Orbitron')}
fontSubtitle:     {style_dna_tsx.get('fontSubtitle',    'Montserrat')}
fontSizeTitle:    {style_dna_tsx.get('fontSizeTitle',   '72px')}
fontSizeBody:     {style_dna_tsx.get('fontSizeBody',    '36px')}
fontSizeSub:      {style_dna_tsx.get('fontSizeSub',     '24px')}
fontWeight:       {style_dna_tsx.get('fontWeight',      '900')}
spring_preset:    {style_dna_tsx.get('spring_preset',   'standard')}
Animazioni PERMESSE: {anim_ok or '—'}
Animazioni VIETATE:  {anim_no or '—'}
Elementi decorativi: {style_dna_tsx.get('elementi_decorativi', '—')}
Layout:              {style_dna_tsx.get('layout', 'centrato')}
Note obbligatorie:   {style_dna_tsx.get('note_obbligatorie', '—')}

"""
        mm_ve_note = (
            f"{dur_constraint}{dir_block}{style_dna_block}"
            f"ISTRUZIONI MARKETING MANAGER: {mm_brief.get('istruzioni_video_editor','')}\n"
            f"ANGOLO: {mm_brief.get('angolo','')}\n"
            f"EMOZIONE TARGET: {mm_brief.get('target',{}).get('stato_emotivo','')}\n"
        )
    elif dur_constraint:
        mm_ve_note = dur_constraint

    src_dir      = os.path.join(VIDEO_EDITOR_PATH, "src")
    total_frames = round(duration * 30)   # BUG FIX 1: round() invece di int() per evitare drift
    hook_frames  = int(total_frames * 0.10)
    body_frames  = int(total_frames * 0.70)
    cta_frames   = total_frames - hook_frames - body_frames

    audio_note = ""
    if audio_path and os.path.exists(audio_path):
        audio_filename = os.path.basename(audio_path)
        audio_note = f"\nAUDIO VOICEOVER: file '{audio_filename}' salvato in public/ — usa <Audio src={{staticFile('{audio_filename}')}} /> nel MainVideo.tsx"

    # Contesto condiviso incluso in ogni prompt per-file
    # ── Detecta se è una chiamata di modifiche post-approvazione ────────────
    is_modifiche = "MODIFICHE RICHIESTE:" in (brief or "")
    if is_modifiche:
        modifiche_testo = (brief or "").split("MODIFICHE RICHIESTE:", 1)[-1].strip()
        modifiche_block = f"""
╔══════════════════════════════════════════════════════════════╗
║  MODIFICHE OBBLIGATORIE — PRIORITÀ ASSOLUTA                 ║
╚══════════════════════════════════════════════════════════════╝

{modifiche_testo}

⚠️ REGOLA: applica ESATTAMENTE queste modifiche.
Se contraddicono regole default (font, colori, animazioni) → le MODIFICHE PREVALGONO SEMPRE.
Non chiedere, non ignorare, non interpretare: esegui letteralmente.

"""
    else:
        modifiche_block = ""

    brief_note = f"\nNOTE AGGIUNTIVE: {brief}\n" if (brief and not is_modifiche) else ""

    # ── Carica timeline Whisper da public/ se disponibile ─────────────────────
    timeline_note = ""
    _tl_path = os.path.join(VIDEO_EDITOR_PATH, "public", "timeline.json")
    if os.path.exists(_tl_path):
        try:
            with open(_tl_path, encoding="utf-8") as _f:
                _tl_data = json.load(_f)
            timeline_note = f"\nTIMELINE WHISPER (word-level timestamps — OBBLIGATORIA per sync):\n{json.dumps(_tl_data, ensure_ascii=False)}\n"
            print(f"[VE] Timeline caricata: {len(_tl_data)} segmenti", flush=True)
        except Exception:
            pass

    ctx_block = f"""CONTESTO VIDEO:
DURATA: {duration}s = {total_frames} frame @ 30fps | FORMATO: 1080x1920 (9:16)
PALETTE COLORI: {colors}
FONT: {fonts}
{mm_ve_note}{audio_note}{brief_note}{timeline_note}
SCRIPT COMPLETO:
{script_txt}

RETENTION CURVE:
{curve_risks}
RE-ENGAGEMENT a: {reeng}
DIRETTIVE STRATEGIST: {directives}"""

    # ── Costruisce FILE_SPECS dinamicamente da sections ──────────────────────
    def _parse_timing(t_str):
        """'00:03-00:10' → frames (start, duration)"""
        try:
            parts = t_str.split('-')
            def to_sec(s):
                m, sec = s.strip().split(':')
                return int(m) * 60 + float(sec)
            start_f = int(to_sec(parts[0]) * 30)
            end_f   = int(to_sec(parts[1]) * 30)
            return start_f, max(30, end_f - start_f)
        except Exception:
            return None, None

    def _scene_name(idx, section):
        """Scene01_Hook, Scene02_Shock, etc."""
        label = re.sub(r'[^a-zA-Z0-9]', '', (section.get('e') or 'Body').capitalize())
        return f"Scene{idx:02d}_{label}"

    def _emotion_style(emotion):
        e = (emotion or '').lower()
        if e == 'shock':
            return "Pattern Interrupt: spring aggressive (damping:6 stiffness:300), testo esplode da centro, glitch overlay, sfondo nero o rosso scuro"
        elif e == 'curiosity':
            return "Typewriter lettera per lettera, spring standard (damping:12), sfondo scuro, colore accent sui termini chiave"
        elif e == 'desire':
            return "Glow pulsante su testo, scale lenta 1→1.05, spring soft (damping:18), sfondo gradient verde scuro"
        elif e == 'trust':
            return "Slide in dall'alto, spring soft (damping:18), sfondo body blu stabile, testo centrato grande"
        elif e == 'urgency':
            return "Pulse loop infinito (interpolate(frame%30,...)), spring cta (damping:8), sfondo CTA rosso brillante"
        else:
            return "Spring standard (damping:12 stiffness:150), fade in, sfondo body"

    # Calcola frame reali da timing sezioni
    scene_specs = []
    for i, sec in enumerate(sections):
        start_f, dur_f = _parse_timing(sec.get('t', ''))
        if dur_f is None:
            # fallback proporzionale
            dur_f = max(60, total_frames // max(1, len(sections)))
        scene_specs.append({
            'idx':    i + 1,
            'name':   _scene_name(i + 1, sec),
            'frames': dur_f,
            'voiceover': sec.get('v', ''),
            'emotion':   sec.get('e', 'standard'),
            'rhythm':    sec.get('r', 'medium'),
            'timing':    sec.get('t', ''),
            'style':     _emotion_style(sec.get('e', '')),
        })

    # BUG FIX 1: se abbiamo la durata audio esatta, total_frames_real = esattamente quella
    # NON sommare i frame delle scene (piccoli errori di arrotondamento si accumulano)
    if audio_dur_sec:
        total_frames_real = round(audio_dur_sec * 30)
        # Riscala le scene proporzionalmente per non sforare
        scene_sum = sum(s['frames'] for s in scene_specs) or 1
        if scene_sum != total_frames_real:
            scale = total_frames_real / scene_sum
            for s in scene_specs:
                s['frames'] = max(30, round(s['frames'] * scale))
            # Aggiusta l'ultima scena per assorbire residuo da arrotondamento
            delta = total_frames_real - sum(s['frames'] for s in scene_specs)
            if scene_specs:
                scene_specs[-1]['frames'] = max(30, scene_specs[-1]['frames'] + delta)
            print(f"[VE] Frame scene riscalati → totale {total_frames_real}", flush=True)
    else:
        total_frames_real = sum(s['frames'] for s in scene_specs) or total_frames

    # Imports e durations per MainVideo
    scene_imports = "\n".join(
        f"import {{ {s['name']} }} from './scenes/{s['name']}';"
        for s in scene_specs
    )
    scene_sequences = "\n".join(
        f"      <Series.Sequence durationInFrames={{{s['frames']}}}>\n"
        f"        <{s['name']} />\n"
        f"      </Series.Sequence>"
        for s in scene_specs
    )
    theme_durations = "\n".join(
        f"    scene{s['idx']:02d}: {s['frames']},"
        for s in scene_specs
    )

    audio_import = ""
    audio_tag = "// nessun audio"
    if audio_path and os.path.exists(audio_path):
        audio_filename = os.path.basename(audio_path)
        audio_import   = ", Audio, staticFile"
        audio_tag      = f"<Audio src={{staticFile('{audio_filename}')}} />"
        audio_note     = f"\nAUDIO VOICEOVER: '{audio_filename}' in public/ — includi <Audio> nel MainVideo FUORI da <Series>"

    FILE_SPECS = []

    # 0. utils/syncTimeline.ts — helper per sync audio-visual
    _utils_dir = os.path.join(src_dir, "utils")
    os.makedirs(_utils_dir, exist_ok=True)
    FILE_SPECS.append({
        "name": "utils/syncTimeline.ts",
        "path": os.path.join(_utils_dir, "syncTimeline.ts"),
        "spec": """File di utility per sincronizzare animazioni con i timestamp Whisper.
Scrivi ESATTAMENTE questo codice (nessuna variazione):

export const secondsToFrame = (seconds: number, fps: number): number =>
  Math.round(seconds * fps);

export const segmentToFrameRange = (
  segment: { start: number; end: number },
  fps: number
): { from: number; durationInFrames: number } => ({
  from: Math.round(segment.start * fps),
  durationInFrames: Math.max(1, Math.round((segment.end - segment.start) * fps)),
});

export const wordToFrame = (
  word: { start: number; end: number },
  fps: number
): { from: number; durationInFrames: number } => ({
  from: Math.round(word.start * fps),
  durationInFrames: Math.max(1, Math.round((word.end - word.start) * fps)),
});

export type WhisperWord    = { word: string; start: number; end: number };
export type WhisperSegment = { id: number; start: number; end: number; text: string; words?: WhisperWord[] };
export type WhisperTimeline = WhisperSegment[];
"""
    })

    # 1. theme.ts — valori dallo Style DNA se disponibile, altrimenti default VideoCraft
    _bg        = style_dna_tsx.get("backgroundColor", "#0a0a0a")         if style_dna_tsx else "#0a0a0a"
    _text      = style_dna_tsx.get("textPrimary",    "#ffffff")          if style_dna_tsx else "#ffffff"
    _accent    = style_dna_tsx.get("accent",          "#39FF14")         if style_dna_tsx else "#39FF14"
    _accent2   = style_dna_tsx.get("accent2",         "#ffffff")         if style_dna_tsx else "#ffffff"
    _font_main = style_dna_tsx.get("fontTitle",       "Orbitron")        if style_dna_tsx else "Orbitron"
    _font_acc  = style_dna_tsx.get("fontSubtitle",    "AlfenaPixel")     if style_dna_tsx else "AlfenaPixel"
    _sz_hero   = style_dna_tsx.get("fontSizeTitle",   "72px")            if style_dna_tsx else "72px"
    _sz_body   = style_dna_tsx.get("fontSizeBody",    "36px")            if style_dna_tsx else "36px"
    _sz_sub    = style_dna_tsx.get("fontSizeSub",     "24px")            if style_dna_tsx else "24px"
    _weight    = style_dna_tsx.get("fontWeight",      "900")             if style_dna_tsx else "900"
    _spring    = style_dna_tsx.get("spring_preset",   "standard")        if style_dna_tsx else "standard"
    _spring_note = f"// Spring preset Style DNA: {_spring}" if style_dna_tsx else "// Spring preset: default VideoCraft"

    FILE_SPECS.append({
        "name": "theme.ts",
        "path": os.path.join(src_dir, "theme.ts"),
        "spec": f"""Esporta `export const THEME` con struttura completa.
{"⚠️ STYLE DNA ATTIVO — usa ESATTAMENTE i valori sotto (estratti dallo Style DNA):" if style_dna_tsx else "Usa i valori default VideoCraft:"}

- colors.bg:         "{_bg}"
- colors.text:       "{_text}"
- colors.accent:     "{_accent}"
- colors.accent2:    "{_accent2}"
- colors.muted:      "rgba(255,255,255,0.6)"
- colors.hook:       prendi da PALETTE COLORI nel contesto
- colors.body:       "{_bg}"
- colors.cta:        "{_bg}"
- fonts.main:        "{_font_main}"
- fonts.accent:      "{_font_acc}"
- fonts.sizeHero:    "{_sz_hero}"
- fonts.sizeBody:    "{_sz_body}"
- fonts.sizeSub:     "{_sz_sub}"
- fonts.weightBlack: {_weight}
- durations: {{ {theme_durations} total: {total_frames_real} }}
- springs: {{ aggressive: {{damping:6,stiffness:300}}, standard: {{damping:12,stiffness:150}}, soft: {{damping:18,stiffness:120}}, cta: {{damping:8,stiffness:220}} }}  {_spring_note}
- anchor: {{ height: 3, color: "{_accent}", glow: "0 0 10px {_accent}, 0 0 20px {_accent}" }}
Nessun componente React. Solo `export const THEME = {{...}} as const`. Minimo 40 righe."""
    })

    # 2. Una scena per sezione
    os.makedirs(os.path.join(src_dir, "scenes"), exist_ok=True)
    for s in scene_specs:
        is_first = s['idx'] == 1
        is_last  = s['idx'] == len(scene_specs)
        role = "HOOK — pattern interrupt, ferma lo scroll" if is_first else \
               "CTA — elemento più brillante del video, pulse loop" if is_last else \
               f"SCENA {s['idx']} — {s['emotion']}"

        FILE_SPECS.append({
            "name": f"scenes/{s['name']}.tsx",
            "path": os.path.join(src_dir, "scenes", f"{s['name']}.tsx"),
            "spec": f"""Componente React Remotion: {role}
TIMING: {s['timing']} = {s['frames']} frame
VOICEOVER ESATTO: "{s['voiceover']}"
EMOZIONE: {s['emotion']} · RITMO: {s['rhythm']}
STILE ANIMAZIONE: {s['style']}

REGOLE:
- NOME EXPORT OBBLIGATORIO ESATTO: `export const {s['name']}: React.FC = () => {{` — nessuna variazione
- import da 'remotion': useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Easing
- import THEME da '../theme'
- import {{ secondsToFrame, segmentToFrameRange, wordToFrame }} from '../utils/syncTimeline'
- MAX 3-4 PAROLE CHIAVE su schermo (estrai dal voiceover) — font grande 80-140px Orbitron 900
- Voiceover testuale → barra sottile bottom (height 40px, font 22px) — subordinata al grafico
- Ancora visiva: barra neon {s['frames']}f verde bottom (THEME.anchor)
- Fade out ultimi 8 frame: interpolate(frame,[{s['frames']}-8,{s['frames']}],[1,0],{{extrapolateLeft:'clamp',extrapolateRight:'clamp'}})
- MAX 2 elementi grafici animati con FUNZIONE NARRATIVA SPECIFICA — NON aggiungere cerchi, linee, scan-line o glitch decorativi senza scopo. Zero decorazioni gratuite.
- inputRange STRETTAMENTE crescente

⚠️ SYNC AUDIO — REGOLE OBBLIGATORIE (se TIMELINE WHISPER è nel contesto):
- Identifica i segmenti Whisper che coprono il voiceover di questa scena
- Aggiungi commento in cima: // Segmenti [N-M]: "{s['voiceover'][:60]}" [start_s - end_s]
- Per ogni sotto-sequenza interna usa segmentToFrameRange() oppure wordToFrame() — MAI calcolare frame a mano
  const {{ from, durationInFrames }} = segmentToFrameRange(seg, fps);  // poi usa questi valori
- I sottotitoli: from=secondsToFrame(segment.start, fps) — scaleX a 0 → 1 in durationInFrames frame
- Keyword animate: from=secondsToFrame(word.start, fps) relativo all'inizio scena
  (localFrame = absoluteFrame - sceneStartFrame, dove sceneStartFrame = secondsToFrame(seg_start_scena, fps))
- MAI stimare i frame "a occhio" — usa SEMPRE i timestamp dalla timeline
- Ogni valore `durationInFrames` DEVE essere > 0 (segmentToFrameRange garantisce Math.max(1,...))
{'- Spring aggressive damping:6 stiffness:300 — entrata esplosiva da fuori frame o scala 0→1.05→1' if is_first else ''}
{'- Pulse loop: interpolate(frame%30,[0,15,30],[1,1.05,1]) — watermark "VideoCraft Studio" bottom-right opacity:0.4' if is_last else ''}
Minimo {'80' if is_first else '60' if is_last else '70'} righe TypeScript/React reale, zero placeholder."""
        })

    # 3. MainVideo.tsx
    FILE_SPECS.append({
        "name": "MainVideo.tsx",
        "path": os.path.join(src_dir, "MainVideo.tsx"),
        "spec": f"""Componente orchestratore — compone {len(scene_specs)} scene in sequenza.
import {{ Series, AbsoluteFill{audio_import} }} from 'remotion'
{scene_imports}
import {{ THEME }} from './theme'

{audio_tag}

<Series>
{scene_sequences}
</Series>

Frame totali: {total_frames_real}
Minimo 40 righe TypeScript/React reale."""
    })

    # 4. Root.tsx
    # Istruzione durata esplicita per Root.tsx (BUG FIX 1)
    root_dur_note = ""
    if audio_dur_sec:
        root_dur_note = (
            f"\n⚠️ VINCOLO ASSOLUTO: durationInFrames DEVE essere ESATTAMENTE {total_frames_real} "
            f"(= {audio_dur_sec:.2f}s × 30fps). NON usare valori diversi. "
            f"Il video altrimenti sarà più lungo dell'audio."
        )
    FILE_SPECS.append({
        "name": "Root.tsx",
        "path": os.path.join(src_dir, "Root.tsx"),
        "spec": f"""File di registrazione Remotion.
import {{ registerRoot, Composition }} from 'remotion'
import {{ MainVideo }} from './MainVideo'
durationInFrames={total_frames_real}, fps=30, width=1080, height=1920
registerRoot(RemotionRoot)
{root_dur_note}
Minimo 20 righe TypeScript/React reale."""
    })

    MIN_FILE_SIZE = 1500
    salvati: list[str] = []
    summary_parts: list[str] = []
    progress_scene: list[str] = []   # stato progressivo per Telegram

    def _build_prompt(nome, file_path, spec_text, retry_note=""):
        return f"""COMPITO: Scrivi SOLO il file `{nome}`. Un singolo file, nient'altro.

{modifiche_block}{ctx_block}

━━━ SPECIFICA {nome} ━━━
{spec_text}
{retry_note}

ISTRUZIONE OBBLIGATORIA:
Usa il tool Write per scrivere il file completo in questo percorso ESATTO:
{file_path}

REGOLE TECNICHE (cedono a DIRETTIVE CLIENTE e MODIFICHE OBBLIGATORIE se in conflitto):
- Scrivi codice TypeScript/React COMPLETO e funzionante — zero placeholder
- NON scrivere "// ... rest of component" o simili — codice reale tutto
- inputRange di interpolate() STRETTAMENTE crescente, mai valori uguali
- Solo API Remotion standard: useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Series, Audio, staticFile, Easing
- Nessuna libreria esterna
- FONT default: usa i font del THEME (main=Orbitron, accent=AlfenaPixel) — sostituiscili se DIRETTIVE CLIENTE o MODIFICHE specificano font diversi
- COLORI default: usa i colori del THEME, accent=#39FF14 — sostituiscili se DIRETTIVE CLIENTE o MODIFICHE specificano colori diversi
- ⚠️ DESIGN: VIDEO GRAFICO — max 3-4 PAROLE per schermo, font grandi (80-140px). Il testo verbale lungo va SOLO nella barra sottotitoli in basso, piccolo (22px). Se non è specificato nello Style DNA o nelle direttive cliente, NON aggiungere elementi decorativi. Nel dubbio, lascia lo sfondo pulito con solo il testo. Meno elementi = meglio. Lo stile viene dallo Style DNA, non dalla tua creatività.
- ⚠️ TIMING AUDIO-SYNC: Tutti i valori di frame numerici DEVONO essere proporzionali a {total_frames_real} frame totali. NON valori hardcoded che assumono 750 frame. Formula base: frame = Math.round(secondi * fps).
- ⚠️ SYNC WHISPER OBBLIGATORIO: Se la TIMELINE WHISPER è nel CONTESTO VIDEO, usala SEMPRE. Importa {{ secondsToFrame, segmentToFrameRange, wordToFrame }} from '../utils/syncTimeline'. REGOLE: (1) ogni sotto-sequenza interna usa segmentToFrameRange(seg, fps) o wordToFrame(word, fps) — MAI calcolare frame a mano; (2) il risultato ha {{ from, durationInFrames }} — usa entrambi; (3) durationInFrames deve essere sempre > 0; (4) aggiungi commento in cima a ogni componente con i segmenti Whisper coperti e i timestamp.
- ⚠️ EASING — nomi ESATTI validi in Remotion: Easing.linear, Easing.ease, Easing.quad, Easing.cubic, Easing.sin (NON .sine), Easing.exp (NON .expo), Easing.circle, Easing.bounce, Easing.bezier(x1,y1,x2,y2), Easing.in/out/inOut(fn). MAI usare Easing.sine o Easing.expo (non esistono → undefined → TypeError). Easing va SOLO come parametro easing: dentro interpolate(), mai chiamato standalone. Import: import {{interpolate, Easing}} from 'remotion'"""

    # ── Pass 1: genera tutti i file con delay 15s tra un file e l'altro ─────────
    for file_index, spec in enumerate(FILE_SPECS):
        nome      = spec["name"]
        file_path = spec["path"]

        # Delay anti-rate-limit: 15s tra un file e l'altro (non prima del primo)
        if file_index > 0:
            print(f"[VE] ⏳ Attesa 15s prima di generare {nome}...", flush=True)
            await asyncio.sleep(15)

        for tentativo in range(2):
            # Delay aggiuntivo 30s prima di ogni retry
            if tentativo > 0:
                print(f"[VE] ⏳ Retry: attesa 30s prima di rigenerare {nome}...", flush=True)
                await asyncio.sleep(30)

            retry_note = (
                f"\n⚠️ RETRY #{tentativo+1}: il file precedente era solo "
                f"{os.path.getsize(file_path) if os.path.exists(file_path) else 0} bytes — "
                "scrivi TUTTO il codice reale, non usare placeholder o commenti come '// ...'."
            ) if tentativo > 0 else ""

            prompt = _build_prompt(nome, file_path, spec['spec'], retry_note)

            print(f"[VE] Generazione {nome} (tentativo {tentativo+1}/2)...", flush=True)
            await lancia_agente_cli("video-editor", prompt)

            # Verifica dimensione file scritto su disco
            size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            if size >= MIN_FILE_SIZE:
                print(f"[VE] ✅ {nome}: {size} bytes", flush=True)
                if file_path not in salvati:
                    salvati.append(file_path)
                summary_parts.append(f"{nome}:{size}B")
                # Telegram progress per le scene
                if nome.startswith("scenes/"):
                    progress_scene.append(f"✅ {os.path.basename(nome)}: {size}B")
                    if notify_fn:
                        try:
                            await notify_fn("🎬 Scene generate:\n" + " | ".join(progress_scene))
                        except Exception:
                            pass
                break
            else:
                print(f"[VE] ⚠️ {nome}: {size} bytes < {MIN_FILE_SIZE} — {'retry' if tentativo == 0 else 'accetto comunque'}", flush=True)
                if tentativo == 1:
                    if os.path.exists(file_path) and size > 0:
                        salvati.append(file_path)
                    summary_parts.append(f"{nome}:{size}B⚠️")
                    if nome.startswith("scenes/"):
                        progress_scene.append(f"⚠️ {os.path.basename(nome)}: {size}B")

    # ── Pass 2: secondo tentativo per file ancora vuoti (delay 30s per file) ────
    vuoti_pass2 = [
        s for s in FILE_SPECS
        if not os.path.exists(s["path"]) or os.path.getsize(s["path"]) == 0
    ]
    if vuoti_pass2:
        vuoti_names = [os.path.basename(s["name"]) for s in vuoti_pass2]
        print(f"[VE] ⚠️ Pass2 — {len(vuoti_pass2)} file vuoti: {vuoti_names}", flush=True)
        if notify_fn:
            try:
                await notify_fn(
                    f"⚠️ {len(vuoti_pass2)} file vuoti dopo pass 1 — riprovo:\n"
                    + ", ".join(vuoti_names)
                )
            except Exception:
                pass

        for spec in vuoti_pass2:
            nome      = spec["name"]
            file_path = spec["path"]
            print(f"[VE] ⏳ Pass2 retry {nome}: attesa 30s...", flush=True)
            await asyncio.sleep(30)

            retry_note = (
                "\n⚠️ RETRY FORZATO (file era 0 bytes) — scrivi TUTTO il codice reale, "
                "zero placeholder, zero commenti tipo '// ...'."
            )
            prompt = _build_prompt(nome, file_path, spec['spec'], retry_note)
            print(f"[VE] Pass2 Generazione {nome}...", flush=True)
            await lancia_agente_cli("video-editor", prompt)

            size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            if size >= MIN_FILE_SIZE:
                print(f"[VE] ✅ Pass2 OK {nome}: {size} bytes", flush=True)
                if file_path not in salvati:
                    salvati.append(file_path)
                # Aggiorna summary: sostituisci entry ⚠️ con entry OK
                for i, part in enumerate(summary_parts):
                    if part.startswith(nome + ":"):
                        summary_parts[i] = f"{nome}:{size}B(retry2)"
                        break
                else:
                    summary_parts.append(f"{nome}:{size}B(retry2)")
                if nome.startswith("scenes/"):
                    progress_scene.append(f"✅ {os.path.basename(nome)}: {size}B (retry)")
                    if notify_fn:
                        try:
                            await notify_fn("🎬 Scene (dopo retry):\n" + " | ".join(progress_scene))
                        except Exception:
                            pass
            else:
                print(f"[VE] ✗ Pass2 fallito {nome}: ancora {size} bytes", flush=True)
                if not any(p.startswith(nome + ":") for p in summary_parts):
                    summary_parts.append(f"{nome}:{size}B✗")

    # ── Calcola file ancora vuoti dopo entrambi i pass ──────────────────────────
    ancora_vuoti = [
        (s["path"], s["name"]) for s in FILE_SPECS
        if not os.path.exists(s["path"]) or os.path.getsize(s["path"]) == 0
    ]
    if ancora_vuoti:
        nomi_vuoti = [n for _, n in ancora_vuoti]
        msg_vuoti = f"❌ Impossibile generare: {', '.join(nomi_vuoti)}. Verifica manualmente."
        print(f"[VE] {msg_vuoti}", flush=True)
        if notify_fn:
            try:
                await notify_fn(msg_vuoti)
            except Exception:
                pass

    summary = "VE per-file: " + " | ".join(summary_parts)
    print(f"[VE] Completato — {len(salvati)}/{len(FILE_SPECS)} file salvati | ancora vuoti: {len(ancora_vuoti)}", flush=True)
    return salvati, summary, ancora_vuoti

# ══════════════════════════════════════════════════════════════════════════════
#  TSX extraction + render
# ══════════════════════════════════════════════════════════════════════════════

def estrai_e_salva_file_tsx(output_agente):
    # ── DEBUG: stampa il contenuto grezzo ricevuto ────────────────────────────
    print("\n[TSX DEBUG] ══════ RAW OUTPUT ══════", flush=True)
    print(f"[TSX DEBUG] Lunghezza totale: {len(output_agente)} chars", flush=True)
    print(f"[TSX DEBUG] Contiene ```tsx        : {'```tsx' in output_agente}", flush=True)
    print(f"[TSX DEBUG] Contiene ```typescript : {'```typescript' in output_agente}", flush=True)
    print(f"[TSX DEBUG] Contiene ```javascript : {'```javascript' in output_agente}", flush=True)
    print(f"[TSX DEBUG] Contiene // src/       : {'// src/' in output_agente}", flush=True)
    print(f"[TSX DEBUG] Contiene .tsx          : {'.tsx' in output_agente}", flush=True)
    print(f"[TSX DEBUG] Contiene import React  : {'import React' in output_agente}", flush=True)
    # Stampa i primi 2000 chars per vedere il formato reale
    print(f"[TSX DEBUG] ── Prime 2000 chars ──\n{output_agente[:2000]}", flush=True)
    print("[TSX DEBUG] ══════════════════════\n", flush=True)

    trovati = {}

    # Se l'output sembra JSON (il codice è escaped dentro una stringa JSON),
    # prova a deserializzare e recupera campi 'code', 'tsx', 'files'
    if output_agente.strip().startswith('{') or output_agente.strip().startswith('['):
        try:
            parsed = json.loads(output_agente.strip())
            print(f"[TSX DEBUG] Output è JSON — chiavi: {list(parsed.keys()) if isinstance(parsed, dict) else 'array'}", flush=True)
            # Cerca campi contenenti codice TSX
            for key in ('code', 'tsx', 'files', 'source', 'content'):
                val = parsed.get(key, '') if isinstance(parsed, dict) else ''
                if val and ('import' in val or 'export' in val):
                    trovati['MainVideo.tsx'] = val
            # Gestisci struttura {"files": {"Root.tsx": "...", ...}}
            if 'files' in (parsed if isinstance(parsed, dict) else {}):
                files_dict = parsed['files']
                if isinstance(files_dict, dict):
                    trovati.update(files_dict)
        except Exception:
            pass

    # Pattern 1: // src/NomeFile.tsx come prima riga dentro il blocco
    for m in re.finditer(
        r'```(?:tsx|typescript|javascript|js|ts)[^\n]*\n[ \t]*//[ \t]*([\w./\-]+\.tsx?)[ \t]*\n([\s\S]*?)```',
        output_agente
    ):
        nome = m.group(1).strip()
        trovati[nome] = m.group(2).strip()
        print(f"[TSX DEBUG] Pattern1 match: {nome}", flush=True)

    # Pattern 2: intestazione markdown ### NomeFile.tsx o **NomeFile.tsx**
    for m in re.finditer(
        r'(?:#{1,3}\s*\*{0,2})([\w./\-]+\.tsx?)(?:\*{0,2})\s*\n```(?:tsx|typescript|javascript|js|ts)[^\n]*\n([\s\S]*?)```',
        output_agente
    ):
        nome = m.group(1).strip()
        if nome not in trovati:
            trovati[nome] = m.group(2).strip()
            print(f"[TSX DEBUG] Pattern2 match: {nome}", flush=True)

    # Pattern 3: nome file su riga sola (con o senza backtick inline)
    for m in re.finditer(
        r'\n`{0,1}([\w./\-]+\.tsx?)`{0,1}\s*\n```(?:tsx|typescript|javascript|js|ts)[^\n]*\n([\s\S]*?)```',
        output_agente
    ):
        nome = m.group(1).strip()
        if nome not in trovati:
            trovati[nome] = m.group(2).strip()
            print(f"[TSX DEBUG] Pattern3 match: {nome}", flush=True)

    # Pattern 4: blocco con commento // File: NomeFile.tsx dentro
    for m in re.finditer(
        r'```(?:tsx|typescript|javascript|js|ts)[^\n]*\n([\s\S]*?)```',
        output_agente
    ):
        codice = m.group(1)
        # Cerca un commento con nome file nelle prime 3 righe del blocco
        prime_righe = codice.split('\n')[:3]
        nome_trovato = None
        for riga in prime_righe:
            fm = re.search(r'(?://|/\*)\s*(?:File:|file:)?\s*([\w./\-]+\.tsx?)', riga)
            if fm:
                nome_trovato = fm.group(1).strip()
                break
        if nome_trovato and nome_trovato not in trovati:
            trovati[nome_trovato] = codice.strip()
            print(f"[TSX DEBUG] Pattern4 match: {nome_trovato}", flush=True)

    # Fallback finale: prendi TUTTI i blocchi di codice e assegna nomi sequenziali
    if not trovati:
        print("[TSX DEBUG] Nessun pattern matchato — uso fallback sequenziale", flush=True)
        tutti_blocchi = re.findall(
            r'```(?:tsx|typescript|javascript|js|ts)[^\n]*\n([\s\S]*?)```',
            output_agente
        )
        print(f"[TSX DEBUG] Blocchi codice trovati: {len(tutti_blocchi)}", flush=True)
        nomi_default = ["Root.tsx", "MainVideo.tsx", "theme.ts",
                        "Scene01.tsx", "Scene02.tsx", "Scene03.tsx"]
        for i, codice in enumerate(tutti_blocchi[:6]):
            nome = nomi_default[i] if i < len(nomi_default) else f"Scene{i:02d}.tsx"
            trovati[nome] = codice.strip()
            print(f"[TSX DEBUG] Fallback blocco {i} → {nome} ({len(codice)} chars)", flush=True)

    if not trovati:
        print("[TSX DEBUG] ✗ ZERO file trovati. Nessun blocco codice riconoscibile.", flush=True)
        return []

    print(f"[TSX DEBUG] File da salvare: {list(trovati.keys())}", flush=True)

    # ── Salva i file fisicamente ──────────────────────────────────────────────
    salvati = []
    for nome_file, codice in trovati.items():
        # Normalizza il percorso
        nome_file = nome_file.lstrip('/')
        if not nome_file.startswith("src/"):
            nome_file = f"src/{nome_file}"

        percorso = os.path.join(VIDEO_EDITOR_PATH, nome_file)
        os.makedirs(os.path.dirname(percorso), exist_ok=True)

        with open(percorso, "w", encoding="utf-8") as f:
            f.write(codice)

        if os.path.exists(percorso) and os.path.getsize(percorso) > 0:
            salvati.append(percorso)
            print(f"[TSX] ✓ SALVATO: {percorso} ({os.path.getsize(percorso)} bytes)", flush=True)
        else:
            print(f"[TSX] ✗ ERRORE scrittura: {percorso}", flush=True)

    return salvati

def _pre_render_sync_check(audio_dur_sec: float | None, expected_frames: int | None) -> list[str]:
    """
    Verifica sincronizzazione prima del render.
    Controlla: file 0B, durationInFrames in Root.tsx vs durata audio, Sequence con valori ≤ 0.
    Ritorna lista di warning (vuota = tutto ok).
    Entries con prefisso '❌ BLOCCO:' indicano errori che devono bloccare il render.
    """
    warns = []

    # ── Check 1: Root.tsx esiste e non è vuoto ────────────────────────────────
    root_path = os.path.join(VIDEO_EDITOR_PATH, "src", "Root.tsx")
    if not os.path.exists(root_path):
        warns.append("❌ BLOCCO: Root.tsx non trovato")
        print("[PreRender] ❌ Root.tsx non trovato", flush=True)
        return warns
    root_size = os.path.getsize(root_path)
    if root_size == 0:
        warns.append("❌ BLOCCO: Root.tsx è vuoto (0B) — generazione fallita")
        print("[PreRender] ❌ Root.tsx è 0B", flush=True)
        return warns

    # ── Check 2: scene 0B ─────────────────────────────────────────────────────
    scenes_dir = os.path.join(VIDEO_EDITOR_PATH, "src", "scenes")
    scene_vuote = []
    if os.path.exists(scenes_dir):
        for fname in sorted(os.listdir(scenes_dir)):
            if not fname.endswith(".tsx"):
                continue
            fsize = os.path.getsize(os.path.join(scenes_dir, fname))
            if fsize == 0:
                scene_vuote.append(fname)
    if scene_vuote:
        warns.append(
            f"❌ BLOCCO: {len(scene_vuote)} scene vuote (0B): {', '.join(scene_vuote)}"
        )
        print(f"[PreRender] ❌ {len(scene_vuote)} scene 0B: {scene_vuote}", flush=True)

    # ── Check 3: durationInFrames in Root.tsx ────────────────────────────────
    try:
        root_content = open(root_path, encoding="utf-8", errors="replace").read()
        m = re.search(r'durationInFrames[=:\s{]+(\d+)', root_content)
        if m:
            root_frames = int(m.group(1))
            print(f"[PreRender] Root.tsx durationInFrames={root_frames}", flush=True)
            if expected_frames and abs(root_frames - expected_frames) > 2:
                warns.append(
                    f"❌ durationInFrames Root.tsx={root_frames} vs atteso={expected_frames} "
                    f"(audio={audio_dur_sec:.1f}s×30fps) — Δ={abs(root_frames - expected_frames)} frame"
                )
        else:
            warns.append("⚠️ durationInFrames non trovato in Root.tsx")
    except Exception as _e:
        warns.append(f"⚠️ Lettura Root.tsx fallita: {_e}")

    # ── Check 4: scene per durationInFrames ≤ 0 o from < 0 ──────────────────
    if os.path.exists(scenes_dir):
        for fname in sorted(os.listdir(scenes_dir)):
            if not fname.endswith(".tsx"):
                continue
            fpath = os.path.join(scenes_dir, fname)
            if os.path.getsize(fpath) == 0:
                continue  # già segnalato in check 2
            try:
                content = open(fpath, encoding="utf-8", errors="replace").read()
                for bad_m in re.finditer(r'durationInFrames=\{(-?\d+)\}', content):
                    val = int(bad_m.group(1))
                    if val <= 0:
                        warns.append(f"❌ {fname}: durationInFrames={val} ≤ 0")
                for bad_m in re.finditer(r'\bfrom=\{(-\d+)\}', content):
                    val = int(bad_m.group(1))
                    warns.append(f"❌ {fname}: from={val} < 0")
            except Exception:
                pass

    if warns:
        blocchi = [w for w in warns if w.startswith("❌ BLOCCO:")]
        print(f"[PreRender] ⚠️ {len(warns)} warning ({len(blocchi)} bloccanti)", flush=True)
    else:
        print("[PreRender] ✅ Sync check OK", flush=True)
    return warns


def render_video():
    os.makedirs(os.path.join(VIDEO_EDITOR_PATH, "out"), exist_ok=True)
    # ── Step 1: TypeScript type-check prima del render ────────────────────────
    try:
        tsc_result = subprocess.run(
            "npx tsc --noEmit",
            cwd=VIDEO_EDITOR_PATH, capture_output=True,
            timeout=120, shell=True, encoding="utf-8", errors="replace"
        )
        if tsc_result.returncode != 0:
            print(f"[Render] ⚠️ TypeScript warnings (non bloccanti):\n{tsc_result.stderr[:400]}", flush=True)
        else:
            print("[Render] ✅ TypeScript check OK", flush=True)
    except subprocess.TimeoutExpired:
        print("[Render] ⚠️ tsc timeout — procedo comunque", flush=True)
    except Exception as e:
        print(f"[Render] ⚠️ tsc error: {e} — procedo comunque", flush=True)
    # ── Step 2: Render ────────────────────────────────────────────────────────
    try:
        result = subprocess.run(
            "npx remotion render src/Root.tsx MainVideo out/video.mp4",
            cwd=VIDEO_EDITOR_PATH, capture_output=True,
            timeout=600, shell=True, encoding="utf-8", errors="replace"
        )
        print(f"[Render] {result.stdout[-300:]}", flush=True)
        if result.returncode != 0:
            print(f"[Render] STDERR: {result.stderr[-300:]}", flush=True)
        if os.path.exists(VIDEO_OUTPUT_PATH):
            size_mb = os.path.getsize(VIDEO_OUTPUT_PATH) / (1024 * 1024)
            print(f"✅ Video: {size_mb:.1f} MB", flush=True)
            return VIDEO_OUTPUT_PATH
        return None
    except subprocess.TimeoutExpired:
        print("⚠️ Timeout render", flush=True)
        return None
    except Exception as e:
        print(f"❌ Render: {e}", flush=True)
        return None

# ══════════════════════════════════════════════════════════════════════════════
#  Remotion Studio preview + render confermato
# ══════════════════════════════════════════════════════════════════════════════

async def esegui_pubblicazione(update, ctx, state: dict, chat_id: int | None = None):
    """Pubblica il video già approvato: aggiorna dashboard e invia al topic Output."""
    chat_id = chat_id or update.message.chat_id
    salvati          = state["salvati"]
    agenti_eseguiti  = state["agenti_eseguiti"]
    testo            = state["testo"]
    output_thread_id = state["output_thread_id"]
    mm_thread_id     = state["mm_thread_id"]
    dashboard_card_id= state["dashboard_card_id"]
    video_path       = state["video_path"]

    size_mb = os.path.getsize(video_path) / (1024 * 1024)
    if dashboard_card_id:
        dashboard_save_video(video_path, dashboard_card_id)
        dashboard_step(dashboard_card_id, "video-remotion", "done",
                       f"Video {size_mb:.1f} MB — {len(salvati)} file TSX")
        dashboard_step(dashboard_card_id, "review", "done", "Approvato — pubblicazione avviata.")
        dashboard_step(dashboard_card_id, "pubblicazione", "active", "In pubblicazione.")
    if output_thread_id:
        await ctx.bot.send_message(chat_id=chat_id, message_thread_id=output_thread_id,
                                   text=f"🎯 {' → '.join(agenti_eseguiti)}")
        with open(video_path, "rb") as vf:
            await ctx.bot.send_video(chat_id=chat_id, message_thread_id=output_thread_id,
                                     video=vf, caption=testo[:80])
    # ── Notion: crea riga in Contabilità Mensile ─────────────────────────────
    mm_brief       = state.get("mm_brief") or {}
    script_json    = state.get("script_json") or {}
    # Estrai nome cliente: prima da mm_brief, poi dal titolo dello script
    cliente_notion = (mm_brief.get("cliente") or mm_brief.get("client") or
                      script_json.get("client") or "VideoCraft Studio")
    # Costo AI totale accumulato dagli agenti durante la pipeline
    costo_ai = _costi_pipeline.pop(dashboard_card_id, 0.0) if dashboard_card_id else 0.0
    notion_url = notion_push_produzione(
        card_id     = dashboard_card_id or "manual",
        cliente     = cliente_notion,
        costo_ai_usd= costo_ai,
        note        = testo[:500],
    )
    if mm_thread_id:
        notion_note = f"\n📊 [Notion →]({notion_url})" if notion_url else ""
        await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                   text=f"✅ Video {size_mb:.1f} MB pubblicato → topic Output{notion_note}",
                                   parse_mode="Markdown")
    print(f"[Pubblicazione] Video pubblicato: {video_path}", flush=True)

    # ── SMM Publisher — Upload-Post ───────────────────────────────────────────
    smm_thread_id = get_thread_id_by_name("smm publisher")

    async def _notify_smm(msg: str):
        """Invia notifica al topic SMM Publisher (e fallback al MM)."""
        target_thread = smm_thread_id or mm_thread_id
        if target_thread:
            try:
                await ctx.bot.send_message(
                    chat_id=chat_id, message_thread_id=target_thread,
                    text=msg, parse_mode="Markdown"
                )
            except Exception as e:
                print(f"[SMM] Errore notifica Telegram: {e}", flush=True)

    # Estrai dati dal brief per la pubblicazione
    mm_brief_data = state.get("mm_brief") or {}
    script_data   = state.get("script_json") or {}
    cover_path    = state.get("cover_path")          # opzionale — settato da Cover Designer
    scheduled_date = mm_brief_data.get("scheduled_date")  # ISO-8601 o None

    # ── Captions per-piattaforma dal Copywriter ───────────────────────────────
    # script_json["captions"] = {instagram, tiktok, youtube_title,
    #                             youtube_description, linkedin, facebook}
    raw_captions = script_data.get("captions") or {}
    platform_captions = {}
    for plat in ("instagram", "tiktok", "linkedin", "facebook"):
        cap = raw_captions.get(plat, "")
        if cap:
            platform_captions[plat] = cap
    # YouTube usa youtube_description come body caption
    yt_desc = raw_captions.get("youtube_description", "")
    if yt_desc:
        platform_captions["youtube"] = yt_desc

    # Title: preferisce youtube_title (SEO), fallback a hook, fallback a testo
    hook_text      = script_data.get("hook", "")
    youtube_title  = raw_captions.get("youtube_title", "")
    caption_default = testo[:1000] if testo else ""
    title = youtube_title or hook_text or caption_default

    # Mostra piattaforme + anteprima caption nel notify
    plat_cfg   = smm_publisher.get_client_config(cliente_notion)
    plat_attive = plat_cfg.get("platforms", []) if plat_cfg else []
    cap_preview = ""
    if platform_captions and plat_attive:
        cap_lines = []
        for p in plat_attive:
            cap = platform_captions.get(p, "")
            if cap:
                cap_lines.append(f"  _{p}_: {cap[:80]}{'…' if len(cap)>80 else ''}")
        if cap_lines:
            cap_preview = "\n" + "\n".join(cap_lines)

    await _notify_smm(
        f"📤 *SMM Publisher* — avvio pubblicazione\n"
        f"Cliente: `{cliente_notion}`\n"
        f"Video: `{os.path.basename(video_path)}`\n"
        f"Piattaforme: {', '.join(f'`{p}`' for p in plat_attive) if plat_attive else '_non configurate_'}"
        + (f"\n⏰ Scheduled: `{scheduled_date}`" if scheduled_date else "")
        + cap_preview
    )

    smm_result = await smm_publisher.publish_with_retry(
        video_path        = video_path,
        client_name       = cliente_notion,
        title             = title,
        cover_path        = cover_path,
        platform_captions = platform_captions if platform_captions else None,
        scheduled_date    = scheduled_date,
        notify_callback   = _notify_smm,
        register_webhook  = True,
    )

    if smm_result.get("ok"):
        platforms_str = ", ".join(smm_result.get("platforms", []))
        req_id        = smm_result.get("request_id") or "—"
        job_id        = smm_result.get("job_id") or "—"
        ok_msg = (
            f"✅ *SMM Publisher*: upload inviato a Upload-Post!\n"
            f"Piattaforme: `{platforms_str}`\n"
            f"request\\_id: `{req_id}`"
            + (f"\njob\\_id: `{job_id}`" if job_id != "—" else "")
            + ("\n_Riceverai conferma via webhook quando la pubblicazione è completata._"
               if smm_publisher.WEBHOOK_URL else
               "\n⚠️ _Webhook non configurata — imposta UPLOAD\\_POST\\_WEBHOOK\\_URL per conferme real-time._")
        )
        await _notify_smm(ok_msg)
        if dashboard_card_id:
            dashboard_step(dashboard_card_id, "pubblicazione", "done",
                           f"Pubblicato su {platforms_str} — req_id={req_id}")
    else:
        err = smm_result.get("error", "errore sconosciuto")
        if dashboard_card_id:
            dashboard_step(dashboard_card_id, "pubblicazione", "error",
                           f"SMM Publisher fallito: {err[:150]}")

async def applica_modifiche(update, ctx, state: dict, modifiche: str):
    """Applica modifiche testuali ai file TSX e ri-renderizza il video."""
    chat_id       = update.message.chat_id
    mm_thread_id  = state.get("mm_thread_id")
    ve_thread_id  = state.get("ve_thread_id")
    dashboard_card_id = state.get("dashboard_card_id")

    notify_thread = ve_thread_id or mm_thread_id
    if notify_thread:
        await ctx.bot.send_message(chat_id=chat_id, message_thread_id=notify_thread,
                                   text=f"🔧 Applico modifiche: {modifiche[:200]}\n⏳ Re-render in corso...")

    # Ri-chiama il Video Editor con le modifiche come brief aggiuntivo
    brief_modifiche = f"{state.get('brief_compresso', '')}\n\nMODIFICHE RICHIESTE: {modifiche}"

    async def _mod_notify(msg: str):
        if notify_thread:
            try:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=notify_thread, text=msg)
            except Exception:
                pass

    salvati_new, ve_summary, _mod_ancora_vuoti = await chiama_video_editor(
        state.get("script_json"),
        state.get("strategy_json"),
        state.get("visual_json"),
        brief_modifiche,
        tsx_pre_saved=state.get("salvati"),
        mm_brief=state.get("mm_brief"),
        audio_path=_ultimo_audio_path,
        pipeline_id=state.get("pipeline_id"),   # PROBLEMA 4 FIX: preserva pipeline_id
        notify_fn=_mod_notify,
    )
    salvati_new = salvati_new or state.get("salvati", [])

    # Pre-render sync check (re-render path)
    _mod_audio_dur = state.get("audio_dur_sec")
    _mod_exp_frames = round(_mod_audio_dur * 30) if _mod_audio_dur else None
    _mod_sync_warns = _pre_render_sync_check(_mod_audio_dur, _mod_exp_frames)
    _mod_blocchi = [w for w in _mod_sync_warns if w.startswith("❌ BLOCCO:")]
    if _mod_sync_warns:
        _msw_msg = "⚠️ PRE-RENDER SYNC:\n" + "\n".join(_mod_sync_warns)
        try:
            if notify_thread:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=notify_thread, text=_msw_msg)
        except Exception:
            pass

    # Blocca re-render se ci sono file 0B
    if _mod_blocchi:
        msg = (
            "❌ Re-render bloccato: file 0B rilevati.\n"
            + "\n".join(_mod_blocchi)
            + "\n\nVerifica i file TSX e riprova."
        )
        if notify_thread:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=notify_thread, text=msg)
        return

    # Re-render
    video_path = render_video()
    if not video_path:
        msg = "⚠️ Re-render fallito dopo modifiche. Controlla i file TSX."
        if notify_thread:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=notify_thread, text=msg)
        return

    size_mb = os.path.getsize(video_path) / (1024 * 1024)
    # Aggiorna stato e rimanda video nel topic Video Editor per nuova approvazione
    new_state = {**state, "salvati": salvati_new, "video_path": video_path}
    _pending_approval[chat_id] = new_state

    # ── POST-RENDER VISUAL CHECK (STEP 4) — anche su re-render ───────────────
    send_thread_mod = ve_thread_id or mm_thread_id
    stile_attivo_mod = (state.get("mm_brief") or {}).get("stile_rilevato")
    style_note_mod   = ""
    if stile_attivo_mod:
        style_note_mod = await _visual_check_post_render(
            video_path, stile_attivo_mod, chat_id, ctx, send_thread_mod
        )

    cap_base = f"🎬 Video aggiornato ({size_mb:.1f} MB){style_note_mod}"
    keyboard = _keyboard_post_pipeline()

    if ve_thread_id:
        with open(video_path, "rb") as vf:
            await ctx.bot.send_video(
                chat_id=chat_id, message_thread_id=ve_thread_id,
                video=vf, caption=cap_base, reply_markup=keyboard,
            )
    elif mm_thread_id:
        with open(video_path, "rb") as vf:
            await ctx.bot.send_video(
                chat_id=chat_id, message_thread_id=mm_thread_id,
                video=vf, caption=cap_base, reply_markup=keyboard,
            )
    print(f"[Modifiche] Re-render completato: {video_path}", flush=True)

# ══════════════════════════════════════════════════════════════════════════════
#  MARKETING MANAGER BRAIN — Pensiero strategico pre-pipeline
# ══════════════════════════════════════════════════════════════════════════════

# ── Client default style — CRUD ───────────────────────────────────────────────

def _client_defaults_path() -> str:
    return os.path.join(BASE_PATH, "client_defaults.json")

def _carica_client_defaults() -> dict:
    path = _client_defaults_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _salva_client_defaults(data: dict):
    with open(_client_defaults_path(), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _get_client_default_style(chat_id: int) -> str | None:
    """Ritorna il nome dello stile default per questo cliente, o None."""
    entry = _carica_client_defaults().get(str(chat_id))
    if not entry:
        return None
    nome = entry.get("style")
    # Verifica che lo stile esista ancora su disco
    if nome and style_library.stile_esiste(nome):
        return nome
    return None

def _set_client_default_style(chat_id: int, nome_stile: str):
    defaults = _carica_client_defaults()
    defaults[str(chat_id)] = {
        "style":  nome_stile,
        "set_at": datetime.now().isoformat(),
    }
    _salva_client_defaults(defaults)

def _remove_client_default_style(chat_id: int) -> bool:
    """Rimuove il default. Ritorna True se esisteva."""
    defaults = _carica_client_defaults()
    key = str(chat_id)
    if key in defaults:
        del defaults[key]
        _salva_client_defaults(defaults)
        return True
    return False


def _rileva_stile_nel_testo(testo: str) -> tuple[str, str] | None:
    """
    Cerca menzioni di stili salvati nella Style Library all'interno del testo.
    Matching case-insensitive su nome stile e sue varianti (spazi, underscore rimossi).
    Ritorna (nome_stile, profilo_txt) al primo match, None se nessuno trovato.
    """
    if not testo:
        return None
    try:
        stili = style_library.lista_stili()
    except Exception:
        return None
    if not stili:
        return None

    testo_norm = testo.lower()
    for s in stili:
        nome = s["nome"]                          # es. "mrino_neon"
        varianti = {
            nome.lower(),                         # "mrino_neon"
            nome.lower().replace("_", " "),       # "mrino neon"
            nome.lower().replace("_", ""),        # "mrinoneon"
        }
        for v in varianti:
            if v in testo_norm:
                txt = style_library.carica_profilo_txt(nome)
                if txt:
                    print(f"[MM Brain] 🎨 Stile rilevato nel testo: '{nome}'", flush=True)
                    return nome, txt
    return None


async def chiama_marketing_manager_brain(
    brief: str,
    direttive: str = "",
    audio_dur_sec: float | None = None,
    chat_id: int | None = None,
) -> tuple:
    """
    Il Marketing Manager analizza il brief e decide TUTTO:
    angolo, hook, struttura narrativa, istruzioni specifiche per ogni agente.
    Gli agenti eseguono — il MM pensa.
    Ritorna (mm_brief_dict, raw_output).

    direttive:    testo scritto dall'utente nel messaggio — PRIORITÀ ASSOLUTA.
    chat_id:      usato per caricare lo stile default del cliente se non menzionato.
    """
    # ── Rilevamento stile dalla Style Library ─────────────────────────────────
    # Priorità: 1) menzione esplicita nel testo  2) default cliente  3) nessuno
    stile_rilevato_nome = None
    stile_fonte         = None    # "testo" | "default"
    sezione_stile       = ""

    match = _rileva_stile_nel_testo(f"{direttive} {brief}")
    if match:
        stile_rilevato_nome, stile_txt = match
        stile_fonte = "testo"
    elif chat_id:
        nome_default = _get_client_default_style(chat_id)
        if nome_default:
            stile_txt = style_library.carica_profilo_txt(nome_default)
            if stile_txt:
                stile_rilevato_nome = nome_default
                stile_fonte = "default"
                print(f"[MM Brain] 🎨 Stile default cliente applicato: '{nome_default}'", flush=True)

    if stile_rilevato_nome:
        if stile_fonte == "testo":
            label     = f'STYLE DNA ATTIVATO — "{stile_rilevato_nome}"'
            attivazione = f'Il cliente ha menzionato lo stile "{stile_rilevato_nome}" nel suo messaggio.'
        else:
            label     = f'STYLE DNA DEFAULT CLIENTE — "{stile_rilevato_nome}"'
            attivazione = (
                f'Questo è lo stile predefinito di questo cliente ("{stile_rilevato_nome}").\n'
                f'Applicalo automaticamente — il cliente non ha menzionato uno stile specifico.'
            )
        sezione_stile = f"""
╔══════════════════════════════════════════════════════════╗
║  {label:<56}║
╚══════════════════════════════════════════════════════════╝

{attivazione}
Questo è il profilo visivo estratto dalla Style Library — usalo come guida visiva
principale per TUTTE le decisioni di produzione.

{stile_txt}

⚠️  REGOLE STILE:
• Ogni parametro (palette, tipografia, layout, animazioni, densità) va rispettato
• Trasmetti il nome dello stile "{stile_rilevato_nome}" e i suoi parametri chiave
  VERBATIM nelle istruzioni a tutti gli agenti downstream
• Se ci sono direttive cliente che confliggono → le direttive cliente vincono
• Imposta "{stile_rilevato_nome}" nel campo "stile_rilevato" del JSON output

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"""

    # Sezione durata audio — vincolo tecnico PRIORITARIO (BUG FIX 1)
    sezione_durata = ""
    if audio_dur_sec:
        exact_frames = round(audio_dur_sec * 30)
        sezione_durata = f"""
╔══════════════════════════════════════════════════════════╗
║  DURATA AUDIO — VINCOLO TECNICO ASSOLUTO                 ║
╚══════════════════════════════════════════════════════════╝

⚠️ L'audio vocale dura ESATTAMENTE {audio_dur_sec:.2f} secondi ({exact_frames} frame @ 30fps).
Il video DEVE avere questa durata esatta — né un secondo in più, né uno in meno.
• Imposta durata_consigliata_sec = {audio_dur_sec:.1f} nel tuo JSON output
• La struttura narrativa deve coprire TUTTI i {audio_dur_sec:.1f}s senza spazio residuo
• Non aggiungere "respiro" finale — il video finisce con l'audio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"""

    # Sezione direttive — mostrata sempre, con sezione dedicata se presenti
    if direttive:
        sezione_direttive = f"""
╔══════════════════════════════════════════════════════════╗
║  DIRETTIVE CLIENTE — PRIORITÀ ASSOLUTA                  ║
╚══════════════════════════════════════════════════════════╝

{direttive}

⚠️  REGOLA CRITICA: queste direttive sovrascrivono QUALSIASI tua decisione creativa.
• Se specificano uno stile visivo → usalo esattamente
• Se specificano font, colori, animazioni → rispettali alla lettera
• Se dicono cosa NON fare → non farlo
• Se indicano riferimenti visivi → trasmettili identici agli agenti downstream
• Riporta ogni direttiva VERBATIM nel campo "direttive_cliente" del JSON output
• Ogni istruzione per agenti downstream DEVE iniziare citando le direttive vincolanti
• Imposta "direttive_stato": "presente" nel JSON output

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"""
    else:
        sezione_direttive = """
╔══════════════════════════════════════════════════════════╗
║  DIRETTIVE CLIENTE                                       ║
╚══════════════════════════════════════════════════════════╝

ℹ️  Nessuna direttiva specifica ricevuta — usa la style guide default di Videocraft Studio.
• Stile visivo: segui il brand identity standard (Orbitron/AlfenaPixel, palette neon)
• Creatività: libera scelta dell'angolo e del mood visivo
• Imposta "direttive_stato": "assente" nel JSON output
• Il campo "direttive_cliente" sarà stringa vuota nel JSON output

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"""

    prompt = f"""Sei il Marketing Manager Brain. Hai ricevuto un messaggio dal cliente composto da due sezioni distinte.

SEZIONE 1 — DIRETTIVE: istruzioni su COME produrre il video (stile, vincoli, preferenze).
SEZIONE 2 — CONTENUTO: il materiale raw del cliente (trascrizione audio, testi, info da comunicare).

Queste due sezioni hanno ruoli DIVERSI e non vanno mai confuse:
• Le DIRETTIVE dicono COME → si applicano alla produzione, non al messaggio
• Il CONTENUTO dice COSA → è il materiale grezzo da trasformare in video

{sezione_durata}{sezione_stile}{sezione_direttive}
━━━ CONTENUTO TRASCRITTO — materiale raw da elaborare ━━━
{brief}

Questo è il COSA del video: argomento, narrativa, informazioni da comunicare al pubblico.
NON confonderlo con le direttive: il contenuto non è un'istruzione di produzione.

Il tuo compito è PENSARE e DECIDERE tutto prima che la pipeline parta.
Dopo di te, Copywriter, Strategist, Cover Designer e Video Editor ESEGUONO senza prendere decisioni creative proprie.

━━━ FASE 1 — ANALISI TARGET ━━━
Chi è il target esatto? Descrivi:
- Profilo demografico e psicografico
- Dolore primario (il problema che tiene sveglio la notte)
- Desiderio profondo (cosa vuole veramente)
- Stato emotivo quando vede il video nel feed
- Obiezione principale che lo blocca dall'agire

━━━ FASE 2 — RICERCA TREND ━━━
Usa WebSearch per trovare:
- I 3 video/reel più virali nella nicchia degli ultimi 30 giorni
- Quale angolo usano (curiosity/paura/trasformazione/prova sociale/contrarian)
- Cosa nei primissimi secondi li fa fermare lo scroll
Sintesi in 3 righe: "Cosa funziona ORA in questa nicchia"

━━━ FASE 3 — ANGOLO DI MARKETING ━━━
Scegli l'angolo più potente tra questi (uno solo, il più efficace per questo brief):
• Curiosity Gap — "La cosa che nessuno ti dice su X"
• Inversione Attesa — "Tutti fanno X, ma è sbagliato — fai questo"
• Trasformazione Rapida — "Da X a Y in N ore/giorni"
• Paura di Perdere (FOMO) — "Se non fai X adesso, succede Y"
• Rivelazione Insider — "Il segreto che i migliori usano e non condividono"
• Specificity Shock — "Come ho fatto [risultato molto specifico] con [condizione sorprendente]"
• Identità/Tribù — "Se sei [X], devi sapere questo"
Motiva la scelta in 2 righe.

━━━ FASE 4 — HOOK DEFINITIVO ━━━
Scrivi il hook esatto: max 10 parole, impatto immediato in 1.5 secondi.
Specifica:
- Testo esatto del hook
- Trigger psicologico attivato (curiosità/paura/desiderio/identità/urgenza)
- Perché funziona su questo target specifico

━━━ FASE 5 — STRUTTURA NARRATIVA COMPLETA ━━━
Progetta ogni segmento del video con precisione chirurgica:
Definisci cosa succede a ogni step, l'emozione da attivare, il testo chiave e le note visive.
Struttura: HOOK (0-3s) → PROBLEMA (3-8s) → AGITAZIONE (8-15s) → SOLUZIONE (15-30s) → PROVA SOCIALE (30-38s) → CTA (38-45s)

━━━ FASE 6 — ISTRUZIONI AGENTI ━━━
Scrivi istruzioni vincolanti e precise per ogni agente della pipeline.
IMPORTANTE: gli agenti eseguono esattamente quello che scrivi qui — non pensano da soli.

━━━ OUTPUT JSON ━━━
Restituisci SOLO questo JSON (parseable da json.loads, zero testo fuori):
{{
  "angolo": "nome dell'angolo scelto",
  "angolo_motivo": "perché questo angolo per questo target (2 righe)",
  "target": {{
    "profilo": "chi è",
    "dolore": "problema primario",
    "desiderio": "cosa vuole",
    "stato_emotivo": "come si sente nel feed",
    "obiezione": "cosa lo blocca"
  }},
  "trend_insights": "cosa funziona ora in questa nicchia (3 righe dalla ricerca)",
  "hook_testo": "il hook esatto — max 10 parole",
  "hook_trigger": "curiosity|paura|desiderio|identità|urgenza",
  "hook_motivo": "perché questo hook funziona",
  "struttura_narrativa": [
    {{"timing": "0-3s", "tipo": "HOOK", "testo_chiave": "...", "emozione": "...", "note_visive": "..."}}
  ],
  "durata_consigliata_sec": 45,
  "stile_rilevato": "nome_stile se rilevato dalla Style Library — null se nessuno stile menzionato",
  "direttive_stato": "presente|assente — indica se il cliente ha fornito direttive specifiche",
  "direttive_cliente": "Copia VERBATIM le direttive del cliente (SEZIONE 1) — stringa vuota se assenti. Non mescolare con il contenuto trascritto. Questo campo viene propagato identico a tutti gli agenti.",
  "istruzioni_copywriter": "Istruzioni precise e vincolanti derivate dall'analisi del CONTENUTO TRASCRITTO. Usa questo hook esatto '[hook_testo]', segui questa sequenza emotiva, rispetta questi timing, scrivi questi testi chiave per ogni sezione. NON cambiare l'angolo scelto. Se stile_rilevato non null: STILE '[stile_rilevato]' attivo — rispetta mood, palette e registro linguistico dello stile. Se direttive_stato=presente: [ripeti direttive_cliente — OBBLIGATORIE]. Se direttive_stato=assente e stile_rilevato null: applica style guide Videocraft default.",
  "istruzioni_strategist": "Istruzioni per retention e TSX derivate dall'analisi del CONTENUTO TRASCRITTO. Quali sezioni sono a rischio dropout e come fixarle, timing re-engagement, direttive tecniche con valori numerici, stile animazioni per ogni sezione. Se stile_rilevato non null: STILE '[stile_rilevato]' attivo — rispetta il ritmo e le animazioni definite nel DNA. Se direttive_stato=presente: [ripeti direttive_cliente — OBBLIGATORIE]. Se direttive_stato=assente e stile_rilevato null: applica style guide Videocraft default.",
  "istruzioni_cover_designer": "Brief visivo completo derivato dall'analisi del CONTENUTO TRASCRITTO. Stile dominante per questa nicchia, palette colori efficace per questo target, tipo di thumbnail che funziona (formula estratta dai trend), font e mood. Se stile_rilevato non null: STILE '[stile_rilevato]' attivo — usa ESATTAMENTE la palette e tipografia del DNA. Se direttive_stato=presente: [ripeti direttive_cliente — OBBLIGATORIE]. Se direttive_stato=assente e stile_rilevato null: applica style guide Videocraft default.",
  "istruzioni_video_editor": "Ritmo montaggio, velocità transizioni, effetti specifici per hook, energia visiva per sezione, elementi grafici obbligatori — tutto derivato dal CONTENUTO TRASCRITTO. Se stile_rilevato non null: STILE '[stile_rilevato]' attivo — usa ESATTAMENTE palette, tipografia, elementi grafici e note tecniche del DNA. Se direttive_stato=presente: [ripeti direttive_cliente — OBBLIGATORIE]. Se direttive_stato=assente e stile_rilevato null: applica style guide Videocraft default.",
  "cta_finale": "testo CTA esatto — specifica, urgente, con beneficio immediato"
}}"""

    raw = await lancia_agente_cli("marketing-manager", prompt, MODEL_SONNET)
    mm_brief = parse_json_safe(raw)
    if mm_brief:
        stile_log = f" stile='{mm_brief.get('stile_rilevato','null')}'" if mm_brief.get('stile_rilevato') else ""
        print(f"[MM Brain] ✅ angolo='{mm_brief.get('angolo','')}' hook='{mm_brief.get('hook_testo','')}'{stile_log}", flush=True)
    else:
        print(f"[MM Brain] ⚠️ JSON non parseable — uso brief grezzo come fallback", flush=True)
    return mm_brief, raw

# ══════════════════════════════════════════════════════════════════════════════
#  Pipeline decision — keyword matching, 0 token
# ══════════════════════════════════════════════════════════════════════════════

def decidi_pipeline_locale(testo):
    keywords_completa = {"carosello", "slide", "cover", "thumbnail", "copertina",
                         "immagine statica", "grafica", "carousel"}
    if any(k in testo.lower() for k in keywords_completa):
        return PIPELINE_COMPLETA, "Completa (Copy→Strategy→Cover→Video)"
    return PIPELINE_SEMPLICE, "Semplice (Copy→Strategy→Video)"

# ══════════════════════════════════════════════════════════════════════════════
#  Compressione trascrizione — locale, 0 token
# ══════════════════════════════════════════════════════════════════════════════

def comprimi_trascrizione(testo, max_chars=MAX_BRIEF):
    if len(testo) <= max_chars:
        return testo
    FILLER = {"allora","quindi","insomma","praticamente","cioè","tipo","diciamo",
               "ehm","mhm","ah","ok","bene","esatto","perfetto","diciamo","voglio","dire"}
    frasi = re.split(r'[.!?]+', testo)
    scored = []
    for f in frasi:
        f = f.strip()
        if len(f) < 10:
            continue
        words = f.lower().split()
        score = sum(1 for w in words if w not in FILLER and len(w) > 3)
        scored.append((score, f))
    scored.sort(reverse=True)
    result = ". ".join(f for _, f in scored[:8])
    return result[:max_chars] if result else testo[:max_chars]

# ══════════════════════════════════════════════════════════════════════════════
#  VISUAL CHECK POST-RENDER
# ══════════════════════════════════════════════════════════════════════════════

async def _visual_check_post_render(
    video_path: str,
    stile_nome: str,
    chat_id: int,
    ctx,
    thread_id: int | None,
) -> str:
    """
    Esegue il visual compliance check e manda il report su Telegram.
    Ritorna stringa di riepilogo (score) da appendere alla caption del video,
    oppure stringa vuota se il check viene saltato/fallisce.
    """
    if not ANTHROPIC_API_KEY:
        return ""
    profilo = style_library.carica_profilo(stile_nome)
    if not profilo:
        return ""

    try:
        result  = style_library.check_visual_compliance(video_path, profilo, n_frames=6)
        score   = result.get("score_globale", -1)
        report  = style_library.fmt_compliance_report(result, stile_nome)

        # Invia il report come messaggio separato nello stesso topic
        try:
            if thread_id:
                await ctx.bot.send_message(
                    chat_id=chat_id,
                    message_thread_id=thread_id,
                    text=report,
                    parse_mode="Markdown",
                )
            else:
                await ctx.bot.send_message(chat_id=chat_id, text=report, parse_mode="Markdown")
        except Exception as e:
            print(f"[VisualCheck] ⚠️ Impossibile inviare report: {e}", flush=True)

        if score >= 0:
            emoji = "🟢" if score >= 90 else "🟡" if score >= 75 else "🟠" if score >= 60 else "🔴"
            return f"\n{emoji} Style check: {score}/100 (stile: {stile_nome})"
        return ""

    except Exception as e:
        print(f"[VisualCheck] ❌ Errore: {e}", flush=True)
        return ""


# ══════════════════════════════════════════════════════════════════════════════
#  PIPELINE CAROSELLO
# ══════════════════════════════════════════════════════════════════════════════

def _keyboard_carosello_approvazione() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Approva e Pubblica ORA",  callback_data="carosello_pubblica"),
         InlineKeyboardButton("📅 Approva e Schedula",      callback_data="carosello_schedula")],
        [InlineKeyboardButton("✏️ Modifica",               callback_data="carosello_modifica"),
         InlineKeyboardButton("🗑 Scarta",                  callback_data="carosello_scarta")],
    ])


async def chiama_carousel_designer(
    brief: str,
    mm_brief: dict | None,
    direttive: str,
    card_id: str | None,
) -> tuple[dict | None, str]:
    """
    Chiama il Carousel Designer via Claude API.
    Ritorna (slides_dict, raw_response).
    """
    claude_md_path = os.path.join(BASE_PATH, "AGENTI", "carousel-designer", "CLAUDE.md")
    try:
        with open(claude_md_path, encoding="utf-8") as f:
            sys_prompt = f.read().strip()
    except Exception:
        sys_prompt = _SYS_STANDALONE.get("carousel-designer", "")

    # Recupera Style DNA
    style_json = ""
    style_path = os.path.join(BASE_PATH, "styles", "videocraft", "style_profile.json")
    try:
        with open(style_path, encoding="utf-8") as f:
            style_json = json.dumps(json.load(f), ensure_ascii=False)[:1500]
    except Exception:
        pass

    mm_info = ""
    if mm_brief:
        mm_info = (
            f"\nANGOLO SCELTO DAL MARKETING MANAGER: {mm_brief.get('angolo', '')}"
            f"\nHOOK: {mm_brief.get('hook_testo', '')}"
            f"\nISTRUZIONI CAROUSEL DESIGNER: {mm_brief.get('istruzioni_carousel_designer', '')}"
        )

    user_msg = (
        f"BRIEF: {brief[:800]}"
        f"{mm_info}"
        f"\nDIRETTIVE CLIENTE: {direttive[:400]}" if direttive else f"BRIEF: {brief[:800]}{mm_info}"
    )
    if style_json:
        user_msg += f"\n\nSTYLE DNA ATTIVO: {style_json}"

    try:
        raw, usage = await _anthropic_call(sys_prompt, user_msg, MODEL_SONNET, max_tokens=3000)
        cost = calcola_costo(MODEL_SONNET, usage)
        print(f"[CarouselDesigner] in:{usage.get('input_tokens',0)} "
              f"out:{usage.get('output_tokens',0)} → ${cost:.4f}", flush=True)
        if card_id:
            dashboard_agent_cost(card_id, "carousel-designer", "Carousel Designer", MODEL_SONNET, usage)

        # Estrai JSON dalla risposta
        raw_clean = raw.strip()
        start = raw_clean.find("{")
        if start != -1:
            slides_dict = json.loads(raw_clean[start:])
            return slides_dict, raw
        return None, raw
    except Exception as e:
        print(f"[CarouselDesigner] ✗ Errore: {e}", flush=True)
        return None, str(e)


async def chiama_copywriter_carosello(
    slides_dict: dict,
    mm_brief: dict | None,
    brief: str,
    card_id: str | None,
) -> tuple[dict | None, str]:
    """
    Chiama il Copywriter per generare solo la caption del carosello (non script video).
    Ritorna (caption_dict, raw).
    """
    topic   = slides_dict.get("topic", brief[:60])
    rubrica = slides_dict.get("rubrica", "")
    n_slide = slides_dict.get("n_slide", len(slides_dict.get("slides", [])))
    hook_mm = (mm_brief or {}).get("hook_testo", topic)
    cta_mm  = (mm_brief or {}).get("cta", "")

    user_msg = (
        f"Genera SOLO le caption per questo carosello Instagram. NON generare script video.\n\n"
        f"TOPIC: {topic}\n"
        f"RUBRICA: {rubrica}\n"
        f"N. SLIDE: {n_slide}\n"
        f"HOOK/TITOLO PRINCIPALE: {hook_mm}\n"
        f"CTA RUBRICA: {cta_mm}\n\n"
        f"Output JSON con questa struttura:\n"
        f'{{"instagram": "...", "facebook": "...", "tiktok": "...", '
        f'"hashtag_ig": ["#tag1", "#tag2"], "hashtag_tt": ["#tag1"]}}'
    )

    try:
        raw, usage = await _anthropic_call(_SYS_COPYWRITER, user_msg, MODEL_HAIKU, max_tokens=1200)
        cost = calcola_costo(MODEL_HAIKU, usage)
        print(f"[CopywriterCarosello] ${cost:.4f}", flush=True)
        if card_id:
            dashboard_agent_cost(card_id, "copywriter", "Copywriter", MODEL_HAIKU, usage)

        raw_clean = raw.strip()
        start = raw_clean.find("{")
        if start != -1:
            return json.loads(raw_clean[start:]), raw
        return None, raw
    except Exception as e:
        return None, str(e)


async def _genera_slide_images_subprocess(
    slides_dict: dict,
    output_dir: str,
) -> list[str]:
    """
    Chiama carousel_generator.py come subprocess.
    Ritorna lista di path PNG generati.
    """
    import tempfile
    # Salva JSON in un file temporaneo
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(slides_dict, tmp, ensure_ascii=False)
        tmp_path = tmp.name

    script_path = os.path.join(BASE_PATH, "carousel_generator.py")
    os.makedirs(output_dir, exist_ok=True)

    try:
        proc = subprocess.run(
            [sys.executable, script_path, tmp_path, output_dir],
            capture_output=True, text=True, timeout=300,
            encoding="utf-8"
        )
        print(f"[CarouselGen] stdout:\n{proc.stdout[-2000:]}", flush=True)
        if proc.returncode == 2:
            print(f"[CarouselGen] ✗ Errore fatale: {proc.stderr}", flush=True)
            return []

        # Leggi i path dall'output (righe che iniziano con "OUTPUT:")
        generated = []
        for line in proc.stdout.splitlines():
            if line.startswith("OUTPUT:"):
                path = line[7:].strip()
                if os.path.exists(path):
                    generated.append(path)
        return generated
    except subprocess.TimeoutExpired:
        print("[CarouselGen] ✗ Timeout", flush=True)
        return []
    except Exception as e:
        print(f"[CarouselGen] ✗ Errore subprocess: {e}", flush=True)
        return []
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


async def esegui_pipeline_carosello(
    update,
    ctx,
    testo: str,
    direttive: str,
):
    """
    Pipeline completa per caroselli:
    Marketing Manager → Carousel Designer → carousel_generator → Copywriter → Preview → Approva/Pubblica
    """
    import sys as _sys
    chat_id          = update.message.chat_id
    mm_thread_id     = get_thread_id_by_name("marketing manager")
    cd_thread_id     = get_thread_id_by_name("carousel designer")
    output_thread_id = get_thread_id_by_name("output finale")

    async def _notify(msg: str, thread_id: int | None = None):
        tid = thread_id or mm_thread_id
        if tid:
            try:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=tid, text=msg)
            except Exception:
                pass

    await _notify("🎨 *Pipeline Carosello avviata*", mm_thread_id)

    brief_compresso = comprimi_trascrizione(testo, MAX_BRIEF)

    # ── STEP 1: Marketing Manager Brain ──────────────────────────────────────
    await _notify("🧠 Marketing Manager — analisi brief...")
    mm_brief, mm_raw = await chiama_marketing_manager_brain(
        brief_compresso, direttive=direttive, audio_dur_sec=None, chat_id=chat_id
    )

    card_id = dashboard_new_card(
        testo[:60].strip().replace("\n", " "),
        (mm_brief or {}).get("hook_testo", brief_compresso[:80]),
        testo,
        PIPELINE_CAROSELLO,
        card_type="Carosello",
    )

    if mm_brief:
        await _notify(
            f"✅ Angolo: {mm_brief.get('angolo', '—')}\n"
            f"Hook: {mm_brief.get('hook_testo', '—')[:100]}"
        )

    # ── STEP 2: Carousel Designer ─────────────────────────────────────────────
    await _notify("🎴 Carousel Designer — struttura slide...")
    if cd_thread_id:
        await ctx.bot.send_message(
            chat_id=chat_id, message_thread_id=cd_thread_id,
            text=f"⚙️ Generazione slide JSON per: {brief_compresso[:150]}"
        )
    if card_id:
        dashboard_step(card_id, "slide-json", "in_progress")

    slides_dict, cd_raw = await chiama_carousel_designer(
        brief_compresso, mm_brief, direttive, card_id
    )

    if not slides_dict or not slides_dict.get("slides"):
        await _notify(f"⚠️ Carousel Designer non ha prodotto slide valide.\nRaw: {cd_raw[:300]}")
        if card_id:
            dashboard_step(card_id, "slide-json", "error", cd_raw[:200])
        return

    n_slide = len(slides_dict["slides"])
    await _notify(f"✅ {n_slide} slide strutturate — {slides_dict.get('topic', '')}")
    if card_id:
        dashboard_step(card_id, "slide-json", "done",
                       f"{n_slide} slide | {slides_dict.get('rubrica', '')}")

    if cd_thread_id:
        await ctx.bot.send_message(
            chat_id=chat_id, message_thread_id=cd_thread_id,
            text=f"🎴 Slide JSON pronto:\n{cd_raw[:2000]}"
        )

    # ── STEP 3: Genera immagini ───────────────────────────────────────────────
    month      = datetime.now().strftime("%Y-%m")
    output_dir = os.path.join(
        BASE_PATH, "AGENTI", "carousel-designer", "workspace",
        card_id or f"carosello_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )
    await _notify(f"🖼 Generazione {n_slide} slide (Ideogram + Pillow)...")

    slide_paths = await _genera_slide_images_subprocess(slides_dict, output_dir)

    if not slide_paths:
        await _notify("⚠️ Nessuna immagine generata. Controlla Ideogram API key e Pillow.")
        if card_id:
            dashboard_step(card_id, "brief-creativo", "error", "Generazione immagini fallita")
        return

    await _notify(f"✅ {len(slide_paths)}/{n_slide} immagini generate")

    # ── STEP 4: Copywriter — caption ─────────────────────────────────────────
    await _notify("✍️ Copywriter — generazione caption...")
    caption_dict, cw_raw = await chiama_copywriter_carosello(
        slides_dict, mm_brief, brief_compresso, card_id
    )
    if card_id:
        dashboard_step(card_id, "brief-creativo", "done",
                       (caption_dict or {}).get("instagram", cw_raw[:200]))

    caption_ig = (caption_dict or {}).get("instagram", f"#{slides_dict.get('topic', '')}")
    hashtag_ig = " ".join((caption_dict or {}).get("hashtag_ig", [])[:8])
    caption_full = f"{caption_ig}\n\n{hashtag_ig}".strip()

    # ── STEP 5: Preview su Telegram — album di immagini ──────────────────────
    await _notify("📤 Invio preview carosello...")

    preview_thread = cd_thread_id or mm_thread_id
    try:
        from telegram import InputMediaPhoto
        media_group = []
        for i, path in enumerate(slide_paths):
            with open(path, "rb") as img_f:
                img_bytes = img_f.read()
            cap = caption_full if i == 0 else None
            media_group.append(InputMediaPhoto(media=img_bytes, caption=cap))

        # Telegram: album max 10 immagini
        for chunk_start in range(0, len(media_group), 10):
            chunk = media_group[chunk_start:chunk_start + 10]
            if preview_thread:
                await ctx.bot.send_media_group(
                    chat_id=chat_id,
                    message_thread_id=preview_thread,
                    media=chunk,
                )
            else:
                await ctx.bot.send_media_group(chat_id=chat_id, media=chunk)

    except Exception as e:
        await _notify(f"⚠️ Errore invio album: {e}")
        # Fallback: invia singolarmente
        for path in slide_paths:
            try:
                with open(path, "rb") as img_f:
                    if preview_thread:
                        await ctx.bot.send_photo(
                            chat_id=chat_id, message_thread_id=preview_thread, photo=img_f
                        )
                    else:
                        await ctx.bot.send_photo(chat_id=chat_id, photo=img_f)
            except Exception:
                pass

    # ── Keyboard approvazione ─────────────────────────────────────────────────
    keyboard = _keyboard_carosello_approvazione()
    summary_msg = (
        f"🎨 *Carosello pronto* — {n_slide} slide\n"
        f"📌 Topic: {slides_dict.get('topic', '—')}\n"
        f"📚 Rubrica: {slides_dict.get('rubrica', '—')}\n\n"
        f"*Caption IG:*\n{caption_ig[:200]}{'...' if len(caption_ig) > 200 else ''}"
    )
    if preview_thread:
        await ctx.bot.send_message(
            chat_id=chat_id,
            message_thread_id=preview_thread,
            text=summary_msg,
            parse_mode="Markdown",
            reply_markup=keyboard,
        )
    else:
        await update.message.reply_text(summary_msg, parse_mode="Markdown",
                                        reply_markup=keyboard)

    # Aggiorna dashboard
    if card_id:
        dashboard_step(card_id, "review", "in_progress")
        dashboard_conclude_card(card_id, "In Approvazione")

    # Salva stato per approvazione
    _pending_carosello[chat_id] = {
        "slide_paths":       slide_paths,
        "slides_dict":       slides_dict,
        "caption_dict":      caption_dict,
        "caption_full":      caption_full,
        "mm_brief":          mm_brief,
        "brief":             brief_compresso,
        "card_id":           card_id,
        "output_dir":        output_dir,
        "mm_thread_id":      mm_thread_id,
        "cd_thread_id":      cd_thread_id,
        "output_thread_id":  output_thread_id,
    }
    print(f"[CarouselPipeline] Preview inviata — in attesa approvazione da chat {chat_id}", flush=True)


# ══════════════════════════════════════════════════════════════════════════════
#  PIPELINE PRINCIPALE
# ══════════════════════════════════════════════════════════════════════════════

async def processa_input(update: Update, ctx: ContextTypes.DEFAULT_TYPE, testo: str, topic_name: str, direttive: str = "", audio_dur_sec: float | None = None):
    chat_id          = update.message.chat_id
    mm_thread_id     = get_thread_id_by_name("marketing manager")
    output_thread_id = get_thread_id_by_name("output finale")
    print(f"[Topics] {carica_topics()}", flush=True)

    agente = None
    for chiave, cartella in TOPIC_AGENTI.items():
        if chiave in topic_name.lower():
            agente = cartella
            break

    if not agente:
        await update.message.reply_text("⚠️ Topic non riconosciuto.")
        return

    agenti_eseguiti = []

    # ── Pipeline carosello ────────────────────────────────────────────────────
    if agente == "carousel-designer":
        await esegui_pipeline_carosello(update, ctx, testo, direttive)
        return

    if agente == "video-editor":
        brief_compresso   = comprimi_trascrizione(testo, MAX_BRIEF)
        # PROBLEMA 4 FIX: ID univoco per ogni pipeline — usato per isolare i file del VE
        pipeline_id       = f"pipeline_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        pipeline_forzata, tipo = decidi_pipeline_locale(testo)

        # ── MARKETING MANAGER BRAIN — pensa prima che la pipeline parta ────────
        agenti_eseguiti.append("Marketing Manager")
        if mm_thread_id:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                       text="🧠 Marketing Manager — analisi brief in corso...")
        mm_brain_thread_id = get_thread_id_by_name("marketing manager")
        if mm_brain_thread_id:
            dir_nota = f"\n📋 Direttive cliente: {direttive[:150]}" if direttive else ""
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_brain_thread_id,
                                       text=f"⚙️ Analisi strategica: {brief_compresso[:200]}{dir_nota}")

        print(f"[MM] Direttive ricevute: {len(direttive)} caratteri", flush=True)
        mm_brief, mm_raw = await chiama_marketing_manager_brain(brief_compresso, direttive=direttive, audio_dur_sec=audio_dur_sec, chat_id=chat_id)

        if mm_brief:
            angolo    = mm_brief.get("angolo", "")
            hook_mm   = mm_brief.get("hook_testo", "")
            trend     = mm_brief.get("trend_insights", "")
            mm_summary = (
                f"✅ *Angolo scelto:* {angolo}\n"
                f"🎣 *Hook:* {hook_mm}\n"
                f"📊 *Trend nicchia:* {trend[:200]}"
            )
            if mm_thread_id:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                           text=mm_summary, parse_mode="Markdown")
            if mm_brain_thread_id:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_brain_thread_id,
                                           text=mm_raw[:3000])
        else:
            if mm_thread_id:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                           text="⚠️ MM Brain output non strutturato — pipeline continua con brief grezzo")

        if mm_thread_id:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                       text=f"🎬 Pipeline: {tipo}")

        # Crea card dashboard con angolo dal MM
        card_angle = (mm_brief or {}).get("angolo", "Da definire")
        dashboard_card_id = dashboard_new_card(
            testo[:60].strip().replace("\n", " "),
            (mm_brief or {}).get("hook_testo", brief_compresso),
            testo, pipeline_forzata
        )
        # Aggiorna il campo angle della card con quello del MM
        if dashboard_card_id:
            try:
                pipeline_path = os.path.join(DASHBOARD_DATA, "pipeline.json")
                with open(pipeline_path, encoding="utf-8") as f:
                    pdata = json.load(f)
                for card in pdata.get("cards", []):
                    if card["id"] == dashboard_card_id:
                        card["angle"] = card_angle
                        break
                with open(pipeline_path, "w", encoding="utf-8") as f:
                    json.dump(pdata, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        # PROBLEMA 4 FIX: scrivi manifest pipeline — il Video Editor lo verificherà
        # prima di renderizzare per evitare di usare dati orfani di pipeline precedenti
        try:
            os.makedirs(VIDEO_EDITOR_PATH, exist_ok=True)
            with open(os.path.join(VIDEO_EDITOR_PATH, "pipeline_current.json"), "w", encoding="utf-8") as _pmf:
                json.dump({
                    "id":          pipeline_id,
                    "hook":        (mm_brief or {}).get("hook_testo", brief_compresso[:80]),
                    "timestamp":   datetime.now().isoformat(),
                    "audio_path":  _ultimo_audio_path or "",
                    "dashboard_card_id": dashboard_card_id or "",
                }, _pmf, ensure_ascii=False, indent=2)
            print(f"[Pipeline] Manifest scritto: {pipeline_id}", flush=True)
        except Exception as _pme:
            print(f"[Pipeline] ⚠️ Manifest write fallito: {_pme}", flush=True)

        script_json        = None
        strategy_json      = None
        visual_json        = None
        tsx_skeleton_files = None
        step_map           = {"copywriter": "brief-creativo", "strategist": "strategia",
                              "cover-designer": "carosello",  "video-editor": "video-remotion"}

        # ── Imposta callback rate-limit per notifiche Telegram ────────────────
        global _rl_notify_cb
        async def _rl_cb(msg: str):
            try:
                if mm_thread_id:
                    await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id, text=msg)
                else:
                    await update.message.reply_text(msg)
            except Exception:
                pass
        _rl_notify_cb = _rl_cb

        for step, agente_corrente in enumerate(pipeline_forzata, 1):
            # PROBLEMA 2 FIX: delay 15s tra agenti (limit 10k token/min su Sonnet)
            if step > 1:
                await asyncio.sleep(15)
            nome_agente      = AGENTE_NOME.get(agente_corrente, agente_corrente)
            agente_thread_id = get_thread_id_by_name(nome_agente.lower())
            agenti_eseguiti.append(nome_agente)

            if dashboard_card_id and dashboard_is_paused(dashboard_card_id):
                msg = f"⏸ Pipeline in pausa. Riprendi dalla dashboard per continuare con {nome_agente}."
                if mm_thread_id:
                    await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id, text=msg)
                await update.message.reply_text(msg)
                return

            if agente_thread_id:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=agente_thread_id,
                                           text=f"⚙️ {nome_agente} — step {step}/{len(pipeline_forzata)}")
            if mm_thread_id:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                           text=f"▶ {nome_agente} in corso...")

            # ── Chiama l'agente appropriato ───────────────────────────────────
            if agente_corrente == "copywriter":
                script_json, raw = await chiama_copywriter(
                    brief_compresso, mm_brief=mm_brief, card_id=dashboard_card_id,
                    audio_dur_sec=audio_dur_sec
                )
                output_dashboard = (script_json or {}).get("hook", raw[:MAX_OUTPUT])

            elif agente_corrente == "strategist":
                strategy_json, tsx_skeleton_files, raw = await chiama_strategist(
                    script_json, brief_compresso, mm_brief=mm_brief, card_id=dashboard_card_id
                )
                skl_count = len(tsx_skeleton_files) if tsx_skeleton_files else 0
                output_dashboard = f"{str((strategy_json or {}).get('directives', []))[:MAX_OUTPUT]} | TSX skeleton: {skl_count} file"
                if tsx_skeleton_files and agente_thread_id:
                    await ctx.bot.send_message(
                        chat_id=chat_id, message_thread_id=agente_thread_id,
                        text=f"🏗️ TSX skeleton generato: {skl_count} file\n" +
                             "\n".join(os.path.basename(f) for f in tsx_skeleton_files)
                    )

            elif agente_corrente == "cover-designer":
                visual_json, cover_images, raw = await chiama_cover_designer(
                    script_json, strategy_json, brief_compresso, mm_brief=mm_brief
                )
                output_dashboard = str((visual_json or {}).get("colors", raw[:MAX_OUTPUT]))[:MAX_OUTPUT]
                # Invia immagini generate nel topic Cover Designer
                if agente_thread_id:
                    design_notes = (visual_json or {}).get("design_notes", "")
                    await ctx.bot.send_message(
                        chat_id=chat_id, message_thread_id=agente_thread_id,
                        text=f"🎨 Design system pronto — {len(cover_images)} immagini generate\n{design_notes[:300]}"
                    )
                    for img_path in cover_images:
                        if os.path.exists(img_path):
                            with open(img_path, "rb") as img_f:
                                await ctx.bot.send_photo(
                                    chat_id=chat_id, message_thread_id=agente_thread_id, photo=img_f,
                                    caption=os.path.basename(img_path)
                                )

            elif agente_corrente == "video-editor":
                if mm_thread_id:
                    await ctx.bot.send_message(
                        chat_id=chat_id, message_thread_id=mm_thread_id,
                        text="🎨 Video Editor — generazione file TSX uno per uno..."
                    )
                # PROBLEMA 4 FIX: logga pipeline_id nel topic VE per verifica visiva
                _ve_hook_display = (mm_brief or {}).get("hook_testo", brief_compresso[:60])
                if agente_thread_id:
                    await ctx.bot.send_message(
                        chat_id=chat_id, message_thread_id=agente_thread_id,
                        text=f"🎬 Video Editor avviato per pipeline [{pipeline_id}]\n📌 Hook: {_ve_hook_display[:100]}"
                    )
                # notify_fn: invia messaggi di progresso al topic MM
                async def _ve_notify(msg: str):
                    _tgt = mm_thread_id or agente_thread_id
                    if _tgt:
                        try:
                            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=_tgt, text=msg)
                        except Exception:
                            pass

                salvati, ve_summary, ancora_vuoti = await chiama_video_editor(
                    script_json, strategy_json, visual_json, brief_compresso,
                    tsx_pre_saved=tsx_skeleton_files, mm_brief=mm_brief,
                    audio_path=_ultimo_audio_path, audio_dur_sec=audio_dur_sec,
                    pipeline_id=pipeline_id, notify_fn=_ve_notify,
                )
                output_dashboard = ve_summary[:MAX_OUTPUT]

                # Invia riepilogo file al topic agente
                if agente_thread_id:
                    await ctx.bot.send_message(chat_id=chat_id, message_thread_id=agente_thread_id,
                                               text=ve_summary)

                # Log dimensioni nel topic MM
                sizes_log = " | ".join(
                    f"{os.path.basename(f)}: {os.path.getsize(f)}B"
                    for f in salvati if os.path.exists(f)
                )
                if mm_thread_id:
                    await ctx.bot.send_message(
                        chat_id=chat_id, message_thread_id=mm_thread_id,
                        text=f"✅ {len(salvati)} file TSX pronti\n{sizes_log}"
                    )

                if salvati:
                    # ── PRE-RENDER CHECK: verifica durationInFrames in Root.tsx (BUG FIX 1) ──
                    if audio_dur_sec:
                        expected_frames = round(audio_dur_sec * 30)
                        root_path = os.path.join(VIDEO_EDITOR_PATH, "src", "Root.tsx")
                        if os.path.exists(root_path) and os.path.getsize(root_path) > 0:
                            with open(root_path, encoding="utf-8") as f:
                                root_content = f.read()
                            m = re.search(r'durationInFrames\s*[:=]\s*\{?\s*(\d+)', root_content)
                            if m:
                                found_frames = int(m.group(1))
                                if found_frames != expected_frames:
                                    print(f"[PreRender] ⚠️ durationInFrames={found_frames} "
                                          f"≠ atteso {expected_frames} — correggo Root.tsx", flush=True)
                                    root_content = re.sub(
                                        r'(durationInFrames\s*[:=]\s*\{?\s*)\d+',
                                        lambda mobj: mobj.group(0).replace(str(found_frames), str(expected_frames)),
                                        root_content, count=1
                                    )
                                    with open(root_path, "w", encoding="utf-8") as f:
                                        f.write(root_content)
                                    print(f"[PreRender] ✅ Root.tsx corretto: {expected_frames} frame", flush=True)
                                else:
                                    print(f"[PreRender] ✅ durationInFrames={found_frames} — corretto", flush=True)
                            else:
                                print("[PreRender] ⚠️ durationInFrames non trovato in Root.tsx", flush=True)

                    # ── Check timeline sync ──────────────────────────────────
                    _tl_check = os.path.join(VIDEO_EDITOR_PATH, "public", "timeline.json")
                    _sync_ok   = os.path.join(VIDEO_EDITOR_PATH, "src", "utils", "syncTimeline.ts")
                    if os.path.exists(_tl_check) and not os.path.exists(_sync_ok):
                        _warn_sync = "⚠️ timeline.json presente ma utils/syncTimeline.ts non trovato — sync potrebbe non funzionare."
                        print(f"[PreRender] {_warn_sync}", flush=True)
                        if mm_thread_id:
                            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id, text=_warn_sync)
                    elif os.path.exists(_tl_check) and os.path.exists(_sync_ok):
                        # Verifica che almeno una scena importi syncTimeline
                        _scenes_dir = os.path.join(VIDEO_EDITOR_PATH, "src", "scenes")
                        _uses_sync = any(
                            "syncTimeline" in open(os.path.join(_scenes_dir, f), encoding="utf-8", errors="ignore").read()
                            for f in os.listdir(_scenes_dir) if f.endswith(".tsx")
                        ) if os.path.exists(_scenes_dir) else False
                        if not _uses_sync and mm_thread_id:
                            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                                       text="⚠️ Le scene non importano syncTimeline — le animazioni potrebbero non essere sincronizzate con l'audio.")
                        else:
                            print("[PreRender] ✅ syncTimeline usato nelle scene", flush=True)

                    # ── PRE-RENDER SYNC CHECK (con blocco su 0B) ──────────────
                    _expected_frames = round(audio_dur_sec * 30) if audio_dur_sec else None
                    _sync_warns = _pre_render_sync_check(audio_dur_sec, _expected_frames)
                    _blocchi = [w for w in _sync_warns if w.startswith("❌ BLOCCO:")]
                    if _sync_warns:
                        _sw_msg = "⚠️ PRE-RENDER SYNC:\n" + "\n".join(_sync_warns)
                        _sw_tid = get_thread_id_by_name("video editor") or mm_thread_id
                        try:
                            if _sw_tid:
                                await ctx.bot.send_message(chat_id=chat_id,
                                                           message_thread_id=_sw_tid,
                                                           text=_sw_msg)
                            else:
                                await update.message.reply_text(_sw_msg)
                        except Exception:
                            pass

                    # BLOCCO RENDER se ci sono file 0B o Root.tsx vuoto
                    if _blocchi:
                        _blocco_msg = (
                            f"❌ Render bloccato: {len(_blocchi)} errori critici.\n"
                            + "\n".join(_blocchi)
                            + "\n\nVerifica manualmente i file TSX o rilancia la pipeline."
                        )
                        print(f"[Render] {_blocco_msg}", flush=True)
                        _err_tid = get_thread_id_by_name("video editor") or mm_thread_id
                        try:
                            if _err_tid:
                                await ctx.bot.send_message(chat_id=chat_id,
                                                           message_thread_id=_err_tid,
                                                           text=_blocco_msg)
                        except Exception:
                            pass
                        if dashboard_card_id:
                            dashboard_step(dashboard_card_id, "video-remotion", "error",
                                           f"Render bloccato: {len(_blocchi)} file 0B")
                        continue  # salta render, prosegui pipeline loop

                    # ── Avvia Remotion Studio su localhost:3001 ────────────────
                    try:
                        subprocess.Popen(
                            "npx remotion studio --port 3001",
                            cwd=VIDEO_EDITOR_PATH, shell=True,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                        )
                        print("[Studio] Remotion Studio avviato su http://localhost:3001", flush=True)
                    except Exception as e:
                        print(f"[Studio] ⚠️ Impossibile avviare studio: {e}", flush=True)

                    # ── Render diretto — nessuna preview, il video è la preview ─
                    if mm_thread_id:
                        await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                                   text="🎬 Render avviato... (Studio: http://localhost:3001)")
                    video_path = render_video()
                    ve_thread_id = get_thread_id_by_name("video editor")

                    if video_path:
                        size_mb = os.path.getsize(video_path) / (1024 * 1024)

                        # ── POST-RENDER CHECK durata (BUG FIX 1) ─────────────
                        dur_warning = ""
                        if audio_dur_sec:
                            rendered_dur = _audio_duration_sec(video_path)
                            if rendered_dur is not None:
                                delta = abs(rendered_dur - audio_dur_sec)
                                print(f"[PostRender] Audio: {audio_dur_sec:.2f}s | Video: {rendered_dur:.2f}s | Δ={delta:.2f}s", flush=True)
                                if delta > 0.5:
                                    dur_warning = (
                                        f"\n⚠️ DURATA: video={rendered_dur:.1f}s vs audio={audio_dur_sec:.1f}s "
                                        f"(Δ={delta:.1f}s > 0.5s — il video è più lungo dell'audio)"
                                    )
                                    ve_thread_id_check = get_thread_id_by_name("video editor")
                                    warn_thread = ve_thread_id_check or send_thread if 'send_thread' in dir() else None
                                    warn_msg = (
                                        f"⚠️ Durata video ({rendered_dur:.1f}s) non corrisponde all'audio "
                                        f"({audio_dur_sec:.1f}s) — Δ={delta:.1f}s. "
                                        "Controlla durationInFrames in Root.tsx prima di pubblicare."
                                    )
                                    try:
                                        if warn_thread:
                                            await ctx.bot.send_message(chat_id=chat_id,
                                                                       message_thread_id=warn_thread,
                                                                       text=warn_msg)
                                        else:
                                            await update.message.reply_text(warn_msg)
                                    except Exception:
                                        pass
                            else:
                                print("[PostRender] ⚠️ Impossibile leggere durata video renderizzato", flush=True)

                        # ── POST-RENDER VISUAL CHECK (STEP 4) ────────────────
                        send_thread = ve_thread_id or (update.message.message_thread_id if update.message.is_topic_message else None)
                        stile_attivo = (mm_brief or {}).get("stile_rilevato") if mm_brief else None
                        style_note   = ""
                        if stile_attivo:
                            style_note = await _visual_check_post_render(
                                video_path, stile_attivo, chat_id, ctx, send_thread
                            )

                        caption = f"🎬 Video pronto ({size_mb:.1f} MB){dur_warning}{style_note}"
                        keyboard = _keyboard_post_pipeline()
                        if send_thread:
                            with open(video_path, "rb") as vf:
                                await ctx.bot.send_video(chat_id=chat_id, message_thread_id=send_thread,
                                                         video=vf, caption=caption, reply_markup=keyboard)
                        else:
                            with open(video_path, "rb") as vf:
                                await update.message.reply_video(video=vf, caption=caption, reply_markup=keyboard)

                        # Aggiorna dashboard → step done + "In Approvazione"
                        if dashboard_card_id:
                            dashboard_step(dashboard_card_id, "video-remotion", "done", ve_summary[:MAX_OUTPUT])
                            dashboard_conclude_card(dashboard_card_id, "In Approvazione")

                        # Salva stato per approvazione
                        _pending_approval[chat_id] = {
                            "salvati":           salvati,
                            "agenti_eseguiti":   list(agenti_eseguiti),
                            "testo":             testo,
                            "output_thread_id":  output_thread_id,
                            "mm_thread_id":      mm_thread_id,
                            "ve_thread_id":      ve_thread_id,
                            "dashboard_card_id": dashboard_card_id,
                            "video_path":        video_path,
                            "script_json":       script_json,
                            "strategy_json":     strategy_json,
                            "visual_json":       visual_json,
                            "mm_brief":          mm_brief,
                            "brief_compresso":   brief_compresso,
                            "pipeline_id":       pipeline_id,   # PROBLEMA 4 FIX
                        }
                        print(f"[Pipeline] Video inviato — in attesa OK/modifiche da chat {chat_id}", flush=True)
                    else:
                        msg = "⚠️ Render fallito.\n`cd video-editor && npx remotion render src/Root.tsx MainVideo out/video.mp4`"
                        if mm_thread_id:
                            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id, text=msg)
                        if ve_thread_id:
                            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=ve_thread_id, text=msg)
                        else:
                            await update.message.reply_text(msg)
                else:
                    msg = "⚠️ Nessun file TSX trovato su disco. Controlla il terminale."
                    if mm_thread_id:
                        await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id, text=msg)
                    await update.message.reply_text(msg)

                break  # fine pipeline

            else:
                raw = await lancia_agente_cli(agente_corrente, testo)
                output_dashboard = raw[:MAX_OUTPUT]

            # Dashboard update per agenti non-video
            if dashboard_card_id and agente_corrente in step_map and agente_corrente != "video-editor":
                dashboard_step(dashboard_card_id, step_map[agente_corrente], "done", output_dashboard)

            # Output nel topic dell'agente (JSON pretty o testo)
            if agente_thread_id:
                display = json.dumps(
                    script_json if agente_corrente == "copywriter"
                    else strategy_json if agente_corrente == "strategist"
                    else visual_json,
                    ensure_ascii=False, indent=2
                )[:3000] if parse_json_safe(raw) else raw[:3000]
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=agente_thread_id,
                                           text=display)

    else:
        # Agente singolo (Copywriter, Strategist, SMM, ecc.) — task ad-hoc
        agente_thread_id = get_thread_id_by_name(topic_name)
        nome_agente      = AGENTE_NOME.get(agente, agente)
        usa_cc           = _richiede_claude_code(testo)
        etichetta        = "⚙️ Claude Code" if usa_cc else "⚙️"
        if agente_thread_id:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=agente_thread_id,
                                       text=f"{etichetta} {nome_agente} in elaborazione...")
        agenti_eseguiti.append(nome_agente)

        if ANTHROPIC_API_KEY or usa_cc:
            async def _progress_adhoc(msg: str):
                try:
                    if agente_thread_id:
                        await ctx.bot.send_message(chat_id=chat_id, message_thread_id=agente_thread_id, text=msg)
                    else:
                        await update.message.reply_text(msg)
                except Exception:
                    pass
            output, file_gen = await _gestisci_task_agente(
                agente, testo, max_tokens=2500, progress_cb=_progress_adhoc
            )
        else:
            output   = await lancia_agente_cli(agente, testo)
            file_gen = []

        # Invia risposta testuale nel topic (spezzata se > 4000 chars)
        blocchi = [output[i:i+4000] for i in range(0, max(len(output), 1), 4000)]
        for blocco in blocchi:
            if agente_thread_id:
                await ctx.bot.send_message(chat_id=chat_id, message_thread_id=agente_thread_id,
                                           text=blocco)

        # Invia file generati da Claude Code
        if file_gen and agente_thread_id:
            for fpath in file_gen:
                if not os.path.exists(fpath):
                    continue
                fname = os.path.basename(fpath)
                try:
                    with open(fpath, "rb") as f:
                        await ctx.bot.send_document(
                            chat_id=chat_id, message_thread_id=agente_thread_id,
                            document=f, filename=fname, caption=f"📄 {fname}"
                        )
                    os.unlink(fpath)
                except Exception as e:
                    print(f"[CC] Invio file {fname}: {e}", flush=True)

        if output_thread_id:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=output_thread_id,
                                       text=f"📤 {nome_agente}:\n{output[:3000]}")

    if mm_thread_id and agenti_eseguiti:
        await ctx.bot.send_message(chat_id=chat_id, message_thread_id=mm_thread_id,
                                   text=f"🏁 {' → '.join(agenti_eseguiti)}")

# ══════════════════════════════════════════════════════════════════════════════
#  Audio handling
# ══════════════════════════════════════════════════════════════════════════════

def _split_audio_chunks(src_path, chunk_dir, chunk_sec=60):
    os.makedirs(chunk_dir, exist_ok=True)
    pattern = os.path.join(chunk_dir, "chunk_%03d.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-i", src_path, "-f", "segment",
         "-segment_time", str(chunk_sec), "-ac", "1", "-ar", "16000",
         "-acodec", "pcm_s16le", pattern],
        capture_output=True, timeout=120
    )
    return sorted(
        os.path.join(chunk_dir, f)
        for f in os.listdir(chunk_dir)
        if f.startswith("chunk_") and f.endswith(".wav")
    )

def _audio_duration_sec(path):
    """Restituisce la durata in secondi del file audio via ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, timeout=10, encoding="utf-8", errors="replace"
        )
        return float(result.stdout.strip())
    except Exception:
        return None

def _transcribe_with_retry(path, max_retries=3):
    """Trascrive audio con Whisper. Restituisce (text, segments) con word-level timestamps."""
    dur = _audio_duration_sec(path)
    if dur is not None:
        print(f"[Whisper] Audio: {dur:.1f}s — stimato ~{max(5, int(dur * 0.3))}s su CPU (base)", flush=True)
    else:
        print(f"[Whisper] Durata audio non rilevabile", flush=True)

    for attempt in range(1, max_retries + 1):
        try:
            t0 = time.time()
            result = whisper_model.transcribe(path, language="it", word_timestamps=True)
            text     = result["text"].strip()
            segments = result.get("segments", [])
            print(f"[Whisper] ✓ Trascritto in {time.time()-t0:.1f}s — {len(segments)} segmenti word-level", flush=True)
            return text, segments
        except Exception as e:
            print(f"[Whisper] Tentativo {attempt}/{max_retries} fallito: {e}", flush=True)
            if attempt == max_retries:
                raise

async def gestisci_audio(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or (update.message.from_user and update.message.from_user.is_bot):
        return
    if not (update.message.voice or update.message.audio):
        return
    await _buffer_add_audio(update, ctx.bot)


async def gestisci_foto(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or (update.message.from_user and update.message.from_user.is_bot):
        return

    caption = (update.message.caption or "").strip()

    # ── Flusso Style Library (priorità assoluta, prima del buffer) ───────────
    if caption.upper().startswith("STILE:"):
        parsed = _parse_stile_caption(caption)
        if not parsed:
            await update.message.reply_text(
                "⚠️ Formato non valido.\nUsa: *STILE: nome - descrizione dello stile*",
                parse_mode="Markdown"
            )
            return
        nome, descrizione = parsed
        aggiorna = style_library.stile_esiste(nome)
        verb = "aggiornato" if aggiorna else "creato"

        await update.message.reply_text(
            f"🖼️ {'Aggiornamento' if aggiorna else 'Creazione'} stile *{nome}* da immagine...\n"
            f"_{descrizione[:120] if descrizione else 'Nessuna descrizione — userò solo i frame.'}_",
            parse_mode="Markdown"
        )

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            photo    = update.message.photo[-1]   # versione più grande
            file_obj = await ctx.bot.get_file(photo.file_id)
            await file_obj.download_to_drive(tmp_path)

            async def progress(msg: str):
                try:
                    await update.message.reply_text(msg)
                except Exception:
                    pass

            profilo = await style_library.salva_stile_da_foto(
                nome        = nome,
                descrizione = descrizione,
                foto_paths  = [tmp_path],
                progress_cb = progress,
            )
            n_frame = profilo.get("frame_analizzati", 0)
            costo   = profilo.get("_costo_sessione", 0)
            await update.message.reply_text(
                f"✅ Stile *{nome}* {verb} con {n_frame} frame totali.\n"
                f"💰 Costo sessione: ${costo:.4f}\n\n"
                f"Manda altre immagini con la stessa caption per arricchire lo stile.\n"
                f"Scrivi *STILE: {nome} MOSTRA* per vedere il profilo.",
                parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"❌ Errore salvataggio stile: {e}")
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        return

    key = _buffer_key(update)

    # Se c'è audio/video nel buffer → immagine fa parte della pipeline, accoda
    if _buffer_ha_media(key):
        await _buffer_add_photo(update, ctx.bot)
        return

    agente_id = _topic_agente_id(update)


    # Nessun agente o API → accoda nel buffer normale
    if not agente_id or not ANTHROPIC_API_KEY or not update.message.photo:
        await _buffer_add_photo(update, ctx.bot)
        return

    # ── Task ad-hoc: immagine → router Claude Code / API ─────────────────────
    user_text = caption or "Analizza questa immagine nel contesto del tuo ruolo."
    usa_cc    = _richiede_claude_code(user_text)
    etichetta = "⚙️ Claude Code" if usa_cc else "🔍 Analisi"
    await update.message.reply_text(
        f"🖼️ {etichetta} → {AGENTE_NOME.get(agente_id, agente_id)}..."
    )
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        photo    = update.message.photo[-1]
        file_obj = await ctx.bot.get_file(photo.file_id)
        await file_obj.download_to_drive(tmp_path)

        async def _progress_img(msg: str):
            try:
                await update.message.reply_text(msg)
            except Exception:
                pass
        if usa_cc:
            risposta, file_gen = await _gestisci_task_agente(
                agente_id, user_text, file_paths=[tmp_path], progress_cb=_progress_img
            )
        else:
            with open(tmp_path, "rb") as f:
                img_b64 = __import__("base64").standard_b64encode(f.read()).decode("utf-8")
            risposta, file_gen = await _gestisci_task_agente(
                agente_id, user_text, images_b64=[img_b64]
            )

        await _invia_risposta_topic(update, ctx, risposta, agente_id)
        await _invia_file_generati(update, ctx, file_gen, agente_id)
    except Exception as e:
        await update.message.reply_text(f"❌ Errore elaborazione immagine: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


async def gestisci_documento(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or (update.message.from_user and update.message.from_user.is_bot):
        return

    key = _buffer_key(update)

    # Se c'è audio/video nel buffer → documento fa parte della pipeline, accoda
    if _buffer_ha_media(key):
        await _buffer_add_document(update, ctx.bot)
        return

    agente_id = _topic_agente_id(update)
    doc       = update.message.document
    caption   = (update.message.caption or "").strip()

    # Nessun agente riconosciuto o API non disponibile → accoda nel buffer normale
    if not agente_id or not ANTHROPIC_API_KEY or not doc:
        await _buffer_add_document(update, ctx.bot)
        return

    # ── Task ad-hoc: documento → router Claude Code / API ────────────────────
    ext       = os.path.splitext(doc.file_name or ".bin")[1].lower()
    user_text = caption or f"Analizza questo documento: {doc.file_name}"
    usa_cc    = _richiede_claude_code(user_text)
    etichetta = "⚙️ Claude Code" if usa_cc else "📖 Analisi"
    await update.message.reply_text(
        f"📄 *{doc.file_name}* → {etichetta} · {AGENTE_NOME.get(agente_id, agente_id)}...",
        parse_mode="Markdown"
    )
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
    try:
        file_obj = await ctx.bot.get_file(doc.file_id)
        await file_obj.download_to_drive(tmp_path)

        async def _progress_doc(msg: str):
            try:
                await update.message.reply_text(msg)
            except Exception:
                pass
        if usa_cc:
            risposta, file_gen = await _gestisci_task_agente(
                agente_id, user_text, file_paths=[tmp_path], progress_cb=_progress_doc
            )
        else:
            testo_doc = _estrai_testo_documento(tmp_path, doc.file_name or "")
            risposta, file_gen = await _gestisci_task_agente(
                agente_id, user_text, doc_texts=[testo_doc]
            )

        await _invia_risposta_topic(update, ctx, risposta, agente_id)
        await _invia_file_generati(update, ctx, file_gen, agente_id)
    except Exception as e:
        await update.message.reply_text(f"❌ Errore elaborazione documento: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ══════════════════════════════════════════════════════════════════════════════
#  Style Library — handler video e comandi testo
# ══════════════════════════════════════════════════════════════════════════════

def _parse_stile_caption(caption: str) -> tuple[str, str] | None:
    """
    Analizza una caption che inizia con 'STILE:'.
    Ritorna (nome_stile, descrizione) oppure None se il formato non è valido.
    Formato atteso: "STILE: nome_stile - descrizione..."
    Accetta anche solo "STILE: nome_stile" (senza descrizione).
    """
    caption = caption.strip()
    if not caption.upper().startswith("STILE:"):
        return None
    resto = caption[6:].strip()   # tutto dopo "STILE:"
    if " - " in resto:
        parts = resto.split(" - ", 1)
        nome  = parts[0].strip().lower().replace(" ", "_")
        desc  = parts[1].strip()
    else:
        nome  = resto.strip().lower().replace(" ", "_")
        desc  = ""
    if not nome:
        return None
    return nome, desc

async def gestisci_video(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """
    Gestisce video inviati al bot.
    - Caption con prefisso 'STILE:' → pipeline Style Library (NON entra nel buffer)
    - Altrimenti → accoda nel buffer come documento video
    """
    if not update.message or (update.message.from_user and update.message.from_user.is_bot):
        return

    caption = (update.message.caption or "").strip()

    # ── Flusso Style Library ──────────────────────────────────────────────────
    if caption.upper().startswith("STILE:"):
        parsed = _parse_stile_caption(caption)
        if not parsed:
            await update.message.reply_text(
                "⚠️ Formato non valido.\n"
                "Usa: *STILE: nome - descrizione dello stile*",
                parse_mode="Markdown"
            )
            return
        nome, descrizione = parsed
        aggiorna = style_library.stile_esiste(nome)
        verb = "aggiornato" if aggiorna else "creato"

        await update.message.reply_text(
            f"🎨 {'Aggiornamento' if aggiorna else 'Creazione'} stile *{nome}*...\n"
            f"_{descrizione[:120] if descrizione else 'Nessuna descrizione — userò solo i frame.'}_",
            parse_mode="Markdown"
        )

        # Scarica il video in un file temporaneo
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            video_file = await ctx.bot.get_file(update.message.video.file_id)
            await video_file.download_to_drive(tmp_path)

            async def progress(msg: str):
                try:
                    await update.message.reply_text(msg)
                except Exception:
                    pass

            profilo = await style_library.salva_stile(
                nome       = nome,
                descrizione= descrizione,
                video_path = tmp_path,
                progress_cb= progress,
            )

            n_frame = profilo.get("frame_analizzati", 0)
            costo   = profilo.get("_costo_sessione", 0)
            await update.message.reply_text(
                f"✅ Stile *{nome}* {verb} con {n_frame} frame analizzati.\n"
                f"💰 Costo sessione: ${costo:.4f}\n\n"
                f"Scrivi *STILE: {nome} MOSTRA* per vedere il profilo completo.",
                parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"❌ Errore salvataggio stile: {e}")
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        return

    # ── Nessun prefisso STILE: → accoda nel buffer come video (audio estratto al AVVIA) ──
    await _buffer_add_video(update, ctx.bot)


async def _gestisci_comandi_stile(update: Update, testo: str) -> bool:
    """
    Gestisce i comandi testuali della Style Library.
    Ritorna True se il comando è stato riconosciuto e gestito (il chiamante deve fare return).
    """
    t = testo.strip()
    tu = t.upper()

    # ── "STILI" → lista tutti gli stili ──────────────────────────────────────
    if tu == "STILI":
        stili = style_library.lista_stili()
        await update.message.reply_text(
            style_library.fmt_lista_stili(stili),
            parse_mode="Markdown"
        )
        return True

    # ── Comandi DEFAULT STILE ─────────────────────────────────────────────────
    if tu.startswith("DEFAULT STILE"):
        chat_id  = update.message.chat_id
        resto    = t[13:].strip()   # tutto dopo "DEFAULT STILE"
        resto_u  = resto.upper()

        # DEFAULT STILE RIMUOVI → cancella default
        if resto_u in ("RIMUOVI", "REMOVE", "RESET", "OFF"):
            rimosso = _remove_client_default_style(chat_id)
            if rimosso:
                await update.message.reply_text("✅ Stile default rimosso per questo cliente.")
            else:
                await update.message.reply_text("ℹ️ Nessuno stile default impostato.")
            return True

        # DEFAULT STILE (senza args) → mostra default attuale
        if not resto:
            nome = _get_client_default_style(chat_id)
            if nome:
                profilo = style_library.carica_profilo(nome)
                mood    = profilo.get("mood", "") if profilo else ""
                await update.message.reply_text(
                    f"🎨 *Stile default attivo*: `{nome}`\n"
                    f"_{mood}_\n\n"
                    f"Scrivi *STILE: {nome} MOSTRA* per i dettagli completi.\n"
                    f"Scrivi *DEFAULT STILE RIMUOVI* per disattivarlo.",
                    parse_mode="Markdown"
                )
            else:
                stili = style_library.lista_stili()
                nomi  = ", ".join(f"`{s['nome']}`" for s in stili) if stili else "_nessuno salvato_"
                await update.message.reply_text(
                    f"ℹ️ Nessuno stile default impostato.\n\n"
                    f"Stili disponibili: {nomi}\n\n"
                    f"Imposta con: *DEFAULT STILE: nome*",
                    parse_mode="Markdown"
                )
            return True

        # DEFAULT STILE: nome → imposta default
        if resto.startswith(":"):
            nome = resto[1:].strip().lower().replace(" ", "_")
            if not nome:
                await update.message.reply_text(
                    "⚠️ Specifica il nome dello stile.\nEs: *DEFAULT STILE: mrino_neon*",
                    parse_mode="Markdown"
                )
                return True
            if not style_library.stile_esiste(nome):
                stili = style_library.lista_stili()
                nomi  = ", ".join(f"`{s['nome']}`" for s in stili) if stili else "_nessuno_"
                await update.message.reply_text(
                    f"⚠️ Stile *{nome}* non trovato.\n\nDisponibili: {nomi}",
                    parse_mode="Markdown"
                )
                return True
            _set_client_default_style(chat_id, nome)
            profilo = style_library.carica_profilo(nome)
            mood    = profilo.get("mood", "") if profilo else ""
            await update.message.reply_text(
                f"✅ Stile default impostato: *{nome}*\n"
                f"_{mood}_\n\n"
                f"Da ora ogni pipeline di questo cliente userà automaticamente questo stile.",
                parse_mode="Markdown"
            )
            return True

    # ── "STILE: nome MOSTRA" o "STILE: nome DELETE" ───────────────────────────
    if tu.startswith("STILE:"):
        resto = t[6:].strip()
        parole = resto.split()
        if not parole:
            return False
        ultimo = parole[-1].upper()

        if ultimo == "DELETE" and len(parole) >= 2:
            nome = "_".join(parole[:-1]).lower()
            ok   = style_library.elimina_stile(nome)
            if ok:
                await update.message.reply_text(f"🗑️ Stile *{nome}* eliminato.", parse_mode="Markdown")
            else:
                await update.message.reply_text(f"⚠️ Stile *{nome}* non trovato.", parse_mode="Markdown")
            return True

        if ultimo == "MOSTRA":
            nome    = "_".join(parole[:-1]).lower() if len(parole) > 1 else parole[0].lower()
            profilo = style_library.carica_profilo(nome)
            await update.message.reply_text(
                style_library.fmt_profilo_stile(profilo),
                parse_mode="Markdown"
            )
            return True

        if ultimo == "ESPORTA":
            nome = "_".join(parole[:-1]).lower() if len(parole) > 1 else parole[0].lower()
            txt  = style_library.carica_profilo_txt(nome)
            if txt:
                # Manda come blocco di codice per leggibilità, tronca se > 4000 char
                testo_out = txt if len(txt) <= 4000 else txt[:3950] + "\n...[troncato]"
                await update.message.reply_text(
                    f"📄 *STYLE DNA: {nome}*\n\n```\n{testo_out}\n```",
                    parse_mode="Markdown"
                )
            else:
                await update.message.reply_text(
                    f"⚠️ Stile *{nome}* non trovato o profilo .txt mancante.",
                    parse_mode="Markdown"
                )
            return True

        if ultimo == "RIGENERA":
            nome = "_".join(parole[:-1]).lower() if len(parole) > 1 else parole[0].lower()
            if not style_library.stile_esiste(nome):
                await update.message.reply_text(
                    f"⚠️ Stile *{nome}* non trovato — non posso rigenerare.",
                    parse_mode="Markdown"
                )
                return True
            await update.message.reply_text(
                f"🔄 Rigenero STYLE DNA *{nome}* con prompt aggiornato...\n"
                f"_(rianalizza i frame esistenti per estrarre REGOLE TSX concrete)_",
                parse_mode="Markdown"
            )
            async def _rigenera_cb(msg):
                try:
                    await update.message.reply_text(msg)
                except Exception:
                    pass
            try:
                profilo = await style_library.rigenera_profilo_tsx(nome, progress_cb=_rigenera_cb)
                tsx     = profilo.get("regole_tsx", {})
                costo   = profilo.get("_costo_sessione", 0)
                riepilogo = (
                    f"✅ *{nome}* rigenerato\n"
                    f"background: `{tsx.get('backgroundColor','?')}` · "
                    f"accent: `{tsx.get('accent','?')}`\n"
                    f"fontTitle: `{tsx.get('fontTitle','?')}`\n"
                    f"densita: `{tsx.get('densita_visiva','?')}` · "
                    f"spring: `{tsx.get('spring_preset','?')}`\n"
                    f"anim OK: {', '.join(tsx.get('animazioni_permesse',[]))}\n"
                    f"anim NO: {', '.join(tsx.get('animazioni_vietate',[]))}\n"
                    f"Costo: ${costo:.4f}"
                )
                await update.message.reply_text(riepilogo, parse_mode="Markdown")
            except Exception as _re:
                await update.message.reply_text(f"⚠️ Errore rigenerazione: {_re}")
            return True

    return False


# ══════════════════════════════════════════════════════════════════════════════
#  SMM Publisher — comandi Telegram
# ══════════════════════════════════════════════════════════════════════════════
# TTS COMMANDS
# ══════════════════════════════════════════════════════════════════════════════

async def _gestisci_comandi_tts(update: Update, testo: str) -> bool:
    """
    Gestisce i comandi TTS/ElevenLabs.
    Ritorna True se riconosciuto e gestito.

    Comandi:
      VOCI                    → lista voci disponibili
      VOCE DEFAULT            → mostra voce configurata per questa chat
      VOCE DEFAULT: <id>      → imposta voce per questa chat
      VOCE GLOBALE: <id>      → imposta voce globale
      VOCE RIMUOVI            → ripristina default globale per questa chat
    """
    t  = testo.strip()
    tu = t.upper()
    chat_id = update.message.chat_id

    if tu == "VOCI":
        await update.message.reply_text("🎙️ Carico lista voci ElevenLabs...")
        try:
            voci = tts_engine.lista_voci()
            await update.message.reply_text(
                tts_engine.fmt_lista_voci(voci), parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"❌ ElevenLabs: {e}")
        return True

    if tu == "VOCE DEFAULT":
        vid = tts_engine.get_voice_for_chat(chat_id)
        await update.message.reply_text(
            f"🎙️ Voce attiva per questa chat: `{vid}`\n"
            f"Imposta con: `VOCE DEFAULT: <voice_id>`",
            parse_mode="Markdown"
        )
        return True

    if tu.startswith("VOCE DEFAULT:"):
        vid = t[13:].strip()
        if not vid:
            await update.message.reply_text("⚠️ Specifica il voice_id.\nEs: `VOCE DEFAULT: abc123`", parse_mode="Markdown")
            return True
        tts_engine.set_voice_for_chat(chat_id, vid)
        await update.message.reply_text(f"✅ Voce default impostata per questa chat: `{vid}`", parse_mode="Markdown")
        return True

    if tu.startswith("VOCE GLOBALE:"):
        vid = t[13:].strip()
        if not vid:
            await update.message.reply_text("⚠️ Specifica il voice_id.", parse_mode="Markdown")
            return True
        tts_engine.set_global_default_voice(vid)
        await update.message.reply_text(f"✅ Voce globale impostata: `{vid}`", parse_mode="Markdown")
        return True

    if tu in ("VOCE RIMUOVI", "VOCE RESET"):
        tts_engine.set_voice_for_chat(chat_id, tts_engine.DEFAULT_VOICE_ID)
        await update.message.reply_text("✅ Voce ripristinata al default globale.")
        return True

    return False


def _is_tts_request(testo: str) -> bool:
    """True se il testo contiene un trigger TTS."""
    tl = testo.lower()
    return any(phrase in tl for phrase in TTS_TRIGGER_PHRASES)


# ══════════════════════════════════════════════════════════════════════════════
#  B-ROLL — comandi e helper pipeline
# ══════════════════════════════════════════════════════════════════════════════

async def _gestisci_comandi_broll(update: Update, testo: str) -> bool:
    """
    Gestisce il comando BROLL.
    Ritorna True se riconosciuto e gestito.

    Comandi:
      BROLL: <keyword>   → mostra preview dei primi 3 risultati Pexels
                           (thumbnail + link + durata) senza scaricare nulla
    """
    t  = testo.strip()
    tu = t.upper()

    if not tu.startswith("BROLL:"):
        return False

    keyword = t[len("BROLL:"):].strip()
    if not keyword:
        await update.message.reply_text(
            "⚠️ Specifica una keyword.\nEs: `BROLL: business meeting`",
            parse_mode="Markdown",
        )
        return True

    await update.message.reply_text(f"🎬 Cerco B-roll su Pexels: *{keyword}*...", parse_mode="Markdown")

    try:
        risultati = await asyncio.get_event_loop().run_in_executor(
            None, lambda: broll_finder.cerca_broll_preview(keyword, n=3)
        )
    except RuntimeError as e:
        await update.message.reply_text(f"❌ Pexels: {e}")
        return True
    except Exception as e:
        await update.message.reply_text(f"❌ Errore ricerca B-roll: {e}")
        return True

    # Testo riepilogo
    testo_preview = broll_finder.fmt_broll_preview(risultati, keyword)
    await update.message.reply_text(testo_preview, parse_mode="Markdown", disable_web_page_preview=False)

    # Invia le thumbnail come foto (una per risultato)
    for r in risultati:
        if r.get("thumbnail"):
            try:
                await update.message.reply_photo(
                    photo   = r["thumbnail"],
                    caption = f"⏱ {r['durata']}s — {r['autore']} | {r['url_pexels']}",
                )
            except Exception:
                pass  # thumbnail non disponibile — il testo sopra basta

    return True


async def _pipeline_tts(update: Update, ctx, testo_brief: str, topic_name: str) -> None:
    """
    Flusso TTS completo:
    1. Copywriter raffina lo script dal brief testuale
    2. ElevenLabs genera l'audio
    3. Whisper trascrive con word-level timestamps
    4. Il pipeline video continua normalmente
    """
    global _ultimo_audio_path
    chat_id  = update.message.chat_id
    voice_id = tts_engine.get_voice_for_chat(chat_id)

    await update.message.reply_text(
        f"🤖 *Pipeline TTS attivata*\n"
        f"🎙️ Voce: `{voice_id}`\n"
        f"Fase 1: Copywriter raffina lo script...",
        parse_mode="Markdown"
    )

    # ── Step 1: Copywriter raffina lo script per TTS ──────────────────────────
    tts_brief = (
        f"{testo_brief}\n\n"
        f"ISTRUZIONE EXTRA: Questo script verrà letto da una voce AI (ElevenLabs). "
        f"Ottimizza il testo per la lettura audio: frasi brevi, niente simboli speciali, "
        f"punteggiatura naturale per le pause. MAX 60 secondi di parlato."
    )
    script_json, _ = await chiama_copywriter(tts_brief)
    if script_json:
        # Estrai il testo completo per TTS dalle sezioni dello script
        sezioni = script_json.get("sections", [])
        testo_tts = script_json.get("hook", "") + " " + " ".join(
            s.get("v", "") for s in sezioni
        ) + " " + script_json.get("cta", "")
        testo_tts = testo_tts.strip()
    else:
        testo_tts = testo_brief

    await update.message.reply_text(f"🎙️ Generazione audio ElevenLabs ({len(testo_tts)} chars)...")

    # ── Step 2: ElevenLabs genera l'audio ─────────────────────────────────────
    public_dir     = os.path.join(VIDEO_EDITOR_PATH, "public")
    os.makedirs(public_dir, exist_ok=True)
    voiceover_path = os.path.join(public_dir, "voiceover.mp3")

    try:
        _tts = await asyncio.get_event_loop().run_in_executor(
            None, lambda: tts_engine.genera_voce(testo_tts, voice_id=voice_id, output_path=voiceover_path)
        )
        output_path   = _tts["path"]
        audio_dur_sec = _tts["durata_secondi"]
    except Exception as e:
        await update.message.reply_text(f"❌ ElevenLabs: {e}")
        return

    _ultimo_audio_path = output_path
    await update.message.reply_text(
        f"✅ Audio generato: {audio_dur_sec:.1f}s\n"
        f"📝 Trascrizione Whisper in corso..."
    )

    # ── Step 3: Whisper trascrive con timestamps ───────────────────────────────
    timeline_segments: list = []
    try:
        chunk_dir = voiceover_path + "_chunks"
        chunks = _split_audio_chunks(voiceover_path, chunk_dir) or [voiceover_path]
        parti_text: list[str] = []
        chunk_time_offset = 0.0
        for chunk_path in chunks:
            chunk_text, chunk_segs = _transcribe_with_retry(chunk_path)
            parti_text.append(chunk_text)
            for seg in chunk_segs:
                seg_fixed = {k: v for k, v in seg.items() if k != "words"}
                seg_fixed["start"] = round(seg["start"] + chunk_time_offset, 3)
                seg_fixed["end"]   = round(seg["end"]   + chunk_time_offset, 3)
                if "words" in seg:
                    seg_fixed["words"] = [
                        {**w, "start": round(w["start"] + chunk_time_offset, 3),
                              "end":   round(w["end"]   + chunk_time_offset, 3)}
                        for w in seg["words"]
                    ]
                timeline_segments.append(seg_fixed)
            chunk_dur = _audio_duration_sec(chunk_path)
            chunk_time_offset += chunk_dur or 0.0
        if os.path.exists(chunk_dir):
            shutil.rmtree(chunk_dir, ignore_errors=True)
        testo_trascritto = " ".join(parti_text).strip()
    except Exception as e:
        print(f"[TTS] Whisper fallito: {e}", flush=True)
        testo_trascritto = testo_tts
        timeline_segments = []

    # Salva timeline
    if timeline_segments:
        _tl_path = os.path.join(public_dir, "timeline.json")
        with open(_tl_path, "w", encoding="utf-8") as f:
            json.dump(timeline_segments, f, ensure_ascii=False, indent=2)
        print(f"[TTS] Timeline: {len(timeline_segments)} segmenti", flush=True)

    await update.message.reply_text(
        f"📝 Trascritto: {len(testo_trascritto)} chars · {len(timeline_segments)} segmenti\n"
        f"🚀 Avvio pipeline video..."
    )

    # ── Step 4: pipeline video normale ────────────────────────────────────────
    testo_pipeline = testo_trascritto or testo_tts
    await processa_input(
        update, ctx, testo_pipeline, topic_name,
        direttive=testo_brief, audio_dur_sec=audio_dur_sec
    )


# ══════════════════════════════════════════════════════════════════════════════

async def _gestisci_comandi_smm(update: Update, testo: str) -> bool:
    """
    Gestisce i comandi testuali dell'SMM Publisher.
    Ritorna True se riconosciuto e gestito.

    Comandi:
      SMM LOG           → ultimi 10 post dal log
      SMM LOG N         → ultimi N post
      SMM STATO: id     → status di un request_id specifico
      SMM PIATTAFORME   → piattaforme del cliente di questo chat
      SMM PIATTAFORME: nome → piattaforme di un cliente specifico
    """
    t  = testo.strip()
    tu = t.upper()

    if not tu.startswith("SMM "):
        return False

    resto   = t[4:].strip()
    resto_u = resto.upper()

    # SMM LOG [N] ─────────────────────────────────────────────────────────────
    if resto_u.startswith("LOG"):
        parte_n = resto[3:].strip()
        try:
            n = int(parte_n) if parte_n else 10
            n = max(1, min(n, 50))
        except ValueError:
            n = 10
        report = smm_publisher.fmt_log(n)
        await update.message.reply_text(report, parse_mode="Markdown")
        return True

    # SMM STATO: request_id ───────────────────────────────────────────────────
    if resto_u.startswith("STATO"):
        req_id = resto[5:].lstrip(":").strip()
        if not req_id:
            await update.message.reply_text(
                "⚠️ Specifica il request_id.\nEs: *SMM STATO: abc123*",
                parse_mode="Markdown"
            )
            return True
        report = smm_publisher.fmt_status(req_id)
        await update.message.reply_text(report, parse_mode="Markdown")
        return True

    # SMM PIATTAFORME [: nome] ────────────────────────────────────────────────
    if resto_u.startswith("PIATTAFORME"):
        nome_arg = resto[11:].lstrip(":").strip()
        if nome_arg:
            client_name = nome_arg
        else:
            # Prova a ricavare il nome cliente dal topic o dal testo corrente
            # Fallback: lista tutti i clienti
            cfg_tutti = smm_publisher.load_clienti_social()
            if not cfg_tutti:
                await update.message.reply_text("📭 Nessun cliente in clienti_social.json.")
                return True
            lines = ["📱 *Clienti configurati su Upload-Post:*\n"]
            for nome, cfg in cfg_tutti.items():
                if nome.startswith("_"):
                    continue
                plats = ", ".join(f"`{p}`" for p in cfg.get("platforms", []))
                user  = cfg.get("user", "?")
                lines.append(f"▸ *{nome}* (user: `{user}`)\n  {plats}")
            await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
            return True
        report = smm_publisher.fmt_piattaforme(client_name)
        await update.message.reply_text(report, parse_mode="Markdown")
        return True

    return False


# ══════════════════════════════════════════════════════════════════════════════
#  Telegram handlers
# ══════════════════════════════════════════════════════════════════════════════

_GDRIVE_RE = re.compile(
    r"https://(?:drive|docs)\.google\.com/(?:file/d/|open\?id=|uc\?.*?id=)"
    r"([a-zA-Z0-9_-]+)"
)


def _estrai_gdrive_url(testo: str):
    """
    Ritorna (url_completo, file_id) se trova un link Google Drive nel testo,
    altrimenti (None, None).
    """
    m = _GDRIVE_RE.search(testo)
    if m:
        return m.group(0), m.group(1)
    return None, None


async def _gestisci_gdrive_link(update: Update, testo: str) -> bool:
    """
    Intercetta qualsiasi messaggio che contiene un link Google Drive
    (non già catturato da _gestisci_analizza_video).
    - Prova il download pubblico
    - Se fallisce → mostra avviso
    - Se riesce ed è un video → pipeline trascrizione + analisi clip
    Ritorna True se il messaggio conteneva un link Drive.
    """
    url, file_id = _estrai_gdrive_url(testo)
    if not url:
        return False

    await update.message.reply_text(
        "🔗 Link Google Drive rilevato — provo a scaricarlo...\n"
        "_(funziona solo se il file è condiviso come 'Chiunque con il link')_",
        parse_mode="Markdown"
    )

    import tempfile, mimetypes
    VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

    with tempfile.TemporaryDirectory() as tmpdir:
        dest = os.path.join(tmpdir, "gdrive_file")
        try:
            video_analyzer._gdrive_download(url, dest)
        except Exception as e:
            await update.message.reply_text(
                "⚠️ *Non posso accedere a questo file Google Drive.*\n\n"
                "Potrebbe richiedere autenticazione Google. Per usarlo:\n"
                "1️⃣ Scaricalo sul tuo dispositivo\n"
                "2️⃣ Mandamelo direttamente qui nel chat\n\n"
                "oppure condividilo con _'Chiunque con il link può visualizzare'_.",
                parse_mode="Markdown"
            )
            return True

        # Determina il tipo di file (prova prima l'estensione nel URL, poi mimetypes)
        ext_guess = ""
        url_path  = url.split("?")[0]
        for ext in VIDEO_EXTS:
            if url_path.lower().endswith(ext):
                ext_guess = ext
                break
        if not ext_guess:
            # Prova con il contenuto dei primi byte (magic bytes)
            try:
                with open(dest, "rb") as fh:
                    header = fh.read(12)
                if header[4:8] in (b"ftyp", b"moov") or header[:4] in (b"\x1aE\xdf\xa3",):
                    ext_guess = ".mp4"
            except Exception:
                pass

        if ext_guess in VIDEO_EXTS or not ext_guess:
            # Tratta come video — usa pipeline trascrizione
            vid_path = dest + ".mp4"
            os.rename(dest, vid_path)

            async def progress(msg: str):
                try:
                    await update.message.reply_text(msg)
                except Exception:
                    pass

            await update.message.reply_text(
                "🎬 *File video scaricato!*\n\n"
                "Pipeline:\n"
                "1️⃣ Estrazione audio (ffmpeg)\n"
                "2️⃣ Trascrizione (Whisper)\n"
                "3️⃣ Analisi clip (Claude)\n"
                "4️⃣ PDF con timestamp\n\n"
                "⏳ Potrebbe richiedere qualche minuto...",
                parse_mode="Markdown"
            )
            try:
                pdf_path = await video_analyzer.analizza_video_gdrive(
                    f"https://drive.google.com/file/d/{file_id}",
                    progress_cb=progress,
                )
                with open(pdf_path, "rb") as f:
                    await update.message.reply_document(
                        document=f,
                        filename="clip_analysis.pdf",
                        caption="✅ *Analisi completata!*\n\nIl PDF contiene i timestamp dei clip migliori.",
                        parse_mode="Markdown"
                    )
                try:
                    os.remove(pdf_path)
                except Exception:
                    pass
            except Exception as e:
                await update.message.reply_text(f"❌ Errore analisi video: {e}")
        else:
            # File non-video scaricato — informa l'utente
            fname = f"gdrive_{file_id}{ext_guess}"
            dest_named = os.path.join(tmpdir, fname)
            os.rename(dest, dest_named)
            try:
                with open(dest_named, "rb") as f:
                    await update.message.reply_document(
                        document=f,
                        filename=fname,
                        caption="✅ File scaricato da Google Drive."
                    )
            except Exception as e:
                await update.message.reply_text(f"❌ Errore invio file: {e}")

    return True


async def _gestisci_analizza_video(update: Update, testo: str) -> bool:
    """
    Gestisce il comando: ANALIZZA VIDEO: <url google drive>
    Scarica il video, trascrive con Whisper, analizza con Claude e invia il PDF.
    Ritorna True se il comando è stato riconosciuto.
    """
    t  = testo.strip()
    tu = t.upper()
    if not tu.startswith("ANALIZZA VIDEO:"):
        return False

    url = t[15:].strip()
    if not url:
        await update.message.reply_text(
            "⚠️ Specifica il link Google Drive.\n"
            "Esempio: *ANALIZZA VIDEO: https://drive.google.com/file/d/xxx*",
            parse_mode="Markdown"
        )
        return True

    await update.message.reply_text(
        "🎬 *Analisi video avviata*\n\n"
        "Pipeline:\n"
        "1️⃣ Download da Google Drive\n"
        "2️⃣ Trascrizione audio con Whisper\n"
        "3️⃣ Analisi Claude → identificazione clip\n"
        "4️⃣ Generazione PDF con timestamp\n\n"
        "⏳ Potrebbe richiedere qualche minuto per video lunghi...",
        parse_mode="Markdown"
    )

    async def progress(msg: str):
        try:
            await update.message.reply_text(msg)
        except Exception:
            pass

    try:
        pdf_path = await video_analyzer.analizza_video_gdrive(url, progress_cb=progress)
        with open(pdf_path, "rb") as f:
            await update.message.reply_document(
                document=f,
                filename=f"clip_analysis.pdf",
                caption="✅ *Analisi completata!*\n\nIl PDF contiene i timestamp dei clip migliori con hook e motivazioni.",
                parse_mode="Markdown"
            )
        # Pulizia file temporaneo
        try:
            os.remove(pdf_path)
        except Exception:
            pass
    except Exception as e:
        err_str = str(e).lower()
        if any(kw in err_str for kw in ("403", "401", "login", "permission", "authentication", "unauthorized")):
            await update.message.reply_text(
                "⚠️ *Non posso accedere a questo file Google Drive.*\n\n"
                "Il file richiede autenticazione Google. Per usarlo:\n"
                "1️⃣ Scaricalo sul tuo dispositivo\n"
                "2️⃣ Mandamelo direttamente qui nel chat\n\n"
                "oppure condividilo con _'Chiunque con il link può visualizzare'_.",
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(f"❌ Errore durante l'analisi: {e}")

    return True


# ── SMM Analyst — review mensile ────────────────────────────────────────────

def _keyboard_analyst_approval() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Approva Piano",  callback_data="analyst_approva"),
         InlineKeyboardButton("✏️ Modifica Piano", callback_data="analyst_modifica")],
    ])

def _applica_piano_changes(changes: dict):
    """Applica le modifiche proposte dall'analyst a piano_editoriale.json."""
    try:
        with open(PIANO_PATH, encoding="utf-8") as f:
            piano = json.load(f)
    except Exception as e:
        return False, str(e)

    rubrica_map = {r["id"]: i for i, r in enumerate(piano.get("rubriche", []))}

    for mod in changes.get("modifiche", []):
        rid   = mod.get("rubrica_id", "")
        campo = mod.get("campo", "")
        val   = mod.get("valore_proposto")
        if rid in rubrica_map and campo:
            piano["rubriche"][rubrica_map[rid]][campo] = val

    # Aggiorna calendario se proposto
    cal_nuovo = changes.get("calendario_aggiornato", {})
    if cal_nuovo:
        piano["calendario_settimanale_tipo"].update(cal_nuovo)

    # Aggiorna versione e data
    piano["meta"]["data_aggiornamento"] = datetime.now().strftime("%Y-%m-%d")
    piano["meta"]["versione_precedente"] = piano["meta"].get("versione", "1.0")
    try:
        v_num = float(piano["meta"].get("versione", "1.0"))
        piano["meta"]["versione"] = f"{v_num + 0.1:.1f}"
    except Exception:
        piano["meta"]["versione"] = "1.1"

    try:
        with open(PIANO_PATH, "w", encoding="utf-8") as f:
            json.dump(piano, f, ensure_ascii=False, indent=2)
        return True, ""
    except Exception as e:
        return False, str(e)

def _fmt_analyst_report(result: dict) -> str:
    """Formatta il report dell'SMM Analyst per Telegram."""
    lines = [f"🧠 *SMM Analyst — Review {result.get('mese_analizzato', '')}*\n"]

    # KPI
    kpi = result.get("kpi_report", {})
    if kpi:
        lines.append("*KPI del mese*")
        emoji_trend = {"+": "📈", "-": "📉", "=": "➡️"}
        for nome, dati in kpi.items():
            if isinstance(dati, dict):
                trend = emoji_trend.get(dati.get("trend", "="), "➡️")
                lines.append(
                    f"  {trend} {nome.replace('_', ' ')}: "
                    f"`{dati.get('valore', 'n/d')}` — _{dati.get('giudizio', '')}_"
                )
        lines.append("")

    # Top post
    top = result.get("top_3_post", [])
    if top:
        lines.append("*Top 3 post*")
        for p in top:
            lines.append(
                f"  {p['posizione']}. *{p.get('rubrica','')}* ({p.get('tipo','')}) "
                f"score `{p.get('score', 0)}`\n"
                f"     _{p.get('insight', '')}_"
            )
        lines.append("")

    # Bottom post
    bot_p = result.get("bottom_3_post", [])
    if bot_p:
        lines.append("*Bottom post*")
        for p in bot_p:
            lines.append(
                f"  ⚠️ *{p.get('rubrica','')}* score `{p.get('score', 0)}` — "
                f"_{p.get('problema', '')}_"
            )
        lines.append("")

    # Rubrica ranking
    rub = result.get("rubrica_performance", [])
    if rub:
        lines.append("*Ranking rubriche*")
        rec_emoji = {"potenziare": "🚀", "mantenere": "✅", "monitorare": "👀",
                     "ridurre": "⬇️", "sospendere": "🛑"}
        for r in rub:
            em = rec_emoji.get(r.get("raccomandazione", ""), "•")
            lines.append(
                f"  {em} *{r.get('rubrica','')}* — "
                f"score {r.get('score_medio',0)} — _{r.get('raccomandazione','')}_"
            )
        lines.append("")

    # Modifiche proposte
    changes = result.get("piano_changes", {}).get("modifiche", [])
    if changes:
        lines.append("*Modifiche proposte al piano*")
        for m in changes:
            lines.append(
                f"  • *{m.get('rubrica_id','')}* — {m.get('campo','')}: "
                f"`{m.get('valore_attuale','')}` → `{m.get('valore_proposto','')}`\n"
                f"    _{m.get('motivo', '')}_"
            )
        lines.append("")

    # Summary
    summary = result.get("executive_summary", "")
    if summary:
        lines.append(f"*Executive Summary*\n_{summary}_")

    return "\n".join(lines)

async def esegui_review_mensile(chat_id: int, bot, force_analytics: bool = False) -> bool:
    """
    Esegue la review mensile SMM:
    1. Aggiorna analytics cache
    2. Legge log + piano
    3. Chiama Claude API con prompt analyst
    4. Manda report + keyboard approvazione su Telegram
    """
    analyst_thread_id = get_thread_id_by_name("smm analyst")
    mm_thread_id      = get_thread_id_by_name("marketing manager")
    target_thread     = analyst_thread_id or mm_thread_id

    async def _notify(msg: str):
        try:
            kw = {"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"}
            if target_thread:
                kw["message_thread_id"] = target_thread
            await bot.send_message(**kw)
        except Exception as e:
            print(f"[Analyst] Notify error: {e}", flush=True)

    await _notify("🧠 *SMM Analyst* — avvio review mensile...\n_(raccolta dati, 30-60s)_")

    # Step 1: analytics
    loop = asyncio.get_event_loop()
    analytics_data = await loop.run_in_executor(
        None, lambda: analytics_fetcher.fetch_all(force=force_analytics)
    )

    # Step 2: leggi log e piano
    try:
        with open(os.path.join(BASE_PATH, "smm_log.json"), encoding="utf-8") as f:
            smm_log = json.load(f)
        # Filtra ultimi 30 giorni
        cutoff = (datetime.now() - __import__("datetime").timedelta(days=30)).isoformat()
        smm_log = [e for e in smm_log if e.get("timestamp", "") >= cutoff][:50]
    except Exception:
        smm_log = []

    try:
        with open(PIANO_PATH, encoding="utf-8") as f:
            piano = json.load(f)
    except Exception:
        piano = {}

    # Step 3: leggi CLAUDE.md dell'analyst come system prompt
    analyst_claude_md = ""
    analyst_kb = ""
    try:
        with open(os.path.join(BASE_PATH, "AGENTI", "smm-analyst", "CLAUDE.md"), encoding="utf-8") as f:
            analyst_claude_md = f.read()
        with open(os.path.join(BASE_PATH, "AGENTI", "smm-analyst", "KNOWLEDGE_BASE.md"), encoding="utf-8") as f:
            analyst_kb = f.read()
    except Exception as e:
        print(f"[Analyst] Errore lettura CLAUDE.md: {e}", flush=True)

    # Step 4: chiama Claude API
    if not ANTHROPIC_API_KEY:
        await _notify("❌ Anthropic API key non trovata — impossibile eseguire review.")
        return False

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    system_prompt = f"{analyst_claude_md}\n\n---\n\n{analyst_kb}"
    user_content  = (
        f"Esegui la review mensile. Dati disponibili:\n\n"
        f"**ANALYTICS CACHE:**\n```json\n{json.dumps(analytics_data, ensure_ascii=False, indent=2)[:8000]}\n```\n\n"
        f"**SMM LOG (ultimi 30gg, {len(smm_log)} voci):**\n```json\n{json.dumps(smm_log, ensure_ascii=False, indent=2)[:4000]}\n```\n\n"
        f"**PIANO EDITORIALE ATTIVO:**\n```json\n{json.dumps(piano, ensure_ascii=False, indent=2)[:4000]}\n```\n\n"
        f"Produci ESCLUSIVAMENTE il JSON di output come specificato nel tuo CLAUDE.md."
    )

    try:
        response = await loop.run_in_executor(None, lambda: client.messages.create(
            model=MODEL_SONNET,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        ))
        raw_text = response.content[0].text.strip()
    except Exception as e:
        await _notify(f"❌ Errore chiamata Claude API: `{e}`")
        return False

    # Step 5: estrai JSON dalla risposta
    import re as _re
    json_match = _re.search(r"\{[\s\S]*\}", raw_text)
    if not json_match:
        await _notify(f"❌ Analyst non ha prodotto JSON valido.\n`{raw_text[:200]}`")
        return False

    try:
        analyst_result = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        await _notify(f"❌ JSON malformato dall'analyst: `{e}`")
        return False

    # Step 6: salva proposta in pending e manda su Telegram
    _pending_analyst[chat_id] = analyst_result

    report_text = _fmt_analyst_report(analyst_result)
    # Telegram ha limite 4096 char per messaggio — split se necessario
    if len(report_text) > 3800:
        report_text = report_text[:3800] + "\n\n_[troncato — vedi log per dettagli]_"

    try:
        kw = {"chat_id": chat_id, "text": report_text,
              "parse_mode": "Markdown", "reply_markup": _keyboard_analyst_approval()}
        if target_thread:
            kw["message_thread_id"] = target_thread
        await bot.send_message(**kw)
    except Exception as e:
        # Fallback senza markdown se parsing fallisce
        kw["parse_mode"] = None
        kw["text"] = report_text.replace("*", "").replace("`", "").replace("_", "")
        try:
            await bot.send_message(**kw)
        except Exception as e2:
            print(f"[Analyst] Errore invio report: {e2}", flush=True)

    return True

async def job_review_mensile(context: ContextTypes.DEFAULT_TYPE):
    """Job schedulato: primo del mese alle 09:00."""
    global _main_chat_id
    if not _main_chat_id:
        print("[Analyst] job_review_mensile: chat_id non ancora registrato — skip.", flush=True)
        return
    print(f"[Analyst] Avvio review mensile automatica — chat_id={_main_chat_id}", flush=True)
    await esegui_review_mensile(_main_chat_id, context.bot, force_analytics=True)

# ── Briefing Quotidiano — 08:00 ─────────────────────────────────────────────

def _load_smm_log(days_back: int = 2) -> list:
    """Carica smm_log.json filtrando le ultime `days_back` giornate."""
    try:
        log_path = os.path.join(BASE_PATH, "smm_log.json")
        with open(log_path, encoding="utf-8") as f:
            log = json.load(f)
        cutoff = (datetime.now(timezone.utc) - __import__("datetime").timedelta(days=days_back)).isoformat()
        return [e for e in log if e.get("timestamp", "") >= cutoff]
    except Exception:
        return []

def _build_daily_briefing() -> tuple[str, list]:
    """
    Costruisce il briefing del giorno.
    Ritorna (testo_telegram, lista_slot_da_produrre).
    """
    piano = _load_piano()
    if not piano:
        return "⚠️ piano_editoriale.json non trovato — briefing non disponibile.", []

    # Giorno corrente
    oggi_nome = _giorno_italiano(datetime.now().weekday())
    oggi_str  = datetime.now().strftime("%d/%m/%Y")
    cal       = piano.get("calendario_settimanale_tipo", {})
    slots     = cal.get(oggi_nome, [])
    rubriche_map = {r["id"]: r for r in piano.get("rubriche", [])}

    # Log oggi (pubblicati o in attesa) — filtra per data odierna
    oggi_date = datetime.now().strftime("%Y-%m-%d")
    log_recente = _load_smm_log(days_back=1)
    pubblicati_oggi = [
        e for e in log_recente
        if e.get("timestamp", "")[:10] == oggi_date
        and e.get("status", "") in ("sent", "completed", "published", "success")
    ]
    # Post con scheduled_date futura = in coda
    now_iso = datetime.now(timezone.utc).isoformat()
    in_coda = [
        e for e in _load_smm_log(days_back=7)
        if e.get("scheduled") and e.get("scheduled", "") > now_iso
        and e.get("status", "") not in ("error", "failed")
    ]

    # Costruisci messaggio
    lines = [f"📋 *Piano del {oggi_str} — {oggi_nome.capitalize()}*\n"]

    slot_da_produrre = []
    if slots:
        for slot in slots:
            rubrica_id   = slot.get("rubrica", "")
            rubrica_info = rubriche_map.get(rubrica_id, {})
            rubrica_nome = rubrica_info.get("nome", rubrica_id)
            piattaforma  = slot.get("piattaforma", "")
            formato      = slot.get("formato", "")
            orario       = slot.get("orario", "")
            # Controlla se c'è già un post pubblicato/inviato oggi per questa piattaforma
            match = any(
                piattaforma.lower() in [p.lower() for p in e.get("platforms", [])]
                for e in pubblicati_oggi
            )
            if match:
                stato_emoji = "✅"
                stato_txt   = "pubblicato"
            else:
                stato_emoji = "❌"
                stato_txt   = "da produrre"
                slot_da_produrre.append(slot)

            lines.append(
                f"  {stato_emoji} *{orario}* → {piattaforma} · "
                f"*{rubrica_nome}* ({formato}) — _{stato_txt}_"
            )
    else:
        lines.append("  📵 Nessun post programmato per oggi.")

    lines.append("")
    lines.append(f"📥 Contenuti in coda (futuri): `{len(in_coda)}`")
    lines.append(f"🎬 Contenuti da produrre: `{len(slot_da_produrre)}`")

    # Avviso se ci sono slot non coperti
    if slot_da_produrre:
        rubriche_mancanti = list({
            rubriche_map.get(s["rubrica"], {}).get("nome", s["rubrica"])
            for s in slot_da_produrre
            if "facebook" not in s.get("piattaforma", "").lower()  # cross-post gestiti automaticamente
        })
        if rubriche_mancanti:
            lines.append(
                f"\n⚡ *Contenuti da creare oggi:*\n" +
                "\n".join(f"  • {n}" for n in rubriche_mancanti)
            )

    if in_coda:
        lines.append("\n📅 *In coda (già schedulati):*")
        for e in in_coda[:3]:
            sched = e.get("scheduled", "")[:16].replace("T", " ")
            plat  = ", ".join(e.get("platforms", []))
            lines.append(f"  ⏰ {sched} UTC — {plat} — `{e.get('status','')}`")

    return "\n".join(lines), slot_da_produrre

def _auto_schedula_pending_content(log_entries: list) -> int:
    """
    Identifica post in smm_log con scheduled_date passata ma status ancora 'sent'
    (Upload-Post non ha confermato) — non agisce, li conta solo per il report.
    Ritorna il numero di post in stato anomalo.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    anomali = [
        e for e in log_entries
        if e.get("scheduled")
        and e["scheduled"] < now_iso
        and e.get("status", "") == "sent"  # scheduled ma non confermato
    ]
    return len(anomali)

async def job_briefing_quotidiano(context: ContextTypes.DEFAULT_TYPE):
    """Job giornaliero: ogni mattina alle 08:00 IT."""
    global _main_chat_id
    if not _main_chat_id:
        print("[Briefing] chat_id non registrato — skip.", flush=True)
        return

    briefing_text, slot_da_produrre = _build_daily_briefing()
    mm_thread_id = get_thread_id_by_name("marketing manager")

    # Controlla post anomali (schedulati ma non confermati)
    log_week = _load_smm_log(days_back=7)
    n_anomali = _auto_schedula_pending_content(log_week)
    if n_anomali > 0:
        briefing_text += (
            f"\n\n⚠️ *Attenzione:* {n_anomali} post schedulati non hanno "
            f"ricevuto conferma da Upload-Post. Scrivi `ANALYTICS` per verificare."
        )

    try:
        kw = {
            "chat_id":    _main_chat_id,
            "text":       briefing_text,
            "parse_mode": "Markdown",
        }
        if mm_thread_id:
            kw["message_thread_id"] = mm_thread_id
        await context.bot.send_message(**kw)
        print(f"[Briefing] Inviato — {len(slot_da_produrre)} slot da produrre oggi.", flush=True)
    except Exception as e:
        print(f"[Briefing] Errore invio: {e}", flush=True)

def _aggiorna_storico_review(result: dict):
    """Aggiorna la tabella storico in KNOWLEDGE_BASE.md dopo approvazione."""
    kb_path = os.path.join(BASE_PATH, "AGENTI", "smm-analyst", "KNOWLEDGE_BASE.md")
    try:
        with open(kb_path, encoding="utf-8") as f:
            content = f.read()
        kpi       = result.get("kpi_report", {})
        mese      = result.get("mese_analizzato", "")
        follower  = kpi.get("follower_growth", {}).get("valore", "—")
        reach     = kpi.get("reach_mensile", {}).get("valore", "—")
        er        = kpi.get("engagement_rate_medio", {}).get("valore", "—")
        n_changes = len(result.get("piano_changes", {}).get("modifiche", []))
        new_row   = f"| {mese} | {follower} | {reach} | {er} | {n_changes} modifiche approvate |"
        # Inserisce prima dell'ultima riga della tabella storico
        marker = "| Aprile 2026 | — | — | — | Prima review — dati baseline |"
        if marker in content:
            content = content.replace(marker, f"{new_row}\n{marker}")
        else:
            content += f"\n{new_row}"
        with open(kb_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"[Analyst] Errore aggiornamento storico KB: {e}", flush=True)

# ── Piano Editoriale — helper commands ───────────────────────────────────────
PIANO_PATH = os.path.join(BASE_PATH, "piano_editoriale.json")

def _load_piano() -> dict:
    """Carica piano_editoriale.json. Ritorna {} se non trovato."""
    try:
        with open(PIANO_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _giorno_italiano(weekday: int) -> str:
    """0=lunedi, 6=domenica."""
    giorni = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
    return giorni[weekday]

def _fmt_piano(piano: dict) -> str:
    """Formatta il piano editoriale in testo leggibile per Telegram."""
    if not piano:
        return "⚠️ piano_editoriale.json non trovato."
    lines = ["📋 *Piano Editoriale Videocraft Studio*\n"]
    for pillar in piano.get("pillar", []):
        lines.append(f"*Pillar {pillar['id']} — {pillar['nome']}*")
    lines.append("")
    for r in piano.get("rubriche", []):
        freq  = r.get("frequenza", "")
        fmt   = r.get("formato", "")
        ora   = r.get("orario_default", "")
        lines.append(f"  `[{r['pillar']}]` *{r['nome']}* — {fmt}, {freq}, {ora}")
    lines.append("")
    kpi_nomi = [k["sigla"] if "sigla" in k else k["nome"] for k in piano.get("kpi_mensili", [])]
    lines.append(f"📊 *KPI:* {' · '.join(kpi_nomi)}")
    return "\n".join(lines)

def _fmt_oggi(piano: dict) -> str:
    """Post previsti per oggi."""
    if not piano:
        return "⚠️ piano_editoriale.json non trovato."
    oggi = _giorno_italiano(datetime.now().weekday())
    cal  = piano.get("calendario_settimanale_tipo", {})
    slot = cal.get(oggi, [])
    if not slot:
        return f"📅 *Oggi ({oggi.capitalize()})* — nessun post programmato.\nGiorno di pausa editoriale."
    rubriche_map = {r["id"]: r["nome"] for r in piano.get("rubriche", [])}
    lines = [f"📅 *Piano di oggi — {oggi.capitalize()}*\n"]
    for s in slot:
        rubrica_nome = rubriche_map.get(s.get("rubrica", ""), s.get("rubrica", ""))
        lines.append(f"  🕐 *{s['orario']}* — {s['piattaforma']} · {rubrica_nome} ({s['formato']})")
    return "\n".join(lines)

def _fmt_settimana(piano: dict) -> str:
    """Piano della settimana corrente."""
    if not piano:
        return "⚠️ piano_editoriale.json non trovato."
    cal = piano.get("calendario_settimanale_tipo", {})
    rubriche_map = {r["id"]: r["nome"] for r in piano.get("rubriche", [])}
    giorni_ordine = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
    lines = ["📆 *Piano della Settimana*\n"]
    for giorno in giorni_ordine:
        slot = cal.get(giorno, [])
        if slot:
            lines.append(f"*{giorno.capitalize()}*")
            for s in slot:
                rubrica_nome = rubriche_map.get(s.get("rubrica", ""), s.get("rubrica", ""))
                lines.append(f"  {s['orario']} {s['piattaforma']} — {rubrica_nome} ({s['formato']})")
        else:
            lines.append(f"*{giorno.capitalize()}* — riposo editoriale")
    return "\n".join(lines)

def _fmt_idee(piano: dict, rubrica_query: str) -> str:
    """Idee contenuto per una rubrica specifica."""
    if not piano:
        return "⚠️ piano_editoriale.json non trovato."
    query = rubrica_query.lower().strip()
    match = None
    for r in piano.get("rubriche", []):
        if query in r["nome"].lower() or query in r["id"].lower():
            match = r
            break
    if not match:
        nomi = [r["nome"] for r in piano.get("rubriche", [])]
        return f"❌ Rubrica *{rubrica_query}* non trovata.\nRubriche disponibili:\n" + "\n".join(f"  • {n}" for n in nomi)
    idee = match.get("idee_contenuto", [])
    lines = [f"💡 *Idee — {match['nome']}*\n",
             f"Formato: {match['formato']} · Freq: {match['frequenza']} · CTA: _{match.get('cta', '')}_\n"]
    for i, idea in enumerate(idee, 1):
        lines.append(f"  {i}. {idea}")
    return "\n".join(lines)


async def gestisci_testo(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or (update.message.from_user and update.message.from_user.is_bot):
        return
    # Registra chat_id principale per job mensile
    global _main_chat_id
    if _main_chat_id is None:
        _main_chat_id = update.message.chat_id
    topics     = carica_topics()
    topic_name = topics.get(str(update.message.message_thread_id), "") if update.message.is_topic_message else ""
    testo      = update.message.text or ""
    chat_id    = update.message.chat_id

    # ── Analisi video long-form ───────────────────────────────────────────────
    if await _gestisci_analizza_video(update, testo):
        return

    # ── Link Google Drive nudo (senza prefisso "ANALIZZA VIDEO:") ────────────
    if "drive.google.com" in testo or "docs.google.com" in testo:
        if await _gestisci_gdrive_link(update, testo):
            return

    # ── Comandi Style Library (priorità massima, prima di tutto il resto) ─────
    if await _gestisci_comandi_stile(update, testo):
        return

    # ── Comandi SMM Publisher ─────────────────────────────────────────────────
    if await _gestisci_comandi_smm(update, testo):
        return

    # ── Comandi TTS / ElevenLabs ──────────────────────────────────────────────
    if await _gestisci_comandi_tts(update, testo):
        return

    # ── Comandi B-roll / Pexels ───────────────────────────────────────────────
    if await _gestisci_comandi_broll(update, testo):
        return

    # ── Testo modifiche dopo aver premuto il pulsante "Modifica" ────────────
    if chat_id in _pending_modifica:
        state = _pending_modifica.pop(chat_id)
        await applica_modifiche(update, ctx, state, testo)
        return

    # ── Risposta testuale legacy (fallback senza pulsanti) ────────────────
    if "video editor" in topic_name.lower() and chat_id in _pending_approval:
        testo_norm = testo.strip().upper()
        if testo_norm in ("OK", "OK.", "OK!", "✅", "SI", "SÌ", "YES"):
            state = _pending_approval.pop(chat_id)
            await update.message.reply_text("✅ Approvato — avvio pubblicazione...")
            await esegui_pubblicazione(update, ctx, state)
            return
        elif testo_norm not in ("NO", "STOP", "ANNULLA", "CANCEL"):
            state = _pending_approval.pop(chat_id)
            await applica_modifiche(update, ctx, state, testo)
            return
        else:
            _pending_approval.pop(chat_id, None)
            await update.message.reply_text("🚫 Pubblicazione annullata.")
            return

    # ── Sistema buffer: gestione comandi e accumulo ───────────────────────────
    testo_norm = testo.strip().upper()
    key = _buffer_key(update)

    # AVVIA → lancia pipeline con tutto il buffer
    if testo_norm in TRIGGER_WORDS:
        await _lancia_pipeline_da_buffer(update, ctx)
        return

    # ANNULLA/CANCELLA → svuota buffer senza lanciare
    if testo_norm in CANCEL_WORDS:
        if key in _buffer:
            entry = _buffer.pop(key)
            task = entry.get("timeout_task")
            if task and not task.done():
                task.cancel()
            await update.message.reply_text(
                "🗑️ Buffer svuotato. Rimanda i file quando sei pronto."
            )
        else:
            await update.message.reply_text("ℹ️ Nessun buffer attivo da svuotare.")
        return

    # STATO → mostra contenuto attuale del buffer
    if testo_norm in ("STATO", "STATUS", "BUFFER"):
        if key in _buffer:
            entry = _buffer[key]
            sommario = _buffer_summary(entry)
            await update.message.reply_text(
                f"📋 *Buffer attivo*:\n{sommario}\n\n"
                "Scrivi *AVVIA* per lanciare · *ANNULLA* per svuotare.",
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(
                "ℹ️ Nessun buffer attivo.\nInvia audio, video o file per iniziare."
            )
        return

    # PIANO → piano editoriale completo
    if testo_norm == "PIANO":
        piano = _load_piano()
        await update.message.reply_text(_fmt_piano(piano), parse_mode="Markdown")
        return

    # OGGI → briefing completo con stato produzione
    if testo_norm == "OGGI":
        briefing_text, _ = _build_daily_briefing()
        await update.message.reply_text(briefing_text, parse_mode="Markdown")
        return

    # SETTIMANA → piano della settimana corrente
    if testo_norm == "SETTIMANA":
        piano = _load_piano()
        await update.message.reply_text(_fmt_settimana(piano), parse_mode="Markdown")
        return

    # IDEE [rubrica] → idee contenuto per quella rubrica
    if testo_norm.startswith("IDEE"):
        piano = _load_piano()
        rubrica_query = testo.strip()[4:].strip()  # tutto dopo "IDEE"
        if not rubrica_query:
            nomi = [r["nome"] for r in piano.get("rubriche", [])]
            await update.message.reply_text(
                "💡 *Uso:* IDEE [nome rubrica]\n\nRubriche disponibili:\n" +
                "\n".join(f"  • {n}" for n in nomi),
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(_fmt_idee(piano, rubrica_query), parse_mode="Markdown")
        return

    # ANALYTICS → metriche Instagram ultimo mese
    if testo_norm == "ANALYTICS":
        cached = analytics_fetcher.get_cached()
        if cached:
            age_info = f"_Cache di {cached.get('cached_at','')[:16].replace('T',' ')} UTC_"
            await update.message.reply_text(
                analytics_fetcher.fmt_analytics_report(cached) + f"\n\n{age_info}\n"
                "_Scrivi_ `ANALYTICS AGGIORNA` _per dati freschi._",
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(
                "📡 Nessuna cache disponibile. Avvio fetch da Meta Graph API...\n"
                "_(può richiedere 30-60 secondi)_",
                parse_mode="Markdown"
            )
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, lambda: analytics_fetcher.fetch_all(force=False))
            await update.message.reply_text(
                analytics_fetcher.fmt_analytics_report(data),
                parse_mode="Markdown"
            )
        return

    # ANALYTICS AGGIORNA → forza nuovo fetch da Meta
    if testo_norm in ("ANALYTICS AGGIORNA", "ANALYTICS REFRESH"):
        await update.message.reply_text(
            "📡 Aggiornamento analytics da Meta Graph API...\n_(30-60 secondi)_",
            parse_mode="Markdown"
        )
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, lambda: analytics_fetcher.fetch_all(force=True))
        await update.message.reply_text(
            analytics_fetcher.fmt_analytics_report(data),
            parse_mode="Markdown"
        )
        return

    # REVIEW → lancia review mensile manualmente
    if testo_norm == "REVIEW":
        chat_id = update.message.chat_id
        await esegui_review_mensile(chat_id, ctx.bot, force_analytics=False)
        return

    # REVIEW FORZA → review con fetch analytics fresco
    if testo_norm in ("REVIEW FORZA", "REVIEW FORCE"):
        chat_id = update.message.chat_id
        await esegui_review_mensile(chat_id, ctx.bot, force_analytics=True)
        return

    # Se c'è già un buffer aperto → accoda il testo
    if key in _buffer:
        _buffer[key]["texts"].append(testo.strip())
        _buffer_reset_timer(key, ctx.bot)
        sommario = _buffer_summary(_buffer[key])
        await update.message.reply_text(
            f"📌 Testo aggiunto al buffer.\n{sommario}\n\nScrivi *AVVIA* quando sei pronto.",
            parse_mode="Markdown"
        )
        return

    # Nessun buffer aperto → comportamento immediato
    if "marketing manager" in topic_name.lower():
        # Se il testo contiene trigger TTS → flusso TTS (testo → voce → pipeline)
        if _is_tts_request(testo):
            await _pipeline_tts(update, ctx, testo, topic_name)
            return
        # PROBLEMA 1 FIX: testo puro senza audio/video → task ad-hoc, NON pipeline.
        # La pipeline si avvia SOLO via AVVIA con audio/video nel buffer.
        await processa_input(update, ctx, testo, topic_name)
        return
    await processa_input(update, ctx, testo, topic_name)

async def gestisci_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Gestisce i pulsanti inline post-pipeline."""
    query   = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    data    = query.data

    # Rimuove la keyboard dal messaggio che ha scatenato l'azione
    try:
        await query.edit_message_reply_markup(reply_markup=None)
    except Exception:
        pass

    # ── Callbacks carosello ───────────────────────────────────────────────────
    if data == "carosello_pubblica":
        state = _pending_carosello.pop(chat_id, None)
        if not state:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessun carosello in attesa.")
            return
        card_id  = state.get("card_id")
        caption  = state.get("caption_full", "")
        paths    = state.get("slide_paths", [])
        caption_dict = state.get("caption_dict") or {}
        if card_id:
            dashboard_step(card_id, "review", "done", "Approvato")
            dashboard_conclude_card(card_id, "Pubblicato")
        await ctx.bot.send_message(chat_id=chat_id, text="🚀 Pubblicazione carosello avviata...")
        try:
            cliente = "VideoCraft Studio"
            plat_cfg = smm_publisher.get_client_config(cliente)
            ig_caption  = caption_dict.get("instagram", caption)
            fb_caption  = caption_dict.get("facebook", caption)
            result = await smm_publisher.publish_carousel_with_retry(
                image_paths=paths,
                caption_ig=ig_caption,
                caption_fb=fb_caption,
                client_config=plat_cfg,
            )
            await ctx.bot.send_message(
                chat_id=chat_id,
                text=f"✅ Carosello pubblicato!\n{result}",
            )
        except AttributeError:
            # publish_carousel_with_retry non ancora implementato in smm_publisher
            await ctx.bot.send_message(
                chat_id=chat_id,
                text=(
                    f"⚠️ Pubblicazione automatica carosello non ancora disponibile in smm_publisher.\n"
                    f"Le slide sono in: {state.get('output_dir', '—')}\n"
                    f"Caption IG: {caption[:200]}"
                ),
            )
        except Exception as e:
            await ctx.bot.send_message(chat_id=chat_id, text=f"❌ Errore pubblicazione: {e}")

    elif data == "carosello_schedula":
        state = _pending_carosello.pop(chat_id, None)
        if not state:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessun carosello in attesa.")
            return
        card_id = state.get("card_id")
        if card_id:
            dashboard_step(card_id, "review", "done", "Approvato — Schedulato")
            dashboard_conclude_card(card_id, "Approvato")
        schedule_iso, schedule_label = smm_publisher.calculate_schedule_date()
        await ctx.bot.send_message(
            chat_id=chat_id,
            text=(
                f"📅 Carosello schedulato per {schedule_label}.\n"
                f"Le slide sono in: {state.get('output_dir', '—')}"
            ),
        )

    elif data == "carosello_modifica":
        state = _pending_carosello.get(chat_id)
        if not state:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessun carosello in attesa.")
            return
        cd_thread = state.get("cd_thread_id") or state.get("mm_thread_id")
        msg = (
            "✏️ Descrivi le modifiche da apportare al carosello.\n"
            "Quando hai finito di descriverle, invia il messaggio e rilancerò la pipeline."
        )
        if cd_thread:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=cd_thread, text=msg)
        else:
            await ctx.bot.send_message(chat_id=chat_id, text=msg)

    elif data == "carosello_scarta":
        state = _pending_carosello.pop(chat_id, None)
        card_id = (state or {}).get("card_id")
        if card_id:
            dashboard_conclude_card(card_id, "Approvato")
        await ctx.bot.send_message(chat_id=chat_id, text="🗑 Carosello scartato.")

    elif data == "pipeline_termina":
        state = _pending_approval.pop(chat_id, None)
        _pending_modifica.pop(chat_id, None)
        if state:
            card_id = state.get("dashboard_card_id")
            if card_id:
                dashboard_step(card_id, "review", "done", "Pipeline conclusa dall'utente.")
                dashboard_conclude_card(card_id, "Approvato")
        await ctx.bot.send_message(chat_id=chat_id, text="✅ Pipeline conclusa.")

    elif data == "pipeline_pubblica":
        state = _pending_approval.pop(chat_id, None)
        if not state:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessuna pipeline attiva.")
            return
        card_id = state.get("dashboard_card_id")
        if card_id:
            dashboard_conclude_card(card_id, "Pubblicato")
        await ctx.bot.send_message(chat_id=chat_id, text="🚀 Pubblicazione immediata avviata...")
        await esegui_pubblicazione(update, ctx, state, chat_id=chat_id)

    elif data == "pipeline_schedula":
        state = _pending_approval.pop(chat_id, None)
        if not state:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessuna pipeline attiva.")
            return
        # Calcola prossimo slot ottimale dal piano editoriale
        schedule_iso, schedule_label = smm_publisher.calculate_schedule_date()
        # Inietta la data schedulata nello state (letta da esegui_pubblicazione)
        mm_brief = state.get("mm_brief") or {}
        mm_brief["scheduled_date"] = schedule_iso
        state["mm_brief"] = mm_brief
        # Recupera piattaforme del cliente per la notifica
        mm_brief_data   = state.get("mm_brief") or {}
        script_data     = state.get("script_json") or {}
        cliente_notion  = (mm_brief_data.get("cliente") or mm_brief_data.get("client") or
                           script_data.get("client") or "VideoCraft Studio")
        plat_cfg        = smm_publisher.get_client_config(cliente_notion)
        plat_attive     = plat_cfg.get("platforms", []) if plat_cfg else []
        plat_str        = ", ".join(f"`{p}`" for p in plat_attive) if plat_attive else "_non configurate_"
        card_id = state.get("dashboard_card_id")
        if card_id:
            dashboard_conclude_card(card_id, "Schedulato")
        await ctx.bot.send_message(
            chat_id=chat_id,
            text=(
                f"📅 *Scheduling confermato*\n"
                f"Data: *{schedule_label}*\n"
                f"Piattaforme: {plat_str}\n\n"
                f"_Il post verrà pubblicato automaticamente da Upload-Post._"
            ),
            parse_mode="Markdown"
        )
        await esegui_pubblicazione(update, ctx, state, chat_id=chat_id)

    elif data == "pipeline_modifica":
        if chat_id not in _pending_approval:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessuna pipeline attiva.")
            return
        _pending_modifica[chat_id] = _pending_approval.pop(chat_id)
        await ctx.bot.send_message(
            chat_id=chat_id,
            text="✏️ Scrivi le modifiche da fare — le applico subito al video."
        )

    elif data == "pipeline_carosello":
        state = _pending_approval.get(chat_id)
        if not state:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessuna pipeline attiva.")
            return
        card_id = state.get("dashboard_card_id")
        if card_id:
            dashboard_step(card_id, "carosello", "active", "Cover Designer in esecuzione...")
        cover_thread_id = get_thread_id_by_name("cover designer")
        if cover_thread_id:
            await ctx.bot.send_message(chat_id=chat_id, message_thread_id=cover_thread_id,
                                       text="🎨 Cover Designer — avvio carosello...")
        mm_brief   = state.get("mm_brief") or {}
        script_json= state.get("script_json") or {}
        strategy   = state.get("strategy_json") or {}
        brief      = state.get("brief_compresso") or state.get("testo", "")
        visual_json, cover_images, _ = await chiama_cover_designer(
            script_json, strategy, brief, mm_brief=mm_brief
        )
        if card_id:
            dashboard_step(card_id, "carosello", "done",
                           f"{len(cover_images)} slide generate")
        # Invia immagini nel topic cover designer (o chat principale)
        if cover_thread_id:
            for img_path in cover_images:
                if os.path.exists(img_path):
                    with open(img_path, "rb") as img_f:
                        await ctx.bot.send_photo(
                            chat_id=chat_id, message_thread_id=cover_thread_id,
                            photo=img_f, caption=os.path.basename(img_path)
                        )
        else:
            for img_path in cover_images:
                if os.path.exists(img_path):
                    with open(img_path, "rb") as img_f:
                        await ctx.bot.send_photo(chat_id=chat_id, photo=img_f,
                                                 caption=os.path.basename(img_path))
        # Rimanda keyboard per prossima azione
        await ctx.bot.send_message(
            chat_id=chat_id,
            text=f"🎨 Carosello pronto — {len(cover_images)} slide. Cosa vuoi fare?",
            reply_markup=_keyboard_post_pipeline()
        )

    elif data == "analyst_approva":
        proposed = _pending_analyst.pop(chat_id, None)
        if not proposed:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessuna review in attesa.")
            return
        ok, err = _applica_piano_changes(proposed.get("piano_changes", {}))
        mese    = proposed.get("mese_analizzato", "")
        if ok:
            v = ""
            try:
                with open(PIANO_PATH, encoding="utf-8") as f:
                    p = json.load(f)
                v = p.get("meta", {}).get("versione", "")
            except Exception:
                pass
            n_changes = len(proposed.get("piano_changes", {}).get("modifiche", []))
            # Aggiorna KNOWLEDGE_BASE con riga storico
            _aggiorna_storico_review(proposed)
            await ctx.bot.send_message(
                chat_id=chat_id,
                text=(
                    f"✅ *Piano approvato e aggiornato!*\n"
                    f"Mese: {mese}\n"
                    f"Modifiche applicate: {n_changes}\n"
                    f"Nuova versione piano: `{v}`\n\n"
                    f"_Il piano editoriale aggiornato è attivo dal mese prossimo._"
                ),
                parse_mode="Markdown"
            )
        else:
            await ctx.bot.send_message(
                chat_id=chat_id,
                text=f"❌ Errore nell'applicare le modifiche: `{err}`",
                parse_mode="Markdown"
            )

    elif data == "analyst_modifica":
        if chat_id not in _pending_analyst:
            await ctx.bot.send_message(chat_id=chat_id, text="⚠️ Nessuna review in attesa.")
            return
        await ctx.bot.send_message(
            chat_id=chat_id,
            text=(
                "✏️ *Modifica al piano proposto*\n"
                "Scrivi le tue modifiche (es: 'mantieni Gear & Tools, aumenta AI News Decoded a 1x/sett').\n"
                "Dopo la modifica ti rimando il piano aggiornato per approvazione finale."
            ),
            parse_mode="Markdown"
        )


async def status(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    api_status = "✅ API Anthropic attiva" if ANTHROPIC_API_KEY else "⚠️ CLI fallback"
    await update.message.reply_text(f"🤖 Bot online\n{api_status}\n📋 {json.dumps(carica_topics(), indent=2)}")

async def registra_topic(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if update.message and update.message.is_topic_message:
        thread_id = str(update.message.message_thread_id)
        testo     = update.message.text or ""
        if testo.startswith("/topic "):
            nome   = testo.replace("/topic ", "").strip().lower()
            topics = carica_topics()
            topics[thread_id] = nome
            salva_topics(topics)
            await update.message.reply_text(f"✅ Topic: {nome}")

app = (
    ApplicationBuilder()
    .token(TOKEN)
    .connect_timeout(30)
    .read_timeout(30)
    .write_timeout(60)
    .build()
)
app.add_handler(CommandHandler("status", status))
app.add_handler(CommandHandler("topic", registra_topic))
app.add_handler(CallbackQueryHandler(gestisci_callback))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, gestisci_testo))
app.add_handler(MessageHandler(filters.VOICE | filters.AUDIO, gestisci_audio))
app.add_handler(MessageHandler(filters.VIDEO, gestisci_video))
app.add_handler(MessageHandler(filters.PHOTO, gestisci_foto))
app.add_handler(MessageHandler(filters.Document.ALL, gestisci_documento))

# ── SMM Publisher: imposta loop asyncio e avvia webhook server ────────────────
smm_publisher.set_bot_loop(asyncio.get_event_loop())
smm_publisher.start_webhook_server()

# ── SMM Analyst: job mensile ogni 1° del mese alle 09:00 ora italiana ─────────
# UTC+2 (CEST, aprile-ottobre): 09:00 IT = 07:00 UTC
# UTC+1 (CET, nov-marzo):       09:00 IT = 08:00 UTC
import datetime as _dt
if app.job_queue:
    # Review mensile: primo del mese 09:00 IT (07:00 UTC, CEST)
    app.job_queue.run_monthly(
        callback=job_review_mensile,
        when=_dt.time(hour=7, minute=0, tzinfo=timezone.utc),
        day=1,
        name="smm_analyst_monthly_review",
    )
    print("📅 Job mensile SMM Analyst schedulato: primo del mese 09:00 IT", flush=True)

    # Briefing quotidiano: ogni giorno 10:00 IT (08:00 UTC, CEST)
    app.job_queue.run_daily(
        callback=job_briefing_quotidiano,
        time=_dt.time(hour=8, minute=0, tzinfo=timezone.utc),
        name="smm_briefing_quotidiano",
    )
    print("🌅 Job briefing quotidiano schedulato: ogni giorno 10:00 IT", flush=True)
else:
    print("⚠️  job_queue non disponibile — installa APScheduler: pip install apscheduler", flush=True)

print("🤖 Il Marchese Bot avviato!", flush=True)
app.run_polling()
