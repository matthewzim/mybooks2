-- Lets a shelf item show the book's AI-generated spine even when the book has
-- a real spine photo, so the spine picker can offer both.
--
-- Per item, not per book: book rows are shared between users, so "choosing AI"
-- by clearing books.image_url would take the photo away from everyone else.
-- The flag is ignored while the book has no AI spine.
BEGIN;
ALTER TABLE public.bookshelf_items ADD COLUMN use_ai_spine boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
COMMIT;
