const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_SCOPE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}

// ─── OAuth types ───────────────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms timestamp
}

// ─── Google OAuth popup (auth code + PKCE flow) ───────────────────────────────

export function startGoogleOAuth(clientId: string, clientSecret: string): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('Google OAuth Client ID is missing. Add it in Settings.'));
      return;
    }
    if (!clientSecret) {
      reject(new Error('Google OAuth Client Secret is missing. Add it in Settings.'));
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;

    generatePKCE().then(({ codeVerifier, codeChallenge }) => {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: YOUTUBE_SCOPE,
        access_type: 'offline',
        prompt: 'consent', // forces refresh_token to be returned every time
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'youtube_shorts_dashboard',
      });

      const popup = window.open(
        `${GOOGLE_AUTH_URL}?${params}`,
        'google-oauth',
        'width=500,height=650',
      );

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
            const searchParams = new URL(url).searchParams;
            const code = searchParams.get('code');
            const error = searchParams.get('error');
            clearInterval(interval);
            popup.close();

            if (error || !code) {
              reject(new Error(error ?? 'Google did not return an authorization code.'));
              return;
            }

            // Exchange authorization code for tokens
            const body = new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
              code_verifier: codeVerifier,
            });

            fetch(TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body,
            })
              .then((r) => r.json())
              .then((data) => {
                if (data.error) {
                  reject(new Error(`Token exchange failed: ${data.error_description ?? data.error}`));
                  return;
                }
                resolve({
                  accessToken: data.access_token as string,
                  refreshToken: data.refresh_token as string,
                  expiresAt: Date.now() + (data.expires_in as number) * 1000,
                });
              })
              .catch((err: unknown) => {
                reject(err instanceof Error ? err : new Error('Token exchange failed'));
              });
          }
        } catch {
          // Ignore cross-origin errors while popup is on Google's domain
        }
      }, 500);
    });
  });
}

// ─── Refresh access token using stored refresh token ──────────────────────────

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? res.status}`);
  }

  return {
    accessToken: data.access_token as string,
    expiresAt: Date.now() + (data.expires_in as number) * 1000,
  };
}

// ─── Channel info ─────────────────────────────────────────────────────────────

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

// ─── Upload ───────────────────────────────────────────────────────────────────

interface UploadShortOptions {
  accessToken: string;
  videoUrl: string;
  title: string;
  hashtags: string[];
  description?: string;
  scheduledTime?: string;
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
  const videoPartHeader = `--${boundary}\r\n` + `Content-Type: ${videoBlob.type || 'video/mp4'}\r\n\r\n`;
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
  if (!data?.id) throw new Error('YouTube API did not return a video ID');
  return data.id as string;
}
