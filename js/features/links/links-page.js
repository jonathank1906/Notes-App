// Links board behavior and persistence.

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
