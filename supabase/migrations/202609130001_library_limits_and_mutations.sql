BEGIN;
-- Serialize authenticated library writes before acquiring shelf/item row locks.
-- This also protects quota checks on direct PostgREST writes, not only RPCs.
CREATE FUNCTION public.lock_my_library() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Library writes require read committed isolation';
  END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.users WHERE id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.lock_my_library() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lock_my_library() TO authenticated;
CREATE FUNCTION public.lock_library_statement() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Cascading account deletion can run after its profile has been removed.
  IF auth.role()='authenticated' AND EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid()) THEN
    PERFORM public.lock_my_library();
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER lock_library_statement BEFORE INSERT OR UPDATE OR DELETE ON public.bookshelves
FOR EACH STATEMENT EXECUTE FUNCTION public.lock_library_statement();
CREATE TRIGGER lock_library_statement BEFORE INSERT OR UPDATE OR DELETE ON public.bookshelf_items
FOR EACH STATEMENT EXECUTE FUNCTION public.lock_library_statement();

CREATE FUNCTION public.enforce_library_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE paid boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
  SELECT is_premium AND premium_checked_at IS NOT NULL AND premium_checked_at<=now()
    AND (premium_expires_at IS NULL OR premium_expires_at>now()) INTO paid
    FROM public.users WHERE id=auth.uid();
  IF coalesce(paid,false) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='bookshelves' THEN
    IF TG_OP='UPDATE' THEN
      IF NEW.user_id=OLD.user_id THEN RETURN NEW; END IF;
    END IF;
    IF (SELECT count(*) FROM public.bookshelves WHERE user_id=NEW.user_id)>=3 THEN
      RAISE EXCEPTION 'Free accounts can have up to 3 bookshelves' USING ERRCODE='23514';
    END IF;
  ELSE
    IF TG_OP='UPDATE' THEN
      IF NEW.shelf_id=OLD.shelf_id THEN RETURN NEW; END IF;
    END IF;
    IF (SELECT count(*) FROM public.bookshelf_items WHERE shelf_id=NEW.shelf_id)>=50 THEN
      RAISE EXCEPTION 'Free accounts can have up to 50 books per shelf' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_library_limit BEFORE INSERT OR UPDATE ON public.bookshelves
FOR EACH ROW EXECUTE FUNCTION public.enforce_library_limit();
CREATE TRIGGER enforce_library_limit BEFORE INSERT OR UPDATE ON public.bookshelf_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_library_limit();

-- Transactional move/stack/unstack: errors roll back every affected placement.
CREATE FUNCTION public.mutate_bookshelf_item(p_item_id uuid,p_action text,p_target_id uuid DEFAULT NULL,p_position integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item public.bookshelf_items; target public.bookshelf_items; old_stack uuid; old_shelf uuid; new_stack uuid; result jsonb;
BEGIN
  PERFORM public.lock_my_library();
  SELECT i.* INTO item FROM public.bookshelf_items i JOIN public.bookshelves s ON s.id=i.shelf_id
    WHERE i.id=p_item_id AND s.user_id=auth.uid() FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book not found' USING ERRCODE='42501'; END IF;
  old_stack:=item.stack_id; old_shelf:=item.shelf_id;
  IF p_action='move' THEN
    PERFORM 1 FROM public.bookshelves WHERE id=p_target_id AND user_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Shelf not found' USING ERRCODE='42501'; END IF;
    IF p_position IS NOT NULL AND p_position<0 THEN RAISE EXCEPTION 'Invalid position'; END IF;
    UPDATE public.bookshelf_items SET shelf_id=p_target_id,stack_id=NULL,is_stacked=false,stack_position=0,
      position=coalesce(p_position,(SELECT coalesce(max(position),-1)+1 FROM public.bookshelf_items WHERE shelf_id=p_target_id)),updated_at=now()
      WHERE id=p_item_id;
  ELSIF p_action='stack' THEN
    SELECT * INTO target FROM public.bookshelf_items WHERE id=p_target_id AND shelf_id=item.shelf_id;
    IF NOT FOUND OR p_target_id=p_item_id THEN RAISE EXCEPTION 'Stack target must be another book on the same shelf'; END IF;
    new_stack:=coalesce(target.stack_id,target.id);
    IF item.stack_id IS DISTINCT FROM new_stack THEN
      UPDATE public.bookshelf_items SET stack_id=new_stack,is_stacked=true,stack_position=0,updated_at=now()
        WHERE id=target.id AND stack_id IS NULL;
      UPDATE public.bookshelf_items SET stack_id=new_stack,is_stacked=true,
        stack_position=(SELECT coalesce(max(stack_position),0)+1 FROM public.bookshelf_items WHERE shelf_id=item.shelf_id AND stack_id=new_stack),
        position=target.position,updated_at=now() WHERE id=p_item_id;
    END IF;
  ELSIF p_action='unstack' THEN
    UPDATE public.bookshelf_items SET stack_id=NULL,is_stacked=false,stack_position=0,
      position=CASE WHEN stack_id IS NULL THEN position ELSE
        (SELECT coalesce(max(position),-1)+1 FROM public.bookshelf_items WHERE shelf_id=item.shelf_id) END,updated_at=now()
      WHERE id=p_item_id;
  ELSIF p_action='delete' THEN
    DELETE FROM public.bookshelf_items WHERE id=p_item_id;
  ELSE RAISE EXCEPTION 'Invalid library action'; END IF;
  IF old_stack IS NOT NULL AND old_stack IS DISTINCT FROM new_stack THEN
    IF (SELECT count(*) FROM public.bookshelf_items WHERE shelf_id=old_shelf AND stack_id=old_stack)=1 THEN
      UPDATE public.bookshelf_items SET stack_id=NULL,is_stacked=false,stack_position=0,updated_at=now()
        WHERE shelf_id=old_shelf AND stack_id=old_stack;
    ELSE
      WITH ordered AS (SELECT id,row_number() OVER (ORDER BY stack_position,id)-1 AS n
        FROM public.bookshelf_items WHERE shelf_id=old_shelf AND stack_id=old_stack)
      UPDATE public.bookshelf_items i SET stack_position=o.n,updated_at=now() FROM ordered o WHERE i.id=o.id;
    END IF;
  END IF;
  SELECT to_jsonb(i)||jsonb_build_object('book',to_jsonb(b)) INTO result
    FROM public.bookshelf_items i JOIN public.books b ON b.id=i.book_id WHERE i.id=p_item_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mutate_bookshelf_item(uuid,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_bookshelf_item(uuid,text,uuid,integer) TO authenticated;

-- Keep a consistent user-before-shelf lock order in existing RPCs.
CREATE OR REPLACE FUNCTION public.create_book_on_shelf(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE b public.books; i public.bookshelf_items; shelf uuid := (p_input->>'shelf_id')::uuid;
BEGIN
  PERFORM public.lock_my_library();
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
  PERFORM public.lock_my_library();
  PERFORM 1 FROM public.bookshelves WHERE id=p_shelf_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shelf not found' USING ERRCODE='42501'; END IF;
  IF p_item_ids IS NULL OR cardinality(p_item_ids)>10000 OR
    cardinality(p_item_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_item_ids) x(id)) OR
    EXISTS (SELECT 1 FROM unnest(p_item_ids) x(id) WHERE NOT EXISTS (SELECT 1 FROM public.bookshelf_items WHERE id=x.id AND shelf_id=p_shelf_id))
    THEN RAISE EXCEPTION 'Invalid reorder'; END IF;
  UPDATE public.bookshelf_items bi SET position=o.n-1,updated_at=now()
  FROM unnest(p_item_ids) WITH ORDINALITY o(id,n) WHERE bi.id=o.id AND bi.shelf_id=p_shelf_id;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
