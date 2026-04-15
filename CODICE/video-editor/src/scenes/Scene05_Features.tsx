// src/scenes/Scene05_Features.tsx
// [00:20–00:27] · 210 frames · FEATURES — fiducia: "tutto incluso"
// Checklist animata con checkmark spring + glow collettivo finale
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const SCENE_DURATION = 210;

const FEATURES = [
	{label: 'Tagli', startFrame: 18},
	{label: 'Sottotitoli', startFrame: 52},
	{label: 'Musica', startFrame: 86},
	{label: 'Effetti', startFrame: 120},
];

export const Scene05_Features: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	// Header
	const headerOp = interpolate(frame, [0, 14], [0, 1], {extrapolateRight: 'clamp'});

	// Glow globale dopo che tutte le voci sono visibili (frame 145+)
	const globalGlow = interpolate(frame, [148, 172], [0, 1], {
		easing: Easing.out(Easing.cubic),
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
				backgroundColor: theme.bg.secondary,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
			}}
		>
			{/* Griglia */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.025) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-start',
					gap: 24,
					padding: '0 80px',
					width: '100%',
				}}
			>
				{/* Header */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 30,
						fontWeight: 600,
						color: theme.text.muted,
						textTransform: 'uppercase',
						letterSpacing: '0.14em',
						opacity: headerOp,
						alignSelf: 'center',
						marginBottom: 8,
					}}
				>
					Tutto incluso:
				</div>

				{/* Feature items */}
				{FEATURES.map((feat, i) => {
					const sf = frame - feat.startFrame;

					const itemOp = interpolate(sf, [0, 14], [0, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					});
					const itemX = interpolate(sf, [0, 18], [-100, 0], {
						easing: Easing.out(Easing.back(1.4)),
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					});

					// Check spring — scatta fuori quando compare
					const checkScale = spring({
						frame: sf - 4,
						fps,
						from: 0,
						to: 1,
						config: {damping: 7, stiffness: 260},
					});

					return (
						<div
							key={i}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 22,
								opacity: itemOp,
								transform: `translateX(${itemX}px)`,
							}}
						>
							{/* Checkmark circle */}
							<div
								style={{
									width: 46,
									height: 46,
									borderRadius: '50%',
									backgroundColor: theme.text.accent,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									transform: `scale(${checkScale})`,
									boxShadow:
										globalGlow > 0
											? `0 0 ${22 * globalGlow}px ${theme.text.accent}`
											: 'none',
									flexShrink: 0,
								}}
							>
								<span
									style={{
										color: '#000',
										fontSize: 24,
										fontWeight: 900,
										fontFamily: orbitron,
										lineHeight: 1,
									}}
								>
									✓
								</span>
							</div>

							{/* Label */}
							<span
								style={{
									fontFamily: orbitron,
									fontSize: 58,
									fontWeight: 900,
									color: theme.text.primary,
									textTransform: 'uppercase',
									letterSpacing: '0.04em',
									textShadow:
										globalGlow > 0
											? `0 0 ${16 * globalGlow}px rgba(57,255,20,0.45)`
											: 'none',
								}}
							>
								{feat.label}
							</span>
						</div>
					);
				})}
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
