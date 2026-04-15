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

// Scene05_Trust — 00:30-00:45 — 450 frame — emozione: trust slow
// Voiceover: "Non più video dimenticati. Non più tempo perso in montaggio.
//             Solo contenuti pronti quando ti servono."

const DURATION = 450;

export const Scene05_Trust: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Fade out globale — ultimi 8 frame ─────────────────────────────────
  const globalOpacity = interpolate(
    frame,
    [DURATION - 8, DURATION],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ══════════════════════════════════════════════════════════════════════
  // FASE 1 (0–140): "NIENTE PIÙ" — entra dall'alto, spring soft
  // ══════════════════════════════════════════════════════════════════════
  const phase1Op = interpolate(
    frame,
    [0, 14, 118, 140],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const phase1Slide = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120 },
    from: -100,
    to: 0,
  });

  // ══════════════════════════════════════════════════════════════════════
  // FASE 2 (150–295): "ZERO MONTAGGIO" — entra dall'alto, ritardata
  // ══════════════════════════════════════════════════════════════════════
  const phase2Op = interpolate(
    frame,
    [150, 164, 273, 295],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const phase2Slide = spring({
    frame: Math.max(0, frame - 150),
    fps,
    config: { damping: 18, stiffness: 120 },
    from: -100,
    to: 0,
  });

  // ══════════════════════════════════════════════════════════════════════
  // FASE 3 (305–442): "SOLO RISULTATI" — rimane fino al fade out
  // ══════════════════════════════════════════════════════════════════════
  const phase3Op = interpolate(
    frame,
    [305, 320, 438, 442],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const phase3Slide = spring({
    frame: Math.max(0, frame - 305),
    fps,
    config: { damping: 18, stiffness: 120 },
    from: -100,
    to: 0,
  });

  // ══════════════════════════════════════════════════════════════════════
  // GRAFICO 1 — Linee di cornice: si espandono dal centro verso i bordi
  // Ruolo: delimitano la zona testo, creano "sigillo" visivo di fiducia.
  // Appaiono una volta e restano per tutta la scena.
  // ══════════════════════════════════════════════════════════════════════
  const frameLineScale = interpolate(
    frame,
    [8, 42],
    [0, 1],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // GRAFICO 2 — Cerchio checkmark (solo fase 3)
  // Ruolo: simbolo di "consegnato / risolto" — rinforza il trust.
  // NON è decorativo: appare solo quando il messaggio parla di risultati.
  // ══════════════════════════════════════════════════════════════════════
  const checkScale = interpolate(
    frame,
    [320, 375],
    [0, 1],
    {
      easing: Easing.out(Easing.back(2.2)),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  const checkOp = interpolate(
    frame,
    [320, 335],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Pulse loop — "RISULTATI" e checkmark respirano insieme ───────────
  const pulse = interpolate(frame % 30, [0, 15, 30], [1, 1.05, 1]);

  // ── Glow respiro lento sui titoli ────────────────────────────────────
  const glowBreath = interpolate(frame % 80, [0, 40, 80], [0.65, 1.0, 0.65]);

  // ── Ancora visiva — progress bar neon 0→DURATION ─────────────────────
  const anchorScaleX = interpolate(
    frame,
    [0, DURATION],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Sottotitolo — voiceover verbale, cambia per fase ─────────────────
  const subtitle =
    frame < 150
      ? 'Non più video dimenticati. Non più tempo perso in montaggio.'
      : frame < 305
      ? 'Solo contenuti pronti quando ti servono.'
      : 'Registri, mandi il file, noi facciamo tutto il resto.';

  const subtitleOp = interpolate(
    frame,
    [8, 28],
    [0, 1],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: THEME.colors.body,
        opacity: globalOpacity,
        overflow: 'hidden',
      }}
    >
      {/* ── GRAFICO 1: Linea superiore cornice ──────────────────────────── */}
      {/* Si espande dal centro, incornicia la zona titolo — ruolo visivo: "sigillo" */}
      <div
        style={{
          position: 'absolute',
          top: 660,
          left: '50%',
          width: 760,
          height: 3,
          backgroundColor: THEME.colors.accent,
          boxShadow: `0 0 16px 3px ${THEME.colors.accent}`,
          transformOrigin: 'center center',
          transform: `translateX(-50%) scaleX(${frameLineScale})`,
        }}
      />

      {/* ── GRAFICO 1: Linea inferiore cornice ──────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 1120,
          left: '50%',
          width: 760,
          height: 3,
          backgroundColor: THEME.colors.accentSoft,
          boxShadow: `0 0 16px 3px ${THEME.colors.accentSoft}`,
          transformOrigin: 'center center',
          transform: `translateX(-50%) scaleX(${frameLineScale})`,
        }}
      />

      {/* ══ FASE 1: NIENTE PIÙ ════════════════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          top: 680,
          left: 0,
          right: 0,
          opacity: phase1Op,
          transform: `translateY(${phase1Slide}px)`,
          textAlign: 'center',
          padding: '0 56px',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 118,
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.text,
            letterSpacing: '-3px',
            lineHeight: 1.05,
          }}
        >
          NIENTE
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 134,
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.accent,
            letterSpacing: '-3px',
            lineHeight: 1.05,
            textShadow: `0 0 ${44 * glowBreath}px ${THEME.colors.accent}`,
          }}
        >
          PIÙ
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 46,
            fontWeight: THEME.fonts.weightBold,
            color: THEME.colors.muted,
            letterSpacing: '6px',
            marginTop: 16,
            textTransform: 'uppercase' as const,
          }}
        >
          VIDEO PERSI
        </div>
      </div>

      {/* ══ FASE 2: ZERO MONTAGGIO ════════════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          top: 680,
          left: 0,
          right: 0,
          opacity: phase2Op,
          transform: `translateY(${phase2Slide}px)`,
          textAlign: 'center',
          padding: '0 56px',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 118,
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.text,
            letterSpacing: '-3px',
            lineHeight: 1.05,
          }}
        >
          ZERO
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 88,
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.accent,
            letterSpacing: '-1px',
            lineHeight: 1.05,
            textShadow: `0 0 ${44 * glowBreath}px ${THEME.colors.accent}`,
          }}
        >
          MONTAGGIO
        </div>
      </div>

      {/* ══ FASE 3: SOLO RISULTATI + checkmark ═══════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          top: 680,
          left: 0,
          right: 0,
          opacity: phase3Op,
          transform: `translateY(${phase3Slide}px)`,
          textAlign: 'center',
          padding: '0 56px',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 102,
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.text,
            letterSpacing: '-2px',
            lineHeight: 1.05,
          }}
        >
          SOLO
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 102,
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.accent,
            letterSpacing: '-2px',
            lineHeight: 1.05,
            textShadow: `0 0 ${52 * glowBreath}px ${THEME.colors.accent}`,
            display: 'inline-block',
            transform: `scale(${pulse})`,
          }}
        >
          RISULTATI
        </div>

        {/* GRAFICO 2: cerchio checkmark — simbolo "consegnato" */}
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            justifyContent: 'center',
            opacity: checkOp,
            transform: `scale(${checkScale * pulse})`,
          }}
        >
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: '50%',
              border: `4px solid ${THEME.colors.accent}`,
              boxShadow: `0 0 30px ${THEME.colors.accent}, 0 0 60px ${THEME.colors.accent}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${THEME.colors.accent}18`,
            }}
          >
            <span
              style={{
                fontFamily: THEME.fonts.accent,
                fontSize: 62,
                color: THEME.colors.accent,
                lineHeight: 1,
              }}
            >
              ✓
            </span>
          </div>
        </div>
      </div>

      {/* ── WATERMARK "VideoCraft Studio" ───────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 118,
          right: 40,
          opacity: 0.4,
          transform: `scale(${pulse})`,
          transformOrigin: 'right bottom',
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 20,
            fontWeight: THEME.fonts.weightBold,
            color: THEME.colors.text,
            letterSpacing: '1px',
          }}
        >
          VideoCraft Studio
        </span>
      </div>

      {/* ── BARRA SOTTOTITOLI (voiceover verbale 22px) ──────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 56,
          left: 0,
          right: 0,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: THEME.subtitles.background,
          opacity: subtitleOp,
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        <span
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            fontWeight: THEME.fonts.weightRegular,
            color: THEME.colors.muted,
            textAlign: 'center' as const,
            letterSpacing: '0.3px',
          }}
        >
          {subtitle}
        </span>
      </div>

      {/* ── ANCORA VISIVA — progress bar neon bottom ────────────────────── */}
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
