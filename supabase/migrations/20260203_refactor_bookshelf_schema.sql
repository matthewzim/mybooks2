-- Migration: Refactor bookshelf schema
-- Separates global book data from per-user bookshelf placement
--
-- Before: books table contained both global data (title, author, image_url)
--         AND per-user data (shelf_id, position, review, rating, stack fields)
--
-- After:  books table holds only global/shared data
--         bookshelf_items table holds per-user shelf placement and reviews

-- Step 1: Create the bookshelf_items table
CREATE TABLE IF NOT EXISTS bookshelf_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  shelf_id UUID NOT NULL REFERENCES bookshelves(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  review TEXT,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  is_stacked BOOLEAN NOT NULL DEFAULT false,
  stack_id UUID,
  stack_position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 2: Migrate existing data from books into bookshelf_items
INSERT INTO bookshelf_items (book_id, shelf_id, position, review, rating, is_stacked, stack_id, stack_position, created_at, updated_at)
SELECT id, shelf_id, position, review, rating, is_stacked, stack_id, stack_position, created_at, updated_at
FROM books
WHERE shelf_id IS NOT NULL;

-- Step 3: Remove per-user columns from books table
ALTER TABLE books
  DROP COLUMN IF EXISTS shelf_id,
  DROP COLUMN IF EXISTS position,
  DROP COLUMN IF EXISTS review,
  DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS is_stacked,
  DROP COLUMN IF EXISTS stack_id,
  DROP COLUMN IF EXISTS stack_position;

-- Step 4: Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_shelf_id ON bookshelf_items(shelf_id);
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_book_id ON bookshelf_items(book_id);
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_shelf_position ON bookshelf_items(shelf_id, position);
CREATE INDEX IF NOT EXISTS idx_bookshelf_items_stack_id ON bookshelf_items(stack_id);
CREATE INDEX IF NOT EXISTS idx_books_is_community ON books(is_community) WHERE is_community = true;

-- Step 5: Add unique constraint to prevent duplicate book on same shelf
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookshelf_items_book_shelf ON bookshelf_items(book_id, shelf_id);

-- Step 6: Update the community_book_spines view
-- (Books table no longer has shelf_id; community books are those with is_community = true)
DROP VIEW IF EXISTS community_book_spines;

CREATE VIEW community_book_spines AS
SELECT
  b.id,
  b.title,
  b.author,
  b.image_url,
  b.uploaded_by_user_id,
  u.name AS uploader_name,
  COALESCE(item_count.times_added, 0) AS times_added,
  b.created_at
FROM books b
LEFT JOIN users u ON u.id = b.uploaded_by_user_id
LEFT JOIN (
  SELECT book_id, COUNT(*) AS times_added
  FROM bookshelf_items
  GROUP BY book_id
) item_count ON item_count.book_id = b.id
WHERE b.is_community = true
  AND b.image_url IS NOT NULL;

-- Step 7: Update or replace the get_community_books function
CREATE OR REPLACE FUNCTION get_community_books(
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
  FROM books b
  LEFT JOIN users u ON u.id = b.uploaded_by_user_id
  LEFT JOIN (
    SELECT bi.book_id, COUNT(*)::BIGINT AS times_added
    FROM bookshelf_items bi
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

-- Step 8: Enable Row Level Security on bookshelf_items
ALTER TABLE bookshelf_items ENABLE ROW LEVEL SECURITY;

-- Users can read their own bookshelf items (via shelf ownership)
CREATE POLICY "Users can read own bookshelf items"
  ON bookshelf_items FOR SELECT
  USING (
    shelf_id IN (
      SELECT id FROM bookshelves WHERE user_id = auth.uid()
    )
  );

-- Users can insert bookshelf items on their own shelves
CREATE POLICY "Users can insert own bookshelf items"
  ON bookshelf_items FOR INSERT
  WITH CHECK (
    shelf_id IN (
      SELECT id FROM bookshelves WHERE user_id = auth.uid()
    )
  );

-- Users can update their own bookshelf items
CREATE POLICY "Users can update own bookshelf items"
  ON bookshelf_items FOR UPDATE
  USING (
    shelf_id IN (
      SELECT id FROM bookshelves WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own bookshelf items
CREATE POLICY "Users can delete own bookshelf items"
  ON bookshelf_items FOR DELETE
  USING (
    shelf_id IN (
      SELECT id FROM bookshelves WHERE user_id = auth.uid()
    )
  );

-- Anyone can read community books
CREATE POLICY "Anyone can read community books"
  ON books FOR SELECT
  USING (is_community = true OR uploaded_by_user_id = auth.uid());
