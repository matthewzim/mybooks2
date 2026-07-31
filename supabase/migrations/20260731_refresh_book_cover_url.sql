-- Let a corrected title/author replace a cover that was found for the wrong
-- book.
--
-- `set_book_cover_url` refuses to overwrite a cover the current pipeline
-- already produced (the cv=3 guard), which is what stops old clients and
-- duplicate fetches from clobbering good covers. But when a user fixes a
-- typo in a book's title or author, the stored cover was searched for with
-- the wrong text — it is either missing or, worse, the cover of a different
-- book — so that edit has to be able to replace it.
--
-- Unlike `set_book_cover_url`, which any authenticated user may call for any
-- book (it can only fill a gap), overwriting an existing cover is limited to
-- users with a stake in the row: the uploader, or someone who has the book
-- on one of their own shelves. The books table's own RLS already restricts
-- title/author edits to the uploader.
CREATE OR REPLACE FUNCTION refresh_book_cover_url(
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
    AND (
      uploaded_by_user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM bookshelf_items bi
        JOIN bookshelves bs ON bs.id = bi.shelf_id
        WHERE bi.book_id = books.id
          AND bs.user_id = auth.uid()
      )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_book_cover_url(UUID, TEXT) TO authenticated;
