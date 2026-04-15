// src/scenes/Scene07_Identity.tsx
// [00:35–00:42] · 210 frames · IDENTITÀ — urgenza: "Tu / Noi"
// Posizionamento identitario: lo spettatore è il creativo, noi siamo la macchina
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const SCENE_DURATION = 210;

export const Scene07_Identity: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	// "Tu pensa le idee," — da sinistra
	const line1X = interpolate(frame, [0, 22], [-140, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const line1Op = interpolate(frame, [0, 16], [0, 1], {
		extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
	});

	// "Tu" — spring aggressiva per enfasi
	const tuScale = spring({
		frame,
		fps,
		from: 0.5,
		to: 1,
		config: {damping: 7, stiffness: 240},
	});

	// Linea divisoria — si disegna da sinistra a destra (frame 25-55)
	const dividerW = interpolate(frame, [25, 55], [0, 100], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// "noi pensiamo al resto." — da destra (frame 40)
	const line2X = interpolate(frame, [40, 62], [140, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const line2Op = interpolate(frame, [40, 56], [0, 1], {
		extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
	});

	// "noi" diventa accent dopo l'entrata
	const noiColor = interpolate(frame, [62, 78], [0, 1], {
		extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
	});

	// Glow combinato — climax emotivo (frame 95+)
	const combinedGlow = frame > 95 ? 12 + Math.sin((frame - 95) * 0.1) * 6 : 0;

	// Exit
	const exitOp = interpolate(frame, [SCENE_DURATION - 8, SCENE_DURATION], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.solution,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
			}}
		>
			{/* Griglia verde */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 10,
					padding: '0 60px',
				}}
			>
				{/* Line 1: "Tu pensa le idee," */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 60,
						fontWeight: 900,
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
						textAlign: 'center',
						opacity: line1Op,
						transform: `translateX(${line1X}px)`,
						lineHeight: 1.2,
					}}
				>
					<span
						style={{
							color: theme.text.accent,
							textShadow: combinedGlow > 0 ? `0 0 ${combinedGlow}px ${theme.text.accent}` : 'none',
							display: 'inline-block',
							transform: `scale(${tuScale})`,
						}}
					>
						Tu
					</span>{' '}
					<span style={{color: theme.text.primary}}>pensa le idee,</span>
				</div>

				{/* Divisore */}
				<div
					style={{
						height: 2,
						width: `${dividerW}%`,
						backgroundColor: theme.text.accent,
						boxShadow: `0 0 8px ${theme.text.accent}`,
						borderRadius: 2,
						margin: '6px 0',
					}}
				/>

				{/* Line 2: "noi pensiamo al resto." */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 60,
						fontWeight: 900,
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
						textAlign: 'center',
						opacity: line2Op,
						transform: `translateX(${line2X}px)`,
						lineHeight: 1.2,
					}}
				>
					<span
						style={{
							color: `rgba(57,255,20,${noiColor})`,
							textShadow:
								noiColor > 0.5 && combinedGlow > 0
									? `0 0 ${combinedGlow}px ${theme.text.accent}`
									: 'none',
						}}
					>
						noi
					</span>{' '}
					<span style={{color: theme.text.secondary}}>pensiamo al resto.</span>
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
