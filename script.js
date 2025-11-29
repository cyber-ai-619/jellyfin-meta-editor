// Configuration - shared between both pages
const config = {
    serverUrl: 'http://localhost:8096',
    apiKey: '5fd44655d40a49e0979b7b0b5c738a40'
};

// Common utility functions

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show alert function
function showAlert(containerId, message, type) {
    const alertContainer = document.getElementById(containerId);
    if (!alertContainer) {
        console.error('Alert container not found:', containerId);
        return;
    }
    
    const icon = type === 'error' ? 
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>' :
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    
    alertContainer.innerHTML = `
        <div class="alert alert-${type}">
            ${icon}
            <div class="alert-content">
                <strong>${type === 'error' ? 'Error' : 'Success'}:</strong>
                ${escapeHtml(message)}
            </div>
        </div>
    `;
    
    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 3000);
    }
}

// Get user ID from Jellyfin (common for both pages)
async function getUserId() {
    try {
        const response = await fetch(`${config.serverUrl}/Users`, {
            headers: {
                'X-Emby-Token': config.apiKey
            }
        });
        
        console.log('Users API response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const users = await response.json();
        console.log('Users data:', users);
        if (users.length > 0) {
            return users[0].Id;
        } else {
            throw new Error('No users found on Jellyfin server');
        }
    } catch (error) {
        throw new Error('Failed to get user ID: ' + error.message);
    }
}

// Common function to update server info
function updateServerInfo(serverInfoElement, userId) {
    if (serverInfoElement && userId) {
        serverInfoElement.textContent = 'Connected to: LAPTOP-15DW3XX';
    } else if (serverInfoElement) {
        serverInfoElement.textContent = 'Not connected';
    }
}

// Common function to initialize tag inputs
function initializeTagInputs() {
    // Individual edit modal
    const genreInput = document.getElementById('genre-input');
    const tagsInput = document.getElementById('tag-input');
    
    if (genreInput) {
        genreInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                if (this.value.trim()) {
                    addTag(this.value, 'genres-container');
                    this.value = '';
                }
            }
        });
    }
    
    if (tagsInput) {
        tagsInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                if (this.value.trim()) {
                    addTag(this.value, 'tags-container');
                    this.value = '';
                }
            }
        });
    }

    // Bulk edit modal
    const bulkGenreInput = document.getElementById('bulk-genre-input');
    const bulkTagsInput = document.getElementById('bulk-tag-input');
    const bulkRemoveTagsInput = document.getElementById('bulk-remove-tag-input');
    
    if (bulkGenreInput) {
        bulkGenreInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                if (this.value.trim()) {
                    addTag(this.value, 'bulk-genres-container');
                    this.value = '';
                }
            }
        });
    }
    
    if (bulkTagsInput) {
        bulkTagsInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                if (this.value.trim()) {
                    addTag(this.value, 'bulk-tags-container');
                    this.value = '';
                }
            }
        });
    }
    
    if (bulkRemoveTagsInput) {
        bulkRemoveTagsInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                if (this.value.trim()) {
                    addTag(this.value, 'bulk-remove-tags-container');
                    this.value = '';
                }
            }
        });
    }
}

// Add a tag to a container
function addTag(value, containerId, collection = null) {
    if (!value.trim()) return;
    
    const cleanValue = value.replace(/,/g, '').trim();
    if (!cleanValue) return;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `
        ${cleanValue}
        <button class="tag-remove" data-value="${cleanValue}">&times;</button>
    `;
    
    const input = container.querySelector('input');
    if (input) {
        container.insertBefore(tag, input);
    } else {
        container.appendChild(tag);
    }
    
    // Add to collection if provided
    if (collection && !collection.includes(cleanValue)) {
        collection.push(cleanValue);
    }
    
    // Add remove event listener
    tag.querySelector('.tag-remove').addEventListener('click', function() {
        tag.remove();
        if (collection) {
            const index = collection.indexOf(cleanValue);
            if (index > -1) {
                collection.splice(index, 1);
            }
        }
    });
}

// Common loading state function
function showLoading(container, message = 'Loading...') {
    if (container) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }
}

// Common error display function
function showError(container, message) {
    if (container) {
        container.innerHTML = `
            <div class="alert alert-error">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                ${escapeHtml(message)}
            </div>
        `;
    }
}

// Common empty state function
function showEmptyState(container, title = 'No items found', message = 'Try adjusting your search.', buttonHtml = '') {
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 4V3H9v1H4v2h1v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h1V4h-5zm-6 1h4v1H9V5zm7 14H8V6h8v13z"/>
                </svg>
                <h3>${title}</h3>
                <p>${message}</p>
                ${buttonHtml}
            </div>
        `;
    }
}

// Extract director and actors from People array
function getDirectorAndActors(people) {
    if (!people || !Array.isArray(people)) {
        return { director: '', actors: [] };
    }
    
    const director = people.find(person => person.Type === 'Director')?.Name || '';
    const actors = people
        .filter(person => person.Type === 'Actor')
        .map(person => person.Name)
        .filter(name => name);
    
    return { director, actors };
}