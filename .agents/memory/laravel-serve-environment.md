---
name: Laravel server environment
description: Keep workflow-provided settings available to Laravel's HTTP request process.
---

Laravel's `artisan serve` can filter environment variables before launching its PHP server child. When the preview relies on workflow-injected database or URL-scheme settings, start it with `--no-reload` or another server command that passes those variables through.

**Why:** Otherwise migrations can run with the intended MySQL settings while HTTP requests silently use different settings from `.env`, leading to broken persistence or insecure asset and redirect URLs.

**How to apply:** When changing `dev.sh` or Laravel's server startup, verify the spawned PHP server process receives the same database and proxy/HTTPS configuration as the migration process. Keep preview-only HTTPS forcing out of the local XAMPP defaults.

After a failed or interrupted Chunked web workflow start, its earlier `dev.sh` child processes may still hold ports 3306 and 25067 even while the workflow is marked failed.

**Why:** A retry once failed to start MariaDB because the previous preview run was still alive; stopping its owning shell cleanly ran the cleanup trap and allowed a fresh start.

**How to apply:** Before retrying, inspect process ownership and both ports. Stop the stale `dev.sh` shell cleanly, then restart the managed `artifacts/chunked: web` workflow. This recreates its temporary preview database, so warn the user about preview data loss.
