# Phase 2 — Moderation Workbench Spec

## Goal
Turn the current moderation screen into a high-speed operator workbench optimized for repeated review, decision confidence, and investigation handoff.

## Objectives
- maximize moderation throughput
- reduce decision latency
- preserve operator context
- improve confidence and traceability
- support keyboard-first workflows

## In scope
### Queue workbench
- URL-stateful filters:
  - q
  - platform
  - status
  - confidence band
  - selected item
- persistent selection after actions when possible
- stronger row highlighting and queue position cues
- empty / degraded / no-results states

### Keyboard workflow
- `j/k` row navigation
- `enter` open detail
- `a` approve
- `r` reject
- `/` focus search
- `esc` close detail

### Candidate detail panel
- candidate ID
- import batch ID
- source URL
- config version
- confidence explanation
- timestamps
- moderation history
- rejection note + reason capture
- link to Investigations

### Decision safety
- reject reason taxonomy
- freeform moderator note
- undo last reject where feasible
- conflict-safe expected status handling

## Out of scope
- bulk moderation
- saved views
- policy engine
- auto-approval heuristics
- investigations timeline internals
