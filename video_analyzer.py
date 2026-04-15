"""
video_analyzer.py
Pipeline: Google Drive → Whisper trascrizione → Claude analisi → PDF timestamp clip.
"""

import os
import re
import json
import tempfile
import subprocess
import urllib.request
from datetime import datetime
from typing import Optional

import anthropic

try:
    import whisper as _whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

try:
    from fpdf import FPDF
    FPDF_AVAILABLE = True
except ImportError:
    FPDF_AVAILABLE = False

# ── Config (iniettato da bot_telegram.py) ─────────────────────────────────────
API_KEY:  str = ""
BASE_PATH: str = r"C:\Users\super\Desktop\MARKETING MANAGER"
MODEL     = "claude-sonnet-4-6"
MAX_CLIPS = 8


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_ts(seconds: float) -> str:
    """Converte secondi in stringa HH:MM:SS."""
    s = int(seconds)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def _gdrive_file_id(url: str) -> Optional[str]:
    """Estrae il file ID da vari formati URL Google Drive."""
    for pat in [r"/file/d/([a-zA-Z0-9_-]+)", r"id=([a-zA-Z0-9_-]+)", r"/open\?id=([a-zA-Z0-9_-]+)"]:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def _gdrive_download(url: str, dest_path: str) -> None:
    """Scarica un file da Google Drive gestendo il token di conferma per file grandi."""
    file_id = _gdrive_file_id(url)
    if not file_id:
        raise ValueError(f"URL Google Drive non riconosciuto: {url}")

    try:
        import requests
        session = requests.Session()
        dl_url = f"https://drive.google.com/uc?export=download&id={file_id}"
        resp = session.get(dl_url, stream=True)

        # Gestione warning virus scan Google per file grandi
        token = None
        for k, v in resp.cookies.items():
            if k.startswith("download_warning"):
                token = v
                break
        if token:
            dl_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm={token}"
            resp = session.get(dl_url, stream=True)

        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)

    except ImportError:
        # Fallback urllib (nessun retry su virus warning)
        dl_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
        urllib.request.urlretrieve(dl_url, dest_path)


def _video_duration(path: str) -> float:
    """Durata del video in secondi via ffprobe."""
    try:
        res = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=30
        )
        return float(res.stdout.strip())
    except Exception:
        return 0.0


def _extract_audio(video_path: str, audio_path: str) -> bool:
    """Estrae traccia audio in MP3. Ritorna True se successo."""
    res = subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "libmp3lame",
         "-ab", "128k", "-ar", "16000", audio_path],
        capture_output=True, timeout=600
    )
    return res.returncode == 0


def _transcribe(audio_path: str) -> list[dict]:
    """
    Trascrizione Whisper con timestamp per segmento.
    Ritorna lista di {start, end, text}.
    """
    if not WHISPER_AVAILABLE:
        raise RuntimeError("whisper non installato — pip install openai-whisper")
    model = _whisper.load_model("base")
    result = model.transcribe(audio_path, language="it", word_timestamps=False)
    return [
        {"start": s["start"], "end": s["end"], "text": s["text"].strip()}
        for s in result.get("segments", [])
    ]


def _segments_to_text(segments: list[dict]) -> str:
    """Formatta la lista segmenti come testo con timestamp leggibili."""
    return "\n".join(
        f"[{_fmt_ts(s['start'])} → {_fmt_ts(s['end'])}] {s['text']}"
        for s in segments
    )


def _analizza_con_claude(transcript_text: str, durata_totale: float) -> list[dict]:
    """
    Invia la trascrizione a Claude Sonnet e chiede di identificare i migliori clip.
    Ritorna lista di clip con timestamp, hook e spiegazioni.
    """
    client = anthropic.Anthropic(api_key=API_KEY)

    prompt = f"""Sei un esperto di social media marketing e content strategy con anni di esperienza su TikTok, Instagram Reels e YouTube Shorts.

Ti fornisco la trascrizione completa di un video lungo ({_fmt_ts(durata_totale)}), con i timestamp di ogni segmento parlato.

Il tuo compito è identificare i {MAX_CLIPS} migliori momenti da estrarre come clip autonomi per i social media.

**Criteri di selezione (in ordine di priorità):**
1. Hook potente nei primi 3 secondi: deve fermare lo scroll (curiosità, shock, promessa forte, domanda provocatoria, statistica sorprendente)
2. Il clip deve essere auto-contenuto e comprensibile senza aver visto il resto del video
3. Durata ottimale: 30–90 secondi (massimo 2 minuti)
4. Alto potenziale virale: emozione forte, valore pratico immediato, sorpresa, storia, controintuito
5. Evita: saluti iniziali, presentazioni, outro, riferimenti espliciti ad altre parti ("come dicevo prima", "come vedremo dopo")

**Trascrizione con timestamp:**
{transcript_text}

Rispondi ESCLUSIVAMENTE con un array JSON valido. Zero testo prima o dopo. Formato esatto:
[
  {{
    "clip_num": 1,
    "start_ts": "00:02:15",
    "end_ts": "00:02:55",
    "start_sec": 135,
    "end_sec": 175,
    "titolo_clip": "Titolo breve e accattivante (max 8 parole)",
    "hook": "Testo esatto o parafrasi dell'apertura del clip — le primissime parole che sentirà l'utente",
    "tipo_hook": "curiosita|shock|problema|promessa|controintuito|storia|statistica",
    "trascrizione_clip": "Testo completo del segmento estratto, come appare nella trascrizione",
    "perche_funziona": "Analisi dettagliata del potenziale virale: spiega l'hook, la struttura narrativa, perché dovrebbe fermare lo scroll, quale emozione attiva, e perché funziona per i social (4-6 righe)",
    "piattaforme": ["TikTok", "Instagram Reels"],
    "energia": "alta|media|bassa",
    "durata_sec": 40
  }}
]"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()
    # Estrai array JSON anche se Claude aggiunge testo attorno
    m = re.search(r"\[[\s\S]+\]", raw)
    return json.loads(m.group(0) if m else raw)


# ── Generazione PDF ───────────────────────────────────────────────────────────

class _PDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(170, 170, 170)
        self.cell(0, 8, f"Pagina {self.page_no()}", align="C")


def _safe(text: str) -> str:
    """Rimuove caratteri non supportati da fpdf (latin-1 safe)."""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _genera_pdf(clips: list[dict], durata_totale: float, out_path: str) -> None:
    """Genera il PDF report con cover, tabella riassuntiva e schede dettagliate."""

    pdf = _PDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 18, 18)

    # ── COVER ─────────────────────────────────────────────────────────────────
    pdf.add_page()

    # Header nero
    pdf.set_fill_color(12, 12, 12)
    pdf.rect(0, 0, 210, 55, "F")

    pdf.set_y(12)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 11, "VIDEO CLIP ANALYSIS", align="C", ln=True)

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(180, 180, 180)
    pdf.cell(0, 8, "Social Media Cut Points Report", align="C", ln=True)

    # Accent line
    pdf.set_draw_color(255, 180, 0)
    pdf.set_line_width(1.0)
    pdf.line(60, 38, 150, 38)

    pdf.set_y(60)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(110, 110, 110)
    pdf.cell(0, 6,
             _safe(f"Durata video: {_fmt_ts(durata_totale)}   |   Clip identificati: {len(clips)}   |   {datetime.now().strftime('%d/%m/%Y %H:%M')}"),
             align="C", ln=True)

    pdf.ln(14)

    # ── TABELLA RIASSUNTIVA ────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(15, 15, 15)
    pdf.cell(0, 8, "Panoramica clip", ln=True)
    pdf.ln(2)

    # Intestazione colonne
    COL = [10, 24, 24, 20, 25, 55, 16]  # larghezze
    HDR = ["#", "INIZIO", "FINE", "DURATA", "TIPO HOOK", "TITOLO", "ENERGIA"]

    pdf.set_fill_color(20, 20, 20)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 7.5)
    for w, h in zip(COL, HDR):
        pdf.cell(w, 7, h, fill=True)
    pdf.ln()

    for i, clip in enumerate(clips):
        bg = (248, 248, 248) if i % 2 == 0 else (255, 255, 255)
        pdf.set_fill_color(*bg)
        pdf.set_text_color(25, 25, 25)
        pdf.set_font("Helvetica", "", 7.5)

        row = [
            str(clip.get("clip_num", i + 1)),
            clip.get("start_ts", ""),
            clip.get("end_ts", ""),
            f"{clip.get('durata_sec', 0)}s",
            clip.get("tipo_hook", "").upper()[:12],
            _safe(clip.get("titolo_clip", "")[:34]),
        ]
        for w, val in zip(COL[:-1], row):
            pdf.cell(w, 6, val, fill=True)

        # Energia colorata
        energia = clip.get("energia", "").upper()
        clr = {"ALTA": (210, 45, 45), "MEDIA": (200, 130, 0), "BASSA": (60, 140, 80)}.get(energia, (100, 100, 100))
        pdf.set_text_color(*clr)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.cell(COL[-1], 6, energia, fill=True)
        pdf.set_text_color(25, 25, 25)
        pdf.ln()

    pdf.ln(10)

    # ── SCHEDE DETTAGLIATE ────────────────────────────────────────────────────
    for clip in clips:
        pdf.add_page()

        num    = clip.get("clip_num", "?")
        start  = clip.get("start_ts", "")
        end    = clip.get("end_ts", "")
        dur    = clip.get("durata_sec", 0)
        titolo = _safe(clip.get("titolo_clip", ""))
        hook   = _safe(clip.get("hook", ""))
        tipo   = clip.get("tipo_hook", "").upper()
        perche = _safe(clip.get("perche_funziona", ""))
        trascr = _safe(clip.get("trascrizione_clip", ""))
        piattaforme = clip.get("piattaforme", [])
        energia = clip.get("energia", "").upper()

        # Header clip
        pdf.set_fill_color(12, 12, 12)
        pdf.rect(0, 0, 210, 20, "F")
        pdf.set_y(5)
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, _safe(f"CLIP #{num}  —  {titolo}"), align="C", ln=True)

        pdf.set_y(24)

        # Riga timestamp
        pdf.set_fill_color(235, 235, 235)
        pdf.set_draw_color(200, 200, 200)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(50, 8, f"  INIZIO: {start}", fill=True, border=1)
        pdf.cell(50, 8, f"  FINE: {end}", fill=True, border=1)
        pdf.cell(40, 8, f"  DURATA: {dur}s", fill=True, border=1)

        e_clr = {"ALTA": (210, 45, 45), "MEDIA": (200, 120, 0), "BASSA": (50, 140, 70)}.get(energia, (100, 100, 100))
        pdf.set_fill_color(*e_clr)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, f"  {energia}", fill=True, border=1)
        pdf.ln(11)

        # Piattaforme + tipo
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(90, 90, 90)
        plat_str = "  ·  ".join(piattaforme)
        pdf.cell(0, 5, _safe(f"Piattaforme: {plat_str}   |   Tipo hook: {tipo}"), ln=True)
        pdf.ln(5)

        # Box HOOK
        pdf.set_fill_color(255, 248, 220)
        pdf.set_draw_color(210, 160, 30)
        pdf.set_line_width(0.4)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(130, 85, 0)
        pdf.cell(0, 7, "   HOOK DI APERTURA", fill=True, border="LTR", ln=True)
        pdf.set_font("Helvetica", "I", 9.5)
        pdf.set_text_color(90, 55, 0)
        pdf.multi_cell(0, 6, f'   "{hook}"', fill=True, border="LBR")
        pdf.ln(5)

        # Box PERCHÉ FUNZIONA
        pdf.set_fill_color(238, 246, 255)
        pdf.set_draw_color(90, 155, 215)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(25, 75, 140)
        pdf.cell(0, 7, "   PERCHÉ FUNZIONA SUI SOCIAL", fill=True, border="LTR", ln=True)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(20, 55, 110)
        pdf.multi_cell(0, 5.5, f"   {perche}", fill=True, border="LBR")
        pdf.ln(5)

        # Box TRASCRIZIONE
        pdf.set_fill_color(248, 248, 248)
        pdf.set_draw_color(200, 200, 200)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 7, "   TRASCRIZIONE SEGMENTO", fill=True, border="LTR", ln=True)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(60, 60, 60)
        testo_ok = trascr[:700] + ("  [...]" if len(trascr) > 700 else "")
        pdf.multi_cell(0, 5, f"   {testo_ok}", fill=True, border="LBR")

    pdf.output(out_path)


# ── Pipeline principale ───────────────────────────────────────────────────────

async def analizza_video_gdrive(url: str, progress_cb=None) -> str:
    """
    Pipeline completa: download → audio → Whisper → Claude → PDF.
    Ritorna il path assoluto del PDF generato.
    progress_cb: async callable(str) per aggiornamenti Telegram.
    """
    if not API_KEY:
        raise RuntimeError("API_KEY non configurata in video_analyzer")
    if not WHISPER_AVAILABLE:
        raise RuntimeError("Installa whisper: pip install openai-whisper")
    if not FPDF_AVAILABLE:
        raise RuntimeError("Installa fpdf: pip install fpdf2")

    async def _notify(msg: str):
        if progress_cb:
            try:
                await progress_cb(msg)
            except Exception:
                pass

    with tempfile.TemporaryDirectory() as tmpdir:
        vid_path = os.path.join(tmpdir, "video.mp4")
        aud_path = os.path.join(tmpdir, "audio.mp3")

        # 1. Download
        await _notify("⬇️ Download video da Google Drive...")
        _gdrive_download(url, vid_path)
        mb = os.path.getsize(vid_path) / (1024 * 1024)
        await _notify(f"✅ Scaricato ({mb:.1f} MB). Estrazione audio...")

        # 2. Estrai audio
        if not _extract_audio(vid_path, aud_path):
            raise RuntimeError("Nessuna traccia audio nel video (ffmpeg error)")

        durata = _video_duration(vid_path)
        await _notify(f"🎙️ Trascrizione Whisper... (video: {_fmt_ts(durata)})")

        # 3. Trascrivi
        segments = _transcribe(aud_path)
        transcript_text = _segments_to_text(segments)
        await _notify(f"✅ Trascritto ({len(segments)} segmenti). Analisi Claude...")

        # 4. Analisi Claude
        clips = _analizza_con_claude(transcript_text, durata)
        await _notify(f"✅ Trovati {len(clips)} clip. Generazione PDF...")

        # 5. PDF — salvato in BASE_PATH
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        pdf_path = os.path.join(BASE_PATH, f"clip_analysis_{ts}.pdf")
        _genera_pdf(clips, durata, pdf_path)

    return pdf_path
