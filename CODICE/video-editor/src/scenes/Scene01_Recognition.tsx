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

export const Scene01_Recognition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Fade out ultimi 8 frame ──────────────────────────────────────────────
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Fade in ~200ms = 6 frame ─────────────────────────────────────────────
  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const sceneOpacity = fadeIn * fadeOut;

  // ── Spring aggressiva — entrata esplosiva scala 0→1.05→1 ─────────────────
  const mainSpring = spring({
    frame,
    fps,
    config: { damping: 6, stiffness: 300 },
    from: 0,
    to: 1,
  });

  // ── Beat vocale su 'montarli' — frame 70→77→83→89 (strettamente crescente)
  const beatScale = interpolate(
    frame,
    [70, 77, 83, 89],
    [1.0, 1.15, 1.07, 1.0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  const mainScale = mainSpring * beatScale;

  // ── Pattern interrupt: glitch X shift primi 10 frame ────────────────────
  const glitchX = frame < 10 && frame % 3 === 1 ? (frame % 2 === 0 ? 6 : -6) : 0;
  const glitchY = frame < 10 && frame % 4 === 2 ? -4 : 0;

  // ── "TEMPO" — entrata ritardata 8 frame, spring aggressiva ───────────────
  const tempoSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 6, stiffness: 300 },
    from: 0,
    to: 1,
  });

  const tempoScale = tempoSpring * beatScale;
  const tempoOpacity = interpolate(tempoSpring, [0, 0.4], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // ── Testo secondario staggered — spring standard ─────────────────────────
  const secondaryTranslateY = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 12, stiffness: 150 },
    from: 60,
    to: 0,
  });

  const secondaryOpacity = interpolate(frame, [17, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Grafico 1: anello neon doppio — esplosione da scala 0 ────────────────
  const ringSpring = spring({
    frame: Math.max(0, frame - 3),
    fps,
    config: { damping: 8, stiffness: 200 },
    from: 0,
    to: 1,
  });

  const ringOpacity = interpolate(frame, [3, 16], [0, 0.72], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Pulsazione anello ogni 30 frame
  const ringPulse = interpolate(
    frame % 30,
    [0, 15, 29],
    [1.0, 1.06, 1.0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Grafico 2: linea neon orizzontale sweep da sinistra ──────────────────
  const lineProgress = interpolate(frame, [2, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ── Grafico 3: linea verticale neon — crescita verso il basso ───────────
  const vertLineHeight = interpolate(frame, [6, 28], [0, 160], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.exp),
  });

  // ── Counter video animato ────────────────────────────────────────────────
  const counterSpring = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 12, stiffness: 150 },
    from: 0,
    to: 1,
  });

  const counterValue = Math.round(counterSpring * 47);
  const counterOpacity = interpolate(frame, [19, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const counterScale = interpolate(counterSpring, [0, 1], [0.5, 1.0], {
    extrapolateRight: 'clamp',
  });

  // ── Scan line traversata unica ───────────────────────────────────────────
  const scanY = interpolate(frame, [0, durationInFrames], [-10, 1940], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Glow overlay pulsante sottile ────────────────────────────────────────
  const glowPulse = interpolate(
    frame % 45,
    [0, 22, 44],
    [0.0, 0.04, 0.0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Sottotitoli fade in ──────────────────────────────────────────────────
  const subtitleBarOpacity = interpolate(frame, [4, 14], [0, 0.82], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Ancora visiva progress bar ───────────────────────────────────────────
  const anchorScaleX = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.body,
        opacity: sceneOpacity,
        overflow: 'hidden',
      }}
    >
      {/* Glow overlay pulsante */}
      <AbsoluteFill
        style={{
          backgroundColor: THEME.colors.accent,
          opacity: glowPulse,
          mixBlendMode: 'screen',
        }}
      />

      {/* ── Grafico 1: anello neon esterno ─────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 720,
          height: 720,
          borderRadius: '50%',
          border: `2px solid ${THEME.colors.accent}`,
          boxShadow: `0 0 28px ${THEME.colors.accent}, 0 0 60px ${THEME.colors.accent}44`,
          transform: `translate(-50%, -52%) scale(${ringSpring * ringPulse})`,
          opacity: ringOpacity,
        }}
      />

      {/* Anello interno — contrappasso più sottile */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 480,
          height: 480,
          borderRadius: '50%',
          border: `1px solid ${THEME.colors.accentSoft}50`,
          transform: `translate(-50%, -52%) scale(${ringSpring * (2.0 - ringPulse)})`,
          opacity: ringOpacity * 0.35,
        }}
      />

      {/* ── Grafico 2: linea neon orizzontale sinistra ──────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '42%',
          left: 52,
          height: 3,
          width: `${lineProgress * 36}%`,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 16px ${THEME.colors.accent}`,
          borderRadius: 2,
        }}
      />

      {/* Linea neon destra (speculare) */}
      <div
        style={{
          position: 'absolute',
          top: '42%',
          right: 52,
          height: 3,
          width: `${lineProgress * 36}%`,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 16px ${THEME.colors.accent}`,
          borderRadius: 2,
        }}
      />

      {/* ── Grafico 3: linea verticale accent ───────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '42%',
          left: 49,
          width: 3,
          height: vertLineHeight,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 10px ${THEME.colors.accent}`,
          borderRadius: 2,
        }}
      />

      {/* Scan line orizzontale traversata silenziosa */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          top: scanY,
          backgroundColor: THEME.colors.accent,
          opacity: 0.15,
          boxShadow: `0 0 10px ${THEME.colors.accent}`,
        }}
      />

      {/* ── Keyword 1: "NON HAI" — spring aggressiva + glitch ───────────── */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: 0,
          right: 0,
          textAlign: 'center',
          transform: `scale(${mainScale}) translate(${glitchX}px, ${glitchY}px)`,
          transformOrigin: 'center center',
          opacity: fadeIn,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 118,
            fontWeight: 900,
            color: THEME.colors.text,
            letterSpacing: 3,
            display: 'block',
            lineHeight: 1,
            textShadow: '0 0 40px rgba(255,255,255,0.22)',
          }}
        >
          NON HAI
        </span>
      </div>

      {/* ── Keyword 2: "TEMPO" — neon verde, entrata ritardata ──────────── */}
      <div
        style={{
          position: 'absolute',
          top: '48%',
          left: 0,
          right: 0,
          textAlign: 'center',
          transform: `scale(${tempoScale}) translate(${-glitchX * 0.5}px, 0px)`,
          transformOrigin: 'center center',
          opacity: tempoOpacity,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 136,
            fontWeight: 900,
            color: THEME.colors.accent,
            letterSpacing: 5,
            display: 'block',
            lineHeight: 1,
            textShadow: `0 0 34px ${THEME.colors.accent}, 0 0 68px ${THEME.colors.accent}55`,
          }}
        >
          TEMPO
        </span>
      </div>

      {/* ── Keyword 3: "per montarli" — staggered ───────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '66%',
          left: 0,
          right: 0,
          textAlign: 'center',
          transform: `translateY(${secondaryTranslateY}px)`,
          opacity: secondaryOpacity,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 48,
            fontWeight: 600,
            color: THEME.colors.muted,
            letterSpacing: 8,
            display: 'block',
            textTransform: 'uppercase',
          }}
        >
          per montarli
        </span>
      </div>

      {/* ── Counter video animato ────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '76%',
          left: '50%',
          transform: `translateX(-50%) scale(${counterScale})`,
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          opacity: counterOpacity,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 52,
            fontWeight: 700,
            color: THEME.colors.text,
            letterSpacing: 1,
          }}
        >
          {counterValue}
        </span>
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 24,
            fontWeight: 400,
            color: THEME.colors.muted,
            letterSpacing: 1,
          }}
        >
          video in attesa
        </span>
      </div>

      {/* ── Barra sottotitoli voiceover — 40px height, 22px font ────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 54,
          left: 32,
          right: 32,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: subtitleBarOpacity,
        }}
      >
        <p
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            fontWeight: 400,
            color: THEME.colors.muted,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.4,
            textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}
        >
          Hai già girato un sacco di video ma non trovi mai il tempo per montarli.
        </p>
      </div>

      {/* ── Ancora visiva — progress bar neon bottom ────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor?.height ?? 6,
          backgroundColor: THEME.anchor?.color ?? THEME.colors.accent,
          boxShadow: THEME.anchor?.glow ?? `0 0 14px ${THEME.colors.accent}, 0 0 28px ${THEME.colors.accent}60`,
          transformOrigin: 'left center',
          transform: `scaleX(${anchorScaleX})`,
        }}
      />
    </AbsoluteFill>
  );
};
