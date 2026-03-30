-- Re-create the delete_my_account function and reload the PostgREST schema
-- cache to fix: "could not find the function public.delete_my_account without
-- parameters in the schema cache"

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.books
  WHERE uploaded_by_user_id = current_user_id;

  DELETE FROM public.bookshelves
  WHERE user_id = current_user_id;

  DELETE FROM public.users
  WHERE id = current_user_id;

  DELETE FROM auth.users
  WHERE id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Force PostgREST to reload its schema cache so the function is discoverable
NOTIFY pgrst, 'reload schema';
