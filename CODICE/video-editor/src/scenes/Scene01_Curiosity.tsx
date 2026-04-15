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

const SCENE_DURATION = 150; // 00:00–00:05 @ 30fps

export const Scene01_Curiosity: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ─── FADE OUT — ultimi 8 frame ───────────────────────────────────────────
  const sceneOpacity = interpolate(
    frame,
    [SCENE_DURATION - 8, SCENE_DURATION - 1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ─── ENTRATA ESPLOSIVA — spring aggressive, da fuori frame ───────────────
  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 6, stiffness: 300 },
  });
  // Scala 0→1.05→1 via spring overshoot naturale (damping 6 lo fa)
  const titleY = interpolate(
    frame,
    [0, 20],
    [-300, 0],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateRight: 'clamp',
    }
  );

  // Glitch orizzontale burst nei primi 14 frame
  const glitchX =
    frame < 14
      ? interpolate(frame % 7, [0, 2, 4, 6], [-6, 5, -3, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;

  // ─── TYPEWRITER "HAI GIÀ" — lettera per lettera ──────────────────────────
  const WORD1 = 'HAI GIÀ';
  const w1Chars = Math.floor(
    interpolate(frame, [1, 25], [0, WORD1.length], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  // ─── TYPEWRITER "NON MONTI" — spring standard, ritardata ─────────────────
  const WORD2 = 'NON MONTI';
  const word2Entry = spring({
    frame: Math.max(0, frame - 35),
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const w2Chars = Math.floor(
    interpolate(frame, [36, 85], [0, WORD2.length], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  // Cursore lampeggiante
  const cursor = interpolate(frame % 18, [0, 8, 17], [1, 0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── GLOW PULSANTE sul titolo ─────────────────────────────────────────────
  const glowPulse = interpolate(frame % 32, [0, 16, 31], [0.55, 1.0, 0.55], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const accentGlow = `0 0 ${24 * glowPulse}px ${THEME.colors.accent}, 0 0 ${55 * glowPulse}px ${THEME.colors.accent}55`;

  // ─── ELEMENTO GRAFICO 1: Scan-line whip-in ───────────────────────────────
  // Due barre neon che sfrecciano da sinistra — evocano "elaborazione file"
  const scan1X = interpolate(frame, [2, 16], [-1100, 1100], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scan1Op = interpolate(frame, [2, 10, 16], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scan2X = interpolate(frame, [20, 38], [-1100, 1100], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scan2Op = interpolate(frame, [20, 28, 38], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── ELEMENTO GRAFICO 2: Barre verticali laterali che crescono ───────────
  const barH = interpolate(frame, [4, 28], [0, 280], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const barOp = interpolate(frame, [4, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Divisore neon orizzontale tra le keyword
  const divW = interpolate(frame, [20, 40], [0, 340], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── BADGE POP-IN "I FILE RESTANO LÌ" a frame 82 ─────────────────────────
  const badgeSpring = spring({
    frame: Math.max(0, frame - 80),
    fps,
    config: { damping: 8, stiffness: 250 },
  });
  const badgeOp = interpolate(frame, [80, 96], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── SOTTOTITOLO VOICEOVER — typewriter 22px barra bottom ────────────────
  const VOICEOVER =
    'Hai già girato un sacco di video ma non trovi mai il tempo per montarli. I file restano lì nel telefono o nel computer.';
  const voiceChars = Math.floor(
    interpolate(frame, [4, SCENE_DURATION - 12], [0, VOICEOVER.length], {
      easing: Easing.linear,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const subtitleFade = interpolate(frame, [4, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── ANCORA VISIVA — progress bar neon verde bottom ──────────────────────
  const anchorScaleX = interpolate(frame, [0, SCENE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const anchorHeight = THEME.anchor?.height ?? 6;
  const anchorColor = THEME.anchor?.color ?? THEME.colors.accent;
  const anchorGlow = THEME.anchor?.glow ?? `0 0 20px ${THEME.colors.accent}, 0 0 40px ${THEME.colors.accent}44`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.body,
        opacity: sceneOpacity,
        overflow: 'hidden',
      }}
    >
      {/* Sfondo radial glow — schermo che pulsa di dati */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 60% 40% at 50% 43%, ${THEME.colors.accent}09 0%, transparent 68%)`,
        }}
      />

      {/* Griglia neon minima — file system visivo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(${THEME.colors.accent}06 1px, transparent 1px),
            linear-gradient(90deg, ${THEME.colors.accent}06 1px, transparent 1px)
          `,
          backgroundSize: '88px 88px',
        }}
      />

      {/* ── ELEMENTO GRAFICO 1a: Scan-line superiore ── */}
      <div
        style={{
          position: 'absolute',
          top: '32%',
          left: scan1X,
          width: '110%',
          height: 3,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 18px ${THEME.colors.accent}, 0 0 36px ${THEME.colors.accent}66`,
          opacity: scan1Op,
        }}
      />

      {/* ── ELEMENTO GRAFICO 1b: Scan-line inferiore — ritardata ── */}
      <div
        style={{
          position: 'absolute',
          top: '66%',
          left: scan2X,
          width: '110%',
          height: 3,
          backgroundColor: THEME.colors.accentSoft,
          boxShadow: `0 0 16px ${THEME.colors.accentSoft}, 0 0 30px ${THEME.colors.accentSoft}66`,
          opacity: scan2Op,
        }}
      />

      {/* ── ELEMENTO GRAFICO 2a: Barra verticale sinistra ── */}
      <div
        style={{
          position: 'absolute',
          top: '23%',
          left: 56,
          width: 5,
          height: barH,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 18px ${THEME.colors.accent}`,
          opacity: barOp,
          borderRadius: 3,
        }}
      />

      {/* ── ELEMENTO GRAFICO 2b: Barra verticale destra ── */}
      <div
        style={{
          position: 'absolute',
          top: '23%',
          right: 56,
          width: 5,
          height: barH,
          backgroundColor: THEME.colors.accentSoft,
          boxShadow: `0 0 18px ${THEME.colors.accentSoft}`,
          opacity: barOp,
          borderRadius: 3,
        }}
      />

      {/* ── TITOLO — area centrale con entrata esplosiva ── */}
      <div
        style={{
          position: 'absolute',
          top: '24%',
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          transform: `translateY(${titleY}px) scale(${entrySpring}) translateX(${glitchX}px)`,
        }}
      >
        {/* KEYWORD 1 — "HAI GIÀ" 120px accent typewriter */}
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 120,
            fontWeight: 900,
            color: THEME.colors.accent,
            letterSpacing: 8,
            textShadow: accentGlow,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {WORD1.slice(0, w1Chars)}
          <span style={{ opacity: w1Chars < WORD1.length ? cursor : 0, color: THEME.colors.accent }}>
            |
          </span>
        </div>

        {/* Divisore neon orizzontale */}
        <div
          style={{
            width: divW,
            height: 3,
            backgroundColor: THEME.colors.accent,
            boxShadow: `0 0 14px ${THEME.colors.accent}`,
            opacity: barOp,
          }}
        />

        {/* KEYWORD 2 — "NON MONTI" 82px white spring standard */}
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 82,
            fontWeight: 900,
            color: THEME.colors.text,
            letterSpacing: 5,
            textShadow: `0 0 22px rgba(255,255,255,0.18)`,
            lineHeight: 1,
            opacity: word2Entry,
            transform: `scale(${word2Entry})`,
            userSelect: 'none',
          }}
        >
          {WORD2.slice(0, w2Chars)}
          <span
            style={{
              opacity: w2Chars > 0 && w2Chars < WORD2.length ? cursor : 0,
              color: THEME.colors.accentSoft,
            }}
          >
            |
          </span>
        </div>
      </div>

      {/* ── BADGE POP-IN "I FILE RESTANO LÌ" ── */}
      <div
        style={{
          position: 'absolute',
          top: '72%',
          left: '50%',
          transform: `translateX(-50%) scale(${badgeSpring})`,
          opacity: badgeOp,
          backgroundColor: THEME.colors.accent,
          borderRadius: 10,
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 30,
          paddingRight: 30,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.accent,
            fontWeight: 900,
            fontSize: 28,
            color: THEME.colors.body,
            letterSpacing: 3,
          }}
        >
          I FILE RESTANO LÌ
        </span>
      </div>

      {/* ── BARRA SOTTOTITOLI VOICEOVER — 22px typewriter ── */}
      <div
        style={{
          position: 'absolute',
          bottom: anchorHeight + 12,
          left: 0,
          right: 0,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 38,
          paddingRight: 38,
          minHeight: 40,
          backgroundColor: 'rgba(0,0,0,0.50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: subtitleFade,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            fontWeight: 400,
            color: THEME.colors.muted,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {VOICEOVER.slice(0, voiceChars)}
        </span>
      </div>

      {/* ── ANCORA VISIVA — neon progress bar bottom ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: anchorHeight,
          backgroundColor: anchorColor,
          boxShadow: anchorGlow,
          transformOrigin: 'left center',
          transform: `scaleX(${anchorScaleX})`,
        }}
      />
    </AbsoluteFill>
  );
};
