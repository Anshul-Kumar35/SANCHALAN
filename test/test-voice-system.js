/**
 * Test Harness for SANCHALAN Voice Subsystem (Stage 1)
 * Validates command parsing, spoken punctuation, wake phrase extraction, and STT providers.
 */
const assert = require('assert');
const {
  extractWakePhrase,
  parseVoiceCommand,
  formatSpokenPunctuation,
  normalizeVoiceTranscript,
  isStopDictationIntent,
  rankTabMatches
} = require('../voice/command-parser.js');
const { BaseSTTProvider, WebSpeechProvider, SarvamProvider, LocalWhisperProvider, createSTTProvider } = require('../voice/stt-provider.js');

let passCount = 0;
let failCount = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

console.log('\n--- Test Suite 1: Transcript Normalization & ASR Wake Variants ---');
test('Normalizes phonetic variants of sanchalan to canonical wake word', () => {
  assert.strictEqual(normalizeVoiceTranscript('sanchaalan next tab'), 'sanchalan next tab');
  assert.strictEqual(normalizeVoiceTranscript('sanchal switch to tab 2'), 'sanchalan switch to tab 2');
  assert.strictEqual(normalizeVoiceTranscript('sun chalan open youtube'), 'sanchalan open youtube');
  assert.strictEqual(normalizeVoiceTranscript('santulan stop dictation'), 'sanchalan stop dictation');
});

test('Removes polite filler prefixes without altering search queries', () => {
  assert.strictEqual(normalizeVoiceTranscript('please switch to tab github'), 'switch to tab github');
  assert.strictEqual(normalizeVoiceTranscript('could you please go to next tab'), 'go to next tab');
  assert.strictEqual(normalizeVoiceTranscript('hey sanchalan next tab'), 'sanchalan next tab');
});

test('Preserves quotes in search queries', () => {
  const norm = normalizeVoiceTranscript('search youtube for "lofi hip hop"');
  assert.strictEqual(norm, 'search youtube for "lofi hip hop"');
});

console.log('\n--- Test Suite 2: Stop Dictation Intent Detection ---');
test('Identifies exact stop dictation intents without wake word', () => {
  assert.strictEqual(isStopDictationIntent('stop dictation'), true);
  assert.strictEqual(isStopDictationIntent('stop dictating'), true);
  assert.strictEqual(isStopDictationIntent('stop typing'), true);
  assert.strictEqual(isStopDictationIntent('end dictation'), true);
  assert.strictEqual(isStopDictationIntent('finish dictation'), true);
  assert.strictEqual(isStopDictationIntent('stop voice typing'), true);
  assert.strictEqual(isStopDictationIntent('stop listening'), true);
});

test('Identifies stop dictation intents with wake word', () => {
  assert.strictEqual(isStopDictationIntent('sanchalan stop dictation'), true);
  assert.strictEqual(isStopDictationIntent('sanchalan, stop dictating'), true);
  assert.strictEqual(isStopDictationIntent('sanchaalan stop typing'), true);
});

test('Rejects arbitrary speech containing the word stop to avoid accidental cutoffs', () => {
  assert.strictEqual(isStopDictationIntent('we need to stop at the red light'), false);
  assert.strictEqual(isStopDictationIntent('please do not stop dictation now'), false);
  assert.strictEqual(isStopDictationIntent('nonstop train to delhi'), false);
});

console.log('\n--- Test Suite 3: Wake Phrase Detection & Extraction ---');
test('Identifies wake phrase alone', () => {
  const res = extractWakePhrase('sanchalan', 'sanchalan');
  assert.strictEqual(res.hasWakePhrase, true);
  assert.strictEqual(res.remainder, '');
});

test('Identifies wake phrase followed by command', () => {
  const res = extractWakePhrase('sanchalan next tab', 'sanchalan');
  assert.strictEqual(res.hasWakePhrase, true);
  assert.strictEqual(res.remainder, 'next tab');
});

test('Identifies embedded wake phrase with phonetic variation', () => {
  const res = extractWakePhrase('hey sanchaalan switch to tab 2', 'sanchalan');
  assert.strictEqual(res.hasWakePhrase, true);
  assert.strictEqual(res.remainder, 'switch to tab 2');
});

test('Ignores speech without wake phrase', () => {
  const res = extractWakePhrase('hello world this is a test', 'sanchalan');
  assert.strictEqual(res.hasWakePhrase, false);
});

console.log('\n--- Test Suite 4: Tab Navigation & Candidate Selection ---');
test('Parses next tab and variants', () => {
  assert.strictEqual(parseVoiceCommand('next tab').type, 'NEXT_TAB');
  assert.strictEqual(parseVoiceCommand('go to next tab').type, 'NEXT_TAB');
  assert.strictEqual(parseVoiceCommand('switch next tab').type, 'NEXT_TAB');
});

test('Parses previous tab and variants', () => {
  assert.strictEqual(parseVoiceCommand('previous tab').type, 'PREV_TAB');
  assert.strictEqual(parseVoiceCommand('last tab').type, 'PREV_TAB');
  assert.strictEqual(parseVoiceCommand('go back tab').type, 'PREV_TAB');
});

test('Parses switch to tab with numbers and words', () => {
  assert.strictEqual(parseVoiceCommand('switch to tab 6').tabIndex, 6);
  assert.strictEqual(parseVoiceCommand('switch to tab two').tabIndex, 2);
  assert.strictEqual(parseVoiceCommand('tab 4').tabIndex, 4);
});

test('Parses switch to tab by partial title', () => {
  const cmd = parseVoiceCommand('switch to tab github');
  assert.strictEqual(cmd.type, 'SWITCH_TAB_TITLE');
  assert.strictEqual(cmd.query, 'github');
});

test('Parses candidate selection for ambiguous choices', () => {
  const cmd1 = parseVoiceCommand('choose 1');
  assert.strictEqual(cmd1.type, 'CHOOSE_CANDIDATE');
  assert.strictEqual(cmd1.index, 1);

  const cmd3 = parseVoiceCommand('choose three');
  assert.strictEqual(cmd3.type, 'CHOOSE_CANDIDATE');
  assert.strictEqual(cmd3.index, 3);
});

console.log('\n--- Test Suite 5: Ranked Tab Title Matching ---');
const sampleTabs = [
  { id: 1, title: 'GitHub - Pull Requests', url: 'https://github.com/pulls' },
  { id: 2, title: 'ChatGPT - OpenAI', url: 'https://chat.openai.com/' },
  { id: 3, title: 'The New York Times - Breaking News', url: 'https://www.nytimes.com/' },
  { id: 4, title: 'YouTube - Home', url: 'https://www.youtube.com/' },
  { id: 5, title: 'GitHub - Issues', url: 'https://github.com/issues' }
];

test('Finds confident exact/starts_with match for distinctive query', () => {
  const result = rankTabMatches(sampleTabs, 'chatgpt');
  assert.strictEqual(result.isAmbiguous, false);
  assert.strictEqual(result.confidentMatch.id, 2);
});

test('Finds confident match for partial whole-word title', () => {
  const result = rankTabMatches(sampleTabs, 'new york times');
  assert.strictEqual(result.isAmbiguous, false);
  assert.strictEqual(result.confidentMatch.id, 3);
});

test('Identifies ambiguous results when multiple tabs match equally', () => {
  const result = rankTabMatches(sampleTabs, 'github');
  assert.strictEqual(result.isAmbiguous, true);
  assert(result.matches.length >= 2);
  assert.strictEqual(result.matches[0].tab.url.includes('github.com'), true);
});

test('Returns empty when no tab matches', () => {
  const result = rankTabMatches(sampleTabs, 'wikipedia astrophysics');
  assert.strictEqual(result.matches.length, 0);
  assert.strictEqual(result.confidentMatch, null);
});

console.log('\n--- Test Suite 6: YouTube Navigation & Search Commands ---');
test('Parses open youtube and domain variations', () => {
  assert.strictEqual(parseVoiceCommand('open youtube').type, 'OPEN_YOUTUBE');
  assert.strictEqual(parseVoiceCommand('open youtube dot com').type, 'OPEN_YOUTUBE');
  assert.strictEqual(parseVoiceCommand('go to youtube.com').type, 'OPEN_YOUTUBE');
});

test('Parses search in youtube with query and quoted title', () => {
  const cmd = parseVoiceCommand('search in youtube lo-fi music');
  assert.strictEqual(cmd.type, 'SEARCH_YOUTUBE');
  assert.strictEqual(cmd.query, 'lo fi music');

  const quotedCmd = parseVoiceCommand('search youtube for "interstellar theme"');
  assert.strictEqual(quotedCmd.type, 'SEARCH_YOUTUBE');
  assert.strictEqual(quotedCmd.query, '"interstellar theme"');
});

console.log('\n--- Test Suite 7: Cut, Copy, Paste, Select All, Undo, Redo ---');
test('Parses copy and cut commands', () => {
  assert.strictEqual(parseVoiceCommand('copy').type, 'COPY_SELECTION');
  assert.strictEqual(parseVoiceCommand('copy selected text').type, 'COPY_SELECTION');
  assert.strictEqual(parseVoiceCommand('cut').type, 'CUT_SELECTION_REQUEST');
  assert.strictEqual(parseVoiceCommand('cut selected text').type, 'CUT_SELECTION_REQUEST');
  assert.strictEqual(parseVoiceCommand('confirm cut').type, 'CONFIRM_CUT');
});

test('Parses paste, select all, undo, redo commands', () => {
  assert.strictEqual(parseVoiceCommand('paste').type, 'PASTE_TEXT');
  assert.strictEqual(parseVoiceCommand('paste text').type, 'PASTE_TEXT');
  assert.strictEqual(parseVoiceCommand('select all').type, 'SELECT_ALL');
  assert.strictEqual(parseVoiceCommand('undo').type, 'UNDO');
  assert.strictEqual(parseVoiceCommand('redo').type, 'REDO');
});

console.log('\n--- Test Suite 8: Spoken Punctuation Formatter ---');
test('Formats spoken period, comma, question mark, and exclamation point', () => {
  const raw = 'Hello world period How are you question mark I am great exclamation mark';
  const formatted = formatSpokenPunctuation(raw);
  assert.strictEqual(formatted, 'Hello world. How are you? I am great!');
});

test('Formats spoken new line and paragraph', () => {
  const raw = 'First line new line Second line';
  const formatted = formatSpokenPunctuation(raw);
  assert.strictEqual(formatted, 'First line\nSecond line');
});

console.log('\n--- Test Suite 9: STT Provider Abstraction Contracts ---');
test('Factory creates WebSpeechProvider by default', () => {
  const provider = createSTTProvider('webspeech', { language: 'en-US' });
  assert(provider instanceof WebSpeechProvider);
  assert.strictEqual(provider.getCapabilities().id, 'webspeech');
  assert.strictEqual(provider.getCapabilities().readyInStage1, true);
  assert.strictEqual(provider.isConfigured(), true);
});

test('SarvamProvider requires backend proxy URL and rejects missing endpoint', () => {
  const unconfigured = createSTTProvider('sarvam', { backendUrl: '' });
  assert.strictEqual(unconfigured.isConfigured(), false);
  const configured = createSTTProvider('sarvam', { backendUrl: 'https://proxy.example.com/stt' });
  assert.strictEqual(configured.isConfigured(), true);
});

test('LocalWhisperProvider requires local companion endpoint and rejects missing endpoint', () => {
  const unconfigured = createSTTProvider('whisper', { localEndpoint: '' });
  assert.strictEqual(unconfigured.isConfigured(), false);
  const configured = createSTTProvider('whisper', { localEndpoint: 'http://localhost:8080/v1/transcribe' });
  assert.strictEqual(configured.isConfigured(), true);
});

console.log(`\n========================================`);
console.log(`Results: ${passCount} Passed, ${failCount} Failed`);
console.log(`========================================\n`);

if (failCount > 0) {
  process.exit(1);
}

