import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { THEME } from '../theme';

const SCENE_DURATION = 450;
const URGENCY_RED = '#C0392B';

export const Scene04_Urgency: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade out ultimi 8 frame
  const opacity = interpolate(
    frame,
    [SCENE_DURATION - 8, SCENE_DURATION],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Spring CTA — damping:8 stiffness:220 (urgency)
  const entryScale = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 220 },
  });

  // Pulse loop CTA — ogni 30 frame
  const pulse = interpolate(frame % 30, [0, 15, 29], [1, 1.08, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Testo principale — slide da basso
  const mainTextY = interpolate(frame, [0, 18], [140, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: 'clamp',
  });

  // Seconda parola — entrata ritardata
  const secondWordOpacity = interpolate(frame, [22, 42], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const secondWordY = interpolate(frame, [22, 42], [80, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Counter conto alla rovescia: 20 → 0 in 2 secondi (60 frame)
  const counter = Math.ceil(
    interpolate(frame, [30, 90], [20, 0], {
      easing: Easing.linear,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  // Glow intensità pulsante
  const glowIntensity = interpolate(frame % 30, [0, 15, 29], [20, 55, 20], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ring neon 1 — espansione loop lenta
  const ring1Scale = interpolate(frame % 60, [0, 30, 59], [0.82, 1.22, 0.82], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ring1Opacity = interpolate(frame % 60, [0, 28, 59], [0.9, 0.12, 0.9], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ring neon 2 — sfasato, frequenza diversa
  const ring2Scale = interpolate(frame % 44, [0, 22, 43], [1.12, 0.75, 1.12], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ring2Opacity = interpolate(frame % 44, [0, 22, 43], [0.32, 0.82, 0.32], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Linee lampeggianti decorative
  const barBlink = interpolate(frame % 22, [0, 11, 21], [1, 0.25, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Linea neon top — larghezza pulsante
  const neonLineW = interpolate(frame % 46, [0, 23, 45], [80, 460, 80], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Shake CTA finale — strettamente crescente
  const shakeX = interpolate(
    frame,
    [390, 402, 414, 426, 438, 449],
    [0, -10, 10, -6, 6, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Flash apertura
  const flashOpacity = interpolate(frame, [0, 3, 7], [0.4, 0, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Sottotitolo fade-in
  const subtitleOpa = interpolate(frame, [18, 38], [0, 1], {
    easing: Easing.out(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Badge pill entrata ritardata
  const badgeSpring = spring({
    frame: Math.max(0, frame - 28),
    fps,
    config: { damping: 8, stiffness: 220 },
  });
  const badgeScale = interpolate(badgeSpring, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ancora visiva — progress bar
  const anchorScaleX = interpolate(frame, [0, SCENE_DURATION - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: URGENCY_RED,
        opacity,
        overflow: 'hidden',
      }}
    >
      {/* Flash neon all'apertura */}
      <AbsoluteFill
        style={{
          backgroundColor: THEME.colors.accent,
          opacity: flashOpacity,
          pointerEvents: 'none',
        }}
      />

      {/* Radial glow pulsante di sfondo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 70% 58% at 50% 44%,
            rgba(57,255,20,${glowIntensity * 0.004}) 0%,
            transparent 80%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Ring neon esterno */}
      <div
        style={{
          position: 'absolute',
          top: '41%',
          left: '50%',
          width: 600,
          height: 600,
          marginTop: -300,
          marginLeft: -300,
          borderRadius: '50%',
          border: `4px solid ${THEME.colors.accent}`,
          boxShadow: `0 0 ${glowIntensity}px ${THEME.colors.accent},
                      0 0 ${glowIntensity * 2}px ${THEME.colors.accent}`,
          transform: `scale(${ring1Scale * entryScale})`,
          opacity: ring1Opacity,
          pointerEvents: 'none',
        }}
      />

      {/* Ring neon interno — sfasato */}
      <div
        style={{
          position: 'absolute',
          top: '41%',
          left: '50%',
          width: 400,
          height: 400,
          marginTop: -200,
          marginLeft: -200,
          borderRadius: '50%',
          border: `2px solid ${THEME.colors.accentSoft}`,
          boxShadow: `0 0 ${glowIntensity * 0.6}px ${THEME.colors.accentSoft}`,
          transform: `scale(${ring2Scale * entryScale})`,
          opacity: ring2Opacity,
          pointerEvents: 'none',
        }}
      />

      {/* Linea neon orizzontale top — larghezza pulsante */}
      <div
        style={{
          position: 'absolute',
          top: 108,
          left: '50%',
          transform: 'translateX(-50%)',
          width: neonLineW,
          height: 3,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 14px ${THEME.colors.accent}, 0 0 28px ${THEME.colors.accent}`,
          opacity: barBlink,
          borderRadius: 2,
        }}
      />

      {/* Counter conto alla rovescia */}
      <div
        style={{
          position: 'absolute',
          top: '13%',
          left: 0,
          right: 0,
          textAlign: 'center',
          transform: `scale(${entryScale * pulse}) translateX(${shakeX}px)`,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 190,
            fontWeight: 900,
            color: THEME.colors.accent,
            lineHeight: 1,
            textShadow: `0 0 ${glowIntensity}px ${THEME.colors.accent},
                         0 0 ${glowIntensity * 2.5}px ${THEME.colors.accent}`,
            display: 'block',
          }}
        >
          {counter}s
        </span>
      </div>

      {/* Keyword principale — COMMENTA */}
      <div
        style={{
          position: 'absolute',
          top: '43%',
          left: 0,
          right: 0,
          textAlign: 'center',
          transform: `translateY(${mainTextY}px) scale(${pulse})`,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 108,
            fontWeight: 900,
            color: THEME.colors.text,
            lineHeight: 1,
            letterSpacing: '-2px',
            textShadow: `0 0 30px rgba(255,255,255,0.5)`,
          }}
        >
          COMMENTA
        </span>
      </div>

      {/* Linea divisore */}
      <div
        style={{
          position: 'absolute',
          top: '57%',
          left: 60,
          right: 60,
          height: 3,
          backgroundColor: THEME.colors.accent,
          opacity: barBlink,
          boxShadow: `0 0 14px ${THEME.colors.accent}`,
          borderRadius: 2,
        }}
      />

      {/* Keyword secondaria — CON VIDEO */}
      <div
        style={{
          position: 'absolute',
          top: '60%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: secondWordOpacity,
          transform: `translateY(${secondWordY}px) translateX(${shakeX}px)`,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 88,
            fontWeight: 900,
            color: THEME.colors.text,
            letterSpacing: '-1px',
            lineHeight: 1,
          }}
        >
          CON VIDEO
        </span>
      </div>

      {/* Badge pill CTA — FALLO ORA */}
      <div
        style={{
          position: 'absolute',
          top: '75%',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: 34,
            fontWeight: 700,
            color: '#000000',
            backgroundColor: THEME.colors.accent,
            padding: '18px 56px',
            borderRadius: 6,
            transform: `scale(${badgeScale * pulse}) translateX(${shakeX}px)`,
            boxShadow: `0 0 30px ${THEME.colors.accent}, 0 0 60px rgba(57,255,20,0.35)`,
            letterSpacing: 3,
            textTransform: 'uppercase' as const,
          }}
        >
          FALLO ORA
        </div>
      </div>

      {/* Barre neon decorative sx */}
      {[0, 1, 2].map((i) => (
        <div
          key={`bar-l-${i}`}
          style={{
            position: 'absolute',
            top: `${88 + i * 2.5}%`,
            left: 36,
            height: i === 0 ? 3 : i === 1 ? 2 : 1,
            width: entryScale * (170 - i * 40),
            backgroundColor: THEME.colors.accent,
            boxShadow: `0 0 8px ${THEME.colors.accent}`,
            borderRadius: 2,
            opacity: (0.9 - i * 0.22) * barBlink,
          }}
        />
      ))}

      {/* Barre neon decorative dx */}
      {[0, 1, 2].map((i) => (
        <div
          key={`bar-r-${i}`}
          style={{
            position: 'absolute',
            top: `${88 + i * 2.5}%`,
            right: 36,
            height: i === 0 ? 3 : i === 1 ? 2 : 1,
            width: entryScale * (170 - i * 40),
            backgroundColor: THEME.colors.accent,
            boxShadow: `0 0 8px ${THEME.colors.accent}`,
            borderRadius: 2,
            opacity: (0.9 - i * 0.22) * barBlink,
          }}
        />
      ))}

      {/* Sottotitoli voiceover */}
      <div
        style={{
          position: 'absolute',
          bottom: 52,
          left: 28,
          right: 28,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: subtitleOpa,
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
          Commentate con video e ti spiego in 20 secondi come funziona.
        </span>
      </div>

      {/* Watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 112,
          right: 28,
          fontFamily: THEME.fonts.main,
          fontSize: 16,
          color: THEME.colors.text,
          opacity: 0.4,
          letterSpacing: 1.5,
          textTransform: 'uppercase' as const,
        }}
      >
        VideoCraft Studio
      </div>

      {/* Ancora visiva — progress bar neon verde */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor.height,
          backgroundColor: THEME.anchor.color,
          boxShadow: THEME.anchor.glow,
          transformOrigin: 'left center',
          transform: `scaleX(${anchorScaleX})`,
        }}
      />
    </AbsoluteFill>
  );
};
