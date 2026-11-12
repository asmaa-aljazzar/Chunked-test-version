# Technical direction — desired, subject to feasibility

## Current preference
- Laravel backend; existing exploratory setup used Laravel 12 and PHP 8.2.
- React frontend with Inertia.
- MySQL-compatible database.
- One application/repository to simplify web delivery.
- Future React Native app may reuse backend domain logic via APIs.

Starting from zero does not automatically mean using the old installed versions. Agree compatible supported versions after checking the target environment, academy requirements and official documentation.

## Replit feasibility gate
Before generating code, verify with current official documentation:
- PHP and required extensions, Composer and Artisan execution.
- Node, package manager and React/Vite builds.
- Development web-server/process setup versus production serving.
- Persistent database availability and supported engine/version.
- Secrets, migrations, logs, HTTPS, sessions and storage.
- Long-lived streams/voice constraints, background workers and scheduled tasks.
- Deployment lifecycle, persistent files, backups, sleep/timeouts, domains.
- Current plan allowances and separate provider/deployment/database costs.

Do not assert Replit Core includes a particular deployment or external API allowance without checking. If a requirement is unsupported, explain options and ask the founder; do not replace the stack silently.

## Architecture proposal
React pages/components:
- Shared application layout, navigation and companion.
- Feature pages and reusable controls.
- Presentation and ephemeral interaction state.

Laravel:
- Routes/controllers, validated requests and authorization.
- Domain operations for tasks, habits, focus activation and subscription changes.
- Persistence through migrations/Eloquent.
- AI provider adapter and authorized context assembly.
- Payment adapter and verified callbacks.

Database:
- Durable user data and integrity constraints.
- Indexes supporting actual queries, not arbitrary duplication.

Do not duplicate the entire web backend into a separate API project now. Keep domain operations independent of rendering so mobile endpoints can be added later.

## Authentication
One users table, role=user/admin, one session-based login.
Registration cannot choose admin.
Hash passwords; never return password hashes.
Session regeneration on login and invalidation on logout.
Server-side authorization for admin routes and ownership for personal data.
Throttle login and sensitive endpoints.
If using scaffolding, inspect versions and generated behavior rather than mixing Breeze and Fortify examples blindly.
Future mobile authentication is a separate decision.

## Data integrity
Foreign keys alone do not enforce same-user links.
Enforce ownership on tasks/chunks/goals, habits/goals, focus/goals, sessions/chunks, conversations/reflections.
At-most-one active focus/subscription must hold under concurrent requests, not just a UI switch.
Use transactions and appropriate locking/constraints for the chosen database.
MySQL does not provide PostgreSQL-style partial unique indexes directly.
Use unique constraints for email, one settings/structure per user, and habit/date and onboarding question pairs.

## Time
Store event instants consistently (typically UTC) and display using the user's IANA timezone.
Dates for planned tasks/habit logs/reflections follow approved local-day semantics.
Prayer times need location/calculation settings beyond timezone.
Paused duration cannot be derived from start/end alone.
Plan handling of daylight saving, midnight-crossing chunks and historical configuration changes.

## Delivery quality
- Secure validation and authorization tests.
- User-isolation tests (cross-account IDs are rejected).
- Persistence and refresh checks.
- Arabic/English, narrow screens, keyboard and reduced-motion checks.
- Build and deployment checks.
- No fake user metrics, hidden API keys or committed .env.
- .env.example documents placeholders.
- Separate demo/test/live payment behavior.
- Useful error/empty/loading states.

## Proposed implementation sequence, not authorization
1. Verified runtime + database + authentication + protected role destinations.
2. Shared accessible layout and essential preferences.
3. DAY/current chunk with persisted tasks.
4. Goals/habits and chosen FOCUS behavior.
5. Chunk sessions with clear completion rules.
6. Dashboard and reflections using actual data.
7. One useful AI workflow, then broader context/insights.
8. Subscription checkout at agreed demo/test level.
9. Polish and deployment; voice/3D only if justified.

Actual milestone scope and dates must be agreed after discovery.

