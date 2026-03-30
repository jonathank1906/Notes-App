// Flashcard page behavior and persistence.

const flashcardPage = document.createElement('div');
flashcardPage.id = 'flashcard-page';
flashcardPage.innerHTML = `
	<button class="fc-mode-toggle" onclick="toggleFlashcardEditMode()">Edit All Cards</button>
	<div class="fc-study-modes" id="fc-study-modes">
		<button class="fc-study-btn" data-mode="flashcards" onclick="setFlashcardStudyMode('flashcards')">Study Flashcards</button>
		<button class="fc-study-btn" data-mode="definitions" onclick="setFlashcardStudyMode('definitions')">Study Definitions</button>
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
			<div class="fc-modal-actions">
				<button class="fc-btn" onclick="closeEditModal()">Cancel</button>
				<button class="fc-btn" onclick="saveEditModal()" style="border-color:#8af; color:#8af;">Save (Ctrl+Enter)</button>
			</div>
		</div>
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

function openFlashcard(fileHandle, data, fileName = null) {
	currentFlashcardHandle = fileHandle;
	currentFlashcardData = data;
	currentFlashcardIndex = 0;
	isFlashcardFullEditMode = false;
	flashcardStudyMode = 'flashcards';
	glossaryLoadedForStudy = false;
	cachedGlossaryEntries = [];
    
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
		updateStudyModeControls();
		updateFlashcardDisplay();
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
		} else if (flashcardStudyMode === 'all') {
			hint.textContent = 'Glossary entries are read-only; flashcards are editable.';
		} else {
			hint.textContent = '';
		}
	}
}

async function setFlashcardStudyMode(mode) {
	flashcardStudyMode = mode;
	currentFlashcardIndex = 0;
	updateStudyModeControls();
	if (mode !== 'flashcards') {
		await ensureGlossaryLoadedForStudy();
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

function getActiveStudyCards() {
	const flashcards = currentFlashcardData.flashcards || [];
	const glossaryCards = cachedGlossaryEntries.map(entry => ({
		front: entry.term || '',
		back: entry.definition || '',
		type: 'basic'
	}));

	if (flashcardStudyMode === 'definitions') {
		return glossaryCards;
	}
	if (flashcardStudyMode === 'all') {
		return [...flashcards, ...glossaryCards];
	}
	return flashcards;
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
		try {
			if (questionContainer) questionContainer.innerHTML = marked.parse(cardData.front || '');
		} catch (e) {
			if (questionContainer) questionContainer.textContent = cardData.front || '';
		}
		try {
			if (answerContainer) answerContainer.innerHTML = marked.parse(cardData.back || '');
		} catch (e) {
			if (answerContainer) answerContainer.textContent = cardData.back || '';
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

		try {
			if (answerContainer) answerContainer.innerHTML = marked.parse(cardData.back || '');
		} catch (e) {
			if (answerContainer) answerContainer.textContent = cardData.back || '';
		}
	} else {
		fcCard.classList.remove('is-fill-blank');
		if (revealBtn) revealBtn.style.display = 'none';
		if (answerContainer) answerContainer.classList.remove('show');

		// Render markdown
		try {
			fcFront.innerHTML = marked.parse(cardData.front || "...");
			fcBack.innerHTML = marked.parse(cardData.back || "...");
		} catch (e) {
			// Fallback if marked not loaded
			fcFront.textContent = cardData.front || "...";
			fcBack.textContent = cardData.back || "...";
		}
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
	card.classList.toggle('is-flipped');
}

function toggleFlashcardAnswer() {
	const answerContainer = document.getElementById('fc-answer');
	if (!answerContainer) return;
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
    
	if (currentFlashcardData.flashcards && currentFlashcardData.flashcards.length > 0) {
		const card = currentFlashcardData.flashcards[currentFlashcardIndex];
		frontTextarea.value = card.front || '';
		backTextarea.value = card.back || '';
		if (typeSelect) typeSelect.value = card.type || 'basic';
	} else {
		frontTextarea.value = '';
		backTextarea.value = '';
		if (typeSelect) typeSelect.value = 'basic';
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
	const typeSelect = document.getElementById('fc-modal-type');
    
	const card = currentFlashcardData.flashcards[index];
	frontTextarea.value = card.front || '';
	backTextarea.value = card.back || '';
	if (typeSelect) typeSelect.value = card.type || 'basic';
    
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
	const typeSelect = document.getElementById('fc-modal-type');
    
	if (!currentFlashcardData.flashcards) {
		currentFlashcardData.flashcards = [];
	}
    
	const frontVal = frontTextarea.value.trim();
	const backVal = backTextarea.value.trim();
	const typeVal = typeSelect ? typeSelect.value : 'basic';
    
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
			currentFlashcardData.flashcards[index].type = typeVal;
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
		} else {
			// Add new card
			currentFlashcardData.flashcards.push({ front: frontVal, back: backVal, type: typeVal });
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
