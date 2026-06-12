const PEXELS_SEARCH_URL = 'https://api.pexels.com/videos/search';

interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
  quality: string;
  file_type: string;
}

interface PexelsVideo {
  duration: number;
  video_files: PexelsVideoFile[];
  video_pictures?: { picture: string }[];
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[];
}

export interface StockClipResult {
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

async function searchPexels(
  apiKey: string,
  query: string,
  rank: number
): Promise<StockClipResult | null> {
  const perPage = Math.min(Math.max(rank + 1, 1), 80);
  const response = await fetch(
    `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}`,
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
  if (videos.length === 0) return null;

  const video = videos[Math.min(rank, videos.length - 1)];
  const file = pickVideoFile(video.video_files);
  if (!file) return null;

  return {
    query,
    videoUrl: file.link,
    thumbnailUrl: video.video_pictures?.[0]?.picture ?? '',
    sourceDuration: video.duration,
  };
}

/**
 * Finds a stock clip for the given search query. If no results are found,
 * retries once with a broader version of the query (drops the last word).
 */
export async function findStockClip(
  apiKey: string,
  query: string,
  rank = 0
): Promise<StockClipResult> {
  if (!apiKey) {
    throw new Error('Pexels API key is missing. Add it in Settings.');
  }

  let result = await searchPexels(apiKey, query, rank);

  if (!result) {
    const broader = broadenQuery(query);
    if (broader) {
      result = await searchPexels(apiKey, broader, rank);
    }
  }

  if (!result) {
    throw new Error(`No Pexels results found for "${query}"`);
  }

  return result;
}
