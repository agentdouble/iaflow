import type { Flow, CategoryData, RunningMap } from '../../electron/shared/types';

declare global {
  interface Window {
    api: {
      flow: {
        list: () => Promise<Flow[]>;
        save: (flow: Flow) => Promise<Flow>;
        delete: (id: string) => Promise<boolean>;
        toggle: (id: string) => Promise<Flow | null>;
        runNow: (id: string) => Promise<boolean>;
        getRunning: () => Promise<RunningMap>;
        getRunLog: (id: string, ts: string) => Promise<string | null>;
        getCategories: () => Promise<CategoryData>;
        saveCategories: (data: CategoryData) => Promise<CategoryData>;
        onRunStarted: (
          cb: (payload: { flowId: string; ptyId: string; flowName: string }) => void,
        ) => () => void;
        onRunComplete: (
          cb: (payload: { flowId: string; ptyId: string; exitCode: number }) => void,
        ) => () => void;
      };
      pty: {
        onData: (id: string, cb: (data: string) => void) => () => void;
        onExit: (id: string, cb: (exitCode: number) => void) => () => void;
        write: (id: string, data: string) => void;
        resize: (id: string, cols: number, rows: number) => void;
      };
      dialog: {
        openFolder: () => Promise<string | null>;
      };
    };
  }
}

export {};
