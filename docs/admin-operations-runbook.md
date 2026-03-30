# Admin operations runbook

This runbook covers the day-to-day operation of the Artio web UI once it is deployed.

## Primary operational goals

Use the admin panel to:
- confirm the pipeline is accepting imports
- monitor the moderation queue
- review and approve or reject candidates
- inspect config state
- investigate import failures

## Daily checks

At minimum, an operator should check:
- dashboard loads successfully
- moderation queue count is reasonable
- import batches are arriving
- failed imports are not increasing unexpectedly
- the active config is correct
- `mining_import_enabled` is in the intended state

## Moderation workflow

1. Open the moderation queue.
2. Sort by newest or highest-priority candidates.
3. Review candidate details and source evidence.
4. Approve or reject.
5. Confirm the queue count updates correctly.

If a candidate seems wrong but the source data is clearly valid, record feedback and investigate scoring, normalization, or dedup behavior.

## Import troubleshooting

If new candidates are not appearing:

1. Check that the mining worker is running.
2. Check worker logs for export or import errors.
3. Confirm `PIPELINE_IMPORT_URL` points at the deployed Vercel domain.
4. Confirm `MINING_IMPORT_SECRET` matches on both sides.
5. Check whether `mining_import_enabled` is false.
6. Inspect recent import batch status in the UI or API.

## Auth troubleshooting

If admins cannot sign in:

1. Confirm `NEXTAUTH_SECRET` is set.
2. Confirm `NEXTAUTH_URL` matches the deployed domain.
3. Confirm the user exists in the app DB.
4. Review Vercel function logs for auth errors.

## Safe-change rules

Before changing config or model state:
- confirm the user has admin access
- record why the change is needed
- verify the current state first
- make one change at a time
- verify moderation/import behavior after the change

## Incident notes

### Imports failing entirely
Likely causes:
- bad shared secret
- wrong import URL
- app deployment error
- DB connectivity problem

### Moderation queue empty unexpectedly
Likely causes:
- mining not exporting
- import requests failing
- `mining_import_enabled=false`
- aggressive dedup filtering

### Admin routes redirect unexpectedly
Likely causes:
- missing auth session
- bad `NEXTAUTH_URL`
- middleware/auth configuration mismatch

## Rollback guidance

If a deploy breaks the web UI:
- roll back the Vercel deployment
- verify database connectivity
- confirm environment variables were not changed incorrectly
- re-run smoke verification after rollback

If a config change causes bad moderation behavior:
- restore the previous active config version
- verify queue visibility and batch handling after rollback

## Useful manual checks

### Queue endpoint
Use an authenticated session to verify:

```text
GET /api/admin/moderation/queue
```

### Import endpoint
Use a worker-style bearer token to verify:

```text
POST /api/pipeline/import
```

### UI pages
Check these pages after deploy:
- `/`
- `/dashboard`
- `/moderation`
- `/pipeline`
- `/config`
- `/system`
