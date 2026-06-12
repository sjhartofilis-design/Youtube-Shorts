import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { StockClip } from '../types';

const CORE_VERSION = '0.12.6';
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpegInstance: FFmpeg | null = null;

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

/**
 * Trims each Pexels clip to its calculated segment length, concatenates them
 * in sequence, mutes their audio, and merges in the ElevenLabs voiceover
 * synced from the start.
 */
export async function buildFinalVideo(clips: StockClip[], audioUrl: string): Promise<string> {
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

  await ffmpeg.exec([
    '-i',
    'concat.mp4',
    '-i',
    'voiceover.mp3',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    'output.mp4',
  ]);

  const output = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([new Uint8Array(output as Uint8Array)], { type: 'video/mp4' });

  await ffmpeg.deleteFile('voiceover.mp3');
  await ffmpeg.deleteFile('concat.txt');
  await ffmpeg.deleteFile('concat.mp4');
  await ffmpeg.deleteFile('output.mp4');
  for (const name of trimmedNames) {
    await ffmpeg.deleteFile(name);
  }

  return URL.createObjectURL(blob);
}
