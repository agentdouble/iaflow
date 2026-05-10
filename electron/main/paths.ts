import path from 'node:path';
import os from 'node:os';

export const BASE_DIR = path.join(os.homedir(), '.config', '.iaflow');
export const FLOWS_DIR = path.join(BASE_DIR, 'flows');
export const LOGS_DIR = path.join(FLOWS_DIR, 'logs');
export const FLOW_CATEGORIES_FILE = path.join(FLOWS_DIR, 'categories.json');

export function flowPath(id: string): string {
  return path.join(FLOWS_DIR, `${id}.json`);
}

export function logPath(flowId: string, timestamp: string): string {
  return path.join(LOGS_DIR, `${flowId}_${timestamp}.log`);
}
