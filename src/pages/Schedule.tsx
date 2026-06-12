import { useState } from 'react';
import { useApp } from '../hooks/useApp';
import type { ScheduleSlot, ScheduleStatus } from '../types';

const START_HOUR = 8;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const STATUS_COLORS: Record<ScheduleStatus, string> = {
  scheduled: 'bg-violet-500',
  posted: 'bg-green-500',
  failed: 'bg-red-500',
};

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

function todayAt(hour: number): Date {
  const d = new Date();
  d.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
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
      const items = queue.filter((q) => q.channel === channel).slice(0, 2);
      const span = END_HOUR - START_HOUR;
      const step = items.length > 1 ? span / (items.length - 1) : 0;

      items.forEach((item, idx) => {
        const hour = items.length === 1 ? START_HOUR : START_HOUR + step * idx;
        const time = todayAt(hour);
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

  const handleDrop = (channel: 1 | 2, hour: number) => {
    if (!draggingId) return;
    const time = todayAt(hour);
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

  const slotsForCell = (channel: 1 | 2, hour: number) =>
    schedule.filter((s) => {
      const d = new Date(s.time);
      return s.channel === channel && d.getHours() === hour;
    });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-white">Schedule</h1>
          <p className="text-sm text-gray-400">
            Drag and drop videos to reschedule. Default schedule spaces 2 videos per channel
            evenly between 8am and 10pm (4 videos total per day).
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
        <div className="grid grid-cols-[80px_1fr_1fr] border-b border-white/10 bg-white/[0.03]">
          <div className="px-3 py-3 text-xs font-semibold uppercase text-gray-500">Time</div>
          <div className="border-l border-white/10 px-3 py-3 text-sm font-semibold text-white">
            {settings.channel1Name}
          </div>
          <div className="border-l border-white/10 px-3 py-3 text-sm font-semibold text-white">
            {settings.channel2Name}
          </div>
        </div>

        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-[80px_1fr_1fr] border-b border-white/5">
            <div className="flex items-center px-3 py-4 text-xs text-gray-500">
              {formatHour(hour)}
            </div>
            {([1, 2] as const).map((channel) => (
              <div
                key={channel}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(channel, hour)}
                className="min-h-[60px] border-l border-white/5 p-2"
              >
                {slotsForCell(channel, hour).map((slot) => (
                  <div
                    key={slot.id}
                    draggable
                    onDragStart={() => setDraggingId(slot.queueItemId)}
                    className="mb-1 flex cursor-move items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-gray-200"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[deriveStatus(slot.queueItemId)]}`}
                    />
                    <span className="truncate">{slot.title}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {schedule.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-500">
          No videos scheduled yet. Click "Auto-Schedule" to space queued videos evenly.
        </p>
      )}
    </div>
  );
}
