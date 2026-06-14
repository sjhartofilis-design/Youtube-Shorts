import { useEffect, useState, type ReactNode } from 'react';
import type { QueueItem, ScheduleSlot, SettingsState } from '../types';
import { AppContext } from './appContextDefinition';
import { assetKeys, clearAllAssets, deleteAsset, loadAsset } from '../utils/storage';

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
    // Large generated assets (voiceover audio, final video) are persisted
    // separately in IndexedDB, so strip them out of the localStorage copy of
    // the queue to avoid exceeding its small storage quota.
    const persistedQueue = queue.map((item) => ({
      ...item,
      audioUrl: undefined,
      finalVideoUrl: undefined,
    }));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(persistedQueue));
  }, [queue]);

  // On mount, restore any generated audio/video assets from IndexedDB and
  // re-attach them to the matching queue items as fresh object URLs.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const restored = await Promise.all(
        queue.map(async (item) => {
          const updates: Partial<QueueItem> = {};

          if (item.voiceoverStatus === 'ready' && !item.audioUrl) {
            const audioBlob = await loadAsset(assetKeys.audio(item.id));
            if (audioBlob) {
              updates.audioUrl = URL.createObjectURL(audioBlob);
            } else {
              updates.voiceoverStatus = 'idle';
            }
          }

          if (item.processStatus === 'ready' && !item.finalVideoUrl) {
            const videoBlob = await loadAsset(assetKeys.finalVideo(item.id));
            if (videoBlob) {
              updates.finalVideoUrl = URL.createObjectURL(videoBlob);
            } else {
              updates.processStatus = 'not_processed';
            }
          }

          return Object.keys(updates).length > 0 ? { id: item.id, updates } : null;
        })
      );

      if (cancelled) return;
      const changes = restored.filter((r): r is { id: string; updates: Partial<QueueItem> } => r !== null);
      if (changes.length === 0) return;

      setQueue((prev) =>
        prev.map((item) => {
          const change = changes.find((c) => c.id === item.id);
          return change ? { ...item, ...change.updates } : item;
        })
      );
    })();

    return () => {
      cancelled = true;
    };
    // Only run once on mount — restoration applies to whatever was loaded
    // from localStorage at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    deleteAsset(assetKeys.audio(id));
    deleteAsset(assetKeys.finalVideo(id));
  };

  const addUsedClipIds = (ids: number[]) => {
    if (ids.length === 0) return;
    setUsedClipIds((prev) => [...new Set([...prev, ...ids])]);
  };

  const clearSavedData = async () => {
    await clearAllAssets();
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        audioUrl: undefined,
        voiceoverStatus: item.voiceoverStatus === 'ready' ? 'idle' : item.voiceoverStatus,
        finalVideoUrl: undefined,
        processStatus: item.processStatus === 'ready' ? 'not_processed' : item.processStatus,
      }))
    );
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
        clearSavedData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
