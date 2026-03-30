# Phase 3 Acceptance Criteria

Phase 3 is complete when all are true:

## Dashboard
- system health is understandable in under 10 seconds
- severity-ranked alerts are above the fold
- backlog and failure hotspots are visible
- degraded states are explicit

## Pipeline
- operator can identify failing stage quickly
- stage cards show health and recency
- failure hotspots are drilldown-capable
- partial telemetry degrades gracefully

## Investigations
- deep-linkable search works for candidate, batch, source, stage, and error
- lifecycle timeline explains available object history
- config/model context is visible
- retry/rejection/conflict context is visible
- missing telemetry is clearly labeled

## Cross-links
- dashboard, pipeline, and moderation can all hand off useful context into investigations
- browser back/forward preserves useful query state

## UX
- empty, degraded, partial-failure, and recovery states are explicit
- no critical state relies on color alone
- keyboard navigation remains usable on investigation results
