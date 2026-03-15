// --- SMART PDF IMPORT LOGIC (Excalidraw Style) ---
let pdfModalInitialized = false;
let currentPdfMaxPages = 0; // Track max pages globally for the active modal

// Parses string like "1,3-5,7" into a sorted array of unique integers: [1,3,4,5,7]
function parsePageRange(rangeStr, maxPages) {
    if (!rangeStr || rangeStr.trim() === '') {
        return Array.from({length: maxPages}, (_, i) => i + 1);
    }
    
    const pages = new Set();
    const parts = rangeStr.split(',');
    
    for (let part of parts) {
        part = part.trim();
        if (part === '') continue;
        
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-');
            const start = parseInt(startStr);
            const end = parseInt(endStr);
            
            if (!isNaN(start) && !isNaN(end)) {
                const s = Math.max(1, Math.min(start, end));
                const e = Math.min(maxPages, Math.max(start, end));
                for (let i = s; i <= e; i++) {
                    pages.add(i);
                }
            }
        } else {
            const p = parseInt(part);
            if (!isNaN(p) && p >= 1 && p <= maxPages) {
                pages.add(p);
            }
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
}

function initPdfModalListeners() {
    if (pdfModalInitialized) return;
    
    const dirSelect = document.getElementById('pdf-direction-input');
    const gridLabel = document.getElementById('pdf-grid-label');
    const gridInput = document.getElementById('pdf-grid-input');
    const gridVal = document.getElementById('pdf-grid-val');
    const gapInput = document.getElementById('pdf-gap-input');
    const gapVal = document.getElementById('pdf-gap-val');
    const scaleInput = document.getElementById('pdf-scale-input');
    const scaleVal = document.getElementById('pdf-scale-val');
    
    const fileInput = document.getElementById('pdf-file-input');
    const pagesInput = document.getElementById('pdf-pages-input');
    const totalPagesMsg = document.getElementById('pdf-total-pages-msg');
    const importingCountMsg = document.getElementById('pdf-importing-count-msg');
    const importingCount = document.getElementById('pdf-importing-count');

    // Dynamically toggle label based on direction
    dirSelect.addEventListener('change', (e) => {
        gridLabel.textContent = e.target.value === 'lr' ? 'Number of rows' : 'Number of columns';
    });
    
    // Initial setup for the label
    gridLabel.textContent = dirSelect.value === 'lr' ? 'Number of rows' : 'Number of columns';
    
    // Live update slider values
    gridInput.addEventListener('input', (e) => gridVal.textContent = e.target.value);
    gapInput.addEventListener('input', (e) => gapVal.textContent = e.target.value);
    scaleInput.addEventListener('input', (e) => scaleVal.textContent = e.target.value + 'x');

    // Automatically detect total pages when a file is selected
    fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            try {
                const file = e.target.files[0];
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                currentPdfMaxPages = pdf.numPages;
                
                totalPagesMsg.innerHTML = `There are <strong style="color: #fff;">${currentPdfMaxPages}</strong> pages in the selected document.`;
                
                pagesInput.value = `1-${currentPdfMaxPages}`;
                
                importingCount.textContent = currentPdfMaxPages;
                importingCountMsg.style.display = 'block';
            } catch (err) {
                currentPdfMaxPages = 0;
                pagesInput.value = '';
                pagesInput.placeholder = 'All';
                totalPagesMsg.innerHTML = 'Please select a valid PDF file.';
                importingCountMsg.style.display = 'none';
            }
        } else {
            currentPdfMaxPages = 0;
            pagesInput.value = '';
            totalPagesMsg.innerHTML = 'Please select a PDF file.';
            importingCountMsg.style.display = 'none';
        }
    });

    // Update importing count dynamically as user types
    pagesInput.addEventListener('input', (e) => {
        if (currentPdfMaxPages > 0) {
            const pagesToImport = parsePageRange(e.target.value, currentPdfMaxPages);
            importingCount.textContent = pagesToImport.length;
        }
    });
    
    pdfModalInitialized = true;
}

function promptInsertPdf() {
    if (!fabricCanvas) return;
    setTool('select'); 
    initPdfModalListeners(); 
    
    const modal = document.getElementById('insert-pdf-modal');
    if (modal) modal.style.display = 'flex';
    
    // Reset UI states
    document.getElementById('pdf-import-progress').style.display = 'none';
    document.getElementById('pdf-total-pages-msg').innerHTML = 'Please select a PDF file.';
    document.getElementById('pdf-importing-count-msg').style.display = 'none';
    document.getElementById('pdf-file-input').value = '';
    document.getElementById('pdf-pages-input').value = '';
    document.getElementById('pdf-import-confirm-btn').disabled = false;
    document.getElementById('pdf-import-confirm-btn').style.opacity = '1';
    currentPdfMaxPages = 0;
}

function hideInsertPdfModal() {
    const modal = document.getElementById('insert-pdf-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmInsertPdf() {
    const fileInput = document.getElementById('pdf-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select a PDF file first.');
        return;
    }
    
    // Fetch User Settings
    const file = fileInput.files[0];
    const isLocked = document.getElementById('pdf-lock-input').checked;
    const direction = document.getElementById('pdf-direction-input').value; // 'lr' or 'tb'
    const gridMax = parseInt(document.getElementById('pdf-grid-input').value) || 1; 
    const gap = parseInt(document.getElementById('pdf-gap-input').value) || 20;
    const scaleMult = parseFloat(document.getElementById('pdf-scale-input').value) || 0.5;
    const pagesString = document.getElementById('pdf-pages-input').value;
    
    const progressEl = document.getElementById('pdf-import-progress');
    const confirmBtn = document.getElementById('pdf-import-confirm-btn');
    const originalBtnText = confirmBtn.innerHTML; 
    
    progressEl.style.display = 'block';
    
    // Button Spinner UI Update
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.8';
    confirmBtn.style.display = 'inline-flex';
    confirmBtn.style.alignItems = 'center';
    confirmBtn.style.justifyContent = 'center';
    confirmBtn.innerHTML = `<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-color: rgba(255,255,255,0.3); border-top-color: #fff; margin: 0 8px 0 0;"></div> Importing...`;
    
    try {
        progressEl.textContent = 'Loading PDF engine...';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        
        // Parse target pages based on user input
        const pagesToImport = parsePageRange(pagesString, pdf.numPages);
        
        if (pagesToImport.length === 0) {
            alert("No valid pages selected to import.");
            throw new Error("Empty page selection");
        }
        
        const vpt = fabricCanvas.viewportTransform;
        const startX = (fabricCanvas.width / 2 - vpt[4]) / vpt[0];
        const startY = (fabricCanvas.height / 2 - vpt[5]) / vpt[3];
        
        let loadedImages = [];
        
        // 1. Process specifically selected pages into Fabric Images
        for (let i = 0; i < pagesToImport.length; i++) {
            const pageNum = pagesToImport[i];
            progressEl.textContent = `Rendering page ${pageNum} (${i+1} of ${pagesToImport.length})...`;
            
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 }); 
            
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            const dataUrl = tempCanvas.toDataURL('image/png');
            
            const img = await new Promise((resolve) => {
                fabric.Image.fromURL(dataUrl, (fabricImg) => {
                    fabricImg.scale(scaleMult); 
                    fabricImg.set({
                        borderColor: '#a882ff',
                        cornerColor: '#a882ff',
                        transparentCorners: false,
                        lockMovementX: isLocked,
                        lockMovementY: isLocked,
                        lockRotation: isLocked,
                        lockScalingX: isLocked,
                        lockScalingY: isLocked,
                        hasControls: !isLocked,
                        // Lock properties ensure the item cannot be moved or clicked if locked!
                        selectable: !isLocked, 
                        evented: !isLocked
                    });
                    resolve(fabricImg);
                });
            });
            
            loadedImages.push(img);
        }
        
        progressEl.textContent = 'Arranging on canvas...';
        
        // --- 2. INTELLIGENT GRID MATH ---
        const totalImported = loadedImages.length;
        
        for (let i = 0; i < totalImported; i++) {
            const img = loadedImages[i];
            let colIdx, rowIdx;

            if (direction === 'lr') { 
                // Left -> Right filling: gridMax acts as the max number of ROWS
                const actualRows = Math.min(gridMax, totalImported);
                const actualCols = Math.ceil(totalImported / actualRows);
                colIdx = i % actualCols;
                rowIdx = Math.floor(i / actualCols);
            } else { 
                // Top -> Down filling: gridMax acts as the max number of COLUMNS
                const actualCols = Math.min(gridMax, totalImported);
                const actualRows = Math.ceil(totalImported / actualCols);
                rowIdx = i % actualRows;
                colIdx = Math.floor(i / actualRows);
            }
            
            const stepX = loadedImages[0].getScaledWidth() + gap;
            const stepY = loadedImages[0].getScaledHeight() + gap;

            img.set({
                left: startX + (colIdx * stepX),
                top: startY + (rowIdx * stepY)
            });
            
            fabricCanvas.add(img);
            fabricCanvas.sendToBack(img); 
        }
        
        if (!isLocked && loadedImages.length > 1) {
            const sel = new fabric.ActiveSelection(loadedImages, { canvas: fabricCanvas });
            fabricCanvas.setActiveObject(sel);
        } else if (!isLocked && loadedImages.length === 1) {
            fabricCanvas.setActiveObject(loadedImages[0]);
        }
        
        fabricCanvas.requestRenderAll();
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        addToUndoStack();
        
        hideInsertPdfModal();
        
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.innerHTML = originalBtnText;

    } catch (err) {
        if (err.message !== "Empty page selection") {
            console.error("PDF Import Error:", err);
            alert("Failed to import PDF. Is the file corrupted or protected?");
        }
        progressEl.textContent = 'Import failed.';
        
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.innerHTML = originalBtnText;
    }
}
// --- IMAGE CROP LOGIC ---
let targetImageToCrop = null;
let currentCropRect = null;
let cropOriginalAngle = 0;
let cropOriginalLocked = false; 

function startCrop() {
    const menu = document.getElementById('canvas-context-menu');
    if (menu) menu.style.display = 'none';
    if (!targetImageToCrop || !fabricCanvas) return;

    // Save original states
    cropOriginalAngle = targetImageToCrop.angle || 0;
    cropOriginalLocked = targetImageToCrop.evented === false; 

    // Briefly reset rotation to keep the crop bounding box math axis-aligned
    targetImageToCrop.set('angle', 0);
    targetImageToCrop.setCoords();

    // Create the crop overlay
    currentCropRect = new fabric.Rect({
        left: targetImageToCrop.left,
        top: targetImageToCrop.top,
        width: targetImageToCrop.width * targetImageToCrop.scaleX,
        height: targetImageToCrop.height * targetImageToCrop.scaleY,
        fill: 'rgba(0, 0, 0, 0.4)',
        stroke: '#2196F3',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        cornerColor: '#2196F3',
        cornerStyle: 'circle',
        transparentCorners: false,
        hasRotatingPoint: false,
        originX: 'left',
        originY: 'top',
        lockRotation: true
    });

    // Lock the image beneath so it isn't accidentally dragged
    targetImageToCrop.set({ selectable: false, evented: false });

    fabricCanvas.add(currentCropRect);
    fabricCanvas.setActiveObject(currentCropRect);
    fabricCanvas.requestRenderAll();

    // Show the Apply/Cancel floating UI
    const ca = document.getElementById('crop-actions');
    if (ca) ca.style.display = 'flex';
}

function cancelCrop() {
    if (!currentCropRect || !fabricCanvas) return;
    
    // Restore original interactions and rotation
    if (targetImageToCrop) {
        targetImageToCrop.set({ 
            angle: cropOriginalAngle,
            selectable: !cropOriginalLocked, 
            evented: !cropOriginalLocked 
        });
        targetImageToCrop.setCoords();
    }

    fabricCanvas.remove(currentCropRect);
    currentCropRect = null;
    targetImageToCrop = null;
    fabricCanvas.requestRenderAll();

    const ca = document.getElementById('crop-actions');
    if (ca) ca.style.display = 'none';
}

function applyCrop() {
    if (!currentCropRect || !targetImageToCrop || !fabricCanvas) return;

    let cropLeft = currentCropRect.left;
    let cropTop = currentCropRect.top;
    let cropWidth = currentCropRect.width * currentCropRect.scaleX;
    let cropHeight = currentCropRect.height * currentCropRect.scaleY;

    let imgLeft = targetImageToCrop.left;
    let imgTop = targetImageToCrop.top;
    let scaleX = targetImageToCrop.scaleX;
    let scaleY = targetImageToCrop.scaleY;

    // Constrain the crop box strictly to the image's existing bounds
    let finalLeft = Math.max(cropLeft, imgLeft);
    let finalTop = Math.max(cropTop, imgTop);
    let finalRight = Math.min(cropLeft + cropWidth, imgLeft + targetImageToCrop.width * scaleX);
    let finalBottom = Math.min(cropTop + cropHeight, imgTop + targetImageToCrop.height * scaleY);

    let finalW = finalRight - finalLeft;
    let finalH = finalBottom - finalTop;

    if (finalW > 0 && finalH > 0) {
        let relLeft = (finalLeft - imgLeft) / scaleX;
        let relTop = (finalTop - imgTop) / scaleY;
        let relWidth = finalW / scaleX;
        let relHeight = finalH / scaleY;

        targetImageToCrop.set({
            cropX: (targetImageToCrop.cropX || 0) + relLeft,
            cropY: (targetImageToCrop.cropY || 0) + relTop,
            width: relWidth,
            height: relHeight,
            left: finalLeft,
            top: finalTop,
            angle: cropOriginalAngle, 
            selectable: !cropOriginalLocked, // Restore original lock state
            evented: !cropOriginalLocked
        });
        
        targetImageToCrop.setCoords();
        
        try { hasUnsavedChanges = true; } catch (err) {}
        try { updateSaveStatusIndicator(); } catch (err) {}
        try { addToUndoStack(); } catch (err) {}
    } else {
        // Crop was outside bounds, safely cancel
        targetImageToCrop.set({ angle: cropOriginalAngle, selectable: !cropOriginalLocked, evented: !cropOriginalLocked });
        targetImageToCrop.setCoords();
    }

    fabricCanvas.remove(currentCropRect);
    currentCropRect = null;
    targetImageToCrop = null;
    fabricCanvas.requestRenderAll();

    const ca = document.getElementById('crop-actions');
    if (ca) ca.style.display = 'none';
}

// Keyboard shortcuts while cropping: Enter = apply, Escape = cancel
document.addEventListener('keydown', (e) => {
    try {
        if (typeof currentCropRect === 'undefined' || !currentCropRect) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            applyCrop();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelCrop();
        }
    } catch (err) {}
});