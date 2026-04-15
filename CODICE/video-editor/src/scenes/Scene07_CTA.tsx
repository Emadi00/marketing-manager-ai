// src/scenes/Scene07_CTA.tsx
// [00:33–00:40] · 210 frames · CTA — URGENZA MASSIMA
// "VIDEO" pulsante — l'elemento più energico di tutto il video
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron, alfenaPixel} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

export const Scene07_CTA: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	// "Commenta" — slam in frame 0
	const commentaScale = spring({frame, fps, from: 0, to: 1, config: {damping: 7, stiffness: 280}});
	const commentaOp = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

	// "VIDEO" — esplosione frame 20, poi pulsazione continua
	const f2 = Math.max(0, frame - 20);
	const videoExplosion = spring({frame: f2, fps, from: 0, to: 1, config: {damping: 5, stiffness: 350}});

	// Pulsazione scale sul "VIDEO" — respira lentamente
	const videoPulse = 1 + 0.04 * Math.sin((frame / 18) * Math.PI);
	const videoScale = frame < 40 ? videoExplosion : videoPulse;

	// Glow "VIDEO" — intensità massima + pulsazione
	const videoGlowSize = 24 + 12 * Math.sin((frame / 18) * Math.PI);
	const videoGlow = `0 0 ${videoGlowSize}px ${theme.text.accent}, 0 0 ${videoGlowSize * 2}px ${theme.text.accent}, 0 0 ${videoGlowSize * 3}px rgba(57,255,20,0.3)`;
	const videoOp = interpolate(f2, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

	// "adesso" — slide in dal basso frame 50
	const f3 = Math.max(0, frame - 50);
	const adessoY = spring({frame: f3, fps, from: 60, to: 0, config: {damping: 12, stiffness: 160}});
	const adessoOp = interpolate(f3, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// Freccia/CTA secondaria — frame 90
	const f4 = Math.max(0, frame - 90);
	const ctaOp = interpolate(f4, [0, 20], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});

	// Flash di sfondo a frame 20 (quando VIDEO esplode)
	const flashOp = frame >= 20 && frame < 28
		? interpolate(frame - 20, [0, 4, 8], [0, 0.3, 0])
		: 0;

	// Contorno pulsante intorno a "VIDEO" — box glow
	const borderGlowSize = 6 + 4 * Math.sin((frame / 18) * Math.PI);

	// Exit — leggero fade per non tagliare secco
	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.cta,
				justifyContent: 'center',
				alignItems: 'center',
				flexDirection: 'column',
				gap: 8,
				opacity: exitOp,
			}}
		>
			{/* Grid sfondo energetico */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
					backgroundSize: '32px 32px',
				}}
			/>

			{/* Flash bianco quando VIDEO esplode */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: theme.text.accent,
					opacity: flashOp,
					pointerEvents: 'none',
				}}
			/>

			{/* "Commenta" */}
			<div
				style={{
					transform: `scale(${commentaScale})`,
					opacity: commentaOp,
					fontFamily: alfenaPixel,
					fontSize: 36,
					color: theme.text.secondary,
					textTransform: 'uppercase',
					letterSpacing: 8,
				}}
			>
				&gt; Commenta &lt;
			</div>

			{/* "VIDEO" — protagonista assoluto */}
			<div
				style={{
					transform: `scale(${videoScale})`,
					opacity: videoOp,
					fontFamily: orbitron,
					fontSize: 148,
					fontWeight: 900,
					color: theme.text.accent,
					textTransform: 'uppercase',
					letterSpacing: -4,
					textShadow: videoGlow,
					lineHeight: 0.9,
					padding: '12px 24px',
					border: `${borderGlowSize * 0.5}px solid rgba(57,255,20,0.25)`,
					boxShadow: `0 0 ${borderGlowSize * 4}px rgba(57,255,20,0.15)`,
				}}
			>
				VIDEO
			</div>

			{/* "adesso" */}
			<div
				style={{
					transform: `translateY(${adessoY}px)`,
					opacity: adessoOp,
					fontFamily: orbitron,
					fontSize: 56,
					fontWeight: 900,
					color: theme.text.primary,
					textTransform: 'uppercase',
					letterSpacing: 4,
				}}
			>
				adesso.
			</div>

			{/* Tagline secondaria */}
			{frame >= 90 && (
				<div
					style={{
						opacity: ctaOp,
						fontFamily: alfenaPixel,
						fontSize: 22,
						color: theme.text.muted,
						textTransform: 'uppercase',
						letterSpacing: 3,
						textAlign: 'center',
						marginTop: 16,
						padding: '0 80px',
					}}
				>
					ti spiego in 20 secondi come funziona
				</div>
			)}

			<VisualAnchor />
		</AbsoluteFill>
	);
};
