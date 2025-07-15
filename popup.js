document.addEventListener('DOMContentLoaded', function() {
  const keywordInput = document.getElementById('keywordInput');
  const addKeywordBtn = document.getElementById('addKeyword');
  const keywordList = document.getElementById('keywordList');
  
  // Load existing keywords on popup open
  loadKeywords();
  
  // Add keyword event listeners
  addKeywordBtn.addEventListener('click', addKeyword);
  keywordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addKeyword();
    }
  });
  
  async function loadKeywords() {
    try {
      const result = await chrome.storage.sync.get(['mutedKeywords']);
      const keywords = result.mutedKeywords || [];
      displayKeywords(keywords);
    } catch (error) {
      console.error('Error loading keywords:', error);
    }
  }
  
  async function addKeyword() {
    const keyword = keywordInput.value.trim().toLowerCase();
    if (!keyword) return;
    
    try {
      const result = await chrome.storage.sync.get(['mutedKeywords']);
      const keywords = result.mutedKeywords || [];
      
      if (!keywords.includes(keyword)) {
        keywords.push(keyword);
        await chrome.storage.sync.set({ mutedKeywords: keywords });
        displayKeywords(keywords);
        keywordInput.value = '';
        
        // Notify content scripts to refresh
        notifyContentScripts();
      }
    } catch (error) {
      console.error('Error adding keyword:', error);
    }
  }
  
  async function removeKeyword(keyword) {
    try {
      const result = await chrome.storage.sync.get(['mutedKeywords']);
      const keywords = result.mutedKeywords || [];
      const updatedKeywords = keywords.filter(k => k !== keyword);
      
      await chrome.storage.sync.set({ mutedKeywords: updatedKeywords });
      displayKeywords(updatedKeywords);
      
      // Notify content scripts to refresh
      notifyContentScripts();
    } catch (error) {
      console.error('Error removing keyword:', error);
    }
  }
  
  function displayKeywords(keywords) {
    if (keywords.length === 0) {
      keywordList.innerHTML = '<div class="empty-state">No keywords muted yet</div>';
      return;
    }
    
    keywordList.innerHTML = keywords.map(keyword => `
      <div class="keyword-item">
        <span class="keyword-text">${keyword}</span>
        <button class="remove-btn" data-keyword="${keyword}">Remove</button>
      </div>
    `).join('');
    
    // Add event listeners to remove buttons
    keywordList.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const keyword = this.getAttribute('data-keyword');
        removeKeyword(keyword);
      });
    });
  }
  
  async function notifyContentScripts() {
    try {
      const tabs = await chrome.tabs.query({
        url: ['*://*.linkedin.com/*', '*://*.facebook.com/*']
      });
      
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { action: 'refreshKeywords' }).catch(() => {
          // Ignore errors if content script isn't ready
        });
      }
    } catch (error) {
      console.error('Error notifying content scripts:', error);
    }
  }
});