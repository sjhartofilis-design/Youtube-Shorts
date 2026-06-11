import { useState, type ReactNode } from 'react';
import type { QueueItem, ScheduleSlot, SettingsState } from '../types';
import { AppContext } from './appContextDefinition';

const defaultSettings: SettingsState = {
  anthropicApiKey: '',
  klingApiKey: '',
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);

  const addToQueue = (item: QueueItem) => {
    setQueue((prev) => [...prev, item]);
  };

  const updateQueueItem = (id: string, updates: Partial<QueueItem>) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
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
        schedule,
        setSchedule,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
