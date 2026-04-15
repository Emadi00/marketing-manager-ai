import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { THEME } from './theme';
import { Scene01_Recognition } from './scenes/Scene01_Recognition';
import { Scene02_Relief } from './scenes/Scene02_Relief';
import { Scene03_Desire } from './scenes/Scene03_Desire';
import { Scene04_Curiosity } from './scenes/Scene04_Curiosity';
import { Scene05_Urgency } from './scenes/Scene05_Urgency';

// ─── Frame budget — 25.0s @ 30fps = 750 frame ────────────────────────────────
// Scene01_Recognition  00:00–00:03    90f   risk=low
// Scene02_Relief       00:03–00:08   150f   risk=mid
// Scene03_Desire       00:08–00:14   180f   risk=high  ← zoom 1.0→1.08x
// Scene04_Curiosity    00:14–00:20   180f   risk=high  ← re-engagement
// Scene05_Urgency      00:20–00:25   150f   risk=mid   ← CTA + screen shake
// Totale                             750f ✓

const SCENE_DURATIONS = {
  scene01:  90,
  scene02: 150,
  scene03: 180,
  scene04: 180,
  scene05: 150,
} as const;

// Frame assoluti tagli di scena (per SceneFlash)
const CUT_02 =  90;               // scene01 → scene02
const CUT_03 =  90 + 150;         // 240 — scene02 → scene03
const CUT_04 =  90 + 150 + 180;   // 420 — scene03 → scene04
const CUT_05 =  90 + 150 + 180 + 180; // 600 — scene04 → scene05

// Frame assoluti degli screen-shake CTA (00:20 / 00:22 / 00:24)
// Sync parole chiave: 'video' (600), 'spiego' (660), 'studio' (720)
const SHAKE_FRAMES = [600, 660, 720] as const;

// ─── GlobalZoomWrapper ───────────────────────────────────────────────────────
// Zoom 1.0x → 1.08x durante la Desire phase (frame 240–420).
// Direttiva Strategist: ease-in-out per mantenere attenzione senza bruschi scatti.
// Fuori dall'intervallo il valore è clampato (1.0x prima, 1.08x dopo),
// poi torna a 1.0x dopo il taglio a 420 per non alterare le scene successive.
const GlobalZoomWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();

  // Zoom in: 240→420 (desire phase)
  const zoomIn = interpolate(frame, [240, 420], [1.0, 1.08], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Zoom reset: 420→450 — rientro morbido dopo la desire phase
  const zoomOut = interpolate(frame, [420, 450], [1.08, 1.0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Tra 240-420 usa zoomIn, tra 420-450 usa zoomOut, altrove 1.0
  let scale = 1.0;
  if (frame >= 240 && frame < 420) scale = zoomIn;
  else if (frame >= 420 && frame <= 450) scale = zoomOut;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </div>
  );
};

// ─── ScreenShakeWrapper ──────────────────────────────────────────────────────
// Vibrazione laterale 1.2px × 3 occorrenze (00:20 / 00:22 / 00:24).
// Sync su parole chiave CTA per urgency spike percettivo.
// Avvolge tutto il contenuto animato — transform wrapper, non overlay.
const ScreenShakeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();

  let shakeX = 0;
  for (const peak of SHAKE_FRAMES) {
    const local = frame - peak;
    if (local >= 0 && local <= 7) {
      // 4 campioni strettamente crescenti — inputRange mai uguale
      shakeX += interpolate(local, [0, 2, 4, 7], [0, 1.2, -1.2, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `translateX(${shakeX}px)`,
      }}
    >
      {children}
    </div>
  );
};

// ─── AmbientBackground ───────────────────────────────────────────────────────
// Sfondo radiale neon — profondità narrativa passiva senza distrarre.
const AmbientBackground: React.FC = () => {
  const frame = useCurrentFrame();

  const openGlow = interpolate(frame, [0, 60], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <>
      <AbsoluteFill style={{ backgroundColor: THEME.colors.body }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 68% 55% at 50% 52%, rgba(57,255,20,${0.07 * openGlow}) 0%, transparent 100%)`,
          pointerEvents: 'none',
        }}
      />
    </>
  );
};

// ─── SceneFlash ──────────────────────────────────────────────────────────────
// Micro-lampo neon (8 frame = ~267ms) ai tagli di scena — whoosh visivo.
// Decade rapidamente: massima intensità a f+1, zero a f+8.
const SceneFlash: React.FC<{ atFrame: number }> = ({ atFrame }) => {
  const frame = useCurrentFrame();
  const local = frame - atFrame;

  if (local < 0 || local > 8) return null;

  const opacity = interpolate(local, [0, 2, 8], [0.5, 0.5, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: THEME.colors.accent,
        opacity,
        zIndex: 997,
        pointerEvents: 'none',
      }}
    />
  );
};

// ─── CtaGlowOverlay ──────────────────────────────────────────────────────────
// Alone rosso radiale durante urgency phase (frame 600-749).
// Pulse glow 12px ogni 18 frame — direttiva Strategist.
const CtaGlowOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  if (frame < CUT_05) return null;

  const pulseOpacity = interpolate(frame % 18, [0, 9, 17], [0.14, 0.32, 0.14], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 60% 45% at 50% 50%, rgba(239,68,68,${pulseOpacity}) 0%, transparent 70%)`,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  );
};

// ─── BrandWatermark ──────────────────────────────────────────────────────────
// Logo Videograph Studio top-left — brand recall passivo sull'intera durata.
const BrandWatermark: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 25], [0, 0.65], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 50,
        left: 50,
        opacity,
        zIndex: 998,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 8px ${THEME.colors.accent}`,
        }}
      />
      <span
        style={{
          fontFamily: THEME.fonts.main,
          fontSize: 16,
          fontWeight: 900,
          color: THEME.colors.accent,
          letterSpacing: 3,
          textTransform: 'uppercase' as const,
        }}
      >
        VIDEOGRAPH
      </span>
    </div>
  );
};

// ─── GlobalAnchor — progress bar neon bottom ─────────────────────────────────
// Ancora visiva obbligatoria da CLAUDE.md.
// Crescita lineare 0→100% su 750 frame. Glow pulsante ogni 60f (~2s).
const GlobalAnchor: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const scaleX = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    easing: Easing.linear,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const glowPx = interpolate(frame % 60, [0, 30, 59], [8, 24, 8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: THEME.colors.accent,
        boxShadow: `0 0 ${glowPx}px ${THEME.colors.accent}, 0 0 ${glowPx * 2}px ${THEME.colors.accent}`,
        transformOrigin: 'left center',
        transform: `scaleX(${scaleX})`,
        opacity: fadeIn,
        zIndex: 20,
      }}
    />
  );
};

// ─── MainVideo ────────────────────────────────────────────────────────────────
// Orchestratore principale — 5 scene · 750 frame · 30fps · 9:16 · 1080×1920
//
// Layer stack (z-order crescente):
//    0  AmbientBackground      — radiale neon narrativa
//   10  CtaGlowOverlay         — alone rosso urgency phase (600-749)
//   —   GlobalZoomWrapper      — zoom 1.0→1.08x durante desire (240-420)
//   —     └─ ScreenShakeWrapper — vibrazione CTA ×3 (600 / 660 / 720)
//   —           └─ <Series>   — 5 scene in sequenza
//   20  GlobalAnchor            — barra progress neon bottom
//  997  SceneFlash ×4           — lampi neon ai 4 tagli (whoosh visivo)
//  998  BrandWatermark          — logo Videograph top-left
//
// Audio: voiceover.mp3 fuori da <Series> → sync globale 0→750 frame.
export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.body,
        fontFamily: THEME.fonts.main,
        overflow: 'hidden',
      }}
    >
      {/* ── Audio voiceover — sync globale, fuori da Series ───────────────── */}
      <Audio src={staticFile('voiceover.mp3')} />

      {/* ── Strato 0: sfondo narrativo radiale ───────────────────────────── */}
      <AmbientBackground />

      {/* ── Strato 10: glow rosso urgency phase (frame 600-749) ──────────── */}
      <CtaGlowOverlay />

      {/* ── GlobalZoomWrapper + ScreenShakeWrapper + Series ──────────────── */}
      {/* Ordine: zoom agisce sull'intera area; dentro, lo shake trasla;      */}
      {/* dentro ancora, le scene vengono renderizzate in sequenza.           */}
      <GlobalZoomWrapper>
        <ScreenShakeWrapper>
          <Series>

            {/* 00:00–00:03 · 90f · recognition (risk=low)
                Copy: "Hai già girato un sacco di video ma non trovi mai il tempo per montarli."
                FX: fade-in 200ms, scala 1.0→1.15x su beat vocale finale 'montarli'
                Colore testo: bianco (#FFFFFF) */}
            <Series.Sequence durationInFrames={SCENE_DURATIONS.scene01}>
              <Scene01_Recognition />
            </Series.Sequence>

            {/* 00:03–00:08 · 150f · relief (risk=mid)
                Copy: "Registri, mandi il file a noi, e in meno di 48 ore i tuoi contenuti sono pronti."
                FX: 3 elementi rapidi file→hand→timer con whip pan 60f tra uno e l'altro
                Colore testo: verde chiaro (#4ADE80) */}
            <Series.Sequence durationInFrames={SCENE_DURATIONS.scene02}>
              <Scene02_Relief />
            </Series.Sequence>

            {/* 00:08–00:14 · 180f · desire (risk=high)
                Copy: "Tagli, sottotitoli, musica, effetti — tutto incluso."
                FX: 4 icone scale pop 80f ciascuna, offset 120f; sfondo blur 15%
                Zoom globale attivo (1.0→1.08x tramite GlobalZoomWrapper)
                Colore testo: oro (#FBBF24), size 40px, weight 600 */}
            <Series.Sequence durationInFrames={SCENE_DURATIONS.scene03}>
              <Scene03_Desire />
            </Series.Sequence>

            {/* 00:14–00:20 · 180f · curiosity (risk=high) ← re-engagement obbligatorio
                Copy: "Niente più video dimenticati nel telefono. Pronto a scoprire?"
                FX: phone mockup 3D rotate -15° a 90f, parallax swipe, 'Pronto?' 0.9→1.25x in 8f
                Colore testo: azzurro (#38BDF8) */}
            <Series.Sequence durationInFrames={SCENE_DURATIONS.scene04}>
              <Scene04_Curiosity />
            </Series.Sequence>

            {/* 00:20–00:25 · 150f · urgency / CTA (risk=mid)
                Copy: "Commentate con 'video' e ti spiego tutto in 20 secondi."
                FX: color flash bianco→accent in 4f @600, pulse glow 12px/18f, logo 0.7→1.0x
                Screen shake ×3 tramite ScreenShakeWrapper (600/660/720)
                Colore testo: rosso (#EF4444) */}
            <Series.Sequence durationInFrames={SCENE_DURATIONS.scene05}>
              <Scene05_Urgency />
            </Series.Sequence>

          </Series>
        </ScreenShakeWrapper>
      </GlobalZoomWrapper>

      {/* ── Strato 20: GlobalAnchor — progress bar neon bottom ───────────── */}
      <GlobalAnchor />

      {/* ── SceneFlash ×4 — lampi neon ai 4 tagli di scena ──────────────── */}
      {/* CUT_02=90  CUT_03=240  CUT_04=420  CUT_05=600                      */}
      <SceneFlash atFrame={CUT_02} />
      <SceneFlash atFrame={CUT_03} />
      <SceneFlash atFrame={CUT_04} />
      <SceneFlash atFrame={CUT_05} />

      {/* ── Strato 998: BrandWatermark — logo top-left ───────────────────── */}
      <BrandWatermark />
    </AbsoluteFill>
  );
};
