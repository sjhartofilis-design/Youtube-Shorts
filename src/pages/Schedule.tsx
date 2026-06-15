import { useState } from 'react';
import { useApp } from '../hooks/useApp';
import type { QueueItem, ScheduleSlot, ScheduleStatus } from '../types';
import { uploadShort } from '../api/youtube';
import StatusBadge from '../components/StatusBadge';

const TIME_SLOTS: { hour: number; minute: number; label: string }[] = [
  { hour: 7, minute: 30, label: '7:30 AM' },
  { hour: 12, minute: 0, label: '12:00 PM' },
  { hour: 13, minute: 30, label: '1:30 PM' },
  { hour: 19, minute: 0, label: '7:00 PM' },
  { hour: 21, minute: 0, label: '9:00 PM' },
];

const STATUS_COLORS: Record<ScheduleStatus, string> = {
  scheduled: 'bg-violet-500',
  posted: 'bg-green-500',
  failed: 'bg-red-500',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameCalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── Eastern Time helpers ─────────────────────────────────────────────────────

function getEasternUtcOffsetMinutes(date: Date): number {
  const tzPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = tzPart?.match(/GMT([+-]\d+)(?::(\d+))?/);
  const hours = match ? parseInt(match[1], 10) : -5;
  const mins = match?.[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + (hours < 0 ? -mins : mins);
}

function getEasternHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24,
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? '0'),
  };
}

/** Returns a Date representing midnight of the ET calendar date of `date`. */
function getEasternCalDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  return new Date(
    Number(parts.find((p) => p.type === 'year')?.value),
    Number(parts.find((p) => p.type === 'month')?.value ?? '1') - 1,
    Number(parts.find((p) => p.type === 'day')?.value),
  );
}

/** Returns the UTC instant corresponding to the given local calendar day at the given ET hour:minute. */
function dayAtEastern(calDay: Date, hour: number, minute: number): Date {
  // Build a rough UTC guess to derive the DST offset for this day/time
  const rough = new Date(calDay);
  rough.setHours(hour, minute, 0, 0);
  const offsetMinutes = getEasternUtcOffsetMinutes(rough);
  // UTC = ET_wall_clock - ET_offset
  const etWallMs = Date.UTC(
    calDay.getFullYear(),
    calDay.getMonth(),
    calDay.getDate(),
    hour,
    minute,
    0,
  );
  return new Date(etWallMs - offsetMinutes * 60_000);
}

// ─── Component ────────────────────────────────────────────────────────────────

type DragSource =
  | { kind: 'queue'; itemId: string }
  | { kind: 'slot'; slotId: string };

export default function Schedule() {
  const { queue, schedule, setSchedule, settings, updateQueueItem } = useApp();

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [drag, setDrag] = useState<DragSource | null>(null);
  const [overCell, setOverCell] = useState<string | null>(null); // "dayIdx-slotIdx-channel"

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const channelName = (ch: 1 | 2) =>
    ch === 1 ? settings.channel1Name : settings.channel2Name;

  const deriveStatus = (queueItemId: string): ScheduleStatus => {
    const item = queue.find((q) => q.id === queueItemId);
    if (!item) return 'scheduled';
    if (item.postStatus === 'ready') return 'posted';
    if (item.postStatus === 'error') return 'failed';
    return 'scheduled';
  };

  const slotsForCell = (ch: 1 | 2, slotIndex: number, day: Date): ScheduleSlot[] => {
    const slot = TIME_SLOTS[slotIndex];
    return schedule.filter((s) => {
      if (s.channel !== ch) return false;
      const d = new Date(s.time);
      const calDay = getEasternCalDay(d);
      if (!isSameCalDay(calDay, day)) return false;
      const { hour, minute } = getEasternHourMinute(d);
      return hour === slot.hour && minute === slot.minute;
    });
  };

  const schedulePost = async (item: QueueItem, ch: 1 | 2, time: Date) => {
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
          channel: ch,
          channelName: channelName(ch),
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

  const handleDrop = (ch: 1 | 2, slotIndex: number, day: Date) => {
    setOverCell(null);
    if (!drag) return;
    const time = dayAtEastern(day, TIME_SLOTS[slotIndex].hour, TIME_SLOTS[slotIndex].minute);

    if (drag.kind === 'slot') {
      // Rescheduling: update the slot's time in local state
      setSchedule((prev) =>
        prev.map((s) => (s.id === drag.slotId ? { ...s, channel: ch, channelName: channelName(ch), time: time.toISOString() } : s)),
      );
      setDrag(null);
      return;
    }

    // New post from queue
    const item = queue.find((q) => q.id === drag.itemId);
    setDrag(null);
    if (!item || item.finalVideoStatus !== 'ready' || item.postStatus === 'generating') return;
    schedulePost(item, ch, time);
  };

  // ─── Auto-schedule ───────────────────────────────────────────────────────────

  const readyToPost = queue.filter(
    (item) => item.finalVideoStatus === 'ready' && item.postStatus !== 'ready',
  );

  const handleAutoSchedule = async () => {
    // Find all future (date × slotIndex × channel) combos that are empty, starting from today
    const occupiedKeys = new Set(
      schedule.map((s) => {
        const d = getEasternCalDay(new Date(s.time));
        const { hour, minute } = getEasternHourMinute(new Date(s.time));
        const slotIdx = TIME_SLOTS.findIndex((t) => t.hour === hour && t.minute === minute);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${slotIdx}-${s.channel}`;
      }),
    );

    const nowET = getEasternCalDay(new Date());
    const candidates: { day: Date; slotIndex: number; ch: 1 | 2 }[] = [];
    for (let dayOffset = 0; dayOffset < 14 && candidates.length < readyToPost.length * 2; dayOffset++) {
      const day = addDays(nowET, dayOffset);
      for (let si = 0; si < TIME_SLOTS.length; si++) {
        for (const ch of [1, 2] as const) {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}-${si}-${ch}`;
          if (!occupiedKeys.has(key)) {
            candidates.push({ day, slotIndex: si, ch });
          }
        }
      }
    }

    for (let i = 0; i < readyToPost.length && i < candidates.length; i++) {
      const { day, slotIndex, ch } = candidates[i];
      const item = readyToPost.filter((q) => q.channel === ch)[0] ?? readyToPost[i];
      if (!item) continue;
      const time = dayAtEastern(day, TIME_SLOTS[slotIndex].hour, TIME_SLOTS[slotIndex].minute);
      await schedulePost(item, ch, time);
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[6];
    const sLabel = `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}`;
    const eLabel =
      s.getMonth() === e.getMonth()
        ? `${e.getDate()}`
        : `${MONTH_NAMES[e.getMonth()]} ${e.getDate()}`;
    return `${sLabel}–${eLabel}, ${e.getFullYear()}`;
  })();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-white">Schedule</h1>
          <p className="text-sm text-gray-400">
            Drag a video onto any date and time slot to upload it to YouTube at that time (ET).
            Drag an existing slot to reschedule it.
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

      {/* Ready to Post */}
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
                onDragStart={() => setDrag({ kind: 'queue', itemId: item.id })}
                onDragEnd={() => setDrag(null)}
                className="flex max-w-xs cursor-move flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 select-none"
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

      {/* Legend */}
      <div className="mb-3 flex gap-4 text-xs text-gray-400">
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

      {/* Week navigation */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => setWeekStart((d) => addDays(d, -7))}
          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5"
        >
          ← Prev
        </button>
        <span className="text-sm font-semibold text-white">{weekLabel}</span>
        <button
          onClick={() => setWeekStart((d) => addDays(d, 7))}
          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5"
        >
          Next →
        </button>
        <button
          onClick={() => setWeekStart(getWeekStart(new Date()))}
          className="ml-auto rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5"
        >
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <div className="min-w-[760px]">
          {/* Day headers */}
          <div className="grid border-b border-white/10 bg-white/[0.03]" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
            <div className="px-2 py-3 text-xs font-semibold uppercase text-gray-500">ET</div>
            {weekDays.map((day, di) => {
              const isToday = isSameCalDay(day, today);
              return (
                <div
                  key={di}
                  className={`border-l border-white/10 px-2 py-3 text-center ${isToday ? 'bg-violet-600/10' : ''}`}
                >
                  <div className={`text-xs font-semibold ${isToday ? 'text-violet-300' : 'text-gray-400'}`}>
                    {DAY_NAMES[day.getDay()]}
                  </div>
                  <div className={`text-sm font-bold ${isToday ? 'text-white' : 'text-gray-300'}`}>
                    {MONTH_NAMES[day.getMonth()]} {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time slot rows */}
          {TIME_SLOTS.map((slot, slotIndex) => (
            <div
              key={slot.label}
              className="grid border-b border-white/5 last:border-0"
              style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}
            >
              {/* Time label */}
              <div className="flex items-start px-2 py-3 text-xs text-gray-500 pt-3">
                {slot.label}
              </div>

              {/* Day cells */}
              {weekDays.map((day, di) => {
                const isToday = isSameCalDay(day, today);
                return (
                  <div
                    key={di}
                    className={`border-l border-white/5 ${isToday ? 'bg-violet-600/5' : ''}`}
                  >
                    {([1, 2] as const).map((ch) => {
                      const cellKey = `${di}-${slotIndex}-${ch}`;
                      const isOver = overCell === cellKey;
                      const slots = slotsForCell(ch, slotIndex, day);
                      return (
                        <div
                          key={ch}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setOverCell(cellKey);
                          }}
                          onDragLeave={() => setOverCell(null)}
                          onDrop={() => handleDrop(ch, slotIndex, day)}
                          className={`min-h-[48px] border-b border-white/5 p-1.5 last:border-0 transition-colors ${
                            isOver ? 'bg-violet-500/15 ring-1 ring-inset ring-violet-500/40' : ''
                          }`}
                        >
                          {/* Channel label */}
                          <div className="mb-1 text-[10px] text-gray-600 leading-none">
                            {channelName(ch)}
                          </div>

                          {/* Filled slots */}
                          {slots.map((s) => {
                            const status = deriveStatus(s.queueItemId);
                            return (
                              <div
                                key={s.id}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  setDrag({ kind: 'slot', slotId: s.id });
                                }}
                                onDragEnd={() => setDrag(null)}
                                className="mb-1 flex cursor-move items-start gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 select-none"
                              >
                                <span
                                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[status]}`}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-medium text-gray-200 leading-tight">
                                    {s.title}
                                  </p>
                                  <p className="text-[10px] text-gray-500 leading-tight capitalize">
                                    {status}
                                  </p>
                                </div>
                              </div>
                            );
                          })}

                          {/* Empty drop hint */}
                          {slots.length === 0 && isOver && (
                            <div className="rounded-md border border-dashed border-violet-500/50 px-2 py-1 text-[10px] text-violet-400">
                              Drop here
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {schedule.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-500">
          No videos scheduled yet. Drag a video from "Ready to Post" onto any time slot.
        </p>
      )}
    </div>
  );
}
