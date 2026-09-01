document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let data = []; // Array of { id: string, question: string, answer: string }
    let activeId = null;
    let saveTimeout = null;

    // --- DOM Elements ---
    const itemList = document.getElementById('itemList');
    const itemCount = document.getElementById('itemCount');
    const addNewBtn = document.getElementById('addNewBtn');
    const emptyAddNewBtn = document.getElementById('emptyAddNewBtn');
    const emptyState = document.getElementById('emptyState');
    const editorContent = document.getElementById('editorContent');
    const questionInput = document.getElementById('questionInput');
    const answerInput = document.getElementById('answerInput');
    const deleteBtn = document.getElementById('deleteBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const fileInput = document.getElementById('fileInput');
    const saveStatusIndicator = document.getElementById('saveStatusIndicator');
    const saveStatusText = document.getElementById('saveStatusText');

    // --- Initialization ---
    function init() {
        // Load from local storage
        const storageKey = typeof datasetKey !== 'undefined' ? `trainingData_${datasetKey}` : 'trainingData';
        const storedData = localStorage.getItem(storageKey);
        if (storedData) {
            try {
                data = JSON.parse(storedData);
            } catch (e) {
                console.error("Failed to parse local storage data");
                data = [];
            }
        }

        // If no data exists, load the defaults
        if (data.length === 0 && typeof defaultData !== 'undefined') {
            data = defaultData.map(item => ({
                id: generateId(),
                question: item.question,
                answer: item.answer || ''
            }));
            saveToLocalStorage();
        }

        // Migrate old formats if any (ensure id exists)
        data = data.map(item => {
            if (!item.id) {
                return { ...item, id: generateId() };
            }
            return item;
        });

        renderList();
        updateUI();
    }

    // --- Utilities ---
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function saveToLocalStorage() {
        const storageKey = typeof datasetKey !== 'undefined' ? `trainingData_${datasetKey}` : 'trainingData';
        localStorage.setItem(storageKey, JSON.stringify(data));
        
        // UI feedback
        saveStatusIndicator.classList.remove('saving');
        saveStatusText.textContent = "All changes saved locally";
    }

    function triggerAutoSave() {
        if (!activeId) return;

        // Update active item in data array
        const activeItem = data.find(item => item.id === activeId);
        if (activeItem) {
            activeItem.question = questionInput.value;
            activeItem.answer = answerInput.value;
        }

        // Show saving status
        saveStatusIndicator.classList.add('saving');
        saveStatusText.textContent = "Saving...";

        // Debounce saving to local storage and re-rendering list (for title updates)
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveToLocalStorage();
            updateListItem(activeId); // Only update the specific list item to avoid losing focus
        }, 500);
    }

    // --- UI Rendering ---
    function renderList() {
        itemList.innerHTML = '';
        
        data.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = `list-item ${item.id === activeId ? 'active' : ''}`;
            el.dataset.id = item.id;
            
            // Generate title from question or use default
            const title = item.question.trim() ? item.question.substring(0, 40) + (item.question.length > 40 ? '...' : '') : `Email`;
            const displayTitle = `${index + 1}. ${title}`;
            const preview = item.answer.trim() ? item.answer.substring(0, 50) + '...' : 'No answer yet...';

            el.innerHTML = `
                <div class="item-title">${displayTitle}</div>
                <div class="item-preview">${preview}</div>
            `;
            
            el.addEventListener('click', () => {
                selectItem(item.id);
            });
            
            itemList.appendChild(el);
        });

        itemCount.textContent = data.length;
    }

    function updateListItem(id) {
        const item = data.find(i => i.id === id);
        const el = document.querySelector(`.list-item[data-id="${id}"]`);
        if (!item || !el) return;

        const index = data.findIndex(i => i.id === id);
        const title = item.question.trim() ? item.question.substring(0, 40) + (item.question.length > 40 ? '...' : '') : `Email`;
        const displayTitle = `${index + 1}. ${title}`;
        const preview = item.answer.trim() ? item.answer.substring(0, 50) + '...' : 'No answer yet...';

        el.querySelector('.item-title').textContent = displayTitle;
        el.querySelector('.item-preview').textContent = preview;
    }

    function updateUI() {
        if (data.length === 0 || !activeId) {
            emptyState.style.display = 'flex';
            editorContent.classList.add('hidden');
        } else {
            emptyState.style.display = 'none';
            editorContent.classList.remove('hidden');
        }
        itemCount.textContent = data.length;
    }

    function selectItem(id) {
        activeId = id;
        const item = data.find(i => i.id === id);
        
        if (item) {
            questionInput.value = item.question;
            answerInput.value = item.answer;
        }

        // Update active class in list
        document.querySelectorAll('.list-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === id);
        });

        updateUI();
    }

    function createNewItem() {
        const newItem = {
            id: generateId(),
            question: '',
            answer: ''
        };
        data.unshift(newItem); // Add to top
        saveToLocalStorage();
        renderList();
        selectItem(newItem.id);
        questionInput.focus();
    }

    function deleteActiveItem() {
        if (!activeId) return;
        
        if (confirm("Are you sure you want to delete this email?")) {
            data = data.filter(item => item.id !== activeId);
            activeId = null;
            saveToLocalStorage();
            renderList();
            updateUI();
        }
    }

    // --- Export / Import ---
    function exportJSON() {
        // Format exactly as requested: [{ "question": string, "answer": string }]
        const exportData = data.map(item => ({
            question: item.question,
            answer: item.answer
        }));

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "training_data.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    function handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (Array.isArray(importedData)) {
                    // Add IDs and merge
                    const formattedImport = importedData.map(item => ({
                        id: generateId(),
                        question: item.question || '',
                        answer: item.answer || ''
                    }));
                    
                    if (confirm(`Found ${formattedImport.length} items. Do you want to overwrite current data (OK) or append to it (Cancel)?`)) {
                        data = formattedImport;
                    } else {
                        data = [...formattedImport, ...data];
                    }
                    
                    saveToLocalStorage();
                    activeId = null;
                    renderList();
                    updateUI();
                } else {
                    alert("Invalid JSON format. Expected an array of objects.");
                }
            } catch (err) {
                alert("Error parsing JSON file.");
            }
        };
        reader.readAsText(file);
        // Reset file input so the same file can be selected again
        event.target.value = '';
    }

    // --- Event Listeners ---
    addNewBtn.addEventListener('click', createNewItem);
    emptyAddNewBtn.addEventListener('click', createNewItem);
    deleteBtn.addEventListener('click', deleteActiveItem);
    
    // Auto-save on input
    questionInput.addEventListener('input', triggerAutoSave);
    answerInput.addEventListener('input', triggerAutoSave);

    // Export/Import
    exportBtn.addEventListener('click', exportJSON);
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImport);

    // Start App
    init();
});
