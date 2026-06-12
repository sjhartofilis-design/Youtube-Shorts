import { useState } from 'react';
import { useApp } from '../hooks/useApp';
import type { ScheduleSlot, ScheduleStatus } from '../types';

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

  const handleAutoSchedule = () => {
    const newSlots: ScheduleSlot[] = [];
    ([1, 2] as const).forEach((channel) => {
      const items = queue.filter((q) => q.channel === channel).slice(0, TIME_SLOTS.length);

      items.forEach((item, idx) => {
        const slot = TIME_SLOTS[idx];
        const time = todayAtEastern(slot.hour, slot.minute);
        newSlots.push({
          id: `${item.id}-slot`,
          queueItemId: item.id,
          channel,
          channelName: channelName(channel),
          title: item.title,
          time: time.toISOString(),
          status: deriveStatus(item.id),
        });
        updateQueueItem(item.id, { scheduledTime: time.toISOString() });
      });
    });
    setSchedule(newSlots);
  };

  const handleDrop = (channel: 1 | 2, slotIndex: number) => {
    if (!draggingId) return;
    const slot = TIME_SLOTS[slotIndex];
    const time = todayAtEastern(slot.hour, slot.minute);
    setSchedule((prev) =>
      prev.map((slot) =>
        slot.queueItemId === draggingId
          ? { ...slot, channel, channelName: channelName(channel), time: time.toISOString() }
          : slot
      )
    );
    updateQueueItem(draggingId, { scheduledTime: time.toISOString() });
    setDraggingId(null);
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
            Drag and drop videos to reschedule. Default schedule posts 5 videos per channel each
            day at 7:30 AM, 12:00 PM, 1:30 PM, 7:00 PM, and 9:00 PM Eastern Time (10 videos total
            per day).
          </p>
        </div>
        <button
          onClick={handleAutoSchedule}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Auto-Schedule
        </button>
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
                {slotsForCell(channel, slotIndex).map((s) => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={() => setDraggingId(s.queueItemId)}
                    className="mb-1 flex cursor-move items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-gray-200"
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
          No videos scheduled yet. Click "Auto-Schedule" to fill the 5 daily slots per channel.
        </p>
      )}
    </div>
  );
}
