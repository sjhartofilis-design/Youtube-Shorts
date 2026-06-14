import { useState } from 'react';
import { useApp } from '../hooks/useApp';
import type { QueueItem, ScheduleSlot, ScheduleStatus } from '../types';
import { uploadShort } from '../api/youtube';
import StatusBadge from '../components/StatusBadge';

// Fixed daily posting times in Eastern Time (the audience's local time).
const TIME_SLOTS: { hour: number; minute: number; label: string }[] = [
  { hour: 7, minute: 30, label: '7:30 AM ET' },
  { hour: 12, minute: 0, label: '12:00 PM ET' },
  { hour: 13, minute: 30, label: '1:30 PM ET' },
  { hour: 19, minute: 0, label: '7:00 PM ET' },
  { hour: 21, minute: 0, label: '9:00 PM ET' },
];

const STATUS_COLORS: Record<ScheduleStatus, string> = {
  scheduled: 'bg-violet-500',
  posted: 'bg-green-500',
  failed: 'bg-red-500',
};

/** Returns the UTC offset (in minutes) of America/New_York at the given instant, handling DST. */
function getEasternUtcOffsetMinutes(date: Date): number {
  const tzPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value;

  const match = tzPart?.match(/GMT([+-]\d+)(?::(\d+))?/);
  const hours = match ? parseInt(match[1], 10) : -5;
  const minutes = match?.[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

/** Returns the {hour, minute} of the given instant as displayed in Eastern Time. */
function getEasternHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/** Returns today's date at the given Eastern Time hour/minute, as an absolute instant. */
function todayAtEastern(hour: number, minute: number): Date {
  const now = new Date();
  const offsetMinutes = getEasternUtcOffsetMinutes(now);
  const utcMinutesOfDay = hour * 60 + minute - offsetMinutes;

  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  d.setUTCMinutes(utcMinutesOfDay);
  return d;
}

export default function Schedule() {
  const { queue, schedule, setSchedule, settings, updateQueueItem } = useApp();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const channelName = (channel: 1 | 2) =>
    channel === 1 ? settings.channel1Name : settings.channel2Name;

  const deriveStatus = (queueId: string): ScheduleStatus => {
    const item = queue.find((q) => q.id === queueId);
    if (!item) return 'scheduled';
    if (item.postStatus === 'ready') return 'posted';
    if (item.postStatus === 'error') return 'failed';
    return 'scheduled';
  };

  /** Uploads the item's final video to YouTube, scheduled to go live at `time`. */
  const schedulePost = async (item: QueueItem, channel: 1 | 2, time: Date) => {
    if (!item.finalVideoUrl) return;
    updateQueueItem(item.id, { postStatus: 'generating', postError: undefined });
    try {
      const videoId = await uploadShort({
        accessToken: settings.youtubeAccessToken,
        videoUrl: item.finalVideoUrl,
        title: item.title,
        hashtags: item.hashtags,
        description: item.hook,
        scheduledTime: time.toISOString(),
      });
      updateQueueItem(item.id, {
        postStatus: 'ready',
        youtubeVideoId: videoId,
        postedTime: new Date().toISOString(),
        scheduledTime: time.toISOString(),
      });
      setSchedule((prev) => [
        ...prev.filter((s) => s.queueItemId !== item.id),
        {
          id: `${item.id}-slot`,
          queueItemId: item.id,
          channel,
          channelName: channelName(channel),
          title: item.title,
          time: time.toISOString(),
          status: 'posted',
        },
      ]);
    } catch (err) {
      updateQueueItem(item.id, {
        postStatus: 'error',
        postError: err instanceof Error ? err.message : 'Failed to post to YouTube',
      });
    }
  };

  const readyToPost = queue.filter(
    (item) => item.finalVideoStatus === 'ready' && item.postStatus !== 'ready'
  );

  const handleAutoSchedule = async () => {
    for (const channel of [1, 2] as const) {
      const items = readyToPost
        .filter((q) => q.channel === channel)
        .slice(0, TIME_SLOTS.length);

      for (let idx = 0; idx < items.length; idx++) {
        const slot = TIME_SLOTS[idx];
        const time = todayAtEastern(slot.hour, slot.minute);
        await schedulePost(items[idx], channel, time);
      }
    }
  };

  const handleDrop = (channel: 1 | 2, slotIndex: number) => {
    const itemId = draggingId;
    setDraggingId(null);
    if (!itemId) return;
    const item = queue.find((q) => q.id === itemId);
    if (!item || item.finalVideoStatus !== 'ready' || item.postStatus === 'generating') return;

    const slot = TIME_SLOTS[slotIndex];
    const time = todayAtEastern(slot.hour, slot.minute);
    schedulePost(item, channel, time);
  };

  const slotsForCell = (channel: 1 | 2, slotIndex: number) => {
    const slot = TIME_SLOTS[slotIndex];
    return schedule.filter((s) => {
      if (s.channel !== channel) return false;
      const { hour, minute } = getEasternHourMinute(new Date(s.time));
      return hour === slot.hour && minute === slot.minute;
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-white">Schedule</h1>
          <p className="text-sm text-gray-400">
            Drag a video from "Ready to Post" onto a time slot to upload it to YouTube, scheduled
            to go live at that time (5 daily slots per channel: 7:30 AM, 12:00 PM, 1:30 PM, 7:00
            PM, and 9:00 PM Eastern Time).
          </p>
        </div>
        <button
          onClick={handleAutoSchedule}
          disabled={readyToPost.length === 0}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          Auto-Schedule
        </button>
      </div>

      {!settings.youtubeAccessToken && (
        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          Connect your YouTube account in Settings before scheduling posts.
        </div>
      )}

      <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-2 text-sm font-semibold text-white">Ready to Post</h2>
        {readyToPost.length === 0 ? (
          <p className="text-sm text-gray-500">
            Upload a final edited video on the Queue page to make it available here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {readyToPost.map((item) => (
              <div
                key={item.id}
                draggable={item.postStatus !== 'generating'}
                onDragStart={() => setDraggingId(item.id)}
                className="flex max-w-xs cursor-move flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-gray-200">{item.title}</span>
                  <StatusBadge status={item.postStatus} />
                </div>
                <span className="text-xs text-gray-500">
                  {channelName(item.channel)} · Channel {item.channel}
                </span>
                {item.postStatus === 'error' && item.postError && (
                  <span className="text-xs text-red-400">{item.postError}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Posted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Failed
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="grid grid-cols-[110px_1fr_1fr] border-b border-white/10 bg-white/[0.03]">
          <div className="px-3 py-3 text-xs font-semibold uppercase text-gray-500">Time (ET)</div>
          <div className="border-l border-white/10 px-3 py-3 text-sm font-semibold text-white">
            {settings.channel1Name}
          </div>
          <div className="border-l border-white/10 px-3 py-3 text-sm font-semibold text-white">
            {settings.channel2Name}
          </div>
        </div>

        {TIME_SLOTS.map((slot, slotIndex) => (
          <div key={slot.label} className="grid grid-cols-[110px_1fr_1fr] border-b border-white/5">
            <div className="flex items-center px-3 py-4 text-xs text-gray-500">{slot.label}</div>
            {([1, 2] as const).map((channel) => (
              <div
                key={channel}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(channel, slotIndex)}
                className="min-h-[60px] border-l border-white/5 p-2"
              >
                {slotsForCell(channel, slotIndex).map((s: ScheduleSlot) => (
                  <div
                    key={s.id}
                    className="mb-1 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-gray-200"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[deriveStatus(s.queueItemId)]}`}
                    />
                    <span className="truncate">{s.title}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {schedule.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-500">
          No videos scheduled yet. Drag a video from "Ready to Post" onto a time slot, or click
          "Auto-Schedule".
        </p>
      )}
    </div>
  );
}
