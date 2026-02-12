-- Add cover_image_url column to books table for storing Google Books cover images
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
