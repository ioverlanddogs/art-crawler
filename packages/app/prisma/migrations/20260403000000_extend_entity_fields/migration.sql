-- Extend Venue with arts-platform fields
ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "address"      TEXT,
  ADD COLUMN IF NOT EXISTS "phone"        TEXT,
  ADD COLUMN IF NOT EXISTS "email"        TEXT,
  ADD COLUMN IF NOT EXISTS "bio"          TEXT,
  ADD COLUMN IF NOT EXISTS "openingHours" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl"   TEXT,
  ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "imageUrl"     TEXT;

-- Extend Artist with arts-platform fields
ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "nationality"  TEXT,
  ADD COLUMN IF NOT EXISTS "birthYear"    INTEGER,
  ADD COLUMN IF NOT EXISTS "medium"       TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl"   TEXT,
  ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT;

-- Extend Artwork with arts-platform fields and FK relations
ALTER TABLE "Artwork"
  ADD COLUMN IF NOT EXISTS "artistId"     TEXT,
  ADD COLUMN IF NOT EXISTS "venueId"      TEXT,
  ADD COLUMN IF NOT EXISTS "medium"       TEXT,
  ADD COLUMN IF NOT EXISTS "year"         INTEGER,
  ADD COLUMN IF NOT EXISTS "price"        TEXT,
  ADD COLUMN IF NOT EXISTS "availability" TEXT;

-- Add FK constraints for Artwork relations
ALTER TABLE "Artwork"
  ADD CONSTRAINT "Artwork_artistId_fkey"
    FOREIGN KEY ("artistId")
    REFERENCES "Artist"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Artwork"
  ADD CONSTRAINT "Artwork_venueId_fkey"
    FOREIGN KEY ("venueId")
    REFERENCES "Venue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for FK lookups
CREATE INDEX IF NOT EXISTS "Artwork_artistId_idx" ON "Artwork"("artistId");
CREATE INDEX IF NOT EXISTS "Artwork_venueId_idx"  ON "Artwork"("venueId");
