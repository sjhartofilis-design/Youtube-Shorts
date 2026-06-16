import { useState, type ChangeEvent } from 'react';
import { useApp } from '../hooks/useApp';
import { startGoogleOAuth, getChannelInfo } from '../api/youtube';
import { assetPaths, uploadUserAsset } from '../api/supabase';
import { VOICE_STYLE_OPTIONS, type VoiceStyle } from '../types';

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(key.length - 8, 4))}${key.slice(-4)}`;
}

export default function Settings() {
  const { userId, settings, setSettings, clearSavedData, changePassword } = useApp();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [oauthErrorSpace, setOauthErrorSpace] = useState<string | null>(null);
  const [connectingSpace, setConnectingSpace] = useState(false);
  const [oauthErrorAncientCiv, setOauthErrorAncientCiv] = useState<string | null>(null);
  const [connectingAncientCiv, setConnectingAncientCiv] = useState(false);
  const [dataCleared, setDataCleared] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    setSettings(form);
    setSaved(true);
  };

  const handleClearSavedData = async () => {
    const confirmed = window.confirm(
      'This will permanently delete all saved voiceover audio and uploaded final videos for queue ' +
        'items. Their statuses will revert to "not generated"/"not uploaded", but the scripts ' +
        'themselves will remain. Continue?'
    );
    if (!confirmed) return;
    setClearingData(true);
    setDataCleared(false);
    try {
      await clearSavedData();
      setDataCleared(true);
    } finally {
      setClearingData(false);
    }
  };

  const handleConnectYouTube = async (channel: 'space' | 'ancientciv') => {
    const setError = channel === 'space' ? setOauthErrorSpace : setOauthErrorAncientCiv;
    const setConnecting = channel === 'space' ? setConnectingSpace : setConnectingAncientCiv;
    setError(null);
    setConnecting(true);
    try {
      const tokens = await startGoogleOAuth(form.youtubeClientId, form.youtubeClientSecret);
      const info = await getChannelInfo(tokens.accessToken);
      if (channel === 'space') {
        setForm((prev) => ({
          ...prev,
          youtubeAccessTokenSpace: tokens.accessToken,
          youtubeRefreshTokenSpace: tokens.refreshToken,
          youtubeTokenExpiresAtSpace: tokens.expiresAt,
          youtubeChannelNameSpace: info.name,
          youtubeChannelPicSpace: info.pictureUrl,
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          youtubeAccessTokenAncientCiv: tokens.accessToken,
          youtubeRefreshTokenAncientCiv: tokens.refreshToken,
          youtubeTokenExpiresAtAncientCiv: tokens.expiresAt,
          youtubeChannelNameAncientCiv: info.name,
          youtubeChannelPicAncientCiv: info.pictureUrl,
        }));
      }
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to YouTube');
    } finally {
      setConnecting(false);
    }
  };

  const handleBackgroundAudioUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAudioUploadError(null);
    setUploadingAudio(true);
    try {
      const url = await uploadUserAsset(userId, assetPaths.backgroundAudio(), file);
      update('backgroundAudioUrl', url);
    } catch (err) {
      setAudioUploadError(err instanceof Error ? err.message : 'Failed to upload audio track');
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordChanged(false);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(newPassword);
      setPasswordChanged(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-white">Settings</h1>
      <p className="mb-6 text-sm text-gray-400">
        API keys are stored only in this browser session and are sent only to their respective
        APIs.
      </p>

      <div className="flex flex-col gap-6">
        {/* API Keys */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">API Keys</h2>
          <div className="flex flex-col gap-4">
            <Field
              label="Anthropic API Key"
              value={form.anthropicApiKey}
              onChange={(v) => update('anthropicApiKey', v)}
              placeholder="sk-ant-..."
              secret
            />
            <Field
              label="Pexels API Key"
              value={form.pexelsApiKey}
              onChange={(v) => update('pexelsApiKey', v)}
              placeholder="get a free key at pexels.com/api"
              secret
            />
            <Field
              label="ElevenLabs API Key"
              value={form.elevenLabsApiKey}
              onChange={(v) => update('elevenLabsApiKey', v)}
              placeholder="el-..."
              secret
            />
          </div>
        </section>

        {/* Voice Settings */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">Voices</h2>
          <div className="flex flex-col gap-4">
            <SelectField
              label="Space Content Voice"
              value={form.voiceStyleSpace}
              onChange={(v) => update('voiceStyleSpace', v as VoiceStyle)}
              options={VOICE_STYLE_OPTIONS}
            />
            <SelectField
              label="Ancient Civ Content Voice"
              value={form.voiceStyleAncientCiv}
              onChange={(v) => update('voiceStyleAncientCiv', v as VoiceStyle)}
              options={VOICE_STYLE_OPTIONS}
            />
            <SelectField
              label="Feel Good Content Voice"
              value={form.voiceStyleFeelGood}
              onChange={(v) => update('voiceStyleFeelGood', v as VoiceStyle)}
              options={VOICE_STYLE_OPTIONS}
            />
            <p className="text-xs text-gray-500">
              Each tone maps to a distinct ElevenLabs voice — pick whichever fits the channel
              best.
            </p>
          </div>
        </section>

        {/* Background Music */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">Background Music</h2>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">
              Optional background audio track to use when editing your videos.
            </p>
            {form.backgroundAudioUrl && (
              <audio src={form.backgroundAudioUrl} controls className="w-full" />
            )}
            {audioUploadError && <p className="text-xs text-red-400">{audioUploadError}</p>}
            <label className="self-start cursor-pointer rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500">
              {uploadingAudio
                ? 'Uploading…'
                : form.backgroundAudioUrl
                  ? 'Replace Track'
                  : 'Upload Track'}
              <input
                type="file"
                accept="audio/*"
                onChange={handleBackgroundAudioUpload}
                disabled={uploadingAudio}
                className="hidden"
              />
            </label>
          </div>
        </section>

        {/* Channels */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">Channels</h2>
          <div className="flex flex-col gap-4">
            <Field
              label="Channel 1 Name (Space scripts)"
              value={form.channel1Name}
              onChange={(v) => update('channel1Name', v)}
              placeholder="e.g. Cosmic Shorts"
            />
            <Field
              label="Channel 2 Name (Ancient Civ scripts)"
              value={form.channel2Name}
              onChange={(v) => update('channel2Name', v)}
              placeholder="e.g. Forgotten History"
            />
          </div>
        </section>

        {/* YouTube OAuth */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">YouTube Authorization</h2>
          <div className="flex flex-col gap-6">
            <Field
              label="Google OAuth Client ID"
              value={form.youtubeClientId}
              onChange={(v) => update('youtubeClientId', v)}
              placeholder="xxxx.apps.googleusercontent.com"
              secret
            />
            <Field
              label="Google OAuth Client Secret"
              value={form.youtubeClientSecret}
              onChange={(v) => update('youtubeClientSecret', v)}
              placeholder="GOCSPX-..."
              secret
            />
            <p className="text-xs text-gray-500">
              The client secret is used once during setup to obtain a permanent refresh token. It is
              stored in your private Supabase account and never sent anywhere except Google's servers.
            </p>

            {/* Space channel */}
            <div className="flex flex-col gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                <span className="text-sm font-semibold text-white">Space Channel</span>
              </div>
              {form.youtubeChannelNameSpace ? (
                <div className="flex items-center gap-3">
                  {form.youtubeChannelPicSpace && (
                    <img
                      src={form.youtubeChannelPicSpace}
                      alt={form.youtubeChannelNameSpace}
                      className="h-8 w-8 rounded-full"
                    />
                  )}
                  <div>
                    <p className="text-sm text-gray-200">{form.youtubeChannelNameSpace}</p>
                    <p className="text-xs text-green-400">Connected ✓</p>
                  </div>
                </div>
              ) : null}
              <button
                onClick={() => handleConnectYouTube('space')}
                disabled={connectingSpace || !form.youtubeClientId}
                className="self-start rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
              >
                {connectingSpace
                  ? 'Connecting…'
                  : form.youtubeAccessTokenSpace
                    ? 'Reconnect Space Channel'
                    : 'Connect Space Channel'}
              </button>
              {oauthErrorSpace && <p className="text-xs text-red-400">{oauthErrorSpace}</p>}
            </div>

            {/* Ancient Civ channel */}
            <div className="flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-sm font-semibold text-white">Ancient Civ Channel</span>
              </div>
              {form.youtubeChannelNameAncientCiv ? (
                <div className="flex items-center gap-3">
                  {form.youtubeChannelPicAncientCiv && (
                    <img
                      src={form.youtubeChannelPicAncientCiv}
                      alt={form.youtubeChannelNameAncientCiv}
                      className="h-8 w-8 rounded-full"
                    />
                  )}
                  <div>
                    <p className="text-sm text-gray-200">{form.youtubeChannelNameAncientCiv}</p>
                    <p className="text-xs text-green-400">Connected ✓</p>
                  </div>
                </div>
              ) : null}
              <button
                onClick={() => handleConnectYouTube('ancientciv')}
                disabled={connectingAncientCiv || !form.youtubeClientId}
                className="self-start rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
              >
                {connectingAncientCiv
                  ? 'Connecting…'
                  : form.youtubeAccessTokenAncientCiv
                    ? 'Reconnect Ancient Civ Channel'
                    : 'Connect Ancient Civ Channel'}
              </button>
              {oauthErrorAncientCiv && (
                <p className="text-xs text-red-400">{oauthErrorAncientCiv}</p>
              )}
            </div>
          </div>
        </section>

        {/* Storage */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">Storage</h2>
          <p className="mb-4 text-sm text-gray-400">
            Generated voiceovers and uploaded final videos are saved to your account so they're
            available on every device. If storage gets too large or you want to start fresh,
            clear it here — the queue items themselves won't be deleted.
          </p>
          <button
            onClick={handleClearSavedData}
            disabled={clearingData}
            className="self-start rounded-lg border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            {clearingData ? 'Clearing…' : 'Clear Saved Data'}
          </button>
          {dataCleared && (
            <p className="mt-2 text-sm text-green-400">Saved voiceovers and videos cleared ✓</p>
          )}
        </section>

        {/* Account */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">Account</h2>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Change the password used to access this dashboard from any device.
            </p>
            <Field
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="At least 8 characters"
              secret
            />
            <Field
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Re-enter new password"
              secret
            />
            {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
            {passwordChanged && (
              <p className="text-xs text-green-400">Password changed ✓</p>
            )}
            <button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="self-start rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            >
              {changingPassword ? 'Changing…' : 'Change Password'}
            </button>
          </div>
        </section>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Save
          </button>
          {saved && <span className="text-sm text-green-400">Settings saved ✓</span>}
        </div>

        {saved && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-base font-semibold text-white">Saved Keys (Preview)</h2>
            <ul className="flex flex-col gap-2 text-sm text-gray-300">
              <li>Anthropic: {maskKey(form.anthropicApiKey) || '—'}</li>
              <li>Pexels: {maskKey(form.pexelsApiKey) || '—'}</li>
              <li>ElevenLabs: {maskKey(form.elevenLabsApiKey) || '—'}</li>
              <li>YouTube (Space): {maskKey(form.youtubeAccessTokenSpace) || '—'}</li>
              <li>YouTube (Ancient Civ): {maskKey(form.youtubeAccessTokenAncientCiv) || '—'}</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-200">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
