import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

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
 * Loops the Veo clip 3x (30s total), mutes its original audio track, and
 * merges in the ElevenLabs voiceover synced from the start.
 */
export async function buildFinalVideo(videoUrl: string, audioUrl: string): Promise<string> {
  const ffmpeg = await getFFmpeg();

  const videoData = await fetchFile(videoUrl);
  const audioData = await fetchFile(audioUrl);

  await ffmpeg.writeFile('input.mp4', videoData);
  await ffmpeg.writeFile('voiceover.mp3', audioData);

  await ffmpeg.exec([
    '-stream_loop',
    '2',
    '-i',
    'input.mp4',
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

  await ffmpeg.deleteFile('input.mp4');
  await ffmpeg.deleteFile('voiceover.mp3');
  await ffmpeg.deleteFile('output.mp4');

  return URL.createObjectURL(blob);
}
