# SANCHALAN on-screen keyboard

This folder contains an isolated on-screen keyboard content-script feature. It
adds a floating QWERTY keyboard with number keys, shift, backspace, space,
enter, a close control, local word suggestions, text-field insertion, and gaze
dwell selection. It does not include or modify voice-command behavior.

## Integration status

The extension manifest loads `keyboard/keyboard.js` after the gaze scripts and
exposes `keyboard/keyboard.css` as a web-accessible resource.

The current gaze dwell code handles links and its own close button, not generic
buttons. This keyboard therefore handles dwell selection for its launcher and
keys from the existing `gaze:point` and `gaze:status` events, using the saved
`gazeEnabled` and `gazeDwellMs` settings. While gaze is over the keyboard, the
page's link-dwell handler ignores targets behind it, and the gaze pointer is
painted above the keyboard.

## Text insertion

The keyboard remembers the last focused editable field and selection. It
supports text-like inputs, textareas, and contenteditable regions. Input and
textarea edits use `setRangeText`; contenteditable edits use the saved DOM
selection range. Disabled and read-only fields are ignored. Enter inserts a
line break in multiline fields and contenteditable regions.

The suggestion row provides local prefix completion from a small common-word
list and common next-word pairings. It does not use WhatsApp's or the operating
system's native keyboard suggestion service, which a page content script
cannot read.

The left/right controls move the insertion point by one character in supported
editable fields. On-screen keys have larger targets; gaze selection keeps the
current key through small movements into its surrounding gap and highlights the
target and dwell progress before activation. Keyboard dwell takes twice the
configured gaze dwell duration, giving extra time to confirm the blue progress
before a key activates.

The dashed header control supports gaze-and-mouth repositioning when mouth
calibration is saved: look at the handle and close the mouth to start dragging,
move the gaze pointer while keeping the mouth closed, then open the mouth to
drop. Pointer dragging is also available. Mouth calibration is required for
mouth-controlled dragging; existing mouth-click and voice features are not
changed.

When the existing Mouth Click option is enabled and calibrated, opening the
mouth also presses the currently targeted keyboard key once its blue dwell
progress reaches 50%. Full gaze dwell and pointer clicks remain available.

## Manual test after integration

1. Reload the extension and refresh a page; confirm the gaze pointer remains
   visible above the keyboard.
2. Focus a text input, textarea, or contenteditable region, then open the
   keyboard.
3. Dwell on keys and suggestions; confirm the target key remains highlighted
   during small gaze movements near its edge and dwell progress follows it,
   suggestions appear for typed prefixes, and selecting a suggestion completes
   the current word.
4. Use left/right controls to move the caret through a word, then verify text
   and suggestions follow the new caret position.
5. Test space, backspace, shift, and enter, then verify text stays at the
   intended caret/selection.
6. After mouth calibration, gaze at the dashed header and close your mouth to
   start a drag. Move gaze while keeping it closed, then open your mouth to
   drop; verify the keyboard stays within the viewport.
7. Enable and calibrate Mouth Click, gaze at a key until its blue progress is
   at least halfway, then open your mouth; confirm the key activates once.
   Confirm opening your mouth earlier does not activate it and full gaze dwell
   still does.
8. Verify the feature does not alter any voice-command controls or behavior.
