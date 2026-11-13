---
name: Chunked roadmap and domain terms
description: User-defined release order and boundaries for core planning, Insights, AI, and payments.
---

Build Chunked in this order: DAY first, then My Focus, then habits. Do not create a separate Goals feature because it overlaps with My Focus. Tasks, habits, and My Focus must work independently of goals.

My Focus is an ongoing direction or interest, separate from a dated task and a timer. Users may keep multiple focus choices, have at most one active, record readiness, a blocker, and a next step, then pause or complete a focus. The Focus Room is the timer environment inside a chunk. Pomodoro sessions belong to a user and a required chunk, not to My Focus, a goal, or a task; completing a session never completes a task or My Focus.

Habits should support create/edit/archive, scheduled weekdays, checkoff and undo for today, at most one completion per habit and date, and a distinction between unscheduled and missed days. Define historical schedule behavior before any streak calculations.

After DAY, My Focus, and habits are reliable, build reflections and Insights from saved tasks, habits, and sessions. Define metrics, show useful empty states, and keep measured activity separate from AI interpretation.

Add AI only after core workflows and Insights work reliably. AI jobs may include suggesting next steps, breaking down tasks, or discussing reflections. Use only relevant authorized data, keep the app usable when AI fails, confirm before applying suggestions, and include validation, usage limits, error handling, and appropriate conversation persistence.

Add plans and payments only at an agreed demo, provider-test, or live level. Verify payment outcomes on the backend, handle duplicate callbacks safely, and never store card details. Defer separate Goals, community, marketplaces, voice, 3D characters, mobile apps, and other new features until core functionality, Insights, AI, and payments are complete; record new ideas in a backlog.

**Why:** The user set this delivery order to keep implementation incremental and prevent optional features from preceding reliable core workflows.

**How to apply:** Complete DAY, then My Focus, then habits, then data-based reflections/Insights, AI, and payments. Define acceptance criteria before implementation. Preserve the existing design where it works and build through Laravel + React with database persistence, validation, and user ownership.
