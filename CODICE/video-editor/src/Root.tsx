import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { MainVideo } from './MainVideo';

// ─── Costanti composizione ────────────────────────────────────────────────
// Formato:  9:16 verticale (TikTok / Reels / Shorts)
// Durata:   25.1s = 750 frame @ 30fps — VINCOLANTE: sync con voiceover.mp3
// Palette:  #000000 hook · #0D1B2A body · #39FF14 accent neon · #FFFFFF testo
// Font:     Orbitron (main) · AlfenaPixel (accent)
// Script:   Videograph Studio — "hai già girato un sacco di video..."
// ─────────────────────────────────────────────────────────────────────────

const DURATION_IN_FRAMES = 750; // 25.0s × 30fps — NON modificare: sync audio
const FPS                = 30;
const WIDTH              = 1080;
const HEIGHT             = 1920;

// ─── THEME — fonte di verità per tutte le scene ──────────────────────────
export const THEME = {
  colors: {
    hook:        '#000000',
    body:        '#0D1B2A',
    cta:         '#000000',
    text:        '#ffffff',
    accent:      '#39FF14',
    muted:       'rgba(255,255,255,0.65)',
    accentSoft:  '#ADFF2F',
    // Colori emozione-specifica (da Strategist — prevalgono su default)
    recognition: '#ffffff',
    relief:      '#4ADE80',
    desire:      '#FBBF24',
    curiosity:   '#38BDF8',
    urgency:     '#EF4444',
  },
  fonts: {
    main:   "'Orbitron', sans-serif",
    accent: "'AlfenaPixel', sans-serif",
  },
  fontSizes: {
    headline:        120 as number, // titoli hero max 3-4 parole
    sub:              80 as number,
    caption:          22 as number, // barra sottotitoli voiceover
    // Sottotitoli: 36px recognition/relief, 40px desire/curiosity/urgency
    subtitleDefault:  36 as number,
    subtitleLarge:    40 as number,
  },
  springs: {
    // ⚠ Nessun bounce casuale: usare SEMPRE questi preset pre-calibrati
    aggressive: { damping: 6,  stiffness: 300 }, // hook — pattern interrupt
    standard:   { damping: 12, stiffness: 150 }, // transizioni medie
    soft:       { damping: 18, stiffness: 120 }, // empatico / trust
    cta:        { damping: 8,  stiffness: 220 }, // urgency / cta pulse
  },
  // ─── Scene timing (frame @ 30fps) — totale = 750 ─────────────────────
  // [00:00-00:03] Scene 01 — recognition →   0–  90  (3.0s)
  // [00:03-00:08] Scene 02 — relief      →  90– 240  (5.0s)
  // [00:08-00:14] Scene 03 — desire      → 240– 420  (6.0s)
  // [00:14-00:20] Scene 04 — curiosity   → 420– 600  (6.0s)
  // [00:20-00:25] Scene 05 — urgency     → 600– 750  (5.0s)
  durations: {
    scene01:  90, // recognition  90
    scene02: 150, // relief      240
    scene03: 180, // desire      420
    scene04: 180, // curiosity   600
    scene05: 150, // urgency     750  ← 90+150+180+180+150 = 750 ✓
  },
  // ─── Keyframe globali audio-sync ─────────────────────────────────────
  // Usati nelle scene per beat-match esatto senza valori hardcoded
  audioSync: {
    whooshFrames:    [90, 240, 420, 600] as readonly number[], // transizioni sezione
    shakeFrames:     [600, 660, 720]     as readonly number[], // 00:20, 00:22, 00:24
    reEngagementAt:  420,                                       // 00:14 — zoom re-engage
    desireZoomStart: 240,                                       // 00:08
    desireZoomEnd:   420,                                       // 00:14
    ctaPulseInterval: 18,                                       // frame ogni glow
  },
  // ─── Ancora visiva neon (progress bar implicita) ──────────────────────
  anchor: {
    height: 6,
    color:  '#39FF14',
    glow:   '0 0 12px #39FF14, 0 0 24px #39FF14',
  },
  // ─── Sottotitoli ──────────────────────────────────────────────────────
  subtitles: {
    shadow:      '2px 2px 0px rgba(0,0,0,0.6)',
    weightHeavy: 600, // da 00:08 (frame 240) in poi
    weightNormal: 400,
  },
  // ─── Screen shake — urgency spike ─────────────────────────────────────
  shake: {
    amplitude: 1.2, // px
    occurrences: 3,
  },
} as const;

// ─── Root component — registra la composizione ────────────────────────────
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={MainVideo}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};

// ─── Punto di ingresso Remotion ───────────────────────────────────────────
registerRoot(RemotionRoot);
