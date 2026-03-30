// Flashcard page behavior and persistence.

const flashcardPage = document.createElement('div');
flashcardPage.id = 'flashcard-page';
flashcardPage.innerHTML = `
	<button class="fc-mode-toggle" onclick="toggleFlashcardEditMode()">Edit All Cards</button>
	<div class="fc-study-modes" id="fc-study-modes">
		<button class="fc-study-btn" data-mode="flashcards" onclick="setFlashcardStudyMode('flashcards')">Study Flashcards</button>
		<button class="fc-study-btn" data-mode="definitions" onclick="setFlashcardStudyMode('definitions')">Study Definitions</button>
		<button class="fc-study-btn" data-mode="tables" onclick="setFlashcardStudyMode('tables')">Study Tables</button>
		<button class="fc-study-btn" data-mode="all" onclick="setFlashcardStudyMode('all')">Study All</button>
	</div>
	<div class="fc-study-hint" id="fc-study-hint"></div>
    
	<div class="scene">
		<div class="card">
			<div class="card__face card__face--front"></div>
			<div class="card__face card__face--back"></div>
		</div>
	</div>
	<div class="fc-question" id="fc-question"></div>

	<div class="fc-answer" id="fc-answer"></div>
	<button class="fc-reveal-btn" id="fc-reveal-btn" onclick="toggleFlashcardAnswer()">Reveal Answer</button>

	<div class="fc-nav" aria-label="Flashcard navigation">
		<button class="fc-nav-btn fc-nav-btn--prev" onclick="navFlashcard(-1)" aria-label="Previous card">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M3 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				<path d="M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>
		<button class="fc-nav-btn" onclick="navFlashcard(1)" aria-label="Next card">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M3 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				<path d="M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>
	</div>

	<div id="fc-full-edit-container">
		<div class="fc-full-edit-actions">
			<button class="fc-btn add-btn" onclick="addNewCardInFullEdit()">+ Add New Card</button>
			<button class="fc-btn del-btn" onclick="cleanupFlashcardImages()">Clean Unused Images</button>
		</div>
		<div id="fc-full-edit-list"></div>
	</div>

	<div id="fc-edit-modal">
		<div class="fc-modal-content">
			<div class="fc-modal-header">
				<div class="fc-modal-title">Edit Card</div>
				<button class="fc-modal-close" onclick="closeEditModal()">&times;</button>
			</div>
			<div class="fc-edit-field">
				<label>Front (Question)</label>
				<textarea class="fc-edit-textarea" id="fc-modal-front" placeholder="Type question here (Markdown supported)..."></textarea>
			</div>
			<div class="fc-edit-field">
				<label>Front Image</label>
				<div class="fc-image-controls">
					<button class="fc-btn" onclick="pickFlashcardImage('front')">Add/Replace Image</button>
					<button class="fc-btn" onclick="annotateFlashcardImage('front')">Annotate</button>
					<button class="fc-btn del-btn" onclick="removeFlashcardImage('front')">Remove</button>
				</div>
				<img class="fc-image-preview" id="fc-modal-front-image-preview" alt="Front image preview" />
			</div>
			<div class="fc-edit-field">
				<label>Card Type</label>
				<select class="fc-edit-select" id="fc-modal-type">
					<option value="basic">Basic (flip)</option>
					<option value="fill-blank">Fill in the blank</option>
				</select>
				<div class="fc-type-hint">For fill-in-the-blank, use ___ in the front to create blanks.</div>
			</div>
			<div class="fc-edit-field">
				<label>Back (Answer)</label>
				<textarea class="fc-edit-textarea" id="fc-modal-back" placeholder="Type answer here (Markdown supported)..."></textarea>
			</div>
			<div class="fc-edit-field">
				<label>Back Image</label>
				<div class="fc-image-controls">
					<button class="fc-btn" onclick="pickFlashcardImage('back')">Add/Replace Image</button>
					<button class="fc-btn" onclick="annotateFlashcardImage('back')">Annotate</button>
					<button class="fc-btn del-btn" onclick="removeFlashcardImage('back')">Remove</button>
				</div>
				<img class="fc-image-preview" id="fc-modal-back-image-preview" alt="Back image preview" />
			</div>
			<div class="fc-modal-actions">
				<button class="fc-btn" onclick="closeEditModal()">Cancel</button>
				<button class="fc-btn" onclick="saveEditModal()" style="border-color:#8af; color:#8af;">Save (Ctrl+Enter)</button>
			</div>
		</div>
		</div>

		<div id="fc-image-modal">
			<div class="fc-image-modal-content">
				<div class="fc-modal-header">
					<div class="fc-modal-title">Annotate Image</div>
					<button class="fc-modal-close" onclick="closeImageAnnotator()">&times;</button>
				</div>
				<div class="fc-image-toolbar">
					<label for="fc-image-color">Pen</label>
					<input type="color" id="fc-image-color" value="#ffffff" />
					<select id="fc-image-size">
						<option value="2">2px</option>
						<option value="4" selected>4px</option>
						<option value="6">6px</option>
						<option value="10">10px</option>
					</select>
				</div>
				<div class="fc-image-canvas-wrap">
					<canvas id="fc-image-canvas"></canvas>
				</div>
				<div class="fc-modal-actions">
					<button class="fc-btn" onclick="closeImageAnnotator()">Cancel</button>
					<button class="fc-btn" onclick="saveImageAnnotator()" style="border-color:#8af; color:#8af;">Save</button>
				</div>
			</div>
	</div>

		<div id="fc-scratchpad" class="fc-scratchpad">
			<div class="fc-scratchpad-header" id="fc-scratchpad-header">
				<div class="fc-scratchpad-title">Scratchpad</div>
				<div class="fc-scratchpad-actions">
					<button class="fc-btn" onclick="setScratchpadMode('text')">Text</button>
					<button class="fc-btn" onclick="setScratchpadMode('draw')">Draw</button>
					<button class="fc-btn del-btn" onclick="clearScratchpad()">Clear</button>
				</div>
			</div>
			<textarea id="fc-scratchpad-text" class="fc-scratchpad-text" placeholder="Type your answer..."></textarea>
			<canvas id="fc-scratchpad-canvas" class="fc-scratchpad-canvas"></canvas>
		</div>
`;
document.body.appendChild(flashcardPage);

let currentFlashcardData = null;
let currentFlashcardHandle = null;
let currentFlashcardIndex = 0;
let isFlashcardFullEditMode = false;
let isFlashcardAnswerVisible = false;
let flashcardStudyMode = 'flashcards';
let cachedGlossaryEntries = [];
let glossaryLoadedForStudy = false;
let cachedCompareTables = [];
let compareLoadedForStudy = false;
let modalFrontImage = '';
let modalBackImage = '';
let imageAnnotatorTarget = null;
let imageAnnotatorIsDrawing = false;
let imageAnnotatorLastPoint = null;
let imageAnnotatorIsPanning = false;
let imageAnnotatorPanStart = null;
let imageAnnotatorView = { offsetX: 0, offsetY: 0, scale: 1 };
let imageAnnotatorBaseCanvas = null;
let imageAnnotatorBaseCtx = null;
let imageAnnotatorImageRect = null;
let suppressNextCardFlip = false;
let scratchpadMode = 'text';
let scratchpadIsDrawing = false;
let scratchpadLastPoint = null;
let scratchpadDragState = null;

function openFlashcard(fileHandle, data, fileName = null) {
	currentFlashcardHandle = fileHandle;
	currentFlashcardData = data;
	currentFlashcardIndex = 0;
	isFlashcardFullEditMode = false;
	flashcardStudyMode = 'flashcards';
	glossaryLoadedForStudy = false;
	cachedGlossaryEntries = [];
	compareLoadedForStudy = false;
	cachedCompareTables = [];
    
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
	const revealBtn = document.getElementById('fc-reveal-btn');
	const questionContainer = document.getElementById('fc-question');
	const answerContainer = document.getElementById('fc-answer');
	const scratchpad = document.getElementById('fc-scratchpad');
    
	if (isFlashcardFullEditMode) {
		// Full Edit Mode: Show list of all cards
		if (scene) scene.style.display = 'none';
		fullEditContainer.classList.add('show');
		if (revealBtn) revealBtn.style.display = 'none';
		if (questionContainer) questionContainer.style.display = 'none';
		if (answerContainer) answerContainer.classList.remove('show');
		if (modeToggle) {
			modeToggle.textContent = 'Practice Mode';
			modeToggle.style.display = 'block';
		}
		if (flashcardPage) {
			flashcardPage.classList.add('edit-mode');
			flashcardPage.scrollTop = 0; // Scroll to top when entering edit mode
		}
		if (scratchpad) scratchpad.classList.add('hidden');
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
		if (scratchpad) scratchpad.classList.remove('hidden');
        
		if (card) card.classList.remove('is-flipped');
		updateStudyModeControls();
		updateFlashcardDisplay();
	}
}

function renderCardContent(container, text, imageDataUrl) {
	if (!container) return;
	container.innerHTML = '';
	const textWrap = document.createElement('div');
	textWrap.className = 'fc-face-text';
	try {
		textWrap.innerHTML = marked.parse(text || '');
	} catch (e) {
		textWrap.textContent = text || '';
	}
	container.appendChild(textWrap);
	const imageSrc = resolveFlashcardImageSrc(imageDataUrl);
	if (imageSrc) {
		const img = document.createElement('img');
		img.className = 'fc-card-image';
		img.src = imageSrc;
		img.alt = 'Flashcard image';
		container.appendChild(img);
	}
}

function updateStudyModeControls() {
	const buttons = document.querySelectorAll('.fc-study-btn');
	buttons.forEach(btn => {
		btn.classList.toggle('active', btn.dataset.mode === flashcardStudyMode);
	});

	const hint = document.getElementById('fc-study-hint');
	if (hint) {
		if (flashcardStudyMode === 'definitions') {
			hint.textContent = 'Glossary entries are read-only in this mode.';
		} else if (flashcardStudyMode === 'tables') {
			hint.textContent = 'Compare tables: bold cells are clues, fill the other cells and reveal.';
		} else if (flashcardStudyMode === 'all') {
			hint.textContent = 'Study All includes flashcards, glossary, and compare tables.';
		} else {
			hint.textContent = '';
		}
	}
}

async function setFlashcardStudyMode(mode) {
	flashcardStudyMode = mode;
	currentFlashcardIndex = 0;
	updateStudyModeControls();
	if (mode === 'definitions' || mode === 'all') {
		await ensureGlossaryLoadedForStudy();
	}
	if (mode === 'tables' || mode === 'all') {
		await ensureCompareLoadedForStudy();
	}
	updateFlashcardDisplay();
}

async function ensureGlossaryLoadedForStudy() {
	if (glossaryLoadedForStudy) return;
	let glossaryData = null;

	if (currentGlossaryData && Array.isArray(currentGlossaryData.glossary)) {
		glossaryData = currentGlossaryData;
	}

	if (!glossaryData && typeof findQuickAccessNote === 'function') {
		const note = findQuickAccessNote('glossary');
		if (note) {
			if (noteDataCache && noteDataCache.has(note.noteKey)) {
				glossaryData = noteDataCache.get(note.noteKey);
			} else if (note.handle && typeof note.handle.getFile === 'function') {
				try {
					const file = await note.handle.getFile();
					const text = await file.text();
					glossaryData = JSON.parse(text);
					if (noteDataCache) {
						noteDataCache.set(note.noteKey, glossaryData);
					}
				} catch (err) {
					console.warn('Failed to read glossary for study mode', err);
				}
			}
		}
	}

	if (!glossaryData && activeSubject && activeSubject.handle) {
		try {
			for await (const entry of activeSubject.handle.values()) {
				if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
				try {
					const file = await entry.getFile();
					const text = await file.text();
					const data = JSON.parse(text);
					if (data && data.type === 'glossary') {
						glossaryData = data;
						break;
					}
				} catch (err) {
					// Skip unreadable files
				}
			}
		} catch (err) {
			console.warn('Glossary scan failed', err);
		}
	}

	// Detached window fallback: scan directory using fs
	if (!glossaryData && currentFilePath && typeof fs !== 'undefined' && typeof path !== 'undefined') {
		try {
			const dirPath = path.dirname(currentFilePath);
			const entries = fs.readdirSync(dirPath);
			for (const name of entries) {
				if (!name.toLowerCase().endsWith('.json')) continue;
				try {
					const fullPath = path.join(dirPath, name);
					const text = fs.readFileSync(fullPath, 'utf8');
					const data = JSON.parse(text);
					if (data && data.type === 'glossary') {
						glossaryData = data;
						break;
					}
				} catch (err) {
					// Skip unreadable files
				}
			}
		} catch (err) {
			console.warn('Glossary fs scan failed', err);
		}
	}

	cachedGlossaryEntries = (glossaryData && Array.isArray(glossaryData.glossary)) ? glossaryData.glossary : [];
	glossaryLoadedForStudy = true;
}

function normalizeCompareTablesForStudy(compareData) {
	const fallback = {
		columns: ['Column 1', 'Column 2', 'Column 3'],
		rows: [['', '', '']],
		cellBold: [[false, false, false]],
		name: 'Table'
	};

	const sourceTables = Array.isArray(compareData?.tables) && compareData.tables.length
		? compareData.tables
		: [{
			name: compareData?.name || fallback.name,
			columns: Array.isArray(compareData?.columns) ? compareData.columns : fallback.columns,
			rows: Array.isArray(compareData?.rows) ? compareData.rows : fallback.rows,
			cellBold: Array.isArray(compareData?.cellBold) ? compareData.cellBold : fallback.cellBold
		}];

	return sourceTables.map((table, index) => {
		const columns = Array.isArray(table?.columns) && table.columns.length ? table.columns.slice() : fallback.columns.slice();
		const colCount = columns.length;
		const rows = (Array.isArray(table?.rows) && table.rows.length ? table.rows : fallback.rows).map((row) => {
			const next = Array.isArray(row) ? row.slice(0, colCount) : [];
			while (next.length < colCount) next.push('');
			return next;
		});
		let cellBold = Array.isArray(table?.cellBold) ? table.cellBold.slice() : [];
		while (cellBold.length < rows.length) cellBold.push(new Array(colCount).fill(false));
		if (cellBold.length > rows.length) cellBold = cellBold.slice(0, rows.length);
		cellBold = cellBold.map((row) => {
			const next = Array.isArray(row) ? row.slice(0, colCount).map(Boolean) : [];
			while (next.length < colCount) next.push(false);
			return next;
		});
		return {
			name: (typeof table?.name === 'string' && table.name.trim()) ? table.name.trim() : `Table ${index + 1}`,
			columns,
			rows,
			cellBold
		};
	});
}

async function ensureCompareLoadedForStudy() {
	if (compareLoadedForStudy) return;
	let compareData = null;
	const isCompareLikeData = (data) => {
		if (!data || typeof data !== 'object') return false;
		if (data.type === 'compare' || data.type === 'table' || data.type === 'tables') return true;
		if (Array.isArray(data.tables)) return true;
		if (Array.isArray(data.rows) && Array.isArray(data.columns)) return true;
		return false;
	};

	if (typeof currentCompareData !== 'undefined' && isCompareLikeData(currentCompareData)) {
		compareData = currentCompareData;
	}

	if (!compareData && typeof findQuickAccessNote === 'function') {
		let note = findQuickAccessNote('compare');
		if (!note && typeof getScopedNotesForQuickAccess === 'function') {
			const scoped = getScopedNotesForQuickAccess();
			note = scoped.find(n => n.typeToken === 'table' || n.typeToken === 'tables') || null;
		}
		if (note) {
			if (noteDataCache && noteDataCache.has(note.noteKey)) {
				const cached = noteDataCache.get(note.noteKey);
				if (isCompareLikeData(cached)) compareData = cached;
			} else if (note.handle && typeof note.handle.getFile === 'function') {
				try {
					const file = await note.handle.getFile();
					const text = await file.text();
					const parsed = JSON.parse(text);
					if (isCompareLikeData(parsed)) {
						compareData = parsed;
						if (noteDataCache) noteDataCache.set(note.noteKey, compareData);
					}
				} catch (err) {
					console.warn('Failed to read compare note for study mode', err);
				}
			}
		}
	}

	if (!compareData && activeSubject && activeSubject.handle) {
		try {
			for await (const entry of activeSubject.handle.values()) {
				if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
				try {
					const file = await entry.getFile();
					const text = await file.text();
					const data = JSON.parse(text);
					if (isCompareLikeData(data)) {
						compareData = data;
						break;
					}
					const lowerName = entry.name.toLowerCase();
					if (!compareData && (lowerName.includes('compare') || lowerName.includes('table')) && (Array.isArray(data?.tables) || Array.isArray(data?.rows))) {
						compareData = data;
						break;
					}
				} catch (err) {
					// skip unreadable file
				}
			}
		} catch (err) {
			console.warn('Compare scan failed', err);
		}
	}

	// Detached window fallback: scan directory using fs.
	if (!compareData && currentFilePath && typeof fs !== 'undefined' && typeof path !== 'undefined') {
		try {
			const dirPath = path.dirname(currentFilePath);
			const entries = fs.readdirSync(dirPath);
			for (const name of entries) {
				if (!name.toLowerCase().endsWith('.json')) continue;
				try {
					const fullPath = path.join(dirPath, name);
					const text = fs.readFileSync(fullPath, 'utf8');
					const data = JSON.parse(text);
					if (isCompareLikeData(data)) {
						compareData = data;
						break;
					}
					const lowerName = name.toLowerCase();
					if (!compareData && (lowerName.includes('compare') || lowerName.includes('table')) && (Array.isArray(data?.tables) || Array.isArray(data?.rows))) {
						compareData = data;
						break;
					}
				} catch (err) {
					// Skip unreadable files
				}
			}
		} catch (err) {
			console.warn('Compare fs scan failed', err);
		}
	}

	cachedCompareTables = compareData ? normalizeCompareTablesForStudy(compareData) : [];
	compareLoadedForStudy = cachedCompareTables.length > 0;
}

function getActiveStudyCards() {
	const flashcards = currentFlashcardData.flashcards || [];
	const glossaryCards = cachedGlossaryEntries.map(entry => ({
		front: entry.term || '',
		back: entry.definition || '',
		type: 'basic'
	}));
	const compareCards = cachedCompareTables.map((table, index) => ({
		studyType: 'compare-table',
		tableIndex: index,
		tableName: table.name || `Table ${index + 1}`,
		columns: table.columns,
		rows: table.rows,
		cellBold: table.cellBold,
		type: 'basic'
	}));

	if (flashcardStudyMode === 'definitions') {
		return glossaryCards;
	}
	if (flashcardStudyMode === 'tables') {
		return compareCards;
	}
	if (flashcardStudyMode === 'all') {
		return [...flashcards, ...glossaryCards, ...compareCards];
	}
	return flashcards;
}

function renderCompareStudyQuestion(container, cardData) {
	if (!container) return;
	container.innerHTML = '';

	const title = document.createElement('div');
	title.className = 'fc-compare-title';
	title.textContent = cardData.tableName || 'Compare Table';
	container.appendChild(title);

	const table = document.createElement('table');
	table.className = 'fc-compare-table compare-table';

	(cardData.rows || []).forEach((row, rowIndex) => {
		const tr = document.createElement('tr');
		row.forEach((cellValue, colIndex) => {
			const td = document.createElement('td');
			const isGiven = !!(cardData.cellBold && cardData.cellBold[rowIndex] && cardData.cellBold[rowIndex][colIndex]);
			if (isGiven) {
				const given = document.createElement('input');
				given.type = 'text';
				given.className = 'compare-cell-input compare-col-bold fc-compare-given-input';
				given.value = cellValue || '';
				given.readOnly = true;
				given.tabIndex = -1;
				td.appendChild(given);
			} else {
				const input = document.createElement('input');
				input.type = 'text';
				input.className = 'compare-cell-input fc-compare-input';
				input.dataset.row = String(rowIndex);
				input.dataset.col = String(colIndex);
				input.dataset.correct = cellValue || '';
				td.appendChild(input);
			}
			tr.appendChild(td);
		});
		table.appendChild(tr);
	});

	container.appendChild(table);
}

function renderCompareStudyAnswer(container, questionContainer) {
	if (!container || !questionContainer) return;
	container.innerHTML = '';

	const rows = Array.from(questionContainer.querySelectorAll('.fc-compare-table tr'));
	if (!rows.length) return;

	const resultTable = document.createElement('table');
	resultTable.className = 'fc-compare-table compare-table fc-compare-result-table';

	rows.forEach((srcRow) => {
		const tr = document.createElement('tr');
		Array.from(srcRow.children).forEach((srcCell) => {
			const td = document.createElement('td');
			const input = srcCell.querySelector('input.fc-compare-input');
			if (!input) {
				const givenInput = srcCell.querySelector('input.fc-compare-given-input, input.compare-cell-input');
				const out = document.createElement('input');
				out.type = 'text';
				out.className = 'compare-cell-input compare-col-bold fc-compare-given-input fc-compare-answer-input';
				out.value = givenInput ? (givenInput.value || '') : (srcCell.textContent || '');
				out.readOnly = true;
				out.tabIndex = -1;
				td.appendChild(out);
			} else {
				const correctValue = (input.dataset.correct || '').trim();
				const out = document.createElement('input');
				out.type = 'text';
				out.className = 'compare-cell-input fc-compare-answer-input';
				out.value = correctValue;
				out.readOnly = true;
				out.tabIndex = -1;
				td.appendChild(out);
			}
			tr.appendChild(td);
		});
		resultTable.appendChild(tr);
	});
	container.appendChild(resultTable);
}

function updateFlashcardDisplay() {
	const cards = getActiveStudyCards();
    
	if (currentFlashcardIndex >= cards.length) currentFlashcardIndex = 0;
    
	const cardData = cards[currentFlashcardIndex];
	const fcFront = document.querySelector('.card__face--front');
	const fcBack = document.querySelector('.card__face--back');
	const fcCard = document.querySelector('.card');
	const answerContainer = document.getElementById('fc-answer');
	const revealBtn = document.getElementById('fc-reveal-btn');
	const questionContainer = document.getElementById('fc-question');
	const scene = document.querySelector('.scene');
	const isFillBlank = cardData && cardData.type === 'fill-blank';

	isFlashcardAnswerVisible = false;
	resetScratchpad();

	if (!cardData) {
		if (fcFront) fcFront.textContent = 'No cards for this mode yet.';
		if (fcBack) fcBack.textContent = '';
		if (answerContainer) answerContainer.classList.remove('show');
		if (revealBtn) revealBtn.style.display = 'none';
		if (questionContainer) questionContainer.style.display = 'none';
		if (fcCard) {
			fcCard.classList.remove('is-flipped');
			fcCard.classList.remove('is-fill-blank');
		}
		return;
	}

	if (flashcardStudyMode !== 'flashcards') {
		if (scene) scene.style.display = 'none';
		if (questionContainer) questionContainer.style.display = 'block';
		if (revealBtn) revealBtn.style.display = 'inline-flex';
		if (answerContainer) answerContainer.classList.remove('show');
		if (revealBtn) revealBtn.textContent = 'Reveal Answer';
		if (cardData.studyType === 'compare-table') {
			renderCompareStudyQuestion(questionContainer, cardData);
			if (answerContainer) answerContainer.innerHTML = '';
		} else {
			renderCardContent(questionContainer, cardData.front || '', cardData.frontImage || '');
			renderCardContent(answerContainer, cardData.back || '', cardData.backImage || '');
		}
		if (fcCard) {
			fcCard.classList.remove('is-flipped');
			fcCard.classList.remove('is-fill-blank');
		}
		return;
	}

	if (scene) scene.style.display = 'block';
	if (questionContainer) questionContainer.style.display = 'none';
    
	if (isFillBlank) {
		fcCard.classList.add('is-fill-blank');
		if (revealBtn) revealBtn.style.display = 'inline-flex';
		if (answerContainer) answerContainer.classList.remove('show');

		const frontText = cardData.front || '';
		const parts = frontText.split(/_{3,}/g);
		const hasBlanks = parts.length > 1;
		const fragment = document.createDocumentFragment();
		parts.forEach((part, index) => {
			const span = document.createElement('span');
			span.textContent = part;
			fragment.appendChild(span);
			if (index < parts.length - 1) {
				const input = document.createElement('input');
				input.type = 'text';
				input.className = 'fc-blank-input';
				input.setAttribute('aria-label', 'Blank');
				fragment.appendChild(input);
			}
		});
		fcFront.innerHTML = '';
		fcFront.appendChild(fragment);
		if (!hasBlanks) {
			const hint = document.createElement('div');
			hint.className = 'fc-blank-hint';
			hint.textContent = 'Tip: use ___ in the front to add blanks.';
			fcFront.appendChild(hint);
		}
		const frontImageSrc = resolveFlashcardImageSrc(cardData.frontImage);
		if (frontImageSrc) {
			const img = document.createElement('img');
			img.className = 'fc-card-image';
			img.src = frontImageSrc;
			img.alt = 'Flashcard image';
			fcFront.appendChild(img);
		}

		renderCardContent(answerContainer, cardData.back || '', cardData.backImage || '');
	} else {
		fcCard.classList.remove('is-fill-blank');
		if (revealBtn) revealBtn.style.display = 'none';
		if (answerContainer) answerContainer.classList.remove('show');

		renderCardContent(fcFront, cardData.front || '...', cardData.frontImage || '');
		renderCardContent(fcBack, cardData.back || '...', cardData.backImage || '');
	}
    
	fcCard.classList.remove('is-flipped');
}

function navFlashcard(dir) {
	const cards = getActiveStudyCards();
	if (cards.length === 0) return;
    
	const card = document.querySelector('.card');
	const scene = document.querySelector('.scene');
	if (!card || !scene) return;
    
	// Remove any existing animation classes
	scene.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
    
	// Apply slide out animation based on direction
	const slideOutClass = dir > 0 ? 'slide-out-left' : 'slide-out-right';
	const slideInClass = dir > 0 ? 'slide-in-right' : 'slide-in-left';
    
	scene.classList.add(slideOutClass);
    
	// Wait for slide out animation to complete, then update content and slide in
	setTimeout(() => {
		// Update index
		currentFlashcardIndex += dir;
		if (currentFlashcardIndex < 0) currentFlashcardIndex = cards.length - 1;
		if (currentFlashcardIndex >= cards.length) currentFlashcardIndex = 0;
        
		// Update content without showing a flip animation
		card.classList.add('no-flip-transition');
		updateFlashcardDisplay();
        
		// Apply slide in animation
		scene.classList.remove(slideOutClass);
		scene.classList.add(slideInClass);
        
		// Clean up animation class after it completes
		setTimeout(() => {
			scene.classList.remove(slideInClass);
			card.classList.remove('no-flip-transition');
		}, 200);
	}, 200);
}

function flipCard() {
	const card = document.querySelector('.card');
	if (!card) return;
	if (flashcardStudyMode !== 'flashcards') return;
	if (card.classList.contains('is-fill-blank')) return;
	if (suppressNextCardFlip) {
		suppressNextCardFlip = false;
		return;
	}
	card.classList.toggle('is-flipped');
}

function toggleFlashcardAnswer() {
	const answerContainer = document.getElementById('fc-answer');
	if (!answerContainer) return;
	const cards = getActiveStudyCards();
	const cardData = cards[currentFlashcardIndex];
	if (flashcardStudyMode !== 'flashcards' && cardData && cardData.studyType === 'compare-table') {
		isFlashcardAnswerVisible = !isFlashcardAnswerVisible;
		if (isFlashcardAnswerVisible) {
			const questionContainer = document.getElementById('fc-question');
			renderCompareStudyAnswer(answerContainer, questionContainer);
		}
		answerContainer.classList.toggle('show', isFlashcardAnswerVisible);
		return;
	}
	isFlashcardAnswerVisible = !isFlashcardAnswerVisible;
	answerContainer.classList.toggle('show', isFlashcardAnswerVisible);
}

// Open edit modal for current card (triggered by 'e' key)
function openEditModal() {
	if (flashcardStudyMode !== 'flashcards') return;
	if (isFlashcardFullEditMode) return; // Only in practice mode
    
	const modal = document.getElementById('fc-edit-modal');
	const frontTextarea = document.getElementById('fc-modal-front');
	const backTextarea = document.getElementById('fc-modal-back');
	const typeSelect = document.getElementById('fc-modal-type');
	delete modal.dataset.editIndex;
    
	if (currentFlashcardData.flashcards && currentFlashcardData.flashcards.length > 0) {
		const card = currentFlashcardData.flashcards[currentFlashcardIndex];
		frontTextarea.value = card.front || '';
		backTextarea.value = card.back || '';
		if (typeSelect) typeSelect.value = card.type || 'basic';
		modalFrontImage = card.frontImage || '';
		modalBackImage = card.backImage || '';
	} else {
		frontTextarea.value = '';
		backTextarea.value = '';
		if (typeSelect) typeSelect.value = 'basic';
		modalFrontImage = '';
		modalBackImage = '';
	}
	updateImagePreview('front');
	updateImagePreview('back');
    
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
	const typeSelect = document.getElementById('fc-modal-type');
    
	const card = currentFlashcardData.flashcards[index];
	frontTextarea.value = card.front || '';
	backTextarea.value = card.back || '';
	if (typeSelect) typeSelect.value = card.type || 'basic';
	modalFrontImage = card.frontImage || '';
	modalBackImage = card.backImage || '';
    
	// Store the index for saving later
	modal.dataset.editIndex = index;
	updateImagePreview('front');
	updateImagePreview('back');
    
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
	const typeSelect = document.getElementById('fc-modal-type');
    
	if (!currentFlashcardData.flashcards) {
		currentFlashcardData.flashcards = [];
	}
    
	const frontVal = frontTextarea.value.trim();
	const backVal = backTextarea.value.trim();
	const typeVal = typeSelect ? typeSelect.value : 'basic';
    
	if (!frontVal && !backVal && !modalFrontImage && !modalBackImage) {
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
			currentFlashcardData.flashcards[index].type = typeVal;
			currentFlashcardData.flashcards[index].frontImage = modalFrontImage || '';
			currentFlashcardData.flashcards[index].backImage = modalBackImage || '';
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
			currentFlashcardData.flashcards[currentFlashcardIndex].type = typeVal;
			currentFlashcardData.flashcards[currentFlashcardIndex].frontImage = modalFrontImage || '';
			currentFlashcardData.flashcards[currentFlashcardIndex].backImage = modalBackImage || '';
		} else {
			// Add new card
			currentFlashcardData.flashcards.push({
				front: frontVal,
				back: backVal,
				type: typeVal,
				frontImage: modalFrontImage || '',
				backImage: modalBackImage || ''
			});
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
		const typeLabel = document.createElement('div');
		typeLabel.className = 'fc-card-type';
		typeLabel.textContent = (card.type === 'fill-blank') ? 'Fill in the blank' : 'Basic';
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
		frontField.appendChild(typeLabel);
		frontField.appendChild(frontContent);
		const frontImageSrc = resolveFlashcardImageSrc(card.frontImage);
		if (frontImageSrc) {
			const frontImg = document.createElement('img');
			frontImg.className = 'fc-card-image';
			frontImg.src = frontImageSrc;
			frontImg.alt = 'Front image';
			frontField.appendChild(frontImg);
		}
        
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
		const backImageSrc = resolveFlashcardImageSrc(card.backImage);
		if (backImageSrc) {
			const backImg = document.createElement('img');
			backImg.className = 'fc-card-image';
			backImg.src = backImageSrc;
			backImg.alt = 'Back image';
			backField.appendChild(backImg);
		}
        
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

// Click outside handler to hide hover panes
document.addEventListener('click', (e) => {
	const flashcardPage = document.getElementById('flashcard-page');
    
	// Handle flashcard hover panes
	if (flashcardPage && flashcardPage.classList.contains('active') && isFlashcardFullEditMode) {
		// Hide all flashcard hover panes when clicking outside
		if (!e.target.closest('.fc-card-item')) {
			document.querySelectorAll('.fc-card-hover-pane.show').forEach(pane => {
				pane.classList.remove('show');
			});
		}
	}
});

async function addNewCardInFullEdit() {
	if (!currentFlashcardData.flashcards) {
		currentFlashcardData.flashcards = [];
	}
	currentFlashcardData.flashcards.push({ front: '', back: '', type: 'basic' });
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

async function cleanupFlashcardImages() {
	if (!currentFlashcardData || !currentFlashcardData.flashcards) return;
	if (!fs || !path) {
		alert('Assets cleanup is only available in the desktop app.');
		return;
	}
	const assetsPath = ensureAssetsFolder();
	if (!assetsPath) return;

	const referenced = new Set();
	currentFlashcardData.flashcards.forEach(card => {
		[card.frontImage, card.backImage].forEach(value => {
			if (!value) return;
			let fileName = value;
			if (path.isAbsolute(value)) {
				fileName = path.basename(value);
			} else if (/^Assets[\\/]/i.test(value)) {
				fileName = value.replace(/^Assets[\\/]/i, '');
			} else if (/^file:\/\//i.test(value)) {
				try {
					const decoded = decodeURIComponent(value.replace(/^file:\/\//i, ''));
					fileName = path.basename(decoded);
				} catch (err) {
					fileName = path.basename(value);
				}
			}
			referenced.add(fileName);
		});
	});

	let entries = [];
	try {
		entries = fs.readdirSync(assetsPath).filter(name => /^fc_.*\.(png|jpe?g|gif|webp)$/i.test(name));
	} catch (err) {
		console.error('Failed to read Assets folder', err);
		alert('Failed to read Assets folder.');
		return;
	}

	const unused = entries.filter(name => !referenced.has(name));
	if (unused.length === 0) {
		showNotification && showNotification('No unused flashcard images found.');
		return;
	}

	if (!confirm(`Delete ${unused.length} unused flashcard image(s) from Assets? This cannot be undone.`)) return;
	let deleted = 0;
	unused.forEach(name => {
		try {
			fs.unlinkSync(path.join(assetsPath, name));
			deleted++;
		} catch (err) {
			console.warn('Failed to delete asset', name, err);
		}
	});
	if (showNotification) {
		showNotification(`Deleted ${deleted} unused flashcard image(s).`);
	} else {
		alert(`Deleted ${deleted} unused flashcard image(s).`);
	}
}

function debounce(func, wait) {
	let timeout;
	return function(...args) {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

function resolveFlashcardImageSrc(value) {
	if (!value) return '';
	if (/^https?:\/\//i.test(value)) return value;
	if (/^file:\/\//i.test(value)) return value;
	if (path && typeof path.isAbsolute === 'function' && path.isAbsolute(value)) {
		return 'file:///' + value.replace(/\\/g, '/');
	}
	const assetsPath = (typeof getAssetsFolderPath === 'function') ? getAssetsFolderPath() : null;
	if (!assetsPath || !path) return value;
	let rel = value;
	if (/^Assets[\\/]/i.test(rel)) {
		rel = rel.replace(/^Assets[\\/]/i, '');
	}
	const fullPath = path.join(assetsPath, rel);
	return 'file:///' + fullPath.replace(/\\/g, '/');
}

function ensureAssetsFolder() {
	const assetsPath = (typeof getAssetsFolderPath === 'function') ? getAssetsFolderPath() : null;
	if (!assetsPath || !fs || !path) {
		alert('Cannot save images until the note root is available. Open the note from the main folder view first.');
		return null;
	}
	if (!fs.existsSync(assetsPath)) {
		fs.mkdirSync(assetsPath, { recursive: true });
	}
	return assetsPath;
}

function sanitizeImageBaseName(name) {
	return String(name || 'image')
		.replace(/\.[^.]+$/, '')
		.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image';
}

function inferFlashcardImageExtension(fileOrBuffer, originalName, mimeOverride) {
	if (typeof inferImageExtension === 'function') {
		return inferImageExtension(fileOrBuffer, originalName);
	}
	const mimeType = (mimeOverride || (fileOrBuffer && fileOrBuffer.type) || '').toLowerCase();
	if (mimeType === 'image/jpeg') return '.jpg';
	if (mimeType === 'image/gif') return '.gif';
	if (mimeType === 'image/webp') return '.webp';
	return '.png';
}

async function saveFlashcardImageFileToAssets(file, originalName) {
	const assetsPath = ensureAssetsFolder();
	if (!assetsPath || typeof Buffer === 'undefined') return null;
	const ext = inferFlashcardImageExtension(file, originalName);
	const baseName = sanitizeImageBaseName(originalName || 'flashcard');
	const fileName = `fc_${Date.now()}_${baseName}${ext}`;
	const destPath = path.join(assetsPath, fileName);
	const arrayBuffer = await file.arrayBuffer();
	fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
	return `Assets/${fileName}`;
}

function updateImagePreview(side) {
	const preview = document.getElementById(side === 'front' ? 'fc-modal-front-image-preview' : 'fc-modal-back-image-preview');
	const dataUrl = side === 'front' ? modalFrontImage : modalBackImage;
	if (!preview) return;
	const resolved = resolveFlashcardImageSrc(dataUrl);
	if (resolved) {
		preview.src = resolved;
		preview.style.display = 'block';
	} else {
		preview.removeAttribute('src');
		preview.style.display = 'none';
	}
}

function setModalImage(side, dataUrl) {
	if (side === 'front') {
		modalFrontImage = dataUrl || '';
	} else {
		modalBackImage = dataUrl || '';
	}
	updateImagePreview(side);
}

function pickFlashcardImage(side, openAnnotator = false) {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/*';
	input.onchange = async () => {
		if (!input.files || !input.files[0]) return;
		const savedPath = await saveFlashcardImageFileToAssets(input.files[0], input.files[0].name || 'flashcard.png');
		if (!savedPath) return;
		setModalImage(side, savedPath);
		if (openAnnotator) {
			openImageAnnotator(side);
		}
	};
	input.click();
}

function removeFlashcardImage(side) {
	setModalImage(side, '');
}

function annotateFlashcardImage(side) {
	const dataUrl = side === 'front' ? modalFrontImage : modalBackImage;
	if (!dataUrl) {
		pickFlashcardImage(side, true);
		return;
	}
	openImageAnnotator(side);
}

function openImageAnnotator(side) {
	const modal = document.getElementById('fc-image-modal');
	const canvas = document.getElementById('fc-image-canvas');
	if (!modal || !canvas) return;
	const dataUrl = side === 'front' ? modalFrontImage : modalBackImage;
	if (!dataUrl) return;
	imageAnnotatorTarget = side;
	imageAnnotatorIsDrawing = false;
	imageAnnotatorLastPoint = null;
	const resolved = resolveFlashcardImageSrc(dataUrl);
	if (!resolved) return;
	modal.classList.add('show');
	loadImageIntoAnnotator(canvas, resolved);
}

function closeImageAnnotator() {
	const modal = document.getElementById('fc-image-modal');
	if (modal) modal.classList.remove('show');
	imageAnnotatorTarget = null;
	imageAnnotatorIsDrawing = false;
	imageAnnotatorLastPoint = null;
	imageAnnotatorIsPanning = false;
	imageAnnotatorPanStart = null;
	imageAnnotatorBaseCanvas = null;
	imageAnnotatorBaseCtx = null;
	imageAnnotatorImageRect = null;
}

async function saveImageAnnotator() {
	const canvas = document.getElementById('fc-image-canvas');
	if (!canvas || !imageAnnotatorTarget) {
		closeImageAnnotator();
		return;
	}
	const assetsPath = ensureAssetsFolder();
	if (!assetsPath || typeof Buffer === 'undefined') {
		closeImageAnnotator();
		return;
	}
	const fileName = `fc_${Date.now()}_annotated_${imageAnnotatorTarget}.png`;
	const destPath = path.join(assetsPath, fileName);
	const sourceCanvas = imageAnnotatorBaseCanvas || canvas;
	const croppedCanvas = cropCanvasToContent(sourceCanvas, 40);
	const dataUrl = croppedCanvas.toDataURL('image/png');
	const base64 = dataUrl.split(',')[1] || '';
	if (base64) {
		fs.writeFileSync(destPath, Buffer.from(base64, 'base64'));
		setModalImage(imageAnnotatorTarget, `Assets/${fileName}`);
	}
	closeImageAnnotator();
}

function cropCanvasToContent(canvas, padding) {
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;
	if (!w || !h) return canvas;
	const imgData = ctx.getImageData(0, 0, w, h);
	const data = imgData.data;
	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = (y * w + x) * 4;
			if (data[idx + 3] > 0) {
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
		}
	}

	if (maxX < minX || maxY < minY) return canvas;
	const pad = Math.max(0, parseInt(padding, 10) || 0);
	minX = Math.max(0, minX - pad);
	minY = Math.max(0, minY - pad);
	maxX = Math.min(w - 1, maxX + pad);
	maxY = Math.min(h - 1, maxY + pad);

	const outW = Math.max(1, maxX - minX + 1);
	const outH = Math.max(1, maxY - minY + 1);
	const outCanvas = document.createElement('canvas');
	outCanvas.width = outW;
	outCanvas.height = outH;
	const outCtx = outCanvas.getContext('2d');
	outCtx.drawImage(canvas, minX, minY, outW, outH, 0, 0, outW, outH);
	return outCanvas;
}

function loadImageIntoAnnotator(canvas, dataUrl) {
	const ctx = canvas.getContext('2d');
	const img = new Image();
	img.onload = () => {
		const maxW = 1600;
		const maxH = 1200;
		const scale = Math.min(1, maxW / img.width, maxH / img.height);
		const scaledW = Math.max(1, Math.round(img.width * scale));
		const scaledH = Math.max(1, Math.round(img.height * scale));
		const pad = Math.round(Math.max(400, Math.max(scaledW, scaledH) * 0.4));
		imageAnnotatorBaseCanvas = document.createElement('canvas');
		imageAnnotatorBaseCanvas.width = scaledW + pad * 2;
		imageAnnotatorBaseCanvas.height = scaledH + pad * 2;
		imageAnnotatorBaseCtx = imageAnnotatorBaseCanvas.getContext('2d');
		imageAnnotatorBaseCtx.drawImage(img, pad, pad, scaledW, scaledH);
		imageAnnotatorImageRect = {
			x: pad,
			y: pad,
			width: scaledW,
			height: scaledH
		};

		resizeAnnotatorViewport(canvas);
		imageAnnotatorView.scale = 1;
		imageAnnotatorView.offsetX = Math.max(0, (imageAnnotatorBaseCanvas.width - canvas.width) / 2);
		imageAnnotatorView.offsetY = Math.max(0, (imageAnnotatorBaseCanvas.height - canvas.height) / 2);
		renderAnnotatorView(canvas, ctx);
	};
	img.src = dataUrl;
}

function resizeAnnotatorViewport(canvas) {
	const wrap = canvas.parentElement;
	if (!wrap) return;
	const rect = wrap.getBoundingClientRect();
	const width = Math.max(320, Math.floor((rect.width || 900) - 24));
	const height = Math.max(240, Math.floor((rect.height || 600) - 24));
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
}

function renderAnnotatorView(canvas, ctx) {
	if (!imageAnnotatorBaseCanvas) return;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.setTransform(
		imageAnnotatorView.scale,
		0,
		0,
		imageAnnotatorView.scale,
		-imageAnnotatorView.offsetX * imageAnnotatorView.scale,
		-imageAnnotatorView.offsetY * imageAnnotatorView.scale
	);
	ctx.drawImage(imageAnnotatorBaseCanvas, 0, 0);
	ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function screenToWorld(point) {
	return {
		x: point.x / imageAnnotatorView.scale + imageAnnotatorView.offsetX,
		y: point.y / imageAnnotatorView.scale + imageAnnotatorView.offsetY
	};
}

function ensureAnnotatorWorldBounds(point) {
	if (!imageAnnotatorBaseCanvas || !imageAnnotatorBaseCtx) return { dx: 0, dy: 0 };
	const margin = 200;
	const grow = 1200;
	let addLeft = 0;
	let addTop = 0;
	let addRight = 0;
	let addBottom = 0;

	if (point.x < margin) addLeft = grow;
	if (point.y < margin) addTop = grow;
	if (point.x > imageAnnotatorBaseCanvas.width - margin) addRight = grow;
	if (point.y > imageAnnotatorBaseCanvas.height - margin) addBottom = grow;

	if (!addLeft && !addTop && !addRight && !addBottom) return { dx: 0, dy: 0 };

	const newCanvas = document.createElement('canvas');
	newCanvas.width = imageAnnotatorBaseCanvas.width + addLeft + addRight;
	newCanvas.height = imageAnnotatorBaseCanvas.height + addTop + addBottom;
	const newCtx = newCanvas.getContext('2d');
	newCtx.drawImage(imageAnnotatorBaseCanvas, addLeft, addTop);

	if (imageAnnotatorImageRect) {
		imageAnnotatorImageRect.x += addLeft;
		imageAnnotatorImageRect.y += addTop;
	}

	imageAnnotatorBaseCanvas = newCanvas;
	imageAnnotatorBaseCtx = newCtx;
	imageAnnotatorView.offsetX += addLeft;
	imageAnnotatorView.offsetY += addTop;
	return { dx: addLeft, dy: addTop };
}

function getAnnotatorPoint(canvas, e) {
	const rect = canvas.getBoundingClientRect();
	return {
		x: e.clientX - rect.left,
		y: e.clientY - rect.top
	};
}

function getCanvasPoint(canvas, e) {
	const rect = canvas.getBoundingClientRect();
	const scaleX = rect.width ? canvas.width / rect.width : 1;
	const scaleY = rect.height ? canvas.height / rect.height : 1;
	return {
		x: (e.clientX - rect.left) * scaleX,
		y: (e.clientY - rect.top) * scaleY
	};
}

function applyFlashcardImageZoom(imgEl, delta) {
	if (!imgEl) return;
	const current = parseFloat(imgEl.dataset.zoom || '1');
	const next = Math.max(1, Math.min(6, current + delta));
	imgEl.dataset.zoom = String(next);
	const panX = parseFloat(imgEl.dataset.panX || '0');
	const panY = parseFloat(imgEl.dataset.panY || '0');
	imgEl.style.transformOrigin = 'center center';
	imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${next})`;
}

function applyFlashcardImagePan(imgEl, dx, dy) {
	if (!imgEl) return;
	const zoom = parseFloat(imgEl.dataset.zoom || '1');
	if (zoom <= 1) return;
	const panX = parseFloat(imgEl.dataset.panX || '0') + dx;
	const panY = parseFloat(imgEl.dataset.panY || '0') + dy;
	imgEl.dataset.panX = String(panX);
	imgEl.dataset.panY = String(panY);
	imgEl.style.transformOrigin = 'center center';
	imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function setScratchpadMode(mode) {
	const text = document.getElementById('fc-scratchpad-text');
	const canvas = document.getElementById('fc-scratchpad-canvas');
	if (!text || !canvas) return;
	scratchpadMode = mode === 'draw' ? 'draw' : 'text';
	text.style.display = scratchpadMode === 'text' ? 'block' : 'none';
	canvas.style.display = scratchpadMode === 'draw' ? 'block' : 'none';
}

function clearScratchpad() {
	const text = document.getElementById('fc-scratchpad-text');
	const canvas = document.getElementById('fc-scratchpad-canvas');
	if (text) text.value = '';
	if (canvas) {
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}
}

function resetScratchpad() {
	clearScratchpad();
}

function resizeScratchpadCanvas() {
	const canvas = document.getElementById('fc-scratchpad-canvas');
	if (!canvas) return;
	const wrap = canvas.parentElement;
	if (!wrap) return;
	const rect = wrap.getBoundingClientRect();
	const width = Math.max(200, Math.floor(rect.width - 20));
	const height = Math.max(120, Math.floor(rect.height - 120));
	const dpr = Math.max(1, window.devicePixelRatio || 1);
	const targetW = Math.floor(width * dpr);
	const targetH = Math.floor(height * dpr);
	if (canvas.width !== targetW || canvas.height !== targetH) {
		canvas.width = targetW;
		canvas.height = targetH;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		const ctx = canvas.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
	}
}

function snapScratchpadToEdge(panel) {
	const margin = 16;
	const rect = panel.getBoundingClientRect();
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const distances = [
		{ edge: 'left', value: rect.left },
		{ edge: 'right', value: vw - rect.right },
		{ edge: 'top', value: rect.top },
		{ edge: 'bottom', value: vh - rect.bottom }
	];
	let nearest = distances[0];
	for (let i = 1; i < distances.length; i++) {
		if (distances[i].value < nearest.value) nearest = distances[i];
	}
	if (nearest.edge === 'left') {
		panel.style.left = `${margin}px`;
		panel.style.top = `${Math.min(Math.max(rect.top, margin), vh - rect.height - margin)}px`;
	} else if (nearest.edge === 'right') {
		panel.style.left = `${Math.max(margin, vw - rect.width - margin)}px`;
		panel.style.top = `${Math.min(Math.max(rect.top, margin), vh - rect.height - margin)}px`;
	} else if (nearest.edge === 'top') {
		panel.style.top = `${margin}px`;
		panel.style.left = `${Math.min(Math.max(rect.left, margin), vw - rect.width - margin)}px`;
	} else {
		panel.style.top = `${Math.max(margin, vh - rect.height - margin)}px`;
		panel.style.left = `${Math.min(Math.max(rect.left, margin), vw - rect.width - margin)}px`;
	}
}

// Add click handler for flip card
document.addEventListener('DOMContentLoaded', () => {
	const scene = document.querySelector('.scene');
	if (scene) {
		scene.addEventListener('click', flipCard);
	}
    
	// Modal close handlers
	const modal = document.getElementById('fc-edit-modal');

	const imageModal = document.getElementById('fc-image-modal');
	if (imageModal) {
		imageModal.addEventListener('click', (e) => {
			if (e.target === imageModal) closeImageAnnotator();
		});
	}

	const flashcardPageEl = document.getElementById('flashcard-page');
	if (flashcardPageEl) {
		flashcardPageEl.addEventListener('wheel', (e) => {
			if (!e.ctrlKey) return;
			const img = e.target && e.target.closest ? e.target.closest('img.fc-card-image') : null;
			if (!img) return;
			e.preventDefault();
			const delta = e.deltaY < 0 ? 0.1 : -0.1;
			applyFlashcardImageZoom(img, delta);
		}, { passive: false });

		let panTarget = null;
		let panStart = null;

		flashcardPageEl.addEventListener('pointerdown', (e) => {
			const img = e.target && e.target.closest ? e.target.closest('img.fc-card-image') : null;
			if (!img) return;
			const zoom = parseFloat(img.dataset.zoom || '1');
			if (zoom <= 1) return;
			suppressNextCardFlip = true;
			panTarget = img;
			panStart = { x: e.clientX, y: e.clientY };
			img.setPointerCapture && img.setPointerCapture(e.pointerId);
			e.stopPropagation();
			e.preventDefault();
		});

		flashcardPageEl.addEventListener('pointermove', (e) => {
			if (!panTarget || !panStart) return;
			const dx = e.clientX - panStart.x;
			const dy = e.clientY - panStart.y;
			panStart = { x: e.clientX, y: e.clientY };
			applyFlashcardImagePan(panTarget, dx, dy);
			e.stopPropagation();
		});

		const stopPan = (e) => {
			if (panTarget && panTarget.releasePointerCapture && e.pointerId) {
				try { panTarget.releasePointerCapture(e.pointerId); } catch (err) {}
			}
			panTarget = null;
			panStart = null;
		};
		flashcardPageEl.addEventListener('pointerup', stopPan);
		flashcardPageEl.addEventListener('pointercancel', stopPan);
		flashcardPageEl.addEventListener('pointerleave', stopPan);
	}

	const scratchpad = document.getElementById('fc-scratchpad');
	const scratchHeader = document.getElementById('fc-scratchpad-header');
	const scratchCanvas = document.getElementById('fc-scratchpad-canvas');
	if (scratchpad && scratchHeader && scratchCanvas) {
		setScratchpadMode('text');
		resizeScratchpadCanvas();

		scratchHeader.addEventListener('pointerdown', (e) => {
			if (e.target && e.target.closest && e.target.closest('.fc-scratchpad-actions')) {
				return;
			}
			scratchpadDragState = {
				startX: e.clientX,
				startY: e.clientY,
				origLeft: scratchpad.offsetLeft,
				origTop: scratchpad.offsetTop
			};
			scratchHeader.setPointerCapture(e.pointerId);
			e.preventDefault();
		});
		scratchHeader.addEventListener('pointermove', (e) => {
			if (!scratchpadDragState) return;
			const dx = e.clientX - scratchpadDragState.startX;
			const dy = e.clientY - scratchpadDragState.startY;
			scratchpad.style.left = `${scratchpadDragState.origLeft + dx}px`;
			scratchpad.style.top = `${scratchpadDragState.origTop + dy}px`;
		});
		scratchHeader.addEventListener('pointerup', (e) => {
			if (scratchHeader.hasPointerCapture(e.pointerId)) {
				scratchHeader.releasePointerCapture(e.pointerId);
			}
			scratchpadDragState = null;
			snapScratchpadToEdge(scratchpad);
		});
		scratchHeader.addEventListener('pointercancel', () => {
			scratchpadDragState = null;
		});

		scratchCanvas.addEventListener('pointerdown', (e) => {
			if (scratchpadMode !== 'draw') return;
			scratchpadIsDrawing = true;
			scratchpadLastPoint = getCanvasPoint(scratchCanvas, e);
			scratchCanvas.setPointerCapture(e.pointerId);
		});
		scratchCanvas.addEventListener('pointermove', (e) => {
			if (!scratchpadIsDrawing || scratchpadMode !== 'draw') return;
			const point = getCanvasPoint(scratchCanvas, e);
			const ctx = scratchCanvas.getContext('2d');
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			ctx.moveTo(scratchpadLastPoint.x, scratchpadLastPoint.y);
			ctx.lineTo(point.x, point.y);
			ctx.stroke();
			scratchpadLastPoint = point;
		});
		const stopScratchDraw = (e) => {
			if (scratchCanvas.hasPointerCapture(e.pointerId)) {
				scratchCanvas.releasePointerCapture(e.pointerId);
			}
			scratchpadIsDrawing = false;
			scratchpadLastPoint = null;
		};
		scratchCanvas.addEventListener('pointerup', stopScratchDraw);
		scratchCanvas.addEventListener('pointerleave', stopScratchDraw);
		scratchCanvas.addEventListener('pointercancel', stopScratchDraw);

		window.addEventListener('resize', () => {
			resizeScratchpadCanvas();
		});
	}

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			const editModal = document.getElementById('fc-edit-modal');
			if (editModal && editModal.classList.contains('show')) {
				closeEditModal();
			}
			const imgModal = document.getElementById('fc-image-modal');
			if (imgModal && imgModal.classList.contains('show')) {
				closeImageAnnotator();
			}
			return;
		}

		if (e.code !== 'Space') return;
		const flashcardPage = document.getElementById('flashcard-page');
		if (!flashcardPage || !flashcardPage.classList.contains('active')) return;
		if (flashcardStudyMode === 'flashcards') {
			const cards = getActiveStudyCards();
			const card = cards[currentFlashcardIndex];
			if (!card || card.type !== 'fill-blank') return;
			e.preventDefault();
			toggleFlashcardAnswer();
			return;
		}
		if (isFlashcardFullEditMode) return;
		if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
			return;
		}
		e.preventDefault();
		toggleFlashcardAnswer();
	});

	const canvas = document.getElementById('fc-image-canvas');
	if (canvas) {
		const ctx = canvas.getContext('2d');
		const colorInput = document.getElementById('fc-image-color');
		const sizeSelect = document.getElementById('fc-image-size');
		const redraw = () => renderAnnotatorView(canvas, ctx);

		const panStart = (e) => {
			imageAnnotatorIsPanning = true;
			imageAnnotatorPanStart = {
				x: e.clientX,
				y: e.clientY,
				offsetX: imageAnnotatorView.offsetX,
				offsetY: imageAnnotatorView.offsetY
			};
			canvas.setPointerCapture(e.pointerId);
		};

		canvas.addEventListener('pointerdown', (e) => {
			if (e.button === 1 || e.button === 2 || e.shiftKey) {
				panStart(e);
				return;
			}
			imageAnnotatorIsDrawing = true;
			imageAnnotatorLastPoint = getAnnotatorPoint(canvas, e);
			canvas.setPointerCapture(e.pointerId);
		});
		canvas.addEventListener('pointermove', (e) => {
			if (imageAnnotatorIsPanning && imageAnnotatorPanStart) {
				const dx = (e.clientX - imageAnnotatorPanStart.x) / imageAnnotatorView.scale;
				const dy = (e.clientY - imageAnnotatorPanStart.y) / imageAnnotatorView.scale;
				imageAnnotatorView.offsetX = imageAnnotatorPanStart.offsetX - dx;
				imageAnnotatorView.offsetY = imageAnnotatorPanStart.offsetY - dy;
				redraw();
				return;
			}
			if (!imageAnnotatorIsDrawing || !imageAnnotatorLastPoint || !imageAnnotatorBaseCtx) return;
			const point = getAnnotatorPoint(canvas, e);
			let worldPrev = screenToWorld(imageAnnotatorLastPoint);
			let worldNext = screenToWorld(point);
			const shift = ensureAnnotatorWorldBounds(worldNext);
			if (shift.dx || shift.dy) {
				worldPrev = { x: worldPrev.x + shift.dx, y: worldPrev.y + shift.dy };
				worldNext = { x: worldNext.x + shift.dx, y: worldNext.y + shift.dy };
			}
			imageAnnotatorBaseCtx.strokeStyle = colorInput ? colorInput.value : '#ffffff';
			const baseLineWidth = sizeSelect ? parseInt(sizeSelect.value, 10) || 4 : 4;
			imageAnnotatorBaseCtx.lineWidth = baseLineWidth / imageAnnotatorView.scale;
			imageAnnotatorBaseCtx.lineCap = 'round';
			imageAnnotatorBaseCtx.lineJoin = 'round';
			imageAnnotatorBaseCtx.beginPath();
			imageAnnotatorBaseCtx.moveTo(worldPrev.x, worldPrev.y);
			imageAnnotatorBaseCtx.lineTo(worldNext.x, worldNext.y);
			imageAnnotatorBaseCtx.stroke();
			imageAnnotatorLastPoint = point;
			redraw();
		});
		const stopDraw = (e) => {
			if (canvas.hasPointerCapture(e.pointerId)) {
				canvas.releasePointerCapture(e.pointerId);
			}
			imageAnnotatorIsDrawing = false;
			imageAnnotatorIsPanning = false;
			imageAnnotatorLastPoint = null;
			imageAnnotatorPanStart = null;
		};
		canvas.addEventListener('pointerup', stopDraw);
		canvas.addEventListener('pointerleave', stopDraw);
		canvas.addEventListener('pointercancel', stopDraw);

		canvas.addEventListener('wheel', (e) => {
			if (!imageAnnotatorBaseCanvas) return;
			e.preventDefault();
			const point = getAnnotatorPoint(canvas, e);
			const world = screenToWorld(point);
			const zoom = Math.exp(-e.deltaY * 0.0015);
			const nextScale = Math.max(0.2, Math.min(6, imageAnnotatorView.scale * zoom));
			imageAnnotatorView.scale = nextScale;
			imageAnnotatorView.offsetX = world.x - point.x / imageAnnotatorView.scale;
			imageAnnotatorView.offsetY = world.y - point.y / imageAnnotatorView.scale;
			redraw();
		}, { passive: false });

		canvas.addEventListener('contextmenu', (e) => {
			e.preventDefault();
		});

		window.addEventListener('resize', () => {
			resizeAnnotatorViewport(canvas);
			redraw();
		});
	}
});

async function deleteFlashcard() {
	if (!currentFlashcardData.flashcards || currentFlashcardData.flashcards.length === 0) return;
	if (confirm("Delete this card?")) {
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
