/**
 * SANCHALAN Speech-to-Text (STT) Provider Abstraction
 * 
 * Provides unified interface for voice transcription engines:
 * - WebSpeechProvider: Working provider for Stage 1 (development & demo)
 * - SarvamProvider: Interface placeholder for Stage 2 (requires backend proxy; no client keys)
 * - LocalWhisperProvider: Interface placeholder for Stage 2 (requires localhost companion service)
 */
(function(root) {
  'use strict';

  /**
   * Base class for speech-to-text providers
   */
  class BaseSTTProvider {
    constructor(config = {}) {
      this.config = config;
      this.language = config.language || 'en-US';
      this.onInterimResult = null; // (text: string) => void
      this.onFinalResult = null;   // (text: string) => void
      this.onError = null;         // (err: Error | string) => void
      this.onStatus = null;        // (status: string, details?: any) => void
      this.isRunning = false;
    }

    async start() {
      throw new Error('start() not implemented by provider');
    }

    async stop() {
      throw new Error('stop() not implemented by provider');
    }

    isSupported() {
      return false;
    }

    isConfigured() {
      return true;
    }

    getCapabilities() {
      return {
        id: 'base',
        name: 'Base Provider',
        isLocal: false,
        requiresEndpoint: false,
        readyInStage1: false,
        description: 'Base interface'
      };
    }
  }

  /**
   * WebSpeechProvider
   * Uses browser's native SpeechRecognition (webkitSpeechRecognition)
   * Available in Chrome offscreen document context for local development and demos.
   */
  class WebSpeechProvider extends BaseSTTProvider {
    constructor(config = {}) {
      super(config);
      this.recognition = null;
      this.shouldRestart = false;
      this.restartBackoffMs = 250;
      this.restartTimer = null;
    }

    isSupported() {
      return typeof window !== 'undefined' &&
        (Boolean(window.SpeechRecognition) || Boolean(window.webkitSpeechRecognition));
    }

    isConfigured() {
      return true; // No credentials or external endpoints needed
    }

    getCapabilities() {
      return {
        id: 'webspeech',
        name: 'Web Speech API',
        isLocal: false, // Browser may use cloud-assisted recognition
        requiresEndpoint: false,
        readyInStage1: true,
        description: 'Browser built-in speech recognition for development and testing. Does not guarantee offline processing.'
      };
    }

    async start() {
      if (!this.isSupported()) {
        const err = new Error('Web Speech API is not supported in this browser environment.');
        if (this.onError) this.onError(err);
        throw err;
      }

      this.stop(); // Stop any previous instance cleanly

      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.config.language || this.language || 'en-US';
      this.recognition.maxAlternatives = 1;

      this.shouldRestart = true;
      this.isRunning = true;

      this.recognition.onstart = () => {
        if (this.onStatus) this.onStatus('listening');
      };

      this.recognition.onresult = (event) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || '';
          if (result.isFinal) {
            const trimmed = transcript.trim();
            if (trimmed && this.onFinalResult) {
              this.onFinalResult(trimmed);
            }
          } else {
            interimText += transcript;
          }
        }
        if (interimText.trim() && this.onInterimResult) {
          this.onInterimResult(interimText.trim());
        }
      };

      this.recognition.onerror = (event) => {
        const errorType = event.error;
        // Non-fatal transient errors
        if (errorType === 'no-speech') {
          // Normal timeout waiting for speech, do not tear down
          return;
        }

        if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
          this.shouldRestart = false;
          this.isRunning = false;
          const permError = new Error('Microphone permission denied or blocked by browser policy.');
          if (this.onError) this.onError(permError);
          return;
        }

        if (errorType === 'aborted') {
          return; // Intentional stop
        }

        if (this.onError) {
          this.onError(new Error(`Speech recognition error: ${errorType}`));
        }
      };

      this.recognition.onend = () => {
        if (this.shouldRestart && this.isRunning) {
          // Auto-restart to maintain continuous listening
          clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (this.shouldRestart && this.recognition) {
              try {
                this.recognition.start();
              } catch (e) {
                // If start fails because it is already running, safely ignore
              }
            }
          }, this.restartBackoffMs);
        } else {
          this.isRunning = false;
          if (this.onStatus) this.onStatus('stopped');
        }
      };

      try {
        this.recognition.start();
      } catch (err) {
        if (this.onError) this.onError(err);
        throw err;
      }
    }

    async stop() {
      this.shouldRestart = false;
      this.isRunning = false;
      clearTimeout(this.restartTimer);

      if (this.recognition) {
        try {
          this.recognition.onend = null;
          this.recognition.stop();
        } catch (e) {
          // Ignore error on stop
        }
        this.recognition = null;
      }
      if (this.onStatus) this.onStatus('stopped');
    }
  }

  /**
   * SarvamProvider (Interface Placeholder - Stage 2)
   * 
   * Strict architectural rules:
   * 1. Must use a secure backend proxy URL; API keys are never stored in the extension.
   * 2. Not claimed to be fully local or open source (it is a proprietary cloud/edge API).
   * 3. No audio is submitted to any remote endpoint in Stage 1.
   */
  class SarvamProvider extends BaseSTTProvider {
    isSupported() {
      return true;
    }

    isConfigured() {
      return Boolean(this.config.backendUrl && this.config.backendUrl.trim().length > 0);
    }

    getCapabilities() {
      return {
        id: 'sarvam',
        name: 'Sarvam AI (Backend Proxy)',
        isLocal: false,
        requiresEndpoint: true,
        readyInStage1: false,
        description: 'Indian language speech recognition via secure backend proxy. Direct client-side API key storage is prohibited. Planned for Stage 2.'
      };
    }

    async start() {
      if (!this.isConfigured()) {
        const error = new Error('Sarvam AI requires a configured backend proxy URL. Direct API keys must never be stored in the browser extension.');
        if (this.onError) this.onError(error);
        throw error;
      }

      const stage1Error = new Error('Sarvam AI provider interface is prepared for Stage 2. In Stage 1, please select Web Speech API.');
      if (this.onError) this.onError(stage1Error);
      throw stage1Error;
    }

    async stop() {
      this.isRunning = false;
      if (this.onStatus) this.onStatus('stopped');
    }
  }

  /**
   * LocalWhisperProvider (Interface Placeholder - Stage 2)
   * 
   * Strict architectural rules:
   * 1. Communicates only with a configurable localhost companion service (e.g. http://localhost:8080/v1/transcribe).
   * 2. Never bundles multi-gigabyte models into the Chrome extension package.
   * 3. No connections are made in Stage 1.
   */
  class LocalWhisperProvider extends BaseSTTProvider {
    isSupported() {
      return true;
    }

    isConfigured() {
      return Boolean(this.config.localEndpoint && this.config.localEndpoint.trim().length > 0);
    }

    getCapabilities() {
      return {
        id: 'whisper',
        name: 'Local Whisper (Companion Service)',
        isLocal: true,
        requiresEndpoint: true,
        readyInStage1: false,
        description: 'Fully local, private transcription via localhost companion server (e.g. whisper.cpp/faster-whisper). Planned for Stage 2.'
      };
    }

    async start() {
      if (!this.isConfigured()) {
        const error = new Error('Local Whisper requires a configured localhost companion URL (e.g. http://127.0.0.1:8080/inference).');
        if (this.onError) this.onError(error);
        throw error;
      }

      const stage1Error = new Error('Local Whisper companion interface is prepared for Stage 2. In Stage 1, please select Web Speech API.');
      if (this.onError) this.onError(stage1Error);
      throw stage1Error;
    }

    async stop() {
      this.isRunning = false;
      if (this.onStatus) this.onStatus('stopped');
    }
  }

  /**
   * Factory function to instantiate provider by id
   */
  function createSTTProvider(providerId, config = {}) {
    switch ((providerId || '').toLowerCase()) {
      case 'sarvam':
        return new SarvamProvider(config);
      case 'whisper':
      case 'localwhisper':
        return new LocalWhisperProvider(config);
      case 'webspeech':
      default:
        return new WebSpeechProvider(config);
    }
  }

  // Export for offscreen document or worker
  const exportsObj = {
    BaseSTTProvider,
    WebSpeechProvider,
    SarvamProvider,
    LocalWhisperProvider,
    createSTTProvider
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  } else {
    root.SANCHALAN_STT = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
