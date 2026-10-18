(function() {
  'use strict';
  
  // Configuration
  const HOVER_DELAY = 300;
  const IS_YOUTUBE = window.location.hostname.includes('youtube.com');
  const IS_TWITTER = window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com');
  const DEBUG_ENABLED = !IS_YOUTUBE; // Disable logs on YouTube to reduce clutter
  
  // Debug logging helper
  const debugLog = (...args) => {
    if (DEBUG_ENABLED) console.log(...args);
  };
  
  const REDDIT_HOSTS = [
    'reddit.com',
    'www.reddit.com',
    'old.reddit.com',
    'new.reddit.com',
    'np.reddit.com',
    'redd.it'
  ];
  const TWITTER_HOSTS = new Set([
    'twitter.com',
    'www.twitter.com',
    'x.com',
    'www.x.com'
  ]);
  const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com'
  ]);
  
  // State management
  let currentHoverTimeout = null;
  let hideTimeout = null;
  let lastProcessedUrl = null;
  let currentlyProcessingUrl = null;
  let currentlyDisplayedUrl = null; // Track what URL the tooltip is currently showing
  let processingElement = null; // Track element being processed for positioning
  let tooltip = null;
  let tooltipContent = null; // Content wrapper inside tooltip
  let tooltipCloseHandlerAttached = false;
  let twitterHoverTimeout = null;
  let currentTwitterArticle = null;
  let currentTwitterTweetId = null;
  let pendingTwitterThreadId = null;
  let pendingTwitterStartedAt = 0;
  let displayMode = 'tooltip';
  let gazeEnabled = false;
  let currentTooltipPlacement = 'auto';
  let currentYouTubeRequestToken = 0;
  let currentHoveredElement = null;
  let isMouseInTooltip = false;
  let displayTimes = new Map(); // Track when each URL was displayed (url -> timestamp)
  let hoverTimeouts = new Map(); // Track hover timeouts per URL (url -> {timeoutId, requestToken})
  
  // Twitter-specific state
  const twitterGqlCache = new Map(); // tweetId -> array of captured JSON blobs
  let twitterInterceptorInstalled = false;
  
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  
  // Create tooltip
  function createTooltip() {
    // If tooltip exists but doesn't have the content wrapper, recreate it
    if (tooltip && tooltipContent && tooltipContent.parentNode === tooltip) {
      return tooltip;
    }

    // Remove old tooltip if it exists (for clean recreation)
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
      tooltip = null;
      tooltipContent = null;
    }
    
    // Inject CSS for tooltip list styling and close button
    if (!document.getElementById('hover-tooltip-styles')) {
      const style = document.createElement('style');
      style.id = 'hover-tooltip-styles';
      style.textContent = `
        #hover-summary-tooltip ul {
          margin: 12px 0;
          padding-left: 24px;
          list-style-type: disc;
          list-style-position: outside;
        }
        #hover-summary-tooltip li {
          margin-bottom: 8px;
          line-height: 1.6;
          display: list-item;
        }
        #hover-summary-tooltip strong {
          font-weight: 600;
        }
        #hover-summary-tooltip em {
          font-style: italic;
        }
        .tooltip-close-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.05);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
          color: #666;
          transition: all 0.2s ease;
          padding: 0;
          z-index: 1;
        }
        .tooltip-close-btn:hover {
          background: rgba(0, 0, 0, 0.1);
          color: #333;
          transform: scale(1.1);
        }
      `;
      document.head.appendChild(style);
    }
    
    tooltip = document.createElement('div');
    tooltip.id = 'hover-summary-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1);
      padding: 16px 40px 16px 16px;
      max-width: 400px;
      max-height: 500px;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1a1a1a;
      display: none;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.2s ease;
      cursor: auto;
      user-select: text;
    `;

    // Create content wrapper (so innerHTML changes don't remove close button)
    tooltipContent = document.createElement('div');
    tooltipContent.className = 'tooltip-content-wrapper';
    tooltip.appendChild(tooltipContent);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tooltip-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('data-gaze-clickable', 'true'); // Make it work with gaze dwell
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTooltip();
    });
    tooltip.appendChild(closeBtn);

    // Make tooltip interactive - prevent hiding when mouse enters
    tooltip.addEventListener('mouseenter', () => {
      isMouseInTooltip = true;
      clearTimeout(hideTimeout);
      hideTimeout = null;
    });

    // Hide with delay when mouse leaves tooltip
    tooltip.addEventListener('mouseleave', () => {
      isMouseInTooltip = false;
      scheduleHide(200); // Short delay when leaving tooltip
    });

    document.body.appendChild(tooltip);
    return tooltip;
  }
  
  // Position tooltip
  function positionTooltip(element, placement = 'auto') {
    if (!tooltip || !element) return;
    
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 12;
    
    let top = rect.top;
    let left = rect.left;
    
    if (placement === 'right') {
      left = rect.right + gap;
      if (left + tooltipRect.width > viewportWidth - gap) {
        left = rect.left - gap - tooltipRect.width;
      }
      if (left < gap) {
        left = Math.max(gap, rect.left);
      }
      top = Math.max(gap, Math.min(rect.top, viewportHeight - tooltipRect.height - gap));
    } else if (placement === 'left') {
      left = rect.left - gap - tooltipRect.width;
      if (left < gap) {
        left = rect.right + gap;
      }
      if (left + tooltipRect.width > viewportWidth - gap) {
        left = Math.max(gap, viewportWidth - tooltipRect.width - gap);
      }
      top = Math.max(gap, Math.min(rect.top, viewportHeight - tooltipRect.height - gap));
    } else {
      if (rect.bottom + gap + tooltipRect.height < viewportHeight) {
        top = rect.bottom + gap;
      } else if (rect.top - gap - tooltipRect.height > 0) {
        top = rect.top - gap - tooltipRect.height;
      } else {
        top = Math.max(gap, (viewportHeight - tooltipRect.height) / 2);
      }
      left = rect.left;
      if (left + tooltipRect.width > viewportWidth - gap) {
        left = Math.max(gap, rect.right - tooltipRect.width);
      }
      if (left < gap) {
        left = gap;
      }
    }
    
    top = Math.max(gap, Math.min(top, viewportHeight - tooltipRect.height - gap));
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }
  
  const handleTooltipPointerDown = (event) => {
    if (!tooltip || tooltip.style.display !== 'block') return;
    if (tooltip.contains(event.target)) {
      return;
    }
    hideTooltip();
  };
  
  const handleTooltipKeyDown = (event) => {
    if (event.key === 'Escape' && tooltip && tooltip.style.display === 'block') {
      event.preventDefault();
      cancelActiveSummary('escape_key');
    }
  };
  
  function attachTooltipDismissHandlers() {
    if (tooltipCloseHandlerAttached) return;
    document.addEventListener('pointerdown', handleTooltipPointerDown, true);
    document.addEventListener('keydown', handleTooltipKeyDown, true);
    tooltipCloseHandlerAttached = true;
  }
  
  function detachTooltipDismissHandlers() {
    if (!tooltipCloseHandlerAttached) return;
    document.removeEventListener('pointerdown', handleTooltipPointerDown, true);
    document.removeEventListener('keydown', handleTooltipKeyDown, true);
    tooltipCloseHandlerAttached = false;
  }

  function cancelActiveSummary(reason = 'user_cancel') {
    const previousUrl = currentlyProcessingUrl;
    const wasYouTube = previousUrl ? (() => {
      try {
        const parsed = new URL(previousUrl, window.location.origin);
        return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
      } catch (error) {
        return false;
      }
    })() : false;
    
    if (currentHoverTimeout) {
      clearTimeout(currentHoverTimeout);
      currentHoverTimeout = null;
    }
    hoverTimeouts.forEach(({ timeoutId }) => {
      clearTimeout(timeoutId);
    });
    hoverTimeouts.clear();
    
    hideTooltip();
    
    currentlyProcessingUrl = null;
    processingElement = null;
    currentHoveredElement = null;
    
    if (IS_TWITTER) {
      clearTwitterState();
    }
    
    if (wasYouTube) {
      const videoId = extractYouTubeVideoId(previousUrl);
      if (videoId) {
        chrome.runtime.sendMessage({
          action: 'ABORT_YOUTUBE_SUMMARY',
          videoId,
          reason
        });
      }
    }
  }
  
  // ============ Twitter-Specific Helpers ============
  
  function ensureTwitterInterceptor() {
    if (!IS_TWITTER || twitterInterceptorInstalled) return;
    twitterInterceptorInstalled = true;
    injectTwitterInterceptor();
    window.addEventListener('message', handleTwitterPostMessage);
  }
  
  function injectTwitterInterceptor() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('twitter/twitter-interceptor.js');
    script.type = 'text/javascript';
    script.onload = () => {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }
  
  function handleTwitterPostMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'hover-preview-twitter' || data.type !== 'TWITTER_GQL_RESPONSE') return;
    try {
      const payload = data.payload;
      if (!payload || !payload.json) return;
      recordTwitterGqlPayload(payload.json);
    } catch (error) {
      console.warn('[Twitter] Failed to process intercepted payload:', error);
    }
  }
  
  function recordTwitterGqlPayload(json) {
    const tweetIds = extractTweetIdsFromJson(json);
    if (!tweetIds.length) return;
    tweetIds.forEach((id) => {
      if (!twitterGqlCache.has(id)) {
        twitterGqlCache.set(id, []);
      }
      const entries = twitterGqlCache.get(id);
      entries.push(json);
      if (entries.length > 8) {
        entries.shift();
      }
    });
  }
  
  function extractTweetIdsFromJson(obj) {
    const ids = new Set();
    const visited = new Set();
    
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (visited.has(node)) return;
      visited.add(node);
      
      if (node.rest_id || node.restId) {
        const id = String(node.rest_id || node.restId);
        if (id) ids.add(id);
      }
      
      if (node.legacy && node.legacy.id_str) {
        ids.add(String(node.legacy.id_str));
      }
      
      for (const key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        const value = node[key];
        if (typeof value === 'object' && value !== null) {
          walk(value);
        }
      }
    }
    
    try {
      walk(obj);
    } catch (error) {
      console.warn('[Twitter] Failed to extract tweet IDs:', error);
    }
    
    return Array.from(ids);
  }
  
  function buildThreadFromCache(tweetId) {
    if (!tweetId) return null;
    const blobs = twitterGqlCache.get(tweetId);
    if (!blobs || !blobs.length) return null;
    
    const nodesById = new Map();
    blobs.forEach((blob) => {
      collectTweetsFromPayload(blob, nodesById);
    });
    
    if (!nodesById.size) return null;
    
    const rootNode = nodesById.get(tweetId) || Array.from(nodesById.values())[0];
    if (!rootNode) return null;
    
    const conversationId = rootNode.conversationId || null;
    const collectedNodes = [];
    
    nodesById.forEach((node) => {
      if (conversationId && node.conversationId && node.conversationId !== conversationId) {
        return;
      }
      collectedNodes.push(Object.assign({}, node));
    });
    
    if (!collectedNodes.length) return null;
    
    collectedNodes.sort((a, b) => {
      const aTime = a.timestamp || '';
      const bTime = b.timestamp || '';
      return aTime.localeCompare(bTime);
    });
    
    const limitedNodes = collectedNodes.slice(0, 20);
    if (!limitedNodes.some((node) => node.id === rootNode.id)) {
      limitedNodes.unshift(Object.assign({}, rootNode));
    }
    limitedNodes.forEach((node, index) => {
      node.order = index;
    });
    
    return {
      rootId: rootNode.id,
      conversationId,
      nodes: limitedNodes,
      source: 'interceptor'
    };
  }
  
  function collectTweetsFromPayload(obj, map) {
    const visited = new Set();
    
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (visited.has(node)) return;
      visited.add(node);
      
      const candidate = extractTweetCandidate(node);
      if (candidate) {
        const id = candidate.id;
        if (!map.has(id) || (candidate.text && candidate.text.length > (map.get(id).text || '').length)) {
          map.set(id, candidate);
        }
      }
      
      for (const key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        const value = node[key];
        if (typeof value === 'object' && value !== null) {
          walk(value);
        }
      }
    }
    
    walk(obj);
  }
  
  function extractTweetCandidate(node) {
    const result = resolveTweetResult(node);
    if (!result) return null;
    
    const legacy = result.legacy || (result.tweet && result.tweet.legacy);
    if (!legacy) return null;
    
    const id = result.rest_id || (legacy && legacy.id_str);
    if (!id) return null;
    
    const userLegacy = (result.core && result.core.user_results && result.core.user_results.result && result.core.user_results.result.legacy) ||
                       (result.author && result.author.legacy) ||
                       null;
    
    const text = extractTweetText(result, legacy);
    const timestamp = legacy.created_at ? new Date(legacy.created_at).toISOString() : null;
    const conversationId = legacy.conversation_id_str || null;
    const handle = userLegacy ? userLegacy.screen_name : (legacy && legacy.screen_name) || null;
    const authorName = userLegacy ? userLegacy.name : null;
    const avatarUrl = userLegacy ? userLegacy.profile_image_url_https : null;
    const permalink = handle ? `https://x.com/${handle}/status/${id}` : (legacy.url || null);
    const inReplyToId = legacy.in_reply_to_status_id_str ? String(legacy.in_reply_to_status_id_str) : null;
    
    const media = extractTweetMedia(legacy);
    
    return {
      id: String(id),
      conversationId: conversationId ? String(conversationId) : null,
      authorName: authorName || null,
      handle: handle ? `@${handle}` : null,
      avatarUrl: avatarUrl || null,
      timestamp,
      permalink,
      text,
      media,
      inReplyToId,
      order: 0
    };
  }
  
  function resolveTweetResult(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.__typename === 'Tweet') return node;
    if (node.result && node.result.__typename === 'Tweet') return node.result;
    if (node.tweet && node.tweet.__typename === 'Tweet') return node.tweet;
    if (node.tweet_results && node.tweet_results.result && node.tweet_results.result.__typename === 'Tweet') return node.tweet_results.result;
    if (node.itemContent && node.itemContent.tweet_results && node.itemContent.tweet_results.result) {
      return node.itemContent.tweet_results.result;
    }
    if (node.item && node.item.itemContent && node.item.itemContent.tweet_results && node.item.itemContent.tweet_results.result) {
      return node.item.itemContent.tweet_results.result;
    }
    if (node.content && node.content.tweetResult && node.content.tweetResult.result) {
      return node.content.tweetResult.result;
    }
    if (node.content && node.content.itemContent && node.content.itemContent.tweet_results && node.content.itemContent.tweet_results.result) {
      return node.content.itemContent.tweet_results.result;
    }
    if (node.tweetResult && node.tweetResult.result) {
      return node.tweetResult.result;
    }
    if (node.tweet && node.tweet.core && node.tweet.core.tweet && node.tweet.core.tweet.legacy) {
      return node.tweet.core.tweet;
    }
    return null;
  }
  
  function extractTweetText(result, legacy) {
    if (!legacy) return '';
    if (result.note_tweet && result.note_tweet.note_tweet_results && result.note_tweet.note_tweet_results.result) {
      const note = result.note_tweet.note_tweet_results.result;
      if (note && note.text) {
        return note.text;
      }
      if (note && Array.isArray(note.entity_set?.note_inline_media)) {
        const textPieces = [];
        if (note.entity_set?.richtext?.plain_text) {
          textPieces.push(note.entity_set.richtext.plain_text);
        }
        if (note.entity_set?.media) {
          note.entity_set.media.forEach((mediaItem) => {
            if (mediaItem.alt_text) {
              textPieces.push(`[Image: ${mediaItem.alt_text}]`);
            }
          });
        }
        if (textPieces.length) {
          return textPieces.join('\n');
        }
      }
    }
    
    if (legacy.full_text) {
      return legacy.full_text;
    }
    
    if (legacy.text) {
      return legacy.text;
    }
    
    return '';
  }
  
  function extractTweetMedia(legacy) {
    const media = [];
    const entities = (legacy.extended_entities && legacy.extended_entities.media) ||
                     (legacy.entities && legacy.entities.media) ||
                     [];
    
    entities.forEach((item) => {
      if (!item) return;
      if (item.type === 'photo') {
        media.push({
          kind: 'photo',
          urls: item.media_url_https ? [item.media_url_https] : []
        });
      } else if (item.type === 'animated_gif') {
        const variants = (item.video_info && item.video_info.variants) || [];
        const urls = variants.filter((variant) => variant.url).map((variant) => variant.url);
        media.push({
          kind: 'gif',
          urls
        });
      } else if (item.type === 'video') {
        const variants = (item.video_info && item.video_info.variants) || [];
        const urls = variants.filter((variant) => variant.url).map((variant) => variant.url);
        media.push({
          kind: 'video',
          urls,
          poster: item.media_url_https || null
        });
      }
    });
    
    return media;
  }
  
  async function extractThreadFromDom(articleElement, tweetId) {
    try {
      await expandTwitterThread(articleElement);
    } catch (error) {
      console.warn('[Twitter] Expand thread failed:', error);
    }
    
    const articles = collectThreadArticles(articleElement);
    if (!articles.length) return null;
    
    const nodes = [];
    articles.forEach((article, index) => {
      const node = extractNodeFromArticle(article, index === 0, tweetId);
      if (node) {
        nodes.push(node);
      }
    });
    
    if (!nodes.length) return null;
    
    const deduped = new Map();
    nodes.forEach((node) => {
      const existing = deduped.get(node.id);
      if (!existing || (node.text && node.text.length > (existing.text || '').length)) {
        deduped.set(node.id, node);
      }
    });
    const uniqueNodes = Array.from(deduped.values());
    if (!uniqueNodes.length) return null;
    
    uniqueNodes.sort((a, b) => {
      const aTime = a.timestamp || '';
      const bTime = b.timestamp || '';
      return aTime.localeCompare(bTime);
    });
    
    const limitedNodes = uniqueNodes.slice(0, 12);
    limitedNodes.forEach((node, index) => {
      node.order = index;
    });
    
    const rootNode = limitedNodes.find((node) => node.id === tweetId) || limitedNodes[0];
    return {
      rootId: rootNode.id,
      conversationId: rootNode.conversationId || null,
      nodes: limitedNodes,
      source: 'dom'
    };
  }
  
  async function waitForPrimaryTwitterArticle(timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const article = document.querySelector('article[role="article"]');
      if (article) return article;
      await sleep(150);
    }
    return null;
  }
  
  async function captureThreadForBackground(tweetId) {
    const start = Date.now();
    let lastPayload = null;
    while (Date.now() - start < 12000) {
      const cached = buildThreadFromCache(tweetId);
      if (cached && cached.nodes && cached.nodes.length > 1) {
        cached.source = 'background-intercept';
        return cached;
      }
      const rootArticle = await waitForPrimaryTwitterArticle();
      if (rootArticle) {
        await sleep(400);
        await preloadTwitterConversation(rootArticle, { passes: 6, skipRestore: true });
        await sleep(500);
        const payload = await extractThreadFromDom(rootArticle, tweetId);
        if (payload && Array.isArray(payload.nodes) && payload.nodes.length > 1) {
          payload.source = payload.source === 'dom' ? 'background-dom' : payload.source;
          return payload;
        }
        if (payload) {
          lastPayload = payload;
        }
      } else {
        await sleep(400);
      }
    }
    if (lastPayload && lastPayload.nodes && lastPayload.nodes.length) {
      lastPayload.source = 'background-dom';
    }
    return lastPayload;
  }

  async function expandTwitterThread(articleElement, options = {}) {
    const { skipRestore = false } = options || {};
    const scrollElement = document.scrollingElement || document.documentElement;
    const originalScrollTop = scrollElement.scrollTop;
    const originalBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    
    const expandButtons = [];
    const buttonSelector = 'div[role="button"], button, a[role="link"]';
    const EXPAND_LABEL_REGEX = /(show|view|reveal).*(repl|thread|tweet)/i;
    
    try {
      for (let i = 0; i < 6; i++) {
        const candidates = Array.from(document.querySelectorAll(buttonSelector));
        candidates.forEach((btn) => {
          const text = (btn.textContent || '').trim();
          if (text && EXPAND_LABEL_REGEX.test(text)) {
            expandButtons.push(btn);
          }
        });
        await sleep(160);
      }
      
      expandButtons.forEach((btn) => {
        try {
          btn.click();
        } catch (error) {}
      });
      
      if (articleElement && articleElement.scrollIntoView) {
        articleElement.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      }
      await sleep(260);
    } finally {
      if (!skipRestore) {
        scrollElement.scrollTop = originalScrollTop;
      }
      document.documentElement.style.scrollBehavior = originalBehavior || '';
    }
  }
  
  async function preloadTwitterConversation(articleElement, options = {}) {
    const { passes = 6, skipRestore = false } = options || {};
    const scrollElement = document.scrollingElement || document.documentElement;
    const originalScrollTop = scrollElement.scrollTop;
    const originalBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    
    try {
      for (let i = 0; i < passes; i++) {
        await expandTwitterThread(articleElement, { skipRestore: true });
        scrollElement.scrollBy(0, Math.max(window.innerHeight * 0.9, 600));
        await sleep(420 + (i * 90));
        await expandTwitterThread(articleElement, { skipRestore: true });
        await sleep(220);
      }
      scrollElement.scrollTo(0, document.body.scrollHeight);
      await sleep(600);
      await expandTwitterThread(articleElement, { skipRestore: true });
    } finally {
      if (!skipRestore) {
        scrollElement.scrollTop = originalScrollTop;
      }
      document.documentElement.style.scrollBehavior = originalBehavior || '';
    }
  }
  
  function collectThreadArticles(rootArticle) {
    const articles = new Set();
    if (rootArticle) {
      articles.add(rootArticle);
    }
    
    const timelineSelectors = [
      '[aria-label^="Timeline:"]',
      '[data-testid="primaryColumn"]',
      'main[role="main"]'
    ];
    timelineSelectors.forEach((selector) => {
      const container = document.querySelector(selector);
      if (container) {
        container.querySelectorAll('article[role="article"]').forEach((article) => articles.add(article));
      }
    });
    
    document.querySelectorAll('article[role="article"]').forEach((article) => articles.add(article));
    
    return Array.from(articles);
  }
  
  function extractNodeFromArticle(article, isRoot, fallbackTweetId) {
    const link = article.querySelector('a[href*="/status/"]');
    const match = link && link.getAttribute('href') ? link.getAttribute('href').match(/status\/(\d+)/) : null;
    const id = match ? match[1] : (isRoot && fallbackTweetId ? fallbackTweetId : null);
    if (!id) return null;
    
    const handleEl = article.querySelector('div[dir="ltr"] span');
    const handle = handleEl ? handleEl.textContent : null;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl ? textEl.innerText.trim() : '';
    const timeEl = article.querySelector('time');
    const timestamp = timeEl ? timeEl.getAttribute('datetime') : null;
    
    const media = [];
    const imageEls = Array.from(article.querySelectorAll('img'));
    imageEls.forEach((img) => {
      if (!img || !img.src) return;
      const alt = img.alt || '';
      const dimensions = img.width && img.height ? img.width * img.height : 0;
      if (dimensions > 40000 || alt.toLowerCase().includes('image')) {
        media.push({
          kind: 'photo',
          urls: [img.src]
        });
      }
    });
    
    return {
      id: String(id),
      conversationId: null,
      authorName: null,
      handle: handle || null,
      avatarUrl: null,
      timestamp,
      permalink: link ? link.href : null,
      text,
      media,
      inReplyToId: null,
      order: 0,
      source: 'dom'
    };
  }
  
  function formatTwitterThreadForSummary(threadPayload) {
    if (!threadPayload || !threadPayload.nodes || !threadPayload.nodes.length) {
      return '';
    }
    
    const lines = [];
    threadPayload.nodes.forEach((node, index) => {
      const indexLabel = index === 0 ? 'Original tweet' : `Reply ${index}`;
      const authorLabel = node.handle || node.authorName || 'Unknown user';
      let timestampText = '';
      if (node.timestamp) {
        const date = new Date(node.timestamp);
        if (!Number.isNaN(date.getTime())) {
          timestampText = date.toLocaleString();
        }
      }
      lines.push(`${indexLabel} — ${authorLabel}${timestampText ? ` (${timestampText})` : ''}`);
      if (node.text) {
        lines.push(node.text);
      }
      if (node.media && node.media.length) {
        const mediaSummary = node.media.map((item) => item.kind).join(', ');
        lines.push(`[Media: ${mediaSummary}]`);
      }
      lines.push('');
    });
    
    return lines.join('\n').trim();
  }
  
  function clearTwitterState() {
    currentTwitterArticle = null;
    currentTwitterTweetId = null;
    pendingTwitterThreadId = null;
    pendingTwitterStartedAt = 0;
  }
  
  function getTweetInfoFromArticle(article) {
    if (!article) return null;
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return null;
    const href = link.getAttribute('href') || '';
    const match = href.match(/status\/(\d+)/);
    if (!match) return null;
    const id = match[1];
    const displayUrl = link.href || (`https://x.com${href.startsWith('/') ? href : `/${href}`}`);
    const canonicalUrl = `https://x.com/i/status/${id}`;
    return { id, url: canonicalUrl, displayUrl };
  }
  
  async function processTwitterHover(article, presetInfo = null) {
    const info = presetInfo || getTweetInfoFromArticle(article);
    if (!info) {
      debugLog('[Twitter] No tweet info found for hovered article');
      return;
    }
    
    const { id, url, displayUrl } = info;
    const requestUrl = displayUrl || url;
    const shortUrl = getShortUrl(url);
    
    currentTwitterArticle = article;
    currentTwitterTweetId = id;
    currentlyProcessingUrl = url;
    processingElement = article;
    currentHoveredElement = article;
    pendingTwitterThreadId = id;
    pendingTwitterStartedAt = Date.now();
    
    if (displayMode === 'tooltip' || displayMode === 'both') {
      showTooltip(article, '<div style="text-align:center;padding:16px;opacity:0.75;">Capturing thread…</div>', url);
    }
    
    const isPermalinkView = window.location.pathname.includes('/status/');
    let threadPayload = null;
    
    if (isPermalinkView) {
      threadPayload = buildThreadFromCache(id);
      if (!threadPayload) {
        threadPayload = await extractThreadFromDom(article, id);
      }
    }
    
    if (!isPermalinkView && threadPayload && threadPayload.nodes && threadPayload.nodes.length < 2) {
      threadPayload = null;
    }
    
    if (!threadPayload || !threadPayload.nodes || threadPayload.nodes.length < 2) {
      if (displayMode === 'tooltip' || displayMode === 'both') {
        showTooltip(article, '<div style="text-align:center;padding:16px;opacity:0.75;">Opening conversation…</div>', url);
      }
      
      for (let attempt = 0; attempt < 3 && (!threadPayload || !threadPayload.nodes || threadPayload.nodes.length < 2); attempt++) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'SCRAPE_TWITTER_THREAD',
            url,
            tweetId: id,
            requestUrl
          });
          
          if (response && response.status === 'ok' && response.payload && response.payload.nodes && response.payload.nodes.length) {
            threadPayload = response.payload;
            debugLog(`[Twitter] Background scrape returned ${threadPayload.nodes.length} tweets`);
            break;
          } else if (response && response.error) {
            debugLog(`[Twitter] Background scrape error: ${response.error} (attempt ${attempt + 1})`);
          }
        } catch (error) {
          debugLog('[Twitter] Background scrape failed', error);
        }
        await sleep(400 * (attempt + 1));
      }
    }
    
    if (!threadPayload || !threadPayload.nodes || threadPayload.nodes.length < 2) {
      if (displayMode === 'tooltip' || displayMode === 'both') {
        showTooltip(article, '<div style="padding:10px;background:#fee;border-radius:8px;">Unable to capture replies right now. Try again once the conversation loads.</div>', url);
      }
      currentlyProcessingUrl = null;
      processingElement = null;
      currentHoveredElement = null;
      clearTwitterState();
      return;
    }
    
    debugLog(`[Twitter] Thread captured via ${threadPayload.source || 'unknown'} with ${threadPayload.nodes.length} tweets`);
    const summaryInput = formatTwitterThreadForSummary(threadPayload);
    const leadNode = threadPayload.nodes[0];
    const title = leadNode && (leadNode.handle || leadNode.authorName)
      ? `Thread by ${leadNode.handle || leadNode.authorName}`
      : 'Twitter Thread';
    
    const result = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_CONTENT',
      url,
      title,
      textContent: summaryInput
    });
    
    const isStillCurrent = (currentlyProcessingUrl === url);
    handleSummaryResult(result, article, url, shortUrl, isStillCurrent);
    pendingTwitterThreadId = null;
    pendingTwitterStartedAt = 0;
    if (!currentHoveredElement && (displayMode === 'tooltip' || displayMode === 'both')) {
      scheduleHide(800, url);
    }
  }
  
  // Schedule hiding tooltip with delay
  function scheduleHide(delay = 500, forUrl = null) {
    const shortUrl = forUrl ? getShortUrl(forUrl) : 'none';
    debugLog(`⏲️ SCHEDULE HIDE: for "${shortUrl}" in ${delay}ms (currently showing: "${currentlyDisplayedUrl ? getShortUrl(currentlyDisplayedUrl) : 'none'}")`);
    
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      const currentShortUrl = currentlyDisplayedUrl ? getShortUrl(currentlyDisplayedUrl) : 'none';
      // Only hide if:
      // 1. Mouse is not in tooltip
      // 2. Either no URL specified, or the tooltip is still showing this URL's content
      if (!isMouseInTooltip && (!forUrl || currentlyDisplayedUrl === forUrl)) {
        debugLog(`🔽 EXECUTING HIDE: scheduled for "${shortUrl}", currently showing "${currentShortUrl}" - HIDING NOW`);
        hideTooltip();
      } else {
        debugLog(`🚫 SKIP HIDE: scheduled for "${shortUrl}", currently showing "${currentShortUrl}" (mouse in tooltip: ${isMouseInTooltip}, URL match: ${currentlyDisplayedUrl === forUrl})`);
      }
    }, delay);
  }
  
  // Show tooltip
  function showTooltip(element, content, url, options = {}) {
    if (displayMode === 'panel') return;
    
    const placement = options.placement || 'auto';
    currentTooltipPlacement = placement;
    const shortUrl = url ? getShortUrl(url) : 'unknown';
    debugLog(`📤 SHOW TOOLTIP: "${shortUrl}" (was showing: "${currentlyDisplayedUrl ? getShortUrl(currentlyDisplayedUrl) : 'none'}")`);
    
    clearTimeout(hideTimeout);
    hideTimeout = null;
    
    const tooltipEl = createTooltip();
    tooltipContent.innerHTML = content;
    tooltipEl.style.display = 'block';
    attachTooltipDismissHandlers();
    
    currentlyDisplayedUrl = url;
    
    const anchor = element || processingElement || currentHoveredElement;
    positionTooltip(anchor, placement);
    
    if (url) {
      displayTimes.set(url, Date.now());
    }
    
    requestAnimationFrame(() => {
      tooltipEl.style.opacity = '1';
    });
  }
  
  // Hide tooltip immediately
  function hideTooltip() {
    if (tooltip) {
      const wasShowing = currentlyDisplayedUrl ? getShortUrl(currentlyDisplayedUrl) : 'none';
      debugLog(`📥 HIDE TOOLTIP: was showing "${wasShowing}"`);
      
      tooltip.style.opacity = '0';
      currentlyDisplayedUrl = null; // Clear displayed URL when hiding
      setTimeout(() => {
        if (tooltip && !isMouseInTooltip) {
          tooltip.style.display = 'none';
          debugLog(`🔒 TOOLTIP CLOSED: display set to none`);
        }
      }, 200);
      
      detachTooltipDismissHandlers();
      currentlyProcessingUrl = null;
      processingElement = null;
      currentHoveredElement = null;
      currentTooltipPlacement = 'auto';
    }
  }
  
  // Update tooltip content
  function updateTooltipContent(content, url) {
    if (displayMode === 'panel') return;
    
    const shortUrl = url ? getShortUrl(url) : 'unknown';
    const wasShowing = currentlyDisplayedUrl ? getShortUrl(currentlyDisplayedUrl) : 'none';
    debugLog(`🔄 UPDATE TOOLTIP: "${shortUrl}" (was showing: "${wasShowing}", visible: ${tooltip && tooltip.style.display === 'block'})`);
    
    // Cancel any pending hide when new content arrives (keep tooltip visible during streaming)
    clearTimeout(hideTimeout);
    hideTimeout = null;
    
    if (tooltip) {
      // Show tooltip if it's not visible (streaming content arrived)
      if (tooltip.style.display !== 'block') {
        tooltip.style.display = 'block';
        debugLog(`  └─ 👁️ Making tooltip visible`);
        // Record display time when showing for first time
        if (url) {
          displayTimes.set(url, Date.now());
        }
      }
      
      // Track what URL is currently displayed
      currentlyDisplayedUrl = url;

      tooltipContent.innerHTML = content;
      tooltip.style.opacity = '1';
      
      const elementForPositioning = currentHoveredElement || processingElement;
      if (elementForPositioning) {
        positionTooltip(elementForPositioning, currentTooltipPlacement);
      }
    }
  }
  
  // Find link element
  function findLink(element) {
    let current = element;
    for (let i = 0; i < 10 && current; i++) {
      if (current.tagName === 'A' && current.href) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
  
  // Get link type for debugging
  function getLinkType(link, target) {
    // Check if the immediate target or any child is an image
    const hasImage = link.querySelector('img') !== null;
    const targetIsImage = target.tagName === 'IMG';
    
    if (targetIsImage || hasImage) {
      return '🖼️ IMAGE-LINK';
    }
    return '📝 TEXT-LINK';
  }
  
  // Get short URL for logging
  function getShortUrl(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      // Get last 2 segments of path or domain
      const segments = path.split('/').filter(s => s);
      const lastSegments = segments.slice(-2).join('/');
      return lastSegments || urlObj.hostname;
    } catch {
      return url.substring(0, 50);
    }
  }
  
  function isRedditPostUrl(url) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      
      const matchesRedditHost = REDDIT_HOSTS.some(host => {
        if (hostname === host) return true;
        return hostname.endsWith(`.${host}`);
      });
      
      if (!matchesRedditHost) {
        return false;
      }
      
      if (hostname === 'redd.it' || hostname.endsWith('.redd.it')) {
        const slug = parsed.pathname.replace(/\//g, '').trim();
        return /^[a-z0-9]+$/i.test(slug);
      }
      
      return /\/comments\/[a-z0-9]+/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }
  
  function isInternalTwitterLink(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return TWITTER_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  
  function extractYouTubeVideoId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
      /[?&]v=([^&\n?#]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[2]) return match[2];
      if (match && match[1] && pattern.source.includes('shorts')) return match[1];
      if (!pattern.source.includes('shorts') && match && match[1]) return match[1];
    }
    return null;
  }
  
  function isYouTubeVideoLink(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return false;
      const videoId = extractYouTubeVideoId(url);
      return !!videoId;
    } catch {
      return false;
    }
  }
  
  function findYouTubeCardElement(element) {
    if (!element) return null;
    const selectors = [
      'ytd-rich-grid-video-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-playlist-video-renderer',
      'ytd-playlist-renderer',
      'ytd-rich-item-renderer',
      'ytd-grid-video-renderer'
    ];
    for (const selector of selectors) {
      const card = element.closest(selector);
      if (card) return card;
    }
    return null;
  }
  
  // Handle mouseover
  function handleMouseOver(e) {
    // Skip mouse hover if head tracking is enabled
    if (gazeEnabled) {
      return;
    }

    const link = findLink(e.target);
    if (!link) {
      if (IS_TWITTER) {
        const article = e.target.closest && e.target.closest('article[role="article"]');
        if (article) {
          const info = getTweetInfoFromArticle(article);
          if (!info) return;
          
          ensureTwitterInterceptor();
          
          const isSameTweet = (currentTwitterTweetId === info.id && currentlyProcessingUrl === info.url);
          if (isSameTweet) {
            return;
          }
          
          if (twitterHoverTimeout) {
            clearTimeout(twitterHoverTimeout);
            twitterHoverTimeout = null;
          }
          
          twitterHoverTimeout = setTimeout(() => {
            twitterHoverTimeout = null;
            processTwitterHover(article, info);
          }, HOVER_DELAY);
          return;
        }
      }
      // Not a link, skip (don't log - too noisy on YouTube)
      return;
    }
    
    let url = link.href;
    let tweetInfoForLink = null;
    const linkType = getLinkType(link, e.target);
    
    if (IS_TWITTER) {
      const article = link.closest && link.closest('article[role="article"]');
      if (article) {
        tweetInfoForLink = getTweetInfoFromArticle(article);
        if (tweetInfoForLink) {
          ensureTwitterInterceptor();
          const canonicalUrl = tweetInfoForLink.url;
          const linkUrlObj = (() => {
            try {
              return new URL(link.getAttribute('href') || '', window.location.origin);
            } catch (error) {
              return null;
            }
          })();
          const isAuxiliaryMediaLink = linkUrlObj ? /\/status\/[^/]+\/(photo|video|media|audio)/i.test(linkUrlObj.pathname) : false;
          if (isAuxiliaryMediaLink && (pendingTwitterThreadId === tweetInfoForLink.id || currentTwitterTweetId === tweetInfoForLink.id || currentlyProcessingUrl === canonicalUrl)) {
            return;
          }
          link.__hoverTweetInfo = tweetInfoForLink;
          link.__hoverArticle = article;
          link.__hoverCanonicalUrl = canonicalUrl;
          url = canonicalUrl;
        } else {
          delete link.__hoverTweetInfo;
          delete link.__hoverArticle;
          delete link.__hoverCanonicalUrl;
        }
      }
    }
    
    if (IS_TWITTER) {
      try {
        const parsedUrl = new URL(url, window.location.origin);
        if (isInternalTwitterLink(parsedUrl.href) && !/\/status\//.test(parsedUrl.pathname)) {
          return;
        }
      } catch (error) {
        // Ignore parsing issues and proceed
      }
    }
    if (IS_YOUTUBE) {
      try {
        const parsedUrl = new URL(url, window.location.origin);
        if (YOUTUBE_HOSTS.has(parsedUrl.hostname.toLowerCase()) && !isYouTubeVideoLink(url)) {
          return;
        }
      } catch (error) {
        return;
      }
    }
    const shortUrl = getShortUrl(url);

    // Check if this is a YouTube thumbnail first
    if (IS_YOUTUBE && isYouTubeThumbnail(e.target)) {
      console.log(`🎬 YOUTUBE THUMBNAIL: "${shortUrl}" (will trigger in ${HOVER_DELAY}ms)`);
      try {
        const parsedHost = new URL(url, window.location.origin).hostname.toLowerCase();
        if (!YOUTUBE_HOSTS.has(parsedHost)) {
          console.log(`[YouTube] Skipping non-YouTube thumbnail host: ${parsedHost}`);
          return;
        }
      } catch (error) {
        console.warn('[YouTube] Invalid thumbnail URL, skipping');
        return;
      }
      const videoId = extractYouTubeVideoId(url);
      const canonicalUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
      const hasPending = hoverTimeouts.has(canonicalUrl);
      const isProcessing = currentlyProcessingUrl === canonicalUrl;
      if (hasPending || isProcessing) {
        console.debug('[YouTube] ⏭️  Already processing/displaying this video, ignoring re-hover', {
          hasPending,
          isProcessing,
          url: canonicalUrl
        });
        return;
      }

      let thumbnailElement = e.target.closest('ytd-thumbnail');
      if (!thumbnailElement) {
        thumbnailElement = e.target.closest('ytd-video-preview') || 
                          e.target.closest('ytd-playlist-thumbnail');
      }

      if (!thumbnailElement) {
        console.warn('[YouTube] Could not find thumbnail element, skipping');
        return;
      }

      const cardElement = findYouTubeCardElement(thumbnailElement) || thumbnailElement || link;
      link.__hoverAnchor = cardElement;
      thumbnailElement.__hoverAnchor = cardElement;
      link.__hoverCanonicalUrl = canonicalUrl;
      const isSwitch = currentlyProcessingUrl && currentlyProcessingUrl !== canonicalUrl;
      if (isSwitch) {
        console.debug(`[YouTube] 🔴 SWITCHING FROM ${currentlyProcessingUrl} TO ${canonicalUrl}`);
        const oldVideoId = extractYouTubeVideoId(currentlyProcessingUrl);
        chrome.runtime.sendMessage({
          action: 'ABORT_YOUTUBE_SUMMARY',
          videoId: oldVideoId,
          newVideoId: videoId
        }, response => {
          console.debug('[YouTube] Abort response:', response);
        });
      }
      
      const requestToken = ++currentYouTubeRequestToken;
      link.__hoverRequestToken = requestToken;
      
      // Clear this URL's previous timeout if any
      const oldTimeout = hoverTimeouts.get(canonicalUrl);
      if (oldTimeout) {
        clearTimeout(oldTimeout.timeoutId);
        hoverTimeouts.delete(canonicalUrl);
      }
      
      // 4. Clear hide timeout
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }

      currentHoveredElement = link;
      
      // Schedule hover (DON'T set currentlyProcessingUrl yet - that happens when timeout fires!)
      const hoverTimeout = setTimeout(() => {
        console.log('[YouTube] Hover timeout firing for thumbnail', canonicalUrl, {
          requestToken,
          currentToken: currentYouTubeRequestToken,
          pendingUrl: currentlyProcessingUrl
        });
        hoverTimeouts.delete(canonicalUrl); // Clean up
        handleYouTubeVideoHover(cardElement, link, canonicalUrl, requestToken);
      }, HOVER_DELAY);

      // Store timeout for this URL
      hoverTimeouts.set(canonicalUrl, { timeoutId: hoverTimeout, requestToken });
      console.log('[YouTube] Hover timeout scheduled for thumbnail', {
        url: canonicalUrl,
        requestToken
      });
      return; // Don't process as regular link
    }
    
    if (IS_YOUTUBE && isYouTubeVideoLink(url)) {
      try {
        const parsedHost = new URL(url, window.location.origin).hostname.toLowerCase();
        if (!YOUTUBE_HOSTS.has(parsedHost)) {
          return;
        }
      } catch (error) {
        return;
      }
      const videoId = extractYouTubeVideoId(url);
      if (!videoId) return;
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      link.__hoverCanonicalUrl = canonicalUrl;
      const cardElement = findYouTubeCardElement(link) || link;
      link.__hoverAnchor = cardElement;
      const hasPending = hoverTimeouts.has(canonicalUrl);
      const isProcessing = currentlyProcessingUrl === canonicalUrl;
      if (hasPending || isProcessing) {
        console.debug('[YouTube] ⏭️  Already processing/displaying this video link, ignoring re-hover', {
          hasPending,
          isProcessing,
          url: canonicalUrl
        });
        return;
      }
      const isSwitch = currentlyProcessingUrl && currentlyProcessingUrl !== canonicalUrl;
      if (isSwitch) {
        console.debug(`[YouTube] 🔴 SWITCHING FROM ${currentlyProcessingUrl} TO ${canonicalUrl}`);
        const oldVideoId = extractYouTubeVideoId(currentlyProcessingUrl);
        chrome.runtime.sendMessage({
          action: 'ABORT_YOUTUBE_SUMMARY',
          videoId: oldVideoId,
          newVideoId: videoId
        }, response => {
          console.debug('[YouTube] Abort response:', response);
        });
      }
      const requestToken = ++currentYouTubeRequestToken;
      link.__hoverRequestToken = requestToken;
      const oldTimeout = hoverTimeouts.get(canonicalUrl);
      if (oldTimeout) {
        clearTimeout(oldTimeout.timeoutId);
        hoverTimeouts.delete(canonicalUrl);
      }
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      currentHoveredElement = link;
      const hoverTimeout = setTimeout(() => {
        console.log('[YouTube] Hover timeout firing for link', canonicalUrl, {
          requestToken,
          currentToken: currentYouTubeRequestToken,
          pendingUrl: currentlyProcessingUrl
        });
        hoverTimeouts.delete(canonicalUrl);
        handleYouTubeVideoHover(cardElement, link, canonicalUrl, requestToken);
      }, HOVER_DELAY);
      hoverTimeouts.set(canonicalUrl, { timeoutId: hoverTimeout, requestToken });
      console.log('[YouTube] Hover timeout scheduled for link', {
        url: canonicalUrl,
        requestToken
      });
      return;
    }
    
    // Don't re-trigger if we're already processing this exact URL
    if (currentlyProcessingUrl === url) {
      debugLog(`🚫 BLOCKED: ${linkType} "${shortUrl}" (already processing)`);
      return;
    }
    
    // Cancel any pending hide when hovering a new link (critical for preventing blinks!)
    if (hideTimeout) {
      debugLog(`🚫 CANCEL HIDE: starting hover on "${shortUrl}"`);
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    
    debugLog(`✅ HOVER: ${linkType} "${shortUrl}" (will trigger in ${HOVER_DELAY}ms)`);
    
    currentHoveredElement = link;
    
    clearTimeout(currentHoverTimeout);
    currentHoverTimeout = setTimeout(() => {
      processLinkHover(link);
    }, HOVER_DELAY);
  }
  
  // Handle mouseout
  function handleMouseOut(e) {
    const link = findLink(e.target);
    if (!link) {
      if (IS_TWITTER) {
        const article = e.target.closest && e.target.closest('article[role="article"]');
        if (article) {
          const relatedArticle = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('article[role="article"]');
          if (relatedArticle === article) {
            return;
          }
          
          const info = getTweetInfoFromArticle(article);
          if (info && pendingTwitterThreadId === info.id) {
            debugLog(`[Twitter] Mouseout while background pending for ${info.id}, keeping tooltip visible`);
            return;
          }
          
          if (twitterHoverTimeout) {
            clearTimeout(twitterHoverTimeout);
            twitterHoverTimeout = null;
          }
          
          if (currentlyProcessingUrl && (!info || info.id !== pendingTwitterThreadId)) {
            scheduleHide(400, currentlyProcessingUrl);
          }
          
          if (!info || info.id !== pendingTwitterThreadId) {
            currentTwitterArticle = null;
            currentTwitterTweetId = null;
          }
          currentHoveredElement = null;
          delete link.__hoverAnchor;
          delete link.__hoverRequestToken;
        }
      }
      return;
    }
    
    const url = link.__hoverCanonicalUrl || link.href;
    const anchorElement = link.__hoverAnchor;
    const tweetInfoMouseOut = link.__hoverTweetInfo || (IS_TWITTER ? getTweetInfoFromArticle(link.closest && link.closest('article[role="article"]')) : null);
    const shortUrl = getShortUrl(url);

    // Handle YouTube thumbnail mouseout
    if (IS_YOUTUBE && isYouTubeThumbnail(e.target)) {
      const relatedTarget = e.relatedTarget;
      const thumbnailElement = e.target.closest('ytd-thumbnail') || 
                              e.target.closest('ytd-video-preview') || 
                              e.target.closest('ytd-playlist-thumbnail');
      
      if (relatedTarget && thumbnailElement && thumbnailElement.contains(relatedTarget)) {
        console.log('[YouTube] Mouseout within same thumbnail, keeping hover alive', { url });
        return;
      }
      
      const pendingTimeout = hoverTimeouts.get(url);
      if (pendingTimeout) {
        console.log('[YouTube] Mouseout clearing pending hover', { url, requestToken: pendingTimeout.requestToken });
        clearTimeout(pendingTimeout.timeoutId);
        hoverTimeouts.delete(url);
      }
      
      // Allow general logic below to decide whether to hide tooltip; skip additional handling
    }
    
    // Check if we're actually leaving the link (not just moving to a child element or tooltip)
    const relatedTarget = e.relatedTarget;
    if (relatedTarget) {
      if (anchorElement && anchorElement.contains(relatedTarget)) {
        return;
      }
      // Don't hide if moving to a child element
      if (link.contains(relatedTarget) || link === relatedTarget) {
        debugLog(`⏭️ MOUSEOUT: "${shortUrl}" (child element, ignored)`);
        return;
      }
      // Don't hide if moving into the tooltip
      if (tooltip && (tooltip.contains(relatedTarget) || tooltip === relatedTarget)) {
        debugLog(`⏭️ MOUSEOUT: "${shortUrl}" (into tooltip, ignored)`);
        return;
      }
    }
    
    if (IS_TWITTER && tweetInfoMouseOut && pendingTwitterThreadId === tweetInfoMouseOut.id) {
      debugLog(`[Twitter] Mouseout ignored for pending thread ${tweetInfoMouseOut.id}`);
      return;
    }
    delete link.__hoverAnchor;
    delete link.__hoverRequestToken;
    
    // Don't schedule hide if we're actively processing/streaming this URL
    if (currentlyProcessingUrl === url) {
      debugLog(`👋 MOUSEOUT: "${shortUrl}" (streaming active, tooltip will stay visible)`);
      // Don't schedule hide - streaming updates will keep it visible
      // It will only hide when streaming completes or user switches to different URL
    } else {
      // Check if THIS URL's content was just displayed (protection window)
      const urlDisplayTime = displayTimes.get(url) || 0;
      const timeSinceDisplay = urlDisplayTime > 0 ? Date.now() - urlDisplayTime : Infinity;
      const MIN_DISPLAY_TIME = 500; // Minimum time to show content before allowing hide
      
      debugLog(`[DEBUG] URL: "${shortUrl}", displayTime: ${urlDisplayTime}, timeSinceDisplay: ${timeSinceDisplay}ms`);
      
      if (timeSinceDisplay < MIN_DISPLAY_TIME && urlDisplayTime > 0) {
        // Content was just displayed, use longer delay to give user time to see it
        const remainingTime = MIN_DISPLAY_TIME - timeSinceDisplay;
        debugLog(`👋 MOUSEOUT: "${shortUrl}" (content just shown, waiting ${Math.round(remainingTime)}ms before scheduling hide)`);
        
        // Schedule hide after the protection window expires
        setTimeout(() => {
          if (!isMouseInTooltip && !currentHoveredElement) {
            debugLog(`⏰ Protection window expired for "${shortUrl}", now scheduling hide`);
            scheduleHide(500, url); // 500ms > 300ms hover delay to prevent race condition
          }
        }, remainingTime);
      } else {
        debugLog(`👋 MOUSEOUT: "${shortUrl}" (scheduling hide in 500ms, reason: ${urlDisplayTime === 0 ? 'never displayed' : `too long ago (${timeSinceDisplay}ms)`})`);
        scheduleHide(500, url); // 500ms > 300ms hover delay to prevent race condition
      }
    }
    
    // Cancel pending hover
    clearTimeout(currentHoverTimeout);
    currentHoverTimeout = null;
    
    currentHoveredElement = null;
  }
  
  // Process link hover
  async function processLinkHover(link) {
    const url = link.__hoverCanonicalUrl || link.href;
    const shortUrl = getShortUrl(url);
    const isReddit = isRedditPostUrl(url);
    const tweetInfo = link.__hoverTweetInfo || null;
    const tweetArticle = link.__hoverArticle || (link.closest && link.closest('article[role="article"]'));
    
    if (IS_TWITTER && tweetInfo && tweetArticle) {
      await processTwitterHover(tweetArticle, tweetInfo);
      return;
    }
    
    if (IS_TWITTER) {
      try {
        const parsed = new URL(url, window.location.origin);
        if (isInternalTwitterLink(parsed.href) && !/\/status\//.test(parsed.pathname)) {
          currentlyProcessingUrl = null;
          processingElement = null;
          return;
        }
      } catch (error) {
        currentlyProcessingUrl = null;
        processingElement = null;
        return;
      }
    }
    
    // Clear previous processing URL when starting a new one
    if (currentlyProcessingUrl && currentlyProcessingUrl !== url) {
      debugLog(`🔄 SWITCHING: from "${getShortUrl(currentlyProcessingUrl)}" to "${shortUrl}"`);
    }
    
    // Mark this URL as currently being processed
    currentlyProcessingUrl = url;
    processingElement = link; // Track element for positioning during streaming
    
    debugLog(`🔄 PROCESSING: "${shortUrl}"${isReddit ? ' [Reddit]' : ''}`);
    
    // Show loading state in tooltip
    if (displayMode === 'tooltip' || displayMode === 'both') {
      const loadingMessage = isReddit
        ? '<div style="text-align:center;padding:20px;opacity:0.6;">Gathering Reddit discussion...</div>'
        : '<div style="text-align:center;padding:20px;opacity:0.6;">Extracting content...</div>';
      showTooltip(link, loadingMessage, url);
    }
    
    if (isReddit) {
      await processRedditPost(link, url, shortUrl);
      return;
    }
    
    // Fetch HTML
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_CONTENT',
      url: url
    });
    
    if (response.error) {
      console.error('[Content] Fetch error:', response.error);
      if (displayMode === 'tooltip' || displayMode === 'both') {
        showTooltip(link, `<div style="padding:10px;background:#fee;border-radius:8px;">Error: ${response.error}</div>`, url);
      }
      currentlyProcessingUrl = null;
      processingElement = null;
      return;
    }
    
    // Extract content with Readability
    const parser = new DOMParser();
    const doc = parser.parseFromString(response.html, 'text/html');
    const documentClone = doc.cloneNode(true);
    
    // Readability is already loaded via manifest
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    let title, textContent;
    
    if (article && article.textContent && article.textContent.trim().length > 100) {
      title = article.title || 'Untitled';
      textContent = article.textContent;
    } else {
      const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || 
                       doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                       'No content could be extracted from this page.';
      
      title = doc.title || 'Untitled';
      textContent = metaDesc;
    }
    
    // Show generating state
    if (displayMode === 'tooltip' || displayMode === 'both') {
      showTooltip(link, `<div style="opacity:0.6;font-style:italic;">Generating summary...</div>`, url);
    }
    
    // Request summarization from background
    const result = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_CONTENT',
      url: url,
      title: title,
      textContent: textContent
    });
    
    // Check if this result is still for the current URL we care about
    const isStillCurrent = (currentlyProcessingUrl === url);
    handleSummaryResult(result, link, url, shortUrl, isStillCurrent);
  }
  
  async function processRedditPost(link, url, shortUrl) {
    debugLog(`🧵 REDDIT REQUEST: "${shortUrl}"`);
    
    if (displayMode === 'tooltip' || displayMode === 'both') {
      showTooltip(link, '<div style="opacity:0.6;font-style:italic;">Summarizing Reddit discussion...</div>', url);
    }
    
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SUMMARIZE_REDDIT_POST',
        url: url
      });
      
      const isStillCurrent = (currentlyProcessingUrl === url);
      handleSummaryResult(result, link, url, shortUrl, isStillCurrent);
    } catch (error) {
      console.error(`[Reddit] Summary failed for "${shortUrl}":`, error);
      if (displayMode === 'tooltip' || displayMode === 'both') {
        const message = (error && error.message) ? error.message : 'Unable to summarize Reddit thread';
        showTooltip(link, `<div style="padding:10px;background:#fee;border-radius:8px;">Error: ${message}</div>`, url);
      }
      if (currentlyProcessingUrl === url) {
        currentlyProcessingUrl = null;
        processingElement = null;
      }
    }
  }
  
  function handleSummaryResult(result, link, url, shortUrl, isStillCurrent) {
    if (!isStillCurrent && IS_TWITTER && pendingTwitterThreadId) {
      pendingTwitterThreadId = null;
      pendingTwitterStartedAt = 0;
    }
  if (!result || !result.status) {
      debugLog(`❌ INVALID RESULT: "${shortUrl}"`);
      if (displayMode === 'tooltip' || displayMode === 'both') {
        showTooltip(link, '<div style="padding:10px;background:#fee;border-radius:8px;">Error: No summary result returned.</div>', url);
      }
      if (isStillCurrent) {
        currentlyProcessingUrl = null;
        processingElement = null;
        clearTwitterState();
      }
      return;
    }
    
    if (result.status === 'duplicate') {
      debugLog(`❌ DUPLICATE: "${shortUrl}" (ignoring)`);
      if (isStillCurrent) {
        currentlyProcessingUrl = null;
        processingElement = null;
        clearTwitterState();
      }
      return;
    }
    
    if (result.status === 'aborted') {
      debugLog(`❌ ABORTED: "${shortUrl}" (was canceled, ${isStillCurrent ? 'clearing' : 'already moved on'})`);
      return;
    }
    
    if (result.status === 'error') {
      const errorMessage = result.error || result.message || 'Unknown error';
      console.error(`❌ ERROR: "${shortUrl}" - ${errorMessage}`);
      if (displayMode === 'tooltip' || (displayMode === 'both' && isStillCurrent)) {
        showTooltip(link, `<div style="padding:10px;background:#fee;border-radius:8px;">Error: ${errorMessage}</div>`, url);
      }
      if (isStillCurrent) {
        currentlyProcessingUrl = null;
        processingElement = null;
        clearTwitterState();
      }
      return;
    }
    
    if (result.status === 'complete' && result.cached) {
      debugLog(`💾 CACHED: "${shortUrl}" (instant display, still current: ${isStillCurrent})`);
      
      if (isStillCurrent) {
        const formattedSummary = formatAISummary(result.summary);
        
        if (displayMode === 'tooltip' || displayMode === 'both') {
          showTooltip(link, formattedSummary, url);
        }
        
        if (displayMode === 'panel' || displayMode === 'both') {
          chrome.runtime.sendMessage({
            type: 'DISPLAY_CACHED_SUMMARY',
            title: result.title,
            summary: formattedSummary
          }).catch(() => {});
        }
        
        currentlyProcessingUrl = null;
        processingElement = null;
        clearTwitterState();
        debugLog(`✅ COMPLETE: "${shortUrl}" (ready for next hover)`);
      } else {
        debugLog(`⚠️ STALE CACHED: "${shortUrl}" (user moved on, ignoring)`);
      }
      return;
    }
    
    if (isStillCurrent) {
      debugLog(`📡 STREAMING: "${shortUrl}" (will receive updates)`);
    } else {
      debugLog(`⚠️ STALE STREAMING: "${shortUrl}" (user moved on, ignoring)`);
    }
    // Streaming updates are handled via STREAMING_UPDATE messages.
  }
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURE_TWITTER_THREAD') {
      if (!IS_TWITTER) {
        sendResponse({ status: 'error', error: 'NOT_TWITTER_CONTEXT' });
        return false;
      }
      (async () => {
        try {
          const payload = await captureThreadForBackground(message.tweetId);
          if (payload && payload.nodes && payload.nodes.length) {
            sendResponse({ status: 'ok', payload });
          } else {
            sendResponse({ status: 'error', error: 'NO_THREAD_DATA' });
          }
        } catch (error) {
          sendResponse({ status: 'error', error: error ? error.message : 'CAPTURE_FAILED' });
        }
      })();
      return true;
    }
    
    if (message.type === 'STREAMING_UPDATE') {
      // Only accept updates for the EXACT URL we're currently processing
      const isValid = message.url === currentlyProcessingUrl;
      if (!isValid) {
        if (IS_YOUTUBE) {
          console.debug(`[YouTube] REJECTED stale update for: ${message.url}`);
          console.debug(`  Currently processing: ${currentlyProcessingUrl}`);
        }
        return;
      }
      updateTooltipContent(message.content, message.url);
    }
    
    if (message.type === 'PROCESSING_STATUS') {
      if (message.status === 'started' && currentHoveredElement) {
        if (displayMode === 'tooltip' || displayMode === 'both') {
          showTooltip(currentHoveredElement, `<div style="opacity:0.6;font-style:italic;">Generating summary...</div>`, message.url);
        }
      }
    }
    
    if (message.type === 'DISPLAY_MODE_CHANGED') {
      displayMode = message.displayMode;
      debugLog('[Content] Display mode updated:', displayMode);
      if (displayMode === 'panel') {
        hideTooltip();
      }
    }

    if (message.type === 'GAZE_ENABLED_CHANGED') {
      gazeEnabled = message.gazeEnabled;
      debugLog('[Content] Gaze enabled updated:', gazeEnabled);
    }

    if (message.type === 'TRIGGER_CALIBRATION') {
      debugLog('[Content] Triggering head calibration');
      // Trigger Alt+H keyboard event to start calibration
      const event = new KeyboardEvent('keydown', {
        key: 'h',
        code: 'KeyH',
        altKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);
    }

    if (message.type === 'TRIGGER_MOUTH_CALIBRATION') {
      debugLog('[Content] Triggering mouth calibration');
      // Trigger Alt+M keyboard event to start mouth calibration
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        code: 'KeyM',
        altKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);
    }

    if (message.type === 'PING') {
      // Respond to ping to confirm content script is loaded
      sendResponse({ status: 'ok' });
      return true;
    }

    // Voice Interaction Messages
    if (message.type === 'VOICE_STATE_CHANGED') {
      const state = message.state;
      if (state === 'armed') {
        showVoiceHud('<span style="font-size:16px;">🎙️</span> <span>Listening for command... (5s)</span>', 'armed');
      } else if (state === 'dictating') {
        showVoiceHud('<span style="font-size:16px;">✍️</span> <span>Dictating... (Say "stop dictation" to exit)</span>', 'dictating');
      } else if (state === 'processing-command') {
        showVoiceHud('<span style="font-size:16px;">⚙️</span> <span>Executing command...</span>', 'normal');
      } else if (state === 'idle') {
        if (message.previousState === 'armed' || message.previousState === 'processing-command' || message.lastCommandResult) {
          const msg = message.lastCommandResult?.message || message.message || 'Ready';
          showVoiceHud(`<span style="font-size:16px;">✓</span> <span>${msg}</span>`, 'success', 2500);
        } else if (message.previousState === 'dictating') {
          showVoiceHud('<span>Dictation stopped</span>', 'normal', 2000);
        } else {
          hideVoiceHud();
        }
      } else if (state === 'disabled') {
        hideVoiceHud();
      } else if (state === 'error') {
        showVoiceHud(`<span style="font-size:16px;">⚠️</span> <span>${message.message || 'Voice error'}</span>`, 'warning', 3500);
      }
    }

    if (message.type === 'GAZE_SELECTION_START') {
      const res = handleGazeSelectionStart(message.action || 'copy');
      sendResponse(res);
      return true;
    }

    if (message.type === 'GAZE_SELECTION_END') {
      const res = handleGazeSelectionEnd(message.action || 'copy');
      sendResponse(res);
      return true;
    }

    if (message.type === 'GAZE_SELECTION_CONFIRM_CUT') {
      const res = handleGazeSelectionConfirmCut();
      sendResponse(res);
      return true;
    }

    if (message.type === 'GAZE_SELECTION_CANCEL') {
      const res = handleGazeSelectionCancel();
      sendResponse(res);
      return true;
    }

    if (message.type === 'VOICE_INSERT_TEXT') {
      const result = insertTextIntoActiveElement(message.text);
      sendResponse(result);
      return true;
    }

    if (message.type === 'VOICE_EXECUTE_DOM_ACTION') {
      if (message.action === 'back') {
        window.history.back();
        showVoiceHud('<span>Navigated back</span>', 'success', 1500);
        sendResponse({ success: true });
        return true;
      }
      if (message.action === 'forward') {
        window.history.forward();
        showVoiceHud('<span>Navigated forward</span>', 'success', 1500);
        sendResponse({ success: true });
        return true;
      }
      if (message.action === 'copy') {
        const info = getSelectedTextInfo();
        if (info && info.text) {
          navigator.clipboard.writeText(info.text).catch(() => {
            try { document.execCommand('copy'); } catch (e) {}
          });
          showVoiceHud('✓ Copied selected text', 'success', 2000);
          sendResponse({ success: true, text: info.text });
        } else {
          showVoiceHud('⚠️ Select text first', 'normal', 2500);
          sendResponse({ success: false, error: 'Select text first.' });
        }
        return true;
      }
      if (message.action === 'cut_check') {
        const info = getSelectedTextInfo();
        if (!info || !info.text) {
          showVoiceHud('⚠️ Select text first', 'normal', 2500);
          sendResponse({ success: false, error: 'Select text first.' });
          return true;
        }
        if (!info.isField && !info.isEditable && (!info.element || !isEditableTarget(info.element))) {
          showVoiceHud('⚠️ Focus a text field first', 'normal', 2500);
          sendResponse({ success: false, error: 'Focus a text field first.' });
          return true;
        }
        showVoiceHud('✂️ Cut selected text? Say "confirm cut" or "cancel"', 'armed', 5000);
        sendResponse({ success: true });
        return true;
      }
      if (message.action === 'cut_execute') {
        const info = getSelectedTextInfo();
        if (!info || !info.text) {
          sendResponse({ success: false, error: 'Select text first.' });
          return true;
        }
        const text = info.text;
        navigator.clipboard.writeText(text).catch(() => {});
        if (info.isField && info.element) {
          const el = info.element;
          try {
            document.execCommand('cut');
          } catch (e) {}
          if (el.selectionStart !== el.selectionEnd) {
            el.value = el.value.slice(0, info.start) + el.value.slice(info.end);
            el.selectionStart = el.selectionEnd = info.start;
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          }
        } else {
          try {
            document.execCommand('cut');
          } catch (e) {}
        }
        showVoiceHud('✓ Cut selected text', 'success', 2000);
        sendResponse({ success: true, text });
        return true;
      }
      if (message.action === 'paste') {
        const el = getActiveEditableElement();
        if (!el) {
          showVoiceHud('⚠️ Focus a text field first', 'normal', 2500);
          sendResponse({ success: false, error: 'Focus a text field first.' });
          return true;
        }

        const readPromise = navigator.clipboard && navigator.clipboard.readText
          ? navigator.clipboard.readText().catch(() => null)
          : Promise.resolve(null);

        readPromise.then(clipText => {
          const textToInsert = clipText || message.fallbackText;
          if (textToInsert) {
            const res = insertTextIntoActiveElement(textToInsert);
            if (res.focused) {
              showVoiceHud('✓ Pasted text', 'success', 2000);
              sendResponse({ success: true });
            } else {
              showVoiceHud('⚠️ Focus a text field first', 'normal', 2500);
              sendResponse({ success: false, error: 'Focus a text field first.' });
            }
          } else {
            showVoiceHud('⚠️ Clipboard is empty', 'normal', 2000);
            sendResponse({ success: false, error: 'Clipboard is empty.' });
          }
        });
        return true;
      }
      if (message.action === 'select_all') {
        const el = getActiveEditableElement();
        if (el && (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input')) {
          el.focus();
          el.select();
        } else if (el && el.isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          document.execCommand('selectAll', false, null);
        }
        showVoiceHud('✓ Selected all text', 'success', 2000);
        sendResponse({ success: true });
        return true;
      }
      if (message.action === 'undo') {
        document.execCommand('undo');
        showVoiceHud('↩️ Undo', 'normal', 1500);
        sendResponse({ success: true });
        return true;
      }
      if (message.action === 'redo') {
        document.execCommand('redo');
        showVoiceHud('↪️ Redo', 'normal', 1500);
        sendResponse({ success: true });
        return true;
      }
    }
  });

  // Listen for gaze:status events and relay to sidepanel
  window.addEventListener('gaze:status', (event) => {
    if (event.detail) {
      chrome.runtime.sendMessage({
        type: 'GAZE_STATUS',
        phase: event.detail.phase,
        note: event.detail.note
      }).catch(() => {
        // Ignore errors if sidepanel not open
      });
    }
  });

  // ========================================
  // VOICE TYPING & HUD SUBSYSTEM
  // ========================================

  let lastFocusedEditableElement = null;
  let voiceHudElement = null;
  let voiceHudTimeout = null;

  function isEditableTarget(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
    }
    return false;
  }

  // Track editable element focus across page
  document.addEventListener('focusin', (e) => {
    if (isEditableTarget(e.target)) {
      lastFocusedEditableElement = e.target;
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (isEditableTarget(e.target)) {
      lastFocusedEditableElement = e.target;
    }
  }, true);

  function getActiveEditableElement() {
    if (document.activeElement && isEditableTarget(document.activeElement)) {
      return document.activeElement;
    }
    if (lastFocusedEditableElement && document.contains(lastFocusedEditableElement)) {
      return lastFocusedEditableElement;
    }
    return null;
  }

  function getSelectedTextInfo() {
    const el = getActiveEditableElement();
    if (el && el.tagName && (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input')) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && start !== end) {
        return {
          text: el.value.slice(Math.min(start, end), Math.max(start, end)),
          element: el,
          isField: true,
          start: Math.min(start, end),
          end: Math.max(start, end)
        };
      }
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.toString();
      if (text) {
        const isEditable = el && isEditableTarget(el) ? true : (sel.anchorNode && sel.anchorNode.parentElement && isEditableTarget(sel.anchorNode.parentElement));
        return {
          text,
          element: el || (sel.anchorNode ? sel.anchorNode.parentElement : null),
          isField: false,
          isEditable,
          range: sel.getRangeAt(0)
        };
      }
    }

    return { text: '', element: el, isField: false, isEditable: false };
  }

  function getOrCreateVoiceHud() {
    if (voiceHudElement && document.contains(voiceHudElement)) {
      return voiceHudElement;
    }

    voiceHudElement = document.createElement('div');
    voiceHudElement.id = 'sanchalan-voice-hud';
    voiceHudElement.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483645;
      display: none;
      align-items: center;
      gap: 10px;
      padding: 10px 18px;
      background: rgba(28, 28, 30, 0.94);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 30px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.28);
      pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s ease;
      opacity: 0;
      transform: translateY(12px);
    `;

    document.documentElement.appendChild(voiceHudElement);
    return voiceHudElement;
  }

  function showVoiceHud(htmlContent, type = 'normal', autoDismissMs = 0) {
    const hud = getOrCreateVoiceHud();
    clearTimeout(voiceHudTimeout);

    hud.innerHTML = htmlContent;
    hud.style.display = 'flex';

    if (type === 'armed') {
      hud.style.borderColor = 'rgba(230, 162, 60, 0.7)';
      hud.style.boxShadow = '0 0 18px rgba(230, 162, 60, 0.4)';
    } else if (type === 'dictating') {
      hud.style.borderColor = 'rgba(103, 194, 58, 0.7)';
      hud.style.boxShadow = '0 0 18px rgba(103, 194, 58, 0.4)';
    } else if (type === 'success') {
      hud.style.borderColor = 'rgba(103, 194, 58, 0.5)';
      hud.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.25)';
    } else {
      hud.style.borderColor = 'rgba(255, 255, 255, 0.16)';
      hud.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.28)';
    }

    requestAnimationFrame(() => {
      hud.style.opacity = '1';
      hud.style.transform = 'translateY(0)';
    });

    if (autoDismissMs > 0) {
      voiceHudTimeout = setTimeout(() => {
        hideVoiceHud();
      }, autoDismissMs);
    }
  }

  function hideVoiceHud() {
    if (!voiceHudElement) return;
    voiceHudElement.style.opacity = '0';
    voiceHudElement.style.transform = 'translateY(12px)';
    clearTimeout(voiceHudTimeout);
    voiceHudTimeout = setTimeout(() => {
      if (voiceHudElement) {
        voiceHudElement.style.display = 'none';
      }
    }, 240);
  }

  function insertTextIntoActiveElement(text) {
    const el = getActiveEditableElement();
    if (!el) {
      showVoiceHud('ℹ️ No editable field focused. Transcript saved to side panel.', 'normal', 3000);
      return { success: false, focused: false };
    }

    el.focus();

    if (el.tagName && (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input')) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const textToInsert = (start > 0 && !/\s$/.test(el.value.slice(0, start)) && !/^[.,!?:;\n]/.test(text)) ? ' ' + text : text;

      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, textToInsert);
      } catch (e) {
        inserted = false;
      }

      if (!inserted) {
        const val = el.value;
        el.value = val.slice(0, start) + textToInsert + val.slice(end);
        el.selectionStart = el.selectionEnd = start + textToInsert.length;
      }

      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return { success: true, focused: true };
    }

    if (el.isContentEditable) {
      const textToInsert = text;
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, textToInsert);
      } catch (e) {
        inserted = false;
      }

      if (!inserted) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(textToInsert);
          range.insertNode(node);
          range.setStartAfter(node);
          range.setEndAfter(node);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          el.appendChild(document.createTextNode(textToInsert));
        }
      }

      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      return { success: true, focused: true };
    }

    return { success: false, focused: false };
  }

  // Listen for voice gesture trigger from gaze subsystem
  window.addEventListener('voice:gesture-arm', () => {
    chrome.runtime.sendMessage({ type: 'VOICE_GESTURE_TRIGGER' }).catch(() => {});
  });

  // Listen for gesture-based copy
  window.addEventListener('voice:copy-gesture', () => {
    const info = getSelectedTextInfo();
    if (info && info.text) {
      navigator.clipboard.writeText(info.text).catch(() => {
        try { document.execCommand('copy'); } catch (e) {}
      });
      chrome.runtime.sendMessage({
        type: 'VOICE_GESTURE_COPY_SYNC',
        text: info.text
      }).catch(() => {});
      showVoiceHud('✓ Gesture: Copied selection', 'success', 2000);
    } else {
      showVoiceHud('⚠️ Gesture: Select text first', 'normal', 2000);
    }
  });

  // Listen for gesture-based paste
  window.addEventListener('voice:paste-gesture', () => {
    const el = getActiveEditableElement();
    if (!el) {
      showVoiceHud('⚠️ Gesture: Focus a text field first', 'normal', 2500);
      return;
    }

    const readPromise = navigator.clipboard && navigator.clipboard.readText
      ? navigator.clipboard.readText().catch(() => null)
      : Promise.resolve(null);

    readPromise.then(clipText => {
      if (clipText) {
        insertTextIntoActiveElement(clipText);
        showVoiceHud('✓ Gesture: Pasted text', 'success', 2000);
      } else {
        chrome.runtime.sendMessage({ type: 'VOICE_GET_CLIPBOARD_FALLBACK' }, (res) => {
          if (res && res.text) {
            insertTextIntoActiveElement(res.text);
            showVoiceHud('✓ Gesture: Pasted text', 'success', 2000);
          } else {
            showVoiceHud('⚠️ Gesture: Clipboard is empty', 'normal', 2000);
          }
        });
      }
    });
  });

  // ========================================
  // GAZE-BASED TEXT-RANGE SELECTION SUBSYSTEM
  // ========================================

  let latestGazePoint = { x: window.innerWidth / 2, y: window.innerHeight / 2, ts: 0 };
  let gazeSelectionState = {
    active: false,
    action: 'copy',
    startX: 0,
    startY: 0,
    startPos: null,
    startTime: 0,
    timer: null,
    pendingCut: null
  };

  let selectionBannerEl = null;
  let startMarkerEl = null;
  let endMarkerEl = null;
  let bannerInterval = null;

  // Track live gaze coordinates dispatched by gaze-core / head-cal
  window.addEventListener('gaze:point', (e) => {
    if (e.detail && typeof e.detail.x === 'number' && typeof e.detail.y === 'number') {
      latestGazePoint = {
        x: e.detail.x,
        y: e.detail.y,
        ts: typeof e.detail.ts === 'number' ? e.detail.ts : Date.now()
      };
      if (gazeSelectionState.active && endMarkerEl) {
        endMarkerEl.style.left = `${latestGazePoint.x}px`;
        endMarkerEl.style.top = `${latestGazePoint.y}px`;
      }
    }
  });

  // Clean up selection on window unload / navigation
  window.addEventListener('beforeunload', () => {
    if (gazeSelectionState.active || gazeSelectionState.pendingCut) {
      handleGazeSelectionCancel(true);
    }
  });

  function getCharIndexInField(el, x, y) {
    const text = el.value || '';
    if (!text.length) return 0;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const relX = Math.max(0, x - rect.left - paddingLeft + (el.scrollLeft || 0));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${style.fontWeight || 'normal'} ${style.fontSize || '14px'} ${style.fontFamily || 'sans-serif'}`;

    let bestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i <= text.length; i++) {
      const w = ctx.measureText(text.slice(0, i)).width;
      const diff = Math.abs(w - relX);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function findNearestTextNode(rootEl, x, y) {
    if (!rootEl) return null;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let closestNode = null;
    let closestOffset = 0;
    let minDistance = Infinity;

    while ((node = walker.nextNode())) {
      const len = node.nodeValue ? node.nodeValue.length : 0;
      if (len === 0) continue;
      try {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let r of rects) {
          const dx = Math.max(r.left - x, 0, x - r.right);
          const dy = Math.max(r.top - y, 0, y - r.bottom);
          const dist = Math.hypot(dx, dy);
          if (dist < minDistance) {
            minDistance = dist;
            closestNode = node;
            const ratio = (x - r.left) / (r.width || 1);
            closestOffset = Math.max(0, Math.min(len, Math.round(ratio * len)));
          }
        }
      } catch (e) {}
    }

    if (closestNode) {
      return { node: closestNode, offset: closestOffset };
    }
    return null;
  }

  function resolveCaretPosition(x, y) {
    const clampedX = Math.max(0, Math.min(window.innerWidth - 1, x));
    const clampedY = Math.max(0, Math.min(window.innerHeight - 1, y));

    const el = document.elementFromPoint(clampedX, clampedY);
    if (!el) return null;

    // Check if element is an <input> or <textarea>
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const idx = getCharIndexInField(el, clampedX, clampedY);
      return {
        type: 'field',
        element: el,
        index: idx,
        isEditable: true,
        x: clampedX,
        y: clampedY
      };
    }

    // Standard caretPositionFromPoint
    if (document.caretPositionFromPoint) {
      try {
        const pos = document.caretPositionFromPoint(clampedX, clampedY);
        if (pos && pos.offsetNode) {
          const parentEl = pos.offsetNode.nodeType === Node.ELEMENT_NODE ? pos.offsetNode : pos.offsetNode.parentElement;
          return {
            type: 'dom',
            node: pos.offsetNode,
            offset: pos.offset,
            element: parentEl,
            isEditable: isEditableTarget(parentEl),
            x: clampedX,
            y: clampedY
          };
        }
      } catch (e) {}
    }

    // WebKit/Blink caretRangeFromPoint
    if (document.caretRangeFromPoint) {
      try {
        const range = document.caretRangeFromPoint(clampedX, clampedY);
        if (range && range.startContainer) {
          const parentEl = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
          return {
            type: 'dom',
            node: range.startContainer,
            offset: range.startOffset,
            element: parentEl,
            isEditable: isEditableTarget(parentEl),
            x: clampedX,
            y: clampedY
          };
        }
      } catch (e) {}
    }

    // Fallback: search nearest text node in el
    const fallback = findNearestTextNode(el, clampedX, clampedY);
    if (fallback) {
      return {
        type: 'dom',
        node: fallback.node,
        offset: fallback.offset,
        element: el,
        isEditable: isEditableTarget(el),
        x: clampedX,
        y: clampedY
      };
    }

    return null;
  }

  function showSelectionBanner(action, remainingSeconds = 15) {
    if (!selectionBannerEl) {
      selectionBannerEl = document.createElement('div');
      selectionBannerEl.id = 'sanchalan-selection-banner';
      selectionBannerEl.style.cssText = `
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 22px;
        background: rgba(20, 20, 24, 0.94);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        color: #ffffff;
        border: 1px solid rgba(245, 158, 11, 0.7);
        border-radius: 30px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13.5px;
        font-weight: 500;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
      `;
      document.documentElement.appendChild(selectionBannerEl);
    }

    const actionText = action === 'cut' ? 'cut' : 'copy';
    const actionIcon = action === 'cut' ? '✂️' : '📋';
    const phrase = `Sanchalan, end ${actionText}`;

    selectionBannerEl.innerHTML = `
      <span style="font-size:16px;">${actionIcon}</span>
      <span>${action === 'cut' ? 'Cut' : 'Copy'} selection started — look at the end text and say <strong>"${phrase}"</strong>.</span>
      <span id="sanchalan-selection-timer" style="background:rgba(245,158,11,0.22); color:#fbbf24; border:1px solid rgba(245,158,11,0.5); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">${remainingSeconds}s</span>
    `;
    selectionBannerEl.style.display = 'flex';
    selectionBannerEl.style.opacity = '1';
  }

  function hideSelectionBanner() {
    if (selectionBannerEl && selectionBannerEl.parentNode) {
      selectionBannerEl.style.opacity = '0';
      setTimeout(() => {
        if (selectionBannerEl && selectionBannerEl.parentNode) {
          selectionBannerEl.style.display = 'none';
        }
      }, 200);
    }
    clearInterval(bannerInterval);
  }

  function createStartMarker(x, y) {
    removeStartMarker();
    startMarkerEl = document.createElement('div');
    startMarkerEl.id = 'sanchalan-start-marker';
    startMarkerEl.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: 2147483646;
      pointer-events: none;
      transform: translate(-50%, -100%);
      transition: none;
    `;
    startMarkerEl.innerHTML = `
      <div style="background:#2563eb; color:#ffffff; font-size:11px; font-weight:700; padding:3px 9px; border-radius:12px; box-shadow:0 3px 12px rgba(37,99,235,0.45); border:1px solid #60a5fa; display:flex; align-items:center; gap:4px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <span>📍 Start</span>
      </div>
    `;
    document.documentElement.appendChild(startMarkerEl);
  }

  function removeStartMarker() {
    if (startMarkerEl && startMarkerEl.parentNode) {
      startMarkerEl.parentNode.removeChild(startMarkerEl);
      startMarkerEl = null;
    }
  }

  function createEndMarker(x, y) {
    removeEndMarker();
    endMarkerEl = document.createElement('div');
    endMarkerEl.id = 'sanchalan-end-marker';
    endMarkerEl.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: 2147483646;
      pointer-events: none;
      transform: translate(-50%, -100%);
      transition: left 0.08s ease-out, top 0.08s ease-out;
    `;
    endMarkerEl.innerHTML = `
      <div style="background:#059669; color:#ffffff; font-size:11px; font-weight:700; padding:3px 9px; border-radius:12px; box-shadow:0 3px 12px rgba(5,150,105,0.45); border:1px solid #34d399; display:flex; align-items:center; gap:4px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <span>👁️ End</span>
      </div>
    `;
    document.documentElement.appendChild(endMarkerEl);
  }

  function removeEndMarker() {
    if (endMarkerEl && endMarkerEl.parentNode) {
      endMarkerEl.parentNode.removeChild(endMarkerEl);
      endMarkerEl = null;
    }
  }

  function handleGazeSelectionStart(action) {
    const now = Date.now();
    let currentX = latestGazePoint.x;
    let currentY = latestGazePoint.y;

    // Freshness check: require recent gaze coordinates
    if (!latestGazePoint.ts || (now - latestGazePoint.ts > 3500)) {
      showVoiceHud('⚠️ Gaze pointer not detected or stale. Please look at the text and try again.', 'warning', 3000);
      return { success: false, error: 'Gaze pointer not detected or stale. Please look at the text and try again.' };
    }

    const startPos = resolveCaretPosition(currentX, currentY);
    if (!startPos) {
      showVoiceHud('⚠️ Look at selectable text and try again', 'warning', 2500);
      return { success: false, error: 'Look at selectable text and try again.' };
    }

    gazeSelectionState.active = true;
    gazeSelectionState.action = action;
    gazeSelectionState.startX = currentX;
    gazeSelectionState.startY = currentY;
    gazeSelectionState.startPos = startPos;
    gazeSelectionState.startTime = now;
    gazeSelectionState.pendingCut = null;
    window.__sanchalanSelectionActive = true;

    createStartMarker(currentX, currentY);
    createEndMarker(currentX, currentY);

    let secondsLeft = 15;
    showSelectionBanner(action, secondsLeft);
    clearInterval(bannerInterval);
    bannerInterval = setInterval(() => {
      secondsLeft--;
      const timerEl = document.getElementById('sanchalan-selection-timer');
      if (timerEl) {
        timerEl.textContent = `${secondsLeft}s`;
      }
      if (secondsLeft <= 0) {
        clearInterval(bannerInterval);
        handleGazeSelectionTimeout();
      }
    }, 1000);

    clearTimeout(gazeSelectionState.timer);
    gazeSelectionState.timer = setTimeout(() => {
      handleGazeSelectionTimeout();
    }, 15000);

    return { success: true };
  }

  function handleGazeSelectionTimeout() {
    if (!gazeSelectionState.active) return;
    handleGazeSelectionCancel(false);
    showVoiceHud('⏱️ Selection timed out after 15s', 'normal', 3000);
    chrome.runtime.sendMessage({
      type: 'VOICE_SELECTION_TIMEOUT',
      message: 'Selection timed out.'
    }).catch(() => {});
  }

  function handleGazeSelectionEnd(action) {
    if (!gazeSelectionState.active) {
      return { success: false, error: 'No selection started. Say "Sanchalan, start ' + (action || 'copy') + '" first.' };
    }

    const now = Date.now();
    if (!latestGazePoint.ts || (now - latestGazePoint.ts > 3500)) {
      return {
        success: false,
        retryable: true,
        error: 'Gaze pointer coordinates are stale. Look steadily at the end text and retry.'
      };
    }

    const endPos = resolveCaretPosition(latestGazePoint.x, latestGazePoint.y);
    if (!endPos) {
      return {
        success: false,
        retryable: true,
        error: 'No selectable text at gaze point. Look at the end text and say "end ' + (action || gazeSelectionState.action) + '" again.'
      };
    }

    const startPos = gazeSelectionState.startPos;
    let selectedText = '';
    let selectionInfo = null;

    // Selection inside input / textarea
    if (startPos.type === 'field' && endPos.type === 'field' && startPos.element === endPos.element) {
      const el = startPos.element;
      const s = Math.min(startPos.index, endPos.index);
      const e = Math.max(startPos.index, endPos.index);
      el.focus();
      el.setSelectionRange(s, e);
      selectedText = el.value.slice(s, e);
      selectionInfo = {
        isField: true,
        isEditable: true,
        element: el,
        start: s,
        end: e,
        text: selectedText
      };
    } else {
      // Regular page text or contenteditable: normalize Range for forward and backward look
      let range = document.createRange();
      let startNode = startPos.node;
      let startOffset = startPos.offset;
      let endNode = endPos.node;
      let endOffset = endPos.offset;

      if (!startNode || !endNode) {
        return {
          success: false,
          retryable: true,
          error: 'Could not resolve valid text boundary. Look at text and try again.'
        };
      }

      if (startNode === endNode) {
        const s = Math.min(startOffset, endOffset);
        const e = Math.max(startOffset, endOffset);
        range.setStart(startNode, s);
        range.setEnd(startNode, e);
      } else {
        const comparison = startNode.compareDocumentPosition(endNode);
        if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
          // Forward selection
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
        } else {
          // Backward selection: user looked backward! Normalize start and end positions
          range.setStart(endNode, endOffset);
          range.setEnd(startNode, startOffset);
        }
      }

      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      selectedText = sel.toString();

      const commonAncestor = range.commonAncestorContainer;
      const parentEl = commonAncestor.nodeType === Node.ELEMENT_NODE ? commonAncestor : commonAncestor.parentElement;
      const isEditable = isEditableTarget(parentEl);

      selectionInfo = {
        isField: false,
        isEditable: isEditable,
        element: parentEl,
        range: range,
        text: selectedText
      };
    }

    if (!selectedText || selectedText.trim().length === 0) {
      return {
        success: false,
        retryable: true,
        error: 'Selected range is empty. Look at the end text and retry.'
      };
    }

    // Clean up active selection pending UI
    clearTimeout(gazeSelectionState.timer);
    hideSelectionBanner();
    removeStartMarker();
    removeEndMarker();
    gazeSelectionState.active = false;
    window.__sanchalanSelectionActive = false;

    // Action: COPY
    if (gazeSelectionState.action === 'copy' || action === 'copy') {
      navigator.clipboard.writeText(selectedText).catch(() => {
        try { document.execCommand('copy'); } catch (e) {}
      });
      showVoiceHud(`✓ Copied text (${selectedText.length} chars)`, 'success', 2500);
      return { success: true, text: selectedText };
    }

    // Action: CUT
    if (gazeSelectionState.action === 'cut' || action === 'cut') {
      // Must be in an editable element
      if (!selectionInfo.isEditable && !selectionInfo.isField) {
        showVoiceHud('⚠️ Cannot cut ordinary page text. Text can only be copied.', 'normal', 3500);
        return {
          success: false,
          isNotEditable: true,
          error: 'Cannot cut ordinary static page text. Text can only be copied.'
        };
      }

      // Store pending cut data for confirmation
      gazeSelectionState.pendingCut = selectionInfo;
      const charCount = selectedText.length;
      showVoiceHud(`✂️ Cut ${charCount} characters? Say "Sanchalan, confirm cut" or "cancel cut"`, 'armed', 15000);

      return {
        success: true,
        waitingConfirmation: true,
        length: charCount,
        text: selectedText
      };
    }

    return { success: true, text: selectedText };
  }

  function handleGazeSelectionConfirmCut() {
    const cutData = gazeSelectionState.pendingCut;
    if (!cutData || !cutData.text) {
      showVoiceHud('⚠️ No cut action pending confirmation', 'normal', 2500);
      return { success: false, error: 'No cut action pending confirmation.' };
    }

    const text = cutData.text;
    const len = text.length;

    // Copy to clipboard
    navigator.clipboard.writeText(text).catch(() => {
      try { document.execCommand('copy'); } catch (e) {}
    });

    if (cutData.isField && cutData.element) {
      const el = cutData.element;
      el.focus();
      el.value = el.value.slice(0, cutData.start) + el.value.slice(cutData.end);
      el.selectionStart = el.selectionEnd = cutData.start;
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } else if (cutData.range) {
      try {
        cutData.range.deleteContents();
      } catch (e) {
        try { document.execCommand('delete'); } catch (e2) {}
      }
    }

    gazeSelectionState.pendingCut = null;
    showVoiceHud(`✓ Cut ${len} characters`, 'success', 2500);
    return { success: true, length: len, text };
  }

  function handleGazeSelectionCancel(silent = false) {
    clearTimeout(gazeSelectionState.timer);
    clearInterval(bannerInterval);
    hideSelectionBanner();
    removeStartMarker();
    removeEndMarker();
    gazeSelectionState.active = false;
    gazeSelectionState.pendingCut = null;
    window.__sanchalanSelectionActive = false;

    if (!silent) {
      showVoiceHud('Selection cancelled', 'normal', 2000);
    }
    return { success: true };
  }
  chrome.storage.local.get(['displayMode', 'gazeEnabled'], (result) => {
    if (result.displayMode) {
      displayMode = result.displayMode;
      debugLog('[Content] Initial display mode:', displayMode);
    }
    if (typeof result.gazeEnabled === 'boolean') {
      gazeEnabled = result.gazeEnabled;
      debugLog('[Content] Initial gaze enabled:', gazeEnabled);
    }
  });
  
  // Initialize hover detection
  if (IS_TWITTER) {
    ensureTwitterInterceptor();
  }
  document.body.addEventListener('mouseover', handleMouseOver, true);
  document.body.addEventListener('mouseout', handleMouseOut, true);
  
  debugLog('[Content] Hover link extension initialized');
  
  // Format AI summary (same as background.js)
  function formatAISummary(text) {
    if (!text) return '';
    
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    formatted = formatted
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
    formatted = formatted
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    formatted = formatted
      .replace(/\*([^\*\s][^\*]*?[^\*\s])\*/g, '<em>$1</em>')
      .replace(/_([^_\s][^_]*?[^_\s])_/g, '<em>$1</em>');
    
    formatted = formatted
      .replace(/^[\*\-•] (.+)$/gm, '<li>$1</li>');
    
    formatted = formatted
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    formatted = formatted
      .replace(/(<li>.*?<\/li>\n?)+/g, (match) => {
        // Remove newlines from inside the list before wrapping
        return '<ul>' + match.replace(/\n/g, '') + '</ul>';
      });
    
    formatted = formatted
      .replace(/\n\n+/g, '</p><p>');
    
    formatted = formatted
      .replace(/\n/g, '<br>');
    
    if (!formatted.startsWith('<h') && !formatted.startsWith('<ul') && !formatted.startsWith('<p>')) {
      formatted = '<p>' + formatted;
    }
    if (!formatted.endsWith('</p>') && !formatted.endsWith('</ul>') && !formatted.endsWith('</h2>') && !formatted.endsWith('</h3>') && !formatted.endsWith('</h4>')) {
      formatted = formatted + '</p>';
    }
    
    formatted = formatted
      .replace(/<p><\/p>/g, '')
      .replace(/<p>\s*<\/p>/g, '');
    
    formatted = formatted
      .replace(/<p>(<h\d>)/g, '$1')
      .replace(/(<\/h\d>)<\/p>/g, '$1')
      .replace(/<p>(<ul>)/g, '$1')
      .replace(/(<\/ul>)<\/p>/g, '$1');
    
    return formatted;
  }
  
  // ============ YouTube-Specific Functions ============
  
  /**
   * Create YouTube summary overlay inside thumbnail
   */
  
  /**
   * Check if an element is a YouTube thumbnail
   */
  function isYouTubeThumbnail(element) {
    if (!IS_YOUTUBE) return false;
    
    // Only check for actual thumbnail elements, not entire video cards
    // This ensures consistent overlay sizing
    const thumbnailSelectors = [
      'ytd-thumbnail',
      'ytd-video-preview',
      'ytd-playlist-thumbnail',
      'a#thumbnail'
    ];
    
    for (const selector of thumbnailSelectors) {
      if (element.matches(selector) || element.closest(selector)) {
        return true;
      }
    }
    
    return false;
  }
  
  function waitForYouTubeCaptions(videoId) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('youtube-captions-ready', captionListener);
        clearTimeout(timeout);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for captions'));
      }, 5000);
      const captionListener = (event) => {
        if (event.detail && event.detail.videoId === videoId) {
          cleanup();
          resolve();
        }
      };
      window.addEventListener('youtube-captions-ready', captionListener);
      if (window.hasYouTubeCaptions) {
        window.hasYouTubeCaptions(videoId)
          .then((hasCaptions) => {
            if (hasCaptions) {
              cleanup();
              resolve();
            }
          })
          .catch(() => {});
      }
    });
  }

  async function handleYouTubeVideoHover(anchorElement, linkElement, url, requestToken) {
    console.log('[YouTube] Hover handler start', {
      url,
      requestToken,
      currentToken: currentYouTubeRequestToken,
      currentlyProcessingUrl
    });
    if (requestToken !== currentYouTubeRequestToken) {
      console.warn('[YouTube] Stale hover request, ignoring', {
        requestToken,
        currentToken: currentYouTubeRequestToken
      });
      return;
    }
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      console.warn('[YouTube] Could not extract video ID from:', url);
      currentlyProcessingUrl = null;
      return;
    }
    const tooltipAnchor = anchorElement || linkElement;
    currentlyProcessingUrl = url;
    processingElement = linkElement || tooltipAnchor;
    currentHoveredElement = tooltipAnchor;
    const tooltipOptions = { placement: 'right' };
    if (displayMode === 'tooltip' || displayMode === 'both') {
      showTooltip(tooltipAnchor, '<div style="text-align:center;padding:16px;opacity:0.75;">Capturing captions…</div>', url, tooltipOptions);
    }
    const summaryTimeout = setTimeout(() => {
      if (currentlyProcessingUrl === url) {
        chrome.runtime.sendMessage({
          action: 'ABORT_YOUTUBE_SUMMARY',
          videoId
        });
        if (displayMode === 'tooltip' || displayMode === 'both') {
          showTooltip(tooltipAnchor, '<div style="padding:10px;background:#fee;border-radius:8px;">Summary timed out. Try hovering again.</div>', url, tooltipOptions);
        }
        currentlyProcessingUrl = null;
        if (linkElement) {
          delete linkElement.__hoverAnchor;
          delete linkElement.__hoverRequestToken;
        }
      }
    }, 30000);

    try {
      await waitForYouTubeCaptions(videoId);
    console.log('[YouTube] Captions ready before summary request:', videoId);
    } catch (error) {
      console.warn('[YouTube] Captions did not arrive in time, continuing anyway:', videoId, error && error.message ? error.message : error);
    }

    if (displayMode === 'tooltip' || displayMode === 'both') {
      showTooltip(tooltipAnchor, '<div style="text-align:center;padding:16px;opacity:0.75;">Generating summary…</div>', url, tooltipOptions);
    }
    if (requestToken !== currentYouTubeRequestToken) {
      console.warn('[YouTube] Request token changed after caption wait, aborting send', {
        requestToken,
        currentToken: currentYouTubeRequestToken
      });
      return;
    }
    console.log('[YouTube] Sending GET_YOUTUBE_SUMMARY', { videoId, url, requestToken });
    chrome.runtime.sendMessage({
      action: 'GET_YOUTUBE_SUMMARY',
      videoId,
      url
    }, (response) => {
      clearTimeout(summaryTimeout);
      if (requestToken !== currentYouTubeRequestToken) {
        console.warn('[YouTube] Request token changed before response handling', {
          requestToken,
          currentToken: currentYouTubeRequestToken
        });
        return;
      }
      if (chrome.runtime.lastError) {
        console.error('[YouTube] Runtime error:', chrome.runtime.lastError);
        if (displayMode === 'tooltip' || displayMode === 'both') {
          showTooltip(tooltipAnchor, '<div style="padding:10px;background:#fee;border-radius:8px;">Error generating summary.</div>', url, tooltipOptions);
        }
        currentlyProcessingUrl = null;
        return;
      }
      if (!response) {
        console.warn('[YouTube] Empty response from background');
        currentlyProcessingUrl = null;
        return;
      }
      console.log('[YouTube] Summary response payload:', response);
      if (response.status === 'complete') {
        const summary = response.summary || 'No summary generated';
        const formatted = formatAISummary(summary);
        showTooltip(tooltipAnchor, formatted, url, tooltipOptions);
        if (displayMode === 'sidepanel' || displayMode === 'both') {
          chrome.runtime.sendMessage({
            action: 'DISPLAY_CACHED_SUMMARY',
            summary,
            url
          });
        }
        currentlyProcessingUrl = null;
        processingElement = null;
        if (linkElement) {
          delete linkElement.__hoverAnchor;
          delete linkElement.__hoverRequestToken;
        }
        return;
      }
      if (response.status === 'streaming') {
        return;
      }
      if (response.error) {
        const errorMsg = response.error === 'NO_CAPTIONS'
          ? 'No captions available for this video yet.'
          : `Error: ${response.error}`;
        if (displayMode === 'tooltip' || displayMode === 'both') {
          showTooltip(tooltipAnchor, `<div style="padding:10px;background:#fee;border-radius:8px;">${errorMsg}</div>`, url, tooltipOptions);
        }
        currentlyProcessingUrl = null;
        processingElement = null;
        if (linkElement) {
          delete linkElement.__hoverAnchor;
          delete linkElement.__hoverRequestToken;
        }
      }
    });
  }
  
})();
