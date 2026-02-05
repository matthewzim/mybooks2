-- Fix: Add missing INSERT, UPDATE, DELETE RLS policies on the books table.
-- The refactor migration (20260203) dropped all policies but only re-created SELECT.
-- Without INSERT/UPDATE policies, authenticated users cannot create or edit books.

-- Authenticated users can insert new books (they become the uploader)
CREATE POLICY "Authenticated users can insert books"
  ON books FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by_user_id);

-- Users can update books they uploaded
CREATE POLICY "Users can update own books"
  ON books FOR UPDATE
  USING (uploaded_by_user_id = auth.uid());

-- Users can delete books they uploaded
CREATE POLICY "Users can delete own books"
  ON books FOR DELETE
  USING (uploaded_by_user_id = auth.uid());
