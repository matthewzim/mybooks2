-- Scale hardening: indexes, RLS rewrite, and server-side helpers.
--
-- Everything up to now was written for a single-digit number of users, where
-- a sequential scan is free and "delete every book I uploaded" only ever
-- touched my own shelves. This migration fixes the three classes of problem
-- that appear as soon as there is more than one real user:
--
--   1. Missing indexes. Every hot query (my shelves, public shelves, cover
--      dedupe by title/author) was a sequential scan over the whole table.
--   2. Per-row auth.uid() re-evaluation in RLS policies, and IN (subquery)
--      predicates that re-plan for every candidate row.
--   3. Account reset / deletion deleting *global* book rows that other
--      users' shelves reference, silently emptying their shelves.
--
-- It also adds set-based RPCs for operations the client was doing with one
-- HTTP request per row (reordering) or by downloading the entire public
-- corpus and filtering on the phone (random shelf previews).

-- ---------------------------------------------------------------------------
-- 1. Indexes for the hot query paths
-- ---------------------------------------------------------------------------

-- getUserBookshelves / getBookshelvesWithPreviews, and the bookshelves RLS
-- predicate itself, filter on user_id and sort on position.
CREATE INDEX IF NOT EXISTS idx_bookshelves_user_position
  ON bookshelves (user_id, position);

-- Community surfaces read only public shelves, and user search asks "which of
-- these users have one". A partial index on the owner serves both and stays
-- small no matter how many private shelves exist.
CREATE INDEX IF NOT EXISTS idx_bookshelves_public
  ON bookshelves (user_id)
  WHERE is_public = true;

-- books RLS (uploaded_by_user_id = auth.uid()), account reset/deletion, and
-- the storage-asset sweep all filter on the uploader.
CREATE INDEX IF NOT EXISTS idx_books_uploaded_by_user_id
  ON books (uploaded_by_user_id);

-- getAlternativeSpines matches on ISBN when the book has one.
CREATE INDEX IF NOT EXISTS idx_books_isbn
  ON books (isbn)
  WHERE isbn IS NOT NULL;

-- The cover pipeline looks for an already-cached cover on another record of
-- the same book with a case-insensitive title/author match, and both book
-- searches use ILIKE '%term%'. A btree index cannot serve either; a trigram
-- GIN index serves both.
--
-- Wrapped so the migration still applies if pg_trgm is unavailable or
-- installed into a schema this session's search_path doesn't cover: the
-- trigram indexes are an optimisation, not a correctness requirement, and
-- losing them must not block the RLS and data-integrity changes below.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  CREATE INDEX IF NOT EXISTS idx_books_title_trgm
    ON books USING gin (title gin_trgm_ops);

  CREATE INDEX IF NOT EXISTS idx_books_author_trgm
    ON books USING gin (author gin_trgm_ops);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Skipping trigram indexes on books (%). Title/author search and cover dedupe will fall back to sequential scans.', SQLERRM;
END;
$$;

-- The moderation dashboard reads reports newest-first per reported user.
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user
  ON content_reports (reported_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Let a book outlive the account that uploaded it
-- ---------------------------------------------------------------------------
-- books rows are global: once another user adds one to a shelf, deleting it
-- because the uploader left removes it from *their* shelf too. Ownership has
-- to be releasable, which means the column must be nullable and its foreign
-- key must not cascade the delete.

ALTER TABLE books ALTER COLUMN uploaded_by_user_id DROP NOT NULL;

DO $$
DECLARE
  con_name TEXT;
  con_def TEXT;
BEGIN
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO con_name, con_def
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.books'::regclass
    AND c.contype = 'f'
    AND a.attname = 'uploaded_by_user_id'
  LIMIT 1;

  IF con_name IS NULL OR con_def ILIKE '%ON DELETE SET NULL%' THEN
    RETURN;
  END IF;

  -- Rebuild the same foreign key (same referenced table) with SET NULL, so
  -- removing a user releases their books instead of destroying them.
  con_def := regexp_replace(
    con_def,
    '\s+ON DELETE (CASCADE|RESTRICT|NO ACTION|SET DEFAULT|SET NULL)',
    '',
    'i'
  ) || ' ON DELETE SET NULL';

  EXECUTE format('ALTER TABLE public.books DROP CONSTRAINT %I', con_name);
  EXECUTE format('ALTER TABLE public.books ADD CONSTRAINT %I %s', con_name, con_def);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS policies
-- ---------------------------------------------------------------------------
-- Two changes throughout, semantics otherwise unchanged:
--   * auth.uid() becomes (SELECT auth.uid()) so Postgres evaluates it once
--     per statement instead of once per candidate row.
--   * IN (SELECT ...) becomes EXISTS (...), which can use the shelf indexes.
-- Policies are dropped by name-scan first so the resulting set is exactly
-- what is written here regardless of what the project accumulated before.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('users', 'books', 'bookshelves', 'bookshelf_items')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END;
$$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookshelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookshelf_items ENABLE ROW LEVEL SECURITY;

-- users -------------------------------------------------------------------
-- Profiles stay world-readable: community surfaces show the owner of a public
-- shelf and the uploader of a community spine, and neither is reachable from
-- the reader's own rows.
CREATE POLICY "Anyone can read user profiles"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- books -------------------------------------------------------------------
CREATE POLICY "Anyone can read community books"
  ON books FOR SELECT
  USING (is_community = true OR uploaded_by_user_id = (SELECT auth.uid()));

CREATE POLICY "Authenticated users can insert books"
  ON books FOR INSERT
  WITH CHECK (uploaded_by_user_id = (SELECT auth.uid()));

-- WITH CHECK was missing before, so a user could hand their own book row to
-- somebody else (or to nobody) by writing uploaded_by_user_id.
CREATE POLICY "Users can update own books"
  ON books FOR UPDATE
  USING (uploaded_by_user_id = (SELECT auth.uid()))
  WITH CHECK (uploaded_by_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own books"
  ON books FOR DELETE
  USING (uploaded_by_user_id = (SELECT auth.uid()));

-- bookshelves --------------------------------------------------------------
CREATE POLICY "Users can read own bookshelves"
  ON bookshelves FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Anyone can read public bookshelves"
  ON bookshelves FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can insert own bookshelves"
  ON bookshelves FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own bookshelves"
  ON bookshelves FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own bookshelves"
  ON bookshelves FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- bookshelf_items ----------------------------------------------------------
CREATE POLICY "Users can read own bookshelf items"
  ON bookshelf_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Anyone can read public bookshelf items"
  ON bookshelf_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.is_public = true
    )
  );

CREATE POLICY "Users can insert own bookshelf items"
  ON bookshelf_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own bookshelf items"
  ON bookshelf_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own bookshelf items"
  ON bookshelf_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Account reset / deletion without collateral damage
-- ---------------------------------------------------------------------------

-- Books I uploaded that somebody else's shelf still references. The client
-- calls this before sweeping storage so it doesn't delete the spine and cover
-- files those shelves are rendering. SECURITY DEFINER because the caller
-- cannot see other users' private shelves — only the aggregate answer.
CREATE OR REPLACE FUNCTION public.shared_book_ids()
RETURNS TABLE (book_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT b.id
  FROM public.books b
  JOIN public.bookshelf_items bi ON bi.book_id = b.id
  JOIN public.bookshelves s ON s.id = bi.shelf_id
  WHERE b.uploaded_by_user_id = auth.uid()
    AND s.user_id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.shared_book_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_book_ids() TO authenticated;

-- Shared implementation of "remove all of my library content".
--   * my shelves (and, by cascade, my shelf items) go
--   * books I uploaded that nobody else has on a shelf go
--   * books I uploaded that somebody else *does* have on a shelf stay, with
--     ownership released. They are flagged community so the books SELECT
--     policy keeps them visible to the shelves that hold them — an orphaned
--     private row would render as a blank spine on someone else's shelf.
CREATE OR REPLACE FUNCTION public.purge_my_library(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bookshelves WHERE user_id = p_user_id;

  DELETE FROM public.books b
  WHERE b.uploaded_by_user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bookshelf_items bi WHERE bi.book_id = b.id
    );

  UPDATE public.books
  SET uploaded_by_user_id = NULL,
      is_community = true,
      updated_at = now()
  WHERE uploaded_by_user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_my_library(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reset_my_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.purge_my_library(current_user_id);

  UPDATE public.users
  SET name = NULL,
      public_username = NULL,
      avatar_url = NULL,
      updated_at = now()
  WHERE id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_my_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_my_data() TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.purge_my_library(current_user_id);

  DELETE FROM public.users WHERE id = current_user_id;
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Set-based replacements for per-row round trips
-- ---------------------------------------------------------------------------

-- Reordering a shelf was one UPDATE request per book, fired in parallel with
-- the results discarded — so a 200-book shelf opened 200 connections and a
-- partial failure left the order silently corrupt. One statement instead,
-- and RLS (SECURITY INVOKER) still restricts it to the caller's own shelf.
CREATE OR REPLACE FUNCTION public.reorder_bookshelf_items(
  p_shelf_id UUID,
  p_item_ids UUID[]
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE bookshelf_items bi
  SET position = ordered.ordinality - 1,
      updated_at = now()
  FROM unnest(p_item_ids) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE bi.id = ordered.id
    AND bi.shelf_id = p_shelf_id;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_bookshelf_items(UUID, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_bookshelves(p_shelf_ids UUID[])
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE bookshelves s
  SET position = ordered.ordinality - 1,
      updated_at = now()
  FROM unnest(p_shelf_ids) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE s.id = ordered.id;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_bookshelves(UUID[]) TO authenticated;

-- The Explore tab used to download up to 60 public shelves *with every book
-- on them*, shuffle on the phone, and show 6 — megabytes of payload for a
-- handful of spines, and only ever the same arbitrary 60 rows because the
-- query had no ORDER BY. Sample server-side instead. SECURITY INVOKER, so
-- the "Anyone can read public bookshelves" policy still applies.
-- Deliberately VOLATILE (the default): it calls random(), so the planner must
-- not be free to cache or fold the result.
CREATE OR REPLACE FUNCTION public.random_public_bookshelves(p_limit INTEGER DEFAULT 6)
RETURNS SETOF bookshelves
LANGUAGE sql
AS $$
  SELECT *
  FROM bookshelves
  WHERE is_public = true
  ORDER BY random()
  LIMIT GREATEST(COALESCE(p_limit, 6), 0);
$$;

GRANT EXECUTE ON FUNCTION public.random_public_bookshelves(INTEGER) TO authenticated;

-- Make the new functions discoverable through PostgREST immediately.
NOTIFY pgrst, 'reload schema';
