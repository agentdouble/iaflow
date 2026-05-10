import { promises as fsp } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export async function readJson<T = unknown>(file: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readDirJson<T = unknown>(dir: string): Promise<T[]> {
  try {
    const files = await fsp.readdir(dir);
    const out: T[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const data = await readJson<T>(path.join(dir, f));
      if (data) out.push(data);
    }
    return out;
  } catch {
    return [];
  }
}
