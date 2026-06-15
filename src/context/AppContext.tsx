import { useEffect, useState, type ReactNode } from 'react';
import type { QueueItem, ScheduleSlot, SettingsState } from '../types';
import { AppContext } from './appContextDefinition';
import { assetPaths, deleteUserAsset, supabase, uploadUserAsset } from '../api/supabase';
import { legacyAssetKeys, loadAsset } from '../utils/storage';

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
  backgroundAudioUrl: '',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * On first load for this account (no `settings` row yet), pulls over any
 * data from this browser's old localStorage/IndexedDB-based storage —
 * including re-uploading previously generated voiceovers and final videos to
 * Supabase Storage — so nothing has to be re-entered or regenerated.
 */
async function migrateLocalData(userId: string) {
  const localSettings = loadFromStorage(SETTINGS_KEY, defaultSettings);
  const localQueue = loadFromStorage<QueueItem[]>(QUEUE_KEY, []);
  const localSchedule = loadFromStorage<ScheduleSlot[]>(SCHEDULE_KEY, []);
  const localUsedClipIds = loadFromStorage<number[]>(USED_CLIP_IDS_KEY, []);

  const migratedQueue = await Promise.all(
    localQueue.map(async (item) => {
      const migrated = { ...item };

      if (migrated.voiceoverStatus === 'ready') {
        const blob = await loadAsset(legacyAssetKeys.audio(item.id));
        if (blob) {
          try {
            migrated.audioUrl = await uploadUserAsset(userId, assetPaths.audio(item.id), blob);
          } catch (err) {
            console.error('Failed to migrate voiceover audio', err);
            migrated.voiceoverStatus = 'idle';
            migrated.audioUrl = undefined;
          }
        } else {
          migrated.voiceoverStatus = 'idle';
          migrated.audioUrl = undefined;
        }
      }

      if (migrated.finalVideoStatus === 'ready') {
        const blob = await loadAsset(legacyAssetKeys.video(item.id));
        if (blob) {
          try {
            migrated.finalVideoUrl = await uploadUserAsset(userId, assetPaths.video(item.id), blob);
          } catch (err) {
            console.error('Failed to migrate final video', err);
            migrated.finalVideoStatus = 'idle';
            migrated.finalVideoUrl = undefined;
          }
        } else {
          migrated.finalVideoStatus = 'idle';
          migrated.finalVideoUrl = undefined;
        }
      }

      return migrated;
    })
  );

  const { error: settingsError } = await supabase
    .from('settings')
    .insert({ user_id: userId, data: localSettings });
  if (settingsError) console.error('Failed to migrate settings', settingsError);

  if (migratedQueue.length > 0) {
    const { error } = await supabase.from('queue_items').insert(
      migratedQueue.map((item, index) => ({
        id: item.id,
        user_id: userId,
        position: index,
        data: item,
      }))
    );
    if (error) console.error('Failed to migrate queue', error);
  }

  if (localSchedule.length > 0) {
    const { error } = await supabase
      .from('schedule_slots')
      .insert(localSchedule.map((slot) => ({ id: slot.id, user_id: userId, data: slot })));
    if (error) console.error('Failed to migrate schedule', error);
  }

  if (localUsedClipIds.length > 0) {
    const { error } = await supabase
      .from('used_clip_ids')
      .insert({ user_id: userId, ids: localUsedClipIds });
    if (error) console.error('Failed to migrate used clip ids', error);
  }

  return {
    settings: { ...defaultSettings, ...localSettings },
    queue: migratedQueue,
    schedule: localSchedule,
    usedClipIds: localUsedClipIds,
  };
}

export function AppProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [settings, setSettingsState] = useState<SettingsState>(defaultSettings);
  const [queue, setQueueState] = useState<QueueItem[]>([]);
  const [schedule, setScheduleState] = useState<ScheduleSlot[]>([]);
  const [usedClipIds, setUsedClipIdsState] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: existingSettings, error } = await supabase
        .from('settings')
        .select('data')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) console.error('Failed to load settings', error);

      if (cancelled) return;

      if (existingSettings) {
        const [queueRes, scheduleRes, usedClipsRes] = await Promise.all([
          supabase
            .from('queue_items')
            .select('data')
            .eq('user_id', userId)
            .order('position'),
          supabase.from('schedule_slots').select('data').eq('user_id', userId),
          supabase.from('used_clip_ids').select('ids').eq('user_id', userId).maybeSingle(),
        ]);
        if (cancelled) return;

        setSettingsState({ ...defaultSettings, ...(existingSettings.data as Partial<SettingsState>) });
        setQueueState((queueRes.data ?? []).map((row) => row.data as QueueItem));
        setScheduleState((scheduleRes.data ?? []).map((row) => row.data as ScheduleSlot));
        setUsedClipIdsState((usedClipsRes.data?.ids as number[] | undefined) ?? []);
        setLoading(false);
        return;
      }

      const migrated = await migrateLocalData(userId);
      if (cancelled) return;
      setSettingsState(migrated.settings);
      setQueueState(migrated.queue);
      setScheduleState(migrated.schedule);
      setUsedClipIdsState(migrated.usedClipIds);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setSettings: React.Dispatch<React.SetStateAction<SettingsState>> = (value) => {
    setSettingsState((prev) => {
      const next = typeof value === 'function' ? (value as (p: SettingsState) => SettingsState)(prev) : value;
      supabase
        .from('settings')
        .upsert({ user_id: userId, data: next })
        .then(({ error }) => {
          if (error) console.error('Failed to save settings', error);
        });
      return next;
    });
  };

  const setSchedule: React.Dispatch<React.SetStateAction<ScheduleSlot[]>> = (value) => {
    setScheduleState((prev) => {
      const next = typeof value === 'function' ? (value as (p: ScheduleSlot[]) => ScheduleSlot[])(prev) : value;

      const nextIds = new Set(next.map((s) => s.id));
      const removed = prev.filter((s) => !nextIds.has(s.id));

      if (removed.length > 0) {
        supabase
          .from('schedule_slots')
          .delete()
          .in('id', removed.map((s) => s.id))
          .then(({ error }) => {
            if (error) console.error('Failed to delete schedule slots', error);
          });
      }
      if (next.length > 0) {
        supabase
          .from('schedule_slots')
          .upsert(next.map((s) => ({ id: s.id, user_id: userId, data: s })))
          .then(({ error }) => {
            if (error) console.error('Failed to save schedule slots', error);
          });
      }

      return next;
    });
  };

  const addToQueue = (item: QueueItem) => {
    setQueueState((prev) => {
      const position = prev.length;
      supabase
        .from('queue_items')
        .insert({ id: item.id, user_id: userId, position, data: item })
        .then(({ error }) => {
          if (error) console.error('Failed to add queue item', error);
        });
      return [...prev, item];
    });
  };

  const updateQueueItem = (id: string, updates: Partial<QueueItem>) => {
    setQueueState((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...updates };
        supabase
          .from('queue_items')
          .update({ data: next })
          .eq('id', id)
          .eq('user_id', userId)
          .then(({ error }) => {
            if (error) console.error('Failed to update queue item', error);
          });
        return next;
      })
    );
  };

  const removeFromQueue = (id: string) => {
    setQueueState((prev) => prev.filter((item) => item.id !== id));
    setSchedule((prev) => prev.filter((slot) => slot.queueItemId !== id));
    supabase
      .from('queue_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .then(({ error }) => {
        if (error) console.error('Failed to delete queue item', error);
      });
    deleteUserAsset(userId, assetPaths.audio(id));
    deleteUserAsset(userId, assetPaths.video(id));
  };

  const addUsedClipIds = (ids: number[]) => {
    if (ids.length === 0) return;
    setUsedClipIdsState((prev) => {
      const next = [...new Set([...prev, ...ids])];
      supabase
        .from('used_clip_ids')
        .upsert({ user_id: userId, ids: next })
        .then(({ error }) => {
          if (error) console.error('Failed to save used clip ids', error);
        });
      return next;
    });
  };

  const clearSavedData = async () => {
    await Promise.all(
      queue.flatMap((item) => [
        deleteUserAsset(userId, assetPaths.audio(item.id)),
        deleteUserAsset(userId, assetPaths.video(item.id)),
      ])
    );
    setQueueState((prev) =>
      prev.map((item) => {
        const next: QueueItem = {
          ...item,
          audioUrl: undefined,
          voiceoverStatus: item.voiceoverStatus === 'ready' ? 'idle' : item.voiceoverStatus,
          finalVideoUrl: undefined,
          finalVideoStatus: item.finalVideoStatus === 'ready' ? 'idle' : item.finalVideoStatus,
        };
        supabase
          .from('queue_items')
          .update({ data: next })
          .eq('id', item.id)
          .eq('user_id', userId)
          .then(({ error }) => {
            if (error) console.error('Failed to update queue item', error);
          });
        return next;
      })
    );
  };

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        userId,
        settings,
        setSettings,
        queue,
        addToQueue,
        updateQueueItem,
        removeFromQueue,
        schedule,
        setSchedule,
        usedClipIds,
        addUsedClipIds,
        clearSavedData,
        changePassword,
        loading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
