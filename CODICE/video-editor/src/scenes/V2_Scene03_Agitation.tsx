// src/scenes/V2_Scene03_Agitation.tsx
// [00:08–00:14] AGITAZIONE — 180f | Emozione: Paura di essere superato
// Glitch su "qualcun altro pubblica" — sfondo tensione rosso
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

export const V2_Scene03_Agitation: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Riga 1: "Mentre tu aspetti," — entra da sinistra
	const line1X = spring({frame, fps, from: -300, to: 0, config: {damping: 14, stiffness: 120}});
	const line1Op = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// Riga 2: "qualcun altro pubblica." — slam dal centro con ritardo
	const line2Frame = Math.max(0, frame - 30);
	const line2Scale = spring({frame: line2Frame, fps, from: 0.4, to: 1, config: {damping: 6, stiffness: 350}});
	const line2Op = interpolate(line2Frame, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	// Glitch su riga 2 (frame 35-70)
	const glitchActive = frame >= 35 && frame <= 75;
	const gf = glitchActive ? frame - 35 : 0;
	const glitchIntensity = glitchActive
		? interpolate(gf, [0, 10, 30, 40], [1, 0.8, 0.4, 0], {extrapolateRight: 'clamp'})
		: 0;
	const glitchX = Math.sin(gf * 7.3) * 6 * glitchIntensity;
	const glitchY = Math.cos(gf * 5.1) * 3 * glitchIntensity;
	// Simula aberrazione cromatica (pseudo-RGB split)
	const rgbShift = 4 * glitchIntensity;

	// Riga 3: "Ogni giorno." — entra con pulse, ritardo maggiore
	const line3Frame = Math.max(0, frame - 70);
	const line3Scale = spring({
		frame: line3Frame,
		fps,
		from: 0,
		to: 1,
		config: {damping: 6, stiffness: 300},
	});
	const line3Op = interpolate(line3Frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

	// Pulse su "Ogni giorno." — batte come un cuore
	const pulse = interpolate(
		Math.abs(Math.sin((Math.max(0, frame - 80) / 18) * Math.PI)),
		[0, 1],
		[1, 1.06],
	);

	// Sfondo — diventa più rosso man mano
	const redIntensity = interpolate(frame, [0, 90], [0, 0.08], {extrapolateRight: 'clamp'});

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
			{/* Overlay rosso crescente */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(255,0,0,${redIntensity})`,
				}}
			/>

			{/* Particelle-dot in background */}
			{[0, 1, 2, 3, 4].map((i) => {
				const dotOp = interpolate(
					Math.sin((frame / 20 + i * 1.3) * Math.PI),
					[-1, 1],
					[0.05, 0.18],
				);
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							width: 6,
							height: 6,
							borderRadius: '50%',
							backgroundColor: '#FF3333',
							opacity: dotOp,
							left: `${15 + i * 17}%`,
							top: `${20 + (i % 3) * 20}%`,
						}}
					/>
				);
			})}

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 24,
					padding: '0 56px',
				}}
			>
				{/* Riga 1 */}
				<div
					style={{
						transform: `translateX(${line1X}px)`,
						opacity: line1Op,
						fontFamily: theme.font.hero,
						fontSize: 54,
						fontWeight: 900,
						color: theme.text.secondary,
						textAlign: 'center',
						textTransform: 'uppercase',
						lineHeight: 1.1,
					}}
				>
					Mentre tu aspetti,
				</div>

				{/* Riga 2 con glitch */}
				<div style={{position: 'relative'}}>
					{/* Pseudo-aberrazione cromatica: layer rosso sfasato */}
					{glitchIntensity > 0.1 && (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								fontFamily: theme.font.hero,
								fontSize: 82,
								fontWeight: 900,
								color: 'rgba(255,0,60,0.5)',
								textAlign: 'center',
								textTransform: 'uppercase',
								lineHeight: 1,
								transform: `translate(${rgbShift}px, 0px) scale(${line2Scale})`,
								opacity: line2Op,
								mixBlendMode: 'screen',
								whiteSpace: 'nowrap',
							}}
						>
							qualcun altro pubblica.
						</div>
					)}
					{/* Layer ciano sfasato */}
					{glitchIntensity > 0.1 && (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								fontFamily: theme.font.hero,
								fontSize: 82,
								fontWeight: 900,
								color: 'rgba(0,255,220,0.4)',
								textAlign: 'center',
								textTransform: 'uppercase',
								lineHeight: 1,
								transform: `translate(${-rgbShift}px, 0px) scale(${line2Scale})`,
								opacity: line2Op,
								mixBlendMode: 'screen',
								whiteSpace: 'nowrap',
							}}
						>
							qualcun altro pubblica.
						</div>
					)}
					{/* Testo principale */}
					<div
						style={{
							transform: `scale(${line2Scale}) translate(${glitchX}px, ${glitchY}px)`,
							opacity: line2Op,
							fontFamily: theme.font.hero,
							fontSize: 82,
							fontWeight: 900,
							color: theme.text.primary,
							textAlign: 'center',
							textTransform: 'uppercase',
							lineHeight: 1,
							whiteSpace: 'nowrap',
						}}
					>
						qualcun altro pubblica.
					</div>
				</div>

				{/* Riga 3 — "Ogni giorno." */}
				<div
					style={{
						transform: `scale(${line3Scale * pulse})`,
						opacity: line3Op,
						fontFamily: theme.font.hero,
						fontSize: 68,
						fontWeight: 900,
						color: theme.text.accent,
						textShadow: theme.glow.greenText,
						textAlign: 'center',
						textTransform: 'uppercase',
						lineHeight: 1.1,
					}}
				>
					Ogni giorno.
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
