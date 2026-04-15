# Video Editor

## Ruolo
Genera il codice Remotion (TSX) per l'animazione video finale. Ogni file deve essere completo, compilabile e pronto per il render senza modifiche manuali.

## Riferimento tecnico completo
Leggi SEMPRE: `CODICE/video-editor/CLAUDE.md` — contiene pattern di codice, regole easing, psicologia per emozione, checklist completa.

---

## Struttura file obbligatoria

```
src/
├── Root.tsx              ← registrazione composizione + durationInFrames ESATTO
├── MainVideo.tsx         ← orchestratore con <Series>
├── theme.ts              ← palette, font, timing, springs — SEMPRE dal Style DNA
└── scenes/
    ├── Scene01_Hook.tsx
    ├── Scene02_[emozione].tsx
    └── SceneNN_CTA.tsx
```

---

## Regole CRITICHE — mai violare

### 1. Durata esatta
```ts
// Root.tsx — durationInFrames DEVE essere esattamente:
const durationInFrames = Math.round(audio_dur_sec * fps); // audio_dur_sec dal brief
// MAI approssimare, MAI aggiungere secondi extra
```

### 2. Usa SEMPRE syncTimeline.ts per i frame
```ts
import { secondsToFrame, segmentToFrameRange } from '../utils/syncTimeline';
// MAI calcolare frame a mano con moltiplicazioni
const { from, durationInFrames } = segmentToFrameRange(segment, fps);
```

### 3. Usa SEMPRE theme.ts — mai hardcodare
```ts
import { THEME } from '../theme';
// ✅ THEME.colors.accent
// ❌ "#39FF14"  ← mai
```

### 4. Easing — solo nomi validi in Remotion
```ts
// ✅ Easing.out(Easing.cubic)
// ✅ Easing.sin  ← NON .sine
// ✅ Easing.exp  ← NON .expo
// ❌ Mai usare easing come funzione standalone
// inputRange di interpolate() SEMPRE strettamente crescente
```

### 5. Nessuna scena vuota
- Ogni file di scena deve avere almeno: AbsoluteFill + testo + ancora visiva
- Minimo 1500 bytes per file — se più piccolo, la scena è incompleta
- Verifica che ogni scena importata in MainVideo.tsx esista davvero

### 6. Audio
```tsx
// MainVideo.tsx — fuori da <Series>
import { Audio, staticFile } from 'remotion';
<Audio src={staticFile('voiceover.mp3')} />
```

### 7. B-roll (se disponibile nel brief)
```tsx
<Video
  src={staticFile('broll/broll_segment_01.mp4')}
  volume={0}
  style={{ opacity: 0.35, objectFit: 'cover', width: '100%', height: '100%' }}
/>
```

---

## theme.ts — workflow obbligatorio

1. **Crea theme.ts PRIMA di qualsiasi scena**
2. Estrai i valori dal blocco STYLE DNA nel brief (se presente)
3. Se nessun Style DNA: usa defaults (`#0a0a0a`, `#ffffff`, `#39FF14`, Orbitron)
4. Le direttive esplicite del cliente sovrascrivono il DNA

```ts
export const THEME = {
  colors: { bg: '...', text: '...', accent: '...', muted: '...' },
  fonts:  { main: 'Orbitron', accent: 'AlfenaPixel', sizeHero: '72px', sizeBody: '36px' },
  springs: {
    aggressive: { damping: 6,  stiffness: 300 },
    standard:   { damping: 12, stiffness: 150 },
    soft:       { damping: 18, stiffness: 120 },
    cta:        { damping: 8,  stiffness: 220 },
  },
  anchor: { height: 3, color: '#39FF14', glow: '0 0 10px #39FF14' },
  timing: { fadeOutFrames: 8, pulseInterval: 30 },
} as const;
```

---

## Checklist pre-consegna

- [ ] `durationInFrames` in Root.tsx = `audio_dur_sec × 30` esatto
- [ ] Tutti i frame calcolati via `syncTimeline.ts`
- [ ] `theme.ts` creato per primo, nessun colore hardcodato nelle scene
- [ ] Ogni scena ha: AbsoluteFill + contenuto + ancora visiva + fade out 8 frame
- [ ] Nessun file di scena sotto 1500 bytes
- [ ] Tutti i file importati in MainVideo.tsx esistono realmente
- [ ] Hook usa spring aggressive o pattern interrupt visivo
- [ ] CTA è l'elemento più energico (pulse loop)
- [ ] `inputRange` di ogni `interpolate()` strettamente crescente
- [ ] Nessun easing esterno (`.sine`, `.expo` non esistono)
