// src/scenes/V2_Scene07_CTA.tsx
// [00:35–00:42] CTA — 210f | Emozione: Urgenza / Azione — PICCO
// "VIDEO" enorme pulsante; counter su "20 secondi"; massimo glow
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

export const V2_Scene07_CTA: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// "COMMENTA" — entra in slam
	const comentaScale = spring({frame, fps, from: 0, to: 1, config: {damping: 7, stiffness: 320}});
	const comentaOp = interpolate(frame, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	// "VIDEO" — il protagonista assoluto, entra a frame 15
	const videoFrame = Math.max(0, frame - 12);
	const videoScale = spring({frame: videoFrame, fps, from: 0, to: 1, config: {damping: 5, stiffness: 400}});
	const videoOp = interpolate(videoFrame, [0, 5], [0, 1], {extrapolateRight: 'clamp'});

	// "VIDEO" pulsa costantemente (breathing)
	const videoPulse = interpolate(
		Math.sin(((frame - 25) / 28) * Math.PI * 2),
		[-1, 1],
		[0.97, 1.04],
	);

	// "ADESSO" — entra a frame 35
	const adessoFrame = Math.max(0, frame - 33);
	const adessoScale = spring({frame: adessoFrame, fps, from: 0.3, to: 1, config: {damping: 8, stiffness: 260}});
	const adessoOp = interpolate(adessoFrame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
	// Flash su "ADESSO"
	const adessoFlash = frame >= 33 && frame <= 45
		? interpolate(frame, [33, 39, 45], [2, 1, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
		: 1;

	// Sottotitolo — "e ti spiego in [20] secondi come funziona."
	// Appare a frame 60
	const subFrame = Math.max(0, frame - 58);
	const subOp = interpolate(subFrame, [0, 20], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});
	const subY = spring({frame: subFrame, fps, from: 30, to: 0, config: {damping: 16, stiffness: 100}});

	// Counter "20" — conta da 0 a 20 in 30 frame (partendo da frame 65)
	const counterFrame = Math.max(0, frame - 63);
	const countValue = Math.floor(
		interpolate(counterFrame, [0, 28], [0, 20], {extrapolateRight: 'clamp'}),
	);

	// Glow sfondo pulsante
	const bgGlow = interpolate(
		Math.sin((frame / 20) * Math.PI),
		[-1, 1],
		[0, 0.06],
	);

	// Linee decorative ai lati di "VIDEO"
	const sideLineW = interpolate(
		Math.max(0, frame - 20),
		[0, 20],
		[0, 200],
		{easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp'},
	);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: '#000000',
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
				overflow: 'hidden',
			}}
		>
			{/* Sfondo glow pulse */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(57,255,20,${bgGlow})`,
				}}
			/>
			{/* Vignetta */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background:
						'radial-gradient(ellipse 65% 65% at 50% 42%, transparent 30%, rgba(0,0,0,0.85) 100%)',
					pointerEvents: 'none',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 8,
				}}
			>
				{/* "COMMENTA" */}
				<div
					style={{
						transform: `scale(${comentaScale})`,
						opacity: comentaOp,
						fontFamily: theme.font.hero,
						fontSize: 52,
						fontWeight: 700,
						color: theme.text.secondary,
						textTransform: 'uppercase',
						letterSpacing: 6,
					}}
				>
					commenta
				</div>

				{/* "VIDEO" — protagonista assoluto */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 16,
					}}
				>
					{/* Linea sinistra */}
					<div
						style={{
							width: sideLineW,
							height: 3,
							backgroundColor: theme.text.accent,
							boxShadow: theme.glow.green,
						}}
					/>

					<div
						style={{
							transform: `scale(${videoScale * videoPulse})`,
							opacity: videoOp,
							fontFamily: theme.font.hero,
							fontSize: 148,
							fontWeight: 900,
							color: theme.text.accent,
							textTransform: 'uppercase',
							lineHeight: 1,
							textShadow: `
								0 0 30px #39FF14,
								0 0 60px rgba(57,255,20,0.7),
								0 0 100px rgba(57,255,20,0.35),
								0 0 160px rgba(57,255,20,0.15)
							`,
							letterSpacing: '-2px',
						}}
					>
						VIDEO
					</div>

					{/* Linea destra */}
					<div
						style={{
							width: sideLineW,
							height: 3,
							backgroundColor: theme.text.accent,
							boxShadow: theme.glow.green,
						}}
					/>
				</div>

				{/* "ADESSO" */}
				<div
					style={{
						transform: `scale(${adessoScale * adessoFlash})`,
						opacity: adessoOp,
						fontFamily: theme.font.hero,
						fontSize: 68,
						fontWeight: 900,
						color: theme.text.primary,
						textTransform: 'uppercase',
						letterSpacing: 8,
						textShadow: theme.glow.white,
					}}
				>
					adesso
				</div>

				{/* Separatore */}
				<div
					style={{
						width: interpolate(subFrame, [0, 20], [0, 700], {extrapolateRight: 'clamp'}),
						height: 1,
						backgroundColor: 'rgba(255,255,255,0.2)',
						marginTop: 12,
						marginBottom: 4,
					}}
				/>

				{/* Sottotitolo con counter su "20" */}
				<div
					style={{
						transform: `translateY(${subY}px)`,
						opacity: subOp,
						display: 'flex',
						alignItems: 'baseline',
						flexWrap: 'wrap',
						justifyContent: 'center',
						gap: '0 0.25em',
						padding: '0 64px',
					}}
				>
					{['e', 'ti', 'spiego', 'in'].map((w, i) => (
						<span
							key={i}
							style={{
								fontFamily: theme.font.hero,
								fontSize: 38,
								fontWeight: 700,
								color: theme.text.secondary,
								textTransform: 'uppercase',
							}}
						>
							{w}
						</span>
					))}

					{/* Counter "20" */}
					<span
						style={{
							fontFamily: theme.font.hero,
							fontSize: 46,
							fontWeight: 900,
							color: theme.text.accent,
							textTransform: 'uppercase',
							textShadow: theme.glow.greenText,
							minWidth: '2ch',
							textAlign: 'center',
						}}
					>
						{countValue}
					</span>

					{['secondi', 'come', 'funziona.'].map((w, i) => (
						<span
							key={i}
							style={{
								fontFamily: theme.font.hero,
								fontSize: 38,
								fontWeight: 700,
								color: theme.text.secondary,
								textTransform: 'uppercase',
							}}
						>
							{w}
						</span>
					))}
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
