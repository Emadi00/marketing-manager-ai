// src/scenes/V2_Scene01_Hook.tsx
// [00:00–00:03] HOOK — 90f | Emozione: SHOCK / Urgenza
// Pattern interrupt: due righe che esplodono da fuori frame (top/bottom)
import React from 'react';
import {
	AbsoluteFill,
	Easing,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {VisualAnchor} from '../components/VisualAnchor';
import {theme} from '../theme';

export const V2_Scene01_Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	// Riga 1 — entra dall'alto, spring aggressiva
	const line1Y = spring({
		frame,
		fps,
		from: -220,
		to: 0,
		config: {damping: 7, stiffness: 280},
	});
	const line1Op = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

	// Riga 2 — entra dal basso, leggero ritardo
	const line2Y = spring({
		frame: Math.max(0, frame - 8),
		fps,
		from: 220,
		to: 0,
		config: {damping: 7, stiffness: 280},
	});
	const line2Op = interpolate(
		Math.max(0, frame - 8),
		[0, 6],
		[0, 1],
		{extrapolateRight: 'clamp'},
	);

	// Punto esclamativo: slam a parte, entra per ultimo
	const markScale = spring({
		frame: Math.max(0, frame - 18),
		fps,
		from: 0,
		to: 1,
		config: {damping: 5, stiffness: 400},
	});

	// Exit fade
	const exitOp = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Micro-pulse sfondo (respiro visivo)
	const bgPulse = interpolate(
		Math.sin((frame / 15) * Math.PI),
		[-1, 1],
		[0, 0.06],
	);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.tension,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
				overflow: 'hidden',
			}}
		>
			{/* Sfondo pulse rosso */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(255,30,0,${bgPulse})`,
				}}
			/>

			{/* Barra orizzontale decorativa */}
			<div
				style={{
					position: 'absolute',
					left: 60,
					right: 60,
					height: 2,
					backgroundColor: 'rgba(255,255,255,0.12)',
					top: '38%',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: 60,
					right: 60,
					height: 2,
					backgroundColor: 'rgba(255,255,255,0.12)',
					top: '62%',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 20,
				}}
			>
				{/* Riga 1 */}
				<div
					style={{
						transform: `translateY(${line1Y}px)`,
						opacity: line1Op,
						fontFamily: theme.font.hero,
						fontSize: 72,
						fontWeight: 900,
						color: theme.text.primary,
						textAlign: 'center',
						textTransform: 'uppercase',
						lineHeight: 1.05,
						padding: '0 56px',
						letterSpacing: '-1px',
					}}
				>
					Hai già girato
					<br />
					un sacco di video
				</div>

				{/* Divisore */}
				<div
					style={{
						width: interpolate(frame, [10, 30], [0, 600], {extrapolateRight: 'clamp'}),
						height: 3,
						backgroundColor: theme.text.accent,
						boxShadow: theme.glow.green,
					}}
				/>

				{/* Riga 2 */}
				<div
					style={{
						transform: `translateY(${line2Y}px)`,
						opacity: line2Op,
						fontFamily: theme.font.hero,
						fontSize: 58,
						fontWeight: 900,
						color: 'rgba(255,255,255,0.88)',
						textAlign: 'center',
						textTransform: 'uppercase',
						lineHeight: 1.1,
						padding: '0 56px',
						letterSpacing: '-0.5px',
					}}
				>
					ma non trovi mai
					<br />
					il tempo{' '}
					<span
						style={{
							color: theme.text.accent,
							textShadow: theme.glow.greenText,
							display: 'inline-block',
							transform: `scale(${markScale})`,
						}}
					>
						per montarli?
					</span>
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
