# Phase 5 Tickets

## Epic 1 — Recovery overview
- [ ] recovery status banner
- [ ] recent failed batches list
- [ ] replay-eligible failures list
- [ ] import/pipeline pause-state visibility
- [ ] draining/replaying indicators
- [ ] partial recovery messaging

## Epic 2 — Replay and retry controls
- [ ] replay action surface
- [ ] retry action surface
- [ ] scope summary before action
- [ ] reason capture for recovery action
- [ ] idempotency/conflict warning copy
- [ ] dry-run guidance if no dry-run exists
- [ ] success/failure feedback for recovery actions

## Epic 3 — Safeguards
- [ ] blocked/unsafe replay state
- [ ] duplicate/conflict warning
- [ ] source/import suppression visibility
- [ ] explicit “what this affects” messaging
- [ ] stronger confirmation flow for high-scope actions

## Epic 4 — Recovery audit
- [ ] audit feed for replay/retry/pause/resume
- [ ] actor filter
- [ ] action filter
- [ ] target scope filter
- [ ] reason visibility
- [ ] failed recovery action visibility
- [ ] links from recovery actions to audit context

## Epic 5 — UX states
- [ ] paused state
- [ ] replaying state
- [ ] draining state
- [ ] partially recovered state
- [ ] recovered state
- [ ] incomplete telemetry fallback state
