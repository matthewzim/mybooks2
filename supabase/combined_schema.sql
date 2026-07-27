-- =============================================================================
-- TinyShelves — consolidated Supabase schema
-- =============================================================================
--
-- This file is the whole database in one script: the base tables from the
-- README plus every migration in supabase/migrations/ folded into its final
-- state. It is NOT a new migration — it is a catch-up script for a project
-- that has fallen behind and no longer knows which migrations were applied.
--
-- How to run it
--   Supabase Dashboard > SQL Editor > New query > paste this file > Run.
--   The editor runs it as a single transaction, so it either fully applies or
--   fully rolls back; nothing is left half-migrated.
--
-- Safety properties
--   * Idempotent. Safe to run on an empty project, on a fully up-to-date
--     project, or on anything in between, and safe to run twice.
--   * Non-destructive to your data. It creates and alters, and the only rows
--     it ever writes are backfills of NULL columns to their declared default.
--     The one structural drop (the legacy per-user columns on `books`) copies
--     that data into `bookshelf_items` first, and only if it hasn't been
--     copied already.
--   * Declarative about policies and functions. RLS policies and functions
--     are dropped by catalog scan and recreated, so the end state is exactly
--     what is written here no matter what the project accumulated before.
--
-- Corresponds to migrations 20260203 … 20260727 inclusive.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()


-- ---------------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------------
-- Created in dependency order. Existing tables are left alone here; section 2
-- brings them up to the current column set.

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  name TEXT,                                    -- nullable: generated on signup
  public_username TEXT,
  avatar_url TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookshelves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_color TEXT NOT NULL DEFAULT '#8B4513',
  is_public BOOLEAN NOT NULL DEFAULT false,
  shelf_style TEXT NOT NULL DEFAULT 'full',     -- 'full' | 'bottom'
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global/shared book records. Per-user placement lives in bookshelf_items.
-- uploaded_by_user_id is nullable and releases on account deletion so a book
-- another user has on a shelf outlives the account that first uploaded it.
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  image_url TEXT,                               -- user-uploaded spine photo
  cover_image_url TEXT,                         -- cached ISBNdb cover
  uploaded_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_community BOOLEAN NOT NULL DEFAULT true,
  isbn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookshelf_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  shelf_id UUID NOT NULL REFERENCES public.bookshelves(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  review TEXT,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  is_stacked BOOLEAN NOT NULL DEFAULT false,
  stack_id UUID,
  stack_position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Moderation (App Store Guideline 1.2): reports and per-user block lists.
CREATE TABLE IF NOT EXISTS public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bookshelf_id UUID REFERENCES public.bookshelves(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_no_self_report CHECK (reporter_id <> reported_user_id)
);

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_users_no_self_block CHECK (blocker_id <> blocked_id)
);

-- Legacy Stripe subscription table. Purchases run through RevenueCat now, but
-- the table is still described in types/supabase.ts, so it is kept in sync.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 2. Bring pre-existing tables up to the current column set
-- ---------------------------------------------------------------------------
-- No-ops on a fresh project; these are the ALTERs the migrations applied.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS public_username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Anonymous auth: no email is ever collected, and the display name is filled
-- in by trigger, so it has to accept NULL.
ALTER TABLE public.users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.users DROP COLUMN IF EXISTS email;

ALTER TABLE public.bookshelves
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS cover_color TEXT NOT NULL DEFAULT '#8B4513',
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shelf_style TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS is_community BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS isbn TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();


-- ---------------------------------------------------------------------------
-- 3. Bookshelf refactor: move per-user data off `books`
-- ---------------------------------------------------------------------------
-- Originally `books` carried both the global record and one user's placement
-- of it. Anything still living there is copied into bookshelf_items, then the
-- columns go.
--
-- The SELECT reads the row as JSON rather than naming the old columns, so the
-- statement parses whether or not those columns still exist — that is what
-- lets this run on an already-migrated project. Rows already present in
-- bookshelf_items are skipped, so a partial earlier run cannot duplicate them.

INSERT INTO public.bookshelf_items (
  book_id, shelf_id, position, review, rating,
  is_stacked, stack_id, stack_position, created_at, updated_at
)
SELECT
  (j->>'id')::UUID,
  (j->>'shelf_id')::UUID,
  COALESCE((j->>'position')::INTEGER, 0),
  j->>'review',
  NULLIF(j->>'rating', '')::INTEGER,
  COALESCE((j->>'is_stacked')::BOOLEAN, false),
  NULLIF(j->>'stack_id', '')::UUID,
  COALESCE((j->>'stack_position')::INTEGER, 0),
  COALESCE((j->>'created_at')::TIMESTAMPTZ, now()),
  COALESCE((j->>'updated_at')::TIMESTAMPTZ, now())
FROM (SELECT to_jsonb(b) AS j FROM public.books b) legacy
WHERE j->>'shelf_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.bookshelf_items bi
    WHERE bi.book_id = (j->>'id')::UUID
      AND bi.shelf_id = (j->>'shelf_id')::UUID
  );

-- Old RLS policies may reference the columns about to be dropped; they are all
-- rebuilt in section 11 anyway.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'books'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.books', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.books
  DROP COLUMN IF EXISTS shelf_id,
  DROP COLUMN IF EXISTS position,
  DROP COLUMN IF EXISTS review,
  DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS is_stacked,
  DROP COLUMN IF EXISTS stack_id,
  DROP COLUMN IF EXISTS stack_position;


-- ---------------------------------------------------------------------------
-- 4. Normalise defaults and nullability
-- ---------------------------------------------------------------------------
-- Columns that predate this script may be nullable with no default, which
-- contradicts types/supabase.ts and lets NULL slip past predicates like
-- `is_community = true`. Backfill each to its declared default, then pin it.

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('users',        'is_premium',  'false'),
      ('users',        'created_at',  'now()'),
      ('users',        'updated_at',  'now()'),
      ('bookshelves',  'cover_color', '''#8B4513'''),
      ('bookshelves',  'is_public',   'false'),
      ('bookshelves',  'shelf_style', '''full'''),
      ('bookshelves',  'position',    '0'),
      ('bookshelves',  'created_at',  'now()'),
      ('bookshelves',  'updated_at',  'now()'),
      ('books',        'is_community','true'),
      ('books',        'created_at',  'now()'),
      ('books',        'updated_at',  'now()'),
      ('subscriptions','status',      '''inactive'''),
      ('subscriptions','created_at',  'now()'),
      ('subscriptions','updated_at',  'now()')
    ) AS t(tbl, col, dflt)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = c.tbl
        AND column_name = c.col
        AND is_nullable = 'YES'
    ) THEN
      EXECUTE format('UPDATE public.%I SET %I = %s WHERE %I IS NULL', c.tbl, c.col, c.dflt, c.col);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s', c.tbl, c.col, c.dflt);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', c.tbl, c.col);
    END IF;
  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. Let a book outlive the account that uploaded it
-- ---------------------------------------------------------------------------
-- `books` rows are global: once another user has one on a shelf, deleting it
-- because the uploader left empties *their* shelf too. Ownership has to be
-- releasable, so the column must be nullable and its foreign key must not
-- cascade the delete.

ALTER TABLE public.books ALTER COLUMN uploaded_by_user_id DROP NOT NULL;

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

  -- Rebuild the same foreign key (same referenced table) with SET NULL.
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
-- 6. Indexes
-- ---------------------------------------------------------------------------

-- bookshelf_items: shelf reads, book lookups, ordering, stacks.
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_shelf_id
  ON public.bookshelf_items (shelf_id);
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_book_id
  ON public.bookshelf_items (book_id);
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_shelf_position
  ON public.bookshelf_items (shelf_id, position);
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_stack_id
  ON public.bookshelf_items (stack_id);

-- (book_id, shelf_id) started life UNIQUE. The app now confirms duplicates
-- with the user instead, so the constraint became a plain lookup index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_bookshelf_items_book_shelf'
      AND i.indisunique
  ) THEN
    DROP INDEX public.idx_bookshelf_items_book_shelf;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_bookshelf_items_book_shelf
  ON public.bookshelf_items (book_id, shelf_id);

-- bookshelves: "my shelves in order", plus a partial index for the public
-- surfaces that stays small no matter how many private shelves exist.
CREATE INDEX IF NOT EXISTS idx_bookshelves_user_position
  ON public.bookshelves (user_id, position);
CREATE INDEX IF NOT EXISTS idx_bookshelves_public
  ON public.bookshelves (user_id)
  WHERE is_public = true;

-- books: RLS on the uploader, community listings, ISBN spine matching.
CREATE INDEX IF NOT EXISTS idx_books_uploaded_by_user_id
  ON public.books (uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_books_is_community
  ON public.books (is_community)
  WHERE is_community = true;
CREATE INDEX IF NOT EXISTS idx_books_isbn
  ON public.books (isbn)
  WHERE isbn IS NOT NULL;

-- Book search and the cover-dedupe lookup both use ILIKE '%term%', which no
-- btree index can serve. Wrapped because the trigram indexes are an
-- optimisation, not a correctness requirement — losing them must not block
-- the rest of this script.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  CREATE INDEX IF NOT EXISTS idx_books_title_trgm
    ON public.books USING gin (title gin_trgm_ops);

  CREATE INDEX IF NOT EXISTS idx_books_author_trgm
    ON public.books USING gin (author gin_trgm_ops);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Skipping trigram indexes on books (%). Title/author search and cover dedupe will fall back to sequential scans.', SQLERRM;
END;
$$;

-- Moderation dashboard reads reports newest-first per reported user.
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user
  ON public.content_reports (reported_user_id, created_at DESC);

-- public_username is the handle used for user search, so it must be unique
-- among the users who have one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_username
  ON public.users (public_username)
  WHERE public_username IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 7. Drop every function this script owns, then recreate below
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE cannot change a function's return type or parameter names,
-- so an older signature left over from a previous migration would abort the
-- run. Dropping by catalog scan clears every overload regardless of shape.
-- Grants are dropped with the function and re-issued alongside each one.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::REGPROCEDURE AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_community_books',
        'set_book_cover_url',
        'delete_my_account',
        'reset_my_data',
        'purge_my_library',
        'shared_book_ids',
        'reorder_bookshelf_items',
        'reorder_bookshelves',
        'random_public_bookshelves',
        'handle_new_user',
        'generate_bookish_username',
        'generate_bookish_display_name'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.signature);
  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. Views
-- ---------------------------------------------------------------------------
-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot change the
-- column list, and this view's shape changed with the bookshelf refactor.

DROP VIEW IF EXISTS public.community_book_spines;

CREATE VIEW public.community_book_spines AS
SELECT
  b.id,
  b.title,
  b.author,
  b.image_url,
  b.uploaded_by_user_id,
  u.name AS uploader_name,
  COALESCE(item_count.times_added, 0) AS times_added,
  b.created_at
FROM public.books b
LEFT JOIN public.users u ON u.id = b.uploaded_by_user_id
LEFT JOIN (
  SELECT book_id, COUNT(*) AS times_added
  FROM public.bookshelf_items
  GROUP BY book_id
) item_count ON item_count.book_id = b.id
WHERE b.is_community = true
  AND b.image_url IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 9. Functions
-- ---------------------------------------------------------------------------

-- --- Community browsing ----------------------------------------------------

CREATE FUNCTION public.get_community_books(
  page_num INTEGER DEFAULT 0,
  page_size INTEGER DEFAULT 20,
  search_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  author TEXT,
  image_url TEXT,
  uploaded_by_user_id UUID,
  uploader_name TEXT,
  times_added BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.title,
    b.author,
    b.image_url,
    b.uploaded_by_user_id,
    u.name AS uploader_name,
    COALESCE(ic.times_added, 0) AS times_added,
    b.created_at
  FROM public.books b
  LEFT JOIN public.users u ON u.id = b.uploaded_by_user_id
  LEFT JOIN (
    SELECT bi.book_id, COUNT(*)::BIGINT AS times_added
    FROM public.bookshelf_items bi
    GROUP BY bi.book_id
  ) ic ON ic.book_id = b.id
  WHERE b.is_community = true
    AND b.image_url IS NOT NULL
    AND (
      search_query IS NULL
      OR b.title ILIKE '%' || search_query || '%'
      OR b.author ILIKE '%' || search_query || '%'
    )
  ORDER BY b.created_at DESC
  OFFSET page_num * page_size
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_books(INTEGER, INTEGER, TEXT) TO authenticated;

-- --- Cover cache -----------------------------------------------------------

-- Any authenticated user may cache a cover on any book, which the restrictive
-- books UPDATE policy (uploader only) would otherwise forbid — hence
-- SECURITY DEFINER.
--
-- The `cv=N` marker in the URL is the cover pipeline's version (see
-- services/isbndb.ts, COVER_VERSION_MARKER). The guard accepts a write when
-- the cached URL predates the current version, so bumping the pipeline makes
-- every older cover eligible for lazy re-fetch. Currently cv=3 (ISBNdb);
-- cv=2 was Google Books. If the pipeline version is bumped again, update this
-- guard in lockstep.
CREATE FUNCTION public.set_book_cover_url(
  p_book_id UUID,
  p_cover_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.books
  SET cover_image_url = p_cover_url,
      updated_at = now()
  WHERE id = p_book_id
    AND (cover_image_url IS NULL OR cover_image_url NOT LIKE '%cv=3%');
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_book_cover_url(UUID, TEXT) TO authenticated;

-- --- Account reset and deletion -------------------------------------------

-- Books I uploaded that somebody else's shelf still references. The client
-- calls this before sweeping storage so it doesn't delete the spine and cover
-- files those shelves are rendering. SECURITY DEFINER because the caller
-- cannot see other users' private shelves — only the aggregate answer.
CREATE FUNCTION public.shared_book_ids()
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
CREATE FUNCTION public.purge_my_library(p_user_id UUID)
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

-- Internal helper: reachable only through the two RPCs below.
REVOKE ALL ON FUNCTION public.purge_my_library(UUID) FROM PUBLIC;

CREATE FUNCTION public.reset_my_data()
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

CREATE FUNCTION public.delete_my_account()
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

-- --- Set-based replacements for per-row round trips ------------------------

-- Reordering a shelf used to be one UPDATE request per book, fired in
-- parallel with the results discarded — a 200-book shelf opened 200
-- connections and a partial failure left the order silently corrupt. One
-- statement instead; SECURITY INVOKER, so RLS still restricts it to the
-- caller's own shelf.
CREATE FUNCTION public.reorder_bookshelf_items(
  p_shelf_id UUID,
  p_item_ids UUID[]
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE public.bookshelf_items bi
  SET position = ordered.ordinality - 1,
      updated_at = now()
  FROM unnest(p_item_ids) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE bi.id = ordered.id
    AND bi.shelf_id = p_shelf_id;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_bookshelf_items(UUID, UUID[]) TO authenticated;

CREATE FUNCTION public.reorder_bookshelves(p_shelf_ids UUID[])
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE public.bookshelves s
  SET position = ordered.ordinality - 1,
      updated_at = now()
  FROM unnest(p_shelf_ids) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE s.id = ordered.id;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_bookshelves(UUID[]) TO authenticated;

-- The Explore tab used to download up to 60 public shelves *with every book
-- on them*, shuffle on the phone, and show 6. Sample server-side instead.
-- SECURITY INVOKER, so "Anyone can read public bookshelves" still applies.
-- Deliberately VOLATILE (the default): it calls random(), so the planner must
-- not be free to cache or fold the result.
CREATE FUNCTION public.random_public_bookshelves(p_limit INTEGER DEFAULT 6)
RETURNS SETOF public.bookshelves
LANGUAGE sql
AS $$
  SELECT *
  FROM public.bookshelves
  WHERE is_public = true
  ORDER BY random()
  LIMIT GREATEST(COALESCE(p_limit, 6), 0);
$$;

GRANT EXECUTE ON FUNCTION public.random_public_bookshelves(INTEGER) TO authenticated;

-- --- Profile generation for new anonymous users ----------------------------

CREATE FUNCTION public.generate_bookish_username()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  adjectives TEXT[] := ARRAY[
    'midnight','cozy','silent','clever','curious','dreamy','gentle','hidden',
    'hushed','keen','leafy','misty','noble','quiet','rustic','secret',
    'steady','tender','velvet','wandering','whispering','wistful','amber',
    'bright','crimson','dusk','faded','golden','ivory','lunar','mossy',
    'olive','pale','rosy','silver','twilight','vintage','willow','starlit',
    'frosted','ember'
  ];
  nouns TEXT[] := ARRAY[
    'bookworm','librarian','scribe','reader','scholar','novelist',
    'bibliophile','storyteller','narrator','chronicler','poet','penman',
    'wordsmith','bookseller','quill','bookmark','chapter','manuscript',
    'inkwell','parchment','tome','almanac','fable','lexicon','sonnet',
    'verse','scroll','folio','gazette','opus'
  ];
  candidate TEXT;
  retries INT := 0;
BEGIN
  LOOP
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
              || nouns[1 + floor(random() * array_length(nouns, 1))::int]
              || floor(random() * 100)::text;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE public_username = candidate) THEN
      RETURN candidate;
    END IF;

    retries := retries + 1;
    IF retries > 10 THEN
      -- Extremely unlikely; append extra digits to guarantee uniqueness.
      RETURN candidate || floor(random() * 9000 + 1000)::text;
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.generate_bookish_display_name()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  adjectives TEXT[] := ARRAY[
    'Midnight','Cozy','Silent','Clever','Curious','Dreamy','Gentle','Hidden',
    'Hushed','Keen','Leafy','Misty','Noble','Quiet','Rustic','Secret',
    'Steady','Tender','Velvet','Wandering','Whispering','Wistful','Amber',
    'Bright','Crimson','Dusk','Faded','Golden','Ivory','Lunar','Mossy',
    'Olive','Pale','Rosy','Silver','Twilight','Vintage','Willow','Starlit',
    'Frosted','Ember'
  ];
  nouns TEXT[] := ARRAY[
    'Bookworm','Librarian','Scribe','Reader','Scholar','Novelist',
    'Bibliophile','Storyteller','Narrator','Chronicler','Poet','Penman',
    'Wordsmith','Bookseller','Quill','Bookmark','Chapter','Manuscript',
    'Inkwell','Parchment','Tome','Almanac','Fable','Lexicon','Sonnet',
    'Verse','Scroll','Folio','Gazette','Opus'
  ];
BEGIN
  RETURN adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
      || nouns[1 + floor(random() * array_length(nouns, 1))::int]
      || floor(random() * 100)::text;
END;
$$;

-- The app (services/auth.ts) also upserts a profile after sign-in; this
-- trigger is the database-side fallback. The exception handler matters:
-- anonymous sign-in fails outright with "Database error creating anonymous
-- user" if anything in here raises, so a profile-creation failure must never
-- propagate.
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, public_username)
  VALUES (
    NEW.id,
    public.generate_bookish_display_name(),
    public.generate_bookish_username()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 10. Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 11. Row Level Security
-- ---------------------------------------------------------------------------
-- Every policy on these tables is dropped by catalog scan first, so the end
-- state is exactly the set below regardless of what the project accumulated.
--
-- Two conventions throughout:
--   * auth.uid() is wrapped as (SELECT auth.uid()) so Postgres evaluates it
--     once per statement instead of once per candidate row.
--   * shelf ownership is checked with EXISTS rather than IN (SELECT ...), so
--     the planner can use the bookshelves indexes.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'users', 'books', 'bookshelves', 'bookshelf_items',
        'content_reports', 'blocked_users', 'subscriptions'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END;
$$;

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookshelves      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookshelf_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions    ENABLE ROW LEVEL SECURITY;

-- users ---------------------------------------------------------------------
-- Profiles stay world-readable: community surfaces show the owner of a public
-- shelf and the uploader of a community spine, and neither is reachable from
-- the reader's own rows.
CREATE POLICY "Anyone can read user profiles"
  ON public.users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- books ---------------------------------------------------------------------
CREATE POLICY "Anyone can read community books"
  ON public.books FOR SELECT
  USING (is_community = true OR uploaded_by_user_id = (SELECT auth.uid()));

CREATE POLICY "Authenticated users can insert books"
  ON public.books FOR INSERT
  WITH CHECK (uploaded_by_user_id = (SELECT auth.uid()));

-- WITH CHECK matters here: without it a user could hand their own book row to
-- somebody else (or to nobody) by writing uploaded_by_user_id.
CREATE POLICY "Users can update own books"
  ON public.books FOR UPDATE
  USING (uploaded_by_user_id = (SELECT auth.uid()))
  WITH CHECK (uploaded_by_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own books"
  ON public.books FOR DELETE
  USING (uploaded_by_user_id = (SELECT auth.uid()));

-- bookshelves ---------------------------------------------------------------
CREATE POLICY "Users can read own bookshelves"
  ON public.bookshelves FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Anyone can read public bookshelves"
  ON public.bookshelves FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can insert own bookshelves"
  ON public.bookshelves FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own bookshelves"
  ON public.bookshelves FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own bookshelves"
  ON public.bookshelves FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- bookshelf_items -----------------------------------------------------------
CREATE POLICY "Users can read own bookshelf items"
  ON public.bookshelf_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Anyone can read public bookshelf items"
  ON public.bookshelf_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.is_public = true
    )
  );

CREATE POLICY "Users can insert own bookshelf items"
  ON public.bookshelf_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own bookshelf items"
  ON public.bookshelf_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own bookshelf items"
  ON public.bookshelf_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.bookshelves s
      WHERE s.id = bookshelf_items.shelf_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

-- content_reports -----------------------------------------------------------
-- Write-only from the app's side: you file reports and can see your own.
-- Review happens in the Supabase dashboard.
CREATE POLICY "Users can file reports"
  ON public.content_reports FOR INSERT
  WITH CHECK (reporter_id = (SELECT auth.uid()));

CREATE POLICY "Users can view their own reports"
  ON public.content_reports FOR SELECT
  USING (reporter_id = (SELECT auth.uid()));

-- blocked_users -------------------------------------------------------------
CREATE POLICY "Users can manage their own block list"
  ON public.blocked_users FOR ALL
  USING (blocker_id = (SELECT auth.uid()))
  WITH CHECK (blocker_id = (SELECT auth.uid()));

-- subscriptions -------------------------------------------------------------
CREATE POLICY "Users can read own subscription"
  ON public.subscriptions FOR SELECT
  USING (user_id = (SELECT auth.uid()));


-- ---------------------------------------------------------------------------
-- 12. Storage buckets and policies
-- ---------------------------------------------------------------------------
-- All three buckets are public because the app builds public URLs for spines,
-- covers and avatars (services/storage.ts uses getPublicUrl).
--
-- Wrapped in an exception handler: on some projects storage.objects is owned
-- by supabase_storage_admin and the SQL editor role cannot create policies on
-- it. That must not roll back the schema work above — if this warns, create
-- the buckets and their policies from Dashboard > Storage instead.

DO $storage$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES
    ('book-covers', 'book-covers', true),
    ('book-spines', 'book-spines', true),
    ('avatars',     'avatars',     true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  -- book-covers: cached ISBNdb artwork, written by any signed-in user.
  DROP POLICY IF EXISTS "Anyone can read book covers" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Anyone can read book covers"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'book-covers')
  $pol$;

  DROP POLICY IF EXISTS "Authenticated users can upload book covers" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Authenticated users can upload book covers"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'book-covers' AND auth.role() = 'authenticated')
  $pol$;

  DROP POLICY IF EXISTS "Authenticated users can update book covers" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Authenticated users can update book covers"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'book-covers' AND auth.role() = 'authenticated')
  $pol$;

  -- book-spines: user-photographed spines.
  DROP POLICY IF EXISTS "Anyone can read book spines" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Anyone can read book spines"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'book-spines')
  $pol$;

  DROP POLICY IF EXISTS "Authenticated users can upload book spines" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Authenticated users can upload book spines"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'book-spines' AND auth.role() = 'authenticated')
  $pol$;

  DROP POLICY IF EXISTS "Authenticated users can update book spines" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Authenticated users can update book spines"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'book-spines' AND auth.role() = 'authenticated')
  $pol$;

  -- avatars: profile pictures.
  DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Anyone can read avatars"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars')
  $pol$;

  DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Authenticated users can upload avatars"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated')
  $pol$;

  DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
  EXECUTE $pol$
    CREATE POLICY "Authenticated users can update avatars"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'avatars' AND auth.role() = 'authenticated')
  $pol$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Skipping storage buckets/policies: this role cannot modify storage (%). Configure them in Dashboard > Storage.', SQLERRM;
END;
$storage$;


-- ---------------------------------------------------------------------------
-- 13. Table grants
-- ---------------------------------------------------------------------------
-- These mirror Supabase's default privileges for the public schema. RLS still
-- gates every row; without the grants PostgREST returns "permission denied"
-- before RLS is ever consulted.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users,
  public.bookshelves,
  public.books,
  public.bookshelf_items,
  public.content_reports,
  public.blocked_users,
  public.subscriptions
TO authenticated, service_role;

GRANT SELECT ON
  public.users,
  public.bookshelves,
  public.books,
  public.bookshelf_items,
  public.community_book_spines
TO anon;

GRANT SELECT ON public.community_book_spines TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 14. Refresh the PostgREST schema cache
-- ---------------------------------------------------------------------------
-- Without this, new functions stay invisible to the client for up to a few
-- minutes ("could not find the function ... in the schema cache").

NOTIFY pgrst, 'reload schema';
