"""
carousel_generator.py — Genera le immagini PNG di un carosello Instagram.

Utilizzo:
    python carousel_generator.py <slides_json_path> <output_dir> [card_id]

Input:  JSON file con struttura {"slides": [...], "dimensioni": "1080x1350", ...}
Output: PNG files nella output_dir, nominati slide_01_cover.png, slide_02_contenuto.png, ecc.

Pipeline per ogni slide:
  1. Chiama Ideogram API con prompt_visual (sfondo puro, no testo)
  2. Sovrappone testo con Pillow secondo layout e Style DNA
  3. Fallback: sfondo solido dal brand se Ideogram non disponibile

Exit code: 0 OK, 1 errore parziale, 2 errore fatale
"""

import json
import os
import sys
import urllib.request
import urllib.error
import textwrap
from pathlib import Path

# ══════════════════════════════════════════════════════
#  CONFIGURAZIONE
# ══════════════════════════════════════════════════════

BASE_PATH    = r"C:\Users\super\Desktop\MARKETING MANAGER"
SECRETS_PATH = r"C:\Users\super\Desktop\ai-command-center\data\secrets.json"
STYLE_PATH   = os.path.join(BASE_PATH, "styles", "videocraft", "style_profile.json")

# Dimensioni carosello Instagram portrait
W, H = 1080, 1350

# ── Style DNA defaults (sovrascrivibili da style_profile.json) ────────────────
STYLE = {
    "bg":        "#050A0E",
    "primary":   "#00FF00",   # neon verde
    "secondary": "#00AAFF",   # ciano
    "accent":    "#FFB800",   # ambra
    "text":      "#FFFFFF",
    "muted":     "#888888",
}

# Prova a caricare stile dal file
try:
    with open(STYLE_PATH, encoding="utf-8") as _f:
        _sp = json.load(_f)
    _pal = _sp.get("palette", {})
    STYLE["bg"]        = _pal.get("background", STYLE["bg"])
    STYLE["primary"]   = _pal.get("primario",   STYLE["primary"])
    STYLE["secondary"] = _pal.get("secondario", STYLE["secondary"])
    STYLE["accent"]    = _pal.get("accento",     STYLE["accent"])
    STYLE["text"]      = _pal.get("testo",       STYLE["text"])
except Exception:
    pass


def _hex(color: str):
    """Converte stringa hex in tupla RGB."""
    c = color.lstrip("#")
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))


def _load_secret(key_path: list[str], env_var: str) -> str:
    """Legge una chiave da secrets.json (key_path) o da env_var."""
    val = os.environ.get(env_var, "")
    if val:
        return val
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        node = s
        for k in key_path:
            node = node.get(k, {})
        return node if isinstance(node, str) else ""
    except Exception:
        return ""

def _load_fal_key() -> str:
    return _load_secret(["fal", "apiKey"], "FAL_KEY")

def _load_ideogram_key() -> str:
    return _load_secret(["ideogram", "apiKey"], "IDEOGRAM_API_KEY")


def _flux_generate(prompt: str, output_path: str) -> bool:
    """
    Genera sfondo con Flux Schnell via fal.ai.
    Endpoint: https://fal.run/fal-ai/flux/schnell
    Ritorna True se successo, False se fallback necessario.
    """
    api_key = _load_fal_key()
    if not api_key:
        return False

    full_prompt = (
        f"{prompt.rstrip('.')}. "
        "Dark background, extremely dark scene, NO TEXT, NO WORDS, NO LETTERS, "
        "minimal tech aesthetic, neon green accents, high contrast, professional, "
        "center area clean and dark for text overlay, graphic design style."
    )

    payload = json.dumps({
        "prompt":        full_prompt,
        "image_size":    {"width": 1080, "height": 1350},
        "num_images":    1,
        "output_format": "jpeg",
        "num_inference_steps": 4,   # Schnell: 4 steps sono sufficienti
    }).encode()

    try:
        req = urllib.request.Request(
            "https://fal.run/fal-ai/flux/schnell",
            data=payload,
            headers={
                "Authorization":  f"Key {api_key}",
                "Content-Type":   "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            result = json.loads(r.read())

        img_url = result["images"][0]["url"]
        urllib.request.urlretrieve(img_url, output_path)
        print(f"  [Flux] ✓ Sfondo generato → {os.path.basename(output_path)}", flush=True)
        return True

    except Exception as e:
        print(f"  [Flux] ✗ Errore: {e} — provo Ideogram...", flush=True)
        return False


def _ideogram_generate(prompt: str, output_path: str) -> bool:
    """
    Genera sfondo con Ideogram API.
    Ritorna True se successo, False se fallback necessario.
    """
    api_key = _load_ideogram_key()
    if not api_key:
        print(f"  [Ideogram] Nessuna API key — uso fallback sfondo solido", flush=True)
        return False

    full_prompt = (
        f"{prompt.rstrip('.')}. "
        "Dark background, extremely dark scene, NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS, "
        "minimal tech aesthetic, neon green accents, high contrast, professional, "
        "center area clean and dark for text overlay."
    )

    payload = json.dumps({
        "image_request": {
            "prompt": full_prompt,
            "aspect_ratio": "ASPECT_4_5",   # più vicino a 1080x1350
            "model": "V_2_TURBO",
            "magic_prompt_option": "OFF",    # OFF = rispetta il prompt esatto
        }
    }).encode()

    try:
        req = urllib.request.Request(
            "https://api.ideogram.ai/generate",
            data=payload,
            headers={"Api-Key": api_key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            result = json.loads(r.read())

        img_url = result["data"][0]["url"]
        urllib.request.urlretrieve(img_url, output_path)
        print(f"  [Ideogram] ✓ Sfondo generato → {os.path.basename(output_path)}", flush=True)
        return True

    except Exception as e:
        print(f"  [Ideogram] ✗ Errore: {e} — uso fallback", flush=True)
        return False


def _genera_sfondo_fallback(output_path: str, slide_tipo: str):
    """Genera sfondo solido con gradiente brand — usato quando Ideogram non è disponibile."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("  [Fallback] ✗ Pillow non disponibile", flush=True)
        return

    img  = Image.new("RGB", (W, H), _hex(STYLE["bg"]))
    draw = ImageDraw.Draw(img)

    # Gradiente verticale: bg → leggermente più chiaro in basso
    bg_r, bg_g, bg_b = _hex(STYLE["bg"])
    for y in range(H):
        ratio = y / H
        r = int(bg_r + (bg_r + 15) * ratio * 0.3)
        g = int(bg_g + (bg_g + 8)  * ratio * 0.3)
        b = int(bg_b + (bg_b + 20) * ratio * 0.3)
        draw.line([(0, y), (W, y)], fill=(min(r, 255), min(g, 255), min(b, 255)))

    # Bordo neon in base al tipo
    accent = _hex(STYLE["primary"] if slide_tipo != "cta" else STYLE["accent"])
    border = 6
    draw.rectangle([border, border, W - border, H - border], outline=accent + (200,), width=border)

    # Linea decorativa in basso
    line_y = H - 80
    draw.line([(80, line_y), (W - 80, line_y)], fill=accent + (120,), width=2)

    img.save(output_path, quality=95)
    print(f"  [Fallback] ✓ Sfondo solido → {os.path.basename(output_path)}", flush=True)


def _trova_font(size: int, bold: bool = False) -> "ImageFont.FreeTypeFont | ImageFont.ImageFont":
    """Carica il font migliore disponibile."""
    try:
        from PIL import ImageFont
    except ImportError:
        return None

    # Percorsi font da provare nell'ordine
    user_fonts = r"C:\Users\super\AppData\Local\Microsoft\Windows\Fonts"
    sys_fonts  = r"C:\Windows\Fonts"
    candidates = []

    if bold:
        candidates += [
            os.path.join(user_fonts, "Orbitron-Bold.ttf"),
            os.path.join(user_fonts, "Orbitron-ExtraBold.ttf"),
            os.path.join(sys_fonts,  "arialbd.ttf"),
            os.path.join(sys_fonts,  "calibrib.ttf"),
            os.path.join(sys_fonts,  "trebucbd.ttf"),
        ]
    else:
        candidates += [
            os.path.join(user_fonts, "Orbitron-Regular.ttf"),
            os.path.join(sys_fonts,  "arial.ttf"),
            os.path.join(sys_fonts,  "calibri.ttf"),
            os.path.join(sys_fonts,  "trebuc.ttf"),
        ]

    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue

    try:
        return ImageFont.load_default()
    except Exception:
        return None


def _wrap_text(text: str, max_chars: int) -> list[str]:
    """Suddivide il testo in righe di max_chars caratteri."""
    return textwrap.wrap(text, width=max_chars) or [text]


def _draw_text_shadow(draw, pos, text, font, fill, shadow_offset=4, shadow_alpha=160):
    """Disegna testo con ombra portata per leggibilità."""
    x, y = pos
    shadow_color = (0, 0, 0, shadow_alpha)
    # Ombra in più direzioni per effetto glow scuro
    for dx, dy in [(shadow_offset, shadow_offset), (-shadow_offset, shadow_offset),
                   (shadow_offset, -shadow_offset), (-shadow_offset, -shadow_offset)]:
        draw.text((x + dx, y + dy), text, font=font, fill=shadow_color)
    draw.text((x, y), text, font=font, fill=fill)


def _sovrapponi_testo(bg_path: str, slide: dict, output_path: str):
    """
    Sovrappone il contenuto testuale della slide sullo sfondo.
    Layout supportati: centrato, titolo_sopra_testo, titolo_grande, lista, citazione
    """
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print(f"  [Pillow] ✗ Pillow non disponibile — copio sfondo senza testo", flush=True)
        import shutil
        shutil.copy2(bg_path, output_path)
        return

    img  = Image.open(bg_path).convert("RGBA")
    img  = img.resize((W, H), Image.LANCZOS)
    draw = ImageDraw.Draw(img)

    tipo    = slide.get("tipo", "contenuto")
    titolo  = slide.get("titolo", "")
    testo   = slide.get("testo", "")
    sottot  = slide.get("sottotitolo", "")
    layout  = slide.get("layout", "centrato")
    numero  = slide.get("numero", 1)

    # ── Colori per tipo ──────────────────────────────────────────────────────
    if tipo == "cover":
        titolo_color = _hex(STYLE["primary"]) + (255,)
        testo_color  = _hex(STYLE["text"]) + (200,)
        accent_color = _hex(STYLE["secondary"]) + (255,)
    elif tipo == "cta":
        titolo_color = _hex(STYLE["accent"]) + (255,)
        testo_color  = _hex(STYLE["text"]) + (210,)
        accent_color = _hex(STYLE["accent"]) + (255,)
    else:
        titolo_color = _hex(STYLE["text"]) + (255,)
        testo_color  = _hex(STYLE["muted"]) + (230,)
        accent_color = _hex(STYLE["primary"]) + (255,)

    # ── Font sizes ───────────────────────────────────────────────────────────
    padding     = 80
    usable_w    = W - padding * 2

    if tipo == "cover":
        f_titolo = _trova_font(72, bold=True)
        f_sub    = _trova_font(32, bold=False)
        f_numero = None
    elif tipo == "cta":
        f_titolo = _trova_font(68, bold=True)
        f_sub    = _trova_font(30, bold=False)
        f_numero = None
    else:
        f_titolo = _trova_font(56, bold=True)
        f_sub    = _trova_font(30, bold=False)
        f_numero = _trova_font(22, bold=False)

    # ── Layout ───────────────────────────────────────────────────────────────

    if layout == "centrato" or tipo in ("cover", "cta"):
        # Cover e CTA: tutto centrato verticalmente
        y_center = H // 2

        if sottot:
            # Rubrica/categoria in alto
            draw.text(
                ((W - _text_width(draw, sottot, f_sub)) // 2, y_center - 180),
                sottot, font=f_sub, fill=accent_color
            )
            # Linea decorativa sotto rubrica
            lw = min(_text_width(draw, sottot, f_sub) + 40, 300)
            lx = (W - lw) // 2
            draw.line([(lx, y_center - 148), (lx + lw, y_center - 148)],
                      fill=accent_color, width=2)

        # Titolo principale (wrappato)
        righe = _wrap_text(titolo, 20)
        line_h = 80
        total_h = len(righe) * line_h
        y_start = y_center - total_h // 2

        for i, riga in enumerate(righe):
            tw = _text_width(draw, riga, f_titolo)
            _draw_text_shadow(draw, ((W - tw) // 2, y_start + i * line_h),
                              riga, f_titolo, titolo_color)

        # Testo/CTA sotto
        if testo:
            righe_t = _wrap_text(testo, 32)
            y_t = y_start + total_h + 40
            for riga in righe_t:
                tw = _text_width(draw, riga, f_sub)
                draw.text(((W - tw) // 2, y_t), riga, font=f_sub, fill=testo_color)
                y_t += 40

    elif layout in ("titolo_sopra_testo", "titolo_grande"):
        # Numero slide in alto a sinistra (piccolo)
        y_curr = 100
        if f_numero and tipo == "contenuto":
            num_str = f"0{numero - 1}" if numero - 1 < 10 else str(numero - 1)
            draw.text((padding, y_curr), num_str, font=f_numero,
                      fill=_hex(STYLE["primary"]) + (100,))
            y_curr += 50

        # Linea accent verticale sinistra
        draw.rectangle([padding - 12, y_curr, padding - 6, y_curr + 200],
                       fill=accent_color)

        # Titolo
        righe_titolo = _wrap_text(titolo, 24)
        for riga in righe_titolo:
            _draw_text_shadow(draw, (padding, y_curr), riga, f_titolo, titolo_color)
            y_curr += 70

        y_curr += 30

        # Testo body
        if testo:
            righe_testo = _wrap_text(testo, 38)
            for riga in righe_testo:
                draw.text((padding, y_curr), riga, font=f_sub, fill=testo_color)
                y_curr += 44

    elif layout == "lista":
        y_curr = 180
        righe_titolo = _wrap_text(titolo, 28)
        for riga in righe_titolo:
            _draw_text_shadow(draw, (padding, y_curr), riga, f_titolo, titolo_color)
            y_curr += 70
        y_curr += 40

        if testo:
            punti = testo.split("|")  # separatore per elementi lista
            for punto in punti:
                p = punto.strip()
                if not p:
                    continue
                # Bullet neon
                draw.ellipse([(padding, y_curr + 12), (padding + 14, y_curr + 26)],
                             fill=accent_color)
                draw.text((padding + 28, y_curr), p, font=f_sub, fill=testo_color)
                y_curr += 50

    # ── Numero slide in basso (indicatore paginazione) ───────────────────────
    if numero and tipo != "cover":
        pag_text = f"{'●' * numero}{'○' * max(0, 8 - numero)}"
        try:
            tw = _text_width(draw, pag_text, f_numero or f_sub)
            draw.text(((W - tw) // 2, H - 60), pag_text,
                      font=f_numero or f_sub,
                      fill=_hex(STYLE["primary"]) + (80,))
        except Exception:
            pass

    # ── Salva ────────────────────────────────────────────────────────────────
    img.convert("RGB").save(output_path, quality=95)
    print(f"  [Pillow] ✓ Testo applicato → {os.path.basename(output_path)}", flush=True)


def _text_width(draw, text: str, font) -> int:
    """Calcola larghezza testo compatibile con diverse versioni Pillow."""
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0]
    except Exception:
        try:
            w, _ = draw.textsize(text, font=font)
            return w
        except Exception:
            return len(text) * 20


# ══════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════

def genera_carosello(slides_data: dict, output_dir: str) -> list[str]:
    """
    Genera tutte le slide del carosello.
    Ritorna lista di path PNG generati.
    """
    os.makedirs(output_dir, exist_ok=True)
    slides    = slides_data.get("slides", [])
    generated = []
    errors    = 0

    print(f"\n[CarouselGen] Generazione {len(slides)} slide → {output_dir}", flush=True)

    for slide in slides:
        num    = slide.get("numero", 1)
        tipo   = slide.get("tipo", "contenuto")
        prompt = slide.get("prompt_visual", "dark minimal tech background")

        # Nomi file
        bg_path  = os.path.join(output_dir, f"_bg_{num:02d}.png")
        out_path = os.path.join(output_dir, f"slide_{num:02d}_{tipo}.png")

        print(f"\n  Slide {num}/{len(slides)}: {tipo}", flush=True)

        # Step 1: genera sfondo — Flux → Ideogram → sfondo solido
        if not _flux_generate(prompt, bg_path):
            if not _ideogram_generate(prompt, bg_path):
                _genera_sfondo_fallback(bg_path, tipo)

        # Step 2: overlay testo
        try:
            _sovrapponi_testo(bg_path, slide, out_path)
        except Exception as e:
            print(f"  [Pillow] ✗ Errore overlay: {e}", flush=True)
            import shutil
            shutil.copy2(bg_path, out_path)
            errors += 1

        # Rimuovi sfondo temporaneo
        try:
            os.unlink(bg_path)
        except Exception:
            pass

        if os.path.exists(out_path):
            size_kb = os.path.getsize(out_path) // 1024
            print(f"  ✓ {os.path.basename(out_path)} ({size_kb} KB)", flush=True)
            generated.append(out_path)
        else:
            print(f"  ✗ Slide {num} non generata", flush=True)
            errors += 1

    print(f"\n[CarouselGen] Completato: {len(generated)}/{len(slides)} slide OK, {errors} errori", flush=True)
    return generated


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python carousel_generator.py <slides_json_path> <output_dir>", file=sys.stderr)
        sys.exit(2)

    json_path  = sys.argv[1]
    output_dir = sys.argv[2]

    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[CarouselGen] ✗ Errore lettura JSON: {e}", file=sys.stderr)
        sys.exit(2)

    generated = genera_carosello(data, output_dir)

    # Output: lista path separati da newline → letta dal bot
    for p in generated:
        print(f"OUTPUT:{p}", flush=True)

    sys.exit(0 if generated else 1)
