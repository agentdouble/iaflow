export type AgentType = 'claude' | 'codex' | 'opencode';

export type ScheduleType = 'interval' | 'daily' | 'weekdays' | 'custom';

export interface Schedule {
  type: ScheduleType;
  time?: string;
  intervalHours?: number;
  days?: number[];
}

export interface FlowRun {
  date: string;
  timestamp: string;
  logTimestamp?: string;
  status: 'success' | 'error';
}

export interface Flow {
  id: string;
  name: string;
  prompt: string;
  agent: AgentType;
  cwd?: string;
  schedule: Schedule;
  dangerouslySkipPermissions?: boolean;
  enabled: boolean;
  runs: FlowRun[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface CategoryData {
  categories: Category[];
  order: Record<string, string[]>;
}

export type RunningMap = Record<string, string>;
