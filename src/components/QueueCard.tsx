import { useState } from 'react';
import type { QueueItem, StockClip } from '../types';
import { VOICE_ID_MAP } from '../types';
import { useApp } from '../hooks/useApp';
import { selectClipsForVoiceover, selectReplacementClip } from '../api/pexels';
import { generateVoiceover } from '../api/elevenlabs';
import { speedUpAudio } from '../api/ffmpeg';
import { getAudioDuration } from '../utils/narration';
import { assetKeys, saveAsset, urlToBlob } from '../utils/storage';
import StatusBadge from './StatusBadge';

export default function QueueCard({ item }: { item: QueueItem }) {
  const { settings, updateQueueItem, removeFromQueue, usedClipIds, addUsedClipIds } = useApp();
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [downloadingClips, setDownloadingClips] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDelete = () => {
    const confirmed = window.confirm('Are you sure you want to delete this video?');
    if (!confirmed) return;
    removeFromQueue(item.id);
  };

  const fetchClips = async (extraExcludeIds: number[] = []): Promise<StockClip[]> => {
    const totalDuration = item.audioDuration ?? 0;
    const queries = item.stock_search_queries;

    const { clips, newUsedIds } = await selectClipsForVoiceover(
      settings.pexelsApiKey,
      queries,
      totalDuration,
      [...usedClipIds, ...extraExcludeIds]
    );
    addUsedClipIds(newUsedIds);
    return clips;
  };

  const handleGenerateVideo = async (retry = false) => {
    if (!item.audioDuration) return;
    updateQueueItem(item.id, { videoStatus: 'generating', videoError: undefined });
    try {
      const extraExcludeIds = retry && item.clips ? item.clips.map((c) => c.id) : [];
      const clips = await fetchClips(extraExcludeIds);
      updateQueueItem(item.id, {
        videoStatus: 'ready',
        clips,
        clipRank: retry ? item.clipRank + 1 : 0,
      });
    } catch (err) {
      updateQueueItem(item.id, {
        videoStatus: 'error',
        videoError: err instanceof Error ? err.message : 'Video clip search failed',
      });
    }
  };

  const handleTryDifferentClips = () => handleGenerateVideo(true);

  const handleReplaceClip = async (index: number) => {
    if (!item.clips) return;
    const clipToReplace = item.clips[index];
    setReplacingIndex(index);
    try {
      const excludeIds = [...usedClipIds, ...item.clips.map((c) => c.id)];
      const { clip, newUsedId } = await selectReplacementClip(
        settings.pexelsApiKey,
        clipToReplace.query,
        clipToReplace.duration,
        excludeIds
      );
      addUsedClipIds([newUsedId]);
      const updatedClips = item.clips.map((c, i) => (i === index ? clip : c));
      updateQueueItem(item.id, { clips: updatedClips });
    } catch (err) {
      updateQueueItem(item.id, {
        videoError: err instanceof Error ? err.message : 'Failed to replace clip',
      });
    } finally {
      setReplacingIndex(null);
    }
  };

  const handleGenerateVoiceover = async () => {
    updateQueueItem(item.id, { voiceoverStatus: 'generating', voiceoverError: undefined });
    try {
      const voiceStyle =
        item.category === 'space' ? settings.voiceStyleSpace : settings.voiceStyleAncientCiv;
      const voiceId = VOICE_ID_MAP[voiceStyle];
      const rawAudioUrl = await generateVoiceover(
        settings.elevenLabsApiKey,
        voiceId,
        item.narration
      );
      const audioUrl = await speedUpAudio(rawAudioUrl, 1.5);
      const audioDuration = await getAudioDuration(audioUrl);
      try {
        await saveAsset(assetKeys.audio(item.id), await urlToBlob(audioUrl));
      } catch (err) {
        console.warn('Failed to save voiceover to IndexedDB for persistence', err);
      }
      updateQueueItem(item.id, {
        voiceoverStatus: 'ready',
        audioUrl,
        audioDuration,
        videoStatus: 'idle',
        clips: undefined,
      });
    } catch (err) {
      updateQueueItem(item.id, {
        voiceoverStatus: 'error',
        voiceoverError: err instanceof Error ? err.message : 'Voiceover generation failed',
      });
    }
  };

  const handleDownloadClips = async () => {
    if (!item.clips?.length) return;
    setDownloadError(null);

    const safeTitle = item.title.replace(/[^a-z0-9]+/gi, '_');

    if (item.clips.length === 1) {
      const a = document.createElement('a');
      a.href = item.clips[0].videoUrl;
      a.download = `${safeTitle}_clip1.mp4`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    setDownloadingClips(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < item.clips.length; i++) {
        const clip = item.clips[i];
        const response = await fetch(clip.videoUrl);
        if (!response.ok) {
          throw new Error(`Failed to download clip ${i + 1} (HTTP ${response.status})`);
        }
        const blob = await response.blob();
        zip.file(`clip${i + 1}.mp4`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}_clips.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to download video clips');
    } finally {
      setDownloadingClips(false);
    }
  };

  const downloadsReady = item.voiceoverStatus === 'ready' && item.videoStatus === 'ready';

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="mb-1 inline-block rounded-full bg-violet-600/10 px-2 py-0.5 text-xs font-medium text-violet-300">
            {item.category === 'space' ? 'Space' : 'Ancient Civ'} · Channel {item.channel}
          </span>
          <h3 className="text-base font-semibold text-white">{item.title}</h3>
          <p className="mt-1 text-sm text-gray-400">{item.hook}</p>
        </div>
        <button
          onClick={handleDelete}
          title="Delete this video"
          className="shrink-0 rounded-md border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>

      {downloadsReady && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-400">
            ✓ Ready to Download
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={item.audioUrl}
              download={`${item.title.replace(/[^a-z0-9]+/gi, '_')}.mp3`}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500"
            >
              Download Voiceover
            </a>
            <button
              onClick={handleDownloadClips}
              disabled={downloadingClips}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-50"
            >
              {downloadingClips
                ? 'Zipping clips…'
                : item.clips && item.clips.length > 1
                  ? 'Download Video Clips (.zip)'
                  : 'Download Video Clip'}
            </button>
          </div>
          {downloadError && <p className="mt-2 text-xs text-red-400">{downloadError}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Voiceover */}
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Voiceover</span>
            <StatusBadge status={item.voiceoverStatus} />
          </div>
          {item.voiceoverStatus === 'ready' && item.audioUrl && (
            <div className="flex flex-col gap-1">
              <audio src={item.audioUrl} controls className="w-full" />
              {item.audioDuration && (
                <p className="text-xs text-gray-500">{item.audioDuration.toFixed(1)}s</p>
              )}
            </div>
          )}
          {item.voiceoverStatus === 'error' && (
            <p className="text-xs text-red-400">{item.voiceoverError}</p>
          )}
          <button
            onClick={handleGenerateVoiceover}
            disabled={item.voiceoverStatus === 'generating'}
            className="mt-auto rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {item.voiceoverStatus === 'error'
              ? 'Retry'
              : item.voiceoverStatus === 'ready'
                ? 'Regenerate Voiceover'
                : 'Generate Voiceover'}
          </button>
        </div>

        {/* Video Clips */}
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Video Clips</span>
            <StatusBadge status={item.videoStatus} />
          </div>
          {item.voiceoverStatus !== 'ready' && (
            <p className="text-xs text-gray-500">
              Generate the voiceover first to determine clip lengths.
            </p>
          )}
          {item.videoStatus === 'generating' && (
            <p className="text-xs text-gray-500">Searching Pexels and downloading clips…</p>
          )}
          {item.videoStatus === 'ready' && item.clips && (
            <div className="grid grid-cols-2 gap-2">
              {item.clips.map((clip, idx) => (
                <div key={`${clip.id}-${idx}`} className="flex flex-col gap-1">
                  {clip.thumbnailUrl && (
                    <img
                      src={clip.thumbnailUrl}
                      alt={clip.query}
                      className="aspect-[9/16] w-full rounded-md object-cover"
                    />
                  )}
                  <p className="truncate text-xs text-gray-400" title={clip.query}>
                    {clip.query}
                  </p>
                  <p className="text-xs text-gray-500">{clip.duration.toFixed(1)}s</p>
                  <button
                    onClick={() => handleReplaceClip(idx)}
                    disabled={replacingIndex !== null}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    {replacingIndex === idx ? 'Replacing…' : 'Replace'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {item.videoStatus === 'error' && (
            <p className="text-xs text-red-400">{item.videoError}</p>
          )}
          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={() => handleGenerateVideo(false)}
              disabled={item.voiceoverStatus !== 'ready' || item.videoStatus === 'generating'}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {item.videoStatus === 'error'
                ? 'Retry'
                : item.videoStatus === 'ready'
                  ? 'Regenerate Clips'
                  : 'Generate Video'}
            </button>
            {item.videoStatus === 'ready' && (
              <button
                onClick={handleTryDifferentClips}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:bg-white/10"
              >
                Try Different Clips
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
