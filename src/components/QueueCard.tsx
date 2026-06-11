import { useState } from 'react';
import type { QueueItem } from '../types';
import { VOICE_ID_MAP } from '../types';
import { useApp } from '../hooks/useApp';
import { generateKlingVideo } from '../api/kling';
import { generateVoiceover } from '../api/elevenlabs';
import { uploadShort } from '../api/youtube';
import StatusBadge from './StatusBadge';

export default function QueueCard({ item }: { item: QueueItem }) {
  const { settings, updateQueueItem } = useApp();
  const [pollCount, setPollCount] = useState(0);
  const [scheduledTime, setScheduledTime] = useState('');

  const handleGenerateVideo = async () => {
    updateQueueItem(item.id, { videoStatus: 'generating', videoError: undefined });
    setPollCount(0);
    try {
      const videoUrl = await generateKlingVideo(settings.klingApiKey, item.kling_prompt, () =>
        setPollCount((c) => c + 1)
      );
      updateQueueItem(item.id, { videoStatus: 'ready', videoUrl });
    } catch (err) {
      updateQueueItem(item.id, {
        videoStatus: 'error',
        videoError: err instanceof Error ? err.message : 'Video generation failed',
      });
    }
  };

  const handleGenerateVoiceover = async () => {
    updateQueueItem(item.id, { voiceoverStatus: 'generating', voiceoverError: undefined });
    try {
      const voiceStyle =
        item.category === 'space' ? settings.voiceStyleSpace : settings.voiceStyleAncientCiv;
      const voiceId = VOICE_ID_MAP[voiceStyle];
      const audioUrl = await generateVoiceover(settings.elevenLabsApiKey, voiceId, item.narration);
      updateQueueItem(item.id, { voiceoverStatus: 'ready', audioUrl });
    } catch (err) {
      updateQueueItem(item.id, {
        voiceoverStatus: 'error',
        voiceoverError: err instanceof Error ? err.message : 'Voiceover generation failed',
      });
    }
  };

  const handlePost = async (publishNow: boolean) => {
    if (!item.videoUrl) return;
    updateQueueItem(item.id, { postStatus: 'generating', postError: undefined });
    try {
      const youtubeVideoId = await uploadShort({
        accessToken: settings.youtubeAccessToken,
        videoUrl: item.videoUrl,
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

  const bothReady = item.videoStatus === 'ready' && item.voiceoverStatus === 'ready';

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

      {bothReady && (
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
            <span className="text-sm font-medium text-white">Video</span>
            <StatusBadge status={item.videoStatus} />
          </div>
          {item.videoStatus === 'generating' && (
            <p className="text-xs text-gray-500">Polling Kling… ({pollCount})</p>
          )}
          {item.videoStatus === 'ready' && item.videoUrl && (
            <video src={item.videoUrl} controls className="w-full rounded-md" />
          )}
          {item.videoStatus === 'error' && (
            <p className="text-xs text-red-400">{item.videoError}</p>
          )}
          <button
            onClick={handleGenerateVideo}
            disabled={item.videoStatus === 'generating'}
            className="mt-auto rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {item.videoStatus === 'error'
              ? 'Retry'
              : item.videoStatus === 'ready'
                ? 'Regenerate Video'
                : 'Generate Video'}
          </button>
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
          {!bothReady && (
            <p className="text-xs text-gray-500">
              Generate video and voiceover to enable posting.
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
    </div>
  );
}
