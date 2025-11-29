// State management for library page
const state = {
    currentTab: 'movies',
    currentView: 'grid',
    mediaItems: [],
    filteredItems: [],
    selectedItems: new Set(),
    currentEditingItem: null,
    genres: [],
    tags: [],
    currentUserId: null,
    currentLibraryId: null,
    currentContentType: 'all',
    currentParentId: null,
    navigationHistory: [],
    folderItems: [],
    bulkItems: [],
    isSelecting: false,
    selectionStart: { x: 0, y: 0 },
    selectionEnd: { x: 0, y: 0 }
};

// DOM elements for library page
const elements = {
    mediaContainer: document.getElementById('media-container'),
    searchInput: document.getElementById('search-input'),
    editModal: document.getElementById('edit-modal'),
    bulkModal: document.getElementById('bulk-modal'),
    bulkActions: document.getElementById('bulk-actions'),
    selectedCount: document.getElementById('selected-count'),
    selectAll: document.getElementById('select-all'),
    serverInfo: document.getElementById('server-info'),
    bulkItemCount: document.getElementById('bulk-item-count'),
    librarySelect: document.getElementById('library-select'),
    contentTypeSelect: document.getElementById('content-type-select')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeApp();
});

// Initialize the application
async function initializeApp() {
    try {
        elements.serverInfo.textContent = 'Connecting to Jellyfin server...';
        console.log('Attempting to connect to Jellyfin server at:', config.serverUrl);
        
        // First, get the user ID
        state.currentUserId = await getUserId();
        console.log('User ID retrieved:', state.currentUserId);
        
        // Load available libraries
        await loadLibraries();
        console.log('Libraries loaded');
        
        // Set default library if available
        if (elements.librarySelect.options.length > 1) {
            elements.librarySelect.value = elements.librarySelect.options[1].value;
            state.currentLibraryId = elements.librarySelect.value;
            state.currentParentId = state.currentLibraryId;
            await loadMediaItems();
        } else {
            throw new Error('No libraries available');
        }
        
        updateServerInfo(elements.serverInfo, state.currentUserId);
    } catch (error) {
        console.error('Initialization error:', error);
        elements.serverInfo.textContent = 'Connection failed';
        showError(elements.mediaContainer, 'Failed to connect to Jellyfin server or load libraries: ' + error.message);
    }
}

// Load available libraries
async function loadLibraries() {
    try {
        if (!state.currentUserId) {
            throw new Error('User ID not available');
        }
        const response = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Views`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        console.log('Libraries API response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const libraries = await response.json();
        console.log('Libraries data:', libraries);
        const select = elements.librarySelect;
        select.innerHTML = '<option value="" disabled selected>Select a library</option>';
        
        libraries.Items.forEach(library => {
            if (library.CollectionType) {
                const option = document.createElement('option');
                option.value = library.Id;
                option.textContent = library.Name;
                select.appendChild(option);
            }
        });

        if (select.options.length === 1) {
            throw new Error('No libraries available');
        }
    } catch (error) {
        console.error('Failed to load libraries:', error);
        throw new Error('Failed to load libraries: ' + error.message);
    }
}

// Set up event listeners for library page
function initializeEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            state.currentTab = this.getAttribute('data-tab');
            loadMediaItems();
        });
    });

    // View controls
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            state.currentView = this.getAttribute('data-view');
            renderMediaItems();
        });
    });

    // Search functionality
    elements.searchInput.addEventListener('input', debounce(function() {
        filterMediaItems(this.value);
    }, 300));

    // Library selection
    elements.librarySelect.addEventListener('change', function() {
        state.currentLibraryId = this.value;
        state.currentParentId = state.currentLibraryId;
        state.navigationHistory = [];
        loadMediaItems();
    });

    // Content type selection
    elements.contentTypeSelect.addEventListener('change', function() {
        state.currentContentType = this.value;
        loadMediaItems();
    });

    // Modal controls
    const closeModal = document.getElementById('close-modal');
    if (closeModal) closeModal.addEventListener('click', closeEditModal);
    const cancelEdit = document.getElementById('cancel-edit');
    if (cancelEdit) cancelEdit.addEventListener('click', closeEditModal);
    
    // Bulk modal close listeners
    const closeBulkModalBtn = document.getElementById('close-bulk-modal');
    if (closeBulkModalBtn) closeBulkModalBtn.addEventListener('click', closeBulkModal);
    const cancelBulk = document.getElementById('cancel-bulk');
    if (cancelBulk) cancelBulk.addEventListener('click', closeBulkModal);

    // Save metadata
    const saveMetadataBtn = document.getElementById('save-metadata');
    if (saveMetadataBtn) saveMetadataBtn.addEventListener('click', saveMetadata);

    // Bulk edit
    const bulkEditBtn = document.getElementById('bulk-edit-btn');
    if (bulkEditBtn) bulkEditBtn.addEventListener('click', openBulkModal);
    const applyBulkBtn = document.getElementById('apply-bulk');
    if (applyBulkBtn) applyBulkBtn.addEventListener('click', applyBulkChanges);

    // Selection controls
    elements.selectAll.addEventListener('change', toggleSelectAll);
    const clearSelectionBtn = document.getElementById('clear-selection');
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearSelection);

    // Tag input functionality
    initializeTagInputs();
    
    // People search
    initializePeopleSearch();
    
    // Person modal
    initializePersonModal();
    
    // Add person modal controls
    const closeAddActorModal = document.getElementById('close-add-actor-modal');
    if (closeAddActorModal) closeAddActorModal.addEventListener('click', closeAddActorModal);
    const cancelAddActor = document.getElementById('cancel-add-actor');
    if (cancelAddActor) cancelAddActor.addEventListener('click', closeAddActorModal);
    const createNewPerson = document.getElementById('create-new-person');
    if (createNewPerson) createNewPerson.addEventListener('click', openEditPersonModal);

    // Close modals when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeEditModal();
            closeBulkModal();
            closeAddActorModal();
            closeEditPersonModal();
        }
    });

    // Right-click drag selection
    initializeDragSelection();
}

// Initialize right-click drag selection
function initializeDragSelection() {
    const mediaContainer = elements.mediaContainer;
    if (!mediaContainer) return;
    
    let selectionRect = null;

    mediaContainer.addEventListener('mousedown', function(e) {
        if (e.button !== 2) return;
        
        if (e.target.type === 'checkbox' || e.target.closest('.back-button')) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        state.isSelecting = true;
        state.selectionStart = { x: e.clientX, y: e.clientY };
        state.selectionEnd = { x: e.clientX, y: e.clientY };
        
        selectionRect = document.createElement('div');
        selectionRect.className = 'selection-rectangle';
        selectionRect.style.left = e.clientX + 'px';
        selectionRect.style.top = e.clientY + 'px';
        selectionRect.style.width = '0px';
        selectionRect.style.height = '0px';
        document.body.appendChild(selectionRect);
        
        mediaContainer.classList.add('selecting');
        
        document.addEventListener('contextmenu', preventContextMenu);
        document.addEventListener('mousemove', handleSelectionMove);
        document.addEventListener('mouseup', handleSelectionEnd);
    });

    function handleSelectionMove(e) {
        if (!state.isSelecting) return;
        
        state.selectionEnd = { x: e.clientX, y: e.clientY };
        
        const left = Math.min(state.selectionStart.x, state.selectionEnd.x);
        const top = Math.min(state.selectionStart.y, state.selectionEnd.y);
        const width = Math.abs(state.selectionEnd.x - state.selectionStart.x);
        const height = Math.abs(state.selectionEnd.y - state.selectionStart.y);
        
        selectionRect.style.left = left + 'px';
        selectionRect.style.top = top + 'px';
        selectionRect.style.width = width + 'px';
        selectionRect.style.height = height + 'px';
        
        updateSelectionFromRectangle(left, top, width, height);
    }

    function handleSelectionEnd(e) {
        if (!state.isSelecting) return;
        
        state.isSelecting = false;
        
        if (selectionRect) {
            selectionRect.remove();
            selectionRect = null;
        }
        
        mediaContainer.classList.remove('selecting');
        
        document.removeEventListener('mousemove', handleSelectionMove);
        document.removeEventListener('mouseup', handleSelectionEnd);
        document.removeEventListener('contextmenu', preventContextMenu);
        
        document.querySelectorAll('.media-item.selecting').forEach(item => {
            item.classList.remove('selecting');
        });
        
        updateSelectionUI();
    }

    function preventContextMenu(e) {
        e.preventDefault();
        return false;
    }

    function updateSelectionFromRectangle(left, top, width, height) {
        const selectionRect = {
            left: left,
            top: top,
            right: left + width,
            bottom: top + height
        };

        const mediaItems = document.querySelectorAll('.media-item');
        
        mediaItems.forEach(item => {
            const rect = item.getBoundingClientRect();
            const itemCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            const isInSelection = 
                itemCenter.x >= selectionRect.left &&
                itemCenter.x <= selectionRect.right &&
                itemCenter.y >= selectionRect.top &&
                itemCenter.y <= selectionRect.bottom;

            const itemId = item.getAttribute('data-id');
            const checkbox = item.querySelector('.item-checkbox');
            
            if (isInSelection) {
                item.classList.add('selecting');
                if (checkbox && !checkbox.checked) {
                    checkbox.checked = true;
                    state.selectedItems.add(itemId);
                    item.classList.add('selected');
                }
            } else {
                item.classList.remove('selecting');
                if (checkbox && checkbox.checked && e.shiftKey) {
                    checkbox.checked = false;
                    state.selectedItems.delete(itemId);
                    item.classList.remove('selected');
                }
            }
        });
    }
}

// Fetch people from Jellyfin API
async function fetchPeople(query = '') {
    try {
        const endpoint = `/Users/${state.currentUserId}/Items?Recursive=true&IncludeItemTypes=Person&SearchTerm=${encodeURIComponent(query)}&Fields=PrimaryImageTag,Overview`;
        const response = await fetch(`${config.serverUrl}${endpoint}`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.Items || [];
    } catch (error) {
        showAlert('add-actor-alert', 'Failed to fetch people: ' + error.message, 'error');
        return [];
    }
}

// Render search results for people
function renderPeopleSearchResults(people) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) return;
    
    searchResults.innerHTML = '';

    if (people.length === 0) {
        searchResults.innerHTML = '<div class="empty-state">No people found</div>';
        return;
    }

    people.forEach(person => {
        const avatarUrl = person.ImageTags && person.ImageTags.Primary 
            ? `${config.serverUrl}/Items/${person.Id}/Images/Primary`
            : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGNqPSIxMiIgY3k9IjEyIiByPSIxMiIgZmlsbD0iI0Y1RjVGNCIvPjxwYXRoIGQ9Ik0xMiA4QzEzLjY2IDggMTUgOS4zNCAxNSAxMUMxNSAxMi42NiAxMy42NiAxNCAxMiAxNEMxMC4zNCAxNCA5IDEyLjY2IDkgMTFDOSAxMC4zNCAxMC4zNCA4IDEyIDgiIGZpbGw9IiNDRUNFQ0UiLz48cGF0aCBkPSJNNSAxN0gxOUMxOSAxNC44IDcuMiAxNC44IDUgMTdaIiBmaWxsPSIjQ0VDRUNFIi8+PC9zdmc+';

        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.setAttribute('data-id', person.Id);
        item.innerHTML = `
            <img src="${avatarUrl}" class="search-result-avatar" alt="${person.Name}">
            <div class="person-details">
                <div class="person-name">${escapeHtml(person.Name)}</div>
                <div class="person-role">${person.Role || 'N/A'}</div>
            </div>
        `;

        item.addEventListener('click', () => addPersonToMedia(person.Id, person.Name));
        searchResults.appendChild(item);
    });
}

// Initialize search people functionality
function initializePeopleSearch() {
    const searchInput = document.getElementById('search-person-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(async function() {
            const query = this.value.trim();
            const people = await fetchPeople(query);
            renderPeopleSearchResults(people);
        }, 300));
    }
}

// Open edit person modal
function openEditPersonModal() {
    document.getElementById('add-actor-modal').classList.remove('active');
    const modal = document.getElementById('edit-person-modal');
    modal.classList.add('active');
    
    document.getElementById('person-name').value = '';
    document.getElementById('person-role').value = '';
    document.getElementById('person-birth-date').value = '';
    document.getElementById('person-death-date').value = '';
    document.getElementById('person-biography').value = '';
    document.getElementById('person-photo-preview').innerHTML = '<div class="photo-preview empty"></div>';
    document.getElementById('person-modal-alert').innerHTML = '';
}

// Initialize person modal controls
function initializePersonModal() {
    const closePersonModal = document.getElementById('close-person-modal');
    if (closePersonModal) closePersonModal.addEventListener('click', closeEditPersonModal);
    
    const cancelPerson = document.getElementById('cancel-person');
    if (cancelPerson) cancelPerson.addEventListener('click', closeEditPersonModal);
    
    const savePerson = document.getElementById('save-person');
    if (savePerson) savePerson.addEventListener('click', savePerson);
    
    const photoInput = document.getElementById('person-photo');
    if (photoInput) {
        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('person-photo-preview');
                    preview.innerHTML = `<img src="${e.target.result}" alt="Person photo">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

// Close edit person modal
function closeEditPersonModal() {
    document.getElementById('edit-person-modal').classList.remove('active');
}

// Close add actor modal
function closeAddActorModal() {
    document.getElementById('add-actor-modal').classList.remove('active');
    document.getElementById('search-person-input').value = '';
    document.getElementById('search-results').innerHTML = '';
}


// Save new person in media.js - UPDATED
async function savePerson() {
    try {
        const name = document.getElementById('person-name').value.trim();
        const roleSelect = document.getElementById('person-role');
        const selectedRole = roleSelect ? roleSelect.value : 'Actor';
        const biography = document.getElementById('person-biography').value.trim();
        const birthDate = document.getElementById('person-birth-date').value;
        const deathDate = document.getElementById('person-death-date').value;
        
        if (!name) {
            throw new Error('Name is required');
        }

        const personData = {
            Name: name,
            Type: 'Person',
            ProductionRoles: [selectedRole],
            Role: selectedRole,
            Overview: biography || ''
        };

        // Add dates if provided
        if (birthDate) {
            personData.PremiereDate = new Date(birthDate).toISOString();
        }
        if (deathDate) {
            personData.EndDate = new Date(deathDate).toISOString();
        }

        console.log('Creating person:', personData);

        // Use Users endpoint for creation
        const response = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(personData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const person = await response.json();
        console.log('Person created:', person);

        // Handle photo upload
        const photoInput = document.getElementById('person-photo');
        if (photoInput && photoInput.files[0]) {
            const formData = new FormData();
            formData.append('Image', photoInput.files[0]);

            try {
                await fetch(`${config.serverUrl}/Items/${person.Id}/Images/Primary`, {
                    method: 'POST',
                    headers: {
                        'X-Emby-Token': config.apiKey
                    },
                    body: formData
                });
                console.log('Photo uploaded for new person');
            } catch (uploadError) {
                console.warn('Photo upload failed for new person:', uploadError);
            }
        }

        showAlert('person-modal-alert', 'Person created successfully!', 'success');
        
        setTimeout(() => {
            closeEditPersonModal();
            // Return to add actor modal if applicable
            const addActorModal = document.getElementById('add-actor-modal');
            if (addActorModal) {
                addActorModal.classList.add('active');
            }
        }, 1500);

    } catch (error) {
        console.error('Error creating person:', error);
        showAlert('person-modal-alert', `Failed to create person: ${error.message}`, 'error');
    }
}
// Load media items from Jellyfin API
async function loadMediaItems(parentId = state.currentParentId) {
    if (!state.currentLibraryId) {
        showError(elements.mediaContainer, 'Please select a library');
        return;
    }

    showLoading(elements.mediaContainer, `Loading ${state.currentTab} from Jellyfin server...`);
    
    try {
        if (!state.currentUserId) {
            throw new Error('User ID not available');
        }
        
        let includeItemTypes = '';
        
        switch (state.currentContentType) {
            case 'movie':
                includeItemTypes = 'Movie';
                break;
            case 'series':
                includeItemTypes = 'Series';
                break;
            case 'music':
                includeItemTypes = 'Audio,MusicAlbum,MusicArtist';
                break;
            case 'photo':
                includeItemTypes = 'Photo';
                break;
            case 'all':
                includeItemTypes = '';
                break;
        }
        
        let endpoint = `/Users/${state.currentUserId}/Items?ParentId=${parentId}&Recursive=false&Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`;
        if (includeItemTypes) {
            endpoint += `&IncludeItemTypes=${includeItemTypes}`;
        }
        
        console.log('Fetching media from:', `${config.serverUrl}${endpoint}`);
        const response = await fetch(`${config.serverUrl}${endpoint}`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        console.log('Media API response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Media data received:', data);
        
        state.mediaItems = data.Items || [];
        state.filteredItems = [...state.mediaItems];
        
        if (parentId !== state.currentLibraryId && !state.navigationHistory.includes(parentId)) {
            state.navigationHistory.push(parentId);
        }
        
        renderMediaItems();
    } catch (error) {
        console.error('Load media error:', error);
        showError(elements.mediaContainer, 'Failed to load media items: ' + error.message);
    }
}

// Filter media items based on search query
function filterMediaItems(query) {
    if (!query.trim()) {
        state.filteredItems = [...state.mediaItems];
    } else {
        const lowerQuery = query.toLowerCase();
        state.filteredItems = state.mediaItems.filter(item => 
            (item.Name && item.Name.toLowerCase().includes(lowerQuery)) ||
            (item.ProductionYear && item.ProductionYear.toString().includes(lowerQuery)) ||
            (item.Genres && item.Genres.some(genre => genre.toLowerCase().includes(lowerQuery))) ||
            (item.Tags && item.Tags.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
            (item.People && item.People.some(person => person.Name.toLowerCase().includes(lowerQuery))) ||
            (item.Studios && item.Studios.some(studio => studio.Name.toLowerCase().includes(lowerQuery)))
        );
    }
    
    renderMediaItems();
}

// Render media items based on current view
function renderMediaItems() {
    if (state.filteredItems.length === 0) {
        showEmptyState(elements.mediaContainer, 'No media found', `Try adjusting your search or check if your ${state.currentTab} library has content. Select a different library if needed.`);
        return;
    }
    
    let backButtonHtml = '';
    if (state.currentParentId !== state.currentLibraryId && state.navigationHistory.length > 0) {
        backButtonHtml = `
            <button id="back-button" class="back-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
                Back
            </button>
        `;
    }

    if (state.currentView === 'grid') {
        renderGridView(backButtonHtml);
    } else if (state.currentView === 'square') {
        renderSquareView(backButtonHtml);
    } else {
        renderListView(backButtonHtml);
    }
    
    document.querySelectorAll('.media-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (e.target.type === 'checkbox') return;
            const itemId = this.getAttribute('data-id');
            fetchItemDetails(itemId);
        });

        item.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            const itemId = this.getAttribute('data-id');
            openFolderBulkModal(itemId);
        });
    });
    
    document.querySelectorAll('.item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const itemId = this.getAttribute('data-id');
            const mediaItem = this.closest('.media-item');
            
            if (this.checked) {
                state.selectedItems.add(itemId);
                mediaItem.classList.add('selected');
            } else {
                state.selectedItems.delete(itemId);
                mediaItem.classList.remove('selected');
            }
            updateSelectionUI();
        });
    });

    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', goBack);
    }
}

// Render media items in square view
function renderSquareView(backButtonHtml) {
    let html = '<div class="media-square">';
    html += backButtonHtml;
    
    state.filteredItems.forEach(item => {
        const posterUrl = item.ImageTags && item.ImageTags.Primary 
            ? `${config.serverUrl}/Items/${item.Id}/Images/Primary` 
            : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik04MCAxMjBMMTIwIDE0MEwxNjAgMTIwVjE2MEg4MFYxMjBaIiBmaWxsPSIjRjVGNUY1Ii8+Cjwvc3ZnPg==';
        const isFolder = item.Type === 'Folder' || item.Type === 'CollectionFolder' || item.Type === 'PhotoAlbum';
        const isSelected = state.selectedItems.has(item.Id);
        
        html += `
            <div class="media-item square-item ${isSelected ? 'selected' : ''}" data-id="${item.Id}" data-type="${item.Type}">
                <input type="checkbox" class="media-checkbox item-checkbox" data-id="${item.Id}" ${isSelected ? 'checked' : ''}>
                <img src="${posterUrl}" alt="${item.Name}" class="square-poster" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik04MCAxMjBMMTIwIDE0MEwxNjAgMTIwVjE2MEg4MFYxMjBaIiBmaWxsPSIjRjVGNUY1Ii8+Cjwvc3ZnPg=='">
                <div class="square-info">
                    <div class="square-title">${escapeHtml(item.Name)}</div>
                    <div class="square-year">${isFolder ? '' : (item.ProductionYear || 'N/A')}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    elements.mediaContainer.innerHTML = html;
}

// Fetch item details to determine type
async function fetchItemDetails(itemId) {
    try {
        const response = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${itemId}?Fields=Type`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const item = await response.json();
        if (item.Type === 'Folder' || item.Type === 'CollectionFolder' || item.Type === 'PhotoAlbum') {
            state.currentParentId = itemId;
            await loadMediaItems(itemId);
        } else {
            openEditModal(itemId);
        }
    } catch (error) {
        console.error('Error fetching item details:', error);
        showError(elements.mediaContainer, 'Failed to determine item type: ' + error.message);
    }
}

// Navigate back to previous level
function goBack() {
    if (state.navigationHistory.length > 0) {
        state.navigationHistory.pop();
        state.currentParentId = state.navigationHistory.length > 0 ? state.navigationHistory[state.navigationHistory.length - 1] : state.currentLibraryId;
        loadMediaItems(state.currentParentId);
    }
}

// Render media items in grid view
function renderGridView(backButtonHtml) {
    let html = '<div class="media-grid">';
    html += backButtonHtml;
    
    state.filteredItems.forEach(item => {
        const posterUrl = item.ImageTags && item.ImageTags.Primary 
            ? `${config.serverUrl}/Items/${item.Id}/Images/Primary` 
            : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDIwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik04MCAxMjBMMTIwIDE0MEwxNjAgMTIwVjE4MEg4MFYxMjBaIiBmaWxsPSIjRjVGNUY1Ii8+Cjwvc3ZnPg==';
        const isFolder = item.Type === 'Folder' || item.Type === 'CollectionFolder' || item.Type === 'PhotoAlbum';
        const isSelected = state.selectedItems.has(item.Id);
        
        html += `
            <div class="media-item ${isSelected ? 'selected' : ''}" data-id="${item.Id}" data-type="${item.Type}">
                <input type="checkbox" class="media-checkbox item-checkbox" data-id="${item.Id}" ${isSelected ? 'checked' : ''}>
                <img src="${posterUrl}" alt="${item.Name}" class="media-poster" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDIwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik04MCAxMjBMMTIwIDE0MEwxNjAgMTIwVjE4MEg4MFYxMjBaIiBmaWxsPSIjRjVGNUY1Ii8+Cjwvc3ZnPg=='">
                <div class="media-info">
                    <div class="media-title">${escapeHtml(item.Name)}</div>
                    <div class="media-year">${isFolder ? '' : (item.ProductionYear || 'N/A')}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    elements.mediaContainer.innerHTML = html;
}

// Render media items in list view
function renderListView(backButtonHtml) {
    let html = `
        <table class="media-table">
            <thead>
                <tr>
                    <th class="checkbox-cell">
                        <input type="checkbox" id="table-select-all">
                    </th>
                    <th>Select</th>
                    <th>TITLE</th>
                    <th>Year</th>
                    <th>Genres</th>
                    <th>Rating</th>
                </tr>
            </thead>
            <tbody>
    `;
    html += backButtonHtml;
    
    state.filteredItems.forEach(item => {
        const genres = item.Genres ? item.Genres.join(', ') : 'None';
        const rating = item.CommunityRating ? item.CommunityRating.toFixed(1) : 'N/A';
        const isFolder = item.Type === 'Folder' || item.Type === 'CollectionFolder' || item.Type === 'PhotoAlbum';
        const isSelected = state.selectedItems.has(item.Id);
        
        html += `
            <tr class="media-item ${isSelected ? 'selected' : ''}" data-id="${item.Id}" data-type="${item.Type}">
                <td class="checkbox-cell">
                    <input type="checkbox" class="item-checkbox" data-id="${item.Id}" ${isSelected ? 'checked' : ''}>
                </td>
                <td>
                    ${escapeHtml(item.Name)}
                </td>
                <td>${isFolder ? '' : (item.ProductionYear || 'N/A')}</td>
                <td>${isFolder ? '' : escapeHtml(genres)}</td>
                <td>${isFolder ? '' : rating}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    elements.mediaContainer.innerHTML = html;
    
    const tableSelectAll = document.getElementById('table-select-all');
    if (tableSelectAll) {
        tableSelectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.item-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const itemId = checkbox.getAttribute('data-id');
                const mediaItem = checkbox.closest('.media-item');
                
                if (this.checked) {
                    state.selectedItems.add(itemId);
                    mediaItem.classList.add('selected');
                } else {
                    state.selectedItems.delete(itemId);
                    mediaItem.classList.remove('selected');
                }
            });
            updateSelectionUI();
        });
    }
}

// Open edit modal for a specific item with director and actors
async function openEditModal(itemId) {
    try {
        const response = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${itemId}?Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const item = await response.json();
        state.currentEditingItem = item;
        
        const { director, actors } = getDirectorAndActors(item.People);
        
        document.getElementById('edit-title').value = item.Name || '';
        document.getElementById('edit-year').value = item.ProductionYear || '';
        document.getElementById('edit-overview').value = item.Overview || '';
        document.getElementById('edit-rating').value = item.CommunityRating || '';
        document.getElementById('edit-director').value = director || '';
        document.getElementById('edit-actors').value = actors.join(', ') || '';
        
        document.getElementById('genres-container').innerHTML = '<input type="text" id="genre-input" placeholder="Add genre...">';
        document.getElementById('tags-container').innerHTML = '<input type="text" id="tag-input" placeholder="Add tag...">';
        
        state.genres = item.Genres || [];
        state.genres.forEach(genre => {
            addTag(genre, 'genres-container', state.genres);
        });
        
        state.tags = item.Tags || [];
        state.tags.forEach(tag => {
            addTag(tag, 'tags-container', state.tags);
        });
        
        initializeTagInputs();
        
        elements.editModal.classList.add('active');
        
    } catch (error) {
        console.error('Error in openEditModal:', error);
        showAlert('modal-alert', 'Failed to load item details: ' + error.message, 'error');
    }
}

// Close edit modal
function closeEditModal() {
    elements.editModal.classList.remove('active');
    state.currentEditingItem = null;
    state.genres = [];
    state.tags = [];
    document.getElementById('modal-alert').innerHTML = '';
}

// Get all media items from selected folders
async function getMediaItemsFromSelectedFolders() {
    let allMediaItems = [];
    const selectedIds = Array.from(state.selectedItems);
    
    for (const itemId of selectedIds) {
        try {
            const itemResponse = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${itemId}?Fields=Type`, {
                headers: { 'X-Emby-Token': config.apiKey }
            });
            
            if (!itemResponse.ok) continue;
            
            const item = await itemResponse.json();
            
            if (item.Type === 'Folder' || item.Type === 'CollectionFolder' || item.Type === 'PhotoAlbum') {
                const folderResponse = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items?ParentId=${itemId}&Recursive=false&Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`, {
                    headers: { 'X-Emby-Token': config.apiKey }
                });
                
                if (folderResponse.ok) {
                    const folderData = await folderResponse.json();
                    const mediaItems = folderData.Items.filter(folderItem => 
                        folderItem.Type !== 'Folder' && 
                        folderItem.Type !== 'CollectionFolder' && 
                        folderItem.Type !== 'PhotoAlbum'
                    );
                    allMediaItems = allMediaItems.concat(mediaItems);
                }
            } else {
                const mediaResponse = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${itemId}?Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`, {
                    headers: { 'X-Emby-Token': config.apiKey }
                });
                
                if (mediaResponse.ok) {
                    const mediaItem = await mediaResponse.json();
                    allMediaItems.push(mediaItem);
                }
            }
        } catch (error) {
            console.error(`Error processing item ${itemId}:`, error);
        }
    }
    
    return allMediaItems;
}

// Open bulk edit modal - now handles folders and their contents
async function openBulkModal() {
    if (state.selectedItems.size === 0) {
        showAlert('bulk-alert', 'Please select at least one item to edit.', 'error');
        return;
    }
    
    try {
        showLoading(elements.mediaContainer, 'Loading selected items...');
        
        const mediaItems = await getMediaItemsFromSelectedFolders();
        
        if (mediaItems.length === 0) {
            showAlert('bulk-alert', 'No media items found in selection.', 'error');
            return;
        }
        
        state.bulkItems = mediaItems;
        elements.bulkItemCount.textContent = mediaItems.length;
        
        document.getElementById('bulk-genres-container').innerHTML = '<input type="text" id="bulk-genre-input" placeholder="Add genre...">';
        document.getElementById('bulk-tags-container').innerHTML = '<input type="text" id="bulk-tag-input" placeholder="Add tag...">';
        document.getElementById('bulk-remove-tags-container').innerHTML = '<input type="text" id="bulk-remove-tag-input" placeholder="Remove tag...">';
        document.getElementById('bulk-rating').value = '';
        document.getElementById('bulk-director').value = '';
        document.getElementById('bulk-studio').value = '';
        document.getElementById('bulk-actor').value = '';
        document.getElementById('bulk-alert').innerHTML = '';
        
        initializeTagInputs();
        
        elements.bulkModal.classList.add('active');
        
    } catch (error) {
        console.error('Error opening bulk modal:', error);
        showAlert('bulk-alert', 'Failed to load selected items: ' + error.message, 'error');
    }
}

// Open bulk edit modal for all items in a specific folder (from context menu)
async function openFolderBulkModal(folderId) {
    showLoading(elements.mediaContainer, 'Loading folder contents...');
    
    try {
        const endpoint = `/Users/${state.currentUserId}/Items?ParentId=${folderId}&Recursive=false&Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`;
        const response = await fetch(`${config.serverUrl}${endpoint}`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const mediaItems = data.Items.filter(item => item.Type !== 'Folder' && item.Type !== 'CollectionFolder' && item.Type !== 'PhotoAlbum');
        
        if (mediaItems.length === 0) {
            showError(elements.mediaContainer, 'No media items found in this folder.');
            return;
        }
        
        state.bulkItems = mediaItems;
        elements.bulkItemCount.textContent = mediaItems.length;
        
        document.getElementById('bulk-genres-container').innerHTML = '<input type="text" id="bulk-genre-input" placeholder="Add genre...">';
        document.getElementById('bulk-tags-container').innerHTML = '<input type="text" id="bulk-tag-input" placeholder="Add tag...">';
        document.getElementById('bulk-remove-tags-container').innerHTML = '<input type="text" id="bulk-remove-tag-input" placeholder="Remove tag...">';
        document.getElementById('bulk-rating').value = '';
        document.getElementById('bulk-director').value = '';
        document.getElementById('bulk-studio').value = '';
        document.getElementById('bulk-actor').value = '';
        document.getElementById('bulk-alert').innerHTML = '';
        
        initializeTagInputs();
        
        elements.bulkModal.classList.add('active');
    } catch (error) {
        console.error('Failed to load folder content:', error);
        showError(elements.mediaContainer, 'Failed to load folder content: ' + error.message);
    }
}

// Close bulk edit modal
function closeBulkModal() {
    elements.bulkModal.classList.remove('active');
    state.bulkItems = [];
}

// Enhanced saveMetadata with director and actors support
async function saveMetadata() {
    if (!state.currentEditingItem) return;
    
    try {
        const response = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${state.currentEditingItem.Id}?Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch current item: ${response.status}`);
        }
        
        const currentItem = await response.json();
        
        const director = document.getElementById('edit-director').value.trim();
        const actorsString = document.getElementById('edit-actors').value.trim();
        const actors = actorsString ? actorsString.split(',').map(actor => actor.trim()).filter(actor => actor) : [];
        
        let people = (currentItem.People || []).filter(person => 
            person.Type !== 'Director' && person.Type !== 'Actor'
        );
        
        if (director) {
            people.push({
                Name: director,
                Type: 'Director',
                Role: 'Director'
            });
        }
        
        actors.forEach(actorName => {
            people.push({
                Name: actorName,
                Type: 'Actor',
                Role: 'Actor'
            });
        });
        
        const updatedData = {
            Id: currentItem.Id,
            ServerId: currentItem.ServerId,
            Type: currentItem.Type,
            Name: document.getElementById('edit-title').value.trim() || currentItem.Name,
            ProductionYear: document.getElementById('edit-year').value ? 
                parseInt(document.getElementById('edit-year').value) : currentItem.ProductionYear,
            Overview: document.getElementById('edit-overview').value.trim() || currentItem.Overview,
            CommunityRating: document.getElementById('edit-rating').value ? 
                parseFloat(document.getElementById('edit-rating').value) : currentItem.CommunityRating,
            Genres: state.genres.length > 0 ? state.genres : currentItem.Genres,
            Tags: state.tags.length > 0 ? state.tags : currentItem.Tags,
            People: people,
            Studios: currentItem.Studios || [],
            ProviderIds: currentItem.ProviderIds || {},
            ImageTags: currentItem.ImageTags || {}
        };

        console.log('Updating item:', updatedData.Name);
        
        const updateResponse = await fetch(`${config.serverUrl}/Items/${state.currentEditingItem.Id}`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });
        
        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            throw new Error(`Server returned ${updateResponse.status}: ${errorText}`);
        }
        
        showAlert('modal-alert', 'Metadata updated successfully!', 'success');
        
        setTimeout(() => {
            closeEditModal();
            loadMediaItems();
        }, 1500);
        
    } catch (error) {
        console.error('Error in saveMetadata:', error);
        showAlert('modal-alert', `Update failed: ${error.message}`, 'error');
    }
}

// applyBulkChanges function - now uses state.bulkItems
async function applyBulkChanges() {
    if (!state.bulkItems || state.bulkItems.length === 0) {
        showAlert('bulk-alert', 'No media items to update.', 'error');
        return;
    }
    
    try {
        const addGenres = Array.from(document.querySelectorAll('#bulk-genres-container .tag'))
            .map(tag => tag.textContent.trim().replace('×', '').trim());
        const addTags = Array.from(document.querySelectorAll('#bulk-tags-container .tag'))
            .map(tag => tag.textContent.trim().replace('×', '').trim());
        const removeTags = Array.from(document.querySelectorAll('#bulk-remove-tags-container .tag'))
            .map(tag => tag.textContent.trim().replace('×', '').trim());
        const rating = document.getElementById('bulk-rating').value ? parseFloat(document.getElementById('bulk-rating').value) : null;
        const director = document.getElementById('bulk-director').value.trim() || null;
        const studio = document.getElementById('bulk-studio').value.trim() || null;
        const actorName = document.getElementById('bulk-actor').value.trim() || null;
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const item of state.bulkItems) {
            try {
                const freshItemResponse = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${item.Id}?Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`, {
                    headers: { 'X-Emby-Token': config.apiKey }
                });
                
                if (!freshItemResponse.ok) {
                    throw new Error(`Failed to fetch fresh item data: ${freshItemResponse.status}`);
                }
                
                const freshItem = await freshItemResponse.json();
                
                const updatedData = {
                    Id: freshItem.Id,
                    ServerId: freshItem.ServerId,
                    Type: freshItem.Type,
                    Name: freshItem.Name,
                    ProductionYear: freshItem.ProductionYear,
                    Overview: freshItem.Overview,
                    CommunityRating: rating !== null ? rating : freshItem.CommunityRating,
                    Genres: (() => {
                        const currentGenres = freshItem.Genres || [];
                        let newGenres = [...currentGenres];
                        
                        if (addGenres.length > 0) {
                            newGenres = [...new Set([...newGenres, ...addGenres])];
                        }
                        
                        return newGenres;
                    })(),
                    Tags: (() => {
                        const currentTags = freshItem.Tags || [];
                        let newTags = [...currentTags];
                        
                        if (addTags.length > 0) {
                            newTags = [...new Set([...newTags, ...addTags])];
                        }
                        
                        if (removeTags.length > 0) {
                            newTags = newTags.filter(tag => !removeTags.includes(tag));
                        }
                        
                        return newTags;
                    })(),
                    People: freshItem.People || [],
                    Studios: freshItem.Studios || [],
                    ProviderIds: freshItem.ProviderIds || {},
                    ImageTags: freshItem.ImageTags || {}
                };

                if (director) {
                    const currentPeople = freshItem.People || [];
                    const directorExists = currentPeople.some(p => p.Type === 'Director' && p.Name === director);
                    if (!directorExists) {
                        updatedData.People = [...currentPeople, { Name: director, Type: 'Director', Role: 'Director' }];
                    }
                }

                if (studio) {
                    const currentStudios = freshItem.Studios || [];
                    const studioExists = currentStudios.some(s => s.Name === studio);
                    if (!studioExists) {
                        updatedData.Studios = [...currentStudios, { Name: studio }];
                    }
                }

                if (actorName) {
                    const currentPeople = freshItem.People || [];
                    const actorExists = currentPeople.some(p => p.Type === 'Actor' && p.Name === actorName);
                    if (!actorExists) {
                        updatedData.People = [...currentPeople, { Name: actorName, Type: 'Actor', Role: 'Actor' }];
                    }
                }

                console.log(`Updating item ${item.Id}:`, updatedData.Name);
                
                const updateResponse = await fetch(`${config.serverUrl}/Items/${item.Id}`, {
                    method: 'POST',
                    headers: {
                        'X-Emby-Token': config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedData)
                });
                
                if (updateResponse.ok) {
                    successCount++;
                    console.log(`Successfully updated item ${item.Id}`);
                } else {
                    errorCount++;
                    const errorText = await updateResponse.text();
                    console.error(`Failed to update item ${item.Id}:`, updateResponse.status, errorText);
                }
                
            } catch (error) {
                errorCount++;
                console.error(`Error updating item ${item.Id}:`, error);
            }
        }
        
        const message = `Bulk update completed: ${successCount} successful, ${errorCount} failed`;
        showAlert('bulk-alert', message, errorCount === 0 ? 'success' : 'error');
        
        if (errorCount === 0) {
            setTimeout(() => {
                closeBulkModal();
                loadMediaItems();
            }, 2000);
        }
        
    } catch (error) {
        console.error('Error in applyBulkChanges:', error);
        showAlert('bulk-alert', 'Failed to apply bulk changes: ' + error.message, 'error');
    }
}

// Toggle select all items
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.item-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = elements.selectAll.checked;
        const itemId = checkbox.getAttribute('data-id');
        const mediaItem = checkbox.closest('.media-item');
        
        if (elements.selectAll.checked) {
            state.selectedItems.add(itemId);
            mediaItem.classList.add('selected');
        } else {
            state.selectedItems.delete(itemId);
            mediaItem.classList.remove('selected');
        }
    });
    updateSelectionUI();
}

async function applyBulkChanges() {
    if (!state.bulkItems || state.bulkItems.length === 0) {
        showAlert('bulk-alert', 'No media items to update.', 'error');
        return;
    }
    
    const applyBtn = document.getElementById('apply-bulk');
    const progressWrapper = document.getElementById('bulk-progress-wrapper');
    const progressBar = document.getElementById('bulk-progress-bar');
    const progressText = document.getElementById('bulk-progress-text');
    const total = state.bulkItems.length;
    
    try {
        // Prepare UI
        if (progressWrapper) progressWrapper.style.display = 'flex';
        if (progressBar) { progressBar.style.width = '0%'; progressBar.setAttribute('aria-valuenow', '0'); }
        if (progressText) progressText.textContent = `0 / ${total} (0%)`;
        if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }
        
        const addGenres = Array.from(document.querySelectorAll('#bulk-genres-container .tag'))
            .map(tag => tag.textContent.trim().replace('×', '').trim());
        const addTags = Array.from(document.querySelectorAll('#bulk-tags-container .tag'))
            .map(tag => tag.textContent.trim().replace('×', '').trim());
        const removeTags = Array.from(document.querySelectorAll('#bulk-remove-tags-container .tag'))
            .map(tag => tag.textContent.trim().replace('×', '').trim());
        const rating = document.getElementById('bulk-rating').value ? parseFloat(document.getElementById('bulk-rating').value) : null;
        const director = document.getElementById('bulk-director').value.trim() || null;
        const studio = document.getElementById('bulk-studio').value.trim() || null;
        const actorName = document.getElementById('bulk-actor').value.trim() || null;
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < state.bulkItems.length; i++) {
            const item = state.bulkItems[i];
            try {
                const freshItemResponse = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${item.Id}?Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios`, {
                    headers: { 'X-Emby-Token': config.apiKey }
                });
                
                if (!freshItemResponse.ok) {
                    throw new Error(`Failed to fetch fresh item data: ${freshItemResponse.status}`);
                }
                
                const freshItem = await freshItemResponse.json();
                
                const updatedData = {
                    Id: freshItem.Id,
                    ServerId: freshItem.ServerId,
                    Type: freshItem.Type,
                    Name: freshItem.Name,
                    ProductionYear: freshItem.ProductionYear,
                    Overview: freshItem.Overview,
                    CommunityRating: rating !== null ? rating : freshItem.CommunityRating,
                    Genres: (() => {
                        const currentGenres = freshItem.Genres || [];
                        let newGenres = [...currentGenres];
                        
                        if (addGenres.length > 0) {
                            newGenres = [...new Set([...newGenres, ...addGenres])];
                        }
                        
                        return newGenres;
                    })(),
                    Tags: (() => {
                        const currentTags = freshItem.Tags || [];
                        let newTags = [...currentTags];
                        
                        if (addTags.length > 0) {
                            newTags = [...new Set([...newTags, ...addTags])];
                        }
                        
                        if (removeTags.length > 0) {
                            newTags = newTags.filter(tag => !removeTags.includes(tag));
                        }
                        
                        return newTags;
                    })(),
                    People: freshItem.People || [],
                    Studios: freshItem.Studios || [],
                    ProviderIds: freshItem.ProviderIds || {},
                    ImageTags: freshItem.ImageTags || {}
                };

                if (director) {
                    const currentPeople = freshItem.People || [];
                    const directorExists = currentPeople.some(p => p.Type === 'Director' && p.Name === director);
                    if (!directorExists) {
                        updatedData.People = [...currentPeople, { Name: director, Type: 'Director', Role: 'Director' }];
                    }
                }

                if (studio) {
                    const currentStudios = freshItem.Studios || [];
                    const studioExists = currentStudios.some(s => s.Name === studio);
                    if (!studioExists) {
                        updatedData.Studios = [...currentStudios, { Name: studio }];
                    }
                }

                if (actorName) {
                    const currentPeople = freshItem.People || [];
                    const actorExists = currentPeople.some(p => p.Type === 'Actor' && p.Name === actorName);
                    if (!actorExists) {
                        updatedData.People = [...currentPeople, { Name: actorName, Type: 'Actor', Role: 'Actor' }];
                    }
                }

                console.log(`Updating item ${item.Id}:`, updatedData.Name);
                
                const updateResponse = await fetch(`${config.serverUrl}/Items/${item.Id}`, {
                    method: 'POST',
                    headers: {
                        'X-Emby-Token': config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedData)
                });
                
                if (updateResponse.ok) {
                    successCount++;
                    console.log(`Successfully updated item ${item.Id}`);
                } else {
                    errorCount++;
                    const errorText = await updateResponse.text();
                    console.error(`Failed to update item ${item.Id}:`, updateResponse.status, errorText);
                }
                
            } catch (error) {
                errorCount++;
                console.error(`Error updating item ${item.Id}:`, error);
            } finally {
                // Update progress UI after each item
                const completed = (i + 1);
                const percent = Math.round((completed / total) * 100);
                if (progressBar) {
                    progressBar.style.width = `${percent}%`;
                    progressBar.setAttribute('aria-valuenow', String(percent));
                }
                if (progressText) {
                    progressText.textContent = `${completed} / ${total} (${percent}%)`;
                }
            }
        }
        
        const message = `Bulk update completed: ${successCount} successful, ${errorCount} failed`;
        showAlert('bulk-alert', message, errorCount === 0 ? 'success' : 'error');
        
        if (errorCount === 0) {
            setTimeout(() => {
                closeBulkModal();
                loadMediaItems();
            }, 2000);
        }
        
    } catch (error) {
        console.error('Error in applyBulkChanges:', error);
        showAlert('bulk-alert', 'Failed to apply bulk changes: ' + error.message, 'error');
    } finally {
        // restore UI
        if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply Changes'; }
        // keep final progress visible for a short moment, then hide
        setTimeout(() => {
            if (progressWrapper) progressWrapper.style.display = 'none';
            if (progressBar) { progressBar.style.width = '0%'; progressBar.setAttribute('aria-valuenow', '0'); }
            if (progressText) progressText.textContent = `0 / 0 (0%)`;
        }, 2000);
    }
}

// Clear selection
function clearSelection() {
    state.selectedItems.clear();
    const checkboxes = document.querySelectorAll('.item-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        const mediaItem = checkbox.closest('.media-item');
        mediaItem.classList.remove('selected');
    });
    elements.selectAll.checked = false;
    updateSelectionUI();
}

// Update selection UI
function updateSelectionUI() {
    elements.selectedCount.textContent = `${state.selectedItems.size} items selected`;
    
    if (state.selectedItems.size > 0) {
        elements.bulkActions.style.display = 'flex';
    } else {
        elements.bulkActions.style.display = 'none';
    }
    
    const checkboxes = document.querySelectorAll('.item-checkbox');
    if (checkboxes.length > 0) {
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        elements.selectAll.checked = allChecked;
        
        const tableSelectAll = document.getElementById('table-select-all');
        if (tableSelectAll) {
            tableSelectAll.checked = allChecked;
        }
    }
}

// Add person to media (placeholder function - needs implementation)
function addPersonToMedia(personId, personName) {
    console.log(`Adding person ${personName} (${personId}) to media`);
    showAlert('add-actor-alert', `Added ${personName} to media`, 'success');
    setTimeout(closeAddActorModal, 1500);
}