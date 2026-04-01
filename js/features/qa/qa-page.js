// Q/A page behavior and persistence.

const qaPage = document.createElement('div');
qaPage.id = 'qa-page';
qaPage.innerHTML = `
	<div class="qa-container">
		<div class="qa-header">
			<h1 id="qa-title">Q/A</h1>
			<button class="qa-add-trigger" id="qa-open-add" type="button" aria-label="Add entry">
				<span class="qa-add-plus">+</span>
				<span class="qa-add-text">Add</span>
			</button>
		</div>

		<div class="qa-search-center">
			<div class="qa-search-wrap">
				<div class="qa-search-icon" aria-hidden="true">
					<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
						<path d="M10 2.25a7.75 7.75 0 1 0 4.924 13.735l5.546 5.545 1.06-1.06-5.545-5.546A7.75 7.75 0 0 0 10 2.25ZM3.75 10a6.25 6.25 0 1 1 12.5 0 6.25 6.25 0 0 1-12.5 0Z"/>
					</svg>
				</div>
				<input id="qa-search-input" type="text" placeholder="Search Q/A..." oninput="filterQA()">
			</div>
			<div class="qa-search-meta">
				<span>Search matches question or answer.</span>
				<span id="qa-search-count"></span>
			</div>
		</div>

		<div class="qa-list" id="qa-list"></div>
	</div>

	<div id="qa-add-modal" class="qa-modal" aria-hidden="true">
		<div class="qa-modal-card" role="dialog" aria-modal="true" aria-labelledby="qa-add-title">
			<div class="qa-modal-header">
				<div class="qa-modal-title" id="qa-add-title">Add Q/A entry</div>
				<button class="qa-modal-close" id="qa-add-close" type="button" aria-label="Close add entry">&times;</button>
			</div>
			<div class="qa-modal-body">
				<div class="qa-input-row">
					<label class="qa-label" for="qa-question-input">Question</label>
					<input type="text" class="qa-input" id="qa-question-input" placeholder="Question">
				</div>
				<div class="qa-input-row">
					<label class="qa-label" for="qa-answer-input">Answer</label>
					<textarea class="qa-textarea" id="qa-answer-input" placeholder="Answer (Markdown supported)"></textarea>
					<div class="qa-meta">
						<span class="qa-hint">Markdown supported. Press Ctrl+Enter to add.</span>
					</div>
				</div>
			</div>
			<div class="qa-modal-footer">
				<div class="qa-modal-actions">
					<span class="qa-status" id="qa-add-status"></span>
					<button class="qa-add-btn" id="qa-add-btn" onclick="addQAEntry()">Add Entry</button>
				</div>
			</div>
		</div>
	</div>
    
	<!-- Q/A Edit Modal -->
	<div id="qa-edit-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;align-items:center;justify-content:center;">
		<div class="fc-modal-content">
			<div class="fc-modal-header">
				<div class="fc-modal-title">Edit Q/A Entry</div>
				<button class="fc-modal-close" onclick="closeQAEditModal()">&times;</button>
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

	<button id="qa-scroll-top-btn" class="compare-scroll-top-btn" onclick="scrollQAToTop()" aria-label="Back to top" title="Back to top">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 19V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<path d="M7 12l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</button>
`;
document.body.appendChild(qaPage);

let currentQAData = null;
let currentQAHandle = null;
let qaTopInitialized = false;
let qaStatusTimer = null;

document.getElementById('qa-page')?.addEventListener('scroll', updateQAScrollTopButtonVisibility, { passive: true });

function updateQAScrollTopButtonVisibility() {
	const page = document.getElementById('qa-page');
	const btn = document.getElementById('qa-scroll-top-btn');
	if (!page || !btn) return;
	const shouldShow = page.classList.contains('active') && page.scrollTop > 140;
	btn.classList.toggle('show', shouldShow);
}

function scrollQAToTop() {
	const page = document.getElementById('qa-page');
	if (!page) return;
	page.scrollTo({ top: 0, behavior: 'smooth' });
}

function initQATopControls() {
	if (qaTopInitialized) return;
	qaTopInitialized = true;

	const openBtn = document.getElementById('qa-open-add');
	const closeBtn = document.getElementById('qa-add-close');
	const modal = document.getElementById('qa-add-modal');
	const questionInput = document.getElementById('qa-question-input');
	const answerInput = document.getElementById('qa-answer-input');
	const addBtn = document.getElementById('qa-add-btn');

	if (!openBtn || !closeBtn || !modal || !questionInput || !answerInput || !addBtn) return;

	const openModal = () => {
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		setTimeout(() => questionInput.focus(), 0);
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
		const questionVal = questionInput.value.trim();
		const answerVal = answerInput.value.trim();
		addBtn.disabled = !(questionVal && answerVal);
		addBtn.classList.toggle('disabled', addBtn.disabled);
	};

	questionInput.addEventListener('input', updateAddState);
	answerInput.addEventListener('input', updateAddState);

	questionInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			answerInput.focus();
		}
	});

	answerInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && e.ctrlKey) {
			e.preventDefault();
			addQAEntry();
		}
	});

	updateAddState();
}

function showQAAddStatus(message, tone) {
	const statusEl = document.getElementById('qa-add-status');
	if (!statusEl) return;

	statusEl.textContent = message || '';
	statusEl.classList.toggle('error', tone === 'error');
	statusEl.classList.toggle('muted', tone === 'muted');

	if (qaStatusTimer) {
		clearTimeout(qaStatusTimer);
	}
	if (message) {
		qaStatusTimer = setTimeout(() => {
			statusEl.textContent = '';
			statusEl.classList.remove('error', 'muted');
		}, 2500);
	}
}

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

	const fileNameStr = fileHandle ? fileHandle.name.replace('.json', '') : (fileName ? fileName.replace('.json', '') : 'Q/A');
	document.getElementById('qa-title').textContent = fileNameStr;

	initQATopControls();
    
	renderQAList();
	updateQAScrollTopButtonVisibility();
}

function closeQA() {
	document.getElementById('qa-page').classList.remove('active');
	currentQAData = null;
	currentQAHandle = null;
	showHomeScreen();
	updateQAScrollTopButtonVisibility();
}

function renderQAList() {
	const qaList = document.getElementById('qa-list');
	const searchTerm = document.getElementById('qa-search-input').value.toLowerCase();
	const searchCountEl = document.getElementById('qa-search-count');
	const totalCount = currentQAData && currentQAData.qa ? currentQAData.qa.length : 0;
	qaList.innerHTML = '';
    
	if (!currentQAData || !currentQAData.qa || currentQAData.qa.length === 0) {
		qaList.innerHTML = '<div style="text-align:center;color:#666;padding:40px;">No Q/A entries yet. Add your first question above!</div>';
		if (searchCountEl) searchCountEl.textContent = `0 / ${totalCount}`;
		return;
	}

	let filteredEntries = currentQAData.qa;
	if (searchTerm) {
		filteredEntries = currentQAData.qa.filter(entry => {
			const question = (entry.question || '').toLowerCase();
			const answer = (entry.answer || '').toLowerCase();
			return question.includes(searchTerm) || answer.includes(searchTerm);
		});
	}

	if (filteredEntries.length === 0) {
		qaList.innerHTML = '<div style="text-align:center;color:#666;padding:40px;">No matching entries found.</div>';
		if (searchCountEl) searchCountEl.textContent = `0 / ${totalCount}`;
		return;
	}

	if (searchCountEl) searchCountEl.textContent = `${filteredEntries.length} / ${totalCount}`;
    
	// Sort entries alphabetically by question
	const sortedEntries = [...filteredEntries].sort((a, b) => 
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
	masterToggle.className = 'qa-item-btn';
	masterToggle.textContent = 'Show All Answers';
	masterToggle.dataset.state = 'hidden';
	masterToggle.onclick = () => {
		const allAnswers = qaList.querySelectorAll('.qa-answer');
		const allCarrows = qaList.querySelectorAll('.qa-carrow');
		const allItems = qaList.querySelectorAll('.qa-item');
		if (masterToggle.dataset.state === 'hidden') {
			allAnswers.forEach(answer => answer.style.display = 'block');
			allCarrows.forEach(carrow => carrow.classList.add('open'));
			allItems.forEach(item => item.classList.add('open'));
			masterToggle.textContent = 'Hide All Answers';
			masterToggle.dataset.state = 'shown';
		} else {
			allAnswers.forEach(answer => answer.style.display = 'none');
			allCarrows.forEach(carrow => carrow.classList.remove('open'));
			allItems.forEach(item => item.classList.remove('open'));
			masterToggle.textContent = 'Show All Answers';
			masterToggle.dataset.state = 'hidden';
		}
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
		showQAAddStatus('Missing question or answer', 'error');
		return;
	}
    
	currentQAData.qa.push({ question, answer });
	await saveQAData();
	renderQAList();
    
	questionInput.value = '';
	answerInput.value = '';
	questionInput.dispatchEvent(new Event('input'));
	answerInput.dispatchEvent(new Event('input'));
	showQAAddStatus('Entry added');
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
	renderQAList();
}

// Click outside handler to hide Q/A hover panes
document.addEventListener('click', (e) => {
	const qaPageEl = document.getElementById('qa-page');

	if (qaPageEl && qaPageEl.classList.contains('active')) {
		if (!e.target.closest('.qa-item')) {
			document.querySelectorAll('.qa-hover-pane.show').forEach(pane => {
				pane.classList.remove('show');
			});
		}
	}
});
