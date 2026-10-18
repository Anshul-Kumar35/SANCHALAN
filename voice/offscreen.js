/**
 * SANCHALAN Offscreen Voice Engine
 * 
 * Runs inside the Chrome MV3 offscreen document.
 * Owns microphone capture (getUserMedia) and speech recognition engine lifecycle.
 * Communicates strictly with background.js via chrome.runtime messaging.
 */
(function() {
  'use strict';

  let currentProvider = null;
  let activeStream = null;

  console.log('[VoiceOffscreen] Initializing offscreen voice document');

  /**
   * Tests microphone access via getUserMedia
   */
  async function testMicrophoneAccess() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { success: false, error: 'navigator.mediaDevices.getUserMedia is unavailable in this context.' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getAudioTracks();
      const trackLabel = tracks[0] ? (tracks[0].label || 'Default Microphone') : 'Default Microphone';

      // Immediately stop all tracks after test
      tracks.forEach(track => track.stop());

      return {
        success: true,
        label: trackLabel
      };
    } catch (err) {
      console.warn('[VoiceOffscreen] Microphone test failed:', err);
      return {
        success: false,
        error: err.name === 'NotAllowedError' ? 'Microphone permission denied.' : err.message
      };
    }
  }

  /**
   * Starts speech recognition with chosen provider and configuration
   */
  async function startSTT(config = {}) {
    stopSTT();

    const providerId = config.provider || 'webspeech';
    const language = config.language || 'en-US';

    console.log('[VoiceOffscreen] Starting STT with provider:', providerId, 'language:', language);

    try {
      const STT = window.SANCHALAN_STT;
      if (!STT || !STT.createSTTProvider) {
        throw new Error('STT Provider module not loaded.');
      }

      currentProvider = STT.createSTTProvider(providerId, {
        language,
        backendUrl: config.backendUrl,
        localEndpoint: config.localEndpoint
      });

      if (!currentProvider.isSupported()) {
        throw new Error(`Provider ${providerId} is not supported in this environment.`);
      }

      // Hook callbacks
      currentProvider.onFinalResult = (transcript) => {
        console.log('[VoiceOffscreen] Final transcript:', transcript);
        chrome.runtime.sendMessage({
          type: 'VOICE_FINAL_TRANSCRIPT',
          transcript
        }).catch(() => {});
      };

      currentProvider.onInterimResult = (transcript) => {
        chrome.runtime.sendMessage({
          type: 'VOICE_INTERIM_TRANSCRIPT',
          transcript
        }).catch(() => {});
      };

      currentProvider.onError = (err) => {
        console.warn('[VoiceOffscreen] STT error:', err);
        chrome.runtime.sendMessage({
          type: 'VOICE_AUDIO_STATUS',
          status: 'error',
          error: err && err.message ? err.message : String(err)
        }).catch(() => {});
      };

      currentProvider.onStatus = (status, details) => {
        chrome.runtime.sendMessage({
          type: 'VOICE_AUDIO_STATUS',
          status,
          details
        }).catch(() => {});
      };

      await currentProvider.start();
    } catch (err) {
      console.error('[VoiceOffscreen] Failed to start STT:', err);
      chrome.runtime.sendMessage({
        type: 'VOICE_AUDIO_STATUS',
        status: 'error',
        error: err && err.message ? err.message : String(err)
      }).catch(() => {});
      throw err;
    }
  }

  /**
   * Stops active speech recognition
   */
  function stopSTT() {
    if (currentProvider) {
      try {
        currentProvider.stop();
      } catch (e) {
        console.warn('[VoiceOffscreen] Error stopping provider:', e);
      }
      currentProvider = null;
    }

    if (activeStream) {
      try {
        activeStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      activeStream = null;
    }
  }

  // Listen for messages from background.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only process messages explicitly targeted to offscreen or relevant actions
    if (message.target && message.target !== 'offscreen') {
      return false;
    }

    if (message.type === 'START_OFFSCREEN_STT') {
      startSTT(message.config)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'STOP_OFFSCREEN_STT') {
      stopSTT();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'TEST_MIC_REQUEST') {
      testMicrophoneAccess()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'PING_OFFSCREEN') {
      sendResponse({ status: 'alive' });
      return true;
    }
  });

  // Notify background that offscreen document is ready
  chrome.runtime.sendMessage({
    type: 'VOICE_OFFSCREEN_READY'
  }).catch(() => {});
})();
