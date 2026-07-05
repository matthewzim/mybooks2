-- Allow users to intentionally add the same book to a shelf more than once.
-- The app now asks for confirmation before adding a duplicate instead of
-- relying on this hard constraint, so replace the unique index with a plain
-- lookup index.

DROP INDEX IF EXISTS idx_bookshelf_items_book_shelf;

CREATE INDEX IF NOT EXISTS idx_bookshelf_items_book_shelf
  ON bookshelf_items(book_id, shelf_id);
