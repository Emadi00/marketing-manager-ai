// src/scenes/V3_Scene04_Bridge.tsx
// [00:13–00:19] BRIDGE / SOLUZIONE — 180f | Emozione: Sollievo / Sorpresa
// Differenza V2: più lunga (180f vs 120f), include il processo in 3 step visuali
// "VIDEOCRAFT STUDIO" + tagline "Risolve questo. Adesso." + mini processo "Registri → Mandi → Pubblichi"
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

export const V3_Scene04_Bridge: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Sfondo: transizione da tension (#140505) a solution (#050F0A) in 60f
	const r = Math.round(interpolate(frame, [0, 60], [20, 5], {extrapolateRight: 'clamp'}));
	const g = Math.round(interpolate(frame, [0, 60], [5, 16], {extrapolateRight: 'clamp'}));
	const b = Math.round(interpolate(frame, [0, 60], [5, 10], {extrapolateRight: 'clamp'}));

	// Flash verde di transizione (frame 0–6): segnale netto cambio emotivo
	const flashGreen = interpolate(frame, [0, 2, 7], [0.22, 0.1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// "Con" — slide down, frame 0
	const conY = spring({frame, fps, from: -30, to: 0, config: {damping: 16, stiffness: 110}});
	const conOp = interpolate(frame, [0, 14], [0, 0.65], {extrapolateRight: 'clamp'});

	// "VideoCraft Studio" — slam con glow, frame 10
	const brandF = Math.max(0, frame - 10);
	const brandScale = spring({frame: brandF, fps, from: 0, to: 1, config: {damping: 8, stiffness: 230}});
	const brandOp = interpolate(brandF, [0, 7], [0, 1], {extrapolateRight: 'clamp'});
	const brandGlow = interpolate(
		Math.sin(((frame - 15) / 24) * Math.PI * 2),
		[-1, 1],
		[0.55, 1],
	);

	// Linea decorativa sotto brand — si espande frame 28
	const lineW = interpolate(Math.max(0, frame - 28), [0, 22], [0, 820], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});

	// "Risolve questo. Adesso." — frame 50
	const tagF = Math.max(0, frame - 50);
	const tagY = spring({frame: tagF, fps, from: 50, to: 0, config: {damping: 14, stiffness: 130}});
	const tagOp = interpolate(tagF, [0, 12], [0, 1], {extrapolateRight: 'clamp'});

	// Mini processo: "Registri" → freccia → "Ci mandi" → freccia → "Pubblichi" — frame 90
	const processF = Math.max(0, frame - 90);
	const processOp = interpolate(processF, [0, 20], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});
	const processY = spring({frame: processF, fps, from: 30, to: 0, config: {damping: 16, stiffness: 100}});

	// Colori dei tre step (appaiono in sequenza)
	const step1Op = interpolate(Math.max(0, frame - 90), [0, 12], [0, 1], {extrapolateRight: 'clamp'});
	const step2Op = interpolate(Math.max(0, frame - 110), [0, 12], [0, 1], {extrapolateRight: 'clamp'});
	const step3Op = interpolate(Math.max(0, frame - 130), [0, 12], [0, 1], {extrapolateRight: 'clamp'});

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
			{/* Flash verde iniziale — cambio emotivo netto */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundColor: `rgba(57,255,20,${flashGreen})`,
					pointerEvents: 'none',
				}}
			/>

			{/* Vignetta */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.72) 100%)',
					pointerEvents: 'none',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 12,
				}}
			>
				{/* "Con" */}
				<div
					style={{
						transform: `translateY(${conY}px)`,
						opacity: conOp,
						fontFamily: theme.font.hero,
						fontSize: 44,
						fontWeight: 400,
						color: theme.text.secondary,
						textTransform: 'uppercase',
						letterSpacing: 7,
					}}
				>
					con
				</div>

				{/* "VideoCraft Studio" */}
				<div
					style={{
						transform: `scale(${brandScale})`,
						opacity: brandOp,
						fontFamily: theme.font.hero,
						fontSize: 90,
						fontWeight: 900,
						color: theme.text.accent,
						textTransform: 'uppercase',
						textAlign: 'center',
						lineHeight: 1,
						letterSpacing: '-1px',
						padding: '0 40px',
						textShadow: `0 0 ${22 * brandGlow}px #39FF14, 0 0 ${48 * brandGlow}px rgba(57,255,20,0.42)`,
					}}
				>
					VideoCraft
					<br />
					Studio
				</div>

				{/* Linea decorativa */}
				<div
					style={{
						width: lineW,
						height: 2,
						backgroundColor: theme.text.accent,
						boxShadow: theme.glow.greenSoft,
						maxWidth: 820,
					}}
				/>

				{/* "Risolve questo. Adesso." */}
				<div
					style={{
						transform: `translateY(${tagY}px)`,
						opacity: tagOp,
						fontFamily: theme.font.hero,
						fontSize: 48,
						fontWeight: 700,
						color: theme.text.primary,
						textTransform: 'uppercase',
						textAlign: 'center',
						letterSpacing: 1,
						lineHeight: 1.2,
					}}
				>
					Risolve questo.{' '}
					<span
						style={{
							color: theme.text.accent,
							textShadow: theme.glow.greenText,
						}}
					>
						Adesso.
					</span>
				</div>

				{/* Mini processo: Registri → Mandi → Pubblichi */}
				<div
					style={{
						transform: `translateY(${processY}px)`,
						opacity: processOp,
						display: 'flex',
						flexDirection: 'row',
						alignItems: 'center',
						gap: 16,
						marginTop: 20,
						padding: '16px 48px',
						border: '1px solid rgba(57,255,20,0.18)',
						borderRadius: 8,
					}}
				>
					<span
						style={{
							opacity: step1Op,
							fontFamily: theme.font.hero,
							fontSize: 30,
							fontWeight: 700,
							color: theme.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: 1,
						}}
					>
						Registri
					</span>
					<span
						style={{
							opacity: step2Op,
							fontFamily: theme.font.hero,
							fontSize: 26,
							color: theme.text.accent,
							textShadow: theme.glow.greenText,
						}}
					>
						→
					</span>
					<span
						style={{
							opacity: step2Op,
							fontFamily: theme.font.hero,
							fontSize: 30,
							fontWeight: 700,
							color: theme.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: 1,
						}}
					>
						Ci mandi
					</span>
					<span
						style={{
							opacity: step3Op,
							fontFamily: theme.font.hero,
							fontSize: 26,
							color: theme.text.accent,
							textShadow: theme.glow.greenText,
						}}
					>
						→
					</span>
					<span
						style={{
							opacity: step3Op,
							fontFamily: theme.font.hero,
							fontSize: 30,
							fontWeight: 700,
							color: theme.text.accent,
							textTransform: 'uppercase',
							letterSpacing: 1,
							textShadow: theme.glow.greenText,
						}}
					>
						Pubblichi
					</span>
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
