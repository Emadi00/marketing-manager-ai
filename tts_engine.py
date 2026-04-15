"""
tts_engine.py — ElevenLabs TTS per Videocraft Studio
Funzioni: genera_voce, lista_voci, clona_voce
"""

import os
import json
from pathlib import Path

# ── Costanti ──────────────────────────────────────────────────────────────────

# Voce default italiana — multilingual v2, suono naturale
# Può essere sovrascritta con VOCE DEFAULT: <voice_id>
DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9"  # Jessica (multilingual)
DEFAULT_MODEL     = "eleven_multilingual_v2"
DEFAULT_FORMAT    = "mp3_44100_128"

SECRETS_PATH = os.environ.get(
    "SECRETS_PATH",
    r"C:\Users\super\Desktop\ai-command-center\data\secrets.json"
)


def _get_api_key() -> str:
    """Legge ELEVENLABS_API_KEY da env oppure secrets.json."""
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if key:
        return key
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        return s.get("elevenlabs", {}).get("apiKey", "")
    except Exception:
        return ""


def _client():
    """Restituisce un ElevenLabs client autenticato (legge chiave da env/secrets)."""
    from elevenlabs.client import ElevenLabs
    api_key = _get_api_key()
    if not api_key:
        raise RuntimeError(
            "ELEVENLABS_API_KEY non trovata.\n"
            "Aggiungila in .env oppure in secrets.json > elevenlabs > apiKey"
        )
    return ElevenLabs(api_key=api_key)


def _client_with_key(api_key: str):
    """Restituisce un ElevenLabs client autenticato con la chiave passata esplicitamente."""
    from elevenlabs.client import ElevenLabs
    if not api_key:
        raise RuntimeError("api_key non può essere vuota.")
    return ElevenLabs(api_key=api_key)


# ── genera_voce ───────────────────────────────────────────────────────────────

def genera_voce(
    testo: str,
    voice_id: str | None = None,
    output_path: str = "voce.mp3",
    model_id: str = DEFAULT_MODEL,
) -> dict:
    """
    Genera audio dal testo con ElevenLabs.

    Args:
        testo:       Il testo da convertire in voce.
        voice_id:    ID voce ElevenLabs (None → DEFAULT_VOICE_ID).
        output_path: Path dove salvare l'MP3.
        model_id:    Modello ElevenLabs (default: eleven_multilingual_v2).

    Returns:
        {"path": str, "durata_secondi": float}

    Raises:
        RuntimeError: se ELEVENLABS_API_KEY non è configurata.
    """
    client   = _client()
    vid      = voice_id or DEFAULT_VOICE_ID

    print(f"[TTS] Generazione voce — model={model_id} voice={vid} chars={len(testo)}", flush=True)

    audio_gen = client.text_to_speech.convert(
        voice_id       = vid,
        text           = testo,
        model_id       = model_id,
        output_format  = DEFAULT_FORMAT,
    )

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "wb") as f:
        for chunk in audio_gen:
            if chunk:
                f.write(chunk)

    durata = _durata_mp3(output_path)
    print(f"[TTS] ✅ Salvato: {output_path} — {durata:.1f}s", flush=True)
    return {"path": output_path, "durata_secondi": durata}


def _durata_mp3(path: str) -> float:
    """Legge la durata di un MP3 via mutagen, fallback ffprobe."""
    try:
        from mutagen.mp3 import MP3
        return MP3(path).info.length
    except Exception:
        pass
    try:
        import subprocess
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, timeout=10, encoding="utf-8"
        )
        return float(r.stdout.strip())
    except Exception:
        return 0.0


# ── lista_voci ────────────────────────────────────────────────────────────────

def lista_voci(api_key: str | None = None) -> list[dict]:
    """
    Ritorna la lista delle voci disponibili sull'account ElevenLabs.

    Args:
        api_key: API key esplicita (None → legge da env / secrets.json).

    Returns:
        Lista di dict: { voice_id, name, category, language, preview_url }
    """
    client = _client() if api_key is None else _client_with_key(api_key)
    resp   = client.voices.get_all()

    voci = []
    for v in resp.voices:
        labels = v.labels or {}
        voci.append({
            "voice_id":    v.voice_id,
            "name":        v.name,
            "category":    v.category or "premade",
            "language":    labels.get("language", labels.get("accent", "—")),
            "use_case":    labels.get("use_case", "—"),
            "preview_url": v.preview_url or "",
        })

    # Ordinamento: clonate prima, poi per nome
    voci.sort(key=lambda x: (0 if x["category"] == "cloned" else 1, x["name"].lower()))
    return voci


# ── clona_voce ────────────────────────────────────────────────────────────────

def clona_voce(nome: str, audio_samples_paths: list[str], api_key: str | None = None, description: str = "") -> str:
    """
    Crea un instant voice clone su ElevenLabs.

    Args:
        nome:                Nome da assegnare alla voce clonata.
        audio_samples_paths: Lista di path a file audio di esempio (MP3/WAV).
        api_key:             API key esplicita (None → legge da env / secrets.json).
        description:         Descrizione opzionale.

    Returns:
        voice_id della voce clonata.
    """
    client = _client() if api_key is None else _client_with_key(api_key)

    # Verifica che i file esistano
    for p in audio_samples_paths:
        if not os.path.exists(p):
            raise FileNotFoundError(f"File audio non trovato: {p}")

    print(f"[TTS] Clonazione voce '{nome}' con {len(audio_samples_paths)} sample...", flush=True)

    # ElevenLabs SDK v2 — instant voice clone
    file_handles = [open(p, "rb") for p in audio_samples_paths]
    try:
        voice = client.clone(
            name        = nome,
            description = description or f"Voice clone: {nome}",
            files       = file_handles,
        )
    finally:
        for fh in file_handles:
            fh.close()

    voice_id = voice.voice_id
    print(f"[TTS] ✅ Voce clonata: '{nome}' → voice_id={voice_id}", flush=True)
    return voice_id


# ── TTS config (default per chat/cliente) ─────────────────────────────────────

TTS_CONFIG_PATH = os.path.join(
    os.environ.get("BASE_PATH", r"C:\Users\super\Desktop\MARKETING MANAGER"),
    "tts_config.json"
)

def _load_tts_config() -> dict:
    if os.path.exists(TTS_CONFIG_PATH):
        try:
            with open(TTS_CONFIG_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"default_voice_id": DEFAULT_VOICE_ID, "chat_voices": {}}


def _save_tts_config(cfg: dict) -> None:
    with open(TTS_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def get_voice_for_chat(chat_id: int | str) -> str:
    """Ritorna il voice_id configurato per questa chat (o il default globale)."""
    cfg = _load_tts_config()
    return cfg.get("chat_voices", {}).get(str(chat_id)) or cfg.get("default_voice_id") or DEFAULT_VOICE_ID


def set_voice_for_chat(chat_id: int | str, voice_id: str) -> None:
    """Imposta il voice_id di default per questa chat."""
    cfg = _load_tts_config()
    cfg.setdefault("chat_voices", {})[str(chat_id)] = voice_id
    _save_tts_config(cfg)


def set_global_default_voice(voice_id: str) -> None:
    """Imposta la voce globale di default."""
    cfg = _load_tts_config()
    cfg["default_voice_id"] = voice_id
    _save_tts_config(cfg)


def fmt_lista_voci(voci: list[dict]) -> str:
    """Formatta la lista voci per Telegram (Markdown)."""
    if not voci:
        return "⚠️ Nessuna voce trovata."

    clonate  = [v for v in voci if v["category"] == "cloned"]
    premade  = [v for v in voci if v["category"] != "cloned"]

    lines = ["🎙️ *Voci disponibili ElevenLabs*\n"]

    if clonate:
        lines.append("*Voci Clonate (tue):*")
        for v in clonate:
            lines.append(f"  • `{v['voice_id']}` — *{v['name']}*")

    if premade:
        lines.append("\n*Voci Stock:*")
        for v in premade[:20]:  # max 20 per non eccedere il limite Telegram
            lang = f" ({v['language']})" if v["language"] != "—" else ""
            lines.append(f"  • `{v['voice_id']}` — {v['name']}{lang}")
        if len(premade) > 20:
            lines.append(f"  _... e altre {len(premade) - 20} voci_")

    lines.append(
        "\n*Comandi:*\n"
        "`VOCE DEFAULT: <voice_id>` — imposta voce per questa chat\n"
        "`VOCE GLOBALE: <voice_id>` — imposta voce per tutti"
    )
    return "\n".join(lines)
