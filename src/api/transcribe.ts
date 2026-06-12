import type { AutomaticSpeechRecognitionPipeline } from '@xenova/transformers';

const WHISPER_SAMPLE_RATE = 16000;

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

async function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    const { pipeline } = await import('@xenova/transformers');
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en'
    ) as Promise<AutomaticSpeechRecognitionPipeline>;
  }
  return transcriberPromise;
}

/** Decodes an audio file at the given URL to mono 16kHz PCM, as required by Whisper. */
async function decodeAudioTo16kMono(audioUrl: string): Promise<Float32Array> {
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();

  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE),
    WHISPER_SAMPLE_RATE
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  await audioCtx.close();
  return rendered.getChannelData(0);
}

/** Transcribes the voiceover audio and returns word-level timestamps via an in-browser Whisper model. */
export async function transcribeAudio(audioUrl: string): Promise<WordTimestamp[]> {
  const transcriber = await getTranscriber();
  const audioData = await decodeAudioTo16kMono(audioUrl);

  const result = await transcriber(audioData, {
    return_timestamps: 'word',
    chunk_length_s: 30,
  });

  const output = Array.isArray(result) ? result[0] : result;
  const chunks = (output as { chunks?: { text: string; timestamp: [number, number | null] }[] })
    .chunks;

  if (!chunks || chunks.length === 0) {
    throw new Error('Transcription did not return any word timestamps');
  }

  return chunks
    .map((chunk) => ({
      word: chunk.text.trim(),
      start: chunk.timestamp[0] ?? 0,
      end: chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0,
    }))
    .filter((w) => w.word.length > 0);
}
