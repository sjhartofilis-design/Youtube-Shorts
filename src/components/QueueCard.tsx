import { useEffect, useState } from 'react';
import type { ProcessStatus, QueueItem, StockClip } from '../types';
import { VOICE_ID_MAP } from '../types';
import { useApp } from '../hooks/useApp';
import { findStockClip } from '../api/pexels';
import { generateVoiceover } from '../api/elevenlabs';
import { buildFinalVideo } from '../api/ffmpeg';
import { uploadShort } from '../api/youtube';
import { estimateNarrationSeconds } from '../utils/narration';
import StatusBadge from './StatusBadge';

const PROCESS_STATUS_LABELS: Record<ProcessStatus, string> = {
  not_processed: 'Not Processed',
  processing: 'Processing',
  ready: 'Ready',
  error: 'Error',
};

export default function QueueCard({ item }: { item: QueueItem }) {
  const { settings, updateQueueItem } = useApp();
  const [scheduledTime, setScheduledTime] = useState('');

  const fetchClips = async (rank: number): Promise<StockClip[]> => {
    const totalDuration = estimateNarrationSeconds(item.narration);
    const queries = item.stock_search_queries;
    const segmentDuration = totalDuration / queries.length;

    const clips: StockClip[] = [];
    for (const query of queries) {
      const result = await findStockClip(settings.pexelsApiKey, query, rank);
      clips.push({
        query,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        duration: Math.min(segmentDuration, result.sourceDuration),
        sourceDuration: result.sourceDuration,
      });
    }
    return clips;
  };

  const handleGenerateVideo = async (rank = 0) => {
    updateQueueItem(item.id, { videoStatus: 'generating', videoError: undefined });
    try {
      const clips = await fetchClips(rank);
      updateQueueItem(item.id, {
        videoStatus: 'ready',
        clips,
        clipRank: rank,
        processStatus: 'not_processed',
        finalVideoUrl: undefined,
        processError: undefined,
      });
    } catch (err) {
      updateQueueItem(item.id, {
        videoStatus: 'error',
        videoError: err instanceof Error ? err.message : 'Video clip search failed',
      });
    }
  };

  const handleTryDifferentClips = () => handleGenerateVideo(item.clipRank + 1);

  const handleGenerateVoiceover = async () => {
    updateQueueItem(item.id, { voiceoverStatus: 'generating', voiceoverError: undefined });
    try {
      const voiceStyle =
        item.category === 'space' ? settings.voiceStyleSpace : settings.voiceStyleAncientCiv;
      const voiceId = VOICE_ID_MAP[voiceStyle];
      const audioUrl = await generateVoiceover(settings.elevenLabsApiKey, voiceId, item.narration);
      updateQueueItem(item.id, {
        voiceoverStatus: 'ready',
        audioUrl,
        processStatus: 'not_processed',
        finalVideoUrl: undefined,
        processError: undefined,
      });
    } catch (err) {
      updateQueueItem(item.id, {
        voiceoverStatus: 'error',
        voiceoverError: err instanceof Error ? err.message : 'Voiceover generation failed',
      });
    }
  };

  const handleProcess = async () => {
    if (!item.clips?.length || !item.audioUrl) return;
    updateQueueItem(item.id, { processStatus: 'processing', processError: undefined });
    try {
      const finalVideoUrl = await buildFinalVideo(item.clips, item.audioUrl);
      updateQueueItem(item.id, { processStatus: 'ready', finalVideoUrl });
    } catch (err) {
      updateQueueItem(item.id, {
        processStatus: 'error',
        processError: err instanceof Error ? err.message : 'Video processing failed',
      });
    }
  };

  // Automatically build the final video once both the clips and the
  // voiceover are ready.
  useEffect(() => {
    if (
      item.videoStatus === 'ready' &&
      item.voiceoverStatus === 'ready' &&
      item.processStatus === 'not_processed'
    ) {
      handleProcess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.videoStatus, item.voiceoverStatus, item.processStatus]);

  const handlePost = async (publishNow: boolean) => {
    if (!item.finalVideoUrl) return;
    updateQueueItem(item.id, { postStatus: 'generating', postError: undefined });
    try {
      const youtubeVideoId = await uploadShort({
        accessToken: settings.youtubeAccessToken,
        videoUrl: item.finalVideoUrl,
        title: item.title,
        hashtags: item.hashtags,
        description: item.hook,
        scheduledTime: publishNow ? undefined : scheduledTime || undefined,
      });
      updateQueueItem(item.id, {
        postStatus: 'ready',
        youtubeVideoId,
        postedTime: new Date().toISOString(),
        scheduledTime: publishNow ? undefined : scheduledTime || undefined,
      });
    } catch (err) {
      updateQueueItem(item.id, {
        postStatus: 'error',
        postError: err instanceof Error ? err.message : 'YouTube upload failed',
      });
    }
  };

  const readyToPost = item.processStatus === 'ready' && !!item.finalVideoUrl;

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
      </div>

      {readyToPost && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-400">
            ✓ Ready to Post
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-gray-200"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handlePost(true)}
                disabled={item.postStatus === 'generating'}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
              >
                Post Now
              </button>
              <button
                onClick={() => handlePost(false)}
                disabled={item.postStatus === 'generating' || !scheduledTime}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-50"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Video */}
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Stock Clips</span>
            <StatusBadge status={item.videoStatus} />
          </div>
          {item.videoStatus === 'generating' && (
            <p className="text-xs text-gray-500">Searching Pexels and downloading clips…</p>
          )}
          {item.videoStatus === 'ready' && item.clips && (
            <div className="grid grid-cols-2 gap-2">
              {item.clips.map((clip, idx) => (
                <div key={`${clip.query}-${idx}`} className="flex flex-col gap-1">
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
                </div>
              ))}
            </div>
          )}
          {item.videoStatus === 'error' && (
            <p className="text-xs text-red-400">{item.videoError}</p>
          )}
          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={() => handleGenerateVideo(0)}
              disabled={item.videoStatus === 'generating'}
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

        {/* Voiceover */}
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Voiceover</span>
            <StatusBadge status={item.voiceoverStatus} />
          </div>
          {item.voiceoverStatus === 'ready' && item.audioUrl && (
            <div className="flex flex-col gap-1">
              <audio src={item.audioUrl} controls className="w-full" />
              <a
                href={item.audioUrl}
                download={`${item.title.replace(/[^a-z0-9]+/gi, '_')}.mp3`}
                className="text-xs text-violet-400 hover:underline"
              >
                Download MP3
              </a>
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

        {/* Post to YouTube */}
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">YouTube</span>
            <StatusBadge status={item.postStatus} />
          </div>
          {item.postStatus === 'ready' && item.youtubeVideoId && (
            <p className="text-xs text-gray-400">
              Video ID: <span className="text-gray-200">{item.youtubeVideoId}</span>
            </p>
          )}
          {item.postStatus === 'error' && <p className="text-xs text-red-400">{item.postError}</p>}
          {!readyToPost && (
            <p className="text-xs text-gray-500">
              Generate video and voiceover, then wait for processing to finish to enable posting.
            </p>
          )}
          {item.postStatus === 'error' && (
            <button
              onClick={() => handlePost(true)}
              className="mt-auto rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Final Processed Video */}
      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">Final Video (with voiceover)</span>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              item.processStatus === 'error'
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : item.processStatus === 'processing'
                  ? 'bg-violet-600/10 text-violet-400 border-violet-600/30 animate-pulse'
                  : item.processStatus === 'ready'
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : 'bg-white/5 text-gray-400 border-white/10'
            }`}
          >
            {PROCESS_STATUS_LABELS[item.processStatus]}
          </span>
        </div>

        {item.processStatus === 'processing' && (
          <p className="text-xs text-gray-500">
            Trimming and concatenating clips and merging voiceover with ffmpeg…
          </p>
        )}

        {item.processStatus === 'error' && (
          <>
            <p className="text-xs text-red-400">{item.processError}</p>
            <button
              onClick={handleProcess}
              className="self-start rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Retry
            </button>
          </>
        )}

        {item.processStatus === 'ready' && item.finalVideoUrl && (
          <div className="flex flex-col gap-2">
            <video src={item.finalVideoUrl} controls className="w-full rounded-md" />
            <a
              href={item.finalVideoUrl}
              download={`${item.title.replace(/[^a-z0-9]+/gi, '_')}_final.mp4`}
              className="self-start rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:bg-white/10"
            >
              Download Final Video
            </a>
          </div>
        )}

        {item.processStatus === 'not_processed' && (
          <p className="text-xs text-gray-500">
            Generate video and voiceover to automatically build the final video.
          </p>
        )}
      </div>
    </div>
  );
}
