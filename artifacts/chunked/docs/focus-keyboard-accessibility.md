# Focus room keyboard accessibility check

Run this check on the focus room with a keyboard only. No pointer interaction should be needed.

## Keyboard flow

1. Reload the room and press `Tab` repeatedly. Focus should move through Leave room, the session controls, and the room toolbar. Open a panel; focus should move to its Close panel button, then continue through its controls. `Shift+Tab` should reverse the order.
2. Confirm focused buttons, inputs, and selects have a visible outline. `Tab` should move past the last control in a regular panel. Modal confirmation dialogs may contain focus while open; their close, cancel, or Escape action should let focus return to the room.
3. Operate the session with `Enter` or `Space`. Start/pause actions should have clear action names; when available, “Reset this session” should be announced by name. Disabled session actions should be skipped by Tab.
4. Open Timer settings and edit Focus length, Break length, and Planned sessions. Each number field should be announced with its associated label. The transition radio choices should be keyboard-operable as one group.
5. Open Tasks. With multiple parent-task pages, use `Next` and `Previous`; the page number should be announced and the unavailable direction should be natively disabled. Mark a parent task complete and use any small-step checkboxes. Each should retain focus and expose its current state.
6. Open Background and select a saved background or add a YouTube link. Use the available background/player control; it should have a clear name and be disabled when the chosen option cannot be started.
7. Open Sound. Choose a sound source with the radio buttons, select a library track, then operate playback and mute/volume. The selected source/track and toggle controls should expose their current state. Sound must not start just from selecting a source.
8. Close a panel with its Close panel button or Escape. Focus should return to the toolbar button that opened it. Regular panels must not trap focus.

## Accessibility semantics covered in the interface

- Session actions and reset use native buttons; disabled start/finish actions use the native `disabled` state.
- Focus and break lengths have associated labels; transition choices use a fieldset and native radio buttons.
- Parent-task completion has a task-specific accessible name and `aria-pressed`; checklist items are native labeled checkboxes.
- Parent-task pagination has labeled navigation, native disabled boundary controls, and a polite page announcement.
- Room toolbar panels expose `aria-pressed`; saved background and audio choices expose their selection state.
- Library playback and background-video audio expose pressed state; mute is a named pressed-state toggle.
- Button, input, select, textarea, and summary controls have visible focus indicators. Panels move focus in and back to their opener without trapping it; modal dialogs manage focus while open.
