// src/components/VisualAnchor.tsx
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

/**
 * VisualAnchor — Elemento di continuità visiva presente in ogni scena.
 * Linea neon in basso con pulsazione lenta (glow che respira).
 */
export const VisualAnchor: React.FC = () => {
	const frame = useCurrentFrame();

	// Pulsazione lenta: periodo 60f (~2s)
	const glowOpacity = interpolate(
		Math.sin((frame / 60) * Math.PI * 2),
		[-1, 1],
		[0.55, 1],
	);

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{/* Linea accent verde neon in basso */}
			<div
				style={{
					position: 'absolute',
					bottom: 0,
					left: 0,
					right: 0,
					height: 3,
					backgroundColor: theme.text.accent,
					opacity: glowOpacity,
					boxShadow: theme.glow.green,
				}}
			/>
			{/* Brandmark angolo in basso a destra */}
			<div
				style={{
					position: 'absolute',
					bottom: 18,
					right: 36,
					fontFamily: theme.font.pixel,
					fontSize: 18,
					color: theme.text.accentDim,
					letterSpacing: 2,
					opacity: 0.55,
					textTransform: 'uppercase',
				}}
			>
				vc_studio
			</div>
		</AbsoluteFill>
	);
};
