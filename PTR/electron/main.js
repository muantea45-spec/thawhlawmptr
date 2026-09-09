import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Request single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow;

  // Set default port if not set
  const PORT = process.env.PORT || '5000';
  process.env.PORT = PORT;

  // Import Express backend server
  const startServer = async () => {
    try {
      await import('../server/index.js');
      console.log('[Electron Main] Express backend initialized.');
    } catch (err) {
      console.log('[Electron Main] Backend notification:', err?.message || err);
    }
  };

  const createWindow = async () => {
    await startServer();

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 1000,
      minHeight: 700,
      title: 'Pathian Ram - Tithe Collection System',
      autoHideMenuBar: true,
      backgroundColor: '#f8fafc',
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    // Wait slightly for server to be fully ready then load URL
    const appUrl = `http://localhost:${PORT}`;

    // Retry connection until server is responsive
    const loadApp = async (retries = 30) => {
      try {
        await mainWindow.loadURL(appUrl);
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => loadApp(retries - 1), 250);
        } else {
          console.error('[Electron Main] Failed to load application URL:', err);
        }
      }
    };

    loadApp();

    // Handle external link clicks cleanly
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
