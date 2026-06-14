import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_VERSION = '0.12.6';
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpegInstance: FFmpeg | null = null;

/** Rolling buffer of the most recent ffmpeg log lines, used to surface the real error on failure. */
const MAX_LOG_LINES = 40;
let recentLogLines: string[] = [];

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ type, message }) => {
    console.log(`[ffmpeg:${type}] ${message}`);
    recentLogLines.push(message);
    if (recentLogLines.length > MAX_LOG_LINES) {
      recentLogLines.shift();
    }
  });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/** How many times to retry a failed download before giving up. */
const DOWNLOAD_RETRIES = 3;

/** Downloads a file, retrying transient network failures, and throws a clear error if it comes back empty. */
async function fetchFileChecked(url: string, label: string): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    let data: Uint8Array;
    try {
      data = await fetchFile(url);
    } catch (err) {
      lastErr = err;
      if (attempt < DOWNLOAD_RETRIES) {
        const delay = 1000 * attempt;
        console.log(
          `[ffmpeg] download of ${label} failed (attempt ${attempt}/${DOWNLOAD_RETRIES}), retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new Error(
        `Failed to download ${label}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
    if (!data || data.length === 0) {
      throw new Error(`Downloaded ${label} is empty (0 bytes) — the source URL may be invalid.`);
    }
    console.log(`[ffmpeg] downloaded ${label}: ${data.length} bytes`);
    return data;
  }
  throw new Error(
    `Failed to download ${label}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    { cause: lastErr }
  );
}

/** Runs an ffmpeg command, logging it and throwing a clear error (including recent ffmpeg output) on non-zero exit. */
async function execChecked(ffmpeg: FFmpeg, args: string[], label: string): Promise<void> {
  console.log(`[ffmpeg] running step "${label}": ffmpeg ${args.join(' ')}`);
  recentLogLines = [];
  const code = await ffmpeg.exec(args);
  if (code !== 0) {
    const tail = recentLogLines.slice(-10).join('\n');
    throw new Error(
      `ffmpeg step "${label}" failed with exit code ${code}${tail ? `:\n${tail}` : ''}`
    );
  }
}

/** Reads a file from ffmpeg's virtual filesystem and throws if it's empty. */
async function readFileChecked(ffmpeg: FFmpeg, name: string, label: string): Promise<Uint8Array> {
  const data = (await ffmpeg.readFile(name)) as Uint8Array;
  if (!data || data.length === 0) {
    throw new Error(`ffmpeg step "${label}" produced an empty file (${name}).`);
  }
  console.log(`[ffmpeg] step "${label}" produced ${name}: ${data.length} bytes`);
  return data;
}

/** Converts raw bytes to a `data:` URL, which (unlike blob URLs) survives page reloads in persisted state. */
function uint8ArrayToDataUrl(data: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Speeds up an audio file by the given factor while preserving pitch, using
 * ffmpeg's `atempo` filter (valid for factors between 0.5 and 2.0). Returns a
 * `data:` URL for the processed audio so it remains valid even if the page
 * is reloaded before later pipeline steps run.
 */
export async function speedUpAudio(audioUrl: string, speed = 1.5): Promise<string> {
  const ffmpeg = await getFFmpeg();

  const inputData = await fetchFileChecked(audioUrl, 'voiceover audio');
  await ffmpeg.writeFile('voice_in.mp3', inputData);

  await execChecked(
    ffmpeg,
    ['-i', 'voice_in.mp3', '-filter:a', `atempo=${speed}`, 'voice_out.mp3'],
    'speed up voiceover'
  );

  const output = await readFileChecked(ffmpeg, 'voice_out.mp3', 'speed up voiceover');
  const dataUrl = uint8ArrayToDataUrl(output, 'audio/mpeg');

  await ffmpeg.deleteFile('voice_in.mp3');
  await ffmpeg.deleteFile('voice_out.mp3');

  return dataUrl;
}
