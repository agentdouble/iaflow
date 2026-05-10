import os from 'node:os';
import fs from 'node:fs';
import * as pty from 'node-pty';

const TERM = 'xterm-256color';
const DEFAULT_SHELL =
  process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');

function safeCwd(cwd?: string): string {
  if (cwd) {
    try {
      if (fs.statSync(cwd).isDirectory()) return cwd;
    } catch {}
  }
  return os.homedir();
}

export interface PtyOptions {
  id: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export class PtyManager {
  processes = new Map<string, pty.IPty>();

  create({ id, cwd, cols = 120, rows = 30 }: PtyOptions): pty.IPty {
    const spawnOpts: pty.IPtyForkOptions = {
      name: TERM,
      cols,
      rows,
      cwd: safeCwd(cwd),
      env: { ...process.env, TERM } as Record<string, string>,
    };
    let proc: pty.IPty;
    try {
      proc = pty.spawn(DEFAULT_SHELL, [], spawnOpts);
    } catch {
      spawnOpts.cwd = os.homedir();
      proc = pty.spawn(DEFAULT_SHELL, [], spawnOpts);
    }
    this.processes.set(id, proc);
    return proc;
  }

  write(id: string, data: string): void {
    this.processes.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.processes.get(id)?.resize(cols, rows);
  }

  kill(id: string): void {
    const proc = this.processes.get(id);
    if (!proc) return;
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {}
    proc.kill();
    this.processes.delete(id);
  }

  killAll(): void {
    for (const proc of this.processes.values()) {
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch {}
      proc.kill();
    }
    this.processes.clear();
  }
}
