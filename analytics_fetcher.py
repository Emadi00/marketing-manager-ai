"""
analytics_fetcher.py — Meta Graph API: Instagram Business Insights
===================================================================
Fornisce:
  - fetch_account_insights()  → metriche mensili account (reach, impressioni, follower)
  - fetch_top_posts()         → top 3 / bottom 3 post per engagement (ultimi 50 post)
  - fetch_best_posting_times()→ slot orari ottimali basati su online_followers
  - fetch_all()               → esegue tutto e aggiorna la cache
  - get_cached()              → legge la cache locale (max 1 fetch al giorno)
  - fmt_analytics_report()    → formatta report Telegram Markdown

Cache locale: analytics_cache.json — aggiornata max 1x / 24h.
Credenziali: secrets.json > meta > {pageAccessToken, igUserId}
"""

import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

# ── Percorsi ──────────────────────────────────────────────────────────────────
_DIR         = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH   = os.path.join(_DIR, "analytics_cache.json")
SECRETS_PATH = os.path.join(_DIR, "..", "ai-command-center", "data", "secrets.json")
GRAPH_BASE   = "https://graph.facebook.com/v22.0"
CACHE_TTL_H  = 24  # ore prima di ri-fetchare

# ── Credenziali ───────────────────────────────────────────────────────────────

def _load_credentials() -> tuple[str, str]:
    """Ritorna (access_token, ig_user_id) da secrets.json o env."""
    token   = os.environ.get("META_PAGE_TOKEN", "")
    ig_id   = os.environ.get("META_IG_USER_ID", "")
    if token and ig_id:
        return token, ig_id
    try:
        with open(SECRETS_PATH, encoding="utf-8") as f:
            s = json.load(f)
        meta  = s.get("meta", {})
        token = token or meta.get("pageAccessToken", "")
        ig_id = ig_id or meta.get("igUserId", "")
    except Exception:
        pass
    return token, ig_id

# ── HTTP helper ───────────────────────────────────────────────────────────────

def _get(url: str, params: dict) -> dict:
    """GET request verso Graph API. Ritorna dict con 'data' o 'error'."""
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    full_url = f"{url}?{qs}"
    try:
        req = urllib.request.Request(full_url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {"error": f"HTTP {e.code}: {body[:300]}"}
    except Exception as e:
        return {"error": str(e)}

# ── Cache ─────────────────────────────────────────────────────────────────────

def _save_cache(data: dict):
    data["cached_at"] = datetime.now(timezone.utc).isoformat()
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Analytics] Errore salvataggio cache: {e}", flush=True)

def get_cached() -> dict | None:
    """Ritorna la cache se fresca (< CACHE_TTL_H ore), altrimenti None."""
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        cached_at = datetime.fromisoformat(data.get("cached_at", "2000-01-01T00:00:00+00:00"))
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - cached_at).total_seconds() / 3600
        if age_hours < CACHE_TTL_H:
            return data
    except Exception:
        pass
    return None

# ══════════════════════════════════════════════════════════════════════════════
#  FETCH FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def fetch_account_insights() -> dict:
    """
    Metriche mensili dell'account Instagram.
    Aggrega reach, impressioni, profile_views, follower_count degli ultimi 30 giorni.
    """
    token, ig_id = _load_credentials()
    if not token or not ig_id:
        return {"error": "Credenziali Meta non trovate in secrets.json"}

    now   = datetime.now(timezone.utc)
    since = int((now - timedelta(days=30)).timestamp())
    until = int(now.timestamp())

    result = {}
    for metric in ("reach", "impressions", "profile_views"):
        resp = _get(
            f"{GRAPH_BASE}/{ig_id}/insights",
            {"metric": metric, "period": "day",
             "since": since, "until": until,
             "access_token": token}
        )
        if "error" in resp:
            result[metric] = {"error": resp["error"]}
            continue
        values = resp.get("data", [{}])[0].get("values", [])
        total  = sum(v.get("value", 0) for v in values if isinstance(v.get("value"), (int, float)))
        result[metric] = {"total_30d": total, "days": len(values)}

    # follower_count: usa period=day e prende l'ultimo valore
    resp_f = _get(
        f"{GRAPH_BASE}/{ig_id}/insights",
        {"metric": "follower_count", "period": "day",
         "since": since, "until": until,
         "access_token": token}
    )
    if "error" not in resp_f:
        values_f = resp_f.get("data", [{}])[0].get("values", [])
        if values_f:
            result["follower_count"] = {
                "current": values_f[-1].get("value", 0),
                "30d_ago": values_f[0].get("value", 0),
                "growth":  values_f[-1].get("value", 0) - values_f[0].get("value", 0),
            }
    else:
        result["follower_count"] = {"error": resp_f["error"]}

    print(f"[Analytics] Account insights: {list(result.keys())}", flush=True)
    return result


def fetch_top_posts(limit: int = 50) -> dict:
    """
    Recupera gli ultimi `limit` post e calcola engagement score.
    Ritorna top_3 e bottom_3 per engagement, più medie per formato e rubrica.
    """
    token, ig_id = _load_credentials()
    if not token or not ig_id:
        return {"error": "Credenziali Meta non trovate"}

    # Step 1: lista media recenti
    resp = _get(
        f"{GRAPH_BASE}/{ig_id}/media",
        {"fields": "id,timestamp,like_count,comments_count,caption,media_type",
         "limit": limit,
         "access_token": token}
    )
    if "error" in resp:
        return {"error": resp["error"]}

    posts = resp.get("data", [])
    enriched = []

    for post in posts:
        pid     = post.get("id", "")
        likes   = post.get("like_count", 0) or 0
        comments= post.get("comments_count", 0) or 0
        caption = (post.get("caption") or "")[:120]
        mtype   = post.get("media_type", "")  # IMAGE, VIDEO, CAROUSEL_ALBUM
        ts      = post.get("timestamp", "")

        # Step 2: insights per post (reach, saved, shares)
        saved = shares = reach = 0
        ins_resp = _get(
            f"{GRAPH_BASE}/{pid}/insights",
            {"metric": "reach,saved,shares", "access_token": token}
        )
        if "error" not in ins_resp:
            for item in ins_resp.get("data", []):
                name = item.get("name", "")
                val  = item.get("values", [{}])[0].get("value", 0) if item.get("values") else 0
                if not isinstance(val, (int, float)):
                    val = 0
                if name == "reach":   reach  = val
                elif name == "saved": saved  = val
                elif name == "shares":shares = val

        # Engagement score = likes*1 + comments*2 + saved*3 + shares*4
        score = likes * 1 + comments * 2 + saved * 3 + shares * 4

        enriched.append({
            "id":       pid,
            "timestamp":ts,
            "type":     mtype,
            "caption":  caption,
            "likes":    likes,
            "comments": comments,
            "saved":    saved,
            "shares":   shares,
            "reach":    reach,
            "score":    score,
        })

    # Ordina per score
    enriched.sort(key=lambda x: x["score"], reverse=True)

    # Medie per tipo di media (VIDEO vs IMAGE/CAROUSEL)
    by_type: dict[str, list] = {}
    for p in enriched:
        t = p["type"]
        by_type.setdefault(t, []).append(p["score"])
    avg_by_type = {t: round(sum(v) / len(v)) for t, v in by_type.items() if v}

    result = {
        "total_analyzed": len(enriched),
        "top_3":    enriched[:3],
        "bottom_3": enriched[-3:][::-1] if len(enriched) >= 3 else enriched,
        "avg_score_by_type": avg_by_type,
    }
    print(f"[Analytics] Top posts: {len(enriched)} analizzati", flush=True)
    return result


def fetch_best_posting_times() -> dict:
    """
    Usa la metrica 'online_followers' di Instagram per trovare le fasce
    orarie in cui i follower sono più attivi (media sugli ultimi 7 giorni).
    Ritorna: {hour_0..23: avg_count, top_slots: [...]}
    """
    token, ig_id = _load_credentials()
    if not token or not ig_id:
        return {"error": "Credenziali Meta non trovate"}

    resp = _get(
        f"{GRAPH_BASE}/{ig_id}/insights",
        {"metric": "online_followers", "period": "lifetime", "access_token": token}
    )
    if "error" in resp:
        return {"error": resp["error"]}

    # La risposta ha data[0].values[], ognuno con value = {hour: count}
    values = resp.get("data", [{}])[0].get("values", [])
    if not values:
        return {"error": "Nessun dato online_followers disponibile"}

    # Aggrega per ora
    hourly: dict[int, list] = {h: [] for h in range(24)}
    for day_val in values:
        val = day_val.get("value", {})
        if isinstance(val, dict):
            for hour_str, count in val.items():
                try:
                    hourly[int(hour_str)].append(count)
                except (ValueError, KeyError):
                    pass

    avg_by_hour = {}
    for h, counts in hourly.items():
        avg_by_hour[h] = round(sum(counts) / len(counts)) if counts else 0

    # Top 5 slot
    top_slots = sorted(avg_by_hour.items(), key=lambda x: x[1], reverse=True)[:5]
    top_slots_fmt = [{"hour": f"{h:02d}:00", "avg_followers_online": c} for h, c in top_slots]

    result = {
        "hourly_avg": {f"{h:02d}:00": c for h, c in avg_by_hour.items()},
        "top_slots": top_slots_fmt,
    }
    print(f"[Analytics] Best times: top slot = {top_slots_fmt[0] if top_slots_fmt else 'n/a'}", flush=True)
    return result


def fetch_all(force: bool = False) -> dict:
    """
    Esegue tutti e 3 i fetch e aggiorna la cache.
    Se `force=False` e la cache è fresca, ritorna la cache.
    """
    if not force:
        cached = get_cached()
        if cached:
            print("[Analytics] Cache fresca — skip fetch.", flush=True)
            return cached

    print("[Analytics] Avvio fetch completo da Meta Graph API...", flush=True)
    data = {
        "account_insights": fetch_account_insights(),
        "top_posts":        fetch_top_posts(),
        "best_times":       fetch_best_posting_times(),
    }
    _save_cache(data)
    print("[Analytics] Fetch completato e cache aggiornata.", flush=True)
    return data

# ══════════════════════════════════════════════════════════════════════════════
#  BEST HOUR — usato da smm_publisher per raffinare lo scheduling
# ══════════════════════════════════════════════════════════════════════════════

def get_best_hour_near(target_hour: int, tolerance: int = 3) -> int | None:
    """
    Dato un orario target (es. 12 per le 12:00), cerca nell'analytics cache
    l'ora con più follower online entro ±tolerance ore.
    Ritorna l'ora ottimale (int 0-23) o None se cache non disponibile.
    """
    cached = get_cached()
    if not cached:
        return None
    best_times = cached.get("best_times", {})
    if "error" in best_times or not best_times.get("hourly_avg"):
        return None

    hourly = best_times["hourly_avg"]  # {"00:00": 123, "01:00": 45, ...}
    best_hour   = None
    best_count  = -1
    for h in range(24):
        if abs(h - target_hour) <= tolerance:
            count = hourly.get(f"{h:02d}:00", 0)
            if count > best_count:
                best_count = count
                best_hour  = h
    return best_hour

# ══════════════════════════════════════════════════════════════════════════════
#  FORMATTAZIONE REPORT TELEGRAM
# ══════════════════════════════════════════════════════════════════════════════

def fmt_analytics_report(data: dict) -> str:
    """Formatta il report analytics in Markdown per Telegram."""
    lines = ["📊 *Analytics Videocraft Studio — Ultimi 30gg*\n"]

    # ── Account ──────────────────────────────────────────────────────────────
    ai = data.get("account_insights", {})
    if "error" not in ai:
        follower = ai.get("follower_count", {})
        reach    = ai.get("reach", {})
        impr     = ai.get("impressions", {})
        pv       = ai.get("profile_views", {})

        lines.append("*Account*")
        if follower and "error" not in follower:
            growth = follower.get('growth', 0)
            sign   = "+" if growth >= 0 else ""
            lines.append(f"  Follower: `{follower.get('current', 'n/d'):,}` ({sign}{growth:,} vs 30gg fa)")
        if reach and "error" not in reach:
            lines.append(f"  Reach 30gg: `{reach.get('total_30d', 0):,}`")
        if impr and "error" not in impr:
            lines.append(f"  Impressioni 30gg: `{impr.get('total_30d', 0):,}`")
        if pv and "error" not in pv:
            lines.append(f"  Visite profilo 30gg: `{pv.get('total_30d', 0):,}`")
    else:
        lines.append(f"  ⚠️ Account: `{ai.get('error', '')[:80]}`")

    lines.append("")

    # ── Top post ─────────────────────────────────────────────────────────────
    tp = data.get("top_posts", {})
    if "error" not in tp:
        lines.append("*Top 3 post per engagement*")
        for i, p in enumerate(tp.get("top_3", []), 1):
            cap   = p.get("caption", "")[:60].replace("\n", " ")
            score = p.get("score", 0)
            ts    = p.get("timestamp", "")[:10]
            likes = p.get("likes", 0)
            saved = p.get("saved", 0)
            lines.append(
                f"  {i}. `{ts}` ❤️{likes} 🔖{saved} — score `{score}`\n"
                f"     _{cap}{'…' if len(p.get('caption',''))>60 else ''}_"
            )
        lines.append("")
        lines.append("*Bottom 3 post (meno engagement)*")
        for i, p in enumerate(tp.get("bottom_3", []), 1):
            cap   = p.get("caption", "")[:60].replace("\n", " ")
            score = p.get("score", 0)
            ts    = p.get("timestamp", "")[:10]
            lines.append(f"  {i}. `{ts}` score `{score}` — _{cap}_")

        avg_type = tp.get("avg_score_by_type", {})
        if avg_type:
            lines.append("")
            lines.append("*Score medio per formato*")
            for t, avg in avg_type.items():
                lines.append(f"  {t}: `{avg}`")
    else:
        lines.append(f"  ⚠️ Post: `{tp.get('error', '')[:80]}`")

    lines.append("")

    # ── Best times ───────────────────────────────────────────────────────────
    bt = data.get("best_times", {})
    if "error" not in bt:
        top_slots = bt.get("top_slots", [])
        lines.append("*Orari migliori (follower attivi)*")
        for slot in top_slots:
            lines.append(f"  🕐 {slot['hour']} — `{slot['avg_followers_online']:,}` follower online")
    else:
        lines.append(f"  ⚠️ Best times: `{bt.get('error', '')[:80]}`")

    cached_at = data.get("cached_at", "")[:16].replace("T", " ")
    lines.append(f"\n_Dati aggiornati: {cached_at} UTC_")
    return "\n".join(lines)
