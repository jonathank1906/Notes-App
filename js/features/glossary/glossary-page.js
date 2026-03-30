// Glossary page behavior and persistence.

const glossaryPage = document.createElement('div');
glossaryPage.id = 'glossary-page';
glossaryPage.innerHTML = `
	<div class="glossary-container">
		<div class="glossary-header">
			<h1 id="glossary-title">Glossary</h1>
			<button class="glossary-add-trigger" id="glossary-open-add" type="button" aria-label="Add entry">
				<span class="glossary-add-plus">+</span>
				<span class="glossary-add-text">Add</span>
			</button>
		</div>

		<div class="glossary-search-center">
			<div class="glossary-search-wrap">
				<div class="glossary-search-icon" aria-hidden="true">
					<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
						<path d="M10 2.25a7.75 7.75 0 1 0 4.924 13.735l5.546 5.545 1.06-1.06-5.545-5.546A7.75 7.75 0 0 0 10 2.25ZM3.75 10a6.25 6.25 0 1 1 12.5 0 6.25 6.25 0 0 1-12.5 0Z"/>
					</svg>
				</div>
				<input id="glossary-search-input" type="text" placeholder="Search glossary..." oninput="filterGlossary()">
			</div>
			<div class="glossary-search-meta">
				<span>Search matches term or definition.</span>
				<span id="glossary-search-count"></span>
			</div>
		</div>

		<div id="glossary-alpha-rail" aria-label="Glossary alphabet shortcuts"></div>
        
		<div class="glossary-list" id="glossary-list"></div>
	</div>
    
	<!-- Glossary Edit Modal -->
	<div id="glossary-edit-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;align-items:center;justify-content:center;">
		<div class="fc-modal-content">
			<div class="fc-modal-header">
				<div class="fc-modal-title">Edit Glossary Entry</div>
				<button class="fc-modal-close" onclick="closeGlossaryEditModal()">&times;</button>
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

	<div id="glossary-add-modal" class="glossary-modal" aria-hidden="true">
		<div class="glossary-modal-card" role="dialog" aria-modal="true" aria-labelledby="glossary-add-title">
			<div class="glossary-modal-header">
				<div class="glossary-modal-title" id="glossary-add-title">Add glossary entry</div>
				<button class="glossary-modal-close" id="glossary-add-close" type="button" aria-label="Close add entry">&times;</button>
			</div>
			<div class="glossary-modal-body">
				<div class="glossary-input-row">
					<label class="glossary-label" for="glossary-term-input">Term</label>
					<input type="text" class="glossary-input" id="glossary-term-input" placeholder="e.g. Newton's Third Law">
				</div>
				<div class="glossary-input-row">
					<label class="glossary-label" for="glossary-def-input">Definition</label>
					<textarea class="glossary-textarea" id="glossary-def-input" placeholder="Definition (Markdown supported)"></textarea>
					<div class="glossary-meta">
						<span class="glossary-hint">Markdown supported. Press Ctrl+Enter to add.</span>
					</div>
				</div>
			</div>
			<div class="glossary-modal-footer">
				<div class="glossary-modal-actions">
					<span class="glossary-status" id="glossary-add-status"></span>
					<button class="glossary-add-btn" id="glossary-add-btn" onclick="addGlossaryEntry()">Add Entry</button>
				</div>
			</div>
		</div>
	</div>

	<button id="glossary-scroll-top-btn" class="compare-scroll-top-btn" onclick="scrollGlossaryToTop()" aria-label="Back to top" title="Back to top">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 19V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<path d="M7 12l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</button>
`;
document.body.appendChild(glossaryPage);

let currentGlossaryData = null;
let currentGlossaryHandle = null;
const GLOSSARY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
let glossaryRailHideTimer = null;
let glossaryTopInitialized = false;
let glossaryStatusTimer = null;

document.getElementById('glossary-page')?.addEventListener('scroll', updateGlossaryScrollTopButtonVisibility, { passive: true });

function updateGlossaryScrollTopButtonVisibility() {
	const page = document.getElementById('glossary-page');
	const btn = document.getElementById('glossary-scroll-top-btn');
	if (!page || !btn) return;
	const shouldShow = page.classList.contains('active') && page.scrollTop > 140;
	btn.classList.toggle('show', shouldShow);
}

function scrollGlossaryToTop() {
	const page = document.getElementById('glossary-page');
	if (!page) return;
	page.scrollTo({ top: 0, behavior: 'smooth' });
}

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

function initGlossaryTopControls() {
	if (glossaryTopInitialized) return;
	glossaryTopInitialized = true;

	const openBtn = document.getElementById('glossary-open-add');
	const closeBtn = document.getElementById('glossary-add-close');
	const modal = document.getElementById('glossary-add-modal');
	const termInput = document.getElementById('glossary-term-input');
	const defInput = document.getElementById('glossary-def-input');
	const addBtn = document.getElementById('glossary-add-btn');
	const searchInput = document.getElementById('glossary-search-input');

	if (!openBtn || !closeBtn || !modal || !termInput || !defInput || !addBtn || !searchInput) return;

	const openModal = () => {
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		setTimeout(() => termInput.focus(), 0);
	};

	const closeModal = () => {
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden', 'true');
	};

	openBtn.addEventListener('click', openModal);
	closeBtn.addEventListener('click', closeModal);

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && modal.classList.contains('show')) {
			closeModal();
		}
	});

	const updateAddState = () => {
		const termVal = termInput.value.trim();
		const defVal = defInput.value.trim();
		addBtn.disabled = !(termVal && defVal);
		addBtn.classList.toggle('disabled', addBtn.disabled);
	};

	termInput.addEventListener('input', updateAddState);
	defInput.addEventListener('input', updateAddState);

	termInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			defInput.focus();
		}
	});

	defInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && e.ctrlKey) {
			e.preventDefault();
			addGlossaryEntry();
		}
	});

	updateAddState();
}

function showGlossaryAddStatus(message, tone) {
	const statusEl = document.getElementById('glossary-add-status');
	if (!statusEl) return;

	statusEl.textContent = message || '';
	statusEl.classList.toggle('error', tone === 'error');
	statusEl.classList.toggle('muted', tone === 'muted');

	if (glossaryStatusTimer) {
		clearTimeout(glossaryStatusTimer);
	}
	if (message) {
		glossaryStatusTimer = setTimeout(() => {
			statusEl.textContent = '';
			statusEl.classList.remove('error', 'muted');
		}, 2500);
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

	initGlossaryTopControls();
	initGlossaryAlphabetRail();
    
	renderGlossaryList();
	updateGlossaryScrollTopButtonVisibility();
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
	updateGlossaryScrollTopButtonVisibility();
}

function renderGlossaryList() {
	const listDiv = document.getElementById('glossary-list');
	const searchTerm = document.getElementById('glossary-search-input').value.toLowerCase();
	const searchCountEl = document.getElementById('glossary-search-count');
	initGlossaryAlphabetRail();
	const totalCount = currentGlossaryData && currentGlossaryData.glossary ? currentGlossaryData.glossary.length : 0;
    
	if (!currentGlossaryData || !currentGlossaryData.glossary || currentGlossaryData.glossary.length === 0) {
		listDiv.innerHTML = '<p style="color:#666;text-align:center;">No glossary entries yet. Add one above.</p>';
		if (searchCountEl) searchCountEl.textContent = `0 / ${totalCount}`;
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
		if (searchCountEl) searchCountEl.textContent = `0 / ${totalCount}`;
		updateGlossaryAlphabetRailState();
		return;
	}

	if (searchCountEl) searchCountEl.textContent = `${filteredGlossary.length} / ${totalCount}`;
    
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
		showGlossaryAddStatus('Missing term or definition', 'error');
		return;
	}
    
	if (!currentGlossaryData.glossary) {
		currentGlossaryData.glossary = [];
	}

	const termKey = term.toLowerCase();
	const existingIndex = currentGlossaryData.glossary.findIndex(entry =>
		(entry.term || '').trim().toLowerCase() === termKey
	);

	if (existingIndex >= 0) {
		const replace = confirm('That term already exists. Replace its definition?');
		if (!replace) {
			showGlossaryAddStatus('Duplicate term kept', 'muted');
			return;
		}
		currentGlossaryData.glossary[existingIndex] = { term, definition };
	} else {
		currentGlossaryData.glossary.push({ term, definition });
	}
	await saveGlossaryData();
    
	document.getElementById('glossary-term-input').value = '';
	document.getElementById('glossary-def-input').value = '';
	const termInput = document.getElementById('glossary-term-input');
	const defInput = document.getElementById('glossary-def-input');
	if (termInput) termInput.dispatchEvent(new Event('input'));
	if (defInput) defInput.dispatchEvent(new Event('input'));
	showGlossaryAddStatus(existingIndex >= 0 ? 'Entry updated' : 'Entry added');
    
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

// Click outside handler to hide glossary hover panes
document.addEventListener('click', (e) => {
	const glossaryPageEl = document.getElementById('glossary-page');
	if (glossaryPageEl && glossaryPageEl.classList.contains('active')) {
		if (!e.target.closest('.glossary-item')) {
			document.querySelectorAll('.glossary-hover-pane.show').forEach(pane => {
				pane.classList.remove('show');
			});
		}
	}
});
