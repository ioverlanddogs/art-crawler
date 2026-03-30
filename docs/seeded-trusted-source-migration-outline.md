# Seeded Trusted Source URL Migration Outline (V1)

## 1) Prisma schema updates
- Add `TrustedSource` model with seeded-source governance and health metadata.
- Extend `MiningCandidate` with trusted-source linkage, fetch metadata, parser metadata, and retry/error tracking.
- Add relation `MiningCandidate.sourceId -> TrustedSource.id`.

## 2) SQL migration steps
1. Create `TrustedSource` table.
2. Add new nullable columns to `MiningCandidate`:
   - `sourceId`, `sourceDomain`, `discoveredFromUrl`, `canonicalUrl`
   - `fetchStatusCode`, `fetchContentType`, `fetchedAt`, `rawHash`
   - `parserType`, `discoveryMethod`, `entityType`, `region`
   - `retryCount` (default `0`), `lastError`
3. Add foreign key from `MiningCandidate.sourceId` to `TrustedSource.id` (`ON DELETE SET NULL`).
4. Add indexes:
   - `MiningCandidate(sourceId)`
   - `MiningCandidate(canonicalUrl)`
   - `MiningCandidate(createdAt)`
   - `TrustedSource(status)`
   - `TrustedSource(domain)`
5. Backfill optional data for existing rows as needed (e.g. `discoveryMethod='legacy'`).

## 3) Seed rollout
1. Run `npm --workspace @artio/mining run prisma:generate`.
2. Apply DB schema changes (`prisma migrate deploy` in deploy environments).
3. Run `npm --workspace @artio/mining run prisma:seed`.
4. Validate at least one `TrustedSource` row is `ACTIVE`.
