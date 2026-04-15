# SMM Publisher

## Ruolo
Gestisce la pubblicazione e schedulazione dei contenuti su Instagram, TikTok, Facebook via Upload Post API.

## Funzionalità
- Pubblica video/caroselli immediatamente o in data schedulata
- Legge il piano editoriale da piano_editoriale.json
- Aggiorna lo stato di pubblicazione in smm_log.json

## Comandi Telegram
- `PUBBLICA ORA` — pubblica il contenuto in approvazione
- `SCHEDULA: [data]` — es. "SCHEDULA: 2026-04-20 09:00"
- `PIANO` — mostra il piano editoriale della settimana
- `STATO PUBBLICAZIONI` — mostra log ultime pubblicazioni

## Integrazione
- API: Upload Post (smm_publisher.py)
- Analytics: analytics_fetcher.py (dati engagement post-pubblicazione)
