const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process'); // 👈 Used to run server.js

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');
}

// ✅ Start the backend server when Electron is ready
app.whenReady().then(() => {
  // Start server.js in a separate process
  fork(path.join(__dirname, 'server.js'));

  // Create the main window
  createWindow();
});

// Optional: Quit app when all windows are closed (for non-macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});