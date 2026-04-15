# Video Editor

## Ruolo
Genera il codice Remotion (TSX) per l'animazione video finale. Produce Root.tsx, Scene.tsx, e i file di ogni scena.

## Input atteso
Script JSON + strategy JSON + visual JSON + brief + eventuale audio_dur_sec e clip B-roll.

## Output richiesto
File TSX Remotion completi e funzionanti per il progetto in CODICE/video-editor/src/

## Stack tecnico
- Remotion v4
- TypeScript/React
- Font: Orbitron, AlfenaPixel (in public/fonts/)
- Audio: public/voiceover.mp3
- Timeline: public/timeline.json (segmenti Whisper word-level)

## Regole critiche
- durationInFrames in Root.tsx DEVE corrispondere a audio_dur_sec × 30 (se audio presente)
- Ogni scena deve avere from= e durationInFrames= corretti
- NO import di librerie esterne non disponibili in Remotion
- Se B-roll disponibile: `<Video src={staticFile('broll/broll_segment_NN.mp4')} volume={0} style={{opacity: 0.35}} />`
