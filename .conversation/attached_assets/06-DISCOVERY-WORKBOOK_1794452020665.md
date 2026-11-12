# Collaborative discovery workbook

Status: not started. No answers below are implied.

## Stage 1 — constraints and audience
Ask:
- Who is the first user, and what happened the last time they needed help planning?
- What are the actual upcoming deadlines and assessment criteria?
- What would make the first delivered version successful?
Then establish available hours, skills, budget and hosting restrictions.

Output: constraints sheet and initial audience hypothesis.

## Stage 2 — problem
Capture:
- Specific situation:
- Existing workaround:
- Difficulty:
- Frequency and consequence:
- Evidence:
- Assumptions:
- What would disprove our hypothesis?

Output: short problem statement. Avoid defining the problem as "there is no app with these features."

## Stage 3 — solution options
Compare two or three approaches, including a simpler option without AI.
Identify the smallest useful end-to-end journey.
Output: chosen direction, tradeoffs and non-goals.

## Stage 4 — domain and flows
Clarify DAY/current chunk, GROW, FOCUS, sessions, reflections.
Resolve unfinished tasks, schedule editing, ownership and history.
Output: named flows and examples, then revise ERD.

## Stage 5 — AI layer
Choose actual AI jobs, necessary context, read/write permissions, confirmation, retention, failure fallback, limits and evaluation.
Output: AI capability/permission matrix.

## Stage 6 — UX and scope
Choose navigation, onboarding, bilingual priority, customization and theme presentation.
Sort features: essential / next / experiment / excluded.
Output: first-delivery scope and low-detail screen flow.

## Stage 7 — technical feasibility
Verify runtime, database and deployment compatibility, dependency versions, budgets and provider constraints.
Output: feasible architecture and explicit unresolved blockers.

## Stage 8 — build agreement
For each milestone define:
- User outcome.
- Included workflow.
- Exclusions.
- Data model changes.
- Acceptance criteria.
- Tests/checks.
- Estimated effort range and risk.
- Review point.

Wait for "start building" before implementation.

## Decisions log
| ID | Question | Options | Decision | Reason/evidence | Status/date |
| --- | --- | --- | --- | --- | --- |
| D001 | First audience | Open | Not decided | Discovery needed | Open |
| D002 | First delivery scope | Open | Not decided | Actual deadline needed | Open |
| D003 | Readiness history | Separate checkins / current fields | Not decided | Both discussed | Open |
| D004 | Payment level | Demo / provider test / live | Not decided | Cost and assessment | Open |
| D005 | Prayer-time source | Manual / calculated | Not decided | Privacy and feasibility | Open |
| D006 | Session completion rules | Manual / automatic / combined | Not decided | Avoid double counting | Open |
| D007 | Replit hosting compatibility | Verify required stack | Not decided | Current docs needed | Open |

## First authentication acceptance criteria — candidate
- Registration creates user role only.
- Duplicate email and mismatched passwords produce useful errors.
- Passwords are hashed, not stored/displayed as plain text.
- Wrong credentials fail; login is throttled.
- Login regenerates session.
- User/admin destinations reflect server role.
- Direct non-admin access to admin route is denied.
- Logout ends access to protected routes.
- No secrets are committed.
- Tests and actual run results are reported.
Custom visual design, email delivery, verification and password-reset completion must have an explicit scope decision.

## Progress reporting
Report what works, what was checked, what failed, and what remains.
Do not equate generated files with working features.
Keep the scope and documents aligned when decisions change.

