const { app, BrowserWindow, session, ipcMain, dialog, screen, Tray, Menu } = require('electron')
const path = require('path')

let pomodoroWindow = null; // Keep track of the Pomodoro window
let mainWindow = null;
let tray = null;
let isQuitting = false;

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }

    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
}

function createTray() {
    if (tray) return;

    tray = new Tray(path.join(__dirname, 'Logo.ico'));
    tray.setToolTip('Slide Notes');

    const trayMenu = Menu.buildFromTemplate([
        {
            label: 'Show Slide Notes',
            click: () => showMainWindow()
        },
        {
            type: 'separator'
        },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(trayMenu);
    tray.on('click', () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            showMainWindow();
            return;
        }

        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            showMainWindow();
        }
    });
}

function createWindow () {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        // frame: false,
        icon: path.join(__dirname, 'Logo.ico'), // Set your .ico file here
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow = win;
    win.loadFile(path.join(__dirname, 'index.html')); // Loads Mind Map
    win.maximize(); // Open maximized, but not fullscreen

    // Hide to tray instead of quitting when closing the main window.
    win.on('close', (event) => {
        if (isQuitting) return;
        event.preventDefault();
        win.hide();
    });
    
    // When a main window closes, check if we should destroy the Pomodoro window
    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null;
        }
        const mainWindows = BrowserWindow.getAllWindows().filter(w => w !== pomodoroWindow);
        if (mainWindows.length === 0 && pomodoroWindow && !pomodoroWindow.isDestroyed()) {
            pomodoroWindow.destroy();
            pomodoroWindow = null;
        }
    });

    // Hides the default menu bar (File, Edit, etc.) for a cleaner look
    //win.setMenu(null)
}

// 1. Function to open the MAIN Slide Notes App
function launchSlideNotesApp(pdfBuffer = null, jsonContent = null, jsonPath = null) {
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
  
    if (pdfBuffer) {
        slideAppWin.webContents.once('did-finish-load', () => {
            // Send the combined payload
            slideAppWin.webContents.send('load-pdf-buffer', { pdfBuffer, jsonContent, jsonPath });
        });
    }
    
    // Cleanup Pomodoro when this window closes
    slideAppWin.on('closed', () => {
        const mainWindows = BrowserWindow.getAllWindows().filter(w => w !== pomodoroWindow);
        if (mainWindows.length === 0 && pomodoroWindow && !pomodoroWindow.isDestroyed()) {
            pomodoroWindow.destroy();
            pomodoroWindow = null;
        }
    });
}

// 2. Function to open a note in a new window
function launchNoteApp(noteData) {
    console.log('Launching note app...', noteData.type);
    const noteWin = new BrowserWindow({
        width: 1200,
        height: 800,
        x: 100,
        y: 100,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    noteWin.loadURL('file://' + path.join(__dirname, 'index.html') + '?note=1');
    noteWin.webContents.once('did-finish-load', () => {
        noteWin.webContents.send('load-note', noteData);
    });
    noteWin.focus();
    
    // Cleanup Pomodoro when this window closes
    noteWin.on('closed', () => {
        const mainWindows = BrowserWindow.getAllWindows().filter(w => w !== pomodoroWindow);
        if (mainWindows.length === 0 && pomodoroWindow && !pomodoroWindow.isDestroyed()) {
            pomodoroWindow.destroy();
            pomodoroWindow = null;
        }
    });
}

// 3. Function to open the SPLIT SCREEN window
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
        
        // Cleanup Pomodoro if no main windows remain
        const mainWindows = BrowserWindow.getAllWindows().filter(w => w !== pomodoroWindow);
        if (mainWindows.length === 0 && pomodoroWindow && !pomodoroWindow.isDestroyed()) {
            pomodoroWindow.destroy();
            pomodoroWindow = null;
        }
    });
}

// 4. NEW: Function to open the POMODORO Timer window with Magnetic Snapping
function openPomodoroWindow() {
    console.log('Creating Pomodoro window...');
    
    // If window already exists, just show it and bring to front
    if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
        pomodoroWindow.show();
        pomodoroWindow.focus();
        return;
    }
    
    const pomoWin = new BrowserWindow({
        width: 240,
        height: 110,
        alwaysOnTop: true, // Forces it above all other apps
        frame: false,      // Removes the top title bar
        resizable: false,
        transparent: true, // Allows smooth rounded corners
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
  
    pomoWin.loadFile(path.join(__dirname, 'pomodoro.html'));

    // Prevent closing the window from quitting the app - just hide it instead
    pomoWin.on('close', (event) => {
        event.preventDefault();
        pomoWin.hide();
    });
    
    // Store reference to the window
    pomodoroWindow = pomoWin;

    // --- MAGNETIC EDGE SNAPPING LOGIC ---
    // This triggers exactly when the user finishes dragging and drops the window
    pomoWin.on('moved', () => {
        const bounds = pomoWin.getBounds();
        // Get the monitor the window is currently on (great for multi-monitor setups)
        const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
        const workArea = display.workArea;

        const snapThreshold = 30; // How close (in pixels) before it snaps
        let newX = bounds.x;
        let newY = bounds.y;
        let shouldSnap = false;

        // 1. Check Horizontal Snapping (Left or Right edges)
        if (Math.abs(bounds.x - workArea.x) < snapThreshold) {
            newX = workArea.x; // Snap perfectly to Left
            shouldSnap = true;
        } else if (Math.abs((bounds.x + bounds.width) - (workArea.x + workArea.width)) < snapThreshold) {
            newX = workArea.x + workArea.width - bounds.width; // Snap perfectly to Right
            shouldSnap = true;
        }

        // 2. Check Vertical Snapping (Top or Bottom edges)
        if (Math.abs(bounds.y - workArea.y) < snapThreshold) {
            newY = workArea.y; // Snap perfectly to Top
            shouldSnap = true;
        } else if (Math.abs((bounds.y + bounds.height) - (workArea.y + workArea.height)) < snapThreshold) {
            newY = workArea.y + workArea.height - bounds.height; // Snap perfectly to Bottom
            shouldSnap = true;
        }

        // 3. Apply the snap if triggered
        if (shouldSnap) {
            pomoWin.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
        }
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

ipcMain.on('launch-slidenotes-app', (event, payload) => {
    // Handle both the new object payload and legacy null/buffer payloads
    if (payload && payload.pdfBuffer) {
        launchSlideNotesApp(payload.pdfBuffer, payload.jsonContent, payload.jsonPath);
    } else {
        launchSlideNotesApp(payload); 
    }
});

// NEW: Open note in new window
ipcMain.on('open-note-window', (event, noteData) => {
    launchNoteApp(noteData);
});

// NEW: Save note from new window
ipcMain.on('save-note', (event, {fileName, data}) => {
    BrowserWindow.getAllWindows().forEach(win => {
        if (win.webContents !== event.sender) {
            win.webContents.send('save-note', {fileName, data});
        }
    });
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

// NAVIGATION: Relay slide navigation from external window to main window
ipcMain.on('navigate-slide-from-external', (event, direction) => {
    BrowserWindow.getAllWindows().forEach(win => {
        if (win.webContents !== event.sender) {
            win.webContents.send('trigger-slide-nav', direction);
        }
    });
});
// NEW: Open Pomodoro window with snapping when requested
ipcMain.on('open-pomodoro-window', (event) => {
    console.log('main: open-pomodoro-window IPC received');
    try {
        openPomodoroWindow();
        try { event.sender.send('open-pomodoro-window-ok'); } catch (e) {}
    } catch (err) {
        console.error('main: failed to open pomodoro window', err);
        try { event.sender.send('open-pomodoro-window-error', String(err)); } catch (e) {}
    }
});

app.whenReady().then(() => {
    app.setAppUserModelId('SlideNotes.App');
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
        (details, callback) => {
            details.requestHeaders['Referer'] = 'https://localhost/';
            callback({ requestHeaders: details.requestHeaders });
        }
    );
    createWindow();
    createTray();
    app.on('activate', () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
        } else {
            showMainWindow();
        }
    });
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('window-all-closed', () => {
    // Keep running in the tray unless the user explicitly quits.
    if (isQuitting) {
        app.quit();
    }
})
