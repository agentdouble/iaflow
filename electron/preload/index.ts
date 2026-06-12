import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentMonitorSnapshot,
  Flow,
  CategoryData,
  RunningMap,
} from '../shared/types';

const ptyDataListeners = new Map<string, Set<(data: string) => void>>();
const ptyExitListeners = new Map<string, Set<(exitCode: number) => void>>();

ipcRenderer.on('pty:data', (_e, payload: { id: string; data: string }) => {
  const set = ptyDataListeners.get(payload.id);
  if (set) for (const fn of set) fn(payload.data);
});

ipcRenderer.on('pty:exit', (_e, payload: { id: string; exitCode: number }) => {
  const set = ptyExitListeners.get(payload.id);
  if (set) for (const fn of set) fn(payload.exitCode);
});

function subscribe<T extends (...args: any[]) => void>(
  map: Map<string, Set<T>>,
  id: string,
  fn: T,
): () => void {
  let set = map.get(id);
  if (!set) {
    set = new Set();
    map.set(id, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) map.delete(id);
  };
}

const api = {
  flow: {
    list: (): Promise<Flow[]> => ipcRenderer.invoke('flow:list'),
    save: (flow: Flow): Promise<Flow> => ipcRenderer.invoke('flow:save', flow),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('flow:delete', id),
    toggle: (id: string): Promise<Flow | null> => ipcRenderer.invoke('flow:toggle', id),
    runNow: (id: string): Promise<boolean> => ipcRenderer.invoke('flow:runNow', id),
    getRunning: (): Promise<RunningMap> => ipcRenderer.invoke('flow:getRunning'),
    getRunLog: (id: string, ts: string): Promise<string | null> =>
      ipcRenderer.invoke('flow:getRunLog', id, ts),
    getCategories: (): Promise<CategoryData> => ipcRenderer.invoke('flow:getCategories'),
    saveCategories: (data: CategoryData): Promise<CategoryData> =>
      ipcRenderer.invoke('flow:saveCategories', data),
    onRunStarted: (
      cb: (payload: { flowId: string; ptyId: string; flowName: string }) => void,
    ) => {
      const listener = (_e: unknown, payload: any) => cb(payload);
      ipcRenderer.on('flow:runStarted', listener);
      return () => ipcRenderer.off('flow:runStarted', listener);
    },
    onRunComplete: (
      cb: (payload: { flowId: string; ptyId: string; exitCode: number }) => void,
    ) => {
      const listener = (_e: unknown, payload: any) => cb(payload);
      ipcRenderer.on('flow:runComplete', listener);
      return () => ipcRenderer.off('flow:runComplete', listener);
    },
  },
  agents: {
    list: (): Promise<AgentMonitorSnapshot> => ipcRenderer.invoke('agents:list'),
  },
  pty: {
    onData: (id: string, cb: (data: string) => void) =>
      subscribe(ptyDataListeners, id, cb),
    onExit: (id: string, cb: (exitCode: number) => void) =>
      subscribe(ptyExitListeners, id, cb),
    write: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
  },
  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
