// src/scenes/V2_Scene04_Bridge.tsx
// [00:14–00:18] BRIDGE / TRANSIZIONE — 120f | Emozione: Curiosità / Apertura
// Brand reveal con glow — "CON VIDEOCRAFT STUDIO funziona così:"
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

export const V2_Scene04_Bridge: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Sfondo: transizione da tension (#140505) a solution (#050F0A)
	const r = Math.round(interpolate(frame, [0, 80], [20, 5], {extrapolateRight: 'clamp'}));
	const g = Math.round(interpolate(frame, [0, 80], [5, 15], {extrapolateRight: 'clamp'}));
	const b = Math.round(interpolate(frame, [0, 80], [5, 10], {extrapolateRight: 'clamp'}));
	const bgColor = `rgb(${r},${g},${b})`;

	// "Con" — fade in iniziale
	const conOp = interpolate(frame, [0, 15], [0, 0.7], {extrapolateRight: 'clamp'});
	const conY = spring({frame, fps, from: 30, to: 0, config: {damping: 16, stiffness: 100}});

	// "VideoCraft Studio" — slam con glow verde
	const brandFrame = Math.max(0, frame - 12);
	const brandScale = spring({frame: brandFrame, fps, from: 0, to: 1, config: {damping: 8, stiffness: 220}});
	const brandOp = interpolate(brandFrame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

	// Glow pulsante sul brand name
	const glowPulse = interpolate(
		Math.sin(((frame - 20) / 25) * Math.PI * 2),
		[-1, 1],
		[0.6, 1],
	);

	// "funziona così:" — slide up con ritardo
	const taglineFrame = Math.max(0, frame - 45);
	const taglineY = spring({frame: taglineFrame, fps, from: 60, to: 0, config: {damping: 14, stiffness: 130}});
	const taglineOp = interpolate(taglineFrame, [0, 12], [0, 1], {extrapolateRight: 'clamp'});

	// Linea decorativa che si espande sotto il brand
	const lineWidth = interpolate(frame, [20, 55], [0, 800], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: bgColor,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
				overflow: 'hidden',
			}}
		>
			{/* Vignetta */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background:
						'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
					pointerEvents: 'none',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 16,
				}}
			>
				{/* "Con" */}
				<div
					style={{
						transform: `translateY(${conY}px)`,
						opacity: conOp,
						fontFamily: theme.font.hero,
						fontSize: 44,
						fontWeight: 400,
						color: theme.text.secondary,
						textTransform: 'uppercase',
						letterSpacing: 6,
					}}
				>
					con
				</div>

				{/* "VideoCraft Studio" — brand name principale */}
				<div
					style={{
						transform: `scale(${brandScale})`,
						opacity: brandOp,
						fontFamily: theme.font.hero,
						fontSize: 88,
						fontWeight: 900,
						color: theme.text.accent,
						textTransform: 'uppercase',
						textAlign: 'center',
						lineHeight: 1,
						textShadow: `0 0 ${24 * glowPulse}px #39FF14, 0 0 ${50 * glowPulse}px rgba(57,255,20,0.4)`,
						letterSpacing: '-1px',
						padding: '0 40px',
					}}
				>
					VideoCraft
					<br />
					Studio
				</div>

				{/* Linea decorativa */}
				<div
					style={{
						width: lineWidth,
						height: 2,
						backgroundColor: theme.text.accent,
						boxShadow: theme.glow.greenSoft,
						maxWidth: 800,
					}}
				/>

				{/* "funziona così:" */}
				<div
					style={{
						transform: `translateY(${taglineY}px)`,
						opacity: taglineOp,
						fontFamily: theme.font.hero,
						fontSize: 50,
						fontWeight: 700,
						color: theme.text.primary,
						textTransform: 'uppercase',
						textAlign: 'center',
						letterSpacing: 2,
					}}
				>
					funziona così:
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
