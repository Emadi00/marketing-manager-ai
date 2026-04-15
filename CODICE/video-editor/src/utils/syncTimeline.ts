export const secondsToFrame = (seconds: number, fps: number): number =>
  Math.round(seconds * fps);

export const segmentToFrameRange = (
  segment: { start: number; end: number },
  fps: number
): { from: number; durationInFrames: number } => ({
  from: Math.round(segment.start * fps),
  durationInFrames: Math.max(1, Math.round((segment.end - segment.start) * fps)),
});

export const wordToFrame = (
  word: { start: number; end: number },
  fps: number
): { from: number; durationInFrames: number } => ({
  from: Math.round(word.start * fps),
  durationInFrames: Math.max(1, Math.round((word.end - word.start) * fps)),
});

export type WhisperWord    = { word: string; start: number; end: number };
export type WhisperSegment = { id: number; start: number; end: number; text: string; words?: WhisperWord[] };
export type WhisperTimeline = WhisperSegment[];
