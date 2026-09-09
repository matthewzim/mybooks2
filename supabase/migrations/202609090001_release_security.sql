-- Apply after all historical migrations. Do not deploy the client without this.
BEGIN;
-- Row ownership is not column authorization: premium is server-controlled.
REVOKE INSERT, UPDATE ON public.users FROM anon, authenticated;
GRANT INSERT (id, name, public_username, avatar_url) ON public.users TO authenticated;
GRANT UPDATE (name, public_username, avatar_url, updated_at) ON public.users TO authenticated;
ALTER VIEW public.community_book_spines SET (security_invoker = true);
REVOKE DELETE ON public.books FROM anon, authenticated;

-- Restrictive guards also constrain older permissive policies in live projects.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('book-spines','book-spines',true,10485760,ARRAY['image/jpeg','image/png','image/webp','image/gif']),
       ('avatars','avatars',true,10485760,ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
UPDATE storage.buckets SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'] WHERE id = 'book-covers';
CREATE POLICY release_asset_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id NOT IN ('book-covers','book-spines','avatars') OR split_part(name,'/',1) = (SELECT auth.uid())::text);
CREATE POLICY release_asset_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket_id NOT IN ('book-covers','book-spines','avatars') OR (bucket_id = 'avatars' AND split_part(name,'/',1) = (SELECT auth.uid())::text))
WITH CHECK (bucket_id NOT IN ('book-covers','book-spines','avatars') OR (bucket_id = 'avatars' AND split_part(name,'/',1) = (SELECT auth.uid())::text));
-- Shared book images are immutable; deleting them must use the cleanup queue.
CREATE POLICY release_asset_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (bucket_id NOT IN ('book-covers','book-spines','avatars') OR (bucket_id = 'avatars' AND split_part(name,'/',1) = (SELECT auth.uid())::text));
CREATE POLICY release_owned_asset_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('book-covers','book-spines','avatars') AND split_part(name,'/',1) = (SELECT auth.uid())::text);
CREATE POLICY release_owned_avatar_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND split_part(name,'/',1) = (SELECT auth.uid())::text)
WITH CHECK (bucket_id = 'avatars' AND split_part(name,'/',1) = (SELECT auth.uid())::text);
CREATE POLICY release_owned_avatar_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND split_part(name,'/',1) = (SELECT auth.uid())::text);

-- A shelf FK alone does not check whether the referenced book is readable.
CREATE POLICY release_item_book_insert ON public.bookshelf_items AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id));
CREATE POLICY release_item_book_update ON public.bookshelf_items AS RESTRICTIVE FOR UPDATE TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id));

-- Cover population can only edit the caller's own row, using a stored image
-- in this project's bucket. A shelf reader cannot poison a global book.
CREATE OR REPLACE FUNCTION public.refresh_book_cover_url(p_book_id uuid, p_cover_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.books WHERE id = p_book_id AND uploaded_by_user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o JOIN storage.buckets k ON k.id = o.bucket_id
    WHERE o.bucket_id = 'book-covers' AND split_part(p_cover_url,'?',1) = o.name
  ) THEN RAISE EXCEPTION 'Invalid cover path'; END IF;
  UPDATE public.books SET cover_image_url = p_cover_url, updated_at = now() WHERE id = p_book_id;
END $$;
-- Clients send bucket-relative paths; no project URL setting is necessary.
CREATE OR REPLACE FUNCTION public.set_book_cover_url(p_book_id uuid, p_cover_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.books WHERE id = p_book_id AND uploaded_by_user_id = auth.uid()
    AND (cover_image_url IS NULL OR cover_image_url NOT LIKE '%cv=3%')) THEN
    PERFORM public.refresh_book_cover_url(p_book_id, p_cover_url);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.refresh_book_cover_url(uuid,text), public.set_book_cover_url(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_book_cover_url(uuid,text), public.set_book_cover_url(uuid,text) TO authenticated;

CREATE TABLE public.storage_cleanup_queue (
  bucket_id text NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_id, name)
);
ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_cleanup_queue FROM anon, authenticated;
GRANT ALL ON public.storage_cleanup_queue TO service_role;

CREATE OR REPLACE FUNCTION public.purge_my_library(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serialize account purge with uploads/book mutations for this owner.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  INSERT INTO public.storage_cleanup_queue(bucket_id,name)
  SELECT bucket_id,name FROM storage.objects o
  WHERE (bucket_id IN ('book-spines','avatars','book-covers') AND split_part(name,'/',1) = p_user_id::text)
     OR (bucket_id = 'book-covers' AND EXISTS (SELECT 1 FROM public.books b
         WHERE b.uploaded_by_user_id = p_user_id AND b.id::text = split_part(o.name,'/',1)))
  ON CONFLICT DO NOTHING;
  -- Remove contributed images even from copies that reused the URL. Preserve
  -- bibliographic records/other users' reviews, not the departing user's photos.
  UPDATE public.books b SET image_url = NULL, updated_at = now()
  WHERE EXISTS (SELECT 1 FROM public.storage_cleanup_queue q WHERE q.bucket_id = 'book-spines'
    AND (split_part(b.image_url,'?',1) = q.name OR right(split_part(b.image_url,'?',1),length('/book-spines/'||q.name)) = '/book-spines/'||q.name));
  UPDATE public.books b SET cover_image_url = NULL, updated_at = now()
  WHERE EXISTS (SELECT 1 FROM public.storage_cleanup_queue q WHERE q.bucket_id = 'book-covers'
    AND (split_part(b.cover_image_url,'?',1) = q.name OR right(split_part(b.cover_image_url,'?',1),length('/book-covers/'||q.name)) = '/book-covers/'||q.name));
  -- Detach Storage ownership so auth deletion is not blocked by legacy FKs.
  UPDATE storage.objects o SET owner = NULL, owner_id = NULL
  WHERE EXISTS (SELECT 1 FROM public.storage_cleanup_queue q WHERE q.bucket_id = o.bucket_id AND q.name = o.name);
  DELETE FROM public.bookshelves WHERE user_id = p_user_id;
  -- Keep book rows to avoid racing an incoming FK reference and cascading a
  -- different user's item. They may be garbage-collected separately when idle.
  UPDATE public.books SET uploaded_by_user_id = NULL, image_url = NULL,
    is_community = true, updated_at = now() WHERE uploaded_by_user_id = p_user_id;
END $$;
REVOKE ALL ON FUNCTION public.purge_my_library(uuid) FROM PUBLIC, anon, authenticated;

-- Clamp public work, even when called directly rather than through the UI.
CREATE OR REPLACE FUNCTION public.random_public_bookshelves(p_limit integer DEFAULT 6)
RETURNS SETOF public.bookshelves LANGUAGE sql SET search_path = '' AS $$
  SELECT * FROM public.bookshelves WHERE is_public = true ORDER BY random()
  LIMIT LEAST(20, GREATEST(COALESCE(p_limit,6),0));
$$;
REVOKE ALL ON FUNCTION public.random_public_bookshelves(integer), public.reorder_bookshelves(uuid[]),
  public.reorder_bookshelf_items(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.random_public_bookshelves(integer), public.reorder_bookshelves(uuid[]),
  public.reorder_bookshelf_items(uuid,uuid[]) TO authenticated;
CREATE INDEX IF NOT EXISTS idx_books_community_created ON public.books(created_at DESC,id) WHERE is_community;
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users(blocked_id);
NOTIFY pgrst, 'reload schema';
COMMIT;
