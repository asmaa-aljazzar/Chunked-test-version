---
name: Task history across day changes
description: Preserve the meaning of existing tasks when a user changes recurring day chunks.
---

Before applying a rhythm change that affects assigned tasks, ask the user to confirm. Let them choose to delete affected tasks or move them to a new chunk. The first version uses deterministic time-based rules only when there is a unique greatest time overlap; otherwise tasks stay unassigned and the user is told. Priority-aware AI suggestions are a later feature and must never act without user confirmation.

**Why:** A core product problem is restarting plans without losing context; preserving prior task meaning avoids replacing one source of confusion with another.

**How to apply:** Show which tasks are affected before saving rhythm edits, removals, or reordering. Use time information to move a task only when the best overlap is unambiguous; otherwise leave it unassigned. Any future AI suggestion must be confirmed before moving or deleting tasks.
