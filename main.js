const { app, BrowserWindow, session, ipcMain, dialog } = require('electron')
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
function launchSlideNotesApp(pdfBuffer = null) {
  console.log('Launching main Slide Notes app...', pdfBuffer ? 'with PDF buffer' : '');
  const slideAppWin = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  slideAppWin.loadFile(path.join(__dirname, 'Slide Notes.html'));
  if (pdfBuffer) {
    slideAppWin.webContents.once('did-finish-load', () => {
      slideAppWin.webContents.send('load-pdf-buffer', pdfBuffer);
    });
  }
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
ipcMain.handle('select-folder', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

ipcMain.on('launch-slidenotes-app', (event, pdfBuffer) => {
  launchSlideNotesApp(pdfBuffer);
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

// NEW: Relay edits from the external window BACK to the main window
ipcMain.on('edit-note-from-external', (event, text) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (win.webContents !== event.sender) {
      win.webContents.send('update-note-in-main', text);
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