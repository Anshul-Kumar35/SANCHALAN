// Load Voice Command Parser & Deterministic Utilities
try {
  importScripts('voice/command-parser.js');
} catch (e) {
  console.warn('[Background] Failed to importScripts voice/command-parser.js:', e);
}

// ========================================
// AI APIS INITIALIZATION
// ========================================

// Compatibility layer for different Chrome AI API versions
async function initializeSummarizerAPI() {
  // Check for Summarization API
  let summarizerAvailable = false;
  
  if ('Summarizer' in self) {
    console.log('[Background] Found global Summarizer API');
    summarizerAvailable = true;
  } else if ('ai' in self && 'summarizer' in self.ai) {
    console.log('[Background] Found ai.summarizer namespace');
    summarizerAvailable = true;
  }
  
  return {
    summarizer: {
      available: summarizerAvailable,
      availability: summarizerAvailable 
        ? () => ('Summarizer' in self ? Summarizer.availability({ outputLanguage: 'en' }) : ai.summarizer.availability({ outputLanguage: 'en' }))
        : null,
      create: summarizerAvailable
        ? (options) => ('Summarizer' in self ? Summarizer.create(options) : ai.summarizer.create(options))
        : null
    },
    promptAPI: {
      available: 'LanguageModel' in self,
      availability: 'LanguageModel' in self 
        ? (options) => LanguageModel.availability(options || { expectedOutputs: [{ type: 'text', languages: ['en'] }] })
        : null,
      create: 'LanguageModel' in self ? (options) => LanguageModel.create(options) : null,
      params: 'LanguageModel' in self ? () => LanguageModel.params() : null
    }
  };
}

// Helper to create a default API state so status checks are safe before init completes
function createInitialApiState() {
  return {
    summarizer: {
      available: false,
      status: 'initializing',
      availability: null,
      create: null
    },
    promptAPI: {
      available: false,
      status: 'initializing',
      availability: null,
      create: null,
      params: null
    }
  };
}

// Global API reference
let SummarizerAPI = createInitialApiState();

// Initialize APIs on service worker startup
async function initAPIs() {
  try {
    const api = await initializeSummarizerAPI();

    Object.assign(SummarizerAPI.summarizer, api.summarizer);
    SummarizerAPI.summarizer.status = SummarizerAPI.summarizer.available ? 'initializing' : 'unavailable';

    Object.assign(SummarizerAPI.promptAPI, api.promptAPI);
    SummarizerAPI.promptAPI.status = SummarizerAPI.promptAPI.available ? 'initializing' : 'unavailable';

    console.log('[Background] APIs initialized:', {
      summarizerAvailable: SummarizerAPI.summarizer.available,
      promptAvailable: SummarizerAPI.promptAPI.available
    });

    // Check Summarizer availability
    if (SummarizerAPI.summarizer.available && SummarizerAPI.summarizer.availability) {
      try {
        const summarizerAvailability = await SummarizerAPI.summarizer.availability();
        console.log('[Background] Summarizer availability:', summarizerAvailability);
        SummarizerAPI.summarizer.status = summarizerAvailability;
      } catch (error) {
        console.error('[Background] Summarizer availability check failed:', error);
        SummarizerAPI.summarizer.status = 'unavailable';
      }
    } else {
      SummarizerAPI.summarizer.status = 'unavailable';
    }

    // Check Prompt API availability
    if (SummarizerAPI.promptAPI.available && SummarizerAPI.promptAPI.availability) {
      try {
        const promptAvailability = await SummarizerAPI.promptAPI.availability({
          expectedOutputs: [{ type: 'text', languages: ['en'] }]
        });
        console.log('[Background] Prompt API availability:', promptAvailability);
        SummarizerAPI.promptAPI.status = promptAvailability;
      } catch (error) {
        console.error('[Background] Prompt API availability check failed:', error);
        SummarizerAPI.promptAPI.status = 'unavailable';
      }
    } else {
      SummarizerAPI.promptAPI.status = 'unavailable';
    }
  } catch (error) {
    console.error('[Background] API initialization failed:', error);
    SummarizerAPI.summarizer.status = 'error';
    SummarizerAPI.promptAPI.status = 'error';
  }
}

const apiInitializationPromise = initAPIs();

// ========================================
// SETTINGS MANAGEMENT
// ========================================

let settings = {
  apiChoice: 'summarization',
  customPrompt: 'Summarize this article in 2-3 sentences',
  displayMode: 'tooltip'
};

const DEFAULT_VOICE_SETTINGS = {
  voiceEnabled: false,
  voiceTypingEnabled: true,
  voiceCommandsEnabled: true,
  voiceWakePhrase: 'sanchalan',
  voiceCommandTimeoutMs: 5000,
  voiceProvider: 'webspeech',
  voiceLanguage: 'en-US',
  voiceGestureEnabled: false,
  voiceBackendUrl: '',
  voiceLocalWhisperUrl: 'http://localhost:8080/v1/transcribe'
};

let voiceSettings = { ...DEFAULT_VOICE_SETTINGS };

// Load settings from storage
async function loadSettings() {
  const stored = await chrome.storage.local.get([
    'apiChoice', 'customPrompt', 'displayMode',
    'voiceEnabled', 'voiceTypingEnabled', 'voiceCommandsEnabled',
    'voiceWakePhrase', 'voiceCommandTimeoutMs', 'voiceProvider',
    'voiceLanguage', 'voiceGestureEnabled', 'voiceBackendUrl', 'voiceLocalWhisperUrl'
  ]);
  if (stored.apiChoice) settings.apiChoice = stored.apiChoice;
  if (stored.customPrompt) settings.customPrompt = stored.customPrompt;
  if (stored.displayMode) settings.displayMode = stored.displayMode;

  if (typeof stored.voiceEnabled === 'boolean') voiceSettings.voiceEnabled = stored.voiceEnabled;
  if (typeof stored.voiceTypingEnabled === 'boolean') voiceSettings.voiceTypingEnabled = stored.voiceTypingEnabled;
  if (typeof stored.voiceCommandsEnabled === 'boolean') voiceSettings.voiceCommandsEnabled = stored.voiceCommandsEnabled;
  if (stored.voiceWakePhrase) voiceSettings.voiceWakePhrase = stored.voiceWakePhrase;
  if (typeof stored.voiceCommandTimeoutMs === 'number') voiceSettings.voiceCommandTimeoutMs = stored.voiceCommandTimeoutMs;
  if (stored.voiceProvider) voiceSettings.voiceProvider = stored.voiceProvider;
  if (stored.voiceLanguage) voiceSettings.voiceLanguage = stored.voiceLanguage;
  if (typeof stored.voiceGestureEnabled === 'boolean') voiceSettings.voiceGestureEnabled = stored.voiceGestureEnabled;
  if (stored.voiceBackendUrl !== undefined) voiceSettings.voiceBackendUrl = stored.voiceBackendUrl;
  if (stored.voiceLocalWhisperUrl !== undefined) voiceSettings.voiceLocalWhisperUrl = stored.voiceLocalWhisperUrl;

  console.log('[Background] Settings loaded:', settings, 'Voice settings:', voiceSettings);

  if (voiceSettings.voiceEnabled) {
    startVoiceSubsystem();
  }
}

// Initialize settings
loadSettings();

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.apiChoice) settings.apiChoice = changes.apiChoice.newValue;
    if (changes.customPrompt) settings.customPrompt = changes.customPrompt.newValue;
    if (changes.displayMode) settings.displayMode = changes.displayMode.newValue;

    let voiceChanged = false;
    let restartRequired = false;

    if (changes.voiceEnabled !== undefined) {
      voiceSettings.voiceEnabled = changes.voiceEnabled.newValue;
      voiceChanged = true;
      if (voiceSettings.voiceEnabled) {
        startVoiceSubsystem();
      } else {
        stopVoiceSubsystem();
      }
    }
    if (changes.voiceTypingEnabled !== undefined) {
      voiceSettings.voiceTypingEnabled = changes.voiceTypingEnabled.newValue;
      voiceChanged = true;
    }
    if (changes.voiceCommandsEnabled !== undefined) {
      voiceSettings.voiceCommandsEnabled = changes.voiceCommandsEnabled.newValue;
      voiceChanged = true;
    }
    if (changes.voiceWakePhrase !== undefined) {
      voiceSettings.voiceWakePhrase = changes.voiceWakePhrase.newValue;
      voiceChanged = true;
    }
    if (changes.voiceCommandTimeoutMs !== undefined) {
      voiceSettings.voiceCommandTimeoutMs = changes.voiceCommandTimeoutMs.newValue;
      voiceChanged = true;
    }
    if (changes.voiceGestureEnabled !== undefined) {
      voiceSettings.voiceGestureEnabled = changes.voiceGestureEnabled.newValue;
      voiceChanged = true;
    }
    if (changes.voiceProvider !== undefined) {
      voiceSettings.voiceProvider = changes.voiceProvider.newValue;
      voiceChanged = true;
      restartRequired = true;
    }
    if (changes.voiceLanguage !== undefined) {
      voiceSettings.voiceLanguage = changes.voiceLanguage.newValue;
      voiceChanged = true;
      restartRequired = true;
    }
    if (changes.voiceBackendUrl !== undefined) {
      voiceSettings.voiceBackendUrl = changes.voiceBackendUrl.newValue;
      voiceChanged = true;
    }
    if (changes.voiceLocalWhisperUrl !== undefined) {
      voiceSettings.voiceLocalWhisperUrl = changes.voiceLocalWhisperUrl.newValue;
      voiceChanged = true;
    }

    if (voiceChanged && restartRequired && voiceSettings.voiceEnabled) {
      startVoiceSubsystem();
    }
    console.log('[Background] Settings updated:', settings, 'Voice:', voiceSettings);
  }
});

// ========================================
// CACHING & STATE MANAGEMENT
// ========================================

const htmlCache = {};
const summaryCache = new Map();
const youtubeCaptionCache = new Map(); // Cache for YouTube caption data
const youtubeSummaryCache = new Map(); // Cache for YouTube summaries
const youtubeDescriptionCache = new Map(); // Cache for YouTube video descriptions
const twitterThreadCache = new Map(); // Cache for Twitter conversation scrapes
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const TWITTER_THREAD_TTL = 5 * 60 * 1000; // 5 minutes
const YOUTUBE_DEBUG_LOG_FULL_INPUT = true; // Toggle to emit full summarization input for debugging

const summarizationJobs = new Map();
const youtubeJobsByVideoId = new Map();
let summarizationJobCounter = 0;
let activePageJobId = null;
let activeYouTubeJobId = null;

function createSummarizationJob({ url, tabId, feature, metadata }) {
  const controller = new AbortController();
  const jobId = `job-${Date.now()}-${++summarizationJobCounter}`;
  const job = {
    id: jobId,
    url,
    tabId: typeof tabId === 'number' ? tabId : null,
    feature,
    metadata: metadata || {},
    controller,
    signal: controller.signal,
    session: null,
    sessionType: null,
    createdAt: Date.now()
  };
  summarizationJobs.set(jobId, job);
  return job;
}

function registerJobSession(job, session, type) {
  if (!job) return;
  job.session = session || null;
  job.sessionType = type || null;
}

function destroyJobSession(job) {
  if (!job || !job.session) {
    job.session = null;
    job.sessionType = null;
    return;
  }
  if (typeof job.session.destroy === 'function') {
    try {
      job.session.destroy();
    } catch (error) {
      console.warn('[Background] Failed to destroy session:', error);
    }
  }
  job.session = null;
  job.sessionType = null;
}

function finalizeJob(jobId) {
  const job = summarizationJobs.get(jobId);
  if (!job) return;
  destroyJobSession(job);
  summarizationJobs.delete(jobId);

  if (job.feature === 'page' && activePageJobId === jobId) {
    activePageJobId = null;
  }

  if (job.feature === 'youtube') {
    if (activeYouTubeJobId === jobId) {
      activeYouTubeJobId = null;
    }
    const videoId = job.metadata && job.metadata.videoId;
    if (videoId && youtubeJobsByVideoId.get(videoId) === jobId) {
      youtubeJobsByVideoId.delete(videoId);
    }
  }
}

function abortJob(jobId, reason) {
  const job = summarizationJobs.get(jobId);
  if (!job) return;
  if (!job.signal.aborted) {
    job.controller.abort();
  }
  console.log('[Background] Aborting job', {
    feature: job.feature,
    url: job.url,
    reason: reason || 'unspecified'
  });
  finalizeJob(jobId);
}

function getJob(jobId) {
  return summarizationJobs.get(jobId) || null;
}

// Clean cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of summaryCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      summaryCache.delete(key);
    }
  }
  for (const [key, value] of twitterThreadCache.entries()) {
    if (now - value.timestamp > TWITTER_THREAD_TTL) {
      twitterThreadCache.delete(key);
    }
  }
  for (const [key, value] of youtubeDescriptionCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      youtubeDescriptionCache.delete(key);
    }
  }
  console.log(`[Background] Cache cleaned. Summaries: ${summaryCache.size}, Twitter threads: ${twitterThreadCache.size}, YouTube descriptions: ${youtubeDescriptionCache.size}.`);
}, 5 * 60 * 1000);

// ========================================
// AI SUMMARIZATION FUNCTIONS
// ========================================

async function summarizeContent({ job, text, url }) {
  if (!job) {
    throw new Error('Summarization job context missing');
  }
  const signal = job.signal;
  await apiInitializationPromise;
  if (settings.apiChoice === 'summarization') {
    return await useSummarizationAPI({ job, text, signal, url });
  } else {
    return await usePromptAPI({ job, text, signal, url });
  }
}

async function useSummarizationAPI({ job, text, signal, url }) {
  if (!SummarizerAPI.summarizer.available) {
    throw new Error('Summarizer API not available');
  }
  
  const availability = SummarizerAPI.summarizer.status;
  
  if (availability === 'downloadable' || availability === 'downloading') {
    throw new Error('MODEL_DOWNLOAD_REQUIRED');
  }
  
  if (availability === 'unavailable') {
    throw new Error('Summarizer API is unavailable on this device');
  }
  
  if (availability !== 'available' && availability !== 'readily') {
    throw new Error(`Summarizer API status is: ${availability}`);
  }
  
  try {
    const options = {
      type: 'key-points',
      format: 'markdown',
      length: 'medium',
      sharedContext: 'This is an article from a webpage.',
      outputLanguage: 'en'
    };
    
    const summarizer = await SummarizerAPI.summarizer.create(options);
    registerJobSession(job, summarizer, 'summarizer');
    
    // Add abort listener to destroy session
    if (signal) {
      signal.addEventListener('abort', () => {
        console.log('[Background] Abort signal received - destroying summarizer');
        destroyJobSession(job);
      }, { once: true });
    }
    
    // Prepare text
    const MAX_CHARS = 4000;
    let processedText = text;
    
    if (text.length > MAX_CHARS) {
      const partSize = Math.floor(MAX_CHARS / 3);
      const start = text.slice(0, partSize);
      const middle = text.slice(
        Math.floor(text.length / 2 - partSize / 2),
        Math.floor(text.length / 2 + partSize / 2)
      );
      const end = text.slice(-partSize);
      
      processedText = `${start}\n\n[...]\n\n${middle}\n\n[...]\n\n${end}`;
    }
    
    console.log('[Background] Starting Summarizer streaming...');
    
    // Store the summarizer instance globally BEFORE streaming
    registerJobSession(job, summarizer, 'summarizer');
    
    // Check if already aborted before starting
    if (signal && signal.aborted) {
      console.log('[Background] Already aborted before streaming started');
      destroyJobSession(job);
      throw new DOMException('Aborted', 'AbortError');
    }
    
    try {
      const stream = summarizer.summarizeStreaming(processedText);
      
      let fullSummary = '';
      let lastBroadcast = 0;
      const BROADCAST_INTERVAL = 150;
      
      // Store the videoId for this specific stream at the start
      const videoIdForThisStream = job?.metadata?.videoId ||
        (url.includes('watch?v=') ? new URL(url).searchParams.get('v') : null);
      if (videoIdForThisStream) {
        console.log('[Streaming] Starting stream for videoId:', videoIdForThisStream);
      }
      
      for await (const chunk of stream) {
        // Add debug line - log every ~100 chars
        if (fullSummary.length % 100 < 10) {
          console.log(`[Streaming] Progress: ${fullSummary.length} chars, videoId: ${videoIdForThisStream || 'n/a'}`);
        }
        
        if (!summarizationJobs.has(job.id)) {
          console.log('[Background] 🔴 JOB REMOVED - stopping stream');
          destroyJobSession(job);
          throw new DOMException('Aborted', 'AbortError');
        }
        
        // ✅ ENHANCED: Check abort BEFORE processing chunk
        if (signal && signal.aborted) {
          console.log('[Background] 🔴 ABORT SIGNAL DETECTED - stopping immediately');
          
          // Destroy session immediately
          destroyJobSession(job);
          
          // Throw to exit the async generator
          throw new DOMException('Aborted', 'AbortError');
        }
        
        // ✅ ENHANCED: Also check if session was destroyed externally
        if (!job.session) {
          console.log('[Background] 🔴 SESSION DESTROYED - stopping stream');
          throw new DOMException('Session destroyed', 'AbortError');
        }
        
        fullSummary += chunk;
        
        const now = Date.now();
        if (now - lastBroadcast >= BROADCAST_INTERVAL) {
          broadcastStreamingUpdate(job, fullSummary);
          lastBroadcast = now;
        }
      }
      
      // Final broadcast
      broadcastStreamingUpdate(job, fullSummary);
      
      return fullSummary;
      
    } catch (error) {
      // Clean up on any error
      destroyJobSession(job);
      throw error;
    }
    
  } catch (error) {
    if (error.name === 'AbortError' || error.message === 'Session is destroyed') {
      console.log('[Background] Summarizer aborted/destroyed');
      throw error;
    }
    console.error('[Background] Summarization failed:', error);
    throw error;
  } finally {
    destroyJobSession(job);
  }
}

async function usePromptAPI({ job, text, signal, url }) {
  if (!SummarizerAPI.promptAPI.available) {
    throw new Error('Prompt API not available');
  }
  
  const availability = SummarizerAPI.promptAPI.status;
  
  if (availability === 'unavailable') {
    throw new Error('Prompt API not available on this device');
  }
  
  if (availability === 'downloadable' || availability === 'downloading') {
    throw new Error('MODEL_DOWNLOAD_REQUIRED');
  }
  
  if (availability !== 'available' && availability !== 'readily') {
    throw new Error(`Prompt API status is: ${availability}`);
  }
  
  try {
    // Destroy any existing prompt session
    const session = await SummarizerAPI.promptAPI.create({
      expectedOutputs: [
        { type: 'text', languages: ['en'] }
      ],
      signal: signal  // Pass signal directly to create
    });
    registerJobSession(job, session, 'prompt');
    
    // Add abort listener to destroy session
    if (signal) {
      signal.addEventListener('abort', () => {
        console.log('[Background] Abort signal received - destroying prompt session');
        destroyJobSession(job);
      }, { once: true });
    }
    
    // Prepare text
    const MAX_CHARS = 3000;
    let processedText = text;
    
    if (text.length > MAX_CHARS) {
      const partSize = Math.floor(MAX_CHARS / 3);
      const start = text.slice(0, partSize);
      const middle = text.slice(
        Math.floor(text.length / 2 - partSize / 2),
        Math.floor(text.length / 2 + partSize / 2)
      );
      const end = text.slice(-partSize);
      
      processedText = `${start}\n\n[...]\n\n${middle}\n\n[...]\n\n${end}`;
    }
    
    const fullPrompt = `${settings.customPrompt}\n\nContent:\n${processedText}`;
    
    console.log('[Background] Starting Prompt API streaming...');
    
    // Store the session instance globally BEFORE streaming
    registerJobSession(job, session, 'prompt');
    
    // Check if already aborted before starting
    if (signal && signal.aborted) {
      console.log('[Background] Already aborted before streaming started');
      destroyJobSession(job);
      throw new DOMException('Aborted', 'AbortError');
    }
    
    try {
      const stream = session.promptStreaming(fullPrompt);
      
      let fullSummary = '';
      let lastBroadcast = 0;
      const BROADCAST_INTERVAL = 150;
      
      // Store the videoId for this specific stream at the start
      const videoIdForThisStream = job?.metadata?.videoId ||
        (url.includes('watch?v=') ? new URL(url).searchParams.get('v') : null);
      if (videoIdForThisStream) {
        console.log('[Streaming] Starting stream for videoId:', videoIdForThisStream);
      }
      
      for await (const chunk of stream) {
        // Add debug line - log every ~100 chars
        if (fullSummary.length % 100 < 10) {
          console.log(`[Streaming] Progress: ${fullSummary.length} chars, videoId: ${videoIdForThisStream || 'n/a'}`);
        }
        
        if (!summarizationJobs.has(job.id)) {
          console.log('[Background] 🔴 JOB REMOVED - stopping stream');
          destroyJobSession(job);
          throw new DOMException('Aborted', 'AbortError');
        }
        
        // ✅ ENHANCED: Check abort BEFORE processing chunk
        if (signal && signal.aborted) {
          console.log('[Background] 🔴 ABORT SIGNAL DETECTED - stopping immediately');
          
          // Destroy session immediately
          destroyJobSession(job);
          
          // Throw to exit the async generator
          throw new DOMException('Aborted', 'AbortError');
        }
        
        // ✅ ENHANCED: Also check if session was destroyed externally
        if (!job.session) {
          console.log('[Background] 🔴 SESSION DESTROYED - stopping stream');
          throw new DOMException('Session destroyed', 'AbortError');
        }
        
        fullSummary += chunk;
        
        const now = Date.now();
        if (now - lastBroadcast >= BROADCAST_INTERVAL) {
          broadcastStreamingUpdate(job, fullSummary);
          lastBroadcast = now;
        }
      }
      
      // Final broadcast
      broadcastStreamingUpdate(job, fullSummary);
      
      return fullSummary;
      
    } catch (error) {
      // Clean up on any error
      destroyJobSession(job);
      throw error;
    }
    
  } catch (error) {
    if (error.name === 'AbortError' || error.message === 'Session is destroyed') {
      console.log('[Background] Prompt API aborted/destroyed');
      throw error;
    }
    console.error('[Background] Prompt API failed:', error);
    throw error;
  } finally {
    destroyJobSession(job);
  }
}

// Broadcast streaming updates to all display surfaces
function broadcastStreamingUpdate(job, partialSummary) {
  if (!job) return;
  if (!summarizationJobs.has(job.id)) {
    return;
  }
  const formatted = formatAISummary(partialSummary);
  const payload = {
    type: 'STREAMING_UPDATE',
    content: formatted,
    url: job.url
  };
  
  // Send to side panel if open
  chrome.runtime.sendMessage(payload).catch(() => {
    // Side panel not open, ignore
  });
  
  // Send to content script for tooltip
  if (typeof job.tabId === 'number') {
    chrome.tabs.sendMessage(job.tabId, payload).catch(() => {
      // Content script not ready, ignore
    });
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, payload).catch(() => {
          // Content script not ready, ignore
        });
      }
    });
  }
}

// Format AI summary to HTML
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

// ========================================
// TWITTER BACKGROUND SCRAPE HELPERS
// ========================================

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId, timeout = 15000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) throw new Error('TAB_NOT_FOUND');
  if (tab.status === 'complete') {
    return;
  }
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('TAB_LOAD_TIMEOUT'));
    }, timeout);
    
    function handleUpdate(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve();
      }
    }
    
    function handleRemoved(removedTabId) {
      if (removedTabId === tabId) {
        cleanup();
        reject(new Error('TAB_CLOSED'));
      }
    }
    
    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
    }
    
    chrome.tabs.onUpdated.addListener(handleUpdate);
    chrome.tabs.onRemoved.addListener(handleRemoved);
  });
}

async function captureTwitterThreadInTab(tabId, tweetId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'CAPTURE_TWITTER_THREAD',
        tweetId
      });
      
      if (response && response.status === 'ok' && response.payload && Array.isArray(response.payload.nodes)) {
        const payload = response.payload;
        payload.source = payload.source || 'background';
        return payload;
      }
      
      if (response && response.error) {
        console.warn('[Twitter] Capture response error:', response.error);
      }
    } catch (error) {
      console.warn('[Twitter] Capture attempt failed:', error);
    }
    
    await delay(300 * (attempt + 1));
  }
  
  try {
    const executed = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (targetTweetId) => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const start = Date.now();
        let bestNodes = null;
        while (Date.now() - start < 12000) {
          const BUTTON_SELECTOR = 'div[role="button"], button, a[role="link"]';
          const EXPAND_MATCH = /(show|view|reveal).*(repl|thread|tweet)/i;
          document.querySelectorAll(BUTTON_SELECTOR).forEach((el) => {
            const text = (el.textContent || '').trim();
            if (text && EXPAND_MATCH.test(text)) {
              el.click();
            }
          });
          window.scrollBy(0, Math.max(window.innerHeight * 0.9, 600));
          await sleep(420);
          document.querySelectorAll(BUTTON_SELECTOR).forEach((el) => {
            const text = (el.textContent || '').trim();
            if (text && EXPAND_MATCH.test(text)) {
              el.click();
            }
          });
          await sleep(220);
          const nodesMap = new Map();
          document.querySelectorAll('article[role="article"]').forEach((article) => {
            const link = article.querySelector('a[href*="/status/"]');
            const href = link ? link.getAttribute('href') : null;
            let id = null;
            if (href) {
              const match = href.match(/status\/(\d+)/);
              if (match) id = match[1];
            }
            if (!id && targetTweetId) id = targetTweetId;
            if (!id) return;
            const handleSpan = article.querySelector('div[dir="ltr"] span');
            const handle = handleSpan ? handleSpan.textContent : null;
            const textEl = article.querySelector('[data-testid="tweetText"]');
            const text = textEl ? textEl.innerText.trim() : '';
            const timeEl = article.querySelector('time');
            const timestamp = timeEl ? timeEl.getAttribute('datetime') : null;
            const media = [];
            article.querySelectorAll('img').forEach((img) => {
              if (!img || !img.src) return;
              const pixels = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
              if (pixels > 40000) {
                media.push({ kind: 'photo', urls: [img.src] });
              }
            });
            const existing = nodesMap.get(id);
            if (!existing || (text && text.length > (existing.text || '').length)) {
              nodesMap.set(id, {
                id: String(id),
                conversationId: null,
                authorName: null,
                handle: handle || null,
                avatarUrl: null,
                timestamp,
                permalink: link ? (link.href || null) : null,
                text,
                media,
                inReplyToId: null,
                order: 0
              });
            }
          });
          const nodes = Array.from(nodesMap.values());
          nodes.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
          nodes.forEach((node, idx) => { node.order = idx; });
          if (nodes.length > 1) {
            return {
              status: 'ok',
              payload: {
                rootId: nodes[0].id,
                conversationId: null,
                nodes,
                source: 'background-script'
              }
            };
          }
          if (nodes.length && !bestNodes) {
            bestNodes = nodes;
          }
          await sleep(400);
        }
        if (bestNodes && bestNodes.length) {
          bestNodes.forEach((node, idx) => { node.order = idx; });
          return {
            status: 'ok',
            payload: {
              rootId: bestNodes[0].id,
              conversationId: null,
              nodes: bestNodes,
              source: 'background-script'
            }
          };
        }
        return { status: 'error', error: 'NO_TWEETS_FOUND' };
      },
      args: [tweetId]
    });
    if (executed && executed.length && executed[0].result && executed[0].result.status === 'ok') {
      return executed[0].result.payload;
    }
  } catch (error) {
    console.warn('[Twitter] executeScript capture failed:', error);
  }
  
  return null;
}

async function handleTwitterBackgroundScrape(message) {
  const { url, tweetId, requestUrl } = message;
  if (!url) {
    return { status: 'error', error: 'MISSING_URL' };
  }
  
  const cacheKey = tweetId || url;
  const cached = twitterThreadCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < TWITTER_THREAD_TTL) {
    return { status: 'ok', payload: cached.payload };
  }
  
  let tab = null;
  try {
    const tabUrl = requestUrl || url;
    tab = await chrome.tabs.create({ url: tabUrl, active: false });
    if (!tab || typeof tab.id !== 'number') {
      throw new Error('TAB_CREATION_FAILED');
    }
    
    const tabId = tab.id;
    
    await waitForTabComplete(tabId, 18000);
    await delay(800);
    
    const payload = await captureTwitterThreadInTab(tabId, tweetId);
    
    if (payload && payload.nodes && payload.nodes.length) {
      console.log('[Twitter] Background capture nodes:', payload.nodes.length, 'source:', payload.source);
      twitterThreadCache.set(cacheKey, {
        payload,
        timestamp: Date.now()
      });
      return { status: 'ok', payload };
    }
    
    return { status: 'error', error: 'BACKGROUND_CAPTURE_FAILED' };
  } catch (error) {
    console.error('[Twitter] Background scrape failed:', error);
    return { status: 'error', error: error && error.message ? error.message : 'BACKGROUND_SCRAPE_FAILED' };
  } finally {
    if (tab && typeof tab.id === 'number') {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {
        // ignore
      }
    }
  }
}

// Handle content summarization
async function handleSummarizeContent(message, sender) {
  const { url, title, textContent, html } = message;
  const tabId = sender?.tab?.id ?? null;
  
  console.log('[Background] Summarize request for:', url);
  
  const existingPageJob = getJob(activePageJobId);
  
  if (existingPageJob && existingPageJob.url === url) {
    console.log('[Background] Already processing this URL, ignoring duplicate');
    return { status: 'duplicate' };
  }
  
  if (existingPageJob && existingPageJob.url !== url) {
    console.log('[Background] Canceling previous processing for different URL');
    abortJob(existingPageJob.id, 'replaced_by_new_page_request');
  }
  
  // Check cache
  const cacheKey = `${url}_${settings.apiChoice}_${settings.customPrompt}`;
  const cached = summaryCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    console.log('[Background] Returning cached summary');
    return {
      status: 'complete',
      title: title,
      summary: cached.summary,
      cached: true
    };
  }
  
  const job = createSummarizationJob({
    url,
    tabId,
    feature: 'page'
  });
  activePageJobId = job.id;
  
  // Notify displays that processing started
  broadcastProcessingStatus('started', title, job);
  
  try {
    const summary = await summarizeContent({ job, text: textContent, url });
    
    // Check if aborted
    if (job.signal.aborted) {
      console.log('[Background] Processing was aborted');
      return { status: 'aborted' };
    }
    
    // Cache the result
    summaryCache.set(cacheKey, {
      summary: summary,
      timestamp: Date.now()
    });
    
    console.log('[Background] Summarization complete and cached');
    
    return {
      status: 'complete',
      title: title,
      summary: summary,
      cached: false
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[Background] Summarization aborted for URL:', url);
      return { status: 'aborted' };
    }
    
    console.error('[Background] Summarization error:', error);
    return { status: 'error', error: error.message };
  } finally {
    finalizeJob(job.id);
  }
}

// Broadcast processing status
function broadcastProcessingStatus(status, title, job) {
  const message = {
    type: 'PROCESSING_STATUS',
    status: status,
    title: title,
    url: job ? job.url : null
  };
  
  // To side panel
  chrome.runtime.sendMessage(message).catch(() => {});
  
  // To content script
  if (job && typeof job.tabId === 'number') {
    chrome.tabs.sendMessage(job.tabId, message).catch(() => {});
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
  }
}

// ========================================
// REDDIT THREAD HELPERS
// ========================================

const REDDIT_COMMENT_LIMIT = 5;
const REDDIT_POST_CHAR_LIMIT = 1500;
const REDDIT_COMMENT_CHAR_LIMIT = 600;

function buildRedditApiUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    
    if (hostname === 'redd.it' || hostname.endsWith('.redd.it')) {
      const slug = parsed.pathname.replace(/\//g, '').trim();
      if (!slug) return null;
      const apiUrl = new URL(`/comments/${slug}.json`, 'https://www.reddit.com');
      apiUrl.searchParams.set('limit', '40');
      apiUrl.searchParams.set('depth', '2');
      apiUrl.searchParams.set('raw_json', '1');
      return { apiUrl: apiUrl.toString(), threadId: slug };
    }
    
    if (!hostname.endsWith('reddit.com')) {
      return null;
    }
    
    if (!/\/comments\/[a-z0-9]+/i.test(parsed.pathname)) {
      return null;
    }
    
    let normalizedPath = parsed.pathname;
    if (normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.slice(0, -1);
    }
    if (normalizedPath.endsWith('.json')) {
      normalizedPath = normalizedPath.slice(0, -5);
    }
    
    const apiUrl = new URL(`${normalizedPath}.json`, 'https://www.reddit.com');
    apiUrl.searchParams.set('limit', '40');
    apiUrl.searchParams.set('depth', '2');
    apiUrl.searchParams.set('raw_json', '1');
    
    const idMatch = normalizedPath.match(/\/comments\/([a-z0-9]+)/i);
    const threadId = idMatch ? idMatch[1] : null;
    
    return { apiUrl: apiUrl.toString(), threadId };
  } catch (error) {
    console.warn('[Reddit] Failed to build API url:', error);
    return null;
  }
}

function normalizeRedditText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .trim();
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

function extractRedditThread(json) {
  if (!Array.isArray(json) || json.length === 0) {
    return null;
  }
  
  const postListing = json[0]?.data?.children?.find(child => child.kind === 't3');
  if (!postListing || !postListing.data) {
    return null;
  }
  
  const postData = postListing.data;
  const selftext = truncateText(normalizeRedditText(postData.selftext || ''), REDDIT_POST_CHAR_LIMIT);
  const commentListing = Array.isArray(json[1]?.data?.children) ? json[1].data.children : [];
  const comments = selectTopComments(commentListing, REDDIT_COMMENT_LIMIT);
  
  return {
    title: postData.title || 'Untitled Reddit Post',
    subreddit: postData.subreddit || '',
    author: postData.author || '',
    score: postData.score || 0,
    selftext,
    isSelf: !!postData.is_self,
    postUrl: postData.url_overridden_by_dest || postData.url || '',
    commentCount: postData.num_comments || commentListing.length,
    comments
  };
}

function selectTopComments(children, limit) {
  const comments = [];
  
  for (const child of children) {
    if (!child || child.kind !== 't1' || !child.data) {
      continue;
    }
    const data = child.data;
    if (!data.body || data.body === '[deleted]' || data.body === '[removed]') {
      continue;
    }
    
    const body = truncateText(normalizeRedditText(data.body), REDDIT_COMMENT_CHAR_LIMIT);
    if (!body) {
      continue;
    }
    
    comments.push({
      author: data.author || 'unknown',
      score: typeof data.score === 'number' ? data.score : 0,
      body
    });
  }
  
  comments.sort((a, b) => (b.score || 0) - (a.score || 0));
  return comments.slice(0, limit);
}

function buildRedditSummaryInput(thread) {
  const sections = [];
  sections.push('Summarize the following Reddit thread, focusing on the main viewpoints, consensus, and disagreements voiced in the top community comments.');
  sections.push(`Thread title: ${thread.title}`);
  
  const metaParts = [];
  if (thread.subreddit) metaParts.push(`Subreddit: r/${thread.subreddit}`);
  if (thread.author) metaParts.push(`Author: u/${thread.author}`);
  metaParts.push(`Upvotes: ${thread.score}`);
  metaParts.push(`Comments analyzed: ${thread.comments.length}/${thread.commentCount}`);
  sections.push(metaParts.join(' | '));
  
  if (thread.selftext) {
    sections.push('Original post:');
    sections.push(thread.selftext);
  } else if (!thread.isSelf && thread.postUrl) {
    sections.push(`Original post links to: ${thread.postUrl}`);
  }
  
  if (thread.comments.length) {
    sections.push('Top community comments:');
    thread.comments.forEach((comment, index) => {
      sections.push(`${index + 1}. u/${comment.author} (${comment.score} upvotes)\n${comment.body}`);
    });
  } else {
    sections.push('Top community comments: None available.');
  }
  
  return sections.join('\n\n');
}

async function handleSummarizeRedditPost(message, sender) {
  const { url } = message;
  
  console.log('[Reddit] Summarize request for:', url);
  
  const apiInfo = buildRedditApiUrl(url);
  if (!apiInfo) {
    return {
      status: 'error',
      error: 'INVALID_REDDIT_URL',
      message: 'Not a Reddit post link.'
    };
  }
  
  let redditJson;
  try {
    const response = await fetch(apiInfo.apiUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    redditJson = await response.json();
  } catch (error) {
    console.error('[Reddit] Failed to fetch thread:', error);
    return {
      status: 'error',
      error: 'REDDIT_FETCH_FAILED',
      message: 'Could not retrieve Reddit thread data.'
    };
  }
  
  const thread = extractRedditThread(redditJson);
  if (!thread) {
    console.warn('[Reddit] No thread data extracted.');
    return {
      status: 'error',
      error: 'REDDIT_PARSE_FAILED',
      message: 'Unable to parse Reddit discussion.'
    };
  }
  
  console.log('[Reddit] Extracted', thread.comments.length, 'top comments for summarization');
  
  const summaryInput = buildRedditSummaryInput(thread);
  
  return await handleSummarizeContent({
    url: url,
    title: `Reddit: ${thread.title}`,
    textContent: summaryInput
  }, sender);
}

// ========================================
// YOUTUBE CAPTION HELPERS
// ========================================

/**
 * Parse caption data from various YouTube formats
 */
function parseCaptionData(data) {
  try {
    if (typeof data === 'string') {
      // Try JSON3 format first
      if (data.includes('"events"') || data.includes('"wireMagic"')) {
        const jsonData = JSON.parse(data);
        if (jsonData.events) {
          return jsonData.events
            .map(event => {
              if (event.segs) {
                const text = event.segs.map(seg => seg.utf8 || '').join('');
                return {
                  start: (event.tStartMs || 0) / 1000,
                  duration: (event.dDurationMs || 0) / 1000,
                  text: text
                };
              }
              return null;
            })
            .filter(Boolean);
        }
      }
      
      // Try XML format
      if (data.includes('<?xml') || data.includes('<transcript>')) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, 'text/xml');
        const texts = xmlDoc.getElementsByTagName('text');
        return Array.from(texts).map(node => ({
          start: parseFloat(node.getAttribute('start') || 0),
          duration: parseFloat(node.getAttribute('dur') || 0),
          text: node.textContent
        }));
      }
      
      // Try standard JSON
      if (data.trim().startsWith('[') || data.trim().startsWith('{')) {
        return JSON.parse(data);
      }
    }
    
    return data;
  } catch (error) {
    console.error('[YouTube] Error parsing caption data:', error);
    return null;
  }
}

/**
 * Convert caption array to plain text
 */
function captionsToText(captions) {
  if (!Array.isArray(captions)) return '';
  return captions
    .map(caption => caption.text || '')
    .filter(text => text.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchYouTubeDescription(videoId, url) {
  const fallbackUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let targetUrl = fallbackUrl;
  
  if (url) {
    try {
      const parsed = new URL(url, 'https://www.youtube.com');
      if (parsed.hostname.includes('youtube.com')) {
        targetUrl = parsed.href;
      }
    } catch (error) {
      // Ignore malformed URL, fallback to default
    }
  }
  
  console.log('[YouTube] Fetching description from:', targetUrl);
  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching description`);
  }
  const html = await response.text();
  const description = extractYouTubeDescriptionFromHtml(html);
  if (description) {
    console.log('[YouTube] Description fetched successfully. Length:', description.length);
  } else {
    console.warn('[YouTube] Description not found in fetched HTML.');
  }
  return description ? description.trim() : null;
}

function extractYouTubeDescriptionFromHtml(html) {
  if (!html) return null;
  
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;/s);
  if (playerMatch) {
    try {
      const data = JSON.parse(playerMatch[1]);
      const desc = data?.videoDetails?.shortDescription;
      if (desc && desc.trim()) {
        return desc.trim();
      }
    } catch (error) {
      console.warn('[YouTube] Failed to parse ytInitialPlayerResponse:', error);
    }
  }
  
  const metaMatch = html.match(/<meta\s+(?:itemprop|name|property)=["']description["']\s+content=["']([^"']*)["']/i);
  if (metaMatch && metaMatch[1]) {
    return decodeHtmlEntities(metaMatch[1]);
  }
  
  const ogMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i);
  if (ogMatch && ogMatch[1]) {
    return decodeHtmlEntities(ogMatch[1]);
  }
  
  return null;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/\u00a0/g, ' ');
}

function buildYouTubeSummarizationInput({ captionText, descriptionText, videoId }) {
  const MAX_TOTAL = 4000;
  const DESCRIPTION_LIMIT = 1000;
  const HEADER_OVERHEAD = 160;
  const MIN_CAPTION_LIMIT = 600;
  
  const metadata = {
    captionIncluded: !!captionText,
    descriptionIncluded: !!descriptionText,
    captionTruncated: false,
    descriptionTruncated: false,
    hardTruncated: false
  };
  
  const sections = [];
  sections.push(`Video ID: ${videoId}`);
  
  let descriptionSection = '';
  if (descriptionText && descriptionText.trim().length) {
    const normalizedDescription = normalizeWhitespace(descriptionText);
    if (normalizedDescription.length > DESCRIPTION_LIMIT) {
      descriptionSection = normalizedDescription.slice(0, DESCRIPTION_LIMIT - 1).trimEnd() + '…';
      metadata.descriptionTruncated = true;
    } else {
      descriptionSection = normalizedDescription;
    }
    sections.push('Description:\n' + descriptionSection);
  }
  
  let captionSection = '';
  if (captionText && captionText.trim().length) {
    const normalizedCaption = normalizeWhitespace(captionText);
    let captionLimit = MAX_TOTAL - HEADER_OVERHEAD - descriptionSection.length;
    captionLimit = Math.max(captionLimit, MIN_CAPTION_LIMIT);
    captionSection = clipTranscript(normalizedCaption, Math.min(captionLimit, MAX_TOTAL - HEADER_OVERHEAD));
    metadata.captionTruncated = normalizedCaption.length > captionSection.length;
    sections.push('Transcript:\n' + captionSection);
  }
  
  let combined = sections.join('\n\n').trim();
  if (combined.length > MAX_TOTAL) {
    if (captionSection) {
      const normalizedCaption = normalizeWhitespace(captionText);
      const available = MAX_TOTAL - (combined.length - captionSection.length) - HEADER_OVERHEAD;
      const nextLimit = Math.max(Math.min(available, captionSection.length), MIN_CAPTION_LIMIT);
      captionSection = clipTranscript(normalizedCaption, nextLimit);
      metadata.captionTruncated = true;
    }
    const newSections = [`Video ID: ${videoId}`];
    if (descriptionSection) {
      newSections.push('Description:\n' + descriptionSection);
    }
    if (captionSection) {
      newSections.push('Transcript:\n' + captionSection);
    }
    combined = newSections.join('\n\n').trim();
  }
  
  if (combined.length > MAX_TOTAL) {
    combined = combined.slice(0, MAX_TOTAL - 1).trimEnd() + '…';
    metadata.hardTruncated = true;
  }
  
  return {
    inputText: combined,
    metadata
  };
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipTranscript(text, limit) {
  if (!text) return '';
  if (text.length <= limit) {
    return text;
  }
  
  const partSize = Math.max(Math.floor(limit / 3), 200);
  const start = text.slice(0, partSize).trimEnd();
  const midStart = Math.max(Math.floor(text.length / 2 - partSize / 2), 0);
  const middle = text.slice(midStart, midStart + partSize).trim();
  const end = text.slice(-partSize).trimStart();
  
  let clipped = `${start}\n\n[...]\n\n${middle}\n\n[...]\n\n${end}`;
  if (clipped.length > limit) {
    clipped = clipped.slice(0, limit - 1).trimEnd() + '…';
  }
  return clipped;
}

/**
 * Handle YouTube caption summarization
 */
async function handleYouTubeSummary(videoId, url, tabId) {
  console.log('[YouTube] Handling summary request for:', videoId);
  
  const existingJobId = youtubeJobsByVideoId.get(videoId);
  const existingJob = existingJobId ? getJob(existingJobId) : null;
  if (existingJob) {
    console.log('[YouTube] Summary already in progress for:', videoId);
    return { status: 'streaming', videoId };
  }
  if (existingJobId && !existingJob) {
    youtubeJobsByVideoId.delete(videoId);
  }
  
  const activeJob = getJob(activeYouTubeJobId);
  if (activeJob && activeJob.metadata && activeJob.metadata.videoId && activeJob.metadata.videoId !== videoId) {
    console.log('[YouTube] Aborting previous video:', activeJob.metadata.videoId);
    abortJob(activeJob.id, 'youtube_video_switch');
  }
  
  const cachedSummary = youtubeSummaryCache.get(videoId);
  if (cachedSummary && (Date.now() - cachedSummary.timestamp) < CACHE_DURATION) {
    console.log('[YouTube] Returning cached summary');
    return {
      status: 'complete',
      cached: true,
      summary: cachedSummary.summary,
      videoId: videoId
    };
  }
  
  const job = createSummarizationJob({
    url,
    tabId,
    feature: 'youtube',
    metadata: { videoId }
  });
  activeYouTubeJobId = job.id;
  youtubeJobsByVideoId.set(videoId, job.id);
  const signal = job.signal;
  
  try {
    // Check if captions are cached
    let captionData = youtubeCaptionCache.get(videoId);
    let descriptionData = youtubeDescriptionCache.get(videoId);
    
    if (!descriptionData) {
      descriptionData = await fetchYouTubeDescription(videoId, url).catch((error) => {
        console.warn('[YouTube] Description fetch failed:', error?.message || error);
        return null;
      });
      if (descriptionData) {
        youtubeDescriptionCache.set(videoId, {
          description: descriptionData,
          timestamp: Date.now()
        });
      }
    } else {
      descriptionData = descriptionData.description;
    }
    
    if (!captionData) {
      console.log('[YouTube] Captions not in cache, requesting from bridge...');
      
      let targetTabId = tabId;
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tabs[0]) {
          throw new Error('No active tab found');
        }
        targetTabId = tabs[0].id;
      }
      
      const MAX_ATTEMPTS = 6;
      const RETRY_DELAY_MS = 500;
      
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !captionData; attempt++) {
        if (signal.aborted || !summarizationJobs.has(job.id)) {
          throw new DOMException('Aborted', 'AbortError');
        }
        
        try {
          const response = await chrome.tabs.sendMessage(targetTabId, {
            action: 'GET_YOUTUBE_CAPTIONS',
            videoId: videoId
          });
          
          if (response && response.success && response.data) {
            captionData = response.data;
            youtubeCaptionCache.set(videoId, {
              data: captionData,
              timestamp: captionData.timestamp || Date.now()
            });
            console.log('[YouTube] Captions received on attempt', attempt);
            break;
          }
          
          const error = response?.error || 'UNKNOWN_ERROR';
          console.log('[YouTube] Caption attempt', attempt, 'failed:', error);
          
          if (error !== 'NO_CAPTIONS' && error !== 'TIMEOUT') {
            throw new Error(error);
          }
        } catch (error) {
          if (error && error.message === 'NO_CAPTIONS') {
            console.log('[YouTube] Caption attempt', attempt, 'reported no captions yet.');
          } else if (error && error.message === 'No tab with id') {
            throw new Error('YouTube tab no longer available');
          } else {
            console.error('[YouTube] Error getting captions:', error);
            if (attempt === MAX_ATTEMPTS && !descriptionData) {
              return {
                status: 'error',
                error: 'NO_CAPTIONS',
                message: 'Could not retrieve captions for this video'
              };
            }
          }
        }
        
        if (!captionData && attempt < MAX_ATTEMPTS) {
          await delay(RETRY_DELAY_MS);
        }
      }
      
      if (!captionData) {
        console.warn('[YouTube] Failed to retrieve captions after retries');
        if (!descriptionData) {
          return {
            status: 'error',
            error: 'NO_CAPTIONS',
            message: 'Could not retrieve captions for this video'
          };
        }
      }
    } else {
      console.log('[YouTube] Using cached caption data');
      captionData = captionData.data;
    }
    
    const captionArray = captionData?.captions || [];
    const captionText = captionData?.text || captionsToText(captionArray);
    const descriptionText = descriptionData || '';
    
    if ((!captionText || captionText.length < 10) && (!descriptionText || descriptionText.length < 20)) {
      return {
        status: 'error',
        error: 'NO_CAPTIONS',
        message: 'No captions or description available for this video'
      };
    }
    
    console.log('[YouTube] Caption count:', captionArray.length);
    console.log('[YouTube] Caption text length:', captionText ? captionText.length : 0);
    console.log('[YouTube] Description length:', descriptionText ? descriptionText.length : 0);
    
    const { inputText: summarizationInput, metadata: summarizationMetadata } = buildYouTubeSummarizationInput({
      captionText,
      descriptionText,
      videoId
    });
    if (!summarizationInput || summarizationInput.length < 20) {
      return {
        status: 'error',
        error: 'NO_CAPTIONS',
        message: 'Not enough content to summarize'
      };
    }
    const previewSource = captionText && captionText.length ? captionText : descriptionText || '';
    console.log('[YouTube] Summarization input preview source:', previewSource.slice(0, 120));
    if (YOUTUBE_DEBUG_LOG_FULL_INPUT) {
      console.log('[YouTube] Summarization full input:', summarizationInput);
    } else {
      console.log('[YouTube] Summarization input sample (first 500 chars):', summarizationInput.slice(0, 500));
    }
    console.log('[YouTube] Summarization compression metadata:', summarizationMetadata);
    
    try {
      const summary = await summarizeContent({ job, text: summarizationInput, url });
      
      youtubeSummaryCache.set(videoId, {
        summary: summary,
        timestamp: Date.now()
      });
      
      console.log('[YouTube] Summary generated successfully. Length:', summary ? summary.length : 0);
      
      return {
        status: 'complete',
        cached: false,
        summary: summary,
        videoId: videoId,
        captionCount: captionArray.length,
        compression: summarizationMetadata,
        debugInputSnippet: summarizationInput.slice(0, 500),
        ...(YOUTUBE_DEBUG_LOG_FULL_INPUT ? { debugFullInput: summarizationInput } : {})
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          status: 'aborted',
          message: 'Summary cancelled (switched to different video)'
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('[YouTube] Error generating summary:', error);
    return {
      status: 'error',
      error: 'SUMMARY_FAILED',
      message: error.message
    };
  } finally {
    finalizeJob(job.id);
  }
}

// ========================================
// MESSAGE HANDLERS
// ========================================

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_TWITTER_THREAD') {
    handleTwitterBackgroundScrape(message)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('[Twitter] Background scrape handler error:', error);
        sendResponse({ status: 'error', error: error && error.message ? error.message : 'BACKGROUND_SCRAPE_FAILED' });
      });
    return true;
  }
  
  
  // Handle content summarization request
  if (message.type === 'SUMMARIZE_CONTENT') {
    handleSummarizeContent(message, sender)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.type === 'SUMMARIZE_REDDIT_POST') {
    handleSummarizeRedditPost(message, sender)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('[Reddit] Handler failure:', error);
        sendResponse({
          status: 'error',
          error: error?.message || 'Reddit summarization failed.'
        });
      });
    return true;
  }
  
  // Handle get API status
  if (message.type === 'GET_API_STATUS') {
    apiInitializationPromise.finally(() => {
      sendResponse({
        summarizer: SummarizerAPI.summarizer.status,
        promptAPI: SummarizerAPI.promptAPI.status
      });
    });
    return true;
  }
  
  // Handle get settings
  if (message.type === 'GET_SETTINGS') {
    sendResponse(settings);
    return true;
  }
  
  // Handle HTML fetch
  if (message.type === 'FETCH_CONTENT') {
    const url = message.url;
    
    // Check cache first
    if (htmlCache[url]) {
      sendResponse({ cached: true, html: htmlCache[url], url: url });
      return true;
    }
    
    // Fetch HTML
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
      })
      .then(html => {
        htmlCache[url] = html;
        sendResponse({ cached: false, html: html, url: url });
      })
      .catch(error => {
        sendResponse({ error: error.message, url: url });
      });
    
    return true; // Keep channel open for async response
  }
  
  // Handle YouTube caption fetch (for testing and production)
  if (message.action === 'FETCH_YOUTUBE_CAPTIONS') {
    const url = message.url;
    
    console.log('[Background] Fetching YouTube captions:', url);
    
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
      })
      .then(data => {
        console.log('[Background] Successfully fetched captions, length:', data.length);
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        console.error('[Background] Failed to fetch captions:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep channel open for async response
  }
  
  // Handle YouTube summary abort request
  if (message.action === 'ABORT_YOUTUBE_SUMMARY') {
    console.log('[Background] 🔴 ABORT MESSAGE RECEIVED!');
    console.log('[Background] Abort details:', {
      oldVideoId: message.videoId,
      newVideoId: message.newVideoId
    });
    
    const videoId = message.videoId;
    let targetJobId = null;
    
    if (videoId && youtubeJobsByVideoId.has(videoId)) {
      targetJobId = youtubeJobsByVideoId.get(videoId);
    } else if (activeYouTubeJobId) {
      targetJobId = activeYouTubeJobId;
    }
    
    const job = targetJobId ? getJob(targetJobId) : null;
    
    if (job) {
      abortJob(job.id, 'content_abort_request');
      sendResponse({ status: 'aborted', message: 'YouTube summary aborted' });
    } else {
      sendResponse({ status: 'idle', message: 'No active YouTube summary' });
    }
    
    return true; // Keep channel open
  }
  
  // Handle YouTube summary request
  if (message.action === 'GET_YOUTUBE_SUMMARY') {
    const videoId = message.videoId;
    const url = message.url;
    const tabId = sender?.tab?.id || message.tabId || null;
    
    console.log('[Background] YouTube summary requested for:', videoId);
    
    handleYouTubeSummary(videoId, url, tabId)
      .then(result => {
        console.log('[Background] YouTube summary result:', result.status);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[Background] YouTube summary error:', error);
        sendResponse({
          status: 'error',
          error: 'PROCESSING_ERROR',
          message: error.message
        });
      });
    
    return true; // Keep channel open for async response
  }

  // Relay gaze status to sidepanel
  if (message.type === 'GAZE_STATUS') {
    // Forward to all extension views (including sidepanel)
    chrome.runtime.sendMessage({
      type: 'GAZE_STATUS',
      phase: message.phase,
      note: message.note
    }).catch(() => {
      // Ignore errors if no receivers
    });
  }

  // ========================================
  // VOICE INTERACTION MESSAGES
  // ========================================

  if (message.type === 'VOICE_GET_STATE') {
    sendResponse({
      state: voiceState,
      settings: voiceSettings,
      lastTranscript,
      lastCommandResult,
      candidates: pendingTabCandidates
    });
    return true;
  }

  if (message.type === 'VOICE_UPDATE_SETTINGS') {
    chrome.storage.local.set(message.settings || {}, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'VOICE_GESTURE_TRIGGER') {
    handleVoiceGestureTrigger();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'VOICE_GESTURE_COPY_SYNC') {
    if (message.text) {
      extensionClipboard = message.text;
      if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.set({ extensionClipboard: message.text }).catch(() => {});
      }
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'VOICE_GET_CLIPBOARD_FALLBACK') {
    sendResponse({ text: extensionClipboard });
    return true;
  }

  if (message.type === 'VOICE_FINAL_TRANSCRIPT') {
    handleVoiceFinalTranscript(message.transcript);
    sendResponse({ received: true });
    return true;
  }

  if (message.type === 'VOICE_INTERIM_TRANSCRIPT') {
    // Relay interim text strictly to sidepanel for preview (never insert into DOM)
    chrome.runtime.sendMessage({
      type: 'VOICE_INTERIM_TRANSCRIPT',
      transcript: message.transcript
    }).catch(() => {});
    return false;
  }

  if (message.type === 'VOICE_AUDIO_STATUS') {
    if (message.status === 'error') {
      setVoiceState('error', { error: message.error, message: message.error });
    }
    return false;
  }

  if (message.type === 'VOICE_OFFSCREEN_READY') {
    console.log('[Background] Voice offscreen ready event confirmed');
    sendResponse({ ready: true });
    return true;
  }

  if (message.type === 'TEST_MICROPHONE') {
    testMicrophone().then(result => sendResponse(result));
    return true;
  }

  if (message.type === 'VOICE_SELECT_TAB_CANDIDATE') {
    if (message.tabId) {
      chrome.tabs.update(message.tabId, { active: true }).then(() => {
        pendingTabCandidates = [];
        lastCommandResult = { command: 'select candidate', success: true, message: 'Switched to selected tab.' };
        setVoiceState('idle', { message: 'Switched to selected tab.' });
        sendResponse({ success: true });
      }).catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  }

  if (message.type === 'VOICE_CONFIRM_CLOSE_TAB') {
    if (pendingCloseConfirmation) {
      const tabId = pendingCloseConfirmation.tabId;
      pendingCloseConfirmation = null;
      chrome.tabs.remove(tabId).then(() => {
        lastCommandResult = { command: 'confirm close', success: true, message: 'Tab closed successfully.' };
        setVoiceState('idle', { message: 'Tab closed.' });
        sendResponse({ success: true });
      }).catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  }

  if (message.type === 'VOICE_ARM_MANUALLY') {
    armVoiceCommands('Manual activation');
    sendResponse({ armed: true });
    return true;
  }
});

// ========================================
// VOICE SUBSYSTEM (OFFSCREEN ENGINE & COMMAND DISPATCHER)
// ========================================

const OFFSCREEN_DOCUMENT_PATH = 'voice/offscreen.html';

// Single source of truth for voice state:
// 'disabled' | 'idle' | 'armed' | 'dictating' | 'processing-command' | 'error'
let voiceState = 'disabled';
let lastTranscript = '';
let lastHeard = '';
let lastIntent = '';
let lastCommandResult = null;
let pendingTabCandidates = [];
let pendingCloseConfirmation = null;
let pendingCutConfirmation = null;
let extensionClipboard = '';
let lastUtteranceText = '';
let lastUtteranceTimestamp = 0;
const ROLLING_WINDOW_MS = 3500;
let voiceCommandTimer = null;

// Initialize session clipboard fallback
try {
  if (chrome.storage && chrome.storage.session) {
    chrome.storage.session.get(['extensionClipboard']).then(res => {
      if (res && res.extensionClipboard) {
        extensionClipboard = res.extensionClipboard;
      }
    }).catch(() => {});
  }
} catch (e) {}

function isBrowserInternalUrl(url) {
  if (!url || typeof url !== 'string') return true;
  return url.startsWith('chrome://') ||
         url.startsWith('chrome-extension://') ||
         url.startsWith('edge://') ||
         url.startsWith('about:') ||
         url.startsWith('devtools://') ||
         url.startsWith('view-source:');
}

function getVoiceState() {
  return voiceState;
}

function broadcastVoiceState(meta = {}) {
  const payload = {
    type: 'VOICE_STATE_CHANGED',
    state: voiceState,
    lastTranscript,
    lastHeard,
    lastIntent,
    lastCommandResult,
    candidates: pendingTabCandidates,
    timestamp: Date.now(),
    ...meta
  };

  // Broadcast to all extension views (sidepanel, popup, etc.)
  chrome.runtime.sendMessage(payload).catch(() => {});

  // Broadcast to active tab in current focused window
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, payload).catch(() => {});
    }
  });
}

function setVoiceState(newState, meta = {}) {
  const previousState = voiceState;
  voiceState = newState;
  console.log(`[VoiceBackground] Voice state: ${previousState} -> ${newState}`, meta);
  broadcastVoiceState({ previousState, ...meta });
}

async function hasOffscreenDocument() {
  if (chrome.offscreen && 'hasDocument' in chrome.offscreen) {
    return await chrome.offscreen.hasDocument();
  }
  const matchedClients = await clients.matchAll();
  return matchedClients.some(c => c.url.includes(OFFSCREEN_DOCUMENT_PATH));
}

let creatingOffscreenPromise = null;
async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return true;
  }
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return true;
  }
  creatingOffscreenPromise = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Speech recognition and audio transcription for hands-free voice interaction.'
      });
      console.log('[VoiceBackground] Offscreen document created');
    } catch (err) {
      if (!err.message.includes('Only a single offscreen document may be created')) {
        console.error('[VoiceBackground] Failed to create offscreen document:', err);
        throw err;
      }
    }
  })();
  try {
    await creatingOffscreenPromise;
  } finally {
    creatingOffscreenPromise = null;
  }
  return true;
}

async function closeOffscreenDocument() {
  try {
    if (await hasOffscreenDocument()) {
      await chrome.offscreen.closeDocument();
      console.log('[VoiceBackground] Offscreen document closed');
    }
  } catch (e) {
    console.warn('[VoiceBackground] Error closing offscreen document:', e);
  }
}

async function startVoiceSubsystem() {
  if (!voiceSettings.voiceEnabled) {
    setVoiceState('disabled');
    return;
  }

  try {
    await ensureOffscreenDocument();
    
    // Give document brief moment to initialize handlers
    await new Promise(r => setTimeout(r, 120));

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'START_OFFSCREEN_STT',
      config: {
        provider: voiceSettings.voiceProvider,
        language: voiceSettings.voiceLanguage,
        backendUrl: voiceSettings.voiceBackendUrl,
        localEndpoint: voiceSettings.voiceLocalWhisperUrl
      }
    }).catch(err => ({ success: false, error: err.message }));

    if (response && response.success === false) {
      setVoiceState('error', { error: response.error, message: response.error });
    } else {
      setVoiceState('idle', { message: `Voice engine active. Say "${voiceSettings.voiceWakePhrase}"` });
    }
  } catch (err) {
    console.error('[VoiceBackground] startVoiceSubsystem error:', err);
    setVoiceState('error', { error: err.message, message: 'Failed to start voice engine: ' + err.message });
  }
}

async function stopVoiceSubsystem() {
  clearTimeout(voiceCommandTimer);
  pendingCloseConfirmation = null;
  pendingCutConfirmation = null;
  pendingTabCandidates = [];

  try {
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'STOP_OFFSCREEN_STT'
    }).catch(() => {});
  } catch (e) {}

  await closeOffscreenDocument();
  setVoiceState('disabled', { message: 'Voice interaction disabled.' });
}

function armVoiceCommands(reason = 'Listening for command') {
  if (!voiceSettings.voiceEnabled || !voiceSettings.voiceCommandsEnabled) {
    return;
  }

  clearTimeout(voiceCommandTimer);
  setVoiceState('armed', { message: `${reason}... (Listening for 5s)` });

  const timeoutMs = Number(voiceSettings.voiceCommandTimeoutMs) || 5000;
  voiceCommandTimer = setTimeout(() => {
    if (voiceState === 'armed') {
      if (pendingCloseConfirmation) {
        pendingCloseConfirmation = null;
      }
      if (pendingCutConfirmation) {
        pendingCutConfirmation = null;
      }
      setVoiceState('idle', { message: 'Command timed out.', lastIntent: 'Timed Out' });
    }
  }, timeoutMs);
}

function handleVoiceGestureTrigger() {
  console.log('[VoiceBackground] Gesture trigger requested from gaze subsystem');
  if (!voiceSettings.voiceEnabled || !voiceSettings.voiceCommandsEnabled) {
    return;
  }
  if (voiceSettings.voiceGestureEnabled && voiceState === 'idle') {
    armVoiceCommands('Mouth gesture detected');
  }
}

async function handleVoiceFinalTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string') return;
  lastHeard = transcript.trim();
  lastTranscript = lastHeard;

  if (voiceState === 'disabled') {
    return;
  }

  const parser = self.SANCHALAN_COMMANDS || {
    normalizeVoiceTranscript: (t) => (t || '').toLowerCase().trim(),
    extractWakePhrase: (t, w) => ({
      hasWakePhrase: (t || '').toLowerCase().includes((w || 'sanchalan').toLowerCase()),
      remainder: (t || '').toLowerCase().replace((w || 'sanchalan').toLowerCase(), '').trim()
    }),
    isStopDictationIntent: (t) => /^(stop\s+dictation|stop\s+typing|end\s+dictation)$/i.test((t || '').trim()),
    parseVoiceCommand: (t) => ({ type: 'UNKNOWN', query: t, raw: t }),
    formatSpokenPunctuation: (t) => t,
    rankTabMatches: () => ({ matches: [], isAmbiguous: false, confidentMatch: null })
  };

  const now = Date.now();

  // State: DICTATING
  // Important: Recognize stop intents while in dictating state even if wake word is omitted!
  if (voiceState === 'dictating') {
    if (parser.isStopDictationIntent(transcript)) {
      lastIntent = 'Stop Dictation';
      lastCommandResult = { command: 'stop dictation', success: true, message: 'Dictation stopped.' };
      setVoiceState('idle', { message: 'Dictation stopped.', lastHeard, lastIntent });
      return;
    }

    if (!voiceSettings.voiceTypingEnabled) {
      setVoiceState('idle', { message: 'Voice typing is disabled in settings.', lastHeard, lastIntent: 'Disabled' });
      return;
    }

    // Still dictating: format spoken punctuation and insert into active tab
    lastIntent = 'Dictating text';
    const formatted = parser.formatSpokenPunctuation(transcript);
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) {
        if (isBrowserInternalUrl(tab.url)) {
          broadcastVoiceState({
            state: 'dictating',
            message: 'Cannot type into browser system pages. Focus a web page.'
          });
          return;
        }

        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'VOICE_INSERT_TEXT',
          text: formatted,
          raw: transcript
        }).catch(() => null);

        if (!response || response.focused === false) {
          broadcastVoiceState({
            state: 'dictating',
            message: 'No editable field focused. Transcript shown in side panel.'
          });
        }
      }
    } catch (e) {
      console.warn('[VoiceBackground] Dictation insert error:', e);
    }
    return;
  }

  // Rolling transcript window for split recognition e.g. "sanchalan" followed by "stop dictation" or a command
  let utteranceToProcess = transcript;
  if (lastUtteranceText && (now - lastUtteranceTimestamp) < ROLLING_WINDOW_MS) {
    if (lastUtteranceText === 'sanchalan' && !transcript.toLowerCase().includes('sanchalan')) {
      utteranceToProcess = `sanchalan ${transcript}`;
    }
  }

  // State: ARMED (Waiting for command)
  if (voiceState === 'armed') {
    clearTimeout(voiceCommandTimer);

    const { hasWakePhrase, remainder } = parser.extractWakePhrase(utteranceToProcess, voiceSettings.voiceWakePhrase);
    const commandText = hasWakePhrase && remainder ? remainder : (hasWakePhrase ? '' : utteranceToProcess);
    const parsedCmd = parser.parseVoiceCommand(commandText || utteranceToProcess);

    if (parsedCmd && parsedCmd.type === 'STOP_LISTENING') {
      pendingCloseConfirmation = null;
      pendingCutConfirmation = null;
      lastIntent = 'Cancel';
      setVoiceState('idle', { message: 'Listening cancelled.', lastHeard, lastIntent });
      return;
    }

    // Confirmation check for tab closing
    if (pendingCloseConfirmation) {
      if (parsedCmd && parsedCmd.type === 'CONFIRM_CLOSE_TAB') {
        const targetId = pendingCloseConfirmation.tabId;
        pendingCloseConfirmation = null;
        lastIntent = 'Confirm Close Tab';
        setVoiceState('processing-command');
        try {
          await chrome.tabs.remove(targetId);
          lastCommandResult = { command: 'close current tab', success: true, message: 'Tab closed successfully.' };
        } catch (err) {
          lastCommandResult = { command: 'close current tab', success: false, message: 'Failed to close tab: ' + err.message };
        }
        setVoiceState('idle', { message: lastCommandResult.message, lastHeard, lastIntent });
        return;
      } else {
        pendingCloseConfirmation = null;
        lastIntent = 'Cancel Close';
        setVoiceState('idle', { message: 'Tab close cancelled.', lastHeard, lastIntent });
        return;
      }
    }

    // Confirmation check for cutting text
    if (pendingCutConfirmation) {
      if (parsedCmd && parsedCmd.type === 'CONFIRM_CUT') {
        const targetId = pendingCutConfirmation.tabId;
        pendingCutConfirmation = null;
        lastIntent = 'Confirm Cut';
        setVoiceState('processing-command');
        await executeVoiceCommand(parsedCmd, commandText || utteranceToProcess, targetId);
        return;
      } else {
        pendingCutConfirmation = null;
        lastIntent = 'Cancel Cut';
        setVoiceState('idle', { message: 'Cut action cancelled.', lastHeard, lastIntent });
        return;
      }
    }

    // Process single final command
    setVoiceState('processing-command');
    await executeVoiceCommand(parsedCmd, commandText || utteranceToProcess);
    return;
  }

  // State: IDLE
  if (voiceState === 'idle') {
    if (!voiceSettings.voiceCommandsEnabled) {
      return;
    }

    const { hasWakePhrase, remainder } = parser.extractWakePhrase(utteranceToProcess, voiceSettings.voiceWakePhrase);

    if (hasWakePhrase) {
      if (remainder && remainder.length > 0) {
        // Combined utterance e.g. "sanchalan switch to tab github"
        lastUtteranceText = '';
        lastUtteranceTimestamp = 0;
        const parsedCmd = parser.parseVoiceCommand(remainder);
        setVoiceState('processing-command');
        await executeVoiceCommand(parsedCmd, remainder);
      } else {
        // Lone wake word recognized e.g. "sanchalan"
        lastUtteranceText = 'sanchalan';
        lastUtteranceTimestamp = now;
        lastIntent = 'Wake Word Recognized';
        armVoiceCommands('Wake phrase recognized');
      }
    } else {
      lastUtteranceText = parser.normalizeVoiceTranscript(transcript);
      lastUtteranceTimestamp = now;
      lastIntent = 'Unrecognized / Missing Wake Phrase';
      broadcastVoiceState({ lastHeard, lastIntent });
    }
  }
}

async function executeVoiceCommand(cmd, rawText, tabIdOverride = null) {
  const parser = self.SANCHALAN_COMMANDS;
  const intentStr = cmd ? cmd.intent : rawText;
  lastIntent = intentStr;
  console.log('[VoiceBackground] Executing command:', intentStr);
  let result = { command: rawText, success: false, message: '' };

  try {
    switch (cmd ? cmd.type : 'UNKNOWN') {
      case 'NEXT_TAB': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        if (tabs && tabs.length > 1) {
          const activeIndex = tabs.findIndex(t => t.active);
          const nextIndex = (activeIndex + 1) % tabs.length;
          await chrome.tabs.update(tabs[nextIndex].id, { active: true });
          result = { command: 'next tab', success: true, message: `Switched to tab ${nextIndex + 1}: "${tabs[nextIndex].title || 'Tab'}"` };
        } else {
          result = { command: 'next tab', success: false, message: 'Only one tab open in current window.' };
        }
        break;
      }

      case 'PREV_TAB': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        if (tabs && tabs.length > 1) {
          const activeIndex = tabs.findIndex(t => t.active);
          const prevIndex = (activeIndex - 1 + tabs.length) % tabs.length;
          await chrome.tabs.update(tabs[prevIndex].id, { active: true });
          result = { command: 'previous tab', success: true, message: `Switched to tab ${prevIndex + 1}: "${tabs[prevIndex].title || 'Tab'}"` };
        } else {
          result = { command: 'previous tab', success: false, message: 'Only one tab open in current window.' };
        }
        break;
      }

      case 'SWITCH_TAB_INDEX': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const targetIndex = cmd.tabIndex;
        if (targetIndex >= 1 && targetIndex <= tabs.length) {
          await chrome.tabs.update(tabs[targetIndex - 1].id, { active: true });
          result = { command: `switch to tab ${targetIndex}`, success: true, message: `Switched to tab ${targetIndex}: "${tabs[targetIndex - 1].title || 'Tab'}"` };
        } else {
          result = { command: `switch to tab ${targetIndex}`, success: false, message: `Tab number ${targetIndex} is out of range (1 to ${tabs.length}).` };
        }
        break;
      }

      case 'SWITCH_TAB_TITLE': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const query = cmd.query || '';
        const rankResult = parser && parser.rankTabMatches
          ? parser.rankTabMatches(tabs, query)
          : { matches: [], isAmbiguous: false, confidentMatch: null };

        if (rankResult.confidentMatch) {
          await chrome.tabs.update(rankResult.confidentMatch.id, { active: true });
          pendingTabCandidates = [];
          result = { command: `switch to tab "${query}"`, success: true, message: `Switched to "${rankResult.confidentMatch.title}"` };
        } else if (rankResult.isAmbiguous && rankResult.matches.length > 0) {
          pendingTabCandidates = rankResult.matches.slice(0, 5).map((m, idx) => ({
            number: idx + 1,
            id: m.id,
            title: m.title || 'Untitled Tab',
            domain: m.domain || 'browser',
            url: m.url || '',
            query: query
          }));
          result = {
            command: `switch to tab "${query}"`,
            success: true,
            isAmbiguous: true,
            message: `Found ${pendingTabCandidates.length} matching tabs. Say "sanchalan choose 1" through "choose ${pendingTabCandidates.length}" or click in side panel.`
          };
        } else {
          pendingTabCandidates = [];
          result = { command: `switch to tab "${query}"`, success: false, message: `No tab found matching "${query}".` };
        }
        break;
      }

      case 'CHOOSE_CANDIDATE': {
        const idx = cmd.index;
        if (pendingTabCandidates && pendingTabCandidates.length > 0 && idx >= 1 && idx <= pendingTabCandidates.length) {
          const chosen = pendingTabCandidates[idx - 1];
          await chrome.tabs.update(chosen.id, { active: true });
          pendingTabCandidates = [];
          result = { command: `choose ${idx}`, success: true, message: `Switched to "${chosen.title}"` };
        } else {
          result = { command: `choose ${idx}`, success: false, message: `Choice #${idx} is not in the candidate list.` };
        }
        break;
      }

      case 'OPEN_YOUTUBE': {
        await chrome.tabs.create({ url: 'https://www.youtube.com/' });
        result = { command: 'open youtube', success: true, message: 'Opened YouTube.' };
        break;
      }

      case 'SEARCH_YOUTUBE': {
        const query = (cmd.query || '').trim();
        if (!query) {
          result = {
            command: 'search youtube',
            success: false,
            message: 'Please specify what to search on YouTube. Example: "search in youtube lo-fi music".'
          };
        } else {
          const targetUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
          const tabs = await chrome.tabs.query({ currentWindow: true });
          let ytTab = tabs.find(t => t.active && t.url && t.url.includes('youtube.com'));
          if (!ytTab) {
            ytTab = tabs.find(t => t.url && t.url.includes('youtube.com'));
          }

          if (ytTab) {
            await chrome.tabs.update(ytTab.id, { url: targetUrl, active: true });
          } else {
            await chrome.tabs.create({ url: targetUrl, active: true });
          }
          result = { command: `search youtube for "${query}"`, success: true, message: `Searching YouTube for "${query}".` };
        }
        break;
      }

      case 'CLOSE_TAB_REQUEST': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          pendingCloseConfirmation = { tabId: activeTab.id, expiresAt: Date.now() + (voiceSettings.voiceCommandTimeoutMs || 5000) };
          armVoiceCommands(`Close "${activeTab.title || 'Tab'}"? Say "confirm close" or "cancel"`);
          lastCommandResult = { command: 'close current tab', success: true, message: `Close current tab? Say "confirm close" or "cancel".` };
          return;
        } else {
          result = { command: 'close current tab', success: false, message: 'No active tab found.' };
        }
        break;
      }

      case 'NEW_TAB': {
        await chrome.tabs.create({});
        result = { command: 'new tab', success: true, message: 'Opened new tab.' };
        break;
      }

      case 'RELOAD_TAB': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          await chrome.tabs.reload(activeTab.id);
          result = { command: 'reload tab', success: true, message: 'Reloaded current tab.' };
        } else {
          result = { command: 'reload tab', success: false, message: 'No active tab to reload.' };
        }
        break;
      }

      case 'GO_BACK': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          if (isBrowserInternalUrl(activeTab.url)) {
            result = { command: 'go back', success: false, message: 'Cannot navigate back on browser system pages.' };
          } else {
            await chrome.tabs.sendMessage(activeTab.id, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'back' }).catch(() => {});
            result = { command: 'go back', success: true, message: 'Navigated back in tab history.' };
          }
        }
        break;
      }

      case 'GO_FORWARD': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          if (isBrowserInternalUrl(activeTab.url)) {
            result = { command: 'go forward', success: false, message: 'Cannot navigate forward on browser system pages.' };
          } else {
            await chrome.tabs.sendMessage(activeTab.id, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'forward' }).catch(() => {});
            result = { command: 'go forward', success: true, message: 'Navigated forward in tab history.' };
          }
        }
        break;
      }

      case 'COPY_SELECTION': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isBrowserInternalUrl(activeTab.url)) {
          result = { command: 'copy', success: false, message: 'Cannot copy on browser system pages.' };
        } else {
          const res = await chrome.tabs.sendMessage(activeTab.id, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'copy' }).catch(() => null);
          if (res && res.success && res.text) {
            extensionClipboard = res.text;
            if (chrome.storage && chrome.storage.session) {
              chrome.storage.session.set({ extensionClipboard: res.text }).catch(() => {});
            }
            result = { command: 'copy', success: true, message: `Copied "${res.text.slice(0, 30)}${res.text.length > 30 ? '...' : ''}"` };
          } else {
            result = { command: 'copy', success: false, message: res?.error || 'Select text first.' };
          }
        }
        break;
      }

      case 'CUT_SELECTION_REQUEST': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isBrowserInternalUrl(activeTab.url)) {
          result = { command: 'cut', success: false, message: 'Cannot cut text on browser system pages.' };
        } else {
          const checkRes = await chrome.tabs.sendMessage(activeTab.id, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'cut_check' }).catch(() => null);
          if (checkRes && checkRes.success) {
            pendingCutConfirmation = { tabId: activeTab.id, expiresAt: Date.now() + (voiceSettings.voiceCommandTimeoutMs || 5000) };
            armVoiceCommands('Cut selected text? Say "confirm cut" or "cancel"');
            lastCommandResult = { command: 'cut selected text', success: true, message: 'Cut selected text? Say "confirm cut" or "cancel".' };
            return;
          } else {
            result = { command: 'cut', success: false, message: checkRes?.error || 'Select text in an editable field first.' };
          }
        }
        break;
      }

      case 'CONFIRM_CUT': {
        const targetId = tabIdOverride || (pendingCutConfirmation ? pendingCutConfirmation.tabId : null);
        if (targetId) {
          pendingCutConfirmation = null;
          const execRes = await chrome.tabs.sendMessage(targetId, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'cut_execute' }).catch(() => null);
          if (execRes && execRes.success) {
            if (execRes.text) {
              extensionClipboard = execRes.text;
              if (chrome.storage && chrome.storage.session) {
                chrome.storage.session.set({ extensionClipboard: execRes.text }).catch(() => {});
              }
            }
            result = { command: 'cut selected text', success: true, message: 'Cut selected text to clipboard.' };
          } else {
            result = { command: 'cut selected text', success: false, message: execRes?.error || 'Failed to cut selection.' };
          }
        } else {
          result = { command: 'confirm cut', success: false, message: 'No cut action pending confirmation.' };
        }
        break;
      }

      case 'PASTE_TEXT': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isBrowserInternalUrl(activeTab.url)) {
          result = { command: 'paste', success: false, message: 'Cannot paste on browser system pages.' };
        } else {
          const res = await chrome.tabs.sendMessage(activeTab.id, {
            type: 'VOICE_EXECUTE_DOM_ACTION',
            action: 'paste',
            fallbackText: extensionClipboard
          }).catch(() => null);

          if (res && res.success) {
            result = { command: 'paste', success: true, message: 'Pasted text into active field.' };
          } else {
            result = { command: 'paste', success: false, message: res?.error || 'Focus a text field first.' };
          }
        }
        break;
      }

      case 'SELECT_ALL': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isBrowserInternalUrl(activeTab.url)) {
          result = { command: 'select all', success: false, message: 'Cannot select on browser system pages.' };
        } else {
          await chrome.tabs.sendMessage(activeTab.id, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'select_all' }).catch(() => {});
          result = { command: 'select all', success: true, message: 'Selected all text.' };
        }
        break;
      }

      case 'UNDO': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isBrowserInternalUrl(activeTab.url)) {
          result = { command: 'undo', success: false, message: 'Cannot undo on browser system pages.' };
        } else {
          await chrome.tabs.sendMessage(activeTab.id, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'undo' }).catch(() => {});
          result = { command: 'undo', success: true, message: 'Undo executed.' };
        }
        break;
      }

      case 'REDO': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isBrowserInternalUrl(activeTab.url)) {
          result = { command: 'redo', success: false, message: 'Cannot redo on browser system pages.' };
        } else {
          await chrome.tabs.sendMessage(activeTab.id, { type: 'VOICE_EXECUTE_DOM_ACTION', action: 'redo' }).catch(() => {});
          result = { command: 'redo', success: true, message: 'Redo executed.' };
        }
        break;
      }

      case 'START_DICTATION': {
        if (!voiceSettings.voiceTypingEnabled) {
          result = { command: 'start dictation', success: false, message: 'Voice typing is disabled in settings.' };
          setVoiceState('idle', { message: result.message, lastHeard, lastIntent });
          lastCommandResult = result;
          return;
        }
        result = { command: 'start dictation', success: true, message: 'Dictation started. Speak into active field. Say "stop dictation" to finish.' };
        lastCommandResult = result;
        setVoiceState('dictating', { message: result.message, lastHeard, lastIntent });
        return;
      }

      case 'STOP_DICTATION': {
        result = { command: 'stop dictation', success: true, message: 'Dictation stopped.' };
        setVoiceState('idle', { message: result.message, lastHeard, lastIntent });
        lastCommandResult = result;
        return;
      }

      case 'STOP_LISTENING': {
        result = { command: 'stop listening', success: true, message: 'Listening stopped.' };
        setVoiceState('idle', { message: result.message, lastHeard, lastIntent });
        lastCommandResult = result;
        return;
      }

      case 'UNKNOWN':
      default: {
        result = {
          command: rawText,
          success: false,
          message: `Unknown command "${rawText}". Available commands: next tab, previous tab, switch to tab <num/title>, choose <1-5>, open youtube, search youtube for <query>, copy, cut, paste, select all, undo, redo, start dictation, stop listening.`
        };
        break;
      }
    }
  } catch (err) {
    console.error('[VoiceBackground] Error executing command:', err);
    result = { command: rawText, success: false, message: 'Command error: ' + err.message };
  }

  lastCommandResult = result;
  setVoiceState('idle', { message: result.message, lastHeard, lastIntent });
}

async function testMicrophone() {
  try {
    await ensureOffscreenDocument();
    const res = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'TEST_MIC_REQUEST'
    }).catch(err => ({ success: false, error: err.message }));
    return res || { success: false, error: 'Offscreen document did not respond.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
