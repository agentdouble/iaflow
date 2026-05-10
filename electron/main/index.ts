import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { PtyManager } from './pty-manager';
import { flowManager } from './flow-manager';
import { registerIpc } from './ipc';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = !!VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
const pty = new PtyManager();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'IAFlow',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#141110',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL!);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  registerIpc(pty);
  flowManager.start(() => mainWindow, pty);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  flowManager.cleanup();
  pty.killAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  flowManager.cleanup();
  pty.killAll();
});
