import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Easing,
} from 'remotion';
import { THEME } from './theme';

// ─── SceneCTA — [00:30–00:45] → 271 frame @ 30fps ────────────────────────────
// Testo: "Scopri come funziona Videograph Studio — commentate con video."
// Emozione: URGENCY massima — l'ultimo ricordo visivo dello spettatore
// Struttura: neon wipe → brand slam → "COMMENTA" pulse → subtitle bar → watermark

export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Neon bar top — wipe da sinistra ──────────────────────────────────────
  const barWidth = interpolate(frame, [0, 22], [0, 1080], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── "VIDEOGRAPH" — spring slam da scale 0 ────────────────────────────────
  const mainScale = spring({
    frame: Math.max(0, frame - 4),
    fps,
    from: 0,
    to: 1,
    config: { damping: 7, stiffness: 220 },
  });

  const mainOpacity = interpolate(frame, [4, 18], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── "STUDIO" — spring ritardato ───────────────────────────────────────────
  const studioScale = spring({
    frame: Math.max(0, frame - 20),
    fps,
    from: 0,
    to: 1,
    config: { damping: 9, stiffness: 160 },
  });

  const studioOpacity = interpolate(frame, [20, 34], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── "COMMENTA" — spring energica tardiva ─────────────────────────────────
  const ctaSpring = spring({
    frame: Math.max(0, frame - 36),
    fps,
    from: 0,
    to: 1,
    config: { damping: 6, stiffness: 280 },
  });

  const ctaOpacity = interpolate(frame, [36, 50], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Pulse loop su "COMMENTA" — ogni 30 frame ─────────────────────────────
  const pulseScale = interpolate(frame % 30, [0, 15, 30], [1, 1.05, 1], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Glow sincrono con pulse ───────────────────────────────────────────────
  const glowRadius = interpolate(frame % 30, [0, 15, 30], [22, 55, 22], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── "con video" label — fade in ───────────────────────────────────────────
  const labelOpacity = interpolate(frame, [52, 70], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Anello decorativo rotante ─────────────────────────────────────────────
  const ringRotation = interpolate(frame, [0, durationInFrames], [0, 360], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const ringOpacity = interpolate(frame, [10, 30], [0, 0.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Subtitle bar — testo verbale completo, 22px ───────────────────────────
  const subtitleOpacity = interpolate(frame, [60, 80], [0, 1], {
    easing: Easing.out(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Watermark fade in ─────────────────────────────────────────────────────
  const wmOpacity = interpolate(frame, [90, 110], [0, 0.4], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Freccia bouncing ──────────────────────────────────────────────────────
  const arrowOpacity = interpolate(frame, [75, 92], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const arrowBounce = interpolate(frame % 26, [0, 13, 25], [0, -12, 0], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Exit fade ultimi 12 frame ─────────────────────────────────────────────
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    {
      easing: Easing.in(Easing.quad),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const accentGlow = `0 0 ${glowRadius}px ${THEME.colors.accent}, 0 0 ${glowRadius * 2}px ${THEME.colors.accent}`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.cta,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 0,
        overflow: 'hidden',
        opacity: exitOpacity,
      }}
    >
      {/* Neon bar superiore — wipe */}
      <div
        style={{
          position: 'absolute',
          top: 108,
          left: 0,
          width: barWidth,
          height: 3,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 18px ${THEME.colors.accent}, 0 0 36px ${THEME.colors.accent}`,
        }}
      />

      {/* Neon bar inferiore speculare */}
      <div
        style={{
          position: 'absolute',
          bottom: 228,
          left: 0,
          width: barWidth,
          height: 3,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 18px ${THEME.colors.accent}, 0 0 36px ${THEME.colors.accent}`,
        }}
      />

      {/* Anello decorativo rotante */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 380,
          height: 380,
          marginTop: -190,
          marginLeft: -190,
          border: `1.5px solid ${THEME.colors.accent}`,
          borderRadius: '50%',
          borderTopColor: 'transparent',
          borderLeftColor: 'transparent',
          transform: `rotate(${ringRotation}deg)`,
          opacity: ringOpacity,
        }}
      />

      {/* Anello esterno contro-rotante */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 460,
          height: 460,
          marginTop: -230,
          marginLeft: -230,
          border: `1px solid ${THEME.colors.accentSoft}`,
          borderRadius: '50%',
          borderRightColor: 'transparent',
          borderBottomColor: 'transparent',
          transform: `rotate(${-ringRotation * 0.55}deg)`,
          opacity: ringOpacity * 0.55,
        }}
      />

      {/* "VIDEOGRAPH" — spring slam */}
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: mainOpacity,
          transform: `scale(${mainScale})`,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 82,
            fontWeight: 900,
            color: THEME.colors.text,
            textTransform: 'uppercase',
            letterSpacing: 5,
            textShadow: '0 0 14px rgba(255,255,255,0.22)',
            display: 'block',
          }}
        >
          VIDEOGRAPH
        </span>
      </div>

      {/* "STUDIO" — neon accent, spring ritardato */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: studioOpacity,
          transform: `scale(${studioScale})`,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 56,
            fontWeight: 900,
            color: THEME.colors.accent,
            textTransform: 'uppercase',
            letterSpacing: 16,
            textShadow: `0 0 22px ${THEME.colors.accent}, 0 0 44px ${THEME.colors.accent}`,
            display: 'block',
          }}
        >
          STUDIO
        </span>
      </div>

      {/* Separatore neon */}
      <div
        style={{
          position: 'absolute',
          top: '41%',
          left: '18%',
          right: '18%',
          height: 1,
          backgroundColor: `rgba(57, 255, 20, 0.32)`,
        }}
      />

      {/* "COMMENTA" — spring energica + pulse loop */}
      <div
        style={{
          position: 'absolute',
          top: '43%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: ctaOpacity,
          transform: `scale(${ctaSpring * pulseScale})`,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: 120,
            fontWeight: 700,
            color: THEME.colors.accent,
            textTransform: 'uppercase',
            letterSpacing: 2,
            textShadow: accentGlow,
            display: 'block',
          }}
        >
          COMMENTA
        </span>
      </div>

      {/* "con video" */}
      <div
        style={{
          position: 'absolute',
          top: '62%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: labelOpacity,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 34,
            fontWeight: 400,
            color: THEME.colors.muted,
            textTransform: 'uppercase',
            letterSpacing: 8,
            display: 'block',
          }}
        >
          con video
        </span>
      </div>

      {/* Freccia down bouncing */}
      <div
        style={{
          position: 'absolute',
          top: '70%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: arrowOpacity,
          transform: `translateY(${arrowBounce}px)`,
        }}
      >
        <span
          style={{
            fontSize: 50,
            color: THEME.colors.accent,
            textShadow: `0 0 16px ${THEME.colors.accent}`,
          }}
        >
          ↓
        </span>
      </div>

      {/* Subtitle bar — testo verbale completo, 22px */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 22,
          paddingBottom: 88,
          paddingLeft: 48,
          paddingRight: 48,
          backgroundColor: 'rgba(0, 0, 0, 0.80)',
          opacity: subtitleOpacity,
        }}
      >
        <p
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            fontWeight: 400,
            color: THEME.colors.text,
            textAlign: 'center',
            lineHeight: 1.55,
            margin: 0,
            letterSpacing: 0.3,
          }}
        >
          Scopri come funziona Videograph Studio — commentate con video.
        </p>
      </div>

      {/* Watermark — bottom 40, right 40, opacity 0.4 */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 40,
          fontFamily: THEME.fonts.main,
          fontSize: 16,
          color: THEME.colors.text,
          opacity: wmOpacity,
          textTransform: 'uppercase',
          letterSpacing: 2,
        }}
      >
        VideoCraft Studio
      </div>
    </AbsoluteFill>
  );
};
