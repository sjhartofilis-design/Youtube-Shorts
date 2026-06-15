import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

// This app has exactly one user account. Supabase Auth requires an email, so
// a fixed placeholder email is used as the account identity — the "password"
// the user sets/enters is the real Supabase Auth password for this account.
export const ACCOUNT_EMAIL = 'owner@shorts-automator.local';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Every visit should prompt for the password again, on any device.
    persistSession: false,
    autoRefreshToken: false,
  },
});

const ASSET_BUCKET = 'assets';

/** Uploads a file/blob to this user's folder in the assets bucket and returns its public URL. */
export async function uploadUserAsset(userId: string, path: string, file: Blob): Promise<string> {
  const fullPath = `${userId}/${path}`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(fullPath, file, { upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(fullPath);
  return data.publicUrl;
}

/** Deletes a file from this user's folder in the assets bucket, if it exists. */
export async function deleteUserAsset(userId: string, path: string): Promise<void> {
  await supabase.storage.from(ASSET_BUCKET).remove([`${userId}/${path}`]);
}

export const assetPaths = {
  audio: (queueItemId: string) => `audio/${queueItemId}.mp3`,
  video: (queueItemId: string) => `video/${queueItemId}.mp4`,
  backgroundAudio: () => `background-audio`,
};
