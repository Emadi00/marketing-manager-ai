import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { THEME } from '../theme';

// ── Gold accent for desire emotion (Strategist directive) ──────────────────
const DESIRE_GOLD = '#FBBF24';

// ── 4 service icons — staggered at 0, 35, 70, 105 frame
const ICONS: { char: string; label: string }[] = [
  { char: '✂',  label: 'TAGLI' },
  { char: '≡',  label: 'SOTTOTITOLI' },
  { char: '♪',  label: 'MUSICA' },
  { char: '✦',  label: 'EFFETTI' },
];
const ICON_STARTS = [0, 35, 70, 105] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Background decorative lines & rings — defined above main export
// ─────────────────────────────────────────────────────────────────────────────
const NeonBackground: React.FC<{ frame: number; neonScale: number; ringScale: number; ringOp: number; ringRot: number }> = ({
  frame,
  neonScale,
  ringScale,
  ringOp,
  ringRot,
}) => (
  <>
    {/* Outer ring */}
    <div
      style={{
        position: 'absolute',
        top: '28%',
        left: '50%',
        width: 380,
        height: 380,
        borderRadius: '50%',
        border: `2px solid ${DESIRE_GOLD}`,
        opacity: ringOp,
        boxShadow: `0 0 22px ${DESIRE_GOLD}44`,
        transform: `translate(-50%, -50%) scale(${ringScale}) rotate(${ringRot}deg)`,
      }}
    />
    {/* Inner ring */}
    <div
      style={{
        position: 'absolute',
        top: '28%',
        left: '50%',
        width: 300,
        height: 300,
        borderRadius: '50%',
        border: `1px solid ${THEME.colors.accent}`,
        opacity: ringOp * 0.55,
        transform: `translate(-50%, -50%) scale(${ringScale}) rotate(${-ringRot * 1.4}deg)`,
      }}
    />
    {/* Top neon line */}
    <div
      style={{
        position: 'absolute',
        top: 205,
        left: '50%',
        height: 2,
        width: 500,
        backgroundColor: THEME.colors.accent,
        boxShadow: `0 0 10px ${THEME.colors.accent}, 0 0 22px ${THEME.colors.accent}`,
        borderRadius: 1,
        transform: `translateX(-50%) scaleX(${neonScale})`,
        transformOrigin: 'left center',
      }}
    />
    {/* Bottom neon line */}
    <div
      style={{
        position: 'absolute',
        top: 510,
        left: '50%',
        height: 2,
        width: 500,
        backgroundColor: THEME.colors.accent,
        boxShadow: `0 0 10px ${THEME.colors.accent}, 0 0 22px ${THEME.colors.accent}`,
        borderRadius: 1,
        transform: `translateX(-50%) scaleX(${neonScale})`,
        transformOrigin: 'right center',
      }}
    />
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
//  SCENE 03 — DESIRE  |  00:08-00:14  |  180 frame  |  30fps
// ─────────────────────────────────────────────────────────────────────────────
export const Scene03_Desire: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Fade out: last 8 frames ────────────────────────────────────────────────
  const sceneOpacity = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Global zoom 1.0 → 1.08 ease-in-out (Strategist directive) ─────────────
  const globalZoom = interpolate(frame, [0, durationInFrames - 1], [1.0, 1.08], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Main title: spring soft arrival — damping:18, stiffness:120 ───────────
  const titleArrival = spring({ frame, fps, config: { damping: 18, stiffness: 120 }, from: 0.7, to: 1.0 });

  // ── Glow pulse: 40f cycle, starts after title settles (~30f) ──────────────
  const glowActive = frame > 30 ? 1 : 0;
  const glowPulse = glowActive * interpolate(frame % 40, [0, 20, 39], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const glowSizePx = 10 + glowPulse * 22;
  // Scale pulse: 1.0 → 1.04, driven by glow cycle
  const titlePulseScale = 1.0 + glowPulse * 0.04;

  // ── Neon lines & ring ─────────────────────────────────────────────────────
  const neonLineScale = interpolate(frame, [0, 45], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringScale = spring({ frame, fps, config: { damping: 18, stiffness: 80 }, from: 0.6, to: 1.0 });
  const ringOpacity = interpolate(frame, [0, 25], [0, 0.22], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringRotation = interpolate(frame, [0, durationInFrames - 1], [0, 30], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Secondary subheadline: slide up + fade at frame 75 ───────────────────
  const subHeadOpacity = interpolate(frame, [75, 105], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const subHeadY = interpolate(frame, [75, 105], [24, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Anchor progress bar 0 → 1 over 180f ──────────────────────────────────
  const anchorScaleX = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: 'linear-gradient(170deg, #061406 0%, #0D1B2A 50%, #061406 100%)',
          transform: `scale(${globalZoom})`,
          transformOrigin: 'center center',
        }}
      >
        {/* ── Graphic element 2: rings + neon lines ─────────────────────── */}
        <NeonBackground
          frame={frame}
          neonScale={neonLineScale}
          ringScale={ringScale}
          ringOp={ringOpacity}
          ringRot={ringRotation}
        />

        {/* ── MAIN TITLE: TUTTO / INCLUSO ───────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            top: '14%',
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontWeight: 900,
              fontSize: 112,
              color: DESIRE_GOLD,
              textAlign: 'center',
              letterSpacing: '-3px',
              lineHeight: 1.0,
              transform: `scale(${titleArrival * titlePulseScale})`,
              transformOrigin: 'center center',
              textShadow: `0 0 ${glowSizePx}px ${DESIRE_GOLD}, 0 0 ${glowSizePx * 2}px ${DESIRE_GOLD}55`,
            }}
          >
            TUTTO
          </div>
          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontWeight: 900,
              fontSize: 112,
              color: THEME.colors.accent,
              textAlign: 'center',
              letterSpacing: '-3px',
              lineHeight: 1.0,
              marginTop: -8,
              transform: `scale(${titleArrival})`,
              transformOrigin: 'center center',
              textShadow: `0 0 ${glowSizePx}px ${THEME.colors.accent}, 0 0 ${glowSizePx * 1.5}px ${THEME.colors.accent}55`,
            }}
          >
            INCLUSO
          </div>
        </div>

        {/* ── Graphic element 1: 4 icon grid — staggered scale pop ─────── */}
        <div
          style={{
            position: 'absolute',
            top: '52%',
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            alignItems: 'flex-start',
            paddingLeft: 28,
            paddingRight: 28,
          }}
        >
          {ICONS.map((icon, i) => {
            const start = ICON_STARTS[i];
            const localFrame = Math.max(0, frame - start);
            const iconScale = spring({
              frame: localFrame,
              fps,
              config: { damping: 16, stiffness: 200 },
              from: 0,
              to: 1,
            });
            const iconOpacity = interpolate(frame, [start, start + 14], [0, 1], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <div
                key={icon.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity: iconOpacity,
                  transform: `scale(${iconScale})`,
                }}
              >
                <div
                  style={{
                    fontSize: 64,
                    lineHeight: 1,
                    marginBottom: 12,
                    color: DESIRE_GOLD,
                    textAlign: 'center',
                    filter: `drop-shadow(0 0 12px ${DESIRE_GOLD})`,
                  }}
                >
                  {icon.char}
                </div>
                <div
                  style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontWeight: 700,
                    fontSize: 17,
                    color: THEME.colors.muted,
                    textAlign: 'center',
                    letterSpacing: '1px',
                  }}
                >
                  {icon.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Secondary: TU PENSI. / NOI FACCIAMO. — re-engagement ────── */}
        <div
          style={{
            position: 'absolute',
            top: '73%',
            left: 0,
            right: 0,
            opacity: subHeadOpacity,
            transform: `translateY(${subHeadY}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontWeight: 900,
              fontSize: 52,
              color: THEME.colors.text,
              textAlign: 'center',
              letterSpacing: '-1px',
              textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
            }}
          >
            TU PENSI.
          </div>
          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontWeight: 900,
              fontSize: 52,
              color: DESIRE_GOLD,
              textAlign: 'center',
              letterSpacing: '-1px',
              textShadow: `0 0 16px ${DESIRE_GOLD}`,
            }}
          >
            NOI FACCIAMO.
          </div>
        </div>

        {/* ── Subtitle voiceover bar — 40px height, 22px font ──────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 28,
            right: 28,
            minHeight: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            borderRadius: 6,
            padding: '6px 14px',
          }}
        >
          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontWeight: 600,
              fontSize: 22,
              color: THEME.colors.muted,
              textAlign: 'center',
              lineHeight: 1.35,
              textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
            }}
          >
            Tagli, sottotitoli, musica, effetti — tutto incluso.{' '}
            Tu pensi alle idee, noi pensiamo al resto.
          </div>
        </div>

        {/* ── Ancora visiva: neon progress bar bottom ───────────────────── */}
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
    </AbsoluteFill>
  );
};
