import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { THEME } from '../theme';

export const Scene05_Urgency: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Fade out ultimi 8 frame — nessuno stacco secco ─────────────────────────
  const sceneOpacity = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Spring CTA — damping:8, stiffness:220 (urgency aggressiva) ──────────────
  const ctaSpring = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 220 },
  });

  // ── Pulse loop infinito ogni 30 frame ───────────────────────────────────────
  // Funzione: "COMMENTA" è l'elemento più energico del video
  const pulse = interpolate(frame % 30, [0, 15, 30], [1, 1.05, 1]);

  // Glow del testo CTA sincronizzato al pulse
  const glowPx = interpolate(frame % 30, [0, 15, 30], [24, 52, 24]);

  // Scala combinata: entrata spring × pulse loop continuo
  const mainScale = ctaSpring * pulse;

  // ── ELEMENTO NARRATIVO 1: testo CTA "COMMENTA" con scale/glow ──────────────
  // Funzione narrativa: cattura attenzione, invito all'azione urgente
  // Entrata spring aggressiva → poi pulse loop infinito per tenere l'attenzione

  // ── ELEMENTO NARRATIVO 2: barra countdown "IN 20 SECONDI" ─────────────────
  // Funzione narrativa: visualizza la promessa esplicita del voiceover
  // ("ti spiego tutto in 20 secondi") — urgenza percepita, si svuota durante la scena
  const countdownProgress = interpolate(
    frame,
    [0, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Label "IN 20 SEC" — slide dal basso con delay
  const labelY = interpolate(frame, [8, 28], [40, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const labelOpacity = interpolate(frame, [8, 28], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Fade-in sottotitoli voiceover ───────────────────────────────────────────
  const subtitleOpacity = interpolate(frame, [0, 14], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Ancora visiva — progress bar neon bottom ────────────────────────────────
  const anchorScaleX = interpolate(
    frame,
    [0, durationInFrames],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.cta,
        opacity: sceneOpacity,
        fontFamily: THEME.fonts.main,
        overflow: 'hidden',
      }}
    >
      {/* ── ELEMENTO 1: Testo CTA principale — COMMENTA ORA ────────────────────
          Max 2 parole chiave estratte dal voiceover: "COMMENTA" + "ORA".
          Spring aggressiva all'entrata, poi pulse loop infinito.
          Funzione: cattura occhio, invita all'azione — è l'elemento più energico. */}
      <div
        style={{
          position: 'absolute',
          top: '28%',
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${mainScale})`,
        }}
      >
        <div
          style={{
            fontSize: 128,
            fontWeight: 900,
            color: THEME.colors.accent,
            textAlign: 'center',
            letterSpacing: '-3px',
            lineHeight: 1,
            textShadow: [
              `0 0 ${glowPx}px ${THEME.colors.accent}`,
              `0 0 ${glowPx * 2}px ${THEME.colors.accent}`,
              `0 0 ${glowPx * 3}px ${THEME.colors.accentSoft}`,
            ].join(', '),
          }}
        >
          COMMENTA
        </div>

        <div
          style={{
            fontSize: 96,
            fontWeight: 900,
            color: THEME.colors.text,
            textAlign: 'center',
            letterSpacing: '8px',
            lineHeight: 1.15,
            marginTop: 8,
            textShadow: `0 0 24px rgba(255,255,255,0.55)`,
          }}
        >
          ORA
        </div>
      </div>

      {/* ── ELEMENTO 2: Barra countdown "IN 20 SECONDI" ────────────────────────
          Funzione narrativa: la barra si svuota mentre la scena procede,
          rendendo visibile la promessa di velocità del voiceover.
          Zero decorazione — è prova sociale della rapidità del servizio. */}
      <div
        style={{
          position: 'absolute',
          top: '63%',
          left: '10%',
          right: '10%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          transform: `translateY(${labelY}px)`,
          opacity: labelOpacity,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: THEME.colors.muted,
            fontFamily: THEME.fonts.main,
            letterSpacing: '5px',
            textTransform: 'uppercase' as const,
          }}
        >
          IN 20 SECONDI
        </div>

        {/* Track della barra countdown */}
        <div
          style={{
            width: '100%',
            height: 8,
            backgroundColor: 'rgba(255,255,255,0.10)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {/* Fill che si svuota da sinistra a destra */}
          <div
            style={{
              width: `${countdownProgress * 100}%`,
              height: '100%',
              backgroundColor: THEME.colors.accent,
              boxShadow: `0 0 14px ${THEME.colors.accent}, 0 0 28px ${THEME.colors.accentSoft}`,
              borderRadius: 4,
            }}
          />
        </div>
      </div>

      {/* ── Barra sottotitoli — voiceover testuale subordinato ─────────────────
          Font 22px, height 40px, bottom — non compete con gli elementi grafici. */}
      <div
        style={{
          position: 'absolute',
          bottom: 58,
          left: 0,
          right: 0,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.58)',
          opacity: subtitleOpacity,
          paddingLeft: 32,
          paddingRight: 32,
        }}
      >
        <span
          style={{
            fontSize: 22,
            color: THEME.colors.text,
            fontFamily: THEME.fonts.main,
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          Tu pensa alle idee. Noi pensiamo al resto.
        </span>
      </div>

      {/* ── Watermark bottom-right — opacity 0.4 ───────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 112,
          right: 24,
          fontSize: 17,
          fontFamily: THEME.fonts.main,
          color: THEME.colors.text,
          opacity: 0.4,
          letterSpacing: '1px',
          pointerEvents: 'none',
        }}
      >
        VideoCraft Studio
      </div>

      {/* ── Ancora visiva — progress bar neon bottom ────────────────────────── */}
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
