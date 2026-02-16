-- Bug #64: Add indexes for contact search performance
-- The Contact search uses case-insensitive LIKE queries (mode: 'insensitive')
-- Without indexes, PostgreSQL does a full table scan on every search.

-- GIN trigram indexes for case-insensitive LIKE/ILIKE queries
-- NOTE: pg_trgm extension must be enabled. If you don't have superuser access,
-- ask your DB admin to run: CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Non-CONCURRENTLY indexes (safe inside Prisma transaction)
-- These will briefly lock the table during creation, but Contact tables are
-- typically small enough that this takes < 1 second.
-- If your Contact table has millions of rows, run these manually outside
-- a transaction with CONCURRENTLY instead.
CREATE INDEX IF NOT EXISTS "Contact_name_trgm_idx" ON "Contact" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_phone_trgm_idx" ON "Contact" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_email_trgm_idx" ON "Contact" USING GIN ("email" gin_trgm_ops);

-- Composite index for user-scoped contact queries (most common pattern)
CREATE INDEX IF NOT EXISTS "Contact_userId_name_idx" ON "Contact" ("userId", "name");
