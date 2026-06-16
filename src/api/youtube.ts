const CHANNELS_URL =
  'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';

export interface ChannelInfo {
  name: string;
  pictureUrl: string;
}

export async function getChannelInfo(accessToken: string): Promise<ChannelInfo> {
  const res = await fetch(CHANNELS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube channel fetch error (${res.status}): ${body}`);
  }
  const data = await res.json();
  const snippet = data?.items?.[0]?.snippet;
  if (!snippet) throw new Error('No YouTube channel found for this account.');
  return {
    name: snippet.title as string,
    pictureUrl: (snippet.thumbnails?.default?.url ?? '') as string,
  };
}

const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

/**
 * Opens the Google OAuth consent screen in a popup using the implicit grant
 * flow and resolves with the access token once the user authorizes.
 */
export function startGoogleOAuth(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('Google OAuth Client ID is missing. Add it in Settings.'));
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: YOUTUBE_UPLOAD_SCOPE,
      include_granted_scopes: 'true',
      prompt: 'consent',
      state: 'youtube_shorts_dashboard',
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    const popup = window.open(authUrl, 'google-oauth', 'width=500,height=650');

    if (!popup) {
      reject(new Error('Popup was blocked. Allow popups and try again.'));
      return;
    }

    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          reject(new Error('Authorization window was closed before completing.'));
          return;
        }

        const url = popup.location.href;
        if (url.startsWith(redirectUri)) {
          const hash = new URL(url).hash.replace(/^#/, '');
          const hashParams = new URLSearchParams(hash);
          const accessToken = hashParams.get('access_token');
          clearInterval(interval);
          popup.close();
          if (accessToken) {
            resolve(accessToken);
          } else {
            reject(new Error('Google did not return an access token.'));
          }
        }
      } catch {
        // Ignore cross-origin access errors while the popup is on Google's domain
      }
    }, 500);
  });
}

interface UploadShortOptions {
  accessToken: string;
  videoUrl: string;
  title: string;
  hashtags: string[];
  description?: string;
  scheduledTime?: string; // ISO string; if provided, video is uploaded as private+scheduled
}

export async function uploadShort({
  accessToken,
  videoUrl,
  title,
  hashtags,
  description = '',
  scheduledTime,
}: UploadShortOptions): Promise<string> {
  if (!accessToken) {
    throw new Error('YouTube is not authorized. Connect your account in Settings.');
  }

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to fetch generated video (${videoResponse.status})`);
  }
  const videoBlob = await videoResponse.blob();

  const fullDescription = `${description}\n\n${hashtags.join(' ')} #shorts`.trim();

  const status: Record<string, unknown> = scheduledTime
    ? { privacyStatus: 'private', publishAt: new Date(scheduledTime).toISOString() }
    : { privacyStatus: 'public' };

  const metadata = {
    snippet: {
      title,
      description: fullDescription,
      tags: hashtags.map((tag) => tag.replace(/^#/, '')),
      categoryId: '22',
    },
    status,
  };

  const boundary = '-------youtube-shorts-dashboard-boundary';
  const metadataPart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n`;
  const videoPartHeader =
    `--${boundary}\r\n` + `Content-Type: ${videoBlob.type || 'video/mp4'}\r\n\r\n`;
  const closingBoundary = `\r\n--${boundary}--`;

  const body = new Blob([metadataPart, videoPartHeader, videoBlob, closingBoundary]);

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`YouTube upload error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (!data?.id) {
    throw new Error('YouTube API did not return a video ID');
  }
  return data.id as string;
}
