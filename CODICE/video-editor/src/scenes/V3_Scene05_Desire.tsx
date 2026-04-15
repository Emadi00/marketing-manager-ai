// src/scenes/V3_Scene05_Desire.tsx
// [00:19–00:27] DESIDERIO — 240f | Emozione: Sollievo / Desiderio
// Differenza V2: mostra i 4 servizi REALI dello script (TAGLI / SOTTOTITOLI / MUSICA / EFFETTI)
//   come parole di impatto singole che si costruiscono in lista, poi climax "48 ORE"
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

// Servizio singolo con icona e testo
interface ServiceItemProps {
	label: string;
	startFrame: number;
	accent?: boolean;
}

const ServiceItem: React.FC<ServiceItemProps> = ({label, startFrame, accent = false}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const f = Math.max(0, frame - startFrame);

	const x = spring({frame: f, fps, from: -180, to: 0, config: {damping: 12, stiffness: 170}});
	const op = interpolate(f, [0, 10], [0, 1], {extrapolateRight: 'clamp'});

	// Pulse su accent
	const glowAmt = accent
		? interpolate(Math.sin((f / 22) * Math.PI * 2), [-1, 1], [14, 26])
		: 0;

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 22,
				transform: `translateX(${x}px)`,
				opacity: op,
				padding: '0 64px',
			}}
		>
			{/* Bullet neon */}
			<div
				style={{
					width: 10,
					height: 10,
					borderRadius: '50%',
					backgroundColor: accent ? theme.text.accent : 'rgba(255,255,255,0.35)',
					boxShadow: accent ? `0 0 ${glowAmt}px ${theme.text.accent}` : 'none',
					flexShrink: 0,
				}}
			/>
			{/* Testo servizio */}
			<div
				style={{
					fontFamily: theme.font.hero,
					fontSize: 66,
					fontWeight: 900,
					color: accent ? theme.text.accent : theme.text.primary,
					textTransform: 'uppercase',
					lineHeight: 1,
					letterSpacing: accent ? '-1px' : '0px',
					textShadow: accent
						? `0 0 ${glowAmt}px #39FF14, 0 0 ${glowAmt * 2}px rgba(57,255,20,0.3)`
						: 'none',
				}}
			>
				{label}
			</div>
		</div>
	);
};

export const V3_Scene05_Desire: React.FC = () => {
	const frame = useCurrentFrame();
	const {durationInFrames} = useVideoConfig();

	const exitOp = interpolate(
		frame,
		[durationInFrames - 10, durationInFrames - 1],
		[1, 0],
		{extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
	);

	// Sfondo: verde scuro che si illumina leggermente
	const bgG = Math.round(interpolate(frame, [0, durationInFrames], [5, 20], {extrapolateRight: 'clamp'}));
	const bgColor = `rgb(5,${bgG},8)`;

	// Intestazione "i nostri servizi:" — slide down, frame 0
	const headerOp = interpolate(frame, [0, 16], [0, 0.5], {extrapolateRight: 'clamp'});
	const headerY = spring({frame, fps: 30, from: -20, to: 0, config: {damping: 16, stiffness: 110}});

	// Separatore che si espande prima del climax (frame 158)
	const sepW = interpolate(frame, [155, 180], [0, 920], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// "IN MENO DI" — frame 182
	const prefixF = Math.max(0, frame - 180);
	const prefixOp = interpolate(prefixF, [0, 14], [0, 1], {extrapolateRight: 'clamp'});
	const prefixY = spring({frame: prefixF, fps: 30, from: 20, to: 0, config: {damping: 16, stiffness: 110}});

	// "48 ORE" — il climax, frame 193
	const ctaF = Math.max(0, frame - 192);
	const ctaScale = spring({frame: ctaF, fps: 30, from: 0, to: 1, config: {damping: 5, stiffness: 390}});
	const ctaOp = interpolate(ctaF, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
	// Glow pulsante su "48 ORE"
	const ctaGlow = interpolate(
		Math.sin(((frame - 200) / 20) * Math.PI * 2),
		[-1, 1],
		[28, 52],
	);

	// "i tuoi contenuti sono pronti." — frame 215
	const subF = Math.max(0, frame - 214);
	const subOp = interpolate(subF, [0, 18], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateRight: 'clamp',
	});
	const subY = spring({frame: subF, fps: 30, from: 24, to: 0, config: {damping: 18, stiffness: 90}});

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
			{/* Vignetta */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: 'radial-gradient(ellipse 58% 78% at 50% 50%, transparent 28%, rgba(0,0,0,0.7) 100%)',
					pointerEvents: 'none',
				}}
			/>

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-start',
					width: '100%',
					gap: 18,
				}}
			>
				{/* Intestazione */}
				<div
					style={{
						transform: `translateY(${headerY}px)`,
						opacity: headerOp,
						fontFamily: theme.font.hero,
						fontSize: 30,
						fontWeight: 400,
						color: theme.text.secondary,
						textTransform: 'uppercase',
						letterSpacing: 5,
						padding: '0 64px',
					}}
				>
					i nostri servizi:
				</div>

				{/* I 4 servizi — entrano in sequenza */}
				<ServiceItem label="Tagli." startFrame={5} />
				<ServiceItem label="Sottotitoli." startFrame={38} />
				<ServiceItem label="Musica." startFrame={72} />
				<ServiceItem label="Effetti." startFrame={108} accent />

				{/* Separatore prima del climax */}
				<div
					style={{
						width: sepW,
						height: 2,
						backgroundColor: theme.text.accent,
						boxShadow: theme.glow.greenSoft,
						marginLeft: 64,
						marginTop: 8,
					}}
				/>

				{/* "IN MENO DI" + "48 ORE" */}
				<div
					style={{
						padding: '0 64px',
					}}
				>
					<div
						style={{
							transform: `translateY(${prefixY}px)`,
							opacity: prefixOp,
							fontFamily: theme.font.hero,
							fontSize: 36,
							fontWeight: 700,
							color: 'rgba(255,255,255,0.65)',
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
							opacity: ctaOp,
							fontFamily: theme.font.hero,
							fontSize: 118,
							fontWeight: 900,
							color: theme.text.accent,
							textTransform: 'uppercase',
							lineHeight: 0.9,
							letterSpacing: '-2px',
							textShadow: `0 0 ${ctaGlow}px #39FF14, 0 0 ${ctaGlow * 1.8}px rgba(57,255,20,0.45), 0 0 ${ctaGlow * 3}px rgba(57,255,20,0.18)`,
						}}
					>
						48 ore.
					</div>
				</div>

				{/* Sottotitolo */}
				<div
					style={{
						transform: `translateY(${subY}px)`,
						opacity: subOp,
						fontFamily: theme.font.hero,
						fontSize: 34,
						fontWeight: 700,
						color: theme.text.secondary,
						textTransform: 'uppercase',
						letterSpacing: 1,
						padding: '0 64px',
						lineHeight: 1.3,
					}}
				>
					i tuoi contenuti sono pronti
					<br />
					per essere pubblicati.
				</div>
			</div>

			<VisualAnchor />
		</AbsoluteFill>
	);
};
