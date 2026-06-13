export async function generateVoiceover(
  apiKey: string,
  voiceId: string,
  text: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('ElevenLabs API key is missing. Add it in Settings.');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errBody}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
