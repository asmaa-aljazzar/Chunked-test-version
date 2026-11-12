# Experience and domain logic — draft

## Core concepts
- Day structure: one user's saved configuration for organizing a day.
- Chunk: a recurring named period within that structure.
- Task: a dated action, optionally placed in a chunk and linked to a goal.
- Goal: a longer-term outcome.
- Habit: a recurring action with daily completion records.
- Focus choice: the currently chosen direction and next step; not a work timer.
- Session: a study/work effort in a particular chunk; not evidence a goal was completed.
- Reflection: user-authored review.
- Insight: a summary derived from actual activity, optionally interpreted by AI.

Naming and the distinction between goal and focus require user testing.

## Candidate navigation
Dashboard, DAY, GROW, FOCUS, Review (Insights/Reflections), Settings.
Plans may be reached through account/upgrade.
The AI companion is available in the shared layout rather than requiring a standalone chat page.
These are candidates, not final information architecture.

## Authentication
One users table and one login form.
Public registration creates role=user regardless of submitted role.
Admin accounts are provisioned privately.
Protected pages require authentication; admin features require backend authorization.
Login/logout use server sessions; logout invalidates the session.
Email verification, reset delivery and account deletion need explicit delivery decisions.

## Onboarding
Keep skippable with defaults; allow later changes.
Candidate steps:
1. Language selection/automatic detection.
2. Needs, planning obstacles, preferred support style and proactive-help preference.
3. Day structure choice and chunk preview/editing.
4. Appearance and navigation preference.
5. Optional first task.

Do not make AI availability a prerequisite for onboarding. Store answers and use them only for a clear purpose. Determine which questions change product behavior; remove decorative questions.

## Day structure and chunks
Starting choices: prayer-based, time-of-day, work, school/university, custom.
Templates initialize editable chunks; they are not paid printable templates.
One saved structure per user is the present MVP assumption.
Time-of-day example: morning, afternoon, evening, night.
Work/school examples adapt to user's start/end times.
Prayer times change by date and location; timezone alone does not determine them.
Decide manual times versus an external calculation service before implementation.
Handle midnight-crossing periods, gaps/overlaps and timezone changes.
Never rewrite historical task/session meaning when a user edits their routine. Decide snapshots/versioning or preserving old chunk records before shipping schedule edits.

## DAY and current chunk
DAY shows a chosen date and its chunks/tasks.
Current chunk narrows attention to the selected/current period.
A card may show several checklist items; cards are interface grouping, not necessarily database entities.
Task completion is separate from timer completion.
A task may be unassigned to a chunk.
Unfinished-task behavior is open: stay on original date, manually reschedule, or offer rollover.
Past-date creation restrictions appeared in prototype notes but are not an approved rule; reconcile historical logging with assessment needs.
Empty states should invite the first real action rather than populate fake personal progress.

## Dashboard
Candidate contents: current chunk, today's priorities, habit check-ins and active goal/focus.
Reuse actual data; avoid a second independently maintained task list.
Do not present mock metrics as real progress.

## Goals and habits
Tasks and habits may exist without a goal.
Goal status: active, paused, completed, archived.
Goal progress formula is open; do not invent a meaningful percentage from unrelated counts.
Habit schedule currently uses weekday arrays; daily means seven days.
One completed habit log per habit per date; no row means no recorded completion.
Distinguish "not scheduled" from "missed" in reports.
Determine how schedule edits affect historical streaks before claiming accurate streak analytics.

## FOCUS
A user may retain many historical focus records, but at most one is active.
Focus may optionally link to a goal.
Readiness: ready, needs preparation, blocked.
Focus check-in history is an unresolved choice:
A. Keep focus_checkins for history.
B. Store current readiness/readiness_note directly on focus_choices and remove focus_checkins.
Do not implement both stores for the same state without defining their roles.
Switching an active focus pauses/completes the previous one atomically, including concurrent requests.
Completing tasks does not automatically complete a focus/goal unless the user approves an explicit rule.

## Sessions — latest correction
Each session belongs to a user and one REQUIRED chunk.
Sessions DO NOT have focus_choice_id, goal_id or task_id.
The current-chunk prototype has a timer, pause/resume/reset, manual "Log session", a separate session counter, a break timer, and task cards showing three items at a time.
That prototype is not a final persistence design.

Session model must distinguish active focused duration from elapsed wall time.
Candidate duration_seconds records actual focused time excluding pauses.
Open:
- Do finished timers log automatically, manually, or both with deduplication?
- Can unfinished/abandoned sessions exist? What counts toward totals?
- Is "study/work" useful or should session type be optional/removed?
- How does a manual log work without a known start time?
- Do active timers survive reload or switching devices?
- Is break history needed, or is a transient break display enough?
- What happens when a session crosses a chunk boundary?
Chunk is selected when a session starts; agree whether it stays attached or must split.
No session_items junction is required merely because a card contains many tasks.

## Reflections and insights
Multiple reflections per date are currently permitted.
A conversation may optionally link to a reflection.
Insights should distinguish measured activity from speculative AI interpretation.
AI feedback does not overwrite reflection text.
Avoid medical or diagnostic claims.

## Preferences and themes
Interface language: auto/ar/en.
Explicit account preference wins; otherwise choose a supported browser preference, then fallback.
RTL/LTR support affects layout, not translation itself.
Sidebar/topbar affects navigation presentation, not permissions.
Themes use a stable frontend key; user_settings stores one selected theme.
Theme access must follow current subscription entitlement.
Decide a fallback if a premium subscription ends.
AI conversation language can be independent if needed; no field is mandatory until the behavior is approved.

## Subscription and payment logic
Plan is a product/price/billing option; subscription connects user and plan; transaction records payment.
No order or order_items tables under a single-plan checkout.
Only one active subscription per user; handle concurrent callbacks.
Demo payment must be clearly labeled. Real subscription access must not trust browser "success".
Provider confirmation/webhooks are verified and idempotent.
Do not store payment-card details.
Status and timestamp meanings, cancellation-at-period-end, renewal, refunds, plan changes, and failed attempts require agreement before live billing.

