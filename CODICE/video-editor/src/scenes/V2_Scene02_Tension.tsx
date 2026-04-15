// src/scenes/V2_Scene02_Tension.tsx
// [00:03–00:08] TENSIONE — 150f | Emozione: Colpa silenziosa
// Typewriter word-by-word lento; "inutilizzati" vibra/glitcha
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

const WORDS = ['Restano', 'lì,', 'nel', 'telefono', 'o', 'nel', 'computer,'];
const ACCENT = 'inutilizzati.';
const WORD_DELAY = 10; // frames per parola

export const V2_Scene02_Tension: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Sfondo respira verso il grigio freddo
	const bgShift = interpolate(frame, [0, durationInFrames], [0, 0.04], {
		extrapolateRight: 'clamp',
	});

	// Vibrazione su "inutilizzati" — appare dopo tutte le parole normali
	const accentStartFrame = WORDS.length * WORD_DELAY + 8;
	const accentFrame = Math.max(0, frame - accentStartFrame);
	const accentVisible = frame > accentStartFrame;

	// La parola "inutilizzati" vibra con micro-shake
	const shakeX = accentVisible
		? Math.sin(accentFrame * 4.3) * interpolate(accentFrame, [0, 20, 40], [4, 2, 0.5], {extrapolateRight: 'clamp'})
		: 0;
	const shakeY = accentVisible
		? Math.cos(accentFrame * 3.1) * interpolate(accentFrame, [0, 20, 40], [3, 1.5, 0.3], {extrapolateRight: 'clamp'})
		: 0;

	const accentScale = spring({
		frame: accentFrame,
		fps,
		from: 0,
		to: 1,
		config: {damping: 8, stiffness: 220},
	});
	const accentOp = interpolate(accentFrame, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: '#090909',
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
				overflow: 'hidden',
			}}
		>
			{/* Overlay grigio freddo crescente */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(50,70,90,${bgShift})`,
				}}
			/>

			{/* Indicatore progresso — linea che cresce da sinistra */}
			<div
				style={{
					position: 'absolute',
					top: '30%',
					left: 80,
					width: interpolate(frame, [0, 100], [0, 920], {extrapolateRight: 'clamp'}),
					height: 1,
					backgroundColor: 'rgba(255,255,255,0.15)',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					justifyContent: 'center',
					alignItems: 'center',
					gap: '0 0.28em',
					padding: '0 64px',
					maxWidth: 960,
				}}
			>
				{WORDS.map((word, i) => {
					const wf = Math.max(0, frame - i * WORD_DELAY);
					const s = spring({frame: wf, fps, from: 0, to: 1, config: {damping: 12, stiffness: 180}});
					const op = interpolate(wf, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

					return (
						<span
							key={i}
							style={{
								display: 'inline-block',
								fontFamily: theme.font.hero,
								fontSize: 68,
								fontWeight: 900,
								textTransform: 'uppercase',
								color: theme.text.secondary,
								transform: `scale(${s})`,
								opacity: op,
								lineHeight: 1.2,
							}}
						>
							{word}
						</span>
					);
				})}

				{/* "inutilizzati." — parola chiave con glitch */}
				<span
					style={{
						display: 'inline-block',
						fontFamily: theme.font.hero,
						fontSize: 72,
						fontWeight: 900,
						textTransform: 'uppercase',
						color: 'rgba(200,60,60,0.92)',
						textShadow: '0 0 16px rgba(255,60,60,0.5)',
						transform: `scale(${accentScale}) translate(${shakeX}px, ${shakeY}px)`,
						opacity: accentOp,
						lineHeight: 1.2,
					}}
				>
					{ACCENT}
				</span>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
