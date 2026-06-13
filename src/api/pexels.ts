import type { StockClip } from '../types';

const PEXELS_SEARCH_URL = 'https://api.pexels.com/videos/search';

/** How many results to fetch per query when looking for an unused clip. */
const RESULTS_PER_QUERY = 15;

/** Cap on how long a single clip's natural duration can contribute, for variety. */
const MAX_CLIP_DURATION = 8;

/** Safety limit on how many candidate fetches we'll attempt to fill the timeline. */
const MAX_ATTEMPTS_PER_QUERY = 6;

interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
  quality: string;
  file_type: string;
}

interface PexelsVideo {
  id: number;
  duration: number;
  video_files: PexelsVideoFile[];
  video_pictures?: { picture: string }[];
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[];
}

export interface StockClipResult {
  id: number;
  query: string;
  videoUrl: string;
  thumbnailUrl: string;
  sourceDuration: number;
}

function pickVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const mp4Files = files.filter((f) => f.file_type === 'video/mp4');
  const portrait = mp4Files.filter((f) => f.height >= f.width);
  const pool = portrait.length > 0 ? portrait : mp4Files;
  const sorted = [...pool].sort((a, b) => b.width * b.height - a.width * a.height);
  return sorted.find((f) => f.quality === 'hd') ?? sorted[0];
}

/** Drops the most specific (last) word from a query, e.g. "nebula slow motion" -> "nebula slow". */
function broadenQuery(query: string): string | null {
  const words = query.trim().split(/\s+/);
  if (words.length <= 1) return null;
  return words.slice(0, -1).join(' ');
}

/** Fetches multiple candidate results for a query, best matches first. */
async function searchPexels(apiKey: string, query: string): Promise<StockClipResult[]> {
  const response = await fetch(
    `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${RESULTS_PER_QUERY}`,
    {
      headers: { Authorization: apiKey },
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Pexels API error (${response.status}): ${errBody}`);
  }

  const data: PexelsSearchResponse = await response.json();
  const videos = data.videos ?? [];

  const results: StockClipResult[] = [];
  for (const video of videos) {
    const file = pickVideoFile(video.video_files);
    if (!file) continue;
    results.push({
      id: video.id,
      query,
      videoUrl: file.link,
      thumbnailUrl: video.video_pictures?.[0]?.picture ?? '',
      sourceDuration: video.duration,
    });
  }
  return results;
}

/**
 * Finds the best-matching clip for a query that hasn't been used yet. If
 * every result for the query has already been used, retries with a broader
 * version of the query (dropping the last word) until a match is found or
 * the query can't be broadened further.
 */
async function findUnusedClip(
  apiKey: string,
  query: string,
  excludeIds: Set<number>
): Promise<StockClipResult | null> {
  let currentQuery: string | null = query;

  while (currentQuery) {
    const results = await searchPexels(apiKey, currentQuery);
    const match = results.find((r) => !excludeIds.has(r.id));
    if (match) return match;
    currentQuery = broadenQuery(currentQuery);
  }

  return null;
}

/**
 * Selects a sequence of variable-length, non-duplicate clips that together
 * cover `totalDuration` seconds. Cycles through `queries` in order (so each
 * section of the narration is matched to clips from its corresponding
 * search term), picking a fresh, previously-unused clip each time and using
 * its natural length (capped for variety) until the timeline is filled. The
 * final clip is trimmed to land exactly on `totalDuration`.
 *
 * `usedIds` should contain Pexels video IDs already used elsewhere (e.g. in
 * other queue items) so they're excluded from selection here too. Returns
 * the newly selected clips along with the full list of IDs now used
 * (previous + new) so callers can persist it.
 */
export async function selectClipsForVoiceover(
  apiKey: string,
  queries: string[],
  totalDuration: number,
  usedIds: number[] = []
): Promise<{ clips: StockClip[]; newUsedIds: number[] }> {
  if (!apiKey) {
    throw new Error('Pexels API key is missing. Add it in Settings.');
  }
  if (queries.length === 0 || totalDuration <= 0) {
    return { clips: [], newUsedIds: [] };
  }

  const excludeIds = new Set(usedIds);
  const clips: StockClip[] = [];
  const newUsedIds: number[] = [];

  let remaining = totalDuration;
  let queryIndex = 0;
  const maxAttempts = queries.length * MAX_ATTEMPTS_PER_QUERY;
  let attempts = 0;

  while (remaining > 0.1 && attempts < maxAttempts) {
    const query = queries[queryIndex % queries.length];
    queryIndex++;
    attempts++;

    const candidate = await findUnusedClip(apiKey, query, excludeIds).catch(() => null);
    if (!candidate) continue;

    const naturalDuration = Math.min(candidate.sourceDuration, MAX_CLIP_DURATION);
    const duration = Math.min(naturalDuration, remaining);

    clips.push({
      id: candidate.id,
      query: candidate.query,
      videoUrl: candidate.videoUrl,
      thumbnailUrl: candidate.thumbnailUrl,
      duration,
      sourceDuration: candidate.sourceDuration,
    });
    excludeIds.add(candidate.id);
    newUsedIds.push(candidate.id);
    remaining -= duration;
  }

  if (clips.length === 0) {
    throw new Error('No usable Pexels clips found for this script.');
  }

  return { clips, newUsedIds };
}
