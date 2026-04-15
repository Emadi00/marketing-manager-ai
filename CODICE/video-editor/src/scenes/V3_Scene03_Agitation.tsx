// src/scenes/V3_Scene03_Agitation.tsx
// [00:07–00:13] AGITAZIONE — 180f | Emozione: Frustrazione / Identità bloccata
// Differenza V2: "INUTILIZZATI." full-frame con glitch RGB massimo +
//   counter di giorni che passano ("IERI. OGGI. DOMANI.") = pattern interrupt interno alla scena
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

export const V3_Scene03_Agitation: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// "INUTILIZZATI." — slam da centro, spring aggressiva
	const mainScale = spring({frame, fps, from: 0.2, to: 1, config: {damping: 6, stiffness: 380}});
	const mainOp = interpolate(frame, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	// Glitch RGB (frame 8–60): aberrazione cromatica su "INUTILIZZATI."
	const glitchActive = frame >= 8 && frame <= 65;
	const gf = glitchActive ? frame - 8 : 0;
	const glitchIntensity = glitchActive
		? interpolate(gf, [0, 12, 40, 57], [0, 1, 0.6, 0], {extrapolateRight: 'clamp'})
		: 0;
	const rgbShift = 7 * glitchIntensity;
	const shakeX = Math.sin(gf * 6.7) * 5 * glitchIntensity;
	const shakeY = Math.cos(gf * 4.3) * 3 * glitchIntensity;

	// Sfondo: diventa più rosso durante il glitch poi si oscura
	const redBg = interpolate(frame, [0, 30, 60, 90], [0, 0.1, 0.06, 0.02], {
		extrapolateRight: 'clamp',
	});

	// Counter: "IERI. / OGGI. / DOMANI." — entrano a turno come pattern interrupt interno
	// IERI appare a frame 70
	const ieriF = Math.max(0, frame - 70);
	const ieriScale = spring({frame: ieriF, fps, from: 0, to: 1, config: {damping: 8, stiffness: 280}});
	const ieriOp = interpolate(ieriF, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	// OGGI a frame 95
	const oggiF = Math.max(0, frame - 95);
	const oggiScale = spring({frame: oggiF, fps, from: 0, to: 1, config: {damping: 8, stiffness: 280}});
	const oggiOp = interpolate(oggiF, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	// DOMANI a frame 120
	const domaniF = Math.max(0, frame - 120);
	const domaniScale = spring({frame: domaniF, fps, from: 0, to: 1, config: {damping: 8, stiffness: 280}});
	const domaniOp = interpolate(domaniF, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	// "ANCORA LÌ." — climax finale, frame 148
	const ancoraF = Math.max(0, frame - 148);
	const ancoraScale = spring({frame: ancoraF, fps, from: 0, to: 1, config: {damping: 5, stiffness: 450}});
	const ancoraOp = interpolate(ancoraF, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
	// Pulse su "ANCORA LÌ." — cuore che batte
	const ancoraPulse = interpolate(
		Math.abs(Math.sin((Math.max(0, frame - 155) / 15) * Math.PI)),
		[0, 1],
		[1, 1.07],
	);

	// "INUTILIZZATI." torna piccolo e muted quando appare il counter
	const mainShrink = interpolate(frame, [65, 85], [1, 0.72], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const mainMuted = interpolate(frame, [65, 85], [1, 0.45], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

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
			{/* Overlay rosso dinamico */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(255,0,0,${redBg})`,
					pointerEvents: 'none',
				}}
			/>

			{/* Dot-particles in background */}
			{[0, 1, 2, 3, 4].map((i) => {
				const dotOp = interpolate(
					Math.sin((frame / 22 + i * 1.4) * Math.PI),
					[-1, 1],
					[0.04, 0.15],
				);
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							width: 5,
							height: 5,
							borderRadius: '50%',
							backgroundColor: '#FF4444',
							opacity: dotOp,
							left: `${12 + i * 19}%`,
							top: `${18 + (i % 3) * 22}%`,
						}}
					/>
				);
			})}

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 28,
					padding: '0 52px',
				}}
			>
				{/* "INUTILIZZATI." — protagonista */}
				<div style={{position: 'relative', height: 90}}>
					{/* Layer rosso RGB (aberrazione cromatica) */}
					{glitchIntensity > 0.05 && (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center',
								fontFamily: theme.font.hero,
								fontSize: 92,
								fontWeight: 900,
								color: 'rgba(255,0,60,0.45)',
								textAlign: 'center',
								textTransform: 'uppercase',
								lineHeight: 1,
								transform: `translate(${rgbShift}px, 0) scale(${mainScale * mainShrink})`,
								opacity: mainOp * mainMuted,
								mixBlendMode: 'screen',
								whiteSpace: 'nowrap',
							}}
						>
							inutilizzati.
						</div>
					)}
					{/* Layer ciano */}
					{glitchIntensity > 0.05 && (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center',
								fontFamily: theme.font.hero,
								fontSize: 92,
								fontWeight: 900,
								color: 'rgba(0,230,200,0.35)',
								textAlign: 'center',
								textTransform: 'uppercase',
								lineHeight: 1,
								transform: `translate(${-rgbShift}px, 0) scale(${mainScale * mainShrink})`,
								opacity: mainOp * mainMuted,
								mixBlendMode: 'screen',
								whiteSpace: 'nowrap',
							}}
						>
							inutilizzati.
						</div>
					)}
					{/* Testo principale */}
					<div
						style={{
							fontFamily: theme.font.hero,
							fontSize: 92,
							fontWeight: 900,
							color: theme.text.primary,
							textAlign: 'center',
							textTransform: 'uppercase',
							lineHeight: 1,
							transform: `scale(${mainScale * mainShrink}) translate(${shakeX}px, ${shakeY}px)`,
							opacity: mainOp * mainMuted,
							whiteSpace: 'nowrap',
						}}
					>
						inutilizzati.
					</div>
				</div>

				{/* Counter giorni: IERI → OGGI → DOMANI in fila */}
				<div
					style={{
						display: 'flex',
						flexDirection: 'row',
						alignItems: 'center',
						gap: 32,
					}}
				>
					{/* IERI */}
					<div
						style={{
							transform: `scale(${ieriScale})`,
							opacity: ieriOp,
							fontFamily: theme.font.hero,
							fontSize: 56,
							fontWeight: 900,
							color: 'rgba(200,60,60,0.75)',
							textTransform: 'uppercase',
							textShadow: '0 0 12px rgba(255,60,60,0.4)',
						}}
					>
						ieri.
					</div>

					{/* OGGI */}
					<div
						style={{
							transform: `scale(${oggiScale})`,
							opacity: oggiOp,
							fontFamily: theme.font.hero,
							fontSize: 56,
							fontWeight: 900,
							color: 'rgba(220,80,60,0.85)',
							textTransform: 'uppercase',
							textShadow: '0 0 12px rgba(255,60,60,0.45)',
						}}
					>
						oggi.
					</div>

					{/* DOMANI */}
					<div
						style={{
							transform: `scale(${domaniScale})`,
							opacity: domaniOp,
							fontFamily: theme.font.hero,
							fontSize: 56,
							fontWeight: 900,
							color: 'rgba(240,100,60,0.92)',
							textTransform: 'uppercase',
							textShadow: '0 0 14px rgba(255,80,60,0.5)',
						}}
					>
						domani.
					</div>
				</div>

				{/* "ANCORA LÌ." — climax, in accent verde come ironia amara */}
				<div
					style={{
						transform: `scale(${ancoraScale * ancoraPulse})`,
						opacity: ancoraOp,
						fontFamily: theme.font.hero,
						fontSize: 76,
						fontWeight: 900,
						color: theme.text.accent,
						textTransform: 'uppercase',
						textAlign: 'center',
						textShadow: `0 0 20px rgba(57,255,20,0.6), 0 0 40px rgba(57,255,20,0.25)`,
					}}
				>
					ancora lì.
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
