// SceneHook.tsx — Videograph Studio · Hook [00:00–00:04.5] · 135f @ 30fps
// Pattern interrupt massimo: 4 parole, neon lines, glitch, scanlines, cerchio pulsante

import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Easing,
} from 'remotion';
import { THEME } from './theme';

// ─── Scanlines ───────────────────────────────────────────────────────────────
const Scanlines: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      opacity,
      pointerEvents: 'none',
      backgroundImage:
        'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.42) 3px, rgba(0,0,0,0.42) 4px)',
    }}
  />
);

// ─── Barra neon orizzontale con entrata slide ─────────────────────────────────
const NeonBar: React.FC<{
  top: number;
  maxWidth: number;
  delayFrames: number;
  frame: number;
  fps: number;
  alpha?: number;
}> = ({ top, maxWidth, delayFrames, frame, fps, alpha = 1 }) => {
  const progress = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    from: 0,
    to: 1,
    config: { damping: 10, stiffness: 200 },
  });
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: '50%',
        transform: 'translateX(-50%)',
        width: maxWidth * progress,
        height: 2,
        backgroundColor: THEME.colors.accent,
        boxShadow: THEME.anchor.glow,
        opacity: alpha,
        pointerEvents: 'none',
      }}
    />
  );
};

// ─── Cerchio / anello pulsante ────────────────────────────────────────────────
const PulseRing: React.FC<{
  frame: number;
  fps: number;
  diameter: number;
  delayFrames: number;
  alpha: number;
}> = ({ frame, fps, diameter, delayFrames, alpha }) => {
  const entry = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    from: 0,
    to: 1,
    config: { damping: 9, stiffness: 150 },
  });
  const pulse = interpolate(frame % 44, [0, 22, 44], [1, 1.065, 1], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${entry * pulse})`,
        width: diameter,
        height: diameter,
        borderRadius: '50%',
        border: `2px solid ${THEME.colors.accent}`,
        boxShadow: `0 0 16px ${THEME.colors.accent}, inset 0 0 16px rgba(57,255,20,0.05)`,
        opacity: entry * alpha,
        pointerEvents: 'none',
      }}
    />
  );
};

// ─── SceneHook ────────────────────────────────────────────────────────────────
export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Entrata riga 1 — spring aggressiva (pattern interrupt) ──
  const row1Scale = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: THEME.springs.aggressive, // damping:6 stiffness:300
  });
  const row1Opacity = interpolate(frame, [0, 5], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: 'clamp',
  });

  // ── Entrata riga 2 — ritardata di 12 frame ──
  const row2Scale = spring({
    frame: Math.max(0, frame - 12),
    fps,
    from: 0,
    to: 1,
    config: THEME.springs.aggressive,
  });
  const row2Opacity = interpolate(frame, [12, 18], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Glitch laterale sulle parole chiave ──
  const glitchX = interpolate(
    frame % 11,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [0, -5, 4, 0, 0, -3, 5, 0, 0, -2, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const glitchOpacity = interpolate(
    frame % 13,
    [0, 1, 2, 11, 12],
    [0, 0.72, 0, 0, 0.55],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Sottotitolo narrativo (22px) ── appare dopo il testo hero
  const subOpacity = interpolate(frame, [24, 40], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Punto centrale (crosshair neon) ──
  const dotEntry = spring({
    frame: Math.max(0, frame - 4),
    fps,
    from: 0,
    to: 1,
    config: { damping: 10, stiffness: 220 },
  });

  // ── Barre laterali decorative verticali ──
  const vertProgress = spring({
    frame: Math.max(0, frame - 8),
    fps,
    from: 0,
    to: 1,
    config: { damping: 12, stiffness: 180 },
  });
  const vertHeight = 220 * vertProgress;

  // ── Exit fade ──
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - THEME.durations.exitDuration, durationInFrames],
    [1, 0],
    {
      easing: Easing.in(Easing.quad),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.hook,
        opacity: exitOpacity,
        overflow: 'hidden',
      }}
    >
      {/* ── Scanlines ── */}
      <Scanlines opacity={0.27} />

      {/* ── Anelli pulsanti neon ── */}
      <PulseRing frame={frame} fps={fps} diameter={580} delayFrames={5} alpha={0.32} />
      <PulseRing frame={frame} fps={fps} diameter={360} delayFrames={9} alpha={0.48} />

      {/* ── Barre neon orizzontali superiori ── */}
      <NeonBar top={348} maxWidth={860} delayFrames={3} frame={frame} fps={fps} />
      <NeonBar top={316} maxWidth={200} delayFrames={13} frame={frame} fps={fps} alpha={0.55} />

      {/* ── Barre neon orizzontali inferiori ── */}
      <NeonBar top={1552} maxWidth={860} delayFrames={5} frame={frame} fps={fps} />
      <NeonBar top={1584} maxWidth={200} delayFrames={17} frame={frame} fps={fps} alpha={0.55} />

      {/* ── Barre verticali decorative (sinistra) ── */}
      <div
        style={{
          position: 'absolute',
          top: `calc(50% - ${vertHeight / 2}px)`,
          left: 48,
          width: 2,
          height: vertHeight,
          backgroundColor: THEME.colors.accent,
          boxShadow: THEME.anchor.glow,
          opacity: vertProgress * 0.7,
        }}
      />
      {/* ── Barre verticali decorative (destra) ── */}
      <div
        style={{
          position: 'absolute',
          top: `calc(50% - ${vertHeight / 2}px)`,
          right: 48,
          width: 2,
          height: vertHeight,
          backgroundColor: THEME.colors.accent,
          boxShadow: THEME.anchor.glow,
          opacity: vertProgress * 0.7,
        }}
      />

      {/* ── Crosshair centrale ── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 14,
          height: 14,
          borderRadius: '50%',
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 22px ${THEME.colors.accent}, 0 0 50px ${THEME.colors.accent}`,
          opacity: dotEntry * 0.85,
          pointerEvents: 'none',
        }}
      />

      {/* ── Glitch layer rosso — sfasato di 8px su NON HAI ── */}
      <div
        style={{
          position: 'absolute',
          top: '39%',
          left: '50%',
          transform: `translate(calc(-50% + ${glitchX + 8}px), -50%) scale(${row1Scale})`,
          opacity: glitchOpacity * row1Opacity,
          fontFamily: THEME.fonts.main,
          fontWeight: THEME.fonts.weightBlack,
          fontSize: 122,
          color: '#FF0040',
          textTransform: 'uppercase' as const,
          letterSpacing: THEME.fonts.spacingHero,
          textAlign: 'center' as const,
          lineHeight: THEME.fonts.lineHeightHero,
          whiteSpace: 'nowrap' as const,
          userSelect: 'none' as const,
          pointerEvents: 'none' as const,
        }}
      >
        NON HAI
      </div>

      {/* ── Testo hero riga 1 — NON HAI ── */}
      <div
        style={{
          position: 'absolute',
          top: '39%',
          left: '50%',
          transform: `translate(calc(-50% + ${glitchX}px), -50%) scale(${row1Scale})`,
          opacity: row1Opacity,
          fontFamily: THEME.fonts.main,
          fontWeight: THEME.fonts.weightBlack,
          fontSize: 122,
          color: THEME.colors.accent,
          textTransform: 'uppercase' as const,
          letterSpacing: THEME.fonts.spacingHero,
          textAlign: 'center' as const,
          lineHeight: THEME.fonts.lineHeightHero,
          whiteSpace: 'nowrap' as const,
          textShadow: `0 0 20px ${THEME.colors.accent}, 0 0 50px ${THEME.colors.accent}, 0 0 90px rgba(57,255,20,0.32)`,
          userSelect: 'none' as const,
          pointerEvents: 'none' as const,
        }}
      >
        NON HAI
      </div>

      {/* ── Testo hero riga 2 — TEMPO ── */}
      <div
        style={{
          position: 'absolute',
          top: '59%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${row2Scale})`,
          opacity: row2Opacity,
          fontFamily: THEME.fonts.main,
          fontWeight: THEME.fonts.weightBlack,
          fontSize: 138,
          color: THEME.colors.text,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.10em',
          textAlign: 'center' as const,
          lineHeight: THEME.fonts.lineHeightHero,
          whiteSpace: 'nowrap' as const,
          textShadow: THEME.colors.glowWhite,
          userSelect: 'none' as const,
          pointerEvents: 'none' as const,
        }}
      >
        TEMPO
      </div>

      {/* ── Sottotitolo narrativo 22px ── */}
      <div
        style={{
          position: 'absolute',
          bottom: THEME.safeZone.paddingVertical - 50,
          left: THEME.safeZone.paddingHorizontal,
          right: THEME.safeZone.paddingHorizontal,
          textAlign: 'center' as const,
          fontFamily: THEME.fonts.main,
          fontSize: 22,
          fontWeight: THEME.fonts.weightRegular,
          color: THEME.colors.muted,
          letterSpacing: THEME.fonts.spacingAccent,
          textTransform: 'uppercase' as const,
          opacity: subOpacity,
          userSelect: 'none' as const,
          pointerEvents: 'none' as const,
        }}
      >
        per montare i tuoi video
      </div>

      {/* ── Ancora visiva in basso (presente in ogni scena) ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor.height,
          backgroundColor: THEME.anchor.color,
          boxShadow: THEME.anchor.glow,
        }}
      />
    </AbsoluteFill>
  );
};
