import path from 'node:path';
import type { Flow, HookEvent, HookTrigger } from './types';

const ANY = 'any';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeCwd(value?: string): string | null {
  if (!value) return null;
  return path.resolve(value);
}

function isWithinCwd(eventCwd: string | null, flowCwd: string | null): boolean {
  if (!flowCwd || !eventCwd) return true;
  const rel = path.relative(flowCwd, eventCwd);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(pattern: string): RegExp {
  const normalized = normalizePath(pattern.trim());
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === '*' && next === '*') {
      out += '.*';
      i += 1;
    } else if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  out += '$';
  return new RegExp(out);
}

function eventPaths(event: HookEvent): string[] {
  const cwd = normalizeCwd(event.cwd);
  return (event.paths || [])
    .filter(Boolean)
    .map((p) => {
      const normalized = normalizePath(p);
      if (!cwd || !path.isAbsolute(normalized)) return normalized;
      return normalizePath(path.relative(cwd, normalized));
    });
}

function eventMatches(trigger: HookTrigger, event: HookEvent): boolean {
  if (trigger.event !== '*' && trigger.event !== event.type) return false;

  const provider = (trigger.provider || ANY).toLowerCase();
  if (provider !== ANY && provider !== (event.provider || '').toLowerCase()) return false;

  const patterns = (trigger.paths || []).map((p) => p.trim()).filter(Boolean);
  if (!patterns.length) return true;

  const paths = eventPaths(event);
  if (!paths.length) return false;

  const regexes = patterns.map(globToRegex);
  return paths.some((p) => regexes.some((re) => re.test(normalizePath(p))));
}

export function isHookFlow(flow: Flow): boolean {
  return flow.triggerType === 'hook' || !!flow.hookTrigger;
}

export function flowMatchesHookEvent(flow: Flow, event: HookEvent): boolean {
  if (!flow.enabled || !flow.hookTrigger || !isHookFlow(flow)) return false;
  if (!isWithinCwd(normalizeCwd(event.cwd), normalizeCwd(flow.cwd))) return false;
  return eventMatches(flow.hookTrigger, event);
}
