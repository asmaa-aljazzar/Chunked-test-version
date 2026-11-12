---
name: Task history across day changes
description: Preserve the meaning of existing tasks when a user changes recurring day chunks.
---

Before applying a rhythm change that affects assigned tasks, ask the user to choose an action for each task: move it, leave it unassigned, or delete it. Suggest a destination by exact chunk name or clear day-part meaning first, then by time overlap when times are available. The user must confirm each task's choice. Priority-aware AI suggestions are a later feature and must never act without confirmation.

**Why:** A core product problem is restarting plans without losing context; preserving prior task meaning avoids replacing one source of confusion with another.

**How to apply:** Show all affected tasks and a destination suggestion before saving rhythm edits, removals, or reordering. Require an explicit destination or action for every task; use time information only when the overlap is unambiguous. Any future AI suggestion must be confirmed before moving or deleting tasks.
