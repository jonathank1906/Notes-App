// --- TABLE GENERATION LOGIC ---
let targetTableGroup = null; // Stores the currently right-clicked table

function promptInsertTable() {
    if (!fabricCanvas) return;
    
    // Ensure we are in select mode so the user can immediately move/resize it
    setTool('select'); 
    try {
        const input = prompt("Enter table dimensions (Rows, Columns)\ne.g., 3,3", "3,3");
        if (!input) return;
        const parts = input.split(',');
        const rows = parseInt(parts[0]) || 3;
        const cols = parseInt(parts[1]) || 3;
        insertTable(rows, cols);
        return;
    } catch (err) {
        showInsertTableModal();
    }
}

function showInsertTableModal() {
    let modal = document.getElementById('insert-table-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const r = modal.querySelector('#insert-table-rows');
    const c = modal.querySelector('#insert-table-cols');
    if (r) r.value = '3';
    if (c) c.value = '3';
}

function hideInsertTableModal() {
    const modal = document.getElementById('insert-table-modal');
    if (modal) modal.style.display = 'none';
}

function confirmInsertTableFromModal() {
    const modal = document.getElementById('insert-table-modal');
    if (!modal) return;
    const rows = parseInt(modal.querySelector('#insert-table-rows').value) || 1;
    const cols = parseInt(modal.querySelector('#insert-table-cols').value) || 1;
    hideInsertTableModal();
    insertTable(rows, cols);
}

function insertTable(rows, cols) {
    const cellWidth = 100;
    const cellHeight = 50;
    const totalWidth = cols * cellWidth;
    const totalHeight = rows * cellHeight;
    
    const lines = buildTableLines(rows, cols, cellWidth, cellHeight);
    
    const vpt = fabricCanvas.viewportTransform;
    const centerX = (fabricCanvas.width / 2 - vpt[4]) / vpt[0];
    const centerY = (fabricCanvas.height / 2 - vpt[5]) / vpt[3];

    const tableGroup = new fabric.Group(lines, {
        left: centerX - (totalWidth / 2),
        top: centerY - (totalHeight / 2),
        isTable: true,
        tableRows: rows,
        tableCols: cols,
        transparentCorners: false,
        cornerColor: '#2196F3',
        borderColor: '#2196F3',
        perPixelTargetFind: false // <--- FIX 1: Ensures clicks map to the bounding box!
    });

    fabricCanvas.add(tableGroup);
    fabricCanvas.setActiveObject(tableGroup);
    fabricCanvas.requestRenderAll();
    
    hasUnsavedChanges = true;
    updateSaveStatusIndicator();
    addToUndoStack();
}

function buildTableLines(rows, cols, cellWidth, cellHeight) {
    const lines = [];
    const totalWidth = cols * cellWidth;
    const totalHeight = rows * cellHeight;
    
    // <--- FIX 2: Add an almost transparent background rect to act as a solid hit area.
    // Even if pixels are checked, 0.01 opacity registers as a hit and allows right-clicks.
    lines.push(new fabric.Rect({
        left: 0,
        top: 0,
        width: totalWidth,
        height: totalHeight,
        fill: 'rgba(255, 255, 255, 0.01)',
        strokeWidth: 0,
        selectable: false
    }));

    const lineOptions = {
        stroke: '#888888',
        strokeWidth: 2,
        selectable: false,
        strokeUniform: true // Prevents lines getting thick when scaled
    };

    // Draw Horizontal Lines
    for (let i = 0; i <= rows; i++) {
        const y = i * cellHeight;
        lines.push(new fabric.Line([0, y, totalWidth, y], lineOptions));
    }

    // Draw Vertical Lines
    for (let j = 0; j <= cols; j++) {
        const x = j * cellWidth;
        lines.push(new fabric.Line([x, 0, x, totalHeight], lineOptions));
    }
    
    return lines;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#canvas-context-menu')) {
        const ctxMenu = document.getElementById('canvas-context-menu');
        if (ctxMenu) ctxMenu.style.display = 'none';
    }
});

function modifyActiveTable(rowDelta, colDelta) {
    const menu = document.getElementById('canvas-context-menu');
    if (menu) menu.style.display = 'none';
    if (!targetTableGroup || !fabricCanvas) return;

    const oldGroup = targetTableGroup;
    const newRows = Math.max(1, oldGroup.tableRows + rowDelta);
    const newCols = Math.max(1, oldGroup.tableCols + colDelta);

    // <--- FIX 3: Accurately calculate cell size using the background rect we added.
    // This stops the table from slowly inflating (drifting) due to 2px stroke-width padding.
    let baseWidth = oldGroup.width;
    let baseHeight = oldGroup.height;
    
    const firstItem = oldGroup.item(0);
    if (firstItem && firstItem.type === 'rect') {
        baseWidth = firstItem.width;
        baseHeight = firstItem.height;
    } else {
        // Fallback for older tables saved before the fix
        baseWidth -= 2;
        baseHeight -= 2;
    }

    const cellWidth = baseWidth / oldGroup.tableCols;
    const cellHeight = baseHeight / oldGroup.tableRows;

    const lines = buildTableLines(newRows, newCols, cellWidth, cellHeight);

    const newGroup = new fabric.Group(lines, {
        left: oldGroup.left,
        top: oldGroup.top,
        scaleX: oldGroup.scaleX,
        scaleY: oldGroup.scaleY,
        angle: oldGroup.angle,
        isTable: true,
        tableRows: newRows,
        tableCols: newCols,
        transparentCorners: false,
        cornerColor: '#2196F3',
        borderColor: '#2196F3',
        perPixelTargetFind: false // <--- Apply the fix here as well
    });

    fabricCanvas.remove(oldGroup);
    fabricCanvas.add(newGroup);
    fabricCanvas.setActiveObject(newGroup);
    fabricCanvas.requestRenderAll();

    hasUnsavedChanges = true;
    updateSaveStatusIndicator();
    addToUndoStack();
    targetTableGroup = null;
}