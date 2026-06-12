export type AgentType = 'claude' | 'codex' | 'opencode';

export type ScheduleType = 'interval' | 'daily' | 'weekdays' | 'custom';
export type TriggerType = 'schedule' | 'hook';

export interface Schedule {
  type: ScheduleType;
  time?: string;
  intervalHours?: number;
  days?: number[];
}

export interface HookTrigger {
  type: 'hook';
  event: string;
  provider?: string;
  paths?: string[];
  debounceSeconds?: number;
}

export interface HookEvent {
  type: string;
  provider?: string;
  cwd?: string;
  paths?: string[];
  tool?: string;
  payload?: Record<string, unknown>;
}

export interface FlowRun {
  date: string;
  timestamp: string;
  logTimestamp?: string;
  status: 'running' | 'success' | 'error';
}

export interface Flow {
  id: string;
  name: string;
  prompt: string;
  agent: AgentType;
  cwd?: string;
  schedule: Schedule;
  triggerType?: TriggerType;
  hookTrigger?: HookTrigger;
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

export interface AgentMonitorAgent {
  id: string;
  agent: AgentType | 'unknown';
  status: 'running';
  pids: number[];
  parentPids: number[];
  command: string;
  cwd?: string;
  logFile?: string;
  lastMessageFile?: string;
  worktreeName?: string;
  projectId?: string;
  taskId?: string;
  title?: string;
  startedAt?: string;
  logUpdatedAt?: string;
  lastLogLines: string[];
}

export interface AgentMonitorSnapshot {
  generatedAt: string;
  agents: AgentMonitorAgent[];
  errors: string[];
}
