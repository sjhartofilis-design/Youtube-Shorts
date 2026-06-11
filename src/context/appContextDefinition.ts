import { createContext } from 'react';
import type { QueueItem, ScheduleSlot, SettingsState } from '../types';

export interface AppContextValue {
  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;

  queue: QueueItem[];
  setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
  addToQueue: (item: QueueItem) => void;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void;

  schedule: ScheduleSlot[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleSlot[]>>;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);
