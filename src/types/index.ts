export type ScriptCategory = 'space' | 'ancientciv';

export interface Script {
  hook: string;
  narration: string;
  kling_prompt: string;
  title: string;
  hashtags: string[];
}

export type TaskStatus = 'idle' | 'pending' | 'generating' | 'ready' | 'error';

export interface QueueItem extends Script {
  id: string;
  category: ScriptCategory;
  channel: 1 | 2;

  videoStatus: TaskStatus;
  videoUrl?: string;
  videoError?: string;
  klingTaskId?: string;

  voiceoverStatus: TaskStatus;
  audioUrl?: string;
  voiceoverError?: string;

  postStatus: TaskStatus;
  postError?: string;
  youtubeVideoId?: string;

  scheduledTime?: string; // ISO string
  postedTime?: string; // ISO string
}

export type ScheduleStatus = 'scheduled' | 'posted' | 'failed';

export interface ScheduleSlot {
  id: string;
  queueItemId: string;
  channel: 1 | 2;
  channelName: string;
  title: string;
  time: string; // ISO string
  status: ScheduleStatus;
}

export type VoiceStyle = 'dramatic' | 'authoritative' | 'warm' | 'emotional';

export interface SettingsState {
  anthropicApiKey: string;
  klingApiKey: string;
  elevenLabsApiKey: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeAccessToken: string;
  channel1Name: string;
  channel2Name: string;
  voiceStyleSpace: 'dramatic' | 'authoritative';
  voiceStyleAncientCiv: 'dramatic' | 'authoritative';
  voiceStyleFeelGood: 'warm' | 'emotional';
}

export const VOICE_ID_MAP: Record<VoiceStyle, string> = {
  dramatic: 'ErXwobaYiN019PkySvjV',
  authoritative: 'ErXwobaYiN019PkySvjV',
  warm: 'EXAVITQu4vr4xnSDxMaL',
  emotional: 'EXAVITQu4vr4xnSDxMaL',
};
