-- ISBNdb cover migration: bump the cover pipeline version cv=2 -> cv=3 so
-- every Google-Books-sourced cover is lazily re-fetched from ISBNdb.
--
-- Covers cached by the current pipeline carry a `cv=3` marker in their URL
-- (see services/isbndb.ts). Widening the guard from cv=2 to cv=3 makes every
-- existing cover (unmarked legacy ones and cv=2 Google ones alike) eligible
-- for overwrite by the ISBNdb pipeline the next time it is viewed or
-- prefetched. If the pipeline version is ever bumped again, update this
-- guard in lockstep with COVER_VERSION_MARKER.
--
-- Deploy-window caveat: app versions still on the Google pipeline write
-- cv=2 URLs, which this guard accepts, so an old client can briefly restore
-- a Google cover over a fresh ISBNdb one. Any such URL lacks cv=3, so
-- updated clients re-fetch and overwrite it on next view — the data
-- converges as old clients age out (the same trade-off the cv=2 migration
-- made, see 20260709_book_cover_quality_upgrade.sql).
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
    AND (cover_image_url IS NULL OR cover_image_url NOT LIKE '%cv=3%');
END;
$$;

GRANT EXECUTE ON FUNCTION set_book_cover_url(UUID, TEXT) TO authenticated;
