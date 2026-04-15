// src/scenes/V2_Scene05_Desire.tsx
// [00:18–00:27] DESIDERIO — 270f | Emozione: Sollievo / Desiderio
// 4 step entrano in sequenza come checklist; "48 ORE" esplode in verde
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

interface StepProps {
	label: string;
	icon: string;
	startFrame: number;
	accent?: boolean;
	large?: boolean;
}

const Step: React.FC<StepProps> = ({label, icon, startFrame, accent = false, large = false}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const f = Math.max(0, frame - startFrame);

	const x = spring({frame: f, fps, from: 120, to: 0, config: {damping: 13, stiffness: 160}});
	const op = interpolate(f, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// Glow pulsante per accent
	const glowPulse = accent
		? interpolate(Math.sin((f / 20) * Math.PI * 2), [-1, 1], [0.7, 1])
		: 1;

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 24,
				transform: `translateX(${x}px)`,
				opacity: op,
				padding: '0 64px',
			}}
		>
			{/* Icona/checkmark */}
			<div
				style={{
					width: large ? 56 : 44,
					height: large ? 56 : 44,
					borderRadius: '50%',
					border: `2px solid ${accent ? theme.text.accent : 'rgba(255,255,255,0.3)'}`,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: large ? 28 : 22,
					color: accent ? theme.text.accent : theme.text.secondary,
					boxShadow: accent ? theme.glow.greenSoft : 'none',
					flexShrink: 0,
				}}
			>
				{icon}
			</div>
			{/* Label */}
			<div
				style={{
					fontFamily: theme.font.hero,
					fontSize: large ? 72 : 54,
					fontWeight: 900,
					color: accent ? theme.text.accent : theme.text.primary,
					textTransform: 'uppercase',
					lineHeight: 1,
					textShadow: accent
						? `0 0 ${20 * glowPulse}px #39FF14, 0 0 ${40 * glowPulse}px rgba(57,255,20,0.35)`
						: 'none',
					letterSpacing: large ? '-1px' : '0px',
				}}
			>
				{label}
			</div>
		</div>
	);
};

export const V2_Scene05_Desire: React.FC = () => {
	const frame = useCurrentFrame();
	const {durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Sfondo gradualmente più luminoso verso il verde
	const bgG = Math.round(interpolate(frame, [0, durationInFrames], [5, 18], {extrapolateRight: 'clamp'}));
	const bgColor = `rgb(5,${bgG},10)`;

	// Titoletto "come funziona:" appare subito
	const headerOp = interpolate(frame, [0, 15], [0, 0.55], {extrapolateRight: 'clamp'});
	const headerY = spring({frame, fps: 30, from: -20, to: 0, config: {damping: 16, stiffness: 120}});

	// "48 ORE" — il climax visivo (appare a frame 180)
	const ctaFrame = Math.max(0, frame - 182);
	const ctaScale = spring({frame: ctaFrame, fps: 30, from: 0, to: 1, config: {damping: 5, stiffness: 380}});
	const ctaOp = interpolate(ctaFrame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
	// Badge "MENO DI" sopra "48 ORE"
	const badgeOp = interpolate(Math.max(0, frame - 195), [0, 12], [0, 1], {extrapolateRight: 'clamp'});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: bgColor,
				justifyContent: 'center',
				alignItems: 'center',
				opacity: exitOp,
				overflow: 'hidden',
			}}
		>
			{/* Vignetta laterale */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background:
						'radial-gradient(ellipse 60% 80% at 50% 50%, transparent 30%, rgba(0,0,0,0.65) 100%)',
					pointerEvents: 'none',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-start',
					width: '100%',
					gap: 20,
				}}
			>
				{/* Header */}
				<div
					style={{
						transform: `translateY(${headerY}px)`,
						opacity: headerOp,
						fontFamily: theme.font.hero,
						fontSize: 32,
						fontWeight: 400,
						color: theme.text.secondary,
						textTransform: 'uppercase',
						letterSpacing: 4,
						padding: '0 64px',
					}}
				>
					ecco come:
				</div>

				{/* Step 1 — "Registri." */}
				<Step label="Registri." icon="●" startFrame={5} />

				{/* Step 2 — "Ci mandi i file." */}
				<Step label="Ci mandi i file." icon="●" startFrame={40} />

				{/* Step 3 — "Noi facciamo tutto." */}
				<Step label="Noi facciamo tutto." icon="●" startFrame={85} />

				{/* Separatore */}
				<div
					style={{
						width: interpolate(frame, [150, 185], [0, 952], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
						height: 2,
						backgroundColor: theme.text.accent,
						boxShadow: theme.glow.greenSoft,
						marginLeft: 64,
						marginTop: 8,
					}}
				/>

				{/* Climax: "IN MENO DI 48 ORE" */}
				<div
					style={{
						padding: '0 64px',
						opacity: ctaOp,
					}}
				>
					<div
						style={{
							opacity: badgeOp,
							fontFamily: theme.font.hero,
							fontSize: 36,
							fontWeight: 700,
							color: 'rgba(255,255,255,0.7)',
							textTransform: 'uppercase',
							letterSpacing: 3,
							marginBottom: 4,
						}}
					>
						in meno di
					</div>
					<div
						style={{
							transform: `scale(${ctaScale})`,
							transformOrigin: 'left center',
							fontFamily: theme.font.hero,
							fontSize: 110,
							fontWeight: 900,
							color: theme.text.accent,
							textTransform: 'uppercase',
							lineHeight: 0.9,
							textShadow: `0 0 30px #39FF14, 0 0 60px rgba(57,255,20,0.5), 0 0 90px rgba(57,255,20,0.2)`,
							letterSpacing: '-2px',
						}}
					>
						48 ore.
					</div>
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
