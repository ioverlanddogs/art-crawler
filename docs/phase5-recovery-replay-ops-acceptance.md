# Phase 5 Acceptance Criteria

Phase 5 is complete when all are true:

## Recovery overview
- operator can tell whether the system is paused, replaying, draining, degraded, or recovered
- recent failed work is visible
- replay-eligible work is visible
- recovery states are explicit and do not rely on color alone

## Replay / retry controls
- replay and/or retry actions are clearly scoped
- operator sees what the action affects before confirming
- reason capture is supported for sensitive recovery actions
- success and failure feedback is visible
- unsafe or blocked replay states are clearly labeled

## Safeguards
- UI explains idempotency/duplicate/conflict risks
- import suppression or pause state is visible where data exists
- high-scope recovery actions use stronger confirmation than routine actions
- missing support for dry-run or rollback is stated honestly when absent

## Audit
- operator can see who initiated a replay/retry/pause/resume action
- reason, target scope, outcome, and time are visible
- failed recovery actions are visible
- related audit context is reachable from the recovery UI

## UX
- recovery actions use plain language
- state labels are textual, not color-only
- keyboard and focus behavior remain accessible
- partial telemetry degrades gracefully without breaking the page
