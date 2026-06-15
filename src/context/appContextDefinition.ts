import { createContext } from 'react';
import type { QueueItem, ScheduleSlot, SettingsState } from '../types';

export interface AppContextValue {
  userId: string;

  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;

  queue: QueueItem[];
  addToQueue: (item: QueueItem) => void;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void;
  removeFromQueue: (id: string) => void;

  schedule: ScheduleSlot[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleSlot[]>>;

  usedClipIds: number[];
  addUsedClipIds: (ids: number[]) => void;

  clearSavedData: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;

  loading: boolean;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);
