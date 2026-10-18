(function() {
  'use strict';

  if (window.__sanchalanKeyboardInitialized) {
    return;
  }
  window.__sanchalanKeyboardInitialized = true;

  const STYLE_ID = 'sanchalan-osk-styles';
  const ROOT_ID = 'sanchalan-osk-root';
  const POINT_EVENT = 'gaze:point';
  const STATUS_EVENT = 'gaze:status';
  const DEFAULT_DWELL_MS = 600;
  const KEYBOARD_DWELL_MULTIPLIER = 2;
  const KEY_GAP_TOLERANCE_PX = 16;
  const KEY_NEARBY_RADIUS_PX = 36;
  const MOUTH_HYSTERESIS_RATIO = 0.05;
  const INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password']);
  const COMMON_WORDS = [
    'the', 'and', 'you', 'to', 'is', 'it', 'we', 'a', 'are', 'for', 'that',
    'this', 'have', 'I', 'with', 'what', 'when', 'how', 'can', 'will', 'not',
    'please', 'thanks', 'hello', 'okay', 'yes', 'no', 'good', 'great', 'happy',
    'birthday', 'today', 'tomorrow', 'meeting', 'message', 'call', 'come', 'send',
    'hai', 'hain', 'kya', 'ka', 'ki', 'ke', 'ko', 'kar', 'kr', 'raha', 'rahi',
    'ho', 'nahi', 'mujhe', 'aap', 'tum', 'kal', 'abhi', 'aur', 'bhai', 'karo',
    'karna', 'chahiye', 'mein', 'mai', 'hu', 'hoon', 'toh', 'se', 'me'
  ];
  const NEXT_WORDS = {
    are: ['you', 'we', 'the'],
    can: ['you', 'we', 'I'],
    good: ['morning', 'afternoon', 'night'],
    how: ['are', 'is', 'about'],
    i: ['am', 'will', 'can'],
    kaise: ['ho', 'hai', 'hain'],
    kr: ['do', 'na', 'raha'],
    kya: ['hai', 'kar', 'hua'],
    thank: ['you'],
    what: ['is', 'are', 'about']
  };

  let root = null;
  let launcher = null;
  let panel = null;
  let statusText = null;
  let progressBar = null;
  let progressTrack = null;
  let suggestionRow = null;
  let suggestionButtons = [];
  let lastEditable = null;
  let inputBookmark = null;
  let rangeBookmark = null;
  let gazeEnabled = false;
  let mouthClickEnabled = false;
  let gazePhase = 'ready';
  let dwellThreshold = DEFAULT_DWELL_MS;
  let dwellTarget = null;
  let dwellLastTs = 0;
  let dwellAccum = 0;
  let dwellFiredTarget = null;
  let mouthPressReadyTarget = null;
  let shifted = false;
  let mouthThreshold = null;
  let mouthState = null;
  let mouthDragActive = false;
  let pointerDragActive = false;
  let mouthDragOffsetX = 0;
  let mouthDragOffsetY = 0;
  let lastGazePoint = null;

  function loadStylesheet() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
      console.error('[SANCHALAN Keyboard] Extension runtime is unavailable; keyboard styles were not loaded.');
      return;
    }

    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('keyboard/keyboard.css');
    link.addEventListener('error', () => {
      console.error('[SANCHALAN Keyboard] Failed to load keyboard/keyboard.css.');
    }, { once: true });
    document.documentElement.appendChild(link);
  }

  function makeButton(label, ariaLabel, action, value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sanchalan-osk-key';
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('data-gaze-clickable', 'true');
    button.dataset.oskAction = action;
    if (value !== undefined) {
      button.dataset.oskValue = value;
    }
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    });
    button.addEventListener('click', () => activateKey(button));
    return button;
  }

  function makeRow(parent, className) {
    const row = document.createElement('div');
    row.className = `sanchalan-osk-row ${className || ''}`.trim();
    parent.appendChild(row);
    return row;
  }

  function createKeyboard() {
    if (root) {
      return;
    }

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText = [
      'position:fixed!important',
      'right:16px!important',
      'bottom:16px!important',
      'z-index:2147483647!important',
      'display:block!important',
      'visibility:visible!important',
      'opacity:1!important',
      'pointer-events:none!important'
    ].join(';');

    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'sanchalan-osk-launcher';
    launcher.style.cssText = [
      'display:block!important',
      'visibility:visible!important',
      'opacity:1!important',
      'pointer-events:auto!important',
      'min-height:48px',
      'padding:10px 18px',
      'border:2px solid #0b57d0',
      'border-radius:12px',
      'background:#fff',
      'color:#0b57d0',
      'font:700 16px/1.4 system-ui,sans-serif',
      'cursor:pointer',
      'box-shadow:0 4px 18px rgba(20,30,50,.24)'
    ].join(';');
    launcher.textContent = 'Open keyboard';
    launcher.setAttribute('aria-label', 'Open on-screen keyboard');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'sanchalan-osk-panel');
    launcher.dataset.oskLauncher = 'true';
    launcher.setAttribute('data-gaze-clickable', 'true');
    launcher.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    });
    launcher.addEventListener('click', () => setKeyboardOpen(panel.hidden));

    panel = document.createElement('section');
    panel.id = 'sanchalan-osk-panel';
    panel.className = 'sanchalan-osk-panel';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'On-screen keyboard');
    panel.hidden = true;

    const header = document.createElement('div');
    header.className = 'sanchalan-osk-header';
    const title = document.createElement('h2');
    title.textContent = 'On-screen keyboard';
    const dragHandle = document.createElement('span');
    dragHandle.className = 'sanchalan-osk-drag-handle';
    dragHandle.textContent = 'Close mouth to drag · open to drop';
    dragHandle.setAttribute('aria-label', 'Look here and close your mouth to drag; open your mouth to drop');
    dragHandle.dataset.oskAction = 'drag-handle';
    dragHandle.setAttribute('data-gaze-clickable', 'true');
    dragHandle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      beginPointerDrag(event);
    });
    statusText = document.createElement('span');
    statusText.className = 'sanchalan-osk-status';
    statusText.setAttribute('role', 'status');
    statusText.setAttribute('aria-live', 'polite');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'sanchalan-osk-close';
    closeButton.textContent = 'Close';
    closeButton.setAttribute('aria-label', 'Close on-screen keyboard');
    closeButton.dataset.oskAction = 'hide';
    closeButton.setAttribute('data-gaze-clickable', 'true');
    closeButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    });
    closeButton.addEventListener('click', () => setKeyboardOpen(false));

    header.append(title, dragHandle, statusText, closeButton);

    progressTrack = document.createElement('div');
    progressTrack.className = 'sanchalan-osk-progress-track';
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-label', 'Gaze dwell selection progress');
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');
    progressTrack.setAttribute('aria-valuenow', '0');
    progressBar = document.createElement('div');
    progressBar.className = 'sanchalan-osk-progress';
    progressTrack.appendChild(progressBar);

    suggestionRow = document.createElement('div');
    suggestionRow.className = 'sanchalan-osk-suggestions';
    suggestionRow.setAttribute('role', 'group');
    suggestionRow.setAttribute('aria-label', 'Suggested words');
    for (let index = 0; index < 3; index += 1) {
      const suggestion = makeButton('', `Insert suggested word ${index + 1}`, 'suggestion');
      suggestion.classList.add('sanchalan-osk-suggestion');
      suggestion.hidden = true;
      suggestionButtons.push(suggestion);
      suggestionRow.appendChild(suggestion);
    }

    const caretControls = makeRow(panel, 'sanchalan-osk-caret-controls');
    caretControls.appendChild(makeButton('← Left', 'Move cursor left one character', 'move-left'));
    caretControls.appendChild(makeButton('Right →', 'Move cursor right one character', 'move-right'));

    const keys = document.createElement('div');
    keys.className = 'sanchalan-osk-keys';

    const numberRow = makeRow(keys, 'sanchalan-osk-number-row');
    for (let digit = 1; digit <= 9; digit += 1) {
      numberRow.appendChild(makeButton(String(digit), String(digit), 'text', String(digit)));
    }
    numberRow.appendChild(makeButton('0', '0', 'text', '0'));

    const topRow = makeRow(keys, 'sanchalan-osk-letter-row');
    'qwertyuiop'.split('').forEach((letter) => {
      topRow.appendChild(makeButton(letter, letter, 'text', letter));
    });

    const middleRow = makeRow(keys, 'sanchalan-osk-letter-row sanchalan-osk-inset');
    'asdfghjkl'.split('').forEach((letter) => {
      middleRow.appendChild(makeButton(letter, letter, 'text', letter));
    });

    const bottomRow = makeRow(keys, 'sanchalan-osk-letter-row');
    bottomRow.appendChild(makeButton('Shift', 'Toggle uppercase letters', 'shift'));
    'zxcvbnm'.split('').forEach((letter) => {
      bottomRow.appendChild(makeButton(letter, letter, 'text', letter));
    });
    bottomRow.appendChild(makeButton('Backspace', 'Delete character before cursor', 'backspace'));

    const controls = makeRow(keys, 'sanchalan-osk-controls');
    controls.appendChild(makeButton(',', 'Comma', 'text', ','));
    controls.appendChild(makeButton('Space', 'Insert space', 'text', ' '));
    controls.appendChild(makeButton('.', 'Period', 'text', '.'));
    controls.appendChild(makeButton('Enter', 'Insert new line', 'enter'));
    controls.appendChild(makeButton('?', 'Question mark', 'text', '?'));

    panel.append(header, progressTrack, suggestionRow, caretControls, keys);
    root.append(launcher, panel);
    document.documentElement.appendChild(root);
    const gazePointer = document.getElementById('gaze-pointer');
    if (gazePointer) {
      document.documentElement.appendChild(gazePointer);
    }
    setStatus('Focus a text field, then choose a key.');
    console.info('[SANCHALAN Keyboard] On-screen keyboard launcher added.');
  }

  function setStatus(message) {
    if (statusText) {
      statusText.textContent = message;
    }
  }

  function setKeyboardOpen(open) {
    if (!panel || !launcher) {
      return;
    }
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    launcher.textContent = open ? 'Hide keyboard' : 'Open keyboard';
    launcher.setAttribute('aria-label', open ? 'Hide on-screen keyboard' : 'Open on-screen keyboard');
    resetDwell();
    if (open) {
      rememberCurrentEditable();
      setStatus(lastEditable ? 'Keyboard ready.' : 'Focus a text field first.');
      updateSuggestions();
    }
  }

  function isEditableInput(element) {
    if (!(element instanceof HTMLInputElement)) {
      return false;
    }
    return INPUT_TYPES.has(element.type.toLowerCase()) && !element.disabled && !element.readOnly;
  }

  function findEditable(element) {
    if (!(element instanceof Element)) {
      return null;
    }
    if (element instanceof HTMLTextAreaElement) {
      return element.disabled || element.readOnly ? null : element;
    }
    if (isEditableInput(element)) {
      return element;
    }
    if (!element.isContentEditable) {
      return null;
    }

    let editableRoot = element;
    while (editableRoot.parentElement && editableRoot.parentElement.isContentEditable) {
      editableRoot = editableRoot.parentElement;
    }
    return editableRoot;
  }

  function rememberCurrentEditable() {
    const editable = findEditable(document.activeElement);
    if (editable) {
      lastEditable = editable;
      rememberSelection(editable);
    }
  }

  function rememberSelection(editable) {
    if (!editable || !editable.isConnected) {
      return;
    }
    if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
      try {
        inputBookmark = {
          target: editable,
          start: editable.selectionStart,
          end: editable.selectionEnd
        };
      } catch (error) {
        inputBookmark = null;
      }
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      if (editable.contains(range.commonAncestorContainer)) {
        rangeBookmark = { target: editable, range: range.cloneRange() };
      }
    }
  }

  function onFocusIn(event) {
    if (root && root.contains(event.target)) {
      return;
    }
    const editable = findEditable(event.target);
    if (editable) {
      lastEditable = editable;
      rememberSelection(editable);
      updateSuggestions();
    }
  }

  function onEditableInput(event) {
    if (root && root.contains(event.target)) {
      return;
    }
    const editable = findEditable(event.target);
    if (editable) {
      lastEditable = editable;
      rememberSelection(editable);
      updateSuggestions();
    }
  }

  function onSelectionChange() {
    if (lastEditable && document.activeElement === lastEditable) {
      rememberSelection(lastEditable);
      updateSuggestions();
      return;
    }
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      return;
    }
    const editable = findEditable(selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement);
    if (editable) {
      lastEditable = editable;
      rememberSelection(editable);
      updateSuggestions();
    }
  }

  function getWordContext() {
    const target = lastEditable;
    if (!target || !target.isConnected) {
      return null;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      let start = target.selectionStart;
      let end = target.selectionEnd;
      if (inputBookmark && inputBookmark.target === target) {
        start = inputBookmark.start;
        end = inputBookmark.end;
      }
      if (start === null || end === null || start !== end) {
        return null;
      }
      const beforeText = target.value.slice(0, start);
      const match = beforeText.match(/[A-Za-z0-9_'-]+$/);
      const word = match ? match[0] : '';
      return {
        target,
        word,
        previousWord: beforeText.slice(0, beforeText.length - word.length).trim().match(/[A-Za-z0-9_'-]+$/)?.[0] || '',
        text: target.value,
        start: start - word.length,
        end: start,
        input: true
      };
    }

    if (!target.isContentEditable || !rangeBookmark || rangeBookmark.target !== target) {
      return null;
    }

    const caret = rangeBookmark.range.cloneRange();
    if (!target.contains(caret.startContainer) || !caret.collapsed) {
      return null;
    }
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(target);
    beforeRange.setEnd(caret.startContainer, caret.startOffset);
    const beforeText = beforeRange.toString();
    const match = beforeText.match(/[A-Za-z0-9_'-]+$/);
    const word = match ? match[0] : '';
    const previousWord = beforeText.slice(0, beforeText.length - word.length).trim().match(/[A-Za-z0-9_'-]+$/)?.[0] || '';
    const wordRange = caret.cloneRange();

    if (word.length) {
      const startOffset = beforeText.length - word.length;
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let consumed = 0;
      let textNode = walker.nextNode();
      let foundStart = false;
      while (textNode) {
        if (startOffset <= consumed + textNode.length) {
          wordRange.setStart(textNode, startOffset - consumed);
          foundStart = true;
          break;
        }
        consumed += textNode.length;
        textNode = walker.nextNode();
      }
      if (!foundStart) {
        return null;
      }
    }
    wordRange.setEnd(caret.startContainer, caret.startOffset);
    if (wordRange.toString() !== word) {
      return null;
    }

    return {
      target,
      word,
      previousWord,
      text: target.innerText || target.textContent || '',
      range: wordRange,
      input: false
    };
  }

  function getSuggestions(context) {
    const prefix = context ? context.word.toLowerCase() : '';
    const previousWord = context ? context.previousWord.toLowerCase() : '';
    const following = NEXT_WORDS[previousWord] || [];
    const fieldWords = context
      ? (context.text.match(/[A-Za-z0-9_'-]+/g) || [])
      : [];
    const candidates = [...following, ...COMMON_WORDS, ...fieldWords.reverse()];
    const unique = new Map();

    candidates.forEach((candidate, index) => {
      const normalized = candidate.toLowerCase();
      if (!normalized || (prefix && (!normalized.startsWith(prefix) || normalized === prefix))) {
        return;
      }
      const existing = unique.get(normalized);
      if (existing) {
        existing.frequency += 1;
      } else {
        unique.set(normalized, { word: candidate, order: index, frequency: 1 });
      }
    });

    return Array.from(unique.values())
      .sort((left, right) => right.frequency - left.frequency || left.order - right.order)
      .slice(0, suggestionButtons.length)
      .map((candidate) => {
        if (!context || !context.word) {
          return candidate.word;
        }
        if (context.word === context.word.toUpperCase()) {
          return candidate.word.toUpperCase();
        }
        if (context.word[0] === context.word[0].toUpperCase()) {
          return candidate.word[0].toUpperCase() + candidate.word.slice(1);
        }
        return candidate.word;
      });
  }

  function updateSuggestions() {
    if (!suggestionButtons.length) {
      return;
    }
    const context = getWordContext();
    const suggestions = getSuggestions(context);
    suggestionButtons.forEach((button, index) => {
      const suggestion = suggestions[index];
      button.hidden = !suggestion;
      if (suggestion) {
        button.textContent = suggestion;
        button.dataset.oskValue = suggestion;
        button.setAttribute('aria-label', `Insert ${suggestion}`);
      }
    });
    suggestionRow.hidden = suggestions.length === 0;
  }

  function beginMouthDrag(x, y) {
    if (!panel || panel.hidden || mouthDragActive || pointerDragActive) {
      return;
    }
    const handle = root.querySelector('.sanchalan-osk-drag-handle');
    if (!handle) {
      return;
    }
    const handleRect = handle.getBoundingClientRect();
    if (x < handleRect.left || x > handleRect.right || y < handleRect.top || y > handleRect.bottom) {
      return;
    }

    const rootRect = root.getBoundingClientRect();
    mouthDragOffsetX = x - rootRect.left;
    mouthDragOffsetY = y - rootRect.top;
    mouthDragActive = true;
    resetDwell();
    root.classList.add('is-dragging');
    setStatus('Dragging — open your mouth to drop.');
  }

  function beginPointerDrag(event) {
    const rootRect = root.getBoundingClientRect();
    mouthDragOffsetX = event.clientX - rootRect.left;
    mouthDragOffsetY = event.clientY - rootRect.top;
    pointerDragActive = true;
    root.classList.add('is-dragging');
    setStatus('Dragging — release to drop.');
    document.addEventListener('pointermove', onPointerDragMove, true);
    document.addEventListener('pointerup', onPointerDragEnd, true);
    document.addEventListener('pointercancel', onPointerDragEnd, true);
  }

  function moveKeyboardTo(x, y) {
    if (!root || (!mouthDragActive && !pointerDragActive)) {
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const left = Math.max(0, Math.min(window.innerWidth - rootRect.width, x - mouthDragOffsetX));
    const top = Math.max(0, Math.min(window.innerHeight - rootRect.height, y - mouthDragOffsetY));
    root.style.setProperty('right', 'auto', 'important');
    root.style.setProperty('bottom', 'auto', 'important');
    root.style.setProperty('left', `${left}px`, 'important');
    root.style.setProperty('top', `${top}px`, 'important');
  }

  function finishMouthDrag(message) {
    if (!mouthDragActive) {
      return;
    }
    mouthDragActive = false;
    document.removeEventListener('pointermove', onPointerDragMove, true);
    document.removeEventListener('pointerup', onPointerDragEnd, true);
    document.removeEventListener('pointercancel', onPointerDragEnd, true);
    root.classList.remove('is-dragging');
    setStatus(message);
    resetDwell();
  }

  function finishPointerDrag(message) {
    if (!pointerDragActive) {
      return;
    }
    pointerDragActive = false;
    document.removeEventListener('pointermove', onPointerDragMove, true);
    document.removeEventListener('pointerup', onPointerDragEnd, true);
    document.removeEventListener('pointercancel', onPointerDragEnd, true);
    root.classList.remove('is-dragging');
    setStatus(message);
    resetDwell();
  }

  function onPointerDragMove(event) {
    moveKeyboardTo(event.clientX, event.clientY);
  }

  function onPointerDragEnd(event) {
    if (event.type === 'pointerup' && event.button !== 0) {
      return;
    }
    document.removeEventListener('pointermove', onPointerDragMove, true);
    document.removeEventListener('pointerup', onPointerDragEnd, true);
    document.removeEventListener('pointercancel', onPointerDragEnd, true);
    finishPointerDrag('Keyboard dropped.');
  }

  function updateMouthState() {
    if (!Number.isFinite(mouthThreshold) || !Number.isFinite(window.__lastMouthRatio)) {
      return;
    }
    const mouthRatio = window.__lastMouthRatio;
    const nextState = mouthState === null
      ? mouthRatio > mouthThreshold
      : mouthState
        ? mouthRatio > mouthThreshold - MOUTH_HYSTERESIS_RATIO
        : mouthRatio >= mouthThreshold + MOUTH_HYSTERESIS_RATIO;

    if (nextState === mouthState) {
      return;
    }
    mouthState = nextState;
    if (mouthState) {
      finishMouthDrag('Keyboard dropped.');
    } else if (gazeEnabled && !mouthDragActive && !pointerDragActive) {
      const point = lastGazePoint;
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        beginMouthDrag(point.x, point.y);
      }
    }
  }

  function replaceCurrentWord(suggestion) {
    rememberCurrentEditable();
    const context = getWordContext();
    if (!context) {
      setStatus('Focus a text field to use word suggestions.');
      return false;
    }

    const insertedText = `${suggestion} `;
    if (context.input) {
      const caret = context.start + insertedText.length;
      context.target.setRangeText(insertedText, context.start, context.end, 'preserve');
      context.target.setSelectionRange(caret, caret);
      inputBookmark = { target: context.target, start: caret, end: caret };
    } else {
      const range = context.range;
      range.deleteContents();
      const textNode = document.createTextNode(insertedText);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      rangeBookmark = { target: context.target, range: range.cloneRange() };
    }
    dispatchInput(context.target, 'insertReplacementText', insertedText);
    return true;
  }

  function moveCaret(direction) {
    rememberCurrentEditable();
    const target = lastEditable;
    if (!target || !target.isConnected) {
      setStatus('Focus a text field to move the cursor.');
      return false;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (target.disabled || target.readOnly) {
        setStatus('The focused field no longer accepts text.');
        return false;
      }
      let start = target.selectionStart;
      let end = target.selectionEnd;
      if (inputBookmark && inputBookmark.target === target) {
        start = inputBookmark.start;
        end = inputBookmark.end;
      }
      if (start === null || end === null) {
        return false;
      }

      let offset;
      if (start !== end) {
        offset = direction === 'left' ? start : end;
      } else if (direction === 'left') {
        offset = previousCodePointStart(target.value, start);
      } else {
        const codePoint = target.value.codePointAt(start);
        offset = Math.min(target.value.length, start + (codePoint && codePoint > 0xFFFF ? 2 : 1));
      }
      target.setSelectionRange(offset, offset);
      inputBookmark = { target, start: offset, end: offset };
      updateSuggestions();
      setStatus(`Cursor moved ${direction}.`);
      return true;
    }

    if (!target.isContentEditable || !rangeBookmark || rangeBookmark.target !== target) {
      setStatus('Focus a text field to move the cursor.');
      return false;
    }
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }
    const range = rangeBookmark.range.cloneRange();
    if (!target.contains(range.startContainer)) {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    if (typeof selection.modify !== 'function') {
      setStatus('Cursor movement is unavailable in this editor.');
      return false;
    }
    selection.modify('move', direction === 'left' ? 'backward' : 'forward', 'character');
    if (!selection.rangeCount) {
      return false;
    }
    const movedRange = selection.getRangeAt(0);
    rangeBookmark = { target, range: movedRange.cloneRange() };
    updateSuggestions();
    setStatus(`Cursor moved ${direction}.`);
    return true;
  }

  function dispatchInput(target, inputType, data) {
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType,
      data
    }));
  }

  function previousCodePointStart(value, offset) {
    if (offset <= 0) {
      return 0;
    }
    const previous = value.charCodeAt(offset - 1);
    if (previous >= 0xDC00 && previous <= 0xDFFF && offset > 1) {
      const leading = value.charCodeAt(offset - 2);
      if (leading >= 0xD800 && leading <= 0xDBFF) {
        return offset - 2;
      }
    }
    return offset - 1;
  }

  function insertIntoInput(target, text, isBackspace) {
    if (!target.isConnected || target.disabled || target.readOnly) {
      return false;
    }

    let start = target.selectionStart;
    let end = target.selectionEnd;
    if (inputBookmark && inputBookmark.target === target) {
      start = inputBookmark.start;
      end = inputBookmark.end;
    }
    if (start === null || end === null) {
      return false;
    }
    start = Math.max(0, Math.min(target.value.length, start));
    end = Math.max(start, Math.min(target.value.length, end));

    if (isBackspace && start === end) {
      start = previousCodePointStart(target.value, start);
      if (start === end) {
        return true;
      }
    }

    const insertedText = isBackspace ? '' : text;
    const caret = start + insertedText.length;
    target.setRangeText(insertedText, start, end, 'preserve');
    target.setSelectionRange(caret, caret);
    inputBookmark = { target, start: caret, end: caret };
    dispatchInput(target, isBackspace ? 'deleteContentBackward' : 'insertText', insertedText);
    return true;
  }

  function findLastTextNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node;
    }
    for (let child = node.lastChild; child; child = child.previousSibling) {
      const textNode = findLastTextNode(child);
      if (textNode && textNode.length) {
        return textNode;
      }
    }
    return null;
  }

  function findLastBreakNode(node) {
    if (node.nodeName === 'BR') {
      return node;
    }
    for (let child = node.lastChild; child; child = child.previousSibling) {
      const breakNode = findLastBreakNode(child);
      if (breakNode) {
        return breakNode;
      }
    }
    return null;
  }

  function findPreviousTextPosition(rootElement, container, offset) {
    if (container.nodeType === Node.TEXT_NODE && offset > 0) {
      return { node: container, offset: previousCodePointStart(container.data, offset) };
    }

    let current = container;
    let childOffset = offset;
    while (current && current !== rootElement) {
      if (current.nodeType === Node.TEXT_NODE) {
        const parent = current.parentNode;
        if (!parent) {
          return null;
        }
        childOffset = Array.prototype.indexOf.call(parent.childNodes, current);
        current = parent;
        continue;
      }

      if (childOffset > 0 && current.childNodes) {
        const previousNode = current.childNodes[childOffset - 1];
        const textNode = findLastTextNode(previousNode);
        if (textNode) {
          return {
            node: textNode,
            offset: previousCodePointStart(textNode.data, textNode.length)
          };
        }
        const breakNode = findLastBreakNode(previousNode);
        if (breakNode) {
          return { node: breakNode, isBreak: true };
        }
      }

      if (!current.parentNode) {
        return null;
      }
      childOffset = Array.prototype.indexOf.call(current.parentNode.childNodes, current);
      current = current.parentNode;
    }

    if (current === rootElement && childOffset > 0) {
      const textNode = findLastTextNode(current.childNodes[childOffset - 1]);
      if (textNode) {
        return {
          node: textNode,
          offset: previousCodePointStart(textNode.data, textNode.length)
        };
      }
      const breakNode = findLastBreakNode(current.childNodes[childOffset - 1]);
      if (breakNode) {
        return { node: breakNode, isBreak: true };
      }
    }
    return null;
  }

  function insertIntoContentEditable(target, text, isBackspace, isEnter) {
    if (!target.isConnected || !target.isContentEditable) {
      return false;
    }

    const selection = window.getSelection();
    let range = rangeBookmark && rangeBookmark.target === target
      ? rangeBookmark.range.cloneRange()
      : selection && selection.rangeCount
        ? selection.getRangeAt(0).cloneRange()
        : null;
    if (!range || !target.contains(range.commonAncestorContainer)) {
      return false;
    }

    if (isBackspace && range.collapsed) {
      const previous = findPreviousTextPosition(target, range.startContainer, range.startOffset);
      if (!previous) {
        return true;
      }
      if (previous.isBreak) {
        range.selectNode(previous.node);
      } else {
        range.setStart(previous.node, previous.offset);
      }
    }

    range.deleteContents();
    let insertedNode = null;
    if (isEnter) {
      insertedNode = document.createElement('br');
      range.insertNode(insertedNode);
      range.setStartAfter(insertedNode);
    } else if (text) {
      insertedNode = document.createTextNode(text);
      range.insertNode(insertedNode);
      range.setStartAfter(insertedNode);
    }
    range.collapse(true);

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    rangeBookmark = { target, range: range.cloneRange() };
    dispatchInput(target, isBackspace ? 'deleteContentBackward' : isEnter ? 'insertLineBreak' : 'insertText', isEnter || isBackspace ? null : text);
    return true;
  }

  function insertText(text, isBackspace, isEnter) {
    rememberCurrentEditable();
    if (!lastEditable || !lastEditable.isConnected) {
      setStatus('Focus a text field first.');
      return false;
    }

    let inserted = false;
    if (lastEditable instanceof HTMLInputElement || lastEditable instanceof HTMLTextAreaElement) {
      if (isEnter && !(lastEditable instanceof HTMLTextAreaElement)) {
        setStatus('Enter is only available in multiline fields.');
        return false;
      }
      inserted = insertIntoInput(lastEditable, isEnter ? '\n' : text, isBackspace);
    } else {
      inserted = insertIntoContentEditable(lastEditable, text, isBackspace, isEnter);
    }

    if (!inserted) {
      setStatus('The focused field no longer accepts text.');
      return false;
    }
    setStatus('Keyboard ready.');
    return true;
  }

  function activateKey(button) {
    const action = button.dataset.oskAction;
    if (action === 'drag-handle') {
      if (!Number.isFinite(mouthThreshold)) {
        setStatus('Calibrate mouth movement before dragging.');
      } else if (mouthState === false && lastGazePoint) {
        beginMouthDrag(lastGazePoint.x, lastGazePoint.y);
      } else {
        setStatus('Close your mouth while looking at the drag handle.');
      }
      return;
    }
    if (action === 'hide') {
      setKeyboardOpen(false);
      return;
    }
    if (action === 'shift') {
      shifted = !shifted;
      button.setAttribute('aria-pressed', String(shifted));
      button.classList.toggle('is-active', shifted);
      button.textContent = shifted ? 'Shift on' : 'Shift';
      return;
    }

    if (action === 'backspace') {
      insertText('', true, false);
      return;
    }
    if (action === 'enter') {
      insertText('', false, true);
      return;
    }
    if (action === 'suggestion') {
      replaceCurrentWord(button.dataset.oskValue || '');
      return;
    }
    if (action === 'move-left' || action === 'move-right') {
      moveCaret(action === 'move-left' ? 'left' : 'right');
      return;
    }

    const value = button.dataset.oskValue || '';
    insertText(shifted ? value.toUpperCase() : value, false, false);
    if (shifted && /^[a-z]$/i.test(value)) {
      shifted = false;
      const shiftButton = root.querySelector('[data-osk-action="shift"]');
      shiftButton.setAttribute('aria-pressed', 'false');
      shiftButton.classList.remove('is-active');
      shiftButton.textContent = 'Shift';
    }
  }

  function isMouthPressTarget(target) {
    return Boolean(target && target !== launcher &&
      target.matches('[data-osk-action]') &&
      !['drag-handle', 'hide'].includes(target.dataset.oskAction));
  }

  function onMouthClick() {
    if (mouthDragActive) {
      finishMouthDrag('Keyboard dropped.');
      return;
    }
    if (!mouthClickEnabled || !panel || panel.hidden ||
        !isMouthPressTarget(dwellTarget) || dwellFiredTarget === dwellTarget) {
      return;
    }

    const requiredDwell = getKeyboardDwellThreshold() * 0.5;
    if (dwellAccum < requiredDwell) {
      return;
    }

    const target = dwellTarget;
    dwellFiredTarget = target;
    mouthPressReadyTarget = null;
    activateKey(target);
    setStatus('Key pressed with mouth opening.');
  }

  function updateDwellProgress(progress) {
    if (!progressBar || !progressTrack) {
      return;
    }
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    progressBar.style.width = `${percent}%`;
    progressTrack.setAttribute('aria-valuenow', String(percent));
    if (dwellTarget && dwellTarget !== launcher) {
      dwellTarget.style.setProperty('--dwell-progress', `${percent}%`);
    }
    if (progress >= 0.5 && mouthClickEnabled && Number.isFinite(mouthThreshold) &&
        isMouthPressTarget(dwellTarget) &&
        mouthPressReadyTarget !== dwellTarget) {
      mouthPressReadyTarget = dwellTarget;
      setStatus('Open your mouth to press, or wait for dwell.');
    }
  }

  function getKeyboardDwellThreshold() {
    return dwellThreshold * KEYBOARD_DWELL_MULTIPLIER;
  }

  function findDwellKey(x, y, hitElement) {
    if (dwellTarget && dwellTarget.isConnected && dwellTarget !== launcher &&
        panel && !panel.hidden) {
      const rect = dwellTarget.getBoundingClientRect();
      if (x >= rect.left - KEY_GAP_TOLERANCE_PX && x <= rect.right + KEY_GAP_TOLERANCE_PX &&
          y >= rect.top - KEY_GAP_TOLERANCE_PX && y <= rect.bottom + KEY_GAP_TOLERANCE_PX) {
        return dwellTarget;
      }
    }

    const directHit = hitElement && hitElement.closest
      ? hitElement.closest(`#${ROOT_ID} [data-osk-action], #${ROOT_ID} [data-osk-launcher]`)
      : null;
    if (directHit) {
      return directHit;
    }

    if (!root || !hitElement || !root.contains(hitElement)) {
      return null;
    }

    let nearest = null;
    let nearestDistance = KEY_NEARBY_RADIUS_PX;
    root.querySelectorAll('[data-osk-action], [data-osk-launcher]').forEach((candidate) => {
      if (candidate !== launcher && (!panel || panel.hidden || !panel.contains(candidate))) {
        return;
      }
      const rect = candidate.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const nearestX = Math.max(rect.left, Math.min(x, rect.right));
      const nearestY = Math.max(rect.top, Math.min(y, rect.bottom));
      const distance = Math.hypot(x - nearestX, y - nearestY);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  function setDwellTarget(target) {
    if (dwellTarget && dwellTarget !== target) {
      dwellTarget.classList.remove('is-dwell-target');
      dwellTarget.style.removeProperty('--dwell-progress');
    }
    if (dwellTarget !== target) {
      mouthPressReadyTarget = null;
    }
    if (target && target !== launcher) {
      target.classList.add('is-dwell-target');
      target.style.setProperty('--dwell-progress', '0%');
    }
    dwellTarget = target;
  }

  function resetDwell() {
    setDwellTarget(null);
    dwellLastTs = 0;
    dwellAccum = 0;
    dwellFiredTarget = null;
    updateDwellProgress(0);
  }

  function onGazePoint(event) {
    if (!gazeEnabled || !event.detail) {
      resetDwell();
      return;
    }
    if (gazePhase === 'ready') {
      gazePhase = 'live';
    }
    if (gazePhase !== 'live') {
      resetDwell();
      return;
    }

    const { x, y, ts } = event.detail;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      resetDwell();
      return;
    }
    lastGazePoint = { x, y };
    updateMouthState();
    if (mouthDragActive) {
      moveKeyboardTo(x, y);
      resetDwell();
      return;
    }

    const element = document.elementFromPoint(x, y);
    const key = findDwellKey(x, y, element);

    if (!key) {
      resetDwell();
      return;
    }

    const now = Number.isFinite(ts) ? ts : performance.now();
    if (key !== dwellTarget) {
      setDwellTarget(key);
      dwellLastTs = now;
      dwellAccum = 0;
      dwellFiredTarget = null;
      updateDwellProgress(0);
      return;
    }

    if (dwellFiredTarget === key) {
      return;
    }

    dwellAccum += Math.max(0, Math.min(250, now - dwellLastTs));
    dwellLastTs = now;
    const keyboardDwellThreshold = getKeyboardDwellThreshold();
    const progress = dwellAccum / keyboardDwellThreshold;
    updateDwellProgress(progress);
    if (dwellAccum >= keyboardDwellThreshold) {
      dwellFiredTarget = key;
      if (key === launcher) {
        setKeyboardOpen(true);
      } else {
        activateKey(key);
      }
      updateDwellProgress(1);
    }
  }

  function onGazeStatus(event) {
    gazePhase = event.detail && event.detail.phase ? event.detail.phase : 'ready';
    if (gazePhase !== 'live') {
      resetDwell();
    }
  }

  function loadSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.get(['gazeEnabled', 'gazeDwellMs', 'mouthCalV1', 'mouthClickEnabled']).then((stored) => {
      gazeEnabled = stored.gazeEnabled === true;
      mouthClickEnabled = stored.mouthClickEnabled === true;
      if (Number.isFinite(stored.gazeDwellMs)) {
        dwellThreshold = Math.max(300, Math.min(1200, stored.gazeDwellMs));
      }
      if (stored.mouthCalV1 && Number.isFinite(stored.mouthCalV1.threshold)) {
        mouthThreshold = stored.mouthCalV1.threshold;
      }
    }).catch((error) => {
      console.error('[SANCHALAN Keyboard] Failed to load gaze settings:', error);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }
      if (changes.gazeEnabled) {
        gazeEnabled = changes.gazeEnabled.newValue === true;
        resetDwell();
      }
      if (changes.mouthClickEnabled) {
        mouthClickEnabled = changes.mouthClickEnabled.newValue === true;
        if (!mouthClickEnabled) {
          mouthPressReadyTarget = null;
        }
      }
      if (changes.gazeDwellMs && Number.isFinite(changes.gazeDwellMs.newValue)) {
        dwellThreshold = Math.max(300, Math.min(1200, changes.gazeDwellMs.newValue));
        resetDwell();
      }
      if (changes.mouthCalV1) {
        mouthThreshold = changes.mouthCalV1.newValue && Number.isFinite(changes.mouthCalV1.newValue.threshold)
          ? changes.mouthCalV1.newValue.threshold
          : null;
        mouthState = null;
        if (mouthThreshold === null && mouthDragActive) {
          finishMouthDrag('Mouth calibration is unavailable.');
        }
      }
    });
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && panel && !panel.hidden) {
      setKeyboardOpen(false);
    }
  }

  loadStylesheet();
  createKeyboard();
  loadSettings();
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('input', onEditableInput, true);
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener(STATUS_EVENT, onGazeStatus);
  window.addEventListener(POINT_EVENT, onGazePoint, true);
  window.addEventListener('smile:click', onMouthClick);
})();
