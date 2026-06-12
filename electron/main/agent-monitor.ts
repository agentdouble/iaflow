import { execFile } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentMonitorAgent, AgentMonitorSnapshot } from '../shared/types';

const execFileAsync = promisify(execFile);
const LOG_READ_BYTES = 256 * 1024;
const LOG_TAIL_LINES = 90;

interface ProcessRow {
  pid: number;
  ppid: number;
  startedAt?: string;
  command: string;
}

interface AgentDraft {
  key: string;
  agent: AgentMonitorAgent['agent'];
  pids: number[];
  parentPids: number[];
  command: string;
  cwd?: string;
  logFile?: string;
  lastMessageFile?: string;
  startedAt?: string;
  helper: boolean;
}

export async function listAgentMonitors(): Promise<AgentMonitorSnapshot> {
  const errors: string[] = [];
  let rows: ProcessRow[] = [];

  try {
    rows = parsePsOutput(await runPs());
  } catch (err) {
    errors.push(`ps failed: ${String(err)}`);
  }

  const drafts = groupAgentProcesses(rows);
  const agents = await Promise.all(
    drafts.map(async (draft) => hydrateAgent(draft, errors)),
  );

  return {
    generatedAt: new Date().toISOString(),
    agents: agents.sort(compareAgents),
    errors,
  };
}

async function runPs(): Promise<string> {
  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,lstart=,command=',
  ]);
  return stdout;
}

function parsePsOutput(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(
      /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/,
    );
    if (!match) continue;
    const parsedDate = new Date(match[3]);
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      startedAt: Number.isNaN(parsedDate.getTime())
        ? undefined
        : parsedDate.toISOString(),
      command: match[4],
    });
  }
  return rows;
}

function groupAgentProcesses(rows: ProcessRow[]): AgentDraft[] {
  const groups = new Map<string, AgentDraft>();

  for (const row of rows) {
    if (!isAgentCommand(row.command)) continue;

    const cwd = extractArg(row.command, '--cwd') || extractArg(row.command, '--cd');
    const logFile = extractArg(row.command, '--log-file');
    const lastMessageFile = extractArg(row.command, '--output-last-message');
    const derivedLog = logFile || deriveLogFile(lastMessageFile, cwd);
    const key = derivedLog || cwd || `${detectAgent(row.command)}:${row.pid}`;
    const helper = row.command.includes('run_headless_agent.py');

    const existing = groups.get(key);
    if (existing) {
      existing.pids.push(row.pid);
      existing.parentPids.push(row.ppid);
      if (helper && !existing.helper) {
        existing.command = row.command;
        existing.helper = true;
      }
      existing.cwd ||= cwd;
      existing.logFile ||= derivedLog;
      existing.lastMessageFile ||= lastMessageFile;
      existing.startedAt = minDate(existing.startedAt, row.startedAt);
      continue;
    }

    groups.set(key, {
      key,
      agent: detectAgent(row.command),
      pids: [row.pid],
      parentPids: [row.ppid],
      command: row.command,
      cwd,
      logFile: derivedLog,
      lastMessageFile,
      startedAt: row.startedAt,
      helper,
    });
  }

  return [...groups.values()];
}

function isAgentCommand(command: string): boolean {
  if (command.includes('SkyComputerUseClient')) return false;
  if (command.includes('agent-monitor')) return false;
  if (command.includes('run_headless_agent.py')) return true;
  if (/\bcodex\b/.test(command) && /\bexec\b/.test(command)) return true;
  if (/\bclaude\b/.test(command) && /\s-p\s|\s--print\b/.test(command)) return true;
  if (/\bopencode\b/.test(command)) return true;
  return false;
}

function detectAgent(command: string): AgentMonitorAgent['agent'] {
  const explicit = extractArg(command, '--agent');
  if (explicit === 'codex' || explicit === 'claude' || explicit === 'opencode') {
    return explicit;
  }
  if (/\bcodex\b/.test(command)) return 'codex';
  if (/\bclaude\b/.test(command)) return 'claude';
  if (/\bopencode\b/.test(command)) return 'opencode';
  return 'unknown';
}

function extractArg(command: string, name: string): string | undefined {
  const escaped = escapeRegExp(name);
  const match = command.match(new RegExp(`(?:^|\\s)${escaped}(?:=|\\s+)(\\S+)`));
  return match?.[1]?.replace(/^['"]|['"]$/g, '');
}

function deriveLogFile(lastMessageFile?: string, cwd?: string): string | undefined {
  if (lastMessageFile) {
    const candidate = path.join(path.dirname(lastMessageFile), 'agent.log');
    return candidate;
  }

  const worktreeName = cwd ? deriveWorktreeName(cwd) : undefined;
  if (!cwd || !worktreeName) return undefined;
  const worktreeIndex = cwd.split(path.sep).lastIndexOf('worktree');
  if (worktreeIndex <= 0) return undefined;
  const base = cwd.split(path.sep).slice(0, worktreeIndex).join(path.sep) || path.sep;
  return path.join(base, '.orch', 'headless-agents', worktreeName, 'agent.log');
}

async function hydrateAgent(
  draft: AgentDraft,
  errors: string[],
): Promise<AgentMonitorAgent> {
  const log = draft.logFile ? await readLogInfo(draft.logFile, errors) : null;
  const metadata = parseMetadata(log?.text || '');
  const worktreeName =
    metadata.worktreeName ||
    (draft.cwd ? deriveWorktreeName(draft.cwd) : undefined) ||
    (draft.logFile ? path.basename(path.dirname(draft.logFile)) : undefined);

  return {
    id: draft.key,
    agent: draft.agent,
    status: 'running',
    pids: uniqueNumbers(draft.pids),
    parentPids: uniqueNumbers(draft.parentPids),
    command: draft.command,
    cwd: draft.cwd,
    logFile: draft.logFile,
    lastMessageFile: draft.lastMessageFile,
    worktreeName,
    projectId: metadata.projectId,
    taskId: metadata.taskId,
    title: metadata.title,
    startedAt: draft.startedAt,
    logUpdatedAt: log?.updatedAt,
    lastLogLines: log?.lines || [],
  };
}

async function readLogInfo(
  filePath: string,
  errors: string[],
): Promise<{ text: string; lines: string[]; updatedAt?: string } | null> {
  try {
    const stat = await fsp.stat(filePath);
    const start = Math.max(0, stat.size - LOG_READ_BYTES);
    const handle = await fsp.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      const text = buffer.toString('utf-8');
      return {
        text,
        lines: text.split(/\r?\n/).filter(Boolean).slice(-LOG_TAIL_LINES),
        updatedAt: stat.mtime.toISOString(),
      };
    } finally {
      await handle.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push(`log read failed for ${filePath}: ${String(err)}`);
    }
    return null;
  }
}

function parseMetadata(text: string): {
  projectId?: string;
  taskId?: string;
  title?: string;
  worktreeName?: string;
} {
  return {
    projectId: findLineValue(text, 'project_id'),
    taskId: findLineValue(text, 'task_id'),
    title: findLineValue(text, 'title'),
    worktreeName: findLineValue(text, 'worktree_name'),
  };
}

function findLineValue(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

function deriveWorktreeName(cwd: string): string | undefined {
  const parts = cwd.split(path.sep).filter(Boolean);
  const index = parts.lastIndexOf('worktree');
  if (index >= 0 && parts[index + 1]) return parts[index + 1];
  return path.basename(cwd);
}

function compareAgents(a: AgentMonitorAgent, b: AgentMonitorAgent): number {
  const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
  const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
  return bTime - aTime;
}

function minDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
