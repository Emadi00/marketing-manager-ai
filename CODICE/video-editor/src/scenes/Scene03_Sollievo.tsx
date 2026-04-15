// Segmento [2]: "Con videograph studio, registrici, mandi file e noi facciamo tutto il resto." [7.5s - 11.76s]

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
import { secondsToFrame, segmentToFrameRange, wordToFrame } from '../utils/syncTimeline';

export const Scene03_Sollievo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Scene absolute offset in full video (after Scene01 + Scene02) ─────────
  // Corrisponde a 7.0s di inizio nel video completo
  const SCENE_START_SEC = 7.0;
  const sceneStartFrame = secondsToFrame(SCENE_START_SEC, fps); // 210 @ 30fps

  // ── Whisper segment 2 [7.5s – 11.76s] ─────────────────────────────────────
  const seg2 = { start: 7.5, end: 11.76 };

  // Keyword words estratti dalla timeline Whisper
  const wVideograph = { start: 7.6,  end: 8.08  };
  const wMandi      = { start: 9.82, end: 9.96  };
  const wNoi        = { start: 10.46, end: 10.54 };

  // ── Frame locali (relativi all'inizio scena) ───────────────────────────────
  const fVideograph = wordToFrame(wVideograph, fps) - sceneStartFrame; // ≈ 18
  const fMandi      = wordToFrame(wMandi, fps)      - sceneStartFrame; // ≈ 85
  const fNoi        = wordToFrame(wNoi, fps)        - sceneStartFrame; // ≈ 104

  // ── PHASE 1: VIDEOGRAPH STUDIO — brand reveal (frame ~18 → ~73) ───────────
  const phase1Spring = spring({
    frame: Math.max(0, frame - fVideograph),
    fps,
    config: THEME.springs.standard, // damping:12 stiffness:150
  });
  const phase1Opacity = interpolate(
    frame,
    [fVideograph, fVideograph + 8],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const phase1Exit = interpolate(
    frame,
    [fMandi - 12, fMandi - 2],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const phase1Y = interpolate(phase1Spring, [0, 1], [70, 0]);

  // ── PHASE 2: MANDI I FILE — azione utente (frame ~85 → ~98) ──────────────
  const phase2Spring = spring({
    frame: Math.max(0, frame - fMandi),
    fps,
    config: THEME.springs.standard,
  });
  const phase2Opacity = interpolate(
    frame,
    [fMandi, fMandi + 7],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const phase2Exit = interpolate(
    frame,
    [fNoi - 6, fNoi],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const phase2Y = interpolate(phase2Spring, [0, 1], [55, 0]);

  // ── PHASE 3: NOI FACCIAMO TUTTO — value proposition (frame ~104 → fine) ───
  const phase3Spring = spring({
    frame: Math.max(0, frame - fNoi),
    fps,
    config: THEME.springs.standard,
  });
  const phase3Opacity = interpolate(
    frame,
    [fNoi, fNoi + 7],
    [0, 1],
    {
      easing: Easing.out(Easing.sin),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  const phase3Y = interpolate(phase3Spring, [0, 1], [55, 0]);

  // ── Glow pulse lento — ciclo 59fr (~2s) ───────────────────────────────────
  const glowPulse = interpolate(frame % 59, [0, 29, 58], [0.55, 1.0, 0.55], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Subtitle sync — segmento 2 ────────────────────────────────────────────
  const { from: subAbsFrom, durationInFrames: subDur } = segmentToFrameRange(seg2, fps);
  const subLocalFrom = Math.max(0, subAbsFrom - sceneStartFrame); // ≈ 15
  const subTextOpacity = interpolate(
    frame,
    [subLocalFrom, subLocalFrom + 10],
    [0, 1],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  const subScaleX = interpolate(
    frame,
    [subLocalFrom, subLocalFrom + subDur],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Anchor progress bar ───────────────────────────────────────────────────
  const anchorScaleX = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // ── Fade out — ultimi 8 frame ─────────────────────────────────────────────
  const globalOpacity = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity: globalOpacity }}>

      {/* ── Sfondo base ──────────────────────────────────────────────────── */}
      <AbsoluteFill style={{ backgroundColor: THEME.colors.bg }} />

      {/* ── Gradiente radiale verde dal basso (DNA invariante) ───────────── */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 55% at 50% 105%,
            rgba(0,128,0,${(0.32 * glowPulse).toFixed(3)}) 0%,
            rgba(0,68,0,${(0.16 * glowPulse).toFixed(3)}) 45%,
            transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* ── Vignette nera agli angoli (sempre attiva) ──────────────────── */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 48%, rgba(0,0,0,0.76) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
          PHASE 1 — VIDEOGRAPH STUDIO
          Narrativa: brand reveal — sollievo che esiste una soluzione precisa
          frame ~18 → ~73 | spring slide-up-gentle
      ════════════════════════════════════════════════════════════════════ */}
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: phase1Opacity * phase1Exit,
          transform: `translateY(${phase1Y}px)`,
          pointerEvents: 'none',
        }}
      >
        {/* Card con bordo neon verde — elemento visivo identitario DNA */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '44px 72px',
            borderRadius: '14px',
            border: `2px solid ${THEME.colors.muted}`,
            boxShadow: `0 0 18px ${THEME.colors.muted}, 0 0 42px rgba(0,255,0,0.18)`,
          }}
        >
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontSize: '86px',
              fontWeight: THEME.fonts.weightBlack,
              color: THEME.colors.accent,
              letterSpacing: '0.06em',
              textAlign: 'center',
              lineHeight: 1.0,
              textShadow: `0 0 22px ${THEME.colors.accent}, 0 0 44px rgba(0,170,255,0.3)`,
            }}
          >
            VIDEOGRAPH
          </div>
          <div
            style={{
              fontFamily: THEME.fonts.main,
              fontSize: '54px',
              fontWeight: THEME.fonts.weightBlack,
              color: THEME.colors.text,
              letterSpacing: '0.22em',
              textAlign: 'center',
              lineHeight: 1.15,
              marginTop: '4px',
            }}
          >
            STUDIO
          </div>
        </div>
      </AbsoluteFill>

      {/* ════════════════════════════════════════════════════════════════════
          PHASE 2 — MANDI I FILE
          Narrativa: azione minima richiesta all'utente → relief action
          frame ~85 → ~98 | spring slide-up
      ════════════════════════════════════════════════════════════════════ */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: phase2Opacity * phase2Exit,
          transform: `translateY(${phase2Y}px)`,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '108px',
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.text,
            letterSpacing: '0.04em',
            textAlign: 'center',
            lineHeight: 0.92,
          }}
        >
          MANDI
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '108px',
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.accent2,
            letterSpacing: '0.04em',
            textAlign: 'center',
            lineHeight: 0.92,
            textShadow: `0 0 22px ${THEME.colors.accent2}, 0 0 44px rgba(255,184,0,0.32)`,
          }}
        >
          I FILE
        </div>
      </AbsoluteFill>

      {/* ════════════════════════════════════════════════════════════════════
          PHASE 3 — NOI FACCIAMO TUTTO
          Narrativa: il peso del montaggio scompare — massimo sollievo
          frame ~104 → fine | spring slide-up + glow verde
      ════════════════════════════════════════════════════════════════════ */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: phase3Opacity,
          transform: `translateY(${phase3Y}px)`,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '88px',
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.text,
            letterSpacing: '0.05em',
            textAlign: 'center',
            lineHeight: 0.92,
          }}
        >
          NOI
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '88px',
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.muted,
            letterSpacing: '0.05em',
            textAlign: 'center',
            lineHeight: 0.92,
            textShadow: `0 0 26px ${THEME.colors.muted}, 0 0 52px rgba(0,255,0,0.28)`,
          }}
        >
          FACCIAMO
        </div>
        <div
          style={{
            fontFamily: THEME.fonts.main,
            fontSize: '88px',
            fontWeight: THEME.fonts.weightBlack,
            color: THEME.colors.muted,
            letterSpacing: '0.05em',
            textAlign: 'center',
            lineHeight: 0.92,
            textShadow: `0 0 26px ${THEME.colors.muted}, 0 0 52px rgba(0,255,0,0.28)`,
          }}
        >
          TUTTO
        </div>
      </AbsoluteFill>

      {/* ── Barra sottotitoli (voiceover subordinato) ─────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: '90px',
          left: '56px',
          right: '56px',
        }}
      >
        <div
          style={{
            fontFamily: THEME.fonts.accent,
            fontSize: THEME.fonts.sizeBody,
            color: THEME.colors.text,
            textAlign: 'center',
            lineHeight: 1.35,
            opacity: subTextOpacity * 0.7,
            marginBottom: '8px',
          }}
        >
          Con Videograph Studio mandi i file e noi facciamo tutto il resto.
        </div>
        {/* Linea neon di progresso sync audio */}
        <div
          style={{
            height: '2px',
            background: `linear-gradient(90deg, ${THEME.colors.accent} 0%, ${THEME.colors.muted} 100%)`,
            filter: 'blur(1px)',
            boxShadow: `0 0 6px ${THEME.colors.accent}`,
            transformOrigin: 'left center',
            transform: `scaleX(${subScaleX})`,
          }}
        />
      </div>

      {/* ── Ancora visiva — progress bar neon 120f ────────────────────────── */}
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
