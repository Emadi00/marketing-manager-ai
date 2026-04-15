import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {VisualAnchor} from '../components/VisualAnchor';

/**
 * Scene01Hook — Template hook aggressivo (0-3s).
 * Spring stiffness alta = pattern interrupt che ferma lo scroll.
 */
export const Scene01Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const scale = spring({
		frame,
		fps,
		from: 0,
		to: 1,
		config: {damping: 6, stiffness: 300}, // aggressivo = pattern interrupt
	});

	const opacity = interpolate(frame, [0, 6], [0, 1], {
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: theme.bg.primary,
				justifyContent: 'center',
				alignItems: 'center',
			}}
		>
			<div
				style={{
					transform: `scale(${scale})`,
					opacity,
					fontFamily: theme.font.hero,
					fontSize: 72,
					fontWeight: 900,
					color: theme.text.primary,
					textAlign: 'center',
					textTransform: 'uppercase',
					padding: '0 60px',
					lineHeight: 1.1,
				}}
			>
				Il tuo hook va qui.
			</div>
			<VisualAnchor />
		</AbsoluteFill>
	);
};
