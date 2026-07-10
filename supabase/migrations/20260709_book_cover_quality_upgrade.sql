-- Let the high-quality cover pipeline replace covers cached by the old
-- low-resolution pipeline.
--
-- Covers cached by the current pipeline carry a `cv=2` marker in their URL
-- (see services/googleBooks.ts). The previous guard (cover_image_url IS NULL)
-- froze the first URL ever written, so low-quality thumbnails and cached
-- "image not available" placeholders could never be repaired. The new guard
-- lets the pipeline overwrite unmarked (legacy) covers while still preventing
-- older app versions — which write unmarked URLs — from clobbering upgraded
-- ones. If the pipeline version is ever bumped, update this guard in lockstep
-- with COVER_VERSION_MARKER.
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
    AND (cover_image_url IS NULL OR cover_image_url NOT LIKE '%cv=2%');
END;
$$;

GRANT EXECUTE ON FUNCTION set_book_cover_url(UUID, TEXT) TO authenticated;
