import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { Flow, CategoryData } from '../shared/types';
import { flowManager } from './flow-manager';
import { PtyManager } from './pty-manager';

export function registerIpc(pty: PtyManager): void {
  // Flow CRUD
  ipcMain.handle('flow:list', () => flowManager.list());
  ipcMain.handle('flow:save', (_e, flow: Flow) => flowManager.save(flow));
  ipcMain.handle('flow:delete', (_e, id: string) => flowManager.remove(id));
  ipcMain.handle('flow:toggle', (_e, id: string) => flowManager.toggleEnabled(id));
  ipcMain.handle('flow:runNow', (_e, id: string) => flowManager.runNow(id));
  ipcMain.handle('flow:getRunning', () => flowManager.getRunning());
  ipcMain.handle('flow:getRunLog', (_e, id: string, ts: string) =>
    flowManager.getRunLog(id, ts),
  );

  // Categories
  ipcMain.handle('flow:getCategories', () => flowManager.getCategories());
  ipcMain.handle('flow:saveCategories', (_e, data: CategoryData) =>
    flowManager.saveCategories(data),
  );

  // Dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // PTY pass-through (write/resize for live terminals)
  ipcMain.on('pty:write', (_e, id: string, data: string) => pty.write(id, data));
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) =>
    pty.resize(id, cols, rows),
  );
}
