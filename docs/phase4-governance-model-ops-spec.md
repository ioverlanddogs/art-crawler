# Phase 4 — Governance + Model Operations Spec

## Goal
Turn the admin suite into a safe control surface for configuration changes, model lifecycle operations, auditability, and operational governance.

## Objectives
- make global control actions deliberate and reversible where possible
- expose config and model state clearly
- show who changed what, when, and why
- reduce risk during activation, promotion, rollback, and maintenance actions
- provide strong operator trust through transparent audit trails

## In scope

### Config governance
- active config version summary
- config version list with status and metadata
- config diff view or change summary
- activation history
- rollback guidance or rollback action if supported
- impact messaging for global changes
- stronger confirmation and safety gates

### Model operations
- live model summary
- shadow model summary
- model version list with status
- promotion history
- promotion safety gate
- rollback guidance or rollback action if supported
- offline metrics snapshot display
- explicit “no auto-promotion” messaging

### Audit and change history
- audit feed for:
  - config activation
  - model promotion
  - moderation override/escalation if relevant
  - user/role changes if available
  - maintenance/global flag changes if available
- filters by actor, action, target, and time
- reason display for sensitive actions

### Governance states
- pending change
- active change
- failed change
- rolled back / superseded change
- unknown or incomplete audit context

## Out of scope
- full RBAC redesign
- deep ML evaluation workbench
- secret management redesign
- infra deployment migration
- external compliance export/reporting
