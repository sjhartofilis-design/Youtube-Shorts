import type { CaptionChunk } from '../types';
import type { WordTimestamp } from '../api/transcribe';

const MIN_WORDS_PER_CAPTION = 2;
const MAX_WORDS_PER_CAPTION = 4;
const PAUSE_BREAK_SECONDS = 0.5;

/** Groups transcribed words into 2-4 word caption chunks, breaking early on natural pauses. */
export function groupWordsIntoCaptions(words: WordTimestamp[]): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];
  let current: WordTimestamp[] = [];

  for (let i = 0; i < words.length; i++) {
    current.push(words[i]);
    const next = words[i + 1];
    const pauseAfter = next ? next.start - words[i].end : Infinity;

    const shouldBreak =
      current.length >= MAX_WORDS_PER_CAPTION ||
      !next ||
      (current.length >= MIN_WORDS_PER_CAPTION && pauseAfter >= PAUSE_BREAK_SECONDS);

    if (shouldBreak) {
      chunks.push({
        text: current.map((w) => w.word).join(' '),
        start: current[0].start,
        end: current[current.length - 1].end,
      });
      current = [];
    }
  }

  return chunks;
}

function formatSrtTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
}

/** Renders caption chunks as an SRT subtitle file. */
export function captionsToSrt(chunks: CaptionChunk[]): string {
  return chunks
    .map(
      (chunk, i) =>
        `${i + 1}\n${formatSrtTimestamp(chunk.start)} --> ${formatSrtTimestamp(chunk.end)}\n${chunk.text}\n`
    )
    .join('\n');
}
