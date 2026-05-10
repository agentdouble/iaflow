import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { BrowserWindow } from 'electron';
import type { Flow, CategoryData, RunningMap } from '../shared/types';
import { FLOWS_DIR, LOGS_DIR, FLOW_CATEGORIES_FILE, flowPath, logPath } from './paths';
import { ensureDir, readJson, writeJson, readDirJson } from './fs-utils';
import { shouldRun } from '../shared/schedule';
import { buildFlowCommand } from './agent-command';
import { createOutputProcessor } from './stream-parser';
import { PtyManager } from './pty-manager';

const SCHEDULER_INTERVAL_MS = 60_000;
const SHELL_INIT_DELAY_MS = 500;
const MAX_RUN_HISTORY = 7;
const MAX_FLOW_RUNTIME_MS = 2 * 60 * 60 * 1000;

interface RunningEntry {
  ptyId: string;
  timeout: NodeJS.Timeout;
}

export class FlowManager {
  private getWindow: (() => BrowserWindow | null) | null = null;
  private pty: PtyManager | null = null;
  private running = new Map<string, RunningEntry>();
  private interval: NodeJS.Timeout | null = null;

  start(getWindow: () => BrowserWindow | null, pty: PtyManager): void {
    this.getWindow = getWindow;
    this.pty = pty;
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => void this.tick(), SCHEDULER_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const [, { ptyId, timeout }] of this.running) {
      clearTimeout(timeout);
      this.pty?.kill(ptyId);
    }
    this.running.clear();
  }

  private send(channel: string, payload: unknown): void {
    const win = this.getWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  // --- CRUD ---

  async save(flow: Flow): Promise<Flow> {
    await ensureDir(FLOWS_DIR);
    const existing = await this.get(flow.id);
    const now = new Date().toISOString();
    const data: Flow = {
      ...flow,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      runs: flow.runs ?? existing?.runs ?? [],
      enabled: flow.enabled ?? existing?.enabled ?? true,
    };
    await writeJson(flowPath(flow.id), data);
    return data;
  }

  async get(id: string): Promise<Flow | null> {
    return readJson<Flow>(flowPath(id));
  }

  async list(): Promise<Flow[]> {
    await ensureDir(FLOWS_DIR);
    return readDirJson<Flow>(FLOWS_DIR);
  }

  async remove(id: string): Promise<boolean> {
    try {
      await fsp.unlink(flowPath(id));
      await this.cleanLogs(id);
      return true;
    } catch {
      return false;
    }
  }

  async toggleEnabled(id: string): Promise<Flow | null> {
    const flow = await this.get(id);
    if (!flow) return null;
    flow.enabled = !flow.enabled;
    return this.save(flow);
  }

  getRunning(): RunningMap {
    return Object.fromEntries([...this.running].map(([id, { ptyId }]) => [id, ptyId]));
  }

  async getRunLog(flowId: string, timestamp: string): Promise<string | null> {
    try {
      return await fsp.readFile(logPath(flowId, timestamp), 'utf-8');
    } catch {
      return null;
    }
  }

  // --- Categories ---

  async getCategories(): Promise<CategoryData> {
    await ensureDir(FLOWS_DIR);
    return (
      (await readJson<CategoryData>(FLOW_CATEGORIES_FILE)) || { categories: [], order: {} }
    );
  }

  async saveCategories(data: CategoryData): Promise<CategoryData> {
    await ensureDir(FLOWS_DIR);
    await writeJson(FLOW_CATEGORIES_FILE, data);
    return data;
  }

  private async cleanLogs(flowId: string): Promise<void> {
    try {
      const files = (await fsp.readdir(LOGS_DIR)).filter((f) => f.startsWith(flowId + '_'));
      await Promise.all(files.map((f) => fsp.unlink(path.join(LOGS_DIR, f))));
    } catch {}
  }

  // --- Scheduling ---

  private async tick(): Promise<void> {
    const now = new Date();
    const flows = await this.list();
    for (const flow of flows) {
      if (!flow.enabled) continue;
      if (this.running.has(flow.id)) continue;
      if (shouldRun(flow, now)) this.execute(flow);
    }
  }

  // --- Execution ---

  async runNow(id: string): Promise<boolean> {
    const flow = await this.get(id);
    if (!flow) return false;
    if (this.running.has(id)) return false;
    this.execute(flow);
    return true;
  }

  private async saveLog(flowId: string, runTimestamp: string, output: string): Promise<void> {
    await ensureDir(LOGS_DIR);
    try {
      await fsp.writeFile(logPath(flowId, runTimestamp), output, 'utf-8');
    } catch {}
  }

  private async recordRun(
    flowId: string,
    status: 'success' | 'error',
    runTimestamp: string,
  ): Promise<void> {
    const flow = await this.get(flowId);
    if (!flow) return;
    const now = new Date().toISOString();
    const runs = flow.runs || [];
    runs.push({
      date: now.slice(0, 10),
      timestamp: now,
      logTimestamp: runTimestamp,
      status,
    });
    flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
    await this.save(flow);
  }

  private execute(flow: Flow): void {
    if (!this.pty) return;

    const ptyId = `flow-${flow.id}-${Date.now()}`;
    const cwd = flow.cwd || os.homedir();
    const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

    try {
      const proc = this.pty.create({ id: ptyId, cwd, cols: 120, rows: 30 });
      const output = createOutputProcessor(flow.agent);

      proc.onData((data) => {
        const formatted = output.processData(data);
        if (formatted) this.send('pty:data', { id: ptyId, data: formatted });
      });

      proc.onExit(async ({ exitCode }) => {
        const remaining = output.flush();
        if (remaining) this.send('pty:data', { id: ptyId, data: remaining });

        const entry = this.running.get(flow.id);
        if (entry?.timeout) clearTimeout(entry.timeout);
        this.pty?.processes.delete(ptyId);
        this.running.delete(flow.id);

        this.send('pty:exit', { id: ptyId, exitCode });
        this.send('flow:runComplete', { flowId: flow.id, ptyId, exitCode });

        await this.saveLog(flow.id, runTimestamp, output.getOutput());
        await this.recordRun(flow.id, exitCode === 0 ? 'success' : 'error', runTimestamp);
      });

      const timeout = setTimeout(() => {
        this.pty?.kill(ptyId);
      }, MAX_FLOW_RUNTIME_MS);

      this.running.set(flow.id, { ptyId, timeout });

      this.send('flow:runStarted', {
        flowId: flow.id,
        ptyId,
        flowName: flow.name,
      });

      const cmd = buildFlowCommand(flow);
      setTimeout(() => {
        this.pty?.write(ptyId, cmd);
      }, SHELL_INIT_DELAY_MS);
    } catch (err) {
      console.error('[flow-manager] execute failed', err);
      void this.recordRun(flow.id, 'error', runTimestamp);
    }
  }

  cleanup(): void {
    this.stop();
  }
}

export const flowManager = new FlowManager();
