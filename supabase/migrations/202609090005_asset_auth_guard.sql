BEGIN;
-- Supabase JWTs remain cryptographically valid until expiry after deletion.
-- Lock/recheck the profile so an in-flight upload cannot outlive its purge.
CREATE FUNCTION public.require_asset_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NEW.bucket_id IN ('book-covers','book-spines','avatars') THEN
    PERFORM 1 FROM public.users WHERE id=auth.uid() FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account no longer exists' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_asset_account BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.require_asset_account();
-- A non-community book placed on an explicitly public shelf must render there.
-- The bookshelf_items SELECT policy already restricts rows to owned/public shelves.
CREATE FUNCTION public.can_read_shelved_book(p_book_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.bookshelf_items i JOIN public.bookshelves s ON s.id=i.shelf_id
    WHERE i.book_id=p_book_id AND (s.is_public OR s.user_id=auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.can_read_shelved_book(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_shelved_book(uuid) TO authenticated;
CREATE POLICY release_read_shelved_books ON public.books FOR SELECT TO authenticated
USING (public.can_read_shelved_book(id));
CREATE POLICY release_asset_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'book-spines' OR (bucket_id='avatars' AND split_part(name,'/',1)=(SELECT auth.uid())::text));
COMMIT;
