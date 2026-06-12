import type { Flow, HookTrigger, TriggerType } from '../../electron/shared/types';
import { formatSchedule } from './schedule';

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  schedule: 'Horaire',
  hook: 'Hook',
};

export const HOOK_PROVIDER_OPTIONS = ['any', 'codex', 'claude', 'opencode', 'watcher'];
export const DEFAULT_HOOK_EVENT = 'file.changed';
export const DEFAULT_HOOK_DEBOUNCE_SECONDS = 30;

export function parsePathPatterns(value: string): string[] {
  return value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function joinPathPatterns(paths?: string[]): string {
  return (paths || []).join(', ');
}

export function buildHookTrigger(
  event: string,
  provider: string,
  paths: string,
  debounceSeconds: string | number,
): HookTrigger {
  const parsedDebounce = Math.max(0, parseInt(String(debounceSeconds), 10) || 0);
  return {
    type: 'hook',
    event: event.trim() || DEFAULT_HOOK_EVENT,
    provider: provider.trim() || 'any',
    paths: parsePathPatterns(paths),
    debounceSeconds: parsedDebounce,
  };
}

export function formatHookTrigger(trigger?: HookTrigger): string {
  if (!trigger) return 'Hook non configure';
  const provider = trigger.provider && trigger.provider !== 'any' ? ` · ${trigger.provider}` : '';
  const paths = trigger.paths?.length ? ` · ${trigger.paths.join(', ')}` : '';
  const debounce = trigger.debounceSeconds ? ` · ${trigger.debounceSeconds}s` : '';
  return `Hook ${trigger.event}${provider}${paths}${debounce}`;
}

export function formatFlowTrigger(flow: Flow): string {
  if (flow.triggerType === 'hook' || flow.hookTrigger) {
    return formatHookTrigger(flow.hookTrigger);
  }
  return formatSchedule(flow.schedule);
}
