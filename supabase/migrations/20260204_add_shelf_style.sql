-- Add shelf_style column to bookshelves table
-- Values: 'bottom' (line only at bottom, no background) or 'full' (rectangle border with background)
ALTER TABLE bookshelves
  ADD COLUMN IF NOT EXISTS shelf_style text NOT NULL DEFAULT 'full';
