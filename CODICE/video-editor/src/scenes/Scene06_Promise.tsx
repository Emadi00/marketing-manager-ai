// src/scenes/Scene06_Promise.tsx
// [00:27–00:35] · 240 frames · PROMESSA — desiderio: "48 ore"
// Counter 0→48 con spring + glow esplosivo + outcome text
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const SCENE_DURATION = 240;

export const Scene06_Promise: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	// "In meno di" — prefisso
	const prefixOp = interpolate(frame, [5, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const prefixY = interpolate(frame, [5, 22], [-20, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Counter: 0 → 48 (frame 22 → 88)
	const counterValue = Math.round(
		interpolate(frame, [22, 88], [0, 48], {
			easing: Easing.out(Easing.cubic),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		}),
	);

	// Scale del counter — spring che parte grande e si assesta
	const counterScale = spring({
		frame: frame - 22,
		fps,
		from: 0.5,
		to: 1,
		config: {damping: 9, stiffness: 160},
	});

	// "ORE" appare dopo che il counter è atterrato
	const oreOp = interpolate(frame, [90, 106], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const oreY = interpolate(frame, [90, 108], [18, 0], {
		easing: Easing.out(Easing.back(1.5)),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Glow sul numero — cresce dopo landing
	const numGlow = interpolate(frame, [88, 125], [0, 28], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const numGlowPulse = frame > 125 ? numGlow + Math.sin((frame - 125) * 0.13) * 10 : numGlow;

	// Outcome text
	const outcome1Op = interpolate(frame, [112, 130], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const outcome1Y = interpolate(frame, [112, 132], [30, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const outcome2Op = interpolate(frame, [138, 156], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const outcome2Y = interpolate(frame, [138, 158], [30, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Exit
	const exitOp = interpolate(frame, [SCENE_DURATION - 8, SCENE_DURATION], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.solution,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
			}}
		>
			{/* Griglia verde-soluzione */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 18,
					padding: '0 60px',
				}}
			>
				{/* "In meno di" */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 36,
						fontWeight: 400,
						color: theme.text.muted,
						textTransform: 'uppercase',
						letterSpacing: '0.14em',
						opacity: prefixOp,
						transform: `translateY(${prefixY}px)`,
					}}
				>
					In meno di
				</div>

				{/* Counter block */}
				<div style={{display: 'flex', alignItems: 'baseline', gap: 14}}>
					<span
						style={{
							fontFamily: orbitron,
							fontSize: 172,
							fontWeight: 900,
							color: theme.text.accent,
							lineHeight: 1,
							textShadow: `0 0 ${numGlowPulse}px ${theme.text.accent}, 0 0 ${numGlowPulse * 2}px rgba(57,255,20,0.28)`,
							transform: `scale(${counterScale})`,
							display: 'inline-block',
						}}
					>
						{counterValue}
					</span>
					<span
						style={{
							fontFamily: orbitron,
							fontSize: 62,
							fontWeight: 700,
							color: theme.text.accent,
							textTransform: 'uppercase',
							letterSpacing: '0.06em',
							opacity: oreOp,
							transform: `translateY(${oreY}px)`,
							display: 'inline-block',
						}}
					>
						ore
					</span>
				</div>

				{/* Outcome line 1 */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 38,
						fontWeight: 700,
						color: theme.text.secondary,
						textAlign: 'center',
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
						lineHeight: 1.3,
						opacity: outcome1Op,
						transform: `translateY(${outcome1Y}px)`,
					}}
				>
					i tuoi contenuti sono
				</div>

				{/* Outcome line 2 — accent */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 42,
						fontWeight: 900,
						color: theme.text.accent,
						textAlign: 'center',
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
						lineHeight: 1.3,
						textShadow: outcome2Op > 0.5 ? theme.glow.greenText : 'none',
						opacity: outcome2Op,
						transform: `translateY(${outcome2Y}px)`,
						padding: '0 10px',
					}}
				>
					pronti per essere pubblicati.
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
