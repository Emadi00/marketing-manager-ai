// src/scenes/Scene03_Recognition.tsx
// [00:07–00:13] · 180 frames · RICONOSCIMENTO / SOLLIEVO PARZIALE
// Linea 1 → pausa drammatica → Linea 2 slam (cambio narrativo: colpa → causa esterna)
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron, alfenaPixel} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

export const Scene03_Recognition: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	// --- LINEA 1: "Il problema non sei tu." --- entrata frame 0
	const l1Scale = spring({frame, fps, from: 0, to: 1, config: {damping: 10, stiffness: 180}});
	const l1Op = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

	// --- PAUSA visiva frame 60-80: un cursore lampeggiante ---
	const cursorOp = interpolate(
		Math.sin((frame / 12) * Math.PI),
		[-1, 1],
		[0, 1],
	);
	const pauseVisible = frame >= 58 && frame < 95 ? cursorOp : 0;

	// --- LINEA 2: "È il montaggio che ti blocca." --- slam in a frame 90
	const f2 = Math.max(0, frame - 90);
	const l2Scale = spring({frame: f2, fps, from: 0, to: 1, config: {damping: 6, stiffness: 280}});
	const l2Op = interpolate(f2, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

	// "MONTAGGIO" — parola chiave — glow + dimensione maggiore
	const montaggioGlow = f2 > 8
		? `0 0 16px ${theme.text.accent}, 0 0 32px ${theme.text.accent}`
		: 'none';

	// Background: transizione da rosso-tensione a nero (sollievo)
	const bgR = Math.round(interpolate(frame, [0, 60], [20, 0], {extrapolateRight: 'clamp'}));

	// Exit
	const exitOp = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: `rgb(${bgR},0,0)`,
				justifyContent: 'center',
				alignItems: 'center',
				flexDirection: 'column',
				gap: 32,
				opacity: exitOp,
			}}
		>
			{/* Linea 1 */}
			<div
				style={{
					transform: `scale(${l1Scale})`,
					opacity: l1Op,
					fontFamily: orbitron,
					fontSize: 62,
					fontWeight: 900,
					color: theme.text.primary,
					textTransform: 'uppercase',
					textAlign: 'center',
					letterSpacing: 1,
					padding: '0 60px',
					lineHeight: 1.1,
				}}
			>
				Il problema{' '}
				<span style={{color: theme.text.secondary}}>non sei tu.</span>
			</div>

			{/* Cursore pausa — fa sentire il silenzio */}
			<div
				style={{
					opacity: pauseVisible,
					fontFamily: alfenaPixel,
					fontSize: 32,
					color: theme.text.accent,
					letterSpacing: 4,
					textTransform: 'uppercase',
				}}
			>
				_ _ _
			</div>

			{/* Linea 2 — slam aggressivo */}
			{frame >= 90 && (
				<div
					style={{
						transform: `scale(${l2Scale})`,
						opacity: l2Op,
						textAlign: 'center',
						padding: '0 56px',
						lineHeight: 1.1,
					}}
				>
					<span
						style={{
							fontFamily: orbitron,
							fontSize: 58,
							fontWeight: 900,
							color: theme.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: 1,
						}}
					>
						È il{' '}
					</span>
					<span
						style={{
							fontFamily: orbitron,
							fontSize: 68,
							fontWeight: 900,
							color: theme.text.accent,
							textTransform: 'uppercase',
							letterSpacing: 1,
							textShadow: montaggioGlow,
						}}
					>
						MONTAGGIO
					</span>
					<br />
					<span
						style={{
							fontFamily: orbitron,
							fontSize: 58,
							fontWeight: 900,
							color: theme.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: 1,
						}}
					>
						che ti blocca.
					</span>
				</div>
			)}

			<VisualAnchor />
		</AbsoluteFill>
	);
};
