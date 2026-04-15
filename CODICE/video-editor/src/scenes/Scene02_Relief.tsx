import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { THEME } from '../theme';

const RELIEF_COLOR = '#4ADE80';

export const Scene02_Relief: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Global fade-out ultimi 8 frame ──────────────────────────────────
  const globalOpacity = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Anchor progress bar ─────────────────────────────────────────────
  const anchorScaleX = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // ────────────────────────────────────────────────────────────────────
  // GRAPHIC ELEMENT 1 — Neon ring pulsante (persistente)
  // ────────────────────────────────────────────────────────────────────
  const ringReveal = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const ringPulse = interpolate(frame % 30, [0, 15, 29], [1.0, 1.07, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ────────────────────────────────────────────────────────────────────
  // GRAPHIC ELEMENT 2 — Scan-line sweep orizzontale
  // ────────────────────────────────────────────────────────────────────
  const scanX = interpolate(frame, [0, durationInFrames], [-160, 1240], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ────────────────────────────────────────────────────────────────────
  // FASE 1: 0–49f — "MANDA IL FILE"
  // Rappresenta: registri + mandi il file
  // ────────────────────────────────────────────────────────────────────
  const p1Spring = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const p1Opacity = interpolate(frame, [0, 10, 43, 52], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const p1ExitX = interpolate(frame, [44, 55], [0, -380], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  // ────────────────────────────────────────────────────────────────────
  // FASE 2: 50–109f — "48 ORE" con counter animato
  // Rappresenta: timer 48h
  // ────────────────────────────────────────────────────────────────────
  const p2Local = Math.max(0, frame - 50);
  const p2Spring = spring({ frame: p2Local, fps, config: { damping: 12, stiffness: 150 } });
  const p2EnterX = interpolate(frame, [50, 63], [380, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const p2ExitX = interpolate(frame, [100, 111], [0, -380], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const p2X = frame < 63 ? p2EnterX : frame >= 100 ? p2ExitX : 0;
  const p2Opacity = interpolate(frame, [50, 61, 103, 113], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hoursCount = Math.round(
    interpolate(p2Local, [10, 52], [0, 48], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.quad),
    })
  );
  const underlineGrow = interpolate(p2Local, [12, 56], [0, 440], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ────────────────────────────────────────────────────────────────────
  // FASE 3: 110–149f — "PRONTI"
  // Rappresenta: contenuti pronti per pubblicare
  // ────────────────────────────────────────────────────────────────────
  const p3Local = Math.max(0, frame - 110);
  const p3Spring = spring({ frame: p3Local, fps, config: { damping: 12, stiffness: 150 } });
  const p3EnterX = interpolate(frame, [110, 123], [380, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const p3Opacity = interpolate(
    frame,
    [110, 121, durationInFrames - 9, durationInFrames - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const checkReveal = interpolate(p3Local, [0, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Tick bar verticale — indicatore fase
  const tickP1 = spring({ frame: Math.max(0, frame - 2), fps, config: { damping: 14, stiffness: 160 } });
  const tickP2 = spring({ frame: Math.max(0, frame - 52), fps, config: { damping: 14, stiffness: 160 } });
  const tickP3 = spring({ frame: Math.max(0, frame - 112), fps, config: { damping: 14, stiffness: 160 } });

  // Subtitle fade
  const subtitleOpacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.body,
        opacity: globalOpacity,
        overflow: 'hidden',
      }}
    >
      {/* ── GRAPHIC 1: Neon ring pulsante ── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 580,
          height: 580,
          borderRadius: '50%',
          border: `3px solid ${RELIEF_COLOR}`,
          boxShadow: `0 0 30px ${RELIEF_COLOR}45, 0 0 60px ${RELIEF_COLOR}18`,
          transform: `translate(-50%, -50%) scale(${ringPulse})`,
          opacity: ringReveal * 0.2,
          pointerEvents: 'none',
        }}
      />
      {/* Anello interno più piccolo */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 340,
          height: 340,
          borderRadius: '50%',
          border: `1px solid ${RELIEF_COLOR}`,
          transform: `translate(-50%, -50%) scale(${ringPulse * 0.96})`,
          opacity: ringReveal * 0.12,
          pointerEvents: 'none',
        }}
      />

      {/* ── GRAPHIC 2: Scan-line sweep ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: scanX,
          width: 160,
          height: '100%',
          background: `linear-gradient(90deg, transparent, ${RELIEF_COLOR}20, transparent)`,
          pointerEvents: 'none',
        }}
      />

      {/* ── Tick bar indicatori fase (elemento grafico 3) ── */}
      {[
        { scale: tickP1, opacity: p1Opacity },
        { scale: tickP2, opacity: p2Opacity },
        { scale: tickP3, opacity: p3Opacity },
      ].map(({ scale, opacity }, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: '18%',
            left: 52 + i * 22,
            width: 5,
            height: 210,
            backgroundColor: RELIEF_COLOR,
            boxShadow: `0 0 14px ${RELIEF_COLOR}`,
            borderRadius: 3,
            transform: `scaleY(${scale})`,
            transformOrigin: 'top center',
            opacity,
          }}
        />
      ))}

      {/* ══════════════════════════════════
          FASE 1 — MANDA IL FILE
      ══════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: p1Opacity,
          transform: `translateX(${p1ExitX}px)`,
          gap: 28,
        }}
      >
        {/* Icona file neon */}
        <div
          style={{
            width: 112,
            height: 142,
            border: `5px solid ${RELIEF_COLOR}`,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${p1Spring})`,
            boxShadow: `0 0 32px ${RELIEF_COLOR}55`,
            position: 'relative',
            backgroundColor: `${RELIEF_COLOR}12`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              width: 34,
              height: 34,
              backgroundColor: THEME.colors.body,
              borderLeft: `5px solid ${RELIEF_COLOR}`,
              borderBottom: `5px solid ${RELIEF_COLOR}`,
              borderBottomLeftRadius: 4,
            }}
          />
          {/* Freccia invio */}
          <div style={{ color: RELIEF_COLOR, fontSize: 46, lineHeight: 1, marginTop: 8 }}>▶</div>
        </div>

        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 110,
            fontWeight: 900,
            color: RELIEF_COLOR,
            letterSpacing: '-3px',
            lineHeight: 0.92,
            textShadow: `0 0 38px ${RELIEF_COLOR}80`,
            transform: `scale(${p1Spring})`,
            textAlign: 'center',
          }}
        >
          MANDA
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 84,
            fontWeight: 900,
            color: THEME.colors.text,
            letterSpacing: '-2px',
            lineHeight: 1,
            transform: `scale(${p1Spring})`,
            textAlign: 'center',
          }}
        >
          IL FILE
        </div>
      </div>

      {/* ══════════════════════════════════
          FASE 2 — 48 ORE
      ══════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: p2Opacity,
          transform: `translateX(${p2X}px)`,
          gap: 18,
        }}
      >
        {/* Counter 48 + label ORE */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontSize: 152,
              fontWeight: 900,
              color: RELIEF_COLOR,
              lineHeight: 1,
              textShadow: `0 0 54px ${RELIEF_COLOR}90`,
              transform: `scale(${p2Spring})`,
              minWidth: 220,
              textAlign: 'right',
            }}
          >
            {hoursCount}
          </div>
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontSize: 90,
              fontWeight: 900,
              color: THEME.colors.text,
              lineHeight: 1,
            }}
          >
            ORE
          </div>
        </div>

        {/* Linea neon sottostante animata */}
        <div
          style={{
            width: underlineGrow,
            height: 6,
            backgroundColor: RELIEF_COLOR,
            boxShadow: `0 0 20px ${RELIEF_COLOR}`,
            borderRadius: 3,
          }}
        />

        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 46,
            fontWeight: 700,
            color: THEME.colors.muted,
            letterSpacing: '9px',
            marginTop: 10,
            textAlign: 'center',
          }}
        >
          CONSEGNA
        </div>
      </div>

      {/* ══════════════════════════════════
          FASE 3 — PRONTI
      ══════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: p3Opacity,
          transform: `translateX(${p3EnterX}px)`,
          gap: 30,
        }}
      >
        {/* Check circle */}
        <div
          style={{
            width: 172,
            height: 172,
            borderRadius: '50%',
            border: `6px solid ${RELIEF_COLOR}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${checkReveal}) scale(${p3Spring})`,
            boxShadow: `0 0 48px ${RELIEF_COLOR}65`,
            backgroundColor: `${RELIEF_COLOR}14`,
          }}
        >
          <div
            style={{
              color: RELIEF_COLOR,
              fontSize: 94,
              lineHeight: 1,
              textShadow: `0 0 26px ${RELIEF_COLOR}`,
            }}
          >
            ✓
          </div>
        </div>

        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 130,
            fontWeight: 900,
            color: RELIEF_COLOR,
            letterSpacing: '-4px',
            lineHeight: 0.92,
            textShadow: `0 0 48px ${RELIEF_COLOR}90`,
            transform: `scale(${p3Spring})`,
            textAlign: 'center',
          }}
        >
          PRONTI
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 46,
            fontWeight: 700,
            color: THEME.colors.text,
            letterSpacing: '5px',
            textAlign: 'center',
          }}
        >
          PER PUBBLICARE
        </div>
      </div>

      {/* ── Barra sottotitoli voiceover ── */}
      <div
        style={{
          position: 'absolute',
          bottom: (THEME.anchor?.height ?? 6) + 10,
          left: 36,
          right: 36,
          height: 40,
          opacity: subtitleOpacity,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: `1px solid ${RELIEF_COLOR}30`,
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            fontWeight: 400,
            color: RELIEF_COLOR,
            lineHeight: 1.3,
            textShadow: '0 2px 6px rgba(0,0,0,0.7)',
            textAlign: 'center',
          }}
        >
          Registri, mandi il file a noi, e in meno di 48 ore i tuoi contenuti sono pronti per essere pubblicati.
        </div>
      </div>

      {/* ── Ancora visiva — barra neon progress ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: THEME.anchor?.height ?? 6,
          backgroundColor: THEME.anchor?.color ?? RELIEF_COLOR,
          boxShadow: THEME.anchor?.glow ?? `0 0 14px ${RELIEF_COLOR}`,
          transformOrigin: 'left center',
          transform: `scaleX(${anchorScaleX})`,
        }}
      />
    </AbsoluteFill>
  );
};
