const WORDS_PER_MINUTE = 150;

/** Estimates spoken duration of narration text at 150 words per minute. */
export function estimateNarrationSeconds(narration: string): number {
  const words = narration.trim().split(/\s+/).filter(Boolean).length;
  return (words / WORDS_PER_MINUTE) * 60;
}
