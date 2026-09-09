BEGIN;
CREATE FUNCTION public.create_book_on_shelf(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE b public.books; i public.bookshelf_items; shelf uuid := (p_input->>'shelf_id')::uuid;
BEGIN
  -- One shelf lock allocates append positions and makes book+placement atomic.
  PERFORM 1 FROM public.bookshelves WHERE id=shelf AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shelf not found' USING ERRCODE='42501'; END IF;
  IF p_input->>'book_id' IS NOT NULL THEN
    SELECT * INTO b FROM public.books WHERE id=(p_input->>'book_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Book not available' USING ERRCODE='42501'; END IF;
  ELSE
    IF length(trim(p_input->>'title')) NOT BETWEEN 1 AND 1000 OR length(trim(p_input->>'author')) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Title and author are required (maximum 1000 characters)';
    END IF;
    INSERT INTO public.books(title,author,image_url,isbn,uploaded_by_user_id,is_community)
    VALUES (p_input->>'title',p_input->>'author',p_input->>'image_url',p_input->>'isbn',auth.uid(),coalesce((p_input->>'is_community')::boolean,true)) RETURNING * INTO b;
  END IF;
  INSERT INTO public.bookshelf_items(book_id,shelf_id,position,review,rating,is_stacked,stack_id,stack_position)
  VALUES (b.id,shelf,(SELECT coalesce(max(position),-1)+1 FROM public.bookshelf_items WHERE shelf_id=shelf),
    p_input->>'review',(p_input->>'rating')::integer,coalesce((p_input->>'is_stacked')::boolean,false),
    (p_input->>'stack_id')::uuid,coalesce((p_input->>'stack_position')::integer,0)) RETURNING * INTO i;
  RETURN to_jsonb(i) || jsonb_build_object('book',to_jsonb(b));
END $$;
REVOKE ALL ON FUNCTION public.create_book_on_shelf(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_book_on_shelf(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_bookshelf_items(p_shelf_id uuid,p_item_ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.bookshelves WHERE id=p_shelf_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shelf not found' USING ERRCODE='42501'; END IF;
  IF p_item_ids IS NULL OR cardinality(p_item_ids)>10000 OR
    cardinality(p_item_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_item_ids) x(id)) OR
    EXISTS (SELECT 1 FROM unnest(p_item_ids) x(id) WHERE NOT EXISTS (SELECT 1 FROM public.bookshelf_items WHERE id=x.id AND shelf_id=p_shelf_id))
    THEN RAISE EXCEPTION 'Invalid reorder'; END IF;
  UPDATE public.bookshelf_items bi SET position=o.n-1,updated_at=now()
  FROM unnest(p_item_ids) WITH ORDINALITY o(id,n) WHERE bi.id=o.id AND bi.shelf_id=p_shelf_id;
END $$;
-- Per-user shelf creation is also serialized rather than racing max(position).
CREATE FUNCTION public.allocate_shelf_position() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
  NEW.position := (SELECT coalesce(max(position),-1)+1 FROM public.bookshelves WHERE user_id=NEW.user_id);
  RETURN NEW;
END $$;
CREATE TRIGGER allocate_shelf_position BEFORE INSERT ON public.bookshelves FOR EACH ROW EXECUTE FUNCTION public.allocate_shelf_position();
NOTIFY pgrst,'reload schema';
COMMIT;
