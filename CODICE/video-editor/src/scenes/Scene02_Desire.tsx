import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { THEME } from '../theme';

// SCENA 2 — Desire | 00:05-00:15 = 300 frame @ 30fps
// Voiceover: "Con Videograph Studio cambia tutto. Tu registri, mandi il file
//             e noi facciamo il resto. Tagli, sottotitoli, musica, effetti speciali."
// Emozione: desire · Ritmo: fast · Spring soft (damping:18, stiffness:120)
// Grafica: keyword phases + cerchio neon + barre workflow + badge 48h

export const Scene02_Desire: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig(); // 300

  // ── Fade-out ultimi 8 frame ──────────────────────────────────────────────
  const masterOpacity = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Ancora visiva — progress bar 300f ───────────────────────────────────
  const anchorScaleX = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Glow pulse (ciclo 30f) ───────────────────────────────────────────────
  const glowPulse = interpolate(frame % 30, [0, 15, 29], [0.55, 1.0, 0.55], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const glowPx = 20 + 28 * glowPulse;

  // ── FASE 1: "CAMBIA TUTTO" — 0..90f ─────────────────────────────────────
  const ph1Spring = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const ph1Scale = interpolate(ph1Spring, [0, 1], [0.55, 1.0]);
  const ph1Opacity = interpolate(frame, [0, 16, 76, 90], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── FASE 2: "TU REGISTRI / NOI FACCIAMO" — 90..180f ────────────────────
  const ph2Spring = spring({ frame: frame - 90, fps, config: { damping: 18, stiffness: 120 } });
  const ph2Scale = interpolate(ph2Spring, [0, 1], [0.6, 1.0]);
  const ph2Opacity = interpolate(frame, [90, 106, 166, 180], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── FASE 3: "IL RESTO" — 180..270f ──────────────────────────────────────
  const ph3Spring = spring({ frame: frame - 180, fps, config: { damping: 18, stiffness: 120 } });
  const ph3Scale = interpolate(ph3Spring, [0, 1], [0.6, 1.05]);
  const ph3Opacity = interpolate(frame, [180, 196, 256, 270], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── FASE 4: "MANDA IL FILE" — 270..292f ─────────────────────────────────
  const ph4Spring = spring({ frame: frame - 270, fps, config: { damping: 18, stiffness: 120 } });
  const ph4Scale = interpolate(ph4Spring, [0, 1], [0.75, 1.0]);
  const ph4Opacity = interpolate(frame, [270, 283, 292, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── GRAFICO 1 — cerchio neon pulsante (desire = magnetismo visivo) ───────
  const ringScale = interpolate(frame % 40, [0, 20, 39], [0.90, 1.10, 0.90], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringOpacity = interpolate(frame, [0, 24, durationInFrames - 10, durationInFrames], [0, 0.30, 0.30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── GRAFICO 2 — tre barre workflow neon (servizi inclusi) ────────────────
  const bar1W = interpolate(frame, [40, 100], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bar2W = interpolate(frame, [70, 130], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bar3W = interpolate(frame, [100, 160], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const barsOpacity = interpolate(frame, [40, 70, durationInFrames - 10, durationInFrames], [0, 0.80, 0.80, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Badge "48h" — slide from bottom, appare in fase 2 ───────────────────
  const badgeSpring = spring({ frame: frame - 110, fps, config: { damping: 18, stiffness: 120 } });
  const badgeY = interpolate(badgeSpring, [0, 1], [90, 0]);
  const badgeOpacity = interpolate(frame, [110, 130, 265, 285], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Drift scale lenta (desire: attenzione che cresce) ───────────────────
  const driftScale = interpolate(frame, [0, durationInFrames - 9], [1.0, 1.04], {
    easing: Easing.out(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const accent: string = THEME.colors.accent;
  const accentSoft: string = THEME.colors.accentSoft;
  const glowStr = `0 0 ${glowPx}px ${accent}, 0 0 ${glowPx * 2}px rgba(57,255,20,0.35)`;

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(160deg, #001a08 0%, #002e12 40%, #0D1B2A 75%, #000e04 100%)',
        opacity: masterOpacity,
        overflow: 'hidden',
      }}
    >

      {/* ── GRAFICO 1 — cerchio neon pulsante ───────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 700,
          height: 700,
          marginTop: -350,
          marginLeft: -350,
          borderRadius: '50%',
          border: `3px solid ${accent}`,
          opacity: ringOpacity,
          transform: `scale(${ringScale})`,
          boxShadow: `0 0 28px ${accent}, 0 0 70px rgba(57,255,20,0.25)`,
        }}
      />
      {/* cerchio interno sottile */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 500,
          height: 500,
          marginTop: -250,
          marginLeft: -250,
          borderRadius: '50%',
          border: `1px solid ${accentSoft}`,
          opacity: ringOpacity * 0.5,
          transform: `scale(${2 - ringScale})`,
        }}
      />

      {/* ── GRAFICO 2 — barre workflow laterali ─────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 680,
          opacity: barsOpacity,
        }}
      >
        {([
          { label: 'TAGLI', width: bar1W, color: accent },
          { label: 'SOTTOTITOLI', width: bar2W, color: accentSoft },
          { label: 'MUSICA + EFFETTI', width: bar3W, color: accent },
        ] as Array<{ label: string; width: number; color: string }>).map((item, i) => (
          <div key={i} style={{ marginBottom: 30 }}>
            <div
              style={{
                fontFamily: THEME.fonts.accent,
                fontSize: 19,
                color: THEME.colors.muted,
                letterSpacing: 3,
                marginBottom: 7,
                textTransform: 'uppercase',
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                width: 380,
                height: 5,
                backgroundColor: 'rgba(57,255,20,0.12)',
                borderRadius: 3,
              }}
            >
              <div
                style={{
                  width: `${item.width * 100}%`,
                  height: '100%',
                  backgroundColor: item.color,
                  borderRadius: 3,
                  boxShadow: `0 0 8px ${item.color}`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ── Badge "48h" ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          right: 70,
          top: 720,
          opacity: badgeOpacity,
          transform: `translateY(${badgeY}px)`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontWeight: 900,
            fontSize: 64,
            color: accent,
            textShadow: glowStr,
            lineHeight: 1,
          }}
        >
          48h
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: 15,
            color: THEME.colors.muted,
            letterSpacing: 3,
            marginTop: 6,
            textTransform: 'uppercase',
          }}
        >
          CONSEGNA
        </div>
      </div>

      {/* ── TESTO PRINCIPALE — contenitore centrato ──────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${driftScale})`,
        }}
      >

        {/* FASE 1 — CAMBIA TUTTO */}
        <div
          style={{
            position: 'absolute',
            textAlign: 'center',
            opacity: ph1Opacity,
            transform: `scale(${ph1Scale})`,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 112,
              color: THEME.colors.text,
              lineHeight: 1.0,
              textTransform: 'uppercase',
              letterSpacing: -3,
            }}
          >
            CAMBIA
          </div>
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 136,
              color: accent,
              lineHeight: 1.0,
              textTransform: 'uppercase',
              letterSpacing: -4,
              textShadow: glowStr,
            }}
          >
            TUTTO
          </div>
        </div>

        {/* FASE 2 — TU REGISTRI / NOI FACCIAMO */}
        <div
          style={{
            position: 'absolute',
            textAlign: 'center',
            opacity: ph2Opacity,
            transform: `scale(${ph2Scale})`,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 82,
              color: THEME.colors.muted,
              lineHeight: 1.1,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            TU REGISTRI
          </div>
          <div
            style={{
              width: 180,
              height: 3,
              backgroundColor: accent,
              margin: '14px auto',
              boxShadow: `0 0 10px ${accent}`,
            }}
          />
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 82,
              color: accent,
              lineHeight: 1.1,
              textTransform: 'uppercase',
              letterSpacing: 2,
              textShadow: glowStr,
            }}
          >
            NOI FACCIAMO
          </div>
        </div>

        {/* FASE 3 — IL RESTO */}
        <div
          style={{
            position: 'absolute',
            textAlign: 'center',
            opacity: ph3Opacity,
            transform: `scale(${ph3Scale})`,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fonts.accent,
              fontSize: 26,
              color: THEME.colors.muted,
              letterSpacing: 8,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            TAGLI · MUSICA · EFFETTI
          </div>
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 118,
              color: accent,
              lineHeight: 1.0,
              textTransform: 'uppercase',
              letterSpacing: -3,
              textShadow: glowStr,
            }}
          >
            IL RESTO
          </div>
        </div>

        {/* FASE 4 — MANDA IL FILE */}
        <div
          style={{
            position: 'absolute',
            textAlign: 'center',
            opacity: ph4Opacity,
            transform: `scale(${ph4Scale})`,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 100,
              color: THEME.colors.text,
              lineHeight: 1.05,
              textTransform: 'uppercase',
              letterSpacing: -2,
            }}
          >
            MANDA
          </div>
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 100,
              color: accent,
              lineHeight: 1.0,
              textTransform: 'uppercase',
              letterSpacing: -2,
              textShadow: `0 0 30px ${accent}, 0 0 60px rgba(57,255,20,0.4)`,
            }}
          >
            IL FILE
          </div>
        </div>

      </div>

      {/* ── SOTTOTITOLO VOICEOVER — barra 40px, font 22px ───────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: (THEME.anchor?.height ?? 6) + 14,
          left: 44,
          right: 44,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.60)',
          borderRadius: 7,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            fontWeight: 400,
            color: THEME.colors.muted,
            textAlign: 'center',
            lineHeight: 1.35,
          }}
        >
          Con Videograph Studio cambia tutto. Tu registri, mandi il file e noi facciamo il resto. Tagli, sottotitoli, musica, effetti speciali.
        </span>
      </div>

      {/* ── ANCORA VISIVA — progress bar neon 300 frame ─────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor?.height ?? 6,
          backgroundColor: THEME.anchor?.color ?? accent,
          boxShadow: THEME.anchor?.glow ?? `0 0 12px ${accent}, 0 0 24px rgba(57,255,20,0.45)`,
          transformOrigin: 'left center',
          transform: `scaleX(${anchorScaleX})`,
        }}
      />

    </AbsoluteFill>
  );
};
