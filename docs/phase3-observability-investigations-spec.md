# Phase 3 — Observability + Investigations Spec

## Goal
Turn Dashboard, Pipeline, and Investigations into a real operations console for monitoring the data pipeline, triaging failures, and tracing what happened to a candidate or batch.

## Objectives
- understand system health in under 10 seconds
- localize failures in under 30 seconds
- explain what happened to a candidate or batch from UI alone
- make degraded and partial failure states explicit
- support deep-linkable investigations

## In scope
### Dashboard
- active config version
- active model version
- pending moderation
- failures in last 24h
- backlog and oldest pending
- last successful import
- severity-ranked alerts
- recent import/export activity

### Pipeline
- stage-by-stage operational cards
- throughput
- queue depth
- failure hotspots
- retry counts
- last successful run
- recent import/export failures
- drilldown links into investigations

### Investigations
- search by candidate ID, batch ID, source URL, fingerprint, stage, error
- lifecycle timeline
- config/model version context
- retry and conflict context
- deep-linkable URL state
- moderation/pipeline/dashboard handoff

### Operational states
- empty
- degraded
- partial failure
- blocking failure
- recovery

## Out of scope
- ML evaluation suite
- policy engine
- infra migration
- major backend schema redesign
