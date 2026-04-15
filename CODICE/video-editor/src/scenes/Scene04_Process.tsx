// src/scenes/Scene04_Process.tsx
// [00:13–00:20] · 210 frames · PROCESSO — sollievo: "è semplice"
// 3 step animati con stagger + frecce connector + glow sul payoff
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {orbitron} from '../fonts';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

const SCENE_DURATION = 210;

interface Step {
	icon: string;
	text: string;
	startFrame: number;
	isPayoff?: boolean;
}

const STEPS: Step[] = [
	{icon: '📱', text: 'Registri', startFrame: 18},
	{icon: '📤', text: 'Ci mandi i file', startFrame: 72},
	{icon: '✨', text: 'Noi facciamo tutto il resto', startFrame: 130, isPayoff: true},
];

export const Scene04_Process: React.FC = () => {
	const frame = useCurrentFrame();

	// Header
	const headerOp = interpolate(frame, [0, 16], [0, 1], {extrapolateRight: 'clamp'});
	const headerY = interpolate(frame, [0, 18], [-20, 0], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});

	// Frecce connector
	const arrow1Op = interpolate(frame, [88, 105], [0, 1], {
		extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
	});
	const arrow2Op = interpolate(frame, [142, 158], [0, 1], {
		extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
	});

	// Glow sul payoff step
	const payoffGlow = interpolate(frame, [148, 185], [0, 22], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const payoffGlowPulse = frame > 185 ? payoffGlow + Math.sin((frame - 185) * 0.14) * 7 : payoffGlow;

	// Exit
	const exitOp = interpolate(frame, [SCENE_DURATION - 8, SCENE_DURATION], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.secondary,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
			}}
		>
			{/* Griglia */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage:
						'linear-gradient(rgba(57,255,20,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.025) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
				}}
			/>

			<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%', padding: '0 50px'}}>
				{/* Header */}
				<div
					style={{
						fontFamily: orbitron,
						fontSize: 30,
						fontWeight: 600,
						color: theme.text.muted,
						textTransform: 'uppercase',
						letterSpacing: '0.14em',
						opacity: headerOp,
						transform: `translateY(${headerY}px)`,
						marginBottom: 36,
					}}
				>
					Come funziona
				</div>

				{/* Steps */}
				{STEPS.map((step, i) => {
					const sf = frame - step.startFrame;
					const stepOp = interpolate(sf, [0, 16], [0, 1], {
						extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
					});
					const stepX = interpolate(sf, [0, 20], [-80, 0], {
						easing: Easing.out(Easing.cubic),
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					});
					const arrowOp = i === 0 ? arrow1Op : arrow2Op;

					return (
						<React.Fragment key={i}>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 20,
									width: '90%',
									backgroundColor: step.isPayoff
										? `rgba(57,255,20,${payoffGlowPulse > 0 ? 0.06 : 0})`
										: 'rgba(255,255,255,0.04)',
									border: step.isPayoff
										? `1px solid rgba(57,255,20,${payoffGlowPulse > 0 ? 0.35 : 0})`
										: '1px solid rgba(255,255,255,0.07)',
									borderRadius: 16,
									padding: '22px 28px',
									boxShadow: step.isPayoff && payoffGlowPulse > 0
										? `0 0 ${payoffGlowPulse}px rgba(57,255,20,0.18), inset 0 0 ${payoffGlowPulse}px rgba(57,255,20,0.04)`
										: 'none',
									opacity: stepOp,
									transform: `translateX(${stepX}px)`,
								}}
							>
								<span style={{fontSize: 34}}>{step.icon}</span>
								<span
									style={{
										fontFamily: orbitron,
										fontSize: step.isPayoff ? 36 : 34,
										fontWeight: step.isPayoff ? 900 : 700,
										color: step.isPayoff ? theme.text.accent : theme.text.primary,
										textTransform: 'uppercase',
										letterSpacing: '0.03em',
										textShadow:
											step.isPayoff && payoffGlowPulse > 0
												? `0 0 ${payoffGlowPulse}px ${theme.text.accent}`
												: 'none',
									}}
								>
									{step.text}
								</span>
							</div>

							{/* Freccia connector (non dopo l'ultimo step) */}
							{i < STEPS.length - 1 && (
								<div
									style={{
										fontSize: 26,
										color: theme.text.accent,
										opacity: arrowOp,
										textShadow: theme.glow.greenText,
										lineHeight: 1,
										margin: '6px 0',
									}}
								>
									↓
								</div>
							)}
						</React.Fragment>
					);
				})}
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
