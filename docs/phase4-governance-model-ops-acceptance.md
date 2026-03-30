# Phase 4 Acceptance Criteria

Phase 4 is complete when all are true:

## Config governance
- current active config is obvious
- config versions include useful metadata
- activation history is visible
- impact of activation is clearly explained
- change safety flow is stronger than a simple confirm
- rollback path or rollback guidance is visible

## Model operations
- current live and shadow model state is obvious
- model version status is understandable
- promotion history is visible
- promotion safety flow is explicit and deliberate
- offline metrics context is visible where available
- UI clearly states that shadow models do not auto-promote

## Audit
- operator can see who changed what, when, and why
- audit feed supports useful filtering
- failed or partial changes are visible
- missing audit context is labeled honestly

## UX
- global actions are visually distinct from routine actions
- no critical state relies on color alone
- safety messaging uses plain language
- related audit context is reachable from config/model views
