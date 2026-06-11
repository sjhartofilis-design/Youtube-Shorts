import { useState } from 'react';
import type { Script, ScriptCategory } from '../types';
import { generateScripts } from '../api/claude';
import { useApp } from '../hooks/useApp';
import ScriptCard from '../components/ScriptCard';

export default function Scripts() {
  const { settings } = useApp();
  const [spaceScripts, setSpaceScripts] = useState<Script[]>([]);
  const [ancientScripts, setAncientScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState<ScriptCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (category: ScriptCategory) => {
    setLoading(category);
    setError(null);
    try {
      const scripts = await generateScripts(settings.anthropicApiKey, category);
      if (category === 'space') {
        setSpaceScripts(scripts);
      } else {
        setAncientScripts(scripts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate scripts');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-white">Scripts</h1>
      <p className="mb-6 text-sm text-gray-400">
        Generate viral YouTube Shorts scripts with Claude.
      </p>

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          onClick={() => handleGenerate('space')}
          disabled={loading !== null}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading === 'space' ? 'Generating Space Scripts…' : 'Generate Space Scripts'}
        </button>
        <button
          onClick={() => handleGenerate('ancientciv')}
          disabled={loading !== null}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading === 'ancientciv'
            ? 'Generating Ancient Civ Scripts…'
            : 'Generate Ancient Civ Scripts'}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {spaceScripts.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-white">Space Scripts</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {spaceScripts.map((script, i) => (
              <ScriptCard
                key={i}
                script={script}
                category="space"
                onChange={(updated) =>
                  setSpaceScripts((prev) => prev.map((s, idx) => (idx === i ? updated : s)))
                }
              />
            ))}
          </div>
        </section>
      )}

      {ancientScripts.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-white">Ancient Civ Scripts</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ancientScripts.map((script, i) => (
              <ScriptCard
                key={i}
                script={script}
                category="ancientciv"
                onChange={(updated) =>
                  setAncientScripts((prev) => prev.map((s, idx) => (idx === i ? updated : s)))
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
