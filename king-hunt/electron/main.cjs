// Desktop shell: loads the static Vite build. No network, no accounts.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0b1020',
    title: 'King Hunt',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const smoke = process.argv.includes('--smoke');
  win.webContents.on('did-finish-load', () => {
    if (smoke) {
      console.log('smoke ok: page loaded');
      setTimeout(() => app.exit(0), 1500);
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('load failed', code, desc);
    if (smoke) app.exit(1);
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
