-- Fix book covers storage: create bucket, add policies, and create RPC for cover updates
--
-- Problem: The book-covers bucket has no RLS policies so uploads fail silently.
-- The books table UPDATE policy only allows the original uploader to update rows,
-- so cover_image_url can never be set by other users who trigger the prefetch.

-- 1. Create the book-covers bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage RLS policies for the book-covers bucket
-- (drop-then-create so this migration is safe to re-run)
-- Allow anyone to read covers (public bucket)
DROP POLICY IF EXISTS "Anyone can read book covers" ON storage.objects;
CREATE POLICY "Anyone can read book covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'book-covers');

-- Allow authenticated users to upload covers
DROP POLICY IF EXISTS "Authenticated users can upload book covers" ON storage.objects;
CREATE POLICY "Authenticated users can upload book covers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'book-covers' AND auth.role() = 'authenticated');

-- Allow authenticated users to overwrite covers (for upsert)
DROP POLICY IF EXISTS "Authenticated users can update book covers" ON storage.objects;
CREATE POLICY "Authenticated users can update book covers"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'book-covers' AND auth.role() = 'authenticated');

-- 3. Create an RPC function that any authenticated user can call to set
--    cover_image_url on the books table. This bypasses the restrictive
--    UPDATE RLS policy that limits writes to the original uploader.
CREATE OR REPLACE FUNCTION set_book_cover_url(
  p_book_id UUID,
  p_cover_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE books
  SET cover_image_url = p_cover_url,
      updated_at = now()
  WHERE id = p_book_id
    AND cover_image_url IS NULL;  -- Only set if not already cached
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION set_book_cover_url(UUID, TEXT) TO authenticated;
