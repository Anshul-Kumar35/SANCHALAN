/**
 * SANCHALAN Voice Command Parser & Spoken Punctuation Formatter
 * 
 * Provides deterministic allowlist command parsing, phonetic wake-phrase normalization,
 * ranked partial tab-title matching, and text formatting.
 * Does NOT use an LLM for privileged actions.
 */
(function(root) {
  'use strict';

  const NUMBER_WORDS = {
    'one': 1,
    'first': 1,
    '1': 1,
    'two': 2,
    'second': 2,
    '2': 2,
    'three': 3,
    'third': 3,
    '3': 3,
    'four': 4,
    'fourth': 4,
    '4': 4,
    'five': 5,
    'fifth': 5,
    '5': 5,
    'six': 6,
    'sixth': 6,
    '6': 6,
    'seven': 7,
    'seventh': 7,
    '7': 7,
    'eight': 8,
    'eighth': 8,
    '8': 8,
    'nine': 9,
    'ninth': 9,
    '9': 9,
    'ten': 10,
    'tenth': 10,
    '10': 10
  };

  // Common phonetic / ASR variations for the canonical wake phrase 'sanchalan'
  const WAKE_WORD_VARIANTS = [
    'sanchalan',
    'sanchaalan',
    'sanchalana',
    'sanchal',
    'sanchlan',
    'sanchalna',
    'sun chalan',
    'san chalan',
    'sunchalan',
    'santulan',
    'sancholin',
    'sanchalon',
    'sanchalun'
  ];

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Centralized voice transcript normalizer.
   * - lowercases and trims whitespace
   * - normalizes repeated spaces and punctuation (while preserving quotes)
   * - normalizes ASR wake word variants to 'sanchalan'
   * - removes filler words ("please", "hey", "can you", "could you") when preceding commands
   */
  function normalizeVoiceTranscript(transcript, options = {}) {
    if (!transcript || typeof transcript !== 'string') return '';

    let text = transcript.toLowerCase().trim();

    // Preserve quoted strings by temporarily protecting them if needed,
    // otherwise normalize punctuation while keeping single and double quotes.
    text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

    // Replace canonical punctuation except quotes
    text = text.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, ' ');

    // Normalize multiple whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Normalize phonetic wake-phrase variations
    for (const variant of WAKE_WORD_VARIANTS) {
      if (variant !== 'sanchalan') {
        const regex = new RegExp(`\\b${escapeRegex(variant)}\\b`, 'gi');
        text = text.replace(regex, 'sanchalan');
      }
    }

    // Collapse filler prefixes only if not explicitly preserving exact query
    if (!options.preserveFillers) {
      // Remove leading pleasantries/fillers e.g. "hey sanchalan", "please", "can you"
      text = text
        .replace(/^(hey|hi|hello|ok|okay)\s+sanchalan\b/i, 'sanchalan')
        .replace(/^please\s+/i, '')
        .replace(/^(can\s+you|could\s+you|would\s+you)\s+(please\s+)?/i, '')
        .trim();
    }

    return text;
  }

  /**
   * Cleans text for matching while collapsing all punctuation
   */
  function normalizeText(text) {
    return normalizeVoiceTranscript(text);
  }

  /**
   * Checks if an utterance begins with or contains the wake phrase
   * Returns: { hasWakePhrase: boolean, remainder: string }
   */
  function extractWakePhrase(utterance, wakePhrase = 'sanchalan') {
    const normUtterance = normalizeVoiceTranscript(utterance);
    const normWake = normalizeVoiceTranscript(wakePhrase) || 'sanchalan';

    if (!normWake) {
      return { hasWakePhrase: true, remainder: normUtterance };
    }

    if (normUtterance === normWake) {
      return { hasWakePhrase: true, remainder: '' };
    }

    if (normUtterance.startsWith(normWake + ' ')) {
      const remainder = normUtterance.slice(normWake.length).trim();
      return { hasWakePhrase: true, remainder };
    }

    const wakeIndex = normUtterance.indexOf(normWake);
    if (wakeIndex !== -1) {
      const remainder = normUtterance.slice(wakeIndex + normWake.length).trim();
      return { hasWakePhrase: true, remainder };
    }

    return { hasWakePhrase: false, remainder: normUtterance };
  }

  /**
   * Checks whether an utterance is an exact stop dictation intent phrase.
   * Requires exact normalized intent match to avoid accidental cutoffs during dictation.
   */
  function isStopDictationIntent(text) {
    const clean = normalizeVoiceTranscript(text);
    const STOP_INTENTS = new Set([
      'stop dictation',
      'stop dictating',
      'stop typing',
      'end dictation',
      'finish dictation',
      'stop voice typing',
      'stop listening',
      'cancel dictation'
    ]);

    // Also check if preceded by wake word: "sanchalan stop dictation"
    if (clean.startsWith('sanchalan ')) {
      const remainder = clean.slice('sanchalan '.length).trim();
      return STOP_INTENTS.has(remainder);
    }

    return STOP_INTENTS.has(clean);
  }

  /**
   * Parses deterministic voice commands from an utterance
   * Returns: { type: string, payload?: any, raw: string, intent: string } | null
   */
  function parseVoiceCommand(text) {
    const clean = normalizeVoiceTranscript(text);
    if (!clean) return null;

    // 1. Tab Navigation: Next / Previous
    if (/^(next\s+tab|go\s+to\s+(the\s+)?next\s+tab|switch\s+(to\s+)?(the\s+)?next\s+tab|switch\s+next\s+tab)$/.test(clean)) {
      return { type: 'NEXT_TAB', intent: 'Next Tab', raw: text };
    }

    if (/^(previous\s+tab|prev\s+tab|last\s+tab|go\s+to\s+(the\s+)?previous\s+tab|go\s+back\s+tab|switch\s+(to\s+)?(the\s+)?previous\s+tab)$/.test(clean)) {
      return { type: 'PREV_TAB', intent: 'Previous Tab', raw: text };
    }

    // 2. Candidate Selection (for ambiguous tab choices: "choose 1", "choose 2", "select 1")
    const chooseMatch = clean.match(/^(choose|select|pick|number)\s+(\d+|one|two|three|four|five)$/);
    if (chooseMatch) {
      const target = chooseMatch[2];
      const index = NUMBER_WORDS[target] !== undefined ? NUMBER_WORDS[target] : parseInt(target, 10);
      return { type: 'CHOOSE_CANDIDATE', index, intent: `Choose Candidate #${index}`, raw: text };
    }

    // 3. Tab Navigation: Switch to tab <number> or <title>
    const switchMatch = clean.match(/^(switch\s+to\s+|go\s+to\s+|open\s+)?tab\s+(.+)$/);
    if (switchMatch) {
      const target = switchMatch[2].trim();
      if (NUMBER_WORDS[target] !== undefined) {
        return { type: 'SWITCH_TAB_INDEX', tabIndex: NUMBER_WORDS[target], intent: `Switch to Tab #${NUMBER_WORDS[target]}`, raw: text };
      }
      const parsedNum = parseInt(target, 10);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        return { type: 'SWITCH_TAB_INDEX', tabIndex: parsedNum, intent: `Switch to Tab #${parsedNum}`, raw: text };
      }
      return { type: 'SWITCH_TAB_TITLE', query: target, intent: `Switch to Tab "${target}"`, raw: text };
    }

    // Direct "tab <number>" shorthand
    const tabNumMatch = clean.match(/^tab\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/);
    if (tabNumMatch) {
      const target = tabNumMatch[1];
      const index = NUMBER_WORDS[target] || parseInt(target, 10);
      return { type: 'SWITCH_TAB_INDEX', tabIndex: index, intent: `Switch to Tab #${index}`, raw: text };
    }

    // 4. YouTube Commands
    if (/^(?:open|go\s+to|launch)\s+youtube(?:\s+dot\s+com|\s+com|\.com)?$/.test(clean)) {
      return { type: 'OPEN_YOUTUBE', intent: 'Open YouTube', raw: text };
    }

    // YouTube Search: "search in youtube <query>", "search youtube for <query>", "search youtube <query>"
    const ytSearchMatch = clean.match(/^(?:search\s+in\s+youtube(?:\s+for)?|search\s+youtube(?:\s+for)?|youtube\s+search(?:\s+for)?)\s*(.*)$/);
    if (ytSearchMatch) {
      const query = (ytSearchMatch[1] || '').trim();
      return { type: 'SEARCH_YOUTUBE', query, intent: `Search YouTube: "${query}"`, raw: text };
    }

    // 5. Close Tab (requires confirmation)
    if (/^(close\s+(the\s+)?(current\s+)?tab|close\s+this\s+tab|close\s+tab)$/.test(clean)) {
      return { type: 'CLOSE_TAB_REQUEST', intent: 'Close Current Tab (Confirmation Required)', raw: text };
    }

    if (/^(confirm\s+close|confirm|yes\s+close|close\s+it)$/.test(clean)) {
      return { type: 'CONFIRM_CLOSE_TAB', intent: 'Confirm Close Tab', raw: text };
    }

    // 6. New Tab & Reload Tab
    if (/^(new\s+tab|open\s+(a\s+)?new\s+tab)$/.test(clean)) {
      return { type: 'NEW_TAB', intent: 'New Tab', raw: text };
    }

    if (/^(reload\s+tab|refresh\s+tab|reload\s+page|refresh\s+page|reload)$/.test(clean)) {
      return { type: 'RELOAD_TAB', intent: 'Reload Tab', raw: text };
    }

    // 7. Browser History: Back / Forward
    if (/^(go\s+back|browser\s+back|navigate\s+back|history\s+back)$/.test(clean)) {
      return { type: 'GO_BACK', intent: 'Go Back', raw: text };
    }

    if (/^(go\s+forward|browser\s+forward|navigate\s+forward|history\s+forward)$/.test(clean)) {
      return { type: 'GO_FORWARD', intent: 'Go Forward', raw: text };
    }

    // 8. Clipboard Actions: Copy, Cut, Paste, Select All
    if (/^(copy\s+selected\s+text|copy\s+selection|copy\s+text|copy)$/.test(clean)) {
      return { type: 'COPY_SELECTION', intent: 'Copy Selected Text', raw: text };
    }

    if (/^(cut\s+selected\s+text|cut\s+selection|cut\s+text|cut)$/.test(clean)) {
      return { type: 'CUT_SELECTION_REQUEST', intent: 'Cut Selected Text (Confirmation Required)', raw: text };
    }

    if (/^(confirm\s+cut|yes\s+cut|cut\s+it)$/.test(clean)) {
      return { type: 'CONFIRM_CUT', intent: 'Confirm Cut', raw: text };
    }

    if (/^(paste|paste\s+text|paste\s+clipboard)$/.test(clean)) {
      return { type: 'PASTE_TEXT', intent: 'Paste Text', raw: text };
    }

    if (/^(select\s+all|select\s+all\s+text)$/.test(clean)) {
      return { type: 'SELECT_ALL', intent: 'Select All', raw: text };
    }

    // 9. Undo & Redo
    if (/^(undo|undo\s+typing|revert)$/.test(clean)) {
      return { type: 'UNDO', intent: 'Undo', raw: text };
    }

    if (/^(redo|redo\s+typing)$/.test(clean)) {
      return { type: 'REDO', intent: 'Redo', raw: text };
    }

    // 10. Dictation Control
    if (/^(start\s+dictation|start\s+typing|begin\s+dictation|start\s+voice\s+typing)$/.test(clean)) {
      return { type: 'START_DICTATION', intent: 'Start Dictation', raw: text };
    }

    if (/^(stop\s+dictation|stop\s+dictating|stop\s+typing|end\s+dictation|finish\s+dictation|stop\s+voice\s+typing)$/.test(clean)) {
      return { type: 'STOP_DICTATION', intent: 'Stop Dictation', raw: text };
    }

    // 11. Stop Listening / Cancel
    if (/^(stop\s+listening|cancel|nevermind|never\s+mind|dismiss)$/.test(clean)) {
      return { type: 'STOP_LISTENING', intent: 'Stop Listening / Cancel', raw: text };
    }

    return { type: 'UNKNOWN', query: clean, intent: `Unknown: "${clean}"`, raw: text };
  }

  /**
   * Deterministic Spoken Punctuation Formatter
   * Converts spoken punctuation terms to typographical symbols with clean spacing.
   */
  function formatSpokenPunctuation(text) {
    if (!text || typeof text !== 'string') return '';

    let result = text
      // Periods
      .replace(/\s+(period|full stop)/gi, '.')
      // Commas
      .replace(/\s+comma/gi, ',')
      // Question marks
      .replace(/\s+question mark/gi, '?')
      // Exclamation points
      .replace(/\s+exclamation (mark|point)/gi, '!')
      // Colons & Semicolons
      .replace(/\s+colon/gi, ':')
      .replace(/\s+semicolon/gi, ';')
      // Line breaks
      .replace(/\s+(new line|newline)\s*/gi, '\n')
      .replace(/\s+(new paragraph|new para)\s*/gi, '\n\n')
      // Quotes
      .replace(/\s+open quote\s*/gi, ' "')
      .replace(/\s*close quote/gi, '"');

    // Fix spacing around punctuation: e.g. "word . word" -> "word. word"
    result = result
      .replace(/\s+([.,!?:;])/g, '$1')
      .replace(/([.,!?:;])(?=[A-Za-z0-9])/g, '$1 ');

    return result;
  }

  /**
   * Normalizes a tab title for comparison.
   */
  function normalizeTabTitle(title) {
    if (!title || typeof title !== 'string') return '';
    return title
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()|\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Ranked matching algorithm for tab titles:
   * 1. Exact normalized title match (score 100)
   * 2. Title starts with query (score 85)
   * 3. Whole-word substring match (score 70)
   * 4. Substring match (score 60)
   * 5. Domain match (score 55)
   * 6. Token overlap / fuzzy score (up to 50)
   */
  function rankTabMatches(tabs, rawQuery) {
    const query = normalizeVoiceTranscript(rawQuery);
    if (!query || !Array.isArray(tabs) || tabs.length === 0) {
      return { matches: [], isAmbiguous: false, confidentMatch: null };
    }

    const queryTokens = query.split(/\s+/).filter(Boolean);

    const scored = tabs.map(tab => {
      const rawTitle = tab.title || '';
      const normTitle = normalizeTabTitle(rawTitle);
      let domain = '';
      try {
        if (tab.url) {
          domain = new URL(tab.url).hostname.replace(/^www\./, '');
        }
      } catch (e) {}

      let score = 0;
      let matchType = 'none';

      // 1. Exact match
      if (normTitle === query) {
        score = 100;
        matchType = 'exact';
      }
      // 2. Starts with query
      else if (normTitle.startsWith(query)) {
        score = 85;
        matchType = 'starts_with';
      }
      // 3. Whole-word substring match
      else if (new RegExp(`\\b${escapeRegex(query)}\\b`, 'i').test(normTitle)) {
        score = 70;
        matchType = 'word_substring';
      }
      // 4. General substring match
      else if (normTitle.includes(query)) {
        score = 60;
        matchType = 'substring';
      }
      // 5. Domain match
      else if (domain && (domain.toLowerCase().includes(query) || query.includes(domain.split('.')[0]))) {
        score = 55;
        matchType = 'domain';
      }
      // 6. Token overlap
      else if (queryTokens.length > 0) {
        const titleTokens = new Set(normTitle.split(/\s+/).filter(Boolean));
        let matched = 0;
        for (const token of queryTokens) {
          if (titleTokens.has(token)) {
            matched++;
          }
        }
        if (matched > 0) {
          const ratio = matched / queryTokens.length;
          score = Math.round(ratio * 48);
          matchType = 'token_overlap';
        }
      }

      return {
        tab,
        score,
        matchType,
        domain: domain || 'browser',
        title: rawTitle || 'Untitled Tab',
        id: tab.id,
        url: tab.url || ''
      };
    });

    const matches = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return { matches: [], isAmbiguous: false, confidentMatch: null };
    }

    const top = matches[0];
    const second = matches[1];

    // Check distinctiveness:
    // If only one match with good score, or top match significantly beats runner-up
    const isDistinct = matches.length === 1 && top.score >= 45;
    const isSeparated = second ? (top.score >= 65 && (top.score - second.score) >= 15) : false;

    if (isDistinct || isSeparated || top.score >= 95) {
      return { matches, isAmbiguous: false, confidentMatch: top };
    }

    // Ambiguous: top candidates are close in score
    return {
      matches: matches.slice(0, 5),
      isAmbiguous: true,
      confidentMatch: null
    };
  }

  const exportsObj = {
    NUMBER_WORDS,
    WAKE_WORD_VARIANTS,
    normalizeVoiceTranscript,
    normalizeText,
    extractWakePhrase,
    isStopDictationIntent,
    parseVoiceCommand,
    formatSpokenPunctuation,
    normalizeTabTitle,
    rankTabMatches
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  } else {
    root.SANCHALAN_COMMANDS = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
