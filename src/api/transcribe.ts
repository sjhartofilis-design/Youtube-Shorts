export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface ScribeWord {
  text: string;
  start: number;
  end: number;
  type?: string;
}

interface ScribeResponse {
  words?: ScribeWord[];
}

/** Transcribes the voiceover audio and returns word-level timestamps via the ElevenLabs Scribe API. */
export async function transcribeAudio(apiKey: string, audioUrl: string): Promise<WordTimestamp[]> {
  if (!apiKey) {
    throw new Error('ElevenLabs API key is missing. Add it in Settings.');
  }

  const audioBlob = await (await fetch(audioUrl)).blob();

  const formData = new FormData();
  formData.append('model_id', 'scribe_v1');
  formData.append('timestamps_granularity', 'word');
  formData.append('file', audioBlob, 'voiceover.mp3');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`ElevenLabs Scribe API error (${response.status}): ${errBody}`);
  }

  const data: ScribeResponse = await response.json();
  const words = (data.words ?? []).filter((w) => !w.type || w.type === 'word');

  if (words.length === 0) {
    throw new Error('Transcription did not return any word timestamps');
  }

  return words.map((w) => ({
    word: w.text.trim(),
    start: w.start,
    end: w.end,
  }));
}
