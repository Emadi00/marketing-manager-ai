// src/scenes/Scene06_Desire.tsx
// [00:25–00:33] · 240 frames · DESIDERIO / VISUALIZZAZIONE
// Lo spettatore si vede già con i contenuti pronti — tono caldo e confidenziale
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron, alfenaPixel} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

export const Scene06_Desire: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	// Riga 1 — "Tu registri le idee che hai in testa." — frame 0
	const f1 = frame;
	const r1X = spring({frame: f1, fps, from: -300, to: 0, config: {damping: 13, stiffness: 140}});
	const r1Op = interpolate(f1, [0, 12], [0, 1], {extrapolateRight: 'clamp'});

	// Riga 2 — "Noi le trasformiamo in video" — frame 70
	const f2 = Math.max(0, frame - 70);
	const r2X = spring({frame: f2, fps, from: 300, to: 0, config: {damping: 13, stiffness: 140}});
	const r2Op = interpolate(f2, [0, 12], [0, 1], {extrapolateRight: 'clamp'});

	// Riga 3 — "che la gente non riesce a smettere di guardare." — frame 140, glow crescente
	const f3 = Math.max(0, frame - 140);
	const r3Scale = spring({frame: f3, fps, from: 0.8, to: 1, config: {damping: 12, stiffness: 160}});
	const r3Op = interpolate(f3, [0, 16], [0, 1], {extrapolateRight: 'clamp'});
	const r3Glow = f3 > 20
		? `0 0 ${12 + 8 * Math.sin((f3 / 25) * Math.PI)}px ${theme.text.accent}`
		: 'none';

	// Pattern interrupt a metà scena (frame 100-120): linea divisoria luminosa
	const dividerScale = interpolate(
		frame,
		[100, 116],
		[0, 1],
		{easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);
	const dividerOp = frame >= 100 && frame < 200 ? dividerScale : frame >= 200 ? 1 : 0;

	// Background leggermente più caldo
	const bgB = Math.round(interpolate(frame, [0, 60], [0, 18], {extrapolateRight: 'clamp'}));

	// Exit
	const exitOp = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	const baseText: React.CSSProperties = {
		fontFamily: orbitron,
		fontWeight: 900,
		textTransform: 'uppercase',
		textAlign: 'center',
		letterSpacing: 1,
		padding: '0 56px',
		lineHeight: 1.2,
	};

	return (
		<AbsoluteFill
			style={{
				backgroundColor: `rgb(0,0,${bgB})`,
				justifyContent: 'center',
				alignItems: 'center',
				flexDirection: 'column',
				gap: 16,
				opacity: exitOp,
			}}
		>
			{/* Grid sfondo */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			{/* Riga 1 — "TU" in verde, resto bianco */}
			<div style={{transform: `translateX(${r1X}px)`, opacity: r1Op}}>
				<span style={{...baseText, fontSize: 64, color: theme.text.accent, textShadow: theme.glow.greenText}}>Tu </span>
				<span style={{...baseText, fontSize: 54, color: theme.text.secondary}}>registri le idee</span>
				<br />
				<span style={{...baseText, fontSize: 54, color: theme.text.secondary}}>che hai in testa.</span>
			</div>

			{/* Divisore luminoso */}
			{frame >= 100 && (
				<div
					style={{
						width: `${dividerOp * 60}%`,
						height: 1,
						backgroundColor: theme.text.accent,
						opacity: dividerOp * 0.5,
						boxShadow: theme.glow.greenSoft,
					}}
				/>
			)}

			{/* Riga 2 — "NOI" in verde */}
			{frame >= 70 && (
				<div style={{transform: `translateX(${r2X}px)`, opacity: r2Op}}>
					<span style={{...baseText, fontSize: 64, color: theme.text.accent, textShadow: theme.glow.greenText}}>Noi </span>
					<span style={{...baseText, fontSize: 54, color: theme.text.secondary}}>le trasformiamo</span>
					<br />
					<span style={{...baseText, fontSize: 54, color: theme.text.secondary}}>in video</span>
				</div>
			)}

			{/* Riga 3 — payoff con glow */}
			{frame >= 140 && (
				<div
					style={{
						transform: `scale(${r3Scale})`,
						opacity: r3Op,
						...baseText,
						fontSize: 42,
						color: theme.text.primary,
						fontStyle: 'italic',
						fontWeight: 700,
						textShadow: r3Glow,
					}}
				>
					che la gente non riesce
					<br />a smettere di guardare.
				</div>
			)}

			<VisualAnchor />
		</AbsoluteFill>
	);
};
