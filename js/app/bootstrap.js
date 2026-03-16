
// --- Open Slide Notes in New Electron Window ---
// Ensure Node.js modules are available if running in Electron
let fs, path, ipcRenderer;
let rootPath;
let noteMap = new Map();
let currentNoteFileName;
let currentFilePath = null; // <-- store absolute path for direct disk saves from detached windows
let isDetachedWindow = window.location.search.includes('note'); // flag to indicate a note opened in its own window
// ---> DETACHED WINDOW SYNC FIX <---
// Listens for rename broadcasts from other windows
window.addEventListener('storage', (e) => {
    if (e.key === 'app-file-renamed' && e.newValue) {
        const renameData = JSON.parse(e.newValue);
        // If this window is currently holding the old file, update it to the new name!
        if (typeof currentFileName !== 'undefined' && currentFileName === renameData.oldName) {
            currentFileName = renameData.newName;
        }
        if (currentNoteFileName === renameData.oldName) {
            currentNoteFileName = renameData.newName;
        }
    }
});
if (window.require) {
    try {
        fs = window.require('fs');
        path = window.require('path');
        ipcRenderer = window.require('electron').ipcRenderer;
    } catch (e) {
        fs = null;
        path = null;
        ipcRenderer = null;
    }
}

// IPC listener for loading note in new window
if (ipcRenderer) {
    ipcRenderer.on('load-note', (event, noteData) => {
        // Mark this renderer as a detached/note window so we can adjust global shortcuts
        isDetachedWindow = true;
        openNoteFromData(noteData);
    });
    ipcRenderer.on('save-note', async (event, {fileName, data}) => {
        const item = noteMap.get(fileName);
        if (item) {
            item.data = data;
            try {
                // If we have a filesystem path for this item, prefer a direct synchronous write
                if (typeof fs !== 'undefined' && item.handle && item.handle.path) {
                    try {
                        fs.writeFileSync(item.handle.path, JSON.stringify(data));
                        return;
                    } catch (err) {
                        console.error('Direct write failed, falling back to createWritable:', err);
                    }
                }
                const writable = await item.handle.createWritable();
                await writable.write(JSON.stringify(data));
                await writable.close();
            } catch (err) {
                console.error('Error saving:', err);
            }
        }
    });
}

function openSlidesApp() {
    console.log('openSlidesApp called');
    if (ipcRenderer) {
        console.log('ipcRenderer available, sending launch-slidenotes-app');
        ipcRenderer.send('launch-slidenotes-app');
    } else {
        console.log('ipcRenderer NOT available');
        alert('Not running in Electron environment.');
    }
}

function resolveFilePathFromHandle(fileHandle, dirHandle = null) {
    if (fileHandle && fileHandle.path) return fileHandle.path;
    if (dirHandle && dirHandle.path && fileHandle && fileHandle.name && path) {
        return path.join(dirHandle.path, fileHandle.name);
    }
    return null;
}

function openFileInExternalApp(fileHandle, dirHandle = null) {
    const filePath = resolveFilePathFromHandle(fileHandle, dirHandle);
    if (!filePath) {
        console.error('Could not resolve file path for external open:', fileHandle?.name);
        return;
    }

    try {
        if (shell && typeof shell.openPath === 'function') {
            shell.openPath(filePath).then((errorText) => {
                if (errorText) {
                    console.error('Failed to open external file:', errorText, filePath);
                }
            });
        }
    } catch (err) {
        console.error('Failed to launch external app for file:', filePath, err);
    }
}
const os = require('os');
const { shell, clipboard: electronClipboard, nativeImage } = require('electron');
const MARKDOWN_OPEN_APP_STORAGE_KEY = 'markdownOpenApp';
const MARKDOWN_APP_OBSIDIAN = 'obsidian';
const MARKDOWN_APP_TYPORA = 'typora';
const OBSIDIAN_VAULT_NAME = 'Semester 4';

function getMarkdownOpenAppPreference() {
    const value = (localStorage.getItem(MARKDOWN_OPEN_APP_STORAGE_KEY) || MARKDOWN_APP_OBSIDIAN).toLowerCase();
    return value === MARKDOWN_APP_TYPORA ? MARKDOWN_APP_TYPORA : MARKDOWN_APP_OBSIDIAN;
}

function openMarkdownInObsidian(filePath, fileName = '') {
    if (!shell || typeof shell.openExternal !== 'function') return false;

    const fullPath = (filePath || '').replace(/\\/g, '/');
    let relativePath = fullPath;
    const marker = OBSIDIAN_VAULT_NAME + '/';

    if (fullPath && fullPath.includes(marker)) {
        relativePath = fullPath.split(marker)[1];
    } else {
        relativePath = fileName || fullPath;
    }

    if (!relativePath) return false;

    const obsidianUri = 'obsidian://advanced-uri?vault=' + encodeURIComponent(OBSIDIAN_VAULT_NAME) + '&filepath=' + encodeURIComponent(relativePath) + '&openmode=window';
    try {
        shell.openExternal(obsidianUri);
        return true;
    } catch (err) {
        console.error('Failed to open Advanced URI, trying fallback:', err);
        try {
            const fallbackTarget = filePath || fileName;
            if (!fallbackTarget) return false;
            const fallback = 'obsidian://open?path=' + encodeURIComponent(fallbackTarget);
            shell.openExternal(fallback);
            return true;
        } catch (e) {
            console.error('Failed to open Obsidian fallback URI:', e);
        }
    }
    return false;
}

function openMarkdownInTypora(filePath, fileName = '') {
    if (!filePath || !path || !fs || !os) {
        console.error('Cannot open Typora because file path resolution failed:', fileName || filePath);
        return false;
    }

    if (!fs.existsSync(filePath)) {
        alert('Markdown file not found for Typora launch:\n' + filePath);
        return false;
    }

    const launcherCandidates = [
        'D:\\Downloads\\Typora-Multi.bat',
        path.join(os.homedir(), 'Downloads', 'Typora-Multi.bat'),
        path.join(os.homedir(), 'Downloads', 'Typora-Mutli.bat')
    ];
    const launcherPath = launcherCandidates.find(candidate => fs.existsSync(candidate));
    if (!launcherPath) {
        alert('Typora launcher not found. Checked:\n' + launcherCandidates.join('\n'));
        return false;
    }

    try {
        const { spawn } = require('child_process');
        // Pass launcher and markdown path as separate argv tokens to preserve %1 in the .bat.
        const child = spawn('cmd.exe', ['/d', '/c', launcherPath, filePath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        return true;
    } catch (err) {
        console.warn('Launcher .bat call failed, trying Typora.exe fallback:', err);
    }

    try {
        const { spawn } = require('child_process');
        const exeCandidates = [
            'C:\\Program Files\\Typora\\Typora.exe',
            path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Typora', 'Typora.exe')
        ];
        const typoraExe = exeCandidates.find(candidate => fs.existsSync(candidate));
        if (!typoraExe) {
            alert('Could not launch Typora. Checked launcher and Typora.exe paths.');
            return false;
        }

        const child = spawn(typoraExe, [filePath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        return true;
    } catch (err) {
        console.error('Failed to launch Typora after all fallbacks:', err);
        alert('Typora launch failed. Check if Typora and Typora-Multi.bat can open this file manually.');
        return false;
    }
}

function openMarkdownInPreferredApp(fileHandle, dirHandle = null) {
    const filePath = resolveFilePathFromHandle(fileHandle, dirHandle);
    const fileName = (fileHandle && fileHandle.name) ? fileHandle.name : '';
    const preferredApp = getMarkdownOpenAppPreference();

    if (preferredApp === MARKDOWN_APP_TYPORA) {
        const opened = openMarkdownInTypora(filePath, fileName);
        if (opened) return;
        // Fallback to Obsidian if Typora launch fails.
        openMarkdownInObsidian(filePath, fileName);
        return;
    }

    openMarkdownInObsidian(filePath, fileName);
}

// --- CONFIGURATION ---
const CONFIG = {
    bgColor: '#121212',
    penColor: '#e0e0e0',
    penWidth: 2,
    minZoom: 0.1,
    maxZoom: 20,
    gridSize: 50,
    gridDotSize: 1.5,
    // Increased for stronger zoom responsiveness
    zoomSensitivity: 0.006,
    panSensitivity: 0.25
};

// Mouse pan multiplier (lower => less floaty)
const PAN_FACTOR = 0.65;

// --- STATE ---
// Workaround: normalize invalid textBaseline values (e.g. 'alphabetical' -> 'alphabetic')
(function() {
    try {
        const proto = CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
        if (!proto) return;
        const desc = Object.getOwnPropertyDescriptor(proto, 'textBaseline');
        if (desc && typeof desc.set === 'function') {
            const originalSet = desc.set;
            const originalGet = desc.get;
            Object.defineProperty(proto, 'textBaseline', {
                configurable: true,
                enumerable: true,
                get: function() { return originalGet.call(this); },
                set: function(v) {
                    if (v === 'alphabetical') v = 'alphabetic';
                    return originalSet.call(this, v);
                }
            });
        }
    } catch (err) {}
})();


const canvas = document.getElementById('canvas');

// Fabric.js canvas
let fabricCanvas = null;

// Camera/viewport (Fabric handles this internally, but we track for compatibility)
let camera = { x: 0, y: 0, z: 1 };

// Undo/redo
let undoStack = [];
let redoStack = [];
// Snapshot of the canvas state before the most recent change
let lastSnapshot = null;

// Interaction state
let isPanning = false;
let isSpacePressed = false;
let activeTool = 'select';
let lastMouse = { x: 0, y: 0 };
// Remember if drawing was active before temporarily disabling for panning
let prevDrawingMode = false;
// Fabric panning helpers (capture-phase fallback)
let fabricIsPanning = false;
let fabricLastPosX = 0;
let fabricLastPosY = 0;
let panAnchorWorld = null;

// File state
let currentStroke = null;
let hasUnsavedChanges = false;

// Clipboard
let clipboard = null;

// File explorer / UI state used by other modules
let rootDirHandle = null;
let currentDirHandle = null;
let currentFileName = 'untitled';
let currentFileHandle = null;
let currentNoteType = 'note';
let allSubjects = [];
let allDividers = []; // Track dividers and their collapsible state
let activeSubject = null;
let allNotesLoaded = false;
let currentView = 'organized';
let pdfPreviewCache = {};
let notePreviewObserver = null;
let noteCardMap = new Map();
let noteCardsBySubject = new Map();
let allNoteCards = [];
let currentVisibleCardSet = new Set();
let noteDataCache = new Map();
let subjectPdfCache = new Map();
let pdfLoadRequestId = 0;
let startupWarmupRunning = false;
let loadedNotesForSearch = [];
let globalSearchIndex = new Map();
let globalSearchRequestId = 0;
let isGlobalSearchOpen = false;
let lastIllustratorSvgExportPath = null;
let hoveredAiPreviewNote = null;
let aiAdvancedPreviewCache = new Map();
let aiAdvancedModalEl = null;
let aiAdvancedModalImageEl = null;
let aiAdvancedModalTitleEl = null;
let aiAdvancedModalStatusEl = null;
const aiAdvancedViewState = {
    scale: 1,
    minScale: 0.35,
    maxScale: 9,
    tx: 0,
    ty: 0,
    panning: false,
    lastX: 0,
    lastY: 0
};
// --- INIT ---
function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    if (fabricCanvas) {
        fabricCanvas.setDimensions({ width: w, height: h });
        fabricCanvas.calcOffset();
        fabricCanvas.renderAll();
    }
}
window.addEventListener('resize', resize);

resize();
// CRITICAL: Capture middle mouse button BEFORE other listeners (capture phase)
document.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle mouse button
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}

        // Manually trigger panning if Fabric is initialized
        if (fabricCanvas) {
            isPanning = true;
            fabricIsPanning = true;
            // Determine the canvas-relative pointer
            try {
                const rect = fabricCanvas.lowerCanvasEl.getBoundingClientRect();
                const pointer = new fabric.Point(e.clientX - rect.left, e.clientY - rect.top);
                panAnchorWorld = fabric.util.transformPoint(pointer, fabric.util.invertTransform(fabricCanvas.viewportTransform));
            } catch (err) {
                panAnchorWorld = null;
            }

            fabricLastPosX = e.clientX;
            fabricLastPosY = e.clientY;

            try {
                if (fabricCanvas.isDrawingMode) {
                    prevDrawingMode = true;
                    fabricCanvas.isDrawingMode = false;
                }
            } catch (err) {}
            try { fabricCanvas.selection = false; } catch (err) {}
            try { fabricCanvas.defaultCursor = 'grabbing'; } catch (err) {}
            try { canvas.style.cursor = 'grabbing'; } catch (err) {}
        }
    }
}, true);

document.addEventListener('mousemove', (e) => {
    if (isPanning && fabricCanvas && fabricIsPanning) {
        try {
            const rect = fabricCanvas.lowerCanvasEl.getBoundingClientRect();
            const pointer = new fabric.Point(e.clientX - rect.left, e.clientY - rect.top);
            if (panAnchorWorld) {
                const vpt = fabricCanvas.viewportTransform;
                vpt[4] = pointer.x - (vpt[0] * panAnchorWorld.x + vpt[1] * panAnchorWorld.y);
                vpt[5] = pointer.y - (vpt[2] * panAnchorWorld.x + vpt[3] * panAnchorWorld.y);
                fabricCanvas.requestRenderAll();
            } else {
                // Fallback to relativePan scaled by PAN_FACTOR
                const dx = e.clientX - fabricLastPosX;
                const dy = e.clientY - fabricLastPosY;
                try { fabricCanvas.relativePan(new fabric.Point(dx * PAN_FACTOR, dy * PAN_FACTOR)); } catch (err) { const vpt = fabricCanvas.viewportTransform; vpt[4] += dx * PAN_FACTOR; vpt[5] += dy * PAN_FACTOR; }
                fabricCanvas.requestRenderAll();
            }
            fabricLastPosX = e.clientX;
            fabricLastPosY = e.clientY;
        } catch (err) {}
    }
}, true);

document.addEventListener('mouseup', (e) => {
    if (e.button === 1 && isPanning && fabricIsPanning) {
        isPanning = false;
        fabricIsPanning = false;
        panAnchorWorld = null;
        try { if (fabricCanvas) {
            if (prevDrawingMode) {
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.selection = false;
            } else {
                fabricCanvas.selection = true;
            }
        }} catch (err) {}
        prevDrawingMode = false;
        try { updateCursor(); } catch (err) {}
    }
}, true);

// Initialize Fabric.js canvas
function initFabricCanvas() {
    fabricCanvas = new fabric.Canvas('canvas', {
        backgroundColor: CONFIG.bgColor,
        selection: true,
        isDrawingMode: false,
        perPixelTargetFind: true,
        targetFindTolerance: 5,
        fireRightClick: true,
        stopContextMenu: true
    });
    
    // Configure drawing brush
    fabricCanvas.freeDrawingBrush.color = CONFIG.penColor;
    fabricCanvas.freeDrawingBrush.width = CONFIG.penWidth;
    
    // Initialize last snapshot
    lastSnapshot = fabricCanvas.toJSON();

    // Event handlers
    fabricCanvas.on('object:modified', () => {
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        addToUndoStack();
    });
    
    fabricCanvas.on('object:added', () => {
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
    });
    
    fabricCanvas.on('path:created', (e) => {
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        addToUndoStack();
    });

    // Double-click to add IText (point text) which naturally hugs the typed text.
    fabricCanvas.on('mouse:dblclick', (opt) => {
        try {
            const e = opt.e;
            // Only left-button
            if (e && e.button !== 0) return;
            // Only allow in select mode (respect existing activeTool if present)
            if (typeof activeTool !== 'undefined' && activeTool !== 'select') return;

            // If double-clicked an existing object, let Fabric handle editing
            if (opt.target) {
                if (opt.target.enterEditing) {
                    opt.target.enterEditing();
                }
                return;
            }

            const pointer = fabricCanvas.getPointer(e);
            const itext = new fabric.IText('', {
                left: pointer.x,
                top: pointer.y,
                fontSize: 16,
                fill: '#e0e0e0',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                originX: 'left',
                originY: 'top',
                padding: 0,
                editable: true,
                selectable: true,
                hasControls: false,
                hasBorders: false
            });

            fabricCanvas.add(itext);
            fabricCanvas.setActiveObject(itext);
            itext.enterEditing && itext.enterEditing();
            // ensure the hidden textarea receives focus
            try { if (itext.hiddenTextarea) itext.hiddenTextarea.focus(); } catch (err) {}
            fabricCanvas.requestRenderAll();
            hasUnsavedChanges = true;
            try { addToUndoStack && addToUndoStack(); } catch (err) {}
        } catch (err) {}
    });

    // When editing starts, hide controls so bounding box isn't visible while typing
    fabricCanvas.on('text:editing:entered', (opt) => {
        try {
            const tb = opt.target;
            if (tb && (tb.type === 'i-text' || tb instanceof fabric.IText)) {
                tb.set({ hasControls: false, hasBorders: false, padding: 0 });
                fabricCanvas.requestRenderAll();
            }
        } catch (err) {}
    });

    // When editing exits, if empty remove object; otherwise restore tight bounds
    fabricCanvas.on('text:editing:exited', (opt) => {
        try {
            const tb = opt.target;
            if (!tb) return;
            if (tb.text == null || tb.text.trim() === '') {
                fabricCanvas.remove(tb);
                fabricCanvas.requestRenderAll();
                return;
            }

            // Ensure no padding so bounding box hugs text tightly
            tb.set({ padding: 0, hasControls: true, hasBorders: true, selectable: true });
            tb.setCoords();
            fabricCanvas.requestRenderAll();
            hasUnsavedChanges = true;
            try { addToUndoStack && addToUndoStack(); } catch (err) {}
        } catch (err) {}
    });
    
    // Mouse events for panning (anchor-based so cursor stays over same world point)
    fabricCanvas.on('mouse:down', (opt) => {
        const evt = opt.e;
        if (evt.button === 1 || (evt.button === 0 && isSpacePressed)) {
            try { evt.preventDefault(); evt.stopPropagation(); } catch (err) {}
            isPanning = true;
            fabricIsPanning = true;
            // Compute pan anchor in world coordinates (canvas-relative)
            try {
                const rect = fabricCanvas.lowerCanvasEl.getBoundingClientRect();
                const pointer = new fabric.Point(evt.clientX - rect.left, evt.clientY - rect.top);
                panAnchorWorld = fabric.util.transformPoint(pointer, fabric.util.invertTransform(fabricCanvas.viewportTransform));
            } catch (err) {
                panAnchorWorld = null;
            }
            // Temporarily disable drawing while panning and remember previous state
            try {
                if (fabricCanvas && fabricCanvas.isDrawingMode) {
                    prevDrawingMode = true;
                    fabricCanvas.isDrawingMode = false;
                    fabricCanvas.selection = true;
                }
                if (fabricCanvas) fabricCanvas.skipTargetFind = true;
            } catch (err) {}
            fabricCanvas.selection = false;
            fabricCanvas.defaultCursor = 'grabbing';
            fabricCanvas.requestRenderAll();
        }
    });

    fabricCanvas.on('mouse:move', (opt) => {
        const evt = opt.e;
        if (fabricIsPanning) {
            try {
                const rect = fabricCanvas.lowerCanvasEl.getBoundingClientRect();
                const pointer = new fabric.Point(evt.clientX - rect.left, evt.clientY - rect.top);
                if (panAnchorWorld) {
                    const vpt = fabricCanvas.viewportTransform;
                    vpt[4] = pointer.x - (vpt[0] * panAnchorWorld.x + vpt[1] * panAnchorWorld.y);
                    vpt[5] = pointer.y - (vpt[2] * panAnchorWorld.x + vpt[3] * panAnchorWorld.y);
                } else {
                    const dx = evt.movementX || (evt.clientX - fabricLastPosX);
                    const dy = evt.movementY || (evt.clientY - fabricLastPosY);
                    try { fabricCanvas.relativePan(new fabric.Point(dx * PAN_FACTOR, dy * PAN_FACTOR)); } catch (err) { const vpt = fabricCanvas.viewportTransform; vpt[4] += dx * PAN_FACTOR; vpt[5] += dy * PAN_FACTOR; }
                }
            } catch (err) {}
            fabricLastPosX = evt.clientX;
            fabricLastPosY = evt.clientY;
            fabricCanvas.requestRenderAll();
        }
    });

    fabricCanvas.on('mouse:up', () => {
        if (fabricIsPanning) {
            fabricIsPanning = false;
            isPanning = false;
            panAnchorWorld = null;
            try { if (fabricCanvas) fabricCanvas.skipTargetFind = false; } catch (err) {}
            try {
                if (fabricCanvas && prevDrawingMode) {
                    fabricCanvas.isDrawingMode = true;
                    fabricCanvas.selection = false;
                }
            } catch (err) {}
            prevDrawingMode = false;
            updateCursor();
            fabricCanvas.requestRenderAll();
        }
    });
    
    // Zoom with Alt + Scroll
    fabricCanvas.on('mouse:wheel', (opt) => {
        const e = opt.e;
        e.preventDefault();
        e.stopPropagation();
        
        if (e.altKey) {
            const delta = e.deltaY;
            let zoom = fabricCanvas.getZoom();
            // Increase sensitivity: apply wheel delta * 4 to make zoom ~2x more sensitive
            zoom *= 0.999 ** (delta * 6);
            zoom = Math.min(Math.max(CONFIG.minZoom, zoom), CONFIG.maxZoom);
            
            fabricCanvas.zoomToPoint(
                { x: e.offsetX, y: e.offsetY },
                zoom
            );
        } else if (e.ctrlKey) {
            fabricCanvas.relativePan(new fabric.Point(-e.deltaY * CONFIG.panSensitivity, 0));
        } else {
            fabricCanvas.relativePan(new fabric.Point(
                -e.deltaX * CONFIG.panSensitivity,
                -e.deltaY * CONFIG.panSensitivity
            ));
        }
        fabricCanvas.requestRenderAll();
    });
        // Right-click handler for context menu (Tables & Images)
        fabricCanvas.on('mouse:down', function(opt) {
            try {
                const e = opt.e;
                const ctxMenu = document.getElementById('canvas-context-menu');
                
                // Prevent context menu from popping up if we are actively cropping
                if (typeof currentCropRect !== 'undefined' && currentCropRect) {
                    if (ctxMenu) ctxMenu.style.display = 'none';
                    return;
                }

                if (opt.button === 3) { // Right click
                    const pointer = fabricCanvas.getPointer(e);
                    let target = opt.target;

                    // FOOLPROOF HIT DETECTION: 
                    // If Fabric missed the target (because it's locked or transparent),
                    // we manually check the mathematical bounding boxes.
                    if (!target || (target.type !== 'image' && !target.isTable)) {
                        const objects = fabricCanvas.getObjects();
                        // Search top-to-bottom so we click the highest layer
                        for (let i = objects.length - 1; i >= 0; i--) {
                            const obj = objects[i];
                            if (obj.type === 'image' || obj.isTable) {
                                // Temporarily disable pixel-perfect check to treat transparent backgrounds as solid
                                const originalPixelTarget = obj.perPixelTargetFind;
                                obj.perPixelTargetFind = false;
                                const isHit = obj.containsPoint(pointer);
                                obj.perPixelTargetFind = originalPixelTarget;

                                if (isHit) {
                                    target = obj;
                                    break;
                                }
                            }
                        }
                    }

                    let showMenu = false;
                    const tableActions = document.getElementById('ctx-table-actions');
                    const imageActions = document.getElementById('ctx-image-actions');
                    
                    if (tableActions) tableActions.style.display = 'none';
                    if (imageActions) imageActions.style.display = 'none';

                    if (target) {
                        if (target.isTable && tableActions) {
                            targetTableGroup = target;
                            tableActions.style.display = 'block';
                            showMenu = true;
                        } else if (target.type === 'image' && imageActions) {
                            targetImageToCrop = target;
                            imageActions.style.display = 'block';
                            showMenu = true;
                        }
                    }

                    if (showMenu && ctxMenu) {
                        ctxMenu.style.left = e.clientX + 'px';
                        ctxMenu.style.top = e.clientY + 'px';
                        ctxMenu.style.display = 'block';
                        
                        // Briefly highlight standard images when right-clicked
                        if (target && target.evented !== false) {
                            fabricCanvas.setActiveObject(target);
                            fabricCanvas.requestRenderAll();
                        }
                    } else {
                        if (ctxMenu) ctxMenu.style.display = 'none';
                    }
                } else {
                    // Left or middle click: hide menu
                    if (ctxMenu) ctxMenu.style.display = 'none';
                    targetTableGroup = null;
                    if (typeof targetImageToCrop !== 'undefined' && (typeof currentCropRect === 'undefined' || !currentCropRect)) {
                        targetImageToCrop = null;
                    }
                }
            } catch (err) {
                console.error("Context Menu Error:", err);
            }
        });
    
    resize();
}

// --- COORDINATES ---
function toWorld(x, y) {
    return {
        x: (x - camera.x) / camera.z,
        y: (y - camera.y) / camera.z
    };
}

// --- RENDER ---
function requestRender() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(draw);
    }
}

function draw() {
    animationFrameId = null;

    // 1. DRAW BACKGROUND
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.fillStyle = CONFIG.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 2. PREPARE INK LAYER
    layerCtx.save();
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    layerCtx.restore();

    // Apply Camera to Layer Context
    layerCtx.save();
    layerCtx.translate(camera.x, camera.y);
    layerCtx.scale(camera.z, camera.z);
    
    layerCtx.lineCap = 'round';
    layerCtx.lineJoin = 'round';

    // Draw Text Boxes first (so they appear below strokes)
    for (let i = 0; i < textBoxes.length; i++) {
        const isSelected = selectedTextBoxes.has(i);
        drawTextBox(layerCtx, textBoxes[i], isSelected);
    }
    
    // Draw Strokes on Layer (on top of text boxes)
    for (let i = 0; i < strokes.length; i++) {
        // Skip eraser strokes (they shouldn't exist, but safety check)
        if (strokes[i].tool === 'eraser') continue;
        
        const isSelected = selectedStrokes.has(i);
        drawStroke(layerCtx, strokes[i], isSelected, false);
    }
    
    if (currentStroke && currentStroke.tool !== 'eraser') {
        drawStroke(layerCtx, currentStroke, false);
    }
    
    // Draw eraser cursor circle
    if (activeTool === 'eraser' && !isPanning) {
        layerCtx.save();
        layerCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        layerCtx.lineWidth = 2 / camera.z;
        layerCtx.setLineDash([]);
        layerCtx.beginPath();
        layerCtx.arc(
            currentMouseWorld.x,
            currentMouseWorld.y,
            CONFIG.eraserWidth / (2 * camera.z),
            0,
            Math.PI * 2
        );
        layerCtx.stroke();
        layerCtx.restore();
    }
    
    // Draw selection rectangle
    if (isSelecting && selectionStart && selectionEnd) {
        const start = toWorld(selectionStart.x, selectionStart.y);
        const end = toWorld(selectionEnd.x, selectionEnd.y);
        layerCtx.strokeStyle = '#2196F3';
        layerCtx.fillStyle = 'rgba(33, 150, 243, 0.1)';
        layerCtx.lineWidth = 2 / camera.z;
        layerCtx.setLineDash([5 / camera.z, 5 / camera.z]);
        layerCtx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        layerCtx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
        layerCtx.setLineDash([]);
    }

    layerCtx.restore();

    // 3. COMPOSITE
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.drawImage(layerCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
}

function drawGrid(context) {
    const dpr = window.devicePixelRatio || 1;
    const viewWidth = canvas.width / dpr;
    const viewHeight = canvas.height / dpr;

    const worldLeft = -camera.x / camera.z;
    const worldTop = -camera.y / camera.z;
    const worldRight = worldLeft + viewWidth / camera.z;
    const worldBottom = worldTop + viewHeight / camera.z;

    const startX = Math.floor(worldLeft / CONFIG.gridSize) * CONFIG.gridSize;
    const endX = Math.ceil(worldRight / CONFIG.gridSize) * CONFIG.gridSize;
    const startY = Math.floor(worldTop / CONFIG.gridSize) * CONFIG.gridSize;
    const endY = Math.ceil(worldBottom / CONFIG.gridSize) * CONFIG.gridSize;

    context.strokeStyle = '#1f1f1f';
    context.lineWidth = 1 / camera.z;
    context.beginPath();

    for (let x = startX; x <= endX; x += CONFIG.gridSize) {
        context.moveTo(x, startY);
        context.lineTo(x, endY);
    }

    for (let y = startY; y <= endY; y += CONFIG.gridSize) {
        context.moveTo(startX, y);
        context.lineTo(endX, y);
    }

    context.stroke();
}

function drawFixedGrid(context) {
    // Draw a fixed grid pattern that doesn't scroll with content
    const dpr = window.devicePixelRatio || 1;
    const viewWidth = canvas.width / dpr;
    const viewHeight = canvas.height / dpr;
    const gridSpacing = 50; // Fixed spacing in screen pixels
    
    context.strokeStyle = '#1f1f1f';
    context.lineWidth = 1;
    context.beginPath();
    
    // Vertical lines
    for (let x = 0; x <= viewWidth; x += gridSpacing) {
        context.moveTo(x, 0);
        context.lineTo(x, viewHeight);
    }
    
    // Horizontal lines
    for (let y = 0; y <= viewHeight; y += gridSpacing) {
        context.moveTo(0, y);
        context.lineTo(viewWidth, y);
    }
    
    context.stroke();
}

function drawStroke(context, stroke, isSelected = false) {
    if (stroke.points.length < 1) return;
    
    // Don't draw eraser strokes
    if (stroke.tool === 'eraser') return;
    
    // Highlight selected strokes
    if (isSelected) {
        context.save();
        context.strokeStyle = '#2196F3';
        context.lineWidth = (stroke.width || 2) + 4 / camera.z;
        context.globalAlpha = 0.5;
        context.beginPath();
        const p = stroke.points;
        context.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) {
            context.lineTo(p[i].x, p[i].y);
        }
        context.stroke();
        context.restore();
    }
    
    context.beginPath();
    context.lineWidth = stroke.width;
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = stroke.color;

    const p = stroke.points;
    
    if (p.length === 1) {
        context.fillStyle = stroke.color;
        context.arc(p[0].x, p[0].y, stroke.width / 2, 0, Math.PI * 2);
        context.fill();
        return;
    }

    context.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
        const midX = (p[i].x + p[i+1].x) / 2;
        const midY = (p[i].y + p[i+1].y) / 2;
        context.quadraticCurveTo(p[i].x, p[i].y, midX, midY);
    }
    context.lineTo(p[p.length-1].x, p[p.length-1].y);
    context.stroke();
}

function drawTextBox(context, textBox, isSelected = false) {
    const { x, y, width, height, text } = textBox;
    
    // Skip drawing entirely if this text box is being edited
    if (editingTextBox !== null && textBoxes[editingTextBox] === textBox) {
        return;
    }
    
    // Convert to screen coordinates
    const screenX = Math.round(x * camera.z + camera.x);
    const screenY = Math.round(y * camera.z + camera.y);
    const screenWidth = Math.round(width * camera.z);
    
    // Convert back to world coordinates for drawing
    const drawX = (screenX - camera.x) / camera.z;
    const drawY = (screenY - camera.y) / camera.z;
    const drawWidth = screenWidth / camera.z;
    
    // Pure text settings (No backgrounds, no padding)
    const fontSize = 16;
    const lineHeight = fontSize * 1.5;
    const maxWidth = drawWidth;
    
    // Turn text blue if selected, otherwise keep it standard color
    context.fillStyle = isSelected ? '#2196F3' : '#e0e0e0';
    context.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    context.textBaseline = 'top';
    
    const lines = text.split('\n');
    let currentY = drawY;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const words = line.split(' ');
        let currentLine = '';
        
        for (let j = 0; j < words.length; j++) {
            const testLine = currentLine + (currentLine ? ' ' + words[j] : words[j]);
            const metrics = context.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                context.fillText(currentLine, drawX, currentY);
                currentY += lineHeight;
                currentLine = words[j];
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            context.fillText(currentLine, drawX, currentY);
            currentY += lineHeight;
        }
    }
}

// --- TEXT BOX FUNCTIONS ---
function createTextBox(worldX, worldY) {
    const newTextBox = {
        id: generateId(),
        x: worldX,
        y: worldY,
        width: 150,       // <-- Much wider start size so the cursor has room to breathe
        height: 24,       // <-- Adjusted height for exactly one line
        text: '',
        minWidth: 150,    
        minHeight: 24,
        manuallyResized: false
    };
    
    textBoxes.push(newTextBox);
    const idx = textBoxes.length - 1;
    selectedTextBoxes.clear();
    selectedTextBoxes.add(idx);
    selectedStrokes.clear();
    
    startEditingTextBox(idx);
    
    undoStack.push({ type: 'addText', textBox: {...newTextBox} });
    redoStack = [];
    hasUnsavedChanges = true;
    updateSaveStatusIndicator();
    
    return idx;
}

function startEditingTextBox(idx) {
    if (idx < 0 || idx >= textBoxes.length) return;
    
    editingTextBox = idx;
    const textBox = textBoxes[idx];
    const textEditor = document.getElementById('text-editor');
    
    // Position the textarea and clear paddings/borders
    updateTextEditorPosition();
    textEditor.style.display = 'block';
    textEditor.value = textBox.text;
    
    textEditor.oninput = () => {
        textBox.text = textEditor.value;
        autoResizeTextBox(idx);
        hasUnsavedChanges = true;
        updateSaveStatusIndicator(); // <-- ADD THIS LINE to trigger auto-save while typing
        requestRender();
    };
    
    textEditor.focus();
}

function finishEditingTextBox() {
    if (editingTextBox === null) return;
    
    const textEditor = document.getElementById('text-editor');
    const textBox = textBoxes[editingTextBox];
    
    textBox.text = textEditor.value;
    
    // Remove empty text boxes
    if (textBox.text.trim() === '') {
        textBoxes.splice(editingTextBox, 1);
        selectedTextBoxes.clear();
    }
    
    textEditor.style.display = 'none';
    textEditor.oninput = null;
    editingTextBox = null;
    
    hasUnsavedChanges = true;
    updateSaveStatusIndicator();
    requestRender();
}

function autoResizeTextBox(idx) {
    if (idx < 0 || idx >= textBoxes.length) return;
    
    const textBox = textBoxes[idx];
    const textEditor = document.getElementById('text-editor');
    
    // Create temporary canvas to measure text
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const fontSize = 16;
    tempCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    
    const lineHeight = fontSize * 1.5;
    const lines = textBox.text.split('\n');
    
    // Calculate width based on longest line and expand horizontally as user types
    let maxWidth = textBox.minWidth;
    for (const line of lines) {
        const metrics = tempCtx.measureText(line);
        // Add a tiny 20px buffer so the browser cursor doesn't randomly force a line wrap
        if (metrics.width + 20 > maxWidth) {
            maxWidth = metrics.width + 20;
        }
    }
    
    if (maxWidth > textBox.width) {
        textBox.width = maxWidth;
    }
    
    if (lines.length > 0) {
        const textHeight = lines.length * lineHeight;
        const newHeight = Math.max(textBox.minHeight, textHeight);
        if (newHeight > textBox.height) {
            textBox.height = newHeight;
        }
    }
    
    updateTextEditorPosition();
}

function updateTextEditorPosition() {
    if (editingTextBox === null) return;
    
    const textBox = textBoxes[editingTextBox];
    const textEditor = document.getElementById('text-editor');
    
    const screenX = Math.round(textBox.x * camera.z + camera.x);
    const screenY = Math.round(textBox.y * camera.z + camera.y);
    const screenWidth = Math.round(textBox.width * camera.z);
    const screenHeight = Math.round(textBox.height * camera.z);
    
    textEditor.style.left = screenX + 'px';
    textEditor.style.top = screenY + 'px';
    textEditor.style.width = screenWidth + 'px';
    textEditor.style.height = screenHeight + 'px';
    textEditor.style.fontSize = Math.round(16 * camera.z) + 'px';
    
    // -> CRITICAL FIX: Ensure zero padding and borders in the JS <-
    textEditor.style.padding = '0px';
    textEditor.style.borderRadius = '0px';
    textEditor.style.borderWidth = '0px';
}

function isPointInTextBox(x, y, textBox) {
    return x >= textBox.x && x <= textBox.x + textBox.width &&
            y >= textBox.y && y <= textBox.y + textBox.height;
}

function isPointInResizeHandle(x, y, textBox) {
    return false; // Disabled completely
}

function calculateMinTextBoxSize(textBox, targetWidth = null) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const fontSize = 16;
    const lineHeight = fontSize * 1.5;
    tempCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    
    const lines = textBox.text.split('\n');
    let minWidth = textBox.minWidth;
    
    for (const line of lines) {
        const words = line.split(' ');
        for (const word of words) {
            const wordWidth = tempCtx.measureText(word).width;
            if (wordWidth > minWidth) {
                minWidth = wordWidth;
            }
        }
    }
    
    const width = targetWidth || minWidth;
    let totalLines = 0;
    
    for (const line of lines) {
        if (line === '') {
            totalLines++;
            continue;
        }
        
        const words = line.split(' ');
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const metrics = tempCtx.measureText(testLine);
            
            if (metrics.width > width && currentLine !== '') {
                totalLines++;
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            totalLines++;
        }
    }
    
    const minHeight = Math.max(textBox.minHeight, totalLines * lineHeight);
    return { minWidth, minHeight };
}

function getTextBoxAtPoint(x, y) {
    // Check in reverse order (top to bottom)
    for (let i = textBoxes.length - 1; i >= 0; i--) {
        if (isPointInTextBox(x, y, textBoxes[i])) {
            return i;
        }
    }
    return -1;
}

// --- ACTIONS ---
function addToUndoStack() {
    if (!fabricCanvas) return;
    // Push the snapshot from before the change (stored in lastSnapshot)
    const prev = lastSnapshot || fabricCanvas.toJSON();
    undoStack.push(prev);
    redoStack = [];
    if (undoStack.length > 50) undoStack.shift();
    // Update lastSnapshot to the new current state
    try { lastSnapshot = fabricCanvas.toJSON(); } catch (e) { lastSnapshot = null; }
}

function performUndo() {
    if (undoStack.length === 0) return;

    if (!fabricCanvas) return;
    const currentState = fabricCanvas.toJSON();
    redoStack.push(currentState);

    const previousState = undoStack.pop();
    fabricCanvas.loadFromJSON(previousState, () => {
        fabricCanvas.renderAll();
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        lastSnapshot = previousState;
    });
}

function performRedo() {
    if (redoStack.length === 0) return;

    if (!fabricCanvas) return;
    const currentState = fabricCanvas.toJSON();
    undoStack.push(currentState);

    const nextState = redoStack.pop();
    fabricCanvas.loadFromJSON(nextState, () => {
        fabricCanvas.renderAll();
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        lastSnapshot = nextState;
    });
}

function createNewMindmap() {
    if (fabricCanvas && fabricCanvas.getObjects().length > 0) {
        if (!confirm('Create new mindmap? Current work will be lost if not saved.')) {
            return;
        }
    }
    
    if (fabricCanvas) {
        fabricCanvas.clear();
        fabricCanvas.setBackgroundColor(CONFIG.bgColor, fabricCanvas.renderAll.bind(fabricCanvas));
        fabricCanvas.setZoom(1);
        fabricCanvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    }
    
    undoStack = [];
    redoStack = [];
    lastSnapshot = fabricCanvas ? fabricCanvas.toJSON() : null;
    camera = { x: 0, y: 0, z: 1 };
    currentFileName = 'untitled';
    currentFileHandle = null;
    hasUnsavedChanges = false;
    updateSaveStatusIndicator();
    
    showCanvas();
    
    if (fabricCanvas) {
        fabricCanvas.requestRenderAll();
    }
}

async function saveToFile() {

    const data = {
        version: 3,
        type: currentNoteType,
        timestamp: Date.now(),
        camera: {
            x: fabricCanvas.viewportTransform[4],
            y: fabricCanvas.viewportTransform[5],
            z: fabricCanvas.getZoom()
        },
        ...fabricCanvas.toJSON(['isTable', 'tableRows', 'tableCols'])
    };
    
    if (currentFileHandle && currentDirHandle) {
        try {
            const json = JSON.stringify(data);
            const writable = await currentFileHandle.createWritable();
            await writable.write(json);
            await writable.close();
            hasUnsavedChanges = false;
            updateSaveStatusIndicator();
            showNotification('Saved to ' + currentFileName);
            return;
        } catch (err) {
            console.error('Save failed:', err);
        }
    }
    
    if (ipcRenderer && currentFilePath && typeof fs !== 'undefined') {
        try {
            // Direct synchronous write to disk so detached windows save before closing
            fs.writeFileSync(currentFilePath, JSON.stringify(data));
            hasUnsavedChanges = false;
            updateSaveStatusIndicator();
            showNotification('Saved');
            return;
        } catch (err) {
            console.error('Direct disk save failed:', err);
        }
    }

    const json = JSON.stringify(data);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFileName || 'mindmap_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    hasUnsavedChanges = false;
    updateSaveStatusIndicator();
}

async function loadFromFileHandle(fileHandle) {
    try {
        const file = await fileHandle.getFile();
        const text = await file.text();
        let data = JSON.parse(text);
        
        // Convert legacy format if needed
        if (data.strokes || data.textBoxes) {
            data = convertLegacyData(data);
        }
        
        // Ensure Fabric canvas is initialized
        if (!fabricCanvas) initFabricCanvas();

        // Clear canvas
        fabricCanvas.clear();
        fabricCanvas.setBackgroundColor(CONFIG.bgColor, fabricCanvas.renderAll.bind(fabricCanvas));
        
        // Load objects
        if (data.objects) {
            fabricCanvas.loadFromJSON(data, () => {
                fabricCanvas.renderAll();
            });
        }
        
        // Restore camera
        if (data.camera) {
            camera = data.camera;
            fabricCanvas.setZoom(camera.z || 1);
            fabricCanvas.viewportTransform[4] = camera.x || 0;
            fabricCanvas.viewportTransform[5] = camera.y || 0;
            fabricCanvas.requestRenderAll();
        }
        
        undoStack = [];
        redoStack = [];
        lastSnapshot = fabricCanvas ? fabricCanvas.toJSON() : null;
        currentFileName = fileHandle.name;
        currentFileHandle = fileHandle;
        hasUnsavedChanges = false;
        updateSaveStatusIndicator();
        fabricCanvas.requestRenderAll();
        showNotification('Loaded ' + fileHandle.name);
        
    } catch (err) {
        console.error(err);
        alert('Error loading file');
    }
}

function loadFromData(data) {
    // Ensure Fabric canvas is initialized
    if (!fabricCanvas) initFabricCanvas();

    // Convert legacy format if needed
    if (data.strokes || data.textBoxes) {
        data = convertLegacyData(data);
    }
    
    fabricCanvas.clear();
    fabricCanvas.setBackgroundColor(CONFIG.bgColor, fabricCanvas.renderAll.bind(fabricCanvas));
    
    if (data.objects) {
        fabricCanvas.loadFromJSON(data, () => {
            fabricCanvas.renderAll();
        });
    }
    
    if (data.camera) {
        camera = data.camera;
        fabricCanvas.setZoom(camera.z || 1);
        fabricCanvas.viewportTransform[4] = camera.x || 0;
        fabricCanvas.viewportTransform[5] = camera.y || 0;
    }
    
    undoStack = [];
    redoStack = [];
    lastSnapshot = fabricCanvas ? fabricCanvas.toJSON() : null;
    currentFileName = 'Untitled';
    currentFileHandle = null;
    hasUnsavedChanges = false;
    updateSaveStatusIndicator();
    fabricCanvas.requestRenderAll();
    showNotification('Loaded note');
}

// Offset state to shift objects when pasting multiple times
window.pasteOffset = window.pasteOffset || 20;

// Copy selected objects (same-window only)
function copySelection() {
    if (!fabricCanvas) return;
    const activeObject = fabricCanvas.getActiveObject();
    if (!activeObject) return;

    // reset offset for a fresh copy
    window.pasteOffset = 20;

    // Save to local internal clipboard (fast same-window paste)
    if (typeof activeObject.clone === 'function') {
        activeObject.clone((cloned) => {
            clipboard = cloned;
        }, ['isTable', 'tableRows', 'tableCols']);
    } else {
        // Fallback: serialize object(s)
        try {
            clipboard = { json: activeObject.toObject(['isTable', 'tableRows', 'tableCols']) };
        } catch (err) { clipboard = null; }
    }
}

// Paste from internal clipboard (same-window)
function pasteFromClipboard() {
    if (!clipboard) return;

    // If clipboard is a serialized JSON object
    if (clipboard.json) {
        fabric.util.enlivenObjects([clipboard.json], function(enlivened) {
            if (!enlivened || enlivened.length === 0) return;
            fabricCanvas.discardActiveObject();

            const obj = enlivened[0];
            obj.set({ left: (obj.left || 0) + window.pasteOffset, top: (obj.top || 0) + window.pasteOffset, evented: true });

            if (obj.type === 'activeSelection') {
                obj.canvas = fabricCanvas;
                obj.forEachObject(function(inner) { fabricCanvas.add(inner); });
                obj.setCoords();
            } else {
                fabricCanvas.add(obj);
            }

            window.pasteOffset += 20;
            fabricCanvas.setActiveObject(obj);
            fabricCanvas.requestRenderAll();

            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
            addToUndoStack();
        }, ['isTable', 'tableRows', 'tableCols']);

        return;
    }

    // Legacy cloned object stored in memory
    if (typeof clipboard.clone === 'function') {
        clipboard.clone((clonedObj) => {
            fabricCanvas.discardActiveObject();
            clonedObj.set({
                left: (clonedObj.left || 0) + window.pasteOffset,
                top: (clonedObj.top || 0) + window.pasteOffset,
                evented: true,
            });

            if (clonedObj.type === 'activeSelection') {
                clonedObj.canvas = fabricCanvas;
                clonedObj.forEachObject((obj) => {
                    fabricCanvas.add(obj);
                });
                clonedObj.setCoords();
            } else {
                fabricCanvas.add(clonedObj);
            }

            window.pasteOffset += 20;
            fabricCanvas.setActiveObject(clonedObj);
            fabricCanvas.requestRenderAll();

            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
            addToUndoStack();
        }, ['isTable', 'tableRows', 'tableCols']);
    }
}

async function copyCanvasAsIllustratorSvg() {
    if (!fabricCanvas || typeof fabricCanvas.getObjects !== 'function') return { ok: false, svgPath: null };

    const objects = fabricCanvas.getObjects();
    if (!objects || objects.length === 0) {
        console.warn('Illustrator SVG copy skipped: canvas is empty.');
        return { ok: false, svgPath: null };
    }

    try {
        const svg = fabricCanvas.toSVG();
        if (!svg || typeof svg !== 'string') return { ok: false, svgPath: null };

        const svgTrimmed = svg.trim();
        const htmlDoc = `<!DOCTYPE html><html><body>${svgTrimmed}</body></html>`;

        let svgPath = null;
        if (fs && path) {
            const exportDir = path.join(os.tmpdir(), 'slide-notes-illustrator-export');
            try {
                if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
                const safeName = (currentFileName || 'canvas').replace(/[^a-zA-Z0-9._-]/g, '_');
                svgPath = path.join(exportDir, `${safeName}_${Date.now()}.svg`);
                fs.writeFileSync(svgPath, svgTrimmed, 'utf8');
                lastIllustratorSvgExportPath = svgPath;
            } catch (fileErr) {
                console.warn('Could not write Illustrator SVG temp export:', fileErr);
                svgPath = null;
            }
        }

        if (electronClipboard && typeof electronClipboard.write === 'function') {
            electronClipboard.clear();
            let svgImage = null;
            try {
                if (nativeImage && typeof nativeImage.createFromBuffer === 'function') {
                    svgImage = nativeImage.createFromBuffer(Buffer.from(svgTrimmed, 'utf8'), { width: 1600, height: 1200 });
                    if (svgImage && typeof svgImage.isEmpty === 'function' && svgImage.isEmpty()) {
                        svgImage = null;
                    }
                }
            } catch (imgErr) {
                svgImage = null;
            }

            electronClipboard.write({
                text: svgTrimmed,
                html: htmlDoc,
                image: svgImage || undefined
            });

            if (typeof Buffer !== 'undefined' && typeof electronClipboard.writeBuffer === 'function') {
                try { electronClipboard.writeBuffer('image/svg+xml', Buffer.from(svgTrimmed, 'utf8')); } catch (e) {}
                try { electronClipboard.writeBuffer('text/html', Buffer.from(htmlDoc, 'utf8')); } catch (e) {}
                if (svgPath) {
                    try { electronClipboard.writeBuffer('text/uri-list', Buffer.from(`file:///${svgPath.replace(/\\/g, '/')}`, 'utf8')); } catch (e) {}
                }
            }

            console.log('Copied full canvas as SVG for Illustrator paste.');
            return { ok: true, svgPath };
        }

        if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
            const item = new ClipboardItem({
                'text/plain': new Blob([svgTrimmed], { type: 'text/plain' }),
                'text/html': new Blob([htmlDoc], { type: 'text/html' }),
                'image/svg+xml': new Blob([svgTrimmed], { type: 'image/svg+xml' })
            });
            await navigator.clipboard.write([item]);
            console.log('Copied full canvas SVG as rich clipboard data.');
            return { ok: true, svgPath };
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(svgTrimmed);
            console.log('Copied full canvas SVG text to clipboard.');
            return { ok: true, svgPath };
        }
    } catch (err) {
        console.error('Failed to copy canvas as Illustrator SVG:', err);
    }

    return { ok: false, svgPath: null };
}

function getCanvasCenterWorldPosition() {
    if (!fabricCanvas) return { x: 0, y: 0 };
    const vpt = fabricCanvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    return {
        x: (fabricCanvas.width / 2 - vpt[4]) / vpt[0],
        y: (fabricCanvas.height / 2 - vpt[5]) / vpt[3]
    };
}

function getWorldPositionFromPointerEvent(evt) {
    if (!fabricCanvas) return null;
    try {
        const pointer = fabricCanvas.getPointer(evt);
        if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
            return pointer;
        }
    } catch (err) {}

    const targetCanvas = fabricCanvas.upperCanvasEl || canvas;
    if (!targetCanvas || !evt || !Number.isFinite(evt.clientX) || !Number.isFinite(evt.clientY)) return null;

    const rect = targetCanvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const vpt = fabricCanvas.viewportTransform || [1, 0, 0, 1, 0, 0];

    return {
        x: (x - vpt[4]) / vpt[0],
        y: (y - vpt[5]) / vpt[3]
    };
}

async function addImageToFabricCanvas(src, worldPos = null) {
    if (!fabricCanvas || !src) return false;

    return await new Promise((resolve) => {
        fabric.Image.fromURL(src, (img) => {
            if (!img) {
                resolve(false);
                return;
            }

            try {
                const maxDim = 800;
                if (img.width > maxDim || img.height > maxDim) {
                    const scale = maxDim / Math.max(img.width, img.height);
                    img.scale(scale);
                }

                const insertAt = (worldPos && Number.isFinite(worldPos.x) && Number.isFinite(worldPos.y))
                    ? worldPos
                    : getCanvasCenterWorldPosition();

                img.set({
                    left: insertAt.x - (img.width * img.scaleX) / 2,
                    top: insertAt.y - (img.height * img.scaleY) / 2
                });

                fabricCanvas.add(img);
                try {
                    // Keep drawings visible above newly inserted images.
                    fabricCanvas.sendToBack(img);
                } catch (err) {}
                fabricCanvas.setActiveObject(img);
                fabricCanvas.requestRenderAll();

                hasUnsavedChanges = true;
                updateSaveStatusIndicator();
                addToUndoStack();
                resolve(true);
            } catch (err) {
                console.error('Error adding image to Fabric canvas:', err);
                resolve(false);
            }
        });
    });
}

function getAssetsFolderPath() {
    if (!path) return null;

    // Always prefer the configured default notes root from Settings.
    try {
        const configuredRoot = (localStorage.getItem('defaultMindMapFolder') || '').trim();
        if (configuredRoot) {
            return path.join(configuredRoot, 'Assets');
        }
    } catch (err) {}

    // Fallback to the currently selected root folder for this app session.
    if (rootPath) {
        return path.join(rootPath, 'Assets');
    }

    return null;
}

function inferImageExtension(fileOrBuffer, originalName) {
    const fromName = (originalName || '').toLowerCase();
    const nameMatch = fromName.match(/\.(png|jpe?g|gif|webp)$/i);
    if (nameMatch) {
        return nameMatch[0].toLowerCase();
    }

    const mimeType = (fileOrBuffer && fileOrBuffer.type ? String(fileOrBuffer.type).toLowerCase() : '');
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/gif') return '.gif';
    if (mimeType === 'image/webp') return '.webp';
    return '.png';
}

// Handle image paste/drop sources and insert into the Fabric canvas.
async function saveAndAddFabricImage(fileOrBuffer, originalName, worldPos = null) {
    try {
        const assetsPath = getAssetsFolderPath();
        if (!assetsPath || !fs || !path || typeof Buffer === 'undefined') {
            alert('Cannot import image until the note root is available. Open the note from the main folder view first.');
            return false;
        }

        if (!fs.existsSync(assetsPath)) {
            fs.mkdirSync(assetsPath, { recursive: true });
        }

        const ext = inferImageExtension(fileOrBuffer, originalName);
        const baseName = String(originalName || 'pasted')
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9._-]/g, '_') || 'pasted';
        const fileName = `img_${Date.now()}_${baseName}${ext}`;
        const destPath = path.join(assetsPath, fileName);

        if (Buffer.isBuffer(fileOrBuffer)) {
            fs.writeFileSync(destPath, fileOrBuffer);
        } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
            const arrayBuffer = await fileOrBuffer.arrayBuffer();
            fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
        } else {
            throw new Error('Unsupported image payload for disk save.');
        }

        const fileUrl = 'file:///' + destPath.replace(/\\/g, '/');
        const inserted = await addImageToFabricCanvas(fileUrl, worldPos);
        if (!inserted) {
            throw new Error('Image saved but could not be inserted on canvas.');
        }

        return true;
    } catch (err) {
        console.error('Assets image import failed:', err);
        alert('Failed to save/import image into Assets.');
        return false;
    }
}

// 1. New trigger for Ctrl+V (same-window paste)
async function triggerExternalPaste() {
    if (!fabricCanvas) return;

    // Prefer internal memory clipboard first
    if (clipboard) {
        pasteFromClipboard();
        return;
    }

    // No OS/system clipboard access for now; rely on DOM paste events handled elsewhere
}

// 2. Helper to spawn text in the center of the screen
function pasteTextIntoFabric(text) {
    if (!fabricCanvas) return;
    const vpt = fabricCanvas.viewportTransform;
    const centerX = (fabricCanvas.width / 2 - vpt[4]) / vpt[0];
    const centerY = (fabricCanvas.height / 2 - vpt[5]) / vpt[3];

    fabricCanvas.discardActiveObject();

    const itext = new fabric.IText(text, {
        left: centerX,
        top: centerY,
        fontSize: 16,
        fill: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding: 0,
        originX: 'center',
        originY: 'center',
        editable: true,
        selectable: true,
        hasControls: false,
        hasBorders: false
    });

    fabricCanvas.add(itext);
    fabricCanvas.setActiveObject(itext);
    fabricCanvas.requestRenderAll();

    hasUnsavedChanges = true;
    updateSaveStatusIndicator();
    addToUndoStack();
}

// 3. DOM Paste Fallback (for images/text pasted via keyboard or context menu)
async function handleExternalPaste(e) {
    // Stop if a text object is already actively being typed into
    if (!fabricCanvas || (fabricCanvas.getActiveObject() && fabricCanvas.getActiveObject().isEditing)) return;

    // Stop if we are typing into standard inputs (like search bars or linear notes)
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
    }

    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    // First, look for image items
    const items = clipboardData.items || [];
    let imagePasted = false;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            if (file) {
                imagePasted = true;
                // Attempt to paste exactly where the mouse pointer is
                let pointer = null;
                try { pointer = fabricCanvas.getPointer(e); } catch(err) {}

                fabricCanvas.discardActiveObject();
                await saveAndAddFabricImage(file, file.name || 'pasted.png', pointer);
            }
        }
    }

    if (imagePasted) return;

    // Otherwise, paste plain text into Fabric
    const text = clipboardData.getData('text/plain');
    if (text) {
        e.preventDefault();
        pasteTextIntoFabric(text);
    }

    // If nothing else, try internal memory clipboard (paste-from-memory via context menu)
    if (!imagePasted && !text && clipboard) {
        e.preventDefault();
        pasteFromClipboard();
    }
}

function isCanvasDropTargetAvailable() {
    const container = document.getElementById('canvas-container');
    return !!(fabricCanvas && container && !container.classList.contains('hidden'));
}

function getDroppedImageFiles(e) {
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    return files.filter(file => file && file.type && file.type.startsWith('image/'));
}

function handleCanvasImageDragOver(e) {
    if (!isCanvasDropTargetAvailable()) return;
    const imageFiles = getDroppedImageFiles(e);
    if (imageFiles.length === 0) return;

    e.preventDefault();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
    }
}

async function handleCanvasImageDrop(e) {
    if (!isCanvasDropTargetAvailable()) return;
    const imageFiles = getDroppedImageFiles(e);
    if (imageFiles.length === 0) return;

    e.preventDefault();
    e.stopPropagation();

    const basePos = getWorldPositionFromPointerEvent(e);
    fabricCanvas.discardActiveObject();

    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const offset = i * 24;
        const worldPos = basePos ? { x: basePos.x + offset, y: basePos.y + offset } : null;
        await saveAndAddFabricImage(file, file.name || 'dropped.png', worldPos);
    }
}
// Convert old canvas data to Fabric.js format
function convertLegacyData(data) {
    if (!data.strokes && !data.textBoxes) return data;
    
    const fabricObjects = [];
    
    // Convert strokes to Fabric paths
    if (data.strokes && Array.isArray(data.strokes)) {
        data.strokes.forEach(stroke => {
            if (stroke.tool === 'eraser' || !stroke.points || stroke.points.length < 2) return;
            
            const pathString = stroke.points.reduce((acc, pt, i) => {
                const cmd = i === 0 ? 'M' : 'L';
                return `${acc} ${cmd} ${pt.x} ${pt.y}`;
            }, '');
            
            const path = new fabric.Path(pathString, {
                stroke: stroke.color || CONFIG.penColor,
                strokeWidth: stroke.width || CONFIG.penWidth,
                fill: '',
                strokeLineCap: 'round',
                strokeLineJoin: 'round',
                selectable: true
            });
            
            fabricObjects.push(path.toObject());
        });
    }
    
    // Convert textBoxes to Fabric IText (point text that hugs characters)
    if (data.textBoxes && Array.isArray(data.textBoxes)) {
        data.textBoxes.forEach(tb => {
            const itext = new fabric.IText(tb.text || '', {
                left: tb.x,
                top: tb.y,
                fontSize: 16,
                fill: '#e0e0e0',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                selectable: true,
                editable: true,
                padding: 0,
                originX: 'left',
                originY: 'top'
            });

            fabricObjects.push(itext.toObject());
        });
    }
    
    return {
        version: data.version || 2,
        type: data.type || 'note',
        timestamp: data.timestamp || Date.now(),
        camera: data.camera || { x: 0, y: 0, z: 1 },
        objects: fabricObjects,
        background: CONFIG.bgColor
    };
}

function showNotification(message) {
    // Notifications have been disabled per user request.
    // This function intentionally does nothing to suppress transient UI notifications.
    return;
}

function updateFileNameIndicator() {
    // No longer needed - kept for compatibility
}

// --- SAVE STATUS INDICATOR & AUTO SAVE ---
let autoSaveTimeout = null;

function updateSaveStatusIndicator() {
    const indicator = document.getElementById('btn-save-status');
    if (!indicator) return;
    
    if (hasUnsavedChanges) {
        indicator.classList.remove('saved');
        indicator.classList.add('unsaved');
        indicator.setAttribute('data-tooltip', 'Unsaved changes...');
        
        // Check if this file has a known location to save to
        const canSaveQuietly = (currentFileHandle && currentDirHandle) || 
                                (ipcRenderer && currentFileName && currentFileName !== 'untitled');
        
        if (canSaveQuietly) {
            // Clear any existing timer
            clearTimeout(autoSaveTimeout);
            
            // Wait 1 second after the user stops drawing/typing, then silently save
            autoSaveTimeout = setTimeout(() => {
                if (hasUnsavedChanges) {
                    saveToFile();
                }
            }, 1000); 
        }
    } else {
        indicator.classList.remove('unsaved');
        indicator.classList.add('saved');
        indicator.setAttribute('data-tooltip', 'All changes saved');
    }
}

// --- HOME SCREEN ---
async function showHomeScreen() {
    // Check for unsaved changes before navigating
    if (hasUnsavedChanges) {
        const confirm = window.confirm('You have unsaved changes. Do you want to leave without saving?');
        if (!confirm) {
            return;
        }
    }
    
    document.getElementById('home-screen').classList.remove('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('flashcard-page').classList.remove('active');
    document.getElementById('glossary-page').classList.remove('active');
    document.getElementById('qa-page').classList.remove('active');
    document.getElementById('todo-page').classList.remove('active');
    document.getElementById('links-page').classList.remove('active');
    document.getElementById('test-page').classList.remove('active');
    document.getElementById('btn-save-status').classList.add('hidden');
    
    // Hide toolbar and help button on home screen
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');
    
    // Stop rendering canvas
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Refresh the notes list and subjects
    if (currentDirHandle) {
        // Remember the active subject name before reloading
        const activeSubjectName = activeSubject ? activeSubject.name : null;
        
        await loadSubjects();
        
        // Restore activeSubject reference to the new object with the same name
        if (activeSubjectName) {
            activeSubject = allSubjects.find(s => s.name === activeSubjectName) || null;
        }
        
        displaySubjects();
        
        // Reload notes into DOM (fresh load from disk)
        allNotesLoaded = false;
        
        // Display appropriate view
        if (activeSubject === null) {
            await loadAllNotes();
        } else {
            await loadNotesForSubject(activeSubject);
        }
    }
    
    // Ensure button visibility is updated
    updateNewNoteButtonVisibility();
}

function showCanvas() {
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.remove('hidden');
    document.getElementById('btn-save-status').classList.remove('hidden');
    document.getElementById('toolbar').classList.remove('hidden');
    document.getElementById('help-btn').classList.remove('hidden');
    
    if (!fabricCanvas) {
        initFabricCanvas();
    }
    
    updateSaveStatusIndicator();
    fabricCanvas.requestRenderAll();
}

// --- NATIVE FILE SYSTEM WRAPPERS --- //
// This perfectly mimics the Web File System API so you don't have to rewrite your app!
class NodeFileHandle {
    constructor(filePath, name) {
        this.kind = 'file';
        this.name = name;
        this.path = filePath;
    }
    async getFile() {
        const buffer = fs.readFileSync(this.path);
        const file = new File([buffer], this.name);
        file.path = this.path;
        const stats = fs.statSync(this.path);
        Object.defineProperty(file, 'lastModified', { value: stats.mtimeMs });
        return file;
    }
    async createWritable() {
        return {
            write: async (data) => {
                // Handle both Canvas Blob saves and standard JSON saves
                if (data instanceof Blob) {
                    const arrayBuffer = await data.arrayBuffer();
                    fs.writeFileSync(this.path, Buffer.from(arrayBuffer));
                } else {
                    fs.writeFileSync(this.path, data);
                }
            },
            close: async () => {}
        };
    }
}

class NodeDirectoryHandle {
    constructor(dirPath, name) {
        this.kind = 'directory';
        this.name = name;
        this.path = dirPath;
    }
    async *values() {
        const entries = fs.readdirSync(this.path, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(this.path, entry.name);
            if (entry.isDirectory()) {
                yield new NodeDirectoryHandle(fullPath, entry.name);
            } else if (entry.isFile()) {
                yield new NodeFileHandle(fullPath, entry.name);
            }
        }
    }
    async getFileHandle(name, options = {}) {
        const fullPath = path.join(this.path, name);
        if (!fs.existsSync(fullPath) && !options.create) {
            throw new Error('File not found');
        }
        if (options.create && !fs.existsSync(fullPath)) {
            fs.writeFileSync(fullPath, '');
        }
        return new NodeFileHandle(fullPath, name);
    }
    async removeEntry(name) {
        const fullPath = path.join(this.path, name);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    async getDirectoryHandle(name, options = {}) {
        const fullPath = path.join(this.path, name);
        if (!fs.existsSync(fullPath) && !options.create) {
            throw new Error('Directory not found');
        }
        if (options.create && !fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        return new NodeDirectoryHandle(fullPath, name);
    }
}

// --- SETTINGS LOGIC --- //
function openSettings() {
    const modal = document.getElementById('settings-modal');
    const input = document.getElementById('default-folder-input');
    const markdownAppSelect = document.getElementById('markdown-open-app');
    input.value = localStorage.getItem('defaultMindMapFolder') || '';
    if (markdownAppSelect) {
        markdownAppSelect.value = getMarkdownOpenAppPreference();
    }
    modal.style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

async function saveSettings() {
    const input = document.getElementById('default-folder-input').value.trim();
    const markdownAppSelect = document.getElementById('markdown-open-app');
    if (input) {
        if (!fs.existsSync(input)) {
            alert('That folder path does not exist on your computer. Please check it and try again.');
            return;
        }
        localStorage.setItem('defaultMindMapFolder', input);
    } else {
        localStorage.removeItem('defaultMindMapFolder');
    }

    if (markdownAppSelect) {
        const app = (markdownAppSelect.value || MARKDOWN_APP_OBSIDIAN).toLowerCase();
        localStorage.setItem(
            MARKDOWN_OPEN_APP_STORAGE_KEY,
            app === MARKDOWN_APP_TYPORA ? MARKDOWN_APP_TYPORA : MARKDOWN_APP_OBSIDIAN
        );
    }

    closeSettings();
    
    // Reload immediately to apply
    initHomeScreen(); 
}

// Launch Pomodoro popout via Electron's main process
function launchPomodoro() {
    try {
        const ipc = (window && window.ipcRenderer) ? window.ipcRenderer : ((window && window.require) ? window.require('electron').ipcRenderer : (typeof require !== 'undefined' ? require('electron').ipcRenderer : null));
        if (ipc && ipc.send) {
            ipc.send('open-pomodoro-window');
            return;
        }
    } catch (e) {
        console.warn('launchPomodoro: ipc unavailable', e);
    }
    console.warn('IPC not available. Are you running in a browser instead of Electron?');
    alert('The floating timer requires the desktop app environment.');
}

async function initHomeScreen() {
    // 1. SILENT DESKTOP OVERRIDE: Check for Default Path
    const defaultPath = localStorage.getItem('defaultMindMapFolder');
    console.log('initHomeScreen: defaultPath =', defaultPath);
    console.log('fs.existsSync(defaultPath) =', defaultPath ? fs.existsSync(defaultPath) : 'no defaultPath');
    
    if (defaultPath && fs.existsSync(defaultPath)) {
        // Bypass all Web APIs, use native Node.js folder access!
        const folderName = path.basename(defaultPath);
        rootPath = defaultPath; // Set rootPath
        rootDirHandle = new NodeDirectoryHandle(defaultPath, folderName);
        currentDirHandle = rootDirHandle;
        
        allNotesLoaded = false;
        await loadSubjects();
        activeSubject = null;
        await loadAllNotes();
        return; // Exit here to skip the web permission prompt!
    }

    // 2. FALLBACK: Use dialog to select folder
    await selectRootFolder();
}

function showEmptyState() {
    // This is called when no folder is selected at all
    document.getElementById('notes-grid').innerHTML = '';
    const emptyState = document.getElementById('empty-notes-state');
    emptyState.style.display = 'block';
    
    // Show folder selection UI
    document.getElementById('empty-notes-state-desc').textContent = 'Select your notes folder to get started';
    const selectFolderBtn = emptyState.querySelector('.select-folder-btn');
    if (selectFolderBtn) {
        selectFolderBtn.style.display = 'block';
    }
    
    document.getElementById('subjects-list').innerHTML = '<div style="padding:16px;color:#666;text-align:center;font-size:12px;">No folder selected</div>';
    // Hide the + New button when no folder is selected
    updateNewNoteButtonVisibility();
}

async function countNotesInSubject(subjectHandle) {
    let count = 0;
    const pdfBaseNames = new Set();
    const jsonFiles = [];
    
    try {
        for await (const fileEntry of subjectHandle.values()) {
            if (fileEntry.kind === 'file') {
                const nameLower = fileEntry.name.toLowerCase();
                if (nameLower.endsWith('.pdf')) {
                    pdfBaseNames.add(nameLower.slice(0, -4));
                } else if (nameLower.endsWith('.json') || nameLower.endsWith('.md')) {
                    jsonFiles.push(fileEntry);
                }
            }
        }
        const unlinkedJsonFiles = jsonFiles.filter(f => {
            const isMd = f.name.toLowerCase().endsWith('.md');
            const base = f.name.slice(0, -(isMd ? 3 : 5)).toLowerCase();
            return !pdfBaseNames.has(base);
        });
        count = unlinkedJsonFiles.length;
    } catch (err) {
        console.error('Error counting notes:', err);
    }
    return count;
}

function getSubjectColor(index) {
    // Greyscale theme - return grey for all subjects (keeps original look)
    return '#666666';
}

async function loadSubjects() {
    try {
        const subjects = [];
        const dividers = [];
        
        for await (const entry of rootDirHandle.values()) {
            if (entry.kind === 'directory' && entry.name !== 'Assets') {
                
                let isDivider = false;
                try {
                    // If it has a .divider file inside, treat the folder as a Divider
                    await entry.getFileHandle('.divider');
                    isDivider = true;
                } catch (e) {}
                
                if (isDivider) {
                    // Persist collapse state if it existed previously
                    const existingDivider = allDividers.find(d => d.name === entry.name);
                    dividers.push({
                        name: entry.name,
                        handle: entry,
                        collapsed: existingDivider ? existingDivider.collapsed : true
                    });
                    
                    // Load sub-folders as child subjects
                    for await (const subEntry of entry.values()) {
                        if (subEntry.kind === 'directory') {
                            const count = await countNotesInSubject(subEntry);
                            subjects.push({
                                name: subEntry.name,
                                handle: subEntry,
                                dividerName: entry.name,
                                count: count,
                                color: getSubjectColor(subjects.length)
                            });
                        }
                    }
                } else {
                    // Standard root-level Subject
                    const count = await countNotesInSubject(entry);
                    subjects.push({
                        name: entry.name,
                        handle: entry,
                        dividerName: null,
                        count: count,
                        color: getSubjectColor(subjects.length)
                    });
                }
            }
        }
        
        allSubjects = subjects.sort((a,b) => a.name.localeCompare(b.name));
        allDividers = dividers.sort((a,b) => a.name.localeCompare(b.name));
        allNotesLoaded = false;
        displaySubjects();
        
    } catch (err) {
        console.error('Error loading subjects:', err);
        showEmptyState();
    }
}

function displaySubjects() {
    const subjectsList = document.getElementById('subjects-list');
    subjectsList.innerHTML = '';
    
    // Render All Notes Item
    const notesItem = document.getElementById('sidebar-notes-item');
    if (notesItem) {
        const isActive = activeSubject === null;
        notesItem.className = 'subject-item' + (isActive ? ' active' : '');
        const countEl = notesItem.querySelector('.subject-count');
        if (countEl) {
            if (isActive) {
                countEl.textContent = getAllNotesCount();
                countEl.style.display = '';
            } else {
                countEl.style.display = 'none';
            }
        }
        notesItem.onclick = async () => {
            activeSubject = null;
            displaySubjects();
            await loadAllNotes();
        };
    }
    
    // Helper to construct a clickable Subject row
    const createSubjectEl = (subject) => {
        const isActive = activeSubject === subject;
        const subjectItem = document.createElement('div');
        subjectItem.className = 'subject-item' + (isActive ? ' active' : '');
        subjectItem.innerHTML = `
            <div class="subject-color" style="background:${subject.color};"></div>
            <div class="subject-name">${escapeHtml(subject.name)}</div>
            ${isActive ? `<div class="subject-count">${subject.count}</div>` : ''}
        `;
        subjectItem.onclick = async () => {
            activeSubject = subject;
            displaySubjects();
            await loadNotesForSubject(subject);
        };
        return subjectItem;
    };

    // 1. Render all root-level subjects
    const rootSubjects = allSubjects.filter(s => !s.dividerName);
    for (const subject of rootSubjects) {
        subjectsList.appendChild(createSubjectEl(subject));
    }

    // 2. Render dividers and their nested subjects
    for (const divider of allDividers) {
        const dividerEl = document.createElement('div');
        dividerEl.className = 'divider-item';
        dividerEl.innerHTML = `
            <svg class="divider-caret ${divider.collapsed ? 'collapsed' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span style="flex:1;">${escapeHtml(divider.name)}</span>
        `;
        dividerEl.onclick = () => {
            divider.collapsed = !divider.collapsed;
            displaySubjects();
        };
        subjectsList.appendChild(dividerEl);

        if (!divider.collapsed) {
            const childSubjects = allSubjects.filter(s => s.dividerName === divider.name);
            for (const subject of childSubjects) {
                const el = createSubjectEl(subject);
                el.classList.add('child-subject');
                subjectsList.appendChild(el);
            }
        }
    }
    
    updateNewNoteButtonVisibility();
}

// --- FOLDER CREATION LOGIC ---

function toggleSidebarAddMenu(event) {
    event.stopPropagation();
    if (!rootDirHandle) {
        alert('Please open a folder first.');
        return;
    }
    const menu = document.getElementById('sidebar-add-menu');
    menu.classList.toggle('show');
    
    if (menu.classList.contains('show')) {
        setTimeout(() => document.addEventListener('click', closeSidebarAddMenu), 0);
    }
}

function closeSidebarAddMenu() {
    const menu = document.getElementById('sidebar-add-menu');
    if (menu) menu.classList.remove('show');
    document.removeEventListener('click', closeSidebarAddMenu);
}

async function createNewSubject(targetDividerName = null) {
    closeSidebarAddMenu();
    if (!rootDirHandle) return;
    try {
        // Use native prompt when available; otherwise fall back to modal
        let name;
        try {
            name = prompt("Enter Subject Name:");
        } catch (err) {
            // prompt() not supported — show modal
            showCreateFolderModal('subject', targetDividerName);
            return;
        }
        if (!name || name.trim() === '') return;

        let targetDir = rootDirHandle;
        if (targetDividerName) {
            const divider = allDividers.find(d => d.name === targetDividerName);
            if (divider) targetDir = divider.handle;
        }
        
        await targetDir.getDirectoryHandle(name.trim(), {create: true});
        await loadSubjects();
    } catch (e) {
        alert('Error creating subject: ' + e.message);
    }
}

async function createNewDivider() {
    closeSidebarAddMenu();
    if (!rootDirHandle) return;
    try {
        let name;
        try {
            name = prompt("Enter Divider Name:");
        } catch (err) {
            showCreateFolderModal('divider');
            return;
        }
        if (!name || name.trim() === '') return;

        try {
            const newDir = await rootDirHandle.getDirectoryHandle(name.trim(), {create: true});
            await newDir.getFileHandle('.divider', {create: true});
            await loadSubjects();
        } catch (e) {
            alert('Error creating divider: ' + e.message);
        }
    } catch (e) {
        alert('Error creating divider: ' + e.message);
    }
}

function showCreateFolderModal(type, targetDividerName = null) {
    const modal = document.getElementById('create-folder-modal');
    const title = document.getElementById('create-folder-title');
    const input = document.getElementById('create-folder-name');
    modal.style.display = 'flex';
    input.value = '';
    modal.dataset.type = type;
    modal.dataset.target = targetDividerName || '';
    title.textContent = type === 'divider' ? 'Create Divider' : 'Create Subject';
    input.focus();
}

function hideCreateFolderModal() {
    const modal = document.getElementById('create-folder-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmCreateFolderModal() {
    const modal = document.getElementById('create-folder-modal');
    if (!modal) return;
    const name = document.getElementById('create-folder-name').value.trim();
    if (!name) return;
    const type = modal.dataset.type;
    const target = modal.dataset.target || null;
    hideCreateFolderModal();

    try {
        if (type === 'divider') {
            const newDir = await rootDirHandle.getDirectoryHandle(name, { create: true });
            await newDir.getFileHandle('.divider', { create: true });
        } else {
            let targetDir = rootDirHandle;
            if (target) {
                const divider = allDividers.find(d => d.name === target);
                if (divider) targetDir = divider.handle;
            }
            await targetDir.getDirectoryHandle(name, { create: true });
        }
        await loadSubjects();
    } catch (e) {
        alert('Error creating folder: ' + e.message);
    }
}

function getAllNotesCount() {
    return allSubjects.reduce((sum, s) => sum + s.count, 0);
}

function updateNewNoteButtonVisibility() {
    const newNoteBtn = document.getElementById('btn-new-note');
    if (newNoteBtn) {
        // Hide button when viewing all notes (activeSubject === null)
        // Show button when a specific subject is selected
        if (activeSubject === null) {
            newNoteBtn.style.display = 'none';
        } else {
            newNoteBtn.style.display = 'flex';
        }
    }
}

function toggleViewMenu() {
    const menu = document.getElementById('view-menu');
    menu.classList.toggle('show');
    
    // Close menu when clicking outside
    if (menu.classList.contains('show')) {
        setTimeout(() => {
            document.addEventListener('click', closeViewMenu);
        }, 0);
    }
}

function closeViewMenu() {
    const menu = document.getElementById('view-menu');
    menu.classList.remove('show');
    document.removeEventListener('click', closeViewMenu);
}

function setView(view) {
    const wasOrganized = currentView === 'organized';
    currentView = view;
    const notesGrid = document.getElementById('notes-grid');
    const options = document.querySelectorAll('.view-option');

    // Flatten organized sections before switching away
    if (wasOrganized && view !== 'organized') {
        flattenOrganizedSections();
    }

    // Update grid class
    notesGrid.classList.remove('list-view', 'organized-view');
    if (view === 'list') {
        notesGrid.classList.add('list-view');
    } else if (view === 'organized') {
        notesGrid.classList.add('organized-view');
        renderOrganizedSections();
    }

    // Ensure cards hidden by organized-only rules become visible again in other views.
    if (view !== 'organized') {
        applyCardVisibility(Array.from(currentVisibleCardSet));
    }

    // Update active state
    options.forEach(option => {
        option.classList.remove('active');
        const text = option.textContent.trim();
        let optionView = 'grid';
        if (text.includes('List')) optionView = 'list';
        else if (text.includes('Organized')) optionView = 'organized';
        if (optionView === view) {
            option.classList.add('active');
        }
    });

    updateQuickAccessButtons();
    closeViewMenu();
}

const QUICK_ACCESS_NOTE_TYPES = ['flashcard', 'glossary', 'qa', 'todo', 'links'];

function getScopedNotesForQuickAccess() {
    if (!Array.isArray(loadedNotesForSearch)) return [];
    if (!activeSubject) return loadedNotesForSearch;
    return loadedNotesForSearch.filter(note => note.subject === activeSubject.name);
}

function findQuickAccessNote(type) {
    const scoped = getScopedNotesForQuickAccess();
    const matches = scoped.filter(note => note.typeToken === type);
    if (matches.length === 0) return null;
    matches.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return matches[0];
}

function updateQuickAccessButtons() {
    const wrap = document.getElementById('notes-quick-access');
    if (!wrap) return;

    // Always display the main wrapper
    wrap.style.display = 'flex';

    // Force every button to be visible and enabled 100% of the time
    wrap.querySelectorAll('.quick-access-btn').forEach(btn => {
        btn.style.display = 'inline-flex';
        btn.disabled = false;
    });
}

let organizedStickyScrollRoot = null;
let organizedStickyScrollHandler = null;

function restoreQuickAccessToTopHeader() {
    const wrap = document.getElementById('notes-quick-access');
    const headerRight = document.getElementById('content-header-right');
    if (!wrap || !headerRight) return;

    const newBtn = document.getElementById('btn-new-note');
    if (newBtn && newBtn.parentElement === headerRight) {
        headerRight.insertBefore(wrap, newBtn);
    } else {
        headerRight.appendChild(wrap);
    }
}

function ensureOrganizedStickyHeader() {
    const notesGrid = document.getElementById('notes-grid');
    if (!notesGrid) return null;

    let sticky = document.getElementById('organized-sticky-header');
    if (!sticky) {
        sticky = document.createElement('div');
        sticky.id = 'organized-sticky-header';
        sticky.className = 'type-section-header-card organized-sticky-header';

        const label = document.createElement('span');
        label.id = 'organized-sticky-label';
        label.className = 'organized-sticky-label';
        label.textContent = 'Notes';

        const quickAccessSlot = document.createElement('div');
        quickAccessSlot.className = 'organized-sticky-quick-access-slot';

        sticky.appendChild(label);
        sticky.appendChild(quickAccessSlot);
        notesGrid.insertBefore(sticky, notesGrid.firstChild);
    }

    return sticky;
}

function dockQuickAccessInOrganizedStickyHeader() {
    const wrap = document.getElementById('notes-quick-access');
    const sticky = ensureOrganizedStickyHeader();
    if (!wrap || !sticky) return;

    const slot = sticky.querySelector('.organized-sticky-quick-access-slot');
    if (slot && wrap.parentElement !== slot) {
        slot.appendChild(wrap);
    }
}

function updateOrganizedStickyHeaderLabel() {
    if (currentView !== 'organized') return;

    const sticky = document.getElementById('organized-sticky-header');
    const labelEl = document.getElementById('organized-sticky-label');
    if (!sticky || !labelEl) return;

    const wrappers = Array.from(document.querySelectorAll('#notes-grid .type-section-wrapper'));
    if (wrappers.length === 0) {
        labelEl.textContent = 'Notes';
        return;
    }

    const probeY = sticky.getBoundingClientRect().bottom + 1;
    let activeLabel = wrappers[0].dataset.sectionLabel || 'Notes';

    for (const wrapper of wrappers) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.top <= probeY) {
            activeLabel = wrapper.dataset.sectionLabel || activeLabel;
        } else {
            break;
        }
    }

    labelEl.textContent = activeLabel;
}

function attachOrganizedStickyHeaderTracking() {
    const scrollRoot = document.getElementById('notes-content');
    if (!scrollRoot) return;

    if (organizedStickyScrollRoot && organizedStickyScrollHandler) {
        organizedStickyScrollRoot.removeEventListener('scroll', organizedStickyScrollHandler);
        window.removeEventListener('resize', organizedStickyScrollHandler);
    }

    organizedStickyScrollRoot = scrollRoot;
    organizedStickyScrollHandler = () => {
        updateOrganizedStickyHeaderLabel();
    };

    organizedStickyScrollRoot.addEventListener('scroll', organizedStickyScrollHandler, { passive: true });
    window.addEventListener('resize', organizedStickyScrollHandler);
    updateOrganizedStickyHeaderLabel();
}

function teardownOrganizedStickyHeader() {
    if (organizedStickyScrollRoot && organizedStickyScrollHandler) {
        organizedStickyScrollRoot.removeEventListener('scroll', organizedStickyScrollHandler);
        window.removeEventListener('resize', organizedStickyScrollHandler);
    }
    organizedStickyScrollRoot = null;
    organizedStickyScrollHandler = null;

    const sticky = document.getElementById('organized-sticky-header');
    if (sticky) sticky.remove();

    restoreQuickAccessToTopHeader();
}

async function openQuickAccessNote(type) {
    if (!activeSubject) {
        return; // Do nothing if no subject is selected
    }

    // 1. Fast memory check
    const note = findQuickAccessNote(type);
    if (note) {
        await openNote(note.handle, note.noteKey, noteDataCache.get(note.noteKey) || null);
        return;
    }

    // 2. Fallback disk scan (catches the double-refresh race condition)
    const targetDirHandle = activeSubject.handle;
    for await (const entry of targetDirHandle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
            try {
                const file = await entry.getFile();
                const text = await file.text();
                const data = JSON.parse(text);

                if (data && data.type === type) {
                    const noteName = entry.name.replace('.json', '');
                    const noteKey = `${activeSubject.name}::${noteName}`;

                    noteDataCache.set(noteKey, data);
                    await openNote(entry, noteKey, data);
                    return;
                }
            } catch (err) {
                // Silently skip any non-JSON or corrupted files
            }
        }
    }

    // 3. If we get here, the file genuinely does not exist yet.
    // We do absolutely nothing.
    return;
}

function renderOrganizedSections() {
    if (currentView !== 'organized') return;
    const notesGrid = document.getElementById('notes-grid');

    // Type display order
    const typeOrder = ['note', 'markdown', 'test', 'practice', 'exercises', 'exampractice', 'pdf'];
    const typeNameMap = {
        'pdf':         'Slide Notes',
        'note':        'Non-Linear Notes',
        'markdown':    'Markdown',
        'flashcard':   'Flashcards',
        'glossary':    'Glossary',
        'qa':          'Q&A',
        'todo':        'To Do',
        'links':       'Pinboard',
        'test':        'Test',
        'practice':    'Practice Problems',
        'exercises':   'Exercises',
        'exampractice':'Exam Practice'
    };

    // Collect all visible regular cards + any live PDF cards
    const cardPool = new Set(currentVisibleCardSet);
    notesGrid.querySelectorAll('.pdf-card').forEach(c => cardPool.add(c));

    // Group pool by type
    const grouped = new Map();
    for (const card of cardPool) {
        const type = card.dataset.noteType || 'note';
        if (!grouped.has(type)) grouped.set(type, []);
        grouped.get(type).push(card);
    }

    const hiddenQuickAccessCards = [];
    for (const type of QUICK_ACCESS_NOTE_TYPES) {
        const cards = grouped.get(type);
        if (!cards || cards.length === 0) continue;
        hiddenQuickAccessCards.push(...cards);
        grouped.delete(type);
    }

    // Detach pooled cards from current location
    cardPool.forEach(card => card.remove());

    // Remove old section wrappers (hidden cards inside them remain hidden outside)
    notesGrid.querySelectorAll('.type-section-wrapper').forEach(s => {
        // Move any hidden cards back to grid before removing wrapper
        s.querySelectorAll('.note-card').forEach(c => notesGrid.appendChild(c));
        s.remove();
    });

    // Build sections in canonical order
    for (const type of typeOrder) {
        const cards = grouped.get(type);
        if (!cards || cards.length === 0) continue;

        const wrapper = document.createElement('div');
        wrapper.className = 'type-section-wrapper';
        wrapper.dataset.sectionLabel = typeNameMap[type] || getNoteTypeLabel(type);

        const header = document.createElement('div');
        header.className = 'type-section-header-card';
        header.textContent = wrapper.dataset.sectionLabel;

        const cardsGrid = document.createElement('div');
        cardsGrid.className = 'type-section-cards';
        if (type === 'markdown') cardsGrid.classList.add('markdown-compact-list');
        if (type === 'test') cardsGrid.classList.add('test-compact-list');

        for (const card of cards) {
            cardsGrid.appendChild(card);
        }

        wrapper.appendChild(header);
        wrapper.appendChild(cardsGrid);
        notesGrid.appendChild(wrapper);
    }

    // Keep singleton cards in DOM but hidden while in organized view.
    for (const card of hiddenQuickAccessCards) {
        card.style.display = 'none';
        notesGrid.appendChild(card);
    }

    ensureOrganizedStickyHeader();
    dockQuickAccessInOrganizedStickyHeader();
    attachOrganizedStickyHeaderTracking();
    updateQuickAccessButtons();
    updateOrganizedStickyHeaderLabel();
}

let stickyHeaderObserver = null;
function attachStickyHeaderObserver() {
    if (stickyHeaderObserver) {
        stickyHeaderObserver.disconnect();
        stickyHeaderObserver = null;
    }
    const scrollRoot = document.getElementById('notes-content');
    if (!scrollRoot) return;
    stickyHeaderObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            // When the sentinel (1px element at top of wrapper) is not visible
            // the sticky header is in a "stuck" state
            entry.target.closest('.type-section-wrapper')
                ?.querySelector('.type-section-header-card')
                ?.classList.toggle('is-stuck', !entry.isIntersecting);
        }
    }, { root: scrollRoot, threshold: [1], rootMargin: '-1px 0px 0px 0px' });
    // Observe a tiny sentinel at the top of each wrapper
    document.querySelectorAll('.type-section-wrapper').forEach(wrapper => {
        let sentinel = wrapper.querySelector('.sticky-sentinel');
        if (!sentinel) {
            sentinel = document.createElement('div');
            sentinel.className = 'sticky-sentinel';
            sentinel.style.cssText = 'height:1px;width:100%;pointer-events:none;visibility:hidden;';
            wrapper.insertBefore(sentinel, wrapper.firstChild);
        }
        stickyHeaderObserver.observe(sentinel);
    });
}

function flattenOrganizedSections() {
    teardownOrganizedStickyHeader();
    if (stickyHeaderObserver) {
        stickyHeaderObserver.disconnect();
        stickyHeaderObserver = null;
    }
    const notesGrid = document.getElementById('notes-grid');
    notesGrid.querySelectorAll('.type-section-wrapper').forEach(wrapper => {
        wrapper.querySelectorAll('.note-card').forEach(card => notesGrid.appendChild(card));
        wrapper.remove();
    });
}

async function loadAllNotes() {
    const notesGrid = document.getElementById('notes-grid');
    const emptyState = document.getElementById('empty-notes-state');
    
    document.getElementById('content-title').textContent = 'All Notes';
    
    // Load notes into DOM if not already loaded
    if (!allNotesLoaded) {
        await loadNotesIntoDom();
    }
    
    // Remove PDF cards when viewing all notes
    const pdfCards = notesGrid.querySelectorAll('.pdf-card');
    pdfCards.forEach(card => card.remove());
    
    const visibleCount = applyCardVisibility(allNoteCards);
    updateQuickAccessButtons();
    
    // Handle empty state
    if (visibleCount === 0) {
        emptyState.style.display = 'block';
        document.getElementById('empty-notes-state-desc').textContent = 'Click New to create a note';
        const selectFolderBtn = emptyState.querySelector('.select-folder-btn');
        if (selectFolderBtn) selectFolderBtn.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
    }
}

async function refreshCurrentNotesView() {
    if (!currentDirHandle) return;

    const activeSubjectName = activeSubject ? activeSubject.name : null;

    await loadSubjects();

    if (activeSubjectName) {
        activeSubject = allSubjects.find(s => s.name === activeSubjectName) || null;
    } else {
        activeSubject = null;
    }

    displaySubjects();

    // Force a fresh rescan from disk while preserving the current view.
    allNotesLoaded = false;
    if (activeSubject) {
        await loadNotesForSubject(activeSubject);
    } else {
        await loadAllNotes();
    }

    updateNewNoteButtonVisibility();
}

async function loadNotesForSubject(subject) {
    const notesGrid = document.getElementById('notes-grid');
    const emptyState = document.getElementById('empty-notes-state');
    
    document.getElementById('content-title').textContent = subject.name;
    
    // Load notes into DOM if not already loaded
    if (!allNotesLoaded) {
        await loadNotesIntoDom();
    }
    
    const subjectCards = noteCardsBySubject.get(subject.name) || [];
    const visibleCount = applyCardVisibility(subjectCards);
    
    // Handle empty state
    if (visibleCount === 0) {
        emptyState.style.display = 'block';
        document.getElementById('empty-notes-state-desc').textContent = 'Click New to create a note';
        const selectFolderBtn = emptyState.querySelector('.select-folder-btn');
        if (selectFolderBtn) selectFolderBtn.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
    }
    
    // Load PDFs for this subject
    await loadPdfsForSubject(subject);
    if (currentView === 'organized') renderOrganizedSections();
    updateQuickAccessButtons();
}

function sortPdfEntriesByName(entries) {
    return [...entries].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
}

function isPdfLoadStale(requestId, subjectName) {
    return requestId !== pdfLoadRequestId || !activeSubject || activeSubject.name !== subjectName;
}

async function getPdfsForSubject(subject, useCache = true) {
    if (useCache && subjectPdfCache.has(subject.name)) {
        const cached = subjectPdfCache.get(subject.name) || [];
        return sortPdfEntriesByName(cached);
    }

    const pdfs = [];
    try {
        for await (const entry of subject.handle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
                pdfs.push({
                    name: entry.name,
                    handle: entry
                });
            }
        }
    } catch (err) {
        console.error('Error scanning PDFs for subject:', subject.name, err);
    }

    const sorted = sortPdfEntriesByName(pdfs);
    subjectPdfCache.set(subject.name, sorted);
    return sorted;
}

async function ensurePdfPreviewCached(subjectName, pdf) {
    const cacheKey = `${subjectName}/${pdf.name}`;

    const file = await pdf.handle.getFile();
    const lastModified = file.lastModified;
    const fileSize = file.size;

    const cached = pdfPreviewCache[cacheKey];
    if (cached && cached.lastModified === lastModified && cached.fileSize === fileSize) {
        return cached;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 0.7 });

    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;

    const renderContext = {
        canvasContext: renderCanvas.getContext('2d'),
        viewport: viewport
    };

    await page.render(renderContext).promise;

    const dataUrl = renderCanvas.toDataURL();
    const previewData = {
        dataUrl: dataUrl,
        lastModified: lastModified,
        fileSize: fileSize
    };

    pdfPreviewCache[cacheKey] = previewData;
    return previewData;
}

async function loadPdfsForSubject(subject) {
    const notesGrid = document.getElementById('notes-grid');
    const requestId = ++pdfLoadRequestId;
    const subjectName = subject.name;

    // Remove all existing PDF cards so only the selected subject's PDFs are shown.
    const existingPdfCards = notesGrid.querySelectorAll('.pdf-card');
    existingPdfCards.forEach(card => card.remove());

    // Use preloaded PDF list when available.
    const pdfs = await getPdfsForSubject(subject, true);
    if (isPdfLoadStale(requestId, subjectName)) return;

    // Create PDF cards
    for (const pdf of pdfs) {
        if (isPdfLoadStale(requestId, subjectName)) return;

        const card = document.createElement('div');
        card.className = 'note-card pdf-card';
        card.dataset.subject = subjectName;
        card.dataset.noteType = 'pdf';

        const preview = document.createElement('div');
        preview.className = 'note-preview';
        preview.innerHTML = '<canvas width="120" height="160" style="width: 100%; height: 100%; object-fit: contain;"></canvas>';

        const info = document.createElement('div');
        info.className = 'note-info';

        const title = document.createElement('div');
        title.className = 'note-title';
        const pdfDisplayName = pdf.name.replace(/\.pdf$/i, '');
        title.textContent = pdfDisplayName;
        title.title = pdfDisplayName;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'note-meta';

        const dateDiv = document.createElement('div');
        dateDiv.className = 'note-date';
        // Leave empty for PDFs

        const subjectPill = document.createElement('div');
        subjectPill.className = 'note-subject-pill';
        subjectPill.textContent = subjectName;

        metaDiv.appendChild(dateDiv);
        metaDiv.appendChild(subjectPill);

        info.appendChild(title);
        info.appendChild(metaDiv);

        card.appendChild(preview);
        card.appendChild(info);

        // Render PDF preview
        const canvas = preview.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        // Create cache key
        const cacheKey = `${subjectName}/${pdf.name}`;

        try {
            const file = await pdf.handle.getFile();
            if (isPdfLoadStale(requestId, subjectName)) return;

            const lastModified = file.lastModified;
            const fileSize = file.size;

            // Check if we have a cached preview
            if (pdfPreviewCache[cacheKey] &&
                pdfPreviewCache[cacheKey].lastModified === lastModified &&
                pdfPreviewCache[cacheKey].fileSize === fileSize) {
                // Use cached preview
                const img = new Image();
                img.onload = () => {
                    if (isPdfLoadStale(requestId, subjectName)) return;
                    // Set canvas dimensions to match cached image
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                };
                img.src = pdfPreviewCache[cacheKey].dataUrl;
            } else {
                // Render and cache new preview
                const previewData = await ensurePdfPreviewCached(subjectName, pdf);
                if (isPdfLoadStale(requestId, subjectName)) return;

                const img = new Image();
                img.onload = () => {
                    if (isPdfLoadStale(requestId, subjectName)) return;
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                };
                img.src = previewData.dataUrl;
            }
        } catch (err) {
            if (isPdfLoadStale(requestId, subjectName)) return;
            console.error('Error rendering PDF preview:', err);
            // Fallback to icon
            preview.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 60px; height: 80px;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                </svg>
            `;
        }

        if (isPdfLoadStale(requestId, subjectName)) return;

        card.onclick = async () => {
            const file = await pdf.handle.getFile();
            const buffer = await file.arrayBuffer();

            const baseName = pdf.name.slice(0, -4);
            let jsonContent = null;
            let jsonPath = null;

            if (subject.handle.path && typeof fs !== 'undefined') {
                jsonPath = path.join(subject.handle.path, baseName + '.json');
                if (fs.existsSync(jsonPath)) {
                    jsonContent = fs.readFileSync(jsonPath, 'utf8');
                }
            }

            ipcRenderer.send('launch-slidenotes-app', {
                pdfBuffer: buffer,
                jsonContent: jsonContent,
                jsonPath: jsonPath
            });
        };
        notesGrid.appendChild(card);
    }
}

async function loadNotesIntoDom() {
    const notesGrid = document.getElementById('notes-grid');
    const emptyState = document.getElementById('empty-notes-state');
    restoreQuickAccessToTopHeader();
    notesGrid.innerHTML = '';
    noteCardMap = new Map();
    noteCardsBySubject = new Map();
    allNoteCards = [];
    currentVisibleCardSet = new Set();
    noteDataCache = new Map();
    subjectPdfCache = new Map();
    globalSearchIndex = new Map();
    loadedNotesForSearch = [];
    resetNotePreviewObserver();
    
    const allNotes = [];
    
    for (const subject of allSubjects) {
        try {
            const jsonEntries = [];
            const aiEntries = [];
            const pdfBaseNames = new Set();
            
            for await (const entry of subject.handle.values()) {
                if (entry.kind === 'file') {
                    const nameLower = entry.name.toLowerCase();
                    if (nameLower.endsWith('.pdf')) {
                        pdfBaseNames.add(nameLower.slice(0, -4));
                    } else if (nameLower.endsWith('.json') || nameLower.endsWith('.md')) {
                        jsonEntries.push(entry);
                    } else if (nameLower.endsWith('.ai')) {
                        aiEntries.push(entry);
                    }
                }
            }

            for (const entry of jsonEntries) {
                const isMd = entry.name.toLowerCase().endsWith('.md');
                const extLength = isMd ? 3 : 5;
                const baseName = entry.name.slice(0, -extLength).toLowerCase();

                // Instantly identify quick access notes by filename.
                let guessedType = isMd ? 'markdown' : 'note';
                if (!isMd) {
                    if (baseName.includes('flashcard deck')) guessedType = 'flashcard';
                    else if (baseName.includes('glossary')) guessedType = 'glossary';
                    else if (baseName.includes('q&a') || baseName.includes('q/a')) guessedType = 'qa';
                    else if (baseName.includes('to do list')) guessedType = 'todo';
                    else if (baseName.includes('pinboard')) guessedType = 'links';
                }

                // Only display if it DOES NOT have a matching PDF
                if (!pdfBaseNames.has(baseName)) {
                    const noteName = isMd ? entry.name.slice(0, -3) : entry.name.replace('.json', '');
                    const noteKey = `${subject.name}::${noteName}`;
                    allNotes.push({
                        handle: entry,
                        dirHandle: subject.handle,
                        name: noteName,
                        noteKey: noteKey,
                        subject: subject.name,
                        color: subject.color,
                        date: 0,
                        typeToken: guessedType,
                        typeLabel: isMd ? 'Markdown' : getNoteTypeLabel(guessedType),
                        todoCount: 0
                    });
                }
            }

            for (const entry of aiEntries) {
                const noteName = entry.name.replace(/\.ai$/i, '');
                const noteKey = `${subject.name}::${noteName}::ai`;
                allNotes.push({
                    handle: entry,
                    dirHandle: subject.handle,
                    name: noteName,
                    noteKey: noteKey,
                    subject: subject.name,
                    color: subject.color,
                    date: 0,
                    typeToken: 'note',
                    typeLabel: 'Adobe Illustrator',
                    todoCount: 0,
                    isExternalFile: true,
                    externalType: 'illustrator'
                });
            }
        } catch (err) {
            console.error('Error loading notes from', subject.name, err);
        }
    }
    
    allNotes.sort((a, b) => a.name.localeCompare(b.name));
    
    if (currentView === 'list') {
        notesGrid.classList.add('list-view');
    } else if (currentView === 'organized') {
        notesGrid.classList.add('organized-view');
    } else {
        notesGrid.classList.remove('list-view', 'organized-view');
    }
    
    for (const note of allNotes) {
        const card = createNoteCard(note);
        notesGrid.appendChild(card);
    }

    loadedNotesForSearch = allNotes;

    // Warm up the cache and subject PDF lists with a visible startup progress bar.
    runStartupWarmup(allNotes).catch((err) => {
        console.error('Startup warmup failed:', err);
    });
    
    allNotesLoaded = true;
}

function applyCardVisibility(targetCards) {
    const notesGrid = document.getElementById('notes-grid');
    const targetSet = new Set(targetCards);
    const allCardsInGrid = notesGrid ? Array.from(notesGrid.querySelectorAll('.note-card')) : [];

    let visibleCount = 0;

    // Always compute visibility from current DOM state so refreshes (e.g. rename)
    // cannot leave stale cards visible when currentVisibleCardSet was reset.
    for (const card of allCardsInGrid) {
        const isQuickAccess = QUICK_ACCESS_NOTE_TYPES.includes(card.dataset.noteType);
        if (targetSet.has(card) && !isQuickAccess) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    }

    currentVisibleCardSet = targetSet;
    if (currentView === 'organized') renderOrganizedSections();
    return visibleCount;
}

function getNoteTypeLabel(typeToken) {
    const typeLabelMap = {
        'flashcard': 'Flashcards',
        'glossary': 'Glossary',
        'qa': 'Q&A',
        'todo': 'To Do',
        'links': 'Pinboard',
        'test': 'Test',
        'practice': 'Practice Problems',
        'exercises': 'Exercises',
        'exampractice': 'Exam Practice',
        'note': 'Non-Linear Notes',
        'markdown': 'Markdown'
    };
    return typeLabelMap[typeToken] || 'Canvas';
}

function parseNoteMetadata(parsed) {
    let typeToken = (parsed && parsed.type) ? parsed.type : null;
    if (!typeToken) {
        if (parsed && parsed.objects) typeToken = 'note';
        else if (parsed && (parsed.strokes || parsed.textBoxes)) typeToken = 'practice';
        else typeToken = 'note';
    }

    let pendingTodos = 0;
    if (typeToken === 'todo' && parsed && Array.isArray(parsed.todos)) {
        pendingTodos = parsed.todos.filter(t => !t.completed).length;
    }

    return {
        typeToken,
        typeLabel: getNoteTypeLabel(typeToken),
        todoCount: pendingTodos
    };
}

function getGlobalSearchScopedNotes() {
    if (!activeSubject) return loadedNotesForSearch;
    return loadedNotesForSearch.filter(note => note.subject === activeSubject.name);
}

function getGlobalSearchScopeLabel() {
    return activeSubject ? `Within subject: ${activeSubject.name}` : 'Across all subjects';
}

function extractStringsFromValue(value, out, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) out.push(trimmed);
        return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        out.push(String(value));
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            extractStringsFromValue(item, out, depth + 1);
        }
        return;
    }

    if (typeof value === 'object') {
        for (const entryVal of Object.values(value)) {
            extractStringsFromValue(entryVal, out, depth + 1);
        }
    }
}

function normalizeSearchText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

function buildSearchSnippet(displayText, query) {
    if (!displayText) return 'No textual preview available.';
    const normalized = normalizeSearchText(displayText);
    if (!query) return normalized.slice(0, 180);

    const lower = normalized.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) return normalized.slice(0, 180);

    const start = Math.max(0, idx - 70);
    const end = Math.min(normalized.length, idx + query.length + 110);
    const prefix = start > 0 ? '... ' : '';
    const suffix = end < normalized.length ? ' ...' : '';
    return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

function escapeRegExp(text) {
    return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSearchMatches(text, query) {
    const safeText = escapeHtml(text || '');
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) return safeText;

    const pattern = new RegExp(`(${escapeRegExp(trimmedQuery)})`, 'ig');
    return safeText.replace(pattern, '<span class="global-search-match">$1</span>');
}

async function ensureGlobalSearchIndexForNote(note) {
    const cached = globalSearchIndex.get(note.noteKey);
    if (cached) return cached;

    let displayText = `${note.name} ${note.subject}`;
    let searchText = displayText.toLowerCase();

    try {
        if (note.isExternalFile && note.externalType === 'illustrator') {
            displayText = `${note.name}\n${note.subject}\nAdobe Illustrator`;
        } else if (note.typeToken === 'markdown') {
            const file = await note.handle.getFile();
            const text = await file.text();
            displayText = `${note.name}\n${note.subject}\n${text}`;
        } else {
            let data = noteDataCache.get(note.noteKey);
            if (!data) {
                const file = await note.handle.getFile();
                const text = await file.text();
                data = JSON.parse(text);
                noteDataCache.set(note.noteKey, data);

                const metadata = parseNoteMetadata(data);
                note.typeToken = metadata.typeToken;
                note.typeLabel = metadata.typeLabel;
                note.todoCount = metadata.todoCount;
            }

            const strings = [];
            extractStringsFromValue(data, strings);
            const bodyText = normalizeSearchText(strings.join(' ')).slice(0, 100000);
            displayText = `${note.name}\n${note.subject}\n${note.typeLabel || getNoteTypeLabel(note.typeToken)}\n${bodyText}`;
        }
    } catch (err) {
        displayText = `${note.name}\n${note.subject}`;
    }

    searchText = normalizeSearchText(displayText).toLowerCase();

    const indexed = {
        searchText,
        displayText
    };

    globalSearchIndex.set(note.noteKey, indexed);
    return indexed;
}

function renderGlobalSearchResults(results, query) {
    const listEl = document.getElementById('global-search-results');
    const countEl = document.getElementById('global-search-count');
    if (!listEl || !countEl) return;

    countEl.textContent = `Search results (${results.length})`;
    listEl.innerHTML = '';

    if (results.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.id = 'global-search-empty';
        emptyEl.textContent = query ? 'No matches found in this scope.' : 'Type to search notes, flashcards, glossary, Q&A, and more.';
        listEl.appendChild(emptyEl);
        return;
    }

    for (const result of results) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'global-search-result';

        const snippet = buildSearchSnippet(result.displayText, query);
        const highlightedTitle = highlightSearchMatches(result.note.name, query);
        const highlightedMeta = highlightSearchMatches(`${result.note.subject} • ${result.note.typeLabel || getNoteTypeLabel(result.note.typeToken)}`, query);
        const highlightedSnippet = highlightSearchMatches(snippet, query);
        item.innerHTML = `
            <div class="global-search-result-title">${highlightedTitle}</div>
            <div class="global-search-result-meta">${highlightedMeta}</div>
            <div class="global-search-result-snippet">${highlightedSnippet}</div>
        `;

        item.addEventListener('click', async () => {
            closeGlobalSearchModal();
            if (result.note.typeToken === 'markdown') {
                openMarkdownInPreferredApp(result.note.handle, result.note.dirHandle || null);
                return;
            }

            const prefetched = noteDataCache.get(result.note.noteKey) || null;
            await openNote(result.note.handle, result.note.noteKey, prefetched);
        });

        listEl.appendChild(item);
    }
}

async function runGlobalSearch(query) {
    const requestId = ++globalSearchRequestId;
    const trimmed = (query || '').trim();
    const scopeEl = document.getElementById('global-search-scope');
    const listEl = document.getElementById('global-search-results');

    if (scopeEl) {
        scopeEl.textContent = getGlobalSearchScopeLabel();
    }

    if (!trimmed) {
        renderGlobalSearchResults([], '');
        return;
    }

    if (listEl) {
        listEl.innerHTML = '<div id="global-search-empty">Searching...</div>';
    }

    const scopeNotes = getGlobalSearchScopedNotes();
    const results = [];

    for (let i = 0; i < scopeNotes.length; i++) {
        if (requestId !== globalSearchRequestId) return;

        const note = scopeNotes[i];
        const indexed = await ensureGlobalSearchIndexForNote(note);
        if (indexed.searchText.includes(trimmed.toLowerCase())) {
            results.push({ note, displayText: indexed.displayText });
        }

        // Keep input responsive for large note sets.
        if (i % 8 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    if (requestId !== globalSearchRequestId) return;
    renderGlobalSearchResults(results, trimmed);
}

function closeGlobalSearchModal() {
    const modal = document.getElementById('global-search-modal');
    if (!modal) return;
    modal.classList.remove('show');
    isGlobalSearchOpen = false;
}

async function openGlobalSearchModal() {
    const modal = document.getElementById('global-search-modal');
    const input = document.getElementById('global-search-input');
    if (!modal || !input) return;

    if (!allNotesLoaded) {
        await loadNotesIntoDom();
        if (activeSubject) {
            applyCardVisibility(noteCardsBySubject.get(activeSubject.name) || []);
        } else {
            applyCardVisibility(allNoteCards);
        }
    }

    isGlobalSearchOpen = true;
    modal.classList.add('show');
    input.focus();
    input.select();
    await runGlobalSearch(input.value || '');
}

function ensureGlobalSearchUi() {
    if (!document.getElementById('global-search-modal')) {
        const modal = document.createElement('div');
        modal.id = 'global-search-modal';
        modal.innerHTML = `
            <div id="global-search-panel" role="dialog" aria-modal="true" aria-label="Search notes">
                <div id="global-search-input-wrap">
                    <div id="global-search-input-icon">
                        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 2.25a7.75 7.75 0 1 0 4.924 13.735l5.546 5.545 1.06-1.06-5.545-5.546A7.75 7.75 0 0 0 10 2.25ZM3.75 10a6.25 6.25 0 1 1 12.5 0 6.25 6.25 0 0 1-12.5 0Z"/>
                        </svg>
                    </div>
                    <input id="global-search-input" type="text" placeholder="Search notes, glossary, Q&A, flashcards...">
                </div>
                <div id="global-search-meta">
                    <div id="global-search-count">Search results (0)</div>
                    <div id="global-search-scope">Across all subjects</div>
                </div>
                <div id="global-search-results"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeGlobalSearchModal();
        });

        const panel = modal.querySelector('#global-search-panel');
        panel.addEventListener('click', (e) => e.stopPropagation());

        const searchInput = modal.querySelector('#global-search-input');
        searchInput.addEventListener('input', (e) => {
            runGlobalSearch(e.target.value || '');
        });
    }

    const legacyInput = document.getElementById('sidebar-search');
    if (legacyInput && !document.getElementById('sidebar-search-trigger')) {
        const trigger = document.createElement('button');
        trigger.id = 'sidebar-search-trigger';
        trigger.type = 'button';
        trigger.setAttribute('aria-label', 'Open search');
        trigger.innerHTML = '<span id="sidebar-search-trigger-text">Search</span>';
        trigger.addEventListener('click', () => {
            openGlobalSearchModal();
        });
        legacyInput.replaceWith(trigger);
    }
}

function setStartupProgress(loaded, total) {
    const wrap = document.getElementById('startup-preload-progress');
    const bar = document.getElementById('startup-preload-progress-bar');
    if (!wrap || !bar) return;

    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    bar.style.width = `${pct}%`;
}

function showStartupProgress() {
    const wrap = document.getElementById('startup-preload-progress');
    const bar = document.getElementById('startup-preload-progress-bar');
    if (!wrap || !bar) return;
    bar.style.width = '0%';
    wrap.classList.add('show');
}

function hideStartupProgress() {
    const wrap = document.getElementById('startup-preload-progress');
    const bar = document.getElementById('startup-preload-progress-bar');
    if (!wrap || !bar) return;
    bar.style.width = '100%';
    setTimeout(() => {
        wrap.classList.remove('show');
        bar.style.width = '0%';
    }, 200);
}

async function runStartupWarmup(notes) {
    if (startupWarmupRunning || isDetachedWindow) return;
    startupWarmupRunning = true;

    try {
        const metadataTotal = notes.filter(n => n.typeToken !== 'markdown').length;
        const notePreviewTargets = allNoteCards
            .map(card => card.querySelector('.note-preview'))
            .filter(previewEl => previewEl && previewEl.dataset.previewState !== 'loaded');
        const subjectPdfEntries = [];

        for (const subject of allSubjects) {
            const pdfs = await getPdfsForSubject(subject, false);
            subjectPdfEntries.push({ subjectName: subject.name, pdfs });
        }

        const notePreviewTotal = notePreviewTargets.length;
        const pdfPreviewTotal = subjectPdfEntries.reduce((sum, entry) => sum + entry.pdfs.length, 0);
        const total = metadataTotal + notePreviewTotal + pdfPreviewTotal;

        if (total <= 0) return;

        let loaded = 0;
        showStartupProgress();
        setStartupProgress(loaded, total);

        await hydrateNoteMetadataAndBadges(notes, () => {
            loaded++;
            setStartupProgress(loaded, total);
        });
        if (currentView === 'organized') renderOrganizedSections();

        for (const previewEl of notePreviewTargets) {
            try {
                await loadNotePreviewWhenNeeded(previewEl);
            } catch (err) {
                console.error('Startup note preview warmup failed:', err);
            }

            loaded++;
            setStartupProgress(loaded, total);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        for (const entry of subjectPdfEntries) {
            for (const pdf of entry.pdfs) {
                try {
                    await ensurePdfPreviewCached(entry.subjectName, pdf);
                } catch (err) {
                    console.error('Startup PDF preview warmup failed:', entry.subjectName, pdf.name, err);
                }

                loaded++;
                setStartupProgress(loaded, total);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    } finally {
        hideStartupProgress();
        startupWarmupRunning = false;
    }
}

async function hydrateNoteMetadataAndBadges(notes, onProgress = null) {
    for (const note of notes) {
        if (note.typeToken === 'markdown' || note.isExternalFile) {
            continue;
        }

        try {
            const file = await note.handle.getFile();
            note.date = file.lastModified;

            const text = await file.text();
            const parsed = JSON.parse(text);
            noteDataCache.set(note.noteKey, parsed);
            const metadata = parseNoteMetadata(parsed);

            note.typeToken = metadata.typeToken;
            note.typeLabel = metadata.typeLabel;
            note.todoCount = metadata.todoCount;

            const card = noteCardMap.get(note.noteKey);
            if (!card) continue;

            card.dataset.noteType = note.typeToken;

            const dateDiv = card.querySelector('.note-date');
            if (dateDiv) {
                dateDiv.textContent = note.typeLabel || 'Canvas';
            }

            let badge = card.querySelector('.todo-badge');
            if (note.typeToken === 'todo' && note.todoCount > 0) {
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'todo-badge';
                    card.insertBefore(badge, card.firstChild);
                }
                badge.textContent = note.todoCount > 99 ? '99+' : note.todoCount;
            } else if (badge) {
                badge.remove();
            }
        } catch (err) {
            // Ignore non-JSON and malformed files during background hydration.
        }

        if (onProgress) onProgress();

        // Yield to keep the UI responsive while hydrating many notes.
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

function resetNotePreviewObserver() {
    if (notePreviewObserver) {
        notePreviewObserver.disconnect();
    }

    notePreviewObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const previewEl = entry.target;
            notePreviewObserver.unobserve(previewEl);
            loadNotePreviewWhenNeeded(previewEl);
        }
    }, {
        root: null,
        rootMargin: '300px 0px',
        threshold: 0.01
    });
}

function queueNotePreview(note, previewEl) {
    if (!notePreviewObserver) {
        resetNotePreviewObserver();
    }

    previewEl.dataset.previewState = 'queued';
    previewEl.__previewHandle = note.handle;
    previewEl.__previewNoteKey = note.noteKey;
    previewEl.innerHTML = '';
    notePreviewObserver.observe(previewEl);
}

async function loadNotePreviewWhenNeeded(previewEl) {
    if (!previewEl || previewEl.dataset.previewState === 'loading' || previewEl.dataset.previewState === 'loaded') {
        return;
    }

    const fileHandle = previewEl.__previewHandle;
    if (!fileHandle) return;

    const cachedData = noteDataCache.get(previewEl.__previewNoteKey);

    previewEl.dataset.previewState = 'loading';
    await generateNotePreview(fileHandle, previewEl, cachedData || null);
    previewEl.dataset.previewState = 'loaded';
    delete previewEl.__previewHandle;
    delete previewEl.__previewNoteKey;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function updateAiAdvancedTransform() {
    if (!aiAdvancedModalImageEl) return;
    aiAdvancedModalImageEl.style.transform = `translate(${aiAdvancedViewState.tx}px, ${aiAdvancedViewState.ty}px) scale(${aiAdvancedViewState.scale})`;
}

function resetAiAdvancedTransform() {
    aiAdvancedViewState.scale = 1;
    aiAdvancedViewState.tx = 0;
    aiAdvancedViewState.ty = 0;
    aiAdvancedViewState.panning = false;
    updateAiAdvancedTransform();
}

async function renderAiPreviewDataUrl(fileHandle, targetWidth = 1800, targetHeight = 1300) {
    if (!fileHandle || typeof pdfjsLib === 'undefined' || !pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
        return null;
    }

    let pdfDoc = null;
    try {
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();

        pdfDoc = await pdfjsLib.getDocument({
            data: buffer,
            stopAtErrors: false,
            useSystemFonts: true,
            maxImageSize: -1
        }).promise;

        const firstPage = await pdfDoc.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1 });
        const fitScale = Math.max(0.1, Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height));
        const detailScale = Math.max(1.4, Math.min(3.2, fitScale));
        const viewport = firstPage.getViewport({ scale: detailScale });

        const canvasEl = document.createElement('canvas');
        canvasEl.width = Math.max(1, Math.floor(viewport.width));
        canvasEl.height = Math.max(1, Math.floor(viewport.height));

        const previewCtx = canvasEl.getContext('2d');
        previewCtx.fillStyle = '#000';
        previewCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        await firstPage.render({ canvasContext: previewCtx, viewport }).promise;

        return canvasEl.toDataURL('image/png');
    } catch (err) {
        return null;
    } finally {
        if (pdfDoc && typeof pdfDoc.destroy === 'function') {
            try { await pdfDoc.destroy(); } catch (destroyErr) {}
        }
    }
}

function ensureAiAdvancedPreviewModal() {
    if (aiAdvancedModalEl) return aiAdvancedModalEl;

    const modal = document.createElement('div');
    modal.id = 'ai-advanced-preview-modal';
    modal.innerHTML = `
        <div class="ai-advanced-preview-panel">
            <div class="ai-advanced-preview-header">
                <div class="ai-advanced-preview-title">Illustrator Preview</div>
                <div class="ai-advanced-preview-status">Scroll to zoom, drag to pan, Esc to close</div>
            </div>
            <div class="ai-advanced-preview-viewport">
                <img class="ai-advanced-preview-image" alt="Illustrator preview" draggable="false" />
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    aiAdvancedModalEl = modal;
    aiAdvancedModalImageEl = modal.querySelector('.ai-advanced-preview-image');
    aiAdvancedModalTitleEl = modal.querySelector('.ai-advanced-preview-title');
    aiAdvancedModalStatusEl = modal.querySelector('.ai-advanced-preview-status');
    const viewport = modal.querySelector('.ai-advanced-preview-viewport');

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (!aiAdvancedModalEl || !aiAdvancedModalEl.classList.contains('show')) return;

        // Center-anchored smooth zoom: keep current viewport position stable,
        // then let user pan explicitly after zooming.
        const factor = clamp(Math.exp(-e.deltaY * 0.0012), 0.88, 1.12);
        const prevScale = aiAdvancedViewState.scale;
        const nextScale = clamp(prevScale * factor, aiAdvancedViewState.minScale, aiAdvancedViewState.maxScale);
        if (nextScale === prevScale) return;

        // Preserve the world point currently under viewport center during zoom.
        const ratio = nextScale / prevScale;
        aiAdvancedViewState.tx *= ratio;
        aiAdvancedViewState.ty *= ratio;
        aiAdvancedViewState.scale = nextScale;
        updateAiAdvancedTransform();
    }, { passive: false });

    viewport.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !aiAdvancedModalEl.classList.contains('show')) return;
        aiAdvancedViewState.panning = true;
        aiAdvancedViewState.lastX = e.clientX;
        aiAdvancedViewState.lastY = e.clientY;
        viewport.classList.add('is-panning');
        viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointermove', (e) => {
        if (!aiAdvancedViewState.panning) return;
        const dx = e.clientX - aiAdvancedViewState.lastX;
        const dy = e.clientY - aiAdvancedViewState.lastY;
        aiAdvancedViewState.lastX = e.clientX;
        aiAdvancedViewState.lastY = e.clientY;
        aiAdvancedViewState.tx += dx;
        aiAdvancedViewState.ty += dy;
        updateAiAdvancedTransform();
    });

    const stopPanning = (e) => {
        if (!aiAdvancedViewState.panning) return;
        aiAdvancedViewState.panning = false;
        viewport.classList.remove('is-panning');
        try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
    };

    viewport.addEventListener('pointerup', stopPanning);
    viewport.addEventListener('pointercancel', stopPanning);

    return aiAdvancedModalEl;
}

function closeAiAdvancedPreviewModal() {
    if (!aiAdvancedModalEl) return;
    aiAdvancedModalEl.classList.remove('show');
    resetAiAdvancedTransform();
}

async function openAiAdvancedPreviewModal(note) {
    if (!note || !note.handle) return;

    const modal = ensureAiAdvancedPreviewModal();
    if (!modal || !aiAdvancedModalImageEl) return;

    if (aiAdvancedModalTitleEl) aiAdvancedModalTitleEl.textContent = `${note.name}.ai`;
    if (aiAdvancedModalStatusEl) aiAdvancedModalStatusEl.textContent = 'Rendering high-detail preview...';

    modal.classList.add('show');
    resetAiAdvancedTransform();

    const cacheKey = note.noteKey || `${note.subject}:${note.name}`;
    let dataUrl = aiAdvancedPreviewCache.get(cacheKey) || null;

    if (!dataUrl) {
        dataUrl = await renderAiPreviewDataUrl(note.handle, 2200, 1600);
        if (dataUrl) aiAdvancedPreviewCache.set(cacheKey, dataUrl);
    }

    if (!modal.classList.contains('show')) return;

    if (dataUrl) {
        aiAdvancedModalImageEl.src = dataUrl;
        if (aiAdvancedModalStatusEl) aiAdvancedModalStatusEl.textContent = 'Scroll to zoom, drag to pan, Esc to close';
    } else {
        aiAdvancedModalImageEl.removeAttribute('src');
        if (aiAdvancedModalStatusEl) aiAdvancedModalStatusEl.textContent = 'Preview unavailable for this file';
    }
}

function createNoteCard(note) {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.dataset.subject = note.subject; // Add subject data attribute for filtering
    card.dataset.noteName = note.name; // Add name for identification
    card.dataset.noteKey = note.noteKey;
    card.dataset.noteType = note.typeToken;
    noteCardMap.set(note.noteKey, card);
    if (!noteCardsBySubject.has(note.subject)) {
        noteCardsBySubject.set(note.subject, []);
    }
    noteCardsBySubject.get(note.subject).push(card);
    allNoteCards.push(card);
    
    // --- NEW: Inject To Do Badge if count > 0 ---
    if (note.typeToken === 'todo' && note.todoCount > 0) {
        const badge = document.createElement('div');
        badge.className = 'todo-badge';
        // Cap visual numbers at 99+ for a clean UI
        badge.textContent = note.todoCount > 99 ? '99+' : note.todoCount;
        card.appendChild(badge);
    }
    
    const preview = document.createElement('div');
    preview.className = 'note-preview';
    preview.innerHTML = '';
    
    // --- THIS SECTION IS UPDATED --- //
    const info = document.createElement('div');
    info.className = 'note-info';
    
    // Top row: Title only (gets 100% width)
    const title = document.createElement('div');
    title.className = 'note-title';
    title.textContent = note.name;
    title.title = note.name; // Adds a tooltip if it's still too long!
    
    // Bottom row: Date and Pill
    const metaDiv = document.createElement('div');
    metaDiv.className = 'note-meta';
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'note-date';
    // Show the note type label (e.g. Canvas, Glossary) instead of the file date
    dateDiv.textContent = note.typeLabel || 'Canvas';
    
    const subjectPill = document.createElement('div');
    subjectPill.className = 'note-subject-pill';
    subjectPill.textContent = note.subject;
    
    metaDiv.appendChild(dateDiv);
    metaDiv.appendChild(subjectPill);
    
    info.appendChild(title);
    info.appendChild(metaDiv);
    // --- END OF UPDATED SECTION --- //
    
    card.appendChild(preview);
    card.appendChild(info);
    
    // Queue preview rendering so names appear first and previews load on demand.
    queueNotePreview(note, preview);

    if (note.isExternalFile && note.externalType === 'illustrator') {
        card.addEventListener('mouseenter', () => {
            hoveredAiPreviewNote = note;
        });
        card.addEventListener('mouseleave', () => {
            if (hoveredAiPreviewNote && hoveredAiPreviewNote.noteKey === note.noteKey) {
                hoveredAiPreviewNote = null;
            }
        });
    }

    card.onclick = async (e) => {
        // Don't open if context menu was just shown
        if (e.button !== 0) return;

        if (note.isExternalFile && note.externalType === 'illustrator') {
            openFileInExternalApp(note.handle, note.dirHandle || null);
            return;
        }

        // Launch external Markdown files in a NEW Obsidian window (Advanced URI plugin required)
        if (note.typeToken === 'markdown') {
            openMarkdownInPreferredApp(note.handle, note.dirHandle || null);
            return;
        }

        const cachedData = noteDataCache.get(note.noteKey) || null;
        await openNote(note.handle, note.noteKey, cachedData);
    };
    
    return card;
}

async function generateNotePreview(fileHandle, previewEl, prefetchedData = null) {
    // ---> NEW: Markdown Icon <---
    if (fileHandle.name.toLowerCase().endsWith('.md')) {
        previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="90" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M20.56 18H3.44C2.65 18 2 17.37 2 16.59V7.41C2 6.63 2.65 6 3.44 6h17.12c.79 0 1.44.63 1.44 1.41v9.18c0 .78-.65 1.41-1.44 1.41zM11.5 9H9.5L7.5 13 5.5 9H3.5v6h2v-3.5l2 3.5 2-3.5V15h2V9zm7 3.5h-2V9h-2v3.5h-2l3 3.5 3-3.5z"/></svg></div>`;
        return;
    }
    if (fileHandle.name.toLowerCase().endsWith('.ai')) {
        try {
            if (typeof pdfjsLib !== 'undefined' && pdfjsLib && typeof pdfjsLib.getDocument === 'function') {
                const file = await fileHandle.getFile();
                const buffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: buffer });
                const pdfDoc = await loadingTask.promise;
                const firstPage = await pdfDoc.getPage(1);
                const baseViewport = firstPage.getViewport({ scale: 1 });
                const targetWidth = 500;
                const targetHeight = 400;
                const fitScale = Math.max(0.1, Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height));
                const viewport = firstPage.getViewport({ scale: fitScale });

                const previewCanvas = document.createElement('canvas');
                previewCanvas.width = Math.max(1, Math.floor(viewport.width));
                previewCanvas.height = Math.max(1, Math.floor(viewport.height));

                const previewCtx = previewCanvas.getContext('2d');
                await firstPage.render({ canvasContext: previewCtx, viewport }).promise;

                previewCanvas.style.width = '100%';
                previewCanvas.style.height = '100%';
                previewCanvas.style.objectFit = 'contain';
                previewCanvas.style.display = 'block';

                previewEl.innerHTML = '';
                previewEl.appendChild(previewCanvas);

                if (pdfDoc && typeof pdfDoc.destroy === 'function') {
                    try { await pdfDoc.destroy(); } catch (destroyErr) {}
                }
                return;
            }
        } catch (aiPreviewErr) {
            console.warn('AI preview render failed, using icon fallback:', aiPreviewErr);
        }

        previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="92" height="92" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2" fill="#3b2d15" stroke="#ff9a00" stroke-width="1.4"/><path fill="#ff9a00" d="M8.2 16.9l2.4-8.2h2.8l2.4 8.2h-2l-.5-1.9h-2.6l-.5 1.9h-2zm3.9-3.4h1.8L13 10h-.1l-.8 3.5zM16.7 16.9V10h1.9v6.9h-1.9z"/></svg></div>`;
        return;
    }
    // ---> END NEW <---

    try {
        let data = prefetchedData;
        if (!data) {
            const file = await fileHandle.getFile();
            const text = await file.text();
            data = JSON.parse(text);
        }
        
        // Handle different note types
        if (data.type === 'flashcard') {
            previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="110" height="110" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M18.6,9.56A1.84,1.84,0,0,0,18,8.13a2,2,0,0,0-1.43-.61L3.42,7.5A1.86,1.86,0,0,0,2,8.11a1.94,1.94,0,0,0-.61,1.45v8.09A1.83,1.83,0,0,0,2,19.09a1.93,1.93,0,0,0,1.43.6H16.58a1.83,1.83,0,0,0,1.43-.6,1.93,1.93,0,0,0,.6-1.44ZM3.41,17.66V9.54H16.59v8.1Z"/><path fill="#fff" d="M3.05,4.62A2,2,0,0,1,4.11,3.48a2,2,0,0,1,1.55-.06l5.68,2.07-8.63.06Z"/><path fill="#fff" d="M6.5,1.57,7.16.93A1.82,1.82,0,0,1,8.58.31,2,2,0,0,1,10,.92L13.13,4Z"/><path fill="none" fill-rule="evenodd" d="M3.41,9.54H16.59v8.1H3.41Z"/></svg></div>`;
            return;
        }
        
        if (data.type === 'glossary') {
            previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="110" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M5.6,17.8h9.1c-0.1-0.2-0.2-0.5-0.2-0.7c-0.1-0.3-0.1-0.5-0.1-0.8c0-0.3,0-0.5,0.1-0.8c0-0.2,0.1-0.5,0.2-0.7 H5.6c-0.4,0-0.8,0.1-1,0.4c-0.3,0.3-0.4,0.6-0.4,1c0,0.4,0.1,0.8,0.4,1C4.9,17.6,5.2,17.8,5.6,17.8z M4.2,13.2 C4.4,13.1,4.6,13,4.9,13c0.2,0,0.5-0.1,0.8-0.1h10.2V2.2H5.6c-0.4,0-0.7,0.1-1,0.4c-0.3,0.3-0.4,0.6-0.4,1V13.2z M5.6,19.7 c-0.9,0-1.7-0.3-2.4-1c-0.7-0.7-1-1.5-1-2.4V3.7c0-0.9,0.3-1.7,1-2.4c0.7-0.7,1.5-1,2.4-1h10.2c0.5,0,1,0.2,1.4,0.6 c0.4,0.4,0.6,0.8,0.6,1.4v11.7c0,0.3-0.1,0.5-0.2,0.7c-0.1,0.2-0.3,0.4-0.5,0.5c-0.2,0.1-0.4,0.3-0.5,0.5c-0.1,0.2-0.2,0.5-0.2,0.7 c0,0.3,0.1,0.5,0.2,0.7c0.1,0.2,0.3,0.4,0.5,0.5c0.2,0.1,0.4,0.2,0.5,0.4c0.1,0.2,0.2,0.4,0.2,0.6v0.2c0,0.3-0.1,0.5-0.3,0.7 c-0.2,0.2-0.4,0.3-0.7,0.3H5.6z"/></svg></div>`;
            return;
        }
        
        if (data.type === 'qa') {
            previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="110" height="110" viewBox="118 218 370 370" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M262.9,239.9c64,0,116,41.9,116,93.6h12.2c0-58.1-57.5-105.9-128.2-105.9s-128.2,47.7-128.2,106.2c0,28.2,12.2,55.1,34.3,74.4l-26.3,45.9c-1.2,2.1-0.9,5.2,0.6,7c1.2,1.2,2.8,2.1,4.6,2.1c0.9,0,1.5,0,2.1-0.3l69.8-28.2c6.4,1.8,12.9,3.1,19.6,4l1.5-12.2c-6.7-0.9-13.5-2.4-19.6-4.3c-1.2-0.3-2.8-0.3-4,0.3L162.2,445l19.9-35.2c1.5-2.8,0.9-6.1-1.5-8c-21.4-17.1-33.7-41.9-33.7-68.2C146.9,282.2,198.9,239.9,262.9,239.9z M450.1,516.6c17.7-15.9,27.2-36.1,27.2-59.4c0-50.2-49-92.7-106.8-92.7S263.8,407,263.8,457.2c0,51.1,46.5,94.2,101.9,94.2l0,0c14.1,0,27.8-2.8,41-8.3l55.1,20.8c0.6,0.3,1.5,0.3,2.1,0.3c1.8,0,3.4-0.6,4.6-2.1c1.8-1.8,2.1-4.6,0.9-7L450.1,516.6z M408.8,530.6c-0.6-0.3-1.5-0.3-2.1-0.3c-0.9,0-1.8,0.3-2.4,0.6c-12.2,5.5-25.1,8.3-38.2,8.3l0,0c-48.7,0-89.4-37.6-89.4-81.7c0-43.5,43.1-80.2,94.2-80.2s94.2,36.7,94.2,80.2c0,21.1-8.9,38.9-26.3,52.9c-2.1,1.8-3.1,4.9-1.5,7.7l14.7,29.1L408.8,530.6z"/></svg></div>`;
            return;
        }
        
        if (data.type === 'todo') {
            previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="90" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg></div>`;
            return;
        }

        if (data.type === 'links') {
            previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="90" viewBox="0 0 24 24"><path fill="#fff" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg></div>`;
            return;
        }

        if (data.type === 'test') {
            previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="90" viewBox="0 0 24 24"><path fill="#fff" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg></div>`;
            return;
        }

        if (data.type === 'practice') {
            // If the practice note contains canvas data, render the canvas preview below.
            if (!(data.objects || data.strokes || data.textBoxes)) {
                previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="90" viewBox="0 0 24 24"><path fill="#fff" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/><path fill="#fff" d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></div>`;
                return;
            }
        }

        if (data.type === 'exercises') {
            if (!(data.objects || data.strokes || data.textBoxes)) {
                previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="90" viewBox="0 0 24 24"><path fill="#fff" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`;
                return;
            }
        }
        if (data.type === 'exampractice') {
            if (!(data.objects || data.strokes || data.textBoxes)) {
                previewEl.innerHTML = `<div class="note-preview-empty" style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="90" height="90" viewBox="0 0 24 24"><path fill="#fff" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`;
                return;
            }
        }
        // If this is a Fabric.js saved note (new format), render it via a temporary StaticCanvas
        if (data.objects) {
            try {
                previewEl.innerHTML = '';
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 500;
                tempCanvas.height = 400;
                const staticCanvas = new fabric.StaticCanvas(tempCanvas, { enableRetinaScaling: false });
                staticCanvas.loadFromJSON(data, () => {
                    try {
                        // Prefer to center and fit actual objects in preview for a sensible crop
                        const objs = staticCanvas.getObjects();
                        if (objs && objs.length > 0) {
                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            for (const o of objs) {
                                try {
                                    const r = o.getBoundingRect(true);
                                    minX = Math.min(minX, r.left);
                                    minY = Math.min(minY, r.top);
                                    maxX = Math.max(maxX, r.left + r.width);
                                    maxY = Math.max(maxY, r.top + r.height);
                                } catch (e) {
                                    // fallback to left/top/width/height
                                    const left = o.left || 0;
                                    const top = o.top || 0;
                                    const w = (o.width || 0) * (o.scaleX || 1);
                                    const h = (o.height || 0) * (o.scaleY || 1);
                                    minX = Math.min(minX, left);
                                    minY = Math.min(minY, top);
                                    maxX = Math.max(maxX, left + w);
                                    maxY = Math.max(maxY, top + h);
                                }
                            }

                            if (minX < Infinity && maxX > -Infinity && maxY > minY) {
                                const bboxWidth = maxX - minX;
                                const bboxHeight = maxY - minY;
                                const padding = 20; // pixels
                                const targetW = Math.max(1, tempCanvas.width - padding * 2);
                                const targetH = Math.max(1, tempCanvas.height - padding * 2);
                                const scale = Math.min(targetW / bboxWidth, targetH / bboxHeight);

                                if (typeof staticCanvas.setZoom === 'function') staticCanvas.setZoom(scale);

                                const centerX = (minX + maxX) / 2;
                                const centerY = (minY + maxY) / 2;

                                // Translate so bounding center maps to canvas center
                                if (staticCanvas.viewportTransform) {
                                    staticCanvas.viewportTransform[4] = tempCanvas.width / 2 - scale * centerX;
                                    staticCanvas.viewportTransform[5] = tempCanvas.height / 2 - scale * centerY;
                                }
                            } else {
                                // Fallback to stored camera if bbox couldn't be computed
                                if (data.camera) {
                                    const cam = data.camera;
                                    if (typeof staticCanvas.setZoom === 'function' && cam.z) staticCanvas.setZoom(cam.z);
                                    if (staticCanvas.viewportTransform && typeof cam.x === 'number' && typeof cam.y === 'number') {
                                        staticCanvas.viewportTransform[4] = cam.x;
                                        staticCanvas.viewportTransform[5] = cam.y;
                                    }
                                }
                            }
                        } else if (data.camera) {
                            // No objects: respect saved camera
                            const cam = data.camera;
                            if (typeof staticCanvas.setZoom === 'function' && cam.z) staticCanvas.setZoom(cam.z);
                            if (staticCanvas.viewportTransform && typeof cam.x === 'number' && typeof cam.y === 'number') {
                                staticCanvas.viewportTransform[4] = cam.x;
                                staticCanvas.viewportTransform[5] = cam.y;
                            }
                        }
                    } catch (err) {
                        console.warn('Failed to compute bounds for preview:', err);
                    }

                    staticCanvas.renderAll();
                    const img = new Image();
                    img.onload = () => {
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'contain';
                        previewEl.appendChild(img);
                        try { staticCanvas.dispose && staticCanvas.dispose(); } catch (e) {}
                    };
                    img.src = tempCanvas.toDataURL();
                });
            } catch (err) {
                console.error('Error rendering Fabric preview:', err);
            }
            return;
        }

        const validStrokes = data.strokes ? data.strokes.filter(s => s.tool !== 'eraser') : [];
        const textBoxes = data.textBoxes || [];
        
        if (validStrokes.length === 0 && textBoxes.length === 0) {
            return;
        }
        
        // Clear empty state
        previewEl.innerHTML = '';
        
        // Create canvas for preview
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 500;
        previewCanvas.height = 400;
        const previewCtx = previewCanvas.getContext('2d');
        
        // Calculate bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const stroke of validStrokes) {
            for (const pt of stroke.points) {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            }
        }
        for (const textBox of textBoxes) {
            minX = Math.min(minX, textBox.x);
            minY = Math.min(minY, textBox.y);
            maxX = Math.max(maxX, textBox.x + textBox.width);
            maxY = Math.max(maxY, textBox.y + textBox.height);
        }
        
        const width = maxX - minX;
        const height = maxY - minY;
        const scale = Math.min(480 / width, 380 / height) || 1;
        const offsetX = 250 - (minX + width / 2) * scale;
        const offsetY = 200 - (minY + height / 2) * scale;
        
        // Draw background
        previewCtx.fillStyle = CONFIG.bgColor;
        previewCtx.fillRect(0, 0, 500, 400);
        
        // Draw content
        previewCtx.save();
        previewCtx.translate(offsetX, offsetY);
        previewCtx.scale(scale, scale);
        previewCtx.lineCap = 'round';
        previewCtx.lineJoin = 'round';
        
        for (const stroke of validStrokes) {
            if (stroke.points.length < 1 || stroke.tool === 'eraser') continue;
            
            previewCtx.beginPath();
            previewCtx.strokeStyle = stroke.color || CONFIG.penColor;
            previewCtx.lineWidth = (stroke.width || CONFIG.penWidth) / scale;
            
            const p = stroke.points;
            previewCtx.moveTo(p[0].x, p[0].y);
            for (let i = 1; i < p.length; i++) {
                previewCtx.lineTo(p[i].x, p[i].y);
            }
            previewCtx.stroke();
        }
        
        for (const textBox of textBoxes) {
            const { x, y, width, height } = textBox;
            previewCtx.fillStyle = 'rgba(30, 30, 30, 0.95)';
            previewCtx.fillRect(x, y, width, height);
        }
        
        previewCtx.restore();
        
        previewEl.appendChild(previewCanvas);
        
    } catch (err) {
        console.error('Preview generation failed:', err);
    }
}

async function openNote(fileHandle, noteKey = null, prefetchedData = null) {
    // Check note type first before loading
    let data = prefetchedData;
    if (!data) {
        const file = await fileHandle.getFile();
        const text = await file.text();
        data = JSON.parse(text);
    }
    if (noteKey && data) {
        noteDataCache.set(noteKey, data);
    }
    
    // Store in map for saving
    noteMap.set(fileHandle.name, {handle: fileHandle, data: data});
    
    // Send to main process to open in new window
    if (ipcRenderer) {
        ipcRenderer.send('open-note-window', { type: data.type, data: data, fileName: fileHandle.name, filePath: fileHandle.path });
    } else {
        // Fallback for non-Electron
        openNoteLocally(fileHandle, data);
    }
}

function openNoteLocally(fileHandle, data) {
    if (data.type === 'flashcard') {
        openFlashcard(fileHandle, data);
    } else if (data.type === 'glossary') {
        openGlossary(fileHandle, data);
    } else if (data.type === 'qa') {
        openQA(fileHandle, data);
    } else if (data.type === 'todo') {
        openTodo(fileHandle, data);
    } else if (data.type === 'links') {
        openLinks(fileHandle, data);
    } else if (data.type === 'test') {
        openTest(fileHandle, data);
    } else {
        // Load as canvas note
        loadFromFileHandle(fileHandle);
        showCanvas();
    }
}

function openNoteFromData(noteData) {
    const {type, data, fileName, filePath} = noteData;
    currentNoteFileName = fileName;
    currentFilePath = filePath || null;
    currentNoteType = type;
    if (type === 'flashcard') {
        openFlashcard(null, data, fileName);
    } else if (type === 'glossary') {
        openGlossary(null, data, fileName);
    } else if (type === 'qa') {
        openQA(null, data, fileName);
    } else if (type === 'todo') {
        openTodo(null, data, fileName);
    } else if (type === 'links') {
        openLinks(null, data, fileName);
    } else if (type === 'test') {
        openTest(null, data, fileName);
    } else {
        // Load as canvas note
        loadFromData(data);
        currentFileName = fileName;
        showCanvas();
    }
}

// --- NEW NOTE DROPDOWN MENU ---
function toggleNewNoteMenu(event) {
    event.stopPropagation();
    const btn = document.getElementById('btn-new-note');
    const menu = document.getElementById('new-note-menu');
    if (!menu || !btn) return;

    // If opening, position the menu relative to the button and show it
    if (!menu.classList.contains('show')) {
        // show invisibly to measure
        menu.classList.add('show');
        menu.style.visibility = 'hidden';

        // small delay to ensure DOM flow
        requestAnimationFrame(() => {
            const rect = btn.getBoundingClientRect();
            const mw = menu.offsetWidth;
            const mh = menu.offsetHeight;

            // Try to align right edges by default
            let left = rect.right - mw;
            let top = rect.bottom + 6;

            // If overflowing to left, clamp
            if (left < 8) left = 8;
            // If overflowing bottom, open above the button
            if (top + mh > window.innerHeight - 8) {
                top = rect.top - mh - 6;
            }
            if (top < 8) top = 8;

            menu.style.left = `${Math.round(left)}px`;
            menu.style.top = `${Math.round(top)}px`;
            menu.style.visibility = '';

            // close when clicking outside
            setTimeout(() => document.addEventListener('click', closeNewNoteMenu), 0);
        });
    } else {
        closeNewNoteMenu();
    }
}

function closeNewNoteMenu() {
    const menu = document.getElementById('new-note-menu');
    if (!menu) return;
    menu.classList.remove('show');
    menu.style.left = '';
    menu.style.top = '';
    document.removeEventListener('click', closeNewNoteMenu);
}

async function createNewNote(type = 'note') {
    // Check if a specific subject is selected
    if (!activeSubject) {
        alert('Please select a subject first');
        return;
    }

    // Check if a folder is selected
    if (!currentDirHandle) {
        await selectRootFolder();
        if (!currentDirHandle) return; // User cancelled
    }
    
    closeNewNoteMenu();

    try {
        // Check if flashcard deck, glossary, or Q/A already exists for this subject
        if (type === 'flashcard' || type === 'glossary' || type === 'qa' || type === 'todo') {
            const targetDirHandle = activeSubject.handle;
            const existingFiles = [];
            
            for await (const entry of targetDirHandle.values()) {
                if (entry.kind === 'file' && (entry.name.toLowerCase().endsWith('.json') || entry.name.toLowerCase().endsWith('.md'))) {
                    try {
                        const file = await entry.getFile();
                        const text = await file.text();
                        let data = null;
                        try { data = JSON.parse(text); } catch (e) { data = null; }
                        
                        if (data && data.type === type) {
                            existingFiles.push(entry.name);
                        }
                    } catch (err) {
                        // Skip invalid files
                    }
                }
            }
            
            if (existingFiles.length > 0) {
                const typeName = type === 'flashcard' ? 'Flashcard Deck' : (type === 'glossary' ? 'Glossary' : (type === 'qa' ? 'Q/A' : 'To Do List'));
                alert(`A ${typeName} already exists for this subject: ${existingFiles[0]}\n\nOnly one ${typeName} is allowed per subject. Please open the existing one instead.`);
                return;
            }
        }
        
        // Generate a default filename with date and time for uniqueness
        const date = new Date();
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        const formattedDate = date.toLocaleDateString('en-US', options);
        const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
        
        let defaultName, blankData;
        
        if (type === 'markdown') {
            defaultName = `Markdown Note ${formattedDate} ${formattedTime}.md`;
            blankData = `# New Markdown Note\n\nStart typing here...`;
        } else if (type === 'flashcard') {
            defaultName = `Flashcard Deck ${formattedDate} ${formattedTime}.json`;
            blankData = {
                type: 'flashcard',
                version: '1.0',
                timestamp: new Date().toISOString(),
                flashcards: []
            };
        } else if (type === 'glossary') {
            defaultName = `Glossary.json`;
            blankData = {
                type: 'glossary',
                version: '1.0',
                timestamp: new Date().toISOString(),
                glossary: []
            };
        } else if (type === 'qa') {
            defaultName = `Q&A.json`;
            blankData = {
                type: 'qa',
                version: '1.0',
                timestamp: new Date().toISOString(),
                qa: []
            };
        } else if (type === 'todo') {
            defaultName = `To Do List.json`;
            blankData = {
                type: 'todo',
                version: '1.0',
                timestamp: new Date().toISOString(),
                todos: []
            };
        } else if (type === 'links') {
            defaultName = `Pinboard ${formattedDate} ${formattedTime}.json`;
            blankData = {
                type: 'links',
                version: '1.0',
                timestamp: new Date().toISOString(),
                sectionNames: {},
                cards: [{ section: 0, headline: '', text: '', url: '', image: '' }] 
            };
        } else if (type === 'practice') {
            defaultName = `Practice Problems ${formattedDate} ${formattedTime}.json`;
            blankData = {
                type: 'practice',
                version: '1.0',
                timestamp: new Date().toISOString(),
                camera: { x: 0, y: 0, z: 1 },
                strokes: [],
                textBoxes: []
            };
        } else if (type === 'exampractice') {
            defaultName = `Exam Practice ${formattedDate} ${formattedTime}.json`;
            blankData = {
                type: 'exampractice',
                version: '1.0',
                timestamp: new Date().toISOString(),
                camera: { x: 0, y: 0, z: 1 },
                strokes: [],
                textBoxes: []
            };
        } else if (type === 'test') {
            defaultName = `Test ${formattedDate} ${formattedTime}.json`;
            blankData = {
                type: 'test',
                version: '1.0',
                timestamp: new Date().toISOString(),
                questions: []
            };
        } else if (type === 'exercises') {
            defaultName = `Exercises ${formattedDate} ${formattedTime}.json`;
            blankData = {
                type: 'exercises',
                version: '1.0',
                timestamp: new Date().toISOString(),
                camera: { x: 0, y: 0, z: 1 },
                strokes: [],
                textBoxes: []
            };
        } else {
            defaultName = `Non-Linear Note ${formattedDate} ${formattedTime}.json`;
            blankData = {
                type: 'note',
                version: '1.0',
                timestamp: new Date().toISOString(),
                camera: { x: 0, y: 0, z: 1 },
                strokes: [],
                textBoxes: []
            };
        }

        // Create new file in the active subject's directory
        const targetDirHandle = activeSubject.handle;
        const fileHandle = await targetDirHandle.getFileHandle(defaultName, { create: true });

        // Write to file
        const writable = await fileHandle.createWritable();
        if (type === 'markdown') {
            await writable.write(blankData);
        } else {
            await writable.write(JSON.stringify(blankData));
        }
        await writable.close();

        // Register the new file in noteMap
        noteMap.set(defaultName, { handle: fileHandle, data: blankData });

        // Reload notes to show the new file in the grid immediately
        allNotesLoaded = false;
        if (activeSubject) {
            await loadNotesForSubject(activeSubject);
        } else {
            await loadAllNotes();
        }

        // Open the appropriate editor
        if (type === 'markdown') {
            openMarkdownInPreferredApp(fileHandle, targetDirHandle);
        } else if (type === 'flashcard' || type === 'glossary' || type === 'qa' || type === 'todo' || type === 'links' || type === 'note' || type === 'test') {
            if (ipcRenderer) {
                ipcRenderer.send('open-note-window', { type: type, data: blankData, fileName: defaultName, filePath: fileHandle.path });
            } else {
                currentFileHandle = fileHandle;
                currentFileName = defaultName;
                currentNoteType = type;

                if (type === 'flashcard') {
                    openFlashcard(fileHandle, blankData);
                } else if (type === 'glossary') {
                    openGlossary(fileHandle, blankData);
                } else if (type === 'qa') {
                    openQA(fileHandle, blankData);
                } else if (type === 'todo') {
                    openTodo(fileHandle, blankData);
                } else if (type === 'links') {
                    openLinks(fileHandle, blankData);
                } else if (type === 'test') {
                    openTest(fileHandle, blankData);
                } else if (type === 'note') {
                    strokes = [];
                    textBoxes = [];
                    undoStack = [];
                    redoStack = [];
                    selectedStrokes.clear();
                    selectedTextBoxes.clear();
                    editingTextBox = null;
                    camera = { x: 0, y: 0, z: 1 };
                    hasUnsavedChanges = false;

                    showCanvas();
                    requestRender();
                }
            }
        } else {
            // Fallback for Practice/Exercises local view
            currentFileHandle = fileHandle;
            currentFileName = defaultName;
            currentNoteType = type;
            openNote(fileHandle);
        }

        showNotification(`Created ${defaultName}`);
    } catch (err) {
        console.error('Error creating new note:', err);
        alert('Error creating new note. Please try again.');
    }
}

// --- FLASHCARD FUNCTIONS ---
let currentFlashcardData = null;
let currentFlashcardHandle = null;
let currentFlashcardIndex = 0;
let isFlashcardFullEditMode = false;

function openFlashcard(fileHandle, data, fileName = null) {
    currentFlashcardHandle = fileHandle;
    currentFlashcardData = data;
    currentFlashcardIndex = 0;
    isFlashcardFullEditMode = false;
    
    // Hide other screens
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('glossary-page').classList.remove('active');
    document.getElementById('qa-page').classList.remove('active');
    document.getElementById('todo-page').classList.remove('active');
    
    // Show flashcard page
    document.getElementById('flashcard-page').classList.add('active');
    
    // Show back button, hide home button
    document.getElementById('btn-save-status').classList.add('hidden');
    
    // Hide toolbar and help button
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');
    
    if (!currentFlashcardData.flashcards) {
        currentFlashcardData.flashcards = [];
    }
    
    renderFlashcardUI();
}

function closeFlashcard() {
    document.getElementById('flashcard-page').classList.remove('active');
    currentFlashcardData = null;
    currentFlashcardHandle = null;
    showHomeScreen();
}

function toggleFlashcardEditMode() {
    isFlashcardFullEditMode = !isFlashcardFullEditMode;
    renderFlashcardUI();
}

function renderFlashcardUI() {
    const scene = document.querySelector('.scene');
    const fullEditContainer = document.getElementById('fc-full-edit-container');
    const card = document.querySelector('.card');
    const modeToggle = document.querySelector('.fc-mode-toggle');
    const flashcardPage = document.getElementById('flashcard-page');
    
    if (isFlashcardFullEditMode) {
        // Full Edit Mode: Show list of all cards
        if (scene) scene.style.display = 'none';
        fullEditContainer.classList.add('show');
        if (modeToggle) {
            modeToggle.textContent = 'Practice Mode';
            modeToggle.style.display = 'block';
        }
        if (flashcardPage) {
            flashcardPage.classList.add('edit-mode');
            flashcardPage.scrollTop = 0; // Scroll to top when entering edit mode
        }
        renderFullEditList();
    } else {
        // Practice Mode: Show card with flip animation
        if (scene) scene.style.display = 'block';
        fullEditContainer.classList.remove('show');
        if (modeToggle) {
            modeToggle.textContent = 'Edit All Cards';
            modeToggle.style.display = 'block'; // Show the absolute positioned button
        }
        if (flashcardPage) flashcardPage.classList.remove('edit-mode');
        
        if (card) card.classList.remove('is-flipped');

        if (!currentFlashcardData.flashcards || currentFlashcardData.flashcards.length === 0) {
            updateFlashcardDisplay();
            if (scene) scene.style.display = 'none';
        } else {
            updateFlashcardDisplay();
        }
    }
}

function updateFlashcardDisplay() {
    const cards = currentFlashcardData.flashcards || [];
    if (cards.length === 0) return;
    
    if (currentFlashcardIndex >= cards.length) currentFlashcardIndex = 0;
    
    const cardData = cards[currentFlashcardIndex];
    const fcFront = document.querySelector('.card__face--front');
    const fcBack = document.querySelector('.card__face--back');
    const fcCard = document.querySelector('.card');
    
    // Render markdown
    try {
        fcFront.innerHTML = marked.parse(cardData.front || "...");
        fcBack.innerHTML = marked.parse(cardData.back || "...");
    } catch (e) {
        // Fallback if marked not loaded
        fcFront.textContent = cardData.front || "...";
        fcBack.textContent = cardData.back || "...";
    }
    
    fcCard.classList.remove('is-flipped');
}

function navFlashcard(dir) {
    const cards = currentFlashcardData.flashcards || [];
    if (cards.length === 0) return;
    
    const card = document.querySelector('.card');
    if (!card) return;
    
    // Remove any existing animation classes
    card.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
    
    // Apply slide out animation based on direction
    const slideOutClass = dir > 0 ? 'slide-out-left' : 'slide-out-right';
    const slideInClass = dir > 0 ? 'slide-in-right' : 'slide-in-left';
    
    card.classList.add(slideOutClass);
    
    // Wait for slide out animation to complete, then update content and slide in
    setTimeout(() => {
        // Update index
        currentFlashcardIndex += dir;
        if (currentFlashcardIndex < 0) currentFlashcardIndex = cards.length - 1;
        if (currentFlashcardIndex >= cards.length) currentFlashcardIndex = 0;
        
        // Update content
        updateFlashcardDisplay();
        
        // Apply slide in animation
        card.classList.remove(slideOutClass);
        card.classList.add(slideInClass);
        
        // Clean up animation class after it completes
        setTimeout(() => {
            card.classList.remove(slideInClass);
        }, 200);
    }, 200);
}

function flipCard() {
    const card = document.querySelector('.card');
    if (!card) return;
    card.classList.toggle('is-flipped');
}

// Open edit modal for current card (triggered by 'e' key)
function openEditModal() {
    if (isFlashcardFullEditMode) return; // Only in practice mode
    
    const modal = document.getElementById('fc-edit-modal');
    const frontTextarea = document.getElementById('fc-modal-front');
    const backTextarea = document.getElementById('fc-modal-back');
    
    if (currentFlashcardData.flashcards && currentFlashcardData.flashcards.length > 0) {
        const card = currentFlashcardData.flashcards[currentFlashcardIndex];
        frontTextarea.value = card.front || '';
        backTextarea.value = card.back || '';
    } else {
        frontTextarea.value = '';
        backTextarea.value = '';
    }
    
    modal.classList.add('show');
    frontTextarea.focus();
}

// Open edit modal for specific card from full edit mode
function openEditModalForCard(index) {
    if (!currentFlashcardData || !currentFlashcardData.flashcards) return;
    if (index < 0 || index >= currentFlashcardData.flashcards.length) return;
    
    const modal = document.getElementById('fc-edit-modal');
    const frontTextarea = document.getElementById('fc-modal-front');
    const backTextarea = document.getElementById('fc-modal-back');
    
    const card = currentFlashcardData.flashcards[index];
    frontTextarea.value = card.front || '';
    backTextarea.value = card.back || '';
    
    // Store the index for saving later
    modal.dataset.editIndex = index;
    
    modal.classList.add('show');
    frontTextarea.focus();
}

function closeEditModal() {
    const modal = document.getElementById('fc-edit-modal');
    modal.classList.remove('show');
    delete modal.dataset.editIndex;
}

async function saveEditModal() {
    const modal = document.getElementById('fc-edit-modal');
    const frontTextarea = document.getElementById('fc-modal-front');
    const backTextarea = document.getElementById('fc-modal-back');
    
    if (!currentFlashcardData.flashcards) {
        currentFlashcardData.flashcards = [];
    }
    
    const frontVal = frontTextarea.value.trim();
    const backVal = backTextarea.value.trim();
    
    if (!frontVal && !backVal) {
        closeEditModal();
        return;
    }
    
    // Check if editing from full edit mode (has editIndex)
    const editIndex = modal.dataset.editIndex;
    if (editIndex !== undefined) {
        const index = parseInt(editIndex);
        if (index >= 0 && index < currentFlashcardData.flashcards.length) {
            currentFlashcardData.flashcards[index].front = frontVal;
            currentFlashcardData.flashcards[index].back = backVal;
        }
        await saveFlashcardData();
        renderFullEditList(); // Refresh the full edit list
        closeEditModal();
    } else {
        // Editing from practice mode
        if (currentFlashcardIndex < currentFlashcardData.flashcards.length) {
            // Update existing card
            currentFlashcardData.flashcards[currentFlashcardIndex].front = frontVal;
            currentFlashcardData.flashcards[currentFlashcardIndex].back = backVal;
        } else {
            // Add new card
            currentFlashcardData.flashcards.push({ front: frontVal, back: backVal });
        }
        await saveFlashcardData();
        updateFlashcardDisplay();
        closeEditModal();
    }
}

function renderFullEditList() {
    const container = document.getElementById('fc-full-edit-list');
    container.innerHTML = '';
    
    if (!currentFlashcardData.flashcards || currentFlashcardData.flashcards.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#666;padding:40px;">No flashcards yet. Click "Add New Card" to create one.</div>';
        return;
    }
    
    currentFlashcardData.flashcards.forEach((card, index) => {
        const cardItem = document.createElement('div');
        cardItem.className = 'fc-card-item';
        cardItem.dataset.index = index;
        cardItem.style.cursor = 'default';
        
        // Create hover pane with edit/delete buttons
        const hoverPane = document.createElement('div');
        hoverPane.className = 'fc-card-hover-pane';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'fc-card-hover-btn edit';
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        editBtn.title = 'Edit';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            hoverPane.classList.remove('show');
            openEditModalForCard(index);
        };
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'fc-card-hover-btn delete';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.title = 'Delete';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            hoverPane.classList.remove('show');
            deleteCardInFullEdit(index);
        };
        
        hoverPane.appendChild(editBtn);
        hoverPane.appendChild(deleteBtn);
        
        // Create card content with markdown rendering
        const cardFields = document.createElement('div');
        cardFields.className = 'fc-card-fields';
        
        const frontField = document.createElement('div');
        frontField.className = 'fc-edit-field';
        const frontLabel = document.createElement('label');
        frontLabel.textContent = 'Front (Question)';
        frontLabel.style.color = '#8af';
        frontLabel.style.fontWeight = '600';
        const frontContent = document.createElement('div');
        frontContent.className = 'fc-face';
        frontContent.style.color = '#e0e0e0';
        frontContent.style.padding = '8px 0';
        frontContent.style.minHeight = '40px';
        try {
            frontContent.innerHTML = marked.parse(card.front || '');
        } catch (e) {
            frontContent.textContent = card.front || '';
        }
        frontField.appendChild(frontLabel);
        frontField.appendChild(frontContent);
        
        const backField = document.createElement('div');
        backField.className = 'fc-edit-field';
        const backLabel = document.createElement('label');
        backLabel.textContent = 'Back (Answer)';
        backLabel.style.color = '#8af';
        backLabel.style.fontWeight = '600';
        const backContent = document.createElement('div');
        backContent.className = 'fc-face';
        backContent.style.color = '#e0e0e0';
        backContent.style.padding = '8px 0';
        backContent.style.minHeight = '40px';
        try {
            backContent.innerHTML = marked.parse(card.back || '');
        } catch (e) {
            backContent.textContent = card.back || '';
        }
        backField.appendChild(backLabel);
        backField.appendChild(backContent);
        
        cardFields.appendChild(frontField);
        cardFields.appendChild(backField);
        cardItem.appendChild(cardFields);
        cardItem.appendChild(hoverPane);
        
        // Right-click to show edit/delete buttons
        cardItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // Hide all other hover panes first
            document.querySelectorAll('.fc-card-hover-pane.show').forEach(pane => {
                if (pane !== hoverPane) {
                    pane.classList.remove('show');
                }
            });
            // Show this card's hover pane
            hoverPane.classList.add('show');
        });
        
        container.appendChild(cardItem);
    });
}

// Removed - no longer needed as we use modal for editing

// Click outside handler to hide hover panes
document.addEventListener('click', (e) => {
    const flashcardPage = document.getElementById('flashcard-page');
    const glossaryPage = document.getElementById('glossary-page');
    const qaPage = document.getElementById('qa-page');
    
    // Handle flashcard hover panes
    if (flashcardPage && flashcardPage.classList.contains('active') && isFlashcardFullEditMode) {
        // Hide all flashcard hover panes when clicking outside
        if (!e.target.closest('.fc-card-item')) {
            document.querySelectorAll('.fc-card-hover-pane.show').forEach(pane => {
                pane.classList.remove('show');
            });
        }
    }
    
    // Handle glossary hover panes
    if (glossaryPage && glossaryPage.classList.contains('active')) {
        // Hide all glossary hover panes when clicking outside
        if (!e.target.closest('.glossary-item')) {
            document.querySelectorAll('.glossary-hover-pane.show').forEach(pane => {
                pane.classList.remove('show');
            });
        }
    }
    
    // Handle Q/A hover panes
    if (qaPage && qaPage.classList.contains('active')) {
        // Hide all Q/A hover panes when clicking outside
        if (!e.target.closest('.qa-item')) {
            document.querySelectorAll('.qa-hover-pane.show').forEach(pane => {
                pane.classList.remove('show');
            });
        }
    }
});

async function addNewCardInFullEdit() {
    if (!currentFlashcardData.flashcards) {
        currentFlashcardData.flashcards = [];
    }
    currentFlashcardData.flashcards.push({ front: '', back: '' });
    await saveFlashcardData();
    renderFullEditList();
    
    // Open modal for the new card
    setTimeout(() => {
        openEditModalForCard(currentFlashcardData.flashcards.length - 1);
    }, 100);
}

async function deleteCardInFullEdit(index) {
    if (!confirm('Delete this card?')) return;
    currentFlashcardData.flashcards.splice(index, 1);
    await saveFlashcardData();
    renderFullEditList();
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Add click handler for flip card
document.addEventListener('DOMContentLoaded', () => {
    const scene = document.querySelector('.scene');
    if (scene) {
        scene.addEventListener('click', flipCard);
    }
    
    // Modal close handlers
    const modal = document.getElementById('fc-edit-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeEditModal();
        });
    }
});

async function deleteFlashcard() {
    if(!currentFlashcardData.flashcards || currentFlashcardData.flashcards.length === 0) return;
    if(confirm("Delete this card?")) {
        currentFlashcardData.flashcards.splice(currentFlashcardIndex, 1);
        if (currentFlashcardIndex >= currentFlashcardData.flashcards.length) {
            currentFlashcardIndex = Math.max(0, currentFlashcardData.flashcards.length - 1);
        }
        await saveFlashcardData();
        renderFlashcardUI();
    }
}

async function saveFlashcardData() {
    // If no FileHandle (web picker) is available, try direct write if path provided
    if (!currentFlashcardHandle) {
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentFlashcardData));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err) {
                console.error('Direct write failed for flashcard:', err);
            }
        }
        if (ipcRenderer && currentNoteFileName) {
            ipcRenderer.send('save-note', {fileName: currentNoteFileName, data: currentFlashcardData});
        }
        return;
    }

    try {
        const writable = await currentFlashcardHandle.createWritable();
        await writable.write(JSON.stringify(currentFlashcardData));
        await writable.close();
    } catch (err) {
        console.error('Error saving flashcard:', err);
        // Fallback to direct sync write if we have a path (detached window)
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentFlashcardData));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err2) {
                console.error('Direct write also failed for flashcard:', err2);
            }
        }
        alert('Failed to save flashcard');
    }
}
// --- TEST FUNCTIONS ---
let currentTestHandle = null;
let currentTestData = null;
let isTestEditMode = false;

function openTest(fileHandle, data, fileName = null) {
    currentTestHandle = fileHandle;
    currentTestData = data;
    isTestEditMode = false;
    
    // Hide other screens
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('flashcard-page').classList.remove('active');
    document.getElementById('glossary-page').classList.remove('active');
    document.getElementById('qa-page').classList.remove('active');
    document.getElementById('todo-page').classList.remove('active');
    document.getElementById('links-page').classList.remove('active');
    
    // Show test page
    document.getElementById('test-page').classList.add('active');
    document.getElementById('btn-save-status').classList.add('hidden');
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');
    
    if (!currentTestData.questions) currentTestData.questions = [];
    
    renderTestUI();
}

async function closeTest() {
    await saveTestData();
    document.getElementById('test-page').classList.remove('active');
    currentTestData = null;
    currentTestHandle = null;
    showHomeScreen();
}

async function saveTestData() {
    if (!currentTestHandle) {
        currentTestData.timestamp = new Date().toISOString();
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentTestData, null, 2));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
            } catch (err) { console.error(err); }
        }
        if (ipcRenderer && currentNoteFileName) {
            ipcRenderer.send('save-note', {fileName: currentNoteFileName, data: currentTestData});
        }
        return;
    }

    currentTestData.timestamp = new Date().toISOString();
    const json = JSON.stringify(currentTestData, null, 2);
    try {
        const writable = await currentTestHandle.createWritable();
        await writable.write(json);
        await writable.close();
        hasUnsavedChanges = false;
    } catch (err) {
        console.error('Error saving test:', err);
    }
}

function toggleTestMode() {
    isTestEditMode = !isTestEditMode;
    renderTestUI();
}

function renderTestUI() {
    const toggleBtn = document.getElementById('test-mode-toggle');
    const viewContainer = document.getElementById('test-view-container');
    const editContainer = document.getElementById('test-edit-container');

    if (isTestEditMode) {
        toggleBtn.textContent = 'Practice Mode';
        viewContainer.style.display = 'none';
        editContainer.style.display = 'block';
        renderTestEditUI();
    } else {
        toggleBtn.textContent = 'Edit Mode';
        viewContainer.style.display = 'block';
        editContainer.style.display = 'none';
        renderTestViewUI();
    }
}

// Stores current user selections in memory during the test
let testSessionSelections = {};

function renderTestViewUI() {
    const container = document.getElementById('test-view-container');
    container.innerHTML = '';

    if (!currentTestData.questions || currentTestData.questions.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#666;padding:40px;">No questions yet. Switch to Edit Mode to add some.</div>';
        return;
    }

    // Group questions by ID (e.g. "2.4")
    const grouped = {};
    currentTestData.questions.forEach((q, i) => {
        const groupKey = q.id || 'Misc';
        if (!grouped[groupKey]) grouped[groupKey] = [];
        grouped[groupKey].push({ ...q, globalIndex: i });
    });

    // Build a single continuous card that contains all questions
    const mainCard = document.createElement('div');
    mainCard.className = 'test-q-card';

    for (const [groupKey, questions] of Object.entries(grouped)) {
        // (No section header or group/topic shown in practice mode)

        questions.forEach((q, localIndex) => {
            const qSection = document.createElement('div');
            qSection.className = 'test-q-section';

            const qBody = document.createElement('div');
            qBody.className = 'test-q-body';

            const qText = document.createElement('div');
            qText.className = 'test-q-text';
            try { qText.innerHTML = marked.parse(q.question || ''); } catch (e) { qText.textContent = q.question; }

            const optionsList = document.createElement('div');
            optionsList.className = 'test-options-list';

            const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
            const opts = q.options || [];

            let submitBtn = document.createElement('button');
            submitBtn.className = 'test-submit-btn';
            submitBtn.textContent = 'Submit';
            submitBtn.disabled = true; // Disabled until selection

            let currentSelection = null;
            const isAnswered = testSessionSelections[q.globalIndex] !== undefined;

            opts.forEach((optText, optIdx) => {
                const optLabel = document.createElement('label');
                optLabel.className = 'test-option';
                if (isAnswered) optLabel.classList.add('locked');

                const optInput = document.createElement('input');
                optInput.type = 'radio';
                optInput.className = 'sr-only';
                optInput.name = `quiz-q-${q.globalIndex}`;
                optInput.value = optIdx;
                if (isAnswered) optInput.disabled = true;

                const letterSpan = document.createElement('span');
                letterSpan.className = 'test-option-letter';
                letterSpan.textContent = labels[optIdx] || '?';

                const textSpan = document.createElement('span');
                textSpan.className = 'test-option-text';
                textSpan.textContent = optText;

                optLabel.appendChild(optInput);
                optLabel.appendChild(letterSpan);
                optLabel.appendChild(textSpan);

                // Re-apply classes if already answered in this session
                if (isAnswered) {
                    const submittedAns = testSessionSelections[q.globalIndex];
                    if (optIdx === submittedAns) {
                        if (submittedAns === q.correctAnswer) optLabel.classList.add('correct');
                        else optLabel.classList.add('incorrect');
                    } else if (optIdx === q.correctAnswer) {
                        optLabel.classList.add('correct'); // Show correct answer if they got it wrong
                    }
                }

                optInput.addEventListener('change', (e) => {
                    if (isAnswered) return;
                    // Deselect all
                    Array.from(optionsList.querySelectorAll('.test-option')).forEach(l => l.classList.remove('selected'));
                    optLabel.classList.add('selected');
                    currentSelection = optIdx;
                    submitBtn.disabled = false;
                });

                optionsList.appendChild(optLabel);
            });

            submitBtn.onclick = () => {
                if (currentSelection === null) return;
                testSessionSelections[q.globalIndex] = currentSelection;
                renderTestViewUI(); // Re-render to lock states and show explanation
            };

            qBody.appendChild(qText);
            qBody.appendChild(optionsList);

            if (!isAnswered) {
                qBody.appendChild(submitBtn);
            } else if (q.explanation) {
                const explDiv = document.createElement('div');
                explDiv.className = 'test-explanation';

                const isCorrect = testSessionSelections[q.globalIndex] === q.correctAnswer;
                const statusText = isCorrect ? 'Correct!' : 'Incorrect.';

                explDiv.innerHTML = `<span class="test-explanation-title">${statusText}</span> <span>${escapeHtml(q.explanation)}</span>`;

                if (!isCorrect) {
                    explDiv.style.border = '1px solid #ef4444';
                    explDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                    explDiv.style.color = '#fca5a5';
                }

                qBody.appendChild(explDiv);
            }

            qSection.appendChild(qBody);
            mainCard.appendChild(qSection);
        });
    }

    container.appendChild(mainCard);
}

function renderTestEditUI() {
    const listDiv = document.getElementById('test-edit-list');
    listDiv.innerHTML = '';

    if (!currentTestData.questions) currentTestData.questions = [];

    currentTestData.questions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'test-edit-item';
        
        item.innerHTML = `
            <div class="test-edit-row">
                <div>
                    <label style="color:#aaa; font-size:12px; margin-bottom:4px; display:block;">ID (e.g. 2.4)</label>
                    <input type="text" class="test-edit-input q-id" value="${escapeHtml(q.id || '')}">
                </div>
                <div>
                    <label style="color:#aaa; font-size:12px; margin-bottom:4px; display:block;">Group/Topic</label>
                    <input type="text" class="test-edit-input q-group" value="${escapeHtml(q.group || '')}">
                </div>
            </div>
            <div>
                <label style="color:#8af; font-size:12px; margin-bottom:4px; display:block;">Question Text (Markdown allowed)</label>
                <textarea class="test-edit-textarea q-text">${escapeHtml(q.question || '')}</textarea>
            </div>
            <div class="options-container" style="display:flex; flex-direction:column; gap:8px;">
                <label style="color:#aaa; font-size:12px;">Options & Correct Answer (Check the correct one)</label>
                ${(q.options || ['', '', '', '']).map((opt, oIdx) => `
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="radio" name="edit-correct-${index}" value="${oIdx}" ${q.correctAnswer === oIdx ? 'checked' : ''} style="accent-color:#8af; width:18px; height:18px;">
                        <input type="text" class="test-edit-input q-opt" value="${escapeHtml(opt)}" placeholder="Option ${String.fromCharCode(65+oIdx)}">
                    </div>
                `).join('')}
            </div>
            <div>
                <label style="color:#aaa; font-size:12px; margin-bottom:4px; display:block;">Explanation</label>
                <textarea class="test-edit-textarea q-expl">${escapeHtml(q.explanation || '')}</textarea>
            </div>
            <div class="test-edit-actions">
                <button class="fc-btn del-btn" onclick="deleteTestQuestion(${index})">Delete Question</button>
                <button class="fc-btn edit-toggle" onclick="saveTestEdit(${index}, this)">Save</button>
            </div>
        `;
        listDiv.appendChild(item);
    });
}

function addTestQuestion() {
    currentTestData.questions.push({
        id: '', group: '', question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: ''
    });
    saveTestData();
    renderTestEditUI();
}

function deleteTestQuestion(index) {
    if(confirm("Delete this question?")) {
        currentTestData.questions.splice(index, 1);
        // Also reset session memory so we don't map to wrong indices
        testSessionSelections = {};
        saveTestData();
        renderTestEditUI();
    }
}

function saveTestEdit(index, btnEl) {
    const itemEl = btnEl.closest('.test-edit-item');
    const q = currentTestData.questions[index];
    
    q.id = itemEl.querySelector('.q-id').value;
    q.group = itemEl.querySelector('.q-group').value;
    q.question = itemEl.querySelector('.q-text').value;
    q.explanation = itemEl.querySelector('.q-expl').value;
    
    const optInputs = itemEl.querySelectorAll('.q-opt');
    q.options = Array.from(optInputs).map(i => i.value);
    
    const checkedRadio = itemEl.querySelector(`input[name="edit-correct-${index}"]:checked`);
    q.correctAnswer = checkedRadio ? parseInt(checkedRadio.value) : 0;

    // Reset session memory for this question so it can be re-tested
    delete testSessionSelections[index];

    saveTestData().then(() => {
        const originalText = btnEl.textContent;
        btnEl.textContent = 'Saved!';
        btnEl.style.backgroundColor = '#22c55e';
        btnEl.style.color = '#000';
        setTimeout(() => {
            btnEl.textContent = originalText;
            btnEl.style.backgroundColor = '';
            btnEl.style.color = '';
        }, 1000);
    });
}

// --- GLOSSARY FUNCTIONS ---
let currentGlossaryData = null;
let currentGlossaryHandle = null;
const GLOSSARY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
let glossaryRailHideTimer = null;

function initGlossaryAlphabetRail() {
    const rail = document.getElementById('glossary-alpha-rail');
    if (!rail || rail.childElementCount > 0) return;

    for (const letter of GLOSSARY_ALPHABET) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'glossary-alpha-letter';
        btn.textContent = letter;
        btn.dataset.letter = letter;
        btn.setAttribute('aria-label', `Jump to ${letter}`);
        btn.addEventListener('click', () => jumpGlossaryToLetter(letter));
        rail.appendChild(btn);
    }

    const glossaryPageEl = document.getElementById('glossary-page');
    if (glossaryPageEl) {
        glossaryPageEl.addEventListener('scroll', () => {
            showGlossaryAlphabetRailTemporarily();
            updateGlossaryActiveLetter();
        }, { passive: true });
    }
}

function showGlossaryAlphabetRailTemporarily() {
    const rail = document.getElementById('glossary-alpha-rail');
    if (!rail) return;

    rail.classList.add('show');
}

function updateGlossaryAlphabetRailState() {
    const rail = document.getElementById('glossary-alpha-rail');
    if (!rail) return;

    const presentLetters = new Set(
        Array.from(document.querySelectorAll('#glossary-list .glossary-letter-divider'))
            .map(el => el.dataset.letter)
            .filter(Boolean)
    );

    rail.querySelectorAll('.glossary-alpha-letter').forEach(btn => {
        const hasSection = presentLetters.has(btn.dataset.letter);
        btn.classList.toggle('enabled', hasSection);
    });

    updateGlossaryActiveLetter();
}

function updateGlossaryActiveLetter() {
    const rail = document.getElementById('glossary-alpha-rail');
    const glossaryPageEl = document.getElementById('glossary-page');
    if (!rail || !glossaryPageEl) return;

    const pageRect = glossaryPageEl.getBoundingClientRect();
    const probeY = pageRect.top + 180;
    const dividers = Array.from(document.querySelectorAll('#glossary-list .glossary-letter-divider'));

    let activeLetter = null;
    for (const divider of dividers) {
        const rect = divider.getBoundingClientRect();
        if (rect.top <= probeY) {
            activeLetter = divider.dataset.letter || divider.textContent.trim().charAt(0).toUpperCase();
        } else {
            break;
        }
    }

    rail.querySelectorAll('.glossary-alpha-letter').forEach(btn => {
        btn.classList.toggle('active', !!activeLetter && btn.dataset.letter === activeLetter);
    });
}

function jumpGlossaryToLetter(letter) {
    const glossaryPageEl = document.getElementById('glossary-page');
    if (!glossaryPageEl) return;

    const dividers = Array.from(document.querySelectorAll('#glossary-list .glossary-letter-divider'));
    if (dividers.length === 0) return;

    const target = dividers.find(el => (el.dataset.letter || '').toUpperCase() === letter)
        || dividers.find(el => (el.dataset.letter || '').toUpperCase() > letter)
        || dividers[dividers.length - 1];

    if (!target) return;

    const scrollOffset = target.offsetTop - 80;
    glossaryPageEl.scrollTo({ top: Math.max(0, scrollOffset), behavior: 'smooth' });
    showGlossaryAlphabetRailTemporarily();
    updateGlossaryActiveLetter();
}

// --- Q/A FUNCTIONS ---
let currentQAData = null;
let currentQAHandle = null;

function openGlossary(fileHandle, data, fileName = null) {
    currentGlossaryHandle = fileHandle;
    currentGlossaryData = data;
    
    // Hide other screens
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('flashcard-page').classList.remove('active');
    document.getElementById('qa-page').classList.remove('active');
    document.getElementById('todo-page').classList.remove('active');
    
    // Show glossary page
    document.getElementById('glossary-page').classList.add('active');
    
    // Show back button, hide home button
    document.getElementById('btn-save-status').classList.add('hidden');
    
    // Hide toolbar and help button
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');
    
    // Update title
    const fileNameStr = fileHandle ? fileHandle.name.replace('.json', '') : (fileName ? fileName.replace('.json', '') : 'Glossary');
    document.getElementById('glossary-title').textContent = fileNameStr;

    initGlossaryAlphabetRail();
    
    renderGlossaryList();
}

function closeGlossary() {
    document.getElementById('glossary-page').classList.remove('active');
    const rail = document.getElementById('glossary-alpha-rail');
    if (rail) rail.classList.remove('show');
    if (glossaryRailHideTimer) {
        clearTimeout(glossaryRailHideTimer);
        glossaryRailHideTimer = null;
    }
    currentGlossaryData = null;
    currentGlossaryHandle = null;
    showHomeScreen();
}

function renderGlossaryList() {
    const listDiv = document.getElementById('glossary-list');
    const searchTerm = document.getElementById('glossary-search-input').value.toLowerCase();
    initGlossaryAlphabetRail();
    
    if (!currentGlossaryData || !currentGlossaryData.glossary || currentGlossaryData.glossary.length === 0) {
        listDiv.innerHTML = '<p style="color:#666;text-align:center;">No glossary entries yet. Add one above.</p>';
        updateGlossaryAlphabetRailState();
        return;
    }

    // Filter by search term
    let filteredGlossary = currentGlossaryData.glossary;
    if (searchTerm) {
        filteredGlossary = currentGlossaryData.glossary.filter(entry => 
            entry.term.toLowerCase().includes(searchTerm) || 
            entry.definition.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredGlossary.length === 0) {
        listDiv.innerHTML = '<p style="color:#666;text-align:center;">No matching entries found.</p>';
        updateGlossaryAlphabetRailState();
        return;
    }
    
    // Sort alphabetically by term
    filteredGlossary = [...filteredGlossary].sort((a, b) => 
        a.term.toLowerCase().localeCompare(b.term.toLowerCase())
    );

    listDiv.innerHTML = '';
    
    let currentLetter = '';
    
    // Add master show/hide button
    let masterBtn = document.getElementById('glossary-master-toggle');
    if (!masterBtn) {
        masterBtn = document.createElement('button');
        masterBtn.id = 'glossary-master-toggle';
        masterBtn.className = 'glossary-item-btn';
        masterBtn.style.marginBottom = '20px';
        masterBtn.textContent = 'Show All Definitions';
        masterBtn.dataset.state = 'hidden';
        masterBtn.onclick = () => {
            const allDefs = document.querySelectorAll('.glossary-definition');
            const allCarrows = document.querySelectorAll('.glossary-carrow');
            const allItems = document.querySelectorAll('.glossary-item');
            if (masterBtn.dataset.state === 'hidden') {
                allDefs.forEach(d => d.style.display = 'block');
                allCarrows.forEach(c => c.classList.add('open'));
                allItems.forEach(item => item.classList.add('open'));
                masterBtn.textContent = 'Hide All Definitions';
                masterBtn.dataset.state = 'shown';
            } else {
                allDefs.forEach(d => d.style.display = 'none');
                allCarrows.forEach(c => c.classList.remove('open'));
                allItems.forEach(item => item.classList.remove('open'));
                masterBtn.textContent = 'Show All Definitions';
                masterBtn.dataset.state = 'hidden';
            }
        };
        listDiv.parentNode.insertBefore(masterBtn, listDiv);
    }
    masterBtn.style.display = filteredGlossary.length === 0 ? 'none' : 'inline-block';
    masterBtn.textContent = masterBtn.dataset.state === 'shown' ? 'Hide All Definitions' : 'Show All Definitions';

    filteredGlossary.forEach((entry) => {
        const originalIndex = currentGlossaryData.glossary.indexOf(entry);
        const firstLetter = entry.term.charAt(0).toUpperCase();
        if (firstLetter !== currentLetter) {
            currentLetter = firstLetter;
            const dividerDiv = document.createElement('div');
            dividerDiv.className = 'glossary-letter-divider';
            dividerDiv.dataset.letter = currentLetter;
            dividerDiv.textContent = currentLetter;
            listDiv.appendChild(dividerDiv);
        }
        const itemDiv = document.createElement('div');
        itemDiv.className = 'glossary-item';
        const termHTML = escapeHtml(entry.term);
        let definitionHTML;
        try {
            definitionHTML = marked.parse(entry.definition);
        } catch (e) {
            definitionHTML = escapeHtml(entry.definition).replace(/\n/g, '<br>');
        }
        
        // Create hover pane with edit/delete buttons
        const hoverPane = document.createElement('div');
        hoverPane.className = 'glossary-hover-pane';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'glossary-hover-btn edit';
        editBtn.title = 'Edit';
        editBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
        `;
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editGlossaryEntry(originalIndex);
            hoverPane.classList.remove('show');
        };
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'glossary-hover-btn delete';
        deleteBtn.title = 'Delete';
        deleteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
        `;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteGlossaryEntry(originalIndex);
        };
        
        hoverPane.appendChild(editBtn);
        hoverPane.appendChild(deleteBtn);
        
        itemDiv.innerHTML = `
            <div class="glossary-term-row">
                <span class="glossary-term">${termHTML}</span>
                <span class="glossary-carrow">
                    <svg viewBox="0 0 20 20">
                        <polygon fill="#fff" points="20 5.79 10 15.79 0 5.79 2.34 3.45 10 11.11 17.66 3.45 20 5.79"/>
                    </svg>
                </span>
            </div>

            <div class="glossary-definition">
                ${definitionHTML}
            </div>
        `;
        
        itemDiv.appendChild(hoverPane);
        
        // Right-click to show edit/delete buttons
        itemDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // Hide all other hover panes first
            document.querySelectorAll('.glossary-hover-pane.show').forEach(pane => {
                pane.classList.remove('show');
            });
            // Show this item's hover pane
            hoverPane.classList.add('show');
        });
        
        // Add carrow click handler
        const carrow = itemDiv.querySelector('.glossary-carrow');
        const defDiv = itemDiv.querySelector('.glossary-definition');
        carrow.onclick = () => {
            if (defDiv.style.display === 'none' || !defDiv.style.display) {
                defDiv.style.display = 'block';
                carrow.classList.add('open');
                itemDiv.classList.add('open');
            } else {
                defDiv.style.display = 'none';
                carrow.classList.remove('open');
                itemDiv.classList.remove('open');
            }
        };
        
        listDiv.appendChild(itemDiv);
    });

    updateGlossaryAlphabetRailState();
}

async function addGlossaryEntry() {
    const term = document.getElementById('glossary-term-input').value.trim();
    const definition = document.getElementById('glossary-def-input').value.trim();
    
    if (!term || !definition) {
        alert('Please fill in both term and definition');
        return;
    }
    
    if (!currentGlossaryData.glossary) {
        currentGlossaryData.glossary = [];
    }
    
    currentGlossaryData.glossary.push({ term, definition });
    await saveGlossaryData();
    
    document.getElementById('glossary-term-input').value = '';
    document.getElementById('glossary-def-input').value = '';
    
    renderGlossaryList();
}

async function deleteGlossaryEntry(index) {
    if (!confirm('Delete this glossary entry?')) return;
    
    currentGlossaryData.glossary.splice(index, 1);
    await saveGlossaryData();
    renderGlossaryList();
}

function editGlossaryEntry(index) {
    if (!currentGlossaryData || !currentGlossaryData.glossary) return;
    if (index < 0 || index >= currentGlossaryData.glossary.length) return;
    
    const modal = document.getElementById('glossary-edit-modal');
    const termInput = document.getElementById('glossary-modal-term');
    const defTextarea = document.getElementById('glossary-modal-def');
    
    const entry = currentGlossaryData.glossary[index];
    termInput.value = entry.term || '';
    defTextarea.value = entry.definition || '';
    
    // Store the index for saving later
    modal.dataset.editIndex = index;
    
    modal.style.display = 'flex';
    termInput.focus();
}

function closeGlossaryEditModal() {
    const modal = document.getElementById('glossary-edit-modal');
    modal.style.display = 'none';
    delete modal.dataset.editIndex;
}

async function saveGlossaryEditModal() {
    const modal = document.getElementById('glossary-edit-modal');
    const termInput = document.getElementById('glossary-modal-term');
    const defTextarea = document.getElementById('glossary-modal-def');
    const index = parseInt(modal.dataset.editIndex);
    
    if (isNaN(index) || !currentGlossaryData || !currentGlossaryData.glossary) return;
    if (index < 0 || index >= currentGlossaryData.glossary.length) return;
    
    const termVal = termInput.value.trim();
    const defVal = defTextarea.value.trim();
    
    if (!termVal) {
        alert('Term cannot be empty');
        return;
    }
    
    currentGlossaryData.glossary[index].term = termVal;
    currentGlossaryData.glossary[index].definition = defVal;
    
    await saveGlossaryData();
    renderGlossaryList();
    closeGlossaryEditModal();
}

async function saveGlossaryData() {
    if (!currentGlossaryHandle) {
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentGlossaryData));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err) {
                console.error('Direct write failed for glossary:', err);
            }
        }
        if (ipcRenderer && currentNoteFileName) {
            ipcRenderer.send('save-note', {fileName: currentNoteFileName, data: currentGlossaryData});
        }
        return;
    }

    try {
        const writable = await currentGlossaryHandle.createWritable();
        await writable.write(JSON.stringify(currentGlossaryData));
        await writable.close();
    } catch (err) {
        console.error('Error saving glossary:', err);
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentGlossaryData));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err2) {
                console.error('Direct write also failed for glossary:', err2);
            }
        }
        alert('Failed to save glossary');
    }
}

function filterGlossary() {
    renderGlossaryList();
}

// --- Q/A FUNCTIONS ---
function openQA(fileHandle, data, fileName = null) {
    currentQAHandle = fileHandle;
    currentQAData = data;
    
    // Hide other screens
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('flashcard-page').classList.remove('active');
    document.getElementById('glossary-page').classList.remove('active');
    document.getElementById('todo-page').classList.remove('active');
    
    // Show Q/A page
    document.getElementById('qa-page').classList.add('active');
    
    // Show back button, hide home button
    document.getElementById('btn-save-status').classList.add('hidden');
    
    // Hide toolbar and help button
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');
    
    if (!currentQAData.qa) {
        currentQAData.qa = [];
    }
    
    renderQAList();
}

function closeQA() {
    document.getElementById('qa-page').classList.remove('active');
    currentQAData = null;
    currentQAHandle = null;
    showHomeScreen();
}

function renderQAList() {
    const qaList = document.getElementById('qa-list');
    qaList.innerHTML = '';
    
    if (!currentQAData || !currentQAData.qa || currentQAData.qa.length === 0) {
        qaList.innerHTML = '<div style="text-align:center;color:#666;padding:40px;">No Q/A entries yet. Add your first question above!</div>';
        return;
    }
    
    // Sort entries alphabetically by question
    const sortedEntries = [...currentQAData.qa].sort((a, b) => 
        (a.question || '').toLowerCase().localeCompare((b.question || '').toLowerCase())
    );
    
    // Group by first letter
    const grouped = {};
    for (const entry of sortedEntries) {
        const firstChar = (entry.question || '?')[0].toUpperCase();
        if (!grouped[firstChar]) grouped[firstChar] = [];
        grouped[firstChar].push(entry);
    }
    
    // Add master toggle button at the top
    const masterToggle = document.createElement('button');
    masterToggle.id = 'qa-master-toggle';
    masterToggle.textContent = 'Expand All';
    masterToggle.onclick = () => {
        const allItems = qaList.querySelectorAll('.qa-item');
        const allClosed = Array.from(allItems).every(item => !item.classList.contains('open'));
        
        allItems.forEach(item => {
            const def = item.querySelector('.qa-answer');
            const arrow = item.querySelector('.qa-carrow');
            
            if (allClosed) {
                item.classList.add('open');
                arrow.classList.add('open');
                def.style.maxHeight = def.scrollHeight + 'px';
            } else {
                item.classList.remove('open');
                arrow.classList.remove('open');
                def.style.maxHeight = '0';
            }
        });
        
        masterToggle.textContent = allClosed ? 'Collapse All' : 'Expand All';
    };
    qaList.appendChild(masterToggle);
    
    // Render entries grouped by letter
    const letters = Object.keys(grouped).sort();
    for (const letter of letters) {
        // Add letter divider
        const divider = document.createElement('div');
        divider.className = 'qa-letter-divider';
        divider.textContent = letter;
        qaList.appendChild(divider);
        
        // Add entries for this letter
        for (const entry of grouped[letter]) {
            const index = currentQAData.qa.indexOf(entry);
            const item = document.createElement('div');
            item.className = 'qa-item';
            
            const questionRow = document.createElement('div');
            questionRow.className = 'qa-question-row';
            
            const questionHTML = escapeHtml(entry.question || 'Untitled');
            let answerHTML;
            try {
                answerHTML = marked.parse(entry.answer || '');
            } catch (e) {
                answerHTML = escapeHtml(entry.answer || '').replace(/\n/g, '<br>');
            }
            
            // Create hover pane with edit/delete buttons
            const hoverPane = document.createElement('div');
            hoverPane.className = 'qa-hover-pane';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'qa-hover-btn edit';
            editBtn.title = 'Edit';
            editBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
            `;
            editBtn.onclick = (e) => {
                e.stopPropagation();
                editQAEntry(index);
                hoverPane.classList.remove('show');
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'qa-hover-btn delete';
            deleteBtn.title = 'Delete';
            deleteBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            `;
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                await deleteQAEntry(index);
            };
            
            hoverPane.appendChild(editBtn);
            hoverPane.appendChild(deleteBtn);
            
            item.innerHTML = `
                <div class="qa-question-row">
                    <span class="qa-question">${questionHTML}</span>
                    <span class="qa-carrow" title="Show/hide answer">
                        <svg viewBox="0 0 20 20">
                            <polygon fill="#fff" points="20 5.79 10 15.79 0 5.79 2.34 3.45 10 11.11 17.66 3.45 20 5.79"/>
                        </svg>
                    </span>
                </div>

                <div class="qa-answer">
                    ${answerHTML}
                </div>
            `;
            
            item.appendChild(hoverPane);
            
            // Right-click to show edit/delete buttons
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                // Hide all other hover panes first
                document.querySelectorAll('.qa-hover-pane.show').forEach(pane => {
                    pane.classList.remove('show');
                });
                // Show this item's hover pane
                hoverPane.classList.add('show');
            });
            
            // Add carrow click handler
            const carrow = item.querySelector('.qa-carrow');
            const defDiv = item.querySelector('.qa-answer');
            carrow.onclick = () => {
                if (defDiv.style.display === 'none' || !defDiv.style.display) {
                    defDiv.style.display = 'block';
                    carrow.classList.add('open');
                    item.classList.add('open');
                } else {
                    defDiv.style.display = 'none';
                    carrow.classList.remove('open');
                    item.classList.remove('open');
                }
            };
            
            qaList.appendChild(item);
        }
    }
}

async function addQAEntry() {
    const questionInput = document.getElementById('qa-question-input');
    const answerInput = document.getElementById('qa-answer-input');
    
    const question = questionInput.value.trim();
    const answer = answerInput.value.trim();
    
    if (!question || !answer) {
        alert('Please enter both question and answer');
        return;
    }
    
    currentQAData.qa.push({ question, answer });
    await saveQAData();
    renderQAList();
    
    questionInput.value = '';
    answerInput.value = '';
    questionInput.focus();
}

async function deleteQAEntry(index) {
    if (!confirm('Delete this Q/A entry?')) return;
    currentQAData.qa.splice(index, 1);
    await saveQAData();
    renderQAList();
}

function editQAEntry(index) {
    if (!currentQAData || !currentQAData.qa) return;
    if (index < 0 || index >= currentQAData.qa.length) return;
    
    const modal = document.getElementById('qa-edit-modal');
    const questionInput = document.getElementById('qa-modal-question');
    const answerTextarea = document.getElementById('qa-modal-answer');
    
    const entry = currentQAData.qa[index];
    questionInput.value = entry.question || '';
    answerTextarea.value = entry.answer || '';
    
    modal.dataset.editIndex = index;
    modal.style.display = 'flex';
    questionInput.focus();
}

function closeQAEditModal() {
    const modal = document.getElementById('qa-edit-modal');
    modal.style.display = 'none';
    delete modal.dataset.editIndex;
}

async function saveQAEditModal() {
    const modal = document.getElementById('qa-edit-modal');
    const index = parseInt(modal.dataset.editIndex);
    
    if (isNaN(index) || index < 0 || index >= currentQAData.qa.length) return;
    
    const questionInput = document.getElementById('qa-modal-question');
    const answerTextarea = document.getElementById('qa-modal-answer');
    
    const question = questionInput.value.trim();
    const answer = answerTextarea.value.trim();
    
    if (!question || !answer) {
        alert('Please enter both question and answer');
        return;
    }
    
    currentQAData.qa[index].question = question;
    currentQAData.qa[index].answer = answer;
    
    await saveQAData();
    renderQAList();
    closeQAEditModal();
}

async function saveQAData() {
    if (!currentQAHandle) {
        currentQAData.timestamp = new Date().toISOString();
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentQAData, null, 2));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err) {
                console.error('Direct write failed for QA:', err);
            }
        }
        if (ipcRenderer && currentNoteFileName) {
            ipcRenderer.send('save-note', {fileName: currentNoteFileName, data: currentQAData});
        }
        return;
    }

    if (!currentQAData) return;

    currentQAData.timestamp = new Date().toISOString();
    const json = JSON.stringify(currentQAData, null, 2);
    try {
        const writable = await currentQAHandle.createWritable();
        await writable.write(json);
        await writable.close();
    } catch (err) {
        console.error('Error saving QA:', err);
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, json);
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err2) {
                console.error('Direct write also failed for QA:', err2);
            }
        }
    }
}

function filterQA() {
    const searchInput = document.getElementById('qa-search-input');
    const query = searchInput.value.toLowerCase();
    const items = document.querySelectorAll('.qa-item');
    
    items.forEach(item => {
        const question = item.querySelector('.qa-question').textContent.toLowerCase();
        const answer = item.querySelector('.qa-answer').textContent.toLowerCase();
        
        if (question.includes(query) || answer.includes(query)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// --- TO DO LIST FUNCTIONS ---
let currentTodoHandle = null;
let currentTodoData = null;

function openTodo(fileHandle, data, fileName = null) {
    currentTodoHandle = fileHandle;
    currentTodoData = data;
    
    // Hide other screens
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('flashcard-page').classList.remove('active');
    document.getElementById('glossary-page').classList.remove('active');
    document.getElementById('qa-page').classList.remove('active');
    
    // Show todo page
    document.getElementById('todo-page').classList.add('active');
    
    // Show back button, hide home button
    document.getElementById('btn-save-status').classList.add('hidden');
    
    // Hide toolbar and help button
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');
    
    // Update title
    const fileNameStr = fileHandle ? fileHandle.name.replace('.json', '') : (fileName ? fileName.replace('.json', '') : 'Todo');
    document.getElementById('todo-title').textContent = fileNameStr;
    
    if (!currentTodoData.todos) {
        currentTodoData.todos = [];
    }
    
    renderTodoList();
    
    // Add Enter key handler for the input
    const input = document.getElementById('todo-item-input');
    const addBtn = document.getElementById('todo-add-btn');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTodoItem();
        }
    });
}

async function closeTodo() {
    await saveTodoData();
    document.getElementById('todo-page').classList.remove('active');
    currentTodoData = null;
    currentTodoHandle = null;
    showHomeScreen();
}

async function addTodoItem() {
    const input = document.getElementById('todo-item-input');
    const text = input.value.trim();
    
    if (!text) {
        alert('Please enter a task');
        return;
    }
    
    currentTodoData.todos.push({ text, completed: false });
    await saveTodoData();
    renderTodoList();
    
    input.value = '';
    input.focus();
}

async function toggleTodoItem(index) {
    if (!currentTodoData || !currentTodoData.todos) return;
    if (index < 0 || index >= currentTodoData.todos.length) return;
    
    currentTodoData.todos[index].completed = !currentTodoData.todos[index].completed;
    await saveTodoData();
    renderTodoList();
}

async function deleteTodoItem(index) {
    if (!confirm('Delete this task?')) return;
    currentTodoData.todos.splice(index, 1);
    await saveTodoData();
    renderTodoList();
}

function renderTodoList() {
    const listDiv = document.getElementById('todo-list');
    
    if (!currentTodoData || !currentTodoData.todos || currentTodoData.todos.length === 0) {
        listDiv.innerHTML = '<p style="color:#666;text-align:center;">No tasks yet. Add one above.</p>';
        return;
    }
    
    listDiv.innerHTML = currentTodoData.todos.map((todo, index) => `
        <div class="todo-item">
            <input type="checkbox" class="todo-checkbox" 
                    ${todo.completed ? 'checked' : ''} 
                    onclick="toggleTodoItem(${index})">
            <span class="todo-text ${todo.completed ? 'completed' : ''}">${todo.text}</span>
            <button class="todo-delete-btn" onclick="deleteTodoItem(${index})">Delete</button>
        </div>
    `).join('');
}

async function saveTodoData() {
    if (!currentTodoHandle) {
        currentTodoData.timestamp = new Date().toISOString();
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentTodoData, null, 2));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err) {
                console.error('Direct write failed for todo:', err);
            }
        }
        if (ipcRenderer && currentNoteFileName) {
            ipcRenderer.send('save-note', {fileName: currentNoteFileName, data: currentTodoData});
        }
        return;
    }

    if (!currentTodoData) return;

    currentTodoData.timestamp = new Date().toISOString();
    const json = JSON.stringify(currentTodoData, null, 2);
    try {
        const writable = await currentTodoHandle.createWritable();
        await writable.write(json);
        await writable.close();
    } catch (err) {
        console.error('Error saving todo:', err);
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, json);
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err2) {
                console.error('Direct write also failed for todo:', err2);
            }
        }
    }
}



let currentLinksHandle = null;
let currentLinksData = null;
const SECTION_HEIGHT = 450;

function openLinks(fileHandle, data, fileName = null) {
    currentLinksHandle = fileHandle;
    currentLinksData = data;
    
    // Ensure data structures exist
    if (!currentLinksData.cards) currentLinksData.cards = [];
    if (!currentLinksData.sectionNames) currentLinksData.sectionNames = {};

    // --- (Keep your existing UI visibility code here) ---
    // ... hidden screens, active pages, title update ...
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('flashcard-page').classList.remove('active');
    document.getElementById('glossary-page').classList.remove('active');
    document.getElementById('qa-page').classList.remove('active');
    document.getElementById('todo-page').classList.remove('active');

    document.getElementById('links-page').classList.add('active');
    document.getElementById('btn-save-status').classList.add('hidden');
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');

    const fileNameStr = fileHandle ? fileHandle.name.replace('.json', '') : (fileName ? fileName.replace('.json', '') : 'Links');
    document.getElementById('links-title').textContent = fileNameStr;
    renderLinksBoard();
}

async function closeLinks() {
    await saveLinksData();
    document.getElementById('links-page').classList.remove('active');
    currentLinksData = null;
    currentLinksHandle = null;
    showHomeScreen();
}

async function saveLinksData() {
    if (!currentLinksHandle) {
        currentLinksData.timestamp = new Date().toISOString();
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentLinksData, null, 2));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err) {
                console.error('Direct write failed for links:', err);
            }
        }
        if (ipcRenderer && currentNoteFileName) {
            ipcRenderer.send('save-note', {fileName: currentNoteFileName, data: currentLinksData});
        }
        return;
    }

    if (!currentLinksData) return;
    currentLinksData.timestamp = new Date().toISOString();
    try {
        const writable = await currentLinksHandle.createWritable();
        await writable.write(JSON.stringify(currentLinksData, null, 2));
        await writable.close();
    } catch (err) {
        console.error('Error saving links:', err);
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, JSON.stringify(currentLinksData, null, 2));
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err2) {
                console.error('Direct write also failed for links:', err2);
            }
        }
    }
}

function getEmbedUrl(url) {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = url.match(/vimeo\.com\/(?:.*#|.*\/videos\/)?([0-9]+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return null;
}

// We store the dynamic bounds of sections here so drag-and-drop knows where you are
window.linkSectionBounds = [];

function renderLinksBoard() {
    const board = document.getElementById('links-board');
    board.innerHTML = '';
    window.linkSectionBounds = []; // Reset bounds

    // Calculate how many columns fit on screen
    const cols = Math.max(1, Math.floor((window.innerWidth - 60) / 320));
    const ROW_HEIGHT = 380; // Approximate vertical space each row takes up

    // 1. Group cards into sections
    const sections = {};
    let highestSectionWithCards = -1; 
    
    currentLinksData.cards.forEach(c => {
        // Upgrade legacy cards (that used absolute Y coordinates) to use a section index
        if (c.section === undefined) c.section = Math.floor((c.y || 0) / 450);
        if (c.section < 0) c.section = 0;
        
        if (c.section > highestSectionWithCards) highestSectionWithCards = c.section;
        if (!sections[c.section]) sections[c.section] = [];
        sections[c.section].push(c);
    });

    // RESTORED LOGIC: Always guarantee at least one completely empty section at the bottom
    let maxSection = Math.max(0, highestSectionWithCards + 1);

    for (let i = 0; i <= maxSection; i++) {
        if (!sections[i]) sections[i] = [];
        // Sort by Y, then X to preserve legacy layout order
        sections[i].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    }

    currentLinksData.cards = []; 
    let currentYOffset = 80; // Starting Y 

    // 2. Build DOM for each section
    for (let i = 0; i <= maxSection; i++) {
        const sectionCards = sections[i];
        // Check if a name exists; if not, keep it an empty string instead of a default "Section X"
        const savedName = currentLinksData.sectionNames[i] || ""; 
        const topBound = currentYOffset;
        
        const sectionWrapper = document.createElement('div');
        sectionWrapper.className = 'link-section';
        sectionWrapper.dataset.section = i;

        // Add Divider
        const divider = document.createElement('div');
        divider.className = 'link-divider';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'link-divider-text';
        titleSpan.contentEditable = "true"; // Makes it inline-typable!
        titleSpan.setAttribute('data-placeholder', 'Click to add title');

        if (savedName) {
            titleSpan.textContent = savedName;
            titleSpan.classList.add('has-content'); // Keeps the background visible
        }

        // Listen to typing to toggle the background box on and off dynamically
        titleSpan.addEventListener('input', () => {
            // Browsers often inject a <br> when emptying a contenteditable. We need to strip it out.
            if (titleSpan.innerHTML === '<br>') {
                titleSpan.innerHTML = '';
            }
            
            if (titleSpan.textContent.trim().length > 0) {
                titleSpan.classList.add('has-content');
            } else {
                titleSpan.classList.remove('has-content');
            }
        });

        // Pressing Enter saves and closes the editing state
        titleSpan.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleSpan.blur(); // Triggers the blur event below
            }
        });

        // When the user clicks away, save to the JSON
        titleSpan.addEventListener('blur', async () => {
            const newName = titleSpan.textContent.trim();
            
            // Force pure empty state if they deleted everything
            if (newName === "") {
                titleSpan.innerHTML = ""; 
                titleSpan.classList.remove('has-content');
            }

            // Only save if the name actually changed
            if (newName !== savedName) {
                currentLinksData.sectionNames[i] = newName;
                await saveLinksData();
                // Note: No need to call renderLinksBoard() here, the UI updates instantly!
            }
        });

        divider.appendChild(titleSpan);
        sectionWrapper.appendChild(divider);

        const sectionStartY = currentYOffset + 40; 
        
        // Add CSS Grid Container
        const grid = document.createElement('div');
        grid.className = 'link-grid';
        
        // Add Cards to Grid
        sectionCards.forEach((card, idx) => {
            card.section = i;
            currentLinksData.cards.push(card); 
            const globalIndex = currentLinksData.cards.length - 1;
            
            const cardEl = document.createElement('div');
            cardEl.className = 'link-card';
            cardEl.dataset.origIndex = globalIndex; 

            let mediaHtml = '';
            if (card.image) {
                mediaHtml = `<div class="link-media"><img src="${card.image}"></div>`;
            } else {
                const embed = getEmbedUrl(card.url);
                if (embed) mediaHtml = `<div class="link-media"><iframe src="${embed}" allowfullscreen></iframe></div>`;
            }

            cardEl.innerHTML = `
                ${mediaHtml}
                <input type="text" class="link-input link-headline" placeholder="Headline">
                <textarea class="link-input link-desc" placeholder="Type something..."></textarea>
                
                <div class="link-url-container" style="display: none; margin-top: auto; padding-top: 10px; border-top: 1px solid #3a414f;">
                    <input type="text" class="link-input link-url-field" placeholder="Paste URL here..." style="font-size: 13px; color: #8af;">
                </div>
                
                <div class="link-actions" style="margin-top: ${card.url ? '10px' : 'auto'};">
                    <button class="link-btn btn-url" title="${card.url ? 'Edit Link' : 'Add Link'}"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg></button>
                    ${card.url ? `<button class="link-btn btn-visit" title="Visit Link"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg></button>` : ''}
                    <button class="link-btn btn-img" title="Add Image"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></button>
                    <button class="link-btn btn-del" style="margin-left:auto; color:#a55;" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
                </div>
            `;
            
            cardEl.querySelector('.link-headline').value = card.headline || '';
            cardEl.querySelector('.link-desc').value = card.text || '';
            
            cardEl.querySelector('.link-headline').oninput = (e) => { card.headline = e.target.value; saveLinksData(); };
            cardEl.querySelector('.link-desc').oninput = (e) => { 
                card.text = e.target.value; 
                e.target.style.height = 'auto'; 
                e.target.style.height = e.target.scrollHeight + 'px';
                saveLinksData(); 
            };

            // URL Expansion Logic
            const urlContainer = cardEl.querySelector('.link-url-container');
            const urlField = cardEl.querySelector('.link-url-field');

            cardEl.querySelector('.btn-url').onclick = (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent drag lock
                if (urlContainer.style.display === 'none') {
                    urlContainer.style.display = 'block';
                    urlField.value = card.url || '';
                    urlField.focus();
                } else {
                    urlContainer.style.display = 'none';
                }
            };

            urlField.oninput = (e) => {
                card.url = e.target.value.trim();
                saveLinksData(); // Save silently in the background
            };

            urlField.onkeydown = (e) => {
                e.stopPropagation(); // Stop drag lock while typing
                if (e.key === 'Enter') {
                    e.preventDefault();
                    urlContainer.style.display = 'none';
                    renderLinksBoard(); // Re-render so the "Visit Link" button appears!
                }
            };

            // Native Electron Visit Button
            if (cardEl.querySelector('.btn-visit')) {
                cardEl.querySelector('.btn-visit').onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    require('electron').shell.openExternal(card.url);
                };
            }

            cardEl.querySelector('.btn-img').onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'file'; input.accept = 'image/*';
                input.onchange = async () => {
                    if(input.files[0]) {
                        const reader = new FileReader();
                        reader.onload = async (ev) => { card.image = ev.target.result; await saveLinksData(); renderLinksBoard(); };
                        reader.readAsDataURL(input.files[0]);
                    }
                };
                input.click();
            };

            cardEl.querySelector('.btn-del').onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if(confirm("Delete this card?")) {
                    currentLinksData.cards.splice(globalIndex, 1);
                    await saveLinksData();
                    renderLinksBoard();
                }
            };

            makeCardDraggable(cardEl, card, globalIndex);
            grid.appendChild(cardEl);

            // Auto adjust height of textarea
            setTimeout(() => {
                const desc = cardEl.querySelector('.link-desc');
                desc.style.height = desc.scrollHeight + 'px';
            }, 0);
        });

        // Add the "Add New (+)" empty card at the end of the grid
        const addIdx = sectionCards.length;
        const addRow = Math.floor(addIdx / cols);
        
        const addCard = document.createElement('div');
        addCard.className = 'link-card empty-card';
        addCard.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24"><path fill="#ffffff" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
        addCard.onclick = async () => {
            currentLinksData.cards.push({ 
                section: i,
                headline: '', 
                text: '', 
                url: '', 
                image: '' 
            });
            await saveLinksData();
            renderLinksBoard();
        };
        grid.appendChild(addCard);

        sectionWrapper.appendChild(grid);
        board.appendChild(sectionWrapper);
        
        // Record boundaries so drag-and-drop knows exactly where rows/sections start
        const totalRowsThisSection = addRow + 1;
        const bottomBound = sectionStartY + (totalRowsThisSection * ROW_HEIGHT) + 40;
        
        window.linkSectionBounds.push({
            section: i,
            top: topBound,
            bottom: bottomBound,
            startY: sectionStartY
        });

        currentYOffset = bottomBound; 
    }
}

function makeCardDraggable(el, cardData, globalIndex) {
    let isDragging = false;
    let ghost = null;
    let startX, startY, initialMouseX, initialMouseY;

    const onPointerMove = (e) => {
        if(!isDragging || !ghost) return;
        
        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;
        ghost.style.left = `${startX + dx}px`;
        ghost.style.top = `${startY + dy}px`;

        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (!target) return;

        const targetCard = target.closest('.link-card');
        const targetGrid = target.closest('.link-grid');

        // Swap visual position in the DOM
        if (targetCard && targetCard !== el && !targetCard.classList.contains('empty-card')) {
            const targetRect = targetCard.getBoundingClientRect();
            const mouseXRel = e.clientX - targetRect.left;
            
            if (mouseXRel < targetRect.width / 2) {
                targetCard.parentNode.insertBefore(el, targetCard);
            } else {
                targetCard.parentNode.insertBefore(el, targetCard.nextSibling);
            }
        } else if (targetGrid && !targetCard) {
            const emptyCard = targetGrid.querySelector('.empty-card');
            if (emptyCard) targetGrid.insertBefore(el, emptyCard);
        }
    };

    const onPointerUp = async (e) => {
        if (!isDragging) return;
        isDragging = false;

        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        // 1. CLEAN UP GHOST FIRST - Crucial so it's not in the DOM count
        if (ghost) {
            ghost.remove();
            ghost = null;
        }

        // 2. RESTORE ORIGINAL ELEMENT VISIBILITY
        el.classList.remove('dragging');
        el.style.opacity = '1';

        // 3. REBUILD THE ARRAY FROM THE CURRENT DOM STATE
        // We look at all sections and all cards inside them to determine the new order
        const newCardsArray = [];
        const sections = document.querySelectorAll('.link-section');
        
        sections.forEach(sectionEl => {
            const secIndex = parseInt(sectionEl.dataset.section);
            // Only find real cards, specifically excluding the ghost or any temporary elements
            const cardsInGrid = sectionEl.querySelectorAll('.link-card:not(.empty-card):not(#drag-ghost)');
            
            cardsInGrid.forEach(cEl => {
                const origIdx = parseInt(cEl.dataset.origIndex);
                const data = currentLinksData.cards[origIdx];
                if (data) {
                    const clonedData = { ...data }; // Fresh copy
                    clonedData.section = secIndex;
                    newCardsArray.push(clonedData);
                }
            });
        });

        // 4. DATA INTEGRITY CHECK
        // If the counts match, save. If not, something went wrong—don't overwrite the file!
        if (newCardsArray.length === currentLinksData.cards.length) {
            currentLinksData.cards = newCardsArray;
            await saveLinksData();
            renderLinksBoard(); // Refresh to reset all dataset indices (dataset.origIndex)
        } else {
            console.error("Link Card Count Mismatch! Save aborted to prevent data loss.");
            renderLinksBoard(); // Reset UI to safe state
        }
    };

    el.addEventListener('pointerdown', (e) => {
        // Shield: Don't drag if clicking buttons or inputs
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('button')) {
            return;
        }
        if (e.button !== 0) return;

        isDragging = true;
        
        const rect = el.getBoundingClientRect();
        startX = rect.left;
        startY = rect.top;
        initialMouseX = e.clientX;
        initialMouseY = e.clientY;

        ghost = el.cloneNode(true);
        ghost.id = 'drag-ghost';
        ghost.style.position = 'fixed';
        ghost.style.left = `${startX}px`;
        ghost.style.top = `${startY}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.zIndex = '9999';
        ghost.style.pointerEvents = 'none';
        ghost.style.opacity = '0.8';
        ghost.style.transform = 'rotate(2deg)';
        document.body.appendChild(ghost);

        el.classList.add('dragging'); // This sets opacity: 0 via CSS

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    });
}

window.addEventListener('resize', () => {
    if (document.getElementById('links-page').classList.contains('active')) {
        renderLinksBoard();
    }
});

async function selectRootFolder() {
    const folderPath = await ipcRenderer.invoke('select-folder');
    if (!folderPath) return; // canceled
    
    rootPath = folderPath; // Store the root path
    
    // Use Node.js handle
    const folderName = path.basename(folderPath);
    rootDirHandle = new NodeDirectoryHandle(folderPath, folderName);
    currentDirHandle = rootDirHandle;
    currentPath = [];
    
    // Invalidate notes cache
    allNotesLoaded = false;
    
    await loadSubjects();
    activeSubject = null;
    await loadAllNotes();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let idCounter = 0;
function generateId() {
    return 'id-' + (idCounter++);
}

// IndexedDB helpers
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MindMapDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve({
            db: request.result,
            get: (key) => {
                return new Promise((res, rej) => {
                    const transaction = request.result.transaction(['fileSystem'], 'readonly');
                    const store = transaction.objectStore('fileSystem');
                    const getRequest = store.get(key);
                    getRequest.onsuccess = () => res(getRequest.result);
                    getRequest.onerror = () => rej(getRequest.error);
                });
            },
            put: (value, key) => {
                return new Promise((res, rej) => {
                    const transaction = request.result.transaction(['fileSystem'], 'readwrite');
                    const store = transaction.objectStore('fileSystem');
                    const putRequest = store.put(value, key);
                    putRequest.onsuccess = () => res();
                    putRequest.onerror = () => rej(putRequest.error);
                });
            }
        });
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('fileSystem')) {
                db.createObjectStore('fileSystem');
            }
        };
    });
}



// --- BEFOREUNLOAD WARNING ---
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        const canSaveQuietly = (currentFileHandle && currentDirHandle) || 
                                (ipcRenderer && currentFileName && currentFileName !== 'untitled');
                                
        if (canSaveQuietly) {
            // Instantly push the final save and allow the window to close seamlessly!
            saveToFile();
            return; 
        } else {
            // ONLY show warning if it's a completely new, unnamed file
            if (typeof ipcRenderer !== 'undefined') {
                const choice = ipcRenderer.sendSync('show-close-confirm-dialog');
                if (choice === 1) {
                    e.preventDefault();
                    e.returnValue = false;
                }
            } else {
                const forceClose = confirm("You have an unsaved new file! Are you sure you want to quit?");
                if (!forceClose) {
                    e.preventDefault();
                    e.returnValue = false; 
                }
            }
        }
    }
});

// --- INPUT ---
// Native double-click handler removed: Fabric.js handles text creation/editing now.

canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    lastMouse = { x: e.clientX, y: e.clientY };
    currentMouseWorld = toWorld(e.clientX, e.clientY);

    // 1) PANNING CHECK (Middle button or Space + Left button)
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
        isPanning = true;
        isSelecting = false; 
        canvas.style.cursor = 'grabbing';
        
        if (fabricCanvas) {
            fabricCanvas.skipTargetFind = true;
            fabricCanvas.selection = false; // Disable selection marquee while panning
            if (fabricCanvas.isDrawingMode) {
                prevDrawingMode = true;
                fabricCanvas.isDrawingMode = false;
            }
        }
        requestRender();
        return;
    }

    // 2) TOOL LOGIC (If not panning)
    if (e.button === 0) {
        if (editingTextBox !== null) finishEditingTextBox();

        if (activeTool === 'select') {
            // CRITICAL FIX: Explicitly reset Fabric selection state
            if (fabricCanvas) {
                fabricCanvas.skipTargetFind = false;
                fabricCanvas.selection = true; // Allow Fabric's own selection
                fabricCanvas.discardActiveObject();
                // This forces Fabric to process the event as a fresh click
                fabricCanvas.requestRenderAll();
            }

            const pos = toWorld(e.clientX, e.clientY);
            const textBoxIdx = getTextBoxAtPoint(pos.x, pos.y);

            if (textBoxIdx !== -1) {
                if (!selectedTextBoxes.has(textBoxIdx)) {
                    selectedTextBoxes.clear();
                    selectedTextBoxes.add(textBoxIdx);
                    selectedStrokes.clear();
                }
                isMoving = true;
                canvas.style.cursor = 'move';
                moveOffset = { x: pos.x, y: pos.y };
                originalPositions = [];
                selectedTextBoxes.forEach(idx => {
                    originalPositions.push({ idx: idx, type: 'textBox', x: textBoxes[idx].x, y: textBoxes[idx].y });
                });
            } else if (selectedStrokes.size > 0 && isPointNearSelectedStrokes(pos.x, pos.y)) {
                isMoving = true;
                canvas.style.cursor = 'move';
                moveOffset = { x: pos.x, y: pos.y };
                originalPositions = [];
                selectedStrokes.forEach(idx => {
                    originalPositions.push({ idx: idx, type: 'stroke', points: strokes[idx].points.map(p => ({...p})) });
                });
            } else {
                // START RECTANGLE SELECT
                selectedStrokes.clear();
                selectedTextBoxes.clear();
                isSelecting = true;
                selectionStart = { x: e.clientX, y: e.clientY };
                selectionEnd = { x: e.clientX, y: e.clientY };
            }
            requestRender();
        } else if (activeTool === 'eraser') {
            isErasing = true;
            const pos = toWorld(e.clientX, e.clientY);
            eraserPath = [{ x: pos.x, y: pos.y }];
            strokesBeforeErase = JSON.parse(JSON.stringify(strokes));
            applyEraserToStrokes();
            requestRender();
        } else {
            isDrawing = true;
            const pos = toWorld(e.clientX, e.clientY);
            currentStroke = { tool: activeTool, points: [{ x: pos.x, y: pos.y }], color: CONFIG.penColor, width: CONFIG.penWidth };
            requestRender();
        }
    }
});

canvas.addEventListener('pointermove', (e) => {
    const curr = { x: e.clientX, y: e.clientY };
    
    // Update current mouse world position for eraser cursor
    currentMouseWorld = toWorld(e.clientX, e.clientY);
    
    // Request render if eraser is active to update cursor position
    if (activeTool === 'eraser' && !isPanning) {
        requestRender();
    }

    if (isPanning) {
        const dx = curr.x - lastMouse.x;
        const dy = curr.y - lastMouse.y;
        camera.x += dx * PAN_FACTOR;
        camera.y += dy * PAN_FACTOR;
        lastMouse = curr;
        
        // Update text editor position if editing
        if (editingTextBox !== null) {
            updateTextEditorPosition();
        }
        
        requestRender();
        return;
    }
    
    if (isSelecting) {
        selectionEnd = { x: e.clientX, y: e.clientY };
        requestRender();
        return;
    }
    
    if (isResizingTextBox) {
        const pos = toWorld(e.clientX, e.clientY);
        const dx = pos.x - resizeStartMouse.x;
        const dy = pos.y - resizeStartMouse.y;
        
        selectedTextBoxes.forEach(idx => {
            const textBox = textBoxes[idx];
            const newWidth = resizeStartSize.width + dx;
            const newHeight = resizeStartSize.height + dy;
            
            // Calculate minimum dimensions based on text content
            const minSize = calculateMinTextBoxSize(textBox, newWidth);
            
            textBox.width = Math.max(minSize.minWidth, newWidth);
            textBox.height = Math.max(minSize.minHeight, newHeight);
            textBox.manuallyResized = true;
        });
        
        // Update textarea dimensions if currently editing
        if (editingTextBox !== null && selectedTextBoxes.has(editingTextBox)) {
            updateTextEditorPosition();
        }
        
        hasUnsavedChanges = true;
        requestRender();
        return;
    }
    
    if (isMoving) {
        const pos = toWorld(e.clientX, e.clientY);
        const dx = pos.x - moveOffset.x;
        const dy = pos.y - moveOffset.y;
            try { if (fabricCanvas) fabricCanvas.skipTargetFind = false; } catch (e) {}
        
        // Move all selected strokes
        selectedStrokes.forEach(idx => {
            strokes[idx].points.forEach(pt => {
                pt.x += dx;
                pt.y += dy;
            });
        });
        
        // Move all selected text boxes
        selectedTextBoxes.forEach(idx => {
            textBoxes[idx].x += dx;
            textBoxes[idx].y += dy;
        });
        
        // Update text editor position if editing
        if (editingTextBox !== null) {
            updateTextEditorPosition();
        }
        
        moveOffset = pos;
        requestRender();
        return;
    }

    if (isErasing) {
        const pos = toWorld(e.clientX, e.clientY);
        const lastPt = eraserPath[eraserPath.length - 1];
        const dist = Math.hypot(pos.x - lastPt.x, pos.y - lastPt.y);
        
        if (dist > 0.5 / camera.z) {
            eraserPath.push({ x: pos.x, y: pos.y });
            
            // Apply eraser in real-time
            applyEraserToStrokes();
            requestRender();
        }
    }

    if (isDrawing) {
        const pos = toWorld(e.clientX, e.clientY);
        const lastPt = currentStroke.points[currentStroke.points.length - 1];
        const dist = Math.hypot(pos.x - lastPt.x, pos.y - lastPt.y);
        
        if (dist > 0.5 / camera.z) {
            currentStroke.points.push({ x: pos.x, y: pos.y });
            requestRender();
        }
    }
});

const endAction = () => {
    if (isPanning) {
        isPanning = false;
        updateCursor();
    }
    if (isSelecting) {
        isSelecting = false;
        // Select strokes and text boxes within rectangle
        if (selectionStart && selectionEnd) {
            const start = toWorld(selectionStart.x, selectionStart.y);
            const end = toWorld(selectionEnd.x, selectionEnd.y);
            const rect = normalizeRect(start.x, start.y, end.x, end.y);
            
            selectedStrokes.clear();
            strokes.forEach((stroke, idx) => {
                if (strokeIntersectsRect(stroke, rect)) {
                    selectedStrokes.add(idx);
                }
            });
            
            selectedTextBoxes.clear();
            textBoxes.forEach((textBox, idx) => {
                if (textBoxIntersectsRect(textBox, rect)) {
                    selectedTextBoxes.add(idx);
                }
            });
        }
        selectionStart = null;
        selectionEnd = null;
        updateCursor();
    }
    if (isResizingTextBox) {
        isResizingTextBox = false;
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        updateCursor();
    }
    if (isMoving) {
        isMoving = false;
        
        // Create undo entry for the move
        const strokeMoves = [];
        const textBoxMoves = [];
        
        originalPositions.forEach(orig => {
            if (orig.type === 'stroke') {
                strokeMoves.push({
                    idx: orig.idx,
                    original: orig.points,
                    modified: strokes[orig.idx].points.map(p => ({...p}))
                });
            } else if (orig.type === 'textBox') {
                textBoxMoves.push({
                    idx: orig.idx,
                    originalX: orig.x,
                    originalY: orig.y,
                    modifiedX: textBoxes[orig.idx].x,
                    modifiedY: textBoxes[orig.idx].y
                });
            }
        });
        
        if (strokeMoves.length > 0 || textBoxMoves.length > 0) {
            const moveAction = {
                type: 'move',
                moves: strokeMoves,
                textBoxMoves: textBoxMoves
            };
            undoStack.push(moveAction);
            redoStack = [];
        }
        
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        updateCursor();
    }
    if (isErasing) {
        isErasing = false;
        
        // Create undo entry comparing before and after
        if (eraserPath.length > 0 && strokesBeforeErase.length > 0) {
            const deletedSegments = [];
            
            // Build the deletedSegments structure for undo
            for (let i = 0; i < strokesBeforeErase.length; i++) {
                const originalStroke = strokesBeforeErase[i];
                if (originalStroke.tool === 'eraser') continue;
                
                // Find what this stroke became
                const segments = splitStrokeByEraser(originalStroke);
                
                // Check if stroke changed
                const wasModified = segments.length === 0 || 
                    segments.length !== 1 || 
                    segments[0].points.length !== originalStroke.points.length;
                
                if (wasModified) {
                    deletedSegments.push({
                        idx: i,
                        stroke: originalStroke,
                        segments: segments
                    });
                }
            }
            
            if (deletedSegments.length > 0) {
                undoStack.push({ type: 'erase', deletedSegments: deletedSegments });
                redoStack = [];
                hasUnsavedChanges = true;
                updateSaveStatusIndicator();
            }
        }
        
        eraserPath = [];
        strokesBeforeErase = [];
        updateCursor();
    }
    
    if (isDrawing) {
        isDrawing = false;
        if (currentStroke && currentStroke.points.length > 0) {
            strokes.push(currentStroke);
            
            // Add to undo stack
            undoStack.push({ type: 'add', stroke: currentStroke });
            redoStack = [];
            
            currentStroke = null;
            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
        }
    }
    requestRender();
};

canvas.addEventListener('pointerup', endAction);
canvas.addEventListener('pointerleave', endAction);

canvas.addEventListener('pointerenter', (e) => {
    currentMouseWorld = toWorld(e.clientX, e.clientY);
    if (activeTool === 'eraser') {
        requestRender();
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.altKey) {
        const delta = -e.deltaY;
        const zoomFactor = Math.exp(delta * CONFIG.zoomSensitivity);
        const newZoom = Math.min(Math.max(camera.z * zoomFactor, CONFIG.minZoom), CONFIG.maxZoom);
        const mouseBefore = toWorld(e.clientX, e.clientY);
        camera.z = newZoom;
        const mouseAfter = toWorld(e.clientX, e.clientY);
        camera.x += (mouseAfter.x - mouseBefore.x) * camera.z;
        camera.y += (mouseAfter.y - mouseBefore.y) * camera.z;
    } else if (e.ctrlKey) {
        camera.x -= e.deltaY * CONFIG.panSensitivity;
    } else {
        camera.x -= e.deltaX * CONFIG.panSensitivity;
        camera.y -= e.deltaY * CONFIG.panSensitivity;
    }
    
    // Update current mouse world position after camera movement
    currentMouseWorld = toWorld(e.clientX, e.clientY);
    
    // Update text editor position if editing
    if (editingTextBox !== null) {
        updateTextEditorPosition();
    }
    
    requestRender();
}, { passive: false });

// Add keyboard shortcut for glossary edit modal
document.addEventListener('keydown', (e) => {
    const glossaryModal = document.getElementById('glossary-edit-modal');
    if (glossaryModal && glossaryModal.style.display === 'flex') {
        if (e.key === 'Escape') {
            closeGlossaryEditModal();
        } else if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            saveGlossaryEditModal();
        }
    }
});

// --- KEYBOARD ---
window.addEventListener('keydown', async (e) => {
    if (e.repeat) return;

    if (e.key === 'Escape' && aiAdvancedModalEl && aiAdvancedModalEl.classList.contains('show')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeAiAdvancedPreviewModal();
        return;
    }

    // If this window is a detached/note window opened by the main app,
    // suppress global Escape handling to avoid returning to the home screen.
    if (isDetachedWindow && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }
    
    // Keep existing flashcard, glossary, qa, todo handlers
    const flashcardPage = document.getElementById('flashcard-page');
    if (flashcardPage && flashcardPage.classList.contains('active')) {
        const modal = document.getElementById('fc-edit-modal');
        const modalOpen = modal && modal.classList.contains('show');
        if (modalOpen) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeEditModal();
            }
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                saveEditModal();
            }
            return;
        }
        if (isFlashcardFullEditMode) {
            if (e.key === 'Escape') toggleFlashcardEditMode();
            return;
        }
        if (e.key === 'e') { e.preventDefault(); openEditModal(); }
        if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) flipCard(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); navFlashcard(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navFlashcard(-1); }
        if (e.key === 'Escape') closeFlashcard();
        return;
    }
    const glossaryPage = document.getElementById('glossary-page');
    if (glossaryPage && glossaryPage.classList.contains('active')) { if (e.key === 'Escape') closeGlossary(); return; }
    const qaPage = document.getElementById('qa-page');
    if (qaPage && qaPage.classList.contains('active')) { if (e.key === 'Escape') closeQA(); return; }
    const todoPage = document.getElementById('todo-page');
    if (todoPage && todoPage.classList.contains('active')) { if (e.key === 'Escape') closeTodo(); return; }
    const testPage = document.getElementById('test-page');
    if (testPage && testPage.classList.contains('active')) { if (e.key === 'Escape') closeTest(); return; }

    let isEditing = false;
    if (fabricCanvas && typeof fabricCanvas.getActiveObject === 'function') {
        const ao = fabricCanvas.getActiveObject();
        isEditing = !!(ao && ao.isEditing);
    }
    const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable || isEditing;

    if (isTyping) {
        if (e.key === 'Escape') {
            if (fabricCanvas) {
                const activeObj = fabricCanvas.getActiveObject();
                if (activeObj && activeObj.isEditing) {
                    activeObj.exitEditing();
                }
                fabricCanvas.discardActiveObject();
                fabricCanvas.requestRenderAll();
            }
        }
        return;
    }

    if ((e.key === 'p' || e.key === 'P') && hoveredAiPreviewNote) {
        e.preventDefault();
        await openAiAdvancedPreviewModal(hoveredAiPreviewNote);
        return;
    }

    if (e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); toggleFullScreen(); }
    if (e.code === 'Space') {
        isSpacePressed = true;
        // If Fabric drawing is active, remember and disable it so holding Space won't draw
        if (fabricCanvas && fabricCanvas.isDrawingMode) {
            try {
                prevDrawingMode = true;
                fabricCanvas.isDrawingMode = false;
                fabricCanvas.selection = true;
            } catch (err) {}
        }
        if (!isPanning && fabricCanvas) fabricCanvas.defaultCursor = 'grab';
    }

    // Tool shortcuts
    if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) setTool('pen');
    if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey) setTool('select');
    if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) promptInsertTable();

    // Delete
    if (e.key === 'Delete') {
        e.preventDefault();
        if (fabricCanvas) {
            const activeObjects = fabricCanvas.getActiveObjects();
            if (activeObjects.length > 0) {
                fabricCanvas.remove(...activeObjects);
                fabricCanvas.discardActiveObject();
                fabricCanvas.requestRenderAll();
                hasUnsavedChanges = true;
                updateSaveStatusIndicator();
                addToUndoStack();
            }
        }
    }

    // Escape
    if (e.key === 'Escape') {
        fabricCanvas.discardActiveObject();
        fabricCanvas.requestRenderAll();
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            const result = await copyCanvasAsIllustratorSvg();
            if (result.ok) {
                let opened = false;
                if (result.svgPath && shell && typeof shell.openPath === 'function') {
                    try {
                        const openErr = await shell.openPath(result.svgPath);
                        opened = !openErr;
                    } catch (err) {
                        opened = false;
                    }
                }

                if (opened) {
                    alert('SVG copied and exported. Illustrator was opened with the exported file for reliable import.');
                } else if (result.svgPath) {
                    alert(`SVG copied and exported to: ${result.svgPath}\nIf paste fails, open this SVG in Illustrator.`);
                } else {
                    alert('Copied canvas as SVG. In Illustrator press Ctrl+V.');
                }
            } else {
                alert('SVG copy failed. Please try again and ensure the canvas has content.');
            }
        }
        else if (e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); }
        else if (e.key.toLowerCase() === 'v') {
            // Only intercept paste when there's an internal Fabric.js clipboard.
            // Otherwise allow the browser to fire the native 'paste' event (for images/text).
            if (typeof clipboard !== 'undefined' && clipboard) {
                e.preventDefault();
                triggerExternalPaste();
            }
        }
        else if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) performRedo(); else performUndo(); }
        else if (e.key.toLowerCase() === 'y') { e.preventDefault(); performRedo(); }
        else if (e.key.toLowerCase() === 's') { e.preventDefault(); saveToFile(); }
        else if (e.key.toLowerCase() === 'r') { e.preventDefault(); await refreshCurrentNotesView(); }
        else if (e.key.toLowerCase() === 'h') { e.preventDefault(); if (document.getElementById('flashcard-page').classList.contains('active')) { closeFlashcard(); } else if (document.getElementById('glossary-page').classList.contains('active')) { closeGlossary(); } else { await showHomeScreen(); } }
    }
});

// Capture-phase handlers to ensure Space state is updated before pointer events
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        // Set flag early (capture phase) to avoid race with pointerdown
        isSpacePressed = true;
        if (fabricCanvas && fabricCanvas.isDrawingMode) {
            try { prevDrawingMode = true; fabricCanvas.isDrawingMode = false; fabricCanvas.selection = true; } catch (err) {}
        }
        if (!isPanning && fabricCanvas) fabricCanvas.defaultCursor = 'grab';
    }
}, true);

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        isSpacePressed = false;
        if (fabricCanvas) {
            // Restore selection capability immediately
            fabricCanvas.skipTargetFind = false;
            if (activeTool === 'select') {
                fabricCanvas.selection = true;
            }
            // Restore drawing mode if we were in it
            if (prevDrawingMode) {
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.selection = false;
            }
            prevDrawingMode = false;
            updateCursor();
            fabricCanvas.requestRenderAll();
        }
    }
}, true);

// Add paste listener
window.addEventListener('paste', handleExternalPaste);
window.addEventListener('dragover', handleCanvasImageDragOver);
window.addEventListener('drop', handleCanvasImageDrop);


// --- SELECTION HELPER FUNCTIONS ---
function normalizeRect(x1, y1, x2, y2) {
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1)
    };
}

function strokeIntersectsRect(stroke, rect) {
    for (const pt of stroke.points) {
        if (pt.x >= rect.x && pt.x <= rect.x + rect.width &&
            pt.y >= rect.y && pt.y <= rect.y + rect.height) {
            return true;
        }
    }
    return false;
}

function textBoxIntersectsRect(textBox, rect) {
    // Check if two rectangles intersect
    const box = {
        x: textBox.x,
        y: textBox.y,
        width: textBox.width,
        height: textBox.height
    };
    
    // Rectangles don't intersect if one is completely to the left/right/above/below the other
    if (box.x + box.width < rect.x || rect.x + rect.width < box.x ||
        box.y + box.height < rect.y || rect.y + rect.height < box.y) {
        return false;
    }
    
    return true;
}

function isPointNearSelectedStrokes(x, y) {
    const threshold = 20 / camera.z;
    for (const idx of selectedStrokes) {
        const stroke = strokes[idx];
        for (const pt of stroke.points) {
            const dist = Math.hypot(pt.x - x, pt.y - y);
            if (dist < threshold) {
                return true;
            }
        }
    }
    return false;
}

function applyEraserToStrokes() {
    if (eraserPath.length === 0 || strokesBeforeErase.length === 0) return;
    
    // Process original strokes and replace with split versions
    const newStrokes = [];
    
    for (let i = 0; i < strokesBeforeErase.length; i++) {
        const originalStroke = strokesBeforeErase[i];
        if (originalStroke.tool === 'eraser') continue;
        
        // Split stroke based on current eraser path
        const segments = splitStrokeByEraser(originalStroke);
        
        // Add all resulting segments
        segments.forEach(seg => newStrokes.push(seg));
    }
    
    // Update strokes array
    strokes = newStrokes;
}

function splitStrokeByEraser(stroke) {
    if (eraserPath.length === 0) return [stroke];
    
    const eraserRadius = CONFIG.eraserWidth / (2 * camera.z);
    const points = stroke.points;
    
    if (points.length === 0) return [];
    if (points.length === 1) {
        // Single point stroke - check if it should be deleted
        const dist = getDistanceToEraserPath(points[0], eraserRadius);
        return dist < eraserRadius ? [] : [stroke];
    }
    
    // Subdivide stroke into fine samples for accurate erasing
    const sampledPoints = [];
    const sampleDistance = Math.min(5 / camera.z, eraserRadius / 3); // Fine sampling
    
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const steps = Math.max(1, Math.ceil(segLen / sampleDistance));
        
        for (let j = 0; j < steps; j++) {
            const t = j / steps;
            sampledPoints.push({
                x: p1.x + (p2.x - p1.x) * t,
                y: p1.y + (p2.y - p1.y) * t,
                erased: false
            });
        }
    }
    // Add last point
    sampledPoints.push({
        ...points[points.length - 1],
        erased: false
    });
    
    // Mark points that are inside the eraser
    for (let i = 0; i < sampledPoints.length; i++) {
        const dist = getDistanceToEraserPath(sampledPoints[i], eraserRadius);
        sampledPoints[i].erased = dist < eraserRadius;
    }
    
    // Find continuous non-erased segments
    const segments = [];
    let currentSegment = [];
    
    for (let i = 0; i < sampledPoints.length; i++) {
        if (!sampledPoints[i].erased) {
            currentSegment.push({
                x: sampledPoints[i].x,
                y: sampledPoints[i].y
            });
        } else {
            // Hit erased section
            if (currentSegment.length > 0) {
                // Try to find precise boundary point
                if (i > 0 && !sampledPoints[i - 1].erased) {
                    // Refine the exit point
                    const refined = refineBoundary(
                        sampledPoints[i - 1],
                        sampledPoints[i],
                        eraserRadius,
                        false // entering eraser
                    );
                    if (refined) {
                        currentSegment[currentSegment.length - 1] = refined;
                    }
                }
                
                segments.push({
                    tool: stroke.tool,
                    color: stroke.color,
                    width: stroke.width,
                    points: currentSegment
                });
                currentSegment = [];
            }
        }
    }
    
    // Add final segment
    if (currentSegment.length > 0) {
        segments.push({
            tool: stroke.tool,
            color: stroke.color,
            width: stroke.width,
            points: currentSegment
        });
    }
    
    // Filter out segments that are too small (artifacts)
    return segments.filter(seg => seg.points.length >= 2 || 
        (seg.points.length === 1 && segments.length === 1));
}

function getDistanceToEraserPath(point, eraserRadius) {
    if (eraserPath.length === 0) return Infinity;
    if (eraserPath.length === 1) {
        return Math.hypot(point.x - eraserPath[0].x, point.y - eraserPath[0].y);
    }
    
    let minDist = Infinity;
    
    // Check distance to each eraser segment
    for (let i = 0; i < eraserPath.length - 1; i++) {
        const dist = pointToSegmentDistance(
            point,
            eraserPath[i],
            eraserPath[i + 1]
        );
        minDist = Math.min(minDist, dist);
    }
    
    return minDist;
}

function pointToSegmentDistance(p, a, b) {
    // Calculate distance from point p to line segment ab
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0) {
        // a and b are the same point
        return Math.hypot(p.x - a.x, p.y - a.y);
    }
    
    // Project point onto line segment
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]
    
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    
    return Math.hypot(p.x - projX, p.y - projY);
}

function refineBoundary(outsidePoint, insidePoint, eraserRadius, entering) {
    // Binary search for exact boundary
    let p1 = { ...outsidePoint };
    let p2 = { ...insidePoint };
    
    for (let i = 0; i < 8; i++) { // 8 iterations gives good precision
        const mid = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
        
        const dist = getDistanceToEraserPath(mid, eraserRadius);
        const isInside = dist < eraserRadius;
        
        if ((!entering && isInside) || (entering && !isInside)) {
            p2 = mid;
        } else {
            p1 = mid;
        }
    }
    
    return {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
    };
}

function deleteSelectedStrokes() {
    if (selectedStrokes.size === 0 && selectedTextBoxes.size === 0) return;
    
    // Store deleted items for undo
    const deleted = [];
    
    selectedStrokes.forEach(idx => {
        deleted.push({
            idx: idx,
            type: 'stroke',
            stroke: JSON.parse(JSON.stringify(strokes[idx])) // Deep clone
        });
    });
    
    selectedTextBoxes.forEach(idx => {
        deleted.push({
            idx: idx,
            type: 'textBox',
            textBox: JSON.parse(JSON.stringify(textBoxes[idx])) // Deep clone
        });
    });
    
    // Sort stroke indices in descending order to avoid index shifting issues
    const strokeIndices = Array.from(selectedStrokes).sort((a, b) => b - a);
    strokeIndices.forEach(idx => {
        strokes.splice(idx, 1);
    });
    
    // Sort text box indices in descending order
    const textBoxIndices = Array.from(selectedTextBoxes).sort((a, b) => b - a);
    textBoxIndices.forEach(idx => {
        textBoxes.splice(idx, 1);
    });
    
    // Add to undo stack
    undoStack.push({ type: 'delete', deleted: deleted });
    redoStack = [];
    
    selectedStrokes.clear();
    selectedTextBoxes.clear();
    hasUnsavedChanges = true;
    updateSaveStatusIndicator();
    requestRender();
}

function updateCursor() {
    if (fabricCanvas) {
        if (isSpacePressed) fabricCanvas.defaultCursor = 'grab';
        else if (activeTool === 'pen') fabricCanvas.defaultCursor = 'crosshair';
        else if (activeTool === 'select') fabricCanvas.defaultCursor = 'default';
        else fabricCanvas.defaultCursor = 'default';

        fabricCanvas.requestRenderAll();
    } else {
        if (isSpacePressed) {
            canvas.style.cursor = 'grab';
        } else if (activeTool === 'pen') {
            canvas.style.cursor = 'crosshair';
        } else if (activeTool === 'select') {
            canvas.style.cursor = 'default';
        }
        requestRender();
    }
}

// --- UI ---
const btnPen = document.getElementById('btn-pen');
const btnSelect = document.getElementById('btn-select');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnNew = document.getElementById('btn-new');
const btnSave = document.getElementById('btn-save');
const btnFullscreen = document.getElementById('btn-fullscreen');

function setTool(tool) {
    activeTool = tool;
    
    // Update button states
    document.getElementById('btn-pen').classList.remove('active');
    document.getElementById('btn-select').classList.remove('active');
    
    // If Fabric isn't initialized yet, only update UI classes
    if (!fabricCanvas) {
        if (tool === 'pen') document.getElementById('btn-pen').classList.add('active');
        if (tool === 'select') document.getElementById('btn-select').classList.add('active');
        return;
    }

    if (tool === 'pen') {
        document.getElementById('btn-pen').classList.add('active');
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = false;
        fabricCanvas.defaultCursor = 'crosshair';
    } else if (tool === 'select') {
        document.getElementById('btn-select').classList.add('active');
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = true;
        fabricCanvas.defaultCursor = 'default';
    }
    
    updateCursor();
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

btnPen.onclick = () => setTool('pen');
btnSelect.onclick = () => setTool('select');
btnUndo.onclick = performUndo;
btnRedo.onclick = performRedo;
if (btnNew) btnNew.onclick = createNewMindmap;
if (btnSave) btnSave.onclick = saveToFile;
if (btnFullscreen) btnFullscreen.onclick = toggleFullScreen;

// Shortcuts dialog
const helpBtn = document.getElementById('help-btn');
const shortcutsDialog = document.getElementById('shortcuts-dialog');
const closeShortcuts = document.getElementById('close-shortcuts');

helpBtn.onclick = () => {
    shortcutsDialog.classList.add('open');
};

closeShortcuts.onclick = () => {
    shortcutsDialog.classList.remove('open');
};

// Close dialog when clicking outside
shortcutsDialog.onclick = (e) => {
    if (e.target === shortcutsDialog) {
        shortcutsDialog.classList.remove('open');
    }
};

// Close dialog with Escape key
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && shortcutsDialog.classList.contains('open')) {
        shortcutsDialog.classList.remove('open');
        e.stopPropagation();
    }
}, true);

// Initialize home screen only for the main app window.
if (!isDetachedWindow) {
    initHomeScreen();
}

// Initially hide home button and save status (we start on home screen)
document.getElementById('btn-save-status').classList.add('hidden');

// Initially hide toolbar and help button (only show on canvas)
document.getElementById('toolbar').classList.add('hidden');
document.getElementById('help-btn').classList.add('hidden');

// Initialize Notion-style popup search and replace the sidebar text input with a trigger button.
ensureGlobalSearchUi();

window.addEventListener('keydown', async (e) => {
    const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    const isHomeVisible = !document.getElementById('home-screen').classList.contains('hidden');

    const key = e.key.toLowerCase();
    const isSearchShortcut = (e.ctrlKey || e.metaKey) && (key === 'k' || key === 'f');

    if (isSearchShortcut && isHomeVisible) {
        e.preventDefault();
        await openGlobalSearchModal();
        return;
    }

    if (e.key === 'Escape' && isGlobalSearchOpen) {
        e.preventDefault();
        closeGlobalSearchModal();
        return;
    }

    // If the popup is open, stop global shortcuts from running under it.
    if (isGlobalSearchOpen && !isTyping) {
        e.stopPropagation();
    }
}, true);

// Initialize custom tooltips
initCustomTooltips();

function initCustomTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    let currentTooltip = null;
    let hideTimeout = null;
    
    // Helper to remove any existing tooltips
    function removeAllTooltips() {
        const existingTooltips = document.querySelectorAll('.custom-tooltip');
        existingTooltips.forEach(tooltip => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        });
        currentTooltip = null;
    }
    
    tooltipElements.forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            clearTimeout(hideTimeout);
            
            // Remove any existing tooltips immediately
            removeAllTooltips();
            
            const action = element.getAttribute('data-tooltip');
            const shortcut = element.getAttribute('data-shortcut');
            
            if (!action) return;
            
            // Create tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'custom-tooltip';
            
            const actionSpan = document.createElement('span');
            actionSpan.textContent = action;
            tooltip.appendChild(actionSpan);
            
            if (shortcut) {
                const shortcutSpan = document.createElement('span');
                shortcutSpan.className = 'tooltip-shortcut';
                shortcutSpan.textContent = shortcut;
                tooltip.appendChild(shortcutSpan);
            }
            
            document.body.appendChild(tooltip);
            
            // Position the tooltip
            const rect = element.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            
            // Position below for buttons
            tooltip.classList.add('bottom');
            tooltip.style.left = (rect.left + rect.width / 2 - tooltipRect.width / 2) + 'px';
            tooltip.style.top = (rect.bottom + 12) + 'px';
            
            // Show tooltip with delay
            setTimeout(() => {
                tooltip.classList.add('show');
            }, 150);
            
            currentTooltip = tooltip;
        });
        
        element.addEventListener('mouseleave', () => {
            if (currentTooltip) {
                const tooltip = currentTooltip;
                tooltip.classList.remove('show');
                hideTimeout = setTimeout(() => {
                    removeAllTooltips();
                }, 150);
            }
        });
    });
}

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    @keyframes slideDownY {
        from { transform: translateY(-8px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(0); opacity: 1; }
        to { transform: translateX(-50%) translateY(-20px); opacity: 0; }
    }
    #drop-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(33, 150, 243, 0.1);
        border: 4px dashed #2196F3;
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        pointer-events: none;
    }
    #drop-overlay.active {
        display: flex;
    }
    #drop-message {
        background: rgba(33, 150, 243, 0.95);
        color: white;
        padding: 30px 50px;
        border-radius: 12px;
        font-size: 18px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    #ai-advanced-preview-modal {
        position: fixed;
        inset: 0;
        z-index: 12000;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.88);
    }
    #ai-advanced-preview-modal.show {
        display: flex;
    }
    #ai-advanced-preview-modal .ai-advanced-preview-panel {
        width: min(94vw, 1400px);
        height: min(90vh, 900px);
        display: flex;
        flex-direction: column;
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 12px;
        overflow: hidden;
        background: #0b0b0b;
        box-shadow: 0 20px 55px rgba(0, 0, 0, 0.7);
    }
    #ai-advanced-preview-modal .ai-advanced-preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.15);
        background: #121212;
    }
    #ai-advanced-preview-modal .ai-advanced-preview-title {
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    #ai-advanced-preview-modal .ai-advanced-preview-status {
        color: #bbbbbb;
        font-size: 12px;
        white-space: nowrap;
    }
    #ai-advanced-preview-modal .ai-advanced-preview-viewport {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #000;
        cursor: grab;
        touch-action: none;
    }
    #ai-advanced-preview-modal .ai-advanced-preview-viewport.is-panning {
        cursor: grabbing;
    }
    #ai-advanced-preview-modal .ai-advanced-preview-image {
        position: relative;
        left: auto;
        top: auto;
        max-width: 100%;
        max-height: 100%;
        transform: translate(0px, 0px) scale(1);
        transform-origin: center center;
        user-select: none;
        pointer-events: none;
    }
`;
document.head.appendChild(style);

// Create drop overlay
const dropOverlay = document.createElement('div');
dropOverlay.id = 'drop-overlay';
dropOverlay.innerHTML = '<div id="drop-message">Drop JSON file to open</div>';
// Do not append the drop overlay to the document — keep the element for safe references
// (overlay intentionally disabled so it won't appear in canvas or home views)

// Create flashcard page
const flashcardPage = document.createElement('div');
flashcardPage.id = 'flashcard-page';
flashcardPage.innerHTML = `
    <button class="fc-mode-toggle" onclick="toggleFlashcardEditMode()">Edit All Cards</button>
    
    <div class="scene">
        <div class="card">
            <div class="card__face card__face--front"></div>
            <div class="card__face card__face--back"></div>
        </div>
    </div>

    <div class="instructions">Space or Click to flip • Press E to edit</div>

    <div id="fc-full-edit-container">
        <div class="fc-full-edit-actions">
            <button class="fc-btn add-btn" onclick="addNewCardInFullEdit()">+ Add New Card</button>
        </div>
        <div id="fc-full-edit-list"></div>
    </div>

    <div id="fc-edit-modal">
        <div class="fc-modal-content">
            <div class="fc-modal-header">
                <div class="fc-modal-title">Edit Card</div>
                <button class="fc-modal-close" onclick="closeEditModal()">×</button>
            </div>
            <div class="fc-edit-field">
                <label>Front (Question)</label>
                <textarea class="fc-edit-textarea" id="fc-modal-front" placeholder="Type question here (Markdown supported)..."></textarea>
            </div>
            <div class="fc-edit-field">
                <label>Back (Answer)</label>
                <textarea class="fc-edit-textarea" id="fc-modal-back" placeholder="Type answer here (Markdown supported)..."></textarea>
            </div>
            <div class="fc-modal-actions">
                <button class="fc-btn" onclick="closeEditModal()">Cancel</button>
                <button class="fc-btn" onclick="saveEditModal()" style="border-color:#8af; color:#8af;">Save (Ctrl+Enter)</button>
            </div>
        </div>
    </div>
`;
document.body.appendChild(flashcardPage);

// Create glossary page
const glossaryPage = document.createElement('div');
glossaryPage.id = 'glossary-page';
glossaryPage.innerHTML = `
    <div class="glossary-container">
        <div class="glossary-header">
            <h1 id="glossary-title">Glossary</h1>
        </div>
        
        <div class="glossary-add-section">
            <div class="glossary-input-group">
                <input type="text" class="glossary-input" id="glossary-term-input" placeholder="Term">
            </div>
            <textarea class="glossary-textarea" id="glossary-def-input" placeholder="Definition (Markdown supported)"></textarea>
            <button class="glossary-add-btn" onclick="addGlossaryEntry()">Add Entry</button>
        </div>
        
        <div class="glossary-search">
            <input type="text" id="glossary-search-input" placeholder="Search glossary..." oninput="filterGlossary()">
        </div>

        <div id="glossary-alpha-rail" aria-label="Glossary alphabet shortcuts"></div>
        
        <div class="glossary-list" id="glossary-list"></div>
    </div>
    
    <!-- Glossary Edit Modal -->
    <div id="glossary-edit-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;align-items:center;justify-content:center;">
        <div class="fc-modal-content">
            <div class="fc-modal-header">
                <div class="fc-modal-title">Edit Glossary Entry</div>
                <button class="fc-modal-close" onclick="closeGlossaryEditModal()">×</button>
            </div>
            <div class="fc-edit-field">
                <label>Term</label>
                <input type="text" id="glossary-modal-term" class="glossary-input" style="width:100%;">
            </div>
            <div class="fc-edit-field">
                <label>Definition</label>
                <textarea id="glossary-modal-def" class="fc-edit-textarea" rows="8"></textarea>
            </div>
            <div class="fc-modal-actions">
                <button class="fc-btn" onclick="closeGlossaryEditModal()">Cancel</button>
                <button class="fc-btn" onclick="saveGlossaryEditModal()" style="border-color:#8f8; color:#8f8;">Save (Ctrl+Enter)</button>
            </div>
        </div>
    </div>
`;
document.body.appendChild(glossaryPage);

// Create Q/A page
const qaPage = document.createElement('div');
qaPage.id = 'qa-page';
qaPage.innerHTML = `
    <div class="qa-container">
        <div class="qa-header">
            <h1 id="qa-title">Q/A</h1>
        </div>
        
        <div class="qa-add-section">
            <div class="qa-input-group">
                <input type="text" class="qa-input" id="qa-question-input" placeholder="Question">
            </div>
            <textarea class="qa-textarea" id="qa-answer-input" placeholder="Answer (Markdown supported)"></textarea>
            <button class="qa-add-btn" onclick="addQAEntry()">Add Entry</button>
        </div>
        
        <div class="qa-search">
            <input type="text" id="qa-search-input" placeholder="Search Q/A..." oninput="filterQA()">
        </div>
        
        <div class="qa-list" id="qa-list"></div>
    </div>
    
    <!-- Q/A Edit Modal -->
    <div id="qa-edit-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;align-items:center;justify-content:center;">
        <div class="fc-modal-content">
            <div class="fc-modal-header">
                <div class="fc-modal-title">Edit Q/A Entry</div>
                <button class="fc-modal-close" onclick="closeQAEditModal()">×</button>
            </div>
            <div class="fc-edit-field">
                <label>Question</label>
                <input type="text" id="qa-modal-question" class="qa-input" style="width:100%;">
            </div>
            <div class="fc-edit-field">
                <label>Answer</label>
                <textarea id="qa-modal-answer" class="fc-edit-textarea" rows="8"></textarea>
            </div>
            <div class="fc-modal-actions">
                <button class="fc-btn" onclick="closeQAEditModal()">Cancel</button>
                <button class="fc-btn" onclick="saveQAEditModal()" style="border-color:#8f8; color:#8f8;">Save (Ctrl+Enter)</button>
            </div>
        </div>
    </div>
`;
document.body.appendChild(qaPage);

// Create To Do List page
const todoPage = document.createElement('div');
todoPage.id = 'todo-page';
todoPage.innerHTML = `
    <div class="todo-container">
        <div class="todo-header">
            <h1 id="todo-title">To Do List</h1>
        </div>
        
        <div class="todo-add-section">
            <input type="text" class="todo-input" id="todo-item-input" placeholder="Add a new task...">
            <button class="todo-add-btn" onclick="addTodoItem()">Add Task</button>
        </div>
        
        <div class="todo-list" id="todo-list"></div>
    </div>
`;
document.body.appendChild(todoPage);

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }


// Set default tool to select
setTool('select');

// For note windows, hide home screen
if (window.location.search.includes('note')) {
    document.getElementById('home-screen').classList.add('hidden');
}
