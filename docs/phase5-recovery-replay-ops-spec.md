# Phase 5 — Recovery + Replay Operations Spec

## Goal
Turn the admin suite into a practical incident response surface for recovering from degraded pipeline states, replaying failed work safely, and managing temporary operational controls during outages or bad deployments.

## Objectives
- let operators recover from partial failures without leaving the UI
- make replay/retry actions explicit, scoped, and auditable
- support safe pausing, draining, and resuming of pipeline intake where available
- make recovery state visible and understandable
- reduce risk of repeated bad imports or accidental reprocessing

## In scope

### Recovery controls
- replay guidance and/or replay actions for failed imports, batches, or stages where supported
- retry visibility and retry history
- safe recovery actions with impact messaging
- maintenance or pause-state visibility where supported
- import-enabled / pipeline-enabled control visibility
- recovery-status banners (recovering, paused, draining, replaying)

### Replay and retry operations
- recent failed batch list
- replay-eligible failures list
- replay scope summary:
  - candidate/batch/stage/system scope
- conflict/idempotency messaging
- dry-run guidance if full dry-run is not supported
- explicit operator reason capture for recovery actions

### Source / ingestion safeguards
- visibility into source disable/enable state where available
- import suppression state where available
- warnings when replay may duplicate or conflict with prior work
- clear “what this action affects” copy

### Recovery auditability
- audit feed for:
  - replay actions
  - retry actions
  - maintenance toggles
  - pause/resume actions
  - source disable/enable actions where available
- actor, reason, outcome, time, target scope
- failed recovery action visibility

### Recovery states
- paused
- replaying
- draining
- partially recovered
- recovered
- blocked / unsafe to replay
- unknown state because telemetry is incomplete

## Out of scope
- full workflow orchestration redesign
- distributed queue control-plane redesign
- automatic incident remediation
- infra autoscaling changes
- external paging/on-call tooling integration
