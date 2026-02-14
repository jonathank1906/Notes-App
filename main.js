const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Allows you to use 'require' in your HTML
      contextIsolation: false // Disables the sandbox so you can save files
    }
  })

  // Completely destroy the default menu so the Alt key doesn't trigger it
  //win.setMenu(null)

  // Load your HTML file (Change 'index.html' to 'MindMap.html' if you kept the old name!)
  win.loadFile(path.join(__dirname, 'index.html'))
  
  // Optional: Uncomment the line below if you ever need Developer Tools back
  // win.webContents.openDevTools()
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})