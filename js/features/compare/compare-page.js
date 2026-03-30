// Compare page behavior and persistence.

const comparePage = document.createElement('div');
comparePage.id = 'compare-page';
comparePage.innerHTML = `
    <div class="compare-container">
        <div class="compare-header">
            <h1 id="compare-title">Compare</h1>
            <div class="compare-controls">
                <button class="compare-btn" onclick="addCompareTable()">+ Table</button>
                <button class="compare-btn" onclick="addCompareColumn()">+ Column</button>
                <button class="compare-btn" onclick="removeCompareColumn()">- Column</button>
                <button class="compare-btn" onclick="addCompareRow()">+ Row</button>
                <button class="compare-btn" onclick="removeCompareRow()">- Row</button>
            </div>
        </div>
        <div id="compare-tables"></div>
        <div id="compare-context-menu" class="compare-context-menu" style="display:none;"></div>
        <button id="compare-scroll-top-btn" class="compare-scroll-top-btn" onclick="scrollCompareToTop()" aria-label="Back to top" title="Back to top">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M7 12l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        <div id="compare-modal" class="compare-modal" style="display:none;">
            <div class="compare-modal-card" role="dialog" aria-modal="true">
                <div class="compare-modal-title" id="compare-modal-title">Notice</div>
                <div class="compare-modal-message" id="compare-modal-message"></div>
                <div class="compare-modal-actions">
                    <button id="compare-modal-cancel" class="compare-modal-btn">Cancel</button>
                    <button id="compare-modal-confirm" class="compare-modal-btn primary">OK</button>
                </div>
            </div>
        </div>
    </div>
`;
document.body.appendChild(comparePage);

let currentCompareHandle = null;
let currentCompareData = null;
let compareSaveTimer = null;
let compareContextTarget = null;
let activeCompareTableIndex = 0;
let compareModalConfirmAction = null;

document.addEventListener('click', hideCompareContextMenu);
window.addEventListener('resize', hideCompareContextMenu);
document.getElementById('compare-context-menu')?.addEventListener('click', (e) => e.stopPropagation());
document.getElementById('compare-context-menu')?.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('compare-page')?.addEventListener('scroll', updateCompareScrollTopButtonVisibility);
document.getElementById('compare-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'compare-modal') closeCompareModal();
});
document.getElementById('compare-modal-cancel')?.addEventListener('click', closeCompareModal);
document.getElementById('compare-modal-confirm')?.addEventListener('click', () => {
    const action = compareModalConfirmAction;
    closeCompareModal();
    if (typeof action === 'function') action();
});

function getDefaultCompareTable() {
    return {
        name: 'Table',
        columns: ['Column 1', 'Column 2', 'Column 3'],
        rows: [['', '', '']],
        cellBold: [[false, false, false]]
    };
}

function normalizeCompareTable(table) {
    const fallback = getDefaultCompareTable();
    const normalized = {
        name: typeof table?.name === 'string' && table.name.trim() ? table.name.trim() : fallback.name,
        columns: Array.isArray(table?.columns) && table.columns.length ? table.columns.slice() : fallback.columns.slice(),
        rows: Array.isArray(table?.rows) && table.rows.length ? table.rows.slice() : fallback.rows.slice(),
        cellBold: Array.isArray(table?.cellBold) ? table.cellBold.slice() : []
    };

    const colCount = normalized.columns.length;
    normalized.rows = normalized.rows.map((row) => {
        const next = Array.isArray(row) ? row.slice(0, colCount) : [];
        while (next.length < colCount) next.push('');
        return next;
    });

    while (normalized.cellBold.length < normalized.rows.length) {
        normalized.cellBold.push(new Array(colCount).fill(false));
    }
    if (normalized.cellBold.length > normalized.rows.length) {
        normalized.cellBold = normalized.cellBold.slice(0, normalized.rows.length);
    }

    normalized.cellBold = normalized.cellBold.map((row) => {
        const next = Array.isArray(row) ? row.slice(0, colCount).map(Boolean) : [];
        while (next.length < colCount) next.push(false);
        return next;
    });

    return normalized;
}

function openCompare(fileHandle, data, fileName = null) {
    currentCompareHandle = fileHandle;
    currentCompareData = data;
    activeCompareTableIndex = 0;

    ensureCompareDataShape();

    // Hide other screens
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('flashcard-page').classList.remove('active');
    document.getElementById('glossary-page').classList.remove('active');
    document.getElementById('qa-page').classList.remove('active');
    document.getElementById('todo-page').classList.remove('active');
    document.getElementById('links-page').classList.remove('active');
    document.getElementById('test-page').classList.remove('active');

    // Show compare page
    document.getElementById('compare-page').classList.add('active');
    document.getElementById('btn-save-status').classList.add('hidden');
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('help-btn').classList.add('hidden');

    const fileNameStr = fileHandle ? fileHandle.name.replace('.json', '') : (fileName ? fileName.replace('.json', '') : 'Compare');
    document.getElementById('compare-title').textContent = fileNameStr;

    renderCompareTables();
    updateCompareScrollTopButtonVisibility();
}

async function closeCompare() {
    await saveCompareData();
    document.getElementById('compare-page').classList.remove('active');
    currentCompareData = null;
    currentCompareHandle = null;
    showHomeScreen();
}

function ensureCompareDataShape() {
    if (!currentCompareData) return;

    if (!Array.isArray(currentCompareData.tables) || currentCompareData.tables.length === 0) {
        const migrated = {
            columns: Array.isArray(currentCompareData.columns) ? currentCompareData.columns : undefined,
            rows: Array.isArray(currentCompareData.rows) ? currentCompareData.rows : undefined,
            cellBold: Array.isArray(currentCompareData.cellBold) ? currentCompareData.cellBold : undefined
        };
        currentCompareData.tables = [normalizeCompareTable(migrated)];
    } else {
        currentCompareData.tables = currentCompareData.tables.map((table) => normalizeCompareTable(table));
    }

    if (activeCompareTableIndex < 0 || activeCompareTableIndex >= currentCompareData.tables.length) {
        activeCompareTableIndex = 0;
    }
}

function getActiveCompareTable() {
    ensureCompareDataShape();
    return currentCompareData?.tables?.[activeCompareTableIndex] || null;
}

function queueCompareSave() {
    if (compareSaveTimer) clearTimeout(compareSaveTimer);
    compareSaveTimer = setTimeout(saveCompareData, 300);
}

function renderCompareTables() {
    const container = document.getElementById('compare-tables');
    if (!container || !currentCompareData) return;

    ensureCompareDataShape();
    hideCompareContextMenu();

    container.innerHTML = '';

    currentCompareData.tables.forEach((tableData, tableIndex) => {
        const block = document.createElement('div');
        block.className = 'compare-table-block';
        if (tableIndex === activeCompareTableIndex) block.classList.add('active');
        block.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openCompareContextMenu('table', { tableIndex }, e.clientX, e.clientY);
        });

        const titleRow = document.createElement('div');
        titleRow.className = 'compare-table-title-row';

        const label = document.createElement('input');
        label.className = 'compare-table-name';
        label.type = 'text';
        label.value = tableData.name || `Table ${tableIndex + 1}`;
        label.placeholder = `Table ${tableIndex + 1}`;
        label.addEventListener('focus', () => {
            activeCompareTableIndex = tableIndex;
            updateActiveCompareTableHighlight();
        });
        label.addEventListener('input', () => {
            tableData.name = label.value;
            queueCompareSave();
        });
        label.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            activeCompareTableIndex = tableIndex;
            updateActiveCompareTableHighlight();
            openCompareContextMenu('table', { tableIndex }, e.clientX, e.clientY);
        });

        titleRow.appendChild(label);

        const tableEl = document.createElement('table');
        tableEl.className = 'compare-table';
        const tbody = document.createElement('tbody');

        const tableWrap = document.createElement('div');
        tableWrap.className = 'compare-table-wrap';

        tableData.rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openCompareContextMenu('row', { tableIndex, rowIndex }, e.clientX, e.clientY);
            });

            row.forEach((cell, colIndex) => {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.className = 'compare-cell-input';
                if (tableData.cellBold[rowIndex] && tableData.cellBold[rowIndex][colIndex]) {
                    input.classList.add('compare-col-bold');
                }
                input.value = cell || '';
                input.addEventListener('focus', () => {
                    activeCompareTableIndex = tableIndex;
                    updateActiveCompareTableHighlight();
                });
                input.addEventListener('input', () => {
                    tableData.rows[rowIndex][colIndex] = input.value;
                    queueCompareSave();
                });
                input.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    activeCompareTableIndex = tableIndex;
                    updateActiveCompareTableHighlight();
                    openCompareContextMenu('cell', { tableIndex, rowIndex, colIndex }, e.clientX, e.clientY);
                });
                td.appendChild(input);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        tableEl.appendChild(tbody);
        tableWrap.appendChild(tableEl);
        block.appendChild(titleRow);
        block.appendChild(tableWrap);
        container.appendChild(block);
    });
}

function updateActiveCompareTableHighlight() {
    const blocks = document.querySelectorAll('.compare-table-block');
    blocks.forEach((block, idx) => {
        if (idx === activeCompareTableIndex) block.classList.add('active');
        else block.classList.remove('active');
    });
}

function moveArrayItem(arr, fromIndex, toIndex) {
    if (!Array.isArray(arr)) return false;
    if (fromIndex < 0 || fromIndex >= arr.length) return false;
    if (toIndex < 0 || toIndex >= arr.length) return false;
    if (fromIndex === toIndex) return false;
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    return true;
}

function moveCompareColumn(tableIndex, fromIndex, toIndex) {
    if (!currentCompareData) return;
    const table = currentCompareData.tables[tableIndex];
    if (!table) return;
    if (!moveArrayItem(table.columns, fromIndex, toIndex)) return;
    table.rows.forEach((row) => moveArrayItem(row, fromIndex, toIndex));
    table.cellBold.forEach((row) => moveArrayItem(row, fromIndex, toIndex));

    renderCompareTables();
    queueCompareSave();
}

function moveCompareRow(tableIndex, fromIndex, toIndex) {
    if (!currentCompareData) return;
    const table = currentCompareData.tables[tableIndex];
    if (!table) return;
    if (!moveArrayItem(table.rows, fromIndex, toIndex)) return;
    moveArrayItem(table.cellBold, fromIndex, toIndex);
    renderCompareTables();
    queueCompareSave();
}

function addCompareTable() {
    if (!currentCompareData) return;
    ensureCompareDataShape();
    const next = getDefaultCompareTable();
    next.name = `Table ${currentCompareData.tables.length + 1}`;
    currentCompareData.tables.push(next);
    activeCompareTableIndex = currentCompareData.tables.length - 1;
    renderCompareTables();
    queueCompareSave();
}

function addCompareColumn() {
    const table = getActiveCompareTable();
    if (!table) return;
    const nextIndex = table.columns.length + 1;
    table.columns.push(`Column ${nextIndex}`);
    table.rows.forEach(row => row.push(''));
    table.cellBold.forEach(row => row.push(false));
    renderCompareTables();
    queueCompareSave();
}

function removeCompareColumn() {
    const table = getActiveCompareTable();
    if (!table) return;
    if (table.columns.length <= 1) {
        showComparePopup({
            title: 'Cannot Remove Column',
            message: 'At least one column is required.',
            confirmText: 'OK'
        });
        return;
    }
    table.columns.pop();
    table.rows.forEach(row => row.pop());
    table.cellBold.forEach(row => row.pop());
    renderCompareTables();
    queueCompareSave();
}

function requestDeleteCompareTable(tableIndex) {
    if (!currentCompareData || !Array.isArray(currentCompareData.tables)) return;
    if (currentCompareData.tables.length <= 1) {
        showComparePopup({
            title: 'Cannot Delete Table',
            message: 'At least one table is required.',
            confirmText: 'OK'
        });
        return;
    }

    showComparePopup({
        title: 'Delete Table',
        message: `Delete ${currentCompareData.tables[tableIndex]?.name || `table ${tableIndex + 1}`}? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        onConfirm: () => {
            currentCompareData.tables.splice(tableIndex, 1);
            if (activeCompareTableIndex >= currentCompareData.tables.length) {
                activeCompareTableIndex = currentCompareData.tables.length - 1;
            }
            if (activeCompareTableIndex < 0) activeCompareTableIndex = 0;
            renderCompareTables();
            queueCompareSave();
        }
    });
}

function toggleCompareCellBold(tableIndex, rowIndex, colIndex) {
    if (!currentCompareData) return;
    const table = currentCompareData.tables[tableIndex];
    if (!table || !table.cellBold[rowIndex]) return;
    if (colIndex < 0 || colIndex >= table.cellBold[rowIndex].length) return;
    table.cellBold[rowIndex][colIndex] = !table.cellBold[rowIndex][colIndex];
    renderCompareTables();
    queueCompareSave();
}

function showComparePopup({ title = 'Notice', message = '', confirmText = 'OK', cancelText = null, onConfirm = null }) {
    const modal = document.getElementById('compare-modal');
    const titleEl = document.getElementById('compare-modal-title');
    const messageEl = document.getElementById('compare-modal-message');
    const confirmBtn = document.getElementById('compare-modal-confirm');
    const cancelBtn = document.getElementById('compare-modal-cancel');
    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText || 'Cancel';
    cancelBtn.style.display = cancelText ? '' : 'none';
    compareModalConfirmAction = onConfirm;
    modal.style.display = 'flex';
}

function closeCompareModal() {
    const modal = document.getElementById('compare-modal');
    if (!modal) return;
    modal.style.display = 'none';
    compareModalConfirmAction = null;
}

function updateCompareScrollTopButtonVisibility() {
    const page = document.getElementById('compare-page');
    const btn = document.getElementById('compare-scroll-top-btn');
    if (!page || !btn) return;
    const shouldShow = page.classList.contains('active') && page.scrollTop > 140;
    btn.classList.toggle('show', shouldShow);
}

function scrollCompareToTop() {
    const page = document.getElementById('compare-page');
    if (!page) return;
    page.scrollTo({ top: 0, behavior: 'smooth' });
}

function createCompareContextAction(label, enabled, action) {
    const button = document.createElement('button');
    button.className = 'compare-context-item';
    button.textContent = label;
    button.disabled = !enabled;
    button.addEventListener('click', () => {
        if (!enabled) return;
        hideCompareContextMenu();
        action();
    });
    return button;
}

function openCompareContextMenu(kind, index, clientX, clientY) {
    const menu = document.getElementById('compare-context-menu');
    if (!menu || !currentCompareData) return;

    compareContextTarget = { kind, index };
    menu.innerHTML = '';

    if (kind === 'table') {
        const tableIndex = index.tableIndex;
        const canDelete = currentCompareData.tables.length > 1;
        menu.appendChild(createCompareContextAction('Delete table', canDelete, () => requestDeleteCompareTable(tableIndex)));
    } else if (kind === 'cell') {
        const tableIndex = index.tableIndex;
        const rowIndex = index.rowIndex;
        const colIndex = index.colIndex;
        const table = currentCompareData.tables[tableIndex];
        if (!table) return;
        const colCount = table.columns.length;
        const canToggle = rowIndex >= 0 && rowIndex < table.rows.length && colIndex >= 0 && colIndex < table.columns.length;
        const isBoldCell = canToggle && table.cellBold[rowIndex] ? !!table.cellBold[rowIndex][colIndex] : false;
        menu.appendChild(createCompareContextAction(isBoldCell ? 'Unbold cell' : 'Bold cell', canToggle, () => toggleCompareCellBold(tableIndex, rowIndex, colIndex)));
        menu.appendChild(createCompareContextAction('Move column left', colIndex > 0, () => moveCompareColumn(tableIndex, colIndex, colIndex - 1)));
        menu.appendChild(createCompareContextAction('Move column right', colIndex < colCount - 1, () => moveCompareColumn(tableIndex, colIndex, colIndex + 1)));
        menu.appendChild(createCompareContextAction('Move column to first', colIndex > 0, () => moveCompareColumn(tableIndex, colIndex, 0)));
        menu.appendChild(createCompareContextAction('Move column to last', colIndex < colCount - 1, () => moveCompareColumn(tableIndex, colIndex, colCount - 1)));
    } else if (kind === 'row') {
        const tableIndex = index.tableIndex;
        const rowIndex = index.rowIndex;
        const table = currentCompareData.tables[tableIndex];
        if (!table) return;
        const rowCount = table.rows.length;
        menu.appendChild(createCompareContextAction('Move up', rowIndex > 0, () => moveCompareRow(tableIndex, rowIndex, rowIndex - 1)));
        menu.appendChild(createCompareContextAction('Move down', rowIndex < rowCount - 1, () => moveCompareRow(tableIndex, rowIndex, rowIndex + 1)));
        menu.appendChild(createCompareContextAction('Move to top', rowIndex > 0, () => moveCompareRow(tableIndex, rowIndex, 0)));
        menu.appendChild(createCompareContextAction('Move to bottom', rowIndex < rowCount - 1, () => moveCompareRow(tableIndex, rowIndex, rowCount - 1)));
    }

    if (!menu.children.length) return;

    menu.style.display = 'block';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, clientX), window.innerWidth - rect.width - margin);
    const top = Math.min(Math.max(margin, clientY), window.innerHeight - rect.height - margin);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function hideCompareContextMenu() {
    const menu = document.getElementById('compare-context-menu');
    if (!menu) return;
    menu.style.display = 'none';
    menu.innerHTML = '';
    compareContextTarget = null;
}

function addCompareRow() {
    const table = getActiveCompareTable();
    if (!table) return;
    const colCount = table.columns.length || 1;
    table.rows.push(new Array(colCount).fill(''));
    table.cellBold.push(new Array(colCount).fill(false));
    renderCompareTables();
    queueCompareSave();
}

function removeCompareRow() {
    const table = getActiveCompareTable();
    if (!table) return;
    if (table.rows.length <= 1) {
        showComparePopup({
            title: 'Cannot Remove Row',
            message: 'At least one row is required.',
            confirmText: 'OK'
        });
        return;
    }
    table.rows.pop();
    table.cellBold.pop();
    renderCompareTables();
    queueCompareSave();
}

async function saveCompareData() {
    if (!currentCompareData) return;

    currentCompareData.timestamp = new Date().toISOString();
    const json = JSON.stringify(currentCompareData, null, 2);

    if (!currentCompareHandle) {
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, json);
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err) {
                console.error('Direct write failed for compare:', err);
            }
        }
        if (ipcRenderer && currentNoteFileName) {
            ipcRenderer.send('save-note', { fileName: currentNoteFileName, data: currentCompareData });
        }
        return;
    }

    try {
        const writable = await currentCompareHandle.createWritable();
        await writable.write(json);
        await writable.close();
    } catch (err) {
        console.error('Error saving compare:', err);
        if (currentFilePath) {
            try {
                fs.writeFileSync(currentFilePath, json);
                hasUnsavedChanges = false;
                updateSaveStatusIndicator();
                showNotification('Saved to ' + currentFileName);
                return;
            } catch (err2) {
                console.error('Direct write also failed for compare:', err2);
            }
        }
    }
}
