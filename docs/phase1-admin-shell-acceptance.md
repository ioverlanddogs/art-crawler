# Phase 1 Acceptance Criteria

Phase 1 is complete when all are true:

## Shell
- admin shell shows environment badge
- shell shows account/session context
- sign-out action is available
- quick actions exist for queue and investigations
- missing counts degrade to `N/A` without crashing

## ConfirmDialog
- reusable component exists
- no browser-native `confirm()` on Phase 1 surfaces
- supports keyboard dismissal
- restores focus on close
- supports optional typed token
- supports optional required reason

## Feedback
- reusable toast/feedback component exists
- success/error/info variants supported
- visible dismiss affordance
- `aria-live` semantics present
- config + moderation use reusable feedback

## UX
- pending mutations disable repeated actions
- reject path is safer than direct destructive action
- approve path remains fast
- feedback is visible without relying on color alone
