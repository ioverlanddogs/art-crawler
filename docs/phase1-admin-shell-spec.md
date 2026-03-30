# Phase 1 — Admin Shell Hardening Spec

## Goal
Turn the current admin MVP into a production-safe internal tool by improving:
- shared shell ergonomics
- top-bar operational context
- account/session affordances
- confirmation UX for sensitive mutations
- reusable success/error feedback
- accessibility of dialogs and mutation states

## In scope
### Shared shell
- Environment badge (`Production`, `Preview`, `Development`, `Unknown`)
- Pending moderation chip
- Failure/degraded chip with graceful `N/A` fallback
- Quick actions:
  - Open Queue
  - Investigate
- User/session display
- Sign-out affordance
- Preserve role-shaped navigation

### Reusable mutation UX
- `ConfirmDialog`
- `Toast` / `ToastRegion`
- `aria-live` feedback semantics
- disabled + pending states
- no browser-native `confirm()`

### Phase 1 surfaces
- Config activation
- Model promotion
- Moderation reject
- Moderation approve feedback

## Out of scope
- deeper moderation redesign
- saved views
- investigations timeline
- pipeline drilldown expansion
- backend contract redesign
