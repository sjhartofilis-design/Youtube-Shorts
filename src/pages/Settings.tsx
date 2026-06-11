import { useState } from 'react';
import { useApp } from '../hooks/useApp';
import { startGoogleOAuth } from '../api/youtube';

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(key.length - 8, 4))}${key.slice(-4)}`;
}

export default function Settings() {
  const { settings, setSettings } = useApp();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    setSettings(form);
    setSaved(true);
  };

  const handleConnectYouTube = async () => {
    setOauthError(null);
    setConnecting(true);
    try {
      const token = await startGoogleOAuth(form.youtubeClientId);
      update('youtubeAccessToken', token);
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to connect to YouTube');
    } finally {
      setConnecting(false);
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
            />
            <Field
              label="Kling API Key"
              value={form.klingApiKey}
              onChange={(v) => update('klingApiKey', v)}
              placeholder="kling-..."
            />
            <Field
              label="ElevenLabs API Key"
              value={form.elevenLabsApiKey}
              onChange={(v) => update('elevenLabsApiKey', v)}
              placeholder="el-..."
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
              onChange={(v) => update('voiceStyleSpace', v as 'dramatic' | 'authoritative')}
              options={[
                { value: 'dramatic', label: 'Dramatic' },
                { value: 'authoritative', label: 'Authoritative' },
              ]}
            />
            <SelectField
              label="Ancient Civ Content Voice"
              value={form.voiceStyleAncientCiv}
              onChange={(v) => update('voiceStyleAncientCiv', v as 'dramatic' | 'authoritative')}
              options={[
                { value: 'dramatic', label: 'Dramatic' },
                { value: 'authoritative', label: 'Authoritative' },
              ]}
            />
            <SelectField
              label="Feel Good Content Voice"
              value={form.voiceStyleFeelGood}
              onChange={(v) => update('voiceStyleFeelGood', v as 'warm' | 'emotional')}
              options={[
                { value: 'warm', label: 'Warm' },
                { value: 'emotional', label: 'Emotional' },
              ]}
            />
            <p className="text-xs text-gray-500">
              Dramatic / Authoritative → ElevenLabs voice ErXwobaYiN019PkySvjV. Warm / Emotional →
              ElevenLabs voice EXAVITQu4vr4xnSDxMaL.
            </p>
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
          <div className="flex flex-col gap-4">
            <Field
              label="Google OAuth Client ID"
              value={form.youtubeClientId}
              onChange={(v) => update('youtubeClientId', v)}
              placeholder="xxxx.apps.googleusercontent.com"
            />
            <Field
              label="Google OAuth Client Secret"
              value={form.youtubeClientSecret}
              onChange={(v) => update('youtubeClientSecret', v)}
              placeholder="optional, not used in implicit flow"
            />
            <button
              onClick={handleConnectYouTube}
              disabled={connecting}
              className="self-start rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
            >
              {connecting
                ? 'Connecting…'
                : form.youtubeAccessToken
                  ? 'Reconnect with Google'
                  : 'Connect with Google'}
            </button>
            {form.youtubeAccessToken && (
              <p className="text-xs text-green-400">
                Connected — access token: {maskKey(form.youtubeAccessToken)}
              </p>
            )}
            {oauthError && <p className="text-xs text-red-400">{oauthError}</p>}
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
              <li>Kling: {maskKey(form.klingApiKey) || '—'}</li>
              <li>ElevenLabs: {maskKey(form.elevenLabsApiKey) || '—'}</li>
              <li>YouTube Access Token: {maskKey(form.youtubeAccessToken) || '—'}</li>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-200">{label}</span>
      <input
        type="password"
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
