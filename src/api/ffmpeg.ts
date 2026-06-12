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
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

async function ensureCaptionFont(ffmpeg: FFmpeg): Promise<void> {
  if (captionFontLoaded) return;
  const fontData = await fetchFile(CAPTION_FONT_URL);
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
 * Trims each Pexels clip to its calculated segment length, concatenates them
 * in sequence, mutes their audio, and merges in the ElevenLabs voiceover
 * synced from the start. The output is looped/trimmed so its length exactly
 * matches the voiceover's real duration, with any caption chunks burned in
 * as hardcoded subtitles.
 */
export async function buildFinalVideo(
  clips: StockClip[],
  audioUrl: string,
  audioDuration: number,
  captions: CaptionChunk[] = []
): Promise<string> {
  const ffmpeg = await getFFmpeg();

  const audioData = await fetchFile(audioUrl);
  await ffmpeg.writeFile('voiceover.mp3', audioData);

  const trimmedNames: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const inputName = `clip${i}.mp4`;
    const trimmedName = `trim${i}.mp4`;

    const clipData = await fetchFile(clip.videoUrl);
    await ffmpeg.writeFile(inputName, clipData);

    await ffmpeg.exec([
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
    ]);

    await ffmpeg.deleteFile(inputName);
    trimmedNames.push(trimmedName);
  }

  const concatList = trimmedNames.map((name) => `file '${name}'`).join('\n');
  await ffmpeg.writeFile('concat.txt', concatList);

  await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'concat.mp4']);

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
  await ffmpeg.exec(mergeArgs);

  const output = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([new Uint8Array(output as Uint8Array)], { type: 'video/mp4' });

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
