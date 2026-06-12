const VEO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1:predictLongRunning';
const OPERATIONS_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface VeoStartResponse {
  name?: string;
}

interface VeoOperationResponse {
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: { video?: { uri?: string } }[];
    };
  };
}

export async function startVeoVideo(apiKey: string, prompt: string): Promise<string> {
  if (!apiKey) {
    throw new Error('Veo API key is missing. Add it in Settings.');
  }

  const response = await fetch(VEO_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio: '9:16',
        durationSeconds: 10,
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Veo API error (${response.status}): ${errBody}`);
  }

  const data: VeoStartResponse = await response.json();
  if (!data?.name) {
    throw new Error('Veo API did not return an operation name');
  }
  return data.name;
}

export async function pollVeoVideo(
  apiKey: string,
  operationName: string,
  onTick?: () => void
): Promise<string> {
  const statusUrl = `${OPERATIONS_BASE_URL}/${operationName}`;

  while (true) {
    const response = await fetch(statusUrl, {
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Veo status check error (${response.status}): ${errBody}`);
    }

    const data: VeoOperationResponse = await response.json();

    if (data.done) {
      if (data.error) {
        throw new Error(`Veo video generation failed: ${data.error.message ?? 'unknown error'}`);
      }
      const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) {
        throw new Error('Veo task succeeded but returned no video URI');
      }

      const videoResponse = await fetch(videoUri, {
        headers: { 'x-goog-api-key': apiKey },
      });
      if (!videoResponse.ok) {
        throw new Error(`Failed to download Veo video (${videoResponse.status})`);
      }
      const blob = await videoResponse.blob();
      return URL.createObjectURL(blob);
    }

    onTick?.();
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

export async function generateVeoVideo(
  apiKey: string,
  prompt: string,
  onTick?: () => void
): Promise<string> {
  const operationName = await startVeoVideo(apiKey, prompt);
  return pollVeoVideo(apiKey, operationName, onTick);
}
