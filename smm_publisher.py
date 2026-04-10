"""
SMM Publisher — Upload-Post API layer
Pubblica video su TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest,
Bluesky e Reddit con una singola chiamata. Supporta:
  - pubblicazione immediata e scheduling (ISO-8601)
  - retry automatico (1 volta dopo 60s)
  - webhook per ricevere status e notificare su Telegram
  - multi-client (ogni cliente ha il proprio user Upload-Post)
  - log persistente in smm_log.json

Variabili d'ambiente:
  UPLOAD_POST_API_KEY     — API key Upload-Post (obbligatoria)
  UPLOAD_POST_WEBHOOK_URL — URL pubblico per ricevere callback (opzionale)
  UPLOAD_POST_WEBHOOK_PORT— porta listener locale webhook (default: 5001)
"""

import os
import io
import json
import uuid
import asyncio
import threading
import urllib.request
import urllib.error
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable, Awaitable

# ── Percorsi (definiti PRIMA di tutto — evita forward reference) ───────────────
_DIR                = os.path.dirname(os.path.abspath(__file__))
LOG_PATH            = os.path.join(_DIR, "smm_log.json")
CLIENTI_SOCIAL_PATH = os.path.join(_DIR, "clienti_social.json")

# ── Configurazione ─────────────────────────────────────────────────────────────
UPLOAD_POST_BASE    = "https://api.upload-post.com/api"
WEBHOOK_URL         = os.environ.get("UPLOAD_POST_WEBHOOK_URL", "")
WEBHOOK_PORT        = int(os.environ.get("UPLOAD_POST_WEBHOOK_PORT", "5001"))

def _load_api_key() -> str:
    """Carica API key: env var → secrets.json → stringa vuota."""
    key = os.environ.get("UPLOAD_POST_API_KEY", "")
    if key:
        return key
    # Cerca secrets.json nella cartella ai-command-center adiacente
    secrets_path = os.path.join(_DIR, "..", "ai-command-center", "data", "secrets.json")
    try:
        with open(secrets_path, encoding="utf-8") as f:
            s = json.load(f)
        return s.get("upload_post", {}).get("apiKey", "")
    except Exception:
        return ""

API_KEY: str = ""  # caricata lazy al primo uso per evitare errori di import

def _get_api_key() -> str:
    global API_KEY
    if not API_KEY:
        API_KEY = _load_api_key()
    return API_KEY

def _auth_header() -> str:
    """
    Determina il formato corretto dell'Authorization header.
    JWT (eyJ...) → Bearer token.
    Chiave opaca → Apikey (formato Upload-Post legacy).
    """
    key = _get_api_key()
    if key.startswith("eyJ"):
        return f"Bearer {key}"
    return f"Apikey {key}"

# ── Stato interno webhook ──────────────────────────────────────────────────────
_webhook_callbacks: dict[str, Callable] = {}   # request_id → async callback
_bot_loop: asyncio.AbstractEventLoop | None = None
_webhook_server: HTTPServer | None = None

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG CLIENTI
# ══════════════════════════════════════════════════════════════════════════════

def load_clienti_social() -> dict:
    """Carica mappa nome_cliente → {user, platforms, notes}"""
    try:
        with open(CLIENTI_SOCIAL_PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception as e:
        print(f"[SMM] Errore caricamento clienti_social.json: {e}", flush=True)
        return {}

def get_client_config(client_name: str) -> dict | None:
    """Trova la config social per un cliente (case-insensitive, match parziale)."""
    config = load_clienti_social()
    name_lower = client_name.lower().strip()
    # Match esatto prima
    for key, val in config.items():
        if key.lower() == name_lower:
            return val
    # Match parziale (es. "Ristomedia" trova "Ristomedia Roma")
    for key, val in config.items():
        if name_lower in key.lower() or key.lower() in name_lower:
            return val
    return None

# ══════════════════════════════════════════════════════════════════════════════
#  LOG
# ══════════════════════════════════════════════════════════════════════════════

def _append_log(entry: dict):
    try:
        try:
            with open(LOG_PATH, encoding="utf-8") as f:
                log = json.load(f)
        except Exception:
            log = []
        log.insert(0, entry)
        log = log[:1000]
        with open(LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(log, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[SMM] Errore log: {e}", flush=True)

def _update_log_status(request_id: str, status: str, raw: dict = None):
    """Aggiorna lo status di una entry nel log (per webhook callback)."""
    if not request_id:
        return
    try:
        with open(LOG_PATH, encoding="utf-8") as f:
            log = json.load(f)
        for entry in log:
            if entry.get("request_id") == request_id:
                entry["status"] = status
                entry["webhook_payload"] = raw
                entry["updated_at"] = datetime.now(timezone.utc).isoformat()
                break
        with open(LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(log, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[SMM] Errore update log: {e}", flush=True)

# ══════════════════════════════════════════════════════════════════════════════
#  MULTIPART BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def _build_multipart(
    fields: list[tuple[str, str]],
    files: list[tuple[str, str, str, bytes]],  # (name, filename, content_type, data)
) -> tuple[bytes, str]:
    """Costruisce body multipart/form-data. Ritorna (body_bytes, content_type_header)."""
    boundary = f"Boundary{uuid.uuid4().hex}"
    buf = io.BytesIO()

    for name, value in fields:
        buf.write(f"--{boundary}\r\n".encode())
        buf.write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        buf.write(value.encode("utf-8"))
        buf.write(b"\r\n")

    for name, filename, content_type, data in files:
        buf.write(f"--{boundary}\r\n".encode())
        buf.write(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode())
        buf.write(f"Content-Type: {content_type}\r\n\r\n".encode())
        buf.write(data)
        buf.write(b"\r\n")

    buf.write(f"--{boundary}--\r\n".encode())
    return buf.getvalue(), f"multipart/form-data; boundary={boundary}"

# ══════════════════════════════════════════════════════════════════════════════
#  CORE PUBLISH
# ══════════════════════════════════════════════════════════════════════════════

def publish_video(
    video_path: str,
    client_name: str,
    title: str = "",
    cover_path: str | None = None,
    platform_captions: dict | None = None,  # {platform: caption_text}
    scheduled_date: str | None = None,       # ISO-8601, es. "2026-04-10T15:00:00Z"
    webhook_url: str | None = None,
) -> dict:
    """
    Pubblica un video su Upload-Post per il cliente specificato.
    Ritorna: {ok, request_id, job_id, platforms, error}
    """
    if not _get_api_key():
        return {"ok": False, "error": "Upload-Post API key non trovata (env UPLOAD_POST_API_KEY o secrets.json)"}

    client_cfg = get_client_config(client_name)
    if not client_cfg:
        return {"ok": False, "error": f"Nessuna config social trovata per: {client_name}"}

    user      = client_cfg.get("user", "")
    platforms = client_cfg.get("platforms", [])

    if not user:
        return {"ok": False, "error": f"Campo 'user' mancante in clienti_social.json per {client_name}"}
    if not platforms:
        return {"ok": False, "error": f"Nessuna piattaforma configurata per {client_name}"}
    if not os.path.exists(video_path):
        return {"ok": False, "error": f"File video non trovato: {video_path}"}

    # ── Costruisci fields ────────────────────────────────────────────────────
    fields = [
        ("user",         user),
        ("async_upload", "true"),
    ]
    for p in platforms:
        fields.append(("platform[]", p))

    if title:
        fields.append(("title", title[:2000]))
    if scheduled_date:
        fields.append(("scheduled_date", scheduled_date))

    # Webhook per status callback
    effective_webhook = webhook_url or WEBHOOK_URL
    if effective_webhook:
        fields.append(("webhook_url", effective_webhook))

    # Caption per-piattaforma
    if platform_captions:
        for plat, cap in platform_captions.items():
            if cap:
                fields.append((f"{plat}_description", cap[:2000]))

    # ── Costruisci files ─────────────────────────────────────────────────────
    with open(video_path, "rb") as f:
        video_data = f.read()
    video_filename = os.path.basename(video_path)
    files = [("file", video_filename, "video/mp4", video_data)]

    if cover_path and os.path.exists(cover_path):
        with open(cover_path, "rb") as f:
            cover_data = f.read()
        ext  = os.path.splitext(cover_path)[1].lower()
        mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
        files.append(("thumbnail", os.path.basename(cover_path), mime, cover_data))

    body, content_type = _build_multipart(fields, files)

    # ── Request ──────────────────────────────────────────────────────────────
    log_entry = {
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "client_id":  client_name,
        "user":       user,
        "platforms":  platforms,
        "scheduled":  scheduled_date,
        "video":      video_filename,
        "status":     "pending",
        "request_id": None,
        "job_id":     None,
        "error":      None,
    }

    try:
        req = urllib.request.Request(
            f"{UPLOAD_POST_BASE}/upload",
            data=body,
            headers={
                "Authorization": _auth_header(),
                "Content-Type":  content_type,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        request_id = result.get("request_id") or result.get("id")
        job_id     = result.get("job_id")
        log_entry.update({"status": "sent", "request_id": request_id, "job_id": job_id})
        _append_log(log_entry)
        print(
            f"[SMM] ✅ Upload inviato — client={client_name} "
            f"platforms={platforms} request_id={request_id} job_id={job_id}",
            flush=True,
        )
        return {"ok": True, "request_id": request_id, "job_id": job_id, "platforms": platforms, "raw": result}

    except urllib.error.HTTPError as e:
        body_resp = e.read().decode("utf-8", errors="replace")
        err = f"HTTP {e.code}: {body_resp[:400]}"
        log_entry.update({"status": "error", "error": err})
        _append_log(log_entry)
        print(f"[SMM] ❌ {err}", flush=True)
        return {"ok": False, "error": err, "platforms": platforms}

    except Exception as e:
        log_entry.update({"status": "error", "error": str(e)})
        _append_log(log_entry)
        print(f"[SMM] ❌ {e}", flush=True)
        return {"ok": False, "error": str(e), "platforms": platforms}

# ── Status check ─────────────────────────────────────────────────────────────

def check_status(request_id: str) -> dict:
    """GET /api/uploadposts/status?request_id=xxx"""
    try:
        url = f"{UPLOAD_POST_BASE}/uploadposts/status?request_id={request_id}"
        req = urllib.request.Request(url, headers={"Authorization": _auth_header()})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"error": str(e)}

# ── Publish con retry ─────────────────────────────────────────────────────────

async def publish_with_retry(
    video_path: str,
    client_name: str,
    title: str = "",
    cover_path: str | None = None,
    platform_captions: dict | None = None,
    scheduled_date: str | None = None,
    notify_callback: Callable[[str], Awaitable[None]] | None = None,
    webhook_url: str | None = None,
    register_webhook: bool = True,
) -> dict:
    """
    Pubblica con retry automatico: 1 tentativo → attesa 60s → 1 retry.
    notify_callback: async func(str) per notifiche Telegram.
    """
    result = publish_video(
        video_path, client_name, title, cover_path,
        platform_captions, scheduled_date, webhook_url,
    )

    if result["ok"]:
        request_id = result.get("request_id")
        if request_id and register_webhook and notify_callback:
            register_webhook_callback(request_id, notify_callback)
        return result

    # Primo tentativo fallito
    err_msg = result.get("error", "errore sconosciuto")
    print(f"[SMM] Primo tentativo fallito: {err_msg} — retry tra 60s", flush=True)
    if notify_callback:
        await notify_callback(
            f"⚠️ *SMM Publisher*: primo tentativo fallito.\n"
            f"Retry automatico tra 60 secondi...\n`{err_msg[:200]}`"
        )

    await asyncio.sleep(60)

    result2 = publish_video(
        video_path, client_name, title, cover_path,
        platform_captions, scheduled_date, webhook_url,
    )

    if result2["ok"]:
        request_id = result2.get("request_id")
        if request_id and register_webhook and notify_callback:
            register_webhook_callback(request_id, notify_callback)
        return result2

    # Entrambi falliti
    err2 = result2.get("error", "errore sconosciuto")
    fail_msg = (
        f"❌ *SMM Publisher*: pubblicazione fallita dopo 2 tentativi.\n"
        f"Cliente: `{client_name}`\n"
        f"Errore: `{err2[:300]}`"
    )
    if notify_callback:
        await notify_callback(fail_msg)
    print(f"[SMM] {fail_msg}", flush=True)
    return result2

# ══════════════════════════════════════════════════════════════════════════════
#  WEBHOOK SERVER
# ══════════════════════════════════════════════════════════════════════════════

def set_bot_loop(loop: asyncio.AbstractEventLoop):
    """Registra il loop asyncio del bot per poter fare run_coroutine_threadsafe."""
    global _bot_loop
    _bot_loop = loop

def register_webhook_callback(request_id: str, callback: Callable[[str], Awaitable[None]]):
    """Registra un callback da chiamare quando Upload-Post notifica il completamento."""
    _webhook_callbacks[request_id] = callback


class _WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = self.rfile.read(length)
        except Exception:
            body = b""

        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"OK")

        try:
            data       = json.loads(body.decode("utf-8"))
            request_id = data.get("request_id") or data.get("id")
            status     = data.get("status") or data.get("state", "unknown")
            platforms  = data.get("platforms") or []

            print(f"[SMM Webhook] request_id={request_id} status={status}", flush=True)

            # Aggiorna log
            _update_log_status(request_id, status, data)

            # Chiama callback Telegram
            callback = _webhook_callbacks.pop(request_id, None) if request_id else None
            if callback and _bot_loop:
                if status in ("completed", "success", "published"):
                    msg = (
                        f"✅ *SMM Publisher*: pubblicazione completata!\n"
                        f"Piattaforme: {', '.join(platforms) if platforms else 'n/d'}\n"
                        f"ID: `{request_id}`"
                    )
                else:
                    err_detail = data.get("error") or data.get("message") or ""
                    msg = (
                        f"❌ *SMM Publisher*: errore pubblicazione.\n"
                        f"Status: `{status}`\n"
                        f"Errore: `{err_detail[:200]}`"
                    )
                asyncio.run_coroutine_threadsafe(callback(msg), _bot_loop)

        except Exception as e:
            print(f"[SMM Webhook] Errore parsing: {e}", flush=True)

    def log_message(self, format, *args):
        pass  # silenzia log HTTP standard


def start_webhook_server(port: int = WEBHOOK_PORT) -> HTTPServer | None:
    """
    Avvia il server webhook locale in un thread daemon.
    Deve essere chiamato DOPO aver impostato il loop con set_bot_loop().
    """
    global _webhook_server
    if _webhook_server:
        return _webhook_server
    try:
        server = HTTPServer(("0.0.0.0", port), _WebhookHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True, name="smm-webhook")
        thread.start()
        _webhook_server = server
        key = _get_api_key()
        key_preview = f"{key[:20]}..." if key else "NON TROVATA"
        auth_type   = "Bearer (JWT)" if key.startswith("eyJ") else "Apikey"
        print(f"[SMM] Webhook server in ascolto su porta {port}", flush=True)
        print(f"[SMM] API key: {auth_type} — {key_preview}", flush=True)
        if WEBHOOK_URL:
            print(f"[SMM] Webhook URL configurata: {WEBHOOK_URL}", flush=True)
        else:
            print(f"[SMM] ⚠️  UPLOAD_POST_WEBHOOK_URL non impostata — callback disabilitati", flush=True)
        return server
    except Exception as e:
        print(f"[SMM] Impossibile avviare webhook server: {e}", flush=True)
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  FORMATTAZIONE OUTPUT TELEGRAM
# ══════════════════════════════════════════════════════════════════════════════

def fmt_log(n: int = 10) -> str:
    """Ritorna gli ultimi n post dal log formattati per Telegram Markdown."""
    try:
        with open(LOG_PATH, encoding="utf-8") as f:
            log = json.load(f)
    except FileNotFoundError:
        return "📭 Nessuna pubblicazione nel log."
    except Exception as e:
        return f"❌ Errore lettura log: {e}"

    if not log:
        return "📭 Log vuoto."

    _STATUS_EMOJI = {
        "sent":      "📤",
        "pending":   "⏳",
        "completed": "✅",
        "success":   "✅",
        "published": "✅",
        "error":     "❌",
        "failed":    "❌",
    }

    lines = [f"📋 *SMM Log — ultimi {min(n, len(log))} post:*\n"]
    for entry in log[:n]:
        ts        = entry.get("timestamp", "")[:16].replace("T", " ")
        client    = entry.get("client_id", "?")
        platforms = ", ".join(entry.get("platforms", []))
        status    = entry.get("status", "?")
        emoji     = _STATUS_EMOJI.get(status, "❓")
        req_id    = entry.get("request_id") or "—"
        sched     = f" ⏰{entry['scheduled'][:10]}" if entry.get("scheduled") else ""
        err       = f"\n  ⚠️ _{entry['error'][:80]}_" if entry.get("error") else ""
        lines.append(
            f"{emoji} `{ts}` · *{client}*{sched}\n"
            f"  {platforms} · `{req_id}`{err}"
        )
    return "\n".join(lines)


def fmt_status(request_id: str) -> str:
    """Controlla e formatta lo status di un post specifico."""
    result = check_status(request_id)
    if "error" in result:
        return f"❌ Errore: `{result['error']}`"
    status    = result.get("status") or result.get("state") or "sconosciuto"
    platforms = result.get("platforms") or []
    _STATUS_EMOJI = {"completed": "✅", "success": "✅", "published": "✅",
                     "pending": "⏳", "processing": "⏳", "error": "❌", "failed": "❌"}
    emoji = _STATUS_EMOJI.get(status, "❓")
    lines = [
        f"{emoji} *Status upload*",
        f"ID: `{request_id}`",
        f"Status: `{status}`",
    ]
    if platforms:
        lines.append(f"Piattaforme: {', '.join(platforms)}")
    err = result.get("error") or result.get("message")
    if err:
        lines.append(f"Errore: `{err[:200]}`")
    return "\n".join(lines)


def fmt_piattaforme(client_name: str) -> str:
    """Mostra le piattaforme configurate per un cliente."""
    cfg = get_client_config(client_name)
    if not cfg:
        all_clients = list(load_clienti_social().keys())
        nomi = ", ".join(f"`{c}`" for c in all_clients) if all_clients else "_nessuno_"
        return f"⚠️ Cliente `{client_name}` non trovato.\nClienti: {nomi}"
    platforms = cfg.get("platforms", [])
    user      = cfg.get("user", "?")
    notes     = cfg.get("notes", "")
    lines = [
        f"📱 *{client_name}*",
        f"User Upload-Post: `{user}`",
        f"Piattaforme: {', '.join(f'`{p}`' for p in platforms)}",
    ]
    if notes:
        lines.append(f"Note: _{notes}_")
    return "\n".join(lines)
