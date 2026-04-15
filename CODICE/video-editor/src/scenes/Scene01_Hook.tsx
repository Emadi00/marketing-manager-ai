// src/scenes/Scene01_Hook.tsx
// [00:00–00:03] · 90 frames · HOOK · Urgenza/colpa
// Pattern interrupt aggressivo — testo esplode dal centro con overshooting
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

export const Scene01_Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	// Esplosione aggressiva dal centro — overshooting intenzionale
	const scale = spring({
		frame,
		fps,
		from: 0,
		to: 1,
		config: {damping: 6, stiffness: 300},
	});

	// Opacity istantanea: i primi frame DEVONO essere visibili
	const opacity = interpolate(frame, [0, 4], [0, 1], {extrapolateRight: 'clamp'});

	// Exit fade — ultimi 8 frame
	const exitOpacity = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Glow pulsante sulla parola chiave
	const glowPulse = interpolate(
		Math.sin((frame / 15) * Math.PI),
		[-1, 1],
		[0.7, 1],
	);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.primary,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: Math.min(opacity, exitOpacity),
			}}
		>
			{/* Griglia pixel di sfondo — texture cyberpunk */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			{/* Testo principale */}
			<div
				style={{
					transform: `scale(${scale})`,
					textAlign: 'center',
					padding: '0 64px',
				}}
			>
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 72,
						fontWeight: 900,
						color: theme.text.primary,
						textTransform: 'uppercase',
						lineHeight: 1.1,
						letterSpacing: 2,
					}}
				>
					Hai già girato
				</div>
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 72,
						fontWeight: 900,
						textTransform: 'uppercase',
						lineHeight: 1.1,
						letterSpacing: 2,
						color: theme.text.accent,
						textShadow: `0 0 ${20 * glowPulse}px #39FF14, 0 0 ${40 * glowPulse}px #39FF14`,
					}}
				>
					un sacco di video.
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
