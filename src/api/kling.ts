const KLING_BASE_URL = 'https://api.klingai.com/v1/videos/text2video';

interface KlingCreateResponse {
  data?: {
    task_id?: string;
  };
}

interface KlingStatusResponse {
  data?: {
    task_status?: string;
    task_result?: {
      videos?: { url: string }[];
    };
  };
}

export async function startKlingVideo(apiKey: string, prompt: string): Promise<string> {
  if (!apiKey) {
    throw new Error('Kling API key is missing. Add it in Settings.');
  }

  const response = await fetch(KLING_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '9:16',
      duration: 5,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Kling API error (${response.status}): ${errBody}`);
  }

  const data: KlingCreateResponse = await response.json();
  const taskId = data?.data?.task_id;
  if (!taskId) {
    throw new Error('Kling API did not return a task_id');
  }
  return taskId;
}

export async function pollKlingVideo(
  apiKey: string,
  taskId: string,
  onTick?: () => void
): Promise<string> {
  const statusUrl = `${KLING_BASE_URL}/${taskId}`;

  while (true) {
    const response = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Kling status check error (${response.status}): ${errBody}`);
    }

    const data: KlingStatusResponse = await response.json();
    const status = data?.data?.task_status;

    if (status === 'succeed') {
      const videoUrl = data?.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl) {
        throw new Error('Kling task succeeded but returned no video URL');
      }
      return videoUrl;
    }

    if (status === 'failed') {
      throw new Error('Kling video generation failed');
    }

    onTick?.();
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

export async function generateKlingVideo(
  apiKey: string,
  prompt: string,
  onTick?: () => void
): Promise<string> {
  const taskId = await startKlingVideo(apiKey, prompt);
  return pollKlingVideo(apiKey, taskId, onTick);
}
