import { useEffect, useState, type ReactNode } from 'react';
import type { QueueItem, ScheduleSlot, SettingsState } from '../types';
import { AppContext } from './appContextDefinition';

const SETTINGS_KEY = 'shorts-automator:settings';
const QUEUE_KEY = 'shorts-automator:queue';
const SCHEDULE_KEY = 'shorts-automator:schedule';
const USED_CLIP_IDS_KEY = 'shorts-automator:usedClipIds';

const defaultSettings: SettingsState = {
  anthropicApiKey: '',
  pexelsApiKey: '',
  elevenLabsApiKey: '',
  youtubeClientId: '',
  youtubeClientSecret: '',
  youtubeAccessToken: '',
  channel1Name: 'Space Channel',
  channel2Name: 'Ancient Civ Channel',
  voiceStyleSpace: 'dramatic',
  voiceStyleAncientCiv: 'authoritative',
  voiceStyleFeelGood: 'warm',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(() =>
    loadFromStorage(SETTINGS_KEY, defaultSettings)
  );
  const [queue, setQueue] = useState<QueueItem[]>(() => loadFromStorage(QUEUE_KEY, []));
  const [schedule, setSchedule] = useState<ScheduleSlot[]>(() =>
    loadFromStorage(SCHEDULE_KEY, [])
  );
  const [usedClipIds, setUsedClipIds] = useState<number[]>(() =>
    loadFromStorage(USED_CLIP_IDS_KEY, [])
  );

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  }, [schedule]);

  useEffect(() => {
    localStorage.setItem(USED_CLIP_IDS_KEY, JSON.stringify(usedClipIds));
  }, [usedClipIds]);

  const addToQueue = (item: QueueItem) => {
    setQueue((prev) => [...prev, item]);
  };

  const updateQueueItem = (id: string, updates: Partial<QueueItem>) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    setSchedule((prev) => prev.filter((slot) => slot.queueItemId !== id));
  };

  const addUsedClipIds = (ids: number[]) => {
    if (ids.length === 0) return;
    setUsedClipIds((prev) => [...new Set([...prev, ...ids])]);
  };

  return (
    <AppContext.Provider
      value={{
        settings,
        setSettings,
        queue,
        setQueue,
        addToQueue,
        updateQueueItem,
        removeFromQueue,
        schedule,
        setSchedule,
        usedClipIds,
        addUsedClipIds,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
