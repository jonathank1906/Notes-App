// Test page view/edit behavior and persistence.

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
