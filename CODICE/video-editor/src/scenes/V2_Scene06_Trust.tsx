// src/scenes/V2_Scene06_Trust.tsx
// [00:27–00:35] FIDUCIA — 240f | Emozione: Sicurezza / Responsabilità
// Layout split: "TU" a sinistra → "NOI" a destra; pausa tra le due
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

export const V2_Scene06_Trust: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Sfondo: blu-scuro (fiducia, stabilità)
	// Fade in da solution (#050F0A) a secondary (#0D1B2A)
	const r = Math.round(interpolate(frame, [0, 60], [5, 13], {extrapolateRight: 'clamp'}));
	const g = Math.round(interpolate(frame, [0, 60], [15, 27], {extrapolateRight: 'clamp'}));
	const b = Math.round(interpolate(frame, [0, 60], [10, 42], {extrapolateRight: 'clamp'}));

	// --- BLOCCO "TU" ---
	// "Tu pensi" entra da sinistra
	const tuScale = spring({frame, fps, from: 0.7, to: 1, config: {damping: 16, stiffness: 100}});
	const tuOp = interpolate(frame, [0, 18], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});
	const tuX = spring({frame, fps, from: -80, to: 0, config: {damping: 18, stiffness: 100}});

	// "alle idee." — appare subito dopo TU
	const ideeFrame = Math.max(0, frame - 15);
	const ideeOp = interpolate(ideeFrame, [0, 15], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});

	// Divisore centrale — cresce verticalmente
	const dividerH = interpolate(frame, [30, 70], [0, 320], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// --- BLOCCO "NOI" (con pausa 0.5s = 15f dopo "TU") ---
	// "Noi pensiamo" entra da destra — frame 70 (~2.3s = la pausa nello script)
	const noiStartFrame = 68;
	const noiFrame = Math.max(0, frame - noiStartFrame);
	const noiScale = spring({frame: noiFrame, fps, from: 0.5, to: 1, config: {damping: 12, stiffness: 140}});
	const noiOp = interpolate(noiFrame, [0, 15], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});
	const noiX = spring({frame: noiFrame, fps, from: 80, to: 0, config: {damping: 12, stiffness: 140}});

	// "al resto." — glow verde, entra per ultimo
	const restoFrame = Math.max(0, frame - (noiStartFrame + 20));
	const restoScale = spring({frame: restoFrame, fps, from: 0, to: 1, config: {damping: 8, stiffness: 200}});
	const restoOp = interpolate(restoFrame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// Glow pulsante su "al resto."
	const restoPulse = interpolate(
		Math.sin((Math.max(0, frame - 100) / 22) * Math.PI * 2),
		[-1, 1],
		[0.8, 1],
	);

	// Linea orizzontale sotto "al resto."
	const underlineW = interpolate(
		Math.max(0, frame - (noiStartFrame + 30)),
		[0, 25],
		[0, 380],
		{easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp'},
	);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: `rgb(${r},${g},${b})`,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
				overflow: 'hidden',
			}}
		>
			{/* Vignetta */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background:
						'radial-gradient(ellipse 70% 90% at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)',
					pointerEvents: 'none',
				}}
			/>

			{/* Layout affiancato */}
			<div
				style={{
					display: 'flex',
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'center',
					width: '100%',
					gap: 0,
				}}
			>
				{/* Colonna SINISTRA — "TU" */}
				<div
					style={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: 12,
						transform: `translateX(${tuX}px)`,
						padding: '0 20px',
					}}
				>
					{/* "TU" — etichetta grande */}
					<div
						style={{
							transform: `scale(${tuScale})`,
							opacity: tuOp,
							fontFamily: theme.font.hero,
							fontSize: 96,
							fontWeight: 900,
							color: theme.text.secondary,
							textTransform: 'uppercase',
							textAlign: 'center',
							lineHeight: 1,
						}}
					>
						tu
					</div>
					<div
						style={{
							opacity: ideeOp,
							fontFamily: theme.font.hero,
							fontSize: 42,
							fontWeight: 700,
							color: theme.text.primary,
							textTransform: 'uppercase',
							textAlign: 'center',
							lineHeight: 1.2,
						}}
					>
						pensi alle
						<br />
						idee.
					</div>
				</div>

				{/* Divisore verticale */}
				<div
					style={{
						width: 2,
						height: dividerH,
						backgroundColor: 'rgba(255,255,255,0.15)',
						flexShrink: 0,
					}}
				/>

				{/* Colonna DESTRA — "NOI" */}
				<div
					style={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: 12,
						transform: `translateX(${noiX}px)`,
						padding: '0 20px',
					}}
				>
					{/* "NOI" — etichetta grande */}
					<div
						style={{
							transform: `scale(${noiScale})`,
							opacity: noiOp,
							fontFamily: theme.font.hero,
							fontSize: 96,
							fontWeight: 900,
							color: theme.text.accent,
							textTransform: 'uppercase',
							textAlign: 'center',
							lineHeight: 1,
							textShadow: theme.glow.greenText,
						}}
					>
						noi
					</div>

					{/* "pensiamo" */}
					<div
						style={{
							opacity: noiOp,
							fontFamily: theme.font.hero,
							fontSize: 42,
							fontWeight: 700,
							color: theme.text.primary,
							textTransform: 'uppercase',
							textAlign: 'center',
							lineHeight: 1.2,
						}}
					>
						pensiamo
					</div>

					{/* "al resto." con glow */}
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 8,
						}}
					>
						<div
							style={{
								transform: `scale(${restoScale * restoPulse})`,
								opacity: restoOp,
								fontFamily: theme.font.hero,
								fontSize: 52,
								fontWeight: 900,
								color: theme.text.accent,
								textTransform: 'uppercase',
								textAlign: 'center',
								lineHeight: 1,
								textShadow: `0 0 ${18 * restoPulse}px #39FF14, 0 0 ${36 * restoPulse}px rgba(57,255,20,0.4)`,
							}}
						>
							al resto.
						</div>
						{/* Underline verde */}
						<div
							style={{
								width: underlineW,
								height: 2,
								backgroundColor: theme.text.accent,
								boxShadow: theme.glow.greenSoft,
							}}
						/>
					</div>
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
