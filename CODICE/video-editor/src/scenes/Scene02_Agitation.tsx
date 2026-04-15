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

export const Scene02_Agitation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── GLOBAL FADE OUT — ultimi 8 frame ──────────────────────────────
  const globalOpacity = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── ELEMENT 1A — "TROPPI CONTENUTI" ──────────────────────────────
  // Modifiche cliente: prima animazione dura qualche secondo in più (0-80f ≈ 2.7s)
  const kw1Spring = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const kw1Y = interpolate(kw1Spring, [0, 1], [140, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const kw1Opacity = interpolate(frame, [0, 14, 68, 80], [0, 1, 1, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ── ELEMENT 1B — "ORE · GIORNI" impatto visivo ────────────────────
  const kw2Spring = spring({
    frame: Math.max(0, frame - 72),
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const kw2Scale = interpolate(kw2Spring, [0, 1], [0.75, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const kw2Opacity = interpolate(frame, [72, 84, 102, 115], [0, 1, 1, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ── ELEMENT 2 — COMPUTER CON FILE CHE PRENDONO LA POLVERE ────────
  // "restano lì nel computer, dimenticati" → frame 97-142
  const compOpacity = interpolate(frame, [97, 110, 135, 142], [0, 1, 1, 0.6], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Overlay polvere/invecchiamento — cresce nel tempo
  const dustAmount = interpolate(frame, [110, 142], [0, 0.5], {
    easing: Easing.in(Easing.quad),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Effetto sepia — simula invecchiamento/abbandono
  const sepiaVal = interpolate(frame, [110, 142], [0, 0.55], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Timbro "DIMENTICATI" sopra i file
  const forgSpring = spring({
    frame: Math.max(0, frame - 112),
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const forgScale = interpolate(forgSpring, [0, 1], [0.8, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const forgOpacity = interpolate(frame, [112, 124, 138, 142], [0, 1, 1, 0.5], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ── SOTTOTITOLI — 3 fasi ──────────────────────────────────────────
  const sub1Op = interpolate(frame, [0, 8, 52, 60], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const sub2Op = interpolate(frame, [60, 68, 92, 100], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const sub3Op = interpolate(frame, [100, 108, 138, 142], [0, 1, 1, 0.5], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ── PROGRESS BAR ──────────────────────────────────────────────────
  const scaleX = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // File che appaiono con stagger progressivo (rappresentano contenuti bloccati)
  const files = [
    { id: 'REEL_01',   delay: 102 },
    { id: 'STORIA_02', delay: 107 },
    { id: 'CLIP_03',   delay: 112 },
    { id: 'VIDEO_04',  delay: 117 },
    { id: 'REEL_05',   delay: 122 },
    { id: 'CLIP_06',   delay: 127 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.colors.body, opacity: globalOpacity }}>

      {/* ── ELEMENT 1A ── "TROPPI CONTENUTI" ─────────────────────────── */}
      {/* Estesa per ~2.7s come richiesto nelle modifiche obbligatorie    */}
      <div style={{
        position: 'absolute',
        top: '16%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: kw1Opacity,
        transform: `translateY(${kw1Y}px)`,
      }}>
        <span style={{
          fontFamily: THEME.fonts.main,
          fontSize: 124,
          fontWeight: 900,
          color: THEME.colors.text,
          lineHeight: 1,
          letterSpacing: -4,
          textAlign: 'center',
        }}>
          TROPPI
        </span>
        <span style={{
          fontFamily: THEME.fonts.main,
          fontSize: 82,
          fontWeight: 900,
          color: THEME.colors.accent,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
        }}>
          CONTENUTI
        </span>
      </div>

      {/* ── ELEMENT 1B ── "ORE · GIORNI" ─────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: kw2Opacity,
        transform: `scale(${kw2Scale})`,
      }}>
        <span style={{
          fontFamily: THEME.fonts.main,
          fontSize: 136,
          fontWeight: 900,
          color: THEME.colors.text,
          lineHeight: 1,
          letterSpacing: -5,
        }}>
          ORE
        </span>
        <span style={{
          fontFamily: THEME.fonts.main,
          fontSize: 42,
          fontWeight: 900,
          color: THEME.colors.muted,
          letterSpacing: 10,
          marginTop: -12,
        }}>
          MAGARI GIORNI
        </span>
      </div>

      {/* ── ELEMENT 2 ── COMPUTER CON FILE CHE PRENDONO LA POLVERE ───── */}
      {/* Narrativa: "restano lì nel computer, dimenticati"               */}
      <div style={{
        position: 'absolute',
        top: '18%',
        left: '5%',
        right: '5%',
        bottom: '20%',
        opacity: compOpacity,
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: 'rgba(4,8,16,0.8)',
        filter: `sepia(${sepiaVal}) brightness(${1 - sepiaVal * 0.28})`,
      }}>
        {/* Barra titolo finestra */}
        <div style={{
          height: 34,
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 14,
          paddingRight: 14,
          gap: 7,
        }}>
          {['rgba(255,80,80,0.45)', 'rgba(255,200,50,0.45)', 'rgba(80,220,80,0.45)'].map((c, i) => (
            <div key={i} style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              backgroundColor: c,
            }} />
          ))}
          <span style={{
            marginLeft: 'auto',
            fontFamily: THEME.fonts.main,
            fontSize: 10,
            color: 'rgba(255,255,255,0.2)',
            letterSpacing: 3,
          }}>
            VIDEO_ARCHIVIO
          </span>
        </div>

        {/* Griglia file — contenuti bloccati, non pubblicati */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          padding: '22px 18px',
          justifyContent: 'center',
        }}>
          {files.map(({ id, delay }) => {
            const lf = Math.max(0, frame - delay);
            const fs = spring({ frame: lf, fps, config: { damping: 14, stiffness: 120 } });
            const fScale = interpolate(fs, [0, 1], [0.5, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            // Ogni file appare e poi si "spegne" progressivamente (polvere)
            const fOpacity = interpolate(lf, [0, 10, 28, 44], [0, 1, 0.78, 0.3], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });

            return (
              <div key={id} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 7,
                opacity: fOpacity,
                transform: `scale(${fScale})`,
              }}>
                {/* Icona file video */}
                <div style={{
                  width: 68,
                  height: 82,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid rgba(255,255,255,0.14)',
                  borderRadius: 7,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {/* Angolo piegato del file */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 16,
                    height: 16,
                    background: 'linear-gradient(225deg, rgba(255,255,255,0.1) 50%, transparent 50%)',
                  }} />
                  {/* Play triangle — contenuto video */}
                  <div style={{
                    width: 0,
                    height: 0,
                    borderTop: '10px solid transparent',
                    borderBottom: '10px solid transparent',
                    borderLeft: `17px solid rgba(57,255,20,0.38)`,
                    marginLeft: 4,
                  }} />
                </div>
                <span style={{
                  fontFamily: THEME.fonts.main,
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.22)',
                  letterSpacing: 1,
                  textAlign: 'center',
                }}>
                  {id}
                </span>
              </div>
            );
          })}
        </div>

        {/* Overlay polvere/abbandono — cresce nel tempo */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `rgba(110,80,40,${dustAmount})`,
          pointerEvents: 'none',
        }} />

        {/* Timbro "DIMENTICATI" — appare sopra i file dimenticati */}
        <div style={{
          position: 'absolute',
          top: '52%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${forgScale})`,
          opacity: forgOpacity,
        }}>
          <span style={{
            fontFamily: THEME.fonts.main,
            fontSize: 64,
            fontWeight: 900,
            color: 'rgba(255,255,255,0.58)',
            letterSpacing: -1,
            textShadow: '0 0 40px rgba(255,255,255,0.12)',
            border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            padding: '8px 18px',
            display: 'block',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}>
            DIMENTICATI
          </span>
        </div>
      </div>

      {/* ── SUBTITLE BAR — 22px, bottom ──────────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 58,
        left: 40,
        right: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {[
          { text: 'Giri un sacco di contenuti, ma montarli ti prende ore.', op: sub1Op },
          { text: 'Magari giorni.', op: sub2Op },
          { text: 'E così restano lì nel computer. Dimenticati.', op: sub3Op },
        ].map(({ text, op }, i) => (
          <span key={i} style={{
            fontFamily: THEME.fonts.main,
            fontSize: 22,
            color: THEME.colors.muted,
            textAlign: 'center',
            position: 'absolute',
            opacity: op,
          }}>
            {text}
          </span>
        ))}
      </div>

      {/* ── ANCORA VISIVA — barra neon progress ──────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: THEME.anchor.height,
        backgroundColor: THEME.anchor.color,
        boxShadow: THEME.anchor.glow,
        transformOrigin: 'left center',
        transform: `scaleX(${scaleX})`,
      }} />
    </AbsoluteFill>
  );
};
