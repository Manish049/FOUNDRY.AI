
export interface PromptResult {
  raw: string;
  refined: string;
  template: string;
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface TranscriptionTurn {
  role: 'user' | 'model';
  text: string;
}

export type VoiceName = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

export interface VoiceOption {
  id: VoiceName;
  label: string;
  gender: 'Male' | 'Female';
}

export const VOICES: VoiceOption[] = [
  { id: 'Zephyr', label: 'Ethereal', gender: 'Female' },
  { id: 'Kore', label: 'Command', gender: 'Female' },
  { id: 'Puck', label: 'Playful', gender: 'Male' },
  { id: 'Charon', label: 'Deep', gender: 'Male' },
  { id: 'Fenrir', label: 'Primal', gender: 'Male' },
];
