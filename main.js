const { app, BrowserWindow, session, ipcMain } = require('electron')
const path = require('path')

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.loadFile(path.join(__dirname, 'index.html')); // Loads Mind Map
}

// 1. Function to open the MAIN Slide Notes App
function launchSlideNotesApp() {
  console.log('Launching main Slide Notes app...');
  const slideAppWin = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  slideAppWin.loadFile(path.join(__dirname, 'Slide Notes.html'));
}

// 2. Function to open the SPLIT SCREEN window
function openExternalNotesWindow() {
  console.log('Creating Split Screen window...');
  const extWin = new BrowserWindow({
    width: 800,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  extWin.loadFile(path.join(__dirname, 'external-notes.html'));
  
  extWin.on('closed', () => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('split-screen-closed');
    });
  });
}

// --- IPC LISTENERS ---
// Mind Map calls this
ipcMain.on('launch-slidenotes-app', () => {
  launchSlideNotesApp();
});

// slidenotes.html calls this
ipcMain.on('open-external-notes', () => {
  openExternalNotesWindow();
});

// Syncs typing between split screens
ipcMain.on('sync-slide-state', (event, data) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (win.webContents !== event.sender) {
      win.webContents.send('update-notes-view', data);
    }
  });
});

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://localhost/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})