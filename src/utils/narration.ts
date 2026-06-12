/** Returns the exact duration (in seconds) of an audio file at the given URL. */
export function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => reject(new Error('Failed to read voiceover audio duration'));
    audio.src = url;
  });
}
