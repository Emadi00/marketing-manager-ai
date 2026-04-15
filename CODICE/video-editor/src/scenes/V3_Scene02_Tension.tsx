// src/scenes/V3_Scene02_Tension.tsx
// [00:03–00:07] TENSIONE — 120f | Emozione: Colpa silenziosa / Rassegnazione
// Differenza V2: 3 righe brevi slam in da destra una alla volta (impatto > typewriter)
// "RESTANO LÌ." / "NEL TELEFONO." / "NEL COMPUTER." + "inutilizzati." in rosso
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

// Riga impact singola che entra da destra
interface ImpactLineProps {
	text: string;
	startFrame: number;
	fontSize: number;
	color: string;
	glow?: string;
}

const ImpactLine: React.FC<ImpactLineProps> = ({text, startFrame, fontSize, color, glow}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const f = Math.max(0, frame - startFrame);

	const x = spring({frame: f, fps, from: 400, to: 0, config: {damping: 11, stiffness: 200}});
	const op = interpolate(f, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

	return (
		<div
			style={{
				transform: `translateX(${x}px)`,
				opacity: op,
				fontFamily: theme.font.hero,
				fontSize,
				fontWeight: 900,
				color,
				textTransform: 'uppercase',
				lineHeight: 1.1,
				padding: '0 64px',
				textShadow: glow,
			}}
		>
			{text}
		</div>
	);
};

export const V3_Scene02_Tension: React.FC = () => {
	const frame = useCurrentFrame();
	const {durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Sfondo respira verso grigio freddo
	const bgShift = interpolate(frame, [0, durationInFrames], [0, 0.05], {
		extrapolateRight: 'clamp',
	});

	// Linea verticale a sinistra che cresce lentamente
	const lineH = interpolate(frame, [0, 80], [0, 260], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});

	// "inutilizzati." — appare per ultima, vibra
	const accentStart = 78;
	const accentF = Math.max(0, frame - accentStart);
	const accentScale = spring({
		frame: accentF,
		fps: 30,
		from: 0,
		to: 1,
		config: {damping: 7, stiffness: 250},
	});
	const accentOp = interpolate(accentF, [0, 5], [0, 1], {extrapolateRight: 'clamp'});
	// Vibrazione che si smorza
	const shakeX =
		accentF < 35
			? Math.sin(accentF * 5.1) *
			  interpolate(accentF, [0, 30], [5, 0], {extrapolateRight: 'clamp'})
			: 0;

	return (
		<AbsoluteFill
			style={{
				backgroundColor: '#090909',
				justifyContent: 'center',
				alignItems: 'flex-start',
				opacity: exitOp,
				overflow: 'hidden',
			}}
		>
			{/* Overlay grigio-blu crescente */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(40,60,80,${bgShift})`,
					pointerEvents: 'none',
				}}
			/>

			{/* Accent line verticale sinistra */}
			<div
				style={{
					position: 'absolute',
					left: 46,
					top: '50%',
					transform: 'translateY(-50%)',
					width: 3,
					height: lineH,
					backgroundColor: 'rgba(255,255,255,0.12)',
				}}
			/>

			{/* Contenuto centrato verticalmente */}
			<div
				style={{
					position: 'absolute',
					top: '50%',
					left: 0,
					right: 0,
					transform: 'translateY(-50%)',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-start',
					gap: 14,
				}}
			>
				<ImpactLine
					text="Restano lì,"
					startFrame={0}
					fontSize={72}
					color={theme.text.secondary}
				/>

				<ImpactLine
					text="nel telefono"
					startFrame={22}
					fontSize={66}
					color={theme.text.secondary}
				/>

				<ImpactLine
					text="o nel computer,"
					startFrame={44}
					fontSize={66}
					color={theme.text.secondary}
				/>

				{/* "inutilizzati." — parola chiave in rosso, con vibrazione */}
				<div
					style={{
						transform: `scale(${accentScale}) translateX(${shakeX}px)`,
						opacity: accentOp,
						transformOrigin: 'left center',
						fontFamily: theme.font.hero,
						fontSize: 78,
						fontWeight: 900,
						color: 'rgba(210,55,55,0.95)',
						textTransform: 'uppercase',
						lineHeight: 1.1,
						padding: '0 64px',
						textShadow: '0 0 18px rgba(255,60,60,0.55)',
					}}
				>
					inutilizzati.
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
