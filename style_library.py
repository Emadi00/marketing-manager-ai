"""
style_library.py — Videocraft Studio Style Library
===================================================
Gestisce il salvataggio, l'analisi e il recupero di stili visivi.

Struttura su disco:
  BASE_PATH/styles/
    [nome_stile]/
      style_profile.json   ← profilo strutturato (usato da agenti)
      style_profile.txt    ← versione leggibile (iniettata nel brief)
      frames/
        frame_01.jpg
        frame_02.jpg
        ...

Nessuna dipendenza esterna oltre a ffmpeg/ffprobe e urllib (già usati dal bot).
"""

import os
import json
import re
import base64
import shutil
import subprocess
import urllib.request
import urllib.error
from datetime import datetime

# ── Configurazione (sovrascrivibile dopo l'import) ────────────────────────────
BASE_PATH  = os.environ.get("BASE_PATH", r"C:\Users\super\Desktop\MARKETING MANAGER")
API_KEY    = ""          # impostata da bot_telegram.py dopo il caricamento dei secrets
MODEL      = "claude-sonnet-4-6"
N_FRAMES   = 9           # frame equidistanti estratti per analisi

# ── Pricing (per log costi) ───────────────────────────────────────────────────
_PRICE = {"input": 3.0, "output": 15.0, "cache_read": 0.30, "cache_write": 3.75}

def _costo(usage: dict) -> float:
    return (
        usage.get("input_tokens", 0)               / 1_000_000 * _PRICE["input"]
      + usage.get("output_tokens", 0)              / 1_000_000 * _PRICE["output"]
      + usage.get("cache_read_input_tokens", 0)    / 1_000_000 * _PRICE["cache_read"]
      + usage.get("cache_creation_input_tokens", 0)/ 1_000_000 * _PRICE["cache_write"]
    )

# ── Percorsi ──────────────────────────────────────────────────────────────────
def _styles_root() -> str:
    d = os.path.join(BASE_PATH, "styles")
    os.makedirs(d, exist_ok=True)
    return d

def _style_dir(nome: str) -> str:
    d = os.path.join(_styles_root(), nome)
    os.makedirs(d, exist_ok=True)
    return d

# ── CRUD stili ────────────────────────────────────────────────────────────────
def lista_stili() -> list[dict]:
    """Ritorna tutti gli stili salvati con metadati di base."""
    root = _styles_root()
    result = []
    for nome in sorted(os.listdir(root)):
        profile_path = os.path.join(root, nome, "style_profile.json")
        if not os.path.exists(profile_path):
            continue
        try:
            with open(profile_path, encoding="utf-8") as f:
                p = json.load(f)
            result.append({
                "nome":        nome,
                "descrizione": p.get("descrizione_utente", ""),
                "mood":        p.get("mood", ""),
                "frame":       p.get("frame_analizzati", 0),
                "creato":      p.get("creato", "")[:10],
                "aggiornato":  p.get("aggiornato", "")[:10],
            })
        except Exception:
            result.append({"nome": nome, "descrizione": "", "mood": "", "frame": 0, "creato": "", "aggiornato": ""})
    return result

def carica_profilo(nome: str) -> dict | None:
    """Carica il profilo JSON completo di uno stile."""
    path = os.path.join(_styles_root(), nome, "style_profile.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def carica_profilo_txt(nome: str) -> str | None:
    """Carica il profilo testuale (per injection nel brief)."""
    path = os.path.join(_styles_root(), nome, "style_profile.txt")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return f.read()

def elimina_stile(nome: str) -> bool:
    """Elimina completamente uno stile (JSON, TXT, frame). Ritorna True se esisteva."""
    path = os.path.join(_styles_root(), nome)
    if os.path.exists(path):
        shutil.rmtree(path)
        return True
    return False

def stile_esiste(nome: str) -> bool:
    return os.path.exists(os.path.join(_styles_root(), nome, "style_profile.json"))

# ── Estrazione frame ──────────────────────────────────────────────────────────
def _durata_video(video_path: str) -> float:
    """Ritorna la durata in secondi tramite ffprobe."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", video_path],
            capture_output=True, text=True, timeout=30
        )
        return float(json.loads(r.stdout)["format"]["duration"])
    except Exception:
        return 10.0   # fallback sicuro

def estrai_frame(video_path: str, output_dir: str, n: int = N_FRAMES) -> list[str]:
    """
    Estrae N frame equidistanti dal video.
    Ritorna lista di path ai JPEG estratti.
    """
    os.makedirs(output_dir, exist_ok=True)
    dur      = _durata_video(video_path)
    interval = dur / (n + 1)
    paths    = []

    for i in range(1, n + 1):
        t        = interval * i
        out_path = os.path.join(output_dir, f"frame_{i:02d}.jpg")
        r = subprocess.run(
            ["ffmpeg", "-y", "-ss", f"{t:.2f}", "-i", video_path,
             "-frames:v", "1", "-q:v", "2", out_path],
            capture_output=True, timeout=30
        )
        if r.returncode == 0 and os.path.exists(out_path):
            paths.append(out_path)
        else:
            print(f"[StyleLib] ⚠️ Frame {i} non estratto (t={t:.1f}s)", flush=True)

    return paths

# ── Chiamate API Anthropic Vision ─────────────────────────────────────────────
def _b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")

def _api_call(payload: dict) -> tuple[str, dict]:
    """Chiamata raw all'API Anthropic. Ritorna (testo_risposta, usage_dict)."""
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "content-type":    "application/json",
            "x-api-key":       API_KEY,
            "anthropic-version": "2023-06-01",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        usage = result.get("usage", {})
        print(f"[StyleLib/API] in:{usage.get('input_tokens',0)} "
              f"out:{usage.get('output_tokens',0)} → ${_costo(usage):.4f}", flush=True)
        return result["content"][0]["text"], usage
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API {e.code}: {body[:400]}")

def analizza_frame(frame_path: str, descrizione_utente: str, idx: int, total: int) -> tuple[str, dict]:
    """
    Manda un singolo frame a Claude Vision con la descrizione dell'utente come contesto.
    Ritorna (analisi_testo, usage).
    """
    prompt = f"""Stai analizzando il frame {idx} di {total} di un video che rappresenta uno stile visivo.

L'utente descrive questo stile così:
"{descrizione_utente}"

Analizza il frame e fornisci un profilo visivo dettagliato e tecnico:

1. **Palette colori** — colori dominanti con codici HEX approssimati (sfondo, testo, accenti)
2. **Tipografia** — tipo di font (serif/sans-serif/display/pixel/script), peso visivo, dimensioni relative, allineamento
3. **Elementi grafici** — forme, linee, texture, effetti (glow, blur, glitch, grain, vignette, gradients...)
4. **Densità visiva** — da "vuoto/minimalista" a "ricco/maximalista"
5. **Layout e composizione** — dove si trovano gli elementi, uso dello spazio negativo, gerarchia visiva
6. **Mood** — sensazione emotiva trasmessa da questo frame
7. **Elemento distintivo** — cosa rende unico questo frame rispetto allo "standard"
8. **Valori TSX estraibili** (sezione critica — usata per generare codice Remotion):
   - `backgroundColor`: colore HEX esatto dello sfondo predominante in questo frame
   - `textColorPrimary`: colore HEX esatto del testo principale
   - `textColorAccent`: colore HEX esatto dell'accento cromatico dominante
   - `fontCategory`: categoria font rilevata (display-bold / script-calligrafico / pixel / sans-serif / serif) e suggerimento nome (es. Orbitron, Montserrat, Pinyon Script)
   - `animazioneOsservata`: stile di animazione suggerito dall'estetica del frame (es. "spring aggressive — entrate nette", "fade lento — transizioni morbide", "typewriter — testo progressivo")
   - `densitaVisiva`: minima / media / alta (in base alla percentuale di spazio vuoto vs elementi)
   - `elementiDecorativi`: descrivi esattamente cosa vedi come decorazione (o scrivi "nessuno" se il frame è pulito)

Sii preciso, tecnico, e usa i termini giusti del design visivo. I valori TSX devono essere ESTRATTI da ciò che vedi, non inventati. Rispondi in italiano."""

    payload = {
        "model": MODEL,
        "max_tokens": 900,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": _b64(frame_path),
                    }
                },
                {"type": "text", "text": prompt}
            ]
        }]
    }
    return _api_call(payload)

def sintetizza_profilo(analisi: list[str], descrizione_utente: str, nome_stile: str) -> tuple[dict, dict]:
    """
    Sintetizza le analisi dei singoli frame in un profilo JSON strutturato.
    Ritorna (profilo_dict, usage).
    """
    now = datetime.now().isoformat()
    analisi_testo = "\n\n--- FRAME SUCCESSIVO ---\n\n".join(
        f"[Frame {i+1}]\n{a}" for i, a in enumerate(analisi)
    )

    prompt = f"""Hai analizzato {len(analisi)} frame di un video con stile chiamato "{nome_stile}".

Descrizione dell'utente:
"{descrizione_utente}"

Analisi frame per frame:
{analisi_testo}

Sintetizza tutto in un profilo visivo unico e coerente. Considera i pattern ricorrenti tra i frame.

⚠️ REGOLA CRITICA — REGOLE TSX:
Il campo "regole_tsx" contiene DIRETTIVE OPERATIVE per il Video Editor Remotion.
TUTTI i valori DEVONO essere ESTRATTI dall'analisi dei frame — non inventati, non valori di default.
Ogni stile produce regole TSX diverse perché ogni stile ha colori, font e animazioni diversi:
- Uno stile "minimal dark" → backgroundColor scuro, zero elementi decorativi, animazioni slow
- Uno stile "energetico colorato" → colori vivaci, spring aggressive, elementi grafici presenti
I valori devono essere CONCRETI e COPIABILI direttamente nel codice TypeScript:
- colori: codici hex reali estratti dalla palette (non descrizioni)
- font: nomi esatti dei font rilevati (o la categoria più vicina tra Orbitron/Montserrat/Inter/AlfenaPixel/Pinyon Script)
- animazioni_permesse: SOLO quelle che corrispondono allo stile rilevato dai frame
- animazioni_vietate: quelle che contraddicono lo stile (es. glitch in uno stile minimalista)
- spring_preset: "aggressive" (damping:6,stiffness:300) / "standard" (damping:12,stiffness:150) / "soft" (damping:18,stiffness:120)
- densita_visiva: "minima" / "media" / "alta" — basata sulla percentuale di spazio vuoto osservata nei frame

Rispondi SOLO con JSON valido, nessun testo prima o dopo:

{{
  "nome": "{nome_stile}",
  "descrizione_utente": "{descrizione_utente}",
  "palette": {{
    "primario":   "#XXXXXX",
    "secondario": "#XXXXXX",
    "accento":    "#XXXXXX",
    "background": "#XXXXXX",
    "testo":      "#XXXXXX"
  }},
  "tipografia": {{
    "stile":      "sans-serif geometrico / serif elegante / display bold / pixel / etc",
    "peso":       "light / regular / bold / extrabold",
    "dimensioni": "descrizione dimensioni e gerarchia",
    "posizione":  "centrato / sinistra / variabile"
  }},
  "elementi_grafici": ["elemento1", "elemento2", "..."],
  "densita_visiva": "minimalista / equilibrata / ricca",
  "layout": "descrizione del layout tipico e composizione",
  "animazioni": "smooth e lente / veloci e aggressive / step discreti / etc",
  "mood": "parola1, parola2, parola3",
  "elementi_unici": "cosa rende inconfondibile questo stile",
  "note_tecniche": "indicazioni concrete per il Video Editor Remotion",
  "regole_tsx": {{
    "backgroundColor":    "#XXXXXX",
    "textPrimary":        "#XXXXXX",
    "textSecondary":      "#XXXXXX",
    "accent":             "#XXXXXX",
    "accent2":            "#XXXXXX",
    "fontTitle":          "NomeFont",
    "fontSubtitle":       "NomeFont",
    "fontSizeTitle":      "NNpx",
    "fontSizeBody":       "NNpx",
    "fontSizeSub":        "NNpx",
    "fontWeight":         "NNN",
    "animazioni_permesse": ["spring-aggressive", "fade-in"],
    "animazioni_vietate":  ["glitch", "shake"],
    "elementi_decorativi": "descrizione esatta di cosa si vede come decorazione nei frame, oppure nessuno",
    "densita_visiva":     "minima",
    "layout":             "centrato",
    "spring_preset":      "aggressive",
    "note_obbligatorie":  "regola critica specifica estratta dallo stile"
  }},
  "frame_analizzati": {len(analisi)},
  "creato": "{now}"
}}"""

    payload = {
        "model": MODEL,
        "max_tokens": 1800,
        "messages": [{"role": "user", "content": prompt}]
    }
    testo, usage = _api_call(payload)

    # Estrae JSON anche se c'è testo residuo
    m = re.search(r'\{[\s\S]*\}', testo)
    raw = m.group() if m else testo
    profilo = json.loads(raw)
    return profilo, usage

# ── Conversione profilo → testo per brief ────────────────────────────────────
def profilo_to_txt(profilo: dict) -> str:
    """
    Produce il blocco testuale "STYLE DNA" da iniettare nel brief del Marketing Manager.
    Formato Markdown leggibile dagli agenti LLM.
    Include la sezione REGOLE TSX con valori operativi copiabili direttamente nel codice.
    """
    p   = profilo
    pal = p.get("palette", {})
    tip = p.get("tipografia", {})
    tsx = p.get("regole_tsx", {})
    grafici = p.get("elementi_grafici", [])
    grafici_str = ", ".join(grafici) if grafici else "—"

    # Sezione REGOLE TSX — presente solo se il profilo le ha (stili generati con nuova versione)
    if tsx:
        anim_ok  = ", ".join(tsx.get("animazioni_permesse", [])) or "—"
        anim_no  = ", ".join(tsx.get("animazioni_vietate",  [])) or "—"
        regole_tsx_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## REGOLE TSX (OBBLIGATORIE — copia questi valori nel codice)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ QUESTE REGOLE SOVRASCRIVONO I DEFAULT DEL VIDEO EDITOR.
Il Video Editor DEVE creare theme.ts con ESATTAMENTE questi valori.

### Colori (usa in THEME — niente hardcoding nei componenti)
- backgroundColor:  {tsx.get('backgroundColor', pal.get('background', '#0a0a0a'))}
- textPrimary:      {tsx.get('textPrimary',    pal.get('testo',      '#ffffff'))}
- textSecondary:    {tsx.get('textSecondary',   '#aaaaaa')}
- accent:           {tsx.get('accent',          pal.get('accento',    '#39FF14'))}
- accent2:          {tsx.get('accent2',         pal.get('secondario', '#ffffff'))}

### Font (nomi esatti da usare in fontFamily)
- fontTitle:        {tsx.get('fontTitle',    tip.get('stile', 'Orbitron'))}
- fontSubtitle:     {tsx.get('fontSubtitle', 'Montserrat')}
- fontSizeTitle:    {tsx.get('fontSizeTitle', '72px')}
- fontSizeBody:     {tsx.get('fontSizeBody',  '36px')}
- fontSizeSub:      {tsx.get('fontSizeSub',   '24px')}
- fontWeight:       {tsx.get('fontWeight',    '900')}

### Animazioni e layout
- Spring preset:          {tsx.get('spring_preset', 'standard')}
- Animazioni PERMESSE:    {anim_ok}
- Animazioni VIETATE:     {anim_no}
- Elementi decorativi:    {tsx.get('elementi_decorativi', '—')}
- Densità visiva:         {tsx.get('densita_visiva', p.get('densita_visiva', '—'))}
- Layout:                 {tsx.get('layout', 'centrato')}

### Note obbligatorie aggiuntive
{tsx.get('note_obbligatorie', '—')}"""
    else:
        regole_tsx_block = ""

    return f"""## STYLE DNA: {p.get('nome', '?')}

**Descrizione utente**: {p.get('descrizione_utente', '')}
**Mood**: {p.get('mood', '')}

### Palette colori
- Primario:   {pal.get('primario', '?')}
- Secondario: {pal.get('secondario', '?')}
- Accento:    {pal.get('accento', '?')}
- Background: {pal.get('background', '?')}
- Testo:      {pal.get('testo', '?')}

### Tipografia
- Stile:     {tip.get('stile', '?')}
- Peso:      {tip.get('peso', '?')}
- Dimensioni:{tip.get('dimensioni', '?')}
- Posizione: {tip.get('posizione', '?')}

### Elementi grafici
{grafici_str}

### Layout e composizione
{p.get('layout', '?')}

### Animazioni
{p.get('animazioni', '?')}

### Densità visiva
{p.get('densita_visiva', '?')}

### Elemento unico di questo stile
{p.get('elementi_unici', '?')}

### Note tecniche per Video Editor (Remotion)
{p.get('note_tecniche', '?')}{regole_tsx_block}"""

# ── Pipeline completa: salva stile da immagini ───────────────────────────────
async def salva_stile_da_foto(
    nome: str,
    descrizione: str,
    foto_paths: list[str],
    progress_cb=None,   # async callable(str)
) -> dict:
    """
    Crea o aggiorna uno stile da una lista di file immagine (JPEG/PNG).
    Salta l'estrazione frame — le immagini sono già frame.
    Compatibile con salva_stile(): stesso formato JSON/TXT in output.
    """
    if not API_KEY:
        raise RuntimeError("API_KEY non configurata in style_library")
    if not foto_paths:
        raise RuntimeError("Nessuna immagine fornita")

    style_path = _style_dir(nome)
    frames_dir = os.path.join(style_path, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    # Copia le immagini nella cartella frames con numerazione progressiva
    # (se ci sono già frame esistenti, numera in continuazione)
    existing = [f for f in os.listdir(frames_dir) if f.endswith(".jpg")]
    start_idx = len(existing) + 1
    frame_paths = []
    for i, src in enumerate(foto_paths, start_idx):
        ext  = os.path.splitext(src)[1].lower() or ".jpg"
        dst  = os.path.join(frames_dir, f"frame_{i:02d}{ext}")
        import shutil as _sh
        _sh.copy2(src, dst)
        frame_paths.append(dst)

    if progress_cb:
        await progress_cb(f"✅ {len(frame_paths)} immagini pronte. Avvio analisi Vision...")

    # Analizza ogni frame
    analisi   = []
    costo_tot = 0.0
    for idx, fp in enumerate(frame_paths, 1):
        if progress_cb:
            await progress_cb(f"🔍 Analisi immagine {idx}/{len(frame_paths)}...")
        testo, usage = analizza_frame(fp, descrizione, idx, len(frame_paths))
        analisi.append(testo)
        costo_tot += _costo(usage)

    # Sintetizza
    if progress_cb:
        await progress_cb(f"🧬 Sintesi profilo stile ({len(analisi)} analisi)...")
    profilo, usage_synth = sintetizza_profilo(analisi, descrizione, nome)
    costo_tot += _costo(usage_synth)

    # Se esiste già → aggiorna contatore frame e preserva data creazione
    profile_path = os.path.join(style_path, "style_profile.json")
    if os.path.exists(profile_path):
        try:
            with open(profile_path, encoding="utf-8") as f:
                old = json.load(f)
            profilo["frame_analizzati"] += old.get("frame_analizzati", 0)
            profilo["creato"]    = old.get("creato", profilo["creato"])
            profilo["aggiornato"] = datetime.now().isoformat()
        except Exception:
            pass

    # Salva JSON + TXT
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(profilo, f, ensure_ascii=False, indent=2)
    txt_path = os.path.join(style_path, "style_profile.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(profilo_to_txt(profilo))

    print(f"[StyleLib] ✅ Stile '{nome}' da foto salvato — costo totale: ${costo_tot:.4f}", flush=True)
    profilo["_costo_sessione"] = round(costo_tot, 4)
    return profilo


# ── Pipeline completa: salva stile da video ───────────────────────────────────
async def salva_stile(
    nome: str,
    descrizione: str,
    video_path: str,
    progress_cb=None,   # async callable(str) — invia aggiornamenti a Telegram
    n_frames: int = N_FRAMES,
) -> dict:
    """
    Pipeline completa:
      1. Estrai N frame equidistanti dal video
      2. Analizza ogni frame con Claude Vision
      3. Sintetizza in profilo JSON
      4. Salva profile.json, profile.txt, frame/

    Se lo stile esiste già, aggiunge i frame e aggiorna il profilo.
    Ritorna il profilo finale.
    """
    if not API_KEY:
        raise RuntimeError("API_KEY non configurata in style_library")

    style_path = _style_dir(nome)
    frames_dir = os.path.join(style_path, "frames")

    # 1. Estrai frame
    if progress_cb:
        await progress_cb(f"🎞️ Estrazione {n_frames} frame dal video...")
    frame_paths = estrai_frame(video_path, frames_dir, n_frames)
    if not frame_paths:
        raise RuntimeError("Nessun frame estratto — video non valido o ffmpeg non trovato")
    if progress_cb:
        await progress_cb(f"✅ {len(frame_paths)} frame estratti. Avvio analisi Vision...")

    # 2. Analizza frame
    analisi     = []
    costo_tot   = 0.0
    for idx, fp in enumerate(frame_paths, 1):
        if progress_cb:
            await progress_cb(f"🔍 Analisi frame {idx}/{len(frame_paths)}...")
        testo, usage = analizza_frame(fp, descrizione, idx, len(frame_paths))
        analisi.append(testo)
        costo_tot += _costo(usage)

    # 3. Sintetizza
    if progress_cb:
        await progress_cb(f"🧬 Sintesi profilo stile ({len(analisi)} analisi)...")
    profilo, usage_synth = sintetizza_profilo(analisi, descrizione, nome)
    costo_tot += _costo(usage_synth)

    # 4. Se esiste già → aggiorna contatore frame e preserva data creazione
    profile_path = os.path.join(style_path, "style_profile.json")
    if os.path.exists(profile_path):
        try:
            with open(profile_path, encoding="utf-8") as f:
                old = json.load(f)
            profilo["frame_analizzati"] += old.get("frame_analizzati", 0)
            profilo["creato"]   = old.get("creato", profilo["creato"])
            profilo["aggiornato"] = datetime.now().isoformat()
        except Exception:
            pass

    # 5. Salva JSON
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(profilo, f, ensure_ascii=False, indent=2)

    # 6. Salva TXT
    txt_path = os.path.join(style_path, "style_profile.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(profilo_to_txt(profilo))

    print(f"[StyleLib] ✅ Stile '{nome}' salvato — costo totale: ${costo_tot:.4f}", flush=True)
    profilo["_costo_sessione"] = round(costo_tot, 4)
    return profilo

async def rigenera_profilo_tsx(
    nome: str,
    progress_cb=None,
) -> dict:
    """
    Rigenera il profilo di uno stile esistente rianalizzando i frame già salvati.
    Usa i prompt aggiornati (con punto 8 TSX per frame e regole_tsx con densita_visiva).
    Sovrascrive style_profile.json e style_profile.txt.
    Ritorna il profilo aggiornato.
    """
    if not API_KEY:
        raise RuntimeError("API_KEY non configurata in style_library")

    style_path = _style_dir(nome)
    frames_dir = os.path.join(style_path, "frames")
    profile_path = os.path.join(style_path, "style_profile.json")

    if not os.path.exists(frames_dir):
        raise RuntimeError(f"Nessuna cartella frames per lo stile '{nome}'")

    frame_paths = sorted([
        os.path.join(frames_dir, f)
        for f in os.listdir(frames_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ])
    if not frame_paths:
        raise RuntimeError(f"Nessun frame trovato in {frames_dir}")

    # Carica descrizione dal profilo esistente (se presente)
    descrizione = nome
    if os.path.exists(profile_path):
        try:
            with open(profile_path, encoding="utf-8") as f:
                old_profilo = json.load(f)
            descrizione = old_profilo.get("descrizione_utente", nome)
        except Exception:
            pass

    if progress_cb:
        await progress_cb(f"🔄 Rigenera '{nome}': {len(frame_paths)} frame con prompt aggiornato...")

    analisi   = []
    costo_tot = 0.0
    for idx, fp in enumerate(frame_paths, 1):
        if progress_cb:
            await progress_cb(f"🔍 Analisi frame {idx}/{len(frame_paths)}...")
        testo, usage = analizza_frame(fp, descrizione, idx, len(frame_paths))
        analisi.append(testo)
        costo_tot += _costo(usage)

    if progress_cb:
        await progress_cb(f"🧬 Sintesi profilo TSX aggiornato ({len(analisi)} analisi)...")
    profilo, usage_synth = sintetizza_profilo(analisi, descrizione, nome)
    costo_tot += _costo(usage_synth)

    # Preserva data creazione originale
    if os.path.exists(profile_path):
        try:
            with open(profile_path, encoding="utf-8") as f:
                old = json.load(f)
            profilo["creato"]    = old.get("creato", profilo.get("creato", datetime.now().isoformat()))
            profilo["aggiornato"] = datetime.now().isoformat()
        except Exception:
            pass

    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(profilo, f, ensure_ascii=False, indent=2)
    txt_path = os.path.join(style_path, "style_profile.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(profilo_to_txt(profilo))

    print(f"[StyleLib] ✅ Stile '{nome}' rigenerato — {len(frame_paths)} frame — costo: ${costo_tot:.4f}", flush=True)
    profilo["_costo_sessione"] = round(costo_tot, 4)
    return profilo


# ── Visual compliance check post-render ──────────────────────────────────────

def check_visual_compliance(
    video_path: str,
    profilo: dict,
    n_frames: int = 6,
) -> dict:
    """
    Confronta il video renderizzato con il profilo stile tramite Claude Vision.
    Estrae n_frames equidistanti, li manda tutti in un'unica chiamata API.

    Ritorna dict con:
      score_globale: int (0-100)
      dettagli: {palette, tipografia, layout, elementi_grafici, mood} → {score, note}
      issues: list[str]      — problemi rilevati
      positivi: list[str]    — aspetti conformi
      raccomandazioni: list[str] — fix suggeriti per il Video Editor
      costo: float
      raw: str
    """
    import tempfile

    # Estrai frame in directory temporanea
    tmp_dir = tempfile.mkdtemp(prefix="vc_check_")
    try:
        frame_paths = estrai_frame(video_path, tmp_dir, n_frames)
        if not frame_paths:
            return {"score_globale": -1, "issues": ["Nessun frame estratto"], "costo": 0.0, "raw": ""}

        # Costruisci il profilo DNA testuale per il confronto
        dna_txt = profilo_to_txt(profilo)

        # Content: tutte le immagini + prompt testo
        content = []
        for fp in frame_paths:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": _b64(fp),
                }
            })

        prompt = f"""Sei un quality controller visivo per video marketing.
Hai davanti {len(frame_paths)} frame equidistanti di un video appena renderizzato.
Devi valutare quanto il video è fedele al seguente STYLE DNA di riferimento.

═══════════════════════════════════════
STYLE DNA DI RIFERIMENTO:
═══════════════════════════════════════
{dna_txt}
═══════════════════════════════════════

Analizza ogni aspetto visivo dei frame e confrontalo con il DNA.
Rispondi SOLO con JSON valido (nessun testo fuori):

{{
  "score_globale": <intero 0-100>,
  "dettagli": {{
    "palette":          {{"score": <0-100>, "note": "<osservazione specifica>"}},
    "tipografia":       {{"score": <0-100>, "note": "<osservazione specifica>"}},
    "layout":           {{"score": <0-100>, "note": "<osservazione specifica>"}},
    "elementi_grafici": {{"score": <0-100>, "note": "<osservazione specifica>"}},
    "mood":             {{"score": <0-100>, "note": "<osservazione specifica>"}}
  }},
  "issues": [
    "<problema specifico rilevato nel video — es: il font del titolo non corrisponde>",
    "..."
  ],
  "positivi": [
    "<aspetto correttamente rispettato — es: palette neon applicata correttamente>",
    "..."
  ],
  "raccomandazioni": [
    "<indicazione tecnica per il Video Editor — es: cambia fontFamily in HookScene.tsx da X a Y>",
    "..."
  ]
}}

Score 0-100: 90+ = eccellente, 75-89 = buono, 60-74 = accettabile, <60 = non conforme."""

        content.append({"type": "text", "text": prompt})

        payload = {
            "model": MODEL,
            "max_tokens": 1500,
            "messages": [{"role": "user", "content": content}]
        }
        raw_text, usage = _api_call(payload)

        # Parse JSON dalla risposta
        import re as _re
        m = _re.search(r'\{[\s\S]*\}', raw_text)
        if m:
            result = json.loads(m.group())
        else:
            result = {"score_globale": -1, "issues": ["Risposta non parseable"], "raw": raw_text}

        result["costo"] = round(_costo(usage), 4)
        result["raw"]   = raw_text
        print(f"[StyleLib/Check] Score={result.get('score_globale')} costo=${result['costo']:.4f}", flush=True)
        return result

    finally:
        # Pulizia frame temporanei
        import shutil as _sh
        try:
            _sh.rmtree(tmp_dir)
        except Exception:
            pass


def fmt_compliance_report(result: dict, nome_stile: str) -> str:
    """Formatta il risultato del visual check per Telegram."""
    score = result.get("score_globale", -1)
    if score < 0:
        return f"⚠️ Visual check non disponibile: {result.get('issues', ['errore'])[0]}"

    # Emoji score
    if score >= 90:
        emoji = "🟢"
    elif score >= 75:
        emoji = "🟡"
    elif score >= 60:
        emoji = "🟠"
    else:
        emoji = "🔴"

    det = result.get("dettagli", {})

    def _det(key):
        d = det.get(key, {})
        s = d.get("score", "?")
        n = d.get("note", "")
        bar = "▓" * (s // 20) + "░" * (5 - s // 20) if isinstance(s, int) else "?????"
        return f"{bar} {s}/100 — {n}"

    issues  = result.get("issues", [])
    positivi= result.get("positivi", [])
    raccomandazioni = result.get("raccomandazioni", [])

    lines = [
        f"{emoji} *Visual Check — Stile: {nome_stile}*",
        f"Score globale: *{score}/100*\n",
        f"🎨 Palette:    {_det('palette')}",
        f"✏️ Tipografia: {_det('tipografia')}",
        f"📐 Layout:     {_det('layout')}",
        f"✨ Elementi:   {_det('elementi_grafici')}",
        f"💫 Mood:       {_det('mood')}",
    ]
    if positivi:
        lines.append("\n✅ *Conforme:*")
        lines += [f"  • {p}" for p in positivi[:3]]
    if issues:
        lines.append("\n⚠️ *Problemi:*")
        lines += [f"  • {i}" for i in issues[:4]]
    if raccomandazioni:
        lines.append("\n🔧 *Fix suggeriti:*")
        lines += [f"  • {r}" for r in raccomandazioni[:3]]

    costo = result.get("costo", 0)
    lines.append(f"\n💰 Costo check: ${costo:.4f}")
    return "\n".join(lines)


# ── Formattazione messaggi Telegram ──────────────────────────────────────────
def fmt_lista_stili(stili: list[dict]) -> str:
    if not stili:
        return "📂 Nessuno stile salvato.\nInvia un video con caption *STILE: nome - descrizione* per crearne uno."
    lines = [f"📚 *Stili salvati ({len(stili)}):*\n"]
    for s in stili:
        aggiornato = f" · upd {s['aggiornato']}" if s.get("aggiornato") else ""
        lines.append(
            f"▸ *{s['nome']}* ({s['frame']} frame, {s['creato']}{aggiornato})\n"
            f"  _{s['descrizione'][:80]}{'...' if len(s['descrizione'])>80 else ''}_"
        )
    return "\n".join(lines)

def fmt_profilo_stile(profilo: dict) -> str:
    if not profilo:
        return "❌ Stile non trovato."
    p   = profilo
    pal = p.get("palette", {})
    tip = p.get("tipografia", {})
    grafici = ", ".join(p.get("elementi_grafici", [])) or "—"
    aggiornato = f"\n🔄 Aggiornato: {p.get('aggiornato','')[:10]}" if p.get("aggiornato") else ""
    return (
        f"🎨 *Stile: {p.get('nome','?')}*\n"
        f"📅 Creato: {p.get('creato','')[:10]}{aggiornato}\n"
        f"🖼️ Frame analizzati: {p.get('frame_analizzati',0)}\n\n"
        f"📝 *Descrizione*: {p.get('descrizione_utente','')}\n"
        f"💫 *Mood*: {p.get('mood','')}\n\n"
        f"🎨 *Palette*\n"
        f"  Primario: `{pal.get('primario','?')}` · Secondario: `{pal.get('secondario','?')}`\n"
        f"  Accento: `{pal.get('accento','?')}` · BG: `{pal.get('background','?')}` · Testo: `{pal.get('testo','?')}`\n\n"
        f"✏️ *Tipografia*: {tip.get('stile','?')} · {tip.get('peso','?')} · {tip.get('posizione','?')}\n\n"
        f"✨ *Elementi grafici*: {grafici}\n\n"
        f"📐 *Layout*: {p.get('layout','?')}\n"
        f"🎬 *Animazioni*: {p.get('animazioni','?')}\n"
        f"📊 *Densità*: {p.get('densita_visiva','?')}\n\n"
        f"⭐ *Elemento unico*: {p.get('elementi_unici','?')}\n\n"
        f"🔧 *Note tecniche*: {p.get('note_tecniche','?')}"
    )
