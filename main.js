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
  win.loadFile(path.join(__dirname, 'index.html'));
}

function openSlideNotesWindow() {
  console.log('Creating Slide Notes window...');
  const slideWin = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  slideWin.loadFile(path.join(__dirname, 'Slide Notes.html'));
}

// IPC handler for opening Slide Notes window
ipcMain.on('open-slide-notes-window', () => {
  console.log('IPC: open-slide-notes-window received');
  openSlideNotesWindow();
});


app.whenReady().then(() => {
  // --- YOUTUBE ERROR 153 FIX ---
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://localhost/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  // (No longer needed: global.openSlideNotesWindow)
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})