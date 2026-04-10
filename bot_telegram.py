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
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, CommandHandler, ContextTypes, filters
from datetime import datetime
import smm_publisher
import style_library

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

# Propaga la chiave e BASE_PATH alla Style Library
style_library.API_KEY   = ANTHROPIC_API_KEY
style_library.BASE_PATH = BASE_PATH

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
MAX_BRIEF    = 400
MAX_SCRIPT   = 1200
MAX_STRATEGY = 800
MAX_VISUAL   = 600
MAX_OUTPUT   = 300

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
DASHBOARD_URL  = os.environ.get("DASHBOARD_URL",  "http://localhost:3000")
DASHBOARD_DATA = os.environ.get("DASHBOARD_DATA", r"C:\Users\super\Desktop\ai-command-center\data")
OUTPUT_BASE    = os.environ.get("OUTPUT_BASE",    r"C:\Users\super\Desktop\OUTPUT")

# ── Notion integration ────────────────────────────────────────────────────────
NOTION_TOKEN         = "os.environ.get("NOTION_TOKEN", "")"
NOTION_VERSION       = "2022-06-28"
NOTION_DB_PRODUZIONE = "0f72df6fb7db432b81e8e8e865c8736b"  # 💰 Contabilità Mensile
NOTION_DB_COSTI      = "e1bcc557be4a443bb60ff66b01f91c7a"  # 🔧 Costi Fissi Mensili
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
_ultimo_audio_path: str | None = None   # path del file audio corrente in video-editor/public/
_costi_pipeline: dict[str, float] = {}  # { card_id: costo_totale_usd } — accumulato dagli agenti

# ── Sistema buffer messaggi ───────────────────────────────────────────────────
# Chiave: (chat_id, thread_id) — supporta topic multipli
# Valore: dict con audios, texts, images, docs, topic_name, timeout_task
TRIGGER_WORDS       = {"AVVIA", "GO", "START", "VAI"}
CANCEL_WORDS        = {"ANNULLA", "CANCELLA", "CLEAR", "RESET", "SVUOTA"}
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
        await update.message.reply_text(
            f"📥 Ricevuto! ({n_audio} audio in buffer) Manda altri file o istruzioni se ne hai, oppure scrivi AVVIA per far partire la pipeline."
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

    # BUG FIX 2: il topic Marketing Manager deve avviare la pipeline video
    if "marketing manager" in topic_name.lower():
        topic_name = "video editor"

    await update.message.reply_text(
        f"🚀 *AVVIA* — elaboro il pacchetto:\n{_buffer_summary(entry)}",
        parse_mode="Markdown"
    )

    trascrizioni   = []
    audio_dur_secs = []   # durate in secondi di ogni audio/video — per BUG FIX 1

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
            parti  = []
            for chunk_path in chunks:
                parti.append(_transcribe_with_retry(chunk_path))
            trascrizioni.append(" ".join(parti).strip())

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
            parti  = []
            for chunk_path in chunks:
                parti.append(_transcribe_with_retry(chunk_path))
            trascrizioni.append(" ".join(parti).strip())

            os.unlink(vid_path)
            if os.path.exists(aud_path):
                os.unlink(aud_path)
            if os.path.exists(chunk_dir):
                shutil.rmtree(chunk_dir, ignore_errors=True)
        except Exception as e:
            await update.message.reply_text(f"⚠️ Errore elaborazione {label}: {e}")

    # ── Durata audio totale (BUG FIX 1) ──────────────────────────────────────
    # Usiamo la somma di tutte le tracce audio (se più audio, voiceover = concatenazione)
    audio_dur_sec = sum(audio_dur_secs) if audio_dur_secs else None
    if audio_dur_sec:
        print(f"[Buffer] Durata audio totale: {audio_dur_sec:.2f}s → "
              f"{round(audio_dur_sec * 30)} frame @ 30fps", flush=True)

    # ── Costruisce il testo da passare alla pipeline ──────────────────────────
    direttive_cliente = "\n".join(testi) if testi else ""

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
VIDEO_EDITOR_PATH = os.path.join(BASE_PATH, "video-editor")
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
}
AGENTE_NOME = {
    "smm-researcher":   "SMM Researcher",
    "smm-publisher":    "SMM Publisher",
    "copywriter":       "Copywriter",
    "strategist":       "Strategist",
    "cover-designer":   "Cover Designer",
    "video-editor":     "Video Editor",
    "marketing-manager":"Marketing Manager",
}
PIPELINE_SEMPLICE = ["copywriter", "strategist", "video-editor"]
PIPELINE_COMPLETA = ["copywriter", "strategist", "cover-designer", "video-editor"]

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
- Non usare newline \\n nei valori stringa del JSON"""

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
}

# Tool concessi a ogni agente quando gira come Claude Code subprocess
_ALLOWED_TOOLS: dict[str, str] = {
    "marketing-manager": "Read,Write,Bash,WebSearch,WebFetch,Glob",
    "copywriter":        "Read,Write,Glob",
    "strategist":        "Read,Write,Bash,WebSearch,WebFetch,Glob",
    "cover-designer":    "Read,Write,Bash,Glob",
    "video-editor":      "Read,Write,Edit,Bash,Glob,Grep",
    "smm-publisher":     "Read,Write,Bash,Glob",
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

async def _esegui_con_claude_code(
    task_prompt: str,
    agente_id: str,
    file_paths: list[str] | None = None,
    timeout_sec: int = 300,
) -> tuple[str, list[str]]:
    """
    Lancia Claude Code come subprocess con il CLAUDE.md dell'agente come contesto.
    Il CLAUDE.md in agents/{agente_id}/ viene letto automaticamente da Claude Code
    perché è nella directory padre del workspace (cwd).

    Ritorna (testo_risposta, lista_nuovi_file_generati).
    """
    workspace = os.path.join(BASE_PATH, "agents", agente_id, "workspace")
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

        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(input=full_prompt.encode("utf-8")),
                timeout=timeout_sec,
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            return f"⏱️ Timeout ({timeout_sec}s) — task troppo lungo. Semplifica la richiesta.", []

        if stderr_b:
            snippet = stderr_b.decode("utf-8", errors="replace")[:300]
            print(f"[CC/{agente_id}] stderr: {snippet}", flush=True)

        stdout_text = stdout_b.decode("utf-8", errors="replace")

        # Parse output JSON di Claude Code
        try:
            data = json.loads(stdout_text)
            if isinstance(data, list):
                # stream-json: raccogli tutti i "result"
                parts = [d.get("result", "") for d in data
                         if isinstance(d, dict) and d.get("type") == "result"]
                risposta = "\n".join(p for p in parts if p) or stdout_text
            else:
                risposta = data.get("result", data.get("content", stdout_text))
                if isinstance(risposta, list):
                    risposta = " ".join(
                        r.get("text", "") for r in risposta
                        if isinstance(r, dict)
                    )
        except Exception:
            risposta = stdout_text

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
) -> tuple[str, list[str]]:
    """
    Router intelligente per task ad-hoc degli agenti.

    • Claude Code  → task con generazione file (keyword: crea, genera, produci...)
    • Claude API   → analisi/risposta testuale  (keyword: analizza, spiega, dimmi...)

    Ritorna (testo_risposta, file_generati).
    """
    if _richiede_claude_code(user_text):
        print(f"[Router] {agente_id} → Claude Code (task generativo)", flush=True)
        return await _esegui_con_claude_code(user_text, agente_id, file_paths)
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


def _anthropic_call(system_text, user_content, model, max_tokens=1200):
    """
    Chiama l'API Anthropic con prompt caching sul system prompt.
    Il system_text viene cachato: alla 2ª+ chiamata non viene riconteggiato.
    """
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": [
            {
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"}   # ← prompt caching
            }
        ],
        "messages": [{"role": "user", "content": user_content}]
    }
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "content-type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31"
        }
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
        raise RuntimeError(f"API {e.code}: {body}")

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
    """Claude CLI — async non-bloccante. Usato per Video Editor e fallback."""
    path       = os.path.join(BASE_PATH, cartella)
    claude_bin = os.environ.get("CLAUDE_BIN", r"C:\Users\super\.local\bin\claude.exe")
    cmd = [claude_bin, "--print", "--dangerously-skip-permissions"]
    if model:
        cmd.extend(["--model", model])
    cmd.append(prompt)
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=TIMEOUT)
        output = stdout_b.decode("utf-8", errors="replace") if stdout_b else ""
        stderr = stderr_b.decode("utf-8", errors="replace") if stderr_b else ""

        print(f"[CLI/{cartella}] exit={proc.returncode} stdout={len(output)}chars stderr={len(stderr)}chars", flush=True)
        if stderr.strip():
            print(f"[CLI/{cartella}] STDERR: {stderr[:500]}", flush=True)

        if not output.strip():
            print(f"[CLI/{cartella}] Output vuoto!", flush=True)
            return "Completato senza output"

        if cartella == "video-editor":
            print(f"[CLI/video-editor] Output completo: {len(output)} chars", flush=True)
            return output

        return output[-6000:] if len(output) > 6000 else output
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
        istruzioni   = mm_brief.get("istruzioni_copywriter", "")
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
        user_content = (
            f"{dur_block}{dir_block}"
            f"ISTRUZIONI MARKETING MANAGER:\n{istruzioni}\n\n"
            f"HOOK OBBLIGATORIO: {hook_mm}\n"
            f"CTA OBBLIGATORIA: {cta_mm}\n"
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
        raw, usage = _anthropic_call(_SYS_COPYWRITER, user_content, MODEL_HAIKU, max_tokens=3000)
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
        raw, usage = _anthropic_call(_SYS_STRATEGIST, user_msg, MODEL_HAIKU, max_tokens=800)
        dashboard_agent_cost(card_id, "strategist", "Strategist", MODEL_HAIKU, usage)
    else:
        prompt = f"""Sei lo Strategist. Analizza lo script e le istruzioni MM. Rispondi SOLO con JSON valido.
{user_msg}
Schema: {{"curve":[{{"s":"timing","risk":"low|mid|high","fix":"azione"}}],"reengagement":"timing","directives":["direttiva"]}}"""
        raw = await lancia_agente_cli("strategist", prompt, MODEL_HAIKU)
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

BRIEF: {brief[:500] if brief else hook}
HOOK (headline principale): "{hook}"
CTA: "{cta}"
SCRIPT:
{script_txt}
{mm_visual}DIRETTIVE STRATEGIST: {directives[:800]}
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

async def chiama_video_editor(script_json, strategy_json, visual_json, brief, tsx_pre_saved=None, mm_brief=None, audio_path=None, audio_dur_sec: float | None = None):
    """
    Genera i file TSX Remotion uno per volta — una chiamata CLI separata per ogni file.
    Ogni file viene verificato (min 1500 bytes) e riprocessato individualmente se troppo piccolo.
    Ritorna (salvati: list[str], summary: str).
    """
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
    if mm_brief:
        dir_cliente = mm_brief.get("direttive_cliente", "")
        dir_block   = f"⚠️ DIRETTIVE CLIENTE [OBBLIGATORIE]:\n{dir_cliente}\n\n" if dir_cliente else ""
        mm_ve_note = (
            f"{dur_constraint}{dir_block}"
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

{modifiche_testo[:3000]}

⚠️ REGOLA: applica ESATTAMENTE queste modifiche.
Se contraddicono regole default (font, colori, animazioni) → le MODIFICHE PREVALGONO SEMPRE.
Non chiedere, non ignorare, non interpretare: esegui letteralmente.

"""
    else:
        modifiche_block = ""

    brief_note = f"\nNOTE AGGIUNTIVE: {brief[:2000]}\n" if (brief and not is_modifiche) else ""
    ctx_block = f"""CONTESTO VIDEO:
DURATA: {duration}s = {total_frames} frame @ 30fps | FORMATO: 1080x1920 (9:16)
PALETTE COLORI: {colors}
FONT: {fonts}
{mm_ve_note}{audio_note}{brief_note}
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

    # 1. theme.ts
    FILE_SPECS.append({
        "name": "theme.ts",
        "path": os.path.join(src_dir, "theme.ts"),
        "spec": f"""Esporta `export const THEME` con struttura completa:
- colors: hook, body, cta, text (#ffffff), accent (#39FF14), muted, accentSoft — dalla palette ricevuta
- fonts: main (Orbitron), accent (AlfenaPixel), sizeHero ("72px"), sizeBody ("36px"), sizeSub ("24px"), weightBlack (900)
- durations: {{ {theme_durations} total: {total_frames_real} }}
- springs: {{ aggressive: {{damping:6,stiffness:300}}, standard: {{damping:12,stiffness:150}}, soft: {{damping:18,stiffness:120}}, cta: {{damping:8,stiffness:220}} }}
- anchor: {{ height: 3, color: "#39FF14", glow: "0 0 10px #39FF14, 0 0 20px #39FF14" }}
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
- MAX 3-4 PAROLE CHIAVE su schermo (estrai dal voiceover) — font grande 80-140px Orbitron 900
- Voiceover testuale → barra sottile bottom (height 40px, font 22px) — subordinata al grafico
- Ancora visiva: barra neon {s['frames']}f verde bottom (THEME.anchor)
- Fade out ultimi 8 frame: interpolate(frame,[{s['frames']}-8,{s['frames']}],[1,0],{{extrapolateLeft:'clamp',extrapolateRight:'clamp'}})
- Almeno 2 elementi grafici animati (linee neon, cerchi, barre, glitch, counter)
- inputRange STRETTAMENTE crescente
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

    for spec in FILE_SPECS:
        nome      = spec["name"]
        file_path = spec["path"]

        for tentativo in range(2):
            retry_note = (
                f"\n⚠️ RETRY #{tentativo+1}: il file precedente era solo "
                f"{os.path.getsize(file_path) if os.path.exists(file_path) else 0} bytes — "
                "scrivi TUTTO il codice reale, non usare placeholder o commenti come '// ...'."
            ) if tentativo > 0 else ""

            prompt = f"""COMPITO: Scrivi SOLO il file `{nome}`. Un singolo file, nient'altro.

{modifiche_block}{ctx_block}

━━━ SPECIFICA {nome} ━━━
{spec['spec']}
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
- ⚠️ DESIGN: VIDEO GRAFICO — max 3-4 PAROLE per schermo, font grandi (80-140px), elementi grafici animati (linee, cerchi, barre neon). Il testo verbale lungo va SOLO nella barra sottotitoli in basso, piccolo (22px)
- ⚠️ EASING — nomi ESATTI validi in Remotion: Easing.linear, Easing.ease, Easing.quad, Easing.cubic, Easing.sin (NON .sine), Easing.exp (NON .expo), Easing.circle, Easing.bounce, Easing.bezier(x1,y1,x2,y2), Easing.in/out/inOut(fn). MAI usare Easing.sine o Easing.expo (non esistono → undefined → TypeError). Easing va SOLO come parametro easing: dentro interpolate(), mai chiamato standalone. Import: import {{interpolate, Easing}} from 'remotion'"""

            print(f"[VE] Generazione {nome} (tentativo {tentativo+1}/2)...", flush=True)
            await lancia_agente_cli("video-editor", prompt)

            # Verifica dimensione file scritto su disco
            size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            if size >= MIN_FILE_SIZE:
                print(f"[VE] ✅ {nome}: {size} bytes", flush=True)
                if file_path not in salvati:
                    salvati.append(file_path)
                summary_parts.append(f"{nome}:{size}B")
                break
            else:
                print(f"[VE] ⚠️ {nome}: {size} bytes < {MIN_FILE_SIZE} — {'retry' if tentativo == 0 else 'accetto comunque'}", flush=True)
                if tentativo == 1:
                    if os.path.exists(file_path) and size > 0:
                        salvati.append(file_path)
                    summary_parts.append(f"{nome}:{size}B⚠️")

    summary = "VE per-file: " + " | ".join(summary_parts)
    print(f"[VE] Completato — {len(salvati)}/{len(FILE_SPECS)} file salvati", flush=True)
    return salvati, summary

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

async def esegui_pubblicazione(update, ctx, state: dict):
    """Pubblica il video già approvato (OK ricevuto): aggiorna dashboard e invia al topic Output."""
    chat_id          = update.message.chat_id
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
    salvati_new, ve_summary = await chiama_video_editor(
        state.get("script_json"),
        state.get("strategy_json"),
        state.get("visual_json"),
        brief_modifiche,
        tsx_pre_saved=state.get("salvati"),
        mm_brief=state.get("mm_brief"),
        audio_path=_ultimo_audio_path,
    )
    salvati_new = salvati_new or state.get("salvati", [])

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

    cap_base = f"🎬 Video aggiornato ({size_mb:.1f} MB){style_note_mod}\nRispondi OK per pubblicare oppure dimmi le modifiche da fare"

    if ve_thread_id:
        await ctx.bot.send_video(
            chat_id=chat_id, message_thread_id=ve_thread_id,
            video=open(video_path, "rb"),
            caption=cap_base,
        )
    elif mm_thread_id:
        await ctx.bot.send_video(
            chat_id=chat_id, message_thread_id=mm_thread_id,
            video=open(video_path, "rb"),
            caption=cap_base,
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

    if agente == "video-editor":
        brief_compresso   = comprimi_trascrizione(testo, MAX_BRIEF)
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

        script_json        = None
        strategy_json      = None
        visual_json        = None
        tsx_skeleton_files = None
        step_map           = {"copywriter": "brief-creativo", "strategist": "strategia",
                              "cover-designer": "carosello",  "video-editor": "video-remotion"}

        for step, agente_corrente in enumerate(pipeline_forzata, 1):
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
                salvati, ve_summary = await chiama_video_editor(
                    script_json, strategy_json, visual_json, brief_compresso,
                    tsx_pre_saved=tsx_skeleton_files, mm_brief=mm_brief,
                    audio_path=_ultimo_audio_path, audio_dur_sec=audio_dur_sec
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
                        if os.path.exists(root_path):
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

                        caption = (f"🎬 Video pronto ({size_mb:.1f} MB){dur_warning}{style_note}\n"
                                   "Rispondi OK per pubblicare oppure dimmi le modifiche da fare")
                        if send_thread:
                            with open(video_path, "rb") as vf:
                                await ctx.bot.send_video(chat_id=chat_id, message_thread_id=send_thread,
                                                         video=vf, caption=caption)
                        else:
                            with open(video_path, "rb") as vf:
                                await update.message.reply_video(video=vf, caption=caption)

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
            output, file_gen = await _gestisci_task_agente(agente, testo, max_tokens=2500)
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
    dur = _audio_duration_sec(path)
    if dur is not None:
        print(f"[Whisper] Audio: {dur:.1f}s — stimato ~{max(5, int(dur * 0.3))}s su CPU (base)", flush=True)
    else:
        print(f"[Whisper] Durata audio non rilevabile", flush=True)

    for attempt in range(1, max_retries + 1):
        try:
            t0 = time.time()
            text = whisper_model.transcribe(path, language="it")["text"].strip()
            print(f"[Whisper] ✓ Trascritto in {time.time()-t0:.1f}s", flush=True)
            return text
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

        if usa_cc:
            risposta, file_gen = await _gestisci_task_agente(
                agente_id, user_text, file_paths=[tmp_path]
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

        if usa_cc:
            risposta, file_gen = await _gestisci_task_agente(
                agente_id, user_text, file_paths=[tmp_path]
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

    return False


# ══════════════════════════════════════════════════════════════════════════════
#  SMM Publisher — comandi Telegram
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

async def gestisci_testo(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or (update.message.from_user and update.message.from_user.is_bot):
        return
    topics     = carica_topics()
    topic_name = topics.get(str(update.message.message_thread_id), "") if update.message.is_topic_message else ""
    testo      = update.message.text or ""
    chat_id    = update.message.chat_id

    # ── Comandi Style Library (priorità massima, prima di tutto il resto) ─────
    if await _gestisci_comandi_stile(update, testo):
        return

    # ── Comandi SMM Publisher ─────────────────────────────────────────────────
    if await _gestisci_comandi_smm(update, testo):
        return

    # ── Risposta nel topic Video Editor quando c'è un video in attesa ────────
    if "video editor" in topic_name.lower() and chat_id in _pending_approval:
        testo_norm = testo.strip().upper()
        if testo_norm in ("OK", "OK.", "OK!", "✅", "SI", "SÌ", "YES"):
            state = _pending_approval.pop(chat_id)
            await update.message.reply_text("✅ Approvato — avvio pubblicazione...")
            await esegui_pubblicazione(update, ctx, state)
            return
        elif testo_norm not in ("NO", "STOP", "ANNULLA", "CANCEL"):
            # Qualsiasi altro testo = richiesta di modifiche
            state = _pending_approval.pop(chat_id)
            await applica_modifiche(update, ctx, state, testo)
            return
        else:
            # ANNULLA/NO/STOP — cancella senza pubblicare
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
        await processa_input(update, ctx, testo, "video editor")
        return
    await processa_input(update, ctx, testo, topic_name)

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
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, gestisci_testo))
app.add_handler(MessageHandler(filters.VOICE | filters.AUDIO, gestisci_audio))
app.add_handler(MessageHandler(filters.VIDEO, gestisci_video))
app.add_handler(MessageHandler(filters.PHOTO, gestisci_foto))
app.add_handler(MessageHandler(filters.Document.ALL, gestisci_documento))

# ── SMM Publisher: imposta loop asyncio e avvia webhook server ────────────────
smm_publisher.set_bot_loop(asyncio.get_event_loop())
smm_publisher.start_webhook_server()

print("🤖 Il Marchese Bot avviato!", flush=True)
app.run_polling()
