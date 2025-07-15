class FacebookMuter {
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
    const posts = this.findPosts(element);
    posts.forEach(post => this.processPost(post));
  }

  processExistingPosts() {
    const posts = this.findPosts(document);
    posts.forEach(post => this.processPost(post));
  }

  findPosts(container) {
    // Facebook post selectors - these may need updates as Facebook changes
    const selectors = [
      '[data-pagelet="FeedUnit"]',
      '[data-pagelet*="FeedUnit"]',
      '[role="article"]',
      '.userContentWrapper',
      '[data-testid="fbfeed_story"]',
      '.story_body_container',
      '[data-ft*="top_level_post_id"]'
    ];

    let posts = [];
    selectors.forEach(selector => {
      const found = container.querySelectorAll ? 
        container.querySelectorAll(selector) : 
        container.matches && container.matches(selector) ? [container] : [];
      posts = posts.concat(Array.from(found));
    });

    return posts;
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
    // Extract text from various Facebook post elements
    const textElements = post.querySelectorAll([
      '[data-testid="post_message"]',
      '.userContent',
      '.text_exposed_root',
      '.text_exposed_show',
      '[data-testid="story-subtitle"]',
      '.story_body_container',
      '.userContentWrapper .userContent',
      '.mtm ._5pbx',
      '._5pbx',
      '[data-ad-preview="message"]',
      '.story_body_container span',
      'span[lang]'
    ].join(','));

    let allText = '';
    textElements.forEach(el => {
      allText += ' ' + el.textContent;
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
    new FacebookMuter();
  });
} else {
  new FacebookMuter();
}