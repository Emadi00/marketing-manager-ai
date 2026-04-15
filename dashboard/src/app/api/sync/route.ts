import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const META_GRAPH  = "https://graph.facebook.com/v21.0";
const DATA_DIR    = "C:\\Users\\super\\Desktop\\ai-command-center\\data";
const SECRETS_PATH = path.join(DATA_DIR, "secrets.json");
const PERF_PATH    = path.join(DATA_DIR, "performance.json");
const TRADING_PATH = path.join(DATA_DIR, "trading.json");

// ── Meta Graph helper ────────────────────────────────────────────────────────

async function metaGet(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AI-CMD/2.0" },
      signal: AbortSignal.timeout(15000),
    });
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    return { error: String(e) };
  }
}

function weeklyBuckets(daily: number[], numWeeks = 7): number[] {
  return Array.from({ length: numWeeks }, (_, w) =>
    daily.slice(w * 7, (w + 1) * 7).reduce((s, v) => s + v, 0)
  );
}

// ── Instagram sync ────────────────────────────────────────────────────────────

async function syncInstagram(
  token: string,
  igId: string,
  sinceTs: number,
  untilTs: number
) {
  const out: Record<string, unknown> = {
    followers: null, reach: null, views: null, reelsPlays: null,
    likes: null, comments: null, saves: null, weeklyData: [], dailyData: [],
  };

  // Followers
  const profile = await metaGet(`${META_GRAPH}/${igId}?fields=followers_count&access_token=${token}`);
  if (!profile.error) out.followers = (profile.followers_count as number) ?? null;

  // Reach
  const extraDays = Math.round((untilTs - sinceTs) / 86400) + 19;
  const since49 = untilTs - extraDays * 86400;

  const ins = await metaGet(
    `${META_GRAPH}/${igId}/insights?metric=reach&period=day&since=${sinceTs}&until=${untilTs}&access_token=${token}`
  );
  let reachTotal = 0;
  if (ins.data) {
    for (const m of ins.data as Array<Record<string, unknown>>) {
      if (m.name === "reach") {
        for (const v of (m.values as Array<Record<string, unknown>>) ?? []) {
          reachTotal += (v.value as number) ?? 0;
        }
      }
    }
  }
  if (reachTotal > 0) out.reach = reachTotal;

  // Weekly + daily chart
  const ins49 = await metaGet(
    `${META_GRAPH}/${igId}/insights?metric=reach&period=day&since=${since49}&until=${untilTs}&access_token=${token}`
  );
  if (ins49.data) {
    const daily: number[] = [];
    const dailyWithDates: Array<{ date: string; value: number }> = [];
    for (const m of ins49.data as Array<Record<string, unknown>>) {
      if (m.name === "reach") {
        for (const v of (m.values as Array<Record<string, unknown>>) ?? []) {
          daily.push((v.value as number) ?? 0);
          dailyWithDates.push({ date: String(v.end_time ?? "").slice(0, 10), value: (v.value as number) ?? 0 });
        }
      }
    }
    if (daily.length > 0) out.weeklyData = weeklyBuckets(daily);
    out.dailyData = dailyWithDates.slice(-30);
  }

  // Media: likes, comments, reel plays, saves
  const mediaResp = await metaGet(
    `${META_GRAPH}/${igId}/media?fields=id,media_type,like_count,comments_count,timestamp&limit=50&access_token=${token}`
  );
  if (mediaResp.data) {
    let likes = 0, comments = 0, reelPlays = 0;
    const reelIds: string[] = [];
    for (const m of mediaResp.data as Array<Record<string, unknown>>) {
      const ts = m.timestamp as string | undefined;
      if (ts) {
        const postTs = Math.floor(new Date(ts).getTime() / 1000);
        if (postTs < sinceTs || postTs > untilTs) continue;
      }
      likes    += (m.like_count as number) ?? 0;
      comments += (m.comments_count as number) ?? 0;
      if (m.media_type === "VIDEO" || m.media_type === "REELS") reelIds.push(m.id as string);
    }
    out.likes    = likes;
    out.comments = comments;

    // Reel plays (max 20)
    for (const rid of reelIds.slice(0, 20)) {
      const ri = await metaGet(`${META_GRAPH}/${rid}/insights?metric=plays&access_token=${token}`);
      if (ri.data) {
        for (const metric of ri.data as Array<Record<string, unknown>>) {
          if (metric.name === "plays") {
            const vals = metric.values as Array<Record<string, unknown>> | undefined;
            reelPlays += vals ? ((vals[0]?.value as number) ?? 0) : ((metric.value as number) ?? 0);
          }
        }
      }
    }
    if (reelPlays > 0) { out.reelsPlays = reelPlays; out.views = reelPlays; }
    else if (out.reach)  { out.views = out.reach; }

    // Saves (max 10)
    let savesTotal = 0;
    const mediaList = mediaResp.data as Array<Record<string, unknown>>;
    for (const m of mediaList.slice(0, 10)) {
      const si = await metaGet(`${META_GRAPH}/${m.id as string}/insights?metric=saved&access_token=${token}`);
      if (si.data) {
        for (const metric of si.data as Array<Record<string, unknown>>) {
          if (metric.name === "saved") {
            const vals = metric.values as Array<Record<string, unknown>> | undefined;
            savesTotal += vals ? ((vals[0]?.value as number) ?? 0) : ((metric.value as number) ?? 0);
          }
        }
      }
    }
    if (savesTotal > 0) out.saves = savesTotal;
  }

  return out;
}

// ── Facebook sync ─────────────────────────────────────────────────────────────

async function syncFacebook(
  token: string,
  pageId: string,
  sinceTs: number,
  untilTs: number
) {
  const out: Record<string, unknown> = {
    followers: null, growth: null, views: null, likes: null,
    comments: null, weeklyData: [], dailyData: [],
  };

  const extraDays = Math.round((untilTs - sinceTs) / 86400) + 19;
  const since49   = untilTs - extraDays * 86400;

  // Fan count
  const page = await metaGet(`${META_GRAPH}/${pageId}?fields=fan_count,followers_count&access_token=${token}`);
  if (!page.error) {
    out.followers = (page.fan_count as number) || (page.followers_count as number) || 0;
  }

  // Video views
  const vidViews = await metaGet(
    `${META_GRAPH}/${pageId}/insights?metric=page_video_views&period=day&since=${sinceTs}&until=${untilTs}&access_token=${token}`
  );
  let videoTotal = 0;
  if (vidViews.data) {
    for (const m of vidViews.data as Array<Record<string, unknown>>) {
      if (m.name === "page_video_views") {
        for (const v of (m.values as Array<Record<string, unknown>>) ?? []) {
          videoTotal += (v.value as number) ?? 0;
        }
      }
    }
  }

  // Impressions fallback
  const imp = await metaGet(
    `${META_GRAPH}/${pageId}/insights?metric=page_impressions&period=day&since=${sinceTs}&until=${untilTs}&access_token=${token}`
  );
  let impTotal = 0;
  if (imp.data) {
    for (const m of imp.data as Array<Record<string, unknown>>) {
      if (m.name === "page_impressions") {
        for (const v of (m.values as Array<Record<string, unknown>>) ?? []) {
          impTotal += (v.value as number) ?? 0;
        }
      }
    }
  }
  out.views = videoTotal > 0 ? videoTotal : impTotal > 0 ? impTotal : 0;

  // Daily chart
  const chartMetric = videoTotal > 0 ? "page_video_views" : "page_impressions";
  const ins49 = await metaGet(
    `${META_GRAPH}/${pageId}/insights?metric=${chartMetric}&period=day&since=${since49}&until=${untilTs}&access_token=${token}`
  );
  if (ins49.data) {
    const daily: number[] = [];
    const dailyWithDates: Array<{ date: string; value: number }> = [];
    for (const m of ins49.data as Array<Record<string, unknown>>) {
      if (m.name === chartMetric) {
        for (const v of (m.values as Array<Record<string, unknown>>) ?? []) {
          daily.push((v.value as number) ?? 0);
          dailyWithDates.push({ date: String(v.end_time ?? "").slice(0, 10), value: (v.value as number) ?? 0 });
        }
      }
    }
    if (daily.length > 0) out.weeklyData = weeklyBuckets(daily);
    out.dailyData = dailyWithDates.slice(-30);
  }

  // Engagements
  const eng = await metaGet(
    `${META_GRAPH}/${pageId}/insights?metric=page_post_engagements&period=day&since=${sinceTs}&until=${untilTs}&access_token=${token}`
  );
  if (eng.data) {
    let total = 0;
    for (const m of eng.data as Array<Record<string, unknown>>) {
      if (m.name === "page_post_engagements") {
        for (const v of (m.values as Array<Record<string, unknown>>) ?? []) {
          total += (v.value as number) ?? 0;
        }
      }
    }
    out.likes = total;
  }

  return out;
}

// ── Alpaca sync ───────────────────────────────────────────────────────────────

async function alpacaGet(apiKey: string, secretKey: string, baseUrl: string, endpoint: string) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${endpoint}`, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": secretKey,
        "User-Agent": "AI-CMD/2.0",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    return { error: String(e) };
  }
}

async function syncAlpaca(apiKey: string, secretKey: string, baseUrl: string, initialValue: number) {
  const account = await alpacaGet(apiKey, secretKey, baseUrl, "/v2/account");
  if (account.error) return { error: account.error };

  const equity    = parseFloat(String(account.equity     ?? initialValue));
  const lastEq    = parseFloat(String(account.last_equity ?? equity));
  const dailyPnL  = parseFloat((equity - lastEq).toFixed(2));
  const dailyPct  = lastEq > 0 ? parseFloat(((dailyPnL / lastEq) * 100).toFixed(2)) : 0;
  const totalRet  = parseFloat((equity - initialValue).toFixed(2));
  const totalPct  = initialValue > 0 ? parseFloat(((totalRet / initialValue) * 100).toFixed(2)) : 0;

  // Positions
  const posRaw = await alpacaGet(apiKey, secretKey, baseUrl, "/v2/positions");
  const positions = Array.isArray(posRaw) ? posRaw : [];
  const allocation: Record<string, { pct: number; value: number; return: number }> = {};
  for (const p of positions as Array<Record<string, unknown>>) {
    const val = parseFloat(String(p.market_value ?? 0));
    const cost = parseFloat(String(p.cost_basis ?? val));
    const ret  = cost > 0 ? parseFloat((((val - cost) / cost) * 100).toFixed(2)) : 0;
    const pct  = equity > 0 ? parseFloat(((val / equity) * 100).toFixed(1)) : 0;
    allocation[String(p.symbol)] = { pct, value: parseFloat(val.toFixed(2)), return: ret };
  }

  return {
    account: {
      broker: "Alpaca Markets",
      initialValue,
      currentValue:      parseFloat(equity.toFixed(2)),
      peakValue:         parseFloat(equity.toFixed(2)),
      monthlyStartValue: initialValue,
      dailyPnL,
      dailyPnLPct:       dailyPct,
      totalReturn:       totalRet,
      totalReturnPct:    totalPct,
      maxDrawdown:       0,
      circuitBreaker:    false,
    },
    positions,
    allocation,
    recentTrades: [],
    weeklyPnL:    [],
  };
}

// ── POST /api/sync ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // Resolve time range
    const now = Math.floor(Date.now() / 1000);
    let sinceTs: number;
    let untilTs: number = now;

    if (body.since && body.until) {
      sinceTs  = Math.floor(new Date(String(body.since)).getTime() / 1000);
      untilTs  = Math.floor(new Date(String(body.until)).getTime() / 1000) + 86399;
    } else {
      const days = typeof body.days === "number" ? body.days : 30;
      sinceTs = now - days * 86400;
    }

    // Read secrets
    if (!fs.existsSync(SECRETS_PATH))
      return NextResponse.json({ ok: false, error: "secrets.json non trovato" }, { status: 500 });

    const secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, "utf-8")) as Record<string, Record<string, string>>;
    const meta    = secrets.meta ?? {};
    const token   = (meta.pageAccessToken ?? "").trim();

    const synced: string[] = [];
    const errors: string[] = [];

    // ── Meta sync ──
    if (token && fs.existsSync(PERF_PATH)) {
      const igId   = (meta.igUserId ?? "").trim();
      const pageId = (meta.pageId   ?? "").trim();
      const perf   = JSON.parse(fs.readFileSync(PERF_PATH, "utf-8")) as Record<string, unknown>;
      const clients = (perf.clients as Array<Record<string, unknown>>) ?? [];

      for (const client of clients) {
        if (client.name !== "VideoCraft Studio") continue;
        const platforms = client.platforms as Record<string, Record<string, unknown>>;

        if (igId && "instagram" in platforms) {
          const igData = await syncInstagram(token, igId, sinceTs, untilTs);
          if (igData.followers !== null) {
            igData._syncError = null; // clear any previous error
            Object.assign(platforms.instagram, igData);
            synced.push("Instagram");
          } else {
            const errMsg = "Nessun dato ricevuto — token scaduto o igUserId errato";
            errors.push(`Instagram: ${errMsg}`);
            if (!platforms.instagram) platforms.instagram = {} as Record<string, unknown>;
            (platforms.instagram as Record<string, unknown>)._syncError = errMsg;
          }
        }

        if (pageId && "facebook" in platforms) {
          const fbData = await syncFacebook(token, pageId, sinceTs, untilTs);
          if (fbData.followers !== null) {
            fbData._syncError = null; // clear any previous error
            Object.assign(platforms.facebook, fbData);
            synced.push("Facebook");
          } else {
            const errMsg = "Nessun dato ricevuto — token scaduto o pageId errato";
            errors.push(`Facebook: ${errMsg}`);
            if (!platforms.facebook) platforms.facebook = {} as Record<string, unknown>;
            (platforms.facebook as Record<string, unknown>)._syncError = errMsg;
          }
        } else if (!pageId && "facebook" in platforms) {
          const errMsg = "pageId non configurato in secrets.json";
          errors.push(`Facebook: ${errMsg}`);
          (platforms.facebook as Record<string, unknown>)._syncError = errMsg;
        }

        if (synced.length > 0 || errors.some(e => e.startsWith("Facebook") || e.startsWith("Instagram"))) {
          client.lastSync = new Date().toISOString();
        }
      }

      // Write perf even on errors so _syncError fields are persisted
      (perf as Record<string, unknown>).lastUpdate = new Date().toISOString();
      fs.writeFileSync(PERF_PATH, JSON.stringify(perf, null, 2), "utf-8");
    }

    // ── Alpaca sync (solo senza range specifico) ──
    if (!body.since && fs.existsSync(TRADING_PATH)) {
      const alp       = secrets.alpaca ?? {};
      const apiKey    = (alp.apiKey    ?? "").trim();
      const secretKey = (alp.secretKey ?? "").trim();
      if (apiKey && secretKey) {
        const baseUrl      = alp.baseUrl      ?? "https://paper-api.alpaca.markets";
        const initialValue = parseFloat(String(alp.initialValue ?? 200));
        const result = await syncAlpaca(apiKey, secretKey, baseUrl, initialValue);
        if (!("error" in result)) {
          const trading = JSON.parse(fs.readFileSync(TRADING_PATH, "utf-8")) as Record<string, unknown>;
          trading.account      = result.account;
          trading.positions    = result.positions;
          trading.allocation   = result.allocation;
          trading.recentTrades = result.recentTrades;
          trading.weeklyPnL    = result.weeklyPnL;
          trading.lastUpdate   = new Date().toISOString();
          fs.writeFileSync(TRADING_PATH, JSON.stringify(trading, null, 2), "utf-8");
          synced.push("Alpaca");
        } else {
          errors.push(`Alpaca: ${String(result.error)}`);
        }
      }
    }

    return NextResponse.json({ ok: synced.length > 0, synced, errors });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
