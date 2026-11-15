-- AI-generated spines: a curated fallback shown in place of the cloth
-- placeholder when a book has no real spine photo.
--
-- They are kept apart from community spines by construction. A community
-- spine is `books.image_url`; an AI spine never goes there. It lives in its own
-- bucket and table, and reaches a book only through `books.ai_spine_path`,
-- which the database maintains and clients cannot set.
BEGIN;

-- Bucket: world-readable, writable only by the service role / dashboard.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-book-spines','ai-book-spines',true,10485760,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The release guards only name the three user-upload buckets, so any older
-- permissive policy in a live project could still reach a new bucket.
CREATE POLICY ai_spine_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id IS DISTINCT FROM 'ai-book-spines');
CREATE POLICY ai_spine_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
USING (bucket_id IS DISTINCT FROM 'ai-book-spines') WITH CHECK (bucket_id IS DISTINCT FROM 'ai-book-spines');
CREATE POLICY ai_spine_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
USING (bucket_id IS DISTINCT FROM 'ai-book-spines');

-- Same normalisation as the client's bookDedupeKey (services/isbndb.ts).
CREATE FUNCTION public.book_match_key(p_title text, p_author text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_catalog.lower(pg_catalog.btrim(coalesce(p_title,''), E' \t\n\r')) || '|'
      || pg_catalog.lower(pg_catalog.btrim(coalesce(p_author,''), E' \t\n\r'))
$$;

-- One AI spine per title/author. `isbn` is an optional extra matcher for books
-- whose stored title differs from the one the spine was generated for.
CREATE TABLE public.ai_book_spines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text NOT NULL,
  isbn text,
  storage_path text NOT NULL UNIQUE,
  match_key text GENERATED ALWAYS AS (public.book_match_key(title, author)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_book_spines_match_key_unique UNIQUE (match_key)
);
CREATE INDEX idx_ai_book_spines_isbn ON public.ai_book_spines(isbn) WHERE isbn IS NOT NULL;
ALTER TABLE public.ai_book_spines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_book_spines FROM anon, authenticated;
GRANT ALL ON public.ai_book_spines TO service_role;

ALTER TABLE public.books ADD COLUMN ai_spine_path text;
CREATE INDEX idx_books_match_key ON public.books (public.book_match_key(title, author));

-- An ISBN match wins over a title/author match.
CREATE FUNCTION public.find_ai_spine_path(p_title text, p_author text, p_isbn text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.storage_path FROM public.ai_book_spines s
  WHERE s.match_key = public.book_match_key(p_title, p_author)
     OR (nullif(btrim(p_isbn),'') IS NOT NULL AND s.isbn = btrim(p_isbn))
  ORDER BY coalesce(s.isbn = btrim(p_isbn), false) DESC, s.created_at DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_ai_spine_path(text,text,text) FROM PUBLIC, anon, authenticated;

-- Always derived, never accepted from the caller: naming ai_spine_path in an
-- UPDATE fires this too, so a client cannot point a book at an arbitrary file.
CREATE FUNCTION public.set_book_ai_spine_path() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.ai_spine_path := public.find_ai_spine_path(NEW.title, NEW.author, NEW.isbn);
  RETURN NEW;
END $$;
CREATE TRIGGER set_book_ai_spine_path BEFORE INSERT OR UPDATE OF title, author, isbn, ai_spine_path
ON public.books FOR EACH ROW EXECUTE FUNCTION public.set_book_ai_spine_path();

-- Adding, changing or removing an AI spine re-resolves the books it matched
-- before and after, so shelves that already hold the book pick it up.
CREATE FUNCTION public.sync_ai_spine_to_books() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE keys text[] := '{}'; isbns text[] := '{}';
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    keys := keys || OLD.match_key;
    IF OLD.isbn IS NOT NULL THEN isbns := isbns || OLD.isbn; END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    keys := keys || NEW.match_key;
    IF NEW.isbn IS NOT NULL THEN isbns := isbns || NEW.isbn; END IF;
  END IF;
  UPDATE public.books b SET ai_spine_path = public.find_ai_spine_path(b.title, b.author, b.isbn)
  WHERE (public.book_match_key(b.title, b.author) = ANY(keys) OR b.isbn = ANY(isbns))
    AND b.ai_spine_path IS DISTINCT FROM public.find_ai_spine_path(b.title, b.author, b.isbn);
  RETURN NULL;
END $$;
CREATE TRIGGER sync_ai_spine_to_books AFTER INSERT OR UPDATE OR DELETE ON public.ai_book_spines
FOR EACH ROW EXECUTE FUNCTION public.sync_ai_spine_to_books();

NOTIFY pgrst, 'reload schema';
COMMIT;
