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

const DURATION = 450; // 00:15-00:30 @ 30fps

export const Scene03_Trust: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Fade out ultimi 8 frame ──────────────────────────────────────
  const sceneOpacity = interpolate(
    frame,
    [DURATION - 8, DURATION - 1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Slide in riga 1 dal top — spring soft trust ──────────────────
  const slideRow1 = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120 },
    from: -180,
    to: 0,
  });
  const row1Opacity = interpolate(frame, [0, 15], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Slide in riga 2 dal top — spring soft, ritardata ────────────
  const slideRow2 = spring({
    frame: Math.max(0, frame - 22),
    fps,
    config: { damping: 18, stiffness: 120 },
    from: -180,
    to: 0,
  });
  const row2Opacity = interpolate(frame, [22, 38], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Badge "48 ORE" — scala spring con ritardo ────────────────────
  const badgeScale = spring({
    frame: Math.max(0, frame - 12),
    fps,
    config: { damping: 18, stiffness: 120 },
    from: 0,
    to: 1,
  });
  const badgeOpacity = interpolate(frame, [12, 28], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Elemento grafico 1: separatore neon espande da centro ────────
  const separatorScale = interpolate(frame, [18, 52], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Elemento grafico 2: cerchio neon pulsante ────────────────────
  const ringOpacity = interpolate(frame, [60, 90], [0, 0.18], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringPulse = interpolate(
    frame % 70,
    [0, 35, 69],
    [0.88, 1.06, 0.88],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Elemento grafico 3: barre check — progresso servizi ─────────
  const barOpacity = interpolate(frame, [55, 80], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bar1 = interpolate(frame, [60, 100], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bar2 = interpolate(frame, [80, 120], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bar3 = interpolate(frame, [100, 140], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Glow pulsante su accent (ogni 90 frame) ──────────────────────
  const accentGlow = interpolate(
    frame % 90,
    [0, 45, 89],
    [0.6, 1.0, 0.6],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Sottotitolo voiceover fade in ────────────────────────────────
  const subtitleOpacity = interpolate(frame, [8, 24], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Ancora visiva progress bar neon ─────────────────────────────
  const anchorScaleX = interpolate(frame, [0, DURATION - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const services: Array<{ label: string; bar: number }> = [
    { label: 'TAGLI',      bar: bar1 },
    { label: 'MUSICA',     bar: bar2 },
    { label: 'EFFETTI',    bar: bar3 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.body,
        opacity: sceneOpacity,
        overflow: 'hidden',
      }}
    >
      {/* ── Cerchio neon pulsante decorativo (sfondo) ─────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '50%',
          width: 560,
          height: 560,
          borderRadius: '50%',
          border: `2px solid ${THEME.colors.accent}`,
          boxShadow: `0 0 56px 10px ${THEME.colors.accent}44`,
          transform: `translateX(-50%) scale(${ringPulse})`,
          opacity: ringOpacity,
        }}
      />

      {/* ── Separatore neon orizzontale superiore ─────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 220,
          left: (1080 - 720) / 2,
          width: 720,
          height: 3,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 16px 4px ${THEME.colors.accent}`,
          borderRadius: 2,
          transformOrigin: 'center center',
          transform: `scaleX(${separatorScale})`,
        }}
      />

      {/* ── Contenuto centrale ────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        {/* Badge "48 ORE" */}
        <div
          style={{
            transform: `scale(${badgeScale})`,
            opacity: badgeOpacity,
            backgroundColor: THEME.colors.accent,
            borderRadius: 18,
            padding: '12px 48px',
            boxShadow: `0 0 28px 6px ${THEME.colors.accent}66`,
          }}
        >
          <span
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 56,
              color: '#000000',
              letterSpacing: 5,
            }}
          >
            48 ORE
          </span>
        </div>

        {/* Riga 1 — TU PENSI */}
        <div
          style={{
            transform: `translateY(${slideRow1}px)`,
            opacity: row1Opacity,
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 108,
              color: THEME.colors.text,
              letterSpacing: 3,
              lineHeight: 1,
            }}
          >
            TU PENSI
          </span>
        </div>

        {/* Riga 2 — NOI FACCIAMO (accent) */}
        <div
          style={{
            transform: `translateY(${slideRow2}px)`,
            opacity: row2Opacity,
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontFamily: THEME.fonts.main,
              fontWeight: 900,
              fontSize: 94,
              color: THEME.colors.accent,
              letterSpacing: 2,
              lineHeight: 1,
              textShadow: `0 0 ${Math.round(accentGlow * 40)}px ${THEME.colors.accent}`,
            }}
          >
            NOI FACCIAMO
          </span>
        </div>

        {/* ── Barre servizi ─────────────────────────────────────── */}
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            width: 560,
            opacity: barOpacity,
          }}
        >
          {services.map(({ label, bar }) => (
            <div
              key={label}
              style={{ display: 'flex', alignItems: 'center', gap: 18 }}
            >
              {/* check dot */}
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor:
                    bar > 0.95 ? THEME.colors.accent : THEME.colors.muted,
                  boxShadow:
                    bar > 0.95
                      ? `0 0 10px ${THEME.colors.accent}`
                      : 'none',
                  flexShrink: 0,
                  transition: 'background-color 0.2s',
                }}
              />
              <span
                style={{
                  fontFamily: THEME.fonts.accent,
                  fontSize: 20,
                  color: THEME.colors.muted,
                  letterSpacing: 3,
                  width: 130,
                  flexShrink: 0,
                }}
              >
                {label}
              </span>
              {/* barra fill */}
              <div
                style={{
                  flex: 1,
                  height: 6,
                  backgroundColor: `${THEME.colors.accent}1A`,
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${bar * 100}%`,
                    height: '100%',
                    backgroundColor: THEME.colors.accent,
                    boxShadow: `0 0 8px ${THEME.colors.accent}`,
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Separatore neon inferiore ─────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 130,
          left: (1080 - 720) / 2,
          width: 720,
          height: 2,
          backgroundColor: THEME.colors.accentSoft,
          boxShadow: `0 0 10px 2px ${THEME.colors.accentSoft}`,
          borderRadius: 2,
          transformOrigin: 'center center',
          transform: `scaleX(${separatorScale})`,
        }}
      />

      {/* ── Barra sottotitoli voiceover 22px ─────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          left: 0,
          right: 0,
          paddingLeft: 44,
          paddingRight: 44,
          opacity: subtitleOpacity,
          textAlign: 'center',
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            fontWeight: 400,
            color: THEME.colors.muted,
            lineHeight: 1.45,
          }}
        >
          In meno di 48 ore i tuoi contenuti sono pronti.
          Tu pensi alle idee, noi pensiamo al resto.
        </span>
      </div>

      {/* ── Ancora visiva: progress bar neon bottom ───────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor?.height ?? 6,
          backgroundColor: THEME.anchor?.color ?? THEME.colors.accent,
          boxShadow: THEME.anchor?.glow ?? `0 0 20px 4px ${THEME.colors.accent}`,
          transformOrigin: 'left center',
          transform: `scaleX(${anchorScaleX})`,
        }}
      />
    </AbsoluteFill>
  );
};
