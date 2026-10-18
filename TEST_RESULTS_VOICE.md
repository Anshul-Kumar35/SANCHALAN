# SANCHALAN Voice Interaction Verification Report (Stage 1)

This document contains manual testing procedures, test cases, and verification evidence for Stage 1 of the SANCHALAN Voice Typing and Voice Commands subsystem.

---

## Environment & Prerequisites

- **Chrome / Chromium Version**: Chrome 120+ (Manifest V3 support with Offscreen API)
- **Extension Load Path**: Repository root folder loaded via `chrome://extensions` -> "Load unpacked"
- **Microphone**: Working system audio input device
- **Camera**: Webcam for head tracking and facial gesture tests

---

## Scenario Verification Checklist

### 1. Microphone Permission Granted vs. Denied

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 1.1 | Open SANCHALAN side panel and click "Test Microphone" before granting permission. | Browser prompts for microphone permission. Status reports "Testing microphone in offscreen engine...". | Offscreen document triggers getUserMedia; prompt is displayed. | PASS |
| 1.2 | Grant microphone permission in prompt. | Status displays `✓ Microphone verified: <Microphone Name>` in green. | Microphone device identified and verified. Audio tracks cleanly released. | PASS |
| 1.3 | Deny microphone permission in browser site settings for the extension and click "Test Microphone". | Status displays actionable error message: `⚠️ Microphone permission denied. Please ensure microphone permission is granted in browser settings.` | Actionable error displayed; voice state machine remains safe in `error`/`disabled` state without crash. | PASS |

---

### 2. Wake Phrase and Gesture Arming

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 2.1 | Toggle "Enable Voice Interaction" ON. Voice state enters `idle`. Say "hello world". | Voice remains in `idle`. No command is parsed or executed. Side panel indicates "Listening for 'sanchalan'". | Privacy boundary holds: speech without wake phrase is discarded. | PASS |
| 2.2 | Say "sanchalan" into the microphone. | System transitions from `idle` to `armed`. Floating HUD badge in bottom-right illuminates with `🎙️ Listening for command... (5s)`. Side panel status dot pulses amber. | State changes to `armed`; 5-second timer starts. | PASS |
| 2.3 | Say compound phrase: "sanchalan next tab". | System detects wake phrase and immediately extracts command "next tab", transitioning `armed` -> `processing-command` -> switches tab -> returns to `idle`. | Instant transition and switch without requiring separate utterances. | PASS |
| 2.4 | Enable "Mouth Gesture Arming" in side panel. Hold mouth open wide for ~900ms. | Gaze core detects 900ms hold. Dispatches `voice:gesture-arm`. Background arms voice for 5 seconds without user speaking wake phrase. | Voice enters `armed` state via mouth hold gesture. | PASS |

---

### 3. Tab Navigation & Privileged Actions

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 3.1 | While armed, say "next tab". | Active tab in current focused window advances to the next tab to the right. | Tab switched successfully. | PASS |
| 3.2 | While armed, say "previous tab". | Active tab shifts to the previous tab to the left. | Tab switched successfully. | PASS |
| 3.3 | While armed, say "switch to tab 2" (or "switch to tab two"). | Active tab shifts directly to tab index 2. | Correct tab activated. | PASS |
| 3.4 | Open multiple tabs (e.g. YouTube, GitHub, Wikipedia). Say "switch to tab wikipedia". | Active tab switches to the Wikipedia tab. | Exact title/URL match switches immediately. | PASS |
| 3.5 | Open two tabs with "GitHub" in the title. Say "switch to tab github". | Ambiguous match: Background does NOT switch tabs automatically. Side panel displays numbered candidates card ("Matching Tabs"). | Candidates listed in side panel with clickable badges and spoken numbers. | PASS |
| 3.6 | While armed, say "close current tab". | Safe confirmation check: System prompts `Close current tab? Say "confirm close" or "cancel"`. Does NOT close tab immediately. | Confirmation requested. | PASS |
| 3.7 | Say "confirm close". | Active tab closes safely. | Tab closed. | PASS |
| 3.8 | While armed, say "new tab". | Creates a new blank tab in the current window. | New tab created. | PASS |
| 3.9 | While armed, say "reload tab". | Reloads current page. | Page reloaded. | PASS |
| 3.10 | While armed, say "go back" / "go forward". | Navigates browser history backward / forward. | History navigation triggered. | PASS |

---

### 4. Command Timeout and Cancellation

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 4.1 | Arm voice by saying "sanchalan" or clicking "Arm Command". Remain silent for 5 seconds. | Armed state expires after 5000ms. HUD displays "Command timed out." and returns to `idle`. | Timer clears; system safely returns to idle. | PASS |
| 4.2 | Arm voice, then say "stop listening" or "cancel". | Immediately cancels command listening window and returns to `idle`. | Cancelled immediately. | PASS |

---

### 5. Dictation into Editable Elements

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 5.1 | Focus a standard text `<input type="text">` or `<input type="search">`. Say "sanchalan start dictation". | System enters `dictating` state. HUD shows `✍️ Dictating...`. | Dictating state active. | PASS |
| 5.2 | Speak: "Hands free web browsing period". | Final transcript is formatted to "Hands free web browsing." and inserted at cursor. `input` and `change` events fire. Surrounding text preserved. | Text inserted accurately with punctuation mapped. | PASS |
| 5.3 | Focus a `<textarea>`. Speak: "Paragraph one new line Paragraph two period". | Text inserted as multi-line string: `Paragraph one\nParagraph two.`. | Newlines and punctuation formatted. | PASS |
| 5.4 | Focus a `contenteditable` container (e.g. rich text editor). Speak: "This is editable text period". | Text node inserted at DOM selection caret without corrupting document structure. | Text inserted into contenteditable. | PASS |
| 5.5 | Speak: "stop dictation". | System exits `dictating` state and returns to `idle`. HUD shows "Dictation stopped". | Dictation ended. | PASS |

---

### 6. No Focused Field Handling

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 6.1 | Click blank webpage background (no editable element focused). Enter dictation or speak without focus. | Unobtrusive floating HUD shows `ℹ️ No editable field focused. Transcript saved to side panel.`. Text is not lost. | Toast notification appears. | PASS |
| 6.2 | Check side panel "Latest Transcript" card. | Full transcript text is preserved in "Latest Transcript" with active `📋 Copy` button. | Transcript intact and copyable to clipboard with one click. | PASS |

---

### 7. Mouth Gesture vs. Mouth Click Conflict Coordination

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 7.1 | Enable "Enable Mouth Click" and disable "Mouth Gesture Arming". Quickly open mouth wide. | Mouth-open click fires `smile:click` immediately when above calibrated threshold. | Normal mouth click operates as before. | PASS |
| 7.2 | Enable both "Enable Mouth Click" and "Mouth Gesture Arming". Open and hold mouth open for 900ms. | Coordinated state holds click until 900ms threshold reached; triggers `voice:gesture-arm` and suppresses `smile:click`. Zero unintended page clicks occur. | Voice is armed; link under pointer is NOT clicked. | PASS |
| 7.3 | With both enabled, quickly open and close mouth (< 500ms). | Deliberate hold threshold (900ms) is not met; mouth close fires normal `smile:click`. | Click triggers normally on quick release. | PASS |
| 7.4 | Click "Calibrate Mouth Click" to open calibration overlay (`window.__gazeMouthCalActive = true`). | Neither voice gesture nor mouth click fires during calibration sampling. | Calibration proceeds without triggering voice arming. | PASS |
| 7.5 | Verify gesture cooldown. | After gesture arms, a 2000ms cooldown prevents rapid re-triggering. | Re-arming is rate-limited. | PASS |

---

### 8. Provider Placeholders and Error Handling

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 8.1 | In side panel, select "Sarvam AI (Backend Proxy - Stage 2)". | Notice informs user of backend proxy requirement. Proxy URL input appears. | UI updates to show Stage 2 configuration. | PASS |
| 8.2 | Try enabling voice with Sarvam without backend URL configured. | State shows error: "Sarvam AI requires a configured backend proxy URL. Direct API keys must never be stored in the browser extension." | Explains architectural prohibition on client-side API keys. | PASS |
| 8.3 | In side panel, select "Local Whisper (Companion Service - Stage 2)". | Notice informs user of localhost companion requirement. Localhost endpoint input appears (`http://localhost:8080/v1/transcribe`). | UI updates to show Stage 2 configuration. | PASS |
| 8.4 | Switch back to "Web Speech API (Browser built-in)". | Voice restarts with Web Speech Provider for Stage 1. | Operational for Stage 1 demo. | PASS |

---

### 9. Regression Testing: Existing SANCHALAN Features

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 9.1 | Enable Head Tracking (Alt+H calibration). Move head to browse. | Cursor tracking via One-Euro filter continues smoothly. | Pointer moves accurately. | PASS |
| 9.2 | Hover over regular web link with dwell timer (600ms). | Link summary tooltip generates via Chrome Summarizer API / Prompt API. | Summaries generate without interference. | PASS |
| 9.3 | Hover over YouTube link / test page (`test/youtube-test.html`). | YouTube caption extraction and summary pipeline operate normally. | Captions fetched and structured summary displayed. | PASS |
| 9.4 | Keyboard shortcuts (`Alt+H`, `Alt+M`, `Alt+P`, `Alt+V`, `Shift+H`). | All shortcuts fire their designated functions without collision. | Existing hotkeys operational. | PASS |

---

### 10. Tolerant Recognition & Stop Dictation Intents

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 10.1 | While dictation is active, say "stop dictation" without saying the wake word "sanchalan". | Dictation stops immediately. State transitions to `idle` with message "Dictation stopped." | Stopped without wake word. | PASS |
| 10.2 | While dictation is active, say variants: "stop typing", "end dictation", "finish dictation", "stop listening". | Each variant exits dictation cleanly. | All recognized as stop intent. | PASS |
| 10.3 | While dictating, speak an ordinary phrase: "we must not stop here". | Phrase is transcribed into the text field. Dictation does NOT stop accidentally because exact normalized intent is required. | Ordinary speech continues without accidental cutoff. | PASS |
| 10.4 | Say phonetic ASR wake word variants: "sanchaalan next tab", "sun chalan open youtube". | Normalized to canonical wake word "sanchalan". Command executes seamlessly. | Phonetic variations accepted. | PASS |
| 10.5 | Split recognition test: Say "sanchalan", pause 800ms, then say "next tab" as a separate utterance. | Rolling transcript window (3500ms) preserves the wake phrase context and executes "next tab". | Split utterances handled seamlessly. | PASS |

---

### 11. Partial Tab Title Matching & Candidate Disambiguation

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 11.1 | Open a tab with title "GitHub - Pull Requests". Say "sanchalan switch to tab github". | 6-tier ranking identifies confident match; activates GitHub tab immediately. | Switched automatically. | PASS |
| 11.2 | Open tabs "GitHub - Pull Requests" and "GitHub - Issues". Say "sanchalan switch to tab github". | Ambiguous match: does NOT switch blindly. Displays numbered candidate card in side panel with tab titles and domain pills. | Side panel lists candidates. | PASS |
| 11.3 | Say "sanchalan choose 1" or "choose 2". | Activates candidate #1 or #2 accordingly and clears candidate list. | Correct tab activated. | PASS |
| 11.4 | Say "sanchalan switch to tab 4". | Tab index matching continues working for numeric digits and word numbers. | Tab 4 activated. | PASS |

---

### 12. Cut, Copy, Paste, Select All, Undo, and Redo

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 12.1 | Select text on a page. Say "sanchalan copy". | Text is copied to system clipboard and extension session memory. HUD shows "✓ Copied selected text". | Text copied successfully. | PASS |
| 12.2 | With no text selected, say "sanchalan copy". | Reports "Select text first." Does not claim false success. | Actionable error displayed. | PASS |
| 12.3 | Focus text field with selected text. Say "sanchalan cut". | Confirmation safeguard triggers: HUD prompts `Cut selected text? Say "confirm cut" or "cancel"`. | Confirmation requested before cutting. | PASS |
| 12.4 | Say "confirm cut". | Text is cut from input/textarea/contenteditable and placed on clipboard. | Text removed and clipboard updated. | PASS |
| 12.5 | Focus text field. Say "sanchalan paste". | Clipboard text is inserted into field. If browser Clipboard API is restricted, falls back to extension session memory. | Pasted cleanly into field. | PASS |
| 12.6 | With no editable field focused, say "sanchalan paste". | Reports "Focus a text field first." | Actionable error displayed. | PASS |
| 12.7 | Say "sanchalan select all", "sanchalan undo", "sanchalan redo". | DOM actions executed on active element with feedback HUD. | Select all, undo, and redo work. | PASS |
| 12.8 | Attempt editing actions on a `chrome://extensions` tab. | Reports "Cannot execute editing/clipboard commands on browser system pages." | System pages protected. | PASS |

---

### 13. YouTube Navigation & Search Commands

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 13.1 | Say "sanchalan open youtube" or "sanchalan open youtube dot com". | Opens a new active tab in current window at `https://www.youtube.com/`. Side panel confirms "Opened YouTube." | YouTube opened. | PASS |
| 13.2 | Say "sanchalan search in youtube lo-fi music". | Directs active or existing YouTube tab (or opens one) to `https://www.youtube.com/results?search_query=lo-fi%20music`. | YouTube search loaded via URL parameter. | PASS |
| 13.3 | Say "sanchalan search youtube for 'react 19 tutorial'". | Preserves quotes and search terms in URL query. | Quoted query preserved and searched. | PASS |
| 13.4 | Say "sanchalan search in youtube" with no query. | Reports actionable message: `Please specify what to search on YouTube. Example: "search in youtube lo-fi music".` | Helpful prompt displayed. | PASS |

---

### 14. Side Panel Voice Commands Cheat Sheet & Live Diagnostics

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 14.1 | Open SANCHALAN side panel. | Collapsible `<details class="voice-commands-help" open>` is visible by default. | Cheat sheet displayed with categories. | PASS |
| 14.2 | Check command groupings. | Grouped into Navigation, Browser Actions, Dictation, Editing, and YouTube with spoken examples. | Clear, accessible categorization. | PASS |
| 14.3 | Speak a command or utterance. | "Heard" box displays exact raw text; "Interpreted as" box displays normalized intent. | Clear transparency into speech recognition. | PASS |
| 14.4 | Observe Voice State Pill. | Displays colored badge matching state: Disabled, Listening, Armed, Dictating, Processing, Error. | Clean visual state indicator. | PASS |

---

### 15. Configurable Facial & Head Gestures

| Step | Action | Expected Behavior | Observed Result | Status |
|------|--------|-------------------|-----------------|--------|
| 15.1 | Select "Head Tilt Left (hold 650ms)" for Copy gesture in side panel. | Gesture setting saved to `chrome.storage.local`. | Setting persisted. | PASS |
| 15.2 | Select text on web page and tilt head left for 650ms. | Fires `voice:copy-gesture`, copies text, shows HUD, and suppresses mouth click. | Copy gesture fires without conflict. | PASS |
| 15.3 | Select "Head Tilt Right (hold 650ms)" for Paste gesture. Focus text field and tilt head right. | Fires `voice:paste-gesture`, inserts clipboard text, shows HUD. | Paste gesture fires without conflict. | PASS |
| 15.4 | Leave gestures as "Disabled". Perform head movements. | Zero clipboard actions fire; gestures remain disabled unless configured. | Disabled by default. | PASS |

---

## Conclusion
The enhanced SANCHALAN Voice Subsystem provides tolerant, privacy-preserving speech recognition, wake-word-free stop dictation, partial tab-title ranked matching, voice and gesture clipboard operations with safety confirmation, YouTube navigation and URL-based search, and a first-time user cheat sheet with real-time recognition diagnostics.

