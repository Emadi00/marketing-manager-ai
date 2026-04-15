"""
broll_finder.py — Ricerca e download B-roll da Pexels + Pixabay

Funzioni pubbliche:
  cerca_broll(keyword, durata_min, orientamento)   → path MP4 scaricato
  suggerisci_broll(trascrizione_segmenti)           → [{segmento_id, keywords, start, end}]
  scarica_broll_per_video(suggerimenti, output_dir) → [{segmento_id, clip_path, durata}]

Sorgenti: Pexels (primaria) → Pixabay (fallback automatico se Pexels fallisce o non ha risultati)

Comando Telegram: "BROLL: <keyword>" → preview primi 3 risultati

Dipendenze: requests (stdlib urllib come fallback), ffmpeg nel PATH
"""

import os
import json
import re
import subprocess
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

# ── Costanti ──────────────────────────────────────────────────────────────────

PEXELS_BASE_URL   = "https://api.pexels.com/videos/search"
PIXABAY_BASE_URL  = "https://pixabay.com/api/videos/"

SECRETS_PATH = os.environ.get(
    "SECRETS_PATH",
    r"C:\Users\super\Desktop\ai-command-center\data\secrets.json"
)
BASE_PATH = os.environ.get(
    "BASE_PATH",
    r"C:\Users\super\Desktop\MARKETING MANAGER"
)

# Cartella dove vengono salvati i B-roll scaricati
BROLL_CACHE_DIR = os.path.join(BASE_PATH, "broll_cache")

# Qualità preferita (in ordine): hd → sd → primo disponibile
QUALITY_PRIORITY = ["hd", "sd"]


# ── API Key helpers ───────────────────────────────────────────────────────────

def _get_pexels_key() -> str:
    """Legge PEXELS_API_KEY da env oppure secrets.json."""
    key = os.environ.get("PEXELS_API_KEY", "")
    if key:
        return key
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        return s.get("pexels", {}).get("apiKey", "")
    except Exception:
        return ""


def _get_pixabay_key() -> str:
    """Legge PIXABAY_API_KEY da env oppure secrets.json."""
    key = os.environ.get("PIXABAY_API_KEY", "")
    if key:
        return key
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        return s.get("pixabay", {}).get("apiKey", "")
    except Exception:
        return ""


def _get_anthropic_key() -> str:
    """Legge ANTHROPIC_API_KEY da env oppure secrets.json."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        return s.get("anthropic", {}).get("apiKey", "")
    except Exception:
        return ""


def _require_pexels_key() -> str:
    """Ritorna la chiave Pexels o solleva RuntimeError con istruzioni chiare."""
    key = _get_pexels_key()
    if not key:
        raise RuntimeError(
            "PEXELS_API_KEY non trovata.\n"
            "Aggiungila in .env oppure in secrets.json > pexels > apiKey\n"
            "Registrati su https://www.pexels.com/api/ — gratuito."
        )
    return key


def _at_least_one_key() -> bool:
    """True se almeno una sorgente B-roll è configurata."""
    return bool(_get_pexels_key() or _get_pixabay_key())


# ── Pexels HTTP helpers ───────────────────────────────────────────────────────

def _pexels_get(url: str, params: dict, api_key: str) -> dict:
    """
    Esegue una GET all'API Pexels.
    Prova prima con `requests`, fallback su urllib.
    """
    headers = {"Authorization": api_key}
    query   = urllib.parse.urlencode(params)
    full_url = f"{url}?{query}"

    try:
        import requests
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except ImportError:
        pass

    # Fallback urllib
    req = urllib.request.Request(full_url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def _scarica_file(url: str, dest_path: str) -> None:
    """Scarica un file binario (video) con progress log."""
    print(f"[Broll] Scarico: {url[:80]}...", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)

    try:
        import requests
        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            scaricati = 0
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 256):
                    if chunk:
                        f.write(chunk)
                        scaricati += len(chunk)
        print(f"[Broll] ✅ {dest_path} ({scaricati // 1024} KB)", flush=True)
        return
    except ImportError:
        pass

    # Fallback urllib
    urllib.request.urlretrieve(url, dest_path)
    size = os.path.getsize(dest_path)
    print(f"[Broll] ✅ {dest_path} ({size // 1024} KB)", flush=True)


def _scegli_file_video(video_files: list, qualita_preferita: list = QUALITY_PRIORITY) -> dict | None:
    """
    Dato l'array `video_files` di un video Pexels, sceglie il file
    nella qualità preferita (hd > sd) escludendo il 4K.
    Ritorna il dict del file scelto o None se vuoto.
    """
    # Escludi 4K (width >= 3840 o quality == "uhd")
    candidati = [
        f for f in video_files
        if f.get("quality") != "uhd" and f.get("width", 9999) < 3840
    ]
    if not candidati:
        candidati = video_files  # fallback: prendi tutto

    for q in qualita_preferita:
        for f in candidati:
            if f.get("quality") == q:
                return f

    # Nessuna qualità preferita trovata → prendi il primo disponibile
    return candidati[0] if candidati else None


# ── Pixabay helpers ───────────────────────────────────────────────────────────

def _pixabay_search(keyword: str, per_page: int = 5) -> list[dict]:
    """
    Cerca video su Pixabay.
    Ritorna lista normalizzata: { id, url_dl, durata, larghezza, altezza,
                                  thumbnail, autore, url_pixabay }
    Ritorna [] se chiave non configurata o nessun risultato.

    Pixabay API docs: https://pixabay.com/api/docs/#api_videos
    Nota: Pixabay non supporta filtro orientamento nativo — filtriamo lato client.
    """
    api_key = _get_pixabay_key()
    if not api_key:
        return []

    params = {
        "key":       api_key,
        "q":         keyword,
        "video_type":"film",        # "film" = footage reale (no animazioni)
        "per_page":  per_page,
        "safesearch":"true",
    }

    try:
        data = _pexels_get(PIXABAY_BASE_URL, params, api_key="")
        # Pixabay non usa header Authorization — la key va nei params,
        # ma _pexels_get aggiunge il header: usiamo urllib direttamente
    except Exception:
        # Fallback diretto urllib (Pixabay usa query param, non header)
        query    = urllib.parse.urlencode(params)
        full_url = f"{PIXABAY_BASE_URL}?{query}"
        try:
            req = urllib.request.Request(full_url)
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read().decode("utf-8"))
        except Exception as e:
            print(f"[Broll/Pixabay] Errore ricerca: {e}", flush=True)
            return []

    risultati = []
    for hit in data.get("hits", []):
        videos = hit.get("videos", {})
        # Scegli qualità: large (hd) > medium > small
        file_info = (
            videos.get("large") or
            videos.get("medium") or
            videos.get("small") or
            {}
        )
        url_dl = file_info.get("url", "")
        if not url_dl:
            continue

        risultati.append({
            "id":         hit.get("id"),
            "url_dl":     url_dl,
            "durata":     hit.get("duration", 0),
            "larghezza":  file_info.get("width", 0),
            "altezza":    file_info.get("height", 0),
            "thumbnail":  hit.get("picture_id", ""),   # non è un URL diretto
            "autore":     hit.get("user", "Pixabay"),
            "url_pixabay": f"https://pixabay.com/videos/id-{hit.get('id')}/",
        })

    return risultati


def _pixabay_cerca_broll(
    keyword: str,
    durata_min: int = 3,
    orientamento: str = "portrait",
    output_dir: str | None = None,
) -> str:
    """
    Cerca e scarica un video B-roll da Pixabay.
    Stessa interfaccia di cerca_broll() — usata come fallback.
    """
    dest_dir = output_dir or BROLL_CACHE_DIR
    os.makedirs(dest_dir, exist_ok=True)

    print(f"[Broll/Pixabay] Ricerca: '{keyword}' min={durata_min}s", flush=True)

    risultati = _pixabay_search(keyword, per_page=10)
    if not risultati:
        raise RuntimeError(f"Nessun risultato Pixabay per '{keyword}'.")

    # Filtra per durata minima
    ok = [r for r in risultati if r["durata"] >= durata_min]
    if not ok:
        ok = sorted(risultati, key=lambda r: r["durata"], reverse=True)

    # Filtra per orientamento (portrait = altezza > larghezza)
    if orientamento == "portrait":
        portrait = [r for r in ok if r["altezza"] > r["larghezza"]]
        if portrait:
            ok = portrait

    for r in ok:
        url_dl = r["url_dl"]
        safe_kw   = re.sub(r"[^\w]", "_", keyword)[:30]
        file_name = f"{safe_kw}_px{r['id']}.mp4"
        dest_path = os.path.join(dest_dir, file_name)

        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10_000:
            print(f"[Broll/Pixabay] Cache hit: {dest_path}", flush=True)
            return dest_path

        _scarica_file(url_dl, dest_path)
        return dest_path

    raise RuntimeError(f"Nessun file video Pixabay scaricabile per '{keyword}'.")


def _pixabay_preview(keyword: str, n: int = 3) -> list[dict]:
    """Ritorna preview Pixabay normalizzata (stessa struttura di cerca_broll_preview)."""
    risultati = _pixabay_search(keyword, per_page=n + 5)
    out = []
    for r in risultati[:n]:
        out.append({
            "id":         r["id"],
            "url_pexels": r["url_pixabay"],   # campo generico — contiene URL Pixabay
            "durata":     r["durata"],
            "larghezza":  r["larghezza"],
            "altezza":    r["altezza"],
            "thumbnail":  "",   # Pixabay non fornisce thumbnail URL diretto nella search
            "autore":     r["autore"],
            "sorgente":   "Pixabay",
        })
    return out


# ── 1. cerca_broll ────────────────────────────────────────────────────────────

def _cerca_broll_pexels(
    keyword: str,
    durata_min: int,
    orientamento: str,
    output_dir: str,
    max_results: int = 5,
) -> str:
    """Cerca e scarica da Pexels. Solleva RuntimeError se fallisce."""
    api_key  = _get_pexels_key()
    if not api_key:
        raise RuntimeError("PEXELS_API_KEY non configurata.")

    dest_dir = output_dir
    os.makedirs(dest_dir, exist_ok=True)

    print(f"[Broll/Pexels] Ricerca: '{keyword}' orient={orientamento} min={durata_min}s", flush=True)

    data = _pexels_get(
        PEXELS_BASE_URL,
        {"query": keyword, "per_page": max_results, "orientation": orientamento},
        api_key,
    )

    videos = data.get("videos", [])
    if not videos:
        raise RuntimeError(f"Nessun risultato Pexels per '{keyword}'.")

    videos_ok = [v for v in videos if v.get("duration", 0) >= durata_min]
    if not videos_ok:
        videos_ok = sorted(videos, key=lambda v: v.get("duration", 0), reverse=True)
        print(f"[Broll/Pexels] Nessun video >= {durata_min}s — uso il più lungo.", flush=True)

    for video in videos_ok:
        file_info = _scegli_file_video(video.get("video_files", []))
        if not file_info:
            continue
        video_url = file_info.get("link", "")
        if not video_url:
            continue

        safe_kw   = re.sub(r"[^\w]", "_", keyword)[:30]
        dest_path = os.path.join(dest_dir, f"{safe_kw}_{video['id']}.mp4")

        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10_000:
            print(f"[Broll/Pexels] Cache hit: {dest_path}", flush=True)
            return dest_path

        _scarica_file(video_url, dest_path)
        return dest_path

    raise RuntimeError(f"Nessun file Pexels scaricabile per '{keyword}'.")


def cerca_broll(
    keyword: str,
    durata_min: int = 3,
    orientamento: str = "portrait",
    output_dir: str | None = None,
    max_results: int = 5,
) -> str:
    """
    Cerca e scarica un video B-roll. Prova Pexels prima, poi Pixabay come fallback.

    Args:
        keyword:      Parola chiave di ricerca (preferibilmente in inglese).
        durata_min:   Durata minima in secondi del clip (default 3).
        orientamento: "portrait" | "landscape" | "square" (default "portrait").
        output_dir:   Cartella di destinazione (default: broll_cache/).
        max_results:  Quanti risultati richiedere per sorgente (default 5).

    Returns:
        Path assoluto del file MP4 scaricato.

    Raises:
        RuntimeError: Nessuna API key configurata o nessun risultato trovato.
    """
    if not _at_least_one_key():
        raise RuntimeError(
            "Nessuna API key B-roll configurata.\n"
            "Aggiungi PEXELS_API_KEY o PIXABAY_API_KEY in .env / secrets.json."
        )

    dest_dir = output_dir or BROLL_CACHE_DIR
    errori   = []

    # — Tentativo 1: Pexels ————————————————————————————————————————————————
    if _get_pexels_key():
        try:
            return _cerca_broll_pexels(keyword, durata_min, orientamento, dest_dir, max_results)
        except Exception as e:
            print(f"[Broll] Pexels fallito ({e}) — provo Pixabay...", flush=True)
            errori.append(f"Pexels: {e}")

    # — Tentativo 2: Pixabay fallback ──────────────────────────────────────
    if _get_pixabay_key():
        try:
            return _pixabay_cerca_broll(keyword, durata_min, orientamento, dest_dir)
        except Exception as e:
            errori.append(f"Pixabay: {e}")

    raise RuntimeError(
        f"Nessuna sorgente B-roll disponibile per '{keyword}'.\n" + "\n".join(errori)
    )


# ── Preview (usata dal comando BROLL: del bot) ────────────────────────────────

def cerca_broll_preview(
    keyword: str,
    n: int = 3,
    orientamento: str = "portrait",
) -> list[dict]:
    """
    Ritorna i primi `n` risultati senza scaricare nulla.
    Prova Pexels; se non disponibile usa Pixabay.

    Returns:
        Lista di dict:
        { id, url_pexels, durata, larghezza, altezza, thumbnail, autore, sorgente }
    """
    risultati = []

    # — Pexels ——————————————————————————————————————————————————————————————
    pexels_key = _get_pexels_key()
    if pexels_key:
        try:
            data = _pexels_get(
                PEXELS_BASE_URL,
                {"query": keyword, "per_page": min(n, 15), "orientation": orientamento},
                pexels_key,
            )
            for v in data.get("videos", [])[:n]:
                risultati.append({
                    "id":         v.get("id"),
                    "url_pexels": v.get("url", ""),
                    "durata":     v.get("duration", 0),
                    "larghezza":  v.get("width", 0),
                    "altezza":    v.get("height", 0),
                    "thumbnail":  v.get("image", ""),
                    "autore":     v.get("user", {}).get("name", "—"),
                    "sorgente":   "Pexels",
                })
        except Exception as e:
            print(f"[Broll] Preview Pexels fallita: {e}", flush=True)

    # — Pixabay (riempie i posti mancanti) ──────────────────────────────────
    rimasti = n - len(risultati)
    if rimasti > 0 and _get_pixabay_key():
        try:
            risultati += _pixabay_preview(keyword, n=rimasti)
        except Exception as e:
            print(f"[Broll] Preview Pixabay fallita: {e}", flush=True)

    if not risultati:
        raise RuntimeError(
            "PEXELS_API_KEY e PIXABAY_API_KEY non configurate o nessun risultato.\n"
            "Aggiungi almeno una chiave in .env / secrets.json."
        )

    return risultati


# ── 2. suggerisci_broll ───────────────────────────────────────────────────────

def _estrai_keyword_semplice(testo: str) -> str:
    """
    Fallback senza API: estrae le parole più lunghe del segmento
    come proxy di keyword (nomi/verbi principali).
    """
    stop_it = {
        "che", "per", "con", "una", "uno", "gli", "dei", "del", "della",
        "delle", "nella", "nelle", "negli", "sulla", "sulle", "sugli",
        "questo", "questa", "questi", "queste", "sono", "essere", "avere",
        "fare", "come", "quando", "dove", "anche", "molto", "più",
    }
    parole = re.findall(r"[a-zA-ZàèéìòùÀÈÉÌÒÙ]{4,}", testo.lower())
    uniche = []
    seen   = set()
    for p in parole:
        if p not in stop_it and p not in seen:
            uniche.append(p)
            seen.add(p)

    # Prendi le 2 parole più lunghe (proxy di sostantivi/verbi principali)
    uniche.sort(key=len, reverse=True)
    return ", ".join(uniche[:2]) if uniche else testo[:20]


def _haiku_keywords(testo: str, api_key: str) -> str:
    """
    Chiama Claude Haiku per estrarre 1-2 keyword inglesi per B-roll.
    Ritorna stringa "keyword1, keyword2".
    """
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    resp   = client.messages.create(
        model      = "claude-haiku-4-5-20251001",
        max_tokens = 30,
        messages   = [{
            "role":    "user",
            "content": (
                f"Suggest 1-2 English keywords to find a relevant B-roll stock video "
                f"for this phrase: \"{testo}\"\n"
                f"Reply ONLY with the keywords separated by a comma. No explanation."
            ),
        }],
    )
    return resp.content[0].text.strip()


def suggerisci_broll(trascrizione_segmenti: list[dict]) -> list[dict]:
    """
    Analizza i segmenti della trascrizione Whisper e suggerisce keyword
    B-roll per ognuno.

    Args:
        trascrizione_segmenti: Lista di dict con almeno { id/text/start/end }.
            Tipicamente il campo `timeline_segments` prodotto da Whisper.

    Returns:
        Lista di dict: { segmento_id, keywords, start, end }

    Note:
        - Se ANTHROPIC_API_KEY disponibile → usa Claude Haiku.
        - Fallback: estrazione keyword semplice (nomi/verbi più lunghi).
    """
    anthropic_key = _get_anthropic_key()
    risultati     = []

    for i, seg in enumerate(trascrizione_segmenti):
        testo = seg.get("text", "").strip()
        if not testo:
            continue

        seg_id = seg.get("id", i)
        start  = seg.get("start", 0.0)
        end    = seg.get("end", 0.0)

        if anthropic_key:
            try:
                keywords = _haiku_keywords(testo, anthropic_key)
                print(f"[Broll] Seg {seg_id} → keywords Haiku: {keywords}", flush=True)
            except Exception as e:
                print(f"[Broll] Haiku fallito ({e}) — fallback semplice", flush=True)
                keywords = _estrai_keyword_semplice(testo)
        else:
            keywords = _estrai_keyword_semplice(testo)
            print(f"[Broll] Seg {seg_id} → keywords semplici: {keywords}", flush=True)

        risultati.append({
            "segmento_id": seg_id,
            "keywords":    keywords,
            "start":       start,
            "end":         end,
        })

    return risultati


# ── 3. scarica_broll_per_video ────────────────────────────────────────────────

def _taglia_clip(input_path: str, durata: float, output_path: str) -> None:
    """
    Taglia il clip alla durata indicata con ffmpeg (stream copy, veloce).
    Aggiunge 0.5s di buffer per evitare tagli secchi.
    """
    durata_safe = round(durata + 0.5, 2)
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-t", str(durata_safe),
        "-c", "copy",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg fallito: {result.stderr.decode('utf-8', errors='replace')[-300:]}"
        )


def _durata_video(path: str) -> float:
    """Legge la durata di un video con ffprobe."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, timeout=10, encoding="utf-8",
        )
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def scarica_broll_per_video(
    suggerimenti: list[dict],
    output_dir: str,
) -> list[dict]:
    """
    Per ogni suggerimento, cerca e scarica il clip B-roll da Pexels,
    poi lo taglia alla durata esatta del segmento.

    Args:
        suggerimenti: Output di suggerisci_broll().
        output_dir:   Cartella dove salvare i clip tagliati.

    Returns:
        Lista di dict: { segmento_id, clip_path, durata }
        I segmenti falliti vengono omessi (con log di warning).
    """
    os.makedirs(output_dir, exist_ok=True)
    risultati = []

    for sug in suggerimenti:
        seg_id   = sug["segmento_id"]
        keywords = sug["keywords"]
        start    = sug["start"]
        end      = sug["end"]
        durata   = round(end - start, 3)

        if durata <= 0:
            print(f"[Broll] Seg {seg_id}: durata {durata}s — saltato.", flush=True)
            continue

        # Usa la prima keyword (prima della virgola)
        keyword_principale = keywords.split(",")[0].strip()

        try:
            raw_path = cerca_broll(
                keyword_principale,
                durata_min=max(int(durata), 3),
                orientamento="portrait",
                output_dir=os.path.join(output_dir, "raw"),
            )
        except Exception as e:
            print(f"[Broll] Seg {seg_id} — download fallito: {e}", flush=True)
            continue

        # Taglia alla durata del segmento
        clip_name = f"broll_segment_{seg_id:02d}.mp4"
        clip_path = os.path.join(output_dir, clip_name)

        try:
            _taglia_clip(raw_path, durata, clip_path)
            durata_reale = _durata_video(clip_path) or durata
            print(f"[Broll] ✅ Seg {seg_id}: {clip_path} ({durata_reale:.1f}s)", flush=True)
            risultati.append({
                "segmento_id": seg_id,
                "clip_path":   clip_path,
                "durata":      durata_reale,
                "keywords":    keywords,
                "start":       start,
                "end":         end,
            })
        except Exception as e:
            print(f"[Broll] Seg {seg_id} — taglio fallito: {e}", flush=True)

    return risultati


# ── Formattazione per Telegram ────────────────────────────────────────────────

def fmt_broll_preview(risultati: list[dict], keyword: str) -> str:
    """Formatta la preview testuale per Telegram (prima del send_photo)."""
    if not risultati:
        return f"⚠️ Nessun risultato per: *{keyword}*"

    sorgenti = set(r.get("sorgente", "Pexels") for r in risultati)
    sorg_str = " + ".join(sorted(sorgenti))
    lines = [f"🎬 *B-roll {sorg_str} — \"{keyword}\"*\n"]

    for i, r in enumerate(risultati, 1):
        dur     = r["durata"]
        mins    = dur // 60
        secs    = dur % 60
        dur_str = f"{int(mins)}:{int(secs):02d}" if mins else f"{int(secs)}s"
        sorg    = r.get("sorgente", "")
        sorg_tag = f" `[{sorg}]`" if sorg else ""
        lines.append(
            f"*{i}.* {r['autore']}{sorg_tag}\n"
            f"   ⏱ {dur_str} · 📐 {r['larghezza']}×{r['altezza']}\n"
            f"   🔗 {r['url_pexels']}"
        )

    lines.append(
        "\n*Per scaricare:*\n"
        "`BROLL: <keyword>` esegue ricerca e download automatico"
    )
    return "\n".join(lines)


# ── Brief injection (per Video Editor) ───────────────────────────────────────

def build_broll_brief(clips: list[dict]) -> str:
    """
    Costruisce il blocco di testo da iniettare nel brief del Video Editor
    con le informazioni sui clip B-roll da usare.

    Il Video Editor userà i clip come sfondo con opacity ridotta:
      <Video src={staticFile('broll_segment_01.mp4')} style={{opacity: 0.4}} />

    Args:
        clips: Output di scarica_broll_per_video().

    Returns:
        Stringa da appendent al brief del Video Editor.
    """
    if not clips:
        return ""

    lines = [
        "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "B-ROLL DISPONIBILI (usa come sfondo con opacity 0.3–0.5):",
    ]
    for c in clips:
        fname = Path(c["clip_path"]).name
        lines.append(
            f"  Segmento {c['segmento_id']:02d} "
            f"({c['start']:.1f}s–{c['end']:.1f}s · {c['durata']:.1f}s): "
            f"staticFile('{fname}') — keyword: {c['keywords']}"
        )
    lines += [
        "",
        "Usa <Video src={staticFile('broll_segment_NN.mp4')}",
        "  volume={0} style={{opacity: 0.35, objectFit: 'cover'}} />",
        "Sovrapponi il testo sopra con z-index superiore.",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ]
    return "\n".join(lines)


# ── Trigger detection (usata dal bot) ────────────────────────────────────────

BROLL_TRIGGER_PHRASES = {
    "usa broll",
    "usa b-roll",
    "aggiungi broll",
    "aggiungi b-roll",
    "aggiungi video di sfondo",
    "video di sfondo",
    "b-roll",
    "broll",
}

def is_broll_request(testo: str) -> bool:
    """True se il testo delle direttive richiede B-roll."""
    tl = testo.lower()
    return any(phrase in tl for phrase in BROLL_TRIGGER_PHRASES)


# ── CLI self-test ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python broll_finder.py <keyword> [durata_min]")
        print("Es:  python broll_finder.py 'business meeting' 5")
        sys.exit(1)

    kw  = sys.argv[1]
    dur = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    print(f"\n[Test] Preview risultati per '{kw}'...")
    try:
        prev = cerca_broll_preview(kw, n=3)
        print(fmt_broll_preview(prev, kw))
    except RuntimeError as e:
        print(f"❌ {e}")
        sys.exit(1)

    print(f"\n[Test] Download primo B-roll '{kw}'...")
    try:
        path = cerca_broll(kw, durata_min=dur)
        print(f"✅ Scaricato: {path}")
    except RuntimeError as e:
        print(f"❌ {e}")
        sys.exit(1)
