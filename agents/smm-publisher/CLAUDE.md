# SMM Publisher

## Ruolo
Gestisce pubblicazione e schedulazione di video e caroselli su Instagram, TikTok, Facebook via Upload Post API. Legge il piano editoriale e mantiene aggiornato lo storico pubblicazioni.

---

## Tipi di contenuto gestiti

### Video (Reels/TikTok/Shorts)
- File: MP4 in `CODICE/video-editor/out/video.mp4`
- Caption: da `script_json.captions`
- Piattaforme: Instagram Reels, TikTok, Facebook Reels
- Upload: singolo file video

### Carosello (Instagram)
- File: PNG in `OUTPUT/[mese]/[card_id]/` — lista ordinata `slide_01_cover.png`, `slide_02_...` ecc.
- Caption: da `caption_dict` del Carousel Designer
- Piattaforme: Instagram (carosello nativo), Facebook (album)
- Upload: **multiple immagini in ordine** — max 10 per album

---

## Flusso pubblicazione carosello

```python
# smm_publisher.py — pubblica_carosello()
# 1. Raccoglie i path PNG in ordine (slide_01, slide_02, ...)
# 2. Carica ogni immagine su Upload Post
# 3. Crea il post multi-immagine con la caption
# 4. Ritorna post_id e URL per il log
```

---

## Flusso pubblicazione video

```python
# smm_publisher.py — pubblica_video()
# 1. Verifica esistenza video.mp4
# 2. Carica su Upload Post
# 3. Pubblica con caption piattaforma specifica
# 4. Salva in smm_log.json
```

---

## Scheduling dal piano editoriale

Legge `piano_editoriale.json` per trovare la slot corretta:
```json
{
  "slots": [
    {
      "data": "2026-04-20",
      "ora": "09:00",
      "tipo": "video|carosello",
      "rubrica": "Workflow Pro",
      "piattaforme": ["instagram", "tiktok"],
      "stato": "da_produrre|pronto|pubblicato"
    }
  ]
}
```

Quando si schedula un contenuto:
1. Trova lo slot più vicino con `stato: "da_produrre"` compatibile con il tipo
2. Propone la data all'utente via Telegram
3. Dopo approvazione, aggiorna `stato: "schedulato"` e registra `post_id`

---

## Comandi Telegram

| Comando | Azione |
|---|---|
| `PUBBLICA ORA` | Pubblica immediatamente il contenuto in approvazione |
| `SCHEDULA: 2026-04-20 09:00` | Schedula per data/ora specifica |
| `SCHEDULA PROSSIMO SLOT` | Usa il prossimo slot libero del piano editoriale |
| `PIANO` | Mostra piano editoriale della settimana corrente |
| `PIANO MESE` | Mostra piano editoriale del mese |
| `STATO PUBBLICAZIONI` | Ultimi 10 contenuti pubblicati con engagement |

---

## Log e tracking

Dopo ogni pubblicazione aggiorna `smm_log.json`:
```json
{
  "post_id": "...",
  "tipo": "video|carosello",
  "data_pubblicazione": "2026-04-20T09:00:00",
  "piattaforme": ["instagram"],
  "caption_usata": "...",
  "n_slide": 7,
  "stato": "pubblicato|schedulato|fallito"
}
```
