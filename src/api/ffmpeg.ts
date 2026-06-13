import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { CaptionChunk, StockClip } from '../types';

const CORE_VERSION = '0.12.6';
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

const CAPTION_FONT_URL =
  'https://cdn.jsdelivr.net/gh/google/fonts/apache/roboto/Roboto-Bold.ttf';

let ffmpegInstance: FFmpeg | null = null;
let captionFontLoaded = false;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ type, message }) => {
    console.log(`[ffmpeg:${type}] ${message}`);
  });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/** Downloads a file and throws a clear error if it comes back empty. */
async function fetchFileChecked(url: string, label: string): Promise<Uint8Array> {
  let data: Uint8Array;
  try {
    data = await fetchFile(url);
  } catch (err) {
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

/** Runs an ffmpeg command, logging it and throwing a clear error on non-zero exit. */
async function execChecked(ffmpeg: FFmpeg, args: string[], label: string): Promise<void> {
  console.log(`[ffmpeg] running step "${label}": ffmpeg ${args.join(' ')}`);
  const code = await ffmpeg.exec(args);
  if (code !== 0) {
    throw new Error(`ffmpeg step "${label}" failed with exit code ${code}`);
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

/**
 * Speeds up an audio file by the given factor while preserving pitch, using
 * ffmpeg's `atempo` filter (valid for factors between 0.5 and 2.0). Returns a
 * blob URL for the processed audio.
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
  const blob = new Blob([new Uint8Array(output)], { type: 'audio/mpeg' });

  await ffmpeg.deleteFile('voice_in.mp3');
  await ffmpeg.deleteFile('voice_out.mp3');

  return URL.createObjectURL(blob);
}

async function ensureCaptionFont(ffmpeg: FFmpeg): Promise<void> {
  if (captionFontLoaded) return;
  const fontData = await fetchFileChecked(CAPTION_FONT_URL, 'caption font');
  await ffmpeg.writeFile('caption-font.ttf', fontData);
  captionFontLoaded = true;
}

/**
 * Builds a chained `drawtext` filter that burns each caption chunk onto the
 * frame during its timing window: bold white text with a thick black
 * outline, centered horizontally about 20% up from the bottom of the frame.
 */
async function buildCaptionFilter(ffmpeg: FFmpeg, captions: CaptionChunk[]): Promise<string> {
  await ensureCaptionFont(ffmpeg);

  const filters: string[] = [];
  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i];
    const fileName = `caption${i}.txt`;
    await ffmpeg.writeFile(fileName, new TextEncoder().encode(caption.text));
    filters.push(
      `drawtext=fontfile=caption-font.ttf:textfile=${fileName}:fontcolor=white:fontsize=64:` +
        `borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.8-(text_h/2):` +
        `enable='between(t,${caption.start},${caption.end})'`
    );
  }
  return filters.join(',');
}

/**
 * Trims each clip to its selected length, concatenates them in sequence,
 * mutes their audio, and merges in the voiceover synced from the start. The
 * output is looped/trimmed so its length exactly matches the voiceover's
 * real duration, with any caption chunks burned in as hardcoded subtitles.
 *
 * Every download and ffmpeg step is checked for non-empty output and a
 * non-zero exit code, so failures surface as a clear error instead of an
 * empty/zero-byte video file.
 */
export async function buildFinalVideo(
  clips: StockClip[],
  audioUrl: string,
  audioDuration: number,
  captions: CaptionChunk[] = []
): Promise<string> {
  if (clips.length === 0) {
    throw new Error('Cannot build the final video: no clips were provided.');
  }

  const ffmpeg = await getFFmpeg();

  const audioData = await fetchFileChecked(audioUrl, 'voiceover audio');
  await ffmpeg.writeFile('voiceover.mp3', audioData);

  const trimmedNames: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const inputName = `clip${i}.mp4`;
    const trimmedName = `trim${i}.mp4`;

    const clipData = await fetchFileChecked(clip.videoUrl, `clip ${i + 1} ("${clip.query}")`);
    await ffmpeg.writeFile(inputName, clipData);

    await execChecked(
      ffmpeg,
      [
        '-i',
        inputName,
        '-t',
        String(clip.duration),
        '-vf',
        'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-r',
        '30',
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        trimmedName,
      ],
      `trim clip ${i + 1} ("${clip.query}")`
    );
    await readFileChecked(ffmpeg, trimmedName, `trim clip ${i + 1} ("${clip.query}")`);

    await ffmpeg.deleteFile(inputName);
    trimmedNames.push(trimmedName);
  }

  const concatList = trimmedNames.map((name) => `file '${name}'`).join('\n');
  await ffmpeg.writeFile('concat.txt', concatList);

  await execChecked(
    ffmpeg,
    ['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'concat.mp4'],
    'concatenate clips'
  );
  await readFileChecked(ffmpeg, 'concat.mp4', 'concatenate clips');

  const captionFilter = captions.length > 0 ? await buildCaptionFilter(ffmpeg, captions) : null;

  // Loop the concatenated footage if needed and trim to the voiceover's exact
  // duration so the final video length always matches the audio precisely.
  // Burn in captions (if any) on the same pass.
  const mergeArgs = [
    '-stream_loop',
    '-1',
    '-i',
    'concat.mp4',
    '-i',
    'voiceover.mp3',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-t',
    String(audioDuration),
    ...(captionFilter ? ['-vf', captionFilter] : []),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    'output.mp4',
  ];
  await execChecked(ffmpeg, mergeArgs, 'merge clips with voiceover and captions');

  const output = await readFileChecked(ffmpeg, 'output.mp4', 'merge clips with voiceover');
  const blob = new Blob([new Uint8Array(output)], { type: 'video/mp4' });

  await ffmpeg.deleteFile('voiceover.mp3');
  await ffmpeg.deleteFile('concat.txt');
  await ffmpeg.deleteFile('concat.mp4');
  await ffmpeg.deleteFile('output.mp4');
  for (const name of trimmedNames) {
    await ffmpeg.deleteFile(name);
  }
  for (let i = 0; i < captions.length; i++) {
    await ffmpeg.deleteFile(`caption${i}.txt`);
  }

  return URL.createObjectURL(blob);
}
