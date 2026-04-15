// src/scenes/Scene03_BrandReveal.tsx
// [00:07–00:13] · 180 frames · BRAND REVEAL — curiosità → sollievo anticipato
// "Con VideoCraft Studio" — il nome del brand esplode con neon glow
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron, alfenaPixel} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const SCENE_DURATION = 180;

export const Scene03_BrandReveal: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	// BG: transizione da tensione-rossa → navy-soluzione
	const bgR = Math.round(interpolate(frame, [0, 60], [20, 13], {easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
	const bgG = Math.round(interpolate(frame, [0, 60], [5, 27], {easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
	const bgB = Math.round(interpolate(frame, [0, 60], [5, 42], {easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));

	// "Con" — fade in morbido, piccolo e muted (suspense)
	const conOp = interpolate(frame, [5, 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const conY = interpolate(frame, [5, 22], [20, 0], {easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

	// "VideoCraft" — spring esplosiva (il momento payoff)
	const vcScale = spring({
		frame: frame - 50,
		fps,
		from: 0,
		to: 1,
		config: {damping: 7, stiffness: 240, mass: 0.85},
	});
	const vcOp = interpolate(frame, [50, 65], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

	// "Studio" — pixel font, entra dall'alto (frame 95)
	const stOp = interpolate(frame, [95, 112], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const stY = interpolate(frame, [95, 115], [-30, 0], {
		easing: Easing.out(Easing.back(1.8)),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Glow: si espande dopo il reveal e poi pulsa
	const glowBase = interpolate(frame, [65, 120], [0, 28], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const glowPulse = frame > 120 ? glowBase + Math.sin((frame - 120) * 0.11) * 9 : glowBase;

	// Scansione orizzontale sul brand name (frame 105-140)
	const scanX = interpolate(frame, [105, 140], [-1100, 1100], {
		easing: Easing.inOut(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const scanOp = interpolate(frame, [105, 112, 135, 140], [0, 0.6, 0.6, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Exit
	const exitOp = interpolate(frame, [SCENE_DURATION - 8, SCENE_DURATION], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: `rgb(${bgR},${bgG},${bgB})`,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
			}}
		>
			{/* Griglia pixel sfondo */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
				{/* "Con" */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 38,
						fontWeight: 400,
						color: theme.text.muted,
						textTransform: 'uppercase',
						letterSpacing: '0.18em',
						opacity: conOp,
						transform: `translateY(${conY}px)`,
					}}
				>
					Con
				</div>

				{/* "VideoCraft" */}
				<div
					style={{
						position: 'relative',
						fontFamily: orbitron,
						fontSize: 84,
						fontWeight: 900,
						color: theme.text.accent,
						textTransform: 'uppercase',
						letterSpacing: '0.03em',
						lineHeight: 1,
						textShadow: `0 0 ${glowPulse}px ${theme.text.accent}, 0 0 ${glowPulse * 2}px rgba(57,255,20,0.35)`,
						transform: `scale(${vcScale})`,
						opacity: vcOp,
						overflow: 'hidden',
					}}
				>
					VideoCraft
					{/* Scansione laser */}
					<div
						style={{
							position: 'absolute',
							top: 0,
							bottom: 0,
							left: scanX,
							width: 3,
							backgroundColor: '#fff',
							opacity: scanOp,
							boxShadow: '0 0 12px #fff',
						}}
					/>
				</div>

				{/* "Studio" — pixel font */}
				<div
					style={{
						fontFamily: alfenaPixel,
						fontSize: 46,
						fontWeight: 400,
						color: theme.text.secondary,
						letterSpacing: '0.28em',
						textTransform: 'uppercase',
						opacity: stOp,
						transform: `translateY(${stY}px)`,
					}}
				>
					STUDIO
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
