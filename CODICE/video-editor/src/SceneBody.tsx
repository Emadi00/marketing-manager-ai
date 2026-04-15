import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  spring,
} from 'remotion';
import { THEME } from './theme';

// ─── Frame boundaries (relative to SceneBody, 30 fps) ────────────────────────
// SceneBody starts after Hook (frame 135 in parent). Internally starts at 0.
// [00:03-00:08]  shock       → S1: 0   – 150  (5s  × 30fps)
// [00:08-00:15]  desire      → S2: 150 – 360  (7s  × 30fps)
// [00:15-00:25]  desire fast → S3: 360 – 660  (10s × 30fps)
// [00:25-00:35]  trust       → S4: 660 – 944  (9.5s padded to durationInFrames)

const S1_IN  =   0;
const S1_OUT = 150;
const S2_IN  = 150;
const S2_OUT = 360;
const S3_IN  = 360;
const S3_OUT = 660;
const S4_IN  = 660;
const S4_OUT = 944;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fade-in / hold / fade-out envelope. inputRange always strictly increasing. */
function env(frame: number, inF: number, outF: number): number {
  return interpolate(
    frame,
    [inF, inF + 10, outF - 10, outF],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}

/** Translate from `from` to 0 over `dur` frames, starting at `atF`. */
function slide(frame: number, atF: number, dur: number, from: number): number {
  return interpolate(frame, [atF, atF + dur], [from, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** 0 → 1 opacity ramp starting at `atF` over `dur` frames. */
function fadeIn(frame: number, atF: number, dur = 14): number {
  return interpolate(frame, [atF, atF + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// ─── Section 1 ── SHOCK [00:03-00:08] ────────────────────────────────────────
// "Non hai tempo per montarli. E intanto i contenuti non escono."
// Animazione: slide da destra + micro-glitch jitter + emphatic scale pulse

const Section1: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const lf = frame - S1_IN;

  const line1X  = slide(lf, 0, 22, 200);
  const line1Op = fadeIn(lf, 0, 12);

  const line2X  = slide(lf, 14, 22, 240);
  const line2Op = fadeIn(lf, 14, 14);

  // Glitch jitter on line1 between lf 22-55
  const inGlitch = lf >= 22 && lf < 55;
  const jitter   = inGlitch ? (Math.floor(lf / 3) % 2) * 5 - 2.5 : 0;

  // Scale pulse on line2 to reinforce emotional weight
  const emphScale = interpolate(
    lf,
    [38, 50, 62, 74],
    [1, 1.06, 1, 1.03],
    {
      easing: Easing.inOut(Easing.ease),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  // Red accent line fades in after text lands
  const lineOp = fadeIn(lf, 26, 12);

  return (
    <AbsoluteFill
      style={{
        opacity: env(frame, S1_IN, S1_OUT),
        backgroundColor: THEME.colors.body,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 28,
        padding: THEME.spacing.pagePadding,
      }}
    >
      {/* Line 1 — slide from right + glitch */}
      <div
        style={{
          opacity: line1Op,
          transform: `translateX(${line1X}px) translateX(${jitter}px)`,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: '64px',
            fontWeight: 800,
            color: THEME.colors.text,
            lineHeight: 1.2,
            textTransform: 'uppercase' as const,
            letterSpacing: '-0.5px',
          }}
        >
          Non hai tempo per montarli.
        </span>
      </div>

      {/* Line 2 — slide from right + scale pulse */}
      <div
        style={{
          opacity: line2Op,
          transform: `translateX(${line2X}px) scale(${emphScale})`,
          textAlign: 'center',
          display: 'inline-block',
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '54px',
            fontWeight: 700,
            color: THEME.colors.cta,
            lineHeight: 1.3,
            textShadow: THEME.shadows.glowCta,
          }}
        >
          E intanto i contenuti non escono.
        </span>
      </div>

      {/* CTA-color accent rule */}
      <div
        style={{
          position: 'absolute',
          bottom: 185,
          left: 48,
          right: 48,
          height: 3,
          backgroundColor: THEME.colors.cta,
          opacity: lineOp,
          borderRadius: 2,
          boxShadow: THEME.shadows.glowCta,
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Section 2 ── DESIRE [00:08-00:15] ───────────────────────────────────────
// "Con Videograph Studio registri, mandi il file e noi facciamo tutto il resto."
// Animazione: spring scale sul brand + slide da sinistra su body copy + divider grow

const Section2: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const lf = frame - S2_IN;

  const brandScale = spring({
    frame: lf,
    fps,
    from: 0.5,
    to: 1,
    config: THEME.motion.springHook,
  });
  const brandOp = fadeIn(lf, 0, 16);

  const divW = interpolate(lf, [18, 52], [0, 560], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bodyOp = fadeIn(lf, 48, 16);
  const bodyX  = slide(lf, 48, 22, -100);

  return (
    <AbsoluteFill
      style={{
        opacity: env(frame, S2_IN, S2_OUT),
        backgroundColor: THEME.colors.body,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 24,
        padding: THEME.spacing.pagePadding,
      }}
    >
      {/* Brand name — spring scale slam */}
      <div
        style={{
          transform: `scale(${brandScale})`,
          opacity: brandOp,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: '78px',
            fontWeight: 900,
            color: THEME.colors.accent,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.04em',
            lineHeight: 1.0,
            textShadow: THEME.shadows.glowAccent,
          }}
        >
          VIDEOGRAPH
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: '44px',
            fontWeight: 700,
            color: THEME.colors.text,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.14em',
            lineHeight: 1.15,
          }}
        >
          STUDIO
        </div>
      </div>

      {/* Growing accent divider */}
      <div
        style={{
          width: divW,
          height: 2,
          backgroundColor: THEME.colors.accent,
          borderRadius: 2,
          boxShadow: THEME.shadows.glowAccent,
          maxWidth: 900,
        }}
      />

      {/* Body copy — slide from left */}
      <div
        style={{
          opacity: bodyOp,
          transform: `translateX(${bodyX}px)`,
          textAlign: 'center',
          maxWidth: 920,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '42px',
            fontWeight: 600,
            color: THEME.colors.text,
            lineHeight: 1.35,
          }}
        >
          Registri, mandi il file e{' '}
          <strong
            style={{
              fontFamily: THEME.fonts.accent,
              fontWeight: 900,
              color: THEME.colors.accent,
              textShadow: THEME.shadows.glowAccent,
            }}
          >
            noi facciamo tutto il resto.
          </strong>
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ─── Section 3 ── DESIRE FAST [00:15-00:25] ──────────────────────────────────
// "Tagli, sottotitoli, musica ed effetti. Tu pensi alle idee, noi pensiamo al resto."
// Animazione: 4 feature pill staggered slide-up + closing line slide da destra

const PILLS = ['Tagli', 'Sottotitoli', 'Musica', 'Effetti'] as const;
const PILL_DELAYS = [0, 35, 70, 105] as const;

const Section3: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const lf = frame - S3_IN;

  const closingIn = 170;
  const closingOp = fadeIn(lf, closingIn, 16);
  const closingX  = slide(lf, closingIn, 22, 90);

  return (
    <AbsoluteFill
      style={{
        opacity: env(frame, S3_IN, S3_OUT),
        backgroundColor: THEME.colors.body,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 20,
        padding: THEME.spacing.pagePadding,
      }}
    >
      {/* Feature pills — staggered slide from bottom */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap' as const,
          justifyContent: 'center',
          gap: '14px 16px',
        }}
      >
        {PILLS.map((pill, i) => {
          const delay  = PILL_DELAYS[i];
          const pillOp = fadeIn(lf, delay, 14);
          const pillY  = slide(lf, delay, 20, 50);

          return (
            <div
              key={pill}
              style={{
                opacity: pillOp,
                transform: `translateY(${pillY}px)`,
                backgroundColor: 'rgba(0, 212, 255, 0.10)',
                border: `2px solid ${THEME.colors.accent}`,
                borderRadius: 14,
                paddingTop: 14,
                paddingBottom: 14,
                paddingLeft: 30,
                paddingRight: 30,
                fontFamily: THEME.fonts.accent,
                fontSize: '50px',
                fontWeight: 800,
                color: THEME.colors.accent,
                textTransform: 'uppercase' as const,
                letterSpacing: '1px',
                boxShadow: '0 0 14px rgba(0,212,255,0.22)',
              }}
            >
              {pill}
            </div>
          );
        })}
      </div>

      {/* Closing statement — slide from right, delayed */}
      <div
        style={{
          opacity: closingOp,
          transform: `translateX(${closingX}px)`,
          marginTop: 28,
          textAlign: 'center',
          maxWidth: 920,
        }}
      >
        <p
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '50px',
            fontWeight: 700,
            color: THEME.colors.text,
            lineHeight: 1.35,
            margin: 0,
          }}
        >
          Tu pensi alle idee,{' '}
          <span
            style={{
              fontFamily: THEME.fonts.accent,
              fontWeight: 900,
              color: THEME.colors.accent,
              textShadow: THEME.shadows.glowAccent,
            }}
          >
            noi pensiamo al resto.
          </span>
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Section 4 ── TRUST [00:25-00:35] ────────────────────────────────────────
// "In meno di 48 ore i tuoi contenuti sono pronti per essere pubblicati."
// Animazione: spring scale entrance + counter animato 0→48 + pulsing glow + body fade

const Section4: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const lf = frame - S4_IN;

  const entryScale = spring({
    frame: lf,
    fps,
    from: 0.6,
    to: 1,
    config: THEME.motion.springBody,
  });

  const preOp = fadeIn(lf, 0, 12);

  // Counter slams in at lf=14 via aggressive spring
  const counterScale = spring({
    frame: Math.max(0, lf - 14),
    fps,
    from: 0,
    to: 1,
    config: THEME.motion.springCta,
  });
  const counterOp = fadeIn(lf, 14, 16);

  // Animated numeric counter 0 → 48
  const counterValue = Math.round(
    interpolate(lf, [14, 68], [0, 48], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  // Pulsing glow on counter after it settles (lf > 70)
  const glowMult = lf >= 70
    ? interpolate(
        Math.sin(((lf - 70) / 45) * Math.PI * 2),
        [-1, 1],
        [0.75, 1.25],
      )
    : 1;

  const bodyOp = fadeIn(lf, 72, 18);
  const bodyY  = slide(lf, 72, 20, 40);

  return (
    <AbsoluteFill
      style={{
        opacity: env(frame, S4_IN, S4_OUT),
        backgroundColor: THEME.colors.body,
        transform: `scale(${entryScale})`,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 22,
        padding: THEME.spacing.pagePadding,
      }}
    >
      {/* "In meno di" pre-label */}
      <span
        style={{
          opacity: preOp,
          fontFamily: THEME.fonts.main,
          fontSize: THEME.fonts.sizeSub,
          fontWeight: 500,
          color: THEME.colors.muted,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.14em',
        }}
      >
        In meno di
      </span>

      {/* "48 ORE" — spring slam + pulsing glow */}
      <div
        style={{
          transform: `scale(${counterScale})`,
          opacity: counterOp,
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: '172px',
            fontWeight: 900,
            color: THEME.colors.accent,
            lineHeight: 1,
            textShadow: `0 0 ${30 * glowMult}px ${THEME.colors.accent}, 0 0 ${60 * glowMult}px rgba(0,212,255,0.45)`,
          }}
        >
          {counterValue}
        </span>
        <span
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: '68px',
            fontWeight: 800,
            color: THEME.colors.text,
            marginLeft: 14,
            verticalAlign: 'bottom',
            paddingBottom: 22,
            display: 'inline-block',
          }}
        >
          ORE
        </span>
      </div>

      {/* Supporting body copy */}
      <div
        style={{
          opacity: bodyOp,
          transform: `translateY(${bodyY}px)`,
          textAlign: 'center',
          maxWidth: 900,
        }}
      >
        <p
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '44px',
            fontWeight: 600,
            color: THEME.colors.text,
            lineHeight: 1.35,
            margin: 0,
          }}
        >
          I tuoi contenuti sono{' '}
          <span
            style={{
              color: THEME.colors.accent,
              fontWeight: 800,
              textShadow: THEME.shadows.glowAccent,
            }}
          >
            pronti per essere pubblicati.
          </span>
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Subtitle bar text per sezione ────────────────────────────────────────────

function getSubtitle(frame: number): string {
  if (frame < S1_OUT) {
    return 'Non hai tempo per montarli. E intanto i contenuti non escono.';
  }
  if (frame < S2_OUT) {
    return 'Con Videograph Studio registri, mandi il file e noi facciamo tutto il resto.';
  }
  if (frame < S3_OUT) {
    return 'Tagli, sottotitoli, musica ed effetti. Tu pensi alle idee, noi pensiamo al resto.';
  }
  return 'In meno di 48 ore i tuoi contenuti sono pronti per essere pubblicati.';
}

// ─── SceneBody — orchestratore ────────────────────────────────────────────────

export const SceneBody: React.FC = () => {
  const frame      = useCurrentFrame();
  const { fps }    = useVideoConfig();
  const subtitle   = getSubtitle(frame);

  // Anchor pulsing opacity
  const anchorOp = interpolate(
    Math.sin((frame / 60) * Math.PI * 2),
    [-1, 1],
    [0.55, 1.0],
  );

  return (
    <AbsoluteFill>
      {/* ── Section layers ── */}
      {frame >= S1_IN && frame < S1_OUT && <Section1 frame={frame} fps={fps} />}
      {frame >= S2_IN && frame < S2_OUT && <Section2 frame={frame} fps={fps} />}
      {frame >= S3_IN && frame < S3_OUT && <Section3 frame={frame} fps={fps} />}
      {frame >= S4_IN && frame < S4_OUT && <Section4 frame={frame} fps={fps} />}

      {/* ── Voiceover subtitle bar — absolute bottom 80, height 80 ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 40,
          right: 40,
          height: 80,
          backgroundColor: 'rgba(0, 0, 0, 0.70)',
          borderRadius: 12,
          borderLeft: `3px solid ${THEME.colors.accent}`,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 18,
          paddingRight: 18,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '22px',
            fontWeight: 500,
            color: THEME.colors.text,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {subtitle}
        </span>
      </div>

      {/* ── Visual anchor — accent line always at bottom ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor.height,
          backgroundColor: THEME.anchor.color,
          opacity: anchorOp,
          boxShadow: THEME.anchor.glow,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
