// src/components/KineticText.tsx
import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';

interface KineticTextProps {
	text: string;
	delay?: number;
	fontSize?: number;
	color?: string;
	align?: 'left' | 'center' | 'right';
	animationType?: 'spring' | 'fade' | 'slideUp' | 'slam';
	fontFamily?: string;
	style?: React.CSSProperties;
}

export const KineticText: React.FC<KineticTextProps> = ({
	text,
	delay = 0,
	fontSize = 64,
	color = theme.text.primary,
	align = 'center',
	animationType = 'spring',
	fontFamily = theme.font.hero,
	style,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const f = Math.max(0, frame - delay);

	let transform = 'scale(1) translateY(0px)';
	let opacity = 1;

	if (animationType === 'spring') {
		const s = spring({frame: f, fps, from: 0, to: 1, config: {damping: 12, stiffness: 150}});
		transform = `scale(${s})`;
		opacity = interpolate(f, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
	}

	if (animationType === 'slam') {
		const s = spring({frame: f, fps, from: 0, to: 1, config: {damping: 6, stiffness: 300}});
		transform = `scale(${s})`;
		opacity = interpolate(f, [0, 5], [0, 1], {extrapolateRight: 'clamp'});
	}

	if (animationType === 'slideUp') {
		const y = spring({frame: f, fps, from: 80, to: 0, config: {damping: 14, stiffness: 120}});
		transform = `translateY(${y}px)`;
		opacity = interpolate(f, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
	}

	if (animationType === 'fade') {
		opacity = interpolate(f, [0, 20], [0, 1], {
			easing: Easing.out(Easing.cubic),
			extrapolateRight: 'clamp',
		});
	}

	return (
		<div
			style={{
				fontFamily,
				fontSize,
				fontWeight: 900,
				color,
				textAlign: align,
				textTransform: 'uppercase',
				transform,
				opacity,
				lineHeight: 1.1,
				padding: '0 60px',
				...style,
			}}
		>
			{text}
		</div>
	);
};

/* ─── WordByWord ─────────────────────────────────────────────────── */

interface WordByWordProps {
	text: string;
	startFrame?: number;
	wordDelay?: number;
	fontSize?: number;
	fontFamily?: string;
	accentWords?: string[];
	style?: React.CSSProperties;
}

/**
 * WordByWord — Rivela le parole una alla volta (stile kinetic typography).
 * accentWords: array di parole che appaiono in verde neon.
 */
export const WordByWord: React.FC<WordByWordProps> = ({
	text,
	startFrame = 0,
	wordDelay = 5,
	fontSize = 68,
	fontFamily = theme.font.hero,
	accentWords = [],
	style,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const words = text.split(' ');

	return (
		<div
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				justifyContent: 'center',
				gap: '0 0.25em',
				padding: '0 60px',
				...style,
			}}
		>
			{words.map((word, i) => {
				const wf = Math.max(0, frame - startFrame - i * wordDelay);
				const s = spring({frame: wf, fps, from: 0, to: 1, config: {damping: 10, stiffness: 200}});
				const op = interpolate(wf, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
				const clean = word.replace(/[.,!?—–]/g, '').toUpperCase();
				const isAccent = accentWords.map((w) => w.toUpperCase()).includes(clean);

				return (
					<span
						key={i}
						style={{
							display: 'inline-block',
							fontFamily,
							fontSize,
							fontWeight: 900,
							textTransform: 'uppercase',
							color: isAccent ? theme.text.accent : theme.text.primary,
							textShadow: isAccent ? theme.glow.greenText : 'none',
							transform: `scale(${s})`,
							opacity: op,
							lineHeight: 1.2,
						}}
					>
						{word}
					</span>
				);
			})}
		</div>
	);
};
