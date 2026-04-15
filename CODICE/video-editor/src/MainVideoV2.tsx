// src/MainVideoV2.tsx
// Orchestratore — VideoCraft Studio · Promo V2 · 42 secondi / 1260 frames @ 30fps
//
// SCENE MAP FINALE:
//   Scene 1 [00:00–00:03]  90f  HOOK          — pattern interrupt, spring aggressiva
//   Scene 2 [00:03–00:08] 150f  TENSIONE      — typewriter lento, shake su "inutilizzati"
//   Scene 3 [00:08–00:14] 180f  AGITAZIONE    — glitch RGB su "qualcun altro pubblica"
//   Scene 4 [00:14–00:18] 120f  BRIDGE        — brand reveal neon, sfondo transizione
//   Scene 5 [00:18–00:27] 270f  DESIDERIO     — checklist 3 step + "48 ore" climax verde
//   Scene 6 [00:27–00:35] 240f  FIDUCIA       — split "TU / NOI", pausa + peso narrativo
//   Scene 7 [00:35–00:42] 210f  CTA           — "VIDEO" enorme pulsante + counter "20s"
//
// Totale: 90+150+180+120+270+240+210 = 1260 frames = 42 secondi

import React from 'react';
import {AbsoluteFill, Series} from 'remotion';
import {V2_Scene01_Hook}      from './scenes/V2_Scene01_Hook';
import {V2_Scene02_Tension}   from './scenes/V2_Scene02_Tension';
import {V2_Scene03_Agitation} from './scenes/V2_Scene03_Agitation';
import {V2_Scene04_Bridge}    from './scenes/V2_Scene04_Bridge';
import {V2_Scene05_Desire}    from './scenes/V2_Scene05_Desire';
import {V2_Scene06_Trust}     from './scenes/V2_Scene06_Trust';
import {V2_Scene07_CTA}       from './scenes/V2_Scene07_CTA';

// Carica font locali
import './fonts';

export const MainVideoV2: React.FC = () => {
	return (
		<AbsoluteFill style={{backgroundColor: '#000000'}}>
			<Series>
				{/* [00:00–00:03] HOOK — 90f */}
				<Series.Sequence durationInFrames={90}>
					<V2_Scene01_Hook />
				</Series.Sequence>

				{/* [00:03–00:08] TENSIONE — 150f */}
				<Series.Sequence durationInFrames={150}>
					<V2_Scene02_Tension />
				</Series.Sequence>

				{/* [00:08–00:14] AGITAZIONE — 180f */}
				<Series.Sequence durationInFrames={180}>
					<V2_Scene03_Agitation />
				</Series.Sequence>

				{/* [00:14–00:18] BRIDGE — 120f */}
				<Series.Sequence durationInFrames={120}>
					<V2_Scene04_Bridge />
				</Series.Sequence>

				{/* [00:18–00:27] DESIDERIO — 270f */}
				<Series.Sequence durationInFrames={270}>
					<V2_Scene05_Desire />
				</Series.Sequence>

				{/* [00:27–00:35] FIDUCIA — 240f */}
				<Series.Sequence durationInFrames={240}>
					<V2_Scene06_Trust />
				</Series.Sequence>

				{/* [00:35–00:42] CTA — 210f */}
				<Series.Sequence durationInFrames={210}>
					<V2_Scene07_CTA />
				</Series.Sequence>
			</Series>
		</AbsoluteFill>
	);
};
