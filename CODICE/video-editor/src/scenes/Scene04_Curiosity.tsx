import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { THEME } from '../theme';

const CURIOSITY_COLOR = '#38BDF8';
const DURATION = 180;

function typewriter(text: string, frame: number, startFrame: number, rate: number): string {
  const elapsed = Math.max(0, frame - startFrame);
  return text.slice(0, Math.min(text.length, Math.floor(elapsed * rate)));
}

export const Scene04_Curiosity: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Global fade-out ultimi 8 frame ────────────────────────────────────────
  const sceneOpacity = interpolate(
    frame,
    [DURATION - 8, DURATION],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Anchor progress bar ───────────────────────────────────────────────────
  const anchorScaleX = interpolate(frame, [0, DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ELEMENTO GRAFICO 1: Linee neon orizzontali
  // ─────────────────────────────────────────────────────────────────────────
  const line1W = interpolate(frame, [4, 60], [0, 440], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const line1Opacity = interpolate(frame, [4, 18, 82, 95], [0, 0.65, 0.65, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const line2W = interpolate(frame, [20, 75], [0, 360], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const line2Opacity = interpolate(frame, [20, 34, 82, 95], [0, 0.45, 0.45, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ELEMENTO GRAFICO 2: Ring neon pulsante (attorno a PRONTO?)
  // ─────────────────────────────────────────────────────────────────────────
  const ringSpring = spring({
    frame: Math.max(0, frame - 88),
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const ringBaseScale = interpolate(ringSpring, [0, 1], [0.12, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringPulse = interpolate(
    frame % 42,
    [0, 21, 41],
    [0.95, 1.08, 0.95],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const ringScale = frame < 88 ? 0 : ringBaseScale * ringPulse;
  const ringOpacity = interpolate(frame, [88, 106, 168, 178], [0, 0.52, 0.44, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Glow pulsante PRONTO?
  const prontoGlow = interpolate(frame % 38, [0, 19, 37], [10, 32, 10], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCAN LINE — elemento dinamico verticale
  // ─────────────────────────────────────────────────────────────────────────
  const scanY = interpolate(
    frame % 58,
    [0, 57],
    [-8, 1930],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // FASE 1 (0–88f): "NIENTE PIÙ" + "DIMENTICATI" typewriter
  // voiceover sync 00:14–00:17
  // ─────────────────────────────────────────────────────────────────────────
  const TEXT1 = 'NIENTE PIÙ';
  const text1Chars = Math.floor(
    interpolate(frame, [5, 52], [0, TEXT1.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const text1TY = interpolate(frame, [5, 26], [28, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const text1Opacity = interpolate(frame, [5, 18, 76, 89], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursor1 = text1Chars < TEXT1.length && Math.floor(frame / 7) % 2 === 0;

  const TEXT2 = 'DIMENTICATI';
  const text2Chars = Math.floor(
    interpolate(frame, [44, 92], [0, TEXT2.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const text2TY = interpolate(frame, [44, 64], [22, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const text2Opacity = interpolate(frame, [44, 58, 76, 89], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursor2 = text2Chars < TEXT2.length && Math.floor(frame / 7) % 2 === 0;

  // ─────────────────────────────────────────────────────────────────────────
  // FASE 2 (85–180f): Phone mockup 3D + thumb swiping + "PRONTO?"
  // voiceover sync 00:17–00:20
  // ─────────────────────────────────────────────────────────────────────────

  // Phone: entra da destra con spring soft
  const phoneSpring = spring({
    frame: Math.max(0, frame - 85),
    fps,
    config: { damping: 18, stiffness: 120 },
  });
  const phoneTX = interpolate(phoneSpring, [0, 1], [280, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 3D rotateY: -15° intorno a f90 poi ritorno progressivo
  const phoneRotateY = interpolate(
    frame,
    [85, 98, 122, 162],
    [-22, -15, -15, -4],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  const phoneOpacity = interpolate(frame, [85, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Parallax thumb swiping
  const thumbDrift = interpolate(frame, [96, 157], [0, -84], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // "PRONTO?" — scale pop 0.9→1.25 in 8f al beat (f108–f116)
  const prontoEnter = interpolate(frame, [108, 116], [0.9, 1.25], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const prontoSettle = spring({
    frame: Math.max(0, frame - 116),
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  const prontoSettleScale = interpolate(prontoSettle, [0, 1], [1.25, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const prontoScale =
    frame < 108 ? 0.88 : frame < 116 ? prontoEnter : prontoSettleScale;
  const prontoOpacity = interpolate(frame, [108, 120], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Sottotitolo — switch a f92
  const subtitleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const subtitle =
    frame < 92
      ? 'Niente più video dimenticati nel telefono o nel computer.'
      : 'Pronto a scoprire come funziona?';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.body,
        opacity: sceneOpacity,
        overflow: 'hidden',
        fontFamily: THEME.fonts.main,
      }}
    >
      {/* ── Scan line ───────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: scanY,
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, ${CURIOSITY_COLOR}30 35%, ${CURIOSITY_COLOR}70 50%, ${CURIOSITY_COLOR}30 65%, transparent 100%)`,
          pointerEvents: 'none',
        }}
      />

      {/* ── Linea neon 1 — alto (grafico 1a) ───────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 295,
          left: 0,
          height: 2,
          width: line1W,
          backgroundColor: CURIOSITY_COLOR,
          boxShadow: `0 0 10px 3px ${CURIOSITY_COLOR}`,
          opacity: line1Opacity,
        }}
      />

      {/* ── Linea neon 2 — medio (grafico 1b) ──────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 730,
          right: 0,
          height: 1,
          width: line2W,
          backgroundColor: CURIOSITY_COLOR,
          boxShadow: `0 0 8px 2px ${CURIOSITY_COLOR}`,
          opacity: line2Opacity,
        }}
      />

      {/* ── TEXT 1: "NIENTE PIÙ" typewriter ────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 345,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 108,
          fontWeight: 900,
          color: CURIOSITY_COLOR,
          letterSpacing: 4,
          textShadow: `0 0 32px ${CURIOSITY_COLOR}70`,
          opacity: text1Opacity,
          transform: `translateY(${text1TY}px)`,
        }}
      >
        {TEXT1.slice(0, text1Chars)}
        <span
          style={{
            display: 'inline-block',
            width: 4,
            height: '0.8em',
            backgroundColor: CURIOSITY_COLOR,
            marginLeft: 6,
            opacity: cursor1 ? 1 : 0,
            verticalAlign: 'bottom',
          }}
        />
      </div>

      {/* ── TEXT 2: "DIMENTICATI" typewriter ───────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 516,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 92,
          fontWeight: 900,
          color: THEME.colors.text,
          letterSpacing: 2,
          opacity: text2Opacity,
          transform: `translateY(${text2TY}px)`,
        }}
      >
        {TEXT2.slice(0, text2Chars)}
        <span
          style={{
            display: 'inline-block',
            width: 3,
            height: '0.8em',
            backgroundColor: THEME.colors.text,
            marginLeft: 5,
            opacity: cursor2 ? 1 : 0,
            verticalAlign: 'bottom',
          }}
        />
      </div>

      {/* ── Ring neon — attorno a PRONTO? (grafico 2) ──────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 1336,
          left: '50%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          border: `2px solid ${CURIOSITY_COLOR}`,
          boxShadow: `0 0 ${prontoGlow}px ${CURIOSITY_COLOR}66`,
          opacity: ringOpacity,
          transform: `translate(-50%, -50%) scale(${ringScale})`,
          pointerEvents: 'none',
        }}
      />

      {/* ── Phone mockup con 3D rotate e parallax swiping ──────────────────── */}
      {frame >= 85 && (
        <div
          style={{
            position: 'absolute',
            top: 768,
            left: '50%',
            width: 252,
            height: 452,
            borderRadius: 30,
            border: `2px solid ${CURIOSITY_COLOR}`,
            boxShadow: `0 0 30px 6px ${CURIOSITY_COLOR}36, inset 0 0 18px rgba(56,189,248,0.05)`,
            backgroundColor: 'rgba(4,10,20,0.97)',
            overflow: 'hidden',
            opacity: phoneOpacity,
            transform: `translateX(calc(-50% + ${phoneTX}px)) perspective(900px) rotateY(${phoneRotateY}deg)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Notch */}
          <div
            style={{
              marginTop: 12,
              width: 70,
              height: 11,
              borderRadius: 6,
              backgroundColor: `${CURIOSITY_COLOR}55`,
              flexShrink: 0,
            }}
          />
          {/* Schermo thumbnails scorrevoli */}
          <div
            style={{
              width: '88%',
              flex: 1,
              borderRadius: 10,
              backgroundColor: '#030a13',
              border: `1px solid ${CURIOSITY_COLOR}1a`,
              overflow: 'hidden',
              position: 'relative',
              marginTop: 10,
              marginBottom: 14,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: '5%',
                  width: '90%',
                  height: 66,
                  borderRadius: 8,
                  backgroundColor:
                    i === 0
                      ? `${CURIOSITY_COLOR}1f`
                      : 'rgba(255,255,255,0.04)',
                  border:
                    i === 0
                      ? `1px solid ${CURIOSITY_COLOR}42`
                      : '1px solid rgba(255,255,255,0.06)',
                  top: 8 + i * 84 + thumbDrift,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    backgroundColor:
                      i === 0 ? `${CURIOSITY_COLOR}3a` : 'rgba(255,255,255,0.09)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  <div
                    style={{
                      width: i === 0 ? '70%' : '55%',
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: 'rgba(255,255,255,0.15)',
                    }}
                  />
                  <div
                    style={{
                      width: '38%',
                      height: 4,
                      borderRadius: 3,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── "PRONTO?" — scale pop + glow pulsante ──────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 1336,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 130,
          fontWeight: 900,
          color: CURIOSITY_COLOR,
          letterSpacing: 6,
          opacity: prontoOpacity,
          transform: `scale(${prontoScale})`,
          textShadow: `0 0 ${prontoGlow}px ${CURIOSITY_COLOR}, 0 0 ${prontoGlow * 2}px ${CURIOSITY_COLOR}44`,
        }}
      >
        PRONTO?
      </div>

      {/* ── Sottotitoli — barra verbale 22px bottom ─────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 54,
          left: 34,
          right: 34,
          textAlign: 'center',
          fontSize: 22,
          fontWeight: 400,
          color: THEME.colors.muted,
          lineHeight: 1.5,
          opacity: subtitleOpacity,
          textShadow: '0 2px 6px rgba(0,0,0,0.65)',
        }}
      >
        {subtitle}
      </div>

      {/* ── Ancora visiva — barra neon progress bottom ──────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor?.height ?? 6,
          backgroundColor: THEME.anchor?.color ?? THEME.colors.accent,
          boxShadow: THEME.anchor?.glow ?? `0 0 14px 4px ${THEME.colors.accent}`,
          transformOrigin: 'left center',
          transform: `scaleX(${anchorScaleX})`,
          zIndex: 20,
        }}
      />
    </AbsoluteFill>
  );
};
