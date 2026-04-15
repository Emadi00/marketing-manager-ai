// src/scenes/Scene08_CTA.tsx
// [00:42–00:52] · 300 frames · CTA — fiducia + azione
// "Commenta ADESSO con la parola VIDEO" — massima energia, glow esplosivo
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron, alfenaPixel} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const SCENE_DURATION = 300;

export const Scene08_CTA: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	// "Commenta" — spring entry aggressiva
	const commentaScale = spring({
		frame,
		fps,
		from: 0,
		to: 1,
		config: {damping: 6, stiffness: 280, mass: 0.85},
	});
	const commentaOp = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// "ADESSO" — ancora più aggressiva, ritardata di 14f
	const adessoScale = spring({
		frame: frame - 14,
		fps,
		from: 0,
		to: 1,
		config: {damping: 5, stiffness: 360, mass: 0.7},
	});
	const adessoOp = interpolate(frame, [14, 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	// Pulsazione ADESSO (frame 45+)
	const adessoPulse = frame > 45 ? 1 + Math.sin((frame - 45) * 0.18) * 0.025 : 1;

	// "con la parola" — fade in (frame 52)
	const bridgeOp = interpolate(frame, [52, 68], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const bridgeY = interpolate(frame, [52, 70], [16, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Flash di sfondo al reveal di "VIDEO" (frame 82)
	const flashOp = interpolate(frame, [82, 90, 90, 112], [0, 0.18, 0.18, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// "VIDEO" — IL MONEY SHOT (frame 82)
	const videoScale = spring({
		frame: frame - 82,
		fps,
		from: 0,
		to: 1,
		config: {damping: 4, stiffness: 420, mass: 0.6},
	});
	const videoOp = interpolate(frame, [82, 94], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

	// Glow su VIDEO — esplode e poi pulsa in loop
	const videoGlow = interpolate(frame, [92, 140], [0, 42], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const videoGlowPulse = frame > 140
		? videoGlow + Math.sin((frame - 140) * 0.15) * 14
		: videoGlow;

	// Pulsazione scale finale su VIDEO (frame 210+, invita al click)
	const videoFinalPulse = frame > 210
		? 1 + Math.sin((frame - 210) * 0.11) * 0.04
		: 1;

	// Sottotitolo: "ti spiego in 20 secondi / esattamente come funziona." (frame 145)
	const sub1Op = interpolate(frame, [145, 165], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const sub1Y = interpolate(frame, [145, 168], [24, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.cta,
				justifyContent: 'center',
				alignItems: 'center',
			}}
		>
			{/* Griglia sfondo */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			{/* Flash verde al reveal VIDEO */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: theme.text.accent,
					opacity: flashOp,
					pointerEvents: 'none',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 14,
					padding: '0 56px',
					zIndex: 1,
				}}
			>
				{/* "Commenta" */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 50,
						fontWeight: 600,
						color: theme.text.muted,
						textTransform: 'uppercase',
						letterSpacing: '0.1em',
						opacity: commentaOp,
						transform: `scale(${commentaScale})`,
					}}
				>
					Commenta
				</div>

				{/* "ADESSO" */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 94,
						fontWeight: 900,
						color: theme.text.primary,
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
						lineHeight: 1,
						opacity: adessoOp,
						transform: `scale(${adessoScale * adessoPulse})`,
					}}
				>
					ADESSO
				</div>

				{/* "con la parola" */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 34,
						fontWeight: 400,
						color: theme.text.muted,
						textTransform: 'uppercase',
						letterSpacing: '0.16em',
						opacity: bridgeOp,
						transform: `translateY(${bridgeY}px)`,
						marginTop: 4,
					}}
				>
					con la parola
				</div>

				{/* "VIDEO" — MONEY SHOT */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 136,
						fontWeight: 900,
						color: theme.text.accent,
						textTransform: 'uppercase',
						letterSpacing: '0.05em',
						lineHeight: 1,
						textShadow: `
							0 0 ${videoGlowPulse}px ${theme.text.accent},
							0 0 ${videoGlowPulse * 2}px rgba(57,255,20,0.5),
							0 0 ${videoGlowPulse * 4}px rgba(57,255,20,0.18)
						`,
						opacity: videoOp,
						transform: `scale(${videoScale * videoFinalPulse})`,
						display: 'inline-block',
					}}
				>
					VIDEO
				</div>

				{/* Sottotitolo */}
				<div
					style={{
						fontFamily: alfenaPixel,
						fontSize: 28,
						color: theme.text.secondary,
						textAlign: 'center',
						letterSpacing: '0.06em',
						lineHeight: 1.6,
						opacity: sub1Op,
						transform: `translateY(${sub1Y}px)`,
						marginTop: 10,
					}}
				>
					ti spiego in 20 secondi{'\n'}
					esattamente come funziona.
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
