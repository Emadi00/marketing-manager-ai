// src/scenes/Scene04_Solution.tsx
// [00:13–00:20] · 210 frames · SOLUZIONE + ENERGIA
// Brand reveal → "TUTTO il resto" → servizi slam uno a uno
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron, alfenaPixel} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const Service: React.FC<{label: string; startFrame: number; fromDir?: 'left' | 'right' | 'top'}> = ({
	label,
	startFrame,
	fromDir = 'top',
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const f = Math.max(0, frame - startFrame);

	const fromX = fromDir === 'left' ? -200 : fromDir === 'right' ? 200 : 0;
	const fromY = fromDir === 'top' ? -80 : 0;

	const x = spring({frame: f, fps, from: fromX, to: 0, config: {damping: 10, stiffness: 200}});
	const y = spring({frame: f, fps, from: fromY, to: 0, config: {damping: 10, stiffness: 200}});
	const s = spring({frame: f, fps, from: 0.4, to: 1, config: {damping: 8, stiffness: 220}});
	const op = interpolate(f, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

	return (
		<div
			style={{
				transform: `translate(${x}px, ${y}px) scale(${s})`,
				opacity: op,
				fontFamily: orbitron,
				fontSize: 56,
				fontWeight: 900,
				color: theme.text.primary,
				textTransform: 'uppercase',
				letterSpacing: 3,
				padding: '4px 24px',
				borderLeft: `3px solid ${theme.text.accent}`,
				boxShadow: `inset 0 0 0 0 transparent`,
				textShadow: theme.glow.white,
			}}
		>
			{label}
		</div>
	);
};

export const Scene04_Solution: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	// --- BRAND REVEAL frame 0–50 ---
	const brandScale = spring({frame, fps, from: 0, to: 1, config: {damping: 8, stiffness: 160}});
	const brandOp = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// "noi facciamo TUTTO il resto" — slide in frame 55
	const f2 = Math.max(0, frame - 55);
	const subY = spring({frame: f2, fps, from: 50, to: 0, config: {damping: 12, stiffness: 140}});
	const subOp = interpolate(f2, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// "TUTTO" — lampeggio verde a frame ~75
	const tuttoGlow = f2 > 12
		? `0 0 20px ${theme.text.accent}, 0 0 40px ${theme.text.accent}`
		: 'none';

	// Background shift verso solution
	const bgBlue = Math.round(interpolate(frame, [0, 60], [0, 18], {extrapolateRight: 'clamp'}));

	// Exit
	const exitOp = interpolate(
		frame,
		[durationInFrames - 8, durationInFrames],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// I servizi compaiono a frame 110, 130, 150, 170
	const showServices = frame >= 110;

	return (
		<AbsoluteFill
			style={{
				backgroundColor: `rgb(0,${bgBlue},${bgBlue})`,
				justifyContent: 'center',
				alignItems: 'center',
				flexDirection: 'column',
				gap: 20,
				opacity: exitOp,
			}}
		>
			{/* Grid sfondo */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			{/* Brand */}
			<div
				style={{
					transform: `scale(${brandScale})`,
					opacity: brandOp,
					textAlign: 'center',
				}}
			>
				<div style={{fontFamily: alfenaPixel, fontSize: 24, color: theme.text.accentDim, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 4}}>
					con
				</div>
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 68,
						fontWeight: 900,
						color: theme.text.accent,
						textTransform: 'uppercase',
						letterSpacing: 2,
						textShadow: theme.glow.green,
					}}
				>
					VideoCraft
				</div>
				<div style={{fontFamily: alfenaPixel, fontSize: 28, color: theme.text.secondary, letterSpacing: 8, textTransform: 'uppercase', marginTop: 2}}>
					Studio
				</div>
			</div>

			{/* "noi facciamo TUTTO il resto" */}
			{frame >= 55 && (
				<div
					style={{
						transform: `translateY(${subY}px)`,
						opacity: subOp,
						textAlign: 'center',
						padding: '0 60px',
						lineHeight: 1.15,
					}}
				>
					<span style={{fontFamily: orbitron, fontSize: 50, fontWeight: 700, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: 1}}>
						mandi i file —{' '}
					</span>
					<span style={{fontFamily: orbitron, fontSize: 50, fontWeight: 700, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: 1}}>
						noi facciamo{' '}
					</span>
					<span
						style={{
							fontFamily: orbitron,
							fontSize: 62,
							fontWeight: 900,
							color: theme.text.accent,
							textTransform: 'uppercase',
							letterSpacing: 1,
							textShadow: tuttoGlow,
						}}
					>
						TUTTO
					</span>
					<span style={{fontFamily: orbitron, fontSize: 50, fontWeight: 700, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: 1}}>
						{' '}il resto.
					</span>
				</div>
			)}

			{/* Servizi — slam uno a uno */}
			{showServices && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 14,
						alignItems: 'flex-start',
						marginTop: 10,
					}}
				>
					<Service label="Tagli."      startFrame={110} fromDir="left" />
					<Service label="Sottotitoli." startFrame={130} fromDir="right" />
					<Service label="Musica."      startFrame={150} fromDir="left" />
					<Service label="Effetti."     startFrame={170} fromDir="right" />
				</div>
			)}

			<VisualAnchor />
		</AbsoluteFill>
	);
};
