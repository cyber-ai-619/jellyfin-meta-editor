// State management for people page
const state = {
    currentView: 'grid',
    selectedItems: new Set(),
    peopleItems: [],
    filteredPeople: [],
    currentEditingPerson: null,
    currentRoleFilter: 'all',
    currentUserId: null
};

// DOM elements for people page
const elements = {
    peopleContainer: document.getElementById('people-container'),
    searchInput: document.getElementById('search-people-input'),
    roleSelect: document.getElementById('people-role-select'),
    serverInfo: document.getElementById('server-info'),
    bulkActions: document.getElementById('people-bulk-actions'),
    selectedCount: document.getElementById('people-selected-count'),
    selectAll: document.getElementById('people-select-all')
};

// Initialize the people page
document.addEventListener('DOMContentLoaded', function() {
    initializePeoplePage();
});

// Initialize people page
async function initializePeoplePage() {
    try {
        state.currentUserId = await getUserId();
        initializePeopleEventListeners();
        loadPeople();
        updateServerInfo(elements.serverInfo, state.currentUserId);
    } catch (error) {
        console.error('People page initialization error:', error);
        showError(elements.peopleContainer, 'Failed to initialize people page: ' + error.message);
    }
}

// Set up event listeners for people page
// Set up event listeners for people page
function initializePeopleEventListeners() {
    // View controls
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            state.currentView = this.getAttribute('data-view');
            renderPeople();
        });
    });

    // Search functionality
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debounce(function() {
            filterPeople(this.value);
        }, 300));
    }

    // Role filter
    if (elements.roleSelect) {
        elements.roleSelect.addEventListener('change', function() {
            state.currentRoleFilter = this.value;
            filterPeople(elements.searchInput ? elements.searchInput.value : '');
        });
    }

    // Selection controls
    if (elements.selectAll) {
        elements.selectAll.addEventListener('change', togglePeopleSelectAll);
    }
    
    const clearSelectionBtn = document.getElementById('people-clear-selection');
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearPeopleSelection);
    
    const bulkEditBtn = document.getElementById('people-bulk-edit-btn');
    if (bulkEditBtn) bulkEditBtn.addEventListener('click', openPeopleBulkModal);

    // Person modal controls
    const closePersonModal = document.getElementById('close-person-modal');
    if (closePersonModal) closePersonModal.addEventListener('click', closeEditPersonModal);
    
    const cancelPerson = document.getElementById('cancel-person');
    if (cancelPerson) cancelPerson.addEventListener('click', closeEditPersonModal);
    
    const savePerson = document.getElementById('save-person');
    if (savePerson) savePerson.addEventListener('click', savePersonData);

    // Create person modal
    const closeCreatePersonModal = document.getElementById('close-create-person-modal');
    if (closeCreatePersonModal) closeCreatePersonModal.addEventListener('click', closeCreatePersonModal);
    
    const cancelCreatePerson = document.getElementById('cancel-create-person');
    if (cancelCreatePerson) cancelCreatePerson.addEventListener('click', closeCreatePersonModal);
    
    const createNewPerson = document.getElementById('create-new-person');
    if (createNewPerson) createNewPerson.addEventListener('click', createNewPersonHandler);

    // Photo input change listener - FIXED: Only one declaration
    const photoInput = document.getElementById('person-photo');
    if (photoInput) {
        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            const label = this.previousElementSibling;
            
            if (file) {
                label.classList.add('has-file');
                label.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    ${file.name}
                `;
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('person-photo-preview');
                    preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">`;
                };
                reader.readAsDataURL(file);
            } else {
                label.classList.remove('has-file');
                label.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    Upload Photo
                `;
            }
        });
    }

    // Close modals when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeEditPersonModal();
            closeCreatePersonModal();
        }
    });
}

// Load people from Jellyfin - FIXED to get proper roles
async function loadPeople() {
    showLoading(elements.peopleContainer, 'Loading people from Jellyfin server...');
    
    try {
        // Use the Persons endpoint which provides better role information
        const response = await fetch(`${config.serverUrl}/Persons?Fields=PrimaryImageTag,Overview,PremiereDate,EndDate,ProductionRoles`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('People data received:', data);
        
        state.peopleItems = data.Items || [];
        state.filteredPeople = [...state.peopleItems];
        
        console.log(`Loaded ${state.peopleItems.length} people with roles:`, 
            state.peopleItems.map(p => ({ name: p.Name, role: p.Role, productionRoles: p.ProductionRoles })));
        
        renderPeople();
    } catch (error) {
        console.error('Load people error:', error);
        showError(elements.peopleContainer, 'Failed to load people: ' + error.message);
    }
}

// Filter people based on search query and role
function filterPeople(query) {
    if (!query.trim() && (!state.currentRoleFilter || state.currentRoleFilter === 'all')) {
        state.filteredPeople = [...state.peopleItems];
    } else {
        const lowerQuery = query.toLowerCase();
        state.filteredPeople = state.peopleItems.filter(person => {
            const matchesSearch = !query.trim() || 
                (person.Name && person.Name.toLowerCase().includes(lowerQuery));
            
            const matchesRole = !state.currentRoleFilter || 
                state.currentRoleFilter === 'all' || 
                (person.Role && person.Role === state.currentRoleFilter);
            
            return matchesSearch && matchesRole;
        });
    }
    
    renderPeople();
}

// Get display role for a person
function getDisplayRole(person) {
    // Try different role properties
    if (person.Role) return person.Role;
    if (person.ProductionRoles && person.ProductionRoles.length > 0) {
        return person.ProductionRoles[0]; // Use first production role
    }
    return 'Unknown Role';
}

// Render people based on current view
function renderPeople() {
    const container = elements.peopleContainer;
    if (!container) return;

    if (state.filteredPeople.length === 0) {
        const buttonHtml = '<button id="create-first-person" class="primary" style="margin-top: 16px;">Create First Person Manually</button>';
        showEmptyState(container, 'No People Found', 'Try adjusting your search or check if your server has people data.', buttonHtml);
        
        const createFirstPerson = document.getElementById('create-first-person');
        if (createFirstPerson) {
            createFirstPerson.addEventListener('click', openCreatePersonModal);
        }
        return;
    }

    if (state.currentView === 'grid') {
        renderPeopleGridView();
    } else if (state.currentView === 'square') {
        renderPeopleSquareView();
    } else {
        renderPeopleListView();
    }

    // Add event listeners to people items - FIXED VERSION
    setTimeout(() => {
        document.querySelectorAll('.person-item').forEach(item => {
            // Remove any existing listeners to prevent duplicates
            item.replaceWith(item.cloneNode(true));
        });

        // Re-attach event listeners
        document.querySelectorAll('.person-item').forEach(item => {
            item.addEventListener('click', function(e) {
                // Don't trigger if clicking on checkbox
                if (e.target.type === 'checkbox' || e.target.classList.contains('person-checkbox')) {
                    return;
                }
                const personId = this.getAttribute('data-id');
                console.log('Person item clicked:', personId);
                openEditPersonModal(personId);
            });

            // Add checkbox event listeners
            const checkbox = item.querySelector('.person-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', function(e) {
                    e.stopPropagation(); // Prevent triggering the item click
                    const personId = this.getAttribute('data-id');
                    const personItem = this.closest('.person-item');
                    
                    if (this.checked) {
                        state.selectedItems.add(personId);
                        personItem.classList.add('selected');
                    } else {
                        state.selectedItems.delete(personId);
                        personItem.classList.remove('selected');
                    }
                    updatePeopleSelectionUI();
                });
            }
        });
    }, 0);
}

// Render people in grid view
function renderPeopleGridView() {
    const container = elements.peopleContainer;
    let html = '<div class="people-grid">';
    
    state.filteredPeople.forEach(person => {
        const avatarUrl = person.ImageTags && person.ImageTags.Primary 
    ? `${config.serverUrl}/Items/${person.Id}/Images/Primary` 
    : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDIwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iNDAiIGZpbGw9IiNENkQ2RDYiLz48cGF0aCBkPSJNNDAgMjIwQzQwIDE4MCA4MCAxNjAgMTAwIDE2MEMxMjAgMTYwIDE2MCAxODAgMTYwIDIyMEg0MFoiIGZpbGw9IiNENkQ2RDYiLz4KPC9zdmc+'; 
        const isSelected = state.selectedItems.has(person.Id);
        const birthYear = person.PremiereDate ? new Date(person.PremiereDate).getFullYear() : '';
        const deathYear = person.EndDate ? new Date(person.EndDate).getFullYear() : '';
        const lifespan = birthYear ? (deathYear ? `${birthYear} - ${deathYear}` : `Born ${birthYear}`) : '';
        const displayRole = getDisplayRole(person);
        
        html += `
            <div class="person-item ${isSelected ? 'selected' : ''}" data-id="${person.Id}">
                <input type="checkbox" class="person-checkbox" data-id="${person.Id}" ${isSelected ? 'checked' : ''}>
                <img src="${avatarUrl}" alt="${person.Name}" class="person-avatar" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDIwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iNDAiIGZpbGw9IiNENkQ2RDYiLz48cGF0aCBkPSJNNDAgMjIwQzQwIDE4MCA4MCAxNjAgMTAwIDE2MEMxMjAgMTYwIDE2MCAxODAgMTYwIDIyMEg0MFoiIGZpbGw9IiNENkQ2RDYiLz4KPC9zdmc+'">
                <div class="person-info">
                    <div class="person-name">${escapeHtml(person.Name)}</div>
                    <div class="person-role">${displayRole}</div>
                    <div class="person-lifespan">${lifespan}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Render people in square view
function renderPeopleSquareView() {
    const container = elements.peopleContainer;
    let html = '<div class="people-square">';
    
    state.filteredPeople.forEach(person => {
        const avatarUrl = person.ImageTags && person.ImageTags.Primary 
    ? `${config.serverUrl}/Items/${person.Id}/Images/Primary` 
    : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDIwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iNDAiIGZpbGw9IiNENkQ2RDYiLz48cGF0aCBkPSJNNDAgMjIwQzQwIDE4MCA4MCAxNjAgMTAwIDE2MEMxMjAgMTYwIDE2MCAxODAgMTYwIDIyMEg0MFoiIGZpbGw9IiNENkQ2RDYiLz4KPC9zdmc+'; 
        const isSelected = state.selectedItems.has(person.Id);
        const displayRole = getDisplayRole(person);
        
        html += `
            <div class="person-item square-person ${isSelected ? 'selected' : ''}" data-id="${person.Id}">
                <input type="checkbox" class="person-checkbox" data-id="${person.Id}" ${isSelected ? 'checked' : ''}>
                <img src="${avatarUrl}" alt="${person.Name}" class="person-avatar" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDIwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iNDAiIGZpbGw9IiNENkQ2RDYiLz48cGF0aCBkPSJNNDAgMjIwQzQwIDE4MCA4MCAxNjAgMTAwIDE2MEMxMjAgMTYwIDE2MCAxODAgMTYwIDIyMEg0MFoiIGZpbGw9IiNENkQ2RDYiLz4KPC9zdmc+'">
                <div class="square-person-info">
                    <div class="person-name">${escapeHtml(person.Name)}</div>
                    <div class="person-role">${displayRole}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Render people in list view
function renderPeopleListView() {
    const container = elements.peopleContainer;
    let html = `
        <table class="people-table">
            <thead>
                <tr>
                    <th class="checkbox-cell">
                        <input type="checkbox" id="people-table-select-all">
                    </th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Birth Date</th>
                    <th>Death Date</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    state.filteredPeople.forEach(person => {
        const birthDate = person.PremiereDate ? new Date(person.PremiereDate).toLocaleDateString() : 'N/A';
        const deathDate = person.EndDate ? new Date(person.EndDate).toLocaleDateString() : 'N/A';
        const isSelected = state.selectedItems.has(person.Id);
        const displayRole = getDisplayRole(person);
        
        html += `
            <tr class="person-item ${isSelected ? 'selected' : ''}" data-id="${person.Id}">
                <td class="checkbox-cell">
                    <input type="checkbox" class="person-checkbox" data-id="${person.Id}" ${isSelected ? 'checked' : ''}>
                </td>
                <td>
                    ${escapeHtml(person.Name)}
                </td>
                <td>${escapeHtml(displayRole)}</td>
                <td>${birthDate}</td>
                <td>${deathDate}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
    
    // Add event listener for table select all
    const tableSelectAll = document.getElementById('people-table-select-all');
    if (tableSelectAll) {
        tableSelectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.person-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const personId = checkbox.getAttribute('data-id');
                const personItem = checkbox.closest('.person-item');
                
                if (this.checked) {
                    state.selectedItems.add(personId);
                    personItem.classList.add('selected');
                } else {
                    state.selectedItems.delete(personId);
                    personItem.classList.remove('selected');
                }
            });
            updatePeopleSelectionUI();
        });
    }
}

// Update people selection UI
function updatePeopleSelectionUI() {
    if (elements.selectedCount) {
        elements.selectedCount.textContent = `${state.selectedItems.size} people selected`;
    }
    
    if (elements.bulkActions) {
        if (state.selectedItems.size > 0) {
            elements.bulkActions.style.display = 'flex';
        } else {
            elements.bulkActions.style.display = 'none';
        }
    }
    
    if (elements.selectAll) {
        const checkboxes = document.querySelectorAll('.person-checkbox');
        if (checkboxes.length > 0) {
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            elements.selectAll.checked = allChecked;
        }
    }
}

// Toggle select all people
function togglePeopleSelectAll() {
    const checkboxes = document.querySelectorAll('.person-checkbox');
    const selectAll = elements.selectAll;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
        const personId = checkbox.getAttribute('data-id');
        const personItem = checkbox.closest('.person-item');
        
        if (selectAll.checked) {
            state.selectedItems.add(personId);
            personItem.classList.add('selected');
        } else {
            state.selectedItems.delete(personId);
            personItem.classList.remove('selected');
        }
    });
    updatePeopleSelectionUI();
}

// Clear people selection
function clearPeopleSelection() {
    state.selectedItems.clear();
    const checkboxes = document.querySelectorAll('.person-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        const personItem = checkbox.closest('.person-item');
        personItem.classList.remove('selected');
    });
    
    if (elements.selectAll) elements.selectAll.checked = false;
    
    updatePeopleSelectionUI();
}

// Open people bulk modal
function openPeopleBulkModal() {
    if (state.selectedItems.size === 0) {
        showAlert('person-modal-alert', 'Please select at least one person to edit.', 'error');
        return;
    }
    
    // For now, we'll just open the first selected person
    const firstPersonId = Array.from(state.selectedItems)[0];
    openEditPersonModal(firstPersonId);
}

// Open create person modal
function openCreatePersonModal() {
    const modal = document.getElementById('create-person-modal');
    modal.classList.add('active');
    document.getElementById('new-person-name').value = '';
    document.getElementById('new-person-role').value = 'Actor';
    document.getElementById('create-person-alert').innerHTML = '';
}

// Close create person modal
function closeCreatePersonModal() {
    const modal = document.getElementById('create-person-modal');
    modal.classList.remove('active');
}

// Create new person handler
async function createNewPersonHandler() {
    const name = document.getElementById('new-person-name').value.trim();
    const role = document.getElementById('new-person-role').value;
    
    if (!name) {
        showAlert('create-person-alert', 'Name is required', 'error');
        return;
    }
    
    try {
        const personData = {
            Name: name,
            Type: 'Person',
            Role: role
        };

        const response = await fetch(`${config.serverUrl}/Items`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(personData)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const person = await response.json();
        
        showAlert('create-person-alert', 'Person created successfully!', 'success');
        
        setTimeout(() => {
            closeCreatePersonModal();
            // Open edit modal for the new person to add more details
            openEditPersonModal(person.Id);
        }, 1500);

    } catch (error) {
        showAlert('create-person-alert', 'Failed to create person: ' + error.message, 'error');
    }
}

// Save person data for people page - FIXED with complete item structure
// Save person data - MINIMAL APPROACH
// Save person data for people page - USING MEDIA ITEM APPROACH
async function savePersonData() {
    if (!state.currentEditingPerson) {
        console.error('No current editing person');
        showAlert('person-modal-alert', 'No person selected for editing', 'error');
        return;
    }
    
    try {
        // Get form values
        const name = document.getElementById('person-name').value.trim();
        const selectedRole = document.getElementById('person-role').value;
        const biography = document.getElementById('person-biography').value.trim();
        const birthDate = document.getElementById('person-birth-date').value;
        const deathDate = document.getElementById('person-death-date').value;

        // Validate
        if (!name) {
            showAlert('person-modal-alert', 'Name is required', 'error');
            return;
        }

        console.log('Updating person:', state.currentEditingPerson.Id);

        // First, get the complete current person data with all fields
        const currentResponse = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${state.currentEditingPerson.Id}?Fields=Genres,Tags,CommunityRating,ProductionYear,People,Studios,ProviderIds,ImageTags`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });

        if (!currentResponse.ok) {
            throw new Error(`Failed to fetch current person: ${currentResponse.status}`);
        }

        const currentPerson = await currentResponse.json();
        console.log('Current person with full fields:', currentPerson);

        // Build update data using the same structure as media items
        const updateData = {
            // Required identifier fields
            Id: currentPerson.Id,
            ServerId: currentPerson.ServerId,
            Type: currentPerson.Type,
            
            // Basic metadata
            Name: name,
            Overview: biography || currentPerson.Overview,
            ProductionYear: currentPerson.ProductionYear,
            CommunityRating: currentPerson.CommunityRating,
            
            // Collections (ensure they're never null)
            Genres: currentPerson.Genres || [],
            Tags: currentPerson.Tags || [],
            Studios: currentPerson.Studios || [],
            People: currentPerson.People || [],
            ProductionRoles: [selectedRole],
            
            // Provider and image info
            ProviderIds: currentPerson.ProviderIds || {},
            ImageTags: currentPerson.ImageTags || {},
            
            // Additional person-specific fields
            Role: selectedRole
        };

        // Handle dates - convert empty strings to null
        if (birthDate) {
            updateData.PremiereDate = new Date(birthDate).toISOString();
        } else {
            updateData.PremiereDate = currentPerson.PremiereDate;
        }
        
        if (deathDate) {
            updateData.EndDate = new Date(deathDate).toISOString();
        } else {
            updateData.EndDate = currentPerson.EndDate;
        }

        console.log('Sending complete update data:', updateData);

        // Use the same endpoint as media items
        const response = await fetch(`${config.serverUrl}/Items/${currentPerson.Id}`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        console.log('Update response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Update failed with response:', errorText);

            // First try Persons endpoint
            console.log('Trying Persons endpoint...');
            const personsSuccess = await tryPersonsEndpointUpdate(currentPerson.Id, name, selectedRole, biography, birthDate, deathDate);

            if (!personsSuccess) {
                // If Persons endpoint fails, try minimal update
                console.log('Trying minimal update approach...');
                await tryMinimalUpdate(currentPerson.Id, name, selectedRole, biography, birthDate, deathDate);
            }
        } else {
            console.log('Update successful with complete data');
        }

        // Upload photo if selected
        const photoInput = document.getElementById('person-photo');
        if (photoInput && photoInput.files[0]) {
            console.log('Uploading photo...');
            await uploadPersonPhoto(currentPerson.Id);
        }

        showAlert('person-modal-alert', 'Person updated successfully!', 'success');
        
        setTimeout(() => {
            closeEditPersonModal();
            loadPeople();
        }, 2000);

    } catch (error) {
        console.error('Error updating person:', error);
        showAlert('person-modal-alert', `Failed to update person: ${error.message}`, 'error');
    }
}

// Alternative minimal update approach
async function tryMinimalUpdate(personId, name, role, biography, birthDate, deathDate) {
    try {
        const minimalData = {
            Name: name,
            ProductionRoles: [role],
            Role: role,
            Overview: biography || ''
        };

        // Add dates if provided
        if (birthDate) {
            minimalData.PremiereDate = new Date(birthDate).toISOString();
        }
        if (deathDate) {
            minimalData.EndDate = new Date(deathDate).toISOString();
        }

        console.log('Trying minimal update with data:', minimalData);

        const response = await fetch(`${config.serverUrl}/Items/${personId}`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(minimalData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Minimal update also failed: ${errorText}`);
        }

        console.log('Minimal update successful');
        return true;
    } catch (error) {
        console.error('Minimal update failed:', error);
        throw error;
    }
}

// Photo upload function
async function uploadPersonPhoto(personId) {
    const photoInput = document.getElementById('person-photo');
    
    if (!photoInput || !photoInput.files[0]) {
        return false;
    }

    try {
        console.log('Uploading photo for person:', personId);
        
        const formData = new FormData();
        formData.append('Image', photoInput.files[0]);

        const uploadResponse = await fetch(`${config.serverUrl}/Items/${personId}/Images/Primary`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey
            },
            body: formData
        });

        console.log('Photo upload response status:', uploadResponse.status);

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.warn('Photo upload failed:', errorText);
            return false;
        }

        console.log('Photo uploaded successfully');
        return true;
    } catch (error) {
        console.warn('Photo upload error:', error.message);
        return false;
    }
}

// Experimental: Try using Persons endpoint for update
async function tryPersonsEndpointUpdate(personId, name, role, biography, birthDate, deathDate) {
    try {
        const personData = {
            Name: name,
            Role: role,
            Overview: biography || ''
        };

        if (birthDate) {
            personData.PremiereDate = new Date(birthDate).toISOString();
        }
        if (deathDate) {
            personData.EndDate = new Date(deathDate).toISOString();
        }

        console.log('Trying Persons endpoint update:', personData);

        // Try the Persons endpoint (might not exist, but worth trying)
        const response = await fetch(`${config.serverUrl}/Persons/${personId}`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(personData)
        });

        if (response.ok) {
            console.log('Persons endpoint update successful');
            return true;
        } else if (response.status === 404) {
            console.log('Persons update endpoint not found (expected)');
            return false;
        } else {
            const errorText = await response.text();
            throw new Error(`Persons endpoint failed: ${errorText}`);
        }
    } catch (error) {
        console.warn('Persons endpoint attempt failed:', error.message);
        return false;
    }
}

// Photo upload function
async function uploadPersonPhoto(personId) {
    const photoInput = document.getElementById('person-photo');
    
    if (!photoInput || !photoInput.files[0]) {
        return false;
    }

    try {
        console.log('Uploading photo for person:', personId);
        
        const formData = new FormData();
        formData.append('Image', photoInput.files[0]);

        const uploadResponse = await fetch(`${config.serverUrl}/Items/${personId}/Images/Primary`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey
            },
            body: formData
        });

        console.log('Photo upload response:', uploadResponse.status);

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.warn('Photo upload failed:', errorText);
            return false;
        }

        console.log('Photo uploaded successfully');
        return true;
    } catch (error) {
        console.warn('Photo upload error:', error.message);
        return false;
    }
}

// Photo upload function
async function uploadPersonPhoto(personId) {
    const photoInput = document.getElementById('person-photo');
    
    if (!photoInput || !photoInput.files[0]) {
        return;
    }

    try {
        const formData = new FormData();
        formData.append('Image', photoInput.files[0]);

        const uploadResponse = await fetch(`${config.serverUrl}/Items/${personId}/Images/Primary`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey
            },
            body: formData
        });

        if (!uploadResponse.ok) {
            throw new Error(`Photo upload failed: ${uploadResponse.status}`);
        }

        console.log('Photo uploaded successfully');
        return true;
    } catch (error) {
        console.warn('Photo upload failed (person data was saved):', error.message);
        return false;
    }
}

// Separate function for photo upload
async function uploadPersonPhoto(personId) {
    const photoInput = document.getElementById('person-photo');
    
    if (!photoInput || !photoInput.files[0]) {
        console.log('No photo to upload');
        return;
    }

    try {
        console.log('Starting photo upload for person:', personId);
        
        const formData = new FormData();
        formData.append('Image', photoInput.files[0]);

        const uploadResponse = await fetch(`${config.serverUrl}/Items/${personId}/Images/Primary`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': config.apiKey
            },
            body: formData
        });

        console.log('Photo upload response status:', uploadResponse.status);

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.warn('Photo upload failed:', errorText);
            throw new Error(`Photo upload failed: ${uploadResponse.status}`);
        }

        console.log('Photo uploaded successfully');
        return true;
    } catch (error) {
        console.warn('Photo upload error (non-fatal):', error.message);
        // Don't throw error here - person data was saved successfully
        return false;
    }
}

// Open edit person modal for people page - FIXED to use correct endpoint
async function openEditPersonModal(personId) {
    try {
        console.log('Opening edit modal for person:', personId);
        
        // Use the Persons endpoint with the person ID directly
        const response = await fetch(`${config.serverUrl}/Persons/${personId}?Fields=PrimaryImageTag,Overview,PremiereDate,EndDate,ProductionRoles`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        if (!response.ok) {
            // If the Persons endpoint fails, try the Items endpoint as fallback
            console.log('Persons endpoint failed, trying Items endpoint...');
            const fallbackResponse = await fetch(`${config.serverUrl}/Users/${state.currentUserId}/Items/${personId}?Fields=PrimaryImageTag,Overview,PremiereDate,EndDate,ProductionRoles`, {
                headers: {
                    'X-Emby-Token': config.apiKey
                }
            });
            
            if (!fallbackResponse.ok) {
                throw new Error(`Both endpoints failed: Persons - ${response.status}, Items - ${fallbackResponse.status}`);
            }
            
            const person = await fallbackResponse.json();
            await populatePersonForm(person);
        } else {
            const person = await response.json();
            await populatePersonForm(person);
        }
        
    } catch (error) {
        console.error('Error in openEditPersonModal:', error);
        showAlert('person-modal-alert', 'Failed to load person details: ' + error.message, 'error');
    }
}

// Helper function to populate the person form
async function populatePersonForm(person) {
    state.currentEditingPerson = person;
    
    console.log('Editing person:', person.Name, person.Id);
    
    // Populate basic fields
    document.getElementById('person-name').value = person.Name || '';
    document.getElementById('person-biography').value = person.Overview || '';
    
    // Handle role dropdown
    const roleSelect = document.getElementById('person-role');
    let currentRole = 'Actor'; // default
    
    // Check various possible role properties
    if (person.Role) {
        currentRole = person.Role;
    } else if (person.ProductionRoles && person.ProductionRoles.length > 0) {
        currentRole = person.ProductionRoles[0];
    }
    
    if (roleSelect) {
        // Set the role value
        roleSelect.value = currentRole;
        
        // If role doesn't exist in dropdown, add it
        if (!Array.from(roleSelect.options).some(option => option.value === currentRole)) {
            const newOption = document.createElement('option');
            newOption.value = currentRole;
            newOption.textContent = currentRole;
            roleSelect.appendChild(newOption);
            roleSelect.value = currentRole;
        }
    }
    
    // Format dates
    const birthDate = person.PremiereDate ? new Date(person.PremiereDate).toISOString().split('T')[0] : '';
    const deathDate = person.EndDate ? new Date(person.EndDate).toISOString().split('T')[0] : '';
    
    document.getElementById('person-birth-date').value = birthDate;
    document.getElementById('person-death-date').value = deathDate;
    
    // Reset photo input
    const photoInput = document.getElementById('person-photo');
    if (photoInput) {
        photoInput.value = ''; // Clear any previous file selection
        const label = photoInput.previousElementSibling;
        if (label) {
            label.classList.remove('has-file');
            label.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                Upload Photo
            `;
        }
    }
    
    // Set photo preview
    await setPersonPhotoPreview(person);
    
    // Clear any previous alerts
    document.getElementById('person-modal-alert').innerHTML = '';
    
    // Show modal
    const modal = document.getElementById('edit-person-modal');
    if (modal) {
        modal.classList.add('active');
    }
}

// Helper function to set person photo preview
async function setPersonPhotoPreview(person) {
    const preview = document.getElementById('person-photo-preview');
    if (!preview) return;
    
    // Clear previous preview
    preview.innerHTML = '<div class="photo-preview empty">Loading...</div>';
    
    if (person.ImageTags && person.ImageTags.Primary) {
        const avatarUrl = `${config.serverUrl}/Items/${person.Id}/Images/Primary`;
        
        // Create image and handle load/error events
        const img = new Image();
        img.onload = function() {
            preview.innerHTML = `<img src="${avatarUrl}" alt="${person.Name}" style="width: 100%; height: 100%; object-fit: cover;">`;
        };
        img.onerror = function() {
            preview.innerHTML = '<div class="photo-preview empty">Image not available</div>';
        };
        img.src = avatarUrl;
        
        // Add authentication header by creating a blob URL
        try {
            const response = await fetch(avatarUrl, {
                headers: {
                    'X-Emby-Token': config.apiKey
                }
            });
            if (response.ok) {
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                preview.innerHTML = `<img src="${blobUrl}" alt="${person.Name}" style="width: 100%; height: 100%; object-fit: cover;">`;
            } else {
                preview.innerHTML = '<div class="photo-preview empty">Image not available</div>';
            }
        } catch (error) {
            preview.innerHTML = '<div class="photo-preview empty">Image not available</div>';
        }
    } else {
        preview.innerHTML = '<div class="photo-preview empty">No photo available</div>';
    }
}
// Helper function to set person photo preview
async function setPersonPhotoPreview(person) {
    const preview = document.getElementById('person-photo-preview');
    
    if (person.ImageTags && person.ImageTags.Primary) {
        const avatarUrl = `${config.serverUrl}/Items/${person.Id}/Images/Primary`;
        
        // Test if image actually exists
        try {
            const testResponse = await fetch(avatarUrl, {
                method: 'HEAD',
                headers: {
                    'X-Emby-Token': config.apiKey
                }
            });
            
            if (testResponse.ok) {
                preview.innerHTML = `<img src="${avatarUrl}" alt="${person.Name}" style="width: 100%; height: 100%; object-fit: cover;">`;
            } else {
                preview.innerHTML = '<div class="photo-preview empty">Image not available</div>';
            }
        } catch (error) {
            preview.innerHTML = '<div class="photo-preview empty">Image not available</div>';
        }
    } else {
        preview.innerHTML = '<div class="photo-preview empty">No photo available</div>';
    }
}

// Close edit person modal
function closeEditPersonModal() {
    const modal = document.getElementById('edit-person-modal');
    modal.classList.remove('active');
    modal.style.display = 'none';
    state.currentEditingPerson = null;
}