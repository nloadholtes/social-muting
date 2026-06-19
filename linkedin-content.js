class LinkedInMuter {
  constructor() {
    this.mutedKeywords = [];
    this.observer = null;
    this.init();
  }

  async init() {
    await this.loadKeywords();
    this.setupMutationObserver();
    this.processExistingPosts();
    this.setupMessageListener();
  }

  async loadKeywords() {
    try {
      const result = await chrome.storage.sync.get(['mutedKeywords']);
      this.mutedKeywords = result.mutedKeywords || [];
    } catch (error) {
      console.error('Error loading keywords:', error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'refreshKeywords') {
        this.loadKeywords().then(() => {
          this.processExistingPosts();
        });
      }
    });
  }

  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNewContent(node);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  processNewContent(element) {
    // Find post containers in the new content
    const posts = this.findPosts(element);
    posts.forEach(post => this.processPost(post));
  }

  processExistingPosts() {
    const posts = this.findPosts(document);
    posts.forEach(post => this.processPost(post));
  }

  findPosts(container) {
    // LinkedIn post selectors - these may need updates as LinkedIn changes
    const selectors = [
      // New LinkedIn structure (2025+) - uses componentkey^="feed-commentary_"
      '[componentkey]:has([componentkey^="feed-commentary_"])',
      '[componentkey]:has([data-testid="expandable-text-box"])',
      '[role="listitem"][componentkey]:has(h2)',
      // Old LinkedIn structure (2024) - used data-view-name
      '[componentkey]:has([data-view-name="feed-commentary"])',
      '[componentkey]:has(h2 span._9a8c9abc)',
      '[componentkey]:has(h2 span.bc8ea8e7)',
      // Legacy selectors for backwards compatibility
      '[data-id*="urn:li:activity"]',
      '.feed-shared-update-v2',
      '.occludable-update',
      '.feed-shared-update-v2__content',
      '[data-urn*="urn:li:activity"]'
    ];

    let posts = new Set();

    // First, try finding posts with the new structure using :has()
    selectors.forEach(selector => {
      try {
        const found = container.querySelectorAll ?
          container.querySelectorAll(selector) :
          container.matches && container.matches(selector) ? [container] : [];
        Array.from(found).forEach(el => posts.add(el));
      } catch (e) {
        // :has() may not be supported in older browsers, skip those selectors
      }
    });

    // Fallback: find commentary elements and traverse up to find post containers
    if (posts.size === 0) {
      const commentaries = container.querySelectorAll ?
        container.querySelectorAll('[componentkey^="feed-commentary_"], [data-view-name="feed-commentary"], [data-testid="expandable-text-box"]') : [];

      commentaries.forEach(commentary => {
        const postContainer = this.findPostContainer(commentary);
        if (postContainer) {
          posts.add(postContainer);
        }
      });
    }

    return Array.from(posts);
  }

  findPostContainer(element) {
    // Traverse up to find the post container
    let current = element;
    while (current && current !== document.body) {
      // Check if this looks like a post container
      if (current.hasAttribute && current.hasAttribute('componentkey')) {
        // Check if it contains an h2 (typically "Feed post" header)
        const h2 = current.querySelector('h2');
        if (h2) {
          return current;
        }
      }
      // Also check for legacy post markers
      if (current.classList && (
        current.classList.contains('feed-shared-update-v2') ||
        current.classList.contains('occludable-update')
      )) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  processPost(post) {
    if (post.dataset.keywordMuted) return;

    const textContent = this.extractTextContent(post);
    const matchedKeywords = this.findMatchingKeywords(textContent);

    if (matchedKeywords.length > 0) {
      this.mutePost(post, matchedKeywords);
    }
  }

  extractTextContent(post) {
    let allText = '';

    // Grab all text from p/span/a in the post container.
    // LinkedIn obfuscates class names, so we can't rely on stable selectors for
    // things like "Person X loves this" headers — a full sweep is more resilient.
    const allElements = post.querySelectorAll('p, span, a');
    allElements.forEach(el => {
      if (!el.closest('script') && !el.closest('style')) {
        allText += ' ' + el.textContent;
      }
    });

    return allText.toLowerCase();
  }

  findMatchingKeywords(text) {
    return this.mutedKeywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );
  }

  mutePost(post, matchedKeywords) {
    post.dataset.keywordMuted = 'true';
    post.style.display = 'none';

    // Create and insert the muted indicator
    const indicator = this.createMutedIndicator(matchedKeywords);
    post.parentNode.insertBefore(indicator, post);

    // Add click handler to show the post
    const showBtn = indicator.querySelector('.show-muted-post');
    showBtn.addEventListener('click', () => {
      post.style.display = '';
      indicator.remove();
      post.dataset.keywordMuted = 'false';
    });
  }

  createMutedIndicator(matchedKeywords) {
    const indicator = document.createElement('div');
    indicator.className = 'keyword-muted-indicator';
    indicator.innerHTML = `
      <div class="muted-post-notice">
        <span class="muted-icon">🔇</span>
        <span class="muted-text">Post muted due to keyword${matchedKeywords.length > 1 ? 's' : ''}: ${matchedKeywords.join(', ')}</span>
        <button class="show-muted-post">Show Post</button>
      </div>
    `;
    return indicator;
  }
}

// Initialize the muter when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LinkedInMuter();
  });
} else {
  new LinkedInMuter();
}
