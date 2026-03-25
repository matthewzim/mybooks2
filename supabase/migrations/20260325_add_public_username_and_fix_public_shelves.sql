-- Migration: Add public_username to users and fix public bookshelf visibility
--
-- 1. Adds a unique public_username column for user discovery
-- 2. Adds RLS policies so users can read other users' public bookshelves
-- 3. Adds RLS policy so bookshelf_items on public shelves are readable

-- Step 1: Add public_username column with uniqueness constraint
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_username
  ON users (public_username)
  WHERE public_username IS NOT NULL;

-- Step 2: Allow anyone to read public bookshelves (needed for Explore page)
-- First drop any existing restrictive policies on bookshelves SELECT
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'bookshelves' AND schemaname = 'public'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON bookshelves', pol.policyname);
  END LOOP;
END;
$$;

-- Users can read their own bookshelves
CREATE POLICY "Users can read own bookshelves"
  ON bookshelves FOR SELECT
  USING (user_id = auth.uid());

-- Anyone can read public bookshelves
CREATE POLICY "Anyone can read public bookshelves"
  ON bookshelves FOR SELECT
  USING (is_public = true);

-- Step 3: Allow reading bookshelf_items on public bookshelves
-- Drop existing SELECT policy and recreate to include public shelves
DROP POLICY IF EXISTS "Users can read own bookshelf items" ON bookshelf_items;

-- Users can read their own bookshelf items
CREATE POLICY "Users can read own bookshelf items"
  ON bookshelf_items FOR SELECT
  USING (
    shelf_id IN (
      SELECT id FROM bookshelves WHERE user_id = auth.uid()
    )
  );

-- Anyone can read bookshelf items on public bookshelves
CREATE POLICY "Anyone can read public bookshelf items"
  ON bookshelf_items FOR SELECT
  USING (
    shelf_id IN (
      SELECT id FROM bookshelves WHERE is_public = true
    )
  );
