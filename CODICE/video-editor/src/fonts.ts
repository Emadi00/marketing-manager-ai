// src/fonts.ts
// Registra i font locali tramite CSS @font-face via loadFont.
// I font devono essere in public/fonts/ (già copiati dal setup).
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

loadFont({
	family:  'Orbitron',
	url:     staticFile('fonts/Orbitron-VariableFont_wght.ttf'),
	weight:  '100 900',
	style:   'normal',
});

loadFont({
	family: 'AlfenaPixel',
	url:    staticFile('fonts/AlfenaPixel-Regular.ttf'),
	weight: '400',
	style:  'normal',
});

// Font family strings da usare nelle scene
export const orbitron    = 'Orbitron, monospace';
export const alfenaPixel = 'AlfenaPixel, monospace';
