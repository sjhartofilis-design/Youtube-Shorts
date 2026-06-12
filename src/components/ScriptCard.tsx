import { useState } from 'react';
import type { Script, ScriptCategory } from '../types';
import { generateScripts } from '../api/claude';
import { useApp } from '../hooks/useApp';

interface ScriptCardProps {
  script: Script;
  category: ScriptCategory;
  onChange: (script: Script) => void;
}

export default function ScriptCard({ script, category, onChange }: ScriptCardProps) {
  const { settings, addToQueue } = useApp();
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const [newScript] = await generateScripts(settings.anthropicApiKey, category, true);
      onChange(newScript);
      setAdded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate script');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddToQueue = () => {
    const channel = category === 'space' ? 1 : 2;
    addToQueue({
      ...script,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      channel,
      videoStatus: 'idle',
      voiceoverStatus: 'idle',
      processStatus: 'not_processed',
      postStatus: 'idle',
    });
    setAdded(true);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div>
        <span className="mb-1 inline-block text-xs font-semibold uppercase tracking-wide text-violet-400">
          Hook
        </span>
        <p className="text-sm font-medium text-white">{script.hook}</p>
      </div>

      <div>
        <span className="mb-1 inline-block text-xs font-semibold uppercase tracking-wide text-violet-400">
          Title
        </span>
        <p className="text-sm text-gray-200">{script.title}</p>
      </div>

      <div>
        <span className="mb-1 inline-block text-xs font-semibold uppercase tracking-wide text-violet-400">
          Narration
        </span>
        <p className="text-sm leading-relaxed text-gray-300">{script.narration}</p>
      </div>

      <div>
        <span className="mb-1 inline-block text-xs font-semibold uppercase tracking-wide text-violet-400">
          Video Prompt
        </span>
        <p className="text-sm leading-relaxed text-gray-400">{script.video_prompt}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {script.hashtags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-violet-600/10 px-2.5 py-0.5 text-xs font-medium text-violet-300"
          >
            {tag.startsWith('#') ? tag : `#${tag}`}
          </span>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="mt-2 flex gap-2">
        <button
          onClick={handleAddToQueue}
          className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
        >
          {added ? 'Added ✓' : 'Add to Queue'}
        </button>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>
    </div>
  );
}
