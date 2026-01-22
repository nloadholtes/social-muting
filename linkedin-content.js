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
      // New LinkedIn structure (2024+) - uses componentkey and data-view-name
      '[componentkey]:has([data-view-name="feed-commentary"])',
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
        container.querySelectorAll('[data-view-name="feed-commentary"]') : [];

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
    // Extract text from various LinkedIn post elements
    // New LinkedIn structure (2024+) - uses data-view-name attributes
    const newSelectors = [
      '[data-view-name="feed-commentary"]',
      '[data-view-name="feed-actor-image"]',
      '[data-view-name="feed-linkedin-video-description"]',
      '[data-view-name="feed-call-to-action"]'
    ];

    // Legacy selectors for backwards compatibility
    const legacySelectors = [
      '.feed-shared-text',
      '.feed-shared-update-v2__description',
      '.feed-shared-text__text-view',
      '.feed-shared-header__title',
      '.feed-shared-actor__name',
      '.feed-shared-article__title',
      '.feed-shared-article__description',
      '.feed-shared-external-video__title',
      '.feed-shared-external-video__subtitle',
      '.update-components-header__text-view',
      '.update-components-header__text-wrapper',
      '.update-components-actor__title',
      '.update-components-actor__description',
      '.update-components-actor__sub-description'
    ];

    const allSelectors = [...newSelectors, ...legacySelectors];

    let allText = '';

    // Try specific selectors first
    const textElements = post.querySelectorAll(allSelectors.join(','));
    textElements.forEach(el => {
      allText += ' ' + el.textContent;
    });

    // If we didn't find much text with selectors, fall back to getting all text
    // from paragraph and span elements (handles obfuscated class names)
    if (allText.trim().length < 20) {
      const fallbackElements = post.querySelectorAll('p, span, a');
      fallbackElements.forEach(el => {
        // Avoid script and style content
        if (!el.closest('script') && !el.closest('style')) {
          allText += ' ' + el.textContent;
        }
      });
    }

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
