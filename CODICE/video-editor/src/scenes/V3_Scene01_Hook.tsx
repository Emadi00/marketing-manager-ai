// src/scenes/V3_Scene01_Hook.tsx
// [00:00–00:03] HOOK — 90f | Emozione: SHOCK/URGENZA — PICCO
// Differenza V2: scanline sweep + esplosione centrale con flash rosso + "?" come elemento finale
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

export const V3_Scene01_Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	// Flash iniziale (0–8f): schermo si "accende" con flash rosso
	const flashOp = interpolate(frame, [0, 2, 8], [0.9, 0.5, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Scanline: linea orizzontale che scende dall'alto verso il basso (0–16f)
	const scanY = interpolate(frame, [0, 16], [0, 1920], {
		easing: Easing.out(Easing.quad),
		extrapolateRight: 'clamp',
	});
	const scanOp = interpolate(frame, [0, 1, 14, 16], [0, 0.7, 0.7, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Pulse sfondo rosso continuo
	const bgPulse = interpolate(
		Math.sin((frame / 16) * Math.PI),
		[-1, 1],
		[0, 0.07],
	);

	// Exit fade
	const exitOp = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// "HAI GIÀ GIRATO" — spring dal centro, aggressiva
	const line1Scale = spring({
		frame,
		fps,
		from: 0,
		to: 1,
		config: {damping: 7, stiffness: 300},
	});
	const line1Op = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

	// "UN SACCO DI VIDEO" — frame 12, entra da sotto
	const line2F = Math.max(0, frame - 12);
	const line2Y = spring({frame: line2F, fps, from: 60, to: 0, config: {damping: 10, stiffness: 220}});
	const line2Op = interpolate(line2F, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

	// Divisore neon — si espande frame 22
	const divW = interpolate(Math.max(0, frame - 22), [0, 18], [0, 740], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});

	// "MA NON TROVI MAI IL TEMPO" — frame 28
	const line3F = Math.max(0, frame - 28);
	const line3Op = interpolate(line3F, [0, 12], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});
	const line3Y = spring({frame: line3F, fps, from: 40, to: 0, config: {damping: 14, stiffness: 140}});

	// "per montarli?" — frame 45, con glow accent + overshooting scale
	const markF = Math.max(0, frame - 45);
	const markScale = spring({frame: markF, fps, from: 0, to: 1, config: {damping: 5, stiffness: 400}});
	const markOp = interpolate(markF, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

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
			{/* Flash iniziale rosso */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(255,40,0,${flashOp})`,
					pointerEvents: 'none',
				}}
			/>

			{/* Pulse sfondo continuo */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(200,20,0,${bgPulse})`,
					pointerEvents: 'none',
				}}
			/>

			{/* Scanline */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: scanY,
					height: 2,
					backgroundColor: 'rgba(255,180,180,0.8)',
					boxShadow: '0 0 12px rgba(255,100,100,0.9)',
					opacity: scanOp,
					pointerEvents: 'none',
				}}
			/>

			{/* Content */}
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 12,
				}}
			>
				{/* Riga 1 */}
				<div
					style={{
						transform: `scale(${line1Scale})`,
						opacity: line1Op,
						fontFamily: theme.font.hero,
						fontSize: 82,
						fontWeight: 900,
						color: theme.text.primary,
						textAlign: 'center',
						textTransform: 'uppercase',
						lineHeight: 1.0,
						padding: '0 52px',
						letterSpacing: '-1.5px',
					}}
				>
					Hai già girato
				</div>

				{/* Riga 2 */}
				<div
					style={{
						transform: `translateY(${line2Y}px)`,
						opacity: line2Op,
						fontFamily: theme.font.hero,
						fontSize: 72,
						fontWeight: 900,
						color: theme.text.secondary,
						textAlign: 'center',
						textTransform: 'uppercase',
						lineHeight: 1.05,
						padding: '0 52px',
						letterSpacing: '-0.5px',
					}}
				>
					un sacco di video
				</div>

				{/* Divisore neon */}
				<div
					style={{
						width: divW,
						height: 3,
						backgroundColor: theme.text.accent,
						boxShadow: theme.glow.green,
						margin: '4px 0',
						maxWidth: 740,
					}}
				/>

				{/* Riga 3 */}
				<div
					style={{
						transform: `translateY(${line3Y}px)`,
						opacity: line3Op,
						fontFamily: theme.font.hero,
						fontSize: 52,
						fontWeight: 700,
						color: theme.text.secondary,
						textAlign: 'center',
						textTransform: 'uppercase',
						lineHeight: 1.15,
						padding: '0 52px',
					}}
				>
					ma non trovi mai il tempo
				</div>

				{/* "per montarli?" — accent, ultimo */}
				<div
					style={{
						transform: `scale(${markScale})`,
						opacity: markOp,
						fontFamily: theme.font.hero,
						fontSize: 62,
						fontWeight: 900,
						color: theme.text.accent,
						textTransform: 'uppercase',
						textAlign: 'center',
						textShadow: theme.glow.greenText,
						letterSpacing: '-0.5px',
					}}
				>
					per montarli?
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
