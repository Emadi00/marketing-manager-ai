// src/scenes/Scene02_Tension.tsx
// [00:03–00:07] · 120 frames · TENSIONE — accumulo del disagio
// Typewriter word-by-word + shake su "inutilizzati" per massimizzare il fastidio
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const SCENE_DURATION = 120;

export const Scene02_Tension: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	// BG: transizione da nero → rosso-tensione
	const bgR = Math.round(interpolate(frame, [0, 40], [0, 20], {extrapolateRight: 'clamp'}));
	const bgG = Math.round(interpolate(frame, [0, 40], [0, 5], {extrapolateRight: 'clamp'}));
	const bgB = Math.round(interpolate(frame, [0, 40], [0, 5], {extrapolateRight: 'clamp'}));

	// Helper: word entry con stagger
	const wordOpacity = (startF: number) =>
		interpolate(frame - startF, [0, 10], [0, 1], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
	const wordY = (startF: number) =>
		interpolate(frame - startF, [0, 14], [28, 0], {
			easing: Easing.out(Easing.quad),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

	// "ma non trovi mai" — line 1 (frame 0)
	const LINE1_WORDS = ['ma', 'non', 'trovi', 'mai'];
	// "il tempo per montarli?" — line 2 (frame 28)
	const LINE2_WORDS = ['il', 'tempo', 'per', 'montarli?'];
	// "Restano lì," — line 3 (frame 55)
	const line3Op = wordOpacity(55);
	const line3Y = wordY(55);
	// "nel telefono o nel computer," — line 4 (frame 72)
	const line4Op = wordOpacity(72);
	const line4Y = wordY(72);

	// "inutilizzati." — frame 88, shake 92-110
	const line5Op = wordOpacity(88);
	const shakeX =
		frame > 91 && frame < 112
			? interpolate((frame % 4), [0, 1, 2, 3], [-4, 4, -2, 2])
			: 0;

	// Exit
	const exitOp = interpolate(frame, [SCENE_DURATION - 8, SCENE_DURATION], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const baseText: React.CSSProperties = {
		fontFamily: orbitron,
		fontWeight: 900,
		textTransform: 'uppercase',
		textAlign: 'center',
		letterSpacing: 1,
	};

	return (
		<AbsoluteFill
			style={{
				backgroundColor: `rgb(${bgR},${bgG},${bgB})`,
				justifyContent: 'center',
				alignItems: 'center',
				flexDirection: 'column',
				gap: 12,
				opacity: exitOp,
			}}
		>
			{/* Griglia sfondo tensione */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(255,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,0,0.03) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			{/* Linee 1 e 2 — word-by-word */}
			<div style={{display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', padding: '0 60px'}}>
				{LINE1_WORDS.map((word, i) => (
					<span
						key={`l1-${i}`}
						style={{
							...baseText,
							fontSize: 62,
							color: theme.text.primary,
							opacity: wordOpacity(i * 6),
							transform: `translateY(${wordY(i * 6)}px)`,
							display: 'inline-block',
						}}
					>
						{word}
					</span>
				))}
			</div>

			<div style={{display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', padding: '0 60px'}}>
				{LINE2_WORDS.map((word, i) => (
					<span
						key={`l2-${i}`}
						style={{
							...baseText,
							fontSize: 62,
							color: theme.text.accent,
							textShadow: frame > 28 ? theme.glow.greenText : 'none',
							opacity: wordOpacity(28 + i * 6),
							transform: `translateY(${wordY(28 + i * 6)}px)`,
							display: 'inline-block',
						}}
					>
						{word}
					</span>
				))}
			</div>

			{/* Riga 3 */}
			<div
				style={{
					...baseText,
					fontSize: 44,
					color: theme.text.secondary,
					opacity: line3Op,
					transform: `translateY(${line3Y}px)`,
					marginTop: 16,
					padding: '0 60px',
				}}
			>
				Restano lì,
			</div>

			{/* Riga 4 */}
			<div
				style={{
					...baseText,
					fontSize: 38,
					color: theme.text.muted,
					opacity: line4Op,
					transform: `translateY(${line4Y}px)`,
					padding: '0 60px',
				}}
			>
				nel telefono o nel computer,
			</div>

			{/* Riga 5 — glitch */}
			<div
				style={{
					...baseText,
					fontSize: 70,
					color: '#FF3333',
					textShadow:
						frame > 91 && frame < 112
							? `${shakeX + 3}px 0 rgba(0,255,200,0.5), ${-shakeX}px 0 rgba(255,0,100,0.5), 0 0 20px rgba(255,50,50,0.7)`
							: 'none',
					opacity: line5Op,
					transform: `translateX(${shakeX}px)`,
					marginTop: 8,
				}}
			>
				inutilizzati.
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
