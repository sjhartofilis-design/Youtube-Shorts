export type ScriptCategory = 'space' | 'ancientciv';

export interface Script {
  hook: string;
  narration: string;
  stock_search_queries: string[];
  title: string;
  hashtags: string[];
}

export type TaskStatus = 'idle' | 'pending' | 'generating' | 'ready' | 'error';

export type ProcessStatus = 'not_processed' | 'processing' | 'ready' | 'error';

export interface StockClip {
  query: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number; // trimmed segment length in seconds
  sourceDuration: number; // original clip length in seconds
}

export interface QueueItem extends Script {
  id: string;
  category: ScriptCategory;
  channel: 1 | 2;

  videoStatus: TaskStatus;
  videoError?: string;
  clips?: StockClip[];
  clipRank: number; // result offset used for "Try Different Clips"

  voiceoverStatus: TaskStatus;
  audioUrl?: string;
  audioDuration?: number; // exact voiceover duration in seconds
  voiceoverError?: string;

  processStatus: ProcessStatus;
  finalVideoUrl?: string;
  processError?: string;

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

export type VoiceStyle =
  | 'dramatic'
  | 'authoritative'
  | 'warm'
  | 'emotional'
  | 'calm'
  | 'energetic'
  | 'deep'
  | 'soft';

export interface SettingsState {
  anthropicApiKey: string;
  pexelsApiKey: string;
  elevenLabsApiKey: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeAccessToken: string;
  channel1Name: string;
  channel2Name: string;
  voiceStyleSpace: VoiceStyle;
  voiceStyleAncientCiv: VoiceStyle;
  voiceStyleFeelGood: VoiceStyle;
}

export const VOICE_ID_MAP: Record<VoiceStyle, string> = {
  dramatic: 'ErXwobaYiN019PkySvjV',
  authoritative: 'TxGEqnHWrfWFTfGW9XjX',
  warm: 'EXAVITQu4vr4xnSDxMaL',
  emotional: 'MF3mGyEYCl7XYWbV9V6O',
  calm: '21m00Tcm4TlvDq8ikWAM',
  energetic: 'AZnzlk1XvdvUeBnXmlld',
  deep: 'pNInz6obpgDQGcFmaJgB',
  soft: 'yoZ06aMxZJJ28mfd3POQ',
};

export const VOICE_STYLE_OPTIONS: { value: VoiceStyle; label: string }[] = [
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'warm', label: 'Warm' },
  { value: 'emotional', label: 'Emotional' },
  { value: 'calm', label: 'Calm' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'deep', label: 'Deep' },
  { value: 'soft', label: 'Soft-spoken' },
];
