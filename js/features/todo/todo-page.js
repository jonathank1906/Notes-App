// To-do page behavior and persistence.

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
	updateTodoQuickAccessCache();
    
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
	updateTodoQuickAccessCache();
    
	input.value = '';
	input.focus();
}

async function toggleTodoItem(index) {
	if (!currentTodoData || !currentTodoData.todos) return;
	if (index < 0 || index >= currentTodoData.todos.length) return;
    
	currentTodoData.todos[index].completed = !currentTodoData.todos[index].completed;
	await saveTodoData();
	renderTodoList();
	updateTodoQuickAccessCache();
}

async function deleteTodoItem(index) {
	if (!confirm('Delete this task?')) return;
	currentTodoData.todos.splice(index, 1);
	await saveTodoData();
	renderTodoList();
	updateTodoQuickAccessCache();
}

function updateTodoQuickAccessCache() {
	if (!currentTodoData || typeof updateQuickAccessButtons !== 'function') return;

	const noteName = currentTodoHandle
		? currentTodoHandle.name.replace('.json', '')
		: (currentNoteFileName ? currentNoteFileName.replace('.json', '') : null);

	if (noteName && activeSubject && typeof parseNoteMetadata === 'function') {
		const noteKey = `${activeSubject.name}::${noteName}`;
		if (noteDataCache) {
			noteDataCache.set(noteKey, currentTodoData);
		}
		if (Array.isArray(loadedNotesForSearch)) {
			const target = loadedNotesForSearch.find(note => note.noteKey === noteKey);
			if (target) {
				target.todoCount = parseNoteMetadata(currentTodoData).todoCount;
			}
		}
	}

	updateQuickAccessButtons();
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
