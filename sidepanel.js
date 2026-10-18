// ========================================
// SIDEPANEL - DISPLAY ONLY (No AI Logic)
// ========================================

// State
let settings = {
  apiChoice: 'summarization',
  customPrompt: 'Summarize this article in 2-3 sentences',
  displayMode: 'tooltip',
  gazeEnabled: false,
  gazeDwellMs: 600
};

let voiceSettings = {
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

let currentContent = {
  title: '',
  fullContent: '',
  summary: ''
};

// DOM elements
const elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Sidepanel] DOMContentLoaded fired');
  
  try {
    // Get DOM elements
    elements.welcome = document.getElementById('welcome');
    elements.loadingExtract = document.getElementById('loading-extract');
    elements.loadingSummarize = document.getElementById('loading-summarize');
    elements.contentArea = document.getElementById('content-area');
    elements.error = document.getElementById('error');
    elements.title = document.getElementById('title');
    elements.aiSummary = document.getElementById('ai-summary');
    elements.articleContent = document.getElementById('article-content');
    elements.toggleBtn = document.getElementById('toggle-full-content');
    elements.fullContentSection = document.getElementById('full-content-section');
    
    // Settings
    elements.radioSummarization = document.getElementById('radio-summarization');
    elements.radioPrompt = document.getElementById('radio-prompt');
    elements.customPrompt = document.getElementById('custom-prompt');
    elements.promptContainer = document.getElementById('prompt-container');
    elements.displayMode = document.getElementById('display-mode');

    // Gaze controls
    elements.gazeEnabled = document.getElementById('gaze-enabled');
    elements.gazeStatusDot = document.getElementById('gaze-status-dot');
    elements.gazeStatusText = document.getElementById('gaze-status-text');
    elements.calibrateBtn = document.getElementById('calibrate-btn');
    elements.dwellTime = document.getElementById('dwell-time');
    elements.dwellValue = document.getElementById('dwell-value');

    // Mouth click controls
    elements.mouthClickEnabled = document.getElementById('mouth-click-enabled');
    elements.mouthStatusDot = document.getElementById('mouth-status-dot');
    elements.mouthStatusText = document.getElementById('mouth-status-text');
    elements.calibrateMouthBtn = document.getElementById('calibrate-mouth-btn');

    // Voice controls
    elements.voiceEnabled = document.getElementById('voice-enabled');
    elements.voiceStatusDot = document.getElementById('voice-status-dot');
    elements.voiceStatusText = document.getElementById('voice-status-text');
    elements.testMicBtn = document.getElementById('test-mic-btn');
    elements.manualArmBtn = document.getElementById('manual-arm-btn');
    elements.micTestFeedback = document.getElementById('mic-test-feedback');
    elements.voiceSubcontrols = document.getElementById('voice-subcontrols');
    elements.voiceCommandsEnabled = document.getElementById('voice-commands-enabled');
    elements.voiceTypingEnabled = document.getElementById('voice-typing-enabled');
    elements.voiceGestureEnabled = document.getElementById('voice-gesture-enabled');
    elements.voiceWakePhrase = document.getElementById('voice-wake-phrase');
    elements.voiceCommandTimeout = document.getElementById('voice-command-timeout');
    elements.voiceTimeoutValue = document.getElementById('voice-timeout-value');
    elements.voiceLanguage = document.getElementById('voice-language');
    elements.voiceProvider = document.getElementById('voice-provider');
    elements.providerNote = document.getElementById('provider-note');
    elements.sarvamConfigGroup = document.getElementById('sarvam-config-group');
    elements.whisperConfigGroup = document.getElementById('whisper-config-group');
    elements.voiceBackendUrl = document.getElementById('voice-backend-url');
    elements.voiceLocalWhisperUrl = document.getElementById('voice-local-whisper-url');
    elements.latestTranscript = document.getElementById('latest-transcript');
    elements.copyTranscriptBtn = document.getElementById('copy-transcript-btn');
    elements.lastCommandResult = document.getElementById('last-command-result');
    elements.tabCandidatesCard = document.getElementById('tab-candidates-card');
    elements.tabCandidatesList = document.getElementById('tab-candidates-list');
    elements.voiceStatePill = document.getElementById('voice-state-pill');
    elements.voiceHeardText = document.getElementById('voice-heard-text');
    elements.voiceInterpretedText = document.getElementById('voice-interpreted-text');
    elements.copyGesture = document.getElementById('copy-gesture');
    elements.pasteGesture = document.getElementById('paste-gesture');
    
    console.log('[Sidepanel] DOM elements retrieved:', {
      displayMode: elements.displayMode,
      radioSummarization: elements.radioSummarization,
      customPrompt: elements.customPrompt,
      voiceEnabled: elements.voiceEnabled
    });
    
    // Load settings
    await loadSettings();
    console.log('[Sidepanel] Settings loaded');
    
    // Setup listeners
    setupEventListeners();
    console.log('[Sidepanel] Event listeners set up');
    
    // Show welcome
    showWelcome();
    console.log('[Sidepanel] Welcome shown');
    
    // Get API status from background
    try {
      const status = await chrome.runtime.sendMessage({ type: 'GET_API_STATUS' });
      console.log('[Sidepanel] API status:', status);
    } catch (e) {
      console.error('[Sidepanel] Failed to get API status:', e);
    }
    
    console.log('[Sidepanel] Initialization complete');
  } catch (error) {
    console.error('[Sidepanel] Initialization error:', error);
  }
});

// Load settings
async function loadSettings() {
  const stored = await chrome.storage.local.get(['apiChoice', 'customPrompt', 'displayMode', 'gazeEnabled', 'gazeDwellMs', 'mouthClickEnabled', 'mouthCalV1']);

  if (stored.apiChoice) settings.apiChoice = stored.apiChoice;
  if (stored.customPrompt) settings.customPrompt = stored.customPrompt;
  if (stored.displayMode) settings.displayMode = stored.displayMode;
  if (typeof stored.gazeEnabled === 'boolean') settings.gazeEnabled = stored.gazeEnabled;
  if (typeof stored.gazeDwellMs === 'number') settings.gazeDwellMs = stored.gazeDwellMs;

  // Update UI
  if (elements.radioSummarization && elements.radioPrompt) {
    if (settings.apiChoice === 'summarization') {
      elements.radioSummarization.checked = true;
    } else {
      elements.radioPrompt.checked = true;
    }
  }

  if (elements.customPrompt) {
    elements.customPrompt.value = settings.customPrompt;
  }

  if (elements.displayMode) {
    elements.displayMode.value = settings.displayMode;
  }

  if (elements.gazeEnabled) {
    elements.gazeEnabled.checked = settings.gazeEnabled;
  }

  if (elements.dwellTime) {
    elements.dwellTime.value = settings.gazeDwellMs;
  }

  if (elements.dwellValue) {
    elements.dwellValue.textContent = settings.gazeDwellMs;
  }

  // Update calibrate button disabled state
  if (elements.calibrateBtn) {
    elements.calibrateBtn.disabled = !settings.gazeEnabled;
  }

  // Update initial status based on gazeEnabled
  if (!settings.gazeEnabled) {
    updateGazeStatus('ready', 'Enable to start');
  }

  // Load mouth click settings
  const mouthEnabled = stored.mouthClickEnabled || false;
  if (elements.mouthClickEnabled) {
    elements.mouthClickEnabled.checked = mouthEnabled;
  }

  // Update calibrate mouth button disabled state
  if (elements.calibrateMouthBtn) {
    elements.calibrateMouthBtn.disabled = !mouthEnabled;
  }

  // Update mouth calibration status
  updateMouthStatus(!!stored.mouthCalV1);

  // Load voice settings
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

  // Apply to voice UI
  if (elements.voiceEnabled) elements.voiceEnabled.checked = voiceSettings.voiceEnabled;
  if (elements.voiceCommandsEnabled) elements.voiceCommandsEnabled.checked = voiceSettings.voiceCommandsEnabled;
  if (elements.voiceTypingEnabled) elements.voiceTypingEnabled.checked = voiceSettings.voiceTypingEnabled;
  if (elements.voiceGestureEnabled) elements.voiceGestureEnabled.checked = voiceSettings.voiceGestureEnabled;
  if (elements.voiceWakePhrase) elements.voiceWakePhrase.value = voiceSettings.voiceWakePhrase;
  if (elements.voiceCommandTimeout) elements.voiceCommandTimeout.value = voiceSettings.voiceCommandTimeoutMs;
  if (elements.voiceTimeoutValue) elements.voiceTimeoutValue.textContent = (voiceSettings.voiceCommandTimeoutMs / 1000).toFixed(0);
  if (elements.voiceLanguage) elements.voiceLanguage.value = voiceSettings.voiceLanguage;
  if (elements.voiceProvider) elements.voiceProvider.value = voiceSettings.voiceProvider;
  if (elements.voiceBackendUrl) elements.voiceBackendUrl.value = voiceSettings.voiceBackendUrl;
  if (elements.voiceLocalWhisperUrl) elements.voiceLocalWhisperUrl.value = voiceSettings.voiceLocalWhisperUrl;
  if (elements.copyGesture && stored.copyGesture) elements.copyGesture.value = stored.copyGesture;
  if (elements.pasteGesture && stored.pasteGesture) elements.pasteGesture.value = stored.pasteGesture;

  updateProviderUI();
  updateVoiceSectionState(voiceSettings.voiceEnabled);

  // Fetch voice state from background
  try {
    const vState = await chrome.runtime.sendMessage({ type: 'VOICE_GET_STATE' });
    if (vState) {
      updateVoiceStatus(
        vState.state,
        vState.state === 'idle' ? `Listening for "${voiceSettings.voiceWakePhrase}"` : undefined,
        vState.lastHeard,
        vState.lastIntent
      );
      if (vState.lastTranscript && elements.latestTranscript) {
        elements.latestTranscript.textContent = vState.lastTranscript;
        if (elements.copyTranscriptBtn) elements.copyTranscriptBtn.disabled = false;
      }
      if (vState.lastCommandResult && elements.lastCommandResult) {
        elements.lastCommandResult.textContent = vState.lastCommandResult.message || vState.lastCommandResult.command;
      }
      if (vState.candidates && vState.candidates.length) {
        renderTabCandidates(vState.candidates);
      }
    }
  } catch (e) {
    console.warn('[Sidepanel] Failed to fetch initial voice state:', e);
  }

  togglePromptContainer();
}

// Save settings
async function saveSettings() {
  await chrome.storage.local.set({
    apiChoice: settings.apiChoice,
    customPrompt: settings.customPrompt,
    displayMode: settings.displayMode,
    gazeEnabled: settings.gazeEnabled,
    gazeDwellMs: settings.gazeDwellMs
  });
}

// Setup event listeners
function setupEventListeners() {
  // API choice
  document.querySelectorAll('input[name="api-choice"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      settings.apiChoice = e.target.value;
      togglePromptContainer();
      saveSettings();
    });
  });
  
  // Custom prompt
  if (elements.customPrompt) {
    elements.customPrompt.addEventListener('input', (e) => {
      settings.customPrompt = e.target.value;
      saveSettings();
    });
  }
  
  // Display mode
  if (elements.displayMode) {
    elements.displayMode.addEventListener('change', (e) => {
      settings.displayMode = e.target.value;
      saveSettings();
      
      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'DISPLAY_MODE_CHANGED',
            displayMode: settings.displayMode
          }).catch(() => {
            // Ignore errors if content script not ready
          });
        }
      });
    });
  }
  
  // Toggle full content
  if (elements.toggleBtn) {
    elements.toggleBtn.addEventListener('click', () => {
      if (elements.fullContentSection.classList.contains('hidden')) {
        elements.fullContentSection.classList.remove('hidden');
        elements.toggleBtn.textContent = 'Hide Full Content';
      } else {
        elements.fullContentSection.classList.add('hidden');
        elements.toggleBtn.textContent = 'View Full Content';
      }
    });
  }

  // Gaze enabled toggle
  if (elements.gazeEnabled) {
    elements.gazeEnabled.addEventListener('change', async (e) => {
      settings.gazeEnabled = e.target.checked;
      saveSettings();

      // Notify content script of the change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'GAZE_ENABLED_CHANGED',
            gazeEnabled: settings.gazeEnabled
          }).catch(() => {
            // Ignore if content script not loaded yet
          });
        }
      });

      // Update calibrate button disabled state
      if (elements.calibrateBtn) {
        elements.calibrateBtn.disabled = !settings.gazeEnabled;
      }

      // Update status text immediately to prevent race conditions
      if (!settings.gazeEnabled) {
        updateGazeStatus('ready', 'Disabled');
      } else {
        updateGazeStatus('loading', 'Initializing...');

        // When enabling, check if content scripts are loaded
        // If not, refresh the page to inject them
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0]) {
            try {
              // Try to ping the content script
              await chrome.tabs.sendMessage(tabs[0].id, { type: 'PING' });
              console.log('[Sidepanel] Content script already loaded');
            } catch (error) {
              // Content script not loaded, refresh the page
              console.log('[Sidepanel] Content script not loaded, refreshing page...');
              updateGazeStatus('loading', 'Refreshing page...');
              setTimeout(() => {
                chrome.tabs.reload(tabs[0].id);
              }, 300);
            }
          }
        });
      }

      console.log('[Sidepanel] Gaze tracking toggled:', settings.gazeEnabled);
    });
  }

  // Calibrate button
  if (elements.calibrateBtn) {
    elements.calibrateBtn.addEventListener('click', () => {
      console.log('[Sidepanel] Calibrate button clicked');

      // Blur the button to prevent SPACE from re-clicking it
      elements.calibrateBtn.blur();

      // Send message to active tab to trigger calibration
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TRIGGER_CALIBRATION'
          }).catch((error) => {
            console.error('[Sidepanel] Failed to trigger calibration:', error);
          });
        }
      });
    });
  }

  // Mouth click enabled toggle
  if (elements.mouthClickEnabled) {
    elements.mouthClickEnabled.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      chrome.storage.local.set({ mouthClickEnabled: enabled });
      console.log('[Sidepanel] Mouth click toggled:', enabled);

      // Update calibrate button disabled state
      if (elements.calibrateMouthBtn) {
        elements.calibrateMouthBtn.disabled = !enabled;
      }
    });
  }

  // Calibrate mouth button
  if (elements.calibrateMouthBtn) {
    elements.calibrateMouthBtn.addEventListener('click', () => {
      console.log('[Sidepanel] Calibrate mouth button clicked');

      // Blur the button to prevent SPACE from re-clicking it
      elements.calibrateMouthBtn.blur();

      // Send message to active tab to trigger mouth calibration
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TRIGGER_MOUTH_CALIBRATION'
          }).catch((error) => {
            console.error('[Sidepanel] Failed to trigger mouth calibration:', error);
          });
        }
      });
    });
  }

  // Dwell time slider
  if (elements.dwellTime) {
    elements.dwellTime.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      settings.gazeDwellMs = value;
      if (elements.dwellValue) {
        elements.dwellValue.textContent = value;
      }
      saveSettings();
      console.log('[Sidepanel] Dwell time updated:', value);
    });
  }

  // Voice Controls
  if (elements.voiceEnabled) {
    elements.voiceEnabled.addEventListener('change', async (e) => {
      voiceSettings.voiceEnabled = e.target.checked;
      updateVoiceSectionState(voiceSettings.voiceEnabled);
      await chrome.storage.local.set({ voiceEnabled: voiceSettings.voiceEnabled });
      if (voiceSettings.voiceEnabled) {
        updateVoiceStatus('idle', 'Starting voice engine...');
      }
    });
  }

  if (elements.voiceCommandsEnabled) {
    elements.voiceCommandsEnabled.addEventListener('change', (e) => {
      voiceSettings.voiceCommandsEnabled = e.target.checked;
      chrome.storage.local.set({ voiceCommandsEnabled: voiceSettings.voiceCommandsEnabled });
    });
  }

  if (elements.voiceTypingEnabled) {
    elements.voiceTypingEnabled.addEventListener('change', (e) => {
      voiceSettings.voiceTypingEnabled = e.target.checked;
      chrome.storage.local.set({ voiceTypingEnabled: voiceSettings.voiceTypingEnabled });
    });
  }

  if (elements.voiceGestureEnabled) {
    elements.voiceGestureEnabled.addEventListener('change', (e) => {
      voiceSettings.voiceGestureEnabled = e.target.checked;
      chrome.storage.local.set({ voiceGestureEnabled: voiceSettings.voiceGestureEnabled });
    });
  }

  if (elements.voiceWakePhrase) {
    elements.voiceWakePhrase.addEventListener('change', (e) => {
      const val = e.target.value.trim().toLowerCase() || 'sanchalan';
      voiceSettings.voiceWakePhrase = val;
      e.target.value = val;
      chrome.storage.local.set({ voiceWakePhrase: val });
    });
  }

  if (elements.voiceCommandTimeout) {
    elements.voiceCommandTimeout.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      voiceSettings.voiceCommandTimeoutMs = val;
      if (elements.voiceTimeoutValue) {
        elements.voiceTimeoutValue.textContent = (val / 1000).toFixed(0);
      }
      chrome.storage.local.set({ voiceCommandTimeoutMs: val });
    });
  }

  if (elements.voiceLanguage) {
    elements.voiceLanguage.addEventListener('change', (e) => {
      voiceSettings.voiceLanguage = e.target.value;
      chrome.storage.local.set({ voiceLanguage: voiceSettings.voiceLanguage });
    });
  }

  if (elements.voiceProvider) {
    elements.voiceProvider.addEventListener('change', (e) => {
      voiceSettings.voiceProvider = e.target.value;
      updateProviderUI();
      chrome.storage.local.set({ voiceProvider: voiceSettings.voiceProvider });
    });
  }

  if (elements.voiceBackendUrl) {
    elements.voiceBackendUrl.addEventListener('change', (e) => {
      voiceSettings.voiceBackendUrl = e.target.value.trim();
      chrome.storage.local.set({ voiceBackendUrl: voiceSettings.voiceBackendUrl });
    });
  }

  if (elements.voiceLocalWhisperUrl) {
    elements.voiceLocalWhisperUrl.addEventListener('change', (e) => {
      voiceSettings.voiceLocalWhisperUrl = e.target.value.trim();
      chrome.storage.local.set({ voiceLocalWhisperUrl: voiceSettings.voiceLocalWhisperUrl });
    });
  }

  if (elements.copyGesture) {
    elements.copyGesture.addEventListener('change', (e) => {
      chrome.storage.local.set({ copyGesture: e.target.value });
    });
  }

  if (elements.pasteGesture) {
    elements.pasteGesture.addEventListener('change', (e) => {
      chrome.storage.local.set({ pasteGesture: e.target.value });
    });
  }

  if (elements.testMicBtn) {
    elements.testMicBtn.addEventListener('click', async () => {
      if (!elements.micTestFeedback) return;
      elements.micTestFeedback.classList.remove('hidden');
      elements.micTestFeedback.style.color = 'var(--color-text)';
      elements.micTestFeedback.textContent = 'Testing microphone in offscreen engine...';

      try {
        const res = await chrome.runtime.sendMessage({ type: 'TEST_MICROPHONE' });
        if (res && res.success) {
          elements.micTestFeedback.style.color = 'var(--color-success)';
          elements.micTestFeedback.textContent = `✓ Microphone verified: ${res.label}`;
        } else {
          elements.micTestFeedback.style.color = '#EF4444';
          elements.micTestFeedback.textContent = `⚠️ ${res?.error || 'Failed to access microphone'}. Please ensure microphone permission is granted in browser settings.`;
        }
      } catch (err) {
        elements.micTestFeedback.style.color = '#EF4444';
        elements.micTestFeedback.textContent = `⚠️ Error: ${err.message}`;
      }
    });
  }

  if (elements.manualArmBtn) {
    elements.manualArmBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'VOICE_ARM_MANUALLY' }).catch(() => {});
    });
  }

  if (elements.copyTranscriptBtn) {
    elements.copyTranscriptBtn.addEventListener('click', () => {
      const text = elements.latestTranscript ? elements.latestTranscript.textContent : '';
      if (text && text !== 'No speech detected yet.') {
        navigator.clipboard.writeText(text).then(() => {
          const original = elements.copyTranscriptBtn.textContent;
          elements.copyTranscriptBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            if (elements.copyTranscriptBtn) elements.copyTranscriptBtn.textContent = original;
          }, 1500);
        }).catch(() => {});
      }
    });
  }
}

// Toggle prompt container
function togglePromptContainer() {
  if (elements.promptContainer) {
    if (settings.apiChoice === 'prompt') {
      elements.promptContainer.classList.remove('hidden');
    } else {
      elements.promptContainer.classList.add('hidden');
    }
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STREAMING_UPDATE') {
    if (settings.displayMode === 'panel' || settings.displayMode === 'both') {
      updateSummaryDisplay(message.content);
    }
  }

  if (message.type === 'PROCESSING_STATUS') {
    if (message.status === 'started') {
      showProcessing(message.title);
    }
  }

  if (message.type === 'DISPLAY_CACHED_SUMMARY') {
    if (settings.displayMode === 'panel' || settings.displayMode === 'both') {
      displayCachedSummary(message.title, message.summary);
    }
  }

  if (message.type === 'GAZE_STATUS') {
    updateGazeStatus(message.phase, message.note);
  }

  if (message.type === 'VOICE_STATE_CHANGED') {
    updateVoiceStatus(message.state, message.message, message.lastHeard, message.lastIntent);
    if (message.lastTranscript && elements.latestTranscript) {
      elements.latestTranscript.textContent = message.lastTranscript;
      elements.latestTranscript.style.fontStyle = 'normal';
      elements.latestTranscript.style.opacity = '1';
      if (elements.copyTranscriptBtn) elements.copyTranscriptBtn.disabled = false;
    }
    if (message.lastCommandResult && elements.lastCommandResult) {
      const res = message.lastCommandResult;
      elements.lastCommandResult.textContent = `${res.success ? '✓' : '⚠️'} ${res.message || res.command}`;
      elements.lastCommandResult.style.color = res.success ? 'var(--color-text)' : '#EF4444';
    }
    if (message.candidates) {
      renderTabCandidates(message.candidates);
    }
  }

  if (message.type === 'VOICE_INTERIM_TRANSCRIPT') {
    if (elements.latestTranscript && message.transcript) {
      elements.latestTranscript.textContent = message.transcript + ' ...';
      elements.latestTranscript.style.fontStyle = 'italic';
      elements.latestTranscript.style.opacity = '0.7';
    }
  }
});

// Update gaze status indicator
function updateGazeStatus(phase, note) {
  if (!elements.gazeStatusDot || !elements.gazeStatusText) {
    return;
  }

  // Remove all status classes
  elements.gazeStatusDot.className = 'status-dot';

  // Check if disabled based on note
  if (note && note.toLowerCase().includes('disabled')) {
    elements.gazeStatusText.textContent = 'Disabled';
    return;
  }

  // Map phase to status
  const statusMap = {
    'loading': { class: 'loading', text: 'Loading models...' },
    'ready': { class: 'ready', text: note || 'Ready to calibrate' },
    'live': { class: 'live', text: note || 'Active & tracking' },
    'calibrating': { class: 'loading', text: 'Calibrating...' }
  };

  const status = statusMap[phase] || { class: '', text: note || 'Unknown' };

  if (status.class) {
    elements.gazeStatusDot.classList.add(status.class);
  }
  elements.gazeStatusText.textContent = status.text;
}

function updateMouthStatus(calibrated) {
  if (!elements.mouthStatusDot || !elements.mouthStatusText) {
    return;
  }

  // Remove all status classes
  elements.mouthStatusDot.className = 'status-dot';

  if (calibrated) {
    elements.mouthStatusDot.classList.add('ready');
    elements.mouthStatusText.textContent = 'Calibrated ✓';
  } else {
    elements.mouthStatusText.textContent = 'Not calibrated';
  }
}

// Show states
function hideAll() {
  // Hide content states, but NOT settings elements
  const elementsToHide = [
    elements.welcome,
    elements.loadingExtract,
    elements.loadingSummarize,
    elements.contentArea,
    elements.error
  ];
  
  elementsToHide.forEach(el => {
    if (el && el.classList) {
      el.classList.add('hidden');
    }
  });
}

function showWelcome() {
  hideAll();
  if (elements.welcome) {
    elements.welcome.classList.remove('hidden');
  }
}

function showProcessing(title) {
  if (settings.displayMode === 'tooltip') return; // Don't show in panel if tooltip-only
  
  hideAll();
  if (elements.loadingExtract) {
    elements.loadingExtract.classList.remove('hidden');
  }
  
  // After brief moment, show summarizing state
  setTimeout(() => {
    if (elements.loadingExtract) {
      elements.loadingExtract.classList.add('hidden');
    }
    if (elements.loadingSummarize) {
      elements.loadingSummarize.classList.remove('hidden');
    }
  }, 500);
}

function updateSummaryDisplay(formattedContent) {
  if (settings.displayMode === 'tooltip') return;
  
  // Show content area if hidden
  if (elements.contentArea && elements.contentArea.classList.contains('hidden')) {
    hideAll();
    elements.contentArea.classList.remove('hidden');
  }
  
  // Update summary
  if (elements.aiSummary) {
    elements.aiSummary.innerHTML = formattedContent;
  }
}

function displayCachedSummary(title, formattedSummary) {
  hideAll();
  
  if (elements.contentArea) {
    elements.contentArea.classList.remove('hidden');
  }
  
  if (elements.title) {
    elements.title.textContent = title;
  }
  
  if (elements.aiSummary) {
    elements.aiSummary.innerHTML = formattedSummary;
  }
}

// Voice helper functions
function updateVoiceSectionState(enabled) {
  if (elements.voiceSubcontrols) {
    elements.voiceSubcontrols.style.opacity = enabled ? '1' : '0.55';
    elements.voiceSubcontrols.style.pointerEvents = enabled ? 'auto' : 'none';
  }
  if (elements.manualArmBtn) {
    elements.manualArmBtn.disabled = !enabled;
  }
  if (!enabled) {
    updateVoiceStatus('disabled', 'Disabled');
  }
}

function updateVoiceStatus(state, message, heard, interpreted) {
  if (!elements.voiceStatusDot || !elements.voiceStatusText) return;

  elements.voiceStatusDot.className = 'status-dot';

  const statusMap = {
    'disabled': { class: '', pillClass: 'pill-disabled', pillText: 'Disabled', text: 'Disabled' },
    'idle': { class: 'live', pillClass: 'pill-idle', pillText: 'Listening', text: message || `Listening for "${voiceSettings.voiceWakePhrase}"` },
    'armed': { class: 'armed', pillClass: 'pill-armed', pillText: 'Armed', text: message || 'Listening for command... (5s)' },
    'dictating': { class: 'dictating', pillClass: 'pill-dictating', pillText: 'Dictating', text: message || 'Dictating... (Say "stop dictation")' },
    'processing-command': { class: 'loading', pillClass: 'pill-processing', pillText: 'Processing', text: message || 'Executing command...' },
    'error': { class: 'error', pillClass: 'pill-error', pillText: 'Error', text: message || 'Voice error' }
  };

  const current = statusMap[state] || { class: '', pillClass: 'pill-disabled', pillText: state, text: message || state };
  if (current.class) {
    elements.voiceStatusDot.classList.add(current.class);
  }
  elements.voiceStatusText.textContent = current.text;

  if (elements.voiceStatePill) {
    elements.voiceStatePill.className = `state-pill ${current.pillClass}`;
    elements.voiceStatePill.textContent = current.pillText;
  }

  if (heard !== undefined && elements.voiceHeardText) {
    elements.voiceHeardText.textContent = heard || 'None';
  }

  if (interpreted !== undefined && elements.voiceInterpretedText) {
    elements.voiceInterpretedText.textContent = interpreted || 'None';
  }

  if (elements.manualArmBtn) {
    elements.manualArmBtn.disabled = !voiceSettings.voiceEnabled || state !== 'idle';
  }
}

function updateProviderUI() {
  const provider = voiceSettings.voiceProvider || 'webspeech';
  if (elements.providerNote) {
    if (provider === 'webspeech') {
      elements.providerNote.textContent = 'Browser built-in recognition for development and demos. Does not guarantee offline transcription.';
    } else if (provider === 'sarvam') {
      elements.providerNote.textContent = 'Stage 2: Proprietary Indian language STT. Requires a secure backend proxy (client API keys forbidden).';
    } else if (provider === 'whisper') {
      elements.providerNote.textContent = 'Stage 2: Private local transcription via localhost companion service (no large model bundled in extension).';
    }
  }

  if (elements.sarvamConfigGroup) {
    elements.sarvamConfigGroup.classList.toggle('hidden', provider !== 'sarvam');
  }
  if (elements.whisperConfigGroup) {
    elements.whisperConfigGroup.classList.toggle('hidden', provider !== 'whisper');
  }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function highlightMatch(title, query) {
  if (!query || !title) return escapeHtml(title);
  const escapedTitle = escapeHtml(title);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapedTitle.replace(regex, '<mark>$1</mark>');
}

function renderTabCandidates(candidates) {
  if (!elements.tabCandidatesCard || !elements.tabCandidatesList) return;

  if (!candidates || !candidates.length) {
    elements.tabCandidatesCard.classList.add('hidden');
    elements.tabCandidatesList.innerHTML = '';
    return;
  }

  elements.tabCandidatesCard.classList.remove('hidden');
  elements.tabCandidatesList.innerHTML = '';

  candidates.forEach(tab => {
    const li = document.createElement('li');
    li.className = 'tab-candidate-item';
    const highlightedTitle = highlightMatch(tab.title, tab.query);
    const domainText = escapeHtml(tab.domain || 'browser');
    li.innerHTML = `
      <span class="tab-badge">${tab.number}</span>
      <div class="tab-info" style="display:flex; flex-direction:column; overflow:hidden; gap:2px; flex:1;">
        <span class="tab-title" style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${highlightedTitle}</span>
        <span class="tab-domain-pill" style="font-size:10px; color:var(--color-text-secondary); opacity:0.85;">🌐 ${domainText}</span>
      </div>
    `;
    li.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'VOICE_SELECT_TAB_CANDIDATE',
        tabId: tab.id
      }).catch(() => {});
      elements.tabCandidatesCard.classList.add('hidden');
    });
    elements.tabCandidatesList.appendChild(li);
  });
}

// Listen for mouth calibration completion
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.mouthCalV1) {
    console.log('[Sidepanel] Mouth calibration updated');
    updateMouthStatus(!!changes.mouthCalV1.newValue);
  }
});

console.log('[Sidepanel] Script loaded');