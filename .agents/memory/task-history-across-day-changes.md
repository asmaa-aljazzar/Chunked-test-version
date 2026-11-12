---
name: Task history across day changes
description: Preserve the meaning of existing tasks when a user changes recurring day chunks.
---

When a user edits their recurring day rhythm, do not silently reassign or erase tasks planned under old chunks. Preserve the old chunk identity and present affected unfinished tasks as unassigned until the user confirms a new placement.

**Why:** A core product problem is restarting plans without losing context; preserving prior task meaning avoids replacing one source of confusion with another.

**How to apply:** Apply this to edits, removals, and reordering of day chunks. Rescheduling always requires an explicit user decision.
